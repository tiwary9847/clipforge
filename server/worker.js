// ClipForge payment + AI server (Cloudflare Worker, free plan).
//   POST /order    {plan, email}                          → Razorpay order
//   POST /verify   {plan, email, razorpay_*}              → checks the payment, returns a signed Pro licence
//   POST /restore  {email, payment_id}                    → the licence again (new phone)
//   POST /webhook  Razorpay "payment.captured"            → records payments even if the buyer closed the tab
//   POST /play     {sku, purchaseToken}                   → checks a Google Play purchase, returns a licence
//   POST /ai       {prompt, json}  + Bearer <licence>     → built-in AI for Pro (monthly limit)
// Secrets (wrangler secret put …): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
//   LICENCE_PRIVATE_JWK, GEMINI_KEY, PLAY_SERVICE_ACCOUNT (JSON, optional), PLAY_PACKAGE (optional)
// KV namespace binding: DB.   Vars: ALLOWED_ORIGINS (comma list), AI_MONTHLY (default 300)

export const PLANS = {
  month: { price: 99, days: 30 },
  year: { price: 699, days: 366 },
  life: { price: 1999, days: 0 },
}
const SKU_PLAN = { pro_month: 'month', pro_year: 'year', pro_life: 'life' }
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']

const enc = new TextEncoder()
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
}
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/* ---- licences ---- */
let signKey, verifyKey
async function keys(env) {
  if (!signKey) {
    const jwk = JSON.parse(env.LICENCE_PRIVATE_JWK)
    signKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    const { d, ...pub } = jwk
    verifyKey = await crypto.subtle.importKey('jwk', { ...pub, key_ops: ['verify'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  }
  return { signKey, verifyKey }
}
export async function makeLicence(env, sub, src, plan, from = Date.now()) {
  const days = PLANS[plan].days
  const iat = Math.floor(from / 1000)
  const body = { v: 1, sub, plan: 'pro', src, iat, exp: days ? iat + days * 86400 : 0 }
  const p = b64u(enc.encode(JSON.stringify(body)))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, (await keys(env)).signKey, enc.encode(p))
  return `${p}.${b64u(sig)}`
}
export async function readLicence(env, token) {
  try {
    const [p, s] = String(token).split('.')
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, (await keys(env)).verifyKey, unb64u(s), enc.encode(p)))) return null
    const lic = JSON.parse(new TextDecoder().decode(unb64u(p)))
    if (lic.plan !== 'pro' || (lic.exp && lic.exp * 1000 < Date.now())) return null
    return lic
  } catch {
    return null
  }
}

/* ---- Razorpay ---- */
const rzAuth = (env) => 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)
async function rz(env, path, body) {
  const r = await fetch('https://api.razorpay.com/v1' + path, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: rzAuth(env), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error?.description || `Razorpay ${r.status}`)
  return j
}
async function savePayment(env, payment_id, rec) {
  await env.DB.put('pay:' + payment_id, JSON.stringify(rec))
}

/* ---- Google Play ---- */
async function googleToken(env) {
  const sa = JSON.parse(env.PLAY_SERVICE_ACCOUNT)
  const now = Math.floor(Date.now() / 1000)
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claim = b64u(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })))
  const pem = sa.private_key.replace(/-----[^-]+-----|\s/g, '')
  const k = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', k, enc.encode(`${head}.${claim}`)))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${claim}.${sig}` })
  const j = await r.json()
  if (!j.access_token) throw new Error('Google sign-in for Play failed')
  return j.access_token
}

/* ---- AI ---- */
async function gemini(env, prompt, json) {
  const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), temperature: 0.9 } })
  let r
  for (const m of GEMINI_MODELS) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    if (r.status !== 404) break
  }
  if (!r.ok) throw new Error(`AI service ${r.status}`)
  const j = await r.json()
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
}

/* ---- HTTP ---- */
function cors(env, req) {
  const origin = req.headers.get('origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const ok = !allowed.length || allowed.includes(origin) || origin === 'null'
  return { 'access-control-allow-origin': ok ? origin || '*' : allowed[0], 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' }
}
const reply = (h, status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'content-type': 'application/json' } })
const validEmail = (e) => typeof e === 'string' && /^\S+@\S+\.\S+$/.test(e) && e.length < 200

export default {
  async fetch(req, env) {
    const h = cors(env, req)
    if (req.method === 'OPTIONS') return new Response(null, { headers: h })
    if (req.method !== 'POST') return reply(h, 405, { error: 'POST only' })
    const path = new URL(req.url).pathname
    try {
      if (path === '/webhook') {
        const raw = await req.text()
        if (!safeEq(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), req.headers.get('x-razorpay-signature') || '')) return reply(h, 401, { error: 'bad signature' })
        const ev = JSON.parse(raw)
        const p = ev?.payload?.payment?.entity
        if (ev.event === 'payment.captured' && p?.notes?.plan && PLANS[p.notes.plan] && p.amount === PLANS[p.notes.plan].price * 100) {
          if (!(await env.DB.get('pay:' + p.id))) await savePayment(env, p.id, { email: (p.notes.email || p.email || '').toLowerCase(), plan: p.notes.plan, at: p.created_at * 1000 })
        }
        return reply(h, 200, { ok: true })
      }
      const body = await req.json().catch(() => ({}))

      if (path === '/order') {
        const plan = PLANS[body.plan]
        if (!plan) return reply(h, 400, { error: 'Unknown plan' })
        if (!validEmail(body.email)) return reply(h, 400, { error: 'Type a valid email' })
        const o = await rz(env, '/orders', { amount: plan.price * 100, currency: 'INR', receipt: `cf_${Date.now()}`, notes: { plan: body.plan, email: body.email.toLowerCase() } })
        return reply(h, 200, { order_id: o.id, amount: o.amount })
      }

      if (path === '/verify') {
        const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = body
        if (!oid || !pid || !sig) return reply(h, 400, { error: 'Missing payment details' })
        if (!safeEq(await hmacHex(env.RAZORPAY_KEY_SECRET, `${oid}|${pid}`), sig)) return reply(h, 401, { error: 'Payment could not be verified' })
        // trust the order on Razorpay's side, not the plan the browser sends
        const order = await rz(env, '/orders/' + oid)
        const plan = order.notes?.plan
        if (!PLANS[plan] || order.amount !== PLANS[plan].price * 100) return reply(h, 400, { error: 'Order does not match a plan' })
        const email = String(order.notes?.email || body.email || '').toLowerCase()
        const prev = JSON.parse((await env.DB.get('pay:' + pid)) || 'null')
        const at = prev?.at ?? Date.now()
        await savePayment(env, pid, { email, plan, at })
        return reply(h, 200, { licence: await makeLicence(env, email, 'razorpay', plan, at) })
      }

      if (path === '/restore') {
        const rec = JSON.parse((await env.DB.get('pay:' + String(body.payment_id || '').trim())) || 'null')
        if (!rec || rec.email !== String(body.email || '').toLowerCase().trim()) return reply(h, 404, { error: 'No purchase found for that email and payment ID.' })
        const lic = await makeLicence(env, rec.email, 'razorpay', rec.plan, rec.at)
        if (!(await readLicence(env, lic))) return reply(h, 410, { error: 'That Pro pass has ended.' })
        return reply(h, 200, { licence: lic })
      }

      if (path === '/play') {
        const plan = SKU_PLAN[body.sku]
        if (!plan || !body.purchaseToken) return reply(h, 400, { error: 'Unknown purchase' })
        const tok = await googleToken(env)
        const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${env.PLAY_PACKAGE}/purchases/products/${body.sku}/tokens/${encodeURIComponent(body.purchaseToken)}`
        const r = await fetch(base, { headers: { authorization: 'Bearer ' + tok } })
        const p = await r.json()
        if (!r.ok || p.purchaseState !== 0) return reply(h, 402, { error: 'This purchase is not completed.' })
        const at = Number(p.purchaseTimeMillis) || Date.now()
        // passes are consumed so they can be bought again; lifetime is acknowledged and kept
        if (plan === 'life' && p.acknowledgementState === 0) await fetch(base + ':acknowledge', { method: 'POST', headers: { authorization: 'Bearer ' + tok } })
        if (plan !== 'life' && p.consumptionState === 0) await fetch(base + ':consume', { method: 'POST', headers: { authorization: 'Bearer ' + tok } })
        const lic = await makeLicence(env, 'play:' + (p.orderId || body.purchaseToken.slice(0, 16)), 'play', plan, at)
        if (!(await readLicence(env, lic))) return reply(h, 410, { error: 'That Pro pass has ended.' })
        return reply(h, 200, { licence: lic })
      }

      if (path === '/ai') {
        const lic = await readLicence(env, (req.headers.get('authorization') || '').replace(/^Bearer /, ''))
        if (!lic) return reply(h, 401, { error: 'Built-in AI is part of ClipForge Pro.' })
        const prompt = String(body.prompt || '')
        if (!prompt || prompt.length > 20000) return reply(h, 400, { error: 'Request too long' })
        const limit = Number(env.AI_MONTHLY || 300)
        const k = `ai:${lic.sub}:${new Date().toISOString().slice(0, 7)}`
        const used = Number((await env.DB.get(k)) || 0)
        if (used >= limit) return reply(h, 429, { error: `You’ve used this month’s ${limit} AI requests. They reset on the 1st.` })
        const text = await gemini(env, prompt, !!body.json)
        await env.DB.put(k, String(used + 1), { expirationTtl: 60 * 60 * 24 * 40 })
        return reply(h, 200, { text, left: limit - used - 1 })
      }
      return reply(h, 404, { error: 'Not found' })
    } catch (e) {
      return reply(h, 500, { error: String(e?.message || e) })
    }
  },
}

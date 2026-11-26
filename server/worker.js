// ViralKaro payment + AI server (Cloudflare Worker, free plan).
//   POST /order    {plan, email}                          → Razorpay order
//   POST /verify   {plan, email, razorpay_*}              → checks the payment, returns a signed Pro licence
//   POST /restore  {email, payment_id}                    → the licence again (new phone)
//   POST /webhook  Razorpay "payment.captured"            → records payments even if the buyer closed the tab
//   POST /play     {sku, purchaseToken}                   → checks a Google Play purchase, returns a licence
//   POST /ai       {prompt, json, images?} + Bearer       → built-in AI for Pro (monthly limit); with frames = 2 requests
//   POST /tts      {text, voice}   + Bearer <licence>     → Hindi/English AI voice (Gemini TTS), counts as 5 AI requests
//   POST /usage    + Bearer <licence>                     → AI used / left this month
//   POST /price    {plan, coupon, current}                → price after coupon, renewal start
//   POST /check    {licence}                              → still valid? (refunds switch Pro off)
//   POST /admin/…  header x-admin-token                   → seller dashboard (stats, payments, gift, revoke, coupons)
//   GET  /media?u=<url>                                   → relays a free-library audio file (Freesound previews,
//                                                            Jamendo, Wikimedia) or a GIF (KLIPY, GIPHY) whose host blocks browser downloads
//   GET  /gifs?type=gifs|stickers&q=&page=&cid=           → GIF / sticker search for the GIFs tab (KLIPY, else GIPHY);
//                                                            the API key stays on the server, results cached 10 min
// Secrets (wrangler secret put …): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
//   LICENCE_PRIVATE_JWK, GEMINI_KEY, ADMIN_TOKEN, PLAY_SERVICE_ACCOUNT (JSON, optional), PLAY_PACKAGE (optional),
//   KLIPY_KEY (free, klipy.com/developers – turns on the GIFs tab), GIPHY_KEY (optional fallback)
// KV namespace binding: DB.   Vars: ALLOWED_ORIGINS (comma list), AI_MONTHLY (default 300)

export const PLANS = {
  month: { price: 99, days: 30 },
  year: { price: 699, days: 366 },
  life: { price: 1999, days: 0 },
  ai100: { price: 49, days: 0, topup: 100 }, // +100 AI requests this month (needs Pro)
}
const PASS = (p) => p === 'month' || p === 'year' || p === 'life'
const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview']
const month = () => new Date().toISOString().slice(0, 7)
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
export async function makeLicence(env, sub, src, plan, from = Date.now(), pid = '') {
  const days = PLANS[plan].days
  const iat = Math.floor(from / 1000)
  const body = { v: 1, sub, plan: 'pro', src, iat, exp: days ? iat + days * 86400 : 0, term: plan, ...(pid ? { pid } : {}) }
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

/* ---- prices, coupons, renewals ---- */
async function getCoupon(env, code) {
  if (!code) return null
  const c = JSON.parse((await env.DB.get('coupon:' + String(code).toUpperCase().trim())) || 'null')
  if (!c || c.off <= 0) return null
  if (c.until && c.until < Date.now()) return null
  if (c.max && (c.used || 0) >= c.max) return null
  return c
}
/** What this buyer pays and, for a renewal, when the new pass starts. */
async function quote(env, plan, couponCode, currentToken) {
  const P = PLANS[plan]
  if (!P) throw Object.assign(new Error('Unknown plan'), { status: 400 })
  const cur = currentToken ? await readLicence(env, currentToken) : null
  if (plan === 'ai100' && !cur) throw Object.assign(new Error('AI top-ups are for Pro – get Pro first.'), { status: 400 })
  if ((plan === 'month' || plan === 'year') && cur && !cur.exp) throw Object.assign(new Error('You already have lifetime Pro.'), { status: 400 })
  if (plan === 'life' && cur && !cur.exp) throw Object.assign(new Error('You already have lifetime Pro.'), { status: 400 })
  // renewing early adds the new pass after the current one, so no days are lost
  const from = (plan === 'month' || plan === 'year') && cur?.exp ? Math.max(Date.now(), cur.exp * 1000) : Date.now()
  const c = plan === 'ai100' ? null : await getCoupon(env, couponCode)
  const okPlan = c && (!c.plans || !c.plans.length || c.plans.includes(plan))
  const amount = okPlan ? Math.max(1, Math.round((P.price * (100 - Math.min(90, c.off))) / 100)) : P.price
  return { amount, original: P.price, off: okPlan ? Math.min(90, c.off) : 0, coupon: okPlan ? String(couponCode).toUpperCase().trim() : '', from, cur }
}
async function aiLeft(env, sub) {
  const limit = Number(env.AI_MONTHLY || 300)
  const used = Number((await env.DB.get(`ai:${sub}:${month()}`)) || 0)
  const bonus = Number((await env.DB.get(`bonus:${sub}:${month()}`)) || 0)
  return { used, limit: limit + bonus, bonus, left: Math.max(0, limit + bonus - used) }
}
async function spendAI(env, sub, n) {
  const k = `ai:${sub}:${month()}`
  const used = Number((await env.DB.get(k)) || 0)
  await env.DB.put(k, String(used + n), { expirationTtl: 60 * 60 * 24 * 40 })
}
async function listAll(env, prefix, cap = 5000) {
  const out = []
  let cursor
  do {
    const r = await env.DB.list({ prefix, cursor })
    out.push(...r.keys.map((k) => k.name))
    cursor = r.list_complete ? undefined : r.cursor
  } while (cursor && out.length < cap)
  return out
}
/** Gives a paid order its result: a Pro licence, or extra AI requests. Runs once per payment. */
async function fulfil(env, pid, order) {
  const n = order.notes || {}
  const plan = n.plan
  const prev = JSON.parse((await env.DB.get('pay:' + pid)) || 'null')
  const rec = prev ?? { email: String(n.email || '').toLowerCase(), plan, at: Date.now(), from: Number(n.from) || Date.now(), amt: order.amount / 100, coupon: n.coupon || '', sub: n.sub || '' }
  if (!prev) {
    await env.DB.put('pay:' + pid, JSON.stringify(rec))
    if (rec.coupon) {
      const c = JSON.parse((await env.DB.get('coupon:' + rec.coupon)) || 'null')
      if (c) await env.DB.put('coupon:' + rec.coupon, JSON.stringify({ ...c, used: (c.used || 0) + 1 }))
    }
    if (plan === 'ai100' && rec.sub) {
      const k = `bonus:${rec.sub}:${month()}`
      await env.DB.put(k, String(Number((await env.DB.get(k)) || 0) + PLANS.ai100.topup), { expirationTtl: 60 * 60 * 24 * 40 })
    }
  }
  if (rec.refunded) throw Object.assign(new Error('This payment was refunded.'), { status: 410 })
  const receipt = { payment_id: pid, plan, amount: rec.amt, date: rec.at, email: rec.email, coupon: rec.coupon || undefined }
  if (plan === 'ai100') return { topup: PLANS.ai100.topup, receipt }
  return { licence: await makeLicence(env, rec.email, 'razorpay', plan, rec.from, pid), receipt }
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
async function gemini(env, prompt, json, images = []) {
  const parts = [...images.map((d) => ({ inlineData: { mimeType: 'image/jpeg', data: d } })), { text: prompt }]
  const body = JSON.stringify({ contents: [{ parts }], generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), temperature: 0.9 } })
  let r
  for (const m of GEMINI_MODELS) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    if (r.status !== 404) break
  }
  if (!r.ok) throw new Error(`AI service ${r.status}`)
  const j = await r.json()
  return j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
}

async function speech(env, text, voice) {
  const tries = [
    // newest models: transcript in parts, voice in voiceConfig.voice
    (m) => ({ m, body: { contents: [{ role: 'user', parts: [{ text, speech_metadata: { style: 'natural, warm, clear' } }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { voice } } } } }),
    // older preview models: prebuiltVoiceConfig
    (m) => ({ m, body: { contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } } }),
  ]
  let last = ''
  for (let i = 0; i < TTS_MODELS.length; i++) {
    const { m, body } = tries[i](TTS_MODELS[i])
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${env.GEMINI_KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) {
      last = `voice service ${r.status}`
      continue
    }
    const j = await r.json()
    const part = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data)
    const d = part?.inlineData ?? part?.inline_data
    if (!d?.data) {
      last = 'no audio returned'
      continue
    }
    const rate = Number(/rate=(\d+)/.exec(d.mimeType || d.mime_type || '')?.[1]) || 24000
    return { audio: d.data, sr: rate, format: 'pcm16' }
  }
  throw new Error(last || 'voice service unavailable')
}

/* ---- HTTP ---- */
function cors(env, req) {
  const origin = req.headers.get('origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const ok = !allowed.length || allowed.includes(origin) || origin === 'null'
  return { 'access-control-allow-origin': ok ? origin || '*' : allowed[0], 'access-control-allow-headers': 'content-type, authorization, x-admin-token', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' }
}
/* ---- audio relay: only open audio from the free libraries the app searches ---- */
const MEDIA_HOSTS = [/^cdn\.freesound\.org$/, /^(www\.)?freesound\.org$/, /(^|\.)jamendo\.com$/, /^upload\.wikimedia\.org$/, /^static\.klipy\.com$/, /^(media\d?|i)\.giphy\.com$/]
const GIF_HOST = /^(static\.klipy\.com|(media\d?|i)\.giphy\.com)$/
const MEDIA_MAX = 25 * 1024 * 1024
export function mediaAllowed(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false
  if (!MEDIA_HOSTS.some((r) => r.test(u.hostname))) return false
  // Freesound: previews only (the full download needs the uploader's licence terms and a login)
  if (/freesound\.org$/.test(u.hostname) && !/\/(data\/)?previews\//.test(u.pathname)) return false
  return true
}
async function relayMedia(req, h) {
  const raw = new URL(req.url).searchParams.get('u') || ''
  if (!mediaAllowed(raw)) return reply(h, 400, { error: 'Only audio from the free libraries or GIFs from the GIF search can be added this way.' })
  const r = await fetch(raw, { redirect: 'follow', cf: { cacheTtl: 86400, cacheEverything: true } })
  if (!r.ok) return reply(h, 502, { error: `The sound's site answered ${r.status}.` })
  const type = r.headers.get('content-type') || ''
  const gif = GIF_HOST.test(new URL(raw).hostname)
  if (gif ? !/^(image\/(gif|webp|png|jpeg)|video\/(mp4|webm))/.test(type) : !/^(audio\/|application\/ogg|video\/ogg)/.test(type))
    return reply(h, 415, { error: gif ? 'That link is not a GIF.' : 'That link is not an audio file.' })
  const len = Number(r.headers.get('content-length') || 0)
  if (len > MEDIA_MAX) return reply(h, 413, { error: 'That sound is too big (over 25 MB).' })
  return new Response(r.body, { status: 200, headers: { ...h, 'content-type': type, 'cache-control': 'public, max-age=86400', ...(len ? { 'content-length': String(len) } : {}) } })
}

/* ---------- GIF search (GIFs tab) ---------- */
const pick = (f, sizes, fmts) => {
  for (const z of sizes) for (const k of fmts) if (f?.[z]?.[k]?.url) return { url: f[z][k].url, w: f[z][k].width || 0, h: f[z][k].height || 0, fmt: k }
  return null
}
export async function gifSearch(env, sp) {
  const type = sp.get('type') === 'stickers' ? 'stickers' : 'gifs'
  const q = (sp.get('q') || '').trim().slice(0, 80)
  const page = Math.max(1, Math.min(20, Number(sp.get('page')) || 1))
  const cid = (sp.get('cid') || 'web').replace(/[^\w-]/g, '').slice(0, 40) || 'web'
  if (env.KLIPY_KEY) {
    const u = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(env.KLIPY_KEY)}/${type}/${q ? 'search' : 'trending'}`)
    if (q) u.searchParams.set('q', q)
    u.searchParams.set('page', String(page))
    u.searchParams.set('per_page', '24')
    u.searchParams.set('customer_id', cid)
    u.searchParams.set('locale', 'in')
    u.searchParams.set('content_filter', 'medium')
    const r = await fetch(u)
    if (!r.ok) throw new Error(`GIF search failed (${r.status})`)
    const j = await r.json()
    const items = (j?.data?.data ?? [])
      .filter((x) => x && x.file && (x.type === 'gif' || x.type === 'sticker' || !x.type))
      .map((x) => {
        const thumb = pick(x.file, ['sm', 'xs', 'md'], ['webp', 'gif', 'jpg'])
        const full = pick(x.file, ['hd', 'md'], ['webp', 'gif'])
        const mp4 = pick(x.file, ['hd', 'md'], ['mp4'])
        return thumb && full ? { id: 'k' + x.id, title: x.title || x.slug || 'GIF', thumb: thumb.url, w: full.w || thumb.w, h: full.h || thumb.h, url: full.url, mp4: mp4?.url } : null
      })
      .filter(Boolean)
    return { items, next: !!j?.data?.has_next, by: 'KLIPY' }
  }
  if (env.GIPHY_KEY) {
    const u = new URL(`https://api.giphy.com/v1/${type}/${q ? 'search' : 'trending'}`)
    u.searchParams.set('api_key', env.GIPHY_KEY)
    if (q) u.searchParams.set('q', q)
    u.searchParams.set('limit', '24')
    u.searchParams.set('offset', String((page - 1) * 24))
    u.searchParams.set('rating', 'pg-13')
    const r = await fetch(u)
    if (!r.ok) throw new Error(`GIF search failed (${r.status})`)
    const j = await r.json()
    const items = (j.data ?? []).map((g) => {
      const im = g.images || {}
      const full = im.original?.webp ? { url: im.original.webp } : im.original?.url ? { url: im.original.url } : null
      const thumb = im.fixed_width_small?.webp || im.fixed_width_small?.url || im.fixed_width?.url
      return full && thumb ? { id: 'g' + g.id, title: g.title || 'GIF', thumb, w: Number(im.original?.width) || 0, h: Number(im.original?.height) || 0, url: full.url, mp4: im.original?.mp4 } : null
    }).filter(Boolean)
    const pg = j.pagination || {}
    return { items, next: (pg.offset || 0) + (pg.count || 0) < Math.min(pg.total_count || 0, 499), by: 'GIPHY' }
  }
  return null
}
async function gifRoute(req, env, h) {
  if (!env.KLIPY_KEY && !env.GIPHY_KEY) return reply(h, 503, { error: 'GIF search is not switched on yet (the app owner needs to add a free KLIPY key).', code: 'nogif' })
  const url = new URL(req.url)
  const cache = globalThis.caches?.default
  const key = new Request(`https://gifs.cache/${url.searchParams.get('type')}/${url.searchParams.get('page')}/${encodeURIComponent((url.searchParams.get('q') || '').toLowerCase().trim())}`)
  const hit = cache && (await cache.match(key))
  if (hit) return new Response(hit.body, { status: 200, headers: { ...h, 'content-type': 'application/json', 'x-cache': 'hit' } })
  const out = await gifSearch(env, url.searchParams)
  const body = JSON.stringify(out)
  if (cache) await cache.put(key, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600' } }))
  return new Response(body, { status: 200, headers: { ...h, 'content-type': 'application/json' } })
}

const reply = (h, status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...h, 'content-type': 'application/json' } })
const validEmail = (e) => typeof e === 'string' && /^\S+@\S+\.\S+$/.test(e) && e.length < 200

export default {
  async fetch(req, env) {
    const h = cors(env, req)
    if (req.method === 'OPTIONS') return new Response(null, { headers: h })
    const path = new URL(req.url).pathname
    if (req.method === 'GET' && path === '/gifs') {
      try {
        return await gifRoute(req, env, { ...h, 'access-control-allow-methods': 'GET, POST, OPTIONS' })
      } catch (e) {
        return reply(h, 502, { error: String(e?.message || e) })
      }
    }
    if (req.method === 'GET' && path === '/media') {
      try {
        return await relayMedia(req, { ...h, 'access-control-allow-methods': 'GET, POST, OPTIONS' })
      } catch (e) {
        return reply(h, 502, { error: String(e?.message || e) })
      }
    }
    if (req.method !== 'POST') return reply(h, 405, { error: 'POST only' })
    try {
      if (path === '/webhook') {
        const raw = await req.text()
        if (!safeEq(await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw), req.headers.get('x-razorpay-signature') || '')) return reply(h, 401, { error: 'bad signature' })
        const ev = JSON.parse(raw)
        if (ev.event === 'payment.captured') {
          const p = ev?.payload?.payment?.entity
          if (p?.order_id) {
            const order = await rz(env, '/orders/' + p.order_id)
            const plan = order.notes?.plan
            if (PLANS[plan] && order.amount === Number(order.notes?.amt) * 100 && p.amount === order.amount) await fulfil(env, p.id, order).catch(() => {})
          }
        }
        if (ev.event === 'refund.processed' || ev.event === 'refund.created') {
          const pid = ev?.payload?.refund?.entity?.payment_id
          if (pid) {
            const rec = JSON.parse((await env.DB.get('pay:' + pid)) || 'null')
            if (rec) await env.DB.put('pay:' + pid, JSON.stringify({ ...rec, refunded: true }))
            await env.DB.put('rev:' + pid, '1')
          }
        }
        return reply(h, 200, { ok: true })
      }

      if (path.startsWith('/admin/')) {
        if (!env.ADMIN_TOKEN || !safeEq(req.headers.get('x-admin-token') || '', env.ADMIN_TOKEN)) return reply(h, 401, { error: 'Wrong admin password' })
        const body = await req.json().catch(() => ({}))
        if (path === '/admin/stats' || path === '/admin/payments') {
          const names = await listAll(env, 'pay:')
          const recs = []
          for (const n of names) recs.push({ payment_id: n.slice(4), ...JSON.parse((await env.DB.get(n)) || '{}') })
          recs.sort((a, b) => (b.at || 0) - (a.at || 0))
          if (path === '/admin/payments') {
            const q = String(body.q || '').toLowerCase().trim()
            return reply(h, 200, { payments: recs.filter((r) => !q || r.email?.includes(q) || r.payment_id.toLowerCase().includes(q)).slice(0, 300) })
          }
          const m0 = new Date(); m0.setUTCDate(1); m0.setUTCHours(0, 0, 0, 0)
          const paid = recs.filter((r) => !r.refunded)
          const by = {}
          for (const r of paid) by[r.plan] = (by[r.plan] || 0) + 1
          const now = Date.now()
          const active = paid.filter((r) => PASS(r.plan) && (r.plan === 'life' || (r.from || r.at) + PLANS[r.plan].days * 86400e3 > now)).length
          return reply(h, 200, {
            sales: paid.length,
            revenue: paid.reduce((s, r) => s + (r.amt || 0), 0),
            monthSales: paid.filter((r) => r.at >= m0.getTime()).length,
            monthRevenue: paid.filter((r) => r.at >= m0.getTime()).reduce((s, r) => s + (r.amt || 0), 0),
            refunds: recs.length - paid.length,
            activePro: active,
            byPlan: by,
          })
        }
        if (path === '/admin/gift') {
          if (!PASS(body.plan) || !body.who) return reply(h, 400, { error: 'who and plan (month/year/life) needed' })
          const gid = 'gift_' + Date.now().toString(36)
          await env.DB.put('gift:' + gid, JSON.stringify({ who: String(body.who), plan: body.plan, at: Date.now() }))
          return reply(h, 200, { licence: await makeLicence(env, String(body.who), 'gift', body.plan, Date.now(), gid) })
        }
        if (path === '/admin/revoke') {
          const pid = String(body.payment_id || '').trim()
          if (!pid) return reply(h, 400, { error: 'payment_id needed' })
          await env.DB.put('rev:' + pid, '1')
          const rec = JSON.parse((await env.DB.get('pay:' + pid)) || 'null')
          if (rec) await env.DB.put('pay:' + pid, JSON.stringify({ ...rec, refunded: true }))
          return reply(h, 200, { ok: true, note: 'Pro for this payment switches off the next time the buyer is online. Refund the money in the Razorpay dashboard.' })
        }
        if (path === '/admin/coupon') {
          const code = String(body.code || '').toUpperCase().trim()
          if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return reply(h, 400, { error: 'Code: 3–20 letters/numbers' })
          if (body.delete) {
            await env.DB.put('coupon:' + code, JSON.stringify({ off: 0 }))
            return reply(h, 200, { ok: true })
          }
          const off = Math.round(Number(body.off))
          if (!(off >= 1 && off <= 90)) return reply(h, 400, { error: 'Discount 1–90 %' })
          const prev = JSON.parse((await env.DB.get('coupon:' + code)) || '{}')
          const c = { off, until: body.until ? Number(new Date(body.until)) : 0, max: Number(body.max) || 0, used: prev.used || 0, plans: Array.isArray(body.plans) ? body.plans.filter(PASS) : [] }
          await env.DB.put('coupon:' + code, JSON.stringify(c))
          return reply(h, 200, { coupon: { code, ...c } })
        }
        if (path === '/admin/coupons') {
          const out = []
          for (const n of await listAll(env, 'coupon:')) {
            const c = JSON.parse((await env.DB.get(n)) || '{}')
            if (c.off > 0) out.push({ code: n.slice(7), ...c })
          }
          return reply(h, 200, { coupons: out })
        }
        return reply(h, 404, { error: 'Not found' })
      }

      const body = await req.json().catch(() => ({}))

      if (path === '/price') {
        const q = await quote(env, body.plan, body.coupon, body.current)
        if (body.coupon && !q.coupon) return reply(h, 200, { amount: q.amount, original: q.original, off: 0, couponError: 'That coupon isn’t valid (or has ended).', from: q.from })
        return reply(h, 200, { amount: q.amount, original: q.original, off: q.off, coupon: q.coupon, from: q.from })
      }

      if (path === '/order') {
        if (!PLANS[body.plan]) return reply(h, 400, { error: 'Unknown plan' })
        if (!validEmail(body.email)) return reply(h, 400, { error: 'Type a valid email' })
        const q = await quote(env, body.plan, body.coupon, body.current)
        const notes = { plan: body.plan, email: body.email.toLowerCase(), amt: String(q.amount), from: String(q.from), coupon: q.coupon, sub: q.cur?.sub || '' }
        const o = await rz(env, '/orders', { amount: q.amount * 100, currency: 'INR', receipt: `cf_${Date.now()}`, notes })
        return reply(h, 200, { order_id: o.id, amount: o.amount })
      }

      if (path === '/verify') {
        const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = body
        if (!oid || !pid || !sig) return reply(h, 400, { error: 'Missing payment details' })
        if (!safeEq(await hmacHex(env.RAZORPAY_KEY_SECRET, `${oid}|${pid}`), sig)) return reply(h, 401, { error: 'Payment could not be verified' })
        // trust the order on Razorpay's side, not what the browser sends
        const order = await rz(env, '/orders/' + oid)
        const plan = order.notes?.plan
        const amt = Number(order.notes?.amt)
        if (!PLANS[plan] || !(amt >= 1) || amt > PLANS[plan].price || order.amount !== amt * 100) return reply(h, 400, { error: 'Order does not match a plan' })
        return reply(h, 200, await fulfil(env, pid, order))
      }

      if (path === '/restore') {
        const rec = JSON.parse((await env.DB.get('pay:' + String(body.payment_id || '').trim())) || 'null')
        if (!rec || rec.email !== String(body.email || '').toLowerCase().trim() || !PASS(rec.plan)) return reply(h, 404, { error: 'No purchase found for that email and payment ID.' })
        if (rec.refunded) return reply(h, 410, { error: 'That payment was refunded.' })
        const lic = await makeLicence(env, rec.email, 'razorpay', rec.plan, rec.from || rec.at, String(body.payment_id).trim())
        if (!(await readLicence(env, lic))) return reply(h, 410, { error: 'That Pro pass has ended.' })
        return reply(h, 200, { licence: lic, receipt: { payment_id: String(body.payment_id).trim(), plan: rec.plan, amount: rec.amt, date: rec.at, email: rec.email } })
      }

      if (path === '/check') {
        const lic = await readLicence(env, body.licence)
        if (!lic) return reply(h, 200, { ok: false, reason: 'invalid' })
        if (lic.pid && (await env.DB.get('rev:' + lic.pid))) return reply(h, 200, { ok: false, revoked: true })
        return reply(h, 200, { ok: true, exp: lic.exp })
      }

      if (path === '/play') {
        const plan = SKU_PLAN[body.sku]
        if (!plan || !body.purchaseToken) return reply(h, 400, { error: 'Unknown purchase' })
        const tok = await googleToken(env)
        const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${env.PLAY_PACKAGE}/purchases/products/${body.sku}/tokens/${encodeURIComponent(body.purchaseToken)}`
        const r = await fetch(base, { headers: { authorization: 'Bearer ' + tok } })
        const p = await r.json()
        if (!r.ok || p.purchaseState !== 0) return reply(h, 402, { error: 'This purchase is not completed.' })
        const pid = 'play:' + (p.orderId || body.purchaseToken.slice(0, 24))
        if (await env.DB.get('rev:' + pid)) return reply(h, 410, { error: 'This purchase was refunded.' })
        // a renewal bought while a pass is running starts when that pass ends
        let at = Number(p.purchaseTimeMillis) || Date.now()
        const known = JSON.parse((await env.DB.get('pay:' + pid)) || 'null')
        if (known) at = known.from
        else {
          const cur = body.current ? await readLicence(env, body.current) : null
          if (plan !== 'life' && cur?.exp) at = Math.max(at, cur.exp * 1000)
          await env.DB.put('pay:' + pid, JSON.stringify({ email: 'google-play', plan, at: Number(p.purchaseTimeMillis) || Date.now(), from: at, amt: PLANS[plan].price, src: 'play' }))
        }
        // passes are consumed so they can be bought again; lifetime is acknowledged and kept
        if (plan === 'life' && p.acknowledgementState === 0) await fetch(base + ':acknowledge', { method: 'POST', headers: { authorization: 'Bearer ' + tok } })
        if (plan !== 'life' && p.consumptionState === 0) await fetch(base + ':consume', { method: 'POST', headers: { authorization: 'Bearer ' + tok } })
        const lic = await makeLicence(env, pid, 'play', plan, at, pid)
        if (!(await readLicence(env, lic))) return reply(h, 410, { error: 'That Pro pass has ended.' })
        return reply(h, 200, { licence: lic })
      }

      const auth = async () => readLicence(env, (req.headers.get('authorization') || '').replace(/^Bearer /, ''))
      if (path === '/usage') {
        const lic = await auth()
        if (!lic) return reply(h, 401, { error: 'Built-in AI is part of ViralKaro Pro.' })
        return reply(h, 200, await aiLeft(env, lic.sub))
      }

      if (path === '/ai' || path === '/tts') {
        const lic = await auth()
        if (!lic) return reply(h, 401, { error: 'Built-in AI is part of ViralKaro Pro.' })
        if (lic.pid && (await env.DB.get('rev:' + lic.pid))) return reply(h, 401, { error: 'This Pro licence was cancelled.' })
        const cost = path === '/tts' ? 5 : 1
        const u = await aiLeft(env, lic.sub)
        if (u.left < cost) return reply(h, 429, { error: `You’ve used this month’s ${u.limit} AI requests. Add 100 more for ₹49 in ViralKaro Pro, or wait for the 1st.` })
        if (path === '/tts') {
          const text = String(body.text || '').trim()
          if (!text || text.length > 3000) return reply(h, 400, { error: 'Text 1–3000 characters' })
          const voice = /^[A-Za-z]{2,20}$/.test(body.voice || '') ? body.voice : 'Kore'
          const out = await speech(env, text, voice)
          await spendAI(env, lic.sub, cost)
          return reply(h, 200, { ...out, left: u.left - cost })
        }
        const prompt = String(body.prompt || '')
        if (!prompt || prompt.length > 20000) return reply(h, 400, { error: 'Request too long' })
        // up to 6 small JPEG frames (base64) so the AI can see the video – counts as 2 requests
        const images = Array.isArray(body.images) ? body.images.filter((x) => typeof x === 'string' && /^[A-Za-z0-9+/=]+$/.test(x) && x.length <= 300000).slice(0, 6) : []
        const used = images.length ? 2 : 1
        if (u.left < used) return reply(h, 429, { error: `You’ve used this month’s ${u.limit} AI requests. Add 100 more for ₹49 in ViralKaro Pro, or wait for the 1st.` })
        const text = await gemini(env, prompt, !!body.json, images)
        await spendAI(env, lic.sub, used)
        return reply(h, 200, { text, left: u.left - used })
      }
      return reply(h, 404, { error: 'Not found' })
    } catch (e) {
      return reply(h, e?.status || 500, { error: String(e?.message || e) })
    }
  },
}

// Local tests for worker.js with fake Razorpay / Google / Gemini. Run: node server/test.mjs <private-jwk-file> <public-key-file>
import fs from 'node:fs'
import worker, { makeLicence, readLicence } from './worker.js'
const [jwkFile, pubFile] = process.argv.slice(2)
const kv = new Map()
const DB = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) }
const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)).toString('base64')
const env = {
  DB, RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'secret123', RAZORPAY_WEBHOOK_SECRET: 'whsec', GEMINI_KEY: 'g', AI_MONTHLY: '2',
  LICENCE_PRIVATE_JWK: fs.readFileSync(jwkFile, 'utf8'), PLAY_PACKAGE: 'io.github.tiwary9847.clipforge',
  PLAY_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'sa@x.iam', private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----` }),
}
const orders = {}
let playState = { purchaseState: 0, acknowledgementState: 0, consumptionState: 0, purchaseTimeMillis: String(Date.now()), orderId: 'GPA.1' }
const calls = []
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push(init.method + ' ' + url.split('?')[0])
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s })
  if (url.endsWith('/v1/orders') && init.method === 'POST') { const b = JSON.parse(init.body); const id = 'order_' + Object.keys(orders).length; orders[id] = { id, ...b }; return J(orders[id]) }
  if (url.includes('/v1/orders/')) return J(orders[url.split('/').pop()])
  if (url.includes('oauth2.googleapis.com/token')) return J({ access_token: 'gtok' })
  if (url.includes('androidpublisher') && !init.method) return J(playState)
  if (url.includes('androidpublisher')) return J({})
  if (url.includes('generativelanguage')) return url.includes('gemini-flash-latest') ? J({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }) : J({}, 404)
  return J({ error: 'unexpected ' + url }, 500)
}
const call = async (path, body, headers = {}) => {
  const r = await worker.fetch(new Request('https://w.dev' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://tiwary9847.github.io', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }), env)
  return [r.status, await r.json()]
}
const hmac = async (s, m) => Buffer.from(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(m))).toString('hex')
// the app's own check (same as src/plan.ts)
const pub = await crypto.subtle.importKey('spki', Buffer.from(fs.readFileSync(pubFile, 'utf8'), 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
const appVerify = async (t) => { const [p, s] = t.split('.'); const b = (x) => Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); return (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b(s), new TextEncoder().encode(p))) ? JSON.parse(b(p).toString()) : null }
let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  ' + extra : '')) }

let [s, j] = await call('/order', { plan: 'gold', email: 'a@b.in' }); check('unknown plan refused', s === 400)
;[s, j] = await call('/order', { plan: 'year', email: 'nope' }); check('bad email refused', s === 400)
;[s, j] = await call('/order', { plan: 'year', email: 'Ravi@Mail.in' }); check('order created ₹699', s === 200 && j.amount === 69900, j.order_id)
const oid = j.order_id
;[s, j] = await call('/verify', { razorpay_order_id: oid, razorpay_payment_id: 'pay_1', razorpay_signature: 'f'.repeat(64) }); check('forged signature refused', s === 401)
;[s, j] = await call('/verify', { plan: 'life', email: 'ravi@mail.in', razorpay_order_id: oid, razorpay_payment_id: 'pay_1', razorpay_signature: await hmac('secret123', `${oid}|pay_1`) })
let lic = j.licence && (await appVerify(j.licence))
check('genuine payment → licence the app accepts', s === 200 && !!lic)
check('plan taken from the order (year), not what the browser claimed (life)', lic && lic.exp > 0 && Math.round((lic.exp - lic.iat) / 86400) === 366, JSON.stringify(lic))
// cheap order relabelled
orders['order_x'] = { id: 'order_x', amount: 9900, notes: { plan: 'life', email: 'x@y.in' } }
;[s, j] = await call('/verify', { razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: await hmac('secret123', 'order_x|pay_x') }); check('₹99 order claiming lifetime refused', s === 400)
;[s, j] = await call('/restore', { email: 'ravi@mail.in', payment_id: 'pay_1' }); check('restore with right email', s === 200 && !!(await appVerify(j.licence)))
;[s, j] = await call('/restore', { email: 'other@mail.in', payment_id: 'pay_1' }); check('restore with wrong email refused', s === 404)
// webhook
const ev = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w', amount: 9900, created_at: Math.floor(Date.now() / 1000), notes: { plan: 'month', email: 'w@x.in' } } } } })
;[s, j] = await call('/webhook', ev, { 'x-razorpay-signature': 'bad' }); check('fake webhook refused', s === 401)
;[s, j] = await call('/webhook', ev, { 'x-razorpay-signature': await hmac('whsec', ev) }); check('real webhook recorded', s === 200 && kv.has('pay:pay_w'))
;[s, j] = await call('/restore', { email: 'w@x.in', payment_id: 'pay_w' }); lic = j.licence && (await appVerify(j.licence)); check('tab closed before verify → still restorable (30 days)', s === 200 && Math.round((lic.exp - lic.iat) / 86400) === 30)
// expired pass
kv.set('pay:pay_old', JSON.stringify({ email: 'o@x.in', plan: 'month', at: Date.now() - 40 * 86400e3 }))
;[s, j] = await call('/restore', { email: 'o@x.in', payment_id: 'pay_old' }); check('ended 30-day pass not restored', s === 410)
// AI
;[s, j] = await call('/ai', { prompt: 'hi' }); check('AI without Pro refused', s === 401)
const good = await makeLicence(env, 'ravi@mail.in', 'razorpay', 'year')
;[s, j] = await call('/ai', { prompt: 'hi', json: true }, { authorization: 'Bearer ' + good }); check('AI with Pro works (falls back past retired models)', s === 200 && j.text === '{"ok":1}', 'left ' + j.left)
;[s, j] = await call('/ai', { prompt: 'hi' }, { authorization: 'Bearer ' + good }); check('second request', s === 200 && j.left === 0)
;[s, j] = await call('/ai', { prompt: 'hi' }, { authorization: 'Bearer ' + good }); check('monthly limit enforced', s === 429)
const tampered = good.replace(/^[^.]+/, Buffer.from(JSON.stringify({ v: 1, sub: 'x', plan: 'pro', src: 'gift', iat: 1, exp: 0 })).toString('base64url'))
;[s, j] = await call('/ai', { prompt: 'hi' }, { authorization: 'Bearer ' + tampered }); check('edited licence refused', s === 401)
check('app rejects edited licence too', !(await appVerify(tampered)))
// Play
;[s, j] = await call('/play', { sku: 'pro_life', purchaseToken: 'tok123' }); lic = j.licence && (await appVerify(j.licence))
check('Play lifetime purchase → lifetime licence', s === 200 && lic?.exp === 0 && lic.src === 'play'); check('lifetime acknowledged', calls.some((c) => c.includes(':acknowledge')))
;[s, j] = await call('/play', { sku: 'pro_month', purchaseToken: 'tok9' }); check('Play month pass consumed (can buy again)', s === 200 && calls.some((c) => c.includes(':consume')))
playState = { ...playState, purchaseState: 1 }
;[s, j] = await call('/play', { sku: 'pro_year', purchaseToken: 'tok5' }); check('cancelled Play purchase refused', s === 402)
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

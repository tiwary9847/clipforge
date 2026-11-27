// Local tests for worker.js with fake Razorpay / Google / Gemini. Run: node server/test.mjs <private-jwk-file> <public-key-file>
import fs from 'node:fs'
import worker, { makeLicence, readLicence } from './worker.js'
const [jwkFile, pubFile] = process.argv.slice(2)
const kv = new Map()
const DB = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v), list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) }
const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', rsa.privateKey)).toString('base64')
const env = {
  DB, RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'secret123', RAZORPAY_WEBHOOK_SECRET: 'whsec', GEMINI_KEY: 'g', AI_MONTHLY: '2', ADMIN_TOKEN: 'adm-secret-1',
  LICENCE_PRIVATE_JWK: fs.readFileSync(jwkFile, 'utf8'), PLAY_PACKAGE: 'io.github.tiwary9847.viralkaro',
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
  if (url.startsWith('https://api.klipy.com/')) { const st = url.includes('/stickers/'); return J({ result: true, data: { current_page: 1, per_page: 24, has_next: true, data: [
    { id: 7, slug: 'wow-7', title: 'Wow', type: st ? 'sticker' : 'gif', file: { hd: { webp: { url: 'https://static.klipy.com/a/hd.webp', width: 498, height: 280 }, mp4: { url: 'https://static.klipy.com/a/hd.mp4' } }, sm: { webp: { url: 'https://static.klipy.com/a/sm.webp', width: 150, height: 84 } } } },
    { id: 8, type: 'ad', file: {} }] } }) }
  if (url.startsWith('https://api.giphy.com/')) return J({ data: [{ id: 'abc', title: 'Clap', images: { original: { url: 'https://media1.giphy.com/x.gif', webp: 'https://media1.giphy.com/x.webp', mp4: 'https://media1.giphy.com/x.mp4', width: '480', height: '270' }, fixed_width_small: { url: 'https://media1.giphy.com/s.gif' } } }], pagination: { offset: 0, count: 1, total_count: 1 } })
  if (url.startsWith('https://static.klipy.com/')) return new Response(new Uint8Array(900), { status: 200, headers: { 'content-type': 'image/webp', 'content-length': '900' } })
  if (url.startsWith('https://cdn.freesound.org/')) return new Response(new Uint8Array(3000), { status: 200, headers: { 'content-type': 'audio/mpeg', 'content-length': '3000' } })
  if (url.includes('-tts')) return url.includes('gemini-3.8-flash-tts') ? J({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: 'AAAA' } }] } }] }) : J({}, 404)
  if (url.includes('generativelanguage') && init.body) globalThis.lastGem = JSON.parse(init.body)
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
orders['order_w'] = { id: 'order_w', amount: 9900, notes: { plan: 'month', email: 'w@x.in', amt: '99', from: String(Date.now()) } }
const ev = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w', order_id: 'order_w', amount: 9900 } } } })
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
/* ---- v28: renewals, coupons, top-ups, refunds, voice, admin ---- */
const buy = async (plan, email, extra = {}, pid = 'pay_' + Math.random().toString(36).slice(2, 8)) => {
  const [s1, o] = await call('/order', { plan, email, ...extra })
  if (s1 !== 200) return [s1, o]
  return call('/verify', { razorpay_order_id: o.order_id, razorpay_payment_id: pid, razorpay_signature: await hmac('secret123', `${o.order_id}|${pid}`) })
}
const month1 = await makeLicence(env, 'r@x.in', 'razorpay', 'month', Date.now() - 20 * 86400e3) // 10 days left
;[s, j] = await buy('month', 'r@x.in', { current: month1 }); lic = j.licence && (await appVerify(j.licence))
check('renewing early keeps the days left (10 + 30 = 40)', s === 200 && Math.round((lic.exp * 1000 - Date.now()) / 86400e3) === 40, JSON.stringify(j.receipt))
check('receipt returned with payment', j.receipt?.amount === 99 && j.receipt?.plan === 'month')
;[s, j] = await buy('day', 'd@x.in'); lic = j.licence && (await appVerify(j.licence))
check('1-day pass: ₹19, Pro for 24 hours', s === 200 && j.receipt?.amount === 19 && lic.exp - lic.iat === 86400 && lic.plan === 'pro')
;[s, j] = await buy('week', 'd@x.in', { current: j.licence }); lic = j.licence && (await appVerify(j.licence))
check('1-week pass after a day pass: ₹39, days add up (1 + 7)', s === 200 && j.receipt?.amount === 39 && Math.round((lic.exp * 1000 - Date.now()) / 86400e3) === 8)
;[s, j] = await call('/order', { plan: 'year', email: 'z@x.in', current: await makeLicence(env, 'z@x.in', 'gift', 'life') }); check('lifetime owner can’t buy a pass by mistake', s === 400)
// coupons
;[s, j] = await call('/admin/coupon', { code: 'DIWALI30', off: 30 }); check('admin needs the password', s === 401)
const A = { 'x-admin-token': 'adm-secret-1' }
;[s, j] = await call('/admin/coupon', { code: 'diwali30', off: 30, max: 1 }, A); check('admin creates coupon', s === 200 && j.coupon.code === 'DIWALI30')
;[s, j] = await call('/price', { plan: 'year', coupon: 'Diwali30' }); check('coupon price preview ₹699 → ₹489', j.amount === 489 && j.off === 30)
;[s, j] = await call('/price', { plan: 'year', coupon: 'FAKE' }); check('bad coupon explained, full price', j.amount === 699 && !!j.couponError)
;[s, j] = await buy('year', 'c@x.in', { coupon: 'DIWALI30' }); check('pay with coupon', s === 200 && j.receipt.amount === 489 && j.receipt.coupon === 'DIWALI30')
;[s, j] = await call('/price', { plan: 'year', coupon: 'DIWALI30' }); check('coupon max uses respected', j.amount === 699)
// AI top-up
;[s, j] = await call('/order', { plan: 'ai100', email: 'r@x.in' }); check('AI top-up needs Pro', s === 400)
const proT = await makeLicence(env, 't@x.in', 'razorpay', 'year')
for (let i = 0; i < 2; i++) await call('/ai', { prompt: 'hi' }, { authorization: 'Bearer ' + proT })
;[s, j] = await call('/ai', { prompt: 'hi' }, { authorization: 'Bearer ' + proT }); check('limit reached before top-up', s === 429 && /₹49/.test(j.error))
;[s, j] = await buy('ai100', 't@x.in', { current: proT }); check('₹49 top-up paid', s === 200 && j.topup === 100 && !j.licence)
;[s, j] = await call('/usage', {}, { authorization: 'Bearer ' + proT }); check('usage shows +100', j.limit === 102 && j.left === 100, JSON.stringify(j))
;[s, j] = await call('/ai', { prompt: 'hi' }, { authorization: 'Bearer ' + proT }); check('AI works again after top-up', s === 200)
// voice
;[s, j] = await call('/tts', { text: 'नमस्ते दोस्तों', voice: 'Kore' }, { authorization: 'Bearer ' + proT }); check('Hindi voice returns audio', s === 200 && j.audio === 'AAAA' && j.sr === 24000)
;[s, j] = await call('/tts', { text: 'hi' }); check('voice without Pro refused', s === 401)
// refunds
;[s, j] = await buy('life', 'ref@x.in', {}, 'pay_ref'); const refLic = j.licence
;[s, j] = await call('/check', { licence: refLic }); check('check: valid before refund', j.ok === true)
const rev = JSON.stringify({ event: 'refund.processed', payload: { refund: { entity: { payment_id: 'pay_ref' } } } })
;[s, j] = await call('/webhook', rev, { 'x-razorpay-signature': await hmac('whsec', rev) }); check('refund webhook accepted', s === 200)
;[s, j] = await call('/check', { licence: refLic }); check('refunded licence switched off', j.ok === false && j.revoked)
;[s, j] = await call('/ai', { prompt: 'hi' }, { authorization: 'Bearer ' + refLic }); check('refunded licence can’t use AI', s === 401)
;[s, j] = await call('/restore', { email: 'ref@x.in', payment_id: 'pay_ref' }); check('refunded payment can’t be restored', s === 410)
// admin
;[s, j] = await call('/admin/stats', {}, A); check('stats count sales and refunds', s === 200 && j.refunds === 1 && j.sales >= 4 && j.revenue > 0, JSON.stringify(j))
;[s, j] = await call('/admin/payments', { q: 'c@x.in' }, A); check('search buyers', j.payments.length === 1 && j.payments[0].amt === 489)
;[s, j] = await call('/admin/gift', { who: 'Friend', plan: 'year' }, A); lic = j.licence && (await appVerify(j.licence)); check('gift licence', !!lic && lic.src === 'gift')
;[s, j] = await call('/admin/revoke', { payment_id: lic.pid }, A); ;[s, j] = await call('/check', { licence: (await call('/admin/gift', { who: 'F2', plan: 'month' }, A))[1].licence }); check('other gifts unaffected by a revoke', j.ok === true)
;[s, j] = await call('/admin/coupons', {}, A); check('list coupons', j.coupons.some((c) => c.code === 'DIWALI30'))
// audio relay
const media = async (u) => { const r = await worker.fetch(new Request('https://w.dev/media?u=' + encodeURIComponent(u), { headers: { origin: 'https://tiwary9847.github.io' } }), env); return [r.status, r.headers.get('access-control-allow-origin'), r.headers.get('content-type')] }
;[s, j] = [await media('https://cdn.freesound.org/previews/1/1_2-hq.mp3')]; check('relay: Freesound preview allowed, browser may read it', s[0] === 200 && s[1] === 'https://tiwary9847.github.io' && s[2] === 'audio/mpeg', JSON.stringify(s))
const gifs = async (qs, e = env) => { const r = await worker.fetch(new Request('https://w.dev/gifs?' + qs, { headers: { origin: 'https://tiwary9847.github.io' } }), e); return [r.status, await r.json()] }
{
  let [st, g] = await gifs('type=gifs&q=wow', { ...env })
  check('gifs: off until the owner adds a key', st === 503 && g.code === 'nogif')
  ;[st, g] = await gifs('type=gifs&q=wow&cid=abc', { ...env, KLIPY_KEY: 'kk' })
  check('gifs: KLIPY search → clean list, ads dropped', st === 200 && g.by === 'KLIPY' && g.items.length === 1 && g.items[0].url.endsWith('hd.webp') && g.items[0].thumb.endsWith('sm.webp') && g.items[0].w === 498 && g.next === true, JSON.stringify(g).slice(0, 120))
  check('gifs: key never sent to the app', !JSON.stringify(g).includes('kk'))
  ;[st, g] = await gifs('type=stickers', { ...env, KLIPY_KEY: 'kk' })
  check('gifs: stickers trending', st === 200 && calls.at(-1).includes('/stickers/trending'))
  ;[st, g] = await gifs('type=gifs&q=clap', { ...env, GIPHY_KEY: 'gg' })
  check('gifs: GIPHY fallback', st === 200 && g.by === 'GIPHY' && g.items[0].url.endsWith('x.webp') && g.items[0].w === 480)
  const r = await media('https://static.klipy.com/a/hd.webp')
  check('relay: KLIPY GIF file allowed', r[0] === 200 && r[2] === 'image/webp', JSON.stringify(r))
}
check('relay: other sites refused', (await media('https://evil.example/x.mp3'))[0] === 400)
check('relay: Freesound login-only download refused', (await media('https://freesound.org/apiv2/sounds/5/download/'))[0] === 400)
check('relay: no http / tricks', (await media('http://cdn.freesound.org/previews/a.mp3'))[0] === 400 && (await media('https://user@cdn.freesound.org/previews/a.mp3'))[0] === 400)
{
  const lic = await makeLicence(env, 'frames@x.in', 'razorpay', 'year')
  const img = Buffer.from('fakejpeg').toString('base64')
  const [s1, j1] = await call('/ai', { prompt: 'what do viewers say', json: true, images: [img, img, img, 'not base64!!'] }, { authorization: 'Bearer ' + lic })
  const parts = globalThis.lastGem?.contents?.[0]?.parts ?? []
  check('AI with video frames: frames reach Gemini, bad ones dropped, counts as 2', s1 === 200 && parts.filter((p) => p.inlineData).length === 3 && parts.at(-1).text === 'what do viewers say' && j1.left === 0, JSON.stringify({ s1, n: parts.length, left: j1.left }))
  const [s2] = await call('/ai', { prompt: 'again', images: [img] }, { authorization: 'Bearer ' + lic })
  check('AI with frames refused when not enough requests left', s2 === 429)
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

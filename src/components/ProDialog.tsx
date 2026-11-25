import { ReactNode, useEffect, useState } from 'react'
import { engine } from '../engine'
import { AIUsage, CONFIG, OFFERS, PRO_FEATURES, PLAN_NAME, PlanOffer, Receipt, activate, aiUsage, daysLeft, inPlayApp, licence, licenceText, openPro, post, printReceipt, receipts, salesOpen, saveReceipt, signOut, usePro } from '../plan'
import { setUi } from '../store'

const toast = (m: string) => setUi({ toast: m })
const done = (ok: boolean) => {
  engine.requestRender()
  if (ok) toast('🎉 Pro is on – thank you for supporting ClipForge!')
}

/** Shows its children for Pro, otherwise a small locked card. */
export function ProGate({ what, children }: { what: string; children: ReactNode }) {
  const pro = usePro()
  if (pro) return <>{children}</>
  return (
    <div className="pro-lock">
      <span className="pro-badge">PRO</span>
      <div className="hint">{what} is part of ClipForge Pro.</div>
      <button className="btn primary sm" onClick={() => openPro(`${what} is part of ClipForge Pro.`)}>Unlock with Pro</button>
    </div>
  )
}

/* ---------- payment flows ---------- */

const loadScript = (src: string) =>
  new Promise<void>((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok()
    const s = document.createElement('script')
    s.src = src
    s.onload = () => ok()
    s.onerror = () => bad(new Error('Couldn’t load the payment page – check your internet.'))
    document.head.appendChild(s)
  })

type PlanId = PlanOffer['id']
interface Paid { licence?: string; topup?: number; receipt?: Receipt }
/** Plain-language reasons for a failed payment (Razorpay error.reason / code). */
function failText(err: Record<string, any> = {}): string {
  const r = String(err.reason || err.code || '')
  if (/insufficient/i.test(r)) return 'Payment failed – not enough balance. Try another UPI app or card.'
  if (/authentication|otp|3ds/i.test(r)) return 'Payment failed – the OTP / PIN step didn’t finish. Please try again.'
  if (/declined|card/i.test(r)) return 'Your bank declined the payment. Try UPI or another card.'
  if (/timeout|time_out|expired/i.test(r)) return 'The payment timed out. No money was taken – try again.'
  if (/network|gateway/i.test(r)) return 'The bank’s server didn’t answer. If money was taken, it comes back automatically in 5–7 days.'
  return (err.description ? `Payment failed: ${err.description}` : 'Payment failed.') + ' If money was taken, it comes back automatically in 5–7 days.'
}

/** Website: Razorpay Checkout (UPI, cards, net banking). Resolves null when the buyer closes it. */
async function buyRazorpay(plan: PlanId, email: string, coupon: string): Promise<Paid | null> {
  const order = await post<{ order_id: string; amount: number }>('/order', { plan, email, coupon: coupon || undefined, current: licenceText() || undefined })
  await loadScript('https://checkout.razorpay.com/v1/checkout.js')
  return new Promise((resolve, reject) => {
    const R = (window as any).Razorpay
    let failed = ''
    const rz = new R({
      key: CONFIG.razorpayKey,
      order_id: order.order_id,
      amount: order.amount,
      currency: 'INR',
      name: 'ClipForge',
      description: PLAN_NAME[plan],
      prefill: { email },
      theme: { color: '#7c5cff' },
      retry: { enabled: true, max_count: 3 },
      handler: async (resp: Record<string, string>) => {
        try {
          resolve(await post<Paid>('/verify', resp))
        } catch (e) {
          reject(new Error((e as Error).message + ' – your payment ID is ' + resp.razorpay_payment_id + '. Use “Get Pro back” with it, or write to us.'))
        }
      },
      modal: { ondismiss: () => (failed ? reject(new Error(failed)) : resolve(null)) },
    })
    rz.on?.('payment.failed', (r: { error?: Record<string, any> }) => {
      failed = failText(r?.error)
      toast(failed)
    })
    rz.open()
  })
}

const SKU: Record<string, string> = { month: 'pro_month', year: 'pro_year', life: 'pro_life' }

/** Play Store app: Google Play Billing through the Digital Goods API. */
async function buyPlay(plan: PlanId): Promise<Paid | null> {
  const gds = (window as any).getDigitalGoodsService
  if (!gds) throw new Error('Play Billing isn’t available – update the ClipForge app from the Play Store.')
  const service = await gds('https://play.google.com/billing')
  const [item] = await service.getDetails([SKU[plan]])
  if (!item) throw new Error('This plan isn’t on sale yet.')
  const req = new PaymentRequest([{ supportedMethods: 'https://play.google.com/billing', data: { sku: SKU[plan] } }], { total: { label: 'Total', amount: { currency: 'INR', value: '0' } } })
  let resp: any
  try {
    resp = await req.show()
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null
    throw new Error('Google Play couldn’t take the payment. Check your payment method in Play Store and try again.')
  }
  try {
    const r = await post<Paid>('/play', { sku: SKU[plan], purchaseToken: resp.details.purchaseToken, current: licenceText() || undefined })
    await resp.complete('success')
    return r
  } catch (e) {
    await resp.complete('fail')
    throw e
  }
}

/** Play Store app: get Pro back after reinstalling. */
async function restorePlay(): Promise<boolean> {
  const service = await (window as any).getDigitalGoodsService?.('https://play.google.com/billing')
  if (!service) return false
  for (const p of await service.listPurchases()) {
    try {
      const r = await post<Paid>('/play', { sku: p.itemId, purchaseToken: p.purchaseToken })
      if (r.licence && (await activate(r.licence))) return true
    } catch {
      /* try the next one */
    }
  }
  return false
}

const fmtDate = (sec: number) => new Date(sec * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** Applies what a payment bought. Returns a message for the buyer. */
async function apply(r: Paid): Promise<string> {
  if (r.receipt) saveReceipt(r.receipt)
  if (r.topup) return `✓ ${r.topup} more AI requests added for this month.`
  if (r.licence && (await activate(r.licence))) {
    engine.requestRender()
    const l = licence()!
    return l.exp ? `🎉 Pro is on until ${fmtDate(l.exp)} – thank you for supporting ClipForge!` : '🎉 Lifetime Pro is on – thank you for supporting ClipForge!'
  }
  throw new Error('Payment received, but the licence didn’t check out. Use “Get Pro back” with your payment ID.')
}

/* ---------- plan picker with coupon ---------- */

function Buy({ plans, current, label, onDone }: { plans: PlanId[]; current?: boolean; label: string; onDone: () => void }) {
  const [pick, setPick] = useState<PlanId>(plans.includes('year') ? 'year' : plans[0])
  const [email, setEmail] = useState(() => localStorage.getItem('clipforge-email') || (licence()?.sub?.includes('@') ? licence()!.sub : ''))
  const [coupon, setCoupon] = useState('')
  const [price, setPrice] = useState<{ amount: number; off: number; msg?: string } | null>(null)
  const [busy, setBusy] = useState('')
  const play = inPlayApp()
  const offer = OFFERS.find((o) => o.id === pick)!
  useEffect(() => {
    if (email) localStorage.setItem('clipforge-email', email)
  }, [email])
  useEffect(() => setPrice(null), [pick])
  const checkCoupon = async () => {
    if (!coupon.trim()) return
    try {
      const j = await post<{ amount: number; off: number; couponError?: string }>('/price', { plan: pick, coupon: coupon.trim(), current: licenceText() || undefined })
      setPrice({ amount: j.amount, off: j.off, msg: j.couponError })
    } catch (e) {
      setPrice({ amount: offer.price, off: 0, msg: (e as Error).message })
    }
  }
  const go = async () => {
    if (!play && !/^\S+@\S+\.\S+$/.test(email)) return toast('Type your email – it’s how you get Pro back on a new phone.')
    setBusy('Opening payment…')
    try {
      const r = play ? await buyPlay(pick) : await buyRazorpay(pick, email, price?.off ? coupon.trim() : '')
      if (r) {
        toast(await apply(r))
        onDone()
      }
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const now = price?.off ? price.amount : offer.price
  const dl = daysLeft()
  return (
    <>
      <div className="pro-offers">
        {plans.map((id) => {
          const o = OFFERS.find((x) => x.id === id)!
          return (
            <button key={o.id} className={'pro-offer' + (pick === o.id ? ' on' : '')} onClick={() => setPick(o.id)}>
              {o.id === 'year' && <span className="pro-tag">Best value</span>}
              <b>{o.name}</b>
              <span className="pro-price">₹{o.price.toLocaleString('en-IN')}</span>
              <small>{o.id === 'month' ? '30 days · no auto-renew' : o.id === 'year' ? '12 months · ' + o.note : o.id === 'ai100' ? 'this month' : o.note}</small>
            </button>
          )
        })}
      </div>
      {current && dl !== null && (pick === 'month' || pick === 'year') && <div className="hint">Your {dl} day{dl === 1 ? '' : 's'} left are kept – the new pass starts when the current one ends.</div>}
      {!play && <input className="full" type="email" placeholder="Your email (to get Pro back on a new phone)" value={email} onChange={(e) => setEmail(e.target.value)} />}
      {!play && pick !== 'ai100' && (
        <div className="row coupon-row">
          <input placeholder="Coupon code (optional)" value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setPrice(null) }} onKeyDown={(e) => e.key === 'Enter' && checkCoupon()} />
          <button className="btn sm" disabled={!coupon.trim()} onClick={checkCoupon}>Apply</button>
        </div>
      )}
      {price?.msg && <div className="hint warn">{price.msg}</div>}
      {!!price?.off && <div className="hint pro-ok">✓ {price.off}% off – you pay ₹{price.amount.toLocaleString('en-IN')} instead of ₹{offer.price.toLocaleString('en-IN')}.</div>}
      <button className="btn primary full big-save" disabled={!!busy} onClick={go}>{busy || `${label} · ₹${now.toLocaleString('en-IN')}`}</button>
      <div className="hint">{play ? 'Paid through Google Play.' : 'Pay with UPI, card or net banking (Razorpay). You get a receipt straight away.'}</div>
    </>
  )
}

function Receipts() {
  const list = receipts()
  if (!list.length) return null
  return (
    <details className="chap">
      <summary>Receipts ({list.length})</summary>
      <div className="receipts">
        {list.map((r) => (
          <div key={r.payment_id} className="receipt-row">
            <span>{new Date(r.date).toLocaleDateString('en-IN')} · {PLAN_NAME[r.plan] || r.plan} · ₹{r.amount}</span>
            <button className="btn sm" onClick={() => printReceipt(r)}>🧾 View</button>
          </div>
        ))}
      </div>
    </details>
  )
}

function AIMeter() {
  const [u, setU] = useState<AIUsage | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!CONFIG.server) return
    aiUsage().then(setU, (e) => setErr((e as Error).message))
  }, [])
  if (!CONFIG.server) return null
  if (!u) return <div className="hint">{err ? '' : 'Checking AI requests…'}</div>
  const pct = Math.min(100, Math.round((u.used / Math.max(1, u.limit)) * 100))
  return (
    <div className="ai-meter">
      <div className="row"><span>Built-in AI this month</span><b>{u.left} of {u.limit} left</b></div>
      <div className="meter"><i style={{ width: pct + '%' }} /></div>
    </div>
  )
}

/** Where each Pro feature lives – so a buyer can jump straight to it. */
const OPEN_FEATURE: Record<string, () => void> = {
  '🚀': () => window.dispatchEvent(new CustomEvent('cf:autopilot')),
  '🤖': () => window.dispatchEvent(new CustomEvent('cf:assistant')),
  '🗣': () => tool('tts'),
  '📦': () => tool('uploadkit'),
  '✨': () => window.dispatchEvent(new CustomEvent('cf:open', { detail: 'captions' })),
  '🪔': () => window.dispatchEvent(new CustomEvent('cf:open', { detail: 'templates' })),
  '🎞': () => window.dispatchEvent(new CustomEvent('cf:export')),
  '📐': () => tool('formats'),
  '🎨': () => tool('brand'),
}
function tool(id: string) {
  ;(window as any).__cfTool = id
  window.dispatchEvent(new CustomEvent('cf:open', { detail: 'tools' }))
  window.dispatchEvent(new CustomEvent('cf:tool', { detail: id }))
}

/* ---------- the Pro screen ---------- */

export function ProDialog({ why, onClose }: { why: string; onClose: () => void }) {
  const pro = usePro()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [restore, setRestore] = useState(false)
  const [email, setEmail] = useState(() => localStorage.getItem('clipforge-email') ?? '')
  const [payId, setPayId] = useState('')
  const [soonPick, setSoonPick] = useState<PlanId>('year')
  const [tab, setTab] = useState<'renew' | 'ai' | ''>(why.startsWith('renew') ? 'renew' : why.startsWith('ai') ? 'ai' : '')
  const play = inPlayApp()
  const open = salesOpen()
  const lic = licence()
  const dl = daysLeft()
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [busy, onClose])

  const useCode = async () => {
    setBusy('Checking…')
    const ok = await activate(code)
    setBusy('')
    if (!ok) return toast('That licence code isn’t valid (or it has expired).')
    done(true)
    onClose()
  }
  const doRestore = async () => {
    setBusy('Looking for your purchase…')
    try {
      if (play) {
        const ok = await restorePlay()
        done(ok)
        if (ok) onClose()
        else toast('No purchase found for that.')
      } else {
        toast(await apply(await post<Paid>('/restore', { email, payment_id: payId.trim() })))
        onClose()
      }
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal pro-modal">
        <div className="pro-head">
          <span className="pro-badge big">PRO</span>
          <h3>ClipForge Pro</h3>
        </div>
        {pro && lic ? (
          <>
            <p className={'pro-ok' + (dl !== null && dl <= 5 ? ' soon' : '')}>
              ✓ You have Pro {lic.exp ? `until ${fmtDate(lic.exp)} (${dl} day${dl === 1 ? '' : 's'} left)` : '– lifetime'}.
            </p>
            <AIMeter />
            {open && (
              <div className="pro-tabs">
                {!!lic.exp && <button className={'chip' + (tab === 'renew' ? ' on' : '')} onClick={() => setTab(tab === 'renew' ? '' : 'renew')}>🔁 Renew or upgrade</button>}
                {!play && !!CONFIG.server && <button className={'chip' + (tab === 'ai' ? ' on' : '')} onClick={() => setTab(tab === 'ai' ? '' : 'ai')}>➕ 100 more AI requests · ₹49</button>}
              </div>
            )}
            {open && tab === 'renew' && !!lic.exp && <Buy plans={['month', 'year', 'life']} current label="Renew" onDone={onClose} />}
            {open && tab === 'ai' && <Buy plans={['ai100']} current label="Add 100 AI requests" onDone={onClose} />}
            {!tab && (
              <>
                <div className="hint">Tap a feature to open it.</div>
                <ul className="pro-feats">
                  {PRO_FEATURES.map(([i, f]) =>
                    OPEN_FEATURE[i] ? (
                      <li key={f}><button className="pro-feat-go" onClick={() => { onClose(); setTimeout(OPEN_FEATURE[i], 50) }}><span>{i}</span><span>{f}</span><b>Open →</b></button></li>
                    ) : (
                      <li key={f}><span>{i}</span>{f}</li>
                    ),
                  )}
                </ul>
              </>
            )}
            <Receipts />
            <details className="chap">
              <summary>Use Pro on another phone or computer</summary>
              <div className="hint">Copy your licence code and paste it in ClipForge Pro → “I have a licence code” on the other device.</div>
              <button className="btn sm" onClick={() => { void navigator.clipboard.writeText(licenceText()); toast('Licence code copied.') }}>📋 Copy licence code</button>
            </details>
            <div className="modal-actions">
              <button className="btn" onClick={() => { signOut(); engine.requestRender(); toast('Pro removed from this device.') }}>Remove from this device</button>
              <button className="btn primary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            {why && !/^(renew|ai)$/.test(why) && <div className="pro-why">{why}</div>}
            <ul className="pro-feats">{PRO_FEATURES.map(([i, f]) => <li key={f}><span>{i}</span>{f}</li>)}</ul>
            <div className="hint">Everything else stays free – no ads, ever.</div>
            {open ? <Buy plans={['month', 'year', 'life']} label="Get Pro" onDone={onClose} /> : (
              <>
                <div className="pro-offers">
                  {OFFERS.filter((o) => o.id !== 'ai100').map((o) => (
                    <button key={o.id} className={'pro-offer' + (soonPick === o.id ? ' on' : '')} onClick={() => setSoonPick(o.id)}>
                      {o.id === 'year' && <span className="pro-tag">Best value</span>}
                      <b>{o.name}</b><span className="pro-price">₹{o.price.toLocaleString('en-IN')}</span><small>{o.note}</small>
                    </button>
                  ))}
                </div>
                <button className="btn primary full big-save" onClick={() => toast('Online payment is being switched on – it opens in a few days. Have a licence code? Paste it below.')}>
                  Get Pro · ₹{OFFERS.find((o) => o.id === soonPick)!.price.toLocaleString('en-IN')}
                </button>
                <div className="hint warn">Online payment opens soon. Have a licence code? Paste it below.</div>
              </>
            )}
            <details className="chap">
              <summary>I have a licence code</summary>
              <textarea className="full" rows={3} placeholder="Paste your licence code" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn sm primary" disabled={!code.trim() || !!busy} onClick={useCode}>Activate</button>
            </details>
            {open && (
              <details className="chap" open={restore} onToggle={(e) => setRestore((e.target as HTMLDetailsElement).open)}>
                <summary>Already bought Pro? Get it back</summary>
                {play ? (
                  <div className="hint">Pro bought in the app comes back with the same Google account.</div>
                ) : (
                  <>
                    <div className="hint">Use the email you paid with and the payment ID from your receipt (starts with pay_).</div>
                    <input className="full" type="email" placeholder="Email you paid with" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <input className="full" placeholder="Payment ID, e.g. pay_Abc123…" value={payId} onChange={(e) => setPayId(e.target.value)} />
                  </>
                )}
                <button className="btn sm" disabled={!!busy || (!play && (!email || !payId.trim()))} onClick={doRestore}>Restore Pro</button>
              </details>
            )}
            <Receipts />
            <div className="modal-actions">
              <button className="btn" disabled={!!busy} onClick={onClose}>Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Shown in the top bar when a pass is about to end. */
export function ExpiryBanner() {
  const pro = usePro()
  const [hide, setHide] = useState(() => sessionStorage.getItem('cf-exp-hide') === '1')
  const dl = pro ? daysLeft() : null
  if (dl === null || dl > 5 || hide) return null
  return (
    <div className="exp-banner" role="status">
      <span>⏳ Your ClipForge Pro ends {dl === 0 ? 'today' : `in ${dl} day${dl === 1 ? '' : 's'}`}. Renew now – the days you have left are kept.</span>
      <button className="btn sm primary" onClick={() => openPro('renew')}>Renew</button>
      <button className="btn sm ghost" aria-label="Hide" onClick={() => { sessionStorage.setItem('cf-exp-hide', '1'); setHide(true) }}>✕</button>
    </div>
  )
}

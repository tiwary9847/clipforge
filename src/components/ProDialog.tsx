import { ReactNode, useEffect, useState } from 'react'
import { engine } from '../engine'
import { CONFIG, OFFERS, PRO_FEATURES, PlanOffer, activate, inPlayApp, licence, licenceText, openPro, salesOpen, signOut, usePro } from '../plan'
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

const post = async (path: string, body: unknown) => {
  const r = await fetch(CONFIG.server + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  if (!r.ok) throw new Error(j.error || `The server said ${r.status}`)
  return j
}

const loadScript = (src: string) =>
  new Promise<void>((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok()
    const s = document.createElement('script')
    s.src = src
    s.onload = () => ok()
    s.onerror = () => bad(new Error('Couldn’t load the payment page – check your internet.'))
    document.head.appendChild(s)
  })

/** Website: Razorpay Checkout (UPI, cards, net banking). */
async function buyRazorpay(offer: PlanOffer, email: string): Promise<boolean> {
  const order = await post('/order', { plan: offer.id, email })
  await loadScript('https://checkout.razorpay.com/v1/checkout.js')
  return new Promise((resolve, reject) => {
    const R = (window as any).Razorpay
    const rz = new R({
      key: CONFIG.razorpayKey,
      order_id: order.order_id,
      amount: order.amount,
      currency: 'INR',
      name: 'ClipForge',
      description: `ClipForge Pro – ${offer.name}`,
      prefill: { email },
      theme: { color: '#7c5cff' },
      handler: async (resp: Record<string, string>) => {
        try {
          const r = await post('/verify', { plan: offer.id, email, ...resp })
          resolve(!!(await activate(r.licence)))
        } catch (e) {
          reject(e)
        }
      },
      modal: { ondismiss: () => resolve(false) },
    })
    rz.open()
  })
}

const SKU: Record<PlanOffer['id'], string> = { month: 'pro_month', year: 'pro_year', life: 'pro_life' }

/** Play Store app: Google Play Billing through the Digital Goods API. */
async function buyPlay(offer: PlanOffer): Promise<boolean> {
  const gds = (window as any).getDigitalGoodsService
  if (!gds) throw new Error('Play Billing isn’t available – update the ClipForge app from the Play Store.')
  const service = await gds('https://play.google.com/billing')
  const [item] = await service.getDetails([SKU[offer.id]])
  if (!item) throw new Error('This plan isn’t on sale yet.')
  const req = new PaymentRequest([{ supportedMethods: 'https://play.google.com/billing', data: { sku: SKU[offer.id] } }], { total: { label: 'Total', amount: { currency: 'INR', value: '0' } } })
  const resp = await req.show()
  try {
    const r = await post('/play', { sku: SKU[offer.id], purchaseToken: resp.details.purchaseToken })
    await resp.complete('success')
    return !!(await activate(r.licence))
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
      const r = await post('/play', { sku: p.itemId, purchaseToken: p.purchaseToken })
      if (await activate(r.licence)) return true
    } catch {
      /* try the next one */
    }
  }
  return false
}

/* ---------- the Pro screen ---------- */

export function ProDialog({ why, onClose }: { why: string; onClose: () => void }) {
  const pro = usePro()
  const [pick, setPick] = useState<PlanOffer['id']>('year')
  const [email, setEmail] = useState(() => localStorage.getItem('clipforge-email') ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [restore, setRestore] = useState(false)
  const [payId, setPayId] = useState('')
  const play = inPlayApp()
  const open = salesOpen()
  const lic = licence()
  useEffect(() => {
    localStorage.setItem('clipforge-email', email)
  }, [email])

  const buy = async () => {
    const offer = OFFERS.find((o) => o.id === pick)!
    if (!play && !/^\S+@\S+\.\S+$/.test(email)) return toast('Type your email – it’s how you get Pro back on a new phone.')
    setBusy('Opening payment…')
    try {
      const ok = play ? await buyPlay(offer) : await buyRazorpay(offer, email)
      done(ok)
      if (ok) onClose()
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
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
      const ok = play ? await restorePlay() : !!(await activate((await post('/restore', { email, payment_id: payId.trim() })).licence))
      done(ok)
      if (ok) onClose()
      else toast('No purchase found for that.')
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
            <p className="pro-ok">✓ You have Pro {lic.exp ? `until ${new Date(lic.exp * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : '– lifetime'}.</p>
            <ul className="pro-feats">{PRO_FEATURES.map(([i, f]) => <li key={f}><span>{i}</span>{f}</li>)}</ul>
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
            {why && <div className="pro-why">{why}</div>}
            <ul className="pro-feats">{PRO_FEATURES.map(([i, f]) => <li key={f}><span>{i}</span>{f}</li>)}</ul>
            <div className="hint">Everything else stays free – no ads, ever.</div>
            <div className="pro-offers">
              {OFFERS.map((o) => (
                <button key={o.id} className={'pro-offer' + (pick === o.id ? ' on' : '')} onClick={() => setPick(o.id)}>
                  {o.id === 'year' && <span className="pro-tag">Best value</span>}
                  <b>{o.name}</b>
                  <span className="pro-price">₹{o.price.toLocaleString('en-IN')}</span>
                  <small>{o.id === 'month' ? '30 days · no auto-renew' : o.id === 'year' ? '12 months · ' + o.note : o.note}</small>
                </button>
              ))}
            </div>
            {open ? (
              <>
                {!play && <input className="full" type="email" placeholder="Your email (to get Pro back on a new phone)" value={email} onChange={(e) => setEmail(e.target.value)} />}
                <button className="btn primary full big-save" disabled={!!busy} onClick={buy}>{busy || `Get Pro · ₹${OFFERS.find((o) => o.id === pick)!.price.toLocaleString('en-IN')}`}</button>
                <div className="hint">{play ? 'Paid through Google Play.' : 'Pay with UPI, card or net banking (Razorpay). Pro turns on straight away.'}</div>
              </>
            ) : (
              <div className="hint warn">Pro sales open soon. Have a licence code? Paste it below.</div>
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
                    <div className="hint">Use the email you paid with and the payment ID from Razorpay’s receipt (starts with pay_).</div>
                    <input className="full" placeholder="Payment ID, e.g. pay_Abc123…" value={payId} onChange={(e) => setPayId(e.target.value)} />
                  </>
                )}
                <button className="btn sm" disabled={!!busy || (!play && (!email || !payId.trim()))} onClick={doRestore}>Restore Pro</button>
              </details>
            )}
            <div className="modal-actions">
              <button className="btn" disabled={!!busy} onClick={onClose}>Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

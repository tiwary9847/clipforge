import { useState } from 'react'
import { requirePro, usePro } from '../plan'
import { PROPERTY_BADGES, PROPERTY_HIGHLIGHTS, PROPERTY_KINDS, PropLang, PropLook, PropertyInfo, buildPropertyReel, loadProperty, removePropertyReel } from '../property'
import { setUi, useStore } from '../store'
import { loadBrand } from '../tools2'

const LOOKS: [PropLook, string][] = [
  ['bold', '🔥 Bold'],
  ['luxury', '✨ Luxury gold'],
  ['clean', '🤍 Clean'],
]

export function PropertyPanel() {
  const pro = usePro()
  const [p, setP] = useState<PropertyInfo>(loadProperty)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [custom, setCustom] = useState('')
  const built = useStore((s) => s.project.clips.some((c) => c.tpl === 'property'))
  const set = (patch: Partial<PropertyInfo>) => setP((o) => ({ ...o, ...patch }))
  const toggleHl = (h: string) => set({ highlights: p.highlights.includes(h) ? p.highlights.filter((x) => x !== h) : [...p.highlights, h].slice(0, 6) })
  const hasLogo = !!loadBrand().logo

  async function build() {
    setErr('')
    if (!requirePro('The property reel maker is part of ClipForge Pro.')) return
    if (!p.price.trim() && !p.location.trim()) return setErr('Fill in at least the price or the location.')
    setBusy('Building…')
    try {
      setUi({ toast: await buildPropertyReel(p, (m) => setBusy(m)) })
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy('')
  }

  if (!open)
    return (
      <button className="prop-cta" onClick={() => setOpen(true)}>
        <span className="em">🏠</span>
        <span>
          <b>Property reel maker {!pro && <span className="pro-mini">PRO</span>}</b>
          <small>Fill a short form → price tag, location pin, highlights and a Call / WhatsApp ending on your property video.</small>
        </span>
        <span className="go">{built ? 'Edit' : 'Start'} →</span>
      </button>
    )

  return (
    <div className="prop">
      <div className="prop-h">
        <b>🏠 Property reel maker {!pro && <span className="pro-mini">PRO</span>}</b>
        <button className="lnk" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="hint">Import your property video or photos first. Everything is timed to your video and stays editable.</div>

      <label className="pf"><span>Property type</span>
        <input list="prop-kinds" value={p.kind} onChange={(e) => set({ kind: e.target.value })} placeholder="2 BHK Flat" />
        <datalist id="prop-kinds">{PROPERTY_KINDS.map((k) => <option key={k} value={k} />)}</datalist>
      </label>
      <div className="pf2">
        <label className="pf"><span>Price</span><input value={p.price} onChange={(e) => set({ price: e.target.value })} placeholder="₹40 Lakh" inputMode="text" /></label>
        <label className="pchk"><input type="checkbox" checked={p.onwards} onChange={(e) => set({ onwards: e.target.checked })} /> onwards</label>
      </div>
      <label className="pf"><span>Location</span><input value={p.location} onChange={(e) => set({ location: e.target.value })} placeholder="Sector 144, Noida" /></label>
      <label className="pf"><span>Project / builder name</span><input value={p.project} onChange={(e) => set({ project: e.target.value })} placeholder="Neo Urban Homes" /></label>
      <label className="pf"><span>Phone / WhatsApp</span><input value={p.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="98XXXXXXXX" inputMode="tel" /></label>

      <div className="pf"><span>Badge</span>
        <div className="chips">
          {PROPERTY_BADGES.map((b) => (
            <button key={b || 'none'} className={'chip' + (p.badge === b ? ' on' : '')} onClick={() => set({ badge: b })}>{b || 'None'}</button>
          ))}
        </div>
      </div>

      <div className="pf"><span>Highlights <small>({p.highlights.length}/6, shown one by one)</small></span>
        <div className="chips">
          {[...PROPERTY_HIGHLIGHTS, ...p.highlights.filter((h) => !PROPERTY_HIGHLIGHTS.includes(h))].map((h) => (
            <button key={h} className={'chip' + (p.highlights.includes(h) ? ' on' : '')} onClick={() => toggleHl(h)}>{p.highlights.includes(h) ? '✓ ' : ''}{h}</button>
          ))}
        </div>
        <form className="gif-search" onSubmit={(e) => { e.preventDefault(); const h = custom.trim(); if (h && !p.highlights.includes(h)) set({ highlights: [...p.highlights, h].slice(0, 6) }); setCustom('') }}>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add your own, e.g. 5 min to Expressway" />
          <button className="btn sm" disabled={!custom.trim() || p.highlights.length >= 6}>Add</button>
        </form>
      </div>

      <label className="pf"><span>RERA number <small>(shown small – required in property ads)</small></span><input value={p.rera} onChange={(e) => set({ rera: e.target.value })} placeholder="UPRERAPRJ123456" /></label>

      <div className="pf"><span>Look</span>
        <div className="chips">{LOOKS.map(([id, n]) => <button key={id} className={'chip' + (p.look === id ? ' on' : '')} onClick={() => set({ look: id })}>{n}</button>)}</div>
      </div>
      <div className="pf"><span>Words like “Call now”</span>
        <div className="chips">{([['en', 'English'], ['hi', 'हिन्दी']] as [PropLang, string][]).map(([id, n]) => <button key={id} className={'chip' + (p.lang === id ? ' on' : '')} onClick={() => set({ lang: id })}>{n}</button>)}</div>
      </div>
      <label className="pchk"><input type="checkbox" checked={p.music} onChange={(e) => set({ music: e.target.checked })} /> Add background music (made on your device, no copyright)</label>
      <label className="pchk"><input type="checkbox" checked={p.logo} disabled={!hasLogo} onChange={(e) => set({ logo: e.target.checked })} /> Add my logo {!hasLogo && <small>(save one in Tools → Brand kit)</small>}</label>

      {err && <div className="ae-err">⚠ {err}</div>}
      <div className="prop-go">
        <button className="btn primary" disabled={!!busy} onClick={build}>{busy || (built ? '↻ Build again' : '🏠 Build my property reel')}</button>
        {built && <button className="btn sm" disabled={!!busy} onClick={() => setUi({ toast: removePropertyReel() })}>Remove</button>}
      </div>
    </div>
  )
}

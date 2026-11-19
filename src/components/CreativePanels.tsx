import { useRef, useState } from 'react'
import { patchClip, setUi, updateClip, useStore } from '../store'
import { Clip } from '../types'
import { BEHIND_STYLES, PersonFx, SlideOpts, VIDEO_TEMPLATES, applyVideoTemplate, makeSlideshow, personEffect, textBehind } from '../creative'
import { Section, Slider } from './Fields'

const toast = (m: string) => setUi({ toast: m })

/** Pick-list of media (videos/photos or audio). */
function MediaPick({ kinds, value, onChange }: { kinds: ('video' | 'image')[]; value: string[]; onChange: (v: string[]) => void }) {
  const assets = useStore((s) => s.assets).filter((a) => kinds.includes(a.kind as any) && !a.name.startsWith('Template beat'))
  if (!assets.length) return <div className="hint">Import your {kinds.includes('video') ? 'clips or photos' : 'photos'} in the Media tab first.</div>
  return (
    <div className="pick-grid">
      {assets.map((a) => {
        const i = value.indexOf(a.id)
        return (
          <button key={a.id} className={'pick' + (i >= 0 ? ' on' : '')} onClick={() => onChange(i >= 0 ? value.filter((x) => x !== a.id) : [...value, a.id])} title={a.name}>
            {a.thumb ? <img src={a.thumb} alt="" /> : <span>{a.kind === 'video' ? '🎬' : '🖼'}</span>}
            {i >= 0 && <b>{i + 1}</b>}
          </button>
        )
      })}
    </div>
  )
}

function MusicPick({ value, onChange, none }: { value: string; onChange: (v: string) => void; none: string }) {
  const songs = useStore((s) => s.assets).filter((a) => a.kind === 'audio' && !a.name.startsWith('Template beat') && a.duration > 8)
  return (
    <select className="full" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{none}</option>
      {songs.map((a) => (
        <option key={a.id} value={a.id}>🎵 {a.name}</option>
      ))}
    </select>
  )
}

/* ---------- fill-in video templates ---------- */

export function VideoTemplates() {
  const [tpl, setTpl] = useState(VIDEO_TEMPLATES[0].id)
  const [clips, setClips] = useState<string[]>([])
  const [music, setMusic] = useState('')
  const [busy, setBusy] = useState('')
  const T = VIDEO_TEMPLATES.find((t) => t.id === tpl)!
  return (
    <>
      <div className="group-h" style={{ marginTop: 0 }}>🎞 Video templates – fill with your clips</div>
      <div className="hint">Pick a template, tap your clips in order, and they’re cut on the beat with effects and text – like CapCut templates.</div>
      <div className="tmpls">
        {VIDEO_TEMPLATES.map((t) => (
          <button key={t.id} className={'tmpl' + (tpl === t.id ? ' on' : '')} onClick={() => setTpl(t.id)}>
            <span className="em">{t.emoji}</span>
            <b>{t.name}</b>
            <small>{t.desc} · {t.slots.length} clips</small>
          </button>
        ))}
      </div>
      <div className="hint">Your clips ({clips.length} picked{clips.length && clips.length < T.slots.length ? ` – they’ll repeat to fill ${T.slots.length} spots` : ''}):</div>
      <MediaPick kinds={['video', 'image']} value={clips} onChange={setClips} />
      <MusicPick value={music} onChange={setMusic} none="🥁 Built-in beat (no song)" />
      <button
        className="btn primary full"
        disabled={!clips.length || !!busy}
        onClick={async () => {
          setBusy('Working…')
          try {
            toast(await applyVideoTemplate(tpl, clips, music || undefined, setBusy))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || `✨ Make “${T.name}”`}
      </button>
    </>
  )
}

/* ---------- photo slideshow ---------- */

export function Slideshow() {
  const [photos, setPhotos] = useState<string[]>([])
  const [music, setMusic] = useState('')
  const [per, setPer] = useState(2)
  const [style, setStyle] = useState<SlideOpts['style']>('smooth')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState('')
  return (
    <>
      <div className="group-h">📸 Photo slideshow</div>
      <div className="hint">Tap photos in order, add a song – each photo changes on the beat with slow zoom & pan (Ken Burns) and transitions.</div>
      <MediaPick kinds={['image']} value={photos} onChange={setPhotos} />
      <MusicPick value={music} onChange={setMusic} none="No music" />
      <div className="chips">
        {[1, 2, 3, 4].map((s) => (
          <button key={s} className={'chip' + (per === s ? ' on' : '')} onClick={() => setPer(s)}>{s}s / photo</button>
        ))}
      </div>
      <div className="chips">
        {([['smooth', '🌊 Smooth'], ['punchy', '⚡ Punchy'], ['memories', '🎞 Memories']] as const).map(([id, n]) => (
          <button key={id} className={'chip' + (style === id ? ' on' : '')} onClick={() => setStyle(id)}>{n}</button>
        ))}
      </div>
      <div className="osearch">
        <input placeholder="Title (optional) e.g. Goa 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <button
        className="btn primary full"
        disabled={photos.length < 2 || !!busy}
        onClick={async () => {
          setBusy('Working…')
          try {
            toast(await makeSlideshow({ photos, music: music || undefined, perPhoto: per, style, title }, setBusy))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || `🎬 Make slideshow (${photos.length} photos)`}
      </button>
    </>
  )
}

/* ---------- text behind you + person effects (clip settings) ---------- */

export function PersonSection({ c }: { c: Clip }) {
  const [text, setText] = useState('')
  const [style, setStyle] = useState('bold')
  const [color, setColor] = useState('#00e5ff')
  const [busy, setBusy] = useState('')
  const sig = useRef({ cancelled: false })
  if ((c.kind !== 'video' && c.kind !== 'image') || c.cutoutOf || c.echoOf) {
    if (c.glow)
      return (
        <Section title="Glow outline" right={<button className="lnk" onClick={() => updateClip(c.id, { glow: undefined })}>Remove</button>}>
          <label className="row2">
            <span>Colour</span>
            <input type="color" value={c.glow.color} onChange={(e) => patchClip(c.id, { glow: { ...c.glow!, color: e.target.value } })} />
          </label>
          <Slider label="Size" value={c.glow.size} min={0.005} max={0.06} step={0.001} onChange={(v) => patchClip(c.id, { glow: { ...c.glow!, size: v } })} fmt={(v) => Math.round(v * 1000) + ''} />
        </Section>
      )
    return null
  }
  const run = async (fn: () => Promise<string>) => {
    sig.current = { cancelled: false }
    setBusy('Finding you (first time downloads a ~25 MB model)…')
    try {
      toast(await fn())
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const fx = (f: PersonFx) => run(() => personEffect(c.id, f, color, (m) => setBusy(m), sig.current))
  return (
    <Section title="You: text behind & effects">
      <div className="hint">Cuts you out of the background (AI on your device) and uses the cut-out for these effects. Your original clip stays as it is.</div>
      <div className="osearch">
        <input placeholder="Big text behind you, e.g. GOA" value={text} onChange={(e) => setText(e.target.value)} maxLength={24} />
      </div>
      <div className="chips">
        {BEHIND_STYLES.map((s) => (
          <button key={s.id} className={'chip' + (style === s.id ? ' on' : '')} onClick={() => setStyle(s.id)}>{s.name}</button>
        ))}
      </div>
      <button className="btn full" disabled={!!busy || !text.trim()} onClick={() => run(() => textBehind(c.id, text, style, (m) => setBusy(m), sig.current))}>🅰️ Put text behind me</button>
      <div className="row2" style={{ marginTop: 6 }}>
        <span>Glow colour</span>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
      <div className="chips">
        <button className="chip" disabled={!!busy} onClick={() => fx('glow')}>✨ Glow outline</button>
        <button className="chip" disabled={!!busy || c.kind !== 'video'} onClick={() => fx('echo')}>👻 Echo trail</button>
        <button className="chip" disabled={!!busy || c.kind !== 'video'} onClick={() => fx('clones')}>👯 2 of me</button>
        <button className="chip" disabled={!!busy || c.kind !== 'video'} onClick={() => fx('clones3')}>👯‍♂️ 3 of me</button>
      </div>
      {busy && (
        <>
          <div className="hint">{busy}</div>
          <button className="btn sm" onClick={() => (sig.current.cancelled = true)}>Cancel</button>
        </>
      )}
    </Section>
  )
}

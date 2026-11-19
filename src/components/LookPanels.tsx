import { useEffect, useRef, useState } from 'react'
import { addAsset, checkpoint, getAsset, getState, patchClip, setUi, updateClip } from '../store'
import { Clip } from '../types'
import { CARTOON_LIST, SKY_LIST } from '../looks2'
import { StudioOpts, studioVoice } from '../studio'
import { inpaint } from '../inpaint'
import { engine } from '../engine'
import { Section, Slider } from './Fields'

const toast = (m: string) => setUi({ toast: m })

export function StudioSection({ c }: { c: Clip }) {
  const [tone, setTone] = useState<StudioOpts['tone']>('natural')
  const [noise, setNoise] = useState(1)
  const [busy, setBusy] = useState('')
  if ((c.kind !== 'video' && c.kind !== 'audio') || c.studioOf) return null
  return (
    <Section title="🎙 Studio voice">
      <div className="hint">Makes a phone recording sound like a studio mic: AI removes fan, traffic and room noise, then the voice is cleaned up and evened out. Works offline.</div>
      <div className="chips">
        {([['natural', 'Natural'], ['warm', 'Warm'], ['bright', 'Bright'], ['podcast', 'Podcast']] as const).map(([id, n]) => (
          <button key={id} className={'chip' + (tone === id ? ' on' : '')} onClick={() => setTone(id)}>{n}</button>
        ))}
      </div>
      <Slider label="Noise removal" value={noise} min={0.3} max={1} step={0.05} onChange={setNoise} fmt={(v) => Math.round(v * 100) + '%'} />
      <button
        className="btn full"
        disabled={!!busy}
        onClick={async () => {
          setBusy('Starting…')
          try {
            toast(await studioVoice(c.id, { tone, noise }, (m) => setBusy(m)))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || '🎙 Make it studio quality'}
      </button>
    </Section>
  )
}

export function CartoonSection({ c }: { c: Clip }) {
  if (c.kind !== 'video' && c.kind !== 'image') return null
  const k = c.cartoon
  return (
    <Section title="Cartoon look" right={k ? <button className="lnk" onClick={() => updateClip(c.id, { cartoon: undefined })}>Remove</button> : undefined}>
      <div className="chips">
        {CARTOON_LIST.map((s) => (
          <button key={s.id} title={s.hint} className={'chip' + (k?.style === s.id ? ' on' : '')} onClick={() => updateClip(c.id, { cartoon: k?.style === s.id ? undefined : { style: s.id, amt: k?.amt ?? 0.6 } })}>{s.name}</button>
        ))}
      </div>
      {k && <Slider label="Strength" value={k.amt} min={0.1} max={1} onChange={(v) => patchClip(c.id, { cartoon: { ...k, amt: v } })} fmt={(v) => Math.round(v * 100) + '%'} />}
    </Section>
  )
}

export function SkySection({ c }: { c: Clip }) {
  if (c.kind !== 'video' && c.kind !== 'image') return null
  const s = c.sky
  return (
    <Section title="Sky replacement" right={s ? <button className="lnk" onClick={() => updateClip(c.id, { sky: undefined })}>Remove</button> : undefined}>
      <div className="hint">Finds the sky (bright, smooth, at the top) and swaps it. Works best on outdoor shots with a clear skyline.</div>
      <div className="chips">
        {SKY_LIST.map((x) => (
          <button key={x.id} className={'chip' + (s?.id === x.id ? ' on' : '')} onClick={() => updateClip(c.id, { sky: s?.id === x.id ? undefined : { id: x.id, amt: s?.amt ?? 0.9 } })}>{x.name}</button>
        ))}
      </div>
      {s && <Slider label="Strength" value={s.amt} min={0.1} max={1} onChange={(v) => patchClip(c.id, { sky: { ...s, amt: v } })} fmt={(v) => Math.round(v * 100) + '%'} />}
    </Section>
  )
}

/* ---------- object eraser (photos) ---------- */

export function EraserSection({ c }: { c: Clip }) {
  const [open, setOpen] = useState(false)
  const a = getAsset(c.assetId)
  if (c.kind !== 'image' || !a || a.animated) return null
  return (
    <Section title="🧽 Remove objects">
      <div className="hint">Brush over a stranger, a wire, a logo or a spot – it’s filled in with what’s around it.</div>
      <button className="btn full" onClick={() => setOpen(true)}>🧽 Open eraser</button>
      {open && <EraserDialog clip={c} onClose={() => setOpen(false)} />}
    </Section>
  )
}

function EraserDialog({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const a = getAsset(clip.assetId)!
  const view = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const mask = useRef<Uint8Array>(new Uint8Array(0))
  const [brush, setBrush] = useState(0.04)
  const [busy, setBusy] = useState('')
  const [changed, setChanged] = useState(false)
  const [ready, setReady] = useState(false)
  const drawing = useRef(false)
  const history = useRef<ImageData[]>([])

  const redraw = () => {
    const v = view.current
    if (!v) return
    const g = v.getContext('2d')!
    g.drawImage(img.current, 0, 0, v.width, v.height)
    // red overlay where the brush went
    const W = img.current.width
    const H = img.current.height
    const ov = g.createImageData(v.width, v.height)
    for (let y = 0; y < v.height; y++)
      for (let x = 0; x < v.width; x++) {
        const sx = Math.floor((x / v.width) * W)
        const sy = Math.floor((y / v.height) * H)
        if (mask.current[sy * W + sx]) {
          const i = (y * v.width + x) * 4
          ov.data[i] = 255
          ov.data[i + 1] = 40
          ov.data[i + 2] = 80
          ov.data[i + 3] = 140
        }
      }
    const t = document.createElement('canvas')
    t.width = v.width
    t.height = v.height
    t.getContext('2d')!.putImageData(ov, 0, 0)
    g.drawImage(t, 0, 0)
  }

  useEffect(() => {
    const im = new Image()
    im.src = a.url
    im.decode().then(() => {
      const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight))
      const c = img.current
      c.width = Math.round(im.naturalWidth * k)
      c.height = Math.round(im.naturalHeight * k)
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
      mask.current = new Uint8Array(c.width * c.height)
      const v = view.current!
      const vk = Math.min(560 / c.width, 460 / c.height, 1)
      v.width = Math.round(c.width * vk)
      v.height = Math.round(c.height * vk)
      setReady(true)
      redraw()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paint = (e: React.PointerEvent) => {
    const v = view.current!
    const r = v.getBoundingClientRect()
    const W = img.current.width
    const H = img.current.height
    const cx = ((e.clientX - r.left) / r.width) * W
    const cy = ((e.clientY - r.top) / r.height) * H
    const rad = brush * Math.max(W, H)
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(H, cy + rad); y++)
      for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(W, cx + rad); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) mask.current[y * W + x] = 1
    redraw()
  }

  const erase = async () => {
    const c = img.current
    const g = c.getContext('2d', { willReadFrequently: true })!
    const d = g.getImageData(0, 0, c.width, c.height)
    history.current.push(new ImageData(new Uint8ClampedArray(d.data), d.width, d.height))
    setBusy('Filling in…')
    try {
      await inpaint(d.data, c.width, c.height, mask.current, (p) => setBusy(`Filling in… ${Math.round(p * 100)}%`))
      g.putImageData(d, 0, 0)
      mask.current.fill(0)
      setChanged(true)
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
    redraw()
  }

  const save = async () => {
    setBusy('Saving…')
    const png = /png$/i.test(a.name)
    const blob: Blob = await new Promise((r) => img.current.toBlob((b) => r(b!), png ? 'image/png' : 'image/jpeg', 0.94))
    const na = await engine.importFile(new File([blob], `${a.name.replace(/\.[^.]+$/, '')} (cleaned).${png ? 'png' : 'jpg'}`, { type: blob.type }))
    if (na) {
      addAsset(na)
      checkpoint()
      for (const x of getState().project.clips.filter((x) => x.assetId === a.id)) patchClip(x.id, { assetId: na.id, label: na.name })
      toast('Photo cleaned and swapped in (Undo to go back).')
      engine.requestRender()
    }
    setBusy('')
    onClose()
  }

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal eraser">
        <h3>🧽 Remove objects</h3>
        <div className="hint">Paint over what you want gone (cover it fully, a little extra is fine), then press Erase. Repeat for more.</div>
        <canvas
          ref={view}
          className="erase-cv"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={(e) => {
            if (busy || !ready) return
            drawing.current = true
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            paint(e)
          }}
          onPointerMove={(e) => drawing.current && paint(e)}
          onPointerUp={() => (drawing.current = false)}
        />
        <Slider label="Brush" value={brush} min={0.01} max={0.12} step={0.005} onChange={setBrush} fmt={(v) => Math.round(v * 100) + ''} />
        {busy && <div className="hint">{busy}</div>}
        <div className="row2" style={{ justifyContent: 'flex-end', gap: 8, display: 'flex', flexWrap: 'wrap' }}>
          <button className="btn" disabled={!!busy} onClick={() => { mask.current.fill(0); redraw() }}>Clear brush</button>
          <button className="btn" disabled={!!busy || !history.current.length} onClick={() => { const h = history.current.pop(); if (h) img.current.getContext('2d')!.putImageData(h, 0, 0); setChanged(history.current.length > 0); redraw() }}>↶ Undo erase</button>
          <button className="btn primary" disabled={!!busy || !ready} onClick={erase}>🧽 Erase</button>
          <button className="btn primary" disabled={!!busy || !changed} onClick={save}>✓ Use photo</button>
          <button className="btn" disabled={!!busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

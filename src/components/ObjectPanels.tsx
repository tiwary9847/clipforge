import { useEffect, useRef, useState } from 'react'
import { addAsset, baseClip, checkpoint, getAsset, getState, insertSilent, patchClip, setUi, updateClip } from '../store'
import { Clip } from '../types'
import { objectMask } from '../pro'
import { inpaint } from '../inpaint'
import { hasDepth, measureDepth } from '../depth3d'
import { engine } from '../engine'
import { Section, Slider } from './Fields'

const toast = (m: string) => setUi({ toast: m })

/* ---------- 3D photo zoom ---------- */

export function Depth3DSection({ c }: { c: Clip }) {
  const [busy, setBusy] = useState('')
  const a = getAsset(c.assetId)
  if (c.kind !== 'image' || !a || a.animated) return null
  const d = c.depth3d
  const dirs: [NonNullable<Clip['depth3d']>['dir'], string][] = [['in', '🔍 Zoom in'], ['out', '🔭 Zoom out'], ['left', '⬅️ Slide left'], ['right', '➡️ Slide right'], ['orbit', '🔄 Orbit']]
  return (
    <Section title="3D photo zoom" right={d ? <button className="lnk" onClick={() => updateClip(c.id, { depth3d: undefined })}>Remove</button> : undefined}>
      <div className="hint">Turns the photo into a moving 3D shot: AI measures what’s near and far, so the person stays crisp while the background moves differently. First use downloads a ~25 MB depth model.</div>
      <div className="chips">
        {dirs.map(([id, n]) => (
          <button
            key={id}
            className={'chip' + (d?.dir === id ? ' on' : '')}
            disabled={!!busy}
            onClick={async () => {
              if (!hasDepth(c.assetId)) {
                setBusy('Measuring depth…')
                try {
                  await measureDepth(c.assetId!, setBusy)
                } catch (e) {
                  toast((e as Error).message)
                  setBusy('')
                  return
                }
                setBusy('')
              }
              updateClip(c.id, { depth3d: { dir: id, amt: d?.amt ?? 0.8 } })
              engine.requestRender()
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {busy && <div className="hint">{busy}</div>}
      {d && <Slider label="Strength" value={d.amt} min={0.2} max={1.5} onChange={(v) => patchClip(c.id, { depth3d: { ...d, amt: v } })} fmt={(v) => Math.round(v * 100) + '%'} />}
    </Section>
  )
}

/* ---------- tap to cut out anything ---------- */

export function ObjectCutSection({ c }: { c: Clip }) {
  const [open, setOpen] = useState(false)
  if (c.kind !== 'image' && c.kind !== 'video') return null
  return (
    <Section title="✂️ Tap to cut out anything">
      <div className="hint">Tap any object – a bike, a dog, a dish, a person – to cut it out as a sticker, blur it, erase it or remove everything else. {c.kind === 'video' ? 'On a video: tap it on the frame under the playhead, then blur, pixelate or cut it out through the whole clip.' : ''}</div>
      <button className="btn full" onClick={() => setOpen(true)}>✂️ Open cut-out</button>
      {open && <CutDialog clip={c} onClose={() => setOpen(false)} />}
    </Section>
  )
}

function CutDialog({ clip, onClose }: { clip: Clip; onClose: () => void }) {
  const view = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const mask = useRef<Uint8Array | null>(null)
  const [pts, setPts] = useState<{ x: number; y: number; l: number }[]>([])
  const [mode, setMode] = useState(1)
  const [busy, setBusy] = useState('')
  const [ready, setReady] = useState(false)
  const srcScale = useRef(1) // working image px → source px
  const sig = useRef({ cancelled: false })
  const name = (getAsset(clip.assetId)?.name ?? 'frame').replace(/\.[^.]+$/, '')

  const redraw = () => {
    const v = view.current
    if (!v) return
    const g = v.getContext('2d')!
    g.drawImage(img.current, 0, 0, v.width, v.height)
    const m = mask.current
    if (m) {
      const W = img.current.width
      const H = img.current.height
      const ov = g.createImageData(v.width, v.height)
      for (let y = 0; y < v.height; y++)
        for (let x = 0; x < v.width; x++) {
          if (!m[Math.floor((y / v.height) * H) * W + Math.floor((x / v.width) * W)]) continue
          const i = (y * v.width + x) * 4
          ov.data[i] = 40
          ov.data[i + 1] = 140
          ov.data[i + 2] = 255
          ov.data[i + 3] = 120
        }
      const t = document.createElement('canvas')
      t.width = v.width
      t.height = v.height
      t.getContext('2d')!.putImageData(ov, 0, 0)
      g.drawImage(t, 0, 0)
    }
    for (const p of pts) {
      g.fillStyle = p.l ? '#22c55e' : '#ef4444'
      g.strokeStyle = '#fff'
      g.lineWidth = 2
      g.beginPath()
      g.arc((p.x / img.current.width) * v.width, (p.y / img.current.height) * v.height, 7, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
  }

  useEffect(() => {
    ;(async () => {
      const a = getAsset(clip.assetId)
      let source: CanvasImageSource & { width: number; height: number }
      if (clip.kind === 'image' && a) {
        const im = new Image()
        im.src = a.url
        await im.decode()
        source = im as any
      } else {
        // the video frame under the playhead (the picture of this clip only)
        const v = document.createElement('video')
        v.src = a!.url
        v.muted = true
        await new Promise((r) => (v.onloadeddata = r))
        const t = Math.min(a!.duration - 0.05, Math.max(0, clip.srcIn + (engine.time - clip.start) * clip.speed))
        v.currentTime = t
        await new Promise((r) => (v.onseeked = r))
        const c2 = document.createElement('canvas')
        c2.width = v.videoWidth
        c2.height = v.videoHeight
        c2.getContext('2d')!.drawImage(v, 0, 0)
        source = c2
      }
      const W0 = (source as any).naturalWidth || source.width
      const H0 = (source as any).naturalHeight || source.height
      const k = Math.min(1, 1024 / Math.max(W0, H0))
      srcScale.current = 1 / k
      const c = img.current
      c.width = Math.round(W0 * k)
      c.height = Math.round(H0 * k)
      c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height)
      const v = view.current!
      const vk = Math.min(560 / c.width, 440 / c.height, 1)
      v.width = Math.round(c.width * vk)
      v.height = Math.round(c.height * vk)
      setReady(true)
    })()
  }, [])
  useEffect(redraw)

  const tap = async (e: React.MouseEvent) => {
    if (busy || !ready) return
    const v = view.current!
    const r = v.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * img.current.width
    const y = ((e.clientY - r.top) / r.height) * img.current.height
    const next = [...pts, { x, y, l: mode }]
    setPts(next)
    setBusy('Finding the object (first time downloads a ~15 MB model)…')
    try {
      const c = img.current
      const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data
      mask.current = await objectMask(d, c.width, c.height, next.map((p) => [p.x, p.y]), next.map((p) => p.l), setBusy)
    } catch (e2) {
      toast((e2 as Error).message)
    }
    setBusy('')
  }

  /** Box of the selection in source pixels. */
  const box = () => {
    const m = mask.current!
    const W = img.current.width
    let x0 = W
    let y0 = 1e9
    let x1 = 0
    let y1 = 0
    for (let i = 0; i < m.length; i++)
      if (m[i]) {
        const x = i % W
        const y = (i / W) | 0
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    const k = srcScale.current
    return { x0: x0 * k, y0: y0 * k, x1: x1 * k, y1: y1 * k }
  }
  const wholeClip = async (kind: 'blur' | 'pixelate' | 'cut') => {
    if (!mask.current) return
    sig.current = { cancelled: false }
    setBusy('Following it through the clip…')
    try {
      const v = await import('../videoobj')
      toast(kind === 'cut' ? await v.cutObjectInVideo(clip.id, box(), (m) => setBusy(m), sig.current) : await v.hideObjectInVideo(clip.id, box(), kind, (p) => setBusy(`Following it… ${Math.round(p * 100)}%`)))
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }

  const result = async (kind: 'sticker' | 'blur' | 'erase' | 'keep') => {
    const m = mask.current
    if (!m) return
    setBusy('Working…')
    const c = img.current
    const W = c.width
    const H = c.height
    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const og = out.getContext('2d', { willReadFrequently: true })!
    const mc = document.createElement('canvas')
    mc.width = W
    mc.height = H
    const mg = mc.getContext('2d')!
    const md = mg.createImageData(W, H)
    for (let i = 0; i < m.length; i++) md.data[i * 4 + 3] = m[i] ? 255 : 0
    mg.putImageData(md, 0, 0)
    if (kind === 'sticker' || kind === 'keep') {
      og.drawImage(c, 0, 0)
      og.globalCompositeOperation = 'destination-in'
      og.filter = 'blur(0.8px)'
      og.drawImage(mc, 0, 0)
    } else if (kind === 'blur') {
      og.drawImage(c, 0, 0)
      const b = document.createElement('canvas')
      b.width = W
      b.height = H
      const bg = b.getContext('2d')!
      bg.filter = `blur(${Math.round(W / 40)}px)`
      bg.drawImage(c, 0, 0)
      bg.filter = 'none'
      bg.globalCompositeOperation = 'destination-in'
      bg.filter = 'blur(2px)'
      bg.drawImage(mc, 0, 0)
      og.drawImage(b, 0, 0)
    } else {
      og.drawImage(c, 0, 0)
      const id = og.getImageData(0, 0, W, H)
      const grow = new Uint8Array(m.length)
      const R = Math.max(2, Math.round(W / 150))
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (m[y * W + x])
            for (let dy = -R; dy <= R; dy++)
              for (let dx = -R; dx <= R; dx++) {
                const xx = x + dx
                const yy = y + dy
                if (xx >= 0 && yy >= 0 && xx < W && yy < H) grow[yy * W + xx] = 1
              }
      await inpaint(id.data, W, H, grow, (p) => setBusy(`Filling in… ${Math.round(p * 100)}%`))
      og.putImageData(id, 0, 0)
    }
    const transparent = kind === 'sticker' || kind === 'keep'
    const blob: Blob = await new Promise((r) => out.toBlob((b) => r(b!), transparent ? 'image/png' : 'image/jpeg', 0.93))
    const label = { sticker: 'cut-out', blur: 'blurred', erase: 'erased', keep: 'no background' }[kind]
    const na = await engine.importFile(new File([blob], `${name} (${label}).${transparent ? 'png' : 'jpg'}`, { type: blob.type }))
    setBusy('')
    if (!na) return toast('Could not load the result.')
    addAsset(na)
    checkpoint()
    if (kind === 'sticker') {
      const st = getState()
      const t = engine.time
      const track = ['v2', 'v3', 'v4'].find((tr) => !st.project.clips.some((x) => x.track === tr && x.start < t + 3 && x.start + x.dur > t)) ?? 'v4'
      insertSilent([baseClip('image', track, { assetId: na.id, label: na.name, start: t, dur: 3, fit: 'contain', scale: 0.6 } as Partial<Clip>)])
      toast('Cut-out added as a sticker on top – move and resize it in the preview.')
    } else if (clip.kind === 'image') {
      patchClip(clip.id, { assetId: na.id, label: na.name })
      toast(kind === 'keep' ? 'Background removed.' : kind === 'blur' ? 'Object blurred.' : 'Object erased.')
    } else {
      // for a video we made a still: put it in the media list
      toast(`Saved “${na.name}” to your media.`)
    }
    engine.requestRender()
    onClose()
  }

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal eraser">
        <h3>✂️ Tap to cut out anything</h3>
        <div className="chips">
          <button className={'chip' + (mode === 1 ? ' on' : '')} onClick={() => setMode(1)}>🟢 Tap what you want</button>
          <button className={'chip' + (mode === 0 ? ' on' : '')} onClick={() => setMode(0)}>🔴 Tap what to leave out</button>
          <button className="chip" disabled={!pts.length || !!busy} onClick={() => { setPts([]); mask.current = null; redraw() }}>Clear</button>
        </div>
        <canvas ref={view} className="erase-cv" style={{ cursor: 'crosshair' }} onClick={tap} />
        <div className="hint">{busy || (mask.current ? 'Blue = selected. Tap more to add or leave out parts.' : 'Tap the object.')}</div>
        <div className="chips">
          <button className={'btn sm' + (clip.kind === 'image' ? ' primary' : '')} disabled={!mask.current || !!busy} onClick={() => result('sticker')}>🏷 Cut out as sticker</button>
          <button className="btn sm" disabled={!mask.current || !!busy} onClick={() => result('blur')}>🌫 Blur it</button>
          <button className="btn sm" disabled={!mask.current || !!busy} onClick={() => result('erase')}>🧽 Erase it</button>
          {clip.kind === 'image' && <button className="btn sm" disabled={!mask.current || !!busy} onClick={() => result('keep')}>🖼 Keep only it</button>}
        </div>
        {clip.kind === 'video' && (
          <>
            <div className="hint">Through the whole video clip (follows it as it moves):</div>
            <div className="chips">
              <button className="btn sm primary" disabled={!mask.current || !!busy} onClick={() => wholeClip('blur')}>🎬🌫 Blur it in the whole clip</button>
              <button className="btn sm" disabled={!mask.current || !!busy} onClick={() => wholeClip('pixelate')}>🎬▦ Pixelate it</button>
              <button className="btn sm" disabled={!mask.current || !!busy} onClick={() => wholeClip('cut')}>🎬✂️ Cut it out (slow)</button>
              {busy && <button className="btn sm" onClick={() => (sig.current.cancelled = true)}>Cancel</button>}
            </div>
          </>
        )}
        <div className="chips">
          <button className="btn sm" disabled={!!busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

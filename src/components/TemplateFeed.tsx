import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { VIDEO_TEMPLATES, applyVideoTemplate } from '../creative'
import { PACK_TEMPLATES, TEMPLATES, TEMPLATE_PACKS, applyTemplate } from '../templates'
import { getState, setUi } from '../store'
import { engine } from '../engine'
import { requirePro, usePro } from '../plan'
import { importFiles } from './MediaPanel'
import { addToMain } from './BatchTrim'
import { useT } from '../i18n'

const BASE = import.meta.env.BASE_URL + 'tpl/'
export type Item = { id: string; name: string; desc: string; kind: 'video' | 'layout'; pro?: string; slots?: number; secs?: number; photos?: boolean }
const vt = (g: string): Item[] =>
  VIDEO_TEMPLATES.filter((t) => t.group === g).map((t) => ({
    id: t.id, name: t.name, desc: t.desc, kind: 'video' as const, slots: t.slots.length, photos: t.photos,
    secs: Math.round((t.slots.reduce((s, x) => s + x.beats, 0) * 60) / t.bpm),
  }))
const ROWS: { title: string; sub: string; items: Item[] }[] = [
  { title: '🔥 Trending edits', sub: 'Pick clips – cut on the beat for you', items: vt('trending') },
  { title: '📸 Photos & memories', sub: 'Works with photos too', items: vt('photos') },
  { title: '🎉 Occasions', sub: 'Birthdays, weddings, festivals', items: vt('occasions') },
  ...TEMPLATE_PACKS.map((p) => ({
    title: `${p.emoji} ${p.name}`,
    sub: 'Titles, greetings & endings',
    items: PACK_TEMPLATES.filter((t) => t.pack === p.id).map((t) => ({ id: t.id, name: t.name, desc: t.desc, kind: 'layout' as const, pro: p.name })),
  })),
  { title: '🧩 Text layouts', sub: 'Hooks, memes, countdowns – over your video', items: TEMPLATES.map((t) => ({ id: t.id, name: t.name, desc: t.desc, kind: 'layout' as const })) },
]
const ALL = ROWS.flatMap((r) => r.items)
const toast = (m: string) => setUi({ toast: m })
const hasVisual = () => getState().project.clips.some((c) => c.track === 'v1' && (c.kind === 'video' || c.kind === 'image'))

/** Plays its moving preview only while on screen (saves battery and data). */
function Preview({ it, big }: { it: Item; big?: boolean }) {
  const v = useRef<HTMLVideoElement>(null)
  const [vid, setVid] = useState(!!big)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (big || it.kind !== 'video' || !box.current || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVid(e.isIntersecting && e.intersectionRatio > 0.6), { threshold: [0, 0.6, 1] })
    io.observe(box.current)
    return () => io.disconnect()
  }, [it, big])
  useEffect(() => {
    if (vid && v.current) void v.current.play().catch(() => {})
  }, [vid])
  return (
    <div ref={box} className="tf-media">
      <img src={BASE + it.id + '.webp'} alt="" loading="lazy" width={135} height={240} />
      {it.kind === 'video' && vid && (
        <video ref={v} src={BASE + it.id + '.mp4'} muted={!big} loop playsInline autoPlay preload="auto" onError={() => setVid(false)} />
      )}
    </div>
  )
}

/** Rows of template cards. Tap a card → full-screen preview → Use template → pick clips → done. */
export function TemplateFeed({ onPick }: { onPick?: () => void }) {
  const t = useT()
  const pro = usePro()
  const file = useRef<HTMLInputElement>(null)
  const want = useRef<Item | null>(null)
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<Item | null>(null)
  const run = async (it: Item, files: File[]) => {
    setBusy(it.id)
    setOpen(null)
    try {
      if (it.kind === 'video') {
        const before = new Set(getState().assets.map((a) => a.id))
        await importFiles(files, toast)
        const ids = getState().assets.filter((a) => !before.has(a.id) && (a.kind === 'video' || a.kind === 'image')).map((a) => a.id)
        if (!ids.length) throw new Error('Pick videos or photos for this template.')
        onPick?.()
        const start = getState().project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, c.start + c.dur), 0)
        toast(await applyVideoTemplate(it.id, ids, undefined, (m) => toast(m)))
        // play the result straight away, like a preview
        engine.seek(start)
        setTimeout(() => engine.play(), 400)
      } else {
        if (files.length) await addToMain(files)
        onPick?.()
        toast(applyTemplate(it.id))
      }
      setTimeout(() => engine.render(), 60)
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const use = (it: Item) => {
    if (it.pro && !requirePro(`The ${it.pro} template pack is part of ViralKaro Pro.`)) return
    // text layouts go over the video you already have; everything else asks for clips
    if (it.kind === 'layout' && hasVisual()) return void run(it, [])
    want.current = it
    file.current?.click()
  }
  return (
    <div className="tf">
      <input ref={file} type="file" hidden multiple accept="video/*,image/*" onChange={(e) => {
        const f = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (f.length && want.current) void run(want.current, f)
      }} />
      {ROWS.map((r) => (
        <section key={r.title} className="tf-row">
          <div className="tf-h"><b>{t(r.title)}</b><small>{t(r.sub)}</small></div>
          <div className="tf-scroll">
            {r.items.map((it) => (
              <div key={it.id} className="tf-card">
                <button className="tf-pic" onClick={() => (it.kind === 'video' ? setOpen(it) : use(it))} aria-label={`Preview ${it.name}`} disabled={!!busy}>
                  <Preview it={it} />
                  {it.slots && <span className="tf-tag">{it.secs}s · {it.slots} {t('cuts')}</span>}
                  {it.pro && !pro && <span className="tf-pro">PRO</span>}
                  {busy === it.id && <span className="tf-busy">…</span>}
                </button>
                <div className="tf-foot">
                  <span>{it.name}</span>
                  <button className="tf-use" onClick={() => use(it)} disabled={!!busy}>{t('Use')}</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {open && <Viewer it={open} onClose={() => setOpen(null)} onUse={use} onMove={setOpen} />}
    </div>
  )
}

/** Full-screen template preview, like CapCut: the video plays big; swipe or use the arrows for the next one. */
function Viewer({ it, onClose, onUse, onMove }: { it: Item; onClose: () => void; onUse: (it: Item) => void; onMove: (it: Item) => void }) {
  const t = useT()
  const list = ALL.filter((x) => x.kind === 'video')
  const i = list.findIndex((x) => x.id === it.id)
  const go = (d: number) => onMove(list[(i + d + list.length) % list.length])
  const y0 = useRef<number | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  return createPortal(
    <div className="tv" role="dialog" aria-label={it.name}>
      <div className="tv-stage" key={it.id}
        onPointerDown={(e) => (y0.current = e.clientY)}
        onPointerUp={(e) => { if (y0.current !== null && Math.abs(e.clientY - y0.current) > 60) go(e.clientY < y0.current ? 1 : -1); y0.current = null }}>
        <Preview it={it} big />
      </div>
      <button className="tv-x" onClick={onClose} aria-label="Close">✕</button>
      <div className="tv-navs">
        <button onClick={() => go(-1)} aria-label="Previous template">▲</button>
        <span>{i + 1}/{list.length}</span>
        <button onClick={() => go(1)} aria-label="Next template">▼</button>
      </div>
      <div className="tv-info">
        <b>{it.name}</b>
        <small>{it.desc}</small>
        <small className="tv-meta">{it.secs}s · {it.slots} {t('cuts')} · {t(it.photos ? 'photos or videos' : 'videos or photos')} · {t('built-in beat or your song')}</small>
        <button className="btn primary tv-use" onClick={() => onUse(it)}>{t('Use template')}</button>
      </div>
    </div>,
    document.body,
  )
}

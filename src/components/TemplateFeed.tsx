import { useRef, useState } from 'react'
import { VIDEO_TEMPLATES, applyVideoTemplate } from '../creative'
import { PACK_TEMPLATES, TEMPLATES, TEMPLATE_PACKS, applyTemplate } from '../templates'
import { getState, setUi } from '../store'
import { engine } from '../engine'
import { requirePro, usePro } from '../plan'
import { importFiles } from './MediaPanel'
import { addToMain } from './BatchTrim'
import { useT } from '../i18n'

const BASE = import.meta.env.BASE_URL + 'tpl/'
type Item = { id: string; name: string; kind: 'video' | 'layout'; pro?: string; slots?: number }
const ROWS: { title: string; sub: string; items: Item[] }[] = [
  { title: '🔥 Fill with your clips', sub: 'Pick clips – they’re cut on the beat', items: VIDEO_TEMPLATES.map((t) => ({ id: t.id, name: t.name, kind: 'video' as const, slots: t.slots.length })) },
  ...TEMPLATE_PACKS.map((p) => ({
    title: `${p.emoji} ${p.name}`,
    sub: 'Titles, greetings & endings',
    items: PACK_TEMPLATES.filter((t) => t.pack === p.id).map((t) => ({ id: t.id, name: t.name, kind: 'layout' as const, pro: p.name })),
  })),
  { title: '🧩 Text layouts', sub: 'Hooks, memes, countdowns – over your video', items: TEMPLATES.map((t) => ({ id: t.id, name: t.name, kind: 'layout' as const })) },
]
const toast = (m: string) => setUi({ toast: m })
const hasVisual = () => getState().project.clips.some((c) => c.track === 'v1' && (c.kind === 'video' || c.kind === 'image'))

/** Scrollable rows of template cards with picture previews. Tap Use → pick clips → done. */
export function TemplateFeed({ onPick }: { onPick?: () => void }) {
  const t = useT()
  const pro = usePro()
  const file = useRef<HTMLInputElement>(null)
  const want = useRef<Item | null>(null)
  const [busy, setBusy] = useState('')
  const run = async (it: Item, files: File[]) => {
    setBusy(it.id)
    try {
      if (it.kind === 'video') {
        const before = new Set(getState().assets.map((a) => a.id))
        await importFiles(files, toast)
        const ids = getState().assets.filter((a) => !before.has(a.id) && (a.kind === 'video' || a.kind === 'image')).map((a) => a.id)
        if (!ids.length) throw new Error('Pick videos or photos for this template.')
        onPick?.()
        toast(await applyVideoTemplate(it.id, ids, undefined, (m) => toast(m)))
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
                <button className="tf-pic" onClick={() => use(it)} aria-label={`Use ${it.name}`} disabled={!!busy}>
                  <img src={BASE + it.id + '.webp'} alt="" loading="lazy" width={135} height={240} />
                  {it.slots && <span className="tf-tag">{it.slots} clips</span>}
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
    </div>
  )
}

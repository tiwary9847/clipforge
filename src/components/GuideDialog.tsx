import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { startTour } from './Tour'

// Where the app is hosted – used for pictures and the PDF when ViralKaro is opened as a single file.
const ONLINE = import.meta.env.VITE_SITE_URL as string
const fromFile = () => location.protocol === 'file:'
const PDF = () => (fromFile() ? ONLINE : '') + 'ViralKaro-User-Guide.pdf'

interface Sec {
  id: string
  title: string
  part: string
  partId: string
  text: string
}

/** Opens the guide, optionally at the section about `topic` (e.g. a tool name). */
export function openGuide(topic?: string) {
  window.dispatchEvent(new CustomEvent('cf:guide', { detail: topic ?? '' }))
}

let guideText: string | null = null
const clean = (s: string) => s.replace(/[^\p{L}\p{N}\s→&-]/gu, ' ').replace(/\s+/g, ' ').trim()

export function GuideDialog({ topic, onClose }: { topic: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [secs, setSecs] = useState<Sec[]>([])
  const [parts, setParts] = useState<{ id: string; title: string }[]>([])
  const [cur, setCur] = useState('')
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState(false) // phone: chapter list open
  // the guide text (≈70 KB) loads only when the guide is opened
  const [body, setBody] = useState<string | null>(guideText)
  useEffect(() => {
    if (!body)
      void import('../guide/guide-body.html?raw').then((m) => {
        guideText = m.default
        setBody(m.default)
      })
  }, [])

  // number the headings and collect sections once the guide is in the page
  useEffect(() => {
    const el = box.current
    if (!el || !body) return
    const ss: Sec[] = []
    const ps: { id: string; title: string }[] = []
    let part = ''
    let partId = ''
    el.querySelectorAll('h1.part, h2').forEach((h, i) => {
      const title = clean(h.textContent ?? '')
      if (h.tagName === 'H1') {
        partId = `g-p${i}`
        h.id = partId
        const n = h.querySelector('.n')?.textContent ?? ''
        const name = (h.textContent ?? '').slice(n.length).trim()
        part = n ? `${n} · ${name}` : name
        ps.push({ id: partId, title: part })
        return
      }
      h.id = `g-s${i}`
      // the section's text: everything up to the next heading
      let t = ''
      for (let n = h.nextElementSibling; n && !/^H[12]$/.test(n.tagName); n = n.nextElementSibling) t += ' ' + (n.textContent ?? '')
      ss.push({ id: h.id, title: (h.textContent ?? '').trim(), part, partId, text: t.replace(/\s+/g, ' ') })
    })
    setSecs(ss)
    setParts(ps)
    // pictures: from this site, else from the online copy, else hide them
    el.querySelectorAll('img').forEach((img) => {
      const name = img.getAttribute('src') ?? ''
      if (fromFile()) img.src = ONLINE + name
      img.onerror = () => {
        if (!img.src.startsWith(ONLINE)) img.src = ONLINE + name
        else (img.closest('figure') ?? img).setAttribute('hidden', '')
      }
    })
    // links open in a new tab
    el.querySelectorAll('a[href^="http"]').forEach((a) => a.setAttribute('target', '_blank'))
  }, [body])

  // jump to a topic (from a tool's 📖 button): a heading first, else the bold name inside a section
  useEffect(() => {
    if (!secs.length || !topic || !box.current) return
    const alias: Record<string, string> = { 'thumbnail & teleprompter': 'thumbnail maker', 'all formats at once': 'all formats', 'ai voice': 'ai voice-over', 'long video → shorts': 'long video → shorts' }
    const t = clean(alias[topic.toLowerCase()] ?? topic).toLowerCase()
    const norm = (e: Element) => clean(e.textContent ?? '').toLowerCase()
    let hit: Element | undefined
    for (const sel of ['h2', 'h3', 'td:first-child', 'b']) {
      const els = [...box.current.querySelectorAll(sel)]
      hit = els.find((e) => norm(e).startsWith(t)) ?? els.find((e) => norm(e).includes(t))
      if (hit) break
    }
    if (!hit) return setQ(topic)
    const block = hit.tagName === 'B' ? (hit.closest('li, p, tr, .tip, .note, .recipe, td') ?? hit) : hit
    if (!block.id) block.id = 'g-t' + Math.random().toString(36).slice(2, 8)
    go(block.id, false)
    // pictures above may still be settling – land again once they have
    const again = setTimeout(() => go(block.id, false, false), 450)
    return () => clearTimeout(again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, topic])

  // which section is on screen
  useEffect(() => {
    const el = box.current
    if (!el || !secs.length) return
    const on = () => {
      const top = el.getBoundingClientRect().top + 90
      let id = secs[0].id
      for (const s of secs) {
        const h = document.getElementById(s.id)
        if (h && h.getBoundingClientRect().top <= top) id = s.id
      }
      setCur(id)
    }
    el.addEventListener('scroll', on, { passive: true })
    on()
    return () => el.removeEventListener('scroll', on)
  }, [secs])

  // search results + highlight the words in the text
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  const results = useMemo(
    () => (words.length ? secs.filter((s) => words.every((w) => (s.title + ' ' + s.part + ' ' + s.text).toLowerCase().includes(w))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, secs],
  )
  useEffect(() => {
    const H = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
    const Hi = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    if (!H || !Hi || !box.current) return
    H.delete('guide-hit')
    if (!words.length) return
    const ranges: Range[] = []
    const walk = document.createTreeWalker(box.current, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n && ranges.length < 400; n = walk.nextNode()) {
      const s = (n.textContent ?? '').toLowerCase()
      for (const w of words) {
        let i = s.indexOf(w)
        while (i >= 0 && ranges.length < 400) {
          const r = new Range()
          r.setStart(n, i)
          r.setEnd(n, i + w.length)
          ranges.push(r)
          i = s.indexOf(w, i + w.length)
        }
      }
    }
    H.set('guide-hit', new Hi(...ranges))
    return () => void H.delete('guide-hit')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const go = (id: string, smooth = true, flash = true) => {
    const h = document.getElementById(id)
    const el = box.current
    if (!h || !el) return
    el.scrollTo({ top: el.scrollTop + h.getBoundingClientRect().top - el.getBoundingClientRect().top - 14, behavior: smooth ? 'smooth' : 'auto' })
    if (flash) {
      h.classList.remove('flash')
      void (h as HTMLElement).offsetWidth
      h.classList.add('flash')
    }
    setMenu(false)
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const curSec = secs.find((s) => s.id === cur)
  const snippet = (s: Sec) => {
    const t = s.text
    const i = t.toLowerCase().indexOf(words[0] ?? '')
    if (i < 0) return t.slice(0, 90) + '…'
    const a = Math.max(0, i - 40)
    return (a ? '…' : '') + t.slice(a, i + 70).trim() + '…'
  }

  return (
    <div className="modal-bg guide-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal cf-guide" role="dialog" aria-label="ViralKaro guide">
        <div className="gd-h">
          <button className="ico gd-menu" onClick={() => setMenu(!menu)} aria-label="Chapters" aria-expanded={menu}><Icon name="list" size={17} /></button>
          <span className="gd-logo">📖</span>
          <div className="gd-ht">
            <b>ViralKaro guide</b>
            <small>{curSec ? `${curSec.part} › ${clean(curSec.title)}` : 'Every feature, step by step'}</small>
          </div>
          <button className="btn sm hide-phone" onClick={() => { onClose(); setTimeout(startTour, 150) }}><Icon name="help" size={14} /> Quick tour</button>
          <a className="btn sm" href={PDF()} target="_blank" rel="noopener" download="ViralKaro-User-Guide.pdf" title="The same guide as a printable PDF (needs internet the first time)"><Icon name="download" size={14} /><span className="hide-phone"> PDF</span></a>
          <button className="ico" onClick={onClose} aria-label="Close guide"><Icon name="x" size={16} /></button>
        </div>
        <div className="gd-main">
          <nav className={'gd-nav' + (menu ? ' open' : '')}>
            <div className="tc-search gd-search">
              <Icon name="search" size={15} />
              <input placeholder="Search the guide…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the guide" autoFocus={!topic && innerWidth > 820} />
              {q && <button className="gd-clear" onClick={() => setQ('')} aria-label="Clear search">✕</button>}
            </div>
            {words.length > 0 ? (
              <div className="gd-res">
                <small className="muted">{results.length ? `${results.length} section${results.length > 1 ? 's' : ''}` : 'Nothing found – try another word'}</small>
                {results.map((s) => (
                  <button key={s.id} className={'gd-r' + (cur === s.id ? ' on' : '')} onClick={() => go(s.id)}>
                    <b>{s.title}</b>
                    <span>{snippet(s)}</span>
                    <small>{s.part}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="gd-toc">
                {parts.map((p) => {
                  const mine = secs.filter((s) => s.partId === p.id)
                  const here = curSec?.partId === p.id
                  return (
                    <div key={p.id} className={'gd-part' + (here ? ' here' : '')}>
                      <button className="gd-pt" onClick={() => go(p.id)}>{p.title}</button>
                      {here && (
                        <div className="gd-subs">
                          {mine.map((s) => (
                            <button key={s.id} className={cur === s.id ? 'on' : ''} onClick={() => go(s.id)}>{s.title}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </nav>
          <div className="gd-body" ref={box}>
            {body ? <article className="gd" dangerouslySetInnerHTML={{ __html: body }} /> : <div className="hint" style={{ padding: 24 }}>Opening the guide…</div>}
            <div className="gd-end">
              <a className="btn" href={PDF()} target="_blank" rel="noopener" download="ViralKaro-User-Guide.pdf"><Icon name="download" size={15} /> Download the PDF guide</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

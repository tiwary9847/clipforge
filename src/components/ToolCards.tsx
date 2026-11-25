import { Children, isValidElement, ReactElement, ReactNode, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSettings, togglePin, useSettings } from '../settings'
import { Icon } from './Icon'
import { openGuide } from './GuideDialog'
import { t as tr, toolText, useT } from '../i18n'

export type Cat = 'fix' | 'ai' | 'audio' | 'create' | 'publish'
export const CATS: { id: Cat; name: string; short: string }[] = [
  { id: 'fix', name: '⚡ Quick fixes', short: '⚡ Fixes' },
  { id: 'ai', name: '🤖 AI magic', short: '🤖 AI' },
  { id: 'audio', name: '🎵 Audio', short: '🎵 Audio' },
  { id: 'create', name: '🎨 Create', short: '🎨 Create' },
  { id: 'publish', name: '📤 Publish', short: '📤 Publish' },
]

// title prefix → id, categories, one-line description, extra search words
export const TOOL_META: [string, string, Cat[], string, string][] = [
  ['AI assistant', 'assistant', ['ai'], 'Say what you want – it edits for you', 'ai chat ask help karo bana do edit karo voice'],
  ['Retention coach', 'retention', ['ai', 'fix'], 'Where viewers swipe away – and one-tap fixes', 'retention boring drop off swipe watch time viewers'],
  ['Blur strangers', 'blur', ['ai', 'fix'], 'Blur faces of people around you, keep yours', 'privacy face blur pixelate crowd market strangers'],
  ['Ready to post', 'ready', ['fix', 'publish'], 'Score your video and fix problems in one tap', 'check score viral hook safe zone loudness'],
  ['Bad-take', 'badtakes', ['fix', 'ai'], 'Cut repeated lines, keep your last try', 'retake mistake repeat galti'],
  ['Music maker', 'music', ['audio', 'create'], 'Original background music – no copyright', 'song bgm gaana background'],
  ['Free music library', 'musiclib', ['audio'], 'Search free songs and sound effects that are safe to use', 'song bgm gaana music library copyright free royalty audio sound effects openverse'],
  ['Auto punch-in', 'zooms', ['ai'], 'Zoom on your face at key moments', 'zoom jump cut'],
  ['Auto sound effects', 'sfx', ['ai', 'audio'], 'Whoosh on cuts, pops on key words', 'sound effect whoosh'],
  ['Auto b-roll', 'broll', ['ai', 'create'], 'Stock clips that match what you say', 'stock pexels pixabay footage'],
  ['Chat story', 'chat', ['create'], 'A made-up chat that pops in message by message', 'whatsapp message text story imessage'],
  ['Reply to a comment', 'reply', ['create', 'publish'], '“Replying to @name” comment bubble', 'comment reply bubble'],
  ['Script to video', 'script', ['ai', 'create'], 'Type a script – get voice, stock clips and captions', 'faceless narration'],
  ['Travel map', 'map', ['create'], 'Animated route map between places', 'route travel location'],
  ['Auto chapters', 'chapters', ['ai', 'publish'], 'YouTube chapters from what you say', 'timestamps'],
  ['Title, description', 'titles', ['ai', 'publish'], 'Titles, description and hashtags written for you', 'seo hashtag caption'],
  ['Photo enhance', 'enhance', ['fix'], 'Sharpen, fix and upscale photos', 'upscale hd photo'],
  ['Long video', 'shorts', ['ai', 'publish'], 'Find the best moments and make Shorts', 'reels clips highlights'],
  ['Split-screen', 'layouts', ['create'], 'Two or more videos side by side', 'split screen grid collage'],
  ['Adjustment layer', 'adjust', ['create'], 'Filters and grade on everything below it', 'filter grade colour'],
  ['WhatsApp status', 'wa', ['publish'], 'Split into 30, 60 or 90-second status parts', 'status 30 60 90 seconds'],
  ['Multicam', 'multicam', ['create'], 'Switch between camera angles', 'angles camera sync'],
  ['Speakers', 'speakers', ['ai'], 'Who talks when – a caption colour per person', 'podcast people interview'],
  ['Dub into English', 'dub', ['ai', 'audio'], 'Translate Hindi and re-voice it in English', 'translate dubbing'],
  ['AI voice', 'tts', ['ai', 'audio'], 'Text-to-speech voice-over – Hindi voices with Pro', 'tts narration voiceover hindi awaaz bolo'],
  ['Loudness', 'loud', ['fix', 'audio'], 'Right volume for YouTube and Instagram', 'volume lufs normalise'],
  ['Hook lines', 'hooklines', ['ai', 'publish'], 'AI writes your opening text', 'hook intro opening'],
  ['Hook finder', 'hookfinder', ['ai'], 'Copy your best moment to the start', 'hook intro teaser'],
  ['Thumbnail', 'thumb', ['publish', 'create'], 'Thumbnail maker and teleprompter', 'thumbnail prompter script'],
  ['One-tap upload kit', 'uploadkit', ['publish', 'ai'], 'Shorts + YouTube + Reels files, each with titles, hashtags and a thumbnail', 'upload post instagram youtube reels shorts kit pro hashtags thumbnail'],
  ['Brand kit', 'brand', ['create'], 'Your logo, colours and fonts in one tap', 'logo watermark intro outro'],
  ['All formats', 'formats', ['publish'], 'Export 16:9, 9:16 and 1:1 together', 'export multiple sizes'],
  ['Version history', 'versions', ['fix'], 'Go back to an earlier version', 'history restore undo'],
  ['Backup', 'backup', ['fix'], 'Save or load the whole project as a file', 'save file export project'],
]

interface Tool {
  id: string
  emoji: string
  title: string
  cats: Cat[]
  desc: string
  kw: string
  body: ReactNode[]
}

const textOf = (n: ReactNode): string => (typeof n === 'string' ? n : Array.isArray(n) ? n.map(textOf).join('') : '')

/** Splits the old long list (heading, content, heading, content…) into tools. */
function parse(children: ReactNode): { lead: ReactNode[]; tools: Tool[] } {
  const lead: ReactNode[] = []
  const tools: Tool[] = []
  Children.toArray(children).forEach((ch) => {
    const el = ch as ReactElement<{ className?: string; children?: ReactNode }>
    if (isValidElement(el) && el.type === 'div' && el.props.className === 'group-h') {
      const full = textOf(el.props.children).trim()
      const m = full.match(/^(\S+)\s+(.*)$/)
      const emoji = m && /\p{Extended_Pictographic}/u.test(m[1]) ? m[1] : '🛠'
      const title = m && emoji !== '🛠' ? m[2] : full
      const meta = TOOL_META.find(([p]) => title.startsWith(p))
      tools.push({ id: meta?.[1] ?? title.toLowerCase().replace(/\W+/g, '-'), emoji, title: title.replace(/ \(.*\)$/, ''), cats: meta?.[2] ?? ['create'], desc: meta?.[3] ?? '', kw: meta?.[4] ?? '', body: [] })
    } else if (tools.length) tools[tools.length - 1].body.push(ch)
    else lead.push(ch)
  })
  return { lead, tools }
}

const OPEN_KEY = 'clipforge-open-tools'
const loadOpen = (): Set<string> => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

export function ToolCards({ children }: { children: ReactNode }) {
  const lang = useSettings((x) => x.lang)
  const { lead, tools: raw } = useMemo(() => parse(children), [children])
  // titles and one-liners in the chosen language; the English title is kept for the guide and for search
  const tools = useMemo(() => raw.map((x) => ({ ...x, en: x.title, ...toolText(x.id, x.title, x.desc), kw: `${x.kw} ${x.title} ${x.desc}` })), [raw, lang])
  const pins = useSettings((s) => s.pins)
  const hidden = useSettings((s) => s.hidden)
  const allOpen = useSettings((s) => s.toolsOpen)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'all' | 'pinned' | Cat>('all')
  const [open, setOpen] = useState<Set<string>>(loadOpen)
  const [active, setActive] = useState<string>(() => {
    const w = window as any
    const id = w.__cfTool || ''
    w.__cfTool = undefined
    return id
  })
  useEffect(() => {
    const on = (e: Event) => {
      ;(window as any).__cfTool = undefined
      setActive((e as CustomEvent).detail)
    }
    window.addEventListener('cf:tool', on)
    return () => window.removeEventListener('cf:tool', on)
  }, [])
  useT()
  useEffect(() => {
    if (!active) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-bg') && setActive('')
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [active])
  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      try {
        sessionStorage.setItem(OPEN_KEY, JSON.stringify([...n]))
      } catch {}
      return n
    })

  const visible = tools.filter((t) => !hidden.includes(t.id))
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const match = (t: Tool) => words.every((w) => `${t.title} ${t.desc} ${t.kw} ${t.cats.join(' ')}`.toLowerCase().includes(w))

  // what to show, in order, with group labels
  const sections: { label: string; list: Tool[] }[] = []
  if (words.length) sections.push({ label: '', list: visible.filter(match) })
  else if (cat === 'pinned') sections.push({ label: '', list: pins.map((p) => visible.find((t) => t.id === p)).filter(Boolean) as Tool[] })
  else if (cat !== 'all') sections.push({ label: '', list: visible.filter((t) => t.cats.includes(cat)) })
  else {
    const pinned = pins.map((p) => visible.find((t) => t.id === p)).filter(Boolean) as Tool[]
    if (pinned.length) sections.push({ label: tr('★ Pinned'), list: pinned })
    const used = new Set(pinned.map((t) => t.id))
    for (const c of CATS) {
      const list = visible.filter((t) => t.cats[0] === c.id && !used.has(t.id))
      if (list.length) sections.push({ label: tr(c.name), list })
    }
  }
  const shownIds = new Set(sections.flatMap((s) => s.list.map((t) => t.id)))
  const single = words.length > 0 && shownIds.size === 1

  const card = (t: Tool, shown = true) => {
    const isOpen = shown && (allOpen || single || open.has(t.id))
    const pinned = pins.includes(t.id)
    return (
      <div key={t.id} className={'tcard' + (isOpen ? ' open' : '')} data-tool={t.id} hidden={!shown}>
        <div className="tc-h" role="button" tabIndex={0} onClick={() => toggle(t.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(t.id))} aria-expanded={isOpen}>
          <span className="tc-ic">{t.emoji}</span>
          <span className="tc-t">
            <b>{t.title}</b>
            {t.desc && <span className="tc-desc">{t.desc}</span>}
          </span>
          <button
            className={'tc-pin' + (pinned ? ' on' : '')}
            title={pinned ? 'Unpin' : 'Pin to the top'}
            aria-label={pinned ? `Unpin ${t.title}` : `Pin ${t.title}`}
            onClick={(e) => {
              e.stopPropagation()
              togglePin(t.id)
            }}
          >
            <Icon name="star" size={15} />
          </button>
          <Icon name="chevron" size={16} className="tc-chev" />
        </div>
        <div className="tc-body" hidden={!isOpen}>
          {t.body}
        </div>
      </div>
    )
  }

  const pinBtn = (t: Tool, cls = 'tc-pin') => {
    const pinned = pins.includes(t.id)
    return (
      <button
        className={cls + (pinned ? ' on' : '')}
        title={pinned ? 'Unpin' : 'Pin to the top'}
        aria-label={pinned ? `Unpin ${t.title}` : `Pin ${t.title}`}
        onClick={(e) => {
          e.stopPropagation()
          togglePin(t.id)
        }}
      >
        <Icon name="star" size={15} />
      </button>
    )
  }

  const top = (
    <div className="tc-top">
      <div className="tc-search">
        <Icon name="search" size={15} />
        <input placeholder={tr('Search tools…').replace('{n}', String(visible.length))} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tools" />
      </div>
      <div className="tc-cats">
        <button className={'chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>{tr('All')}</button>
        <button className={'chip' + (cat === 'pinned' ? ' on' : '')} onClick={() => setCat('pinned')} title="Pinned tools">★</button>
        {CATS.map((c) => (
          <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => setCat(c.id)} title={tr(c.name)}>{tr(c.short)}</button>
        ))}
      </div>
    </div>
  )
  const empty = shownIds.size === 0 && <div className="tc-empty">{words.length ? `No tool matches “${q}”.` : cat === 'pinned' ? 'Tap ☆ on any tool to pin it here.' : 'Nothing here.'}</div>
  const hiddenNote = hidden.length > 0 && !words.length && cat === 'all' && <div className="hint" style={{ textAlign: 'center' }}>{hidden.length} tool{hidden.length > 1 ? 's' : ''} hidden in ⚙️ Settings</div>

  // classic mode: every tool open, one long list
  if (allOpen) {
    const nodes: ReactNode[] = []
    sections.forEach((s, i) => {
      if (s.label) nodes.push(<div key={'g' + i + s.label} className="tc-group">{s.label}</div>)
      s.list.forEach((t) => nodes.push(card(t)))
    })
    for (const t of visible) if (!shownIds.has(t.id)) nodes.push(card(t, false))
    return (
      <>
        {lead}
        {top}
        {nodes}
        {empty}
        {hiddenNote}
      </>
    )
  }

  // tiles: see every tool at a glance; a tool opens in a big panel
  const cur = visible.find((t) => t.id === active)
  return (
    <>
      {lead}
      {top}
      {sections.map((s, i) => (
        <div key={'s' + i + s.label} className="tsec">
          {s.label && <div className="tc-group">{s.label}</div>}
          <div className="tgrid">
            {s.list.map((t) => (
              <div
                key={t.id}
                className={'ttile' + (active === t.id ? ' on' : '')}
                data-tool={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setActive(active === t.id ? '' : t.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setActive(t.id))}
              >
                <span className="tt-ic">{t.emoji}</span>
                <b>{t.title}</b>
                {t.desc && <small>{t.desc}</small>}
                {pinBtn(t, 'tt-pin')}
              </div>
            ))}
          </div>
        </div>
      ))}
      {empty}
      {hiddenNote}
      {createPortal(
        <div className={'tdrawer' + (cur ? ' open' : '')} aria-hidden={!cur} role="dialog" aria-label={cur?.title}>
          {cur && (
            <div className="td-h">
              <button className="ico" onClick={() => setActive('')} aria-label="Back to all tools" title="Back to all tools (Esc)"><Icon name="left" size={17} /></button>
              <span className="td-ic">{cur.emoji}</span>
              <div className="td-t">
                <b>{cur.title}</b>
                {cur.desc && <small>{cur.desc}</small>}
              </div>
              <button className="btn sm td-help" onClick={() => openGuide(cur.en)} title="How to use this tool – opens the guide here"><Icon name="book" size={14} /><span>How to use</span></button>
              {pinBtn(cur, 'tc-pin td-pin')}
              <button className="ico" onClick={() => setActive('')} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
          )}
          <div className="td-body">
            {/* every tool stays mounted here, so results and typed text survive switching tools */}
            {visible.map((t) => (
              <div key={t.id} className="td-tool" data-tool={t.id} hidden={t.id !== active}>
                {t.body}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
      {cur && createPortal(<div className="td-scrim" onClick={() => setActive('')} />, document.body)}
    </>
  )
}

export const toolIds = () => TOOL_META.map(([p, id]) => ({ id, name: p }))
export const pinsNow = () => getSettings().pins

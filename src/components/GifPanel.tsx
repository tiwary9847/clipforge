import { useEffect, useRef, useState } from 'react'
import { Gif, GifType, NoGifSource, addGif, addGifFile, gifSearchReady, ownGiphyKey, recentGifs, searchGifs, setOwnGiphyKey } from '../gifs'
import { setUi } from '../store'

const CHIPS: Record<GifType, [string, string][]> = {
  gifs: [
    ['🔥 Trending', ''],
    ['🎬 Bollywood', 'bollywood'],
    ['😂 LOL', 'laughing'],
    ['😮 Wow', 'wow'],
    ['👏 Clap', 'clapping'],
    ['👍 Yes', 'yes'],
    ['🙅 No', 'no'],
    ['🙏 Thank you', 'thank you'],
    ['🎉 Party', 'party'],
    ['💃 Dance', 'dance'],
    ['🤔 Thinking', 'thinking'],
    ['😢 Sad', 'sad'],
    ['😡 Angry', 'angry'],
    ['🤯 Mind blown', 'mind blown'],
    ['🏏 Cricket', 'cricket'],
    ['💸 Money', 'money'],
  ],
  stickers: [
    ['🔥 Trending', ''],
    ['🔔 Subscribe', 'subscribe'],
    ['👍 Like', 'like'],
    ['👉 Arrow', 'arrow'],
    ['✨ Sparkle', 'sparkle'],
    ['❤️ Heart', 'heart'],
    ['🔥 Fire', 'fire'],
    ['⭐ Star', 'star'],
    ['💯 100', '100'],
    ['😂 LOL', 'lol'],
    ['🆕 New', 'new'],
    ['🏷️ Sale', 'sale'],
    ['✅ Check', 'check mark'],
    ['🎉 Party', 'party'],
  ],
}

export function GifPanel() {
  const [type, setType] = useState<GifType>('gifs')
  const [q, setQ] = useState('')
  const [chip, setChip] = useState('')
  const [items, setItems] = useState<Gif[]>([])
  const [page, setPage] = useState(1)
  const [next, setNext] = useState(false)
  const [by, setBy] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [off, setOff] = useState(!gifSearchReady())
  const [showRecent, setShowRecent] = useState(false)
  const seq = useRef(0)
  const file = useRef<HTMLInputElement>(null)

  async function run(query: string, t: GifType, pg = 1) {
    const my = ++seq.current
    setErr('')
    setBusy(pg === 1 ? 'search' : 'more')
    if (pg === 1) setItems([])
    try {
      const r = await searchGifs(query, t, pg)
      if (my !== seq.current) return
      setItems((old) => (pg === 1 ? r.items : [...old, ...r.items.filter((x) => !old.some((o) => o.id === x.id))]))
      setNext(r.next)
      setPage(pg)
      setBy(r.by)
      setOff(false)
    } catch (e) {
      if (my !== seq.current) return
      if (e instanceof NoGifSource) setOff(true)
      else setErr((e as Error).message)
    }
    if (my === seq.current) setBusy('')
  }

  // first load and every type switch: trending
  useEffect(() => {
    if (!off) void run(q || chip, type)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  // search as you type (after a short pause)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (off) return
    const id = setTimeout(() => void run(q, type), 550)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  async function add(g: Gif) {
    setErr('')
    setBusy(g.id)
    try {
      setUi({ toast: await addGif(g, type) })
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy('')
  }

  const list = showRecent ? recentGifs(type) : items
  const noun = type === 'gifs' ? 'GIFs' : 'stickers'

  return (
    <div className="gifp">
      <div className="gif-type">
        <button className={type === 'gifs' ? 'on' : ''} onClick={() => { setType('gifs'); setShowRecent(false) }}>GIFs</button>
        <button className={type === 'stickers' ? 'on' : ''} onClick={() => { setType('stickers'); setShowRecent(false) }}>Stickers <small>(see-through)</small></button>
      </div>

      {off ? (
        <GifSetup onReady={() => { setOff(false); void run('', type) }} onImport={() => file.current?.click()} />
      ) : (
        <>
          <form className="gif-search" onSubmit={(e) => { e.preventDefault(); setShowRecent(false); void run(q, type) }}>
            <input type="search" placeholder={type === 'gifs' ? 'Search GIFs… e.g. “wow”, “shaadi”, “thug life”' : 'Search stickers… e.g. “subscribe”, “arrow”'} value={q} onChange={(e) => { setQ(e.target.value); setChip(''); setShowRecent(false) }} enterKeyHint="search" />
          </form>
          <div className="gif-chips">
            {recentGifs(type).length > 0 && (
              <button className={'chip' + (showRecent ? ' on' : '')} onClick={() => setShowRecent(true)}>🕘 Recent</button>
            )}
            {CHIPS[type].map(([label, term]) => (
              <button key={label} className={'chip' + (!showRecent && !q && chip === term ? ' on' : '')} onClick={() => { if (q) first.current = true; setQ(''); setChip(term); setShowRecent(false); void run(term, type) }}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {err && <div className="ae-err">⚠ {err}</div>}

      {!off && (
        <>
          <div className="hint gif-tip">Tap a {type === 'gifs' ? 'GIF' : 'sticker'} to add it at the playhead.</div>
          <div className={'gif-grid' + (type === 'stickers' ? ' st' : '')}>
            {list.map((g) => (
              <button key={g.id} className={'gif-cell' + (busy === g.id ? ' busy' : '')} title={`Add “${g.title}”`} disabled={!!busy && busy !== 'more' && busy !== 'search'} onClick={() => add(g)} style={{ aspectRatio: g.w && g.h ? `${g.w} / ${g.h}` : '1' }}>
                <img src={g.thumb} alt={g.title} loading="lazy" decoding="async" />
                {busy === g.id && <span className="gif-spin">Adding…</span>}
              </button>
            ))}
          </div>
          {busy === 'search' && <div className="hint">Finding {noun}…</div>}
          {!busy && !list.length && !err && <div className="hint">{showRecent ? 'Nothing used yet.' : `No ${noun} found. Try another word.`}</div>}
          {!showRecent && next && list.length > 0 && (
            <button className="btn sm gif-more" disabled={!!busy} onClick={() => run(q || chip, type, page + 1)}>{busy === 'more' ? 'Loading…' : `Show more ${noun}`}</button>
          )}
          <div className="gif-foot">
            {by && <span className="gif-by">Powered by {by}</span>}
            <button className="lnk" onClick={() => file.current?.click()}>Add a GIF from your {matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer'}</button>
          </div>
        </>
      )}

      <input ref={file} type="file" accept="image/gif,image/webp,image/png,video/mp4" multiple hidden onChange={async (e) => {
        const files = [...(e.target.files ?? [])]
        e.target.value = ''
        setErr('')
        for (const f of files) {
          setBusy('file')
          try {
            setUi({ toast: await addGifFile(f) })
          } catch (x) {
            setErr((x as Error).message)
          }
        }
        setBusy('')
      }} />
    </div>
  )
}

function GifSetup({ onReady, onImport }: { onReady: () => void; onImport: () => void }) {
  const [key, setKey] = useState(ownGiphyKey())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className="gif-setup">
      <b>GIF search isn’t switched on yet</b>
      <div className="hint">Once the app owner turns it on, you can search and add GIFs here with nothing to set up. For now you can:</div>
      <button className="btn sm primary" onClick={onImport}>⬆ Add a GIF from your {matchMedia('(pointer: coarse)').matches ? 'phone' : 'computer'}</button>
      <details>
        <summary>Or use your own free GIPHY key</summary>
        <div className="hint">Sign up free at developers.giphy.com → Create an API key → paste it here. It stays only in this browser (up to 100 searches an hour).</div>
        <form
          className="gif-search"
          onSubmit={async (e) => {
            e.preventDefault()
            setErr('')
            setBusy(true)
            setOwnGiphyKey(key)
            try {
              await searchGifs('', 'gifs')
              onReady()
            } catch (x) {
              setOwnGiphyKey('')
              setErr((x as Error).message)
            }
            setBusy(false)
          }}
        >
          <input placeholder="Paste your GIPHY API key" value={key} onChange={(e) => setKey(e.target.value.trim())} />
          <button className="btn sm" disabled={!key || busy}>{busy ? '…' : 'Save'}</button>
        </form>
        <a className="lnk" href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer">Get a free key ↗</a>
        {err && <div className="ae-err">⚠ {err}</div>}
      </details>
    </div>
  )
}

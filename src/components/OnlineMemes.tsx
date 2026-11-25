import { useRef, useState } from 'react'
import { engine } from '../engine'
import { fetchAudio, playableUrl } from '../musiclib'
import { addAsset, addAssetClip, patchClip, setUi } from '../store'

type Src = 'sounds' | 'gifs' | 'link'
interface Hit {
  id: string
  title: string
  sub: string // license / creator
  url: string // media file (fetched on add)
  preview?: string // thumbnail
  kind: 'audio' | 'video' | 'image'
  page?: string
}

const KEY = 'clipforge-giphy-key'
const getKey = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

const LICENSE: Record<string, string> = { cc0: 'CC0 (public domain)', pdm: 'Public domain', by: 'CC BY – credit the creator', 'by-sa': 'CC BY-SA – credit the creator', 'by-nc': 'CC BY-NC – non-commercial only', 'by-nd': 'CC BY-ND', 'by-nc-sa': 'CC BY-NC-SA – non-commercial only', 'by-nc-nd': 'CC BY-NC-ND – non-commercial only' }

async function searchSounds(q: string, commercialOnly: boolean): Promise<Hit[]> {
  // Most sound effects on Openverse come from Freesound and many have no category (category: null),
  // so filtering by category=sound_effect alone finds almost nothing. Search Freesound first, then wider.
  const tries: Record<string, string>[] = [{ source: 'freesound' }, { category: 'sound_effect' }, {}]
  for (const extra of tries) {
    const u = new URL('https://api.openverse.org/v1/audio/')
    u.searchParams.set('q', q)
    // Openverse answers 401 to apps without an account that ask for more than 20 results a page
    u.searchParams.set('page_size', '20')
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v)
    if (commercialOnly) u.searchParams.set('license_type', 'commercial')
    let r = await fetch(u)
    if (r.status === 401) {
      u.searchParams.delete('page_size')
      r = await fetch(u)
    }
    if (r.status === 429) throw new Error('Too many sound searches right now – wait a minute and try again.')
    if (!r.ok) throw new Error(`Sound search failed (${r.status}). Try again in a moment.`)
    const j = await r.json()
    type Ov = { id: string; title: string; url?: string; alt_files?: { url: string }[] | null; license: string; creator?: string; duration?: number; foreign_landing_url?: string }
    const hits: Hit[] = ((j.results ?? []) as Ov[])
      .map((x) => ({ x, url: playableUrl(x) }))
      .filter((o): o is { x: Ov; url: string } => !!o.url)
      .map(({ x, url }) => ({
        id: x.id,
        title: (x.title || 'Sound').replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, ''),
        sub: `${x.duration ? (x.duration / 1000).toFixed(1) + 's · ' : ''}${LICENSE[x.license] ?? x.license.toUpperCase()}${x.creator ? ' · ' + x.creator : ''}`,
        url,
        kind: 'audio' as const,
        page: x.foreign_landing_url,
      }))
    if (hits.length) return hits
  }
  return []
}

async function searchGifs(q: string, key: string, stickers: boolean): Promise<Hit[]> {
  const kind = stickers ? 'stickers' : 'gifs'
  const u = new URL(`https://api.giphy.com/v1/${kind}/${q ? 'search' : 'trending'}`)
  u.searchParams.set('api_key', key)
  if (q) u.searchParams.set('q', q)
  u.searchParams.set('limit', '24')
  u.searchParams.set('rating', 'pg-13')
  const r = await fetch(u)
  if (r.status === 401 || r.status === 403) throw new Error('Giphy rejected that API key. Check it and try again.')
  if (!r.ok) throw new Error(`GIF search failed (${r.status}).`)
  const j = await r.json()
  return (j.data ?? []).map((g: { id: string; title: string; url: string; images: Record<string, { url?: string; mp4?: string }> }) => ({
    id: g.id,
    title: g.title || 'GIF',
    sub: 'via GIPHY',
    url: g.images.original_mp4?.mp4 ?? g.images.original?.url ?? '',
    preview: g.images.fixed_height_small?.url ?? g.images.fixed_height?.url,
    kind: g.images.original_mp4?.mp4 ? ('video' as const) : ('image' as const),
    page: g.url,
  })).filter((h: Hit) => h.url)
}

const extOf = (mime: string, url: string, kind: Hit['kind']) => {
  const m = /\.(mp3|wav|ogg|m4a|mp4|webm|gif|png|jpe?g|webp)(\?|$)/i.exec(url)?.[1]
  if (m) return m.toLowerCase()
  if (mime.includes('/')) return mime.split('/')[1].split(';')[0].replace('mpeg', 'mp3')
  return kind === 'audio' ? 'mp3' : kind === 'video' ? 'mp4' : 'gif'
}

/** Download a file (needs the host to allow cross-site requests), import it and place it at the playhead. */
export async function addFromUrl(url: string, title: string, kind: Hit['kind'] | 'auto'): Promise<string> {
  let blob: Blob
  try {
    if (kind === 'audio') blob = await fetchAudio(url)
    else {
      const r = await fetch(url)
      if (!r.ok) throw new Error(String(r.status))
      blob = await r.blob()
    }
  } catch {
    throw new Error("That site doesn't allow direct use in the browser. Download the file there, then use “Import my meme sound / GIF / image”.")
  }
  const mime = blob.type || ''
  const k: Hit['kind'] = kind !== 'auto' ? kind : mime.startsWith('audio') ? 'audio' : mime.startsWith('video') ? 'video' : 'image'
  const safe = title.replace(/[^\w .()\-]+/g, '').slice(0, 40) || 'meme'
  const file = new File([blob], `${safe}.${extOf(mime, url, k)}`, { type: mime || undefined })
  const a = await engine.importFile(file)
  if (!a) throw new Error('Could not read that file as audio, video or an image.')
  addAsset(a)
  const t = Math.max(0, engine.time)
  const c = addAssetClip(a.id, a.kind === 'audio' ? 'a1' : 'v2', t)
  if (c && a.kind !== 'audio') patchClip(c.id, { scale: 0.8, x: 0.5, y: 0.5, transIn: { type: 'zoom-in', dur: 0.2 } })
  return `${a.kind === 'audio' ? 'Sound' : 'Meme'} “${safe}” added at the playhead.`
}

export function OnlineMemes() {
  const [src, setSrc] = useState<Src>('sounds')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [key, setKey] = useState(getKey())
  const [keyDraft, setKeyDraft] = useState('')
  const [stickers, setStickers] = useState(false)
  const [commercial, setCommercial] = useState(true)
  const [link, setLink] = useState('')
  const player = useRef<HTMLAudioElement | null>(null)

  async function search() {
    setErr('')
    setBusy('search')
    setHits([])
    try {
      setHits(src === 'sounds' ? await searchSounds(q.trim() || 'meme', commercial) : await searchGifs(q.trim(), key, stickers))
    } catch (e) {
      const m = (e as Error).message
      setErr(m === 'Failed to fetch' ? 'Couldn’t reach the search service – check your internet connection.' : m)
    }
    setBusy('')
  }
  const [errPage, setErrPage] = useState('')
  async function add(h: Hit) {
    setErr('')
    setErrPage('')
    setBusy(h.id)
    try {
      setUi({ toast: await addFromUrl(h.url, h.title, h.kind) })
    } catch (e) {
      if (h.kind === 'audio' && h.page) {
        setErr('This sound’s site doesn’t let web apps download it directly. Tap “Save the sound”, then add it with “Import my meme sound” in Built-in (or drag the file onto the app).')
        setErrPage(h.url)
      } else setErr((e as Error).message)
    }
    setBusy('')
  }
  function play(h: Hit) {
    setErr('')
    setErrPage('')
    if (player.current && !player.current.paused && player.current.dataset.id === h.id) {
      player.current.pause()
      return
    }
    player.current?.pause()
    const a = new Audio(h.url)
    a.dataset.id = h.id
    player.current = a
    a.onerror = () => {
      setErr('This sound can’t be played here.')
      setErrPage(h.page ?? '')
    }
    a.play().catch((e: Error) => {
      if (e?.name === 'NotAllowedError') return setErr('Tap ▶ again to listen (your browser blocked sound).')
      setErr('This sound can’t be played here.')
      setErrPage(h.page ?? '')
    })
  }

  return (
    <>
      <div className="osrc">
        <button className={src === 'sounds' ? 'on' : ''} onClick={() => { setSrc('sounds'); setHits([]); setErr('') }}>🔊 Sounds</button>
        <button className={src === 'gifs' ? 'on' : ''} onClick={() => { setSrc('gifs'); setHits([]); setErr('') }}>🖼 GIFs</button>
        <button className={src === 'link' ? 'on' : ''} onClick={() => { setSrc('link'); setHits([]); setErr('') }}>🔗 From link</button>
      </div>

      {src === 'sounds' && (
        <div className="hint">Free sound effects from the Openverse library (Creative Commons). Search “vine boom”, “fart”, “laugh”, “record scratch”, “bell”…</div>
      )}
      {src === 'gifs' && !key && (
        <div className="okey">
          <div className="hint">GIF memes come from GIPHY. It needs a free API key (30-second signup at developers.giphy.com). It’s stored only in this browser.</div>
          <input placeholder="Paste your GIPHY API key" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value.trim())} />
          <button
            className="btn sm"
            disabled={!keyDraft}
            onClick={() => {
              try {
                localStorage.setItem(KEY, keyDraft)
              } catch {}
              setKey(keyDraft)
            }}
          >
            Save key
          </button>
          <a className="btn sm" href="https://developers.giphy.com/dashboard/" target="_blank" rel="noreferrer">Get a free key ↗</a>
        </div>
      )}

      {(src === 'sounds' || (src === 'gifs' && key)) && (
        <>
          <form className="osearch" onSubmit={(e) => { e.preventDefault(); void search() }}>
            <input placeholder={src === 'sounds' ? 'Search sounds…' : 'Search meme GIFs (blank = trending)…'} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn sm primary" disabled={!!busy}>{busy === 'search' ? '…' : 'Search'}</button>
          </form>
          {src === 'sounds' ? (
            <label className="ochk"><input type="checkbox" checked={commercial} onChange={(e) => setCommercial(e.target.checked)} /> Only sounds that allow monetised videos</label>
          ) : (
            <div className="ochk">
              <label><input type="checkbox" checked={stickers} onChange={(e) => setStickers(e.target.checked)} /> Transparent stickers instead of GIFs</label>
              <button className="lnk" onClick={() => { try { localStorage.removeItem(KEY) } catch {} setKey('') }}>change key</button>
            </div>
          )}
        </>
      )}

      {src === 'link' && (
        <>
          <div className="hint">Paste a direct link to an MP4, GIF, image or MP3/WAV. It works when the site allows it; if not, download the file and import it instead.</div>
          <form className="osearch" onSubmit={async (e) => {
            e.preventDefault()
            setErr('')
            setBusy('link')
            try {
              setUi({ toast: await addFromUrl(link.trim(), link.split('/').pop()?.split('?')[0] || 'meme', 'auto') })
              setLink('')
            } catch (x) {
              setErr((x as Error).message)
            }
            setBusy('')
          }}>
            <input placeholder="https://…/meme.mp4" value={link} onChange={(e) => setLink(e.target.value)} />
            <button className="btn sm primary" disabled={!link.trim() || !!busy}>{busy === 'link' ? '…' : 'Add'}</button>
          </form>
        </>
      )}

      {err && <div className="ae-err">⚠ {err}{errPage && <> <a href={errPage} target="_blank" rel="noreferrer">{/\.(mp3|ogg|wav|m4a)(\?|$)/i.test(errPage) ? '⬇ Save the sound' : 'Open the sound’s page ↗'}</a></>}</div>}

      <div className="ohits">
        {hits.map((h) => (
          <div key={h.id} className="ohit">
            {h.preview ? <img src={h.preview} alt="" loading="lazy" /> : <span className="oi">{h.kind === 'audio' ? '🔊' : '🎞'}</span>}
            <div className="ot">
              <b title={h.title}>{h.title}</b>
              <small>{h.sub}</small>
            </div>
            {h.kind === 'audio' && <button className="ico" onClick={() => play(h)} title="Preview">▶</button>}
            <button className="btn sm" disabled={!!busy} onClick={() => add(h)}>{busy === h.id ? '…' : '＋ Add'}</button>
          </div>
        ))}
        {src !== 'link' && !hits.length && !busy && <div className="hint">Search to see results.</div>}
      </div>

      <div className="osites">
        <b>Want the viral Indian meme clips?</b>
        <div className="hint">
          Sites like memes.co.in have no public API and their clips belong to their creators, so ClipForge can’t pull them in automatically. Download the clips you like there (check each item’s license), then add them here:
        </div>
        <div className="osrc">
          <a className="btn sm" href="https://memes.co.in/" target="_blank" rel="noreferrer">Open memes.co.in ↗</a>
          <a className="btn sm" href="https://www.myinstants.com/" target="_blank" rel="noreferrer">MyInstants ↗</a>
        </div>
        <div className="hint">Then use <b>Import my meme sound / GIF / image</b> in Built-in memes, or drag the files straight onto the app. You can select many at once.</div>
      </div>
    </>
  )
}

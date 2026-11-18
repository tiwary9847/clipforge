import { useState } from 'react'
import { setUi } from '../store'
import { addFromUrl } from './OnlineMemes'

type Prov = 'pexels' | 'pixabay'
type Kind = 'videos' | 'photos'
interface Hit {
  id: string
  thumb: string
  url: string
  kind: 'video' | 'image'
  title: string
  credit: string
  dur?: number
}

const KEY = (p: Prov) => `clipforge-key-${p}`
const getKey = (p: Prov) => {
  try {
    return localStorage.getItem(KEY(p)) ?? ''
  } catch {
    return ''
  }
}

async function search(p: Prov, kind: Kind, q: string, key: string, portrait: boolean): Promise<Hit[]> {
  if (p === 'pexels') {
    const u = new URL(kind === 'videos' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search')
    u.searchParams.set('query', q || 'nature')
    u.searchParams.set('per_page', '24')
    if (portrait) u.searchParams.set('orientation', 'portrait')
    const r = await fetch(u, { headers: { Authorization: key } })
    if (r.status === 401 || r.status === 403) throw new Error('Pexels rejected that API key.')
    if (!r.ok) throw new Error(`Search failed (${r.status}).`)
    const j = await r.json()
    if (kind === 'videos')
      return (j.videos ?? []).map((v: any) => {
        const files = (v.video_files ?? []).filter((f: any) => f.link && f.width).sort((x: any, y: any) => Math.abs(x.width - 1280) - Math.abs(y.width - 1280))
        return { id: 'pv' + v.id, thumb: v.image, url: files[0]?.link, kind: 'video', title: `Pexels video ${v.id}`, credit: `${v.user?.name ?? 'Pexels'} · Pexels`, dur: v.duration }
      }).filter((h: Hit) => h.url)
    return (j.photos ?? []).map((ph: any) => ({ id: 'pp' + ph.id, thumb: ph.src?.tiny ?? ph.src?.small, url: ph.src?.large2x ?? ph.src?.large, kind: 'image', title: ph.alt || `Pexels photo ${ph.id}`, credit: `${ph.photographer ?? 'Pexels'} · Pexels` }))
  }
  const u = new URL(kind === 'videos' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/')
  u.searchParams.set('key', key)
  u.searchParams.set('q', q || 'nature')
  u.searchParams.set('per_page', '24')
  u.searchParams.set('safesearch', 'true')
  if (kind === 'photos' && portrait) u.searchParams.set('orientation', 'vertical')
  const r = await fetch(u)
  if (r.status === 400 || r.status === 401) throw new Error('Pixabay rejected that API key.')
  if (!r.ok) throw new Error(`Search failed (${r.status}).`)
  const j = await r.json()
  if (kind === 'videos')
    return (j.hits ?? []).map((v: any) => ({ id: 'xv' + v.id, thumb: v.videos?.tiny?.thumbnail ?? v.videos?.small?.thumbnail ?? '', url: v.videos?.medium?.url ?? v.videos?.small?.url, kind: 'video', title: v.tags || 'Pixabay video', credit: `${v.user ?? 'Pixabay'} · Pixabay`, dur: v.duration })).filter((h: Hit) => h.url)
  return (j.hits ?? []).map((ph: any) => ({ id: 'xp' + ph.id, thumb: ph.previewURL, url: ph.largeImageURL ?? ph.webformatURL, kind: 'image', title: ph.tags || 'Pixabay photo', credit: `${ph.user ?? 'Pixabay'} · Pixabay` }))
}

export function StockPanel() {
  const [prov, setProv] = useState<Prov>('pexels')
  const [kind, setKind] = useState<Kind>('videos')
  const [key, setKey] = useState(getKey('pexels'))
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [portrait, setPortrait] = useState(true)
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const switchProv = (p: Prov) => {
    setProv(p)
    setKey(getKey(p))
    setHits([])
    setErr('')
  }
  return (
    <div className="stock">
      <div className="hint">Free videos and photos you can use in your videos, even monetised ones (Pexels / Pixabay licence – no credit required, but appreciated).</div>
      <div className="osrc">
        <button className={prov === 'pexels' ? 'on' : ''} onClick={() => switchProv('pexels')}>Pexels</button>
        <button className={prov === 'pixabay' ? 'on' : ''} onClick={() => switchProv('pixabay')}>Pixabay</button>
        <span style={{ width: 8 }} />
        <button className={kind === 'videos' ? 'on' : ''} onClick={() => { setKind('videos'); setHits([]) }}>🎬 Videos</button>
        <button className={kind === 'photos' ? 'on' : ''} onClick={() => { setKind('photos'); setHits([]) }}>🖼 Photos</button>
      </div>
      {!key ? (
        <div className="okey">
          <div className="hint">{prov === 'pexels' ? 'Pexels' : 'Pixabay'} needs a free API key (1-minute signup). It’s stored only in this browser.</div>
          <input placeholder={`Paste your ${prov === 'pexels' ? 'Pexels' : 'Pixabay'} API key`} value={draft} onChange={(e) => setDraft(e.target.value.trim())} />
          <div className="osrc">
            <button
              className="on"
              disabled={!draft}
              onClick={() => {
                try {
                  localStorage.setItem(KEY(prov), draft)
                } catch {}
                setKey(draft)
                setDraft('')
              }}
            >
              Save key
            </button>
            <a href={prov === 'pexels' ? 'https://www.pexels.com/api/' : 'https://pixabay.com/api/docs/'} target="_blank" rel="noreferrer">Get a free key ↗</a>
          </div>
        </div>
      ) : (
        <>
          <form
            className="osearch"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy('search')
              setErr('')
              try {
                setHits(await search(prov, kind, q.trim(), key, portrait))
              } catch (x) {
                const m = (x as Error).message
                setErr(m === 'Failed to fetch' ? 'Couldn’t reach the stock library – check your internet.' : m)
              }
              setBusy('')
            }}
          >
            <input placeholder={`Search free ${kind} – city, rain, food, sunset…`} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn sm primary" disabled={!!busy}>{busy === 'search' ? '…' : 'Search'}</button>
          </form>
          <div className="ochk">
            <label><input type="checkbox" checked={portrait} onChange={(e) => setPortrait(e.target.checked)} /> Vertical first (for Shorts / Reels)</label>
            <button className="lnk" onClick={() => { try { localStorage.removeItem(KEY(prov)) } catch {} setKey('') }}>change key</button>
          </div>
        </>
      )}
      {err && <div className="ae-err">⚠ {err}</div>}
      <div className="stock-grid">
        {hits.map((h) => (
          <button
            key={h.id}
            className="stock-hit"
            disabled={!!busy}
            title={`${h.title} – ${h.credit}`}
            onClick={async () => {
              setBusy(h.id)
              setErr('')
              try {
                setUi({ toast: await addFromUrl(h.url, h.title.slice(0, 30), h.kind) })
              } catch (x) {
                setErr((x as Error).message)
              }
              setBusy('')
            }}
          >
            {h.thumb ? <img src={h.thumb} alt="" loading="lazy" /> : <span>🎞</span>}
            {h.dur ? <i>{h.dur}s</i> : null}
            <small>{busy === h.id ? 'Adding…' : h.credit}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

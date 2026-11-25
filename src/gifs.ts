// GIF + sticker search for the GIFs tab.
// Where results come from, in order:
//   1. the app's own server (GET /gifs) – KLIPY or GIPHY, the key stays on the server, nothing to set up for users
//   2. the user's own free GIPHY key saved in this browser (works before the server is set up)
import { CONFIG } from './plan'
import { engine } from './engine'
import { addAsset, addAssetClip, freeOverlayTrack, getAsset, patchClip, select } from './store'

export type GifType = 'gifs' | 'stickers'
export interface Gif {
  id: string
  title: string
  thumb: string // small animated preview
  url: string // full GIF/WebP (loops)
  mp4?: string // used when the browser can't play animated pictures
  w: number
  h: number
}
export interface GifPage {
  items: Gif[]
  next: boolean
  by: 'KLIPY' | 'GIPHY'
}

export const GIPHY_KEY = 'clipforge-giphy-key'
const RECENT = 'clipforge-recent-gifs'
const CID = 'clipforge-gif-cid'

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k) ?? ''
    } catch {
      return ''
    }
  },
  set: (k: string, v: string) => {
    try {
      v ? localStorage.setItem(k, v) : localStorage.removeItem(k)
    } catch {}
  },
}
export const ownGiphyKey = () => ls.get(GIPHY_KEY)
export const setOwnGiphyKey = (k: string) => ls.set(GIPHY_KEY, k.trim())
/** Is any GIF source available right now? */
export const gifSearchReady = () => !!(CONFIG.server || ownGiphyKey())

function customerId() {
  let id = ls.get(CID)
  if (!id) {
    id = Math.random().toString(36).slice(2, 12)
    ls.set(CID, id)
  }
  return id
}

export class NoGifSource extends Error {}

async function viaServer(q: string, type: GifType, page: number): Promise<GifPage> {
  const u = new URL(CONFIG.server.replace(/\/$/, '') + '/gifs')
  u.searchParams.set('type', type)
  if (q) u.searchParams.set('q', q)
  u.searchParams.set('page', String(page))
  u.searchParams.set('cid', customerId())
  const r = await fetch(u)
  const j = await r.json().catch(() => ({}))
  if (r.status === 503 && j.code === 'nogif') throw new NoGifSource(j.error)
  if (!r.ok) throw new Error(j.error || `GIF search failed (${r.status}). Try again in a moment.`)
  return j as GifPage
}

async function viaGiphy(q: string, type: GifType, page: number, key: string): Promise<GifPage> {
  const u = new URL(`https://api.giphy.com/v1/${type}/${q ? 'search' : 'trending'}`)
  u.searchParams.set('api_key', key)
  if (q) u.searchParams.set('q', q)
  u.searchParams.set('limit', '24')
  u.searchParams.set('offset', String((page - 1) * 24))
  u.searchParams.set('rating', 'pg-13')
  const r = await fetch(u)
  if (r.status === 401 || r.status === 403) throw new Error('GIPHY rejected your key. Check it, or remove it and paste it again.')
  if (r.status === 429) throw new Error('Your free GIPHY key has used its searches for this hour. Try again later.')
  if (!r.ok) throw new Error(`GIF search failed (${r.status}).`)
  const j = await r.json()
  type G = { id: string; title: string; images: Record<string, { url?: string; webp?: string; mp4?: string; width?: string; height?: string }> }
  const items: Gif[] = ((j.data ?? []) as G[])
    .map((g) => {
      const o = g.images.original ?? {}
      const thumb = g.images.fixed_width_small?.webp ?? g.images.fixed_width_small?.url ?? g.images.fixed_width?.url ?? ''
      return { id: 'g' + g.id, title: g.title || 'GIF', thumb, url: o.webp ?? o.url ?? '', mp4: o.mp4, w: Number(o.width) || 0, h: Number(o.height) || 0 }
    })
    .filter((g) => g.url && g.thumb)
  const pg = j.pagination ?? {}
  return { items, next: (pg.offset ?? 0) + (pg.count ?? 0) < Math.min(pg.total_count ?? 0, 499), by: 'GIPHY' }
}

/** q = '' → trending. */
export async function searchGifs(q: string, type: GifType, page = 1): Promise<GifPage> {
  q = q.trim()
  let serverErr: unknown = null
  if (CONFIG.server) {
    try {
      return await viaServer(q, type, page)
    } catch (e) {
      serverErr = e
    }
  }
  const own = ownGiphyKey()
  if (own) return viaGiphy(q, type, page, own)
  if (serverErr && !(serverErr instanceof NoGifSource)) {
    const m = (serverErr as Error).message
    throw new Error(m === 'Failed to fetch' ? 'Couldn’t reach GIF search – check your internet connection.' : m)
  }
  throw new NoGifSource('GIF search is not switched on yet.')
}

/* ---------- recently used ---------- */
export function recentGifs(type: GifType): Gif[] {
  try {
    const all = JSON.parse(ls.get(RECENT) || '{}') as Record<string, Gif[]>
    return all[type] ?? []
  } catch {
    return []
  }
}
function remember(g: Gif, type: GifType) {
  try {
    const all = JSON.parse(ls.get(RECENT) || '{}') as Record<string, Gif[]>
    all[type] = [g, ...(all[type] ?? []).filter((x) => x.id !== g.id)].slice(0, 24)
    ls.set(RECENT, JSON.stringify(all))
  } catch {}
}

/* ---------- add to the video ---------- */
async function download(url: string): Promise<Blob> {
  try {
    const r = await fetch(url)
    if (r.ok) return await r.blob()
  } catch {}
  if (CONFIG.server) {
    const r = await fetch(CONFIG.server.replace(/\/$/, '') + '/media?u=' + encodeURIComponent(url))
    if (r.ok) return await r.blob()
  }
  throw new Error('Couldn’t download that GIF. Try another one, or check your internet connection.')
}

const canAnimate = () => typeof (window as any).ImageDecoder !== 'undefined'
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/** Download a GIF/sticker, put it on a free overlay layer at the playhead, select it. Returns a toast message. */
export async function addGif(g: Gif, type: GifType): Promise<string> {
  const sticker = type === 'stickers'
  // Browsers without animated-picture support (older Safari) would show a still frame – use the MP4 for normal GIFs there.
  const useMp4 = !sticker && !canAnimate() && !!g.mp4
  const src = useMp4 ? g.mp4! : g.url
  const blob = await download(src)
  const mime = blob.type || (useMp4 ? 'video/mp4' : /\.webp(\?|$)/i.test(src) ? 'image/webp' : 'image/gif')
  const ext = mime.split('/')[1]?.split(';')[0] || 'gif'
  const name = (g.title || 'GIF').replace(/[^\w .()\-]+/g, '').trim().slice(0, 40) || 'GIF'
  const msg = await placeFile(new File([blob], `${name}.${ext}`, { type: mime }), name, sticker)
  remember(g, type)
  return msg
}

/** A GIF / sticker file from the user's phone or computer → straight onto the video at the playhead. */
export async function addGifFile(f: File): Promise<string> {
  const name = f.name.replace(/\.[^.]+$/, '').replace(/[^\w .()\-]+/g, '').trim().slice(0, 40) || 'GIF'
  return placeFile(f, name, false)
}

async function placeFile(f: File, name: string, sticker: boolean): Promise<string> {
  const a = await engine.importFile(f)
  if (!a) throw new Error('This GIF couldn’t be read. Try another one.')
  addAsset(a)
  const t = Math.max(0, engine.time)
  const one = getAsset(a.id)?.duration || a.duration || 0
  // Short loops repeat to at least 3 s; long GIFs play once (up to 10 s)
  const dur = a.kind === 'video' ? Math.min(one || 3, 10) : one > 0 && one < 3 ? one * Math.ceil(3 / one) : Math.min(Math.max(one, 3), 10)
  const track = freeOverlayTrack(t, dur)
  const c = addAssetClip(a.id, track, t)
  if (!c) throw new Error('Couldn’t place the GIF.')
  patchClip(c.id, {
    dur,
    label: (sticker ? 'Sticker: ' : 'GIF: ') + name,
    fit: 'contain',
    scale: sticker ? 0.38 : 0.62,
    x: 0.5,
    y: sticker ? 0.62 : 0.42,
    volume: 0,
    transIn: { type: 'zoom-in', dur: 0.2 },
  })
  select(c.id)
  return `${sticker ? 'Sticker' : 'GIF'} added at ${fmt(t)} for ${Math.round(dur * 10) / 10} s – drag it on the video to move it, drag the round handle to resize.`
}

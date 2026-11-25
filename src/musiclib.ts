// Free music library: searches openly licensed music on Openverse (Jamendo, Freesound, Wikimedia Commons, ccMixter…)
// and adds a track to the project, with its credit line saved for the video description.
// Only licences that are safe in a (monetised) video are asked for: CC0, Public Domain Mark and CC BY.
// (Under CC 4.0, music synced to video is an adaptation – so "No Derivatives" and "Share Alike" tracks are left out.)
import { addAsset, baseClip, checkpoint, clipEnd, getState, insertSilent, patchProjectSilent, projectDuration } from './store'
import { engine } from './engine'
import { Clip } from './types'

const API = 'https://api.openverse.org/v1/audio/'
export const SAFE_LICENSES = 'cc0,pdm,by'

export interface Track {
  id: string
  title: string
  creator: string
  creatorUrl?: string
  url: string // the audio file
  page: string // the track's page at its source
  license: string // cc0 | pdm | by
  version: string
  licenseUrl: string
  source: string
  duration: number // seconds (0 when unknown)
  tags: string[]
  credit: string // the line to put in the video description
}

export const MUSIC_MOODS: { q: string; name: string }[] = [
  { q: 'happy upbeat', name: '☀️ Happy' },
  { q: 'chill relaxing', name: '🌊 Chill' },
  { q: 'lofi', name: '☕ Lo-fi' },
  { q: 'cinematic epic', name: '🎬 Cinematic' },
  { q: 'indian', name: '🪘 Indian' },
  { q: 'acoustic guitar', name: '🎸 Acoustic' },
  { q: 'piano', name: '🎹 Piano' },
  { q: 'romantic', name: '💕 Romantic' },
  { q: 'sad emotional', name: '🌧 Emotional' },
  { q: 'electronic dance', name: '🎧 Electronic' },
  { q: 'hip hop beat', name: '🎤 Hip hop' },
  { q: 'ambient', name: '🌌 Ambient' },
  { q: 'jazz', name: '🎷 Jazz' },
  { q: 'funny quirky', name: '🤪 Funny' },
  { q: 'suspense dark', name: '🕵️ Suspense' },
  { q: 'corporate motivational', name: '🚀 Motivational' },
]

const LIC_NAME: Record<string, string> = { cc0: 'CC0 (public domain)', pdm: 'Public domain', by: 'CC BY' }
export const needsCredit = (t: Track) => t.license === 'by'
export const licenseLabel = (t: Track) => (t.license === 'by' ? `CC BY ${t.version}`.trim() : LIC_NAME[t.license] ?? t.license.toUpperCase())

interface OvResult {
  id: string
  title?: string
  creator?: string
  creator_url?: string
  url?: string
  foreign_landing_url?: string
  license?: string
  license_version?: string
  license_url?: string
  source?: string
  provider?: string
  duration?: number | null
  tags?: { name: string }[]
  alt_files?: { url: string; filetype?: string }[] | null
}

function toTrack(r: OvResult): Track | null {
  const license = (r.license ?? '').toLowerCase()
  if (!r.url || !['cc0', 'pdm', 'by'].includes(license)) return null
  const d = r.duration ?? 0
  const title = (r.title ?? 'Untitled').replace(/\.(mp3|wav|ogg|flac)$/i, '')
  const creator = r.creator || 'Unknown artist'
  const t: Track = {
    id: r.id,
    title,
    creator,
    creatorUrl: r.creator_url,
    url: r.url,
    page: r.foreign_landing_url || `https://openverse.org/audio/${r.id}`,
    license,
    version: r.license_version ?? '',
    licenseUrl: r.license_url ?? '',
    source: r.source ?? r.provider ?? '',
    duration: d > 1000 ? d / 1000 : d, // the API reports milliseconds
    tags: (r.tags ?? []).map((x) => x.name).slice(0, 6),
    credit: '',
  }
  t.credit = needsCredit(t) ? `“${title}” by ${creator} – ${licenseLabel(t)} – ${t.page}` : `“${title}” by ${creator} (${licenseLabel(t)})`
  return t
}

export interface SearchOpts {
  q: string
  kind: 'music' | 'sound_effect'
  length?: '' | 'short' | 'medium' | 'long' // short = 30 s–2 min, medium = 2–10 min
  noCredit?: boolean // only CC0 / public domain
  page?: number
}

/** Searches Openverse. No key needed. */
export async function searchMusic(o: SearchOpts): Promise<{ tracks: Track[]; more: boolean }> {
  const base = { q: o.q.trim() || (o.kind === 'music' ? 'background music' : 'whoosh'), license: o.noCredit ? 'cc0,pdm' : SAFE_LICENSES, page_size: '20', page: String(o.page ?? 1), filter_dead: 'true', mature: 'false' }
  // Many Openverse items have no category (most Freesound sound effects show category: null), so a
  // category filter alone can return nothing. Try the most precise filter first, then wider ones.
  const tries: Record<string, string>[] = o.kind === 'music' ? [{ category: 'music' }, { source: 'jamendo' }, {}] : [{ source: 'freesound' }, { category: 'sound_effect' }, {}]
  let j: { results?: OvResult[]; page_count?: number } = {}
  let tracks: Track[] = []
  for (const extra of tries) {
    const p = new URLSearchParams({ ...base, ...extra })
    if (o.length) p.set('length', o.length)
    let r: Response
    try {
      r = await fetch(`${API}?${p}`, { headers: { Accept: 'application/json' } })
    } catch {
      throw new Error('Couldn’t reach the free music library – check your internet connection.')
    }
    if (r.status === 429) throw new Error('The music library is busy (too many searches) – wait a minute and try again.')
    if (!r.ok) throw new Error(`The music library didn’t answer (${r.status}). Try again in a moment.`)
    j = (await r.json()) as { results?: OvResult[]; page_count?: number }
    tracks = (j.results ?? []).map(toTrack).filter((x): x is Track => !!x)
    if (tracks.length || (o.page ?? 1) > 1) break
  }
  return { tracks, more: (o.page ?? 1) < Math.min(j.page_count ?? 1, 12) }
}

/** Downloads the track and puts it on the Music track. Throws an error with code "blocked" when the source doesn't allow apps to download it. */
export async function addTrack(t: Track, at: 'start' | 'playhead', status: (m: string) => void): Promise<string> {
  status('Downloading the track…')
  let blob: Blob
  try {
    const r = await fetch(t.url)
    if (!r.ok) throw new Error(String(r.status))
    blob = await r.blob()
  } catch {
    const e = new Error('blocked')
    throw e
  }
  if (!/^audio\//.test(blob.type) && blob.size < 20000) throw new Error('blocked')
  const ext = (blob.type.split('/')[1] || 'mp3').replace('mpeg', 'mp3').replace('x-wav', 'wav').replace('wave', 'wav')
  const file = new File([blob], `${t.title.slice(0, 40)} – ${t.creator.slice(0, 24)}.${ext}`, { type: blob.type || 'audio/mpeg' })
  status('Adding it to your video…')
  const a = await engine.importFile(file)
  if (!a) throw new Error('This file couldn’t be opened – try another track.')
  addAsset(a)
  return placeTrack(a.id, a.duration, t, at)
}

/** Places an imported track on the Music track and remembers its credit. */
export function placeTrack(assetId: string, duration: number, t: Track | null, at: 'start' | 'playhead' = 'start'): string {
  const st = getState()
  const clips = st.project.clips
  const total = projectDuration()
  const start = at === 'playhead' ? engine.time : 0
  const talking = clips.some((c) => (c.kind === 'video' || c.kind === 'audio') && c.track !== 'a2' && c.volume > 0)
  // a free spot on the music track (or the sound-effects track if music is taken there)
  const busy = (tr: string) => clips.some((c) => c.track === tr && c.start < start + 1 && clipEnd(c) > start)
  const track = busy('a2') ? (busy('a1') ? 'a2' : 'a1') : 'a2'
  const len = total > start + 1 ? Math.min(duration, total - start) : duration
  checkpoint()
  insertSilent([
    baseClip('audio', track, {
      assetId,
      label: t ? `🎵 ${t.title}` : '🎵 Music',
      start,
      dur: len,
      volume: talking ? 0.3 : 0.8,
      fadeIn: 0.5,
      fadeOut: len < duration ? 2 : 0.5,
    } as Partial<Clip>),
  ])
  if (t) {
    const credits = (getState().project.credits ?? []).filter((c) => c.id !== t.id)
    patchProjectSilent({ credits: [...credits, { id: t.id, assetId, text: t.credit, needed: needsCredit(t) }] })
  }
  engine.requestRender()
  return `Added “${t?.title ?? 'track'}” on the ${track === 'a2' ? 'Music' : 'Sound effects'} track${talking ? ', turned down under your voice' : ''}${len < duration ? ', trimmed to your video with a fade-out' : ''}.${t && needsCredit(t) ? ' Its credit is added to your description automatically (Tools → Title, description).' : ''}`
}

/** Credit lines for tracks still used in the project – for the video description. */
export function creditLines(): string[] {
  const p = getState().project
  const used = new Set(p.clips.map((c) => c.assetId))
  return (p.credits ?? []).filter((c) => used.has(c.assetId)).map((c) => c.text)
}
export function withCredits(description: string): string {
  const lines = creditLines()
  if (!lines.length || description.includes(lines[0])) return description
  return `${description}\n\n🎵 Music:\n${lines.map((l) => `• ${l}`).join('\n')}`
}

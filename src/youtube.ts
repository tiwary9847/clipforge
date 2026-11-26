// Direct YouTube upload from the browser using Google's own OAuth + resumable upload API.
// Requirements (Google's, not ours): the page must be served over https (or localhost) from an origin
// registered on an OAuth "Web" client ID, and the YouTube Data API must be enabled for that project.

import { CONFIG } from './plan'

const SCOPE = 'https://www.googleapis.com/auth/youtube.upload'
const KEY = 'clipforge-yt-client'
/** The user's own client ID (advanced, optional) – otherwise the app's built-in one. */
export const ownClientId = () => {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}
export const builtInClientId = () => CONFIG.googleClientId
export const getClientId = () => ownClientId() || CONFIG.googleClientId
export const setClientId = (v: string) => {
  try {
    localStorage.setItem(KEY, v.trim())
  } catch {}
}
export const uploadSupported = () => location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'

function loadGsi(): Promise<any> {
  const w = window as any
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google)
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => res((window as any).google)
    s.onerror = () => rej(new Error('Could not load Google sign-in (are you online?).'))
    document.head.appendChild(s)
  })
}

// one sign-in is reused for about an hour, so a batch of uploads asks only once
let cached: { tok: string; until: number; id: string } | null = null
async function token(clientId: string): Promise<string> {
  if (cached && cached.id === clientId && cached.until > Date.now()) return cached.tok
  const tok = await freshToken(clientId)
  cached = { tok, until: Date.now() + 50 * 60e3, id: clientId }
  return tok
}
async function freshToken(clientId: string): Promise<string> {
  const google = await loadGsi()
  return new Promise((res, rej) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r: any) => (r.access_token ? res(r.access_token) : rej(new Error(r.error_description || r.error || 'Sign-in was cancelled.'))),
      error_callback: (e: any) => rej(new Error(e?.message || 'Sign-in was cancelled or blocked (allow pop-ups for this page).')),
    })
    client.requestAccessToken()
  })
}

export interface YtMeta {
  title: string
  description: string
  privacy: 'private' | 'unlisted' | 'public'
  tags?: string[]
  /** ISO time to go public; the video stays private until then (YouTube requires that). */
  publishAt?: string
  shorts?: boolean
}
export async function uploadToYouTube(blob: Blob, meta: YtMeta, onProgress: (p: number) => void): Promise<string> {
  const clientId = getClientId()
  if (!clientId) throw new Error('YouTube posting isn’t switched on in this app yet – download the video and upload it in the YouTube app.')
  const tok = await token(clientId)
  const tags = (meta.tags ?? []).map((t) => t.replace(/^#/, '')).filter(Boolean).slice(0, 25)
  const status: Record<string, unknown> = { privacyStatus: meta.publishAt ? 'private' : meta.privacy, selfDeclaredMadeForKids: false }
  if (meta.publishAt) status.publishAt = meta.publishAt
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': blob.type || 'video/mp4',
      'X-Upload-Content-Length': String(blob.size),
    },
    body: JSON.stringify({
      snippet: { title: meta.title.slice(0, 100) || 'My video', description: meta.description.slice(0, 4900), tags, categoryId: '22' },
      status,
    }),
  })
  if (!init.ok) throw new Error(`YouTube refused the upload (${init.status}). ${(await init.text()).slice(0, 200)}`)
  const loc = init.headers.get('Location')
  if (!loc) throw new Error('YouTube did not return an upload address.')
  return new Promise((res, rej) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', loc)
    xhr.setRequestHeader('Content-Type', blob.type || 'video/mp4')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => rej(new Error('Network error while uploading.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          res(`https://youtu.be/${JSON.parse(xhr.responseText).id}`)
        } catch {
          rej(new Error('Upload finished but the reply was unreadable.'))
        }
      } else rej(new Error(`Upload failed (${xhr.status}).`))
    }
    xhr.send(blob)
  })
}

/** Sets a custom thumbnail (needs a verified YouTube channel – otherwise YouTube refuses and the video keeps its own). */
export async function setYouTubeThumbnail(videoUrl: string, jpg: Blob): Promise<void> {
  const id = videoUrl.split('/').pop()
  const tok = await token(getClientId())
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${id}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'image/jpeg' }, body: jpg })
  if (!r.ok) throw new Error(r.status === 403 ? 'Custom thumbnails need a verified YouTube channel (youtube.com/verify).' : `YouTube refused the thumbnail (${r.status}).`)
}

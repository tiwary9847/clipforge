// Direct YouTube upload from the browser using Google's own OAuth + resumable upload API.
// Requirements (Google's, not ours): the page must be served over https (or localhost) from an origin
// registered on an OAuth "Web" client ID, and the YouTube Data API must be enabled for that project.

const SCOPE = 'https://www.googleapis.com/auth/youtube.upload'
const KEY = 'clipforge-yt-client'
export const getClientId = () => {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}
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

async function token(clientId: string): Promise<string> {
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

export async function uploadToYouTube(
  blob: Blob,
  meta: { title: string; description: string; privacy: 'private' | 'unlisted' | 'public' },
  onProgress: (p: number) => void,
): Promise<string> {
  const clientId = getClientId()
  if (!clientId) throw new Error('Paste your Google OAuth client ID first.')
  const tok = await token(clientId)
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': blob.type || 'video/mp4',
      'X-Upload-Content-Length': String(blob.size),
    },
    body: JSON.stringify({
      snippet: { title: meta.title.slice(0, 100) || 'My video', description: meta.description },
      status: { privacyStatus: meta.privacy, selfDeclaredMadeForKids: false },
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

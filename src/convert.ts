/* In-app converter for videos this browser can't play (mainly iPhone/Samsung "High Efficiency" HEVC).
   Runs ffmpeg's WebAssembly build in a worker. The ~32 MB core is fetched only the first time it is used
   and then comes from the browser cache. Nothing is uploaded: the file is read straight from your disk. */

const REMOTE = 'https://tiwary9847.github.io/clipforge/ffmpeg/'

export type ConvertQuality = 'quick' | 'full'
export interface ConvertInfo {
  width: number
  height: number
  duration: number
  codec: string
}

/** Where the ffmpeg core lives: next to the app when it's served from a website, otherwise the ClipForge site. */
let baseP: Promise<string> | null = null
export function coreBase(): Promise<string> {
  return (baseP ??= (async () => {
    if (/^https?:$/.test(location.protocol)) {
      const local = new URL('ffmpeg/', location.href).href
      try {
        const r = await fetch(local + 'ffmpeg-core.js', { method: 'HEAD', cache: 'no-store' })
        if (r.ok && !/text\/html/.test(r.headers.get('content-type') || '')) return local
      } catch {
        /* fall through */
      }
    }
    return REMOTE
  })())
}

/** Has the converter been downloaded before (so it starts straight away)? */
export const converterCached = () => {
  try {
    return localStorage.getItem('clipforge-ffmpeg') === '1'
  } catch {
    return false
  }
}

export async function probe(file: File): Promise<ConvertInfo | null> {
  try {
    const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny')
    const inp = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
    const tr = await inp.getPrimaryVideoTrack()
    if (!tr) return null
    return { width: tr.displayWidth, height: tr.displayHeight, duration: await inp.computeDuration(), codec: tr.codec ?? '' }
  } catch {
    return null
  }
}

/** Output size: "quick" makes the shorter side 720 px, "full" keeps the size (shorter side at most 1080). */
export function outSize(info: ConvertInfo, q: ConvertQuality) {
  const short = Math.min(info.width, info.height) || 1080
  const target = Math.min(short, q === 'quick' ? 720 : 1080)
  const k = target / short
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2)
  return { w: even(info.width || 1920), h: even(info.height || 1080) }
}

const WORKER = `
self.onmessage = async (e) => {
  const { base, file, args } = e.data
  try {
    importScripts(base + 'ffmpeg-core.js')
    postMessage({ type: 'loading' })
    const core = await createFFmpegCore({ mainScriptUrlOrBlob: base + 'ffmpeg-core.js#' + btoa(JSON.stringify({ wasmURL: base + 'ffmpeg-core.wasm', workerURL: '' })) })
    postMessage({ type: 'ready' })
    core.setLogger(({ message }) => postMessage({ type: 'log', message }))
    core.FS.mkdir('/in')
    core.FS.mount(core.FS.filesystems.WORKERFS, { files: [file] }, '/in')
    core.exec(...args)
    const ret = core.ret
    let out = null
    try { out = core.FS.readFile('/out.mp4') } catch (er) {}
    if (out && out.length > 1000 && ret === 0) postMessage({ type: 'done', out }, [out.buffer])
    else postMessage({ type: 'error', message: 'ffmpeg stopped with code ' + ret })
  } catch (er) {
    postMessage({ type: 'error', message: String((er && er.message) || er) })
  }
}`

export interface ConvertProgress {
  stage: 'download' | 'convert'
  /** 0..1 */
  frac: number
  /** seconds left, when known */
  eta?: number
}

/** Converts a video to a standard H.264/AAC MP4 that every browser can play. */
export function convertVideo(
  file: File,
  info: ConvertInfo,
  q: ConvertQuality,
  onProgress: (p: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<File> {
  return new Promise(async (resolve, reject) => {
    const base = await coreBase()
    // a plain ASCII name inside the worker's file system
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '.mov').toLowerCase()
    const safe = new File([file], 'source' + ext, { type: file.type })
    const { w, h } = outSize(info, q)
    const args = [
      '-i', '/in/' + safe.name,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=${w}:${h}:flags=bicubic,format=yuv420p`,
      '-c:v', 'libx264', '-preset', q === 'quick' ? 'ultrafast' : 'veryfast', '-crf', q === 'quick' ? '23' : '20',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      '/out.mp4',
    ]
    const url = URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' }))
    const wk = new Worker(url)
    URL.revokeObjectURL(url)
    const t0 = performance.now()
    let tConv = 0
    let dl: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (dl) clearInterval(dl)
      wk.terminate()
    }
    signal?.addEventListener('abort', () => {
      stop()
      reject(new DOMException('Cancelled', 'AbortError'))
    })
    // the core download has no progress events of its own: show a gentle estimate until it's ready
    if (!converterCached()) {
      let f = 0
      dl = setInterval(() => onProgress({ stage: 'download', frac: (f = Math.min(0.95, f + (1 - f) * 0.04)) }), 250)
    } else onProgress({ stage: 'download', frac: 1 })
    wk.onmessage = (e) => {
      const d = e.data
      if (d.type === 'ready') {
        if (dl) clearInterval(dl)
        dl = null
        try {
          localStorage.setItem('clipforge-ffmpeg', '1')
        } catch {}
        tConv = performance.now()
        onProgress({ stage: 'convert', frac: 0 })
      } else if (d.type === 'log') {
        const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(d.message)
        if (m && info.duration > 0) {
          const s = +m[1] * 3600 + +m[2] * 60 + +m[3]
          const frac = Math.min(0.999, s / info.duration)
          const spent = (performance.now() - (tConv || t0)) / 1000
          onProgress({ stage: 'convert', frac, eta: frac > 0.02 ? (spent / frac) * (1 - frac) : undefined })
        }
      } else if (d.type === 'done') {
        stop()
        const name = file.name.replace(/\.[^.]+$/, '') + ' (converted).mp4'
        resolve(new File([d.out], name, { type: 'video/mp4', lastModified: file.lastModified }))
      } else if (d.type === 'error') {
        stop()
        reject(new Error(d.message))
      }
    }
    wk.onerror = (e) => {
      stop()
      reject(new Error(e.message || 'The converter could not start (no internet the first time?)'))
    }
    wk.postMessage({ base, file: safe, args })
  })
}

/* ---- queue: the import code asks, the dialog answers ---- */
type Job = { file: File; info: ConvertInfo | null }
const queue: Job[] = []
export const pendingConversions = () => queue
export function requestConvert(file: File, info: ConvertInfo | null) {
  queue.push({ file, info })
  window.dispatchEvent(new CustomEvent('cf:convert'))
}
export function takeConversion(): Job | undefined {
  return queue.shift()
}

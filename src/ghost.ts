// Ghost re-take: fix a mistake in the middle of a talking video without shooting it all again.
// The last good frame is shown see-through over the live camera (with a live "match" score), you re-record
// from that point, and the new take is lined up to the frame that matches best and joined in place.
import { engine } from './engine'
import { pickMime } from './recorder'
import { addAsset, clipEnd, getPreset, getState, replaceTimeline, select } from './store'
import { Clip } from './types'
import { spokenFromCaptions } from './chapters'

export interface GhostTarget {
  clip: Clip
  t: number // timeline time of the re-take point
  src: number // source seconds in the clip's file
}

/** The main-track video under the playhead (not in its first 0.3 s). */
export function ghostTarget(t = engine.time): GhostTarget | null {
  const c = getState().project.clips.find((x) => x.track === 'v1' && x.kind === 'video' && t >= x.start + 0.3 && t < clipEnd(x) - 0.05)
  if (!c) return null
  return { clip: c, t, src: c.srcIn + (t - c.start) * c.speed }
}

/** The clip's own picture at a source time (no texts or stickers on top), as a canvas. */
export async function frameAt(url: string, sec: number, maxW = 720): Promise<HTMLCanvasElement> {
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res()
    v.onerror = () => rej(new Error('Couldn’t read the video.'))
  })
  await new Promise<void>((res) => {
    v.onseeked = () => res()
    v.currentTime = Math.max(0, Math.min(sec, (v.duration || sec) - 0.05))
  })
  const k = Math.min(1, maxW / Math.max(1, v.videoWidth))
  const cv = document.createElement('canvas')
  cv.width = Math.round(v.videoWidth * k)
  cv.height = Math.round(v.videoHeight * k)
  cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height)
  v.removeAttribute('src')
  v.load()
  return cv
}

/** The last few words said before t – shown as "continue from here". */
export function lastWords(t: number, n = 9): string {
  const words = spokenFromCaptions()
    .filter((s) => s.start < t)
    .map((s) => s.text)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(-n).join(' ')
}

/* ---------- matching ---------- */
const GW = 32
const GH = 18
let gctx: CanvasRenderingContext2D | null = null
/** A tiny brightness map of what the viewer sees (cropped like "cover" to the project's shape), normalised so lighting changes matter less. */
export function signature(src: CanvasImageSource, sw: number, sh: number): Float32Array {
  const P = getPreset()
  const ar = P.w / P.h
  const gw = ar >= 1 ? GW : Math.round(GW * ar * 1.0) || GW
  const gh = ar >= 1 ? Math.max(2, Math.round(GW / ar)) : GH * 2
  gctx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const c = gctx!.canvas
  c.width = gw
  c.height = gh
  // cover-crop the source to the project's shape
  let cw = sw
  let ch = sw / ar
  if (ch > sh) {
    ch = sh
    cw = sh * ar
  }
  gctx!.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, gw, gh)
  const d = gctx!.getImageData(0, 0, gw, gh).data
  const g = new Float32Array(gw * gh)
  let m = 0
  for (let i = 0; i < g.length; i++) {
    g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
    m += g[i]
  }
  m /= g.length
  let s = 0
  for (let i = 0; i < g.length; i++) s += (g[i] - m) ** 2
  s = Math.sqrt(s / g.length) || 1
  for (let i = 0; i < g.length; i++) g[i] = (g[i] - m) / s
  return g
}
/** 0–100: how closely two signatures line up. */
export function similarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length) return 0
  let d = 0
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i])
  d /= a.length
  return Math.round(Math.max(0, Math.min(1, 1 - d / 1.1)) * 100)
}

/** In the first `maxSec` of the new take, the moment that looks most like the ghost (so the join is invisible). */
export async function bestOffset(url: string, ghost: Float32Array, maxSec = 1.5): Promise<{ at: number; score: number }> {
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.src = url
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res()
    v.onerror = () => rej(new Error('Couldn’t read the new take.'))
  })
  let best = { at: 0, score: -1 }
  const end = Math.min(maxSec, Math.max(0, (isFinite(v.duration) ? v.duration : maxSec) - 0.5))
  for (let t = 0; t <= end + 1e-6; t += 0.1) {
    await new Promise<void>((res) => {
      v.onseeked = () => res()
      v.currentTime = t
    })
    const s = similarity(signature(v, v.videoWidth, v.videoHeight), ghost)
    if (s > best.score + 1) best = { at: Math.round(t * 10) / 10, score: s }
  }
  v.removeAttribute('src')
  v.load()
  return best
}

/* ---------- recording ---------- */
export interface Take {
  blob: Blob
  url: string
  secs: number
}
export function startTake(stream: MediaStream): { stop: () => Promise<Take>; cancel: () => void } {
  const mime = pickMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const t0 = performance.now()
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }))))
  rec.start(500)
  return {
    async stop() {
      rec.stop()
      const blob = await done
      return { blob, url: URL.createObjectURL(blob), secs: (performance.now() - t0) / 1000 }
    },
    cancel() {
      try {
        rec.stop()
      } catch {}
    },
  }
}

/** Puts the new take in place. replace = the take replaces the rest of that clip; insert = keeps the rest after it. */
export async function placeTake(target: GhostTarget, take: Take, ghost: Float32Array | null, mode: 'replace' | 'insert'): Promise<string> {
  const ext = take.blob.type.includes('mp4') ? 'mp4' : 'webm'
  const a = await engine.importFile(new File([take.blob], `Re-take ${new Date().toLocaleTimeString().replace(/[^\d]/g, '')}.${ext}`, { type: take.blob.type }))
  if (!a) throw new Error('The new take could not be read.')
  addAsset(a)
  const total = a.duration > 0.2 ? a.duration : take.secs
  const off = ghost ? await bestOffset(a.url, ghost) : { at: 0, score: 0 }
  const newDur = Math.max(0.3, total - off.at)
  const { clip: c, t } = target
  const orig = getState().project.clips.find((x) => x.id === c.id) ?? c
  const end = clipEnd(orig)
  const removed = mode === 'replace' ? end - t : 0
  const delta = newDur - removed
  const after = mode === 'replace' ? end : t
  const out: Clip[] = []
  const take0: Clip = {
    ...orig,
    id: 'clip_' + Math.random().toString(36).slice(2, 10),
    assetId: a.id,
    label: 'Re-take',
    start: t,
    dur: newDur,
    srcIn: off.at,
    speed: 1,
    volume: 1,
    fadeIn: 0.04,
    fadeOut: mode === 'replace' ? orig.fadeOut : 0.04,
    kf: undefined,
    transIn: { type: 'none', dur: 0 },
    transOut: mode === 'replace' ? orig.transOut : { type: 'none', dur: 0 },
    freeze: undefined,
    group: undefined,
  }
  for (const x of getState().project.clips) {
    if (x.id === orig.id) {
      // the part before the re-take point stays
      out.push({ ...x, dur: t - x.start, fadeOut: 0.04, transOut: { type: 'none', dur: 0 } })
      if (mode === 'insert') out.push({ ...x, id: 'clip_' + Math.random().toString(36).slice(2, 10), start: t + newDur, dur: end - t, srcIn: target.src, fadeIn: 0.04, transIn: { type: 'none', dur: 0 }, kf: undefined })
      continue
    }
    // captions of the words that were re-said are dropped (make captions again for the new take)
    if (mode === 'replace' && x.track === 'v4' && x.kind === 'text' && x.start >= t - 0.05 && x.start < end) continue
    if (x.start >= after - 1e-3) out.push({ ...x, start: Math.max(0, x.start + delta) })
    else out.push(x)
  }
  out.push(take0)
  replaceTimeline(out, { markers: (getState().project.markers ?? []).map((m) => (m >= after ? m + delta : m)) })
  select(take0.id)
  engine.seek(Math.max(0, t - 1.5))
  return `New take joined at ${fmt(t)}${off.score >= 60 ? ` – lined up to the best-matching frame (${off.score}% match)` : off.score >= 0 && ghost ? ' – the framing differs a bit; trim the first frames of the take if the join shows' : ''}. Press ▶ to watch the join – make captions again for the new part if you use them.`
}
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

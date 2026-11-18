// Batch of "pro look" tools: split-screen layouts, scene detection, colour match, adjustment layers.
import { CanvasSink } from 'mediabunny'
import { engine } from './engine'
import { getInput } from './media'
import { DEFAULT_GRADE } from './grade'
import { addClipsBatch, baseClip, checkpoint, clipEnd, getAsset, getClip, getPreset, getState, patchClip, splitClip } from './store'
import { Clip } from './types'

/* ---------------- split-screen / picture-in-picture layouts ---------------- */

type Rect = [number, number, number, number] // x, y, w, h as fractions of the canvas
export const LAYOUTS: { id: string; name: string; n: [number, number]; rects: (portrait: boolean) => Rect[] }[] = [
  { id: 'stack', name: 'Top / bottom', n: [2, 2], rects: () => [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { id: 'side', name: 'Side by side', n: [2, 2], rects: () => [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: 'pip', name: 'Picture in picture', n: [2, 2], rects: (p) => [[0, 0, 1, 1], p ? [0.56, 0.06, 0.38, 0.24] : [0.66, 0.06, 0.3, 0.3]] },
  { id: 'reaction', name: 'Reaction (big + face)', n: [2, 2], rects: (p) => (p ? [[0, 0, 1, 0.62], [0, 0.62, 1, 0.38]] : [[0, 0, 0.68, 1], [0.68, 0, 0.32, 1]]) },
  { id: 'three', name: 'Big + 2 small', n: [3, 3], rects: (p) => (p ? [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] : [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]) },
  { id: 'grid', name: '2 × 2 grid', n: [4, 4], rects: () => [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
]

/** Places video/photo clips into the cells of a layout (cropping each to fill its cell). */
export function applyLayout(layoutId: string, ids?: string[]): string {
  const L = LAYOUTS.find((x) => x.id === layoutId)
  if (!L) return ''
  const st = getState()
  const t = engine.time
  let clips = (ids ?? st.selIds).map((id) => getClip(id)).filter((c): c is Clip => !!c && (c.kind === 'video' || c.kind === 'image'))
  if (clips.length < L.n[0]) {
    // fall back to the video/photo clips under the playhead (main track first)
    const order = ['v1', 'v2', 'v3', 'v4']
    clips = st.project.clips.filter((c) => (c.kind === 'video' || c.kind === 'image') && t >= c.start && t < clipEnd(c)).sort((a, b) => order.indexOf(a.track) - order.indexOf(b.track))
  }
  if (clips.length < L.n[0]) throw new Error(`Select ${L.n[0]} video/photo clips first (Ctrl/⌘-click on the timeline), or stack them on different tracks at the playhead.`)
  clips = clips.slice(0, L.n[1])
  const P = getPreset()
  const portrait = P.h >= P.w
  const rects = L.rects(portrait)
  const base = clips[0]
  checkpoint()
  const busy = new Set<string>()
  clips.forEach((c, i) => {
    const a = getAsset(c.assetId)
    if (!a) return
    const [rx, ry, rw, rh] = rects[i]
    const T = (rw * P.w) / (rh * P.h) // target aspect
    const A = a.width / a.height
    let crop = { l: 0, t: 0, r: 0, b: 0 }
    if (A > T) {
      const fw = T / A
      crop = { l: (1 - fw) / 2, t: 0, r: (1 - fw) / 2, b: 0 }
    } else {
      const fh = A / T
      crop = { l: 0, t: (1 - fh) / 2, r: 0, b: (1 - fh) / 2 }
    }
    const aw = a.width * (1 - crop.l - crop.r)
    const ah = a.height * (1 - crop.t - crop.b)
    const s = Math.min(P.w / aw, P.h / ah)
    const scale = (rw * P.w) / (aw * s)
    // first clip stays on its track; others go to free overlay tracks at the same time
    let track = c.track
    if (i > 0) {
      const start = base.start
      const end = base.start + Math.min(base.dur, c.dur)
      const free = ['v2', 'v3', 'v4'].find((tr) => !busy.has(tr) && !getState().project.clips.some((x) => x.track === tr && !clips.includes(x) && x.start < end && clipEnd(x) > start))
      if (free) track = free
    }
    busy.add(track)
    patchClip(c.id, {
      crop,
      fit: 'contain',
      scale,
      x: rx + rw / 2,
      y: ry + rh / 2,
      rotation: 0,
      kf: undefined,
      track,
      start: i === 0 ? c.start : base.start,
      mask: L.id === 'pip' && i === 1 ? { shape: 'rounded', radius: 0.12 } : c.mask,
      volume: i === 0 ? c.volume : Math.min(c.volume, 0.0),
    })
  })
  return `${L.name} layout applied to ${clips.length} clips. Only the first clip’s sound is kept – raise the others’ volume if you want them.`
}

/* ---------------- frame sampling helpers ---------------- */

async function sampleFrames(c: Clip, n: number, w: number, at?: number[]): Promise<ImageData[]> {
  const a = getAsset(c.assetId)
  if (!a) return []
  const h = Math.max(8, Math.round((w * a.height) / a.width))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!
  if (a.kind === 'image') {
    const img = engine.imageSource(c, 0)
    if (!img) return []
    g.drawImage(img, 0, 0, w, h)
    return [g.getImageData(0, 0, w, h)]
  }
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) return []
  const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill' })
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  const ts = at ?? Array.from({ length: n }, (_, i) => Math.min(a.duration - 0.02, from + ((i + 0.5) / n) * (to - from)))
  const out: ImageData[] = []
  for await (const f of sink.canvasesAtTimestamps(ts)) {
    if (!f) continue
    g.drawImage(f.canvas as CanvasImageSource, 0, 0, w, h)
    out.push(g.getImageData(0, 0, w, h))
  }
  return out
}

/* ---------------- colour match ---------------- */

function stats(frames: ImageData[]) {
  const s = [0, 0, 0]
  const q = [0, 0, 0]
  let n = 0
  for (const f of frames)
    for (let i = 0; i < f.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = f.data[i + c] / 255
        s[c] += v
        q[c] += v * v
      }
      n++
    }
  const mean = s.map((v) => v / Math.max(1, n))
  const std = q.map((v, c) => Math.sqrt(Math.max(1e-6, v / Math.max(1, n) - mean[c] * mean[c])))
  return { mean, std }
}

/** Makes clip `id` look like clip `refId` (matches average colour and contrast per channel). */
export async function matchColour(id: string, refId: string): Promise<string> {
  const c = getClip(id)
  const r = getClip(refId)
  if (!c || !r) throw new Error('Pick a clip to match.')
  const [A, B] = await Promise.all([sampleFrames(c, 6, 96), sampleFrames(r, 6, 96)])
  if (!A.length || !B.length) throw new Error('Couldn’t read the pictures of these clips.')
  const sa = stats(A)
  const sb = stats(B)
  const g = sa.std.map((v, k) => Math.min(1.7, Math.max(0.6, sb.std[k] / v)))
  const o = sa.mean.map((m, k) => Math.min(0.35, Math.max(-0.35, sb.mean[k] - g[k] * m)))
  checkpoint()
  patchClip(id, { grade: { ...(c.grade ?? DEFAULT_GRADE), match: { g: g.map((v) => +v.toFixed(3)), o: o.map((v) => +v.toFixed(3)) } } })
  return `Colours matched to “${r.label}”. Fine-tune with the sliders, or Reset to undo.`
}

/* ---------------- scene detection ---------------- */

export async function detectScenes(id: string, onProgress?: (p: number) => void): Promise<string> {
  const c = getClip(id)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Select a video clip.')
  const FPS = 8
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  const n = Math.max(2, Math.floor((to - from) * FPS))
  const times = Array.from({ length: n }, (_, i) => Math.min(a.duration - 0.02, from + i / FPS))
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track.')
  const w = 64
  const h = Math.max(8, Math.round((w * a.height) / a.width))
  const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill' })
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!
  let prev: Float32Array | null = null
  let prevHist: Float32Array | null = null
  const diffs: number[] = []
  let i = 0
  for await (const f of sink.canvasesAtTimestamps(times)) {
    if (f) g.drawImage(f.canvas as CanvasImageSource, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const gray = new Float32Array(w * h)
    const hist = new Float32Array(48)
    for (let k = 0; k < w * h; k++) {
      gray[k] = d[k * 4] * 0.3 + d[k * 4 + 1] * 0.59 + d[k * 4 + 2] * 0.11
      hist[d[k * 4] >> 4]++
      hist[16 + (d[k * 4 + 1] >> 4)]++
      hist[32 + (d[k * 4 + 2] >> 4)]++
    }
    if (prev && prevHist) {
      let s = 0
      for (let k = 0; k < gray.length; k++) s += Math.abs(gray[k] - prev[k])
      let hs = 0
      for (let k = 0; k < 48; k++) hs += Math.abs(hist[k] - prevHist[k])
      // pixel change (0..255) blended with colour-histogram change (0..~100)
      diffs.push((s / gray.length) * 0.5 + (hs / (w * h * 3)) * 100 * 0.5)
    } else diffs.push(0)
    prev = gray
    prevHist = hist
    if (++i % 16 === 0) {
      onProgress?.(i / n)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  const sorted = [...diffs].sort((x, y) => x - y)
  const med = sorted[Math.floor(sorted.length / 2)] || 0
  const thr = Math.max(14, med * 4 + 6)
  const coarse: number[] = []
  for (let k = 1; k < diffs.length - 1; k++) {
    if (diffs[k] > thr && diffs[k] >= diffs[k - 1] && diffs[k] >= diffs[k + 1]) coarse.push(k)
  }
  // refine each cut to the exact frame: compare frames between the two coarse samples
  const fps = 30
  const grayAt = async (ts: number) => {
    const f = await sink.getCanvas(Math.min(a.duration - 0.01, ts))
    if (f) g.drawImage(f.canvas as CanvasImageSource, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const out = new Float32Array(w * h)
    for (let k = 0; k < w * h; k++) out[k] = d[k * 4] * 0.3 + d[k * 4 + 1] * 0.59 + d[k * 4 + 2] * 0.11
    return out
  }
  const dist = (x: Float32Array, y: Float32Array) => {
    let s2 = 0
    for (let k = 0; k < x.length; k++) s2 += Math.abs(x[k] - y[k])
    return s2 / x.length
  }
  const cuts: number[] = []
  for (const k of coarse) {
    const t0 = times[k - 1]
    const t1 = times[k]
    const before = await grayAt(t0)
    const after = await grayAt(t1)
    let cutSrc = t1
    for (let ts = t0 + 1 / fps; ts < t1 - 1e-4; ts += 1 / fps) {
      const fr = await grayAt(ts)
      if (dist(fr, after) < dist(fr, before)) {
        cutSrc = ts
        break
      }
    }
    // start the new part on the first frame of the new shot (a hair before its timestamp)
    const tl = c.start + (cutSrc - 0.004 - from) / c.speed
    if (!cuts.length || tl - cuts[cuts.length - 1] > 0.7) cuts.push(tl)
  }
  const inside = cuts.filter((x) => x > c.start + 0.3 && x < clipEnd(c) - 0.3)
  if (!inside.length) return 'No scene changes found – this looks like one continuous shot.'
  checkpoint()
  for (const t of [...inside].sort((x, y) => y - x)) splitClip(c.id, t, false)
  return `Found ${inside.length} scene change${inside.length > 1 ? 's' : ''} – the clip is now split into ${inside.length + 1} parts.`
}

/* ---------------- adjustment layer ---------------- */

export function addAdjustmentLayer(): string {
  const st = getState()
  const t = Math.max(0, engine.time)
  const dur = 5
  const track = ['v4', 'v3', 'v2'].find((tr) => !st.project.clips.some((x) => x.track === tr && x.start < t + dur && clipEnd(x) > t)) ?? 'v4'
  addClipsBatch([baseClip('adjust', track, { label: 'Adjustment layer', start: t, dur })])
  return 'Adjustment layer added – its filters, colour grade and look apply to everything on the tracks below it. Stretch it over the part you want.'
}

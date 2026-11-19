// Face tracking (bundled tiny face detector + 68-point landmarks – works offline),
// used by the beauty filter and by stickers that follow a face.
import { CanvasSink } from 'mediabunny'
import { getInput } from './media'
import { getAsset, getClip, getState, setProject } from './store'
import { Clip, FaceTrack } from './types'
import tinyBin from '@vladmandic/face-api/model/tiny_face_detector_model.bin?url'
import tinyMan from '@vladmandic/face-api/model/tiny_face_detector_model-weights_manifest.json?raw'
import lmBin from '@vladmandic/face-api/model/face_landmark_68_tiny_model.bin?url'
import lmMan from '@vladmandic/face-api/model/face_landmark_68_tiny_model-weights_manifest.json?raw'

/** One face in one frame, all in 0..1 of the (rotated) source frame:
 *  [cx, cy, w, h, eyeLx, eyeLy, eyeRx, eyeRy, mouthX, mouthY, mouthW, noseX, noseY, roll°] */
export type Face = number[]

let apiP: Promise<any> | null = null
async function api() {
  return (apiP ??= (async () => {
    const mock = (window as any).__cfMockFaces
    if (mock) return { mock }
    const fa: any = await import('@vladmandic/face-api')
    try {
      await fa.tf.setBackend('webgl')
    } catch {}
    if (fa.tf.getBackend() !== 'webgl') await fa.tf.setBackend('cpu')
    await fa.tf.ready()
    const load = async (net: any, bin: string, man: string) => {
      const buf = await (await fetch(bin)).arrayBuffer()
      const m = JSON.parse(man)
      const map = fa.tf.io.decodeWeights(buf, m[0].weights)
      await net.loadFromWeightMap(map)
    }
    await load(fa.nets.tinyFaceDetector, tinyBin, tinyMan)
    await load(fa.nets.faceLandmark68TinyNet, lmBin, lmMan)
    return { fa }
  })().catch((e) => {
    apiP = null
    throw e
  }))
}

const avg = (pts: { x: number; y: number }[]) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length })

/** Detects faces in one image (canvas). Returns faces in 0..1 coordinates, biggest first. */
export async function detectFaces(img: HTMLCanvasElement | OffscreenCanvas, minScore = 0.3, inputSize = 416): Promise<Face[]> {
  const a = await api()
  const W = img.width
  const H = img.height
  if (a.mock) return a.mock(img) as Face[]
  const fa = a.fa
  const res = await fa.detectAllFaces(img, new fa.TinyFaceDetectorOptions({ inputSize, scoreThreshold: minScore })).withFaceLandmarks(true)
  const out: Face[] = []
  for (const r of res) {
    const b = r.detection.box
    const p = r.landmarks.positions as { x: number; y: number }[]
    const eL = avg(p.slice(36, 42))
    const eR = avg(p.slice(42, 48))
    const m = avg(p.slice(48, 60))
    const mw = Math.hypot(p[54].x - p[48].x, p[54].y - p[48].y)
    const nose = p[30]
    const roll = (Math.atan2(eR.y - eL.y, eR.x - eL.x) * 180) / Math.PI
    // sanity: eyes apart by a sensible share of the face, mouth below the eyes, not upside down
    const ed = Math.hypot(eR.x - eL.x, eR.y - eL.y)
    const below = (m.y - (eL.y + eR.y) / 2) / Math.max(1, b.height)
    if (ed / b.width < 0.22 || ed / b.width > 0.7 || below < 0.15 || Math.abs(roll) > 50) continue
    if (r.detection.score < 0.5 && b.width / W > 0.3) continue // big + unsure is usually a body or a cushion
    out.push([(b.x + b.width / 2) / W, (b.y + b.height / 2) / H, b.width / W, b.height / H, eL.x / W, eL.y / H, eR.x / W, eR.y / H, m.x / W, m.y / H, mw / W, nose.x / W, nose.y / H, roll])
  }
  return out.sort((x, y) => y[2] * y[3] - x[2] * x[3])
}

/** Runs the detector on a part of the image and maps faces back to whole-image coordinates. */
async function detectIn(img: HTMLCanvasElement, x0: number, y0: number, w: number, h: number, inputSize: number): Promise<Face[]> {
  const W = img.width
  const H = img.height
  x0 = Math.max(0, Math.round(x0))
  y0 = Math.max(0, Math.round(y0))
  w = Math.min(W - x0, Math.round(w))
  h = Math.min(H - y0, Math.round(h))
  if (w < 24 || h < 24) return []
  const cv = (detectIn as any).cv ?? ((detectIn as any).cv = document.createElement('canvas'))
  const k = Math.min(2.5, Math.max(1, inputSize / Math.max(w, h)))
  cv.width = Math.round(w * k)
  cv.height = Math.round(h * k)
  cv.getContext('2d')!.drawImage(img, x0, y0, w, h, 0, 0, cv.width, cv.height)
  const fs = await detectFaces(cv, 0.3, inputSize)
  const X = (u: number) => (x0 + u * w) / W
  const Y = (v: number) => (y0 + v * h) / H
  return fs.map((f) => [X(f[0]), Y(f[1]), (f[2] * w) / W, (f[3] * h) / H, X(f[4]), Y(f[5]), X(f[6]), Y(f[7]), X(f[8]), Y(f[9]), (f[10] * w) / W, X(f[11]), Y(f[12]), f[13]])
}

const overlaps = (a: Face, b: Face) => Math.hypot(a[0] - b[0], a[1] - b[1]) < Math.max(a[2], b[2]) * 0.6

/** Whole frame first; wide frames also in two halves now and then; faces we lost get a zoomed-in second look. */
async function detectFrame(img: HTMLCanvasElement, recent: Face[], i: number): Promise<Face[]> {
  const W = img.width
  const H = img.height
  const wide = W / H > 1.2
  const size = wide ? 544 : 416
  let faces = await detectFaces(img, 0.3, size)
  const add = (fs: Face[]) => {
    for (const f of fs) if (!faces.some((g) => overlaps(f, g))) faces.push(f)
  }
  if (wide && (i % 15 === 0 || faces.length === 0)) {
    add(await detectIn(img, 0, 0, W * 0.55, H, 416))
    add(await detectIn(img, W * 0.45, 0, W * 0.55, H, 416))
  }
  for (const r of recent) {
    if (faces.some((f) => overlaps(f, r))) continue
    const s = Math.max(r[2] * W, r[3] * H) * 2.6
    add(await detectIn(img, r[0] * W - s / 2, r[1] * H - s / 2, s, s, 256))
  }
  return faces.sort((x, y) => y[2] * y[3] - x[2] * x[3])
}

/** Finds and follows faces through the source range a clip uses. Saved per source file, so splits and copies share it. */
export async function trackFaces(clipId: string, onProgress?: (p: number, m: string) => void, signal?: { cancelled: boolean }): Promise<FaceTrack> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'video' && c.kind !== 'image')) throw new Error('Select a video or photo clip first.')
  onProgress?.(0, 'Loading the face finder…')
  await api()
  const W = a.width >= a.height ? 960 : 640
  const H = Math.max(2, Math.round((W * a.height) / Math.max(1, a.width)))
  if (c.kind === 'image') {
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const im = new Image()
    im.src = a.url
    await im.decode()
    cv.getContext('2d')!.drawImage(im, 0, 0, W, H)
    const f = await detectFrame(cv, [], 0)
    const tr: FaceTrack = { fps: 1, t0: 0, frames: [f.slice(0, 4).map(round)] }
    save(a.id, tr)
    return tr
  }
  const from = c.srcIn
  const to = Math.min(a.duration, c.srcIn + c.dur * c.speed)
  const fps = to - from <= 120 ? 10 : to - from <= 600 ? 6 : 4
  const n = Math.max(1, Math.ceil((to - from) * fps))
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('This clip has no picture.')
  const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill', poolSize: 2 })
  const ts = Array.from({ length: n }, (_, i) => from + i / fps)
  const raw: Face[][] = []
  const seen: { f: Face; at: number }[] = [] // faces seen in the last second, for zoomed re-checks
  let i = 0
  for await (const fr of sink.canvasesAtTimestamps(ts)) {
    if (signal?.cancelled) throw new Error('Cancelled.')
    const recent = seen.filter((x) => i - x.at <= fps).map((x) => x.f)
    const fs = fr ? await detectFrame(fr.canvas as HTMLCanvasElement, recent, i) : []
    for (const f of fs) {
      const k = seen.findIndex((x) => overlaps(x.f, f))
      if (k >= 0) seen[k] = { f, at: i }
      else seen.push({ f, at: i })
    }
    raw.push(fs)
    i++
    if (i % 4 === 0) onProgress?.(i / n, `Finding faces… ${Math.round((i / n) * 100)}%`)
  }
  const frames = smooth(follow(raw))
  const tr: FaceTrack = { fps, t0: from, frames }
  // merge with an existing track of the same file (other parts of it)
  const old = getState().project.faces?.[a.id]
  save(a.id, old && old.fps === fps ? merge(old, tr) : tr)
  onProgress?.(1, 'Done')
  return getState().project.faces![a.id]
}

const round = (f: Face) => f.map((v, k) => (k === 13 ? Math.round(v * 10) / 10 : Math.round(v * 10000) / 10000))

function save(assetId: string, tr: FaceTrack) {
  const faces = { ...(getState().project.faces ?? {}), [assetId]: tr }
  setProject({ faces })
}

function merge(a: FaceTrack, b: FaceTrack): FaceTrack {
  const t0 = Math.min(a.t0, b.t0)
  const end = Math.max(a.t0 + a.frames.length / a.fps, b.t0 + b.frames.length / b.fps)
  const n = Math.round((end - t0) * a.fps)
  const frames: (Face | null)[][] = Array.from({ length: n }, () => [])
  for (const tr of [a, b]) {
    const off = Math.round((tr.t0 - t0) * a.fps)
    tr.frames.forEach((f, i) => (frames[off + i] = f))
  }
  return { fps: a.fps, t0, frames }
}

/** Gives each person a stable slot (0 = the biggest face at the start) by following centres frame to frame. */
function follow(raw: Face[][]): (Face | null)[][] {
  const last: (Face | null)[] = []
  const lastSeen: number[] = []
  const out: (Face | null)[][] = []
  raw.forEach((faces, i) => {
    const row: (Face | null)[] = []
    // merge duplicate boxes of the same face
    const fs: Face[] = []
    for (const f of faces) if (!fs.some((g) => overlaps(f, g))) fs.push(f)
    // match by position AND size, closest pairs first
    const pairs: [number, number, number][] = []
    fs.slice(0, 6).forEach((f, fi) =>
      last.forEach((l, k) => {
        if (!l || i - lastSeen[k] > 15) return
        const d = Math.hypot(f[0] - l[0], f[1] - l[1])
        const ratio = f[2] / l[2]
        if (d < Math.min(f[2], l[2]) * 0.9 && ratio > 0.66 && ratio < 1.5) pairs.push([d, fi, k])
      }),
    )
    pairs.sort((a, b) => a[0] - b[0])
    const usedF = new Set<number>()
    const usedK = new Set<number>()
    for (const [, fi, k] of pairs) {
      if (usedF.has(fi) || usedK.has(k)) continue
      usedF.add(fi)
      usedK.add(k)
      row[k] = fs[fi]
    }
    fs.slice(0, 6).forEach((f, fi) => {
      if (usedF.has(fi)) return
      let k = last.findIndex((l, j) => !usedK.has(j) && (!l || i - lastSeen[j] > 30))
      if (k < 0) k = last.length
      if (k > 7) return
      usedK.add(k)
      row[k] = f
    })
    row.forEach((f, k) => {
      if (f) {
        last[k] = f
        lastSeen[k] = i
      }
    })
    out.push(row)
  })
  // keep people who are really there (flickering one-offs are false detections), most present first
  const count = new Map<number, number>()
  out.forEach((r) => r.forEach((f, k) => f && count.set(k, (count.get(k) ?? 0) + 1)))
  const best = Math.max(0, ...count.values())
  const keep = [...count.entries()].filter(([, n]) => n >= Math.max(2, Math.min(best * 0.25, raw.length * 0.15))).sort((a, b) => b[1] - a[1]).map(([k]) => k)
  return out.map((r) => keep.map((k) => r[k] ?? null))
}

/** Light smoothing (3-frame centred average) so stickers don't jitter. */
function smooth(fr: (Face | null)[][]): (Face | null)[][] {
  return fr.map((row, i) =>
    row.map((f, k) => {
      if (!f) return null
      const ns = [fr[i - 1]?.[k], f, fr[i + 1]?.[k]].filter(Boolean) as Face[]
      return round(f.map((_, j) => ns.reduce((s, n) => s + n[j], 0) / ns.length))
    }),
  )
}

/** Face `person` of a source file at source time st (interpolated), or null. */
export function faceAt(assetId: string | undefined, st: number, person = 0): Face | null {
  const tr = assetId ? getState().project.faces?.[assetId] : undefined
  if (!tr || !tr.frames.length) return null
  if (tr.frames.length === 1) return tr.frames[0][person] ?? null
  const x = (st - tr.t0) * tr.fps
  const i = Math.floor(x)
  const f = x - i
  const A = findNear(tr.frames, i, person, -1)
  const B = findNear(tr.frames, i + 1, person, 1)
  if (A && B && A[1] + B[1] <= 10) {
    const k = (f + A[1]) / (A[1] + B[1] + 1e-9)
    return A[0].map((v, j) => v + (B[0][j] - v) * Math.min(1, Math.max(0, k)))
  }
  if (A && A[1] <= 3) return A[0]
  if (B && B[1] <= 3) return B[0]
  return null
}

function findNear(frames: (Face | null)[][], i: number, p: number, dir: number): [Face, number] | null {
  for (let d = 0; d <= 10; d++) {
    const f = frames[i + dir * d]?.[p]
    if (f) return [f, d]
  }
  return null
}

/** How many people were found in this file's track. */
export function peopleIn(assetId?: string) {
  const tr = assetId ? getState().project.faces?.[assetId] : undefined
  if (!tr) return 0
  let n = 0
  for (const r of tr.frames) n = Math.max(n, r.filter(Boolean).length ? r.length : 0)
  return n
}

export const hasFaces = (c?: Clip) => !!(c?.assetId && getState().project.faces?.[c.assetId])

/** Source time a video clip shows at timeline time t. */
export const srcTime = (c: Clip, t: number) => (c.kind === 'video' ? (c.freeze ? c.srcIn : c.srcIn + (t - c.start) * c.speed) : 0)

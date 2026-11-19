// 3D photo zoom: an AI depth map splits a photo into a background plate (with the near things removed and
// filled in) and near layers; moving them at different speeds gives a camera-in-the-scene parallax.
import { depthMap } from './pro'
import { inpaint } from './inpaint'
import { getAsset, getState, setProject } from './store'
import { Clip } from './types'

interface Layers {
  w: number
  h: number
  plate: HTMLCanvasElement // background with near things filled in
  layers: { cv: HTMLCanvasElement; depth: number }[] // near layers, depth 0..1 (1 = nearest)
}

const built = new Map<string, Layers>()
const building = new Map<string, Promise<Layers | null>>()
let onReady = () => {}
export const setDepthReady = (f: () => void) => (onReady = f)

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

async function loadImage(url: string) {
  const im = new Image()
  im.src = url
  await im.decode()
  return im
}

/** Runs the depth model on a photo and saves the depth map in the project (so it survives reloads). */
export async function measureDepth(assetId: string, status?: (m: string) => void): Promise<void> {
  const a = getAsset(assetId)
  if (!a || a.kind !== 'image') throw new Error('3D zoom works on photos.')
  const im = await loadImage(a.url)
  const k = Math.min(1, 518 / Math.max(im.naturalWidth, im.naturalHeight))
  const w = Math.round(im.naturalWidth * k)
  const h = Math.round(im.naturalHeight * k)
  const c = canvas(w, h)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(im, 0, 0, w, h)
  const d = await depthMap(g.getImageData(0, 0, w, h).data, w, h, status)
  const out = canvas(w, h)
  const og = out.getContext('2d')!
  const id = og.createImageData(w, h)
  for (let i = 0; i < d.length; i++) {
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = d[i]
    id.data[i * 4 + 3] = 255
  }
  og.putImageData(id, 0, 0)
  const depths = { ...(getState().project.depths ?? {}), [assetId]: out.toDataURL('image/png') }
  setProject({ depths })
  built.delete(assetId)
}

/** Builds the layers (once per photo; ~1 s). */
function build(assetId: string): Promise<Layers | null> {
  let p = building.get(assetId)
  if (p) return p
  p = (async () => {
    const a = getAsset(assetId)
    const dm = getState().project.depths?.[assetId]
    if (!a || !dm) return null
    const im = await loadImage(a.url)
    const dimg = await loadImage(dm)
    const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight))
    const w = Math.round(im.naturalWidth * k)
    const h = Math.round(im.naturalHeight * k)
    const base = canvas(w, h)
    const bg = base.getContext('2d', { willReadFrequently: true })!
    bg.drawImage(im, 0, 0, w, h)
    const dc = canvas(w, h)
    const dg = dc.getContext('2d', { willReadFrequently: true })!
    dg.filter = 'blur(1px)'
    dg.drawImage(dimg, 0, 0, w, h)
    const D = dg.getImageData(0, 0, w, h).data
    const dep = new Float32Array(w * h)
    for (let i = 0; i < dep.length; i++) dep[i] = D[i * 4] / 255
    const sorted = Array.from(dep).sort((x, y) => x - y)
    const q = (f: number) => sorted[Math.floor(f * (sorted.length - 1))]
    const lo = q(0.02)
    const hi = q(0.98)
    for (let i = 0; i < dep.length; i++) dep[i] = Math.max(0, Math.min(1, (dep[i] - lo) / Math.max(1e-3, hi - lo)))
    // near/far split at the natural gap in the depth histogram (Otsu)
    const hist = new Float64Array(64)
    for (const v of dep) hist[Math.min(63, Math.floor(v * 64))]++
    let sumAll = 0
    for (let i = 0; i < 64; i++) sumAll += i * hist[i]
    let wB = 0
    let sumB = 0
    let best = -1
    let bi = 32
    for (let i = 0; i < 63; i++) {
      wB += hist[i]
      if (!wB) continue
      const wF = dep.length - wB
      if (!wF) break
      sumB += i * hist[i]
      const mB = sumB / wB
      const mF = (sumAll - sumB) / wF
      const between = wB * wF * (mB - mF) ** 2
      if (between > best) {
        best = between
        bi = i
      }
    }
    let t1 = (bi + 1) / 64
    // keep the near part a sensible size (not the whole photo, not a speck)
    const nearShare = (t: number) => dep.reduce((s2, v) => s2 + (v > t ? 1 : 0), 0) / dep.length
    while (nearShare(t1) > 0.5 && t1 < 0.9) t1 += 0.03
    while (nearShare(t1) < 0.05 && t1 > 0.1) t1 -= 0.03
    const t2 = Math.min(0.95, t1 + (1 - t1) * 0.5)
    const src = bg.getImageData(0, 0, w, h)
    // near layers with soft edges
    const layer = (from: number, to: number, depth: number) => {
      const cv = canvas(w, h)
      const g = cv.getContext('2d')!
      const id = g.createImageData(w, h)
      for (let i = 0; i < dep.length; i++) {
        const v = dep[i]
        const a2 = Math.max(0, Math.min(1, (v - from) / 0.04)) * (to >= 1 ? 1 : Math.max(0, Math.min(1, (to - v) / 0.04 + 1)))
        if (a2 <= 0) continue
        id.data[i * 4] = src.data[i * 4]
        id.data[i * 4 + 1] = src.data[i * 4 + 1]
        id.data[i * 4 + 2] = src.data[i * 4 + 2]
        id.data[i * 4 + 3] = a2 * 255
      }
      g.putImageData(id, 0, 0)
      return { cv, depth }
    }
    // stacked: the mid layer holds everything nearer than t1, the top layer everything nearer than t2 (no seams)
    const layers = [layer(t1, 1, (t1 + t2) / 2), layer(t2, 1, (t2 + 1) / 2)]
    // background plate: remove everything nearer than t1 (a bit bigger) and fill it in
    const mask = new Uint8Array(w * h)
    for (let i = 0; i < dep.length; i++) if (dep[i] > t1 - 0.03) mask[i] = 1
    const grow = Math.max(2, Math.round(w / 200))
    const m2 = new Uint8Array(mask)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (mask[y * w + x])
          for (let dy = -grow; dy <= grow; dy++) {
            const yy = y + dy
            if (yy < 0 || yy >= h) continue
            for (let dx = -grow; dx <= grow; dx++) {
              const xx = x + dx
              if (xx >= 0 && xx < w) m2[yy * w + xx] = 1
            }
          }
    const plateData = new Uint8ClampedArray(src.data)
    // the near part can be most of the photo – then just blur-fill instead of a long texture fill
    const share = m2.reduce((s, v) => s + v, 0) / m2.length
    const plate = canvas(w, h)
    const pg = plate.getContext('2d')!
    if (share < 0.6) {
      await inpaint(plateData, w, h, m2)
      // only the part truly hidden behind near things keeps the fill; everywhere else stays the real photo
      for (let i = 0; i < dep.length; i++)
        if (dep[i] <= t1 - 0.06) {
          plateData[i * 4] = src.data[i * 4]
          plateData[i * 4 + 1] = src.data[i * 4 + 1]
          plateData[i * 4 + 2] = src.data[i * 4 + 2]
        }
      pg.putImageData(new ImageData(plateData, w, h), 0, 0)
    } else {
      pg.filter = `blur(${Math.round(w / 40)}px)`
      pg.drawImage(base, 0, 0)
      pg.filter = 'none'
    }
    return { w, h, plate, layers }
  })().then((r) => {
    if (r) built.set(assetId, r)
    building.delete(assetId)
    onReady()
    return r
  })
  building.set(assetId, p)
  return p
}

/** Waits until every 3D-zoom clip's layers are ready (before export). */
export async function prepareDepth() {
  const ids = new Set(getState().project.clips.filter((c) => c.depth3d && c.assetId).map((c) => c.assetId!))
  await Promise.all([...ids].map((id) => (built.has(id) ? null : build(id))))
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2)

/** Draws the clip as a moving 3D photo in its box (local coordinates). Returns false while layers are being made. */
export function drawDepth(ctx: CanvasRenderingContext2D, c: Clip, lt: number, bw: number, bh: number, srcRect: [number, number, number, number] | null, iw: number): boolean {
  const L = c.assetId ? built.get(c.assetId) : undefined
  if (!L) {
    if (c.assetId && getState().project.depths?.[c.assetId]) void build(c.assetId)
    return false
  }
  const o = c.depth3d!
  const u = ease(Math.min(1, Math.max(0, lt / Math.max(0.5, c.dur))))
  const A = o.amt
  // per-layer camera: near layers move/scale more than the background
  const cam = (d: number) => {
    const zIn = 1 + A * (0.06 + 0.22 * d) * u
    const zOut = 1 + A * (0.06 + 0.22 * d) * (1 - u)
    switch (o.dir) {
      case 'out':
        return { s: zOut + 0.04, x: 0, y: 0 }
      case 'left':
        return { s: 1.08 + 0.04 * d, x: A * (0.5 - u) * (0.05 + 0.14 * d), y: 0 }
      case 'right':
        return { s: 1.08 + 0.04 * d, x: -A * (0.5 - u) * (0.05 + 0.14 * d), y: 0 }
      case 'orbit': {
        const ang = u * Math.PI * 2
        return { s: 1.1 + 0.05 * d, x: Math.sin(ang) * A * (0.03 + 0.08 * d), y: Math.cos(ang) * A * (0.015 + 0.04 * d) }
      }
      default:
        return { s: zIn + 0.02, x: 0, y: 0 }
    }
  }
  // source crop (same crop as the clip) mapped onto the layer size
  const k = L.w / iw
  const r = srcRect ? srcRect.map((v) => v * k) : [0, 0, L.w, L.h]
  const put = (cv: HTMLCanvasElement, d: number) => {
    const t = cam(d)
    const w = bw * t.s
    const h = bh * t.s
    ctx.drawImage(cv, r[0], r[1], r[2], r[3], -w / 2 + t.x * bw, -h / 2 + t.y * bh, w, h)
  }
  put(L.plate, 0)
  for (const l of L.layers) put(l.cv, l.depth)
  return true
}

export const hasDepth = (assetId?: string) => !!(assetId && getState().project.depths?.[assetId])

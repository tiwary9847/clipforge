// Per-pixel colour grading: tone curve, shadows/highlights, colour wheels, white balance,
// vibrance and .cube 3D LUTs. Builds 256-entry tables once per settings and applies them fast.
import { Grade } from './types'

export const DEFAULT_GRADE: Grade = {
  temp: 0,
  tint: 0,
  shadows: 0,
  highlights: 0,
  vibrance: 0,
  lift: '#000000',
  liftAmt: 0,
  gain: '#ffffff',
  gainAmt: 0,
  curve: [0, 0.25, 0.5, 0.75, 1],
  lutMix: 1,
}

export const GRADE_LOOKS: { id: string; name: string; g: Partial<Grade> }[] = [
  { id: 'teal', name: 'Teal & orange', g: { lift: '#0f6b75', liftAmt: 0.35, gain: '#ff9a3c', gainAmt: 0.3, curve: [0.02, 0.22, 0.5, 0.8, 0.98], vibrance: 0.2 } },
  { id: 'film', name: 'Film fade', g: { curve: [0.1, 0.28, 0.5, 0.74, 0.92], temp: 0.15, vibrance: -0.15 } },
  { id: 'punch', name: 'Punchy', g: { curve: [0, 0.2, 0.5, 0.82, 1], vibrance: 0.45 } },
  { id: 'moody', name: 'Moody', g: { curve: [0.03, 0.2, 0.44, 0.72, 0.95], temp: -0.2, vibrance: -0.25, shadows: -0.2 } },
  { id: 'golden', name: 'Golden hour', g: { temp: 0.55, tint: 0.1, gain: '#ffc070', gainAmt: 0.3, vibrance: 0.2 } },
  { id: 'bright', name: 'Bright & airy', g: { curve: [0.06, 0.32, 0.58, 0.82, 1], shadows: 0.25, vibrance: -0.1, temp: -0.05 } },
]

export const isIdentity = (g?: Grade) =>
  !g ||
  (!g.temp && !g.tint && !g.shadows && !g.highlights && !g.vibrance && !(g.liftAmt > 0) && !(g.gainAmt > 0) && !(g.lut && g.lutMix > 0) &&
    g.curve.every((v, i) => Math.abs(v - i / 4) < 1e-3))

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

function curveAt(pts: number[], x: number) {
  // Catmull-Rom through 5 evenly spaced points
  const f = x * 4
  const i = Math.min(3, Math.floor(f))
  const t = f - i
  const p = (k: number) => pts[Math.max(0, Math.min(4, k))]
  const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2)
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
}

export function buildTables(g: Grade): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const L = hex(g.lift).map((v) => (v - 0.5) * 2) // -1..1 per channel
  const G = hex(g.gain).map((v) => (v - 0.5) * 2)
  const wb = [1 + g.temp * 0.18, 1 - g.tint * 0.14, 1 - g.temp * 0.18]
  const out = [new Uint8ClampedArray(256), new Uint8ClampedArray(256), new Uint8ClampedArray(256)] as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray]
  for (let v = 0; v < 256; v++) {
    for (let ch = 0; ch < 3; ch++) {
      let x = v / 255
      x *= wb[ch]
      x += g.shadows * 0.35 * Math.pow(1 - Math.min(1, x), 3)
      x += g.highlights * 0.35 * Math.pow(Math.min(1, Math.max(0, x)), 3)
      x += L[ch] * g.liftAmt * 0.18 * (1 - Math.min(1, x))
      x *= 1 + G[ch] * g.gainAmt * 0.25 * Math.min(1, x)
      x = curveAt(g.curve, Math.max(0, Math.min(1, x)))
      out[ch][v] = Math.round(x * 255)
    }
  }
  return out
}

export function parseCube(text: string): { size: number; data: number[] } {
  let size = 0
  const data: number[] = []
  let dmin = [0, 0, 0]
  let dmax = [1, 1, 1]
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    if (/^LUT_3D_SIZE/i.test(l)) size = parseInt(l.split(/\s+/)[1])
    else if (/^DOMAIN_MIN/i.test(l)) dmin = l.split(/\s+/).slice(1).map(Number)
    else if (/^DOMAIN_MAX/i.test(l)) dmax = l.split(/\s+/).slice(1).map(Number)
    else if (/^[-\d.]/.test(l)) {
      const p = l.split(/\s+/).map(Number)
      if (p.length >= 3) for (let c = 0; c < 3; c++) data.push((p[c] - dmin[c]) / (dmax[c] - dmin[c] || 1))
    }
  }
  if (!size || size > 65 || data.length !== size * size * size * 3) throw new Error('This isn’t a 3D .cube LUT this app can read (needs LUT_3D_SIZE up to 65).')
  return { size, data: data.map((v) => Math.round(v * 1000) / 1000) }
}

const cache = new WeakMap<Grade, { t: ReturnType<typeof buildTables>; lut?: Float32Array }>()

export function gradePixels(d: Uint8ClampedArray, g: Grade) {
  let e = cache.get(g)
  if (!e) {
    e = { t: buildTables(g), lut: g.lut ? Float32Array.from(g.lut.data) : undefined }
    cache.set(g, e)
  }
  const [tr, tg, tb] = e.t
  const vib = g.vibrance
  const lut = g.lut && g.lutMix > 0 ? e.lut : undefined
  const N = g.lut?.size ?? 0
  const mix = g.lutMix
  for (let i = 0; i < d.length; i += 4) {
    let r = tr[d[i]], gg = tg[d[i + 1]], b = tb[d[i + 2]]
    if (vib) {
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b)
      const sat = mx ? (mx - mn) / mx : 0
      const k = vib * (vib > 0 ? 1 - sat : 1) * 0.8
      const avg = (r + gg + b) / 3
      r = avg + (r - avg) * (1 + k)
      gg = avg + (gg - avg) * (1 + k)
      b = avg + (b - avg) * (1 + k)
    }
    if (lut) {
      const fr = Math.max(0, Math.min(1, r / 255)) * (N - 1)
      const fg = Math.max(0, Math.min(1, gg / 255)) * (N - 1)
      const fb = Math.max(0, Math.min(1, b / 255)) * (N - 1)
      const r0 = Math.min(N - 2, fr | 0), g0 = Math.min(N - 2, fg | 0), b0 = Math.min(N - 2, fb | 0)
      const dr = fr - r0, dg = fg - g0, db = fb - b0
      const o = [0, 0, 0]
      for (let c = 0; c < 3; c++) {
        const at = (ri: number, gi: number, bi: number) => lut[((bi * N + gi) * N + ri) * 3 + c]
        const c00 = at(r0, g0, b0) * (1 - dr) + at(r0 + 1, g0, b0) * dr
        const c10 = at(r0, g0 + 1, b0) * (1 - dr) + at(r0 + 1, g0 + 1, b0) * dr
        const c01 = at(r0, g0, b0 + 1) * (1 - dr) + at(r0 + 1, g0, b0 + 1) * dr
        const c11 = at(r0, g0 + 1, b0 + 1) * (1 - dr) + at(r0 + 1, g0 + 1, b0 + 1) * dr
        o[c] = ((c00 * (1 - dg) + c10 * dg) * (1 - db) + (c01 * (1 - dg) + c11 * dg) * db) * 255
      }
      r = r + (o[0] - r) * mix
      gg = gg + (o[1] - gg) * mix
      b = b + (o[2] - b) * mix
    }
    d[i] = r
    d[i + 1] = gg
    d[i + 2] = b
  }
}

/** RGB + luma histogram of a canvas, 64 bins each, normalised. */
export function histogram(cv: HTMLCanvasElement): number[][] {
  const w = 160
  const h = Math.max(1, Math.round((w * cv.height) / cv.width))
  const t = document.createElement('canvas')
  t.width = w
  t.height = h
  const g = t.getContext('2d', { willReadFrequently: true })!
  g.drawImage(cv, 0, 0, w, h)
  const d = g.getImageData(0, 0, w, h).data
  const bins = [0, 1, 2, 3].map(() => new Array(64).fill(0))
  for (let i = 0; i < d.length; i += 4) {
    bins[0][d[i] >> 2]++
    bins[1][d[i + 1] >> 2]++
    bins[2][d[i + 2] >> 2]++
    bins[3][((d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8) >> 2]++
  }
  return bins.map((b) => {
    const m = Math.max(...b.slice(1, 63), 1)
    return b.map((v) => Math.min(1, v / m))
  })
}

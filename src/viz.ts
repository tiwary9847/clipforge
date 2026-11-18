// Audio analysis for the visualizer: 16 log-spaced frequency bands at 30 frames/second per source file.
import { decodeMonoRange } from './processing'
import { Asset, Clip } from './types'
import { getAsset, getState } from './store'

export const BANDS = 16
const RATE = 30
const cache = new Map<string, Uint8Array | 'busy' | 'none'>()
let onReady: (() => void) | null = null
export const setVizReady = (f: () => void) => (onReady = f)

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar
        im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
}

async function analyse(a: Asset): Promise<Uint8Array | null> {
  const sr = 11025
  const x = await decodeMonoRange(a, 0, a.duration, sr).catch(() => null)
  if (!x || x.length < 1024) return null
  const N = 1024
  const frames = Math.floor((x.length / sr) * RATE)
  const out = new Uint8Array(frames * BANDS)
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
  // log-spaced band edges between ~40 Hz and ~5 kHz
  const edges = Array.from({ length: BANDS + 1 }, (_, b) => Math.round((40 * Math.pow(5000 / 40, b / BANDS) * N) / sr))
  let peak = 1e-6
  const raw = new Float32Array(frames * BANDS)
  for (let f = 0; f < frames; f++) {
    const c = Math.floor((f / RATE) * sr)
    for (let i = 0; i < N; i++) {
      const s = c - N / 2 + i
      re[i] = s >= 0 && s < x.length ? x[s] * win[i] : 0
      im[i] = 0
    }
    fft(re, im)
    for (let b = 0; b < BANDS; b++) {
      let e = 0
      const lo = Math.max(1, edges[b])
      const hi = Math.max(lo + 1, edges[b + 1])
      for (let k = lo; k < hi; k++) e += Math.hypot(re[k], im[k])
      const v = Math.log1p((e / (hi - lo)) * 4)
      raw[f * BANDS + b] = v
      if (v > peak) peak = v
    }
    if (f % 400 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  for (let i = 0; i < raw.length; i++) out[i] = Math.min(255, Math.round((raw[i] / peak) * 255))
  return out
}

function ensure(a: Asset) {
  const c = cache.get(a.id)
  if (c) return c
  cache.set(a.id, 'busy')
  void analyse(a).then((d) => {
    cache.set(a.id, d ?? 'none')
    onReady?.()
  })
  return 'busy'
}

/** Which clip feeds the visualizer at time t: music first, then voice/audio, then the main video. */
function sourceAt(t: number): Clip | undefined {
  const order = ['a2', 'a1', 'v1', 'v2', 'v3', 'v4']
  return getState()
    .project.clips.filter((c) => (c.kind === 'audio' || c.kind === 'video') && c.volume > 0 && !c.freeze && t >= c.start && t < c.start + c.dur)
    .sort((a, b) => order.indexOf(a.track) - order.indexOf(b.track))[0]
}

/** 16 band levels (0..1) for the project sound at timeline time t. */
export function levelsAt(t: number): number[] {
  const c = sourceAt(t)
  const a = c && getAsset(c.assetId)
  const zero = new Array(BANDS).fill(0)
  if (!c || !a) return zero
  const d = ensure(a)
  if (typeof d === 'string') return zero
  const st = c.srcIn + (t - c.start) * c.speed
  const f = Math.floor(st * RATE)
  const frames = d.length / BANDS
  if (f < 0 || f >= frames) return zero
  const out: number[] = []
  for (let b = 0; b < BANDS; b++) {
    // light smoothing with the previous frame so bars don't flicker
    const v = d[f * BANDS + b] / 255
    const p = f > 0 ? d[(f - 1) * BANDS + b] / 255 : v
    out.push(v * 0.7 + p * 0.3)
  }
  return out
}

/** Analyse every source the visualizer could need (called before export). */
export async function prepareViz() {
  const st = getState()
  if (!st.project.clips.some((c) => c.shape?.startsWith('viz'))) return
  const ids = new Set(st.project.clips.filter((c) => c.kind === 'audio' || c.kind === 'video').map((c) => c.assetId!))
  for (const id of ids) {
    const a = getAsset(id)
    if (!a) continue
    if (!cache.has(a.id)) ensure(a)
    while (cache.get(a.id) === 'busy') await new Promise((r) => setTimeout(r, 50))
  }
}

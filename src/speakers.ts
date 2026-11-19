// Who talks when: finds speech, describes each half-second by voice pitch + timbre, and groups it into speakers.
// Works best for people whose voices differ (e.g. a man and a woman); two similar voices can get mixed up.
import { decodeMono } from './media'
import { fft } from './dsp'
import { getAsset, getClip, getState, setProject } from './store'
import { Clip, SpeakerTrack } from './types'

export const SPEAKER_COLORS = ['#ffe500', '#4fd1ff', '#ff7ad9', '#8dff6a']

const SR = 16000
const HOP = 0.25 // seconds per analysis step
const WIN = 0.5 // seconds per voice sample

/** Pitch (Hz) of a short frame by normalised autocorrelation, or 0 if unvoiced. */
function pitch(x: Float32Array, o: number, n: number): number {
  const minLag = Math.floor(SR / 400)
  const maxLag = Math.floor(SR / 70)
  let e0 = 0
  for (let i = 0; i < n; i++) e0 += x[o + i] * x[o + i]
  if (e0 < 1e-6) return 0
  let best = 0
  let bl = 0
  for (let L = minLag; L <= maxLag; L++) {
    let r = 0
    let e1 = 0
    for (let i = 0; i < n - L; i++) {
      r += x[o + i] * x[o + i + L]
      e1 += x[o + i + L] * x[o + i + L]
    }
    const v = r / Math.sqrt(e0 * e1 + 1e-12)
    if (v > best) {
      best = v
      bl = L
    }
  }
  if (best < 0.45 || !bl) return 0
  // prefer the fundamental over an octave-down match
  const half = Math.round(bl / 2)
  if (half >= minLag) {
    let r = 0
    let e1 = 0
    for (let i = 0; i < n - half; i++) {
      r += x[o + i] * x[o + i + half]
      e1 += x[o + i + half] * x[o + i + half]
    }
    if (r / Math.sqrt(e0 * e1 + 1e-12) > best * 0.9) bl = half
  }
  return SR / bl
}

/** 12 log band energies (rough timbre) of a 512-sample frame. */
function bands(x: Float32Array, o: number): number[] {
  const N = 512
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  for (let i = 0; i < N; i++) re[i] = (x[o + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
  fft(re, im)
  const edges = [80, 150, 250, 400, 600, 850, 1150, 1500, 2000, 2700, 3600, 5000, 7000].map((f) => Math.round((f / SR) * N))
  const out: number[] = []
  for (let b = 0; b < 12; b++) {
    let e = 1e-9
    for (let k = edges[b]; k < edges[b + 1]; k++) e += re[k] * re[k] + im[k] * im[k]
    out.push(Math.log(e))
  }
  const m = out.reduce((s, v) => s + v, 0) / out.length
  return out.map((v) => v - m) // loudness-independent shape
}

interface Sample {
  t: number // seconds from start of the analysed audio
  f: number[] // features
  f0: number
}

/** Voice samples (only where someone is talking). */
function samples(x: Float32Array): Sample[] {
  const hop = Math.round(HOP * SR)
  const win = Math.round(WIN * SR)
  // loudness gate relative to the quiet floor
  const rms: number[] = []
  for (let o = 0; o + win <= x.length; o += hop) {
    let e = 0
    for (let i = o; i < o + win; i += 2) e += x[i] * x[i]
    rms.push(Math.sqrt(e / (win / 2)))
  }
  const sorted = [...rms].sort((a, b) => a - b)
  // gate between the quiet floor and typical speech – capped so a file that is mostly talking still passes
  const floor = sorted[Math.floor(sorted.length * 0.05)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? 0
  const gate = Math.max(Math.min(floor * 3, loud * 0.3), loud * 0.08, 0.002)
  const out: Sample[] = []
  rms.forEach((r, k) => {
    if (r < gate) return
    const o = k * hop
    const f0s: number[] = []
    const bs: number[][] = []
    for (let j = o; j + 640 <= o + win; j += 800) {
      const p = pitch(x, j, 640)
      if (p) f0s.push(p)
      bs.push(bands(x, j))
    }
    if (f0s.length < 2) return // mostly unvoiced (music, noise, breaths)
    f0s.sort((a, b) => a - b)
    const f0 = f0s[Math.floor(f0s.length / 2)]
    const tb = bs[0].map((_, i) => bs.reduce((s, b) => s + b[i], 0) / bs.length)
    out.push({ t: k * HOP, f0, f: [Math.log(f0) * 4, ...tb.map((v) => v * 0.35)] })
  })
  return out
}

function kmeans(pts: number[][], k: number, iters = 40): { lab: number[]; cent: number[][]; inertia: number } {
  const d = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)
  // k-means++ start, deterministic order
  const cent: number[][] = [pts[0]]
  while (cent.length < k) {
    let bi = 0
    let bd = -1
    pts.forEach((p, i) => {
      const m = Math.min(...cent.map((c) => d(p, c)))
      if (m > bd) {
        bd = m
        bi = i
      }
    })
    cent.push(pts[bi])
  }
  let lab = pts.map(() => 0)
  for (let it = 0; it < iters; it++) {
    lab = pts.map((p) => {
      let b = 0
      let bd = Infinity
      cent.forEach((c, j) => {
        const v = d(p, c)
        if (v < bd) {
          bd = v
          b = j
        }
      })
      return b
    })
    for (let j = 0; j < k; j++) {
      const m = pts.filter((_, i) => lab[i] === j)
      if (m.length) cent[j] = m[0].map((_, q) => m.reduce((s, p) => s + p[q], 0) / m.length)
    }
  }
  const inertia = pts.reduce((s, p, i) => s + d(p, cent[lab[i]]), 0)
  return { lab, cent, inertia }
}

/** Splits audio into speaker turns. count = 0 → decide between 1 and 2 (or 3) automatically. */
export function diarize(x: Float32Array, count = 0): { segs: { s: number; e: number; spk: number }[]; speakers: number; f0: number[] } {
  const ss = samples(x)
  if (ss.length < 4) return { segs: [], speakers: 0, f0: [] }
  // standardise features
  const dim = ss[0].f.length
  const mean = Array.from({ length: dim }, (_, i) => ss.reduce((s, p) => s + p.f[i], 0) / ss.length)
  const sd = Array.from({ length: dim }, (_, i) => Math.sqrt(ss.reduce((s, p) => s + (p.f[i] - mean[i]) ** 2, 0) / ss.length) || 1)
  const pts = ss.map((p) => p.f.map((v, i) => ((v - mean[i]) / sd[i]) * (i === 0 ? 2.2 : 1)))
  let k = count
  if (!k) {
    const one = kmeans(pts, 1).inertia
    const two = kmeans(pts, 2)
    const three = kmeans(pts, 3)
    // a real second voice cuts the spread a lot and differs clearly in pitch
    const f0s = [0, 1].map((j) => median(ss.filter((_, i) => two.lab[i] === j).map((s) => s.f0)))
    const ratio = Math.max(...f0s) / Math.max(1, Math.min(...f0s))
    k = two.inertia < one * 0.55 && ratio > 1.18 ? (three.inertia < two.inertia * 0.6 ? 3 : 2) : 1
  }
  const km = k > 1 ? kmeans(pts, k) : { lab: pts.map(() => 0) }
  // smooth labels (majority of 5 neighbours) so a single odd sample doesn't flip the speaker
  const lab = km.lab.map((l, i) => {
    const near = km.lab.slice(Math.max(0, i - 2), i + 3).filter((_, j) => Math.abs(ss[Math.max(0, i - 2) + j].t - ss[i].t) <= 1.2)
    const cnt = new Map<number, number>()
    near.forEach((v) => cnt.set(v, (cnt.get(v) ?? 0) + 1))
    return [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0]
  })
  // number speakers in order of first appearance
  const order: number[] = []
  lab.forEach((l) => !order.includes(l) && order.push(l))
  const segs: { s: number; e: number; spk: number }[] = []
  ss.forEach((p, i) => {
    const spk = order.indexOf(lab[i])
    const s = p.t
    const e = p.t + WIN
    const last = segs[segs.length - 1]
    if (last && last.spk === spk && s - last.e < 0.6) last.e = e
    else segs.push({ s, e, spk })
  })
  // drop tiny turns into their neighbours
  const clean = segs.filter((g, i) => g.e - g.s >= 0.6 || (segs[i - 1]?.spk !== g.spk && segs[i + 1]?.spk !== g.spk && g.e - g.s >= 0.4))
  const f0 = order.map((l) => median(ss.filter((_, i) => lab[i] === l).map((s) => s.f0)))
  return { segs: clean, speakers: order.length, f0 }
}

const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0)

/** Finds speakers in the parts of each source file the given clips use; stores turns in source seconds. */
export async function findSpeakers(clips: Clip[], count = 0, onProgress?: (m: string) => void): Promise<{ speakers: number; f0: number[] }> {
  const byAsset = new Map<string, Clip[]>()
  for (const c of clips) if (c.assetId && (c.kind === 'video' || c.kind === 'audio')) byAsset.set(c.assetId, [...(byAsset.get(c.assetId) ?? []), c])
  if (!byAsset.size) throw new Error('Add a video or audio clip with people talking first.')
  // analyse all files together so "Speaker 1" means the same person everywhere
  const parts: { aid: string; from: number; x: Float32Array }[] = []
  let n = 0
  for (const [aid, cs] of byAsset) {
    const a = getAsset(aid)!
    const from = Math.min(...cs.map((c) => c.srcIn))
    const to = Math.min(a.duration, Math.max(...cs.map((c) => c.srcIn + c.dur * c.speed)))
    onProgress?.(`Listening to “${a.name}”…`)
    const x = await decodeMono(a, from, to, SR)
    if (x) {
      parts.push({ aid, from, x })
      n += x.length
    }
  }
  if (!parts.length) throw new Error('These clips have no sound.')
  const all = new Float32Array(n + parts.length * SR)
  let o = 0
  const offs: number[] = []
  for (const p of parts) {
    offs.push(o / SR)
    all.set(p.x, o)
    o += p.x.length + SR // 1 s of silence between files
  }
  onProgress?.('Telling the voices apart…')
  await new Promise((r) => setTimeout(r, 0))
  const res = diarize(all, count)
  const speakers: Record<string, SpeakerTrack> = { ...(getState().project.speakers ?? {}) }
  parts.forEach((p, i) => {
    const a = offs[i]
    const b = a + p.x.length / SR
    speakers[p.aid] = {
      segs: res.segs.filter((g) => g.e > a && g.s < b).map((g) => ({ s: +(Math.max(a, g.s) - a + p.from).toFixed(2), e: +(Math.min(b, g.e) - a + p.from).toFixed(2), spk: g.spk })),
    }
  })
  const names = getState().project.speakerNames ?? []
  setProject({ speakers, speakerNames: Array.from({ length: Math.max(res.speakers, names.length) }, (_, i) => names[i] ?? `Speaker ${i + 1}`) })
  return { speakers: res.speakers, f0: res.f0 }
}

/** Speaker talking at source time st of a file (or -1). */
export function speakerAt(assetId: string | undefined, st: number): number {
  const tr = assetId ? getState().project.speakers?.[assetId] : undefined
  if (!tr) return -1
  let best = -1
  let bd = 0.35
  for (const g of tr.segs) {
    if (st >= g.s && st < g.e) return g.spk
    const d = st < g.s ? g.s - st : st - g.e
    if (d < bd) {
      bd = d
      best = g.spk
    }
  }
  return best
}

/** Who talks most between source times a and b (or -1). */
export function speakerDuring(assetId: string | undefined, a: number, b: number): number {
  const tr = assetId ? getState().project.speakers?.[assetId] : undefined
  if (!tr) return -1
  const tot = new Map<number, number>()
  for (const g of tr.segs) {
    const o = Math.min(b, g.e) - Math.max(a, g.s)
    if (o > 0) tot.set(g.spk, (tot.get(g.spk) ?? 0) + o)
  }
  if (!tot.size) return speakerAt(assetId, (a + b) / 2)
  return [...tot.entries()].sort((x, y) => y[1] - x[1])[0][0]
}

/** Speaker turns on the timeline (timeline seconds) for a clip. */
export function turnsOnTimeline(c: Clip): { s: number; e: number; spk: number }[] {
  const tr = c.assetId ? getState().project.speakers?.[c.assetId] : undefined
  if (!tr) return []
  const a = c.srcIn
  const b = c.srcIn + c.dur * c.speed
  return tr.segs
    .filter((g) => g.e > a && g.s < b)
    .map((g) => ({ s: c.start + (Math.max(a, g.s) - a) / c.speed, e: c.start + (Math.min(b, g.e) - a) / c.speed, spk: g.spk }))
}

export const speakerName = (i: number) => getState().project.speakerNames?.[i] ?? `Speaker ${i + 1}`
export const clipHasSpeakers = (c?: Clip) => !!(c?.assetId && getState().project.speakers?.[c.assetId])
export { getClip }

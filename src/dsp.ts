// Pure signal-processing helpers (no DOM) so they can be unit-tested in node.

/** In-place radix-2 complex FFT. n must be a power of two. */
export function fft(re: Float32Array, im: Float32Array, inverse = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const xr = re[b] * cr - im[b] * ci
        const xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n
      im[i] /= n
    }
}

function hann(n: number) {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  return w
}

/**
 * Spectral-subtraction noise reduction. The noise profile is learned from the quietest
 * frames of the clip itself, so it works best when there is some background-only audio.
 * strength 0..1.
 */
export function denoise(x: Float32Array, strength: number): Float32Array {
  const N = 1024
  const HOP = 256
  const win = hann(N)
  const bins = N / 2 + 1
  const frames = Math.max(1, Math.ceil((x.length + N) / HOP))
  const padded = new Float32Array(frames * HOP + N)
  padded.set(x, N / 2)
  const mags: Float32Array[] = []
  const phases: Float32Array[] = []
  const energies: number[] = []
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) {
      re[i] = padded[f * HOP + i] * win[i]
      im[i] = 0
    }
    fft(re, im)
    const m = new Float32Array(bins)
    const p = new Float32Array(bins)
    let e = 0
    for (let k = 0; k < bins; k++) {
      m[k] = Math.hypot(re[k], im[k])
      p[k] = Math.atan2(im[k], re[k])
      e += m[k] * m[k]
    }
    mags.push(m)
    phases.push(p)
    energies.push(e)
  }
  // noise profile = mean magnitude of the quietest 12% of frames
  const order = energies.map((e, i) => [e, i] as const).sort((a, b) => a[0] - b[0])
  const nq = Math.max(1, Math.floor(frames * 0.12))
  const noise = new Float32Array(bins)
  for (let q = 0; q < nq; q++) {
    const m = mags[order[q][1]]
    for (let k = 0; k < bins; k++) noise[k] += m[k] / nq
  }
  const over = 1 + strength * 2.2
  const floor = 0.04 + (1 - strength) * 0.2
  const out = new Float32Array(padded.length)
  const norm = new Float32Array(padded.length)
  const prevGain = new Float32Array(bins).fill(1)
  for (let f = 0; f < frames; f++) {
    const m = mags[f]
    const p = phases[f]
    for (let k = 0; k < bins; k++) {
      let g = m[k] > 1e-9 ? 1 - (over * noise[k]) / m[k] : 0
      g = g < floor ? floor : g > 1 ? 1 : g
      // light temporal smoothing avoids "musical noise" warble
      g = prevGain[k] * 0.5 + g * 0.5
      prevGain[k] = g
      const mm = m[k] * g
      re[k] = mm * Math.cos(p[k])
      im[k] = mm * Math.sin(p[k])
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k]
        im[N - k] = -im[k]
      }
    }
    im[0] = 0
    im[N / 2] = 0
    fft(re, im, true)
    for (let i = 0; i < N; i++) {
      out[f * HOP + i] += re[i] * win[i]
      norm[f * HOP + i] += win[i] * win[i]
    }
  }
  const y = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) {
    const j = i + N / 2
    y[i] = norm[j] > 1e-6 ? out[j] / norm[j] : 0
  }
  return y
}

/** RMS envelope, one value per `hop` samples. */
export function rmsEnvelope(x: Float32Array, hop: number): Float32Array {
  const n = Math.ceil(x.length / hop)
  const e = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    const a = i * hop
    const b = Math.min(x.length, a + hop)
    for (let j = a; j < b; j++) s += x[j] * x[j]
    e[i] = Math.sqrt(s / Math.max(1, b - a))
  }
  return e
}

/**
 * Turns "is someone speaking" into a gain curve for the music: dips to `duckGain`
 * while the voice envelope is above a level that adapts to the recording, with
 * smooth attack and release. Times are in seconds from the start of the envelope.
 */
export function duckCurve(env: Float32Array, hopSec: number, duckGain: number, attack = 0.15, release = 0.5): { t: number; g: number }[] {
  if (!env.length) return []
  const sorted = Array.from(env).sort((a, b) => a - b)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0
  const thr = Math.max(0.006, p95 * 0.18)
  const holdFrames = Math.round(0.25 / hopSec)
  const active = new Uint8Array(env.length)
  let hold = 0
  for (let i = 0; i < env.length; i++) {
    if (env[i] > thr) hold = holdFrames
    active[i] = hold > 0 ? 1 : 0
    if (hold > 0) hold--
  }
  const gs = new Float32Array(env.length)
  let g = 1
  for (let i = 0; i < env.length; i++) {
    const target = active[i] ? duckGain : 1
    const rate = (1 - duckGain) / (target < g ? attack : release)
    const step = rate * hopSec
    g = target < g ? Math.max(target, g - step) : Math.min(target, g + step)
    gs[i] = g
  }
  // keep every sample that is part of a ramp (plus its flat neighbours) so interpolation never cuts across a hold
  const pts: { t: number; g: number }[] = []
  for (let i = 0; i < gs.length; i++) {
    const moving = (i > 0 && Math.abs(gs[i] - gs[i - 1]) > 1e-4) || (i < gs.length - 1 && Math.abs(gs[i + 1] - gs[i]) > 1e-4)
    if (moving || i === 0 || i === gs.length - 1) pts.push({ t: +(i * hopSec).toFixed(3), g: +gs[i].toFixed(3) })
  }
  if (pts.length && pts[0].t > 0) pts.unshift({ t: 0, g: pts[0].g })
  return pts
}

/** Onset detection by spectral flux. Returns beat times in seconds. */
export function detectBeats(x: Float32Array, sr: number, minGap = 0.28): number[] {
  const N = 1024
  const HOP = 512
  const win = hann(N)
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  const bins = N / 2
  let prev = new Float32Array(bins)
  const flux: number[] = []
  // only look at the band where kick/snare/bass energy lives; ignores hiss
  const kmax = Math.min(bins, Math.floor((4000 / sr) * N))
  for (let s = 0; s + N <= x.length; s += HOP) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * win[i]
      im[i] = 0
    }
    fft(re, im)
    let f = 0
    const cur = new Float32Array(bins)
    for (let k = 1; k < kmax; k++) {
      cur[k] = Math.log(1 + 40 * Math.hypot(re[k], im[k]))
      const d = cur[k] - prev[k]
      if (d > 0) f += d
    }
    flux.push(f)
    prev = cur
  }
  const out: number[] = []
  const W = Math.round(0.5 / (HOP / sr))
  let last = -1e9
  for (let i = 1; i < flux.length - 1; i++) {
    if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue
    let sum = 0
    let sq = 0
    let n = 0
    for (let j = Math.max(0, i - W); j <= Math.min(flux.length - 1, i + W); j++) {
      sum += flux[j]
      sq += flux[j] * flux[j]
      n++
    }
    const mean = sum / n
    const sd = Math.sqrt(Math.max(0, sq / n - mean * mean))
    if (flux[i] > mean + 0.9 * sd && flux[i] > 0.5) {
      const t = (i * HOP + N / 2) / sr
      if (t - last >= minGap) {
        out.push(+t.toFixed(3))
        last = t
      }
    }
  }
  return out
}

/**
 * Translation of the content from frame `a` to frame `b` (grayscale w*h), by exhaustive
 * 2-D block matching with parabolic sub-pixel refinement. Positive dx means content moved right.
 */
export function frameShift(a: Uint8Array | Uint8ClampedArray, b: Uint8Array | Uint8ClampedArray, w: number, h: number, maxS: number): [number, number] {
  const n = 2 * maxS + 1
  const cost = new Float32Array(n * n)
  const x0 = maxS
  const x1 = w - maxS
  const y0 = maxS
  const y1 = h - maxS
  let best = Infinity
  let bi = maxS * n + maxS
  for (let dy = -maxS; dy <= maxS; dy++)
    for (let dx = -maxS; dx <= maxS; dx++) {
      let sum = 0
      for (let y = y0; y < y1; y += 1) {
        const rb = y * w
        const ra = (y - dy) * w - dx
        for (let x = x0; x < x1; x += 1) sum += Math.abs(b[rb + x] - a[ra + x])
      }
      const c = sum / ((x1 - x0) * (y1 - y0))
      const idx = (dy + maxS) * n + (dx + maxS)
      cost[idx] = c
      if (c < best) {
        best = c
        bi = idx
      }
    }
  const bx = (bi % n) - maxS
  const by = Math.floor(bi / n) - maxS
  const refine = (cm: number, c0: number, cp: number) => {
    const den = cm - 2 * c0 + cp
    return den > 1e-9 ? (0.5 * (cm - cp)) / den : 0
  }
  let rx = 0
  let ry = 0
  if (bx > -maxS && bx < maxS) rx = refine(cost[bi - 1], cost[bi], cost[bi + 1])
  if (by > -maxS && by < maxS) ry = refine(cost[bi - n], cost[bi], cost[bi + n])
  return [bx + rx, by + ry]
}

/** Largest correction (as a fraction of the frame) the smoothing window would ask for; sets the zoom needed to hide the edges. */
export function neededZoom(px: number[], py: number[], fps: number, strength: number): number {
  const n = px.length
  const R = Math.max(1, Math.round(strength * fps))
  let m = 0
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - R)
    const hi = Math.min(n - 1, i + R)
    let sx = 0
    let sy = 0
    for (let j = lo; j <= hi; j++) {
      sx += px[j]
      sy += py[j]
    }
    const c = hi - lo + 1
    m = Math.max(m, Math.abs(sx / c - px[i]), Math.abs(sy / c - py[i]))
  }
  return Math.min(1.35, Math.max(1, 1 + 2 * m + 0.01))
}

/** 16-bit mono PCM WAV. */
export function encodeWav(x: Float32Array, sr: number): Blob {
  const buf = new ArrayBuffer(44 + x.length * 2)
  const v = new DataView(buf)
  const wr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  wr(0, 'RIFF')
  v.setUint32(4, 36 + x.length * 2, true)
  wr(8, 'WAVE')
  wr(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  wr(36, 'data')
  v.setUint32(40, x.length * 2, true)
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** Silent stretches (seconds, relative to the start of `x`) at least `minDur` long, trimmed by `pad` each side so words aren't clipped. */
export function detectSilences(x: Float32Array, sr: number, minDur = 0.4, pad = 0.08, sensitivity = 0.5): { a: number; b: number }[] {
  const hop = Math.round(sr * 0.01)
  const env = rmsEnvelope(x, hop)
  if (env.length < 3) return []
  const sorted = Array.from(env).sort((p, q) => p - q)
  const floor = sorted[Math.floor(sorted.length * 0.1)]
  const level = sorted[Math.floor(sorted.length * 0.9)]
  if (level < 0.004) return [] // basically silent file: nothing meaningful to cut
  const thr = Math.max(floor * 2.5, level * (0.04 + sensitivity * 0.12))
  const out: { a: number; b: number }[] = []
  let start = -1
  for (let i = 0; i <= env.length; i++) {
    const quiet = i < env.length && env[i] < thr
    if (quiet && start < 0) start = i
    if (!quiet && start >= 0) {
      const a = start * 0.01 + pad
      const b = i * 0.01 - pad
      if (b - a >= Math.max(0.05, minDur - 2 * pad)) out.push({ a, b })
      start = -1
    }
  }
  return out
}

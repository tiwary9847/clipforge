// Tiny sound-effect synthesiser: no audio files, no copyright, no bundle weight.

const TAU = Math.PI * 2
const saw = (ph: number) => 2 * (ph - Math.floor(ph + 0.5))

function rnd(seed: number) {
  // deterministic noise so every render sounds identical
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296 * 2 - 1
  }
}

export function makeSfx(ctx: BaseAudioContext, id: string): AudioBuffer {
  const sr = ctx.sampleRate
  const make = (dur: number, fn: (t: number, i: number, n: number) => number) => {
    const n = Math.floor(dur * sr)
    const buf = ctx.createBuffer(1, n, sr)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.max(-1, Math.min(1, fn(i / sr, i, n)))
    return buf
  }
  const noise = rnd(12345)

  switch (id) {
    case 'boom': {
      let ph = 0
      return make(1.2, (t) => {
        const f = 38 + 90 * Math.exp(-t * 9)
        ph += f / sr
        return (Math.sin(TAU * ph) * Math.exp(-t * 3.2) * 1.1 + noise() * Math.exp(-t * 40) * 0.5)
      })
    }
    case 'airhorn': {
      const freqs = [415, 523, 622]
      const ph = [0, 0, 0]
      return make(1.4, (t) => {
        const vib = 1 + Math.sin(t * 38) * 0.004
        let s = 0
        for (let k = 0; k < 3; k++) {
          ph[k] += (freqs[k] * vib) / sr
          s += saw(ph[k]) * 0.2
        }
        const env = Math.min(1, t / 0.03) * (t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.2) : 1)
        return s * env
      })
    }
    case 'whoosh': {
      let y = 0
      return make(0.7, (t) => {
        const p = t / 0.7
        const a = 0.02 + 0.5 * Math.sin(Math.PI * p) ** 2
        y += a * (noise() - y)
        return y * Math.sin(Math.PI * p) ** 2 * 2.4
      })
    }
    case 'ding':
      return make(1.2, (t) => (Math.sin(TAU * 1318 * t) * Math.exp(-t * 4) + Math.sin(TAU * 2637 * t) * Math.exp(-t * 8) * 0.3) * 0.7)
    case 'pop': {
      let ph = 0
      return make(0.25, (t) => {
        ph += (900 * Math.exp(-t * 25) + 120) / sr
        return Math.sin(TAU * ph) * Math.exp(-t * 28)
      })
    }
    case 'sad': {
      const notes = [
        { f: 311, d: 0.5 },
        { f: 294, d: 0.5 },
        { f: 277, d: 0.5 },
        { f: 262, d: 0.7 },
      ]
      let ph = 0
      let y = 0
      return make(2.2, (t) => {
        let acc = 0
        let f = 262
        let local = 0
        let dur = 0.5
        for (let k = 0; k < notes.length; k++) {
          if (t < acc + notes[k].d) {
            f = notes[k].f
            local = t - acc
            dur = notes[k].d
            if (k === 3) f *= 1 - 0.08 * Math.max(0, local - 0.15) * 2
            break
          }
          acc += notes[k].d
          if (k === notes.length - 1) return 0
        }
        const vib = k3(local)
        ph += (f * vib) / sr
        const raw = saw(ph)
        y += 0.12 * (raw - y)
        const env = Math.min(1, local / 0.04) * Math.min(1, (dur - local) / 0.06 + 0.2)
        return y * env * 1.6
      })
    }
    case 'scratch': {
      let ph = 0
      return make(0.9, (t) => {
        const p = t / 0.9
        const f = 200 + 2200 * Math.abs(Math.sin(p * 9) * (1 - p))
        ph += f / sr
        const env = Math.sin(Math.PI * Math.min(1, p * 1.1)) ** 0.5
        return (saw(ph) * 0.35 + noise() * 0.25) * env
      })
    }

    case 'rimshot': {
      let hp = 0
      return make(1.1, (t) => {
        const hit = (t0: number, f: number, d: number) => (t >= t0 ? Math.sin(TAU * f * (t - t0)) * Math.exp(-(t - t0) * d) * 0.6 + noise() * Math.exp(-(t - t0) * d * 1.3) * 0.5 : 0)
        const n = noise()
        const hi = n - hp
        hp = n
        const cym = t >= 0.5 ? hi * Math.exp(-(t - 0.5) * 4) * 0.55 : 0
        return hit(0, 190, 28) + hit(0.17, 150, 26) * 0.9 + cym
      })
    }
    case 'dundundun': {
      return make(2.2, (t) => {
        const hit = (t0: number, f: number, d: number) => {
          const u = t - t0
          if (u < 0) return 0
          return (Math.sin(TAU * f * u) + 0.5 * Math.sin(TAU * f * 2 * u) + 0.3 * saw(f * 3 * u)) * Math.exp(-u * d) * Math.min(1, u * 200) * 0.5
        }
        return hit(0, 92, 3.2) + hit(0.6, 92, 3.2) + hit(1.2, 69, 1.6)
      })
    }
    case 'crickets': {
      return make(2.4, (t) => {
        const chirp = (t0: number, f: number) => {
          const u = (t - t0) % 0.6
          if (u > 0.32 || t < t0) return 0
          const pulse = Math.max(0, Math.sin(u * TAU * 22)) ** 1.5
          return Math.sin(TAU * f * t) * pulse * 0.18
        }
        return chirp(0.1, 4300) + chirp(0.35, 4650)
      })
    }
    case 'boing': {
      let ph = 0
      return make(0.9, (t) => {
        ph += (260 + 520 * Math.exp(-t * 3.5) * (1 + 0.7 * Math.sin(t * 46))) / sr
        return Math.sin(TAU * ph) * Math.exp(-t * 3.2) * 0.7
      })
    }
    case 'buzzer': {
      return make(0.9, (t) => {
        const sq = (f: number) => (Math.sin(TAU * f * t) > 0 ? 1 : -1)
        return (sq(118) * 0.25 + sq(124) * 0.25) * Math.min(1, t * 100) * (t > 0.8 ? (0.9 - t) * 10 : 1)
      })
    }
    case 'wow': {
      let ph = 0
      return make(1.1, (t) => {
        const p = t / 1.1
        const f = 520 + 700 * Math.sin(Math.min(1, p * 1.2) * Math.PI * 0.5) - 350 * Math.max(0, p - 0.55) + Math.sin(t * 38) * 14
        ph += f / sr
        return Math.sin(TAU * ph) * 0.45 * Math.sin(Math.PI * Math.min(1, p * 1.05)) ** 0.6
      })
    }
    case 'bruh': {
      let ph = 0
      let y1 = 0
      let y2 = 0
      return make(0.9, (t) => {
        const p = t / 0.9
        ph += (175 - 70 * p) / sr
        const raw = saw(ph)
        y1 += 0.10 * (raw - y1)
        y2 += 0.10 * (y1 - y2)
        const env = Math.min(1, t * 40) * (p < 0.15 ? 1 : Math.exp(-(p - 0.15) * 2.2))
        return y2 * 1.9 * env * (t > 0.82 ? (0.9 - t) * 12 : 1)
      })
    }
    case 'siren': {
      let ph = 0
      return make(2.2, (t) => {
        ph += (800 + 220 * Math.sin(t * TAU * 1.4)) / sr
        return (Math.sin(TAU * ph) * 0.35 + saw(ph) * 0.1) * Math.min(1, t * 20) * (t > 2.05 ? (2.2 - t) * 6.6 : 1)
      })
    }
    case 'gong': {
      return make(3.2, (t) => {
        const parts = [[98, 1], [147, 0.6], [196.5, 0.7], [253, 0.4], [321, 0.35], [402, 0.2]]
        let v = 0
        for (const [f, a] of parts) v += Math.sin(TAU * f * t + Math.sin(t * 5) * 0.3) * a * Math.exp(-t * (0.9 + f / 300))
        return v * 0.32 * Math.min(1, t * 120) + noise() * Math.exp(-t * 35) * 0.2
      })
    }
    case 'drumroll': {
      let y = 0
      return make(2.2, (t) => {
        const p = t / 2.2
        const roll = (Math.sin(TAU * (16 + 14 * p) * t) > 0.2 ? 1 : 0.35) * (0.25 + 0.75 * p)
        y += 0.35 * (noise() - y)
        return y * roll * 1.4 * (t > 2.05 ? (2.2 - t) * 6.6 : 1)
      })
    }
    case 'shutter': {
      let hp = 0
      return make(0.35, (t) => {
        const n = noise()
        const h = n - hp
        hp = n
        const click = (t0: number, a: number) => (t >= t0 ? (h * 0.8 + Math.sin(TAU * 1400 * (t - t0)) * 0.3) * Math.exp(-(t - t0) * 90) * a : 0)
        return click(0, 0.9) + click(0.09, 0.7)
      })
    }
    case 'applause': {
      let seed = 777
      const r = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
      const claps: number[] = []
      for (let i = 0; i < 160; i++) claps.push(r() * 2.6)
      let y = 0
      return make(2.8, (t) => {
        let v = 0
        for (const c of claps) {
          const u = t - c
          if (u >= 0 && u < 0.05) v += (noise() * 0.5) * Math.exp(-u * 90)
        }
        y += 0.5 * (noise() - y)
        const dens = Math.sin(Math.PI * Math.min(1, t / 2.8)) ** 0.5
        return (v * 0.55 + y * 0.22 * dens) * (t > 2.5 ? (2.8 - t) * 3.3 : 1)
      })
    }
    case 'kaching': {
      return make(1.3, (t) => {
        const bell = (t0: number, f: number, d: number) => (t >= t0 ? (Math.sin(TAU * f * (t - t0)) + 0.5 * Math.sin(TAU * f * 2.76 * (t - t0))) * Math.exp(-(t - t0) * d) * 0.28 : 0)
        const ka = t < 0.12 ? noise() * Math.exp(-t * 40) * 0.5 : 0
        return ka + bell(0.13, 2093, 4) + bell(0.2, 2637, 3.4)
      })
    }
    case 'heartbeat': {
      return make(1.8, (t) => {
        const thump = (t0: number, a: number) => (t >= t0 ? Math.sin(TAU * (62 - 18 * Math.min(1, (t - t0) * 6)) * (t - t0)) * Math.exp(-(t - t0) * 22) * a : 0)
        const m = t % 0.9
        return (thump(t - m, 0.9) + thump(t - m + 0.28, 0.65)) * 0.9
      })
    }
    case 'sus': {
      let ph = 0
      return make(1.1, (t) => {
        const f = t < 0.45 ? 370 : t < 0.55 ? 370 - (t - 0.45) * 800 : 294
        ph += f / sr
        const env = t < 0.5 ? Math.min(1, t * 30) * Math.exp(-(t) * 1.2) : Math.exp(-(t - 0.5) * 2.5) * 0.85
        return (Math.sin(TAU * ph) * 0.35 + saw(ph) * 0.12 + Math.sin(TAU * ph * 0.5) * 0.12) * env
      })
    }
    case 'tada': {
      return make(1.6, (t) => {
        const note = (t0: number, f: number, d: number) => (t >= t0 ? (saw(f * (t - t0)) * 0.12 + Math.sin(TAU * f * (t - t0)) * 0.18) * Math.exp(-(t - t0) * d) * Math.min(1, (t - t0) * 60) : 0)
        return note(0, 523, 5) + note(0.12, 659, 5) + note(0.24, 784, 5) + note(0.4, 1047, 1.6) + note(0.4, 784, 1.6) + note(0.4, 659, 1.6)
      })
    }
    case 'levelup': {
      return make(1.0, (t) => {
        const notes = [523, 659, 784, 1047, 1319, 1568]
        const i = Math.min(notes.length - 1, Math.floor(t / 0.1))
        const u = t - i * 0.1
        return (Math.sin(TAU * notes[i] * t) > 0 ? 1 : -1) * 0.18 * (i === notes.length - 1 ? Math.exp(-u * 4) : Math.exp(-u * 9))
      })
    }
    case 'coin': {
      return make(0.5, (t) => {
        const f = t < 0.08 ? 988 : 1319
        const u = t < 0.08 ? t : t - 0.08
        return (Math.sin(TAU * f * t) > 0 ? 1 : -1) * 0.2 * Math.exp(-u * (t < 0.08 ? 5 : 8))
      })
    }
    case 'laser': {
      let ph = 0
      return make(0.55, (t) => {
        ph += (2200 * Math.exp(-t * 7) + 220) / sr
        return saw(ph) * 0.35 * Math.exp(-t * 4)
      })
    }
    case 'sparkle': {
      let seed = 42
      const r = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
      const pings = Array.from({ length: 14 }, () => ({ t0: r() * 0.9, f: 2000 + r() * 3500 }))
      return make(1.4, (t) => {
        let v = 0
        for (const p of pings) if (t >= p.t0) v += Math.sin(TAU * p.f * (t - p.t0)) * Math.exp(-(t - p.t0) * 14) * 0.12
        return v
      })
    }
    case 'womp': {
      let ph = 0
      return make(1.8, (t) => {
        const seg = t < 0.7 ? 0 : t < 1.0 ? 1 : 2
        const base = [330, 294, 233][seg]
        const bend = seg === 2 ? (t - 1.0) * 60 * Math.sin((t - 1.0) * 12) : 0
        ph += (base - (t - [0, 0.7, 1.0][seg]) * 25 + bend) / sr
        const u = t - [0, 0.7, 1.0][seg]
        const gate = seg === 0 ? (t < 0.55 ? 1 : 0) : seg === 1 ? (u < 0.25 ? 1 : 0) : Math.exp(-u * 1.4)
        return (saw(ph) * 0.22 + Math.sin(TAU * ph) * 0.2) * gate * Math.min(1, u * 40 + 0.2)
      })
    }
    case 'rise': {
      let ph = 0
      let y = 0
      return make(2, (t) => {
        const p = t / 2
        ph += (180 + 1400 * p * p) / sr
        y += (0.02 + 0.6 * p) * (noise() - y)
        return (saw(ph) * 0.18 + y * 0.9) * p * (t > 1.9 ? (2 - t) * 10 : 1)
      })
    }
  }
  return make(0.1, () => 0)
}

function k3(t: number) {
  return 1 + Math.sin(t * 40) * 0.006 * Math.min(1, t * 3)
}

export function computePeaks(buf: AudioBuffer, bins = 240): number[] {
  const d = buf.getChannelData(0)
  const step = Math.max(1, Math.floor(d.length / bins))
  const out: number[] = []
  for (let b = 0; b < bins; b++) {
    let m = 0
    const s = b * step
    for (let i = s; i < Math.min(d.length, s + step); i += Math.max(1, Math.floor(step / 24))) {
      const v = Math.abs(d[i])
      if (v > m) m = v
    }
    out.push(m)
  }
  return out
}

// Background music maker: composes original, copyright-free music in the browser
// (chords, bass, drums, a melody, and Indian instruments for the festive/desi moods).
import { encodeWav } from './dsp'
import { addAsset, baseClip, checkpoint, getState, insertSilent, projectDuration, setClipsSilent } from './store'
import { engine } from './engine'
import { Clip } from './types'

export type Mood = 'chill' | 'vlog' | 'hype' | 'sad' | 'desi' | 'festive' | 'cinematic' | 'lofi'
export const MOODS: { id: Mood; name: string; desc: string }[] = [
  { id: 'vlog', name: '☀️ Happy vlog', desc: 'Bright, bouncy, ukulele-pop feel' },
  { id: 'chill', name: '🌊 Chill', desc: 'Soft pads, relaxed beat' },
  { id: 'lofi', name: '☕ Lo-fi', desc: 'Dusty, slow, warm chords' },
  { id: 'hype', name: '⚡ Hype', desc: 'Fast drums, big bass – for Shorts' },
  { id: 'cinematic', name: '🎬 Cinematic', desc: 'Slow strings, big drums – travel intros' },
  { id: 'sad', name: '🌧 Emotional', desc: 'Piano, minor key, slow' },
  { id: 'desi', name: '🪘 Desi groove', desc: 'Dholak rhythm, sitar-like plucks' },
  { id: 'festive', name: '🪔 Festive', desc: 'Wedding/Diwali energy, dhol and bells' },
]

interface Style {
  bpm: number
  minor: boolean
  prog: number[] // scale degrees of the chord roots (0-based), one per bar
  drums: 'pop' | 'chill' | 'hype' | 'lofi' | 'cine' | 'dholak' | 'none'
  lead: 'pluck' | 'piano' | 'sitar' | 'bell' | 'none'
  pad: boolean
  swing: number
}
const STYLES: Record<Mood, Style> = {
  vlog: { bpm: 112, minor: false, prog: [0, 4, 5, 3], drums: 'pop', lead: 'pluck', pad: false, swing: 0 },
  chill: { bpm: 88, minor: false, prog: [0, 5, 3, 4], drums: 'chill', lead: 'bell', pad: true, swing: 0.08 },
  lofi: { bpm: 78, minor: true, prog: [0, 5, 2, 6], drums: 'lofi', lead: 'piano', pad: true, swing: 0.16 },
  hype: { bpm: 140, minor: true, prog: [0, 0, 5, 6], drums: 'hype', lead: 'pluck', pad: false, swing: 0 },
  cinematic: { bpm: 84, minor: true, prog: [0, 5, 2, 6], drums: 'cine', lead: 'none', pad: true, swing: 0 },
  sad: { bpm: 70, minor: true, prog: [0, 5, 3, 4], drums: 'none', lead: 'piano', pad: true, swing: 0 },
  desi: { bpm: 100, minor: false, prog: [0, 3, 4, 0], drums: 'dholak', lead: 'sitar', pad: true, swing: 0.1 },
  festive: { bpm: 124, minor: false, prog: [0, 4, 3, 4], drums: 'dholak', lead: 'bell', pad: false, swing: 0.05 },
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

/** Composes and renders `seconds` of music. Returns stereo samples at 44.1 kHz. */
export async function compose(mood: Mood, seconds: number, seed: number): Promise<{ L: Float32Array; R: Float32Array; sr: number; bpm: number }> {
  const st = STYLES[mood]
  const R = rng(seed * 7919 + mood.length)
  const sr = 44100
  const bpm = st.bpm + Math.round((R() - 0.5) * 8)
  const beat = 60 / bpm
  const bar = beat * 4
  const bars = Math.max(4, Math.ceil(seconds / bar))
  const dur = bars * bar + 2
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr)
  const master = ctx.createGain()
  master.gain.value = 0.8
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 3
  master.connect(comp).connect(ctx.destination)
  // a little room
  const verb = ctx.createConvolver()
  const ir = ctx.createBuffer(2, sr * 2, sr)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3)
  }
  verb.buffer = ir
  const wet = ctx.createGain()
  wet.gain.value = mood === 'cinematic' || mood === 'sad' || mood === 'chill' ? 0.35 : 0.18
  verb.connect(wet).connect(master)
  const noise = ctx.createBuffer(1, sr, sr)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1

  const key = 57 + Math.floor(R() * 7) // A3..D#4 root
  const scale = st.minor ? MINOR : MAJOR
  const deg = (d: number, oct = 0) => key + scale[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7))
  const pan = (p: number) => {
    const n = ctx.createStereoPanner()
    n.pan.value = p
    return n
  }
  const env = (g: GainNode, t: number, a: number, peak: number, d: number) => {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(peak, t + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d)
  }
  const tone = (type: OscillatorType, f: number, t: number, a: number, peak: number, d: number, out: AudioNode, detune = 0) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    o.detune.value = detune
    const g = ctx.createGain()
    env(g, t, a, peak, d)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + a + d + 0.05)
    return g
  }
  const hit = (t: number, f0: number, f1: number, d: number, v: number, out: AudioNode = master) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6)
    const g = ctx.createGain()
    env(g, t, 0.002, v, d)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + d + 0.05)
  }
  const nz = (t: number, hp: number, d: number, v: number, out: AudioNode = master, bp = false) => {
    const s = ctx.createBufferSource()
    s.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = bp ? 'bandpass' : 'highpass'
    f.frequency.value = hp
    const g = ctx.createGain()
    env(g, t, 0.001, v, d)
    s.connect(f).connect(g).connect(out)
    s.start(t, R() * 0.5, d + 0.05)
  }
  // Karplus-Strong style pluck (sitar-ish with a buzzy bridge) rendered into a buffer
  const pluckBuf = (f: number, len: number, sitar: boolean) => {
    const n = Math.floor(sr * len)
    const b = ctx.createBuffer(1, n, sr)
    const d = b.getChannelData(0)
    const p = Math.max(2, Math.round(sr / f))
    const line = new Float32Array(p)
    for (let i = 0; i < p; i++) line[i] = Math.random() * 2 - 1
    let idx = 0
    for (let i = 0; i < n; i++) {
      const a = line[idx]
      const nxt = line[(idx + 1) % p]
      const v = (a + nxt) * 0.5 * (sitar ? 0.996 : 0.993)
      line[idx] = v
      d[i] = sitar ? Math.tanh(a * 2.2) * 0.6 : a
      idx = (idx + 1) % p
    }
    return b
  }
  const pluck = (f: number, t: number, v: number, sitar: boolean, out: AudioNode) => {
    const s = ctx.createBufferSource()
    s.buffer = pluckBuf(f, sitar ? 1.6 : 0.9, sitar)
    const g = ctx.createGain()
    g.gain.value = v
    s.connect(g).connect(out)
    s.start(t)
  }
  const sw = (b: number) => (b % 2 === 1 ? st.swing * beat : 0)
  const lead = ctx.createGain()
  lead.gain.value = 0.9
  lead.connect(pan(0.18)).connect(master)
  lead.connect(verb)
  const padBus = ctx.createGain()
  padBus.gain.value = 0.55
  const padLp = ctx.createBiquadFilter()
  padLp.type = 'lowpass'
  padLp.frequency.value = mood === 'lofi' ? 1400 : 2400
  padBus.connect(padLp).connect(master)
  padLp.connect(verb)
  // melody motif: a few notes from the chord, reused with variation
  const motif = Array.from({ length: 8 }, () => [0, 2, 4, 2, 4, 7, 6, 4][Math.floor(R() * 8)])
  const fadeIn = Math.min(2, bar)
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar
    const root = st.prog[b % st.prog.length]
    const section = Math.floor(b / 4) % 4 // 0 intro-ish, 1 groove, 2 lift, 3 groove
    const intro = b < 2
    const outro = b >= bars - 1
    // pad / chord
    if (st.pad || mood === 'vlog' || mood === 'festive') {
      for (const k of [0, 2, 4]) {
        const f = midi(deg(root + k, -1))
        for (const det of [-6, 6]) {
          const g = tone(mood === 'sad' ? 'triangle' : 'sawtooth', f, t0, 0.4, 0.035, bar - 0.2, padBus, det)
          void g
        }
      }
    }
    // bass
    if (!intro || mood === 'hype') {
      const pat = st.drums === 'hype' ? [0, 0.5, 1.5, 2, 2.5, 3.5] : st.drums === 'dholak' ? [0, 1.5, 2, 3] : [0, 2, 2.5]
      for (const p of pat) tone('sine', midi(deg(root, -2)), t0 + p * beat + sw(p * 2), 0.01, 0.38, beat * (st.drums === 'hype' ? 0.45 : 0.8), master)
    }
    // drums
    if (!(intro && mood !== 'hype' && mood !== 'festive') && st.drums !== 'none') {
      for (let s = 0; s < 16; s++) {
        const t = t0 + (s * beat) / 4 + (s % 2 ? sw(1) : 0)
        const q = s / 4
        switch (st.drums) {
          case 'pop':
            if (s % 4 === 0) hit(t, 120, 45, 0.28, 0.9)
            if (s === 4 || s === 12) nz(t, 1800, 0.16, 0.35)
            if (s % 2 === 0) nz(t, 8000, 0.04, 0.08)
            break
          case 'chill':
          case 'lofi':
            if (s === 0 || s === 10) hit(t, 100, 45, 0.3, 0.75)
            if (s === 4 || s === 12) nz(t, 1500, mood === 'lofi' ? 0.2 : 0.12, 0.25)
            if (s % 2 === 0) nz(t, 9000, 0.03, 0.05)
            break
          case 'hype':
            if (s % 4 === 0 || s === 10) hit(t, 150, 40, 0.32, 1)
            if (s === 4 || s === 12) nz(t, 1200, 0.2, 0.45)
            nz(t, 9000, 0.025, s % 2 ? 0.05 : 0.09)
            if (section === 2 && s % 2 === 0 && b % 4 === 3) nz(t, 3000, 0.08, 0.2)
            break
          case 'cine':
            if (s === 0) hit(t, 70, 35, 1.2, 1)
            if (s === 8 && b % 2 === 1) hit(t, 90, 40, 0.8, 0.7)
            break
          case 'dholak': {
            // dha / ge (low) and na / ta (high) bols
            const low = [0, 3, 6, 8, 11, 14]
            const high = [2, 4, 7, 10, 12, 15]
            if (low.includes(s)) hit(t, 140, 70, 0.25, 0.75)
            if (high.includes(s)) nz(t, 2500, 0.07, 0.3, master, true)
            if (mood === 'festive' && q % 1 === 0) nz(t, 6000, 0.05, 0.12)
            break
          }
        }
      }
    }
    // lead / melody (not in the intro bars, and lighter in section 0)
    if (st.lead !== 'none' && !intro && !outro) {
      const notes = section === 0 ? 4 : 8
      for (let i = 0; i < notes; i++) {
        if (R() < 0.18) continue
        const t = t0 + (i * bar) / notes + sw(i)
        const d = root + motif[(i + b) % motif.length]
        const f = midi(deg(d, st.lead === 'bell' ? 1 : 0))
        if (st.lead === 'pluck') pluck(f, t, 0.35, false, lead)
        else if (st.lead === 'sitar') pluck(f, t, 0.3, true, lead)
        else if (st.lead === 'bell') {
          tone('sine', f, t, 0.005, 0.12, 0.9, lead)
          tone('sine', f * 2.76, t, 0.005, 0.03, 0.4, lead)
        } else tone('triangle', f, t, 0.01, 0.16, 1.1, lead)
      }
    }
  }
  const buf = await ctx.startRendering()
  // fades in/out
  const L = buf.getChannelData(0).slice(0, Math.ceil(seconds * sr))
  const Rr = buf.getChannelData(1).slice(0, Math.ceil(seconds * sr))
  const fo = Math.min(L.length, Math.round(sr * 2.5))
  const fi = Math.round(sr * Math.min(fadeIn, 0.6))
  for (let i = 0; i < fi; i++) {
    const g = i / fi
    L[i] *= g
    Rr[i] *= g
  }
  for (let i = 0; i < fo; i++) {
    const g = i / fo
    L[L.length - 1 - i] *= g
    Rr[Rr.length - 1 - i] *= g
  }
  // normalise to about −1 dBFS peak
  let pk = 0
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(Rr[i]))
  const k = pk > 0 ? 0.89 / pk : 1
  for (let i = 0; i < L.length; i++) {
    L[i] *= k
    Rr[i] *= k
  }
  return { L, R: Rr, sr, bpm }
}

function stereoWav(L: Float32Array, R: Float32Array, sr: number): Blob {
  const n = L.length
  const buf = new ArrayBuffer(44 + n * 4)
  const v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + n * 4, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 2, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 4, true)
  v.setUint16(32, 4, true)
  v.setUint16(34, 16, true)
  w(36, 'data')
  v.setUint32(40, n * 4, true)
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true)
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}
void encodeWav

/** Makes a track and puts it on the Music track, lowered automatically under talking. */
export async function addMusic(mood: Mood, seconds: number | 'video', seed: number, status: (m: string) => void): Promise<string> {
  const len = seconds === 'video' ? Math.max(10, projectDuration()) : seconds
  status('Composing…')
  const { L, R, sr, bpm } = await compose(mood, len, seed)
  const name = `${MOODS.find((m) => m.id === mood)!.name.replace(/^\S+\s/, '')} music #${seed} (${bpm} BPM).wav`
  const a = await engine.importFile(new File([stereoWav(L, R, sr)], name, { type: 'audio/wav' }))
  if (!a) throw new Error('Could not load the music.')
  addAsset(a)
  const st = getState()
  const talking = st.project.clips.some((c) => (c.kind === 'video' || c.kind === 'audio') && c.track !== 'a2' && c.volume > 0)
  const clip: Clip = baseClip('audio', 'a2', { assetId: a.id, label: a.name, start: 0, dur: a.duration, volume: talking ? 0.55 : 0.9, fadeOut: 2 } as Partial<Clip>)
  checkpoint()
  // replace music made earlier by this tool on the Music track
  const old = st.project.clips.filter((c) => c.track === 'a2' && c.label.includes(' music #'))
  insertSilent([clip])
  if (old.length) {
    const ids = new Set(old.map((c) => c.id))
    setClipsSilent(getState().project.clips.filter((c) => !ids.has(c.id)))
  }
  return `Original ${MOODS.find((m) => m.id === mood)!.name.replace(/^\S+\s/, '').toLowerCase()} music added (${len.toFixed(0)} s, ${bpm} BPM) – made just for you, so no copyright claims.${talking ? ' Turned down under your voice; use Audio tools → Auto-duck for automatic dips.' : ''}`
}

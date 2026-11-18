// Voice effects built from Web Audio nodes – work the same live and in the offline export mix.
export type VoiceFx = 'none' | 'chipmunk' | 'deep' | 'robot' | 'echo' | 'reverb' | 'cave' | 'phone' | 'megaphone' | 'radio' | 'alien'

export const VOICE_LIST: { id: VoiceFx; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'chipmunk', name: '🐿 Chipmunk' },
  { id: 'deep', name: '🧌 Deep voice' },
  { id: 'robot', name: '🤖 Robot' },
  { id: 'alien', name: '👽 Alien' },
  { id: 'echo', name: '🏔 Echo' },
  { id: 'reverb', name: '⛪ Hall reverb' },
  { id: 'cave', name: '🕳 Cave' },
  { id: 'phone', name: '📞 Phone call' },
  { id: 'megaphone', name: '📢 Megaphone' },
  { id: 'radio', name: '📻 Old radio' },
]

export interface VoiceChain {
  input: AudioNode
  output: AudioNode
  stop(): void
}

/* ---- pitch shifter (two crossfaded, modulated delay lines) ---- */
function fadeBuffer(ctx: BaseAudioContext, active: number, fade: number) {
  const sr = ctx.sampleRate
  const l1 = Math.round(active * sr)
  const l2 = Math.round((active - 2 * fade) * sr)
  const b = ctx.createBuffer(1, l1 + l2, sr)
  const p = b.getChannelData(0)
  const fl = fade * sr
  const i1 = fl
  const i2 = l1 - fl
  for (let i = 0; i < l1; i++) p[i] = i < i1 ? Math.sqrt(i / fl) : i >= i2 ? Math.sqrt(1 - (i - i2) / fl) : 1
  return b
}
function delayBuffer(ctx: BaseAudioContext, active: number, fade: number, up: boolean) {
  const sr = ctx.sampleRate
  const l1 = Math.round(active * sr)
  const l2 = Math.round((active - 2 * fade) * sr)
  const len = l1 + l2
  const b = ctx.createBuffer(1, len, sr)
  const p = b.getChannelData(0)
  for (let i = 0; i < l1; i++) p[i] = up ? (l1 - i) / len : i / l1
  return b
}
function pitchShift(ctx: BaseAudioContext, amount: number): VoiceChain {
  const bufferTime = 0.1
  const fadeTime = 0.05
  const input = ctx.createGain()
  const output = ctx.createGain()
  const srcs: AudioBufferSourceNode[] = []
  const loopSrc = (b: AudioBuffer) => {
    const s = ctx.createBufferSource()
    s.buffer = b
    s.loop = true
    srcs.push(s)
    return s
  }
  const down = delayBuffer(ctx, bufferTime, fadeTime, false)
  const up = delayBuffer(ctx, bufferTime, fadeTime, true)
  const m1 = loopSrc(down)
  const m2 = loopSrc(down)
  const m3 = loopSrc(up)
  const m4 = loopSrc(up)
  const g1 = ctx.createGain()
  const g2 = ctx.createGain()
  const g3 = ctx.createGain()
  const g4 = ctx.createGain()
  const shiftUp = amount > 0
  g1.gain.value = shiftUp ? 0 : 1
  g2.gain.value = shiftUp ? 0 : 1
  g3.gain.value = shiftUp ? 1 : 0
  g4.gain.value = shiftUp ? 1 : 0
  m1.connect(g1)
  m2.connect(g2)
  m3.connect(g3)
  m4.connect(g4)
  const mod1 = ctx.createGain()
  const mod2 = ctx.createGain()
  g1.connect(mod1)
  g3.connect(mod1)
  g2.connect(mod2)
  g4.connect(mod2)
  const d1 = ctx.createDelay(1)
  const d2 = ctx.createDelay(1)
  d1.delayTime.value = 0
  d2.delayTime.value = 0
  mod1.gain.value = bufferTime * Math.abs(amount)
  mod2.gain.value = bufferTime * Math.abs(amount)
  mod1.connect(d1.delayTime)
  mod2.connect(d2.delayTime)
  const fb = fadeBuffer(ctx, bufferTime, fadeTime)
  const f1 = loopSrc(fb)
  const f2 = loopSrc(fb)
  const mix1 = ctx.createGain()
  const mix2 = ctx.createGain()
  mix1.gain.value = 0
  mix2.gain.value = 0
  f1.connect(mix1.gain)
  f2.connect(mix2.gain)
  input.connect(d1)
  input.connect(d2)
  d1.connect(mix1)
  d2.connect(mix2)
  mix1.connect(output)
  mix2.connect(output)
  const t = ctx.currentTime + 0.01
  const t2 = t + bufferTime - fadeTime
  m1.start(t)
  m2.start(t2)
  m3.start(t)
  m4.start(t2)
  f1.start(t)
  f2.start(t2)
  return { input, output, stop: () => srcs.forEach((s) => { try { s.stop() } catch {} }) }
}

function impulse(ctx: BaseAudioContext, secs: number, decay: number) {
  const len = Math.round(secs * ctx.sampleRate)
  const b = ctx.createBuffer(2, len, ctx.sampleRate)
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) * 2 - 1
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, decay)
  }
  return b
}
function shaper(ctx: BaseAudioContext, k: number) {
  const ws = ctx.createWaveShaper()
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  ws.curve = curve
  return ws
}
const filt = (ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.7) => {
  const b = ctx.createBiquadFilter()
  b.type = type
  b.frequency.value = f
  b.Q.value = q
  return b
}
function chain(nodes: AudioNode[], stop: () => void = () => {}): VoiceChain {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
  return { input: nodes[0], output: nodes[nodes.length - 1], stop }
}

export function buildVoice(ctx: BaseAudioContext, fx: VoiceFx | undefined): VoiceChain | null {
  switch (fx) {
    case 'chipmunk':
      return pitchShift(ctx, 0.75)
    case 'deep':
      return pitchShift(ctx, -0.45)
    case 'robot':
    case 'alien': {
      const input = ctx.createGain()
      const ring = ctx.createGain()
      ring.gain.value = 0
      const osc = ctx.createOscillator()
      osc.frequency.value = fx === 'robot' ? 55 : 420
      osc.connect(ring.gain)
      input.connect(ring)
      const output = ctx.createGain()
      output.gain.value = fx === 'robot' ? 1.8 : 1.4
      // short metallic comb
      const d = ctx.createDelay(0.1)
      d.delayTime.value = fx === 'robot' ? 0.011 : 0.004
      const fbk = ctx.createGain()
      fbk.gain.value = 0.55
      ring.connect(output)
      ring.connect(d)
      d.connect(fbk)
      fbk.connect(d)
      d.connect(output)
      if (fx === 'alien') input.connect(output)
      osc.start()
      return { input, output, stop: () => { try { osc.stop() } catch {} } }
    }
    case 'echo': {
      const input = ctx.createGain()
      const output = ctx.createGain()
      const d = ctx.createDelay(1)
      d.delayTime.value = 0.28
      const fbk = ctx.createGain()
      fbk.gain.value = 0.42
      const wet = ctx.createGain()
      wet.gain.value = 0.55
      input.connect(output)
      input.connect(d)
      d.connect(fbk)
      fbk.connect(d)
      d.connect(wet)
      wet.connect(output)
      return { input, output, stop: () => {} }
    }
    case 'reverb':
    case 'cave': {
      const input = ctx.createGain()
      const output = ctx.createGain()
      const conv = ctx.createConvolver()
      conv.buffer = impulse(ctx, fx === 'cave' ? 4 : 2.2, fx === 'cave' ? 2 : 3)
      const wet = ctx.createGain()
      wet.gain.value = fx === 'cave' ? 0.6 : 0.4
      const dry = ctx.createGain()
      dry.gain.value = fx === 'cave' ? 0.6 : 0.8
      input.connect(dry)
      dry.connect(output)
      input.connect(conv)
      conv.connect(wet)
      wet.connect(output)
      return { input, output, stop: () => {} }
    }
    case 'phone': {
      const g = ctx.createGain()
      g.gain.value = 1.6
      return chain([filt(ctx, 'highpass', 400), filt(ctx, 'lowpass', 3200), shaper(ctx, 4), g])
    }
    case 'megaphone': {
      const g = ctx.createGain()
      g.gain.value = 0.9
      return chain([filt(ctx, 'bandpass', 1600, 0.9), shaper(ctx, 40), filt(ctx, 'highpass', 600), g])
    }
    case 'radio': {
      const g = ctx.createGain()
      g.gain.value = 1.5
      return chain([filt(ctx, 'highpass', 500), filt(ctx, 'lowpass', 4200), shaper(ctx, 8), filt(ctx, 'peaking', 1800, 1), g])
    }
    default:
      return null
  }
}

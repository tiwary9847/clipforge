// Studio voice: AI noise removal (RNNoise, bundled – works offline) + a broadcast voice chain
// (rumble cut, less boom, more clarity and air, gentle compression, level matching).
import createRNNWasmModule from '@jitsi/rnnoise-wasm/dist/rnnoise.js'
import wasmUrl from '@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url'
import { decodeMono } from './media'
import { encodeWav } from './dsp'
import { addAsset, baseClip, checkpoint, getAsset, getClip, getState, insertSilent, patchClip } from './store'
import { engine } from './engine'
import { Clip } from './types'

const SR = 48000
const FRAME = 480

let modP: Promise<any> | null = null
function rnnoise() {
  return (modP ??= (async () => {
    const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer()
    const M = await (createRNNWasmModule as any)({ wasmBinary, locateFile: () => wasmUrl })
    await M.ready
    return M
  })().catch((e) => {
    modP = null
    throw e
  }))
}

/** RNNoise over a whole signal (48 kHz mono). Returns the cleaned signal. */
export async function denoiseAI(x: Float32Array, onProgress?: (p: number) => void): Promise<Float32Array> {
  const M = await rnnoise()
  const st = M._rnnoise_create()
  const ptr = M._malloc(FRAME * 4)
  const out = new Float32Array(x.length)
  try {
    for (let o = 0; o < x.length; o += FRAME) {
      const heap = new Float32Array(M.HEAPF32.buffer, ptr, FRAME) // re-view: memory can grow
      for (let i = 0; i < FRAME; i++) heap[i] = (x[o + i] ?? 0) * 32768
      M._rnnoise_process_frame(st, ptr, ptr)
      const res = new Float32Array(M.HEAPF32.buffer, ptr, FRAME)
      const n = Math.min(FRAME, x.length - o)
      for (let i = 0; i < n; i++) out[o + i] = res[i] / 32768
      if (onProgress && (o / FRAME) % 400 === 0) {
        onProgress(o / x.length)
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  } finally {
    M._free(ptr)
    M._rnnoise_destroy(st)
  }
  return out
}

export interface StudioOpts {
  noise: number // 0..1 how much of the AI-cleaned signal (1 = fully cleaned)
  tone: 'natural' | 'warm' | 'bright' | 'podcast'
}

/** Broadcast voice chain in an OfflineAudioContext. */
async function voiceChain(x: Float32Array, tone: StudioOpts['tone']): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, x.length, SR)
  const buf = ctx.createBuffer(1, x.length, SR)
  buf.copyToChannel(new Float32Array(x), 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f = (type: BiquadFilterType, freq: number, gain = 0, Q = 0.7) => {
    const b = ctx.createBiquadFilter()
    b.type = type
    b.frequency.value = freq
    b.gain.value = gain
    b.Q.value = Q
    return b
  }
  const T = {
    natural: { mud: -2, pres: 3, air: 2, low: 0 },
    warm: { mud: -1, pres: 1.5, air: 1, low: 2 },
    bright: { mud: -3, pres: 4.5, air: 3.5, low: -1 },
    podcast: { mud: -3, pres: 3.5, air: 2, low: 1.5 },
  }[tone]
  const chain = [
    f('highpass', 85, 0, 0.7), // rumble, handling noise
    f('lowshelf', 160, T.low),
    f('peaking', 300, T.mud, 1.0), // boxy / boomy room
    f('peaking', 3200, T.pres, 0.9), // clarity
    f('highshelf', 9500, T.air), // air
    f('lowpass', 15500, 0, 0.7),
  ]
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = tone === 'podcast' ? -26 : -22
  comp.ratio.value = tone === 'podcast' ? 4 : 3
  comp.knee.value = 8
  comp.attack.value = 0.006
  comp.release.value = 0.18
  let node: AudioNode = src
  for (const c of chain) {
    node.connect(c)
    node = c
  }
  node.connect(comp)
  comp.connect(ctx.destination)
  src.start()
  const y = (await ctx.startRendering()).getChannelData(0)
  // level match: speech RMS (loud parts only) to about −18 dBFS, peaks kept under −1 dBFS
  const win = SR / 10
  const rms: number[] = []
  for (let o = 0; o + win <= y.length; o += win) {
    let e = 0
    for (let i = o; i < o + win; i++) e += y[i] * y[i]
    rms.push(Math.sqrt(e / win))
  }
  const loud = rms.sort((a, b) => b - a).slice(0, Math.max(1, Math.floor(rms.length * 0.4)))
  const level = loud.reduce((s, v) => s + v, 0) / loud.length || 1e-4
  let g = 0.126 / level // −18 dBFS
  let peak = 0
  for (let i = 0; i < y.length; i++) peak = Math.max(peak, Math.abs(y[i]))
  g = Math.min(g, 0.89 / Math.max(1e-6, peak), 12)
  // soft limiter for the few peaks above
  const out = new Float32Array(y.length)
  for (let i = 0; i < y.length; i++) {
    const v = y[i] * g
    out[i] = Math.abs(v) < 0.8 ? v : Math.sign(v) * (0.8 + 0.19 * Math.tanh((Math.abs(v) - 0.8) / 0.19))
  }
  return out
}

export async function studioVoice(clipId: string, o: StudioOpts, status: (m: string, p?: number) => void): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'video' && c.kind !== 'audio')) throw new Error('Select a video or voice clip.')
  const from = c.srcIn
  const to = Math.min(a.duration, c.srcIn + c.dur * c.speed)
  status('Reading the voice…')
  const x = await decodeMono(a, from, to, SR)
  if (!x) throw new Error('This clip has no sound.')
  status('Removing noise with AI…', 0)
  const clean = await denoiseAI(x, (p) => status(`Removing noise with AI… ${Math.round(p * 100)}%`, p * 70))
  const mix = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) mix[i] = clean[i] * o.noise + x[i] * (1 - o.noise)
  status('Making it sound like a studio mic…', 80)
  const y = await voiceChain(mix, o.tone)
  status('Saving…', 95)
  const na = await engine.importFile(new File([encodeWav(y, SR)], `${a.name.replace(/\.[^.]+$/, '')} (studio voice).wav`, { type: 'audio/wav' }))
  if (!na) throw new Error('Could not load the cleaned voice.')
  addAsset(na)
  checkpoint()
  const st = getState()
  const busy = (tr: string) => st.project.clips.some((x2) => x2.track === tr && x2.id !== c.id && x2.start < c.start + c.dur && x2.start + x2.dur > c.start)
  if (c.kind === 'audio') {
    patchClip(c.id, { assetId: na.id, srcIn: 0, label: na.name })
  } else {
    const track = !busy('a1') ? 'a1' : 'a2'
    const voice: Clip = baseClip('audio', track, { assetId: na.id, label: na.name, start: c.start, dur: c.dur, speed: c.speed, srcIn: 0, studioOf: c.id } as Partial<Clip>)
    insertSilent([voice])
    patchClip(c.id, { volume: 0 })
  }
  engine.requestRender()
  return `Studio voice ready – background noise removed and the voice cleaned up. ${c.kind === 'video' ? 'The video’s own sound is muted and the clean voice is on the audio track. ' : ''}Undo to compare.`
}

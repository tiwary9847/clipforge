import { getState } from './store'
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import { Asset, Clip } from './types'
import { buildVoice } from './voice'
import { engine } from './engine'

const inputs = new Map<string, Input>()
export function getInput(a: Asset): Input {
  let i = inputs.get(a.id)
  if (!i) {
    if (!a.blob) throw new Error(`"${a.name}" has no data to read`)
    i = new Input({ source: new BlobSource(a.blob), formats: ALL_FORMATS })
    inputs.set(a.id, i)
  }
  return i
}
export function disposeInputs() {
  for (const i of inputs.values()) {
    try {
      ;(i as any).dispose?.()
    } catch {}
  }
  inputs.clear()
}

/** Schedules the audio of a clip into an (offline) audio graph. Returns false if the clip has no audio. */
/** Low / mid / high shelf EQ plus an optional compressor in front of `out`. Returns the node to feed. */
export function buildEq(ctx: BaseAudioContext, out: AudioNode): { input: AudioNode; set: (c: Clip) => void } {
  const lo = ctx.createBiquadFilter()
  lo.type = 'lowshelf'
  lo.frequency.value = 150
  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1500
  mid.Q.value = 0.8
  const hi = ctx.createBiquadFilter()
  hi.type = 'highshelf'
  hi.frequency.value = 6000
  const comp = ctx.createDynamicsCompressor()
  lo.connect(mid)
  mid.connect(hi)
  hi.connect(comp)
  comp.connect(out)
  const set = (c: Clip) => {
    lo.gain.value = c.eq?.low ?? 0
    mid.gain.value = c.eq?.mid ?? 0
    hi.gain.value = c.eq?.high ?? 0
    const on = !!c.eq?.comp
    comp.threshold.value = on ? -24 : 0
    comp.ratio.value = on ? 4 : 1
    comp.knee.value = on ? 12 : 0
    comp.attack.value = 0.005
    comp.release.value = 0.2
  }
  return { input: lo, set }
}

type Pt = { t: number; v: number }
const valueAt = (pts: Pt[], t: number) => {
  if (t <= pts[0].t) return pts[0].v
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]
    const q = pts[i + 1]
    if (t < q.t) return q.t - p.t < 1e-9 ? q.v : p.v + ((q.v - p.v) * (t - p.t)) / (q.t - p.t)
  }
  return pts[pts.length - 1].v
}
/** Schedules a piecewise-linear envelope (absolute timeline times) into a context that starts at t0. */
function envelope(param: AudioParam, pts: Pt[], t0: number) {
  param.setValueAtTime(valueAt(pts, t0), 0)
  for (const p of pts) if (p.t > t0) param.linearRampToValueAtTime(p.v, p.t - t0)
}

/**
 * Schedules one clip's sound into an offline context that covers timeline [t0, t1].
 * Only the part of the source inside that window is decoded, so long projects can be mixed in chunks.
 */
export async function scheduleClipAudio(ctx: BaseAudioContext, dest: AudioNode, c: Clip, a: Asset | undefined, t0 = 0, t1 = Infinity): Promise<boolean> {
  const end = c.start + c.dur
  const wa = Math.max(c.start, t0)
  const wb = Math.min(end, t1)
  if (wb <= wa) return false
  const duck = ctx.createGain()
  duck.connect(dest)
  if (c.duck?.length) envelope(duck.gain, [{ t: c.start, v: c.duck[0].g }, ...c.duck.map((p) => ({ t: c.start + p.t, v: p.g }))], t0)
  const vk = ctx.createGain()
  vk.connect(duck)
  if (c.volKf?.length) envelope(vk.gain, [{ t: c.start, v: c.volKf[0].g }, ...c.volKf.map((p) => ({ t: c.start + p.t, v: p.g }))], t0)
  const g = ctx.createGain()
  const eq = buildEq(ctx, vk)
  eq.set(c)
  g.connect(eq.input)
  // make-up gain for the compressor so it doesn't just make things quieter
  const vol = c.volume * (c.eq?.comp ? 1.6 : 1)
  const fade: Pt[] = c.fadeIn > 0 ? [{ t: c.start, v: 0 }, { t: c.start + c.fadeIn, v: vol }] : [{ t: c.start, v: vol }]
  if (c.fadeOut > 0) fade.push({ t: Math.max(c.start + c.fadeIn, end - c.fadeOut), v: vol }, { t: end, v: 0 })
  envelope(g.gain, fade, t0)
  // optional voice effect sits between the sources and the clip gain
  const vfx = buildVoice(ctx, c.voice)
  const into: AudioNode = vfx ? vfx.input : g
  if (vfx) vfx.output.connect(g)
  if (c.kind === 'sfx' && c.sfxId) {
    const src = ctx.createBufferSource()
    src.buffer = engine.getSfx(c.sfxId)
    src.connect(into)
    const off = Math.max(0, t0 - c.start)
    if (off >= src.buffer.duration) return false
    src.start(Math.max(0, c.start - t0), off)
    src.stop(end - t0)
    return true
  }
  if (!a) return false
  const track = await getInput(a).getPrimaryAudioTrack()
  if (!track) return false
  const sink = new AudioBufferSink(track)
  const from = c.srcIn + (wa - c.start) * c.speed
  const to = c.srcIn + (wb - c.start) * c.speed
  let any = false
  for await (const w of sink.buffers(from, to)) {
    const src = ctx.createBufferSource()
    src.buffer = w.buffer
    src.playbackRate.value = c.speed
    src.connect(into)
    let at = c.start + (w.timestamp - c.srcIn) / c.speed // timeline time where this buffer begins
    let off = 0
    if (at < wa) {
      off = (wa - at) * c.speed
      at = wa
    }
    src.start(at - t0, off)
    src.stop(wb - t0)
    any = true
  }
  return any
}

/** Mixes timeline [t0, t1] into a stereo 48 kHz buffer. Null if nothing in that window makes sound. */
export async function mixRange(clips: Clip[], getAsset: (id?: string) => Asset | undefined, t0: number, t1: number): Promise<AudioBuffer | null> {
  const sr = 48000
  const n = Math.max(1, Math.round((t1 - t0) * sr))
  // Pre-roll: compressors/limiters have a look-ahead delay and need to settle, so each chunk starts
  // rendering half a second early and that lead-in is cut off – chunks then join without clicks.
  const ts = Math.max(0, t0 - 0.5)
  const lead = Math.round((t0 - ts) * sr)
  const r = await renderRange(clips, getAsset, ts, t1, lead + n)
  if (!r || !lead) return r
  const out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr })
  for (let c = 0; c < 2; c++) out.copyToChannel(r.getChannelData(c).subarray(lead, lead + n), c)
  return out
}

async function renderRange(clips: Clip[], getAsset: (id?: string) => Asset | undefined, t0: number, t1: number, len: number): Promise<AudioBuffer | null> {
  const sr = 48000
  const ctx = new OfflineAudioContext(2, len, sr)
  const master = ctx.createGain()
  const lim = ctx.createDynamicsCompressor()
  const loud = getState().project.loudDb
  master.gain.value = loud ? Math.pow(10, loud / 20) : 1
  lim.threshold.value = loud ? -1.5 : 0
  lim.ratio.value = loud ? 20 : 1
  lim.knee.value = 0
  lim.attack.value = 0.002
  lim.release.value = 0.1
  master.connect(lim)
  lim.connect(ctx.destination)
  let any = false
  for (const c of clips) {
    if (c.kind !== 'video' && c.kind !== 'audio' && c.kind !== 'sfx') continue
    if (c.volume <= 0 || c.freeze) continue
    if (c.start >= t1 || c.start + c.dur <= t0) continue
    try {
      if (await scheduleClipAudio(ctx, master, c, getAsset(c.assetId), t0, t1)) any = true
    } catch {
      /* a clip whose audio can't be decoded stays silent */
    }
  }
  if (!any) return null
  return ctx.startRendering()
}

/** True when any clip in the project could make sound. */
export const projectHasSound = (clips: Clip[]) => clips.some((c) => (c.kind === 'video' || c.kind === 'audio' || c.kind === 'sfx') && c.volume > 0 && !c.freeze)

/** Mixes the whole project into one stereo 48 kHz buffer (fine for short projects / analysis). */
export function mixProjectAudio(clips: Clip[], getAsset: (id?: string) => Asset | undefined, dur: number): Promise<AudioBuffer | null> {
  return mixRange(clips, getAsset, 0, dur)
}

/** Decodes the audio of a clip's source range to 16 kHz mono floats (what Whisper wants). */
/** Decodes [from, to) of an asset's sound as mono at `sr` Hz, straight into one array.
 *  (Scheduling every ~20 ms decoded chunk as its own node in an OfflineAudioContext
 *  took minutes for a 10-minute video; this takes seconds.) */
export async function decodeMono(a: Asset, from: number, to: number, sr: number): Promise<Float32Array | null> {
  const track = await getInput(a).getPrimaryAudioTrack()
  if (!track) return null
  const n = Math.max(1, Math.ceil((to - from) * sr))
  const out = new Float32Array(n)
  const sink = new AudioBufferSink(track)
  for await (const w of sink.buffers(from, to)) {
    const b = w.buffer
    const inSr = b.sampleRate
    const len = b.length
    const chs = b.numberOfChannels
    // mono mix of this chunk
    const mono = new Float32Array(len)
    for (let ch = 0; ch < chs; ch++) {
      const d = b.getChannelData(ch)
      for (let i = 0; i < len; i++) mono[i] += d[i]
    }
    if (chs > 1) for (let i = 0; i < len; i++) mono[i] /= chs
    const r = inSr / sr // input samples per output sample
    const j0 = Math.max(0, Math.ceil((w.timestamp - from) * sr - 1e-6))
    const j1 = Math.min(n, Math.ceil((w.timestamp + len / inSr - from) * sr - 1e-6))
    if (r >= 1.5) {
      // average the input samples that fall into each output sample (simple anti-alias low-pass)
      const ps = new Float64Array(len + 1)
      for (let i = 0; i < len; i++) ps[i + 1] = ps[i] + mono[i]
      for (let j = j0; j < j1; j++) {
        const c = (from + j / sr - w.timestamp) * inSr
        const lo = Math.max(0, Math.floor(c - r / 2))
        const hi = Math.min(len, Math.max(lo + 1, Math.floor(c + r / 2)))
        out[j] = (ps[hi] - ps[lo]) / (hi - lo)
      }
    } else {
      for (let j = j0; j < j1; j++) {
        const pos = (from + j / sr - w.timestamp) * inSr
        const i = Math.floor(pos)
        const f = pos - i
        const x0 = mono[Math.min(len - 1, Math.max(0, i))]
        const x1 = mono[Math.min(len - 1, Math.max(0, i + 1))]
        out[j] = x0 + (x1 - x0) * f
      }
    }
  }
  return out
}

export function extractMono16k(c: Clip, a: Asset): Promise<Float32Array | null> {
  return decodeMono(a, c.srcIn, c.srcIn + c.dur * c.speed, 16000)
}

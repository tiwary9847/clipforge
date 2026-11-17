import { getState } from './store'
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import { Asset, Clip } from './types'
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

export async function scheduleClipAudio(ctx: BaseAudioContext, dest: AudioNode, c: Clip, a: Asset | undefined): Promise<boolean> {
  const end = c.start + c.dur
  const duck = ctx.createGain()
  duck.connect(dest)
  if (c.duck?.length) {
    duck.gain.setValueAtTime(c.duck[0].g, c.start)
    for (const p of c.duck) duck.gain.linearRampToValueAtTime(p.g, c.start + p.t)
  }
  const vk = ctx.createGain()
  vk.connect(duck)
  if (c.volKf?.length) {
    vk.gain.setValueAtTime(c.volKf[0].g, c.start)
    for (const p of c.volKf) vk.gain.linearRampToValueAtTime(p.g, c.start + p.t)
  }
  const g = ctx.createGain()
  const eq = buildEq(ctx, vk)
  eq.set(c)
  // make-up gain for the compressor so it doesn't just make things quieter
  g.connect(eq.input)
  const vol = c.volume * (c.eq?.comp ? 1.6 : 1)
  g.gain.setValueAtTime(c.fadeIn > 0 ? 0 : vol, c.start)
  if (c.fadeIn > 0) g.gain.linearRampToValueAtTime(vol, c.start + c.fadeIn)
  if (c.fadeOut > 0) {
    g.gain.setValueAtTime(vol, Math.max(c.start + c.fadeIn, end - c.fadeOut))
    g.gain.linearRampToValueAtTime(0, end)
  }
  if (c.kind === 'sfx' && c.sfxId) {
    const src = ctx.createBufferSource()
    src.buffer = engine.getSfx(c.sfxId)
    src.connect(g)
    src.start(c.start)
    src.stop(end)
    return true
  }
  if (!a) return false
  const track = await getInput(a).getPrimaryAudioTrack()
  if (!track) return false
  const sink = new AudioBufferSink(track)
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  let any = false
  for await (const w of sink.buffers(from, to)) {
    const src = ctx.createBufferSource()
    src.buffer = w.buffer
    src.playbackRate.value = c.speed
    src.connect(g)
    let at = c.start + (w.timestamp - from) / c.speed
    let off = 0
    if (at < c.start) {
      off = from - w.timestamp
      at = c.start
    }
    src.start(at, off)
    src.stop(end)
    any = true
  }
  return any
}

/** Mixes every audio-bearing clip into one stereo 48 kHz buffer. Null if the project is silent. */
export async function mixProjectAudio(clips: Clip[], getAsset: (id?: string) => Asset | undefined, dur: number): Promise<AudioBuffer | null> {
  const sr = 48000
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(dur * sr)), sr)
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
    try {
      if (await scheduleClipAudio(ctx, master, c, getAsset(c.assetId))) any = true
    } catch {
      /* a clip whose audio can't be decoded stays silent */
    }
  }
  if (!any) return null
  return ctx.startRendering()
}

/** Decodes the audio of a clip's source range to 16 kHz mono floats (what Whisper wants). */
export async function extractMono16k(c: Clip, a: Asset): Promise<Float32Array | null> {
  const track = await getInput(a).getPrimaryAudioTrack()
  if (!track) return null
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  const sr = 16000
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil((to - from) * sr)), sr)
  const sink = new AudioBufferSink(track)
  for await (const w of sink.buffers(from, to)) {
    const src = ctx.createBufferSource()
    src.buffer = w.buffer
    src.connect(ctx.destination)
    const at = Math.max(0, w.timestamp - from)
    src.start(at, Math.max(0, from - w.timestamp))
  }
  const out = await ctx.startRendering()
  return out.getChannelData(0).slice()
}

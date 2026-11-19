// Heavier media operations that run in the browser: thumbnails, waveforms, recording,
// noise reduction, ducking, beat detection, stabilisation analysis and reversing.
import {
  AudioBufferSink,
  AudioBufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeAudio,
} from 'mediabunny'
import { engine } from './engine'
import { decodeMono, getInput } from './media'
import { mixProjectAudio } from './media'
import { restructureClip, addAsset, addAssetClip, addMarkers, checkpoint, getAsset, getState, patchClip, projectDuration, updateAsset } from './store'
import { detectSilences, denoise, detectBeats, duckCurve, encodeWav, frameShift, neededZoom, rmsEnvelope } from './dsp'
import { Asset, Clip } from './types'

/* ---------- thumbnails + waveforms for imported video ---------- */

export async function buildFilmstrip(a: Asset): Promise<{ url: string; n: number } | null> {
  if (a.kind !== 'video' || !a.blob || !a.width) return null
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) return null
  const th = 48
  const tw = Math.max(20, Math.min(110, Math.round((th * a.width) / a.height)))
  const n = Math.max(8, Math.min(40, Math.ceil(a.duration / 1.5)))
  const sink = new CanvasSink(track, { width: tw * 2, height: th * 2, fit: 'fill' })
  const cv = document.createElement('canvas')
  cv.width = n * tw
  cv.height = th
  const g = cv.getContext('2d')!
  const ts = Array.from({ length: n }, (_, i) => Math.min(Math.max(0, a.duration - 0.05), ((i + 0.5) / n) * a.duration))
  let i = 0
  for await (const w of sink.canvasesAtTimestamps(ts)) {
    if (w) g.drawImage(w.canvas as CanvasImageSource, i * tw, 0, tw, th)
    i++
  }
  return { url: cv.toDataURL('image/jpeg', 0.6), n }
}

export async function videoPeaks(a: Asset): Promise<number[] | null> {
  if (!a.blob) return null
  const track = await getInput(a).getPrimaryAudioTrack()
  if (!track) return null
  const bins = Math.max(120, Math.min(4000, Math.round(a.duration * 12)))
  const out = new Array<number>(bins).fill(0)
  const sink = new AudioBufferSink(track)
  for await (const w of sink.buffers(0, a.duration)) {
    const d = w.buffer.getChannelData(0)
    const sr = w.buffer.sampleRate
    const stepI = Math.max(1, Math.floor(d.length / 400))
    for (let i = 0; i < d.length; i += stepI) {
      const b = Math.min(bins - 1, Math.floor(((w.timestamp + i / sr) / a.duration) * bins))
      const v = Math.abs(d[i])
      if (v > out[b]) out[b] = v
    }
  }
  return out
}

const inflight = new Set<string>()
/** Fills in filmstrip + waveform for a video asset in the background. Safe to call repeatedly. */
export async function enrichAsset(a: Asset) {
  if (a.kind !== 'video' || a.enriched || inflight.has(a.id) || !a.blob) return
  inflight.add(a.id)
  try {
    const [strip, peaks] = await Promise.all([buildFilmstrip(a).catch(() => null), videoPeaks(a).catch(() => null)])
    updateAsset(a.id, { enriched: true, ...(strip ? { strip } : {}), ...(peaks ? { peaks } : {}) })
  } catch {
    updateAsset(a.id, { enriched: true })
  } finally {
    inflight.delete(a.id)
  }
}

/* ---------- decoding helpers ---------- */

export function decodeMonoRange(a: Asset, from: number, to: number, sr: number): Promise<Float32Array | null> {
  return decodeMono(a, from, to, sr)
}

function srcRange(c: Clip) {
  return { from: c.srcIn, to: c.srcIn + c.dur * c.speed }
}

/* ---------- voice-over recording ---------- */

export interface VoiceRecorder {
  level(): number
  stop(): Promise<File | null>
  cancel(): void
}

export async function startVoiceover(): Promise<VoiceRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot record audio.')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } })
  const mimes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
  const mime = mimes.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m))
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const actx = new AudioContext()
  const an = actx.createAnalyser()
  an.fftSize = 512
  actx.createMediaStreamSource(stream).connect(an)
  const buf = new Uint8Array(an.fftSize)
  rec.start(250)
  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop())
    actx.close().catch(() => {})
  }
  return {
    level() {
      an.getByteTimeDomainData(buf)
      let m = 0
      for (const v of buf) m = Math.max(m, Math.abs(v - 128))
      return m / 128
    },
    cancel() {
      rec.ondataavailable = null
      try {
        rec.stop()
      } catch {}
      cleanup()
    },
    async stop() {
      await new Promise<void>((res) => {
        rec.onstop = () => res()
        try {
          rec.stop()
        } catch {
          res()
        }
      })
      cleanup()
      if (!chunks.length) return null
      // Convert to WAV: MediaRecorder files have no duration/seek index, WAV is read reliably everywhere.
      const blob = new Blob(chunks, { type: rec.mimeType })
      const dctx = new AudioContext()
      try {
        const ab = await dctx.decodeAudioData(await blob.arrayBuffer())
        const mono = new Float32Array(ab.length)
        for (let ch = 0; ch < ab.numberOfChannels; ch++) {
          const d = ab.getChannelData(ch)
          for (let i = 0; i < d.length; i++) mono[i] += d[i] / ab.numberOfChannels
        }
        return new File([encodeWav(mono, ab.sampleRate)], `Voiceover ${new Date().toLocaleTimeString().replace(/[: ]/g, '-')}.wav`, { type: 'audio/wav' })
      } finally {
        dctx.close().catch(() => {})
      }
    },
  }
}

/* ---------- noise reduction ---------- */

export async function reduceNoise(clipId: string, strength: number): Promise<string> {
  const c = getState().project.clips.find((x) => x.id === clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'video' && c.kind !== 'audio')) throw new Error('Select a video or audio clip first.')
  const { from, to } = srcRange(c)
  const sr = 44100
  const x = await decodeMonoRange(a, from, to, sr)
  if (!x) throw new Error('This clip has no audio to clean.')
  await new Promise((r) => setTimeout(r, 0))
  const y = denoise(x, strength)
  const file = new File([encodeWav(y, sr)], `${a.name.replace(/\.[^.]+$/, '')} (clean).wav`, { type: 'audio/wav' })
  const na = await engine.importFile(file)
  if (!na) throw new Error('Could not create the cleaned audio.')
  addAsset(na)
  checkpoint()
  if (c.kind === 'audio') {
    patchClip(c.id, { assetId: na.id, srcIn: 0, label: `${c.label} (clean)` })
  } else {
    patchClip(c.id, { volume: 0 })
    const nc = addAssetClip(na.id, 'a1', c.start)
    if (nc) patchClip(nc.id, { start: c.start, dur: c.dur, speed: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, label: 'Clean audio' })
  }
  return 'Noise reduced – the original audio is muted/replaced (Undo brings it back).'
}

/* ---------- auto-ducking ---------- */

/** Lowers `musicId` whenever any other clip with sound is "speaking". */
export async function autoDuck(musicId: string, level: number): Promise<number> {
  const st = getState()
  const music = st.project.clips.find((x) => x.id === musicId)
  if (!music) return 0
  const others = st.project.clips.filter((x) => x.id !== musicId && (x.kind === 'video' || x.kind === 'audio') && x.volume > 0 && !x.freeze)
  const total = projectDuration()
  const mix = others.length ? await mixProjectAudio(others, getAsset, total) : null
  if (!mix) return 0
  const sr = mix.sampleRate
  const l = mix.getChannelData(0)
  const r = mix.numberOfChannels > 1 ? mix.getChannelData(1) : l
  const mono = new Float32Array(l.length)
  for (let i = 0; i < l.length; i++) mono[i] = (l[i] + r[i]) / 2
  const hopSec = 0.05
  const curve = duckCurve(rmsEnvelope(mono, Math.round(sr * hopSec)), hopSec, level)
  const at = (t: number) => {
    if (!curve.length) return 1
    if (t <= curve[0].t) return curve[0].g
    for (let i = 0; i < curve.length - 1; i++)
      if (t <= curve[i + 1].t) {
        const u = (t - curve[i].t) / Math.max(1e-6, curve[i + 1].t - curve[i].t)
        return curve[i].g + (curve[i + 1].g - curve[i].g) * u
      }
    return curve[curve.length - 1].g
  }
  const pts: { t: number; g: number }[] = [{ t: 0, g: at(music.start) }]
  for (const p of curve) {
    const lt = p.t - music.start
    if (lt > 0.001 && lt < music.dur - 0.001) pts.push({ t: +lt.toFixed(3), g: p.g })
  }
  pts.push({ t: +music.dur.toFixed(3), g: at(music.start + music.dur) })
  checkpoint()
  patchClip(musicId, { duck: pts })
  return pts.filter((p) => p.g < 0.99).length
}

/* ---------- beat detection ---------- */

export async function markBeats(clipId: string): Promise<number> {
  const c = getState().project.clips.find((x) => x.id === clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a) throw new Error('Select a music or video clip first.')
  const { from, to } = srcRange(c)
  const sr = 22050
  const x = await decodeMonoRange(a, from, to, sr)
  if (!x) throw new Error('This clip has no audio.')
  const beats = detectBeats(x, sr).map((b) => c.start + b / c.speed)
  addMarkers(beats)
  return beats.length
}

/* ---------- stabilisation ---------- */

export async function analyzeStabilization(clipId: string, onProgress?: (p: number) => void): Promise<number> {
  const c = getState().project.clips.find((x) => x.id === clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Select a video clip first.')
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found.')
  const w = 80
  const h = Math.max(24, Math.round((w * a.height) / a.width))
  const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill' })
  const fps = 30
  const { from, to } = srcRange(c)
  const n = Math.max(2, Math.floor((to - from) * fps))
  const ts = Array.from({ length: n }, (_, i) => Math.min(a.duration - 0.01, from + i / fps))
  const px: number[] = []
  const py: number[] = []
  const probe = document.createElement('canvas')
  probe.width = w
  probe.height = h
  const g = probe.getContext('2d', { willReadFrequently: true })!
  let prev: Uint8Array | null = null
  let cx = 0
  let cy = 0
  let i = 0
  for await (const f of sink.canvasesAtTimestamps(ts)) {
    let gray: Uint8Array | null = prev
    if (f) {
      g.drawImage(f.canvas as CanvasImageSource, 0, 0, w, h)
      const d = g.getImageData(0, 0, w, h).data
      gray = new Uint8Array(w * h)
      for (let k = 0; k < w * h; k++) gray[k] = (d[k * 4] * 77 + d[k * 4 + 1] * 150 + d[k * 4 + 2] * 29) >> 8
    }
    if (prev && gray && gray !== prev) {
      const [dx, dy] = frameShift(prev, gray, w, h, 6)
      cx += dx / w
      cy += dy / h
    }
    px.push(cx)
    py.push(cy)
    prev = gray
    i++
    if (i % 12 === 0) {
      onProgress?.(i / n)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  const strength = 0.5
  checkpoint()
  patchClip(clipId, { stab: { on: true, t0: from, fps, px, py, strength, zoom: neededZoom(px, py, fps, strength) } })
  return neededZoom(px, py, fps, strength)
}

export function setStabStrength(clipId: string, strength: number) {
  const c = getState().project.clips.find((x) => x.id === clipId)
  if (!c?.stab) return
  patchClip(clipId, { stab: { ...c.stab, strength, zoom: neededZoom(c.stab.px, c.stab.py, c.stab.fps, strength) } })
}

/* ---------- reverse ---------- */

export async function reverseClip(clipId: string, onProgress?: (p: number) => void): Promise<void> {
  const c = getState().project.clips.find((x) => x.id === clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Select a video clip first.')
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found.')
  const { from, to } = srcRange(c)
  const k = Math.min(1, 1280 / Math.max(a.width, a.height))
  const W = Math.max(2, Math.round((a.width * k) / 2) * 2)
  const H = Math.max(2, Math.round((a.height * k) / 2) * 2)
  const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill' })
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const target = new BufferTarget()
  const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const vsrc = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH })
  out.addVideoTrack(vsrc, { frameRate: 30 })

  // audio, fully reversed
  let asrc: AudioBufferSource | null = null
  let rev: AudioBuffer | null = null
  const atrack = await getInput(a).getPrimaryAudioTrack()
  if (atrack) {
    const sr = 48000
    const octx = new OfflineAudioContext(2, Math.max(1, Math.ceil((to - from) * sr)), sr)
    for await (const w of new AudioBufferSink(atrack).buffers(from, to)) {
      const s = octx.createBufferSource()
      s.buffer = w.buffer
      s.connect(octx.destination)
      s.start(Math.max(0, w.timestamp - from), Math.max(0, from - w.timestamp))
    }
    const mixed = await octx.startRendering()
    rev = new AudioBuffer({ numberOfChannels: 2, length: mixed.length, sampleRate: sr })
    for (let ch = 0; ch < 2; ch++) rev.copyToChannel(mixed.getChannelData(Math.min(ch, mixed.numberOfChannels - 1)).slice().reverse(), ch)
    const codec = (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: sr })) ? 'aac' : (await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: sr })) ? 'opus' : null
    if (codec) {
      asrc = new AudioBufferSource({ codec, bitrate: 192_000 })
      out.addAudioTrack(asrc)
    } else rev = null
  }
  await out.start()
  // video, one second at a time from the end so we never hold more than ~30 frames
  const SEG = 1
  const total = to - from
  for (let e = to; e > from + 1e-3; e -= SEG) {
    const s = Math.max(from, e - SEG)
    const frames: { bmp: ImageBitmap; ts: number; dur: number }[] = []
    for await (const w of sink.canvases(s, e)) {
      frames.push({ bmp: await createImageBitmap(w.canvas as HTMLCanvasElement), ts: w.timestamp, dur: w.duration })
    }
    for (let j = frames.length - 1; j >= 0; j--) {
      const f = frames[j]
      ctx.drawImage(f.bmp, 0, 0, W, H)
      f.bmp.close()
      await vsrc.add(Math.max(0, to - f.ts - f.dur), f.dur)
    }
    onProgress?.((to - s) / total)
    await new Promise((r) => setTimeout(r, 0))
  }
  vsrc.close()
  if (asrc && rev) {
    await asrc.add(rev)
    asrc.close()
  }
  await out.finalize()
  const buf = target.buffer
  if (!buf) throw new Error('Encoder produced no data')
  const file = new File([buf], `${a.name.replace(/\.[^.]+$/, '')} (reversed).mp4`, { type: 'video/mp4' })
  const na = await engine.importFile(file)
  if (!na) throw new Error('Could not load the reversed clip.')
  addAsset(na)
  checkpoint()
  patchClip(clipId, { assetId: na.id, srcIn: 0, stab: undefined, label: `${c.label} (reversed)` })
}

/* ---------- silence removal ---------- */
export async function cutSilences(clipId: string, minDur: number, sensitivity: number): Promise<string> {
  const c = getState().project.clips.find((x) => x.id === clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'video' && c.kind !== 'audio')) throw new Error('Select a video or audio clip first.')
  const { from, to } = srcRange(c)
  const sr = 16000
  const x = await decodeMonoRange(a, from, to, sr)
  if (!x) throw new Error('This clip has no audio to analyse.')
  const sil = detectSilences(x, sr, minDur, 0.08, sensitivity)
  if (!sil.length) return 'No pauses that long were found – try a shorter minimum or higher sensitivity.'
  const segs: { srcIn: number; srcLen: number; speed: number }[] = []
  let cur = 0
  const total = to - from
  for (const s of sil) {
    if (s.a - cur > 0.05) segs.push({ srcIn: from + cur, srcLen: s.a - cur, speed: c.speed })
    cur = s.b
  }
  if (total - cur > 0.05) segs.push({ srcIn: from + cur, srcLen: total - cur, speed: c.speed })
  // drop slivers: a sub-0.15s fragment is just a flicker
  for (let i = segs.length - 1; i >= 0; i--) if (segs[i].srcLen < 0.15 && segs.length > 1) segs.splice(i, 1)
  // srcLen is in source seconds; restructureClip divides by speed to get timeline length
  const removed = sil.reduce((m, s) => m + (s.b - s.a), 0) / c.speed
  restructureClip(clipId, segs)
  return `Removed ${sil.length} pause${sil.length > 1 ? 's' : ''} (${removed.toFixed(1)}s). Cuts are hard – add a transition if you want them softer.`
}

/* ---------- speed ramps ---------- */
export const RAMPS: { id: string; name: string; curve: (u: number) => number }[] = [
  { id: 'slow-fast', name: 'Slow → fast', curve: (u) => 0.3 + 2.2 * u * u },
  { id: 'fast-slow', name: 'Fast → slow', curve: (u) => 2.5 - 2.2 * Math.sqrt(u) },
  { id: 'hero', name: 'Hero moment', curve: (u) => 1 - 0.75 * Math.exp(-Math.pow((u - 0.5) / 0.18, 2)) },
  { id: 'pulse', name: 'Pulse', curve: (u) => 1.3 - 0.9 * Math.pow(Math.sin(u * Math.PI * 2), 2) },
  { id: 'speed-burst', name: 'Burst', curve: (u) => 1 + 1.8 * Math.exp(-Math.pow((u - 0.5) / 0.15, 2)) },
]

/** Builds the ramp from short constant-speed pieces (about 8 per second of source, at most 24) so it looks smooth. */
export function applySpeedRamp(clipId: string, rampId: string) {
  const c = getState().project.clips.find((x) => x.id === clipId)
  const r = RAMPS.find((x) => x.id === rampId)
  if (!c || !r || c.kind !== 'video') return false
  const { from, to } = srcRange(c)
  const total = to - from
  const n = Math.max(6, Math.min(24, Math.round(total * 8)))
  const segs = Array.from({ length: n }, (_, i) => ({
    srcIn: from + (i / n) * total,
    srcLen: total / n,
    speed: Math.min(4, Math.max(0.25, r.curve((i + 0.5) / n) * c.speed)),
  }))
  return restructureClip(clipId, segs)
}

/* ---------- proxy (light preview copy) ---------- */
export const needsProxy = (a: Asset) => a.kind === 'video' && (Math.max(a.width, a.height) > 1920 || (a.blob?.size ?? 0) > 250e6)

export async function makeProxy(assetId: string, onProgress?: (p: number) => void): Promise<string> {
  const a = getAsset(assetId)
  if (!a || a.kind !== 'video' || !a.blob) throw new Error('Select a video first.')
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found.')
  const k = Math.min(1, 640 / Math.max(a.width, a.height))
  const W = Math.max(2, Math.round((a.width * k) / 2) * 2)
  const H = Math.max(2, Math.round((a.height * k) / 2) * 2)
  const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill' })
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const target = new BufferTarget()
  const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const vsrc = new CanvasSource(canvas, { codec: 'avc', bitrate: 1_500_000 })
  out.addVideoTrack(vsrc, { frameRate: 30 })
  let asrc: AudioBufferSource | null = null
  const atrack = await getInput(a).getPrimaryAudioTrack()
  if (atrack) {
    const sr = atrack.sampleRate
    const codec = (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: sr })) ? 'aac' : (await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: sr })) ? 'opus' : null
    if (codec) {
      asrc = new AudioBufferSource({ codec, bitrate: 96_000 })
      out.addAudioTrack(asrc)
    }
  }
  await out.start()
  let n = 0
  for await (const w of sink.canvases(0, a.duration)) {
    ctx.drawImage(w.canvas as CanvasImageSource, 0, 0, W, H)
    await vsrc.add(w.timestamp, w.duration)
    if (++n % 15 === 0) {
      onProgress?.(Math.min(0.9, w.timestamp / a.duration))
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  vsrc.close()
  if (asrc && atrack) {
    // chunks go straight to the encoder, so long recordings never sit in memory all at once
    for await (const w of new AudioBufferSink(atrack).buffers(0, a.duration)) await asrc.add(w.buffer)
    asrc.close()
  }
  await out.finalize()
  const buf = target.buffer
  if (!buf) throw new Error('Encoder produced no data')
  const blob = new Blob([buf], { type: 'video/mp4' })
  const url = URL.createObjectURL(blob)
  updateAsset(assetId, { proxyUrl: url, proxyBlob: blob })
  return `Smooth preview ready (${W}×${H}). Exports still use your original full-quality file.`
}

export function dropProxy(assetId: string) {
  const a = getAsset(assetId)
  if (a?.proxyUrl) URL.revokeObjectURL(a.proxyUrl)
  updateAsset(assetId, { proxyUrl: undefined, proxyBlob: undefined })
}

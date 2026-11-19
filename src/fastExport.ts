import {
  AudioBufferSource,
  BufferTarget,
  StreamTarget,
  CanvasSink,
  WrappedCanvas,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny'
import { engine, FPS } from './engine'
import { getAsset, getPreset, getState, projectDuration } from './store'
import { disposeInputs, getInput, mixRange, projectHasSound } from './media'
import { Clip } from './types'
import { prepareViz } from './viz'

async function pickAudioCodec(): Promise<'aac' | 'opus' | null> {
  const hasAudio = projectHasSound(getState().project.clips)
  if (!hasAudio) return null
  const o = { numberOfChannels: 2, sampleRate: 48000 }
  if (await canEncodeAudio('aac', o)) return 'aac'
  if (await canEncodeAudio('opus', o)) return 'opus'
  throw new Error('This browser cannot encode audio.')
}

/** Reads one clip's frames in order with a single running decoder.
 *  (getCanvas() per frame restarts decoding at the previous keyframe every time –
 *  with phone videos that was ~30× slower.) */
class ClipFrames {
  private it: AsyncGenerator<WrappedCanvas, void, unknown> | null = null
  private cur: WrappedCanvas | null = null
  private nxt: WrappedCanvas | null = null
  private done = false
  private last = -1
  constructor(private sink: CanvasSink) {}
  async at(st: number): Promise<WrappedCanvas | null> {
    const jumpBack = st < this.last - 1e-4
    const jumpFar = this.cur && st - this.cur.timestamp > 2.5
    if (!this.it || jumpBack || jumpFar) {
      await this.close()
      this.it = this.sink.canvases(st)
      this.cur = this.nxt = null
      this.done = false
    }
    this.last = st
    if (!this.cur) {
      const r = await this.it!.next()
      if (r.done) return null
      this.cur = r.value
    }
    while (!this.done) {
      if (!this.nxt) {
        const r = await this.it!.next()
        if (r.done) {
          this.done = true
          break
        }
        this.nxt = r.value
      }
      if (this.nxt.timestamp <= st + 1e-6) {
        this.cur = this.nxt
        this.nxt = null
      } else break
    }
    return this.cur
  }
  async close() {
    const it = this.it
    this.it = null
    if (it) await it.return(undefined).catch(() => {})
  }
}

/** Keeps one ClipFrames per video clip that is on screen; closes them when the clip ends. */
class FrameReaders {
  private m = new Map<string, ClipFrames>()
  async frame(c: Clip, t: number): Promise<CanvasImageSource | null> {
    const a = getAsset(c.assetId)
    if (!a) return null
    let r = this.m.get(c.id)
    if (!r) {
      const track = await getInput(a).getPrimaryVideoTrack()
      if (!track) return null
      if (!(await track.canDecode())) throw new Error(`“${a.name}” can’t be decoded by this browser (${track.codec?.toUpperCase() ?? 'unknown'} video). Use Real-time export, or convert the clip to H.264 MP4.`)
      r = new ClipFrames(new CanvasSink(track, { poolSize: 4 }))
      this.m.set(c.id, r)
    }
    const st = Math.min(Math.max(0, c.freeze ? c.srcIn : c.srcIn + (t - c.start) * c.speed), Math.max(0, a.duration - 0.001))
    return (await r.at(st))?.canvas ?? null
  }
  /** close readers of clips that are no longer on screen at time t */
  async sweep(clips: Clip[], t: number) {
    for (const [id, r] of this.m) {
      const c = clips.find((x) => x.id === id)
      if (!c || t >= c.start + c.dur || t < c.start - 0.5) {
        await r.close()
        this.m.delete(id)
      }
    }
  }
  async closeAll() {
    for (const r of this.m.values()) await r.close()
    this.m.clear()
  }
}

export async function fastExportSupport(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined')
      return { ok: false, reason: 'This browser has no WebCodecs encoder.' }
    const p = getPreset()
    if (!(await canEncodeVideo('avc', { width: p.w, height: p.h })))
      return { ok: false, reason: 'This browser cannot encode H.264 video.' }
    await pickAudioCodec()
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

export interface Ctl {
  cancelled: boolean
}

export interface ExportOpts {
  from?: number
  to?: number
  bitrate?: number // video bits per second (default: high quality)
  audioBitrate?: number
  maxSide?: number // shrink the frame so its longer side is at most this
  overlay?: (ctx: CanvasRenderingContext2D, W: number, H: number, t: number) => void
}

/** Loads every web font the project's text uses so the first frames don't fall back. */
async function loadFonts() {
  const fams = new Set<string>()
  for (const c of getState().project.clips) if (c.text?.font) fams.add(c.text.font)
  await Promise.all([...fams].map((f) => document.fonts.load(`700 40px ${f}`, 'अaक').catch(() => [])))
}

export async function fastExport(onProgress: (p: number, label: string) => void, ctl: Ctl, opts: ExportOpts = {}): Promise<{ blob: Blob; ext: string; codec: string } | null> {
  const preset = getPreset()
  const k = opts.maxSide ? Math.min(1, opts.maxSide / Math.max(preset.w, preset.h)) : 1
  const W = Math.round((preset.w * k) / 2) * 2
  const H = Math.round((preset.h * k) / 2) * 2
  const full = projectDuration()
  const from = Math.max(0, opts.from ?? 0)
  const to = Math.min(full, opts.to ?? full)
  const dur = to - from
  if (dur <= 0) throw new Error('Nothing to export yet – add a clip to the timeline.')
  engine.pause()
  const clips = getState().project.clips
  await loadFonts()
  await prepareViz()

  onProgress(0, 'Mixing audio…')
  if (ctl.cancelled) return null
  const withAudio = projectHasSound(clips)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const sink = await openTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: sink.stream ? false : 'in-memory' }), target: sink.target })
  const vsrc = new CanvasSource(canvas, { codec: 'avc', bitrate: opts.bitrate ?? QUALITY_HIGH })
  output.addVideoTrack(vsrc, { frameRate: FPS })
  let asrc: AudioBufferSource | null = null
  let audioCodec: 'aac' | 'opus' = 'aac'
  if (withAudio) {
    audioCodec = (await pickAudioCodec()) ?? 'aac'
    asrc = new AudioBufferSource({ codec: audioCodec, bitrate: opts.audioBitrate ?? 192_000 })
    output.addAudioTrack(asrc)
  }
  await output.start()

  const readers = new FrameReaders()
  const frames = new Map<string, CanvasImageSource>()

  try {
    const total = Math.max(1, Math.ceil(dur * FPS))
    const WIN = 10 // seconds of audio mixed at a time
    let audioUpTo = from
    const sr = 48000
    for (let i = 0; i < total; i++) {
      if (ctl.cancelled) {
        await output.cancel()
        await sink.discard()
        return null
      }
      const t = from + i / FPS
      if (asrc && t >= audioUpTo - 1e-6 && audioUpTo < to - 1e-6) {
        const w1 = Math.min(to, audioUpTo + WIN)
        const n = Math.max(1, Math.round((w1 - audioUpTo) * sr))
        const buf = (await mixRange(clips, getAsset, audioUpTo, w1)) ?? new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr })
        await asrc.add(buf)
        audioUpTo = w1
      }
      for (const c of clips) {
        if (c.kind !== 'video' || t < c.start || t >= c.start + c.dur) continue
        const w = await readers.frame(c, t)
        if (w) frames.set(c.id, w)
      }
      if (i % 15 === 0) await readers.sweep(clips, t)
      engine.paint(ctx, W, H, t, (c, lt) => (c.kind === 'video' ? frames.get(c.id) ?? null : engine.imageSource(c, lt)))
      opts.overlay?.(ctx, W, H, t)
      await vsrc.add(i / FPS, 1 / FPS)
      if (i % 4 === 0) {
        onProgress(0.05 + 0.9 * (i / total), 'Encoding video…')
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    vsrc.close()
    asrc?.close()
    onProgress(0.98, 'Finishing file…')
    await output.finalize()
    const blob = await sink.result()
    onProgress(1, 'Done')
    return { blob, ext: 'mp4', codec: asrc ? (audioCodec === 'aac' ? 'H.264 + AAC' : 'H.264 + Opus') : 'H.264 (no audio)' }
  } catch (e) {
    try {
      await output.cancel()
    } catch {}
    await sink.discard()
    throw e
  } finally {
    await readers.closeAll()
    disposeInputs()
    engine.requestRender()
  }
}

/* ---------- output target: stream to the browser's private disk when possible ---------- */

interface Sink {
  target: BufferTarget | StreamTarget
  stream: boolean
  result(): Promise<Blob>
  discard(): Promise<void>
}

const PREFIX = 'cf-export-'

/** Long exports are written to the Origin Private File System as they are encoded, so a 20-minute
 *  1080p video never has to fit in memory. Falls back to an in-memory buffer where unsupported. */
async function openTarget(): Promise<Sink> {
  try {
    const root = await navigator.storage.getDirectory()
    const name = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mp4`
    const fh = await root.getFileHandle(name, { create: true })
    const writable = await (fh as any).createWritable()
    return {
      target: new StreamTarget(writable, { chunked: true, chunkSize: 8 * 1024 * 1024 }),
      stream: true,
      async result() {
        const f = await fh.getFile()
        if (!f.size) throw new Error('The export file is empty.')
        return f
      },
      async discard() {
        try {
          await writable.abort?.()
        } catch {}
        try {
          await root.removeEntry(name)
        } catch {}
      },
    }
  } catch {
    const target = new BufferTarget()
    return {
      target,
      stream: false,
      async result() {
        if (!target.buffer) throw new Error('Encoder produced no data')
        return new Blob([target.buffer], { type: 'video/mp4' })
      },
      async discard() {},
    }
  }
}

/** Removes exports left over from earlier visits (call once at start-up). */
export async function cleanOldExports() {
  try {
    const root: any = await navigator.storage.getDirectory()
    for await (const [name] of root.entries()) if (String(name).startsWith(PREFIX)) await root.removeEntry(name).catch(() => {})
  } catch {}
}

/* ---------------- GIF and audio-only exports ---------------- */

/** Renders project frames [from, to) at `fps` into a canvas of W×H and calls onFrame for each. */
async function renderFrames(from: number, to: number, fps: number, W: number, H: number, ctl: Ctl, onFrame: (ctx: CanvasRenderingContext2D, i: number, n: number) => Promise<void> | void) {
  const clips = getState().project.clips
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
  const readers = new FrameReaders()
  const frames = new Map<string, CanvasImageSource>()
  const n = Math.max(1, Math.ceil((to - from) * fps))
  try {
  for (let i = 0; i < n; i++) {
    if (ctl.cancelled) return false
    const t = from + i / fps
    for (const c of clips) {
      if (c.kind !== 'video' || t < c.start || t >= c.start + c.dur) continue
      const w = await readers.frame(c, t)
      if (w) frames.set(c.id, w)
    }
    if (i % 15 === 0) await readers.sweep(clips, t)
    engine.paint(ctx, W, H, t, (c, lt) => (c.kind === 'video' ? frames.get(c.id) ?? null : engine.imageSource(c, lt)))
    await onFrame(ctx, i, n)
    if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  return true
  } finally {
    await readers.closeAll()
  }
}

export async function exportGif(onProgress: (p: number, label: string) => void, ctl: Ctl, opts: { from?: number; to?: number; fps?: number; maxSide?: number } = {}): Promise<{ blob: Blob; ext: string; codec: string } | null> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
  const P = getPreset()
  const k = Math.min(1, (opts.maxSide ?? 480) / Math.max(P.w, P.h))
  const W = Math.round((P.w * k) / 2) * 2
  const H = Math.round((P.h * k) / 2) * 2
  const full = projectDuration()
  const from = Math.max(0, opts.from ?? 0)
  const to = Math.min(full, opts.to ?? full)
  if (to - from <= 0) throw new Error('Nothing to export yet – add a clip to the timeline.')
  if (to - from > 30) throw new Error('GIFs get huge – pick a part of 30 seconds or less (use “Only part of the video”).')
  const fps = opts.fps ?? 12
  engine.pause()
  await loadFonts()
  await prepareViz()
  const gif = GIFEncoder()
  const ok = await renderFrames(from, to, fps, W, H, ctl, (ctx, i, n) => {
    const { data } = ctx.getImageData(0, 0, W, H)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, W, H, { palette, delay: Math.round(1000 / fps) })
    onProgress(i / n, 'Making GIF…')
  })
  if (!ok) return null
  gif.finish()
  onProgress(1, 'Done')
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), ext: 'gif', codec: `GIF ${W}×${H}, ${fps} fps` }
}

/** Sound only, as an .m4a (AAC) file – or WAV if this browser can't encode AAC. */
export async function exportAudio(onProgress: (p: number, label: string) => void, ctl: Ctl, opts: { from?: number; to?: number } = {}): Promise<{ blob: Blob; ext: string; codec: string } | null> {
  const full = projectDuration()
  const from = Math.max(0, opts.from ?? 0)
  const to = Math.min(full, opts.to ?? full)
  if (to - from <= 0) throw new Error('Nothing to export yet.')
  const clips = getState().project.clips
  if (!projectHasSound(clips)) throw new Error('This project has no sound.')
  const sr = 48000
  const o = { numberOfChannels: 2, sampleRate: sr }
  const WIN = 20
  if (await canEncodeAudio('aac', o)) {
    const sink = await openTarget()
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: sink.stream ? false : 'in-memory' }), target: sink.target })
    const asrc = new AudioBufferSource({ codec: 'aac', bitrate: 192_000 })
    output.addAudioTrack(asrc)
    await output.start()
    for (let t0 = from; t0 < to - 1e-6; t0 += WIN) {
      if (ctl.cancelled) {
        await output.cancel()
        await sink.discard()
        return null
      }
      const t1 = Math.min(to, t0 + WIN)
      const buf = (await mixRange(clips, getAsset, t0, t1)) ?? new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, Math.round((t1 - t0) * sr)), sampleRate: sr })
      await asrc.add(buf)
      onProgress((t1 - from) / (to - from), 'Mixing sound…')
    }
    asrc.close()
    await output.finalize()
    const blob = await sink.result()
    return { blob: new Blob([blob], { type: 'audio/mp4' }), ext: 'm4a', codec: 'AAC 192 kbps' }
  }
  // WAV fallback (16-bit), built chunk by chunk
  const parts: BlobPart[] = []
  let frames = 0
  for (let t0 = from; t0 < to - 1e-6; t0 += WIN) {
    const t1 = Math.min(to, t0 + WIN)
    const buf = await mixRange(clips, getAsset, t0, t1)
    const n = Math.max(1, Math.round((t1 - t0) * sr))
    const pcm = new Int16Array(n * 2)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf ? buf.getChannelData(ch) : null
      for (let i = 0; i < n; i++) pcm[i * 2 + ch] = Math.max(-32768, Math.min(32767, Math.round((d ? d[i] ?? 0 : 0) * 32767)))
    }
    parts.push(pcm.buffer)
    frames += n
    onProgress((t1 - from) / (to - from), 'Mixing sound…')
  }
  const head = new DataView(new ArrayBuffer(44))
  const w = (o2: number, s2: string) => [...s2].forEach((ch, i) => head.setUint8(o2 + i, ch.charCodeAt(0)))
  w(0, 'RIFF'); head.setUint32(4, 36 + frames * 4, true); w(8, 'WAVE'); w(12, 'fmt '); head.setUint32(16, 16, true); head.setUint16(20, 1, true)
  head.setUint16(22, 2, true); head.setUint32(24, sr, true); head.setUint32(28, sr * 4, true); head.setUint16(32, 4, true); head.setUint16(34, 16, true); w(36, 'data'); head.setUint32(40, frames * 4, true)
  return { blob: new Blob([head.buffer, ...parts], { type: 'audio/wav' }), ext: 'wav', codec: 'WAV 16-bit' }
}

/** YouTube chapter list from timeline markers (needs ≥3 chapters, first at 0:00, each ≥10 s). */
export function buildChapters(): { text: string; problems: string[] } {
  const st = getState()
  const dur = projectDuration()
  const pts = [0, ...st.project.markers.filter((m) => m > 0.5 && m < dur - 1)].sort((a, b) => a - b)
  const fmt = (t: number) => {
    const s = Math.floor(t)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = String(s % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
  }
  // name each chapter after a title/text clip that starts near it, else "Part n"
  const texts = st.project.clips.filter((c) => c.kind === 'text' && c.text?.text)
  const lines = pts.map((t, i) => {
    const near = texts.filter((c) => Math.abs(c.start - t) < 3).sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0]
    const named = st.project.markerNames?.[t.toFixed(2)] ?? (i === 0 ? st.project.markerNames?.['0.00'] : undefined)
    const name = named || near?.text?.text.replace(/\s+/g, ' ').trim().slice(0, 60) || (i === 0 ? 'Intro' : `Part ${i + 1}`)
    return `${fmt(t)} ${name}`
  })
  const problems: string[] = []
  if (pts.length < 3) problems.push(`YouTube needs at least 3 chapters – add ${3 - pts.length} more marker${3 - pts.length > 1 ? 's' : ''} (M key or ⚑ Marker) where each chapter starts.`)
  for (let i = 0; i < pts.length; i++) {
    const end = i + 1 < pts.length ? pts[i + 1] : dur
    if (end - pts[i] < 10) problems.push(`Chapter at ${fmt(pts[i])} is shorter than 10 s – YouTube ignores chapters that short.`)
  }
  return { text: lines.join('\n'), problems }
}

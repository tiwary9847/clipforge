import {
  AudioBufferSource,
  BufferTarget,
  StreamTarget,
  CanvasSink,
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

  const sinks = new Map<string, CanvasSink>()
  const frames = new Map<string, CanvasImageSource>()
  // one decoder per source file (not per clip) – heavily cut long videos stay light
  const sinkFor = async (c: Clip) => {
    const key = c.assetId ?? c.id
    let s = sinks.get(key)
    if (!s) {
      const a = getAsset(c.assetId)
      const track = a ? await getInput(a).getPrimaryVideoTrack() : null
      if (!track) return null
      s = new CanvasSink(track, { poolSize: 4 })
      sinks.set(key, s)
    }
    return s
  }

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
        const a = getAsset(c.assetId)
        const s = await sinkFor(c)
        if (!s || !a) continue
        const st = Math.min(Math.max(0, c.freeze ? c.srcIn : c.srcIn + (t - c.start) * c.speed), Math.max(0, a.duration - 0.001))
        const w = await s.getCanvas(st)
        if (w) frames.set(c.id, w.canvas)
      }
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
  const sinks = new Map<string, CanvasSink>()
  const frames = new Map<string, CanvasImageSource>()
  const n = Math.max(1, Math.ceil((to - from) * fps))
  for (let i = 0; i < n; i++) {
    if (ctl.cancelled) return false
    const t = from + i / fps
    for (const c of clips) {
      if (c.kind !== 'video' || t < c.start || t >= c.start + c.dur) continue
      const a = getAsset(c.assetId)
      if (!a) continue
      let sk = sinks.get(a.id)
      if (!sk) {
        const tr = await getInput(a).getPrimaryVideoTrack()
        if (!tr) continue
        sk = new CanvasSink(tr, { poolSize: 4 })
        sinks.set(a.id, sk)
      }
      const st = Math.min(Math.max(0, c.freeze ? c.srcIn : c.srcIn + (t - c.start) * c.speed), Math.max(0, a.duration - 0.001))
      const w = await sk.getCanvas(st)
      if (w) frames.set(c.id, w.canvas)
    }
    engine.paint(ctx, W, H, t, (c, lt) => (c.kind === 'video' ? frames.get(c.id) ?? null : engine.imageSource(c, lt)))
    await onFrame(ctx, i, n)
    if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  return true
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
    const name = near?.text?.text.replace(/\s+/g, ' ').trim().slice(0, 60) || (i === 0 ? 'Intro' : `Part ${i + 1}`)
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

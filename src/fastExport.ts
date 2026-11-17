import {
  AudioBufferSource,
  BufferTarget,
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
import { disposeInputs, getInput, mixProjectAudio } from './media'
import { Clip } from './types'

async function pickAudioCodec(): Promise<'aac' | 'opus' | null> {
  const hasAudio = getState().project.clips.some((c) => c.kind === 'video' || c.kind === 'audio' || c.kind === 'sfx')
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

export async function fastExport(onProgress: (p: number, label: string) => void, ctl: Ctl): Promise<{ blob: Blob; ext: string; codec: string } | null> {
  const preset = getPreset()
  const W = preset.w
  const H = preset.h
  const dur = projectDuration()
  if (dur <= 0) throw new Error('Nothing to export yet – add a clip to the timeline.')
  engine.pause()
  const clips = getState().project.clips

  onProgress(0, 'Mixing audio…')
  const audio = await mixProjectAudio(clips, getAsset, dur)
  if (ctl.cancelled) return null

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const vsrc = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH })
  output.addVideoTrack(vsrc, { frameRate: FPS })
  let asrc: AudioBufferSource | null = null
  let audioCodec: 'aac' | 'opus' = 'aac'
  if (audio) {
    audioCodec = (await pickAudioCodec()) ?? 'aac'
    asrc = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 })
    output.addAudioTrack(asrc)
  }
  await output.start()

  const sinks = new Map<string, CanvasSink>()
  const frames = new Map<string, CanvasImageSource>()
  const sinkFor = async (c: Clip) => {
    let s = sinks.get(c.id)
    if (!s) {
      const a = getAsset(c.assetId)
      const track = a ? await getInput(a).getPrimaryVideoTrack() : null
      if (!track) return null
      s = new CanvasSink(track, { poolSize: 3 })
      sinks.set(c.id, s)
    }
    return s
  }

  try {
    const total = Math.max(1, Math.ceil(dur * FPS))
    for (let i = 0; i < total; i++) {
      if (ctl.cancelled) {
        await output.cancel()
        return null
      }
      const t = i / FPS
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
      await vsrc.add(t, 1 / FPS)
      if (i % 4 === 0) {
        onProgress(0.05 + 0.9 * (i / total), 'Encoding video…')
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    vsrc.close()
    if (asrc && audio) {
      onProgress(0.96, 'Encoding audio…')
      await asrc.add(audio)
      asrc.close()
    }
    onProgress(0.98, 'Finishing file…')
    await output.finalize()
    const buf = target.buffer
    if (!buf) throw new Error('Encoder produced no data')
    onProgress(1, 'Done')
    return { blob: new Blob([buf], { type: 'video/mp4' }), ext: 'mp4', codec: audio ? (audioCodec === 'aac' ? 'H.264 + AAC' : 'H.264 + Opus') : 'H.264 (no audio)' }
  } catch (e) {
    try {
      await output.cancel()
    } catch {}
    throw e
  } finally {
    disposeInputs()
    engine.requestRender()
  }
}

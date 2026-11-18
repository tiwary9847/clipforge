// Long video → Shorts: finds the liveliest moments of a long clip and turns each into its own vertical Short.
import { decodeMonoRange } from './processing'
import { rmsEnvelope } from './dsp'
import { baseClip, getAsset, getClip, getState, swapProjectSilent } from './store'
import { fastExport } from './fastExport'
import { Clip, Project } from './types'

export interface Moment {
  start: number // source seconds
  len: number
  score: number
}

/** Ranks windows of `len` seconds by loudness + liveliness (variation) and returns the best non-overlapping ones. */
export async function findMoments(clipId: string, count: number, len: number, onProgress?: (m: string) => void): Promise<Moment[]> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Select a long video clip first.')
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  if (to - from < len * 1.5) throw new Error(`This clip is only ${(to - from).toFixed(0)} s – pick a shorter Short length or a longer video.`)
  onProgress?.('Listening to the whole video…')
  const sr = 8000
  const x = await decodeMonoRange(a, from, to, sr)
  if (!x) throw new Error('This video has no sound to analyse.')
  const HOP = 0.25
  const env = rmsEnvelope(x, Math.round(sr * HOP))
  // liveliness = loudness + how much it changes (laughs, reactions, punchlines)
  const live = new Float32Array(env.length)
  for (let i = 1; i < env.length; i++) live[i] = env[i] + Math.abs(env[i] - env[i - 1]) * 1.5
  const win = Math.max(1, Math.round(len / HOP))
  const ps = new Float64Array(live.length + 1)
  for (let i = 0; i < live.length; i++) ps[i + 1] = ps[i] + live[i]
  const scored: Moment[] = []
  for (let i = 0; i + win <= live.length; i += 2) scored.push({ start: from + i * HOP, len, score: (ps[i + win] - ps[i]) / win })
  scored.sort((p, q) => q.score - p.score)
  const picked: Moment[] = []
  for (const m of scored) {
    if (picked.length >= count) break
    if (picked.every((p) => m.start + m.len <= p.start || m.start >= p.start + p.len)) picked.push(m)
  }
  return picked.sort((p, q) => p.start - q.start)
}

function momentProject(base: Project, assetId: string, m: Moment, presetId: string): Project {
  const a = getAsset(assetId)!
  const clip: Clip = baseClip('video', 'v1', { assetId, label: `${a.name} @ ${Math.floor(m.start / 60)}:${String(Math.floor(m.start % 60)).padStart(2, '0')}`, start: 0, dur: m.len, srcIn: m.start, fit: 'cover', fadeIn: 0.15, fadeOut: 0.4 })
  return { ...base, presetId, clips: [clip], markers: [] }
}

/** Replace the timeline with one moment as a vertical Short (undoable via the caller's checkpoint). */
export function openMoment(assetId: string, m: Moment, presetId = 'shorts') {
  swapProjectSilent(momentProject(getState().project, assetId, m, presetId))
}

/** Export every moment as its own Short, then put the original timeline back. */
export async function exportMoments(assetId: string, ms: Moment[], presetId: string, onProgress: (m: string) => void): Promise<{ name: string; blob: Blob }[]> {
  const keep = getState().project
  const out: { name: string; blob: Blob }[] = []
  try {
    for (let i = 0; i < ms.length; i++) {
      swapProjectSilent(momentProject(keep, assetId, ms[i], presetId))
      await new Promise((r) => setTimeout(r, 60))
      const r = await fastExport((p) => onProgress(`Short ${i + 1} of ${ms.length} · ${Math.round(p * 100)}%`), { cancelled: false })
      if (r) out.push({ name: `short-${i + 1}.${r.ext}`, blob: r.blob })
    }
  } finally {
    swapProjectSilent(keep)
  }
  return out
}

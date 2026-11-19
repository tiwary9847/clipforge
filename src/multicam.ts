// Multicam: sync 2–4 camera angles by their sound, then cut between them at the playhead.
import { decodeMonoRange } from './processing'
import { rmsEnvelope } from './dsp'
import { addClipsBatch, baseClip, checkpoint, clipEnd, getAsset, getState, insertSilent, patchClip, setProject, splitClip, uid } from './store'
import { Asset, Clip } from './types'

const HOP = 0.01 // envelope resolution: 10 ms

async function onsetEnv(a: Asset, maxSec: number): Promise<Float32Array | null> {
  const sr = 8000
  const x = await decodeMonoRange(a, 0, Math.min(a.duration, maxSec), sr).catch(() => null)
  if (!x || x.length < sr) return null
  const env = rmsEnvelope(x, Math.round(sr * HOP))
  const on = new Float32Array(env.length)
  for (let i = 1; i < env.length; i++) on[i] = Math.max(0, Math.log1p(env[i] * 50) - Math.log1p(env[i - 1] * 50))
  let m = 0
  for (const v of on) m += v
  m /= on.length
  let sd = 0
  for (let i = 0; i < on.length; i++) {
    on[i] -= m
    sd += on[i] * on[i]
  }
  sd = Math.sqrt(sd / on.length) || 1
  for (let i = 0; i < on.length; i++) on[i] /= sd
  return on
}

/** Seconds that angle `b` started recording after angle `a` (positive = b started later). */
export function bestLag(a: Float32Array, b: Float32Array, maxLagSec = 40): { lag: number; score: number } {
  const M = Math.min(Math.round(maxLagSec / HOP), Math.max(a.length, b.length))
  let best = -Infinity
  let bl = 0
  const sc = new Float32Array(2 * M + 1)
  for (let L = -M; L <= M; L++) {
    let s = 0
    let n = 0
    const i0 = Math.max(0, -L)
    const i1 = Math.min(b.length, a.length - L)
    for (let i = i0; i < i1; i++) {
      s += a[i + L] * b[i]
      n++
    }
    const v = n > 200 ? s / n : -Infinity
    sc[L + M] = v
    if (v > best) {
      best = v
      bl = L
    }
  }
  // parabolic refinement
  const y0 = sc[bl + M - 1] ?? best
  const y2 = sc[bl + M + 1] ?? best
  const den = y0 - 2 * best + y2
  const frac = Number.isFinite(den) && den < 0 ? (0.5 * (y0 - y2)) / den : 0
  return { lag: (bl + frac) * HOP, score: best }
}

export async function createMulticam(assetIds: string[], onStatus: (m: string) => void): Promise<string> {
  const assets = assetIds.map((id) => getAsset(id)).filter((a): a is Asset => !!a && a.kind === 'video')
  if (assets.length < 2) throw new Error('Pick at least 2 video angles.')
  if (assets.length > 4) throw new Error('Up to 4 angles are supported.')
  onStatus('Listening to each camera…')
  const envs: (Float32Array | null)[] = []
  for (const a of assets) envs.push(await onsetEnv(a, 180))
  if (!envs[0]) throw new Error(`“${assets[0].name}” has no sound, so the angles can’t be synced. Put an angle with sound first.`)
  const angles = [{ assetId: assets[0].id, shift: 0, name: 'Cam 1' }]
  const weak: string[] = []
  for (let k = 1; k < assets.length; k++) {
    onStatus(`Syncing camera ${k + 1}…`)
    await new Promise((r) => setTimeout(r, 0))
    const e = envs[k]
    if (!e) {
      weak.push(assets[k].name)
      angles.push({ assetId: assets[k].id, shift: 0, name: `Cam ${k + 1}` })
      continue
    }
    const { lag, score } = bestLag(envs[0]!, e)
    if (score < 0.15) weak.push(assets[k].name)
    // event at cam1 time T appears at cam k time T - lag
    angles.push({ assetId: assets[k].id, shift: +lag.toFixed(3), name: `Cam ${k + 1}` })
  }
  const st = getState()
  const start = st.project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  const a0 = assets[0]
  const video = baseClip('video', 'v1', { assetId: a0.id, label: 'Cam 1', start, dur: a0.duration, fit: 'cover', volume: 0, mc: true })
  const free = (tr: string) => !st.project.clips.some((c) => c.track === tr && c.start < start + a0.duration && clipEnd(c) > start)
  const audio = baseClip('audio', free('a1') ? 'a1' : 'a2', { assetId: a0.id, label: 'Multicam sound (Cam 1)', start, dur: a0.duration })
  addClipsBatch([video, audio], { multicam: { start, angles } })
  const sh = angles.slice(1).map((a) => `${a.name} ${a.shift >= 0 ? '+' : ''}${a.shift.toFixed(2)}s`).join(', ')
  return `Multicam ready (${sh}). Play and click an angle – or press 1–${angles.length} – to cut.` + (weak.length ? ` ⚠ Couldn’t sync reliably: ${weak.join(', ')} – check by eye.` : '')
}

/** Switches the multicam edit to angle k from timeline time t onwards (until the next cut). */
export function cutToAngle(k: number, t: number, cp = true): string {
  const st = getState()
  const mc = st.project.multicam
  if (!mc) return 'No multicam edit in this project.'
  const ang = mc.angles[k]
  if (!ang) return `There is no camera ${k + 1}.`
  const a = getAsset(ang.assetId)
  if (!a) return `Camera ${k + 1}’s file is missing.`
  const cur = st.project.clips.find((c) => c.mc && c.track === 'v1' && t >= c.start - 1e-3 && t < clipEnd(c) - 0.02)
  if (!cur) return 'Move the playhead inside the multicam part of the timeline.'
  if (cur.assetId === ang.assetId) return `Already on ${ang.name}.`
  const tk = t - mc.start - ang.shift
  if (tk < 0 || tk > a.duration - 0.1) return `${ang.name} wasn’t recording at this moment.`
  if (cp) checkpoint()
  let right: Clip = cur
  if (t > cur.start + 0.04) {
    splitClip(cur.id, t, false)
    right = getState().project.clips.find((c) => c.mc && c.track === 'v1' && Math.abs(c.start - t) < 0.02 && c.id !== cur.id) ?? cur
  }
  const avail = a.duration - tk
  const dur = Math.min(right.dur, avail)
  const rest = right.dur - dur
  patchClip(right.id, { assetId: ang.assetId, srcIn: tk, dur, label: ang.name, kf: undefined, speed: 1, volume: 0 })
  if (rest > 0.05) {
    insertSilent([{ ...right, id: uid('clip'), start: right.start + dur, dur: rest, srcIn: right.srcIn + dur }])
  }
  return `Cut to ${ang.name} at ${t.toFixed(2)}s.`
}

export function endMulticam() {
  setProject({ multicam: undefined })
}

/** Cuts the multicam edit to whoever is talking: map[speaker] = camera index. One undo step. */
export function switchBySpeaker(turns: { s: number; e: number; spk: number }[], map: number[], minShot = 1.5): string {
  const mc = getState().project.multicam
  if (!mc) throw new Error('Make a multicam edit first (Tools → Multicam).')
  if (!turns.length) throw new Error('No speaker turns found – run “Find speakers” first.')
  checkpoint()
  let last = -1
  let lastT = -Infinity
  let cuts = 0
  for (const g of turns) {
    const cam = map[g.spk] ?? -1
    if (cam < 0 || cam === last) continue
    const t = Math.max(g.s, lastT + minShot)
    if (t >= g.e - 0.2) continue
    const r = cutToAngle(cam, t, false)
    if (r.startsWith('Cut to') || r.startsWith('Already')) {
      last = cam
      lastT = t
      if (r.startsWith('Cut to')) cuts++
    }
  }
  return `Made ${cuts} cut${cuts === 1 ? '' : 's'} – the camera now follows whoever is talking.`
}

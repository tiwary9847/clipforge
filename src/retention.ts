// Retention coach: finds the moments where viewers are likely to swipe away, says why, and fixes them in one tap.
// Signals: sound (pauses, flat delivery), what changes on screen (cuts, zooms, overlays), speaking pace
// (from captions), and the first 3 seconds. Optional: Gemini/Claude reads the captions for boring or repeated parts.
import { askAI } from './chapters'
import { faceAt } from './faces'
import { mixRange } from './media'
import { cutTimeline } from './retakes'
import { checkpoint, getAsset, getPreset, getState, projectDuration, patchProjectSilent, setClipsSilent, splitClip } from './store'
import { Clip, Keyframe } from './types'
import { engine } from './engine'

export type IssueKind = 'pause' | 'static' | 'flat' | 'slow' | 'start' | 'hook' | 'content' | 'long'
export type Fix = 'cut' | 'zoom' | 'speed' | 'broll' | 'hook'
export interface Issue {
  kind: IssueKind
  from: number
  to: number
  why: string
  fixes: Fix[]
  weight: number // how much it likely costs in viewers
}
export interface Report {
  dur: number
  curve: number[] // estimated % still watching, one value per second
  issues: Issue[]
  score: number // 0..100
  short: boolean
}

export const HOP = 0.25

/** Loudness envelope (dB) of the whole mix, one value per 0.25 s. */
export async function envelope(dur: number, status: (m: string) => void): Promise<Float32Array> {
  const n = Math.ceil(dur / HOP)
  const out = new Float32Array(n).fill(-90)
  // listen to the voice only (main video + voice-over); music and sound effects would hide the pauses
  const clips = getState().project.clips.filter((c) => c.track === 'v1' || (c.track === 'a1' && c.kind === 'audio'))
  for (let t0 = 0; t0 < dur; t0 += 30) {
    status(`Listening… ${Math.round((t0 / dur) * 100)}%`)
    const t1 = Math.min(dur, t0 + 30)
    const buf = await mixRange(clips, getAsset, t0, t1)
    if (!buf) continue
    const L = buf.getChannelData(0)
    const R = buf.getChannelData(1)
    const hop = Math.round(buf.sampleRate * HOP)
    for (let i = 0; i * hop < L.length; i++) {
      let s = 0
      const a = i * hop
      const b = Math.min(L.length, a + hop)
      for (let j = a; j < b; j += 4) {
        const v = (L[j] + R[j]) / 2
        s += v * v
      }
      const k = Math.round(t0 / HOP) + i
      if (k < n) out[k] = 10 * Math.log10(s / Math.max(1, (b - a) / 4) + 1e-12)
    }
  }
  return out
}

/** Times where something new appears on screen: cuts, overlays, zoom keyframes. */
function visualEvents(): number[] {
  const ev: number[] = [0]
  for (const c of getState().project.clips) {
    if (c.track === 'v4' && c.kind === 'text') continue // captions change all the time; they don't count as a new picture
    if (c.kind === 'video' || c.kind === 'image' || c.kind === 'text' || c.kind === 'sticker') {
      ev.push(c.start)
      for (const k of [...(c.kf?.scale ?? []), ...(c.kf?.x ?? [])]) ev.push(c.start + k.t)
    }
  }
  return [...new Set(ev.map((t) => Math.round(t * 4) / 4))].sort((a, b) => a - b)
}

export async function analyse(status: (m: string) => void, ai?: { provider: 'gemini' | 'claude'; key: string }): Promise<Report> {
  // only the video itself counts – music or text running past the last shot isn't something viewers watch
  const mainEnd = getState().project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, c.start + c.dur), 0)
  const dur = mainEnd > 0 ? Math.min(mainEnd, projectDuration()) : projectDuration()
  if (dur < 3) throw new Error('Add a video of at least a few seconds first.')
  const P = getPreset()
  const short = P.h > P.w
  const env = await envelope(dur, status)
  status('Looking for slow parts…')
  // speech = clearly above the quiet floor
  const sorted = Array.from(env).filter((v) => v > -89).sort((a, b) => a - b)
  const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.15)] : -90
  const loudRef = sorted.length ? sorted[Math.floor(sorted.length * 0.8)] : -30
  const hasSound = sorted.length > 4 && loudRef > -55
  const voiced = Array.from(env, (v) => v > Math.max(floor + 8, loudRef - 22))
  const issues: Issue[] = []

  if (hasSound) {
    // pauses: 1.2 s or more without speech (not at the very end)
    let i = 0
    while (i < voiced.length) {
      if (voiced[i]) {
        i++
        continue
      }
      let j = i
      while (j < voiced.length && !voiced[j]) j++
      const a = i * HOP
      const b = Math.min(dur, j * HOP)
      if (b - a >= 1.2 && b < dur - 0.5 && a > 0.2) issues.push({ kind: 'pause', from: a, to: b, why: `${(b - a).toFixed(1)} s of silence`, fixes: ['cut'], weight: (b - a) * 1.6 })
      i = j
    }
    // flat delivery: 8 s of speech with little change in loudness
    const win = Math.round(8 / HOP)
    for (let k = 0; k + win <= env.length; k += Math.round(4 / HOP)) {
      const seg = Array.from(env.slice(k, k + win)).filter((_, q) => voiced[k + q])
      if (seg.length < win * 0.7) continue
      const m = seg.reduce((s, v) => s + v, 0) / seg.length
      const sd = Math.sqrt(seg.reduce((s, v) => s + (v - m) ** 2, 0) / seg.length)
      if (sd < 3.2) issues.push({ kind: 'flat', from: k * HOP, to: (k + win) * HOP, why: 'same tone and loudness for 8 s – sounds flat', fixes: ['zoom', 'speed', 'broll'], weight: 2.2 })
    }
  }

  // nothing new on screen for too long
  const limit = short ? 6 : 12
  const ev = [...visualEvents(), dur]
  for (let k = 1; k < ev.length; k++) {
    const gap = ev[k] - ev[k - 1]
    if (gap > limit) issues.push({ kind: 'static', from: ev[k - 1] + limit * 0.5, to: ev[k], why: `same shot for ${Math.round(gap)} s – nothing new on screen`, fixes: ['zoom', 'broll', 'speed'], weight: (gap - limit) * 0.45 + 1 })
  }

  // speaking pace from captions
  const caps = getState().project.clips.filter((c) => c.track === 'v4' && c.kind === 'text' && c.text?.text)
  if (caps.length > 3) {
    const W = 8
    for (let a = 0; a + W <= dur; a += 4) {
      const words = caps.filter((c) => c.start >= a && c.start < a + W).reduce((s, c) => s + c.text!.text.split(/\s+/).filter(Boolean).length, 0)
      const talking = voiced.slice(Math.round(a / HOP), Math.round((a + W) / HOP)).filter(Boolean).length * HOP
      if (talking > W * 0.6 && words / talking < 1.6) issues.push({ kind: 'slow', from: a, to: a + W, why: `slow talking (${(words / talking).toFixed(1)} words a second)`, fixes: ['speed', 'cut'], weight: 1.8 })
    }
  }

  // the first seconds decide everything
  if (hasSound) {
    const first = voiced.findIndex(Boolean) * HOP
    if (first > 0.8) issues.push({ kind: 'start', from: 0, to: first, why: `nothing is said for the first ${first.toFixed(1)} s`, fixes: ['cut'], weight: 6 + first * 2 })
  }
  const textEarly = getState().project.clips.some((c) => c.kind === 'text' && c.track !== 'v4' && c.start < 1.5)
  if (short && !textEarly) issues.push({ kind: 'hook', from: 0, to: Math.min(3, dur), why: 'no hook text in the first seconds – most viewers decide in 2–3 s', fixes: ['hook'], weight: 4 })
  if (short && dur > 60) issues.push({ kind: 'long', from: 60, to: dur, why: `${Math.round(dur)} s long – Shorts and Reels do best under 60 s`, fixes: ['cut'], weight: 3 })

  // optional: an AI reads what is said
  if (ai && caps.length > 3) {
    status('AI is reading what you say…')
    try {
      const lines = caps.map((c) => `[${c.start.toFixed(1)}] ${c.text!.text}`).join('\n').slice(0, 8000)
      const r = await askAI(ai.provider, ai.key, `You are a YouTube retention editor. Here are the captions of a ${Math.round(dur)} s ${short ? 'Short/Reel' : 'video'} with start times in seconds:
${lines}
Find up to 6 parts where viewers are likely to leave: repeated points, slow explanations, off-topic talk, long intros. Ignore the very end.
Reply only JSON: {"parts":[{"from":12.3,"to":19.0,"why":"max 10 words, in the creator's language style","fix":"cut" or "zoom" or "broll"}]}`, true)
      const parts = JSON.parse(r.replace(/^```(json)?|```$/g, '').trim()).parts as { from: number; to: number; why: string; fix: Fix }[]
      for (const p of parts ?? []) {
        const a = Math.max(0, +p.from)
        const b = Math.min(dur, +p.to)
        if (!(b - a > 0.5)) continue
        issues.push({ kind: 'content', from: a, to: b, why: '🤖 ' + String(p.why).slice(0, 90), fixes: [p.fix === 'zoom' || p.fix === 'broll' ? p.fix : 'cut', ...(['zoom', 'speed'] as Fix[]).filter((f) => f !== p.fix)], weight: 3 + (b - a) * 0.4 })
      }
    } catch {
      status('The AI check didn’t answer – showing the on-device check only.')
    }
  }

  // estimated retention curve (an estimate from these signals, not YouTube data)
  const secs = Math.ceil(dur)
  const pen = new Float32Array(secs)
  for (const s of issues) {
    const per = s.weight / Math.max(1, s.to - s.from)
    for (let t = Math.floor(s.from); t < Math.min(secs, Math.ceil(s.to)); t++) pen[t] += per
  }
  const base = short ? 0.6 : 0.18
  const curve: number[] = []
  let r = 100
  for (let t = 0; t < secs; t++) {
    r -= base * (t < 3 ? 3 : 1) + pen[t] * 0.9
    r = Math.max(3, r)
    curve.push(Math.round(r * 10) / 10)
  }
  // merge overlaps of the same kind, worst first
  const merged: Issue[] = []
  for (const s of issues.sort((a, b) => a.from - b.from)) {
    const last = [...merged].reverse().find((m) => m.kind === s.kind)
    // pauses and the slow start are cut exactly as found – merging them would swallow the words in between
    if (last && s.kind !== 'pause' && s.kind !== 'start' && s.from <= last.to + 0.5) {
      last.to = Math.max(last.to, s.to)
      last.weight += s.weight * 0.5
      if (last.kind === 'flat') last.why = `same tone and loudness for ${Math.round(last.to - last.from)} s – sounds flat`
      if (last.kind === 'slow') last.why = `slow talking for ${Math.round(last.to - last.from)} s`
    } else merged.push({ ...s })
  }
  const avg = curve.reduce((s, v) => s + v, 0) / Math.max(1, curve.length)
  const score = Math.round(Math.max(0, Math.min(100, avg * 1.1)))
  return { dur, curve, issues: merged.sort((a, b) => b.weight - a.weight).slice(0, 14), score, short }
}

/* ---------------- fixes ---------------- */

const mainAt = (t: number) => getState().project.clips.find((c) => c.track === 'v1' && (c.kind === 'video' || c.kind === 'image') && t >= c.start && t < c.start + c.dur)

/** Removes [a, b] from everything (silence is trimmed with a little breathing room). */
export const MAX_SAFE_CUT = 6
export function fixCut(s: Issue): string {
  const pad = s.kind === 'pause' ? 0.15 : 0
  const a = s.kind === 'start' ? 0 : s.from + pad
  const b = s.to - pad
  // safety: a "pause" or slow start this long is almost surely talking that was quiet – never cut it blindly
  if ((s.kind === 'pause' || s.kind === 'start') && b - a > MAX_SAFE_CUT) return `Skipped ${fmt(s.from)}–${fmt(s.to)}: too long to be a pause – check it by hand.`
  const removed = cutTimeline([[a, Math.max(a, b)]])
  return `Cut ${removed.toFixed(1)} s. Everything after moved up.`
}

/** Punch-in zooms over [from, to]: one for a short stretch, one every few seconds for a long one
 *  (centred on the face when known). */
export function fixZoom(s: Issue): string {
  const every = getPreset().h > getPreset().w ? 5 : 8
  const wins: [number, number][] = []
  if (s.to - s.from <= every * 1.6) wins.push([s.from, s.to])
  else for (let t = s.from; t + 1.5 < s.to; t += every) wins.push([t, Math.min(s.to, t + 2.5)])
  checkpoint()
  let n = 0
  for (const [a0, b0] of wins) {
    const c = mainAt(a0 + 0.05)
    if (!c) continue
    const a = Math.max(0, a0 - c.start)
    const b = Math.min(c.dur, b0 - c.start)
    if (b - a < 0.4) continue
    const cur = getState().project.clips.find((x) => x.id === c.id)!
    const base = c.scale || 1
    const z = base * (n % 2 ? 1.12 : 1.2)
    const f = c.kind === 'video' ? faceAt(c.assetId, c.srcIn + (a + (b - a) / 2) * c.speed, 0) : null
    const fx = f ? f[0] : 0.5
    const fy = f ? f[1] - f[3] * 0.1 : 0.42
    const k = z / base - 1
    const zx = (c.x ?? 0.5) + (0.5 - fx) * k * 0.9
    const zy = (c.y ?? 0.5) + (0.5 - fy) * k * 0.9
    const put = (list: Keyframe[] | undefined, rest: number, zoom: number): Keyframe[] => {
      const keep = (list ?? []).filter((q) => q.t < a - 0.01 || q.t > b + 0.01)
      if (!keep.some((q) => q.t <= 0.01)) keep.push({ t: 0, v: rest })
      keep.push({ t: a, v: zoom }, { t: b, v: rest })
      return keep.sort((p, q) => p.t - q.t)
    }
    setClipsSilent(
      getState().project.clips.map((x) =>
        x.id === c.id ? { ...x, kf: { ...(x.kf ?? {}), scale: put(cur.kf?.scale, base, z), x: put(cur.kf?.x, c.x ?? 0.5, zx), y: put(cur.kf?.y, c.y ?? 0.5, zy) }, ease: cur.kf?.scale?.length ? x.ease : 'hold' } : x,
      ),
    )
    n++
  }
  engine.requestRender()
  return n > 1 ? `Added ${n} punch-in zooms between ${fmt(s.from)} and ${fmt(s.to)}.` : n ? `Zoomed in from ${fmt(s.from)} to ${fmt(s.to)}.` : 'No main video there to zoom.'
}

/** Plays [a, b] faster (1.25×) and moves everything after it up. */
export function fixSpeed(s: Issue, k = 1.25): string {
  const a = s.from
  const b = s.to
  checkpoint()
  // split the main clips at both ends
  for (const t of [a, b]) {
    const c = mainAt(t)
    if (c && t - c.start > 0.05 && c.start + c.dur - t > 0.05) splitClip(c.id, t, false)
  }
  const d = (b - a) * (1 - 1 / k)
  const clips: Clip[] = getState().project.clips.map((c) => {
    const e = c.start + c.dur
    if (c.track === 'v1' && c.kind === 'video' && c.start >= a - 0.01 && e <= b + 0.01) return { ...c, start: a + (c.start - a) / k, dur: c.dur / k, speed: c.speed * k }
    if (c.start >= b - 0.01) return { ...c, start: c.start - d }
    if (c.start >= a - 0.01 && e <= b + 0.01) return { ...c, start: a + (c.start - a) / k, dur: c.dur / k } // captions inside keep in step
    if (c.start < a && e > b && c.track !== 'v1') return { ...c, dur: c.dur - d }
    return c
  })
  setClipsSilent(clips)
  const mk = getState().project.markers
  if (mk?.length) patchProjectSilent({ markers: mk.map((m) => (m >= b ? m - d : m)) })
  engine.requestRender()
  return `Sped up ${fmt(a)}–${fmt(b)} to ${k}× (saved ${d.toFixed(1)} s).`
}

export const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

export const KIND_LABEL: Record<IssueKind, string> = {
  pause: '⏸ Pause',
  static: '🖼 Same shot',
  flat: '😐 Flat',
  slow: '🐢 Slow talk',
  start: '🚪 Slow start',
  hook: '🪝 No hook',
  content: '🤖 Boring part',
  long: '⏱ Too long',
}

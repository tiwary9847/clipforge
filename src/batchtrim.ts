// Batch trim: set the in and out point of every clip on the main track from one list,
// with "apply to all" helpers (cut silent ends, cap the length). Clips stay in order,
// gaps between them are kept, and text/stickers/music placed over a clip move with it.
import { checkpoint, getAsset, getState, setClipsSilent } from './store'
import type { Clip } from './types'

export interface Range { a: number; b: number } // seconds in the source file
export const MIN_LEN = 0.3

export const mainClips = (): Clip[] =>
  getState().project.clips.filter((c) => c.track === 'v1' && !c.freeze).sort((x, y) => x.start - y.start)

/** Longest the clip can be (the whole source for videos; up to 15 s for photos). */
export function fullLen(c: Clip): number {
  const a = getAsset(c.assetId)
  if (c.kind === 'video' && a?.duration) return a.duration
  return Math.max(15, c.srcIn + c.dur * c.speed)
}
export const rangeOf = (c: Clip): Range => ({ a: c.kind === 'video' ? c.srcIn : 0, b: (c.kind === 'video' ? c.srcIn : 0) + c.dur * c.speed })

/** Where the sound starts and stops in a video (null when it has no sound info yet). */
export function quietEnds(c: Clip): Range | null {
  const a = getAsset(c.assetId)
  if (c.kind !== 'video' || !a?.peaks?.length || !a.duration) return null
  const p = a.peaks
  const max = Math.max(...p)
  if (max < 0.02) return null // silent clip – nothing to go by
  const th = Math.max(0.02, max * 0.12)
  const bin = a.duration / p.length
  let i = 0
  while (i < p.length && p[i] < th) i++
  let j = p.length - 1
  while (j > i && p[j] < th) j--
  const pad = 0.15
  return { a: Math.max(0, i * bin - pad), b: Math.min(a.duration, (j + 1) * bin + pad) }
}

/** Clamp a wanted range to what the clip allows. */
export function clampRange(c: Clip, r: Range): Range {
  const full = fullLen(c)
  let a = Math.max(0, Math.min(r.a, full - MIN_LEN))
  let b = Math.min(full, Math.max(r.b, a + MIN_LEN))
  if (c.kind !== 'video') { b = b - a; a = 0 } // photos only have a length
  return { a, b }
}

/** Lay out the main track with the given ranges. Call begin() once per gesture for undo. */
export function apply(ranges: Record<string, Range>) {
  const all = getState().project.clips
  const main = mainClips()
  if (!main.length) return
  const moved = new Map<string, { start: number; dur: number; srcIn: number }>()
  // old clip → (old start, how much was cut from its front in timeline seconds, new start)
  const shift: { id: string; oldStart: number; oldEnd: number; newStart: number; front: number; newEnd: number }[] = []
  let cursor = main[0].start
  let prevOldEnd = main[0].start
  for (const c of main) {
    const r = ranges[c.id] ? clampRange(c, ranges[c.id]) : rangeOf(c)
    const gap = Math.max(0, c.start - prevOldEnd)
    const start = cursor + gap
    const dur = (r.b - r.a) / c.speed
    const old = rangeOf(c)
    moved.set(c.id, { start, dur, srcIn: c.kind === 'video' ? r.a : c.srcIn })
    shift.push({ id: c.id, oldStart: c.start, oldEnd: c.start + c.dur, newStart: start, front: (r.a - old.a) / c.speed, newEnd: start + dur })
    prevOldEnd = c.start + c.dur
    cursor = start + dur
  }
  const place = (t: number): number => {
    // inside a clip: keep its place in that clip's picture; after the last: follow the end
    for (const s of shift) if (t >= s.oldStart && t < s.oldEnd) return Math.min(s.newEnd, Math.max(s.newStart, s.newStart + (t - s.oldStart) - s.front))
    let last = shift[0]
    for (const s of shift) if (s.oldEnd <= t) last = s
    return t < shift[0].oldStart ? t : last.newEnd + (t - last.oldEnd)
  }
  const out = all.map((c) => {
    const m = moved.get(c.id)
    if (m) return { ...c, ...m }
    if (c.track === 'v1') return c
    const start = Math.max(0, place(c.start))
    return start === c.start ? c : { ...c, start }
  })
  setClipsSilent(out)
}
export const begin = () => checkpoint()

/** Ranges for "apply to all". */
export function allQuiet(): Record<string, Range> {
  const o: Record<string, Range> = {}
  for (const c of mainClips()) {
    const q = quietEnds(c)
    if (q) o[c.id] = q
  }
  return o
}
export function allMax(sec: number): Record<string, Range> {
  const o: Record<string, Range> = {}
  for (const c of mainClips()) {
    const r = rangeOf(c)
    if (r.b - r.a > sec) o[c.id] = { a: r.a, b: r.a + sec }
  }
  return o
}
export function allCut(front: number, back: number): Record<string, Range> {
  const o: Record<string, Range> = {}
  for (const c of mainClips()) {
    if (c.kind !== 'video') continue
    const r = rangeOf(c)
    if (r.b - r.a - front - back >= MIN_LEN) o[c.id] = { a: r.a + front, b: r.b - back }
  }
  return o
}
export const total = () => mainClips().reduce((s, c) => s + c.dur, 0)

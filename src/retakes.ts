// Bad-take remover: when you say a line, stop and say it again, keep only the last try.
// Also a timeline-wide ripple cut used by the "Ready to post?" fixes.
import { spokenFromCaptions } from './chapters'
import { norm } from './textedit'
import { checkpoint, getState, patchProjectSilent, setClipsSilent, uid } from './store'
import { engine } from './engine'
import { Clip, KfMap } from './types'

const shiftKf = (kf: KfMap | undefined, dt: number): KfMap | undefined => {
  if (!kf) return kf
  const out: KfMap = {}
  for (const [k, list] of Object.entries(kf)) {
    const l = (list ?? []).map((q) => ({ ...q, t: q.t - dt })).filter((q) => q.t >= -0.001)
    if (l.length) out[k as keyof KfMap] = l
  }
  return out
}

/** Removes timeline ranges from every track and closes the gaps (one undo step). Returns seconds removed. */
export function cutTimeline(ranges: [number, number][], cp = true): number {
  const rs = ranges
    .map(([a, b]) => [Math.max(0, a), b] as [number, number])
    .filter(([a, b]) => b - a > 0.05)
    .sort((p, q) => q[0] - p[0]) // latest first
  if (!rs.length) return 0
  if (cp) checkpoint()
  let clips = getState().project.clips
  let markers = getState().project.markers ?? []
  let removed = 0
  for (const [a, b] of rs) {
    const d = b - a
    const next: Clip[] = []
    for (const c of clips) {
      const s = c.start
      const e = c.start + c.dur
      if (e <= a + 1e-4) next.push(c)
      else if (s >= b - 1e-4) next.push({ ...c, start: s - d })
      else if (s >= a && e <= b) continue // fully inside: gone
      else if (c.kind === 'video' || c.kind === 'audio') {
        // keep the parts before and after, the source jumps over the cut
        if (s < a) next.push({ ...c, dur: a - s, transOut: { type: 'none', dur: 0.5 }, fadeOut: 0 })
        if (e > b) {
          const off = b - s
          next.push({ ...c, id: s < a ? uid('clip') : c.id, start: a, dur: e - b, srcIn: c.srcIn + off * c.speed, transIn: { type: 'none', dur: 0.5 }, fadeIn: 0, kf: shiftKf(c.kf, off), volKf: undefined, duck: undefined })
        }
      } else if (s < a && e > b) next.push({ ...c, dur: c.dur - d })
      else if (s < a) next.push({ ...c, dur: a - s })
      else if (e - b > 0.3 && e - b >= 0.5 * c.dur) next.push({ ...c, start: a, dur: e - b, kf: shiftKf(c.kf, b - s) }) // mostly after the cut: keep the rest
    }
    clips = next
    markers = markers.filter((m) => m <= a || m >= b).map((m) => (m >= b ? m - d : m))
    removed += d
  }
  setClipsSilent(clips)
  patchProjectSilent({ markers })
  engine.requestRender()
  return removed
}

const toks = (s: string) => norm(s).split(/\s+/).filter(Boolean)
function lcs(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[a.length][b.length]
}

export interface Retake {
  from: number // timeline seconds: start of the bad try
  to: number // start of the good try
  bad: string
  good: string
}

/** Finds lines you said again soon after (false starts and repeated sentences). Keeps the last try. */
export function findRetakes(): Retake[] {
  const said = spokenFromCaptions()
  if (!said.length) throw new Error('Make captions first (Captions tab) – the bad-take finder reads what you said.')
  const out: Retake[] = []
  let i = 0
  while (i < said.length - 1) {
    const A = toks(said[i].text)
    let hit = -1
    if (A.length >= 2) {
      for (let j = i + 1; j <= Math.min(said.length - 1, i + 3); j++) {
        if (said[j].start - said[i].start > 25) break
        const B = toks(said[j].text).slice(0, A.length + 2)
        const sim = lcs(A, B) / A.length
        const sameStart = A[0] === B[0] || A[1] === B[1]
        if (sim >= 0.7 || (sim >= 0.55 && sameStart)) hit = j // keep looking: a third try wins over the second
      }
    }
    if (hit > 0) {
      const prevEnd = i > 0 ? said[i - 1].end : 0
      out.push({ from: Math.max(prevEnd, said[i].start - 0.05), to: said[hit].start - 0.06, bad: said.slice(i, hit).map((s) => s.text).join(' '), good: said[hit].text })
      i = hit
    } else i++
  }
  return out.filter((r) => r.to - r.from > 0.2)
}

export function removeRetakes(list: Retake[]): string {
  if (!list.length) return 'Nothing to remove.'
  const s = cutTimeline(list.map((r) => [r.from, r.to]))
  return `Removed ${list.length} bad take${list.length > 1 ? 's' : ''} (${s.toFixed(1)} s). Captions and everything above moved with the video. Undo to bring them back.`
}

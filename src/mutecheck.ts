// Mute check: most people scroll with the sound off. This finds every stretch where someone is talking
// but nothing on screen says what (no caption or text), and the opening seconds with no words at all.
import { HOP, envelope } from './retention'
import { addText, getState, projectDuration, updateClip } from './store'
import { TEXT_STYLES } from './textstyles'
import { engine } from './engine'

export interface Lost {
  from: number
  to: number
  kind: 'speech' | 'opening'
}
export interface MuteReport {
  dur: number
  score: number // % of talking time a muted viewer can follow
  speech: number // seconds of talking
  lost: Lost[]
  /** one value per 0.25 s: 0 = quiet, 1 = talking with words on screen, 2 = talking, nothing on screen */
  strip: Uint8Array
  hasCaptions: boolean
}

/** Is there readable text on screen at time t? */
function textAt(t: number) {
  return getState().project.clips.some((c) => c.kind === 'text' && !!c.text?.text?.trim() && t >= c.start && t < c.start + c.dur && (c.opacity ?? 1) > 0.2)
}

export async function muteCheck(status: (m: string) => void = () => {}): Promise<MuteReport> {
  const clips = getState().project.clips
  const mainEnd = clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, c.start + c.dur), 0)
  const dur = mainEnd > 0 ? Math.min(mainEnd, projectDuration()) : projectDuration()
  if (dur < 1) throw new Error('Add a video first.')
  const env = await envelope(dur, status)
  status('Checking what a muted viewer sees…')
  const sorted = Array.from(env).filter((v) => v > -89).sort((a, b) => a - b)
  const floor = sorted.length ? sorted[Math.floor(sorted.length * 0.15)] : -90
  const loudRef = sorted.length ? sorted[Math.floor(sorted.length * 0.8)] : -30
  const hasSound = sorted.length > 4 && loudRef > -55
  const n = env.length
  const strip = new Uint8Array(n)
  let talk = 0
  let covered = 0
  for (let i = 0; i < n; i++) {
    const voiced = hasSound && env[i] > Math.max(floor + 8, loudRef - 22)
    if (!voiced) continue
    talk++
    if (textAt(i * HOP + HOP / 2)) {
      strip[i] = 1
      covered++
    } else strip[i] = 2
  }
  // group the uncovered talking into stretches (short gaps between words are bridged)
  const lost: Lost[] = []
  let i = 0
  while (i < n) {
    if (strip[i] !== 2) {
      i++
      continue
    }
    let j = i
    let gap = 0
    let k = i
    while (k < n && gap * HOP <= 0.75) {
      if (strip[k] === 2) {
        j = k
        gap = 0
      } else if (strip[k] === 1) break
      else gap++
      k++
    }
    const a = i * HOP
    const b = Math.min(dur, (j + 1) * HOP)
    if (b - a >= 0.8) lost.push({ from: a, to: b, kind: 'speech' })
    i = j + 1
  }
  // the first 2 seconds: with sound off, words on screen are the only hook
  const openEnd = Math.min(2, dur)
  let openText = false
  for (let t = 0.1; t < openEnd; t += 0.25) if (textAt(t)) openText = true
  if (!openText) lost.unshift({ from: 0, to: openEnd, kind: 'opening' })
  const hasCaptions = getState().project.clips.some((c) => c.track === 'v4' && c.kind === 'text')
  const score = talk ? Math.round((covered / talk) * 100) : openText ? 100 : 60
  return { dur, score: openText || !talk ? score : Math.max(0, score - 10), speech: talk * HOP, lost, strip, hasCaptions }
}

/** Adds an empty-looking text at a lost stretch and selects it, so the user just types what they said. */
export function addTextFor(l: Lost): string {
  const st = TEXT_STYLES.find((s) => s.id === (l.kind === 'opening' ? 't-hormozi' : 'c-boxed')) ?? TEXT_STYLES[0]
  engine.seek(l.from)
  const c = addText({ ...st, y: l.kind === 'opening' ? 0.3 : 0.78 }, l.kind === 'opening' ? 'Type your hook here' : 'Type what you say here')
  if (!c) return ''
  updateClip(c.id, { start: l.from, dur: Math.max(1, l.to - l.from), y: l.kind === 'opening' ? 0.3 : 0.78 })
  window.dispatchEvent(new CustomEvent('cf:edittext', { detail: c.id }))
  return l.kind === 'opening' ? 'Hook text added – type a line that makes people stop scrolling.' : 'Text added for this part – type what you say here.'
}

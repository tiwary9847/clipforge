// Text-based editing: transcribe a clip, then delete words (or fillers / long pauses) to cut the video.
import { Word, transcribe } from './captions'
import { extractMono16k } from './media'
import { devanagariToRoman } from './tools2'
import { checkpoint, clipEnd, getAsset, getClip, getState, restructureClip, setClipsSilent, setProject } from './store'
import { Clip } from './types'

export const FILLERS_EN = ['um', 'umm', 'uh', 'uhh', 'uhm', 'hmm', 'hm', 'er', 'erm', 'ah', 'aah', 'eh', 'mm']
export const FILLERS_EXTRA = ['like', 'you know', 'basically', 'actually', 'so', 'matlab', 'yaani', 'toh', 'na', 'haan']

export const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').trim()

export async function transcribeAsset(clipId: string, opts: { model: string; language: string; gpu: boolean; roman: boolean }, onProgress: (m: string, p?: number) => void, signal: { cancelled: boolean }): Promise<number> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'video' && c.kind !== 'audio')) throw new Error('Select a video or audio clip with speech.')
  onProgress('Reading the audio…')
  const whole = { ...c, srcIn: 0, dur: a.duration, speed: 1 } as Clip
  const audio = await extractMono16k(whole, a)
  if (!audio || audio.length < 1600) throw new Error('This clip has no audio to transcribe.')
  const words = await transcribe(audio, opts, onProgress, signal)
  if (!words.length) throw new Error('No speech was found.')
  const out = words.map((w) => ({ ...w, text: opts.roman && /[ऀ-ॿ]/.test(w.text) ? devanagariToRoman(w.text) : w.text }))
  setProject({ transcripts: { ...(getState().project.transcripts ?? {}), [a.id]: out } })
  return out.length
}

/** Timeline clips that play a given asset's own sound/picture. */
const clipsOf = (assetId: string) => getState().project.clips.filter((c) => c.assetId === assetId && (c.kind === 'video' || c.kind === 'audio') && !c.freeze)

/** Is source time s of the asset still on the timeline? Returns the timeline time if so. */
export function timelineTime(assetId: string, s: number): number | null {
  for (const c of clipsOf(assetId)) {
    const a = c.srcIn
    const b = c.srcIn + c.dur * c.speed
    if (s >= a - 1e-3 && s < b) return c.start + (s - a) / c.speed
  }
  return null
}

/** Removes source-time ranges of an asset from every clip that uses it (one undo step). Returns seconds removed. */
export function cutRanges(assetId: string, ranges: [number, number][]): number {
  const rs = ranges.filter(([a, b]) => b - a > 0.02).sort((p, q) => p[0] - q[0])
  if (!rs.length) return 0
  // merge
  const m: [number, number][] = []
  for (const r of rs) {
    const last = m[m.length - 1]
    if (last && r[0] <= last[1] + 0.02) last[1] = Math.max(last[1], r[1])
    else m.push([...r])
  }
  let removed = 0
  let first = true
  // latest clips first so earlier clips keep their positions while later ones ripple
  for (const c of [...clipsOf(assetId)].sort((p, q) => q.start - p.start)) {
    const A = c.srcIn
    const B = c.srcIn + c.dur * c.speed
    const segs: { srcIn: number; srcLen: number; speed: number }[] = []
    let cur = A
    for (const [a, b] of m) {
      if (b <= cur || a >= B) continue
      if (a > cur) segs.push({ srcIn: cur, srcLen: a - cur, speed: c.speed })
      cur = Math.max(cur, b)
    }
    if (cur < B) segs.push({ srcIn: cur, srcLen: B - cur, speed: c.speed })
    const kept = segs.filter((g) => g.srcLen / g.speed >= 0.06)
    const lost = (B - A - kept.reduce((s, g) => s + g.srcLen, 0)) / c.speed
    if (lost < 0.01) continue
    if (first) {
      checkpoint()
      first = false
    }
    removed += lost
    if (kept.length) restructureClip(c.id, kept, false)
    else {
      // the whole clip was deleted: remove it and close the gap
      const end = clipEnd(c)
      setClipsSilent(
        getState()
          .project.clips.filter((x) => x.id !== c.id)
          .map((x) => (x.track === c.track && x.start >= end - 1e-3 ? { ...x, start: x.start - c.dur } : x)),
      )
    }
  }
  return removed
}

/** Range to remove for words i..j (inclusive), taking the pause after them too so speech stays tight. */
export function wordRange(words: Word[], i: number, j: number): [number, number] {
  const a = words[i].start - 0.03
  const next = words[j + 1]
  const b = next ? Math.min(next.start - 0.04, words[j].end + 0.35) : words[j].end + 0.15
  return [Math.max(0, a), Math.max(a + 0.05, b)]
}

export function fillerIndices(words: Word[], list: string[]): number[] {
  const set = new Set(list.map(norm))
  const out: number[] = []
  for (let i = 0; i < words.length; i++) {
    const w = norm(words[i].text)
    if (set.has(w)) out.push(i)
    else if (i + 1 < words.length && set.has(w + ' ' + norm(words[i + 1].text))) out.push(i, i + 1)
  }
  return [...new Set(out)]
}

export function pauseRanges(words: Word[], minPause: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i + 1 < words.length; i++) {
    const gap = words[i + 1].start - words[i].end
    if (gap > minPause) out.push([words[i].end + 0.15, words[i + 1].start - 0.1])
  }
  return out
}

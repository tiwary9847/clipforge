// Auto-captions without the panel (used by the AI assistant): transcribe every speaking clip on the device,
// Hinglish in Roman letters, karaoke style, placed in the safe zone.
import { CapMode, Word, buildLines, transcribe } from './captions'
import { CAPTION_STYLES, MODELS, lineKeyword } from './components/MediaPanel'
import { extractMono16k } from './media'
import { addCaptionClips, getAsset, getClip, getPreset, getState } from './store'
import { devanagariToRoman } from './tools2'
import { Clip } from './types'

export const hasCaptions = () => getState().project.clips.some((c) => c.track === 'v4' && c.kind === 'text')

export async function autoCaptions(status: (m: string, p?: number) => void, signal: { cancelled: boolean } = { cancelled: false }, styleId = 'pop', mode: CapMode = 'karaoke'): Promise<string> {
  const speaking = getState().project.clips.filter((c) => (c.kind === 'video' || c.kind === 'audio') && c.track !== 'a2' && c.volume > 0 && !c.freeze && getAsset(c.assetId))
  if (!speaking.length) throw new Error('Add a video with talking first.')
  // one transcription per file, covering the parts used
  const byAsset = new Map<string, Clip[]>()
  for (const c of speaking) byAsset.set(c.assetId!, [...(byAsset.get(c.assetId!) ?? []), c])
  const parts: { clip: Clip; words: Word[] }[] = []
  let j = 0
  for (const [aid, cs] of byAsset) {
    j++
    const asset = getAsset(aid)!
    const from = Math.min(...cs.map((c) => c.srcIn))
    const to = Math.max(...cs.map((c) => c.srcIn + c.dur * c.speed))
    const tag = byAsset.size > 1 ? `File ${j}/${byAsset.size}: ` : ''
    status(tag + 'Reading the audio…')
    const audio = await extractMono16k({ ...cs[0], srcIn: from, dur: to - from, speed: 1 }, asset)
    if (!audio || audio.length < 1600) continue
    const words = await transcribe(audio, { model: MODELS[1].id, language: 'auto', gpu: false, translate: false }, (m, p) => status(tag + m, p), signal)
    for (const c of cs) {
      const a = c.srcIn - from
      const b = a + c.dur * c.speed
      const ws = words.filter((w) => w.end > a + 0.05 && w.start < b - 0.05).map((w) => ({ ...w, start: w.start - a, end: w.end - a }))
      if (ws.length) parts.push({ clip: c, words: ws })
    }
  }
  const all = parts.flatMap((p) => p.words)
  if (!all.length) throw new Error('No speech was found in the video.')
  for (const w of all) if (/[ऀ-ॿ]/.test(w.text)) w.text = devanagariToRoman(w.text)
  const P = getPreset()
  const portrait = P.h > P.w
  const def = CAPTION_STYLES.find((s) => s.id === styleId) ?? CAPTION_STYLES[0]
  const st = def.make(portrait ? 0.036 : 0.055)
  if (!st.hlColor) st.hlColor = '#ffe500'
  if (def.id === 'pop' && mode === 'karaoke') st.color = '#ffffff'
  const y = P.safe ? 0.68 : portrait ? 0.8 : 0.86
  const lines = parts
    .flatMap((p) =>
      buildLines(p.words, getClip(p.clip.id) ?? p.clip, mode, 4).map((l) => {
        if (!def.kw) return l
        const k = lineKeyword(l.text)
        return { ...l, extra: { kwIdx: k.idx, ...(def.emoji && k.emoji ? { emoji: k.emoji } : {}) } } as typeof l
      }),
    )
    .sort((a, b) => a.start - b.start)
  addCaptionClips(lines, st, y)
  return `Added ${lines.length} captions from ${all.length} words.`
}

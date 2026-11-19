// Hindi (or any language) → English dubbing: Whisper translates the speech, an English AI voice reads each
// sentence at the moment it was said (sped up a little if needed, pitch kept), and the original is turned down.
import { Word, transcribe } from './captions'
import { decodeMono } from './media'
import { encodeWav, timeStretch } from './dsp'
import { synth } from './pro'
import { speakerDuring } from './speakers'
import { addAsset, baseClip, checkpoint, clipEnd, getAsset, getState, insertSilent, patchClip, uid } from './store'
import { engine } from './engine'
import { Asset, Clip } from './types'

export interface DubOptions {
  voices: string[] // voice per speaker (index 0 = default)
  original: number // volume left on the original sound, 0..1
  model: string
  gpu: boolean
}

interface Line {
  text: string
  t0: number // timeline seconds
  t1: number
  spk: number
}

/** Transcribes (or translates) the parts of each file the clips use (each file once). Words come back in timeline time. */
export async function wordsOnTimeline(clips: Clip[], o: { model: string; gpu: boolean; translate: boolean; language?: string }, onProgress: (m: string, p?: number) => void, signal: { cancelled: boolean }) {
  const out: { clip: Clip; words: Word[] }[] = []
  const byAsset = new Map<string, Clip[]>()
  for (const c of clips) byAsset.set(c.assetId!, [...(byAsset.get(c.assetId!) ?? []), c])
  let j = 0
  for (const [aid, cs] of byAsset) {
    j++
    const a = getAsset(aid) as Asset
    const from = Math.min(...cs.map((c) => c.srcIn))
    const to = Math.min(a.duration, Math.max(...cs.map((c) => c.srcIn + c.dur * c.speed)))
    const tag = byAsset.size > 1 ? `File ${j}/${byAsset.size}: ` : ''
    onProgress(tag + 'Reading the audio…')
    const audio = await decodeMono(a, from, to, 16000)
    if (!audio || audio.length < 1600) continue
    const words = await transcribe(audio, { model: o.model, language: o.language ?? 'auto', gpu: o.gpu, translate: o.translate }, (m, p) => onProgress(tag + (o.translate ? m.replace('Transcribing', 'Translating') : m), p), signal)
    for (const c of cs) {
      const a0 = c.srcIn - from
      const a1 = a0 + c.dur * c.speed
      const ws = words.filter((w) => w.end > a0 + 0.05 && w.start < a1 - 0.05).map((w) => ({ text: w.text, start: c.start + (w.start - a0) / c.speed, end: c.start + (w.end - a0) / c.speed }))
      if (ws.length) out.push({ clip: c, words: ws })
    }
  }
  return out
}

/** Groups words into sentences to speak. */
export function sentences(words: Word[], clip: Clip): Line[] {
  const lines: Line[] = []
  let cur: Word[] = []
  const flush = () => {
    if (!cur.length) return
    const text = cur.map((w) => w.text).join(' ').replace(/\s+([,.!?])/g, '$1').trim()
    const t0 = cur[0].start
    const t1 = cur[cur.length - 1].end
    const src = (t: number) => clip.srcIn + (t - clip.start) * clip.speed
    if (text) lines.push({ text, t0, t1, spk: Math.max(0, speakerDuring(clip.assetId, src(t0), src(t1))) })
    cur = []
  }
  for (const w of words) {
    const prev = cur[cur.length - 1]
    if (prev && (w.start - prev.end > 0.55 || /[.!?]$/.test(prev.text) || cur.length >= 16 || w.end - cur[0].start > 8)) flush()
    cur.push(w)
  }
  flush()
  return lines
}

export async function dubToEnglish(clips: Clip[], o: DubOptions, onProgress: (m: string, p?: number) => void, signal: { cancelled: boolean }): Promise<string> {
  const speaking = clips.filter((c) => (c.kind === 'video' || c.kind === 'audio') && c.assetId && c.volume > 0 && !c.freeze)
  if (!speaking.length) throw new Error('Add a video with people talking first.')
  const parts = await wordsOnTimeline(speaking, { model: o.model, gpu: o.gpu, translate: true }, onProgress, signal)
  const lines = parts.flatMap((p) => sentences(p.words, p.clip)).sort((a, b) => a.t0 - b.t0)
  if (!lines.length) throw new Error('No speech was found to dub.')
  // speak every line
  const SR = 24000
  const voiced: { line: Line; x: Float32Array }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (signal.cancelled) throw new Error('Cancelled.')
    const L = lines[i]
    onProgress(`Speaking line ${i + 1} of ${lines.length}…`, (i / lines.length) * 100)
    const voice = o.voices[L.spk] ?? o.voices[0]
    const r = await synth(L.text, voice, (m) => onProgress(m))
    let x = r.audio
    if (r.sr !== SR) x = resample(x, r.sr, SR)
    // fit into the gap before the next line (speed up to 1.35×, pitch kept)
    const next = lines[i + 1]?.t0 ?? L.t1 + 2
    const room = Math.max(0.6, next - L.t0 - 0.08)
    const len = x.length / SR
    if (len > room) x = timeStretch(x, SR, Math.min(1.35, len / room))
    voiced.push({ line: L, x })
    await new Promise((r2) => setTimeout(r2, 0))
  }
  // one sound file holding every line back to back; each timeline clip points at its line
  const gap = Math.round(SR * 0.25)
  const total = voiced.reduce((s, v) => s + v.x.length + gap, 0)
  const all = new Float32Array(total)
  const offs: number[] = []
  let p = 0
  for (const v of voiced) {
    offs.push(p / SR)
    all.set(v.x, p)
    p += v.x.length + gap
  }
  const asset = await engine.importFile(new File([encodeWav(all, SR)], `English dub (${voiced.length} lines).wav`, { type: 'audio/wav' }))
  if (!asset) throw new Error('Could not load the dubbed voice.')
  addAsset(asset)
  checkpoint()
  const st = getState()
  const t0 = lines[0].t0
  const t1 = Math.max(...voiced.map((v) => v.line.t0 + v.x.length / SR))
  const free = (tr: string) => !st.project.clips.some((c) => c.track === tr && c.start < t1 && clipEnd(c) > t0)
  const track = free('a1') ? 'a1' : free('a2') ? 'a2' : 'a1'
  const group = uid('grp')
  let at = -Infinity
  const made = voiced.map((v, i) => {
    const start = Math.max(v.line.t0, at + 0.02) // never overlap the previous line
    at = start + v.x.length / SR
    return baseClip('audio', track, { assetId: asset.id, label: `🇬🇧 ${v.line.text}`.slice(0, 60), start, dur: v.x.length / SR, srcIn: offs[i], group, volume: 1 })
  })
  insertSilent(made)
  for (const c of speaking) patchClip(c.id, { volume: o.original })
  engine.requestRender()
  const spk = new Set(lines.map((l) => l.spk)).size
  return `Dubbed ${lines.length} sentences into English${spk > 1 ? ` with ${spk} voices` : ''}. Original sound turned down to ${Math.round(o.original * 100)}%. Each line is its own clip – drag to adjust; Undo removes the dub.`
}

function resample(x: Float32Array, from: number, to: number): Float32Array {
  const n = Math.round((x.length * to) / from)
  const y = new Float32Array(n)
  const r = from / to
  for (let i = 0; i < n; i++) {
    const p = i * r
    const k = Math.floor(p)
    const f = p - k
    y[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? x[k] ?? 0) * f
  }
  return y
}

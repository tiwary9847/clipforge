// Hook maker: writes on-screen opening lines from what you say, and puts the chosen one on the first seconds.
import { askAI, contentWords, spokenFromCaptions } from './chapters'
import { baseClip, checkpoint, clipEnd, getPreset, getState, insertSilent, setClipsSilent } from './store'
import { engine } from './engine'
import { Clip, TextProps } from './types'

const HINDI = new Set('hai hain ka ki ke mein aur kya nahi bhi toh hum main tum ye yeh woh wo tha thi kar karo raha rahe se ko pe par bahut accha'.split(' '))
export const isHinglish = (text: string) => {
  const w = text.toLowerCase().split(/\s+/)
  return w.filter((x) => HINDI.has(x)).length / Math.max(1, w.length) > 0.08
}

const STRONG = /\b(sabse|best|worst|first|pehli|never|kabhi|secret|sach|truth|mistake|galti|free|sasta|mehenga|crazy|unbelievable|shocking|shock|pagal|kamaal|zabardast|only|sirf|finally|aakhir|why|kyun|kaise|how|kya)\b/i

/** Offline hook ideas from your captions. */
export function quickHooks(): string[] {
  const said = spokenFromCaptions()
  if (!said.length) throw new Error('Make captions first (Captions tab) – hooks are written from what you say.')
  const all = said.map((s) => s.text).join(' ')
  const hi = isHinglish(all)
  const scored = said
    .map((s) => {
      const n = s.text.split(/\s+/).length
      let sc = 0
      if (/[0-9₹]/.test(s.text)) sc += 3
      if (STRONG.test(s.text)) sc += 2
      if (/\?|kya|kaise|kyun|how|why/i.test(s.text)) sc += 1
      if (n >= 3 && n <= 10) sc += 1
      return { s, sc }
    })
    .sort((a, b) => b.sc - a.sc)
  const shorten = (t: string) => {
    const w = t.replace(/[.,!]+$/, '').split(/\s+/)
    return w.length > 8 ? w.slice(0, 8).join(' ') + '…' : w.join(' ')
  }
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  const freq = new Map<string, number>()
  for (const w of contentWords(all)) if (w.length > 3) freq.set(w, (freq.get(w) ?? 0) + 1)
  const topic = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const out = [cap(shorten(scored[0].s.text)) + (scored[0].sc >= 3 ? ' 😳' : '')]
  if (topic) out.push(hi ? `${cap(topic)} ka sach jo koi nahi batata 🤫` : `What nobody tells you about ${topic} 🤫`)
  out.push(hi ? 'Ye video end tak zaroor dekhna 😱' : 'Watch till the end 😱')
  if (scored[1] && out.length < 3) out.push(cap(shorten(scored[1].s.text)))
  return [...new Set(out)].slice(0, 3)
}

/** Hook ideas written by Gemini / Claude with your key. */
export async function aiHooks(provider: 'gemini' | 'claude', key: string): Promise<string[]> {
  const said = spokenFromCaptions()
  if (!said.length) throw new Error('Make captions first (Captions tab) – hooks are written from what you say.')
  const text = said.map((s) => s.text).join(' ').slice(0, 3000)
  const prompt = `You write on-screen hook text for YouTube Shorts and Instagram Reels.
Here is everything the creator says in the video:
"""${text}"""
Write 3 different hook lines to show in big text during the first 2 seconds, so viewers keep watching.
Rules: max 8 words each; same language and style as the creator (Hinglish in Roman letters if they speak Hinglish); only promise what the video really has; at most one emoji each; make the 3 different (a question, a bold claim, a curiosity gap).
Reply only JSON: {"hooks":["...","...","..."]}`
  const r = await askAI(provider, key, prompt, true)
  let list: string[] = []
  try {
    list = JSON.parse(r.replace(/^```(json)?|```$/g, '').trim()).hooks
  } catch {
    list = r.split('\n').map((l) => l.replace(/^[\s\d.\-*"]+|"$/g, '').trim()).filter(Boolean)
  }
  list = list.map((h) => String(h).trim()).filter(Boolean).slice(0, 3)
  if (!list.length) throw new Error('The AI writer gave no hooks – try again.')
  return list
}

/** Puts the hook as big text on the first seconds (replaces an earlier hook) with a whoosh. */
export function addHookText(text: string, dur = 2.6, cp = true): string {
  const P = getPreset()
  const portrait = P.h > P.w
  if (cp) checkpoint()
  const keep = getState().project.clips.filter((c) => !c.label.startsWith('Hook: ') && !c.label.startsWith('Hook sound'))
  const busy = (tr: string) => keep.some((c) => c.track === tr && c.start < dur && clipEnd(c) > 0)
  const track = ['v3', 'v2'].find((t) => !busy(t)) ?? 'v3'
  const words = text.split(/\s+/)
  let kw = 0
  words.forEach((w, i) => {
    if (w.replace(/[^\p{L}\p{N}]/gu, '').length > words[kw].replace(/[^\p{L}\p{N}]/gu, '').length) kw = i
  })
  const props: TextProps = {
    text,
    font: 'Impact, "Arial Narrow Bold", sans-serif',
    size: portrait ? 0.052 : 0.085,
    color: '#ffffff',
    stroke: '#000000',
    strokeW: 0.2,
    bg: '#000000',
    bgOpacity: 0,
    bold: false,
    italic: false,
    upper: true,
    align: 'center',
    shadow: true,
    maxW: 0.86,
    anim: 'pop',
    animDur: 0.35,
    kwIdx: [kw],
    kwColor: '#ffd400',
  }
  const clips: Clip[] = [
    baseClip('text', track, { label: `Hook: ${text}`, start: 0, dur, y: portrait ? 0.24 : 0.18, text: props, transOut: { type: 'fade', dur: 0.2 } }),
    baseClip('sfx', 'a1', { sfxId: 'whoosh', label: 'Hook sound', start: 0, dur: 0.7, volume: 0.5 } as Partial<Clip>),
  ]
  setClipsSilent(keep)
  insertSilent(clips)
  engine.requestRender()
  return `Hook added on the first ${dur} s: “${text}”. Edit the words by clicking the text.`
}

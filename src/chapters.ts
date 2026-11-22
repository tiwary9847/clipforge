// Auto chapters + title / description / hashtag helper, from what is said in the video.
import { withCredits } from './musiclib'
import { getState, projectDuration, setProject, checkpoint, getPreset, patchProjectSilent } from './store'
import { PLACES } from './travelmap'

export interface Sentence {
  text: string
  start: number
  end: number
}

// Hindi, Hinglish and English filler / function words that say nothing about the topic
const STOP = new Set(
  `a an the and or but if so to of in on at by for with from up down out over is am are was were be been being have has had do does did will would can could should may might must i me my we our you your he she it its they them their this that these those there here what which who whom whose when where why how all any both each few more most other some such no not only own same than too very just also now then again once ok okay yeah yes hi hello guys friends like really actually basically literally right well go going gone get got make made let lets one two three thing things today video videos channel please subscribe
hai hain ho hu hoon tha thi the thhe kya ki ka ke ko se me mein mai main par pe aur ya bhi to toh hi nahi nahin na ek do teen yeh ye woh wo voh is us iss uss isko usko ab abhi phir fir kuch sab bahut bohot bhut jo jab tab kaise kaisa kaisi kyun kyu kaha kahan yaha yahan waha wahan apna apne apni hum ham tum aap mera meri mere tera teri tere uska uski uske unka unki unke inka inki inke hota hoti hote raha rahe rahi rha rhe rhi gaya gayi gaye gya gyi gye kar karo karna karte karta karti kiya kiye liya liye diya diye dekho dekhte dekha dekhiye chalo chaliye accha acha achha haan han matlab yaar bhai dosto doston log logo logon wala wali wale waala waali waale sakte sakta sakti lekin magar kyunki agar warna jaise waise aisa aise waisa aaj kal parso din raat subah shaam bas sirf wahi yahi chal chale aaye aaya aayi hua hui hue kitna kitni kitne thoda thodi zyada jyada dekh dekhna bata batao bolo bola boli socha lagta lagti laga lag rha rahi raha rahe hoga hogi honge karenge karunga karungi kuchh koi kisi sabhi sabko mujhe tumhe humein unhe inhe yahi wohi everyone welcome back guys today gonna wanna got also`.split(/\s+/),
)

export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))
}

/** What was said, as sentences on the timeline: from caption clips if there are any, else from given words. */
export function spokenFromCaptions(): Sentence[] {
  const texts = getState()
    .project.clips.filter((c) => c.kind === 'text' && c.text?.text && c.track === 'v4')
    .sort((a, b) => a.start - b.start)
  const out: Sentence[] = []
  for (const c of texts) {
    const t = c.text!.text.replace(/\s+/g, ' ').trim()
    const last = out[out.length - 1]
    // word-highlight captions repeat the same line once per word – merge them
    if (last && last.text === t && c.start - last.end < 0.3) last.end = c.start + c.dur
    else out.push({ text: t, start: c.start, end: c.start + c.dur })
  }
  return out
}

const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** Keywords of a stretch of text, ranked against the whole video (tf-idf-ish). */
function keywords(seg: Sentence[], df: Map<string, number>, nDocs: number, k = 3): string[] {
  const tf = new Map<string, number>()
  for (const s of seg) for (const w of contentWords(s.text)) tf.set(w, (tf.get(w) ?? 0) + 1)
  return [...tf.entries()]
    .map(([w, n]) => [w, n * Math.log(1 + nDocs / (df.get(w) ?? 1))] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([w]) => w)
}

export interface Chapter {
  t: number
  name: string
}

/** Suggests chapters at long pauses, cuts between clips and changes of topic. */
export function suggestChapters(spoken: Sentence[], wanted = 0): Chapter[] {
  const dur = projectDuration()
  if (dur < 40) throw new Error('Chapters need a video of at least ~40 seconds (YouTube wants 3 chapters of 10 s or more).')
  const count = wanted || Math.max(3, Math.min(12, Math.round(dur / 90)))
  const minGap = Math.max(10, Math.min(60, dur / (count * 1.6)))
  // candidate starts: sentence starts, especially after a pause, plus clip cuts on the main track
  const cuts = new Set(getState().project.clips.filter((c) => c.track === 'v1' && c.start > 1).map((c) => +c.start.toFixed(1)))
  const cands: { t: number; score: number }[] = []
  const win = Math.max(20, Math.min(90, dur / count / 1.5))
  const bag = (a: number, b: number) => {
    const m = new Map<string, number>()
    for (const s of spoken) if (s.start >= a && s.start < b) for (const w of contentWords(s.text)) m.set(w, (m.get(w) ?? 0) + 1)
    return m
  }
  const cos = (x: Map<string, number>, y: Map<string, number>) => {
    let d = 0
    let nx = 0
    let ny = 0
    x.forEach((v, k) => {
      nx += v * v
      d += v * (y.get(k) ?? 0)
    })
    y.forEach((v) => (ny += v * v))
    return nx && ny ? d / Math.sqrt(nx * ny) : 0
  }
  spoken.forEach((s, i) => {
    if (s.start < minGap || s.start > dur - 10) return
    const pause = i > 0 ? s.start - spoken[i - 1].end : 0
    const nearCut = [...cuts].some((c) => Math.abs(c - s.start) < 1.5)
    const before = bag(s.start - win, s.start)
    const after = bag(s.start, s.start + win)
    const change = before.size && after.size ? 1 - cos(before, after) : 0.4
    cands.push({ t: s.start, score: change * 1.5 + Math.max(0, Math.min(2, pause) - 0.6) * 0.3 + (nearCut ? 0.4 : 0), change } as any)
  })
  // no speech? fall back to cuts, then even spacing
  if (!cands.length) for (const c of cuts) if (c >= minGap && c <= dur - 10) cands.push({ t: c, score: 1 })
  cands.sort((a, b) => b.score - a.score)
  const picked = [0]
  for (const c of cands) {
    if (picked.length >= count) break
    if (picked.every((p) => Math.abs(p - c.t) >= minGap)) picked.push(c.t)
  }
  for (let k = 1; picked.length < 3 && k < 6; k++) {
    const t = (dur * picked.length) / 3
    if (picked.every((p) => Math.abs(p - t) >= 10)) picked.push(t)
  }
  // nudge each chapter (±10 s) onto the sentence where the topic changes most sharply
  for (let i = 1; i < picked.length; i++) {
    const near = (cands as any[]).filter((c) => Math.abs(c.t - picked[i]) <= 10 && picked.every((p, j) => j === i || Math.abs(p - c.t) >= minGap))
    const best = near.sort((a, b) => b.change - a.change || Math.abs(a.t - picked[i]) - Math.abs(b.t - picked[i]))[0]
    if (best && best.change > ((cands as any[]).find((c) => c.t === picked[i])?.change ?? 0) + 0.02) picked[i] = best.t
  }
  picked.sort((a, b) => a - b)
  // names from each chapter's own keywords
  const df = new Map<string, number>()
  const segs = picked.map((t, i) => spoken.filter((s) => s.start >= t && s.start < (picked[i + 1] ?? Infinity)))
  segs.forEach((seg) => new Set(seg.flatMap((s) => contentWords(s.text))).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)))
  const used = new Set<string>()
  return picked.map((t, i) => {
    if (i === 0) return { t: 0, name: 'Intro' }
    const kw = keywords(segs[i], df, segs.length, 4).filter((w) => !used.has(w)).slice(0, 2)
    kw.forEach((w) => used.add(w))
    const place = placeIn(segs[i].map((s) => s.text).join(' '))
    const name = place && !kw.includes(place.toLowerCase()) ? `${place}${kw[0] ? ' – ' + title(kw[0]) : ''}` : kw.length ? kw.map(title).join(' & ') : `Part ${i + 1}`
    return { t: +t.toFixed(2), name }
  })
}

export function applyChapters(ch: Chapter[]) {
  checkpoint()
  const markers = ch.filter((c) => c.t > 0.5).map((c) => c.t)
  const markerNames: Record<string, string> = {}
  for (const c of ch) markerNames[c.t.toFixed(2)] = c.name
  patchProjectSilent({ markers, markerNames })
}

function placeIn(text: string): string | null {
  const low = ` ${text.toLowerCase()} `
  let best: string | null = null
  for (const p of PLACES) if (low.includes(` ${p.n.toLowerCase()} `) && (!best || p.n.length > best.length)) best = p.n
  return best
}

/* ---------- titles, description, hashtags ---------- */

export interface TitlePack {
  titles: string[]
  description: string
  hashtags: string[]
}

export function makeTitles(spoken: Sentence[], extra = ''): TitlePack {
  const all = spoken.map((s) => s.text).join(' ') + ' ' + extra
  const df = new Map<string, number>()
  spoken.forEach((s) => new Set(contentWords(s.text)).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1)))
  const kw = keywords([{ text: all, start: 0, end: 0 }], df, Math.max(1, spoken.length), 6)
  const place = placeIn(all)
  const K = kw.map(title)
  const k1 = place ?? K[0] ?? 'Vlog'
  const k2 = K.find((k) => k.toLowerCase() !== k1.toLowerCase()) ?? 'Daily Vlog'
  const k3 = K.find((k) => ![k1, k2].map((x) => x.toLowerCase()).includes(k.toLowerCase())) ?? 'Fun'
  const short = getPreset().h > getPreset().w
  const couple = Object.keys(getState().project.speakers ?? {}).length > 0 && (getState().project.speakerNames?.length ?? 0) > 1
  const V = couple ? 'Couple Vlog' : 'Vlog'
  const titles = (
    place
      ? [
          `${place} mein ek din 😍 | ${k2} ${V}`,
          `Pehli baar ${place} gaye aur yeh hua 😱`,
          `${place} ka sabse mast ${k2} experience 🔥`,
          `${place} trip – worth it ya nahi? 🤔 | ${k2}`,
          `${place} ${V}: ${k2}, ${k3} aur bahut kuch!`,
          `${place} ne din bana diya ❤️ | ${k2}`,
        ]
      : [
          `${k1} aur ${k2} 😍 | Daily ${V}`,
          `Aaj ka ${k1} experience 🔥 | ${k2}`,
          `${k1} ka asli sach 🤯 | ${V}`,
          `Mera ${k1} wala din 😄 | ${k2} + ${k3}`,
          `${k1}, ${k2} aur ${k3} – full ${V}`,
          `${k1} try kiya – worth it ya nahi? 🤔`,
        ]
  ).map((t) => (t.length > 95 ? t.slice(0, 94) + '…' : t))
  const hashtags = [
    ...new Set(
      [k1, k2, k3, ...K.slice(0, 3)]
        .map((k) => '#' + k.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase())
        .filter((h) => h.length > 3)
        .concat(['#vlog', '#hindivlog', '#dailyvlog', couple ? '#couplevlog' : '#vlogger', short ? '#shorts' : '#youtube', place ? '#travelvlog' : '#minivlog']),
    ),
  ].slice(0, 12)
  const hook = spoken.find((s) => s.text.split(' ').length >= 6)?.text ?? `${k1} vlog`
  const st = getState().project
  const chap = st.markers.length
    ? '\n\n⏱ Chapters\n' +
      [0, ...st.markers]
        .sort((a, b) => a - b)
        .map((t, i) => `${fmt(t)} ${st.markerNames?.[t.toFixed(2)] ?? (i === 0 ? 'Intro' : `Part ${i + 1}`)}`)
        .join('\n')
    : ''
  const description = `${hook.charAt(0).toUpperCase() + hook.slice(1)}${/[.!?]$/.test(hook) ? '' : '…'}\n\nIs video mein: ${[k1, k2, k3].join(', ')} – poora video dekhna, end mein surprise hai! 😄${chap}\n\n👍 Video achha laga toh Like karo, Share karo aur Subscribe karna mat bhoolna 🔔\n\n${hashtags.join(' ')}`
  return { titles, description: withCredits(description), hashtags }
}

const fmt = (t: number) => {
  const s = Math.floor(t)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Optional: better titles from an AI writer with the user's own key (Gemini has a free tier). */
export async function aiTitles(provider: 'gemini' | 'claude', key: string, spoken: Sentence[], notes: string): Promise<TitlePack> {
  const said = spoken.map((s) => s.text).join(' ').slice(0, 7000)
  const fmtHint = getPreset().h > getPreset().w ? 'a YouTube Short / Instagram Reel' : 'a YouTube video'
  const prompt = `You write YouTube metadata for an Indian Hinglish vlog channel. This is ${fmtHint}. What is said in it:\n"""${said}"""\n${notes ? `Creator's notes: ${notes}\n` : ''}Reply with JSON only: {"titles": [6 catchy but honest titles in Hinglish (Roman script), max 70 characters, 0-2 emoji each], "description": "a 4-6 line Hinglish description with a hook first line and a call to like/subscribe", "hashtags": [10 relevant hashtags starting with #]}`
  const text = await askAI(provider, key, prompt)
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('The AI reply wasn’t in the expected format – try again.')
  const o = JSON.parse(m[0])
  return { titles: (o.titles ?? []).slice(0, 8), description: withCredits(String(o.description ?? '')), hashtags: (o.hashtags ?? []).slice(0, 15) }
}

/** Sends a prompt to Gemini or Claude with the user's own key; returns the reply text. */
export const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']

export async function askAI(provider: 'gemini' | 'claude', key: string, prompt: string, json = true): Promise<string> {
  if (provider === 'gemini') {
    // Google retires model versions (gemini-2.0-flash shut down 1 June 2026): use the auto-updating
    // "latest Flash" alias first, then fixed current models if that alias is ever unavailable.
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), temperature: 0.9 } })
    let r: Response | null = null
    for (const model of GEMINI_MODELS) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      if (r.status !== 404) break // 404 = model name gone: try the next one
    }
    r = r!
    if (!r.ok) throw new Error(`Gemini said ${r.status} – check the key.`)
    const j = await r.json()
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) throw new Error(`Claude said ${r.status} – check the key.`)
  const j = await r.json()
  return j.content?.[0]?.text ?? ''
}

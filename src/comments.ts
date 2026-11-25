// Comment preview: shows the comments a reel is likely to get – before it is posted – each tied to the second
// that causes it, with a one-tap fix. Works on the device from measured signals (retention, ready-to-post and
// mute checks); with AI (your key or Pro) it also watches a few frames and reads the captions for real-sounding comments.
import { askAI, spokenFromCaptions } from './chapters'
import { engine } from './engine'
import { Issue, analyse, fixCut, fixSpeed, fixZoom } from './retention'
import { runChecks, Check } from './postcheck'
import { muteCheck, addTextFor, MuteReport } from './mutecheck'
import { getPreset, getState, projectDuration } from './store'

export type CKind = 'complaint' | 'question' | 'praise' | 'joke'
export type FixId = 'cut' | 'zoom' | 'speed' | 'captions' | 'loudness' | 'hook' | 'cta' | 'text' | 'check' | 'none'
export interface PComment {
  id: string
  user: string
  text: string
  kind: CKind
  at: number | null
  likes: number
  why: string
  fix: FixId
  src: 'measured' | 'ai'
  issue?: Issue
  check?: Check
}
export interface CommentReport {
  comments: PComment[]
  complaints: number
  ai: boolean
  aiNote?: string
}

const NAMES = ['rahul_vlogs', 'priya.creates', 'its_aman07', 'desi_editz', 'neha.k', 'vikas_gamer', 'pooja__x', 'the_real_sid', 'ankit.memes', 'simran.dhillon', 'rohit_bhai', 'kavya.reels', 'mohit_fit', 'sana_sketches', 'arjun.0', 'tanya_travels']
const pickName = (i: number) => NAMES[(i * 7 + 3) % NAMES.length]
const short = () => {
  const P = getPreset()
  return P.h > P.w
}

/** The measured part – works offline and for everyone. */
export async function measuredComments(status: (m: string) => void): Promise<{ list: PComment[]; mute: MuteReport | null }> {
  const out: Omit<PComment, 'id' | 'user'>[] = []
  const dur = projectDuration()
  status('Watching your video like a viewer…')
  let rep: Awaited<ReturnType<typeof analyse>> | null = null
  try {
    rep = await analyse(status)
  } catch {}
  let checks: Check[] = []
  try {
    checks = (await runChecks(status, true)).checks
  } catch {}
  let mute: MuteReport | null = null
  try {
    mute = await muteCheck(status)
  } catch {}
  const top = (k: Issue['kind']) => rep?.issues.filter((i) => i.kind === k).sort((a, b) => b.weight - a.weight)[0]
  const L = (w: number) => Math.round(40 + w * 55)

  const st = top('start')
  if (st) out.push({ text: 'Bhai intro skip karo, seedha point pe aao 😴', kind: 'complaint', at: 0, likes: L(st.weight + 3), why: `Nothing is said for the first ${st.to.toFixed(1)} s.`, fix: 'cut', src: 'measured', issue: st })
  const hk = top('hook')
  if (hk) out.push({ text: 'Pehle 3 second mein samajh hi nahi aaya video kis baare mein hai 🤷', kind: 'complaint', at: 0, likes: L(hk.weight + 2), why: 'No hook text in the first seconds – most viewers decide in 2–3 s.', fix: 'hook', src: 'measured' })
  const pa = top('pause')
  if (pa) out.push({ text: `${fmt(pa.from)} pe itna ruk kyun gaye? 😅 network gaya kya`, kind: 'joke', at: pa.from, likes: L(pa.weight), why: `${(pa.to - pa.from).toFixed(1)} s of silence here.`, fix: 'cut', src: 'measured', issue: pa })
  const sta = top('static')
  if (sta) out.push({ text: 'Same frame dekh dekh ke neend aa gayi 😴', kind: 'complaint', at: sta.from, likes: L(sta.weight), why: sta.why, fix: 'zoom', src: 'measured', issue: sta })
  const sl = top('slow')
  if (sl) out.push({ text: '1.5x pe dekha tab jaake video khatam hua 😂', kind: 'joke', at: sl.from, likes: L(sl.weight + 1), why: sl.why, fix: 'speed', src: 'measured', issue: sl })
  const fl = top('flat')
  if (fl && !sta) out.push({ text: 'Thoda energy ke saath bolo bhai, yahan boring ho gaya', kind: 'complaint', at: fl.from, likes: L(fl.weight), why: fl.why, fix: 'zoom', src: 'measured', issue: fl })
  const lo = top('long')
  if (lo) out.push({ text: 'Itna lamba reel? 60 sec mein bolo yaar', kind: 'complaint', at: 60, likes: L(lo.weight), why: lo.why, fix: 'none', src: 'measured' })

  if (mute && mute.speech > 2 && mute.score < 70) {
    const worst = mute.lost.filter((l) => l.kind === 'speech').sort((a, b) => b.to - b.from - (a.to - a.from))[0]
    out.push({ text: 'Sound off karke dekha, kuch samajh nahi aaya 🔇 caption daalo please', kind: 'complaint', at: worst?.from ?? 0, likes: L(5 - mute.score / 25), why: `A muted viewer can follow only ${mute.score}% of what you say.`, fix: mute.hasCaptions ? 'text' : 'captions', src: 'measured' })
  }
  const loud = checks.find((c) => c.id === 'loud')
  if (loud && loud.ok === false) {
    const quiet = /too quiet/.test(loud.detail)
    out.push({ text: quiet ? 'Awaaz bahut dheemi hai, volume full karke bhi 🔇' : 'Kaan phat gaye 🙉 volume itna tez kyun', kind: 'complaint', at: 0, likes: L(3.5), why: loud.detail, fix: 'loudness', src: 'measured', check: loud })
  }
  const safe = checks.find((c) => c.id === 'safe')
  if (safe && safe.ok === false) out.push({ text: 'Text like button ke peeche chhup gaya 👀 kya likha tha?', kind: 'question', at: null, likes: L(1.5), why: safe.detail, fix: safe.fix ? 'check' : 'none', src: 'measured', check: safe })

  // ending: still talking in the last half second = cut off
  const caps = spokenFromCaptions()
  const lastSaid = caps.length ? caps[caps.length - 1].end : 0
  if (caps.length && lastSaid > dur - 0.35 && dur > 3) out.push({ text: 'End mein kya hua?? Video beech mein kat gaya 🤔', kind: 'question', at: Math.max(0, dur - 1.5), likes: L(3), why: 'You are still talking when the video ends.', fix: 'none', src: 'measured' })
  const endText = getState().project.clips.some((c) => c.kind === 'text' && c.track !== 'v4' && c.start + c.dur >= dur - 0.2 && c.start < dur - 0.5)
  if (!endText && dur > 4) out.push({ text: 'Part 2 kab aayega? 👀', kind: 'question', at: Math.max(0, dur - 1), likes: L(1.2), why: 'No ending line – a “Follow for part 2” turns this question into followers.', fix: 'cta', src: 'measured' })

  // what's going well (so the preview feels real – and so you know what to keep)
  const issues = out.filter((c) => c.kind === 'complaint').length
  if (issues <= 1) out.push({ text: 'Editing ekdum smooth hai 🔥🔥', kind: 'praise', at: null, likes: L(4), why: 'Few problems found – the pace holds up.', fix: 'none', src: 'measured' })
  if (mute && mute.score >= 85) out.push({ text: 'Captions ki wajah se bina sound ke bhi samajh aa gaya 👌', kind: 'praise', at: null, likes: L(2), why: `${mute.score}% understandable with the sound off.`, fix: 'none', src: 'measured' })
  if (rep && rep.score >= 70) out.push({ text: 'Poora dekha, ek second bhi skip nahi kiya 🙌', kind: 'praise', at: null, likes: L(3), why: `Retention estimate ${rep.score}/100.`, fix: 'none', src: 'measured' })

  return { list: out.map((c, i) => ({ ...c, id: 'm' + i, user: pickName(i) })), mute }
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/** Small JPEG frames (base64, no prefix) spread over the video, for the AI to look at. */
async function frames(n = 5): Promise<string[]> {
  const dur = projectDuration()
  const was = engine.time
  const out: string[] = []
  const cv = document.createElement('canvas')
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? Math.min(0.5, dur / 4) : (dur * i) / n
    engine.seek(t)
    await new Promise((r) => setTimeout(r, 320))
    engine.render()
    const src = engine.canvas
    if (!src?.width) continue
    const w = 320
    cv.width = w
    cv.height = Math.round((src.height / src.width) * w)
    cv.getContext('2d')!.drawImage(src, 0, 0, cv.width, cv.height)
    out.push(cv.toDataURL('image/jpeg', 0.6).split(',')[1])
  }
  engine.seek(was)
  return out
}

const FIXES: FixId[] = ['cut', 'zoom', 'speed', 'captions', 'loudness', 'hook', 'cta', 'text', 'none']

export async function aiComments(ai: { provider: 'gemini' | 'claude'; key: string }, measured: PComment[], status: (m: string) => void): Promise<PComment[]> {
  const dur = projectDuration()
  status('AI is watching a few frames…')
  const imgs = await frames(5)
  const said = spokenFromCaptions().map((s) => `[${s.start.toFixed(1)}] ${s.text}`).join('\n').slice(0, 6000)
  const onScreen = getState()
    .project.clips.filter((c) => c.kind === 'text' && c.track !== 'v4' && c.text?.text)
    .map((c) => `[${c.start.toFixed(1)}–${(c.start + c.dur).toFixed(1)}] ${c.text!.text.replace(/\n/g, ' ')}`)
    .join('\n')
    .slice(0, 2000)
  const found = measured.filter((m) => m.kind !== 'praise').map((m) => `- ${m.why}${m.at != null ? ` (at ${m.at.toFixed(1)} s)` : ''}`).join('\n')
  status('AI is writing the comments…')
  const prompt = `You are simulating the comment section of an Indian ${short() ? 'Instagram Reel / YouTube Short' : 'YouTube video'} BEFORE it is posted, so the creator can fix problems first.
Video length: ${Math.round(dur)} s. The images are frames from the start, middle and end.
What is said (start time in seconds):
${said || '(no captions – you only have the frames)'}
Text on screen:
${onScreen || '(none)'}
Problems an on-device check measured:
${found || '(none)'}

Write 8 realistic comments real viewers would leave: mostly Hinglish (Hindi in Roman letters mixed with English) like Indian comment sections, unless the video is clearly in another language – then use that language. Mix: 3–4 complaints or questions about specific moments (confusing parts, missing info like price/place/name, boring stretch, audio, claims people would doubt), 1 joke, 2–3 genuine praise about what really works. Refer to real details from the video. No hate, no slurs, nothing sexual.
Reply only JSON: {"comments":[{"user":"instagram-style username","text":"the comment, max 20 words, emojis ok","type":"complaint"|"question"|"praise"|"joke","at":seconds the comment is about or null,"likes":estimated likes 1-5000,"why":"what in the video causes it, max 12 words, English","fix":"cut"|"zoom"|"speed"|"captions"|"loudness"|"hook"|"cta"|"text"|"none"}]}`
  const r = await askAI(ai.provider, ai.key, prompt, true, imgs)
  const j = JSON.parse(r.replace(/^```(json)?|```$/g, '').trim()) as { comments?: Partial<PComment & { type: string }>[] }
  return (j.comments ?? [])
    .filter((c) => c && typeof c.text === 'string' && c.text.trim())
    .slice(0, 10)
    .map((c, i) => {
      const at = typeof c.at === 'number' && isFinite(c.at) ? Math.max(0, Math.min(dur, c.at)) : null
      const kind = (['complaint', 'question', 'praise', 'joke'] as CKind[]).includes(c.type as CKind) ? (c.type as CKind) : 'complaint'
      const fix = FIXES.includes(c.fix as FixId) ? (c.fix as FixId) : 'none'
      return {
        id: 'a' + i,
        user: String(c.user || pickName(i + 5)).replace(/[^\w.]/g, '').slice(0, 20) || pickName(i + 5),
        text: String(c.text).slice(0, 160),
        kind,
        at,
        likes: Math.max(1, Math.min(9999, Math.round(Number(c.likes) || 10))),
        why: String(c.why || '').slice(0, 100),
        // AI comments only get fixes that don't need an exact range; a "cut" becomes "go there and look"
        fix: fix === 'cut' ? 'none' : fix,
        src: 'ai' as const,
      }
    })
}

export async function previewComments(status: (m: string) => void, ai?: { provider: 'gemini' | 'claude'; key: string }): Promise<CommentReport> {
  if (!getState().project.clips.some((c) => c.track === 'v1' && (c.kind === 'video' || c.kind === 'image'))) throw new Error('Add your video first.')
  const { list } = await measuredComments(status)
  let all = list
  let aiOk = false
  let aiNote: string | undefined
  if (ai) {
    try {
      const a = await aiComments(ai, list, status)
      // AI comments first; keep measured ones the AI didn't already cover (same fix near the same second)
      const rest = list.filter((m) => m.kind === 'praise' ? false : !a.some((x) => x.fix === m.fix && m.fix !== 'none' && (x.at == null || m.at == null || Math.abs(x.at - m.at) < 3)))
      all = [...a, ...rest]
      aiOk = a.length > 0
    } catch (e) {
      aiNote = 'The AI didn’t answer – showing the comments measured on your device. ' + ((e as Error).message || '')
    }
  }
  all.sort((a, b) => b.likes - a.likes)
  return { comments: all, complaints: all.filter((c) => c.kind === 'complaint' || c.kind === 'question').length, ai: aiOk, aiNote }
}

/** One-tap fix for a comment. Returns a message. */
export async function fixComment(c: PComment, status: (m: string) => void): Promise<string> {
  const dur = projectDuration()
  const at = c.at ?? 0
  switch (c.fix) {
    case 'cut':
      return c.issue ? fixCut(c.issue) : (engine.seek(at), 'Go to this moment and cut what isn’t needed.')
    case 'zoom':
      return fixZoom(c.issue ?? { kind: 'static', from: at, to: Math.min(dur, at + 4), why: '', fixes: ['zoom'], weight: 1 })
    case 'speed':
      return fixSpeed(c.issue ?? { kind: 'slow', from: at, to: Math.min(dur, at + 6), why: '', fixes: ['speed'], weight: 1 })
    case 'captions': {
      const { autoCaptions } = await import('./captionsAuto')
      return autoCaptions((m) => status(m))
    }
    case 'loudness': {
      const { normaliseLoudness } = await import('./pro')
      return normaliseLoudness(-14)
    }
    case 'hook':
      return addTextFor({ from: 0, to: Math.min(2.5, dur), kind: 'opening' })
    case 'text':
      return addTextFor({ from: at, to: Math.min(dur, at + 2.5), kind: 'speech' })
    case 'cta': {
      const { addCta } = await import('./autopilot')
      return addCta('FOLLOW FOR PART 2 👉')
    }
    case 'check':
      return c.check?.fix ? c.check.fix.run(status) : ''
    default:
      engine.seek(at)
      return ''
  }
}

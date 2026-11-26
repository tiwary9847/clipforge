// AI edit assistant: "Isko 30 second ki reel bana do, captions lagao, upbeat music" → a plan of ViralKaro
// tools, run in a sensible order. Understands English and Hinglish on its own (rules); with a Gemini/Claude
// key it understands anything and explains its plan. Everything it does can be undone in one tap.
import { askAI } from './chapters'
import { autoCaptions, hasCaptions } from './captionsAuto'
import { autoSfx, autoZoom, ZoomStyle } from './autoedit2'
import { autoBroll } from './broll'
import { getKey } from './components/StockPanel'
import { engine } from './engine'
import { addHookText, quickHooks } from './hooks'
import { MOODS, Mood, addMusic } from './musicgen'
import { runChecks } from './postcheck'
import { normaliseLoudness } from './pro'
import { applyBlur, findPeople } from './privacy'
import { cutSilences } from './processing'
import { cutTimeline, findRetakes, removeRetakes } from './retakes'
import { checkpoint, getAsset, getPreset, getState, projectDuration, setProject, swapProjectSilent } from './store'
import { mixRange } from './media'
import { Project } from './types'

export type Act = 'format' | 'silences' | 'trim' | 'captions' | 'retakes' | 'zooms' | 'broll' | 'sfx' | 'music' | 'hook' | 'loudness' | 'blur' | 'check'
export interface Step {
  do: Act
  to?: string // format
  seconds?: number // trim
  mood?: Mood // music
  style?: ZoomStyle // zooms
  text?: string // hook
}

// the order steps always run in, whatever order they were asked in
const ORDER: Act[] = ['format', 'silences', 'trim', 'captions', 'retakes', 'blur', 'zooms', 'broll', 'sfx', 'music', 'hook', 'loudness', 'check']

export const STEP_TEXT: Record<Act, (s: Step) => string> = {
  format: (s) => `Switch to ${s.to === 'yt' ? 'YouTube 16:9' : s.to === 'igportrait' ? 'Instagram post 4:5' : s.to === 'square' ? 'Square 1:1' : 'Shorts / Reels 9:16'}`,
  silences: () => 'Cut silences and pauses',
  trim: (s) => `Keep the best ${s.seconds} seconds`,
  captions: () => 'Add captions',
  retakes: () => 'Remove repeated takes',
  blur: () => 'Blur strangers’ faces',
  zooms: (s) => `Add ${s.style === 'crazy' ? 'lots of' : s.style === 'subtle' ? 'gentle' : ''} punch-in zooms`.replace('  ', ' '),
  broll: () => 'Add B-roll stock clips',
  sfx: () => 'Add sound effects',
  music: (s) => `Add ${MOODS.find((m) => m.id === s.mood)?.name ?? 'background'} music`,
  hook: (s) => (s.text ? `Hook text: “${s.text}”` : 'Add hook text at the start'),
  loudness: () => 'Fix the volume for YouTube/Instagram',
  check: () => 'Check the video (Ready to post)',
}
export const STEP_ICON: Record<Act, string> = { format: '📐', silences: '✂️', trim: '⏱', captions: '💬', retakes: '🔁', blur: '🙈', zooms: '🎯', broll: '🎬', sfx: '🔊', music: '🎵', hook: '🪝', loudness: '📏', check: '✅' }

const MOOD_WORDS: [RegExp, Mood][] = [
  [/\b(edm|party|club|dj)\b/, 'edm'],
  [/\b(hype|energetic|energy|josh|upbeat|fast|tez)\b/, 'hype'],
  [/\b(lo-?fi|study)\b/, 'lofi'],
  [/\b(chill|calm|relax|shant|soft)\b/, 'chill'],
  [/\b(cinematic|epic|filmy)\b/, 'cinematic'],
  [/\b(sad|emotional|dukh|dard)\b/, 'sad'],
  [/\b(desi|indian|bollywood|dhol)\b/, 'desi'],
  [/\b(festive|festival|diwali|holi|tyohar)\b/, 'festive'],
  [/\b(romantic|love|pyaar|pyar|couple)\b/, 'romantic'],
  [/\b(travel|trip|safar|ghoomna|yatra)\b/, 'travel'],
  [/\b(wedding|shaadi|shadi|shehnai)\b/, 'wedding'],
  [/\b(bhakti|devotional|bhajan|mandir|puja|god)\b/, 'bhakti'],
  [/\b(acoustic|guitar)\b/, 'acoustic'],
  [/\b(motivation|motivational|inspire|gym|workout)\b/, 'motivational'],
  [/\b(suspense|mystery|thriller|darr|horror)\b/, 'suspense'],
  [/\b(funny|comedy|masti|mazedar|meme)\b/, 'funny'],
  [/\b(happy|khush|vlog|daily)\b/, 'vlog'],
]

/** Understands common requests in English and Hinglish without any AI service. */
export function rulePlan(text: string): Step[] {
  const q = ' ' + text.toLowerCase().replace(/[’']/g, '') + ' '
  const has = (re: RegExp) => re.test(q)
  const steps: Step[] = []
  if (has(/\b(shorts?|reels?|vertical|9:16|status|khada|story)\b/)) steps.push({ do: 'format', to: 'shorts' })
  else if (has(/\b(16:9|landscape|horizontal|widescreen|youtube video|leta)\b/)) steps.push({ do: 'format', to: 'yt' })
  else if (has(/\b(insta(gram)? post|4:5|feed post)\b/)) steps.push({ do: 'format', to: 'igportrait' })
  else if (has(/\b(square|1:1)\b/)) steps.push({ do: 'format', to: 'square' })
  const sec = q.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|sekand|second ki|sec ki)\b/)
  const min = q.match(/(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|minat)\b/)
  const n = sec ? +sec[1] : min ? +min[1] * 60 : 0
  if (n >= 5) steps.push({ do: 'trim', seconds: Math.round(n) })
  const all = has(/\b(sab kuch|sabkuch|everything|full edit|poora edit|pura edit|viral|best bana|auto ?edit|edit kar ?do|edit karo|professional|pro edit)\b/)
  if (all || has(/\b(silence|silent|pause|boring|khali|chup|gap|dead air|tight|jump ?cuts?|faltu|bekar)\b/)) steps.push({ do: 'silences' })
  if (all || has(/\b(captions?|subtitles?|subs|kaption|text bhi|likh|words on screen)\b/)) steps.push({ do: 'captions' })
  if (has(/\b(retakes?|galti|galtiyan|mistakes?|repeat|dobara|bad takes?|re-?take)\b/)) steps.push({ do: 'retakes' })
  if (all || has(/\b(zoom|zooms|punch|dynamic|engaging|zoom in)\b/)) steps.push({ do: 'zooms', style: has(/\b(crazy|bahut|zyada|lots|bohot|full)\b/) ? 'crazy' : has(/\b(gentle|halka|subtle|thoda)\b/) ? 'subtle' : 'punchy' })
  if (has(/\b(b-?roll|stock|footage)\b/)) steps.push({ do: 'broll' })
  if (all || has(/\b(sound effects?|sfx|whoosh|effects)\b/)) steps.push({ do: 'sfx' })
  if (all || has(/\b(music|gaana|gana|song|bgm|background|beat|tune)\b/)) steps.push({ do: 'music', mood: MOOD_WORDS.find(([re]) => re.test(q))?.[1] ?? 'vlog' })
  if (has(/\b(hook|intro text|opening line|shuruat)\b/) || (all && steps.some((s) => s.do === 'format' && s.to === 'shorts'))) steps.push({ do: 'hook' })
  if (all || has(/\b(loud|loudness|volume|awaaz|aawaz|sound level)\b/)) steps.push({ do: 'loudness' })
  if (has(/\b(blur|pixel|privacy|strangers?|anjaan|chehre|faces)\b/)) steps.push({ do: 'blur' })
  if (steps.length >= 2 || has(/\b(check|ready|score|post karne)\b/)) steps.push({ do: 'check' })
  return tidy(steps)
}

/** Removes duplicates and impossible steps, and sorts into the order that works. */
export function tidy(steps: Step[]): Step[] {
  const seen = new Map<Act, Step>()
  for (const s of steps) if (ORDER.includes(s.do)) seen.set(s.do, { ...seen.get(s.do), ...s })
  // bad-take removal and B-roll read the captions: make them first
  if ((seen.has('retakes') || seen.has('broll')) && !seen.has('captions') && !hasCaptions()) seen.set('captions', { do: 'captions' })
  const dur = projectDuration()
  const t = seen.get('trim')
  if (t && (!t.seconds || t.seconds >= dur - 1)) seen.delete('trim')
  if (seen.has('broll') && !getKey('pexels') && !getKey('pixabay')) seen.delete('broll')
  const mu = seen.get('music')
  if (mu && !MOODS.some((m) => m.id === mu.mood)) mu.mood = 'vlog'
  const z = seen.get('zooms')
  if (z && !['subtle', 'punchy', 'crazy'].includes(z.style ?? '')) z.style = 'punchy'
  return ORDER.filter((a) => seen.has(a)).map((a) => seen.get(a)!)
}

/** Lets Gemini/Claude read the request (any language) and pick the steps. */
export async function aiPlan(text: string, provider: 'gemini' | 'claude', key: string): Promise<{ steps: Step[]; reply: string }> {
  const P = getPreset()
  const st = getState()
  const ctx = `Project: ${Math.round(projectDuration())} s long, format ${P.label}, ${st.project.clips.filter((c) => c.track === 'v1').length} main clip(s), captions: ${hasCaptions() ? 'yes' : 'no'}, music: ${st.project.clips.some((c) => c.track === 'a2') ? 'yes' : 'no'}, stock key for B-roll: ${getKey('pexels') || getKey('pixabay') ? 'yes' : 'no'}.`
  const r = await askAI(
    provider,
    key,
    `You are the assistant inside ViralKaro, a video editor for Indian creators (YouTube, Instagram, Facebook).
${ctx}
The creator asks (English, Hindi or Hinglish): """${text.slice(0, 600)}"""
Choose the editing steps from this list only:
- {"do":"format","to":"shorts"|"yt"|"igportrait"|"square"}
- {"do":"silences"} cut pauses and dead air
- {"do":"trim","seconds":N} keep the best N seconds
- {"do":"captions"} auto captions
- {"do":"retakes"} remove repeated takes / mistakes
- {"do":"blur"} blur faces of strangers (keep the main person)
- {"do":"zooms","style":"subtle"|"punchy"|"crazy"} punch-in zooms on key moments
- {"do":"broll"} stock B-roll that matches the words (only if stock key: yes)
- {"do":"sfx"} sound effects on cuts and key words
- {"do":"music","mood":one of ${MOODS.map((m) => m.id).join('|')}} copyright-free background music
- {"do":"hook","text":"optional hook text, max 7 words, creator's language"} big text in the first seconds
- {"do":"loudness"} fix volume for YouTube/Instagram
- {"do":"check"} final check and score
Only include what the request asks for or clearly implies ("make it viral/professional/edit everything" = silences, captions, zooms, sfx, music, loudness, check, plus hook for Shorts).
Reply only JSON: {"reply":"one short friendly sentence in the creator's language style","steps":[...]}`,
    true,
  )
  const j = JSON.parse(r.replace(/^```(json)?|```$/g, '').trim())
  const steps = tidy((Array.isArray(j.steps) ? j.steps : []).filter((s: Step) => s && typeof s.do === 'string'))
  return { steps, reply: String(j.reply ?? '').slice(0, 200) }
}

/** Finds the liveliest stretch of the timeline and cuts everything else. */
async function keepBest(seconds: number, status: (m: string) => void): Promise<string> {
  const dur = projectDuration()
  if (seconds >= dur - 0.5) return 'Already short enough.'
  const HOP = 0.25
  const n = Math.ceil(dur / HOP)
  const env = new Float32Array(n)
  for (let t0 = 0; t0 < dur; t0 += 30) {
    status(`Finding the best ${seconds} s… ${Math.round((t0 / dur) * 100)}%`)
    const buf = await mixRange(getState().project.clips, getAsset, t0, Math.min(dur, t0 + 30))
    if (!buf) continue
    const d = buf.getChannelData(0)
    const hop = Math.round(buf.sampleRate * HOP)
    for (let i = 0; i * hop < d.length; i++) {
      let s = 0
      for (let j = i * hop; j < Math.min(d.length, (i + 1) * hop); j += 4) s += d[j] * d[j]
      const k = Math.round(t0 / HOP) + i
      if (k < n) env[k] = Math.sqrt(s / (hop / 4))
    }
  }
  const live = env.map((v, i) => v + (i ? Math.abs(v - env[i - 1]) * 1.5 : 0))
  const win = Math.round(seconds / HOP)
  let best = 0
  let bestS = -1
  let sum = 0
  for (let i = 0; i < live.length; i++) {
    sum += live[i]
    if (i >= win) sum -= live[i - win]
    if (i >= win - 1 && sum > bestS) {
      bestS = sum
      best = i - win + 1
    }
  }
  const a = best * HOP
  const b = Math.min(dur, a + seconds)
  cutTimeline([[b, dur], [0, a]].filter(([x, y]) => y - x > 0.05) as [number, number][])
  return `Kept the liveliest ${seconds} s (from ${Math.floor(a / 60)}:${String(Math.floor(a % 60)).padStart(2, '0')}).`
}

export interface RunResult {
  step: Step
  ok: boolean
  msg: string
}

/** Runs the steps in order; a failed step is reported and the rest carry on. */
export async function runPlan(steps: Step[], status: (i: number, m: string) => void, signal: { cancelled: boolean }): Promise<{ results: RunResult[]; before: Project }> {
  const before = structuredClone(getState().project) as Project
  const results: RunResult[] = []
  for (let i = 0; i < steps.length; i++) {
    if (signal.cancelled) break
    const s = steps[i]
    const say = (m: string) => status(i, m)
    say(STEP_TEXT[s.do](s) + '…')
    try {
      let msg = ''
      switch (s.do) {
        case 'format':
          setProject({ presetId: s.to ?? 'shorts' })
          msg = 'Done.'
          break
        case 'silences': {
          const main = getState().project.clips.filter((c) => c.track === 'v1' && c.kind === 'video' && c.volume > 0).map((c) => c.id)
          for (const id of main) await cutSilences(id, 0.4, 0.5)
          msg = `Now ${Math.round(projectDuration())} s long.`
          break
        }
        case 'trim':
          msg = await keepBest(s.seconds!, say)
          break
        case 'captions':
          msg = hasCaptions() ? 'Captions were already there.' : await autoCaptions((m, p) => say(`Captions: ${m}${p != null ? ` ${Math.round(p * 100)}%` : ''}`), signal)
          break
        case 'retakes': {
          const list = findRetakes()
          msg = list.length ? removeRetakes(list) : 'No repeated takes found.'
          break
        }
        case 'blur': {
          const people = await findPeople((m) => say(`Faces: ${m}`), signal)
          msg = people.length > 1 ? applyBlur(people, [people[0]], 'blur') : 'Only one person found – nothing to blur.'
          break
        }
        case 'zooms':
          msg = await autoZoom(s.style ?? 'punchy', say)
          break
        case 'broll':
          msg = await autoBroll({ stock: getKey('pexels') ? 'pexels' : 'pixabay', every: 8, len: 2.5, style: 'full' }, (m) => say(m), signal)
          break
        case 'sfx':
          msg = autoSfx({ cuts: true, words: hasCaptions(), amount: 'normal' })
          break
        case 'music':
          msg = await addMusic(s.mood ?? 'vlog', 'video', 1, say)
          break
        case 'hook': {
          const text = s.text || quickHooks()[0] || 'Ye video end tak dekhna 😱'
          addHookText(text)
          msg = `Added “${text}”.`
          break
        }
        case 'loudness':
          await normaliseLoudness(-14)
          msg = 'Volume set for YouTube and Instagram (−14 LUFS).'
          break
        case 'check': {
          const r = await runChecks(say)
          const bad = r.checks.filter((c) => c.ok === false).length
          msg = `Score ${r.score}/100${bad ? ` · ${bad} thing${bad > 1 ? 's' : ''} to look at in Ready to post` : ''}.`
          break
        }
      }
      results.push({ step: s, ok: true, msg })
    } catch (e) {
      results.push({ step: s, ok: false, msg: (e as Error).message })
    }
    engine.requestRender()
  }
  return { results, before }
}

/** Puts the project back exactly as it was before the assistant ran (one undo step). */
export function undoAll(before: Project) {
  checkpoint()
  swapProjectSilent(before)
  engine.requestRender()
}

export const EXAMPLES = [
  'Isko 30 second ki reel bana do, captions aur upbeat music ke saath',
  'Boring parts hatao aur zoom lagao',
  'Make it a YouTube Short with captions, zooms and sound effects',
  'Sab kuch edit kar do – viral bana do',
  'Galtiyan aur repeat lines hata do',
  'Strangers ke chehre blur kar do',
]

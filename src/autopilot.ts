// Pro Autopilot: one tap from a raw video to finished files (and optionally YouTube).
// It only chains tools that already exist in ClipForge, in a sensible order, and keeps going
// when one step can't run (it says why), so a single missing piece never stops the whole job.
import { zipSync } from 'fflate'
import { cutSilences } from './processing'
import { autoCaptions, hasCaptions } from './captionsAuto'
import { findRetakes, removeRetakes } from './retakes'
import { addHookText, aiHooks, quickHooks } from './hooks'
import { autoSfx, autoZoom, ZoomStyle } from './autoedit2'
import { addMusic, Mood } from './musicgen'
import { normaliseLoudness } from './pro'
import { analyse, fixCut, fixZoom } from './retention'
import { runChecks } from './postcheck'
import { addLogo, loadBrand } from './tools2'
import { KIT_TARGETS, KitItem, KitTarget, aiKit, canAI, kitMeta, kitSpoken, kitText, kitThumb, kitVideos } from './uploadkit'
import { TEXT_PRESETS } from './library'
import { addClipsBatch, baseClip, getState, projectDuration, setProject, swapProjectSilent } from './store'
import { builtinAI } from './plan'
import { uploadToYouTube, setYouTubeThumbnail, getClientId, uploadSupported } from './youtube'
import { engine } from './engine'
import { Project } from './types'

/* ---------------- recipes ---------------- */

export type StepId = 'silences' | 'captions' | 'retakes' | 'hook' | 'zooms' | 'sfx' | 'music' | 'logo' | 'cta' | 'loudness' | 'retention'
export const STEP_LABEL: Record<StepId, string> = {
  silences: 'Cut pauses',
  captions: 'Auto captions',
  retakes: 'Remove bad takes',
  hook: 'Hook text in the first 2½ s',
  zooms: 'Punch-in zooms',
  sfx: 'Sound effects',
  music: 'Background music',
  logo: 'Logo watermark',
  cta: 'Call-to-action at the end',
  loudness: 'Loudness for YouTube/Instagram',
  retention: 'Retention fixes',
}
// retention runs before music/effects are added: it judges the talking, not the soundtrack
export const STEP_ORDER: StepId[] = ['silences', 'captions', 'retakes', 'retention', 'hook', 'zooms', 'sfx', 'music', 'logo', 'cta', 'loudness']

export type Schedule = 'now' | 'tonight' | 'tomorrow-morning' | 'tomorrow-evening'
export interface Recipe {
  id: string
  name: string
  emoji: string
  builtin?: boolean
  preset: string // canvas: 'shorts' | 'yt' …
  steps: Partial<Record<StepId, boolean>>
  captionStyle: string
  zoom: ZoomStyle
  sfx: 'few' | 'normal' | 'lots'
  mood: Mood
  cta: string // e.g. "Call / WhatsApp 98XXXXXXXX"
  about: string // what the video is about – used for titles, description and hashtags (and the AI)
  outputs: KitTarget[]
  youtube: { on: boolean; privacy: 'private' | 'unlisted' | 'public'; when: Schedule; target: KitTarget }
}

const base = (o: Partial<Recipe> & Pick<Recipe, 'id' | 'name' | 'emoji'>): Recipe => ({
  builtin: true,
  preset: 'shorts',
  steps: {},
  captionStyle: 'pop',
  zoom: 'subtle',
  sfx: 'few',
  mood: 'vlog',
  cta: 'FOLLOW FOR MORE',
  about: '',
  outputs: ['shorts', 'yt', 'reels'],
  youtube: { on: false, privacy: 'private', when: 'now', target: 'shorts' },
  ...o,
})
export const BUILTIN_RECIPES: Recipe[] = [
  base({ id: 'talk', name: 'Talking Short', emoji: '🗣', steps: { silences: true, captions: true, retakes: true, hook: true, zooms: true, sfx: true, music: true, logo: true, cta: true, loudness: true, retention: true }, captionStyle: 'hormozi', zoom: 'punchy', mood: 'hype' }),
  base({ id: 'promo', name: 'Property / business promo', emoji: '🏠', steps: { hook: true, music: true, logo: true, cta: true, loudness: true }, mood: 'cinematic', cta: 'Call / WhatsApp: 98XXXXXXXX', about: '2 & 3 BHK flats – location, price and amenities', outputs: ['shorts', 'reels'] }),
  base({ id: 'vlog', name: 'Vlog', emoji: '🎒', steps: { silences: true, captions: true, retakes: true, zooms: true, sfx: true, music: true, cta: true, loudness: true }, captionStyle: 'pop', mood: 'travel', sfx: 'few' }),
  base({ id: 'funny', name: 'Funny / meme', emoji: '😂', steps: { silences: true, captions: true, hook: true, zooms: true, sfx: true, music: true, loudness: true }, captionStyle: 'beast', zoom: 'crazy', sfx: 'lots', mood: 'funny' }),
  base({ id: 'devotional', name: 'Bhajan / devotional', emoji: '🙏', steps: { captions: true, music: true, logo: true, loudness: true }, captionStyle: 'classic', mood: 'bhakti', cta: 'Share with your family 🙏', outputs: ['shorts', 'yt', 'reels'] }),
]

const RK = 'clipforge-recipes'
export function loadRecipes(): Recipe[] {
  let mine: Recipe[] = []
  try {
    mine = JSON.parse(localStorage.getItem(RK) || '[]')
  } catch {}
  return [...BUILTIN_RECIPES.filter((b) => !mine.some((m) => m.id === b.id)), ...mine]
}
export function saveRecipe(r: Recipe): Recipe {
  const mine: Recipe[] = (() => {
    try {
      return JSON.parse(localStorage.getItem(RK) || '[]')
    } catch {
      return []
    }
  })()
  const rec = { ...r, builtin: false, id: r.builtin ? `my-${Date.now().toString(36)}` : r.id }
  const next = [...mine.filter((m) => m.id !== rec.id), rec]
  localStorage.setItem(RK, JSON.stringify(next))
  return rec
}
export function deleteRecipe(id: string) {
  try {
    const mine: Recipe[] = JSON.parse(localStorage.getItem(RK) || '[]')
    localStorage.setItem(RK, JSON.stringify(mine.filter((m) => m.id !== id)))
  } catch {}
}

/* ---------------- running ---------------- */

export interface StepResult {
  id: StepId | 'files' | 'youtube' | 'score'
  label: string
  state: 'done' | 'skipped' | 'failed'
  msg: string
}
export interface RunReport {
  steps: StepResult[]
  before: Project
  score?: number
  kit?: KitItem[]
  youtube?: string
}
export interface RunCtl {
  cancelled: boolean
}
type Say = (m: string, f?: number) => void

const mainClip = () => getState().project.clips.filter((c) => c.track === 'v1' && c.kind === 'video').sort((a, b) => b.dur - a.dur)[0]
const aiOpts = (): { provider: 'gemini' | 'claude'; key: string } | null => {
  const key = localStorage.getItem('clipforge-ai-key') ?? ''
  const provider = (localStorage.getItem('clipforge-ai-prov') as 'gemini' | 'claude') || 'gemini'
  return key ? { provider, key } : builtinAI() ? { provider, key: '' } : null
}

function addCta(text: string) {
  const end = projectDuration()
  if (end <= 0 || !text.trim()) throw new Error('nothing to add')
  const p = TEXT_PRESETS.find((x) => x.id === 'title') ?? TEXT_PRESETS[0]
  const b = loadBrand()
  const len = Math.min(3, end)
  const st = Math.max(0, end - len)
  const busy = (tr: string) => getState().project.clips.some((c) => c.track === tr && c.start < end && c.start + c.dur > st)
  const lane = ['v3', 'v2'].find((t) => !busy(t)) ?? 'v3'
  addClipsBatch([
    baseClip('text', lane, {
      label: text.slice(0, 40),
      start: st,
      dur: len,
      y: 0.62,
      text: { ...p.props, text, size: text.length > 22 ? 0.055 : 0.075, color: '#ffffff', bg: b.color || '#7c5cff', bgOpacity: 0.92, stroke: '#000000', strokeW: 0, anim: 'pop', animDur: 0.4 },
      transIn: { type: 'zoom-in', dur: 0.25 },
    }),
  ])
  return `“${text}” on the last ${len.toFixed(0)} s.`
}

/** Runs the recipe's steps on the current project. Never throws for a single step. */
export async function runAutopilot(r: Recipe, say: Say, ctl: RunCtl): Promise<RunReport> {
  const before: Project = JSON.parse(JSON.stringify(getState().project))
  const steps: StepResult[] = []
  const rec = (id: StepResult['id'], state: StepResult['state'], msg: string) => steps.push({ id, label: STEP_LABEL[id as StepId] ?? id, state, msg })
  if (!mainClip()) throw new Error('Add a video first – Autopilot works on the video on the Main track.')
  if (r.preset && getState().project.presetId !== r.preset) setProject({ presetId: r.preset })
  const todo = STEP_ORDER.filter((s) => r.steps[s])
  const ai = aiOpts()
  let i = 0
  for (const s of todo) {
    if (ctl.cancelled) break
    const f = i++ / Math.max(1, todo.length)
    say(`${STEP_LABEL[s]}…`, f)
    try {
      const c = mainClip()
      let msg = ''
      switch (s) {
        case 'silences':
          if (!c) throw new Error('no video on the Main track')
          msg = await cutSilences(c.id, 0.5, 0.5)
          break
        case 'captions':
          if (hasCaptions()) {
            rec(s, 'skipped', 'Captions were already there.')
            continue
          }
          msg = await autoCaptions((m, p) => say(`Captions: ${m}`, f + (p ?? 0) / todo.length / 100), ctl, r.captionStyle)
          break
        case 'retakes': {
          if (!hasCaptions()) {
            rec(s, 'skipped', 'Needs captions to find repeated lines.')
            continue
          }
          const list = findRetakes()
          if (!list.length) {
            rec(s, 'skipped', 'No repeated lines found.')
            continue
          }
          msg = removeRetakes(list)
          break
        }
        case 'hook': {
          let lines: string[] = []
          if (ai && hasCaptions()) lines = await aiHooks(ai.provider, ai.key).catch(() => [])
          if (!lines.length) lines = quickHooks()
          if (!lines.length) {
            rec(s, 'skipped', 'Needs captions (what you say) to write a hook.')
            continue
          }
          msg = addHookText(lines[0])
          break
        }
        case 'zooms':
          msg = await autoZoom(r.zoom, (m) => say(m, f))
          break
        case 'sfx':
          msg = autoSfx({ cuts: true, words: hasCaptions(), amount: r.sfx })
          break
        case 'music':
          if (getState().project.clips.some((x) => x.track === 'a2' && x.kind === 'audio')) {
            rec(s, 'skipped', 'The video already has music.')
            continue
          }
          msg = await addMusic(r.mood, 'video', Math.floor(Math.random() * 1e6), (m) => say(m, f))
          break
        case 'logo': {
          const b = loadBrand()
          if (!b.logo) {
            rec(s, 'skipped', 'No logo saved yet – add one in Tools → Brand kit.')
            continue
          }
          msg = await addLogo(b)
          break
        }
        case 'cta':
          msg = addCta(r.cta)
          break
        case 'loudness':
          msg = await normaliseLoudness(-14)
          break
        case 'retention': {
          const rep = await analyse((m) => say(m, f))
          const list = rep.issues.filter((x) => ((x.kind === 'pause' || x.kind === 'start') && x.to - x.from <= 4) || x.kind === 'static').sort((a, b) => b.from - a.from)
          if (!list.length) {
            rec(s, 'skipped', `Nothing to fix (score ${rep.score}).`)
            continue
          }
          for (const x of list) x.kind === 'static' ? fixZoom(x) : fixCut(x)
          msg = `Fixed ${list.length} slow spot${list.length === 1 ? '' : 's'}.`
          break
        }
      }
      // a tool that found nothing to do isn't a finished step
      if (/^(Added|Removed|Fixed) 0\b/.test(msg)) rec(s, 'skipped', msg)
      else rec(s, 'done', msg || 'Done.')
    } catch (e) {
      const m = (e as Error).message || String(e)
      rec(s, 'failed', /fetch|network|load|online|reach/i.test(m) ? `${m} (this step downloads a model the first time – check your internet).` : m)
    }
    engine.requestRender()
  }
  let score: number | undefined
  try {
    say('Final check…', 0.98)
    score = (await runChecks(() => {}, false)).score
    steps.push({ id: 'score', label: 'Ready-to-post score', state: 'done', msg: `${score}/100` })
  } catch {}
  say('Edit done.', 1)
  return { steps, before, score }
}

/** Puts the project back exactly as it was before Autopilot. */
export function undoAutopilot(r: RunReport) {
  swapProjectSilent(r.before)
  engine.requestRender()
}

/** Exports the recipe's files: videos, thumbnails/covers, titles, descriptions and hashtags. */
export async function makeFiles(r: Recipe, name: string, say: Say, ctl: RunCtl): Promise<KitItem[]> {
  const targets = r.outputs.length ? r.outputs : (['shorts'] as KitTarget[])
  const spoken = kitSpoken()
  const about = [r.about, /^(video|clip|vid|img|vid_|\d|my first edit)/i.test(name) ? '' : name.replace(/[-_]+/g, ' ')].filter(Boolean).join(' – ')
  let meta = kitMeta(spoken, about)
  const ai = aiOpts()
  if (ai && (spoken.length || about) && canAI()) {
    say('Writing titles with AI…')
    meta = await aiKit(ai.provider, ai.key, spoken, about).catch(() => meta)
  }
  // no speech and no AI: build the text from "About this video" instead of vlog-style guesses
  if (!spoken.length && r.about?.trim() && !(ai && canAI())) meta = aboutMeta(r)
  const items: KitItem[] = []
  for (const t of targets) {
    say(`Thumbnail for ${KIT_TARGETS.find((x) => x.id === t)!.name}…`)
    const m = meta[t]
    const jpg = await kitThumb(t, t === 'reels' ? m.title : m.title.replace(/#\S+/g, '').trim(), '🔥')
    items.push({ target: t, ...m, thumb: { blob: jpg, name: `${name}-${t}-${t === 'yt' ? 'thumbnail' : 'cover'}.jpg`, url: URL.createObjectURL(jpg) } })
  }
  const vids = await kitVideos(targets, name, (m) => say(m), ctl)
  for (const it of items) it.video = vids[it.target]
  return items
}

function aboutMeta(r: Recipe): Record<KitTarget, { title: string; description: string; hashtags: string[] }> {
  const about = r.about.trim().replace(/\s+/g, ' ')
  const stop = new Set(['and', 'the', 'in', 'of', 'for', 'near', 'with', 'to', 'a', 'at', 'on', 'from', 'by', 'ke', 'ki', 'ka', 'mein', 'aur', 'paas'])
  const words = about.toLowerCase().replace(/[^a-z0-9\u0900-\u097f &]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w))
  // names: "Noida Sector 144", "Oxygen Business Park" … become one hashtag each; their words aren't repeated alone
  const names = about.match(/[A-Z][a-z]+(?: (?:Sector )?\d+| [A-Z][a-z]+)+/g) ?? []
  const inName = new Set(names.flatMap((n) => n.toLowerCase().split(' ')))
  const towns = names.filter((n) => /\d/.test(n)).map((n) => n.split(' ')[0].toLowerCase()) // "Noida Sector 144" → #noida too
  const tags = [...new Set([...names.map((n) => '#' + n.replace(/\s+/g, '').toLowerCase()), ...towns.map((t) => '#' + t), ...words.filter((w) => !inName.has(w)).map((w) => '#' + w.replace(/\s+/g, ''))])].slice(0, 12)
  const extra = r.id.includes('promo') || /flat|bhk|plot|property|shop|offer|sale|price/i.test(about) ? ['#realestate', '#property', '#newproject'] : []
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t)
  const title = cut(about, 70)
  const desc = `${about}${r.cta ? `\n\n${r.cta}` : ''}`
  return {
    shorts: { title: `${title} #shorts`.slice(0, 100), description: `${desc}\n\n${['#shorts', ...tags.slice(0, 4)].join(' ')}`, hashtags: ['#shorts', ...tags.slice(0, 4)] },
    yt: { title, description: `${desc}\n\n${[...tags, ...extra].slice(0, 3).join(' ')}`, hashtags: [...tags, ...extra].slice(0, 15) },
    reels: { title: cut(about, 60), description: `${desc}\n.\n${['#reels', '#reelsindia', ...tags, ...extra].slice(0, 25).join(' ')}`, hashtags: ['#reels', '#reelsindia', ...tags, ...extra].slice(0, 25) },
  }
}

/** One zip per video: the files plus a text file with all titles and hashtags. */
export async function zipKit(items: KitItem[], name: string): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  for (const it of items) {
    if (it.video) files[it.video.name] = new Uint8Array(await it.video.blob.arrayBuffer())
    if (it.thumb) files[it.thumb.name] = new Uint8Array(await it.thumb.blob.arrayBuffer())
  }
  files[`${name}-upload-kit.txt`] = new TextEncoder().encode(kitText(items))
  // videos are already compressed – store them as they are (fast)
  const z = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: /\.txt$/.test(k) ? 6 : 0 }]])) as never)
  return new Blob([z], { type: 'application/zip' })
}

export const canYouTube = () => uploadSupported() && !!getClientId()

/** Next publishing time for a schedule choice (India evening/morning slots). */
export function publishTime(w: Schedule, now = new Date()): string | undefined {
  if (w === 'now') return undefined
  const d = new Date(now)
  const at = (days: number, h: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + days)
    x.setHours(h, 0, 0, 0)
    return x
  }
  let t = w === 'tonight' ? at(0, 19) : w === 'tomorrow-morning' ? at(1, 9) : at(1, 19)
  if (t.getTime() < now.getTime() + 20 * 60e3) t = at(1, w === 'tomorrow-morning' ? 9 : 19)
  return t.toISOString()
}
export const SCHEDULE_LABEL: Record<Schedule, string> = { now: 'Right away', tonight: 'Tonight 7 pm', 'tomorrow-morning': 'Tomorrow 9 am', 'tomorrow-evening': 'Tomorrow 7 pm' }

/** Uploads one of the made files to YouTube with its title, description, tags and thumbnail. */
export async function postToYouTube(r: Recipe, items: KitItem[], say: Say): Promise<string> {
  const it = items.find((x) => x.target === r.youtube.target) ?? items.find((x) => x.target === 'yt') ?? items[0]
  if (!it?.video) throw new Error('No video file to upload.')
  const shorts = it.target === 'shorts' || it.target === 'reels'
  const title = shorts && !/#shorts/i.test(it.title) ? `${it.title} #shorts` : it.title
  const url = await uploadToYouTube(it.video.blob, { title, description: it.description, privacy: r.youtube.privacy, tags: it.hashtags, publishAt: publishTime(r.youtube.when), shorts }, (p) => say(`Uploading to YouTube… ${Math.round(p * 100)}%`, p))
  if (it.thumb && it.target === 'yt') await setYouTubeThumbnail(url, it.thumb.blob).catch(() => {})
  return url
}

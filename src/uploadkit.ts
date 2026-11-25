// One-tap upload kit (Pro): the same edit exported for YouTube Shorts, YouTube and Instagram Reels, each with
// its own title, description, hashtags and a thumbnail / cover sized for that platform.
import { Sentence, TitlePack, askAI, makeTitles, spokenFromCaptions, suggestChapters } from './chapters'
import { fastExport } from './fastExport'
import { engine } from './engine'
import { getPreset, getState, projectDuration, setProject } from './store'
import { grabFrame, renderThumb } from './tools2'
import { builtinAI } from './plan'

export type KitTarget = 'shorts' | 'yt' | 'reels'
export const KIT_TARGETS: { id: KitTarget; name: string; preset: string; thumb: [number, number]; emoji: string }[] = [
  { id: 'shorts', name: 'YouTube Shorts', preset: 'shorts', thumb: [1080, 1920], emoji: '📱' },
  { id: 'yt', name: 'YouTube video', preset: 'yt', thumb: [1280, 720], emoji: '▶️' },
  { id: 'reels', name: 'Instagram Reels', preset: 'shorts', thumb: [1080, 1920], emoji: '📸' },
]

export interface KitMeta { title: string; description: string; hashtags: string[] }
export interface KitItem extends KitMeta { target: KitTarget; video?: { blob: Blob; name: string }; thumb?: { blob: Blob; name: string; url: string } }

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…')
const tag = (h: string) => '#' + h.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '')
const uniq = (a: string[]) => [...new Set(a.map((x) => x.toLowerCase()))].map((l) => a.find((x) => x.toLowerCase() === l)!)
const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/** Writes platform-specific text from one title pack (works offline). */
export function tailor(p: TitlePack, spoken: Sentence[]): Record<KitTarget, KitMeta> {
  const base = p.hashtags.map(tag).filter((h) => h.length > 2)
  const title = p.titles[0] || getState().projectName
  const first = p.description.split('\n')[0] || title
  const chapters = projectDuration() > 120 && spoken.length > 6 ? suggestChapters(spoken) : []
  const chap = chapters.length >= 3 ? '\n\nChapters\n' + chapters.map((c) => `${fmtT(c.t)} ${c.name}`).join('\n') : ''
  return {
    shorts: {
      title: clip(title.replace(/#\S+/g, '').trim(), 90) + ' #shorts',
      description: first + '\n\n' + uniq(['#shorts', ...base]).slice(0, 5).join(' '),
      hashtags: uniq(['#shorts', ...base]).slice(0, 5),
    },
    yt: {
      title: clip(p.titles[1] || title, 100),
      description: p.description + chap + '\n\n' + uniq(base).slice(0, 3).join(' '),
      hashtags: uniq(base).slice(0, 15),
    },
    reels: {
      title: clip(title, 60),
      description: first + '\n.\n' + 'Follow for more 🙌' + '\n.\n' + uniq(['#reels', '#reelsindia', '#instagramreels', ...base, '#trending', '#explorepage', '#hindi', '#viral']).slice(0, 25).join(' '),
      hashtags: uniq(['#reels', '#reelsindia', '#instagramreels', ...base, '#trending', '#explorepage']).slice(0, 25),
    },
  }
}

/** Asks the AI for all three platforms in one go (built-in Pro AI or the user's own key). */
export async function aiKit(provider: 'gemini' | 'claude', key: string, spoken: Sentence[], notes: string): Promise<Record<KitTarget, KitMeta>> {
  const said = spoken.map((s) => s.text).join(' ').slice(0, 7000)
  const prompt = `You write upload metadata for an Indian Hinglish creator. What is said in the video:\n"""${said}"""\n${notes ? `Creator's notes: ${notes}\n` : ''}Write separate metadata for three platforms in Hinglish (Roman script), honest (no clickbait lies), 0-2 emoji per title.\nReply with JSON only:\n{"shorts":{"title":"max 90 chars, ends with #shorts","description":"2-3 lines","hashtags":["#shorts", 4 more]},"yt":{"title":"max 70 chars, search-friendly","description":"6-10 lines: hook line, what's inside, call to like/subscribe","hashtags":[12-15 tags]},"reels":{"title":"short hook for the cover, max 40 chars","description":"Instagram caption: hook line, 2-3 short lines, call to follow","hashtags":[20-25 tags incl #reels]}}`
  const text = await askAI(provider, key, prompt)
  const j = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim())
  const out = {} as Record<KitTarget, KitMeta>
  for (const t of ['shorts', 'yt', 'reels'] as KitTarget[]) {
    const m = j[t] ?? {}
    const hashtags = uniq((m.hashtags ?? []).map(tag))
    out[t] = { title: String(m.title ?? ''), description: String(m.description ?? '') + (t === 'reels' ? '\n.\n' + hashtags.join(' ') : ''), hashtags }
  }
  if (!out.yt.title) throw new Error('The AI reply was empty – try again.')
  return out
}

export function kitMeta(spoken: Sentence[], notes: string) {
  return tailor(makeTitles(spoken, notes), spoken)
}
export const kitSpoken = () => spokenFromCaptions()
export const canAI = () => builtinAI() || !!localStorage.getItem('clipforge-ai-key')

/** Thumbnail / cover for a platform from the current frame. */
export async function kitThumb(target: KitTarget, text: string, emoji: string): Promise<Blob> {
  const def = KIT_TARGETS.find((t) => t.id === target)!
  const [w, h] = def.thumb
  const cv = document.createElement('canvas')
  const tall = h > w
  renderThumb(cv, { frame: grabFrame(), text: text.toUpperCase().slice(0, tall ? 40 : 30), emoji, color: '#ffe500', stroke: '#000000', pos: tall ? 'center' : 'bottom', size: tall ? 120 : 130, fit: tall ? 'blur' : 'fill', vignette: true, w, h })
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the thumbnail.'))), 'image/jpeg', 0.92))
}

/** Exports the videos. Same edit; the frame size is switched per platform and put back afterwards. */
export async function kitVideos(targets: KitTarget[], name: string, status: (m: string) => void, sig: { cancelled: boolean }): Promise<Record<string, { blob: Blob; name: string }>> {
  const keep = getPreset().id
  const done: Record<string, { blob: Blob; name: string }> = {}
  try {
    for (const t of targets) {
      if (sig.cancelled) break
      const def = KIT_TARGETS.find((x) => x.id === t)!
      // Shorts and Reels are the same 9:16 file – export once
      const twin = targets.find((o) => o !== t && done[o] && KIT_TARGETS.find((x) => x.id === o)!.preset === def.preset)
      if (twin) {
        done[t] = { blob: done[twin].blob, name: `${name}-${t}.${done[twin].name.split('.').pop()}` }
        continue
      }
      status(`Exporting for ${def.name}…`)
      setProject({ presetId: def.preset })
      await new Promise((r) => setTimeout(r, 120))
      const out = await fastExport((p) => status(`Exporting for ${def.name}… ${Math.round(p * 100)}%`), sig)
      if (out) done[t] = { blob: out.blob, name: `${name}-${t}.${out.ext}` }
    }
  } finally {
    setProject({ presetId: keep })
    setTimeout(() => engine.render(), 0)
  }
  return done
}

/** All the text in one file, ready to copy into YouTube Studio and Instagram. */
export function kitText(items: KitItem[]): string {
  return items
    .map((i) => {
      const d = KIT_TARGETS.find((t) => t.id === i.target)!
      return `===== ${d.name} =====\nTITLE:\n${i.title}\n\nDESCRIPTION:\n${i.description}\n\nHASHTAGS:\n${i.hashtags.join(' ')}\n\nFILES: ${[i.video?.name, i.thumb?.name].filter(Boolean).join(', ')}`
    })
    .join('\n\n\n')
}

// Turn your own edit into a template: the cuts, speeds, transitions, effects, colours, words and
// stickers are kept; your clips are not (others fill it with theirs). Saved on this device;
// share it as a small .viralkaro-template file that friends can import.
import { getState, setUi } from './store'
import type { Slot, TSticker, TText, VideoTemplate } from './vtemplates'
import type { Clip } from './types'

const KEY = 'clipforge-my-templates'
const BPM = 120 // 1 beat = 0.5 s
export function myTemplates(): VideoTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function store(l: VideoTemplate[]) {
  localStorage.setItem(KEY, JSON.stringify(l))
  window.dispatchEvent(new Event('cf:mytpl'))
}

function frame(): string | undefined {
  try {
    const c = [...document.querySelectorAll<HTMLCanvasElement>('.stage canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const o = document.createElement('canvas')
    o.width = 270
    o.height = Math.round((c.height / c.width) * 270)
    o.getContext('2d')!.drawImage(c, 0, 0, o.width, o.height)
    return o.toDataURL('image/jpeg', 0.72)
  } catch {
    return undefined
  }
}

/** Builds a template from the current timeline. */
export function templateFromEdit(name: string): VideoTemplate {
  const clips = getState().project.clips
  const main = clips.filter((c) => c.track === 'v1' && (c.kind === 'video' || c.kind === 'image')).sort((a, b) => a.start - b.start)
  if (main.length < 1) throw new Error('Add clips to your timeline first – the template copies their cuts and style.')
  const t0 = main[0].start
  const beat = (s: number) => Math.round(((s - t0) * BPM) / 60 * 100) / 100
  const slots: Slot[] = main.map((c) => ({
    beats: Math.max(0.5, beat(c.start + c.dur) - beat(c.start)),
    trans: c.transIn?.type && c.transIn.type !== 'none' ? c.transIn.type : undefined,
    fx: c.fx && c.fx !== 'none' ? c.fx : undefined,
    look: c.look,
    speed: c.kind === 'video' && c.speed !== 1 ? c.speed : undefined,
    freeze: undefined,
    grade: c.filters,
    zoom: c.kf?.scale?.length ? (c.kf.scale[0].v > c.kf.scale[c.kf.scale.length - 1].v ? 'out' : true) : undefined,
  }))
  const end = main[main.length - 1].start + main[main.length - 1].dur
  const inside = (c: Clip) => c.start < end && c.start + c.dur > t0
  const texts: TText[] = clips.filter((c) => c.kind === 'text' && c.text && inside(c)).slice(0, 40).map((c) => ({
    text: c.text!.text, beat: Math.max(0, beat(c.start)), beats: Math.max(0.5, beat(c.start + c.dur) - beat(c.start)),
    x: c.x, y: c.y, size: c.text!.size, style: { ...c.text! },
  }))
  const stickers: TSticker[] = clips.filter((c) => c.kind === 'sticker' && c.emoji && inside(c)).slice(0, 30).map((c) => ({
    emoji: c.emoji!, beat: Math.max(0, beat(c.start)), beats: Math.max(0.5, beat(c.start + c.dur) - beat(c.start)), x: c.x, y: c.y, size: c.stickerSize ?? 0.1,
  }))
  const sfx = clips.filter((c) => c.kind === 'sfx' && c.sfxId && inside(c)).slice(0, 30).map((c) => ({ id: c.sfxId!, beat: Math.max(0, beat(c.start)) }))
  return {
    id: 'my-' + Date.now().toString(36), name: name.trim() || 'My template', emoji: '⭐', desc: `${slots.length} cuts from your own edit`,
    group: 'trending', bpm: BPM, beat: 'pop', slots, texts, stickers, sfx, thumb: frame(), mine: true,
  }
}
export function saveMyTemplate(name: string) {
  const t = templateFromEdit(name)
  store([t, ...myTemplates()].slice(0, 30))
  return t
}
export function deleteMyTemplate(id: string) {
  store(myTemplates().filter((t) => t.id !== id))
}

/* ---------- share / import ---------- */
export function templateFile(t: VideoTemplate): File {
  const { mine, ...rest } = t
  return new File([JSON.stringify({ app: 'ViralKaro', kind: 'template', v: 1, template: rest })], `${t.name.replace(/[^\w\- ]+/g, '').trim() || 'template'}.viralkaro-template`, { type: 'application/json' })
}
export async function shareTemplate(t: VideoTemplate) {
  const f = templateFile(t)
  if (navigator.canShare?.({ files: [f] })) {
    await navigator.share({ files: [f], text: `My ViralKaro template “${t.name}” – open ViralKaro → Templates → Import, and fill it with your clips.` }).catch(() => {})
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(f)
    a.download = f.name
    a.click()
    setUi({ toast: 'Template file saved – send it to a friend; they import it in Templates.' })
  }
}
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')
/** Reads a shared template file – only the known fields, with safe limits. */
export async function importTemplate(file: File): Promise<VideoTemplate> {
  if (file.size > 400_000) throw new Error('That file is too big to be a template.')
  let j: any
  try {
    j = JSON.parse(await file.text())
  } catch {
    throw new Error('That isn’t a ViralKaro template file.')
  }
  const t = j?.template
  if (j?.app !== 'ViralKaro' || j?.kind !== 'template' || !t || !Array.isArray(t.slots) || !t.slots.length) throw new Error('That isn’t a ViralKaro template file.')
  const slots: Slot[] = t.slots.slice(0, 60).map((s: any) => ({
    beats: num(s.beats, 0.25, 120, 2), trans: s.trans ? str(s.trans, 20) as any : undefined, fx: s.fx ? str(s.fx, 20) as any : undefined,
    look: s.look && typeof s.look.id === 'string' ? { id: str(s.look.id, 20) as any, amt: num(s.look.amt, 0, 1, 0.5) } : undefined,
    speed: s.speed ? num(s.speed, 0.1, 4, 1) : undefined, zoom: s.zoom === 'out' || s.zoom === 'drift' ? s.zoom : s.zoom ? true : undefined,
    grade: s.grade && typeof s.grade === 'object' ? Object.fromEntries(Object.entries(s.grade).filter(([, v]) => typeof v === 'number').slice(0, 20)) as any : undefined,
  }))
  const texts: TText[] = (Array.isArray(t.texts) ? t.texts : []).slice(0, 40).map((x: any) => ({
    text: str(x.text, 200), beat: num(x.beat, 0, 500, 0), beats: num(x.beats, 0.25, 500, 2), x: num(x.x, 0, 1, 0.5), y: num(x.y, 0, 1, 0.5), size: num(x.size, 0.01, 0.5, 0.08),
    style: x.style && typeof x.style === 'object' ? Object.fromEntries(Object.entries(x.style).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v) && String(v).length < 300).slice(0, 60)) : undefined,
  }))
  const stickers: TSticker[] = (Array.isArray(t.stickers) ? t.stickers : []).slice(0, 30).map((x: any) => ({ emoji: str(x.emoji, 16), beat: num(x.beat, 0, 500, 0), beats: num(x.beats, 0.25, 500, 2), x: num(x.x, 0, 1, 0.5), y: num(x.y, 0, 1, 0.5), size: num(x.size, 0.02, 0.5, 0.1) }))
  const sfx = (Array.isArray(t.sfx) ? t.sfx : []).slice(0, 30).map((x: any) => ({ id: str(x.id, 30), beat: num(x.beat, 0, 500, 0) }))
  const thumb = typeof t.thumb === 'string' && t.thumb.startsWith('data:image/jpeg;base64,') && t.thumb.length < 200_000 ? t.thumb : undefined
  const out: VideoTemplate = {
    id: 'my-' + Date.now().toString(36), name: str(t.name, 40) || 'Shared template', emoji: '⭐', desc: `${slots.length} cuts · shared with you`,
    group: 'trending', bpm: num(t.bpm, 40, 200, 120), beat: ['pop', 'trap', 'soft', 'dhol'].includes(t.beat) ? t.beat : 'pop', slots, texts, stickers, sfx, thumb, mine: true,
  }
  store([out, ...myTemplates()].slice(0, 30))
  return out
}

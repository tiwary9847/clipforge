// Creative one-tap features: text behind you, person effects (glow / echo trail / clones),
// beat-synced photo slideshow and fill-in video templates.
import { removeBackground } from './pro'
import { analyze } from './autoedit'
import { decodeMonoRange } from './processing'
import { detectBeats, encodeWav } from './dsp'
import { addAsset, baseClip, checkpoint, clipEnd, getAsset, getClip, getState, insertSilent, patchClip, setProject, uid } from './store'
import { engine } from './engine'
import { Asset, Clip, TextProps, TransType } from './types'
export type { TextProps }

type Status = (m: string, p?: number) => void
const sig = () => ({ cancelled: false })

/* ================= cut-out copy of a person ================= */

/** Makes a copy of a video/photo clip with the background removed, on the track just above it. Returns the copy. */
export async function cutoutCopy(clipId: string, track: string, status: Status, signal = sig()): Promise<Clip> {
  const c = getClip(clipId)
  if (!c || (c.kind !== 'video' && c.kind !== 'image')) throw new Error('Select a video or photo with a person in it.')
  // reuse an earlier cut-out of the same clip
  const old = getState().project.clips.find((x) => x.cutoutOf === c.id)
  if (old) {
    if (old.track !== track) patchClip(old.id, { track })
    return getClip(old.id)!
  }
  const dup: Clip = { ...c, id: uid('clip'), track, volume: 0, group: undefined, label: `${c.label} (you)`, cutoutOf: c.id, kf: c.kf ? JSON.parse(JSON.stringify(c.kf)) : undefined }
  insertSilent([dup])
  try {
    await removeBackground(dup.id, status, signal, 'remove', false)
  } catch (e) {
    deleteSilent(dup.id) // take the half-made copy away again
    throw e
  }
  return getClip(dup.id)!
}

function deleteSilent(id: string) {
  const s = getState()
  setProject({ clips: s.project.clips.filter((c) => c.id !== id) })
}

const above = (t: string) => ({ v1: 'v2', v2: 'v3', v3: 'v4', v4: 'v4' })[t] ?? 'v4'

/* ================= text behind you ================= */

const IMPACT = 'Impact, "Arial Narrow Bold", Haettenschweiler, "Noto Sans Devanagari", sans-serif'
export const BEHIND_STYLES: { id: string; name: string; make: () => Partial<TextProps> }[] = [
  { id: 'bold', name: 'Bold white', make: () => ({ color: '#ffffff' }) },
  { id: 'gold', name: 'Gold', make: () => ({ color: '#ffe259', grad: '#ff8a00' }) },
  { id: 'outline', name: 'Outline', make: () => ({ color: 'rgba(255,255,255,0.08)', stroke: '#ffffff', strokeW: 0.05 }) },
  { id: 'neon', name: 'Neon pink', make: () => ({ color: '#ff3cac', anim: 'glow' }) },
]

/** Big title that sits behind the person: original on its track, text above it, cut-out person above the text. */
export async function textBehind(clipId: string, text: string, styleId: string, status: Status, signal = sig()): Promise<string> {
  const c = getClip(clipId)
  if (!c || (c.kind !== 'video' && c.kind !== 'image')) throw new Error('Select the video or photo with you in it.')
  if (!text.trim()) throw new Error('Type the text first.')
  checkpoint()
  const textTrack = above(c.track)
  const youTrack = above(textTrack)
  if (textTrack === youTrack) throw new Error('Put the clip on the Main track (or Layer 1) first – the text and the cut-out need the two tracks above it.')
  const cut = await cutoutCopy(c.id, youTrack, status, signal)
  const P = TEXT_BASE()
  const st = BEHIND_STYLES.find((s) => s.id === styleId) ?? BEHIND_STYLES[0]
  const words = text.trim().toUpperCase()
  const size = words.length <= 6 ? 0.2 : words.length <= 10 ? 0.15 : words.length <= 16 ? 0.11 : 0.085
  const t: Clip = baseClip('text', textTrack, {
    label: words,
    start: c.start,
    dur: c.dur,
    y: 0.3,
    text: { ...P, anim: 'pop', ...st.make(), text: words, size },
  })
  insertSilent([t])
  patchClip(cut.id, { start: c.start, dur: c.dur })
  engine.requestRender()
  return `“${words}” is now behind you. Drag the text up or down in the preview; it stays behind you everywhere.`
}

const TEXT_BASE = (): TextProps => ({
  text: '',
  font: IMPACT,
  size: 0.15,
  color: '#ffffff',
  stroke: '#000000',
  strokeW: 0,
  bg: '#000000',
  bgOpacity: 0,
  bold: true,
  italic: false,
  upper: true,
  align: 'center',
  shadow: true,
  maxW: 0.95,
  anim: 'pop',
})

/* ================= person effects ================= */

export type PersonFx = 'glow' | 'echo' | 'clones' | 'clones3'

export async function personEffect(clipId: string, fx: PersonFx, color: string, status: Status, signal = sig()): Promise<string> {
  const c = getClip(clipId)
  if (!c || (c.kind !== 'video' && c.kind !== 'image')) throw new Error('Select the video with you in it.')
  checkpoint()
  const youTrack = c.track === 'v4' ? 'v4' : 'v4'
  const cut = await cutoutCopy(c.id, youTrack, status, signal)
  if (fx === 'glow') {
    patchClip(cut.id, { glow: { color, size: 0.025 } })
    engine.requestRender()
    return 'Glowing outline added around you. Change the colour any time in the clip settings.'
  }
  if (c.kind !== 'video') throw new Error('Echo trail and clones need a video.')
  const lower = 'v3'
  const made: Clip[] = []
  if (fx === 'echo') {
    // ghost copies a little behind in time, fading out
    ;[0.12, 0.24, 0.36].forEach((d, i) => {
      const srcIn = cut.srcIn - d * cut.speed
      const shift = srcIn < 0 ? -srcIn / cut.speed : 0
      made.push({ ...cut, id: uid('clip'), track: lower, srcIn: Math.max(0, srcIn), start: cut.start + shift, dur: cut.dur - shift, opacity: 0.55 - i * 0.15, glow: undefined, label: `Echo ${i + 1}`, cutoutOf: undefined, echoOf: cut.id })
    })
  } else {
    const n = fx === 'clones3' ? 3 : 2
    const xs = n === 2 ? [0.27, 0.73] : [0.18, 0.5, 0.82]
    patchClip(cut.id, { x: xs[Math.floor(n / 2)] })
    xs.forEach((x, i) => {
      if (i === Math.floor(n / 2)) return
      const delay = 0.5 + i * 0.35
      made.push({ ...cut, id: uid('clip'), track: lower, x, srcIn: cut.srcIn + delay * cut.speed, dur: Math.max(0.5, cut.dur - delay), flipX: i < Math.floor(n / 2) ? !cut.flipX : cut.flipX, label: `Clone ${i + 1}`, cutoutOf: undefined, echoOf: cut.id })
    })
  }
  insertSilent(made)
  engine.requestRender()
  return fx === 'echo' ? 'Echo trail added – ghost copies follow your moves.' : `${made.length + 1} copies of you in one shot! Tip: put a background (photo or the original clip) on the Main track.`
}

/* ================= beat-synced photo slideshow ================= */

export interface SlideOpts {
  photos: string[] // asset ids (photos or short videos)
  music?: string // asset id
  perPhoto: number // seconds wanted per photo (snapped to the beat)
  title?: string
  style: 'smooth' | 'punchy' | 'memories'
}

export async function makeSlideshow(o: SlideOpts, status: Status): Promise<string> {
  const items = o.photos.map((id) => getAsset(id)).filter((a): a is Asset => !!a && (a.kind === 'image' || a.kind === 'video'))
  if (items.length < 2) throw new Error('Pick at least 2 photos.')
  let beats: number[] = []
  const music = o.music ? getAsset(o.music) : undefined
  if (music) {
    status('Finding the beat…')
    const x = await decodeMonoRange(music, 0, Math.min(music.duration, 300), 22050)
    if (x) beats = detectBeats(x, 22050)
  }
  // slide lengths on the beat: every k beats so each photo is close to perPhoto seconds
  const cuts: number[] = [0]
  if (beats.length > 4) {
    const gaps = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b)
    const beat = gaps[Math.floor(gaps.length / 2)]
    const k = Math.max(1, Math.round(o.perPhoto / beat))
    const first = beats[0]
    for (let i = 1; cuts.length <= items.length; i++) {
      const bi = i * k
      cuts.push(bi < beats.length ? beats[bi] - first : cuts[cuts.length - 1] + k * beat)
    }
  } else for (let i = 1; i <= items.length; i++) cuts.push(i * o.perPhoto)
  const st = getState()
  const t0 = st.project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  const trans: TransType[] = o.style === 'punchy' ? ['zoom-in', 'flash', 'whip', 'glitch'] as TransType[] : o.style === 'memories' ? ['fade', 'blur'] as TransType[] : ['fade', 'slide-left', 'zoom-in', 'circle'] as TransType[]
  const made: Clip[] = items.map((a, i) => {
    const dur = Math.max(0.6, cuts[i + 1] - cuts[i])
    // Ken Burns: slow zoom in/out and drift, alternating direction
    const zin = i % 2 === 0
    const dx = [0.03, -0.03, 0.02, -0.02][i % 4]
    const kf = {
      scale: [
        { t: 0, v: zin ? 1 : 1.18 },
        { t: dur, v: zin ? 1.18 : 1 },
      ],
      x: [
        { t: 0, v: 0.5 - dx },
        { t: dur, v: 0.5 + dx },
      ],
    }
    return baseClip(a.kind === 'video' ? 'video' : 'image', 'v1', {
      assetId: a.id,
      label: a.name,
      start: t0 + cuts[i],
      dur,
      fit: 'cover',
      kf,
      ease: 'linear',
      volume: a.kind === 'video' ? 0 : 1,
      transIn: i === 0 ? { type: 'fade', dur: 0.4 } : { type: trans[i % trans.length], dur: o.style === 'punchy' ? 0.25 : 0.5 },
      look: o.style === 'memories' ? { id: 'grain', amt: 0.35 } : undefined,
      filters: { ...baseClip('image', 'v1').filters, ...(o.style === 'memories' ? { sepia: 0.25 } : {}) },
    } as Partial<Clip>)
  })
  const total = cuts[items.length]
  if (music) made.push(baseClip('audio', 'a2', { assetId: music.id, label: music.name, start: t0, dur: Math.min(total, music.duration), srcIn: beats.length ? beats[0] : 0, fadeOut: 1.5, fadeIn: 0.3 } as Partial<Clip>))
  if (o.title?.trim())
    made.push(baseClip('text', 'v2', { label: o.title, start: t0, dur: Math.min(3, total), y: 0.5, text: { ...TEXT_BASE(), font: 'Georgia, "Times New Roman", serif', upper: false, text: o.title.trim(), size: 0.07, anim: 'fade' } }))
  checkpoint()
  insertSilent(made)
  engine.requestRender()
  return `Slideshow made: ${items.length} photos, ${total.toFixed(1)} s${music ? ', cut on the beat' : ''}. Everything is editable on the timeline.`
}

/* ================= fill-in video templates (see vtemplates.ts) ================= */
export { VIDEO_TEMPLATES, applyVideoTemplate } from './vtemplates'
export type { VideoTemplate } from './vtemplates'

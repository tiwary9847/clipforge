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

/* ================= fill-in video templates ================= */

interface Slot {
  beats: number
  fx?: Clip['fx']
  trans?: TransType
  look?: Clip['look']
  speed?: number
  zoom?: boolean
}
export interface VideoTemplate {
  id: string
  name: string
  emoji: string
  desc: string
  bpm: number
  slots: Slot[]
  texts: { text: string; beat: number; beats: number; y: number; size: number }[]
  filter?: Partial<Clip['filters']>
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'beatdrop', name: 'Beat drop', emoji: '💥', desc: '8 fast cuts, flash on the drop', bpm: 128,
    slots: [{ beats: 4 }, { beats: 4 }, { beats: 2, trans: 'flash', zoom: true }, { beats: 2, trans: 'whip' }, { beats: 2, trans: 'glitch', look: { id: 'rgb', amt: 0.5 } }, { beats: 2, trans: 'flash' }, { beats: 4, trans: 'zoom-in', zoom: true }, { beats: 4, trans: 'fade', speed: 0.5 }],
    texts: [{ text: 'WAIT FOR IT…', beat: 0, beats: 4, y: 0.2, size: 0.08 }],
  },
  {
    id: 'travel', name: 'Travel diary', emoji: '✈️', desc: 'Calm cuts, film look, place title', bpm: 96,
    slots: [{ beats: 8, look: { id: 'leak', amt: 0.4 } }, { beats: 4, trans: 'fade' }, { beats: 4, trans: 'slide-left' }, { beats: 4, trans: 'zoom-in', zoom: true }, { beats: 4, trans: 'fade' }, { beats: 8, trans: 'blur', look: { id: 'vignette', amt: 0.5 } }],
    texts: [{ text: 'TRAVEL DIARIES', beat: 0, beats: 8, y: 0.42, size: 0.08 }],
  },
  {
    id: 'dayinlife', name: 'Day in my life', emoji: '☀️', desc: 'Morning → night, quick moments', bpm: 110,
    slots: [{ beats: 4 }, { beats: 2, trans: 'whip' }, { beats: 2, trans: 'whip' }, { beats: 4, trans: 'slide-left' }, { beats: 2, trans: 'flash' }, { beats: 2, trans: 'whip' }, { beats: 4, trans: 'circle' }, { beats: 4, trans: 'fade' }],
    texts: [{ text: 'A DAY IN MY LIFE', beat: 0, beats: 4, y: 0.18, size: 0.07 }],
  },
  {
    id: 'glowup', name: 'Before / after', emoji: '✨', desc: 'Slow before, flash, glowing after', bpm: 100,
    slots: [{ beats: 8, look: { id: 'vignette', amt: 0.5 } }, { beats: 8, trans: 'flash', zoom: true, look: { id: 'glow', amt: 0.6 } }],
    texts: [{ text: 'BEFORE', beat: 0, beats: 8, y: 0.15, size: 0.09 }, { text: 'AFTER ✨', beat: 8, beats: 8, y: 0.15, size: 0.09 }],
  },
  {
    id: 'friends', name: 'Squad montage', emoji: '🤪', desc: 'Shaky, glitchy, meme energy', bpm: 140,
    slots: [{ beats: 2, fx: 'shake' }, { beats: 2, trans: 'glitch' }, { beats: 2, trans: 'whip', fx: 'punch' }, { beats: 2, trans: 'flash' }, { beats: 2, trans: 'glitch', look: { id: 'vhs', amt: 0.5 } }, { beats: 2, trans: 'whip' }, { beats: 4, trans: 'zoom-in', fx: 'shake' }],
    texts: [{ text: 'THE SQUAD 🤪', beat: 0, beats: 4, y: 0.2, size: 0.08 }],
  },
  {
    id: 'festival', name: 'Festival vibes', emoji: '🪔', desc: 'Warm glow, sparkle, Diwali/Holi/wedding', bpm: 120,
    slots: [{ beats: 4, look: { id: 'glow', amt: 0.5 } }, { beats: 4, trans: 'flash' }, { beats: 4, trans: 'zoom-in', zoom: true }, { beats: 4, trans: 'circle', look: { id: 'flare', amt: 0.5 } }, { beats: 4, trans: 'fade', speed: 0.6 }],
    texts: [{ text: 'HAPPY DIWALI 🪔', beat: 0, beats: 4, y: 0.2, size: 0.075 }],
  },
]

/** Synthesises a simple drum loop (kick, snare, hats) at bpm for `beats` beats – used when no song is chosen. */
async function beatTrack(bpm: number, beats: number): Promise<Asset> {
  const sr = 44100
  const spb = 60 / bpm
  const dur = beats * spb + 1
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr)
  const noise = ctx.createBuffer(1, sr, sr)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
  for (let b = 0; b < beats; b++) {
    const t = b * spb
    // kick
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(140, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18)
    g.gain.setValueAtTime(0.9, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g).connect(ctx.destination)
    o.start(t)
    o.stop(t + 0.32)
    // snare on 2 and 4
    if (b % 2 === 1) {
      const n = ctx.createBufferSource()
      n.buffer = noise
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 1500
      const ng = ctx.createGain()
      ng.gain.setValueAtTime(0.45, t)
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      n.connect(f).connect(ng).connect(ctx.destination)
      n.start(t, Math.random() * 0.5, 0.2)
    }
    // hats on eighths
    for (const h of [0, 0.5]) {
      const n = ctx.createBufferSource()
      n.buffer = noise
      const f = ctx.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 8000
      const ng = ctx.createGain()
      const th = t + h * spb
      ng.gain.setValueAtTime(0.12, th)
      ng.gain.exponentialRampToValueAtTime(0.001, th + 0.05)
      n.connect(f).connect(ng).connect(ctx.destination)
      n.start(th, Math.random() * 0.5, 0.06)
    }
  }
  const buf = await ctx.startRendering()
  const mono = buf.getChannelData(0)
  const a = await engine.importFile(new File([encodeWav(mono, sr)], `Template beat (${bpm} BPM).wav`, { type: 'audio/wav' }))
  if (!a) throw new Error('Could not make the beat.')
  addAsset(a)
  return a
}

/** Fills a template's slots with your clips (best moment of each), cut on the beat of your song or a built-in beat. */
export async function applyVideoTemplate(id: string, clipAssets: string[], musicId: string | undefined, status: Status): Promise<string> {
  const T = VIDEO_TEMPLATES.find((t) => t.id === id)
  if (!T) throw new Error('Unknown template')
  const assets = clipAssets.map((a) => getAsset(a)).filter((a): a is Asset => !!a && (a.kind === 'video' || a.kind === 'image'))
  if (!assets.length) throw new Error('Pick your clips or photos first.')
  const nBeats = T.slots.reduce((s, x) => s + x.beats, 0)
  let beatTimes: number[] = []
  let music = musicId ? getAsset(musicId) : undefined
  let musicStart = 0
  if (music) {
    status('Finding the beat of your song…')
    const x = await decodeMonoRange(music, 0, Math.min(music.duration, 240), 22050)
    const b = x ? detectBeats(x, 22050) : []
    if (b.length > nBeats + 2) {
      // start at the loudest stretch: skip the first few beats of a quiet intro
      const k = Math.min(Math.floor(b.length / 4), Math.max(0, b.length - nBeats - 1))
      beatTimes = b.slice(k, k + nBeats + 1)
      musicStart = beatTimes[0]
      beatTimes = beatTimes.map((t) => t - musicStart)
    }
  }
  if (!beatTimes.length) {
    if (!music) {
      status('Making a beat…')
      music = await beatTrack(T.bpm, nBeats + 2)
    }
    beatTimes = Array.from({ length: nBeats + 1 }, (_, i) => (i * 60) / T.bpm)
  }
  const st = getState()
  const t0 = st.project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  const made: Clip[] = []
  let beat = 0
  for (let i = 0; i < T.slots.length; i++) {
    const sl = T.slots[i]
    const a = assets[i % assets.length]
    const start = beatTimes[beat]
    const end = beatTimes[Math.min(beatTimes.length - 1, beat + sl.beats)]
    const dur = Math.max(0.3, end - start)
    beat += sl.beats
    const speed = sl.speed ?? 1
    let srcIn = 0
    if (a.kind === 'video') {
      status(`Finding the best moment in clip ${(i % assets.length) + 1}…`)
      // different part of a reused clip each time
      const an = await analyze(a.id, dur * speed, true).catch(() => ({ start: 0 }))
      const reuse = Math.floor(i / assets.length)
      srcIn = Math.max(0, Math.min(a.duration - dur * speed, an.start + reuse * dur * speed * 1.2))
    }
    made.push(
      baseClip(a.kind === 'video' ? 'video' : 'image', 'v1', {
        assetId: a.id,
        label: `${T.name} ${i + 1}`,
        start: t0 + start,
        dur,
        srcIn,
        speed,
        fit: 'cover',
        volume: 0,
        fx: sl.fx ?? 'none',
        look: sl.look,
        transIn: { type: i === 0 ? 'fade' : sl.trans ?? 'none', dur: sl.trans === 'fade' || sl.trans === 'blur' ? 0.4 : 0.2 },
        kf: sl.zoom ? { scale: [{ t: 0, v: 1 }, { t: dur, v: 1.15 }] } : undefined,
      } as Partial<Clip>),
    )
  }
  const total = beatTimes[nBeats]
  for (const tx of T.texts)
    made.push(baseClip('text', 'v2', { label: tx.text, start: t0 + beatTimes[tx.beat], dur: Math.max(0.5, beatTimes[Math.min(nBeats, tx.beat + tx.beats)] - beatTimes[tx.beat]), y: tx.y, text: { ...TEXT_BASE(), text: tx.text, size: tx.size, anim: 'pop', strokeW: 0.08 } }))
  if (music) made.push(baseClip('audio', 'a2', { assetId: music.id, label: music.name, start: t0, dur: Math.min(total + 0.5, music.duration - musicStart), srcIn: musicStart, fadeOut: 0.8 } as Partial<Clip>))
  checkpoint()
  insertSilent(made)
  engine.requestRender()
  return `“${T.name}” filled with your ${assets.length} clip${assets.length > 1 ? 's' : ''} – ${T.slots.length} cuts on the beat, ${total.toFixed(1)} s. Swap any clip by dragging another onto it, edit the text, or Undo.`
}

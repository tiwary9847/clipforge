// "Fill with your clips" video templates – the CapCut-style kind: pick clips, and they are cut on the beat
// with speed ramps, freeze frames, transitions, effects, colour, text, stickers and sound effects.
import { analyze } from './autoedit'
import { decodeMonoRange } from './processing'
import { detectBeats, encodeWav } from './dsp'
import { addAsset, baseClip, checkpoint, clipEnd, getAsset, getState, insertSilent } from './store'
import { engine } from './engine'
import { SFX_LIST } from './library'
import { Asset, Clip, DEFAULT_FILTERS, Filters, TextProps, TransType } from './types'

type Status = (m: string, p?: number) => void
export type BeatStyle = 'pop' | 'trap' | 'soft' | 'dhol'
export type TplGroup = 'trending' | 'photos' | 'occasions'

interface Slot {
  beats: number
  fx?: Clip['fx']
  trans?: TransType
  look?: Clip['look']
  speed?: number
  zoom?: boolean | 'out' | 'drift'
  ramp?: 'velocity' // fast → slow-motion → fast inside one cut
  freeze?: number // freeze the picture after this share of the cut (0..1)
  freezeGrade?: Partial<Filters>
  grade?: Partial<Filters>
}
interface TText {
  text: string
  beat: number
  beats: number
  y: number
  x?: number
  size: number
  anim?: TextProps['anim']
  loop?: TextProps['loop']
  font?: string
  color?: string
  stroke?: string
  strokeW?: number
  bg?: string
  bgOpacity?: number
  upper?: boolean
}
interface TSticker { emoji: string; beat: number; beats: number; x: number; y: number; size: number; n?: number }
export interface VideoTemplate {
  id: string
  name: string
  emoji: string
  desc: string
  group: TplGroup
  bpm: number
  beat?: BeatStyle
  photos?: boolean // looks best with photos
  slots: Slot[]
  texts: TText[]
  stickers?: TSticker[]
  sfx?: { id: string; beat: number }[]
  grade?: Partial<Filters>
}

const IMPACT = 'Impact, "Arial Narrow Bold", Haettenschweiler, "Noto Sans Devanagari", sans-serif'
// bundled fonts (fonts.css) so they look the same offline and in exports
const SANS = '"Baloo 2", "Mukta", system-ui, sans-serif'
const SERIF = '"Rozha One", Georgia, "Times New Roman", serif'
const HAND = '"Kalam", "Comic Sans MS", cursive'
const MONO = '"Courier New", Courier, monospace'
const TEXT_BASE = (): TextProps => ({
  text: '', font: IMPACT, size: 0.15, color: '#ffffff', stroke: '#000000', strokeW: 0.08, bg: '#000000', bgOpacity: 0,
  bold: true, italic: false, upper: true, align: 'center', shadow: true, maxW: 0.9, anim: 'pop',
})
const rep = (n: number, s: Slot | ((i: number) => Slot)): Slot[] => Array.from({ length: n }, (_, i) => (typeof s === 'function' ? s(i) : { ...s }))

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  /* ---------- trending edits ---------- */
  {
    id: 'velocity', name: 'Velocity edit', emoji: '⚡', group: 'trending', desc: 'Fast → slow-mo → fast in every cut, flash on the beat', bpm: 120, beat: 'trap',
    slots: rep(5, (i) => ({ beats: 4, ramp: 'velocity', trans: i ? 'flash' : 'fade', fx: i % 2 ? 'punch' : 'none', look: i === 2 ? { id: 'rgb', amt: 0.35 } : undefined })),
    texts: [], sfx: [{ id: 'whoosh', beat: 3.6 }, { id: 'whoosh', beat: 7.6 }, { id: 'whoosh', beat: 11.6 }, { id: 'whoosh', beat: 15.6 }],
    grade: { contrast: 1.12, saturate: 1.1 },
  },
  {
    id: 'beatdrop', name: 'Beat drop', emoji: '💥', group: 'trending', desc: 'Calm start, then fast cuts and flashes on the drop', bpm: 128, beat: 'trap',
    slots: [{ beats: 4 }, { beats: 4, speed: 0.6 }, { beats: 1, trans: 'flash', zoom: true, fx: 'quake' }, { beats: 1, trans: 'whip' }, { beats: 1, trans: 'glitch', look: { id: 'rgb', amt: 0.5 } }, { beats: 1, trans: 'flash' }, { beats: 2, trans: 'zoom-in', zoom: true }, { beats: 2, trans: 'whip', fx: 'punch' }, { beats: 4, trans: 'flash', speed: 0.5 }],
    texts: [{ text: 'WAIT FOR IT…', beat: 0, beats: 8, y: 0.22, size: 0.075, anim: 'typewriter' }],
    sfx: [{ id: 'boom', beat: 8 }],
  },
  {
    id: 'beatshake', name: 'Beat shake', emoji: '🫨', group: 'trending', desc: 'A hard shake and colour split on every beat', bpm: 128, beat: 'trap',
    slots: rep(8, (i) => ({ beats: 2, fx: i % 2 ? 'quake' : 'shake', trans: i ? (i % 2 ? 'glitch' : 'whip') : 'fade', look: { id: 'rgb', amt: 0.3 } })),
    texts: [], grade: { contrast: 1.15, saturate: 1.15 },
  },
  {
    id: 'thatsme', name: 'Freeze frame “that’s me”', emoji: '👆', group: 'trending', desc: 'Record-scratch freeze with an arrow, then the story', bpm: 100, beat: 'soft',
    slots: [{ beats: 6, freeze: 0.5, freezeGrade: { saturate: 0.15, contrast: 1.1 } }, { beats: 4, trans: 'whip' }, { beats: 4, trans: 'whip' }, { beats: 4, trans: 'zoom-in', zoom: true }],
    texts: [{ text: 'Yep, that’s me 👆', beat: 3, beats: 3, y: 0.3, size: 0.065, anim: 'pop', loop: 'shake', font: SANS, upper: false }, { text: 'You’re probably wondering how I got here…', beat: 3.4, beats: 2.6, y: 0.78, size: 0.04, anim: 'typewriter', font: SANS, upper: false, bg: '#000000', bgOpacity: 0.6, strokeW: 0 }],
    stickers: [{ emoji: '⬇️', beat: 3, beats: 3, x: 0.5, y: 0.42, size: 0.1 }],
    sfx: [{ id: 'scratch', beat: 3 }],
  },
  {
    id: 'zoomchain', name: 'Zoom transitions', emoji: '🔍', group: 'trending', desc: 'Every clip zooms into the next one', bpm: 110, beat: 'pop',
    slots: rep(6, (i) => ({ beats: 4, trans: i ? 'zoom-in' : 'fade', zoom: true, look: i === 5 ? { id: 'zoomblur', amt: 0.3 } : undefined })),
    texts: [], sfx: [4, 8, 12, 16, 20].map((b) => ({ id: 'whoosh', beat: b - 0.3 })),
  },
  {
    id: 'glitch', name: 'Glitch drop', emoji: '📼', group: 'trending', desc: 'VHS glitches, RGB split and a loading text', bpm: 124, beat: 'trap',
    slots: rep(6, (i) => ({ beats: i === 0 ? 4 : 2, trans: i ? 'glitch' : 'fade', look: { id: i % 2 ? 'vhs' : 'rgb', amt: 0.5 }, fx: i % 3 === 2 ? 'glitch' : 'none' })),
    texts: [{ text: 'LOADING…', beat: 0, beats: 4, y: 0.5, size: 0.07, anim: 'typewriter', font: MONO, strokeW: 0 }],
    sfx: [{ id: 'laser', beat: 4 }],
  },
  {
    id: 'slowmoend', name: 'Slow-mo ending', emoji: '🌙', group: 'trending', desc: 'Quick cuts, then one dreamy slow-motion shot', bpm: 100, beat: 'soft',
    slots: [{ beats: 2 }, { beats: 2, trans: 'whip' }, { beats: 2, trans: 'whip' }, { beats: 2, trans: 'flash' }, { beats: 8, trans: 'blur', speed: 0.4, zoom: true, look: { id: 'glow', amt: 0.6 } }],
    texts: [{ text: 'and that’s the moment ✨', beat: 9, beats: 7, y: 0.8, size: 0.05, anim: 'fade', font: HAND, upper: false, strokeW: 0 }],
  },
  {
    id: 'lyrics', name: 'Lyric pop', emoji: '🎤', group: 'trending', desc: 'One big word per beat – type your own line', bpm: 110, beat: 'pop',
    slots: rep(8, (i) => ({ beats: 2, trans: i ? 'flash' : 'fade', fx: 'zoompulse' })),
    texts: ['THIS', 'IS', 'YOUR', 'SIGN', 'TO', 'START', 'TODAY', '✨'].map((w, i) => ({ text: w, beat: i * 2, beats: 2, y: 0.5, size: 0.16, anim: 'pop' as const })),
    grade: { contrast: 1.08 },
  },
  {
    id: 'cinematic', name: 'Cinematic', emoji: '🎬', group: 'trending', desc: 'Slow fades, film colour and a wide-spaced title', bpm: 80, beat: 'soft',
    slots: rep(5, (i) => ({ beats: 4, trans: 'fade', speed: 0.7, zoom: i % 2 ? 'out' : true, look: { id: 'vignette', amt: 0.55 } })),
    texts: [{ text: 'C I N E M A T I C', beat: 0.5, beats: 5, y: 0.5, size: 0.05, anim: 'fade', font: SERIF, strokeW: 0 }],
    grade: { contrast: 1.12, saturate: 0.8, sepia: 0.12 },
  },
  {
    id: 'vlogintro', name: 'Vlog intro', emoji: '🎥', group: 'trending', desc: 'Whip-pan cuts with a bold title card', bpm: 115, beat: 'pop',
    slots: rep(6, (i) => ({ beats: 2, trans: i ? 'whip' : 'fade', fx: i === 5 ? 'punch' : 'none' })),
    texts: [{ text: 'MY VLOG', beat: 8, beats: 4, y: 0.45, size: 0.12, anim: 'pop' }, { text: 'Episode 1', beat: 8.5, beats: 3.5, y: 0.56, size: 0.045, anim: 'slide', font: SANS, upper: false }],
    sfx: [{ id: 'whoosh', beat: 7.7 }],
  },
  {
    id: 'countdown', name: 'POV countdown', emoji: '⏱️', group: 'trending', desc: '3… 2… 1… then the reveal', bpm: 100, beat: 'trap',
    slots: [{ beats: 6, speed: 0.6, grade: { brightness: 0.75, saturate: 0.6 } }, { beats: 2, trans: 'flash', zoom: true }, { beats: 2, trans: 'whip' }, { beats: 2, trans: 'whip' }, { beats: 4, trans: 'zoom-in' }],
    texts: [{ text: 'POV: you finally did it', beat: 0, beats: 6, y: 0.2, size: 0.05, anim: 'typewriter', font: SANS, upper: false, bg: '#000000', bgOpacity: 0.55, strokeW: 0 }, ...['3', '2', '1'].map((n, i) => ({ text: n, beat: 3 + i, beats: 1, y: 0.5, size: 0.3, anim: 'pop' as const }))],
    sfx: [{ id: 'boom', beat: 6 }],
  },
  {
    id: 'friends', name: 'Squad montage', emoji: '🤪', group: 'trending', desc: 'Shaky, glitchy, meme energy', bpm: 140, beat: 'trap',
    slots: [{ beats: 2, fx: 'shake' }, { beats: 2, trans: 'glitch' }, { beats: 2, trans: 'whip', fx: 'punch' }, { beats: 2, trans: 'flash' }, { beats: 2, trans: 'glitch', look: { id: 'vhs', amt: 0.5 } }, { beats: 2, trans: 'whip' }, { beats: 4, trans: 'zoom-in', fx: 'shake' }],
    texts: [{ text: 'THE SQUAD 🤪', beat: 0, beats: 4, y: 0.2, size: 0.08 }],
    sfx: [{ id: 'bruh', beat: 12 }],
  },
  {
    id: 'fitcheck', name: 'Fit check', emoji: '👟', group: 'trending', desc: 'Outfit change on every beat with a flash', bpm: 120, beat: 'trap',
    slots: rep(8, (i) => ({ beats: 2, trans: i ? 'flash' : 'fade', fx: 'zoompulse' })),
    texts: [{ text: 'FIT CHECK 🔥', beat: 0, beats: 16, y: 0.12, size: 0.07, anim: 'pop' }],
    sfx: [{ id: 'shutter', beat: 2 }, { id: 'shutter', beat: 6 }, { id: 'shutter', beat: 10 }, { id: 'shutter', beat: 14 }],
  },
  {
    id: 'workout', name: 'Workout', emoji: '💪', group: 'trending', desc: 'Hard cuts, black & white, heavy hits', bpm: 140, beat: 'trap',
    slots: rep(8, (i) => ({ beats: 2, trans: i ? (i % 2 ? 'flash' : 'whip') : 'fade', fx: i % 2 ? 'quake' : 'punch' })),
    texts: [{ text: 'NO EXCUSES', beat: 0, beats: 4, y: 0.5, size: 0.11, anim: 'pop', loop: 'shake' }, { text: 'DAY 1', beat: 12, beats: 4, y: 0.5, size: 0.11, anim: 'pop' }],
    grade: { grayscale: 1, contrast: 1.3 },
    sfx: [{ id: 'boom', beat: 4 }],
  },
  {
    id: 'food', name: 'Food reel', emoji: '😋', group: 'trending', desc: 'Close-up cuts that pulse on the beat, “try this” title', bpm: 110, beat: 'pop',
    slots: rep(7, (i) => ({ beats: 2, trans: i ? 'zoom-in' : 'fade', fx: 'zoompulse', zoom: true })),
    texts: [{ text: 'YOU HAVE TO TRY THIS 😋', beat: 0, beats: 4, y: 0.18, size: 0.065 }],
    grade: { saturate: 1.25, contrast: 1.05, brightness: 1.04 },
    sfx: [{ id: 'pop', beat: 0.2 }],
  },
  /* ---------- photos & memories ---------- */
  {
    id: 'photodump', name: 'Photo dump', emoji: '📸', group: 'photos', photos: true, desc: '10 quick shots with film light leaks', bpm: 110, beat: 'pop',
    slots: rep(10, (i) => ({ beats: 1, trans: i % 3 === 0 ? 'flash' : 'none', look: i % 2 ? { id: 'leak', amt: 0.45 } : { id: 'grain', amt: 0.4 } })),
    texts: [{ text: 'photo dump 📸', beat: 0, beats: 3, y: 0.82, size: 0.055, anim: 'typewriter', font: HAND, upper: false, strokeW: 0 }],
    sfx: [{ id: 'shutter', beat: 0 }],
    grade: { contrast: 1.05, saturate: 1.05, sepia: 0.08 },
  },
  {
    id: 'photozoom', name: 'Photo zoom', emoji: '🖼', group: 'photos', photos: true, desc: 'Slow zoom and drift on each photo, soft fades', bpm: 90, beat: 'soft',
    slots: rep(5, (i) => ({ beats: 4, trans: 'fade', zoom: i % 2 ? 'drift' : true, look: { id: 'glow', amt: 0.3 } })),
    texts: [{ text: 'memories', beat: 0.5, beats: 4, y: 0.5, size: 0.08, anim: 'fade', font: HAND, upper: false, strokeW: 0 }],
  },
  {
    id: 'vhs', name: 'Old memories (VHS)', emoji: '📼', group: 'photos', desc: 'Camcorder look with REC and a date stamp', bpm: 96, beat: 'soft',
    slots: rep(5, () => ({ beats: 4, trans: 'glitch', look: { id: 'vhs', amt: 0.6 } })),
    texts: [{ text: '● REC', beat: 0, beats: 20, x: 0.2, y: 0.07, size: 0.045, anim: 'none', loop: 'blink', font: MONO, color: '#ff3b3b', strokeW: 0 }, { text: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(), beat: 0, beats: 20, x: 0.72, y: 0.93, size: 0.04, anim: 'none', font: MONO, color: '#ffd76a', strokeW: 0 }],
    grade: { sepia: 0.2, saturate: 0.85, contrast: 1.05 },
  },
  {
    id: 'glowup', name: 'Before / after', emoji: '✨', group: 'photos', desc: 'Dull “before”, a flash, glowing “after”', bpm: 100, beat: 'soft',
    slots: [{ beats: 8, grade: { saturate: 0.35, brightness: 0.85 }, look: { id: 'vignette', amt: 0.6 } }, { beats: 8, trans: 'flash', zoom: true, look: { id: 'glow', amt: 0.6 }, grade: { saturate: 1.2 } }],
    texts: [{ text: 'BEFORE', beat: 0, beats: 8, y: 0.15, size: 0.09 }, { text: 'AFTER ✨', beat: 8, beats: 8, y: 0.15, size: 0.09 }],
    sfx: [{ id: 'sparkle', beat: 8 }],
  },
  {
    id: 'dayinlife', name: 'Day in my life', emoji: '☀️', group: 'photos', desc: 'Morning → night with a time on every shot', bpm: 110, beat: 'pop',
    slots: rep(6, (i) => ({ beats: 4, trans: i ? (i % 2 ? 'whip' : 'whip') : 'fade' })),
    texts: [{ text: 'a day in my life', beat: 0, beats: 4, y: 0.2, size: 0.06, anim: 'typewriter', font: HAND, upper: false, strokeW: 0 },
      ...['6:30 AM', '9:00 AM', '1:00 PM', '5:00 PM', '8:00 PM', '11:30 PM'].map((t, i) => ({ text: t, beat: i * 4, beats: 4, y: 0.88, size: 0.045, anim: 'slide' as const, font: SANS, upper: false, bg: '#000000', bgOpacity: 0.5, strokeW: 0 }))],
  },
  {
    id: 'travel', name: 'Travel diary', emoji: '✈️', group: 'photos', desc: 'Calm cuts, film look, a place name on each shot', bpm: 96, beat: 'soft',
    slots: [{ beats: 8, look: { id: 'leak', amt: 0.4 }, zoom: true }, { beats: 4, trans: 'whip' }, { beats: 4, trans: 'whip' }, { beats: 4, trans: 'zoom-in', zoom: true }, { beats: 4, trans: 'whip' }, { beats: 8, trans: 'blur', look: { id: 'vignette', amt: 0.5 } }],
    texts: [{ text: 'TRAVEL DIARIES', beat: 0, beats: 8, y: 0.42, size: 0.08, anim: 'letters' }, { text: '📍 Place name', beat: 8, beats: 16, y: 0.86, size: 0.045, anim: 'slide', font: SANS, upper: false, bg: '#000000', bgOpacity: 0.45, strokeW: 0 }],
    grade: { saturate: 1.1, contrast: 1.05 },
  },
  /* ---------- occasions ---------- */
  {
    id: 'birthday', name: 'Birthday', emoji: '🎂', group: 'occasions', desc: 'Confetti, balloons and a big “Happy Birthday”', bpm: 112, beat: 'pop',
    slots: rep(6, (i) => ({ beats: 4, trans: i ? (i % 2 ? 'flash' : 'zoom-in') : 'fade', look: { id: 'glow', amt: 0.35 } })),
    texts: [{ text: 'HAPPY BIRTHDAY', beat: 0, beats: 6, y: 0.2, size: 0.085, anim: 'letters', color: '#ffe066' }, { text: 'Name', beat: 1, beats: 5, y: 0.3, size: 0.075, anim: 'pop', font: HAND, upper: false, strokeW: 0.05 }],
    stickers: [{ emoji: '🎈', beat: 0, beats: 6, x: 0.14, y: 0.72, size: 0.11, n: 3 }, { emoji: '🎉', beat: 0, beats: 6, x: 0.84, y: 0.62, size: 0.1, n: 2 }, { emoji: '🎂', beat: 20, beats: 4, x: 0.5, y: 0.72, size: 0.16 }],
    sfx: [{ id: 'tada', beat: 0 }],
  },
  {
    id: 'wedding', name: 'Wedding highlight', emoji: '💍', group: 'occasions', desc: 'Slow, soft and golden with the couple’s names', bpm: 76, beat: 'soft',
    slots: rep(5, (i) => ({ beats: 4, trans: 'fade', speed: 0.7, zoom: i % 2 ? 'out' : true, look: { id: 'glow', amt: 0.55 } })),
    texts: [{ text: 'Rahul ♥ Priya', beat: 0.5, beats: 6, y: 0.45, size: 0.085, anim: 'fade', font: SERIF, upper: false, color: '#fff2b0', stroke: '#3a2400', strokeW: 0.05 }, { text: 'forever begins today', beat: 1.5, beats: 5, y: 0.55, size: 0.04, anim: 'fade', font: SERIF, upper: false, color: '#fff2b0', strokeW: 0 }],
    stickers: [{ emoji: '🌸', beat: 0, beats: 8, x: 0.2, y: 0.25, size: 0.09, n: 3 }],
    grade: { saturate: 0.9, sepia: 0.12, brightness: 1.04 },
  },
  {
    id: 'festival', name: 'Diwali vibes', emoji: '🪔', group: 'occasions', desc: 'Warm glow, sparkles and a dhol beat', bpm: 120, beat: 'dhol',
    slots: [{ beats: 4, look: { id: 'glow', amt: 0.5 } }, { beats: 4, trans: 'flash' }, { beats: 4, trans: 'zoom-in', zoom: true }, { beats: 4, trans: 'zoom-in', look: { id: 'flare', amt: 0.5 } }, { beats: 4, trans: 'fade', speed: 0.6 }],
    texts: [{ text: 'HAPPY DIWALI 🪔', beat: 0, beats: 4, y: 0.2, size: 0.075, color: '#ffd76a' }, { text: 'शुभ दीपावली', beat: 16, beats: 4, y: 0.45, size: 0.09, anim: 'glow', font: '"Yatra One", "Noto Sans Devanagari", sans-serif', upper: false, color: '#ffe8a3', stroke: '#7a1f00', strokeW: 0.1 }],
    stickers: [{ emoji: '✨', beat: 0, beats: 20, x: 0.18, y: 0.34, size: 0.06, n: 2 }, { emoji: '✨', beat: 0.5, beats: 19, x: 0.82, y: 0.3, size: 0.06, n: 2 }],
    sfx: [{ id: 'sparkle', beat: 0 }, { id: 'sparkle', beat: 16 }],
    grade: { saturate: 1.15, hue: -6 },
  },
  {
    id: 'holi', name: 'Holi colours', emoji: '🎨', group: 'occasions', desc: 'Extra-bright colours, flashes and a dhol beat', bpm: 126, beat: 'dhol',
    slots: rep(7, (i) => ({ beats: 2, trans: i ? 'flash' : 'fade', fx: i % 2 ? 'punch' : 'none' })),
    texts: [{ text: 'HAPPY HOLI', beat: 0, beats: 4, y: 0.25, size: 0.1, anim: 'rainbow' }, { text: 'बुरा न मानो होली है!', beat: 10, beats: 4, y: 0.75, size: 0.055, anim: 'pop', font: '"Yatra One", "Noto Sans Devanagari", sans-serif', upper: false }],
    stickers: [{ emoji: '🎨', beat: 0, beats: 14, x: 0.85, y: 0.12, size: 0.09 }],
    grade: { saturate: 1.45, contrast: 1.08 },
  },
]

/* ---------- built-in beats (made on the device, no copyright) ---------- */
// one bar = 4 beats; positions in beats
const PATTERNS: Record<BeatStyle, { kick: number[]; snare: number[]; hat: number; roll?: boolean; sub?: boolean; dhol?: boolean }> = {
  pop: { kick: [0, 2], snare: [1, 3], hat: 0.5 },
  trap: { kick: [0, 1.5, 2.5], snare: [1, 3], hat: 0.25, roll: true, sub: true },
  soft: { kick: [0, 2.5], snare: [1, 3], hat: 0.5 },
  dhol: { kick: [0, 1.5, 2, 3], snare: [1, 2.5, 3.5], hat: 0.5, dhol: true },
}
async function beatTrack(bpm: number, beats: number, style: BeatStyle = 'pop'): Promise<Asset> {
  const sr = 44100
  const spb = 60 / bpm
  const dur = beats * spb + 1
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr)
  const P = PATTERNS[style]
  const soft = style === 'soft'
  const master = ctx.createGain()
  master.gain.value = soft ? 0.75 : 1
  if (soft) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 3200
    master.connect(lp).connect(ctx.destination)
  } else master.connect(ctx.destination)
  const noise = ctx.createBuffer(1, sr, sr)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
  const hit = (t: number, f0: number, f1: number, decay: number, gain: number) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(0.18, decay))
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + decay + 0.02)
  }
  const nz = (t: number, hp: number, decay: number, gain: number) => {
    const n = ctx.createBufferSource()
    n.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = hp
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    n.connect(f).connect(g).connect(master)
    n.start(t, Math.random() * 0.5, decay + 0.02)
  }
  for (let bar = 0; bar * 4 < beats; bar++) {
    const b0 = bar * 4
    for (const k of P.kick) if (b0 + k < beats) {
      const t = (b0 + k) * spb
      if (P.dhol) { hit(t, 110, 70, 0.28, 0.9); nz(t, 200, 0.06, 0.25) } // low dhol side
      else if (P.sub) hit(t, 120, 45, 0.55, 0.95) // long 808
      else hit(t, 140, 42, 0.3, soft ? 0.7 : 0.9)
    }
    for (const s of P.snare) if (b0 + s < beats) {
      const t = (b0 + s) * spb
      if (P.dhol) hit(t, 420, 300, 0.09, 0.45) // high dhol side
      else { nz(t, 1500, soft ? 0.14 : 0.18, soft ? 0.3 : 0.45); if (!soft) nz(t + 0.012, 1200, 0.1, 0.25) }
    }
    for (let h = 0; h < 4; h += P.hat) {
      if (b0 + h >= beats) break
      const t = (b0 + h) * spb
      nz(t, 8000, 0.05, soft ? 0.07 : 0.12)
      // trap hi-hat roll before the next bar
      if (P.roll && h >= 3.5 && bar % 2 === 1) for (let r = 1; r < 3; r++) nz(t + (r * spb) / 12, 8000, 0.03, 0.08)
    }
  }
  const buf = await ctx.startRendering()
  const mono = buf.getChannelData(0)
  const a = await engine.importFile(new File([encodeWav(mono, sr)], `Template beat (${style}, ${bpm} BPM).wav`, { type: 'audio/wav' }))
  if (!a) throw new Error('Could not make the beat.')
  addAsset(a)
  return a
}

/** Fills a template's cuts with your clips (best moment of each), cut on the beat of your song or a built-in beat. */
export async function applyVideoTemplate(id: string, clipAssets: string[], musicId: string | undefined, status: Status, opts: { texts?: string[] } = {}): Promise<string> {
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
    const need = Math.ceil(nBeats) + 1
    if (b.length > need + 2) {
      // start at the loudest stretch: skip the first few beats of a quiet intro
      const k = Math.min(Math.floor(b.length / 4), Math.max(0, b.length - need - 1))
      beatTimes = b.slice(k, k + need + 1)
      musicStart = beatTimes[0]
      beatTimes = beatTimes.map((t) => t - musicStart)
    }
  }
  if (!beatTimes.length) {
    if (!music) {
      status('Making a beat…')
      music = await beatTrack(T.bpm, Math.ceil(nBeats) + 2, T.beat)
    }
    beatTimes = Array.from({ length: Math.ceil(nBeats) + 2 }, (_, i) => (i * 60) / T.bpm)
  }
  // time of a (possibly fractional) beat
  const at = (b: number) => {
    const i = Math.max(0, Math.min(beatTimes.length - 2, Math.floor(b)))
    return beatTimes[i] + (beatTimes[i + 1] - beatTimes[i]) * (b - i)
  }
  const t0 = getState().project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  const made: Clip[] = []
  const filters = (g?: Partial<Filters>) => ({ ...DEFAULT_FILTERS, ...T.grade, ...g })
  let beat = 0
  for (let i = 0; i < T.slots.length; i++) {
    const sl = T.slots[i]
    const a = assets[i % assets.length]
    const start = at(beat)
    const dur = Math.max(0.25, at(beat + sl.beats) - start)
    beat += sl.beats
    const video = a.kind === 'video'
    const base = sl.speed ?? 1
    // pieces inside this cut: [share of the cut, speed, freeze]
    const parts: [number, number, boolean][] =
      video && sl.ramp === 'velocity' ? [[0.3, 2.2, false], [0.45, 0.4, false], [0.25, 2.2, false]]
      : video && sl.freeze ? [[sl.freeze, base, false], [1 - sl.freeze, 1, true]]
      : [[1, base, false]]
    const srcNeed = parts.reduce((s, [f, sp, fr]) => s + (fr ? 0 : f * dur * sp), 0)
    let srcIn = 0
    if (video) {
      status(`Finding the best moment in clip ${(i % assets.length) + 1}…`)
      const an = await analyze(a.id, srcNeed, true).catch(() => ({ start: 0 }))
      const reuse = Math.floor(i / assets.length)
      srcIn = Math.max(0, Math.min(a.duration - srcNeed, an.start + reuse * srcNeed * 1.2))
    }
    const zoomKf = (d: number) =>
      sl.zoom === 'out' ? { scale: [{ t: 0, v: 1.18 }, { t: d, v: 1 }] }
      : sl.zoom === 'drift' ? { scale: [{ t: 0, v: 1.12 }, { t: d, v: 1.12 }], x: [{ t: 0, v: 0.46 }, { t: d, v: 0.54 }] }
      : sl.zoom ? { scale: [{ t: 0, v: 1 }, { t: d, v: 1.15 }] }
      : undefined
    let pt = start
    let ps = srcIn
    parts.forEach(([f, sp, fr], k) => {
      const d = dur * f
      made.push(
        baseClip(video ? 'video' : 'image', 'v1', {
          assetId: a.id,
          label: `${T.name} ${i + 1}`,
          start: pt,
          dur: d,
          srcIn: fr ? Math.max(0, ps - 0.04) : ps,
          speed: fr ? 1 : sp,
          freeze: fr || undefined,
          fit: 'cover',
          volume: 0,
          fx: sl.fx ?? 'none',
          look: sl.look,
          filters: filters(fr ? { ...sl.grade, ...sl.freezeGrade } : sl.grade),
          transIn: k ? { type: 'none', dur: 0 } : { type: i === 0 ? 'fade' : sl.trans ?? 'none', dur: sl.trans === 'fade' || sl.trans === 'blur' ? 0.4 : 0.2 },
          kf: parts.length === 1 ? zoomKf(d) : undefined,
        } as Partial<Clip>),
      )
      pt += d
      if (!fr) ps += d * sp
    })
  }
  const total = at(nBeats)
  const track = (i: number) => (['v2', 'v3', 'v4'] as const)[i % 3]
  T.texts.forEach((tx, i) => {
    const { beat: b, beats, x, y, size, ...rest } = tx
    const text = opts.texts?.[i] ?? tx.text
    const st = t0 + at(b)
    made.push(baseClip('text', track(i), {
      label: text, start: st, dur: Math.max(0.4, t0 + at(Math.min(nBeats, b + beats)) - st), x: x ?? 0.5, y,
      text: { ...TEXT_BASE(), ...Object.fromEntries(Object.entries(rest).filter(([k, v]) => v !== undefined && k !== 'text')), text, size },
    } as Partial<Clip>))
  })
  for (const s of T.stickers ?? []) {
    const n = s.n ?? 1
    for (let k = 0; k < n; k++) {
      const st = t0 + at(s.beat) + k * 0.15
      const jx = n > 1 ? ((k * 0.37) % 0.3) - 0.15 : 0
      const jy = n > 1 ? ((k * 0.53) % 0.2) - 0.1 : 0
      made.push(baseClip('sticker', 'v4', {
        label: s.emoji, emoji: s.emoji, stickerSize: s.size * (1 - k * 0.12), start: st, dur: Math.max(0.5, t0 + at(Math.min(nBeats, s.beat + s.beats)) - st),
        x: Math.min(0.92, Math.max(0.08, s.x + jx)), y: Math.min(0.92, Math.max(0.08, s.y + jy)), fx: 'float', transIn: { type: 'zoom-in', dur: 0.25 },
      } as Partial<Clip>))
    }
  }
  for (const s of T.sfx ?? []) {
    const def = SFX_LIST.find((x) => x.id === s.id)
    if (def) made.push(baseClip('sfx', 'a1', { sfxId: def.id, label: def.name, start: t0 + at(s.beat), dur: def.dur } as Partial<Clip>))
  }
  if (music) made.push(baseClip('audio', 'a2', { assetId: music.id, label: music.name, start: t0, dur: Math.min(total + 0.5, music.duration - musicStart), srcIn: musicStart, fadeOut: 0.8 } as Partial<Clip>))
  checkpoint()
  insertSilent(made)
  engine.requestRender()
  return `“${T.name}” made with your ${assets.length} clip${assets.length > 1 ? 's' : ''} – ${T.slots.length} cuts on the beat, ${total.toFixed(1)} s. Tap any text to change the words, drag another clip onto a cut to swap it, or Undo.`
}

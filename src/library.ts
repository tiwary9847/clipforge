import { Filters, DEFAULT_FILTERS, TextProps, TransType, FxType } from './types'

export const FONTS = [
  { label: 'Impact (meme)', css: 'Impact, "Arial Narrow Bold", Haettenschweiler, "Noto Sans Devanagari", sans-serif' },
  { label: 'Arial Black', css: '"Arial Black", "Arial Bold", Gadget, "Noto Sans Devanagari", sans-serif' },
  { label: 'Arial', css: 'Arial, Helvetica, "Noto Sans Devanagari", sans-serif' },
  { label: 'Comic Sans', css: '"Comic Sans MS", "Comic Neue", "Noto Sans Devanagari", cursive' },
  { label: 'Trebuchet', css: '"Trebuchet MS", Tahoma, "Noto Sans Devanagari", sans-serif' },
  { label: 'Verdana', css: 'Verdana, Geneva, "Noto Sans Devanagari", sans-serif' },
  { label: 'Georgia (serif)', css: 'Georgia, "Times New Roman", "Noto Sans Devanagari", serif' },
  { label: 'Courier (mono)', css: '"Courier New", Courier, "Noto Sans Devanagari", monospace' },
  { label: 'हिन्दी · Baloo (bold, fun)', css: '"Baloo 2", "Noto Sans Devanagari", sans-serif' },
  { label: 'हिन्दी · Mukta (clean)', css: 'Mukta, "Noto Sans Devanagari", sans-serif' },
  { label: 'हिन्दी · Hind (subtitles)', css: 'Hind, "Noto Sans Devanagari", sans-serif' },
  { label: 'हिन्दी · Noto Sans', css: '"Noto Sans Devanagari", sans-serif' },
  { label: 'हिन्दी · Rozha (headline)', css: '"Rozha One", "Noto Sans Devanagari", serif' },
  { label: 'हिन्दी · Yatra (festive)', css: '"Yatra One", "Noto Sans Devanagari", cursive' },
  { label: 'हिन्दी · Kalam (handwritten)', css: 'Kalam, "Noto Sans Devanagari", cursive' },
]

const base: TextProps = {
  text: 'Your text',
  font: FONTS[1].css,
  size: 0.07,
  color: '#ffffff',
  stroke: '#000000',
  strokeW: 0.1,
  bg: '#000000',
  bgOpacity: 0,
  bold: false,
  italic: false,
  upper: false,
  align: 'center',
  shadow: false,
  maxW: 0.9,
}

export interface TextPreset {
  id: string
  name: string
  y: number
  props: TextProps
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'meme-top',
    name: 'Meme · top',
    y: 0.12,
    props: { ...base, text: 'TOP TEXT', font: FONTS[0].css, size: 0.085, strokeW: 0.16, upper: true },
  },
  {
    id: 'meme-bottom',
    name: 'Meme · bottom',
    y: 0.88,
    props: { ...base, text: 'BOTTOM TEXT', font: FONTS[0].css, size: 0.085, strokeW: 0.16, upper: true },
  },
  {
    id: 'subtitle',
    name: 'Subtitle',
    y: 0.78,
    props: { ...base, text: 'Subtitle goes here', font: FONTS[2].css, size: 0.05, bold: true, strokeW: 0.12 },
  },
  {
    id: 'title',
    name: 'Big title',
    y: 0.5,
    props: { ...base, text: 'BIG TITLE', size: 0.11, color: '#ffd400', strokeW: 0.1, upper: true, shadow: true },
  },
  {
    id: 'comic',
    name: 'Comic pop',
    y: 0.3,
    props: { ...base, text: 'WOW!', font: FONTS[3].css, size: 0.1, bold: true, color: '#ffffff', stroke: '#ff2d55', strokeW: 0.16, shadow: true },
  },
  {
    id: 'neon',
    name: 'Neon glow',
    y: 0.5,
    props: { ...base, text: 'NEON', font: FONTS[1].css, size: 0.1, color: '#ffffff', stroke: '#ff00e6', strokeW: 0.04, shadow: true },
  },
  {
    id: 'lower',
    name: 'Lower third',
    y: 0.84,
    props: { ...base, text: 'Name · Title', font: FONTS[2].css, size: 0.04, bold: true, strokeW: 0, bgOpacity: 0.75 },
  },
  {
    id: 'retro',
    name: 'Retro serif',
    y: 0.5,
    props: { ...base, text: 'Retro Vibes', font: FONTS[6].css, size: 0.08, italic: true, bold: true, color: '#ffe9a8', stroke: '#7a1f00', strokeW: 0.12, shadow: true },
  },
  {
    id: 'hi-title',
    name: 'हिन्दी · टाइटल',
    y: 0.2,
    props: { ...base, text: 'जबरदस्त!', font: FONTS[8].css, size: 0.11, bold: true, color: '#ffd400', stroke: '#000000', strokeW: 0.14, shadow: true },
  },
  {
    id: 'hi-sub',
    name: 'हिन्दी · सबटाइटल',
    y: 0.82,
    props: { ...base, text: 'आज का व्लॉग', font: FONTS[10].css, size: 0.055, bold: true, color: '#ffffff', stroke: '#000000', strokeW: 0.1, bg: '#000000', bgOpacity: 0.45 },
  },
  {
    id: 'hi-festive',
    name: 'हिन्दी · त्योहार',
    y: 0.45,
    props: { ...base, text: 'शुभ दीपावली', font: FONTS[13].css, size: 0.1, color: '#ff9f1c', stroke: '#5a0000', strokeW: 0.12, shadow: true },
  },
]

export interface FilterPreset {
  id: string
  name: string
  f: Partial<Filters>
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', name: 'Original', f: {} },
  { id: 'vivid', name: 'Vivid', f: { saturate: 1.45, contrast: 1.1 } },
  { id: 'bw', name: 'B&W', f: { grayscale: 1, contrast: 1.1 } },
  { id: 'noir', name: 'Noir', f: { grayscale: 1, contrast: 1.5, brightness: 0.9 } },
  { id: 'vintage', name: 'Vintage', f: { sepia: 0.5, contrast: 0.9, saturate: 1.2, brightness: 1.05 } },
  { id: 'warm', name: 'Warm', f: { sepia: 0.25, saturate: 1.3, hue: -10 } },
  { id: 'cool', name: 'Cool', f: { hue: 18, saturate: 1.1, brightness: 1.05 } },
  { id: 'cine', name: 'Cinematic', f: { contrast: 1.2, saturate: 0.9, brightness: 0.95, sepia: 0.15 } },
  { id: 'faded', name: 'Faded', f: { contrast: 0.85, brightness: 1.1, saturate: 0.8 } },
  { id: 'dream', name: 'Dreamy', f: { blur: 2, brightness: 1.1, saturate: 1.2 } },
  { id: 'fried', name: 'Deep fried 🍟', f: { contrast: 2.2, saturate: 3, brightness: 1.1 } },
]

export const mkFilters = (p: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...p })

export const FX_LIST: { id: FxType; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'shake', name: 'Shake' },
  { id: 'punch', name: 'Beat punch' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'spin', name: 'Spin' },
  { id: 'float', name: 'Float' },
  { id: 'glitch', name: 'Glitch' },
]

export const TRANS_LIST: { id: TransType; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'fade', name: 'Fade' },
  { id: 'slide-left', name: 'Slide ←' },
  { id: 'slide-right', name: 'Slide →' },
  { id: 'slide-up', name: 'Slide ↑' },
  { id: 'slide-down', name: 'Slide ↓' },
  { id: 'zoom-in', name: 'Zoom in' },
  { id: 'zoom-out', name: 'Zoom out' },
  { id: 'spin', name: 'Spin' },
  { id: 'wipe', name: 'Wipe' },
]

export const STICKER_GROUPS: { name: string; items: string[] }[] = [
  {
    name: 'Reactions',
    items: ['😂', '💀', '😭', '🤣', '😎', '🤯', '🥶', '🥵', '😱', '🤡', '🫠', '😏', '🥹', '🙄', '😤', '🤔', '👀', '🫡', '🥳', '😈'],
  },
  {
    name: 'Meme energy',
    items: ['🗿', '🐸', '💯', '🔥', '🐐', '🧠', '🍿', '☠️', '👑', '💅', '🤌', '🙏', '💪', '🫶', '🧢', '🪦', '🚨', '🤑', '🐔', '🦆'],
  },
  {
    name: 'Arrows & marks',
    items: ['➡️', '⬅️', '⬆️', '⬇️', '↗️', '❌', '✅', '❗', '❓', '‼️', '⭕', '⚠️', '🔴', '⭐', '✨', '💥', '💢', '💫'],
  },
  {
    name: 'Social',
    items: ['👍', '❤️', '🔔', '👉', '👇', '🔗', '📌', '📣', '🎬', '🎵', '📸', '🎧', '💬', '🔁', '🚀', '🏆'],
  },
]

export interface SfxDef {
  id: string
  name: string
  emoji: string
  dur: number
}

export const SFX_LIST: SfxDef[] = [
  { id: 'boom', name: 'Bass boom', emoji: '💥', dur: 1.2 },
  { id: 'airhorn', name: 'Airhorn', emoji: '📯', dur: 1.4 },
  { id: 'whoosh', name: 'Whoosh', emoji: '💨', dur: 0.7 },
  { id: 'ding', name: 'Ding', emoji: '🔔', dur: 1.2 },
  { id: 'pop', name: 'Pop', emoji: '🫧', dur: 0.25 },
  { id: 'sad', name: 'Sad trombone', emoji: '🎺', dur: 2.2 },
  { id: 'scratch', name: 'Record scratch', emoji: '💿', dur: 0.9 },
  { id: 'rise', name: 'Riser', emoji: '📈', dur: 2.0 },
  { id: 'rimshot', name: 'Ba-dum-tss', emoji: '🥁', dur: 1.1 },
  { id: 'dundundun', name: 'Dun dun DUUN', emoji: '😨', dur: 2.2 },
  { id: 'crickets', name: 'Crickets', emoji: '🦗', dur: 2.4 },
  { id: 'boing', name: 'Boing', emoji: '🌀', dur: 0.9 },
  { id: 'buzzer', name: 'Wrong buzzer', emoji: '❌', dur: 0.9 },
  { id: 'wow', name: 'Wow whistle', emoji: '😮', dur: 1.1 },
  { id: 'bruh', name: 'Bruh', emoji: '🗿', dur: 0.9 },
  { id: 'siren', name: 'Siren', emoji: '🚨', dur: 2.2 },
  { id: 'gong', name: 'Gong', emoji: '🔔', dur: 3.2 },
  { id: 'drumroll', name: 'Drum roll', emoji: '🥁', dur: 2.2 },
  { id: 'shutter', name: 'Camera click', emoji: '📸', dur: 0.35 },
  { id: 'applause', name: 'Applause', emoji: '👏', dur: 2.8 },
  { id: 'kaching', name: 'Ka-ching', emoji: '💰', dur: 1.3 },
  { id: 'heartbeat', name: 'Heartbeat', emoji: '💓', dur: 1.8 },
  { id: 'sus', name: 'Sus', emoji: '🤨', dur: 1.1 },
  { id: 'tada', name: 'Ta-da!', emoji: '🎉', dur: 1.6 },
  { id: 'levelup', name: 'Level up', emoji: '🆙', dur: 1.0 },
  { id: 'coin', name: 'Coin', emoji: '🪙', dur: 0.5 },
  { id: 'laser', name: 'Laser', emoji: '🔫', dur: 0.55 },
  { id: 'sparkle', name: 'Sparkle', emoji: '✨', dur: 1.4 },
  { id: 'womp', name: 'Womp womp', emoji: '😞', dur: 1.8 },
]

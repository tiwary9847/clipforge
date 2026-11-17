export type AssetKind = 'video' | 'image' | 'audio'

export interface Asset {
  id: string
  name: string
  kind: AssetKind
  url: string
  duration: number
  width: number
  height: number
  thumb?: string
  peaks?: number[]
  blob?: Blob
  animated?: boolean
  frames?: { bmp: ImageBitmap; dur: number }[]
  strip?: { url: string; n: number }
  proxyUrl?: string // light preview copy (editing only; exports use the original)
  proxyBlob?: Blob
  enriched?: boolean // thumbnails/waveform pass finished (even if the file has no audio)
}

export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'sticker' | 'sfx'

export interface Filters {
  brightness: number // 1 = normal
  contrast: number
  saturate: number
  hue: number // degrees
  blur: number // px at 1080 wide
  sepia: number // 0..1
  grayscale: number // 0..1
}

export const DEFAULT_FILTERS: Filters = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hue: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
}

export type TransType =
  | 'none'
  | 'fade'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'spin'
  | 'wipe'

export interface Transition {
  type: TransType
  dur: number
}

export type FxType = 'none' | 'shake' | 'punch' | 'pulse' | 'spin' | 'float' | 'glitch'

export interface TextProps {
  text: string
  font: string
  size: number // fraction of canvas height
  color: string
  stroke: string
  strokeW: number // fraction of font size
  bg: string
  bgOpacity: number
  bold: boolean
  italic: boolean
  upper: boolean
  align: 'left' | 'center' | 'right'
  shadow: boolean
  maxW: number // fraction of canvas width
  hlIdx?: number // karaoke: index of the highlighted word
  hlColor?: string
  anim?: TextAnim
  animDur?: number // seconds for the build-in
}

export type TextAnim = 'none' | 'typewriter' | 'pop' | 'fade' | 'slide' | 'wave'

export type MaskMode = 'show' | 'hide' | 'blur' | 'pixelate' | 'spotlight'
export type MaskShape = 'none' | 'circle' | 'ellipse' | 'rounded' | 'star' | 'heart' | 'diamond'
export interface Crop {
  l: number
  t: number
  r: number
  b: number
}
export interface Chroma {
  on: boolean
  color: string
  sim: number
  smooth: number
  spill: number
}
export interface Stab {
  on: boolean
  t0: number // source time of first sample
  fps: number
  px: number[] // cumulative content shift, fraction of frame width
  py: number[]
  strength: number // smoothing window in seconds
  zoom: number
}

export type KfProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'mx' | 'my' | 'ms'
export interface Keyframe {
  t: number // seconds from clip start (timeline time)
  v: number
}
export type KfMap = Partial<Record<KfProp, Keyframe[]>>

export interface Clip {
  id: string
  kind: ClipKind
  track: string
  label: string
  start: number
  dur: number
  srcIn: number
  speed: number
  volume: number
  fadeIn: number
  fadeOut: number
  assetId?: string
  sfxId?: string
  x: number // center, fraction of canvas width
  y: number // center, fraction of canvas height
  scale: number
  rotation: number
  opacity: number
  flipX: boolean
  fit: 'cover' | 'contain'
  filters: Filters
  fx: FxType
  transIn: Transition
  transOut: Transition
  kf?: KfMap
  crop?: Crop
  mask?: { shape: MaskShape; radius: number; mode?: MaskMode; amt?: number }
  mx?: number // mask centre offset, fraction of the clip box (0 = centre)
  my?: number
  ms?: number // mask size, 1 = whole clip box
  group?: string // clips sharing an id move, select, copy and trim together
  mc?: boolean // part of a multicam edit
  blend?: string
  chroma?: Chroma
  grade?: Grade
  eq?: Eq
  freeze?: boolean
  stab?: Stab
  duck?: { t: number; g: number }[]
  volKf?: { t: number; g: number }[]
  text?: TextProps
  emoji?: string
  stickerSize?: number
}

export interface TrackDef {
  id: string
  name: string
  type: 'video' | 'audio'
}

// Displayed top → bottom. Video tracks are layered with the lowest (Main) at the back.
export const TRACKS: TrackDef[] = [
  { id: 'v4', name: 'Overlay 3', type: 'video' },
  { id: 'v3', name: 'Overlay 2', type: 'video' },
  { id: 'v2', name: 'Overlay 1', type: 'video' },
  { id: 'v1', name: 'Main', type: 'video' },
  { id: 'a1', name: 'Audio', type: 'audio' },
  { id: 'a2', name: 'Music', type: 'audio' },
]

export interface Preset {
  id: string
  label: string
  platform: string
  w: number
  h: number
  safe?: boolean
}

export const PRESETS: Preset[] = [
  { id: 'shorts', label: 'YouTube Shorts · 9:16', platform: 'YouTube', w: 1080, h: 1920, safe: true },
  { id: 'reels', label: 'Instagram Reels · 9:16', platform: 'Instagram', w: 1080, h: 1920, safe: true },
  { id: 'fbreels', label: 'Facebook Reels / Stories · 9:16', platform: 'Facebook', w: 1080, h: 1920, safe: true },
  { id: 'yt', label: 'YouTube Video · 16:9', platform: 'YouTube', w: 1920, h: 1080 },
  { id: 'fbvideo', label: 'Facebook Video · 16:9', platform: 'Facebook', w: 1920, h: 1080 },
  { id: 'igportrait', label: 'Instagram Post · 4:5', platform: 'Instagram', w: 1080, h: 1350 },
  { id: 'square', label: 'Square · 1:1', platform: 'Instagram / Facebook', w: 1080, h: 1080 },
  { id: 'shorts4k', label: 'Shorts / Reels 4K · 9:16', platform: 'YouTube / Instagram', w: 2160, h: 3840, safe: true },
  { id: 'yt4k', label: 'YouTube 4K · 16:9', platform: 'YouTube', w: 3840, h: 2160 },
  { id: 'yt720', label: 'YouTube Video 720p · 16:9 (faster)', platform: 'YouTube', w: 1280, h: 720 },
]

export interface Grade {
  temp: number // -1..1 (cool..warm)
  tint: number // -1..1 (green..magenta)
  shadows: number // -1..1
  highlights: number // -1..1
  vibrance: number // -1..1
  lift: string // colour pushed into shadows
  liftAmt: number // 0..1
  gain: string // colour pushed into highlights
  gainAmt: number // 0..1
  curve: number[] // 5 output values for inputs 0, .25, .5, .75, 1
  lut?: { name: string; size: number; data: number[] }
  lutMix: number // 0..1
}
export interface Eq {
  low: number // dB
  mid: number
  high: number
  comp: boolean
}

export interface Project {
  presetId: string
  bg: string
  clips: Clip[]
  markers: number[]
  loudDb?: number
  transcripts?: Record<string, { text: string; start: number; end: number }[]> // per asset, source seconds
  multicam?: { start: number; angles: { assetId: string; shift: number; name: string }[] } // master gain from loudness normalisation
}

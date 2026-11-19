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

export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'sticker' | 'sfx' | 'adjust'

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
  | 'flash'
  | 'blur'
  | 'glitch'
  | 'whip'
  | 'circle'
  | 'flip'
  | 'bounce'

export interface Transition {
  type: TransType
  dur: number
}

export type FxType = 'none' | 'shake' | 'punch' | 'pulse' | 'spin' | 'float' | 'glitch' | 'quake' | 'bounce' | 'zoompulse' | 'drift' | 'tilt'
export type LookId = 'grain' | 'vhs' | 'rgb' | 'leak' | 'flare' | 'zoomblur' | 'glow' | 'vignette'

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
  grad?: string // second colour: vertical gradient fill from `color` to this
  curve?: number // -1..1 – bend the text into an arc
  hlStyle?: 'color' | 'box' | 'big' // how the karaoke word is shown
  kwIdx?: number[] // keyword word indices, drawn in kwColor
  kwColor?: string
  emoji?: string // pops in above the caption
}

export type TextAnim = 'none' | 'typewriter' | 'pop' | 'fade' | 'slide' | 'wave' | 'letters' | 'bounce' | 'glow' | 'rainbow'
export type Ease = 'smooth' | 'linear' | 'in' | 'out' | 'bounce' | 'elastic' | 'hold'
export type ShapeId = 'arrow' | 'circle' | 'box' | 'underline' | 'cross' | 'check' | 'subscribe' | 'like' | 'progress' | 'callout' | 'viz-bars' | 'viz-wave' | 'viz-circle' | 'map'
  | 'face-shades' | 'face-hearteyes' | 'face-fireeyes' | 'face-tears' | 'face-mustache' | 'face-halo' | 'face-horns' | 'face-blush' | 'face-crown' | 'face-cap' | 'face-nose' | 'face-emoji'

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
  look?: { id: LookId; amt: number }
  eq?: Eq
  voice?: import('./voice').VoiceFx
  freeze?: boolean
  stab?: Stab
  duck?: { t: number; g: number }[]
  volKf?: { t: number; g: number }[]
  text?: TextProps
  emoji?: string
  stickerSize?: number
  shape?: ShapeId // vector graphic instead of an emoji
  color?: string
  shapeText?: string
  ease?: Ease // keyframe easing
  beauty?: Beauty
  follow?: Follow
  map?: import('./travelmap').MapData
  cutoutOf?: string // this clip is the cut-out person of that clip
  prog?: { pos: 'top' | 'bottom'; style: 'bar' | 'round' | 'chapters' } // progress-bar look
  studioOf?: string // cleaned voice made from that clip
  echoOf?: string
  glow?: { color: string; size: number } // glowing outline around a cut-out
  depth3d?: { amt: number; dir: 'in' | 'out' | 'left' | 'right' | 'orbit' } // 3D photo zoom
  sky?: { id: string; amt: number } // sky replacement
  cartoon?: { style: 'toon' | 'sketch' | 'comic'; amt: number }
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
  match?: { g: number[]; o: number[] } // per-channel gain / offset from colour match
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
  faces?: Record<string, FaceTrack> // per asset, found by the face tracker
  speakers?: Record<string, SpeakerTrack> // per asset, who talks when (source seconds)
  speakerNames?: string[]
  markerNames?: Record<string, string> // marker time (fixed 2 decimals) → chapter title
  depths?: Record<string, string> // per photo asset: depth map (PNG data URL) for 3D zoom
}

export interface FaceTrack {
  fps: number
  t0: number // source seconds of frames[0]
  frames: (number[] | null)[][] // [frame][person] → face (see faces.ts)
}

export interface SpeakerTrack {
  segs: { s: number; e: number; spk: number }[]
}

export interface Beauty {
  smooth: number // 0..1 skin smoothing
  bright: number // 0..1 face light
  tone: number // 0..1 even skin tone (less redness, a little warmth)
  person?: number // -1 / undefined = every face
}

export type FaceAnchor = 'eyes' | 'head' | 'nose' | 'mouth' | 'face' | 'cheeks'
export interface Follow {
  clipId: string // the video clip whose face we follow
  person: number
  anchor: FaceAnchor
  size: number // 1 = natural size for the anchor
}

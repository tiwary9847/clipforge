import { isPro } from './plan'
import { VoiceChain, buildVoice } from './voice'
import { levelsAt } from './viz'
import { gradePixels, isIdentity } from './grade'
import { buildEq } from './media'
import { LookId, Asset, Chroma, Clip, Filters, MaskShape, TextProps, TRACKS, TransType, Transition } from './types'
import { getAsset, getPreset, getState, projectDuration, setTimeGetter, subscribe, uid } from './store'
import { SFX_LIST } from './library'
import { computePeaks, makeSfx } from './sfx'
import { duckAt, evalProp, stabCorrection, volAt } from './anim'
import { Face, faceAt, srcTime } from './faces'
import { drawMap } from './travelmap'
import { cartoonize, drawSky } from './looks2'
import { drawDepth } from './depth3d'

export const FPS = 30

interface MediaEntry {
  el: HTMLMediaElement
  gain: GainNode
  url: string
  eq?: { input: AudioNode; set: (c: Clip) => void }
  vin?: GainNode
  voiceId?: string
  voice?: VoiceChain | null
}
export interface Box {
  id: string
  cx: number
  cy: number
  w: number
  h: number
  rot: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3)
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

function filterString(f: Filters, hueExtra: number, W: number): string {
  const hue = f.hue + hueExtra
  if (
    f.brightness === 1 && f.contrast === 1 && f.saturate === 1 && hue === 0 &&
    f.blur === 0 && f.sepia === 0 && f.grayscale === 0
  )
    return 'none'
  return (
    `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate}) ` +
    `hue-rotate(${hue}deg) blur(${(f.blur * W) / 1080}px) sepia(${f.sepia}) grayscale(${f.grayscale})`
  )
}

interface Mods {
  alpha: number
  ox: number
  oy: number
  sc: number
  rot: number
  hue: number
  wipe: { x: number; w: number } | null
  blur: number // px at 1080p
  flash: number // white overlay 0..1
  circle: number | null // circular reveal radius 0..1
  sx: number // horizontal squash for flip
}

function applyTrans(m: Mods, t: Transition, presence: number, dir: 1 | -1) {
  const e = easeOut(clamp01(presence))
  const inv = 1 - e
  switch (t.type as TransType) {
    case 'fade':
      m.alpha *= e
      break
    case 'slide-left':
      m.ox += dir * inv
      break
    case 'slide-right':
      m.ox -= dir * inv
      break
    case 'slide-up':
      m.oy += dir * inv
      break
    case 'slide-down':
      m.oy -= dir * inv
      break
    case 'zoom-in':
      m.sc *= 0.3 + 0.7 * e
      m.alpha *= e
      break
    case 'zoom-out':
      m.sc *= 1 + inv * 0.8
      m.alpha *= e
      break
    case 'spin':
      m.rot += inv * 360 * dir
      m.sc *= 0.2 + 0.8 * e
      break
    case 'wipe':
      m.wipe = dir > 0 ? { x: 0, w: e } : { x: 1 - e, w: e }
      break
    case 'flash':
      m.flash = Math.max(m.flash, Math.pow(inv, 1.5))
      m.alpha *= Math.min(1, e * 3)
      break
    case 'blur':
      m.blur += inv * 40
      m.alpha *= Math.min(1, e * 2)
      break
    case 'glitch': {
      const k = Math.floor(presence * 18)
      if (inv > 0.05) {
        m.ox += (hash(k + 11) - 0.5) * 0.12 * inv
        m.hue = hash(k + 5) * 360 * inv
        m.alpha *= hash(k + 2) > 0.25 ? 1 : 0.3
      }
      break
    }
    case 'whip':
      m.ox += dir * inv * 1.2
      m.blur += inv * 60
      break
    case 'circle':
      m.circle = e
      break
    case 'flip':
      m.sx *= Math.max(0.02, Math.abs(Math.cos(inv * Math.PI * 0.5)))
      m.alpha *= e < 0.02 ? 0 : 1
      break
    case 'bounce': {
      const p = clamp01(presence)
      m.sc *= p >= 1 ? 1 : Math.max(0.01, 1 + Math.sin(p * Math.PI * 2.5) * Math.exp(-p * 4) * 0.35 - (1 - p) * 0.9 * (p < 0.3 ? 1 : 0))
      m.alpha *= Math.min(1, p * 4)
      break
    }
  }
}

function srcSize(s: CanvasImageSource): [number, number] {
  if (typeof HTMLVideoElement !== 'undefined' && s instanceof HTMLVideoElement) return [s.videoWidth, s.videoHeight]
  if (typeof HTMLImageElement !== 'undefined' && s instanceof HTMLImageElement) return [s.naturalWidth, s.naturalHeight]
  const a = s as any
  return [a.width, a.height]
}

const SHAPE_COLOR: Record<string, string> = { arrow: '#ffd400', circle: '#ff3b3b', box: '#ffd400', underline: '#ffe500', cross: '#ff3b3b', check: '#22c55e', subscribe: '#ff0000', like: '#1f6feb', progress: '#ff3b5c', callout: '#ffffff', 'viz-bars': '#b46cff', 'viz-wave': '#31d0ff', 'viz-circle': '#ff5c9a' }
const SHAPE_BOX: Record<string, [number, number]> = { arrow: [1.5, 0.7], circle: [1.35, 1.05], box: [1.45, 1.05], underline: [1.6, 0.35], cross: [1, 1], check: [1.1, 0.9], subscribe: [2.6, 0.75], like: [1.6, 0.7], callout: [2.2, 1.0], progress: [1, 0.15], 'viz-bars': [2.5, 1.05], 'viz-wave': [2.5, 0.95], 'viz-circle': [1.35, 1.35], map: [3.2, 3.2],
  'face-shades': [2, 0.5], 'face-hearteyes': [2, 0.8], 'face-fireeyes': [2, 1], 'face-tears': [2, 1.3], 'face-mustache': [1.6, 0.5], 'face-halo': [1.6, 0.55], 'face-horns': [1.8, 0.8], 'face-blush': [2, 0.55],
  'face-crown': [1.25, 1.25], 'face-cap': [1.25, 1.25], 'face-nose': [1.25, 1.25], 'face-emoji': [1.25, 1.25] }

/** Where each face sticker sits: anchor, width (× the anchor's base size) and lift (× face height, up is negative). */
export const FACE_FIT: Record<string, { a: 'eyes' | 'head' | 'nose' | 'mouth' | 'face' | 'cheeks'; w: number; dy: number }> = {
  'face-shades': { a: 'eyes', w: 2.35, dy: 0 },
  'face-hearteyes': { a: 'eyes', w: 2.4, dy: 0 },
  'face-fireeyes': { a: 'eyes', w: 2.4, dy: -0.04 },
  'face-tears': { a: 'eyes', w: 2.4, dy: 0.12 },
  'face-mustache': { a: 'mouth', w: 0.55, dy: 0 },
  'face-halo': { a: 'head', w: 0.95, dy: -0.75 },
  'face-horns': { a: 'head', w: 1.05, dy: -0.62 },
  'face-crown': { a: 'head', w: 0.85, dy: -0.8 },
  'face-cap': { a: 'head', w: 1.25, dy: -0.6 },
  'face-blush': { a: 'cheeks', w: 0.95, dy: 0.04 },
  'face-nose': { a: 'nose', w: 0.3, dy: 0 },
  'face-emoji': { a: 'face', w: 1.45, dy: 0 },
}

const hex2rgb = (h: string): [number, number, number] => {
  const m = h.replace('#', '')
  const v = parseInt(m.length === 3 ? m.split('').map((x) => x + x).join('') : m, 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function keyPixels(d: Uint8ClampedArray, ch: Chroma) {
  const [kr, kg, kb] = hex2rgb(ch.color)
  const cb = (r: number, g: number, b: number) => -0.1687 * r - 0.3313 * g + 0.5 * b
  const cr = (r: number, g: number, b: number) => 0.5 * r - 0.4187 * g - 0.0813 * b
  const kcb = cb(kr, kg, kb)
  const kcr = cr(kr, kg, kb)
  const th = ch.sim * 0.6
  const sm = ch.smooth * 0.4 + 0.001
  const spillZone = th + sm + 0.25
  const dom = kg >= kr && kg >= kb ? 1 : kb >= kr ? 2 : 0
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const dist = Math.hypot(cb(r, g, b) - kcb, cr(r, g, b) - kcr) / 181
    let a = (dist - th) / sm
    a = a < 0 ? 0 : a > 1 ? 1 : a
    d[i + 3] = d[i + 3] * a
    if (ch.spill > 0 && dist < spillZone && a > 0) {
      if (dom === 1) d[i + 1] = g + (Math.min(g, Math.max(r, b)) - g) * ch.spill
      else if (dom === 2) d[i + 2] = b + (Math.min(b, Math.max(r, g)) - b) * ch.spill
      else d[i] = r + (Math.min(r, Math.max(g, b)) - r) * ch.spill
    }
  }
}

function maskPath(ctx: CanvasRenderingContext2D, shape: MaskShape, w: number, h: number, radius: number) {
  const m = Math.min(w, h)
  ctx.beginPath()
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, m / 2, 0, Math.PI * 2)
      break
    case 'ellipse':
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2)
      break
    case 'rounded': {
      const r = Math.max(0, Math.min(radius, 0.5)) * m
      if ((ctx as any).roundRect) (ctx as any).roundRect(-w / 2, -h / 2, w, h, r)
      else ctx.rect(-w / 2, -h / 2, w, h)
      break
    }
    case 'diamond':
      ctx.moveTo(0, -h / 2)
      ctx.lineTo(w / 2, 0)
      ctx.lineTo(0, h / 2)
      ctx.lineTo(-w / 2, 0)
      ctx.closePath()
      break
    case 'star': {
      const R = m / 2
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? R : R * 0.45
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const x = Math.cos(a) * rr
        const y = Math.sin(a) * rr
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.closePath()
      break
    }
    case 'heart': {
      const s = m / 2
      ctx.moveTo(0, s * 0.9)
      ctx.bezierCurveTo(-s * 1.5, s * 0.1, -s * 0.9, -s * 1.0, 0, -s * 0.35)
      ctx.bezierCurveTo(s * 0.9, -s * 1.0, s * 1.5, s * 0.1, 0, s * 0.9)
      ctx.closePath()
      break
    }
    default:
      ctx.rect(-w / 2, -h / 2, w, h)
  }
}

const easeOutBack = (p: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

class Engine {
  canvas: HTMLCanvasElement | null = null
  private c2d: CanvasRenderingContext2D | null = null
  private _actx: AudioContext | null = null
  private master!: GainNode
  private monitor!: GainNode
  private streamDest!: MediaStreamAudioDestinationNode
  private media = new Map<string, MediaEntry>()
  private images = new Map<string, HTMLImageElement>()
  private sfxBuf = new Map<string, AudioBuffer>()
  private sfxPeaks = new Map<string, number[]>()
  private sfxPlaying = new Map<string, { node: AudioBufferSourceNode; gain: GainNode }>()
  time = 0
  playing = false
  private startWall = 0
  private startT = 0
  private raf = 0
  private renderPending = false
  boxes: Box[] = []
  private listeners = new Set<(t: number, playing: boolean) => void>()
  private onEnded: (() => void) | null = null
  exporting = false
  private exportAbort = false
  private inited = false

  /* ---------- setup ---------- */
  init() {
    if (this.inited) return
    this.inited = true
    setTimeGetter(() => this.time)
    subscribe(() => this.onStore())
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.c2d = canvas.getContext('2d', { alpha: false })
    this.init()
    this.sync()
    this.render()
  }

  get audio(): AudioContext {
    if (!this._actx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      this._actx = new AC()
      this.master = this._actx.createGain()
      this.monitor = this._actx.createGain()
      this.streamDest = this._actx.createMediaStreamDestination()
      this.master.connect(this.monitor)
      this.monitor.connect(this._actx.destination)
      this.master.connect(this.streamDest)
    }
    return this._actx
  }

  onTick(fn: (t: number, playing: boolean) => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private emit() {
    this.listeners.forEach((l) => l(this.time, this.playing))
  }
  duration() {
    return projectDuration()
  }

  /* ---------- media management ---------- */
  private onStore() {
    this.sync()
    if (!this.playing) {
      this.positionMedia(this.time)
      this.requestRender()
    }
  }

  /** Only clips near the playhead get a live <video>/<audio> element – long, heavily cut
   *  projects would otherwise create hundreds of decoders. */
  private nearPlayhead(c: Clip) {
    const t = this.time
    return c.start < t + 12 && c.start + c.dur > t - 4
  }
  private lastNearSync = 0

  private sync() {
    const { project, assets } = getState()
    const keep = new Set<string>()
    for (const c of project.clips) {
      if (c.kind === 'video' || c.kind === 'audio') {
        const a = assets.find((x) => x.id === c.assetId)
        if (!a) continue
        if (!this.nearPlayhead(c)) continue
        keep.add(c.id)
        const m = this.media.get(c.id)
        if (!m || m.url !== (a.proxyUrl ?? a.url)) {
          if (m) this.disposeMedia(c.id)
          this.createMedia(c, a)
        }
      } else if (c.kind === 'image' && c.assetId && !this.images.has(c.assetId)) {
        const a = assets.find((x) => x.id === c.assetId)
        if (a) {
          const img = new Image()
          img.onload = () => this.requestRender()
          img.src = a.url
          this.images.set(c.assetId, img)
        }
      }
    }
    for (const id of [...this.media.keys()]) if (!keep.has(id)) this.disposeMedia(id)
    for (const [id, p] of [...this.sfxPlaying]) {
      if (!project.clips.some((c) => c.id === id)) {
        try { p.node.stop() } catch {}
        this.sfxPlaying.delete(id)
      }
    }
  }

  private createMedia(c: Clip, a: Asset) {
    const el = document.createElement(a.kind === 'video' ? 'video' : 'audio') as HTMLMediaElement
    el.preload = 'auto'
    ;(el as HTMLVideoElement).playsInline = true
    el.src = a.proxyUrl ?? a.url // preview may use a light proxy; export always reads the original blob
    const redraw = () => {
      if (!this.playing) this.requestRender()
    }
    el.addEventListener('seeked', redraw)
    el.addEventListener('loadeddata', redraw)
    const ctx = this.audio
    const node = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    const vin = ctx.createGain()
    const eq = buildEq(ctx, this.master)
    eq.set(c)
    node.connect(vin)
    vin.connect(gain)
    gain.connect(eq.input)
    this.media.set(c.id, { el, gain, url: a.proxyUrl ?? a.url, eq, vin, voiceId: 'none' })
  }

  private disposeMedia(id: string) {
    const m = this.media.get(id)
    if (!m) return
    try { m.el.pause() } catch {}
    try { m.gain.disconnect() } catch {}
    m.el.removeAttribute('src')
    m.el.load()
    this.media.delete(id)
  }

  getSfx(id: string): AudioBuffer {
    let b = this.sfxBuf.get(id)
    if (!b) {
      b = makeSfx(this.audio, id)
      this.sfxBuf.set(id, b)
    }
    return b
  }
  getSfxPeaks(id: string) {
    let p = this.sfxPeaks.get(id)
    if (!p) {
      p = computePeaks(this.getSfx(id), 60)
      this.sfxPeaks.set(id, p)
    }
    return p
  }

  /* ---------- transport ---------- */
  play() {
    const dur = this.duration()
    if (this.playing || dur <= 0) return
    if (this.time >= dur - 0.05) this.time = 0
    void this.audio.resume()
    this.playing = true
    this.startT = this.time
    this.startWall = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.tick)
    this.emit()
  }

  pause() {
    if (!this.playing) return
    this.playing = false
    cancelAnimationFrame(this.raf)
    for (const m of this.media.values()) {
      try { m.el.pause() } catch {}
    }
    for (const p of this.sfxPlaying.values()) {
      try { p.node.stop() } catch {}
    }
    this.sfxPlaying.clear()
    this.emit()
  }

  toggle() {
    this.playing ? this.pause() : this.play()
  }

  seek(t: number) {
    const dur = Math.max(this.duration(), 0)
    const nt = Math.min(Math.max(0, t), dur)
    const was = this.playing
    if (was) this.pause()
    this.time = nt
    this.sync()
    this.positionMedia(nt)
    this.render()
    this.emit()
    if (was) this.play()
  }

  private tick = () => {
    if (!this.playing) return
    const dur = this.duration()
    let t = this.startT + (performance.now() - this.startWall) / 1000
    if (performance.now() - this.lastNearSync > 500) {
      this.lastNearSync = performance.now()
      this.sync()
    }
    if (t >= dur) {
      this.time = dur
      this.render()
      this.pause()
      const cb = this.onEnded
      this.onEnded = null
      cb?.()
      return
    }
    this.time = t
    this.applyLoud()
    this.syncPlayback(t)
    this.render()
    this.emit()
    this.raf = requestAnimationFrame(this.tick)
  }

  private swapVoice(m: { gain: GainNode; vin?: GainNode; voiceId?: string; voice?: VoiceChain | null }, c: Clip) {
    if (!m.vin) return
    m.vin.disconnect()
    m.voice?.stop()
    m.voice?.output.disconnect()
    m.voice = buildVoice(this.audio, c.voice)
    if (m.voice) {
      m.vin.connect(m.voice.input)
      m.voice.output.connect(m.gain)
    } else m.vin.connect(m.gain)
    m.voiceId = c.voice ?? 'none'
  }

  private applyLoud() {
    if (!this.master) return
    const db = getState().project.loudDb
    const v = db ? Math.pow(10, db / 20) : 1
    if (Math.abs(this.master.gain.value - v) > 1e-3) this.master.gain.value = v
  }

  private fadeGain(c: Clip, lt: number) {
    if (getState().project.tracks?.[c.track]?.mute) return 0
    let g = c.volume * duckAt(c, lt) * volAt(c, lt)
    if (c.fadeIn > 0 && lt < c.fadeIn) g *= lt / c.fadeIn
    const rem = c.dur - lt
    if (c.fadeOut > 0 && rem < c.fadeOut) g *= Math.max(0, rem / c.fadeOut)
    return g
  }

  private syncPlayback(t: number) {
    const { clips } = getState().project
    const actx = this._actx
    for (const c of clips) {
      const active = t >= c.start && t < c.start + c.dur
      if (c.kind === 'video' || c.kind === 'audio') {
        const m = this.media.get(c.id)
        if (!m) continue
        const el = m.el
        if (active && c.freeze) {
          if (!el.paused) el.pause()
          if (Math.abs(el.currentTime - c.srcIn) > 0.04) el.currentTime = c.srcIn
          m.gain.gain.value = 0
        } else if (active) {
          const desired = c.srcIn + (t - c.start) * c.speed
          if (el.playbackRate !== c.speed) el.playbackRate = c.speed
          if (el.paused) {
            if (Math.abs(el.currentTime - desired) > 0.05) el.currentTime = desired
            el.play().catch(() => {})
          } else if (Math.abs(el.currentTime - desired) > 0.35) {
            el.currentTime = desired
          }
          m.gain.gain.value = this.fadeGain(c, t - c.start) * (c.eq?.comp ? 1.6 : 1)
          m.eq?.set(c)
          if ((c.voice ?? 'none') !== m.voiceId) this.swapVoice(m, c)
        } else {
          if (!el.paused) el.pause()
          // warm up the next clip so cuts are seamless
          const ahead = c.start - t
          if (ahead > 0 && ahead < 1 && Math.abs(el.currentTime - c.srcIn) > 0.1) el.currentTime = c.srcIn
        }
      } else if (c.kind === 'sfx' && c.sfxId && actx) {
        const cur = this.sfxPlaying.get(c.id)
        if (active) {
          if (!cur) {
            const src = actx.createBufferSource()
            src.buffer = this.getSfx(c.sfxId)
            const g = actx.createGain()
            src.connect(g)
            g.connect(this.master)
            const off = Math.max(0, t - c.start)
            if (off < src.buffer.duration) src.start(0, off)
            this.sfxPlaying.set(c.id, { node: src, gain: g })
          } else cur.gain.gain.value = this.fadeGain(c, t - c.start)
        } else if (cur) {
          try { cur.node.stop() } catch {}
          this.sfxPlaying.delete(c.id)
        }
      }
    }
  }

  /** Put every media element at the right frame (used when paused / scrubbing). */
  private positionMedia(t: number) {
    for (const c of getState().project.clips) {
      if (c.kind !== 'video') continue
      const m = this.media.get(c.id)
      if (!m) continue
      const lt = Math.min(Math.max(t - c.start, 0), c.dur)
      if (t >= c.start - 0.001 && t < c.start + c.dur) {
        const want = c.freeze ? c.srcIn : c.srcIn + lt * c.speed
        if (Math.abs(m.el.currentTime - want) > 0.02) m.el.currentTime = want
      }
    }
  }

  requestRender() {
    if (this.renderPending) return
    this.renderPending = true
    requestAnimationFrame(() => {
      this.renderPending = false
      this.render()
      this.emit()
    })
  }

  /* ---------- rendering ---------- */
  render() {
    const cv = this.canvas
    if (!cv) return
    const preset = getPreset()
    if (cv.width !== preset.w || cv.height !== preset.h) {
      cv.width = preset.w
      cv.height = preset.h
      this.c2d = cv.getContext('2d', { alpha: false })
    }
    const dur = this.duration()
    const t = Math.min(this.time, Math.max(0, dur - 0.001))
    const boxes: Box[] = []
    this.paint(this.c2d!, cv.width, cv.height, t, (c, lt) => this.previewSource(c, lt), boxes)
    this.boxes = boxes
  }

  /** Draws one frame of the project at time t. Used for both live preview and offline export. */
  paint(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    getSrc: (c: Clip, lt: number) => CanvasImageSource | null,
    boxes: Box[] = [],
  ) {
    const { project } = getState()
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'
    ctx.globalAlpha = 1
    ctx.fillStyle = project.bg
    ctx.fillRect(0, 0, W, H)
    ctx.restore()
    // best scaling: sharper when a small phone video is enlarged, no shimmer when a 4K one is shrunk
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const order = TRACKS.filter((x) => x.type === 'video').map((x) => x.id).reverse()
    for (const tid of order) {
      if (project.tracks?.[tid]?.hide) continue
      const list = project.clips
        .filter((c) => c.track === tid && t >= c.start && t < c.start + c.dur)
        .sort((a, b) => a.start - b.start)
      for (const c of list) {
        if (c.kind === 'adjust') this.applyAdjust(ctx, c, t, W, H)
        else if (c.follow) {
          const fc = this.followed(c, t, W, H)
          if (fc) this.drawClip(ctx, fc, t, W, H, getSrc, boxes)
        } else this.drawClip(ctx, c, t, W, H, getSrc, boxes)
      }
    }
    if (!isPro() && project.clips.length) this.drawMark(ctx, W, H)
  }

  /** Free version: a small “Made with ClipForge” mark in the bottom-right corner (removed with Pro). */
  private drawMark(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const s = Math.min(W, H) / 1080
    const fs = Math.round(26 * s)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 0.82
    ctx.filter = 'none'
    ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`
    const label = 'Made with ClipForge'
    const tw = ctx.measureText(label).width
    const pad = 12 * s
    const bw = tw + fs * 1.4 + pad * 2
    const bh = fs + pad * 1.4
    // above the bottom bar of Shorts/Reels, inside the safe area
    const x = W - bw - 24 * s
    const y = H - bh - (H > W ? H * 0.2 : 28 * s)
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.beginPath()
    ctx.roundRect(x, y, bw, bh, bh / 2)
    ctx.fill()
    const g = ctx.createLinearGradient(x, y, x + fs, y + fs)
    g.addColorStop(0, '#7c5cff')
    g.addColorStop(1, '#ff5ca8')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x + pad + fs * 0.5, y + bh / 2, fs * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    const cx = x + pad + fs * 0.5
    const cy = y + bh / 2
    ctx.moveTo(cx - fs * 0.15, cy - fs * 0.22)
    ctx.lineTo(cx + fs * 0.25, cy)
    ctx.lineTo(cx - fs * 0.15, cy + fs * 0.22)
    ctx.fill()
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + pad + fs * 1.4, y + bh / 2 + 1)
    ctx.restore()
  }

  private previewSource(c: Clip, lt: number): CanvasImageSource | null {
    if (c.kind === 'video') {
      const v = this.media.get(c.id)?.el as HTMLVideoElement | undefined
      return v && v.readyState >= 2 ? v : null
    }
    if (c.kind === 'image') return this.imageSource(c, lt)
    return null
  }

  /** Still image or the right frame of an animated GIF/WebP. */
  imageSource(c: Clip, lt: number): CanvasImageSource | null {
    const a = getAsset(c.assetId)
    if (a?.frames?.length) {
      const total = a.frames.reduce((s, f) => s + f.dur, 0) || 1
      let x = lt % total
      for (const f of a.frames) {
        if (x < f.dur) return f.bmp
        x -= f.dur
      }
      return a.frames[a.frames.length - 1].bmp
    }
    const im = this.images.get(c.assetId!)
    return im && im.complete && im.naturalWidth ? im : null
  }

  private modifiers(c: Clip, lt: number): Mods {
    const m: Mods = { alpha: 1, ox: 0, oy: 0, sc: 1, rot: 0, hue: 0, wipe: null, blur: 0, flash: 0, circle: null, sx: 1 }
    if (c.transIn.type !== 'none' && c.transIn.dur > 0 && lt < c.transIn.dur) applyTrans(m, c.transIn, lt / c.transIn.dur, 1)
    const rem = c.dur - lt
    if (c.transOut.type !== 'none' && c.transOut.dur > 0 && rem < c.transOut.dur) applyTrans(m, c.transOut, rem / c.transOut.dur, -1)
    switch (c.fx) {
      case 'shake':
        m.ox += (Math.sin(lt * 53) + Math.sin(lt * 97 + 1)) * 0.006
        m.oy += (Math.sin(lt * 61 + 2) + Math.sin(lt * 89)) * 0.004
        m.rot += Math.sin(lt * 43) * 1.2
        break
      case 'punch':
        m.sc *= 1 + 0.14 * Math.exp(-7 * ((lt * 2) % 1))
        break
      case 'pulse':
        m.sc *= 1 + 0.06 * Math.sin(lt * 7)
        break
      case 'spin':
        m.rot += lt * 120
        break
      case 'float':
        m.oy += Math.sin(lt * 2.2) * 0.02
        m.rot += Math.sin(lt * 1.5) * 3
        break
      case 'quake':
        m.ox += (Math.sin(lt * 71) + Math.sin(lt * 113 + 2)) * 0.018
        m.oy += (Math.sin(lt * 83 + 1) + Math.sin(lt * 127)) * 0.014
        m.rot += Math.sin(lt * 57) * 3
        m.sc *= 1.06
        break
      case 'bounce':
        m.oy -= Math.abs(Math.sin(lt * 5)) * 0.04
        m.sc *= 1 + 0.03 * Math.abs(Math.cos(lt * 5))
        break
      case 'zoompulse':
        m.sc *= 1 + 0.09 * Math.pow(Math.max(0, Math.cos(lt * Math.PI * 2)), 8)
        break
      case 'drift':
        m.sc *= 1.04 + lt * 0.012
        m.ox += Math.sin(lt * 0.4) * 0.015
        break
      case 'tilt':
        m.rot += Math.sin(lt * 1.6) * 6
        break
      case 'glitch': {
        const step = Math.floor(lt * 14)
        if (hash(step) > 0.72) {
          m.ox += (hash(step + 7) - 0.5) * 0.06
          m.hue = hash(step + 3) * 360
          if (hash(step) > 0.9) m.sc *= 1.05
        }
        break
      }
    }
    return m
  }

  layoutText(ctx: CanvasRenderingContext2D, tp: TextProps, W: number, H: number) {
    const fontPx = Math.max(4, tp.size * H)
    ctx.font = `${tp.italic ? 'italic ' : ''}${tp.bold ? 'bold ' : ''}${fontPx}px ${tp.font}`
    const raw = tp.upper ? tp.text.toUpperCase() : tp.text
    const maxW = tp.maxW * W
    const lines: string[] = []
    for (const para of raw.split('\n')) {
      let cur = ''
      for (const w of para.split(' ')) {
        const test = cur ? cur + ' ' + w : w
        if (ctx.measureText(test).width > maxW && cur) {
          lines.push(cur)
          cur = w
        } else cur = test
      }
      lines.push(cur)
    }
    const lineH = fontPx * 1.18
    const pad = tp.bgOpacity > 0 ? fontPx * 0.35 : 0
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 1)
    return { lines, fontPx, lineH, w: tw + pad * 2, h: lines.length * lineH + pad * 1.2, tw, pad }
  }

  private keyCanvases = new Map<string, HTMLCanvasElement>()
  private pixCanvas?: HTMLCanvasElement

  private keyed(c: Clip, src: CanvasImageSource, cl: number, ct: number, fw: number, fh: number): CanvasImageSource {
    const [SW, SH] = srcSize(src)
    const sx = cl * SW
    const sy = ct * SH
    const sw = Math.max(1, fw * SW)
    const sh = Math.max(1, fh * SH)
    const k = Math.min(1, 1920 / Math.max(sw, sh))
    const w = Math.max(1, Math.round(sw * k))
    const h = Math.max(1, Math.round(sh * k))
    let cv = this.keyCanvases.get(c.id)
    if (!cv) {
      cv = document.createElement('canvas')
      this.keyCanvases.set(c.id, cv)
    }
    if (cv.width !== w || cv.height !== h) {
      cv.width = w
      cv.height = h
    }
    const g = cv.getContext('2d', { willReadFrequently: true })!
    g.clearRect(0, 0, w, h)
    g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h)
    const img = g.getImageData(0, 0, w, h)
    if (c.chroma?.on) keyPixels(img.data, c.chroma)
    if (c.grade && !isIdentity(c.grade)) gradePixels(img.data, c.grade)
    g.putImageData(img, 0, 0)
    return cv
  }

  /** Reads the colour of the clip's own pixels (before keying) under a canvas point. Used by the eyedropper. */
  sampleSource(id: string, px: number, py: number): string | null {
    const b = this.getBox(id)
    const c = getState().project.clips.find((x) => x.id === id)
    if (!b || !c) return null
    const src = this.previewSource(c, this.time - c.start)
    if (!src) return null
    const r = (-b.rot * Math.PI) / 180
    const dx = px - b.cx
    const dy = py - b.cy
    const lx = dx * Math.cos(r) - dy * Math.sin(r)
    const ly = dx * Math.sin(r) + dy * Math.cos(r)
    if (Math.abs(lx) > b.w / 2 || Math.abs(ly) > b.h / 2) return null
    const u = lx / b.w + 0.5
    const v = ly / b.h + 0.5
    const cl = c.crop?.l ?? 0
    const ct = c.crop?.t ?? 0
    const fw = 1 - cl - (c.crop?.r ?? 0)
    const fh = 1 - ct - (c.crop?.b ?? 0)
    const [SW, SH] = srcSize(src)
    const tmp = document.createElement('canvas')
    tmp.width = tmp.height = 1
    const g = tmp.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src, (cl + u * fw) * SW, (ct + v * fh) * SH, 1, 1, 0, 0, 1, 1)
    const d = g.getImageData(0, 0, 1, 1).data
    return '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join('')
  }

  private drawClip(
    ctx: CanvasRenderingContext2D,
    c: Clip,
    t: number,
    W: number,
    H: number,
    getSrc: (c: Clip, lt: number) => CanvasImageSource | null,
    boxes: Box[],
  ) {
    const lt = t - c.start
    const mod = this.modifiers(c, lt)
    const px = evalProp(c, 'x', lt)
    const py = evalProp(c, 'y', lt)
    const pscale = evalProp(c, 'scale', lt)
    const prot = evalProp(c, 'rotation', lt)
    const popa = evalProp(c, 'opacity', lt)
    const asset = getAsset(c.assetId)
    const cl = c.crop?.l ?? 0
    const ct = c.crop?.t ?? 0
    const fw = Math.max(0.05, 1 - cl - (c.crop?.r ?? 0))
    const fh = Math.max(0.05, 1 - ct - (c.crop?.b ?? 0))
    let src: CanvasImageSource | null = null
    let srcRect: [number, number, number, number] | null = null
    let rawSrc: CanvasImageSource | null = null
    let rawRect: [number, number, number, number] | null = null
    let bw = 0
    let bh = 0
    let tl: ReturnType<Engine['layoutText']> | null = null
    const isMedia = (c.kind === 'video' || c.kind === 'image') && !!asset && asset.width > 0

    if (isMedia && asset) {
      src = getSrc(c, lt)
      const aw = asset.width * fw
      const ah = asset.height * fh
      const s = c.fit === 'cover' ? Math.max(W / aw, H / ah) : Math.min(W / aw, H / ah)
      bw = aw * s
      bh = ah * s
      if (src) {
        if (c.chroma?.on || (c.grade && !isIdentity(c.grade))) src = this.keyed(c, src, cl, ct, fw, fh)
        else if (cl || ct || fw < 1 || fh < 1) {
          const [SW, SH] = srcSize(src)
          srcRect = [cl * SW, ct * SH, fw * SW, fh * SH]
        }
      }
      rawSrc = src
      rawRect = srcRect
      if (src && c.cartoon && c.cartoon.amt > 0) {
        src = cartoonize(src, srcRect, c.cartoon.style, c.cartoon.amt)
        srcRect = null
      }
    } else if (c.kind === 'text' && c.text) {
      ctx.save()
      tl = this.layoutText(ctx, c.text, W, H)
      ctx.restore()
      bw = tl.w
      bh = tl.h
    } else if (c.kind === 'sticker') {
      const sz = (c.stickerSize ?? 0.2) * H
      const dims = c.shape ? SHAPE_BOX[c.shape] ?? [1.25, 1.25] : [1.25, 1.25]
      bw = sz * dims[0]
      bh = sz * dims[1]
    } else return

    boxes.push({ id: c.id, cx: px * W, cy: py * H, w: bw * pscale, h: bh * pscale, rot: prot })

    ctx.save()
    if (mod.wipe) {
      ctx.beginPath()
      ctx.rect(mod.wipe.x * W, 0, mod.wipe.w * W, H)
      ctx.clip()
    }
    if (mod.circle !== null) {
      ctx.beginPath()
      ctx.arc(W / 2, H / 2, Math.max(0.5, (mod.circle * Math.hypot(W, H)) / 2), 0, Math.PI * 2)
      ctx.clip()
    }
    ctx.translate((px + mod.ox) * W, (py + mod.oy) * H)
    ctx.rotate(((prot + mod.rot) * Math.PI) / 180)
    const sc = pscale * mod.sc
    ctx.scale((c.flipX ? -sc : sc) * mod.sx, sc)
    ctx.globalAlpha = Math.max(0, Math.min(1, popa * mod.alpha))
    let f = filterString(c.filters, mod.hue, W)
    if (mod.blur > 0.3) f = (f === 'none' ? '' : f + ' ') + `blur(${((mod.blur * W) / 1080).toFixed(1)}px)`
    if (f !== 'none') ctx.filter = f
    if (c.blend && c.blend !== 'source-over') ctx.globalCompositeOperation = c.blend as GlobalCompositeOperation
    const masked = isMedia && c.mask && c.mask.shape !== 'none'
    const mode = c.mask?.mode ?? 'show'
    const shapePath = () => {
      const ms = Math.max(0.01, evalProp(c, 'ms', lt))
      ctx.save()
      ctx.translate(evalProp(c, 'mx', lt) * bw, evalProp(c, 'my', lt) * bh)
      maskPath(ctx, c.mask!.shape, bw * ms, bh * ms, c.mask!.radius)
      ctx.restore()
    }
    if (masked && mode === 'show') {
      shapePath()
      ctx.clip()
    } else if (masked && mode === 'hide') {
      shapePath()
      ctx.rect(-bw / 2 - 2, -bh / 2 - 2, bw + 4, bh + 4)
      ctx.clip('evenodd')
    }

    if (src) {
      if (c.kind === 'video' && c.stab?.on) {
        const [cx, cy] = stabCorrection(c, lt)
        ctx.translate(cx * bw, cy * bh)
        ctx.scale(c.stab.zoom, c.stab.zoom)
      }
      const draw = (s2: CanvasImageSource = src!, r = srcRect) => {
        if (r) ctx.drawImage(s2, r[0], r[1], r[2], r[3], -bw / 2, -bh / 2, bw, bh)
        else ctx.drawImage(s2, -bw / 2, -bh / 2, bw, bh)
      }
      if (c.glow) {
        // glowing outline: the cut-out's own shape casts a coloured glow (strong + wide pass)
        ctx.save()
        ctx.shadowColor = c.glow.color
        ctx.shadowBlur = Math.max(2, c.glow.size * W * 0.5)
        draw()
        ctx.shadowBlur = Math.max(4, c.glow.size * W * 1.4)
        draw()
        ctx.restore()
      }
      if (!(c.depth3d && c.kind === 'image' && !c.cartoon && drawDepth(ctx, c, lt, bw, bh, srcRect, srcSize(src)[0]))) draw()
      if (c.sky && c.sky.amt > 0 && rawSrc) drawSky(ctx, rawSrc, rawRect, c.sky.id, c.sky.amt, bw, bh, c.id)
      if (c.beauty && (c.beauty.smooth > 0 || c.beauty.bright > 0 || c.beauty.tone > 0)) this.applyBeauty(ctx, c, lt, src, srcRect, bw, bh, sc)
      if (c.privacy && c.kind === 'video') this.applyFaceBlur(ctx, c, lt, src, srcRect, bw, bh)
      if (c.look && c.look.amt > 0) {
        const s0 = src
        const r0 = srcRect
        this.applyLook(ctx, c.look.id, c.look.amt, lt, bw, bh, W, (g, w, h) => {
          if (r0) g.drawImage(s0, r0[0], r0[1], r0[2], r0[3], 0, 0, w, h)
          else g.drawImage(s0, 0, 0, w, h)
        })
      }
      if (masked && (mode === 'blur' || mode === 'pixelate' || mode === 'spotlight')) {
        const amt = c.mask!.amt ?? 0.5
        ctx.save()
        if (mode === 'spotlight') {
          shapePath()
          ctx.rect(-bw / 2 - 2, -bh / 2 - 2, bw + 4, bh + 4)
          ctx.filter = 'none'
          ctx.fillStyle = `rgba(0,0,0,${0.3 + amt * 0.65})`
          ctx.fill('evenodd')
        } else {
          shapePath()
          ctx.clip()
          if (mode === 'blur') {
            ctx.filter = `${f !== 'none' ? f + ' ' : ''}blur(${Math.round(4 + amt * 40 * (W / 1080))}px)`
            draw()
            draw()
          } else {
            const [SW, SH] = srcSize(src)
            const r = srcRect ?? [0, 0, SW, SH]
            const cells = Math.max(4, Math.round(60 - amt * 52))
            const pc = (this.pixCanvas ??= document.createElement('canvas'))
            pc.width = cells
            pc.height = Math.max(2, Math.round((cells * bh) / bw))
            const pg = pc.getContext('2d')!
            pg.imageSmoothingEnabled = true
            pg.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, pc.width, pc.height)
            ctx.imageSmoothingEnabled = false
            ctx.drawImage(pc, -bw / 2, -bh / 2, bw, bh)
          }
        }
        ctx.restore()
      }
    } else if (tl && c.text) {
      this.drawText(ctx, c.text, tl, lt)
    } else if (c.kind === 'sticker' && c.shape) {
      this.drawShape(ctx, c, lt, t, W, H)
    } else if (c.kind === 'sticker') {
      ctx.font = `${(c.stickerSize ?? 0.2) * H}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(c.emoji ?? '⭐', 0, 0)
    }
    ctx.restore()
    if (mod.flash > 0.01) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.filter = 'none'
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = Math.min(1, mod.flash)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
  }

  /* ---------------- faces: beauty filter + stickers that follow a face ---------------- */
  private bA?: HTMLCanvasElement
  private bB?: HTMLCanvasElement
  private bM?: HTMLCanvasElement

  /** clip-box size of a media clip on a W×H canvas (same maths as drawClip) */
  private mediaBox(c: Clip, W: number, H: number): [number, number, number, number] | null {
    const a = getAsset(c.assetId)
    if (!a || !a.width) return null
    const fw = Math.max(0.05, 1 - (c.crop?.l ?? 0) - (c.crop?.r ?? 0))
    const fh = Math.max(0.05, 1 - (c.crop?.t ?? 0) - (c.crop?.b ?? 0))
    const aw = a.width * fw
    const ah = a.height * fh
    const s = c.fit === 'cover' ? Math.max(W / aw, H / ah) : Math.min(W / aw, H / ah)
    return [aw * s, ah * s, fw, fh]
  }

  /** source point (0..1 of the full frame) → clip-local coordinates */
  private toLocal(c: Clip, u: number, v: number, bw: number, bh: number, fw: number, fh: number): [number, number] {
    return [((u - (c.crop?.l ?? 0)) / fw - 0.5) * bw, ((v - (c.crop?.t ?? 0)) / fh - 0.5) * bh]
  }

  private pxC?: HTMLCanvasElement
  /** Blurs or pixelates every tracked face except the people in c.privacy.keep (clip-local coordinates). */
  private applyFaceBlur(ctx: CanvasRenderingContext2D, c: Clip, lt: number, src: CanvasImageSource, srcRect: [number, number, number, number] | null, bw: number, bh: number) {
    const pv = c.privacy!
    const st = c.freeze ? c.srcIn : c.srcIn + lt * c.speed
    const fw = Math.max(0.05, 1 - (c.crop?.l ?? 0) - (c.crop?.r ?? 0))
    const fh = Math.max(0.05, 1 - (c.crop?.t ?? 0) - (c.crop?.b ?? 0))
    const [SW, SH] = srcSize(src)
    const [sx, sy, sw, sh] = srcRect ?? [0, 0, SW, SH]
    for (let p = 0; p < 8; p++) {
      if (pv.keep.includes(p)) continue
      const f = faceAt(c.assetId, st, p)
      if (!f) continue
      const [cx, cy] = this.toLocal(c, f[0], f[1], bw, bh, fw, fh)
      const lw = (f[2] / fw) * bw * 1.4
      const lh = (f[3] / fh) * bh * 1.6
      // the same part of the source picture, a little larger so the blur has pixels to work with
      const pad = 1.35
      const x0 = cx - (lw * pad) / 2
      const y0 = cy - (lh * pad) / 2
      const W2 = lw * pad
      const H2 = lh * pad
      const u0 = sx + ((x0 + bw / 2) / bw) * sw
      const v0 = sy + ((y0 + bh / 2) / bh) * sh
      const uw = (W2 / bw) * sw
      const vh = (H2 / bh) * sh
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(cx, cy, lw / 2, lh / 2, (f[13] * Math.PI) / 180, 0, Math.PI * 2)
      ctx.clip()
      if (pv.mode === 'pixel') {
        const P = (this.pxC ??= document.createElement('canvas'))
        P.width = 10
        P.height = Math.max(4, Math.round((10 * H2) / W2))
        const g = P.getContext('2d')!
        g.drawImage(src, u0, v0, uw, vh, 0, 0, P.width, P.height)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(P, x0, y0, W2, H2)
      } else {
        ctx.filter = `blur(${Math.max(6, Math.round(lw * (pv.amt ?? 0.12)))}px)`
        ctx.drawImage(src, u0, v0, uw, vh, x0, y0, W2, H2)
        ctx.drawImage(src, u0, v0, uw, vh, x0, y0, W2, H2) // twice: a blur over a blur hides features better
      }
      ctx.restore()
    }
  }

  private applyBeauty(ctx: CanvasRenderingContext2D, c: Clip, lt: number, src: CanvasImageSource, srcRect: [number, number, number, number] | null, bw: number, bh: number, sc: number) {
    const b = c.beauty!
    const st = c.kind === 'video' ? (c.freeze ? c.srcIn : c.srcIn + lt * c.speed) : 0
    const fw = Math.max(0.05, 1 - (c.crop?.l ?? 0) - (c.crop?.r ?? 0))
    const fh = Math.max(0.05, 1 - (c.crop?.t ?? 0) - (c.crop?.b ?? 0))
    const people = b.person !== undefined && b.person >= 0 ? [b.person] : [0, 1, 2, 3]
    for (const p of people) {
      const f = faceAt(c.assetId, st, p)
      if (!f) continue
      const roll = (f[13] * Math.PI) / 180
      const [cx, cy] = this.toLocal(c, f[0], f[1] - f[3] * 0.1, bw, bh, fw, fh)
      const lw = (f[2] / fw) * bw * 1.2
      const lh = (f[3] / fh) * bh * 1.5
      const x0 = cx - lw / 2
      const y0 = cy - lh / 2
      const pw = Math.max(16, Math.min(720, Math.round(lw * Math.abs(sc))))
      const ph = Math.max(16, Math.round((pw * lh) / lw))
      const kx = pw / lw
      const ky = ph / lh
      const mk = (cv: HTMLCanvasElement | undefined) => {
        const x = cv ?? document.createElement('canvas')
        if (x.width !== pw || x.height !== ph) {
          x.width = pw
          x.height = ph
        }
        const g = x.getContext('2d')!
        g.setTransform(1, 0, 0, 1, 0, 0)
        g.globalCompositeOperation = 'source-over'
        g.globalAlpha = 1
        g.filter = 'none'
        g.clearRect(0, 0, pw, ph)
        return [x, g] as const
      }
      // soft face mask with eyes and mouth cut out (they stay sharp)
      const [mc, m] = mk(this.bM)
      this.bM = mc
      const P = (u: number, v: number) => {
        const [x, y] = this.toLocal(c, u, v, bw, bh, fw, fh)
        return [(x - x0) * kx, (y - y0) * ky]
      }
      const soft = (x: number, y: number, rx: number, ry: number, inner: number) => {
        m.save()
        m.translate(x, y)
        m.rotate(roll)
        m.scale(Math.max(1, rx), Math.max(1, ry))
        const gr = m.createRadialGradient(0, 0, 0, 0, 0, 1)
        gr.addColorStop(0, '#fff')
        gr.addColorStop(inner, '#fff')
        gr.addColorStop(1, 'rgba(255,255,255,0)')
        m.fillStyle = gr
        m.beginPath()
        m.arc(0, 0, 1, 0, Math.PI * 2)
        m.fill()
        m.restore()
      }
      soft(pw / 2, ph / 2, pw * 0.46, ph * 0.47, 0.62)
      m.globalCompositeOperation = 'destination-out'
      const eL = P(f[4], f[5])
      const eR = P(f[6], f[7])
      const ed = Math.hypot(eR[0] - eL[0], eR[1] - eL[1])
      soft(eL[0], eL[1], ed * 0.3, ed * 0.18, 0.55)
      soft(eR[0], eR[1], ed * 0.3, ed * 0.18, 0.55)
      const mo = P(f[8], f[9])
      const mwp = Math.max(4, f[10] * (bw / fw) * kx)
      soft(mo[0], mo[1], mwp * 0.62, mwp * 0.32, 0.5)
      m.globalCompositeOperation = 'source-over'
      const layer = (cv: HTMLCanvasElement | undefined, filter: string) => {
        const [x, g] = mk(cv)
        g.filter = filter
        const dx = (-bw / 2 - x0) * kx
        const dy = (-bh / 2 - y0) * ky
        if (srcRect) g.drawImage(src, srcRect[0], srcRect[1], srcRect[2], srcRect[3], dx, dy, bw * kx, bh * ky)
        else g.drawImage(src, dx, dy, bw * kx, bh * ky)
        g.filter = 'none'
        g.globalCompositeOperation = 'destination-in'
        g.drawImage(mc, 0, 0)
        return x
      }
      ctx.save()
      ctx.filter = 'none'
      const a0 = ctx.globalAlpha
      if (b.smooth > 0) {
        const r = Math.max(0.6, pw * (0.006 + 0.028 * b.smooth))
        const A = layer(this.bA, `blur(${r.toFixed(1)}px)`)
        this.bA = A
        ctx.globalAlpha = a0 * Math.min(1, 0.35 + b.smooth * 0.65)
        ctx.drawImage(A, x0, y0, lw, lh)
      }
      if (b.bright > 0 || b.tone > 0) {
        const B = layer(this.bB, `brightness(${(1 + 0.22 * b.bright).toFixed(3)}) contrast(${(1 - 0.06 * b.bright).toFixed(3)}) saturate(${(1 - 0.28 * b.tone).toFixed(3)}) sepia(${(0.14 * b.tone).toFixed(3)})`)
        this.bB = B
        ctx.globalAlpha = a0 * 0.9
        ctx.drawImage(B, x0, y0, lw, lh)
      }
      ctx.restore()
    }
  }

  /** A sticker that follows a face: returns a copy placed on the face at time t, or null when there's no face. */
  private followed(c: Clip, t: number, W: number, H: number): Clip | null {
    const fl = c.follow!
    const tgt = getState().project.clips.find((x) => x.id === fl.clipId)
    if (!tgt || t < tgt.start || t >= tgt.start + tgt.dur) return null
    const f: Face | null = faceAt(tgt.assetId, srcTime(tgt, t), fl.person)
    const a = getAsset(tgt.assetId)
    const box = this.mediaBox(tgt, W, H)
    if (!f || !a || !box) return null
    const [bw, bh, fw, fh] = box
    const AW = a.width
    const AH = a.height
    const fit = FACE_FIT[c.shape ?? ''] ?? { a: fl.anchor, w: 1, dy: 0 }
    const roll = f[13]
    const eyeD = Math.hypot((f[6] - f[4]) * AW, (f[7] - f[5]) * AH)
    const faceW = f[2] * AW
    const faceH = f[3] * AH
    let px = 0
    let py = 0
    let base = faceW
    switch (fit.a) {
      case 'eyes':
        px = ((f[4] + f[6]) / 2) * AW
        py = ((f[5] + f[7]) / 2) * AH
        base = eyeD
        break
      case 'head':
        px = ((f[4] + f[6]) / 2) * AW
        py = ((f[5] + f[7]) / 2) * AH
        break
      case 'nose':
        px = f[11] * AW
        py = f[12] * AH
        break
      case 'mouth':
        px = (f[11] * 0.42 + f[8] * 0.58) * AW
        py = (f[12] * 0.42 + f[9] * 0.58) * AH
        break
      case 'cheeks':
        px = f[11] * AW
        py = f[12] * AH
        break
      default:
        px = f[0] * AW
        py = f[1] * AH
    }
    const rr = (roll * Math.PI) / 180
    // lift along the face's own 'up' direction (dy < 0 = up)
    px += -fit.dy * faceH * Math.sin(rr)
    py += fit.dy * faceH * Math.cos(rr)
    // source px → clip local → canvas
    const [lx, ly] = this.toLocal(tgt, px / AW, py / AH, bw, bh, fw, fh)
    const lt = t - tgt.start
    const mod = this.modifiers(tgt, lt)
    const sc = evalProp(tgt, 'scale', lt) * mod.sc
    const rot = ((evalProp(tgt, 'rotation', lt) + mod.rot) * Math.PI) / 180
    const sx = (tgt.flipX ? -sc : sc) * mod.sx
    const X = (evalProp(tgt, 'x', lt) + mod.ox) * W + Math.cos(rot) * lx * sx - Math.sin(rot) * ly * sc
    const Y = (evalProp(tgt, 'y', lt) + mod.oy) * H + Math.sin(rot) * lx * sx + Math.cos(rot) * ly * sc
    const wantW = base * fit.w * (bw / (AW * fw)) * Math.abs(sc) * (fl.size || 1)
    const dims = c.shape ? SHAPE_BOX[c.shape] ?? [1.25, 1.25] : [1.25, 1.25]
    const natural = (c.stickerSize ?? 0.2) * H * dims[0]
    return { ...c, kf: undefined, x: X / W, y: Y / H, scale: wantW / natural, rotation: (tgt.flipX ? -roll : roll) + (rot * 180) / Math.PI }
  }

  /* ---------------- look effects (film grain, VHS, light leaks …) ---------------- */
  private noiseTile?: HTMLCanvasElement
  private scanTile?: HTMLCanvasElement
  private fxA?: HTMLCanvasElement
  private fxB?: HTMLCanvasElement

  /** Draws a look over a box centred at the current origin. paintSrc draws the clean picture into a context. */
  applyLook(ctx: CanvasRenderingContext2D, id: LookId, amt: number, lt: number, bw: number, bh: number, W: number, paintSrc: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const x0 = -bw / 2
    const y0 = -bh / 2
    ctx.save()
    ctx.filter = 'none'
    const split = (d: number) => {
      const w = Math.max(2, Math.round(Math.min(bw, 960)))
      const h = Math.max(2, Math.round((w * bh) / bw))
      const A = (this.fxA ??= document.createElement('canvas'))
      const B = (this.fxB ??= document.createElement('canvas'))
      for (const [cv, col] of [[A, '#ff0000'], [B, '#00ffff']] as [HTMLCanvasElement, string][]) {
        if (cv.width !== w || cv.height !== h) {
          cv.width = w
          cv.height = h
        }
        const g = cv.getContext('2d')!
        g.globalCompositeOperation = 'source-over'
        g.clearRect(0, 0, w, h)
        paintSrc(g, w, h)
        g.globalCompositeOperation = 'multiply'
        g.fillStyle = col
        g.fillRect(0, 0, w, h)
      }
      ctx.globalCompositeOperation = 'lighten'
      ctx.drawImage(A, x0 + d, y0, bw, bh)
      ctx.drawImage(B, x0 - d, y0, bw, bh)
      ctx.globalCompositeOperation = 'source-over'
    }
    const rect = () => ctx.fillRect(x0, y0, bw, bh)
    switch (id) {
      case 'grain': {
        if (!this.noiseTile) {
          const n = (this.noiseTile = document.createElement('canvas'))
          n.width = n.height = 256
          const g = n.getContext('2d')!
          const im = g.createImageData(256, 256)
          for (let i = 0; i < im.data.length; i += 4) {
            const v = 128 + (Math.random() - 0.5) * 255
            im.data[i] = im.data[i + 1] = im.data[i + 2] = v
            im.data[i + 3] = 255
          }
          g.putImageData(im, 0, 0)
        }
        const pat = ctx.createPattern(this.noiseTile, 'repeat')!
        const k = Math.floor(lt * 24)
        pat.setTransform(new DOMMatrix().translate(hash(k) * 256, hash(k + 9) * 256).scale(Math.max(1, W / 1080)))
        ctx.globalCompositeOperation = 'overlay'
        ctx.globalAlpha = 0.18 + amt * 0.5
        ctx.fillStyle = pat
        rect()
        break
      }
      case 'vignette': {
        const g = ctx.createRadialGradient(0, 0, Math.min(bw, bh) * 0.28, 0, 0, Math.hypot(bw, bh) / 2)
        g.addColorStop(0, 'rgba(0,0,0,0)')
        g.addColorStop(1, `rgba(0,0,0,${0.35 + amt * 0.6})`)
        ctx.fillStyle = g
        rect()
        break
      }
      case 'leak': {
        ctx.globalCompositeOperation = 'screen'
        const p = lt * 0.35
        const R = Math.max(bw, bh)
        const blobs: [number, number, string][] = [
          [Math.sin(p) * bw * 0.4, -bh * 0.32 + Math.cos(p * 0.7) * bh * 0.08, '255,120,40'],
          [Math.cos(p * 1.3) * bw * 0.45, bh * 0.3, '255,60,140'],
          [-bw * 0.45, Math.sin(p * 0.9) * bh * 0.3, '255,200,90'],
        ]
        blobs.forEach(([bx, by, col], i) => {
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, R * (0.55 - i * 0.1))
          g.addColorStop(0, `rgba(${col},${(0.35 + amt * 0.55) * (1 - i * 0.2)})`)
          g.addColorStop(1, `rgba(${col},0)`)
          ctx.fillStyle = g
          rect()
        })
        break
      }
      case 'flare': {
        ctx.globalCompositeOperation = 'screen'
        const fx = -bw * 0.22 + Math.sin(lt * 0.6) * bw * 0.12
        const fy = -bh * 0.3
        const R = Math.min(bw, bh)
        const a = 0.35 + amt * 0.6
        let g = ctx.createRadialGradient(fx, fy, 0, fx, fy, R * 0.35)
        g.addColorStop(0, `rgba(255,255,240,${a})`)
        g.addColorStop(0.25, `rgba(255,210,140,${a * 0.6})`)
        g.addColorStop(1, 'rgba(255,160,80,0)')
        ctx.fillStyle = g
        rect()
        ctx.save()
        ctx.translate(fx, fy)
        ctx.scale(1, 0.035)
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, bw * 0.7)
        g.addColorStop(0, `rgba(255,240,220,${a * 0.9})`)
        g.addColorStop(1, 'rgba(255,240,220,0)')
        ctx.fillStyle = g
        ctx.fillRect(-bw, -bh * 20, bw * 2, bh * 40)
        ctx.restore()
        for (const [k, r, col] of [[0.6, 0.05, '120,200,255'], [1.1, 0.09, '180,120,255'], [1.5, 0.035, '255,180,120']] as [number, number, string][]) {
          const rx = fx + (0 - fx) * k * 1.4
          const ry = fy + (0 - fy) * k * 1.4
          g = ctx.createRadialGradient(rx, ry, 0, rx, ry, R * r)
          g.addColorStop(0, `rgba(${col},${a * 0.35})`)
          g.addColorStop(1, `rgba(${col},0)`)
          ctx.fillStyle = g
          rect()
        }
        break
      }
      case 'zoomblur': {
        const n = 6
        ctx.globalAlpha = 0.12 + amt * 0.1
        const w = Math.max(2, Math.round(Math.min(bw, 960)))
        const h = Math.max(2, Math.round((w * bh) / bw))
        const A = (this.fxA ??= document.createElement('canvas'))
        if (A.width !== w || A.height !== h) {
          A.width = w
          A.height = h
        }
        const g = A.getContext('2d')!
        g.globalCompositeOperation = 'source-over'
        g.clearRect(0, 0, w, h)
        paintSrc(g, w, h)
        for (let i = 1; i <= n; i++) {
          const k = 1 + i * (0.012 + amt * 0.03)
          ctx.drawImage(A, (x0 * k), (y0 * k), bw * k, bh * k)
        }
        break
      }
      case 'glow': {
        const w = Math.max(2, Math.round(Math.min(bw, 640)))
        const h = Math.max(2, Math.round((w * bh) / bw))
        const A = (this.fxA ??= document.createElement('canvas'))
        if (A.width !== w || A.height !== h) {
          A.width = w
          A.height = h
        }
        const g = A.getContext('2d')!
        g.globalCompositeOperation = 'source-over'
        g.filter = `blur(${Math.round(w / 45)}px) brightness(1.25)`
        g.clearRect(0, 0, w, h)
        paintSrc(g, w, h)
        g.filter = 'none'
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = 0.25 + amt * 0.55
        ctx.drawImage(A, x0, y0, bw, bh)
        break
      }
      case 'rgb':
        split(bw * (0.004 + amt * 0.014) * (1 + 0.5 * Math.sin(lt * 9)))
        break
      case 'vhs': {
        const jit = hash(Math.floor(lt * 12)) > 0.8 ? (hash(Math.floor(lt * 12) + 3) - 0.5) * bw * 0.01 : 0
        ctx.save()
        ctx.translate(jit, 0)
        split(bw * (0.003 + amt * 0.006))
        ctx.restore()
        if (!this.scanTile) {
          const sc = (this.scanTile = document.createElement('canvas'))
          sc.width = 4
          sc.height = 4
          const g = sc.getContext('2d')!
          g.fillStyle = 'rgba(0,0,0,0.55)'
          g.fillRect(0, 0, 4, 1)
        }
        const pat = ctx.createPattern(this.scanTile, 'repeat')!
        pat.setTransform(new DOMMatrix().scale(Math.max(1, W / 720)))
        ctx.globalAlpha = 0.25 + amt * 0.45
        ctx.fillStyle = pat
        rect()
        // rolling bright band
        const by = y0 + (((lt * 0.18) % 1.2) - 0.1) * bh
        const g = ctx.createLinearGradient(0, by - bh * 0.05, 0, by + bh * 0.05)
        g.addColorStop(0, 'rgba(255,255,255,0)')
        g.addColorStop(0.5, `rgba(255,255,255,${0.05 + amt * 0.1})`)
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.globalAlpha = 1
        ctx.fillStyle = g
        rect()
        break
      }
    }
    ctx.restore()
  }

  /* ---------------- adjustment layers ---------------- */
  private adjCanvas?: HTMLCanvasElement
  private applyAdjust(ctx: CanvasRenderingContext2D, c: Clip, t: number, W: number, H: number) {
    const lt = t - c.start
    const mod = this.modifiers(c, lt)
    const alpha = Math.max(0, Math.min(1, evalProp(c, 'opacity', lt) * mod.alpha))
    if (alpha <= 0.001) return
    const f = filterString(c.filters, mod.hue, W)
    const grade = c.grade && !isIdentity(c.grade)
    const look = c.look && c.look.amt > 0
    if (f === 'none' && !grade && !look) return
    const A = (this.adjCanvas ??= document.createElement('canvas'))
    if (A.width !== W || A.height !== H) {
      A.width = W
      A.height = H
    }
    const g = A.getContext('2d', { willReadFrequently: true })!
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.filter = f
    g.clearRect(0, 0, W, H)
    g.drawImage(ctx.canvas, 0, 0, W, H)
    g.filter = 'none'
    if (grade) {
      const im = g.getImageData(0, 0, W, H)
      gradePixels(im.data, c.grade!)
      g.putImageData(im, 0, 0)
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'
    ctx.globalAlpha = alpha
    ctx.drawImage(A, 0, 0)
    if (look) {
      ctx.translate(W / 2, H / 2)
      this.applyLook(ctx, c.look!.id, c.look!.amt, lt, W, H, W, (gg, w, h) => gg.drawImage(A, 0, 0, w, h))
    }
    ctx.restore()
  }

  private drawText(ctx: CanvasRenderingContext2D, tp: TextProps, tl: ReturnType<Engine['layoutText']>, lt: number) {
    const { lines, fontPx, lineH, w, h, tw } = tl
    ctx.font = `${tp.italic ? 'italic ' : ''}${tp.bold ? 'bold ' : ''}${fontPx}px ${tp.font}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = tp.align
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    const anim = tp.anim ?? 'none'
    const ad = Math.max(0.1, tp.animDur ?? 0.8)
    // text animations that build in (typewriter, pop, fade, slide) hide the background until they begin
    if (tp.bgOpacity > 0) {
      ctx.save()
      ctx.globalAlpha *= tp.bgOpacity
      ctx.fillStyle = tp.bg
      ctx.beginPath()
      if ((ctx as any).roundRect) (ctx as any).roundRect(-w / 2, -h / 2, w, h, fontPx * 0.25)
      else ctx.rect(-w / 2, -h / 2, w, h)
      ctx.fill()
      ctx.restore()
    }
    const x = tp.align === 'left' ? -tw / 2 : tp.align === 'right' ? tw / 2 : 0
    const fillAt = (cy: number): string | CanvasGradient => {
      if (!tp.grad) return tp.color
      const g = ctx.createLinearGradient(0, cy - fontPx * 0.5, 0, cy + fontPx * 0.5)
      g.addColorStop(0, tp.color)
      g.addColorStop(1, tp.grad)
      return g
    }
    const charMode = Math.abs(tp.curve ?? 0) > 0.02 || anim === 'letters' || anim === 'bounce' || anim === 'glow' || anim === 'rainbow'
    if (charMode) {
      this.drawTextChars(ctx, tp, tl, lt, fillAt)
      return
    }
    const perWord = tp.hlIdx !== undefined || anim !== 'none' || !!tp.kwIdx?.length
    const allWords = lines.flatMap((l) => l.split(' ').filter(Boolean))
    const totalWords = Math.max(1, allWords.length)
    const totalChars = allWords.reduce((n, wd) => n + wd.length, 0)
    const stagger = totalWords > 1 ? ad / totalWords : 0
    let wordNo = 0
    let charsBefore = 0
    lines.forEach((ln, i) => {
      const y = (i - (lines.length - 1) / 2) * lineH
      if (tp.shadow) {
        ctx.shadowColor = tp.strokeW > 0 ? tp.stroke : 'rgba(0,0,0,.6)'
        ctx.shadowBlur = fontPx * 0.2
        ctx.shadowOffsetY = fontPx * 0.04
      }
      if (perWord) {
        const words = ln.split(' ').filter(Boolean)
        const sp = ctx.measureText(' ').width
        const widths = words.map((wd) => ctx.measureText(wd).width)
        const lw = widths.reduce((a, b) => a + b, 0) + sp * Math.max(0, words.length - 1)
        let cx = tp.align === 'left' ? -tw / 2 : tp.align === 'right' ? tw / 2 - lw : -lw / 2
        ctx.textAlign = 'left'
        words.forEach((wd, k) => {
          let alpha = 1
          let sc = 1
          let dy = 0
          let shown = wd
          const lp = lt - wordNo * stagger
          if (anim === 'typewriter') {
            const n = Math.floor(Math.min(1, lt / ad) * totalChars) - charsBefore
            shown = wd.slice(0, Math.max(0, Math.min(wd.length, n)))
          } else if (anim === 'pop') {
            const p = Math.min(1, Math.max(0, lp / 0.28))
            sc = p >= 1 ? 1 : easeOutBack(p)
            alpha = Math.min(1, p * 2.5)
          } else if (anim === 'fade') {
            alpha = Math.min(1, Math.max(0, lp / 0.35))
          } else if (anim === 'slide') {
            const p = Math.min(1, Math.max(0, lp / 0.35))
            dy = (1 - (1 - Math.pow(1 - p, 3))) * fontPx * 0.9
            alpha = p
          } else if (anim === 'wave') {
            dy = Math.sin(lt * 6 - wordNo * 0.7) * fontPx * 0.12
          }
          const hot = tp.hlIdx !== undefined && wordNo === tp.hlIdx
          const kw = !!tp.kwIdx?.includes(wordNo)
          if (shown && alpha > 0) {
            ctx.save()
            ctx.globalAlpha *= alpha
            ctx.translate(cx + widths[k] / 2, y + dy)
            if (hot && tp.hlStyle === 'big') {
              // current word grows with a little bounce
              const p = Math.min(1, Math.max(0, lt / 0.16))
              sc *= 1 + 0.22 * (p >= 1 ? 1 : easeOutBack(p))
            }
            ctx.scale(sc, sc)
            if (hot && tp.hlStyle === 'box') {
              ctx.save()
              ctx.shadowColor = 'transparent'
              ctx.fillStyle = tp.hlColor ?? '#a855f7'
              ctx.beginPath()
              ctx.roundRect(-widths[k] / 2 - fontPx * 0.18, -fontPx * 0.62, widths[k] + fontPx * 0.36, fontPx * 1.2, fontPx * 0.22)
              ctx.fill()
              ctx.restore()
            }
            if (tp.strokeW > 0 && !(hot && tp.hlStyle === 'box')) {
              ctx.lineWidth = fontPx * tp.strokeW
              ctx.strokeStyle = tp.stroke
              ctx.strokeText(shown, -widths[k] / 2, 0)
            }
            ctx.fillStyle = hot && tp.hlStyle === 'box' ? '#ffffff' : hot ? tp.hlColor ?? '#ffe500' : kw ? tp.kwColor ?? '#22c55e' : fillAt(0)
            ctx.fillText(shown, -widths[k] / 2, 0)
            ctx.restore()
          }
          cx += widths[k] + sp
          charsBefore += wd.length
          wordNo++
        })
        ctx.textAlign = tp.align
      } else {
        if (tp.strokeW > 0) {
          ctx.lineWidth = fontPx * tp.strokeW
          ctx.strokeStyle = tp.stroke
          ctx.strokeText(ln, x, y)
        }
        ctx.fillStyle = fillAt(y)
        ctx.fillText(ln, x, y)
      }
      ctx.shadowColor = 'transparent'
    })
    if (tp.emoji) {
      // emoji pops in above the caption
      const p = Math.min(1, Math.max(0, lt / 0.3))
      const es = (p >= 1 ? 1 : easeOutBack(p)) * fontPx * 1.25
      ctx.save()
      ctx.shadowColor = 'transparent'
      ctx.font = `${es}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(tp.emoji, 0, -((lines.length - 1) / 2) * lineH - fontPx * 1.35 + Math.sin(lt * 5) * fontPx * 0.06)
      ctx.restore()
    }
  }

  /** Letter-by-letter text: curved baselines and per-letter animations. */
  private drawTextChars(ctx: CanvasRenderingContext2D, tp: TextProps, tl: ReturnType<Engine['layoutText']>, lt: number, fillAt: (y: number) => string | CanvasGradient) {
    const { lines, fontPx, lineH, tw } = tl
    const anim = tp.anim ?? 'none'
    const ad = Math.max(0.1, tp.animDur ?? 0.8)
    const curve = tp.curve ?? 0
    const total = Math.max(1, lines.reduce((n, l) => n + [...l].length, 0))
    const stagger = ad / total
    let ci = 0
    ctx.textAlign = 'left'
    lines.forEach((ln, i) => {
      const y = (i - (lines.length - 1) / 2) * lineH
      const chars = [...ln]
      const widths = chars.map((ch) => ctx.measureText(ch).width)
      const lw = widths.reduce((a, b) => a + b, 0)
      const start = tp.align === 'left' ? -tw / 2 : tp.align === 'right' ? tw / 2 - lw : -lw / 2
      const mid = start + lw / 2
      const R = Math.abs(curve) > 0.02 ? lw / (Math.abs(curve) * Math.PI) : 0
      const sag = R ? R * (1 - Math.cos(lw / R / 2)) : 0
      const sign = curve > 0 ? 1 : -1
      let cx = start
      chars.forEach((ch, k) => {
        const w = widths[k]
        let px = cx + w / 2
        let py = y
        let rot = 0
        if (R) {
          const a = (px - mid) / R
          px = mid + R * Math.sin(a)
          py = y + sign * (R * (1 - Math.cos(a)) - sag / 2)
          rot = sign * a
        }
        let alpha = 1
        let sc = 1
        let dy = 0
        let fill: string | CanvasGradient = fillAt(0)
        const lp = lt - ci * stagger
        if (anim === 'letters') {
          const p = Math.min(1, Math.max(0, lp / 0.22))
          sc = p >= 1 ? 1 : easeOutBack(p)
          alpha = Math.min(1, p * 3)
        } else if (anim === 'bounce') {
          const p = Math.min(1, Math.max(0, lp / 0.5))
          const b = p >= 1 ? 1 : 1 - Math.abs(Math.cos(p * Math.PI * 1.5)) * (1 - p)
          dy = -(1 - b) * fontPx * 1.1
          alpha = lp > 0 ? 1 : 0
        } else if (anim === 'rainbow') {
          fill = `hsl(${(ci * 28 + lt * 140) % 360}, 95%, 62%)`
        }
        if (ch.trim() && alpha > 0) {
          ctx.save()
          ctx.globalAlpha *= alpha
          ctx.translate(px, py + dy)
          ctx.rotate(rot)
          ctx.scale(sc, sc)
          if (anim === 'glow') {
            ctx.shadowColor = tp.grad ?? tp.color
            ctx.shadowBlur = fontPx * (0.35 + 0.3 * Math.sin(lt * 5))
          } else if (tp.shadow) {
            ctx.shadowColor = tp.strokeW > 0 ? tp.stroke : 'rgba(0,0,0,.6)'
            ctx.shadowBlur = fontPx * 0.2
            ctx.shadowOffsetY = fontPx * 0.04
          }
          if (tp.strokeW > 0) {
            ctx.lineWidth = fontPx * tp.strokeW
            ctx.strokeStyle = tp.stroke
            ctx.strokeText(ch, -w / 2, 0)
          }
          ctx.fillStyle = fill
          ctx.fillText(ch, -w / 2, 0)
          ctx.restore()
        }
        cx += w
        ci++
      })
    })
    ctx.textAlign = tp.align
  }

  /* ---------------- vector shapes, callouts and audio visualizers ---------------- */
  private drawFaceSticker(ctx: CanvasRenderingContext2D, c: Clip, lt: number, S: number) {
    const [dw, dh] = SHAPE_BOX[c.shape!] ?? [1.25, 1.25]
    const w = S * dw
    const h = S * dh
    const emoji = (e: string, x: number, y: number, size: number) => {
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(e, x, y)
    }
    const heart = (x: number, y: number, r: number) => {
      ctx.beginPath()
      ctx.moveTo(x, y + r * 0.9)
      ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45)
      ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9)
      ctx.fill()
    }
    switch (c.shape) {
      case 'face-shades': {
        // classic pixel "deal with it" glasses
        const rows = ['####################', '#WW######..#WW######', '#W#######..#W#######', '.#######....#######.', '..#####......#####..']
        const u = w / 20
        ctx.shadowColor = 'transparent'
        rows.forEach((r, y) =>
          [...r].forEach((ch, x) => {
            if (ch === '.') return
            ctx.fillStyle = ch === 'W' ? '#fff' : '#000'
            ctx.fillRect(-w / 2 + x * u, -h / 2 + y * u, u + 0.5, u + 0.5)
          }),
        )
        break
      }
      case 'face-hearteyes': {
        const k = 1 + 0.1 * Math.sin(lt * 8)
        ctx.fillStyle = '#ff2d55'
        heart(-w * 0.25, 0, w * 0.13 * k)
        heart(w * 0.25, 0, w * 0.13 * k)
        break
      }
      case 'face-fireeyes': {
        const k = 1 + 0.08 * Math.sin(lt * 12)
        emoji('🔥', -w * 0.25, 0, w * 0.36 * k)
        emoji('🔥', w * 0.25, 0, w * 0.36 * k)
        break
      }
      case 'face-tears': {
        ctx.fillStyle = 'rgba(80,170,255,0.9)'
        for (const sx of [-1, 1])
          for (let k = 0; k < 2; k++) {
            const ph = (lt * 1.1 + k * 0.5 + (sx > 0 ? 0.25 : 0)) % 1
            const x = sx * w * 0.26
            const y = -h * 0.25 + ph * h * 0.8
            const r = w * 0.035
            ctx.globalAlpha = Math.min(1, (1 - ph) * 1.6)
            ctx.beginPath()
            ctx.moveTo(x, y - r * 2.2)
            ctx.quadraticCurveTo(x + r * 1.2, y - r * 0.2, x, y + r)
            ctx.quadraticCurveTo(x - r * 1.2, y - r * 0.2, x, y - r * 2.2)
            ctx.fill()
          }
        ctx.globalAlpha = 1
        break
      }
      case 'face-mustache': {
        ctx.fillStyle = '#1b1210'
        for (const sx of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(0, -h * 0.2)
          ctx.bezierCurveTo(sx * w * 0.18, -h * 0.55, sx * w * 0.42, -h * 0.25, sx * w * 0.5, -h * 0.45)
          ctx.bezierCurveTo(sx * w * 0.47, h * 0.15, sx * w * 0.2, h * 0.35, 0, h * 0.05)
          ctx.fill()
        }
        break
      }
      case 'face-halo': {
        ctx.shadowColor = '#ffe066'
        ctx.shadowBlur = w * 0.12
        ctx.strokeStyle = '#ffd84d'
        ctx.lineWidth = h * 0.22
        ctx.beginPath()
        ctx.ellipse(0, Math.sin(lt * 3) * h * 0.08, w * 0.42, h * 0.3, 0, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case 'face-horns': {
        ctx.fillStyle = '#e0172b'
        for (const sx of [-1, 1]) {
          ctx.beginPath()
          ctx.moveTo(sx * w * 0.2, h * 0.5)
          ctx.quadraticCurveTo(sx * w * 0.24, -h * 0.1, sx * w * 0.44, -h * 0.5)
          ctx.quadraticCurveTo(sx * w * 0.42, h * 0.1, sx * w * 0.38, h * 0.5)
          ctx.fill()
        }
        break
      }
      case 'face-blush': {
        ctx.shadowColor = 'transparent'
        for (const sx of [-1, 1]) {
          const g = ctx.createRadialGradient(sx * w * 0.33, 0, 0, sx * w * 0.33, 0, w * 0.15)
          g.addColorStop(0, 'rgba(255,90,130,0.55)')
          g.addColorStop(1, 'rgba(255,90,130,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.ellipse(sx * w * 0.33, 0, w * 0.15, h * 0.42, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        break
      }
      case 'face-crown':
        emoji('👑', 0, 0, w * 0.8)
        break
      case 'face-cap':
        emoji('🧢', 0, 0, w * 0.8)
        break
      case 'face-nose':
        emoji('🔴', 0, 0, w * 0.75)
        break
      default:
        emoji(c.emoji ?? '😂', 0, 0, w * 0.8)
    }
  }

  private drawShape(ctx: CanvasRenderingContext2D, c: Clip, lt: number, t: number, W: number, H: number) {
    const S = (c.stickerSize ?? 0.2) * H
    const col = c.color ?? SHAPE_COLOR[c.shape!] ?? '#ffd400'
    const draw = Math.min(1, Math.max(0, lt / 0.45)) // draw-on progress
    const ink = (lw: number) => {
      ctx.lineWidth = lw
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = col
    }
    const outline = () => {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      ctx.restore()
    }
    void outline
    const pop = (d = 0.3) => {
      const p = Math.min(1, lt / d)
      return p >= 1 ? 1 : easeOutBack(p)
    }
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = S * 0.06
    ctx.shadowOffsetY = S * 0.02
    switch (c.shape) {
      case 'arrow': {
        const L = S * 1.3 * draw
        const x0 = -S * 0.65
        ink(S * 0.13)
        ctx.beginPath()
        ctx.moveTo(x0, 0)
        ctx.lineTo(x0 + L, 0)
        ctx.stroke()
        if (draw > 0.6) {
          const hx = x0 + L
          ctx.beginPath()
          ctx.moveTo(hx - S * 0.3, -S * 0.26)
          ctx.lineTo(hx + S * 0.02, 0)
          ctx.lineTo(hx - S * 0.3, S * 0.26)
          ctx.stroke()
        }
        break
      }
      case 'circle': {
        ink(S * 0.07)
        ctx.beginPath()
        const end = Math.PI * 2 * 1.08 * draw
        for (let a = 0; a <= end; a += 0.08) {
          const r = 1 + 0.04 * Math.sin(a * 3)
          const xx = Math.cos(a - 2) * S * 0.6 * r
          const yy = Math.sin(a - 2) * S * 0.45 * r
          if (a === 0) ctx.moveTo(xx, yy)
          else ctx.lineTo(xx, yy)
        }
        ctx.stroke()
        break
      }
      case 'box': {
        ink(S * 0.06)
        const w = S * 1.3
        const h = S * 0.9
        const per = 2 * (w + h)
        ctx.setLineDash([per * draw, per])
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, S * 0.08)
        ctx.stroke()
        ctx.setLineDash([])
        break
      }
      case 'underline': {
        ink(S * 0.14)
        ctx.globalAlpha *= 0.9
        ctx.beginPath()
        const w = S * 1.5 * draw
        for (let i = 0; i <= 20; i++) {
          const xx = -S * 0.75 + (w * i) / 20
          const yy = Math.sin(i * 0.9) * S * 0.02
          if (i === 0) ctx.moveTo(xx, yy)
          else ctx.lineTo(xx, yy)
        }
        ctx.stroke()
        break
      }
      case 'cross': {
        ink(S * 0.16)
        const a = Math.min(1, draw * 2)
        const b = Math.max(0, draw * 2 - 1)
        const r = S * 0.4
        ctx.beginPath()
        ctx.moveTo(-r, -r)
        ctx.lineTo(-r + 2 * r * a, -r + 2 * r * a)
        if (b > 0) {
          ctx.moveTo(r, -r)
          ctx.lineTo(r - 2 * r * b, -r + 2 * r * b)
        }
        ctx.stroke()
        break
      }
      case 'check': {
        ink(S * 0.16)
        const p1 = Math.min(1, draw * 2.5)
        const p2 = Math.max(0, (draw - 0.4) / 0.6)
        ctx.beginPath()
        ctx.moveTo(-S * 0.42, 0)
        ctx.lineTo(-S * 0.42 + S * 0.28 * p1, S * 0.28 * p1)
        if (p2 > 0) ctx.lineTo(-S * 0.14 + S * 0.58 * p2, S * 0.28 - S * 0.62 * p2)
        ctx.stroke()
        break
      }
      case 'subscribe': {
        const k = pop()
        ctx.scale(k, k)
        const done = lt > c.dur * 0.55
        const h = S * 0.56
        ctx.font = `800 ${h * 0.42}px "Inter Variable", Arial, sans-serif`
        const label = done ? 'SUBSCRIBED' : c.shapeText || 'SUBSCRIBE'
        const w = Math.max(S * 2, ctx.measureText(label).width + h * 1.9)
        // little "tap" squash when it gets clicked
        const tap = done ? Math.max(0, 1 - (lt - c.dur * 0.55) / 0.2) : 0
        ctx.scale(1 - tap * 0.08, 1 - tap * 0.08)
        ctx.fillStyle = done ? '#5b5b5b' : col
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, h / 2)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = '#fff'
        ctx.font = `800 ${h * 0.42}px "Inter Variable", Arial, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, -h * 0.32, 0)
        ctx.font = `${h * 0.55}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
        const ring = done ? Math.sin((lt - c.dur * 0.55) * 30) * 0.35 * Math.max(0, 1 - (lt - c.dur * 0.55)) : 0
        ctx.save()
        ctx.translate(w / 2 - h * 0.5, 0)
        ctx.rotate(ring)
        ctx.fillText('🔔', 0, 0)
        ctx.restore()
        break
      }
      case 'like': {
        const k = pop()
        ctx.scale(k, k)
        const w = S * 1.5
        const h = S * 0.6
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, h / 2)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `${h * 0.5}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
        const thumb = 1 + 0.25 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (lt - 0.35) / 0.4)) * Math.PI))
        ctx.save()
        ctx.translate(-w * 0.27, 0)
        ctx.scale(thumb, thumb)
        ctx.fillText('👍', 0, 0)
        ctx.restore()
        ctx.font = `800 ${h * 0.4}px "Inter Variable", Arial, sans-serif`
        ctx.fillText(c.shapeText || 'LIKE', w * 0.12, 0)
        break
      }
      case 'callout': {
        const k = pop()
        ctx.scale(k, k)
        const text = c.shapeText || 'Wait for it…'
        const fs = S * 0.28
        ctx.font = `800 ${fs}px "Inter Variable", Arial, "Noto Sans Devanagari", sans-serif`
        const w = Math.max(S * 0.9, ctx.measureText(text).width + fs * 1.4)
        const h = fs * 2
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.35)
        ctx.moveTo(-w * 0.18, h / 2 - 1)
        ctx.lineTo(-w * 0.3, h / 2 + h * 0.45)
        ctx.lineTo(-w * 0.02, h / 2 - 1)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = '#111'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, 0, 0)
        break
      }
      case 'progress': {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.shadowColor = 'transparent'
        const h = Math.max(3, H * 0.01 * ((c.stickerSize ?? 0.2) / 0.2))
        const dur = Math.max(0.01, this.duration())
        const pg = c.prog ?? { pos: 'bottom', style: 'bar' }
        const f = Math.min(1, t / dur)
        const m = pg.style === 'bar' ? 0 : Math.round(W * 0.04)
        const y0 = pg.pos === 'top' ? (pg.style === 'bar' ? 0 : H * 0.02) : pg.style === 'bar' ? H - h : H - h - H * 0.02
        const bw = W - 2 * m
        const r = pg.style === 'bar' ? 0 : h / 2
        if (pg.style === 'chapters') {
          // one segment per chapter (markers), small gaps between
          const cuts = [0, ...(getState().project.markers ?? []).filter((x) => x > 0.5 && x < dur - 0.5).sort((a, b) => a - b), dur]
          const gp = Math.max(2, h * 0.8)
          for (let i = 0; i + 1 < cuts.length; i++) {
            const a = m + (bw * cuts[i]) / dur + (i ? gp / 2 : 0)
            const b = m + (bw * cuts[i + 1]) / dur - (i + 2 < cuts.length ? gp / 2 : 0)
            ctx.fillStyle = 'rgba(255,255,255,0.3)'
            ctx.beginPath()
            ctx.roundRect(a, y0, Math.max(1, b - a), h, h / 2)
            ctx.fill()
            const fillTo = Math.min(b, m + bw * f)
            if (fillTo > a) {
              ctx.fillStyle = col
              ctx.beginPath()
              ctx.roundRect(a, y0, fillTo - a, h, h / 2)
              ctx.fill()
            }
          }
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.beginPath()
          ctx.roundRect(m, y0, bw, h, r)
          ctx.fill()
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.roundRect(m, y0, Math.max(r * 2, bw * f), h, r)
          ctx.fill()
          if (pg.style === 'round') {
            ctx.beginPath()
            ctx.arc(m + Math.max(r, bw * f), y0 + h / 2, h * 1.1, 0, Math.PI * 2)
            ctx.fillStyle = '#ffffff'
            ctx.fill()
          }
        }
        break
      }
      case 'map':
        ctx.shadowColor = 'transparent'
        drawMap(ctx, c, lt, S)
        break
      case 'face-shades':
      case 'face-hearteyes':
      case 'face-fireeyes':
      case 'face-tears':
      case 'face-mustache':
      case 'face-halo':
      case 'face-horns':
      case 'face-blush':
      case 'face-crown':
      case 'face-cap':
      case 'face-nose':
      case 'face-emoji':
        this.drawFaceSticker(ctx, c, lt, S)
        break
      case 'viz-bars':
      case 'viz-wave':
      case 'viz-circle': {
        const lv = levelsAt(t)
        const n = lv.length
        ctx.shadowColor = col
        ctx.shadowBlur = S * 0.08
        ctx.shadowOffsetY = 0
        if (c.shape === 'viz-bars') {
          const w = S * 2.4
          const bw = w / (n * 2 - 1)
          ctx.fillStyle = col
          // mirrored around the centre: low frequencies in the middle
          for (let i = 0; i < n * 2 - 1; i++) {
            const b = Math.abs(i - (n - 1))
            const v = 0.06 + lv[b] * 0.94
            const h = S * v
            ctx.beginPath()
            ctx.roundRect(-w / 2 + i * bw + bw * 0.12, -h / 2, bw * 0.76, h, bw * 0.38)
            ctx.fill()
          }
        } else if (c.shape === 'viz-wave') {
          const w = S * 2.4
          ink(S * 0.05)
          for (const dir of [1, -1]) {
            ctx.beginPath()
            for (let i = 0; i <= 64; i++) {
              const u = i / 64
              const b = Math.min(n - 1, Math.floor(Math.abs(u - 0.5) * 2 * (n - 1)))
              const env = Math.sin(u * Math.PI)
              const yy = dir * Math.sin(u * Math.PI * 6 + t * 8) * lv[b] * S * 0.42 * env
              const xx = -w / 2 + u * w
              if (i === 0) ctx.moveTo(xx, yy)
              else ctx.lineTo(xx, yy)
            }
            ctx.globalAlpha *= dir > 0 ? 1 : 0.5
            ctx.stroke()
          }
        } else {
          const r0 = S * 0.32
          ink(S * 0.035)
          const m = 48
          for (let i = 0; i < m; i++) {
            const a = (i / m) * Math.PI * 2 - Math.PI / 2
            const b = Math.min(n - 1, Math.floor((Math.abs(((i / m) * 2) % 2 - 1)) * (n - 1)))
            const L = r0 + S * 0.05 + lv[b] * S * 0.3
            ctx.beginPath()
            ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
            ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L)
            ctx.stroke()
          }
          ctx.beginPath()
          ctx.arc(0, 0, r0 * 0.92, 0, Math.PI * 2)
          ctx.globalAlpha *= 0.25
          ctx.fillStyle = col
          ctx.fill()
        }
        break
      }
    }
  }

  /* ---------- hit testing ---------- */
  hitTest(px: number, py: number): string | null {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i]
      const r = (-b.rot * Math.PI) / 180
      const dx = px - b.cx
      const dy = py - b.cy
      const lx = dx * Math.cos(r) - dy * Math.sin(r)
      const ly = dx * Math.sin(r) + dy * Math.cos(r)
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b.id
    }
    return null
  }
  getBox(id: string) {
    return this.boxes.find((b) => b.id === id) ?? null
  }

  /* ---------- importing ---------- */
  async importFile(file: File, idOverride?: string): Promise<Asset | null> {
    const url = URL.createObjectURL(file)
    const id = idOverride ?? uid('asset')
    const type = file.type
    if (type.startsWith('video/')) {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.src = url
      await new Promise<void>((res, rej) => {
        v.onloadedmetadata = () => res()
        v.onerror = () => rej(new Error('Cannot read this video'))
      })
      if (!v.videoWidth) {
        // the browser can't show the picture – usually iPhone/Samsung "High Efficiency" (HEVC) video
        let codec = ''
        try {
          const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny')
          const tr = await new Input({ source: new BlobSource(file), formats: ALL_FORMATS }).getPrimaryVideoTrack()
          codec = tr?.codec ?? ''
        } catch {}
        URL.revokeObjectURL(url)
        if (codec && codec !== 'unknown') {
          // ClipForge can convert it in the app: the import code opens the converter
          const er = new Error(`its picture format (${codec === 'hevc' ? 'HEVC / “High Efficiency”' : codec.toUpperCase()}) can’t be played by this browser`) as Error & { convertible?: boolean }
          er.convertible = true
          throw er
        }
        if (codec === 'hevc')
          throw new Error(
            'it is HEVC / “High Efficiency” video, which this browser can’t play. Fix: on iPhone set Settings → Camera → Formats → “Most Compatible” (on Samsung turn off “High efficiency video”), or open ClipForge in Chrome/Edge on Windows 11, Mac or Android – those can play HEVC',
          )
        if (v.duration > 0 && isFinite(v.duration) && !codec) throw new Error('only its sound could be read, the picture format isn’t supported by this browser')
        throw new Error(`its video format${codec ? ` (${codec.toUpperCase()})` : ''} isn’t supported by this browser`)
      }
      let dur = v.duration
      if (!isFinite(dur)) {
        v.currentTime = 1e6
        await new Promise((r) => (v.onseeked = r))
        dur = v.currentTime
      }
      v.currentTime = Math.min(0.4, dur / 2)
      await new Promise((r) => {
        v.onseeked = r
        setTimeout(r, 1500)
      })
      let thumb: string | undefined
      try {
        const cv = document.createElement('canvas')
        const s = 160 / Math.max(v.videoWidth, 1)
        cv.width = 160
        cv.height = Math.max(1, Math.round(v.videoHeight * s))
        cv.getContext('2d')!.drawImage(v, 0, 0, cv.width, cv.height)
        thumb = cv.toDataURL('image/jpeg', 0.6)
      } catch {}
      return { id, name: file.name, kind: 'video', url, duration: dur, width: v.videoWidth, height: v.videoHeight, thumb, blob: file }
    }
    if (type.startsWith('image/')) {
      const anim = await decodeAnimated(file)
      if (anim) {
        const cv = document.createElement('canvas')
        const k = 160 / Math.max(anim.w, 1)
        cv.width = 160
        cv.height = Math.max(1, Math.round(anim.h * k))
        cv.getContext('2d')!.drawImage(anim.frames[0].bmp, 0, 0, cv.width, cv.height)
        return { id, name: file.name, kind: 'image', url, duration: anim.total, width: anim.w, height: anim.h, thumb: cv.toDataURL('image/png'), blob: file, animated: true, frames: anim.frames }
      }
      const im = new Image()
      im.src = url
      await im.decode()
      return { id, name: file.name, kind: 'image', url, duration: 4, width: im.naturalWidth, height: im.naturalHeight, thumb: url, blob: file }
    }
    if (type.startsWith('audio/')) {
      let duration = 0
      let peaks: number[] | undefined
      try {
        const buf = await this.audio.decodeAudioData(await file.arrayBuffer())
        duration = buf.duration
        peaks = computePeaks(buf)
      } catch {
        const a = document.createElement('audio')
        a.src = url
        await new Promise((r) => {
          a.onloadedmetadata = r
          a.onerror = r
        })
        duration = a.duration || 0
      }
      if (!duration) return null
      return { id, name: file.name, kind: 'audio', url, duration, width: 0, height: 0, peaks, blob: file }
    }
    return null
  }

  /* ---------- export ---------- */
  static pickMime(): { mime: string; ext: string } {
    const list: [string, string][] = [
      ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1,mp4a.40.2', 'mp4'],
      ['video/mp4;codecs=avc1', 'mp4'],
      ['video/mp4', 'mp4'],
      ['video/webm;codecs=vp9,opus', 'webm'],
      ['video/webm;codecs=vp8,opus', 'webm'],
      ['video/webm', 'webm'],
    ]
    for (const [mime, ext] of list) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext }
    return { mime: '', ext: 'webm' }
  }

  cancelExport() {
    this.exportAbort = true
    this.pause()
    this.onEnded?.()
  }

  async exportVideo(onProgress: (p: number) => void): Promise<{ blob: Blob; ext: string; codec: string } | null> {
    const cv = this.canvas
    const dur = this.duration()
    if (!cv || dur <= 0) throw new Error('Nothing to export yet – add a clip to the timeline.')
    if (typeof MediaRecorder === 'undefined') throw new Error('This browser cannot record video. Use Chrome, Edge or Firefox.')
    this.pause()
    this.exportAbort = false
    this.exporting = true
    await this.audio.resume()
    this.monitor.gain.value = 0
    this.time = 0
    this.positionMedia(0)
    // wait for first frames
    const t0 = performance.now()
    while (performance.now() - t0 < 2500) {
      const ready = getState().project.clips.every((c) => {
        if (c.kind !== 'video' || c.start > 0.01) return true
        const m = this.media.get(c.id)
        return !m || m.el.readyState >= 3
      })
      if (ready) break
      await new Promise((r) => setTimeout(r, 50))
    }
    this.render()

    const stream = cv.captureStream(FPS)
    this.streamDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr))
    const { mime, ext } = Engine.pickMime()
    const px = cv.width * cv.height
    const bps = Math.round(Math.min(14e6, Math.max(4e6, (px / (1920 * 1080)) * 9e6)))
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: bps,
      audioBitsPerSecond: 192000,
    })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()))
    const off = this.onTick((t) => onProgress(Math.min(1, t / dur)))
    rec.start(250)
    const ended = new Promise<void>((r) => (this.onEnded = r))
    this.play()
    await ended
    await new Promise((r) => setTimeout(r, 350))
    try { rec.requestData() } catch {}
    if (rec.state !== 'inactive') rec.stop()
    await stopped
    off()
    stream.getTracks().forEach((tr) => tr.stop())
    this.monitor.gain.value = 1
    this.exporting = false
    this.seek(0)
    if (this.exportAbort) return null
    onProgress(1)
    const used = rec.mimeType || mime
    const v = /avc1|h264/i.test(used) ? 'H.264' : /vp9/i.test(used) ? 'VP9' : /vp8/i.test(used) ? 'VP8' : /av01/i.test(used) ? 'AV1' : 'video'
    const au = /mp4a|aac/i.test(used) ? 'AAC' : /opus/i.test(used) ? 'Opus' : ''
    const codec = au ? `${v} + ${au}` : v
    return { blob: new Blob(chunks, { type: used || 'video/webm' }), ext, codec }
  }
}

async function decodeAnimated(file: Blob) {
  const ID = (window as any).ImageDecoder
  if (!ID || !/gif|webp|png/.test(file.type)) return null
  try {
    const dec = new ID({ data: await file.arrayBuffer(), type: file.type })
    await dec.tracks.ready
    const tr = dec.tracks.selectedTrack
    if (!tr || !tr.animated || tr.frameCount < 2) return null
    const n = Math.min(tr.frameCount, 400)
    const frames: { bmp: ImageBitmap; dur: number }[] = []
    let w = 0
    let h = 0
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i })
      w = image.displayWidth
      h = image.displayHeight
      const bmp = await createImageBitmap(image)
      frames.push({ bmp, dur: Math.max(0.02, (image.duration || 100000) / 1e6) })
      image.close()
    }
    return { frames, w, h, total: frames.reduce((s, f) => s + f.dur, 0) }
  } catch {
    return null
  }
}

export const engine = new Engine()
export { SFX_LIST }

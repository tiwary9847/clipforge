import { gradePixels, isIdentity } from './grade'
import { buildEq } from './media'
import { Asset, Chroma, Clip, Filters, MaskShape, TextProps, TRACKS, TransType, Transition } from './types'
import { getAsset, getPreset, getState, projectDuration, setTimeGetter, subscribe, uid } from './store'
import { SFX_LIST } from './library'
import { computePeaks, makeSfx } from './sfx'
import { duckAt, evalProp, stabCorrection, volAt } from './anim'

export const FPS = 30

interface MediaEntry {
  el: HTMLMediaElement
  gain: GainNode
  url: string
  eq?: { input: AudioNode; set: (c: Clip) => void }
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
  }
}

function srcSize(s: CanvasImageSource): [number, number] {
  if (typeof HTMLVideoElement !== 'undefined' && s instanceof HTMLVideoElement) return [s.videoWidth, s.videoHeight]
  if (typeof HTMLImageElement !== 'undefined' && s instanceof HTMLImageElement) return [s.naturalWidth, s.naturalHeight]
  const a = s as any
  return [a.width, a.height]
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

  private sync() {
    const { project, assets } = getState()
    const keep = new Set<string>()
    for (const c of project.clips) {
      if (c.kind === 'video' || c.kind === 'audio') {
        const a = assets.find((x) => x.id === c.assetId)
        if (!a) continue
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
    const eq = buildEq(ctx, this.master)
    eq.set(c)
    node.connect(gain)
    gain.connect(eq.input)
    this.media.set(c.id, { el, gain, url: a.proxyUrl ?? a.url, eq })
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
    this.positionMedia(nt)
    this.render()
    this.emit()
    if (was) this.play()
  }

  private tick = () => {
    if (!this.playing) return
    const dur = this.duration()
    let t = this.startT + (performance.now() - this.startWall) / 1000
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

  private applyLoud() {
    if (!this.master) return
    const db = getState().project.loudDb
    const v = db ? Math.pow(10, db / 20) : 1
    if (Math.abs(this.master.gain.value - v) > 1e-3) this.master.gain.value = v
  }

  private fadeGain(c: Clip, lt: number) {
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
    const order = TRACKS.filter((x) => x.type === 'video').map((x) => x.id).reverse()
    for (const tid of order) {
      const list = project.clips
        .filter((c) => c.track === tid && t >= c.start && t < c.start + c.dur)
        .sort((a, b) => a.start - b.start)
      for (const c of list) this.drawClip(ctx, c, t, W, H, getSrc, boxes)
    }
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
    const m: Mods = { alpha: 1, ox: 0, oy: 0, sc: 1, rot: 0, hue: 0, wipe: null }
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
    } else if (c.kind === 'text' && c.text) {
      ctx.save()
      tl = this.layoutText(ctx, c.text, W, H)
      ctx.restore()
      bw = tl.w
      bh = tl.h
    } else if (c.kind === 'sticker') {
      const sz = (c.stickerSize ?? 0.2) * H
      bw = bh = sz * 1.25
    } else return

    boxes.push({ id: c.id, cx: px * W, cy: py * H, w: bw * pscale, h: bh * pscale, rot: prot })

    ctx.save()
    if (mod.wipe) {
      ctx.beginPath()
      ctx.rect(mod.wipe.x * W, 0, mod.wipe.w * W, H)
      ctx.clip()
    }
    ctx.translate((px + mod.ox) * W, (py + mod.oy) * H)
    ctx.rotate(((prot + mod.rot) * Math.PI) / 180)
    const sc = pscale * mod.sc
    ctx.scale(c.flipX ? -sc : sc, sc)
    ctx.globalAlpha = Math.max(0, Math.min(1, popa * mod.alpha))
    const f = filterString(c.filters, mod.hue, W)
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
      draw()
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
    } else if (c.kind === 'sticker') {
      ctx.font = `${(c.stickerSize ?? 0.2) * H}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(c.emoji ?? '⭐', 0, 0)
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
    const perWord = tp.hlIdx !== undefined || anim !== 'none'
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
          if (shown && alpha > 0) {
            ctx.save()
            ctx.globalAlpha *= alpha
            ctx.translate(cx + widths[k] / 2, y + dy)
            ctx.scale(sc, sc)
            if (tp.strokeW > 0) {
              ctx.lineWidth = fontPx * tp.strokeW
              ctx.strokeStyle = tp.stroke
              ctx.strokeText(shown, -widths[k] / 2, 0)
            }
            ctx.fillStyle = hot ? tp.hlColor ?? '#ffe500' : tp.color
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
        ctx.fillStyle = tp.color
        ctx.fillText(ln, x, y)
      }
      ctx.shadowColor = 'transparent'
    })
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

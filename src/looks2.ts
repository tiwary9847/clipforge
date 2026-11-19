// Per-frame picture effects: cartoon / sketch / comic looks and sky replacement.
// Everything runs on a reduced-size copy of the frame (fast enough for live preview) and is scaled back up.

const mk = (w: number, h: number, old?: HTMLCanvasElement) => {
  const c = old ?? document.createElement('canvas')
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  return c
}
const g2 = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!

const work: Record<string, HTMLCanvasElement> = {}
const W = (k: string, w: number, h: number) => (work[k] = mk(w, h, work[k]))

function srcSizeOf(s: CanvasImageSource): [number, number] {
  const a = s as any
  return [a.videoWidth || a.naturalWidth || a.displayWidth || a.width || 1, a.videoHeight || a.naturalHeight || a.displayHeight || a.height || 1]
}

/* ================= cartoon ================= */

export type CartoonStyle = 'toon' | 'sketch' | 'comic'
export const CARTOON_LIST: { id: CartoonStyle; name: string; hint: string }[] = [
  { id: 'toon', name: '🎨 Cartoon', hint: 'Flat colours with ink outlines' },
  { id: 'sketch', name: '✏️ Pencil sketch', hint: 'Black-and-white pencil drawing' },
  { id: 'comic', name: '💥 Comic book', hint: 'Bold colours, thick lines and halftone dots' },
]

/** Returns a canvas with the cartoon version of the frame (crop rect already applied). */
export function cartoonize(src: CanvasImageSource, rect: [number, number, number, number] | null, style: CartoonStyle, amt: number, maxSide = 720): HTMLCanvasElement {
  const [SW, SH] = srcSizeOf(src)
  const r = rect ?? [0, 0, SW, SH]
  const k = Math.min(1, maxSide / Math.max(r[2], r[3]))
  const w = Math.max(8, Math.round(r[2] * k))
  const h = Math.max(8, Math.round(r[3] * k))
  // base (lightly smoothed, more colourful)
  const base = W('cb', w, h)
  const bg = g2(base)
  bg.filter = style === 'sketch' ? 'none' : `blur(${(0.6 + amt * 1.2).toFixed(2)}px) saturate(${style === 'comic' ? 1.6 : 1.35}) contrast(1.08)`
  bg.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, w, h)
  bg.filter = 'none'
  const out = W('co', w, h)
  const og = g2(out)
  if (style === 'sketch') {
    // pencil: colour-dodge the grey picture with a blurred, inverted copy of itself
    const inv = W('ci', w, h)
    const ig = g2(inv)
    ig.filter = `grayscale(1) invert(1) blur(${(2 + amt * 4).toFixed(1)}px)`
    ig.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, w, h)
    ig.filter = 'none'
    const a = bg.getImageData(0, 0, w, h)
    const b = ig.getImageData(0, 0, w, h).data
    const d = a.data
    for (let i = 0; i < d.length; i += 4) {
      const gy = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
      const v = Math.min(255, (gy * 255) / (256 - b[i]))
      const p = 255 - (255 - v) * (0.9 + amt * 0.6) // darker lines with more strength
      d[i] = d[i + 1] = d[i + 2] = p < 0 ? 0 : p
    }
    og.putImageData(a, 0, 0)
    return out
  }
  const img = bg.getImageData(0, 0, w, h)
  const d = img.data
  // luminance for edges
  const Y = new Float32Array(w * h)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) Y[j] = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]
  // posterize colours (fewer levels = flatter)
  const levels = style === 'comic' ? 4 : Math.round(8 - amt * 3)
  const step = 255 / (levels - 1)
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i] / step) * step
    d[i + 1] = Math.round(d[i + 1] / step) * step
    d[i + 2] = Math.round(d[i + 2] / step) * step
  }
  // ink lines where brightness changes sharply (Sobel)
  const th = style === 'comic' ? 60 - amt * 25 : 75 - amt * 30
  const thick = style === 'comic'
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      const gx = Y[p - w + 1] + 2 * Y[p + 1] + Y[p + w + 1] - Y[p - w - 1] - 2 * Y[p - 1] - Y[p + w - 1]
      const gy = Y[p + w - 1] + 2 * Y[p + w] + Y[p + w + 1] - Y[p - w - 1] - 2 * Y[p - w] - Y[p - w + 1]
      const m = Math.hypot(gx, gy)
      if (m > th) {
        const ink = Math.min(1, (m - th) / 60)
        const i = p * 4
        d[i] *= 1 - ink
        d[i + 1] *= 1 - ink
        d[i + 2] *= 1 - ink
        if (thick) {
          const q = (p + 1) * 4
          d[q] *= 1 - ink * 0.7
          d[q + 1] *= 1 - ink * 0.7
          d[q + 2] *= 1 - ink * 0.7
        }
      }
    }
  if (style === 'comic') {
    // halftone dots in the darker areas
    const cell = Math.max(3, Math.round(w / 180))
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        if (Y[p] > 150) continue
        const cx = (x % cell) - cell / 2
        const cy = (y % cell) - cell / 2
        const rad = (1 - Y[p] / 150) * cell * 0.45
        if (cx * cx + cy * cy < rad * rad) {
          const i = p * 4
          d[i] *= 0.55
          d[i + 1] *= 0.55
          d[i + 2] *= 0.55
        }
      }
  }
  og.putImageData(img, 0, 0)
  return out
}

/* ================= sky replacement ================= */

export const SKY_LIST: { id: string; name: string }[] = [
  { id: 'blue', name: '☀️ Clear blue' },
  { id: 'clouds', name: '⛅ Blue + clouds' },
  { id: 'sunset', name: '🌇 Sunset' },
  { id: 'golden', name: '🌅 Golden hour' },
  { id: 'pink', name: '🌸 Pink dusk' },
  { id: 'night', name: '🌌 Starry night' },
  { id: 'storm', name: '⛈ Dramatic storm' },
]

const skyCache = new Map<string, HTMLCanvasElement>()
function rand(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
/** A generated sky picture (no stock photos – nothing to license). */
export function skyImage(id: string, w = 960, h = 540): HTMLCanvasElement {
  const key = `${id}|${w}x${h}`
  const hit = skyCache.get(key)
  if (hit) return hit
  const c = mk(w, h)
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, h)
  const stops: Record<string, [number, string][]> = {
    blue: [[0, '#1e63c9'], [0.6, '#5aa2ea'], [1, '#bfe0fb']],
    clouds: [[0, '#2a6fd0'], [0.7, '#7db6ef'], [1, '#d4ebfd']],
    sunset: [[0, '#2b1b5a'], [0.35, '#a33c78'], [0.7, '#f2784b'], [1, '#ffd27a']],
    golden: [[0, '#4a6fb5'], [0.45, '#f4b860'], [0.8, '#ffcf7a'], [1, '#ffe7b0']],
    pink: [[0, '#4b3a8c'], [0.5, '#d97fb3'], [1, '#ffd1dc']],
    night: [[0, '#04071a'], [0.6, '#101a44'], [1, '#2b2f6b']],
    storm: [[0, '#1f2328'], [0.5, '#4a525c'], [1, '#8c949c']],
  }
  for (const [o, col] of stops[id] ?? stops.blue) grad.addColorStop(o, col)
  g.fillStyle = grad
  g.fillRect(0, 0, w, h)
  const R = rand(id.length * 7919 + 13)
  if (id === 'night') {
    for (let i = 0; i < 420; i++) {
      g.fillStyle = `rgba(255,255,255,${0.35 + R() * 0.65})`
      const r = R() < 0.9 ? 0.7 : 1.6
      g.beginPath()
      g.arc(R() * w, R() * h * 0.9, r, 0, Math.PI * 2)
      g.fill()
    }
    const moon = g.createRadialGradient(w * 0.78, h * 0.22, 0, w * 0.78, h * 0.22, h * 0.12)
    moon.addColorStop(0, 'rgba(255,250,230,1)')
    moon.addColorStop(0.45, 'rgba(255,250,230,0.95)')
    moon.addColorStop(1, 'rgba(255,250,230,0)')
    g.fillStyle = moon
    g.fillRect(0, 0, w, h)
  }
  if (id === 'sunset' || id === 'golden') {
    const sun = g.createRadialGradient(w * 0.5, h * 0.95, 0, w * 0.5, h * 0.95, h * 0.55)
    sun.addColorStop(0, 'rgba(255,240,190,0.95)')
    sun.addColorStop(0.25, 'rgba(255,200,120,0.5)')
    sun.addColorStop(1, 'rgba(255,160,90,0)')
    g.fillStyle = sun
    g.fillRect(0, 0, w, h)
  }
  if (id === 'clouds' || id === 'storm' || id === 'sunset' || id === 'golden' || id === 'pink') {
    const n = id === 'storm' ? 70 : id === 'clouds' ? 45 : 22
    for (let i = 0; i < n; i++) {
      const cx = R() * w
      const cy = R() * h * (id === 'storm' ? 0.9 : 0.6)
      const rw = w * (0.08 + R() * 0.16)
      const col = id === 'storm' ? `rgba(${40 + R() * 40},${45 + R() * 40},${55 + R() * 40},0.55)` : id === 'clouds' ? 'rgba(255,255,255,0.55)' : 'rgba(255,220,200,0.35)'
      for (let k = 0; k < 6; k++) {
        const x = cx + (R() - 0.5) * rw
        const y = cy + (R() - 0.5) * rw * 0.25
        const r = rw * (0.25 + R() * 0.3)
        const cg = g.createRadialGradient(x, y, 0, x, y, r)
        cg.addColorStop(0, col)
        cg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'))
        g.fillStyle = cg
        g.fillRect(x - r, y - r, r * 2, r * 2)
      }
    }
  }
  skyCache.set(key, c)
  return c
}

const prevMask = new Map<string, Float32Array>()

/** Sky mask (1 = sky) at low resolution: bright, blue-ish or grey, smooth pixels connected to the top edge. */
export function skyMask(src: CanvasImageSource, rect: [number, number, number, number] | null, key: string): HTMLCanvasElement {
  const [SW, SH] = srcSizeOf(src)
  const r = rect ?? [0, 0, SW, SH]
  const w = 320
  const h = Math.max(8, Math.round((w * r[3]) / r[2]))
  const s = W('sm', w, h)
  const sg = g2(s)
  sg.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, w, h)
  const d = sg.getImageData(0, 0, w, h).data
  const n = w * h
  const Y = new Float32Array(n)
  for (let i = 0; i < n; i++) Y[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255
  const skyLike = new Uint8Array(n)
  const skyColour = new Uint8Array(n) // same test without the smoothness rule (pixels right at an edge)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const R = d[p * 4]
      const G = d[p * 4 + 1]
      const B = d[p * 4 + 2]
      const mx = Math.max(R, G, B)
      const mn = Math.min(R, G, B)
      const sat = mx ? (mx - mn) / mx : 0
      const blue = B >= R && B >= G * 0.9
      const grey = sat < 0.18
      // local texture (sky is smooth)
      const gx = x > 0 && x < w - 1 ? Math.abs(Y[p + 1] - Y[p - 1]) : 0
      const gy = y > 0 && y < h - 1 ? Math.abs(Y[p + w] - Y[p - w]) : 0
      const smooth = gx + gy < 0.07
      skyColour[p] = Y[p] > 0.42 && (blue || grey) ? 1 : 0
      skyLike[p] = skyColour[p] && smooth ? 1 : 0
    }
  // flood fill from the top edge through sky-like pixels
  const m = new Uint8Array(n)
  const q: number[] = []
  for (let x = 0; x < w; x++) if (skyLike[x]) (m[x] = 1), q.push(x)
  while (q.length) {
    const p = q.pop()!
    const x = p % w
    const y = (p / w) | 0
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]
    for (const v of nb) if (v >= 0 && !m[v] && skyLike[v]) (m[v] = 1), q.push(v)
  }
  // grow into sky-coloured pixels next to the sky (the line right at rooftops and trees)
  for (let it = 0; it < 3; it++) {
    const add: number[] = []
    for (let p = 0; p < n; p++) {
      if (m[p] || !skyColour[p]) continue
      const x = p % w
      if ((x > 0 && m[p - 1]) || (x < w - 1 && m[p + 1]) || (p >= w && m[p - w]) || (p + w < n && m[p + w])) add.push(p)
    }
    for (const p of add) m[p] = 1
  }
  // close small holes (birds, wires) with a quick dilate→erode, then smooth over time
  const f = new Float32Array(n)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s2 = 0
      let c = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          s2 += m[yy * w + xx]
          c++
        }
      f[y * w + x] = s2 / c
    }
  const prev = prevMask.get(key)
  if (prev && prev.length === n) for (let i = 0; i < n; i++) f[i] = f[i] * 0.6 + prev[i] * 0.4
  prevMask.set(key, f)
  const mc = W('smo', w, h)
  const mg = g2(mc)
  const md = mg.createImageData(w, h)
  for (let i = 0; i < n; i++) md.data[i * 4 + 3] = Math.max(0, Math.min(255, (f[i] - 0.2) * 2 * 255))
  mg.putImageData(md, 0, 0)
  return mc
}

/** Draws the new sky over the clip box (local coords, centred) using the mask. */
export function drawSky(ctx: CanvasRenderingContext2D, src: CanvasImageSource, rect: [number, number, number, number] | null, id: string, amt: number, bw: number, bh: number, key: string) {
  const mask = skyMask(src, rect, key)
  const sw = Math.min(1280, Math.round(Math.abs(bw)))
  const sh = Math.max(4, Math.round((sw * bh) / bw))
  const layer = W('sl', sw, sh)
  const lg = g2(layer)
  lg.globalCompositeOperation = 'source-over'
  lg.clearRect(0, 0, sw, sh)
  lg.drawImage(skyImage(id), 0, 0, sw, sh * 0.75) // sky sits in the upper part of the frame
  lg.drawImage(skyImage(id), 0, sh * 0.75 - 1, sw, sh * 0.25 + 1)
  lg.globalCompositeOperation = 'destination-in'
  lg.imageSmoothingEnabled = true
  lg.filter = `blur(${Math.max(0.6, sw / 700).toFixed(1)}px)`
  lg.drawImage(mask, 0, 0, sw, sh)
  lg.filter = 'none'
  ctx.save()
  ctx.globalAlpha *= amt
  ctx.drawImage(layer, -bw / 2, -bh / 2, bw, bh)
  ctx.restore()
  // tint the rest of the picture slightly towards the new light so it matches
  const tint: Record<string, string> = { sunset: 'rgba(255,120,60,0.10)', golden: 'rgba(255,180,80,0.10)', pink: 'rgba(255,120,170,0.08)', night: 'rgba(20,30,90,0.25)', storm: 'rgba(40,50,60,0.18)' }
  if (tint[id]) {
    ctx.save()
    ctx.globalAlpha *= amt
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = tint[id]
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh)
    ctx.restore()
  }
}

// Photo enhance & upscale: auto levels, low-light lift, gentle denoise, vibrance, sharpening and 2×/4× enlarging.
// All on the device; an optional AI 2× upscaler (Swin2SR) is used for small photos when chosen.
import { aiUpscale2x } from './pro'
import { addAsset, checkpoint, getAsset, getState, patchClip } from './store'
import { engine } from './engine'

export interface EnhanceOpts {
  auto: boolean // levels + low-light lift + vibrance
  denoise: number // 0..1
  sharpen: number // 0..1
  scale: 1 | 2 | 4
  ai: boolean // AI upscaler for the first 2× (small photos only)
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // separable box blur on one channel
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const d = r * 2 + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    const o = y * w
    for (let x = -r; x <= r; x++) acc += src[o + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[o + x] = acc / d
      acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / d
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** Auto levels (per channel, robust), low-light lift and a little vibrance. */
export function autoFix(d: Uint8ClampedArray) {
  const n = d.length / 4
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  let lum = 0
  for (let i = 0; i < d.length; i += 4) {
    hist[0][d[i]]++
    hist[1][d[i + 1]]++
    hist[2][d[i + 2]]++
    lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  }
  lum /= n * 255
  const pct = (h: Uint32Array, p: number) => {
    let c = 0
    for (let v = 0; v < 256; v++) {
      c += h[v]
      if (c >= n * p) return v
    }
    return 255
  }
  // shared black/white points keep colours natural; a little per-channel removes casts
  const lo = hist.map((h) => pct(h, 0.004))
  const hi = hist.map((h) => pct(h, 0.996))
  const glo = Math.min(...lo)
  const ghi = Math.max(...hi)
  const L = lo.map((v) => glo * 0.5 + v * 0.5)
  const H = hi.map((v) => ghi * 0.5 + v * 0.5)
  // dark photo → lift mid-tones (gamma) so the average lands near 45 %
  const gamma = lum < 0.38 ? Math.max(0.55, Math.log(0.45) / Math.log(Math.max(0.05, lum))) : 1
  const lut = [0, 1, 2].map((c) => {
    const t = new Uint8ClampedArray(256)
    const span = Math.max(30, H[c] - L[c])
    for (let v = 0; v < 256; v++) t[v] = clamp(255 * Math.pow(Math.min(1, Math.max(0, (v - L[c]) / span)), gamma))
    return t
  })
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[0][d[i]]
    let g = lut[1][d[i + 1]]
    let b = lut[2][d[i + 2]]
    // vibrance: boost dull colours more than already-saturated ones
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    const sat = (mx - mn) / 255
    const k = 0.18 * (1 - sat)
    const avg = (r + g + b) / 3
    r = clamp(r + (r - avg) * k)
    g = clamp(g + (g - avg) * k)
    b = clamp(b + (b - avg) * k)
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  return { lum, gamma }
}

/** Edge-aware smoothing: blends towards a blur only where neighbours are similar (noise), not across edges. */
export function denoise(d: Uint8ClampedArray, w: number, h: number, amt: number) {
  if (amt <= 0) return
  const r = 1 + Math.round(amt * 1.5)
  const sigma = 6 + amt * 22
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) ch[i] = d[i * 4 + c]
    const bl = boxBlur(ch, w, h, r)
    for (let i = 0; i < w * h; i++) {
      const diff = Math.abs(bl[i] - ch[i])
      const k = Math.exp(-diff / sigma) * Math.min(1, amt * 1.2)
      d[i * 4 + c] = clamp(ch[i] + (bl[i] - ch[i]) * k)
    }
  }
}

/** Unsharp mask on brightness (no colour fringes). */
export function sharpen(d: Uint8ClampedArray, w: number, h: number, amt: number, radius = 1) {
  if (amt <= 0) return
  const Y = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) Y[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  const bl = boxBlur(boxBlur(Y, w, h, radius), w, h, radius)
  const a = amt * 1.4
  for (let i = 0; i < w * h; i++) {
    let delta = (Y[i] - bl[i]) * a
    if (Math.abs(delta) < 2) delta = 0 // leave flat areas (and noise) alone
    d[i * 4] = clamp(d[i * 4] + delta)
    d[i * 4 + 1] = clamp(d[i * 4 + 1] + delta)
    d[i * 4 + 2] = clamp(d[i * 4 + 2] + delta)
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Enhances an image; returns a new canvas. */
export async function enhanceImage(img: CanvasImageSource & { width: number; height: number }, o: EnhanceOpts, status?: (m: string) => void): Promise<HTMLCanvasElement> {
  let W = img.width
  let H = img.height
  let cv = canvas(W, H)
  let g = cv.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0)
  let id = g.getImageData(0, 0, W, H)
  status?.('Fixing light and colour…')
  await tick()
  if (o.auto) autoFix(id.data)
  if (o.denoise > 0) denoise(id.data, W, H, o.denoise)
  g.putImageData(id, 0, 0)
  // enlarge
  let left = o.scale
  if (left >= 2 && o.ai && W * H <= 1100 * 1100) {
    status?.('Upscaling with AI…')
    const r = await aiUpscale2x(id.data, W, H, (m) => status?.(m))
    W = r.w
    H = r.h
    cv = canvas(W, H)
    g = cv.getContext('2d', { willReadFrequently: true })!
    g.putImageData(new ImageData(new Uint8ClampedArray(r.data), W, H), 0, 0)
    left /= 2
  }
  while (left >= 2) {
    status?.('Enlarging…')
    await tick()
    const next = canvas(W * 2, H * 2)
    const ng = next.getContext('2d', { willReadFrequently: true })!
    ng.imageSmoothingEnabled = true
    ng.imageSmoothingQuality = 'high'
    ng.drawImage(cv, 0, 0, W * 2, H * 2)
    cv = next
    g = ng
    W *= 2
    H *= 2
    left /= 2
  }
  if (o.sharpen > 0 || o.scale > 1) {
    status?.('Sharpening…')
    await tick()
    id = g.getImageData(0, 0, W, H)
    sharpen(id.data, W, H, Math.max(o.sharpen, o.scale > 1 ? 0.35 : 0), o.scale > 1 ? 2 : 1)
    g.putImageData(id, 0, 0)
  }
  return cv
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Enhances a photo on the timeline (or in the media list) into a new photo and swaps the clips to it. */
export async function enhanceAsset(assetId: string, o: EnhanceOpts, status?: (m: string) => void): Promise<string> {
  const a = getAsset(assetId)
  if (!a || a.kind !== 'image') throw new Error('Pick a photo first.')
  if (a.width * a.height * o.scale * o.scale > 64e6) throw new Error(`That would be ${Math.round((a.width * o.scale * a.height * o.scale) / 1e6)} MP – too big for the browser. Choose a smaller enlargement.`)
  const im = new Image()
  im.src = a.url
  await im.decode()
  const cv = await enhanceImage(im, o, status)
  status?.('Saving…')
  const png = /png$/i.test(a.name) || a.blob?.type === 'image/png'
  const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), png ? 'image/png' : 'image/jpeg', 0.93))
  const base = a.name.replace(/\.[^.]+$/, '')
  const na = await engine.importFile(new File([blob], `${base} (enhanced${o.scale > 1 ? ` ${o.scale}×` : ''}).${png ? 'png' : 'jpg'}`, { type: blob.type }))
  if (!na) throw new Error('Could not load the enhanced photo.')
  addAsset(na)
  const users = getState().project.clips.filter((c) => c.assetId === a.id)
  if (users.length) {
    checkpoint()
    for (const c of users) patchClip(c.id, { assetId: na.id, label: na.name })
  }
  engine.requestRender()
  return `Enhanced → ${na.width}×${na.height}${users.length ? `, swapped into ${users.length} clip${users.length > 1 ? 's' : ''} (Undo to go back)` : ' – added to your media'}.`
}

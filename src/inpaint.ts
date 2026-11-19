// Object eraser: fills a brushed area of a photo with matching texture from around it
// (multi-scale PatchMatch, the idea behind "content-aware fill"). No AI download needed.

type Img = { w: number; h: number; d: Float32Array } // RGB float
const P = 3 // patch radius → 7×7 patches

function toImg(d: Uint8ClampedArray, w: number, h: number): Img {
  const o = new Float32Array(w * h * 3)
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    o[j] = d[i]
    o[j + 1] = d[i + 1]
    o[j + 2] = d[i + 2]
  }
  return { w, h, d: o }
}

function down(im: Img, m: Uint8Array): [Img, Uint8Array] {
  const w = Math.max(1, im.w >> 1)
  const h = Math.max(1, im.h >> 1)
  const d = new Float32Array(w * h * 3)
  const mm = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let n = 0
      let hole = 0
      const acc = [0, 0, 0]
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(im.w - 1, x * 2 + dx)
          const sy = Math.min(im.h - 1, y * 2 + dy)
          const p = sy * im.w + sx
          if (m[p]) {
            hole++
            continue
          }
          acc[0] += im.d[p * 3]
          acc[1] += im.d[p * 3 + 1]
          acc[2] += im.d[p * 3 + 2]
          n++
        }
      const q = y * w + x
      mm[q] = hole > 0 ? 1 : 0
      if (n) for (let c = 0; c < 3; c++) d[q * 3 + c] = acc[c] / n
    }
  return [{ w, h, d }, mm]
}

/** Smooth first guess for the hole: repeatedly average known neighbours inward. */
function diffuse(im: Img, m: Uint8Array) {
  const known = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) known[i] = m[i] ? 0 : 1
  let left = m.reduce((s, v) => s + v, 0)
  for (let it = 0; it < 4000 && left > 0; it++) {
    const next: number[] = []
    for (let y = 0; y < im.h; y++)
      for (let x = 0; x < im.w; x++) {
        const p = y * im.w + x
        if (known[p]) continue
        let n = 0
        const acc = [0, 0, 0]
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= im.w || yy >= im.h) continue
          const q = yy * im.w + xx
          if (!known[q]) continue
          acc[0] += im.d[q * 3]
          acc[1] += im.d[q * 3 + 1]
          acc[2] += im.d[q * 3 + 2]
          n++
        }
        if (n) {
          for (let c = 0; c < 3; c++) im.d[p * 3 + c] = acc[c] / n
          next.push(p)
        }
      }
    for (const p of next) known[p] = 1
    left -= next.length
    if (!next.length) break
  }
}

/** One scale: EM iterations of PatchMatch search + voting, only inside the hole. */
function solve(im: Img, m: Uint8Array, iters: number, rnd: () => number) {
  const { w, h } = im
  // sources: patch centres whose whole patch is known
  const srcs: number[] = []
  for (let y = P; y < h - P; y++)
    for (let x = P; x < w - P; x++) {
      let ok = true
      for (let dy = -P; dy <= P && ok; dy++) for (let dx = -P; dx <= P; dx++) if (m[(y + dy) * w + x + dx]) { ok = false; break }
      if (ok) srcs.push(y * w + x)
    }
  if (!srcs.length) return
  const okSrc = new Uint8Array(w * h)
  for (const s of srcs) okSrc[s] = 1
  // targets: patch centres whose patch touches the hole
  const tgt: number[] = []
  const touch = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue
      for (let dy = -P; dy <= P; dy++)
        for (let dx = -P; dx <= P; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          touch[yy * w + xx] = 1
        }
    }
  for (let i = 0; i < w * h; i++) if (touch[i]) tgt.push(i)
  const nnf = new Int32Array(w * h).fill(-1)
  const dist = new Float32Array(w * h).fill(Infinity)
  const D = (t: number, s: number, best: number) => {
    const tx = t % w
    const ty = (t / w) | 0
    const sx = s % w
    const sy = (s / w) | 0
    let sum = 0
    let n = 0
    for (let dy = -P; dy <= P; dy++) {
      const yy = ty + dy
      if (yy < 0 || yy >= h) continue
      for (let dx = -P; dx <= P; dx++) {
        const xx = tx + dx
        if (xx < 0 || xx >= w) continue
        const a = (yy * w + xx) * 3
        const b = ((sy + dy) * w + sx + dx) * 3
        const e0 = im.d[a] - im.d[b]
        const e1 = im.d[a + 1] - im.d[b + 1]
        const e2 = im.d[a + 2] - im.d[b + 2]
        sum += e0 * e0 + e1 * e1 + e2 * e2
        n++
        if (sum > best * n) return Infinity
      }
    }
    return sum / Math.max(1, n)
  }
  const tryS = (t: number, s: number) => {
    if (s < 0 || !okSrc[s]) return
    const d = D(t, s, dist[t])
    if (d < dist[t]) {
      dist[t] = d
      nnf[t] = s
    }
  }
  for (const t of tgt) {
    nnf[t] = srcs[(rnd() * srcs.length) | 0]
    dist[t] = D(t, nnf[t], Infinity)
  }
  const out = new Float32Array(im.d.length)
  const wsum = new Float32Array(w * h)
  for (let em = 0; em < iters; em++) {
    // PatchMatch: propagate good matches from neighbours, then random search around the best
    for (let pass = 0; pass < 4; pass++) {
      const fwd = pass % 2 === 0
      for (let k = 0; k < tgt.length; k++) {
        const t = tgt[fwd ? k : tgt.length - 1 - k]
        const x = t % w
        const step = fwd ? -1 : 1
        if (x + step >= 0 && x + step < w && nnf[t + step] >= 0) tryS(t, nnf[t + step] - step)
        if (t + step * w >= 0 && t + step * w < w * h && nnf[t + step * w] >= 0) tryS(t, nnf[t + step * w] - step * w)
        let r = Math.max(w, h)
        const bx = nnf[t] % w
        const by = (nnf[t] / w) | 0
        while (r >= 1) {
          const sx = Math.round(bx + (rnd() * 2 - 1) * r)
          const sy = Math.round(by + (rnd() * 2 - 1) * r)
          if (sx >= 0 && sy >= 0 && sx < w && sy < h) tryS(t, sy * w + sx)
          r /= 2
        }
      }
    }
    // voting: every hole pixel = weighted average of what the overlapping patches say
    out.fill(0)
    wsum.fill(0)
    for (const t of tgt) {
      const s = nnf[t]
      if (s < 0) continue
      const wt = Math.exp(-dist[t] / 1500)
      const tx = t % w
      const ty = (t / w) | 0
      const sx = s % w
      const sy = (s / w) | 0
      for (let dy = -P; dy <= P; dy++)
        for (let dx = -P; dx <= P; dx++) {
          const xx = tx + dx
          const yy = ty + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const q = yy * w + xx
          if (!m[q]) continue
          const b = ((sy + dy) * w + sx + dx) * 3
          out[q * 3] += im.d[b] * wt
          out[q * 3 + 1] += im.d[b + 1] * wt
          out[q * 3 + 2] += im.d[b + 2] * wt
          wsum[q] += wt
        }
    }
    for (let q = 0; q < w * h; q++)
      if (m[q] && wsum[q] > 0) {
        im.d[q * 3] = out[q * 3] / wsum[q]
        im.d[q * 3 + 1] = out[q * 3 + 1] / wsum[q]
        im.d[q * 3 + 2] = out[q * 3 + 2] / wsum[q]
      }
    for (const t of tgt) dist[t] = nnf[t] >= 0 ? D(t, nnf[t], Infinity) : Infinity
  }
}

/** Fills mask (1 = remove) in an RGBA image, in place. */
export async function inpaint(data: Uint8ClampedArray, W: number, H: number, mask: Uint8Array, onProgress?: (p: number) => void) {
  // work only around the hole
  let x0 = W
  let y0 = H
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (mask[y * W + x]) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.9 + 24)
  const rx = Math.max(0, x0 - pad)
  const ry = Math.max(0, y0 - pad)
  const rw = Math.min(W, x1 + pad + 1) - rx
  const rh = Math.min(H, y1 + pad + 1) - ry
  // scale the region down if huge (keeps it to a few seconds), upscale the fill afterwards
  const k = Math.min(1, 640 / Math.max(rw, rh))
  const ww = Math.max(8, Math.round(rw * k))
  const hh = Math.max(8, Math.round(rh * k))
  const cv = document.createElement('canvas')
  cv.width = ww
  cv.height = hh
  const g = cv.getContext('2d', { willReadFrequently: true })!
  const full = new ImageData(new Uint8ClampedArray(data), W, H)
  const tmp = document.createElement('canvas')
  tmp.width = W
  tmp.height = H
  tmp.getContext('2d')!.putImageData(full, 0, 0)
  g.drawImage(tmp, rx, ry, rw, rh, 0, 0, ww, hh)
  const reg = g.getImageData(0, 0, ww, hh)
  const m0 = new Uint8Array(ww * hh)
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < ww; x++) {
      // a pixel is hole if any source pixel under it is
      const sx0 = Math.floor(rx + x / k)
      const sy0 = Math.floor(ry + y / k)
      const sx1 = Math.min(W - 1, Math.ceil(rx + (x + 1) / k))
      const sy1 = Math.min(H - 1, Math.ceil(ry + (y + 1) / k))
      let hole = 0
      for (let yy = sy0; yy <= sy1 && !hole; yy++) for (let xx = sx0; xx <= sx1; xx++) if (mask[yy * W + xx]) { hole = 1; break }
      m0[y * ww + x] = hole
    }
  // pyramid
  const ims: Img[] = [toImg(reg.data, ww, hh)]
  const ms: Uint8Array[] = [m0]
  while (ims[ims.length - 1].w > 40 && ims[ims.length - 1].h > 40 && ims.length < 6) {
    const [a, b] = down(ims[ims.length - 1], ms[ms.length - 1])
    ims.push(a)
    ms.push(b)
  }
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const L = ims.length - 1
  diffuse(ims[L], ms[L])
  for (let l = L; l >= 0; l--) {
    onProgress?.((L - l) / (L + 1))
    await new Promise((r) => setTimeout(r, 0))
    if (l < L) {
      // start this level from the finer-sampled result of the level below
      const lo = ims[l + 1]
      const im = ims[l]
      for (let y = 0; y < im.h; y++)
        for (let x = 0; x < im.w; x++) {
          const p = y * im.w + x
          if (!ms[l][p]) continue
          const q = Math.min(lo.h - 1, y >> 1) * lo.w + Math.min(lo.w - 1, x >> 1)
          im.d[p * 3] = lo.d[q * 3]
          im.d[p * 3 + 1] = lo.d[q * 3 + 1]
          im.d[p * 3 + 2] = lo.d[q * 3 + 2]
        }
    }
    solve(ims[l], ms[l], l === 0 ? 3 : 4, rnd)
  }
  // write the filled region back (only the hole, with a soft edge)
  const res = ims[0]
  const od = g.createImageData(ww, hh)
  for (let i = 0; i < ww * hh; i++) {
    od.data[i * 4] = res.d[i * 3]
    od.data[i * 4 + 1] = res.d[i * 3 + 1]
    od.data[i * 4 + 2] = res.d[i * 3 + 2]
    od.data[i * 4 + 3] = 255
  }
  g.putImageData(od, 0, 0)
  const big = document.createElement('canvas')
  big.width = rw
  big.height = rh
  const bg = big.getContext('2d', { willReadFrequently: true })!
  bg.imageSmoothingQuality = 'high'
  bg.drawImage(cv, 0, 0, rw, rh)
  const bd = bg.getImageData(0, 0, rw, rh).data
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) {
      const P2 = (ry + y) * W + rx + x
      if (!mask[P2]) continue
      const i = P2 * 4
      const j = (y * rw + x) * 4
      data[i] = bd[j]
      data[i + 1] = bd[j + 1]
      data[i + 2] = bd[j + 2]
    }
  onProgress?.(1)
}

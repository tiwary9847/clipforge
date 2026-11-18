// "Paid editor" features that run in the browser: motion tracking, smooth slow motion
// (frame blending), vocal remover, loudness normalisation, AI background removal and AI voices.
import { AudioBufferSink, AudioBufferSource, BufferTarget, CanvasSink, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio } from 'mediabunny'
import { engine } from './engine'
import { getInput, mixRange } from './media'
import { evalProp } from './anim'
import { encodeWav } from './dsp'
import { addAsset, addAssetClip, checkpoint, clipEnd, getAsset, getClip, getPreset, getState, patchClip, projectDuration, setProject } from './store'
import { Asset, Clip, Keyframe } from './types'

const tick = () => new Promise((r) => setTimeout(r, 0))

/* ================= motion tracking ================= */

/** Follows a point through a video. Returns its position (source pixels) at each requested source time. */
async function trackPoint(a: Asset, srcTimes: number[], sx0: number, sy0: number, onProgress?: (p: number) => void): Promise<{ pts: [number, number][]; lost: number }> {
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found.')
  const w = 192
  const h = Math.max(32, Math.round((w * a.height) / a.width))
  const k = w / a.width
  const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill' })
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!
  const R = 9
  const S = 14
  let tpl: Float32Array | null = null
  let px = sx0 * k
  let py = sy0 * k
  let vx = 0
  let vy = 0
  let lost = 0
  let i = 0
  const pts: [number, number][] = []
  const n = srcTimes.length
  for await (const f of sink.canvasesAtTimestamps(srcTimes)) {
    if (f) {
      g.drawImage(f.canvas as CanvasImageSource, 0, 0, w, h)
      const d = g.getImageData(0, 0, w, h).data
      const gray = new Float32Array(w * h)
      for (let q = 0; q < w * h; q++) gray[q] = d[q * 4] * 0.3 + d[q * 4 + 1] * 0.59 + d[q * 4 + 2] * 0.11
      const patch = (cx: number, cy: number) => {
        const out = new Float32Array((2 * R + 1) ** 2)
        let m = 0
        for (let y = -R, j = 0; y <= R; y++)
          for (let x = -R; x <= R; x++, j++) {
            const xx = Math.min(w - 1, Math.max(0, Math.round(cx) + x))
            const yy = Math.min(h - 1, Math.max(0, Math.round(cy) + y))
            out[j] = gray[yy * w + xx]
            m += out[j]
          }
        m /= out.length
        for (let j = 0; j < out.length; j++) out[j] -= m
        return out
      }
      if (!tpl) tpl = patch(px, py)
      else {
        const ex = px + vx
        const ey = py + vy
        let best = -2
        let bx = ex
        let by = ey
        const tn = Math.sqrt(tpl.reduce((s2, v) => s2 + v * v, 0)) || 1
        for (let dy = -S; dy <= S; dy++)
          for (let dx = -S; dx <= S; dx++) {
            const cx = Math.round(ex + dx)
            const cy = Math.round(ey + dy)
            if (cx < R || cy < R || cx >= w - R || cy >= h - R) continue
            let s2 = 0
            let n2 = 0
            let mean = 0
            for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) mean += gray[(cy + y) * w + cx + x]
            mean /= (2 * R + 1) ** 2
            for (let y = -R, j = 0; y <= R; y++)
              for (let x = -R; x <= R; x++, j++) {
                const v = gray[(cy + y) * w + cx + x] - mean
                s2 += v * tpl[j]
                n2 += v * v
              }
            const sc = s2 / (tn * (Math.sqrt(n2) || 1))
            if (sc > best) {
              best = sc
              bx = cx
              by = cy
            }
          }
        if (best > 0.5) {
          vx = (bx - px) * 0.7 + vx * 0.3
          vy = (by - py) * 0.7 + vy * 0.3
          px = bx
          py = by
          const np = patch(px, py)
          for (let j = 0; j < tpl.length; j++) tpl[j] = tpl[j] * 0.85 + np[j] * 0.15
        } else lost++
      }
    }
    pts.push([px / k, py / k])
    if (++i % 8 === 0) {
      onProgress?.(i / n)
      await tick()
    }
  }
  // light smoothing
  const sm = pts.map((p, j): [number, number] => {
    const a0 = pts[Math.max(0, j - 1)]
    const a1 = pts[Math.min(pts.length - 1, j + 1)]
    return [(a0[0] + 2 * p[0] + a1[0]) / 4, (a0[1] + 2 * p[1] + a1[1]) / 4]
  })
  return { pts: sm, lost }
}

const FPS_T = 15
const lostMsg = (lost: number, n: number, dur: number) =>
  lost > n / 3 ? 'Tracked, but it lost the target part of the way – try starting on something with more detail.' : `Tracked over ${dur.toFixed(1)}s. Clear keyframes to undo.`

/** Makes an overlay (sticker, text, image, small video) follow whatever is under it in the main video. */
export async function trackOverlay(overlayId: string, onProgress?: (p: number) => void): Promise<string> {
  const ov = getClip(overlayId)
  if (!ov) throw new Error('Select a sticker, text or overlay first.')
  if (ov.track === 'v1') throw new Error('Select an overlay (sticker, text or a clip on an overlay track), not the main video.')
  const st = getState()
  const t0 = engine.time >= ov.start && engine.time < clipEnd(ov) ? engine.time : ov.start
  const main = st.project.clips.find((c) => c.track === 'v1' && c.kind === 'video' && t0 >= c.start && t0 < clipEnd(c))
  const a = main && getAsset(main.assetId)
  if (!main || !a) throw new Error('There must be a video on the Main track under this overlay.')
  const P = getPreset()
  const W = P.w
  const H = P.h
  const fitS = (main.fit === 'cover' ? Math.max : Math.min)(W / a.width, H / a.height)
  const toSrc = (X: number, Y: number, lt: number) => {
    const s = fitS * evalProp(main, 'scale', lt)
    return [(X - evalProp(main, 'x', lt) * W) / s + a.width / 2, (Y - evalProp(main, 'y', lt) * H) / s + a.height / 2]
  }
  const toCanvas = (sx: number, sy: number, lt: number) => {
    const s = fitS * evalProp(main, 'scale', lt)
    return [evalProp(main, 'x', lt) * W + (sx - a.width / 2) * s, evalProp(main, 'y', lt) * H + (sy - a.height / 2) * s]
  }
  const [sx0, sy0] = toSrc(evalProp(ov, 'x', t0 - ov.start) * W, evalProp(ov, 'y', t0 - ov.start) * H, t0 - main.start)
  if (sx0 < 0 || sy0 < 0 || sx0 > a.width || sy0 > a.height) throw new Error('Place the overlay over the thing you want it to follow first.')
  const tEnd = Math.min(clipEnd(ov), clipEnd(main))
  const n = Math.max(2, Math.floor((tEnd - t0) * FPS_T))
  const times = Array.from({ length: n }, (_, i) => t0 + i / FPS_T)
  const r = await trackPoint(a, times.map((t) => Math.min(a.duration - 0.01, main.srcIn + (t - main.start) * main.speed)), sx0, sy0, onProgress)
  const kx: Keyframe[] = []
  const ky: Keyframe[] = []
  r.pts.forEach(([sx, sy], i) => {
    const [cx, cy] = toCanvas(sx, sy, times[i] - main.start)
    kx.push({ t: +(times[i] - ov.start).toFixed(3), v: +(cx / W).toFixed(4) })
    ky.push({ t: +(times[i] - ov.start).toFixed(3), v: +(cy / H).toFixed(4) })
  })
  checkpoint()
  patchClip(overlayId, { kf: { ...ov.kf, x: kx, y: ky } })
  return lostMsg(r.lost, n, tEnd - t0) + ' The overlay now follows it.'
}

/** Makes a clip's own mask (blur / pixelate / spotlight / shape) follow what is under it – e.g. blur a face. */
export async function trackMask(clipId: string, onProgress?: (p: number) => void): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Mask tracking works on video clips.')
  if (!c.mask || c.mask.shape === 'none') throw new Error('Pick a mask shape first and place it on the face or object.')
  const t0 = engine.time >= c.start && engine.time < clipEnd(c) ? engine.time : c.start
  const cl = c.crop?.l ?? 0
  const ct = c.crop?.t ?? 0
  const fw = 1 - cl - (c.crop?.r ?? 0)
  const fh = 1 - ct - (c.crop?.b ?? 0)
  const lt0 = t0 - c.start
  const sx0 = (cl + (evalProp(c, 'mx', lt0) + 0.5) * fw) * a.width
  const sy0 = (ct + (evalProp(c, 'my', lt0) + 0.5) * fh) * a.height
  const n = Math.max(2, Math.floor((clipEnd(c) - t0) * FPS_T))
  const times = Array.from({ length: n }, (_, i) => t0 + i / FPS_T)
  const r = await trackPoint(a, times.map((t) => Math.min(a.duration - 0.01, c.srcIn + (t - c.start) * c.speed)), sx0, sy0, onProgress)
  const kx: Keyframe[] = []
  const ky: Keyframe[] = []
  r.pts.forEach(([sx, sy], i) => {
    kx.push({ t: +(times[i] - c.start).toFixed(3), v: +((sx / a.width - cl) / fw - 0.5).toFixed(4) })
    ky.push({ t: +(times[i] - c.start).toFixed(3), v: +((sy / a.height - ct) / fh - 0.5).toFixed(4) })
  })
  checkpoint()
  patchClip(clipId, { kf: { ...c.kf, mx: kx, my: ky } })
  return lostMsg(r.lost, n, clipEnd(c) - t0) + ' The mask now follows it.'
}

/* ================= shared encoder for rebuilt clips ================= */

async function stereoRange(a: Asset, from: number, to: number, rate = 1): Promise<AudioBuffer | null> {
  const t = await getInput(a).getPrimaryAudioTrack()
  if (!t) return null
  const sr = 48000
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(((to - from) / rate) * sr)), sr)
  for await (const w of new AudioBufferSink(t).buffers(from, to)) {
    const s = ctx.createBufferSource()
    s.buffer = w.buffer
    s.playbackRate.value = rate
    s.connect(ctx.destination)
    s.start(Math.max(0, (w.timestamp - from) / rate), Math.max(0, from - w.timestamp))
  }
  return ctx.startRendering()
}

async function makeWriter(W: number, H: number, audio: AudioBuffer | null) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const target = new BufferTarget()
  const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const vsrc = new CanvasSource(canvas, { codec: 'avc', quality: QUALITY_HIGH })
  out.addVideoTrack(vsrc, { frameRate: 30 })
  let asrc: AudioBufferSource | null = null
  if (audio) {
    const o = { numberOfChannels: 2, sampleRate: 48000 }
    const codec = (await canEncodeAudio('aac', o)) ? 'aac' : (await canEncodeAudio('opus', o)) ? 'opus' : null
    if (codec) {
      asrc = new AudioBufferSource({ codec, bitrate: 192_000 })
      out.addAudioTrack(asrc)
    }
  }
  await out.start()
  return {
    canvas,
    ctx,
    add: (ts: number, dur: number) => vsrc.add(ts, dur),
    async finish(name: string): Promise<Asset> {
      vsrc.close()
      if (asrc && audio) {
        await asrc.add(audio)
        asrc.close()
      }
      await out.finalize()
      if (!target.buffer) throw new Error('The encoder produced no data.')
      const na = await engine.importFile(new File([target.buffer], name, { type: 'video/mp4' }))
      if (!na) throw new Error('Could not load the new clip.')
      addAsset(na)
      return na
    },
  }
}

const sizeFor = (a: Asset) => {
  const k = Math.min(1, 1920 / Math.max(a.width, a.height))
  return [Math.max(2, Math.round((a.width * k) / 2) * 2), Math.max(2, Math.round((a.height * k) / 2) * 2)]
}
const base = (a: Asset) => a.name.replace(/\.[^.]+$/, '')

/* ================= smooth slow motion (frame blending) ================= */

export async function smoothSlowMo(clipId: string, onProgress?: (p: number) => void): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Select a video clip first.')
  if (c.speed >= 0.99) throw new Error('Set the clip speed below 1× first (e.g. 0.5×), then smooth it.')
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found.')
  const [W, H] = sizeFor(a)
  const audio = await stereoRange(a, from, to, c.speed)
  const wr = await makeWriter(W, H, audio)
  const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill' })
  const outDur = c.dur
  const nOut = Math.max(1, Math.round(outDur * 30))
  let k = 0
  let prev: { bmp: ImageBitmap; ts: number } | null = null
  const emit = async (A: ImageBitmap, B: ImageBitmap | null, wgt: number) => {
    wr.ctx.globalAlpha = 1
    wr.ctx.drawImage(A, 0, 0, W, H)
    if (B && wgt > 0.02) {
      wr.ctx.globalAlpha = wgt
      wr.ctx.drawImage(B, 0, 0, W, H)
      wr.ctx.globalAlpha = 1
    }
    await wr.add(k / 30, 1 / 30)
    k++
  }
  for await (const f of sink.canvases(Math.max(0, from - 0.1), to + 0.1)) {
    const cur = { bmp: await createImageBitmap(f.canvas as HTMLCanvasElement), ts: f.timestamp }
    if (prev) {
      while (k < nOut) {
        const s = from + (k / 30) * c.speed
        if (s >= cur.ts) break
        const span = cur.ts - prev.ts || 1
        await emit(prev.bmp, cur.bmp, Math.max(0, Math.min(1, (s - prev.ts) / span)))
      }
      prev.bmp.close()
    }
    prev = cur
    if (k % 15 === 0) {
      onProgress?.(k / nOut)
      await tick()
    }
    if (k >= nOut) break
  }
  while (prev && k < nOut) await emit(prev.bmp, null, 0)
  prev?.bmp.close()
  const na = await wr.finish(`${base(a)} (smooth slow-mo).mp4`)
  checkpoint()
  patchClip(clipId, { assetId: na.id, srcIn: 0, speed: 1, stab: undefined, label: `${c.label} (smooth)` })
  return 'Slow motion smoothed – in-between frames are blended so it no longer stutters.'
}

/* ================= vocal remover (karaoke) ================= */

export async function removeVocals(clipId: string): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'audio' && c.kind !== 'video')) throw new Error('Select a music or video clip.')
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  const buf = await stereoRange(a, from, to)
  if (!buf) throw new Error('This clip has no audio.')
  const L = buf.getChannelData(0)
  const Rr = buf.getChannelData(1)
  let side = 0
  let mid = 0
  for (let i = 0; i < L.length; i += 7) {
    side += Math.abs(L[i] - Rr[i])
    mid += Math.abs(L[i] + Rr[i])
  }
  if (side < mid * 0.02) throw new Error('This audio is mono (both sides identical), so vocals can’t be separated this way.')
  const out = new Float32Array(L.length)
  const k = 1 - Math.exp((-2 * Math.PI * 160) / 48000) // keep bass from the centre
  let lp = 0
  for (let i = 0; i < L.length; i++) {
    lp += k * ((L[i] + Rr[i]) * 0.5 - lp)
    out[i] = (L[i] - Rr[i]) * 0.7 + lp
  }
  const na = await engine.importFile(new File([encodeWav(out, 48000)], `${base(a)} (no vocals).wav`, { type: 'audio/wav' }))
  if (!na) throw new Error('Could not create the new audio.')
  addAsset(na)
  checkpoint()
  if (c.kind === 'audio') patchClip(c.id, { assetId: na.id, srcIn: 0, speed: 1, label: `${c.label} (no vocals)` })
  else {
    patchClip(c.id, { volume: 0 })
    const nc = addAssetClip(na.id, 'a2', c.start)
    if (nc) patchClip(nc.id, { start: c.start, dur: c.dur, label: 'No vocals' })
  }
  return 'Vocals reduced (karaoke style). Works best on studio songs where the singer is in the centre.'
}

/* ================= loudness ================= */

/** Approximate integrated loudness (LUFS) of the whole mix, with BS.1770-style gating. */
export async function measureLoudness(): Promise<number | null> {
  const st = getState()
  const keep = st.project.loudDb
  setProject({ loudDb: 0 })
  try {
    const dur = projectDuration()
    // K-weighting biquads (BS.1770 at 48 kHz); filter state carries across chunks
    const K1 = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [-1.69065929318241, 0.73248077421585] }
    const K2 = { b: [1, -2, 1], a: [-1.99004745483398, 0.99007225036621] }
    const state = [0, 1].map(() => [{ x1: 0, x2: 0, y1: 0, y2: 0 }, { x1: 0, x2: 0, y1: 0, y2: 0 }])
    const run = (f: typeof K1, s0: { x1: number; x2: number; y1: number; y2: number }, inp: Float32Array) => {
      const out = new Float32Array(inp.length)
      for (let i = 0; i < inp.length; i++) {
        const v = f.b[0] * inp[i] + f.b[1] * s0.x1 + f.b[2] * s0.x2 - f.a[0] * s0.y1 - f.a[1] * s0.y2
        s0.x2 = s0.x1; s0.x1 = inp[i]; s0.y2 = s0.y1; s0.y1 = v
        out[i] = v
      }
      return out
    }
    const sr = 48000
    const blk = Math.round(0.4 * sr)
    const hop = Math.round(0.1 * sr)
    const ms: number[] = []
    let tail: Float32Array[] = [new Float32Array(0), new Float32Array(0)]
    let heard = false
    for (let t0 = 0; t0 < dur; t0 += 30) {
      const t1 = Math.min(dur, t0 + 30)
      const buf = await mixRange(st.project.clips, getAsset, t0, t1)
      const n = Math.max(1, Math.round((t1 - t0) * sr))
      const k = [0, 1].map((c) => {
        const d = buf ? buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)) : new Float32Array(n)
        if (buf) heard = true
        return run(K2, state[c][1], run(K1, state[c][0], d))
      })
      // join with the unprocessed tail of the previous chunk so blocks span chunk edges
      const joined = k.map((x, c) => {
        const j = new Float32Array(tail[c].length + x.length)
        j.set(tail[c])
        j.set(x, tail[c].length)
        return j
      })
      let s = 0
      for (; s + blk <= joined[0].length; s += hop) {
        let e = 0
        for (let c = 0; c < 2; c++) for (let i = s; i < s + blk; i++) e += joined[c][i] * joined[c][i]
        ms.push(e / blk)
      }
      tail = joined.map((j) => j.slice(s))
      await new Promise((r) => setTimeout(r, 0))
    }
    if (!heard) return null
    const lufs = (m: number) => -0.691 + 10 * Math.log10(m || 1e-12)
    let g = ms.filter((m) => lufs(m) > -70)
    if (!g.length) return null
    const rel = lufs(g.reduce((s2, v) => s2 + v, 0) / g.length) - 10
    g = g.filter((m) => lufs(m) > rel)
    return lufs(g.reduce((s2, v) => s2 + v, 0) / g.length)
  } finally {
    setProject({ loudDb: keep })
  }
}

export async function normaliseLoudness(target: number): Promise<string> {
  const l = await measureLoudness()
  if (l === null) throw new Error('The project has no sound to measure.')
  const db = Math.max(-20, Math.min(20, target - l))
  checkpoint()
  setProject({ loudDb: +db.toFixed(2) })
  return `Measured ${l.toFixed(1)} LUFS → set to ${target} LUFS (${db >= 0 ? '+' : ''}${db.toFixed(1)} dB, with a peak limiter).`
}

/* ================= AI worker (transformers.js, downloaded on first use) ================= */

const AI_WORKER = `
import { pipeline, env, AutoModel, AutoProcessor, RawImage } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
env.allowLocalModels = false;
let seg = null, tts = {}, kokoro = null;
const prog = (p) => { if (p && p.status === 'progress') self.postMessage({ type: 'progress', p: p.progress }) };
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.task === 'seg') {
      if (!seg) {
        self.postMessage({ type: 'status', msg: 'Downloading background-removal model (first time only)…' });
        const model = await AutoModel.from_pretrained('Xenova/modnet', { progress_callback: prog });
        const processor = await AutoProcessor.from_pretrained('Xenova/modnet');
        seg = { model, processor };
      }
      const img = new RawImage(m.data, m.w, m.h, 4);
      const { pixel_values } = await seg.processor(img);
      const { output } = await seg.model({ input: pixel_values });
      const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(m.w, m.h);
      self.postMessage({ type: 'mask', id: m.id, mask: mask.data }, [mask.data.buffer]);
    } else if (m.task === 'tts') {
      self.postMessage({ type: 'status', msg: 'Loading voice (first time downloads it)…' });
      let audio, sr;
      if (m.engine === 'kokoro') {
        if (!kokoro) {
          const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1/+esm');
          kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm', progress_callback: prog });
        }
        self.postMessage({ type: 'status', msg: 'Speaking…' });
        const out = await kokoro.generate(m.text, { voice: m.voice });
        audio = out.audio; sr = out.sampling_rate;
      } else {
        if (!tts[m.model]) tts[m.model] = await pipeline('text-to-speech', m.model, { progress_callback: prog });
        self.postMessage({ type: 'status', msg: 'Speaking…' });
        const out = await tts[m.model](m.text);
        audio = out.audio; sr = out.sampling_rate;
      }
      self.postMessage({ type: 'audio', audio, sr }, [audio.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
`

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) worker = new Worker(URL.createObjectURL(new Blob([AI_WORKER], { type: 'text/javascript' })), { type: 'module' })
  return worker
}
type Status = (msg: string, pct?: number) => void

function ask<T>(msg: Record<string, unknown>, want: string, status?: Status, transfer: Transferable[] = []): Promise<T> {
  const w = getWorker()
  return new Promise((resolve, reject) => {
    const on = (e: MessageEvent) => {
      const m = e.data
      if (m.type === 'status') status?.(m.msg)
      else if (m.type === 'progress') status?.('Downloading model (first time only)…', m.p)
      else if (m.type === want && (m.id === undefined || m.id === msg.id)) {
        w.removeEventListener('message', on)
        resolve(m as T)
      } else if (m.type === 'error') {
        w.removeEventListener('message', on)
        reject(new Error(m.message))
      }
    }
    w.addEventListener('message', on)
    w.onerror = (e) => reject(new Error(e.message || 'The AI helper couldn’t start – are you online?'))
    w.postMessage(msg, transfer)
  })
}

/* ---------- AI voices ---------- */

export const VOICES = [
  { id: 'kokoro:af_heart', name: 'English · Heart (female, US)', commercial: true },
  { id: 'kokoro:af_bella', name: 'English · Bella (female, US)', commercial: true },
  { id: 'kokoro:am_michael', name: 'English · Michael (male, US)', commercial: true },
  { id: 'kokoro:bf_emma', name: 'English · Emma (female, UK)', commercial: true },
  { id: 'kokoro:bm_george', name: 'English · George (male, UK)', commercial: true },
  { id: 'mms:Xenova/mms-tts-hin', name: 'हिन्दी · Hindi (non-commercial licence)', commercial: false },
  { id: 'mms:Xenova/mms-tts-eng', name: 'English · MMS (non-commercial licence)', commercial: false },
]

export async function speak(text: string, voice: string, status: Status): Promise<string> {
  const t = text.trim()
  if (!t) throw new Error('Type something to say.')
  const mock = (window as any).__cfMockTts as undefined | ((t: string) => { audio: Float32Array; sr: number })
  let res: { audio: Float32Array; sr: number }
  if (mock) res = mock(t)
  else {
    const [eng, id] = voice.split(':')
    res = await ask<{ audio: Float32Array; sr: number }>(eng === 'kokoro' ? { task: 'tts', engine: 'kokoro', voice: id, text: t } : { task: 'tts', engine: 'mms', model: id, text: t }, 'audio', status)
  }
  const na = await engine.importFile(new File([encodeWav(res.audio, res.sr)], `Voice – ${t.slice(0, 24)}.wav`, { type: 'audio/wav' }))
  if (!na) throw new Error('Could not load the generated voice.')
  addAsset(na)
  addAssetClip(na.id, 'a1', Math.max(0, engine.time))
  return `Voice added at the playhead (${na.duration.toFixed(1)}s).`
}

/* ---------- AI background removal ---------- */

export async function removeBackground(clipId: string, status: Status, signal: { cancelled: boolean }, mode: 'remove' | 'blur' = 'remove'): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'video' && c.kind !== 'image')) throw new Error('Select a video or photo clip.')
  const mock = (window as any).__cfMockSeg as undefined | ((d: Uint8ClampedArray, w: number, h: number) => Uint8Array)
  const SW = 384
  const sh = Math.max(16, Math.round((SW * a.height) / a.width))
  const scv = document.createElement('canvas')
  scv.width = SW
  scv.height = sh
  const sg = scv.getContext('2d', { willReadFrequently: true })!
  const mcv = document.createElement('canvas')
  mcv.width = SW
  mcv.height = sh
  const mg = mcv.getContext('2d')!
  let reqId = 0
  const maskOf = async (img: CanvasImageSource): Promise<HTMLCanvasElement> => {
    sg.drawImage(img, 0, 0, SW, sh)
    const d = sg.getImageData(0, 0, SW, sh)
    const m = mock ? mock(d.data, SW, sh) : (await ask<{ mask: Uint8Array }>({ task: 'seg', id: ++reqId, data: d.data, w: SW, h: sh }, 'mask', status, [d.data.buffer])).mask
    const md = mg.createImageData(SW, sh)
    for (let i = 0; i < m.length; i++) {
      md.data[i * 4 + 3] = m[i]
    }
    mg.putImageData(md, 0, 0)
    return mcv
  }
  const [W, H] = sizeFor(a)
  const tmp = document.createElement('canvas')
  tmp.width = W
  tmp.height = H
  const tg = tmp.getContext('2d')!
  const composite = (dst: CanvasRenderingContext2D, frame: CanvasImageSource, mask: HTMLCanvasElement) => {
    tg.globalCompositeOperation = 'source-over'
    tg.clearRect(0, 0, W, H)
    tg.drawImage(frame, 0, 0, W, H)
    tg.globalCompositeOperation = 'destination-in'
    tg.drawImage(mask, 0, 0, W, H)
    if (mode === 'blur') {
      // portrait mode: soft background, sharp person
      dst.save()
      dst.filter = `blur(${Math.max(6, Math.round(Math.max(W, H) / 70))}px)`
      dst.drawImage(frame, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06)
      dst.restore()
    } else {
      dst.fillStyle = '#00ff00'
      dst.fillRect(0, 0, W, H)
    }
    dst.drawImage(tmp, 0, 0)
  }
  const KEY = { on: true, color: '#00ff00', sim: 0.25, smooth: 0.08, spill: 0.4 }

  if (a.kind === 'image') {
    status('Removing background…')
    const img = await createImageBitmap(a.blob ?? (await (await fetch(a.url)).blob()))
    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const og = out.getContext('2d')!
    if (mode === 'blur') {
      composite(og, img, await maskOf(img))
    } else {
      // images keep real transparency (PNG), no green needed
      og.drawImage(img, 0, 0, W, H)
      og.globalCompositeOperation = 'destination-in'
      og.drawImage(await maskOf(img), 0, 0, W, H)
    }
    const type = mode === 'blur' ? 'image/jpeg' : 'image/png'
    const blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), type, 0.92))
    const na = await engine.importFile(new File([blob], `${base(a)} (${mode === 'blur' ? 'portrait' : 'cut out'}).${mode === 'blur' ? 'jpg' : 'png'}`, { type }))
    if (!na) throw new Error('Could not load the cut-out image.')
    addAsset(na)
    checkpoint()
    patchClip(c.id, { assetId: na.id, label: `${c.label} (${mode === 'blur' ? 'portrait' : 'cut out'})` })
    return mode === 'blur' ? 'Background blurred.' : 'Background removed.'
  }

  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found.')
  const audio = await stereoRange(a, from, to)
  const wr = await makeWriter(W, H, audio)
  const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill' })
  let lastMaskT = -1
  let mask: HTMLCanvasElement | null = null
  let n = 0
  const total = to - from
  for await (const f of sink.canvases(from, to)) {
    if (signal.cancelled) throw new Error('Cancelled')
    if (!mask || f.timestamp - lastMaskT >= 1 / 12) {
      mask = await maskOf(f.canvas as HTMLCanvasElement)
      lastMaskT = f.timestamp
    }
    composite(wr.ctx, f.canvas as HTMLCanvasElement, mask)
    await wr.add(Math.max(0, f.timestamp - from), f.duration)
    if (++n % 5 === 0) {
      status(`${mode === 'blur' ? 'Blurring' : 'Removing'} background… ${Math.round(((f.timestamp - from) / total) * 100)}%`, (f.timestamp - from) / total)
      await tick()
    }
  }
  const na = await wr.finish(`${base(a)} (${mode === 'blur' ? 'portrait' : 'no background'}).mp4`)
  checkpoint()
  if (mode === 'blur') {
    patchClip(c.id, { assetId: na.id, srcIn: 0, label: `${c.label} (portrait)` })
    return 'Background blurred – you stay sharp, the background is soft like portrait mode.'
  }
  patchClip(c.id, { assetId: na.id, srcIn: 0, chroma: KEY, label: `${c.label} (no background)` })
  return 'Background removed. Put a new background (video, photo or colour) on the Main track under it, with this clip on an overlay track.'
}

export type { Clip }

// Extra creator tools: Hinglish captions, auto-reframe, beat zoom, hook finder,
// backup/restore, brand kit, thumbnail rendering.
import { CanvasSink } from 'mediabunny'
import { engine } from './engine'
import { getInput } from './media'
import { analyze } from './autoedit'
import { decodeMonoRange } from './processing'
import { detectBeats } from './dsp'
import { addAsset, addAssetClip, baseClip, checkpoint, getAsset, getClip, getPreset, getState, loadProject, patchClip, replaceTimeline, setAssets } from './store'
import { Asset, Clip, Keyframe } from './types'

/* ---------- Devanagari → Roman (Hinglish) ---------- */

const CONS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ng', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'f', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v',
  श: 'sh', ष: 'sh', स: 's', ह: 'h', ळ: 'l', '\u0958': 'q', '\u0959': 'kh', '\u095A': 'g', '\u095B': 'z', '\u095C': 'r', '\u095D': 'rh', '\u095E': 'f',
}
const VOWELS: Record<string, string> = { अ: 'a', आ: 'aa', इ: 'i', ई: 'ee', उ: 'u', ऊ: 'oo', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o' }
const MATRAS: Record<string, string> = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' }
const DIGITS = '०१२३४५६७८९'

/** Roman-letter Hindi ("Hinglish") from Devanagari text. Words already in Latin letters pass through unchanged. */
export function devanagariToRoman(text: string): string {
  return text.replace(/[ऀ-ॿ]+/g, (w) => {
    // normalise nukta forms (base + ़) into single consonants where we have them
    w = w.replace(/([कखगजडढफ])़/g, (_, c) => ({ क: '\u0958', ख: '\u0959', ग: '\u095A', ज: '\u095B', ड: '\u095C', ढ: '\u095D', फ: '\u095E' } as Record<string, string>)[c])
    let out = ''
    const ch = [...w]
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]
      if (CONS[c] !== undefined) {
        let r = CONS[c]
        // क्ष, त्र, ज्ञ conjuncts
        if (c === 'क' && ch[i + 1] === '्' && ch[i + 2] === 'ष') { r = 'ksh'; i += 2 }
        else if (c === 'ज' && ch[i + 1] === '्' && ch[i + 2] === 'ञ') { r = 'gy'; i += 2 }
        const n = ch[i + 1]
        if (n === '्') { out += r; i++ } // conjunct: no vowel
        else if (n && MATRAS[n]) { out += r + MATRAS[n]; i++ }
        else {
          // inherent "a" – dropped at the end of a word (कमल → kamal)
          const last = i === ch.length - 1 || ch[i + 1] === 'ं' || ch[i + 1] === 'ँ' || ch[i + 1] === 'ः'
          out += last && i > 0 ? r : r + 'a'
        }
      } else if (VOWELS[c]) out += VOWELS[c]
      else if (c === 'ं' || c === 'ँ') out += 'n'
      else if (c === 'ः') out += 'h'
      else if (c === '।') out += '.'
      else if (DIGITS.includes(c)) out += DIGITS.indexOf(c)
      else if (c === '्' || c === '़') continue
      else out += c
    }
    return out.replace(/aa(?=$)/, 'a').replace(/ee$/, 'i').replace(/oo$/, 'u')
  })
}

const EMOJI_WORDS: Record<string, string> = {
  fire: '🔥', love: '❤️', pyaar: '❤️', pyar: '❤️', dil: '❤️', money: '💰', paisa: '💰', paise: '💰', rupee: '💰', food: '🍽️', khana: '🍽️', chai: '☕', coffee: '☕',
  funny: '😂', haha: '😂', lol: '😂', hasna: '😂', mazaak: '😂', wow: '😮', omg: '😱', shock: '😱', sad: '😢', ro: '😢', cry: '😭', gussa: '😡', angry: '😡',
  party: '🎉', celebrate: '🎉', congratulations: '🎉', win: '🏆', winner: '🏆', jeet: '🏆', gym: '💪', strong: '💪', ghar: '🏠', home: '🏠', car: '🚗', gaadi: '🚗',
  phone: '📱', time: '⏰', waqt: '⏰', samay: '⏰', sleep: '😴', neend: '😴', happy: '😄', khush: '😄', best: '🔥', amazing: '🤩', zabardast: '🤩', mast: '😎', cool: '😎',
  india: '🇮🇳', bharat: '🇮🇳', god: '🙏', bhagwan: '🙏', thanks: '🙏', dhanyavad: '🙏', shukriya: '🙏', subscribe: '🔔', follow: '🔔', like: '👍', share: '📤',
  baby: '👶', beta: '👶', mom: '👩', maa: '👩', papa: '👨', dad: '👨', friend: '🤝', dost: '🤝', shaadi: '💍', wedding: '💍', gift: '🎁', tohfa: '🎁',
  secret: '🤫', raaz: '🤫', idea: '💡', sach: '💯', truth: '💯', hundred: '💯', bahut: '‼️', danger: '⚠️', khatra: '⚠️',
}
export const emojiFor = (word: string): string => EMOJI_WORDS[word.toLowerCase().replace(/[^a-z]/g, '')] ?? ''

/* ---------- auto-reframe ---------- */

export async function autoReframe(clipId: string, onProgress?: (p: number) => void): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Select a video clip first.')
  const preset = getPreset()
  const canvasAspect = preset.w / preset.h
  const ratio = (c.scale * (a.width / a.height)) / canvasAspect
  if (ratio <= 1.08) throw new Error('This clip already fills the frame. Auto-reframe is for wide (16:9) clips in a vertical format – pick Shorts / Reels at the top first.')
  const track = await getInput(a).getPrimaryVideoTrack()
  if (!track) throw new Error('No video track found.')
  const w = 64
  const h = Math.max(16, Math.round((w * a.height) / a.width))
  const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill' })
  const SR = 6
  const from = c.srcIn
  const to = c.srcIn + c.dur * c.speed
  const n = Math.max(2, Math.floor((to - from) * SR))
  const ts = Array.from({ length: n }, (_, i) => Math.min(a.duration - 0.01, from + i / SR))
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d', { willReadFrequently: true })!
  let prev: Uint8Array | null = null
  const subj: number[] = []
  let cur = -1
  let i = 0
  for await (const f of sink.canvasesAtTimestamps(ts)) {
    if (f) {
      g.drawImage(f.canvas as CanvasImageSource, 0, 0, w, h)
      const d = g.getImageData(0, 0, w, h).data
      const gray = new Uint8Array(w * h)
      for (let k = 0; k < w * h; k++) gray[k] = (d[k * 4] * 77 + d[k * 4 + 1] * 150 + d[k * 4 + 2] * 29) >> 8
      if (prev) {
        let sx = 0
        let tot = 0
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const diff = Math.abs(gray[y * w + x] - prev[y * w + x])
            if (diff > 14) {
              sx += x * diff
              tot += diff
            }
          }
        if (tot > w * h * 0.15) {
          const m = sx / tot / (w - 1)
          cur = cur < 0 ? m : cur * 0.2 + m * 0.8
        }
      }
      prev = gray
    }
    subj.push(cur)
    if (++i % 10 === 0) {
      onProgress?.(i / n)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  const firstOk = subj.find((v) => v >= 0) ?? 0.5
  for (let k = 0; k < subj.length; k++) if (subj[k] < 0) subj[k] = subj.slice(k).find((v) => v >= 0) ?? firstOk
  const half = (ratio - 1) / 2
  const xs = (s: number) => Math.min(0.5 + half, Math.max(0.5 - half, 0.5 - (s - 0.5) * ratio))
  const kf: Keyframe[] = []
  let last = NaN
  subj.forEach((s, k) => {
    const v = xs(s)
    if (!kf.length || Math.abs(v - last) > 0.03 || k === subj.length - 1) {
      kf.push({ t: +(k / SR / c.speed).toFixed(3), v })
      last = v
    }
  })
  if (kf.length < 2) kf.push({ t: +(c.dur).toFixed(3), v: kf[0].v })
  checkpoint()
  patchClip(clipId, { fit: 'cover', kf: { ...c.kf, x: kf } })
  return `Reframed – ${kf.length} camera moves keep the action in the vertical frame. Tweak or delete the X keyframes in the Inspector.`
}

/* ---------- beat zoom ---------- */

export async function beatZoom(clipId: string, intensity: number): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || (c.kind !== 'video' && c.kind !== 'image')) throw new Error('Select a video or photo clip first.')
  let beats: number[] = []
  const bt = getState().project.markers.filter((m) => m >= c.start && m < c.start + c.dur).map((m) => m - c.start)
  if (bt.length >= 3) beats = bt
  else {
    // use the clip's own audio, or the music track under it
    const music = getState().project.clips.find((x) => x.kind === 'audio' && x.start < c.start + c.dur && x.start + x.dur > c.start)
    const src = c.kind === 'video' && a.kind === 'video' ? { asset: a, from: c.srcIn, to: c.srcIn + c.dur * c.speed, sp: c.speed } : music ? { asset: getAsset(music.assetId)!, from: music.srcIn + (c.start - music.start) * music.speed, to: music.srcIn + (c.start + c.dur - music.start) * music.speed, sp: music.speed } : null
    if (!src) throw new Error('No audio to follow. Add music first, or press “Beats → markers” in the Audio tools.')
    const x = await decodeMonoRange(src.asset, Math.max(0, src.from), src.to, 22050)
    if (!x) throw new Error('No audio to follow.')
    beats = detectBeats(x, 22050, 0.28).map((b) => b / src.sp)
  }
  beats = beats.filter((b) => b > 0.05 && b < c.dur - 0.1).slice(0, 90)
  if (beats.length < 2) throw new Error('Couldn’t find a clear beat in this clip.')
  const s = c.kf?.scale?.length ? c.kf.scale[0].v : c.scale
  const kf: Keyframe[] = [{ t: 0, v: s }]
  let tEnd = 0
  for (const b of beats) {
    if (b - 0.03 <= tEnd) continue
    kf.push({ t: +(b - 0.03).toFixed(3), v: s }, { t: +b.toFixed(3), v: s * (1 + intensity) }, { t: +(b + 0.22).toFixed(3), v: s })
    tEnd = b + 0.22
  }
  checkpoint()
  patchClip(clipId, { kf: { ...c.kf, scale: kf } })
  return `Beat zoom added on ${beats.length} beats. Remove it with “Clear keyframes” in the Inspector.`
}

/* ---------- hook finder ---------- */

export interface Hook {
  clipId: string
  assetId: string
  srcStart: number
  len: number
}

export async function findHook(len: number): Promise<Hook> {
  const st = getState()
  const sel = getClip(st.selectedId)
  const c = sel && sel.kind === 'video' ? sel : st.project.clips.filter((x) => x.kind === 'video' && x.track === 'v1').sort((p, q) => q.dur - p.dur)[0]
  const a = c && getAsset(c.assetId)
  if (!c || !a) throw new Error('Add a video to the timeline first.')
  const r = await analyze(a.id, len, true)
  // stay inside the part of the source this clip actually uses
  const lo = c.srcIn
  const hi = c.srcIn + c.dur * c.speed - len
  const srcStart = Math.min(Math.max(r.start, lo), Math.max(lo, hi))
  return { clipId: c.id, assetId: a.id, srcStart, len: Math.min(len, a.duration - srcStart) }
}

export function addHook(h: Hook, text: string) {
  const st = getState()
  const L = h.len
  const shifted = st.project.clips.map((c) => ({ ...c, start: c.start + L }))
  const a = getAsset(h.assetId)!
  const hook = baseClip('video', 'v1', { assetId: h.assetId, label: 'Hook · ' + a.name, start: 0, dur: L, srcIn: h.srcStart, fit: 'cover', fadeOut: 0, transOut: { type: 'none', dur: 0.5 } })
  const extra: Clip[] = [hook]
  if (text.trim()) {
    extra.push(
      baseClip('text', 'v4', {
        label: text.slice(0, 40),
        start: 0.1,
        dur: Math.max(0.6, L - 0.2),
        y: 0.2,
        text: { ...(st.project.clips.find((x) => x.kind === 'text')?.text ?? defaultTitle()), text, anim: 'pop', animDur: 0.5 },
        transIn: { type: 'fade', dur: 0.12 },
      }),
    )
  }
  extra.push(baseClip('sfx', 'a1', { sfxId: 'whoosh', label: 'Whoosh', start: Math.max(0, L - 0.15), dur: 0.7 }))
  replaceTimeline([...shifted, ...extra], { markers: st.project.markers.map((m) => m + L) })
}

import { TEXT_PRESETS } from './library'
const defaultTitle = () => ({ ...(TEXT_PRESETS.find((p) => p.id === 'title') ?? TEXT_PRESETS[0]).props })

/* ---------- backup / restore (.clipforge) ---------- */

const MAGIC = 'CFGP1'

export async function exportBackup(): Promise<Blob> {
  const st = getState()
  const used = st.assets.filter((a) => a.blob)
  const header = {
    name: st.projectName,
    project: st.project,
    assets: used.map((a) => ({ id: a.id, name: a.name, type: a.blob!.type, size: a.blob!.size })),
  }
  const hb = new TextEncoder().encode(JSON.stringify(header))
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, hb.length)
  return new Blob([MAGIC, len, hb, ...used.map((a) => a.blob!)], { type: 'application/octet-stream' })
}

export async function importBackup(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 9).arrayBuffer())
  if (new TextDecoder().decode(head.slice(0, 5)) !== MAGIC) throw new Error('This is not a ClipForge backup file.')
  const hl = new DataView(head.buffer).getUint32(5)
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(await file.slice(9, 9 + hl).arrayBuffer())))
  let off = 9 + hl
  const assets: Asset[] = []
  for (const m of header.assets as { id: string; name: string; type: string; size: number }[]) {
    const f = new File([file.slice(off, off + m.size)], m.name, { type: m.type })
    off += m.size
    const a = await engine.importFile(f, m.id)
    if (a) assets.push(a)
  }
  const ids = new Set(assets.map((a) => a.id))
  setAssets(assets)
  loadProject({ ...header.project, clips: header.project.clips.filter((c: Clip) => !c.assetId || ids.has(c.assetId)) }, header.name)
  return `Opened “${header.name}” with ${assets.length} media files.`
}

/* ---------- brand kit ---------- */

export interface Brand {
  name: string
  color: string
  color2: string
  logo: string // data URL
  cta: string
}
const BK = 'clipforge-brand'
export const loadBrand = (): Brand => {
  try {
    return { name: '', color: '#7c5cff', color2: '#ffd400', logo: '', cta: 'FOLLOW FOR MORE', ...JSON.parse(localStorage.getItem(BK) ?? '{}') }
  } catch {
    return { name: '', color: '#7c5cff', color2: '#ffd400', logo: '', cta: 'FOLLOW FOR MORE' }
  }
}
export const saveBrand = (b: Brand) => {
  try {
    localStorage.setItem(BK, JSON.stringify(b))
  } catch {}
}

export async function addLogo(b: Brand): Promise<string> {
  if (!b.logo) throw new Error('Upload your logo first.')
  const blob = await (await fetch(b.logo)).blob()
  const a = await engine.importFile(new File([blob], (b.name || 'logo') + '-logo.png', { type: blob.type || 'image/png' }))
  if (!a) throw new Error('Could not read the logo image.')
  addAsset(a)
  const total = Math.max(2, getState().project.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0))
  const c = addAssetClip(a.id, 'v4', 0)
  if (c) patchClip(c.id, { start: 0, dur: total, scale: 0.16, x: getPreset().h > getPreset().w ? 0.86 : 0.92, y: getPreset().h > getPreset().w ? 0.1 : 0.1, opacity: 0.9, fit: 'contain', label: 'Logo watermark' })
  return 'Logo watermark added for the whole video.'
}

/* ---------- thumbnail ---------- */

export interface ThumbOpts {
  frame: HTMLCanvasElement | null
  text: string
  emoji: string
  color: string
  stroke: string
  pos: 'top' | 'center' | 'bottom'
  size: number
  fit: 'fill' | 'blur'
  vignette: boolean
  w?: number // default 1280×720 (YouTube); 1080×1920 for a Shorts / Reels cover
  h?: number
}

export function renderThumb(cv: HTMLCanvasElement, o: ThumbOpts) {
  const W = o.w ?? 1280
  const H = o.h ?? 720
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = '#111'
  g.fillRect(0, 0, W, H)
  const f = o.frame
  if (f && f.width) {
    const sc = o.fit === 'fill' ? Math.max(W / f.width, H / f.height) : Math.min(W / f.width, H / f.height)
    if (o.fit === 'blur') {
      const bs = Math.max(W / f.width, H / f.height)
      g.save()
      g.filter = 'blur(28px) brightness(0.7)'
      g.drawImage(f, (W - f.width * bs) / 2, (H - f.height * bs) / 2, f.width * bs, f.height * bs)
      g.restore()
    }
    g.drawImage(f, (W - f.width * sc) / 2, (H - f.height * sc) / 2, f.width * sc, f.height * sc)
  }
  if (o.vignette) {
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(1, 'rgba(0,0,0,0.65)')
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
  }
  const text = o.text.trim().toUpperCase()
  if (text) {
    const lines = wrap(g, text, o.size, W * 0.9)
    // keep tall covers readable: at most 4 lines
    const lh = o.size * 1.08
    const y0 = o.pos === 'top' ? H * 0.06 : o.pos === 'bottom' ? H - H * 0.06 - lines.length * lh : (H - lines.length * lh) / 2
    g.font = `900 ${o.size}px Impact, "Arial Black", Arial, sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'top'
    g.lineJoin = 'round'
    lines.forEach((ln, i) => {
      g.lineWidth = o.size * 0.2
      g.strokeStyle = o.stroke
      g.strokeText(ln, W / 2, y0 + i * lh)
      g.fillStyle = o.color
      g.fillText(ln, W / 2, y0 + i * lh)
    })
  }
  if (o.emoji) {
    g.font = `${Math.round(Math.min(W, H) * 0.28)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
    g.textAlign = 'right'
    const top = o.pos !== 'top'
    g.textBaseline = top ? 'top' : 'bottom'
    g.fillText(o.emoji, W - 30, top ? 10 : H - 10)
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, size: number, maxW: number): string[] {
  g.font = `900 ${size}px Impact, "Arial Black", Arial, sans-serif`
  const out: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w
    if (g.measureText(t).width > maxW && cur) {
      out.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) out.push(cur)
  return out
}

export function grabFrame(): HTMLCanvasElement | null {
  engine.render()
  const src = engine.canvas
  if (!src) return null
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  c.getContext('2d')!.drawImage(src, 0, 0)
  return c
}

// Script to video: your script (or one the AI writes) → a voiced video with matching stock clips and captions.
import { askAI, contentWords } from './chapters'
import { synth } from './pro'
import { encodeWav } from './dsp'
import { addAsset, baseClip, checkpoint, clipEnd, getPreset, getState, insertSilent } from './store'
import { engine } from './engine'
import { Asset, Clip, TextProps } from './types'
import { Hit, Prov, getKey, search } from './components/StockPanel'

export interface Scene {
  text: string
  keywords: string // what to search stock footage for
}

/** Splits a script into scenes of about one sentence (long sentences split at commas). */
export function splitScript(script: string): Scene[] {
  const parts = script
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: Scene[] = []
  for (const p of parts) {
    const words = p.split(/\s+/)
    if (words.length <= 22) out.push({ text: p, keywords: '' })
    else {
      // split long sentences near the middle comma
      let cut = p.lastIndexOf(',', Math.floor(p.length / 2) + 20)
      if (cut < 10) cut = Math.floor(p.length / 2)
      out.push({ text: p.slice(0, cut + 1).trim(), keywords: '' }, { text: p.slice(cut + 1).trim(), keywords: '' })
    }
  }
  for (const s of out) s.keywords = contentWords(s.text).slice(0, 3).join(' ')
  return out
}

/** Asks the AI writer for a short video script split into scenes with stock-footage keywords. */
export async function writeScript(provider: 'gemini' | 'claude', key: string, topic: string, lang: 'hinglish' | 'english' | 'hindi', seconds: number): Promise<Scene[]> {
  const words = Math.round(seconds * 2.4)
  const L = lang === 'hinglish' ? 'Hinglish (Hindi in Roman letters mixed with English, like Indian YouTubers talk)' : lang === 'hindi' ? 'Hindi in Devanagari' : 'simple English'
  const prompt = `Write a ${seconds}-second voice-over script (about ${words} words) for a vertical social video about: "${topic}". Language: ${L}. Start with a strong hook. Split it into 5-10 short scenes. Reply with JSON only: {"scenes":[{"text":"what the narrator says","keywords":"2-3 English words to search stock footage for this scene"}]}`
  const t = await askAI(provider, key, prompt)
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('The AI reply wasn’t in the expected format – try again.')
  const sc = (JSON.parse(m[0]).scenes ?? []) as Scene[]
  if (!sc.length) throw new Error('The AI didn’t return any scenes.')
  return sc.map((s) => ({ text: String(s.text ?? '').trim(), keywords: String(s.keywords ?? '').trim() })).filter((s) => s.text)
}

const PALETTES = [
  ['#7c3aed', '#ec4899'],
  ['#0ea5e9', '#22c55e'],
  ['#f97316', '#e11d48'],
  ['#1e3a8a', '#9333ea'],
  ['#14b8a6', '#6366f1'],
]

/** A gradient background picture, used when there's no stock key or no match. */
async function gradientAsset(i: number): Promise<Asset> {
  const P = getPreset()
  const c = document.createElement('canvas')
  c.width = Math.round(P.w / 2)
  c.height = Math.round(P.h / 2)
  const g = c.getContext('2d')!
  const [a, b] = PALETTES[i % PALETTES.length]
  const gr = g.createLinearGradient(0, 0, c.width, c.height)
  gr.addColorStop(0, a)
  gr.addColorStop(1, b)
  g.fillStyle = gr
  g.fillRect(0, 0, c.width, c.height)
  const blob: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/png'))
  const na = await engine.importFile(new File([blob], `Background ${i + 1}.png`, { type: 'image/png' }))
  addAsset(na!)
  return na!
}

async function download(h: Hit): Promise<Asset | null> {
  const r = await fetch(h.url)
  if (!r.ok) return null
  const b = await r.blob()
  const ext = h.kind === 'video' ? 'mp4' : 'jpg'
  const a = await engine.importFile(new File([b], `${h.title.replace(/[^\w ]+/g, '').slice(0, 30) || 'stock'}.${ext}`, { type: h.kind === 'video' ? 'video/mp4' : 'image/jpeg' }))
  if (a) addAsset(a)
  return a
}

export interface S2VOpts {
  voice: string
  stock: Prov | 'none'
  captions: boolean
}

export async function scriptToVideo(scenes: Scene[], o: S2VOpts, status: (m: string, p?: number) => void, signal: { cancelled: boolean }): Promise<string> {
  if (!scenes.length) throw new Error('Write or paste a script first.')
  const P = getPreset()
  const portrait = P.h > P.w
  const key = o.stock !== 'none' ? getKey(o.stock) : ''
  if (o.stock !== 'none' && !key) throw new Error(`Add your free ${o.stock === 'pexels' ? 'Pexels' : 'Pixabay'} key first (Media tab → Free stock videos & photos), or choose “Colour backgrounds”.`)
  // 1. voice for every scene
  const SR = 24000
  const voices: Float32Array[] = []
  for (let i = 0; i < scenes.length; i++) {
    if (signal.cancelled) throw new Error('Cancelled.')
    status(`Recording the voice: scene ${i + 1} of ${scenes.length}…`, (i / scenes.length) * 50)
    const r = await synth(scenes[i].text, o.voice, (m) => status(m))
    let x = r.audio
    if (r.sr !== SR) {
      const n = Math.round((x.length * SR) / r.sr)
      const y = new Float32Array(n)
      for (let k = 0; k < n; k++) y[k] = x[Math.min(x.length - 1, Math.floor((k * r.sr) / SR))]
      x = y
    }
    voices.push(x)
  }
  // 2. footage for every scene
  const used = new Set<string>()
  const footage: (Asset | null)[] = []
  for (let i = 0; i < scenes.length; i++) {
    if (signal.cancelled) throw new Error('Cancelled.')
    status(`Finding footage: scene ${i + 1} of ${scenes.length}…`, 50 + (i / scenes.length) * 40)
    let a: Asset | null = null
    if (key) {
      for (const q of [scenes[i].keywords, scenes[i].keywords.split(' ')[0], 'city life']) {
        if (!q) continue
        try {
          const hits = (await search(o.stock as Prov, 'videos', q, key, portrait)).filter((h) => !used.has(h.id))
          if (hits[0]) {
            used.add(hits[0].id)
            a = await download(hits[0])
            if (a) break
          }
        } catch (e) {
          if (/rejected/.test((e as Error).message)) throw e
        }
      }
    }
    footage.push(a ?? (await gradientAsset(i)))
  }
  // 3. one voice-over file, scenes back to back with a short breath between
  const gap = 0.25
  const lens = voices.map((v) => v.length / SR + gap)
  const total = lens.reduce((s, v) => s + v, 0)
  const all = new Float32Array(Math.ceil(total * SR))
  let at = 0
  const starts: number[] = []
  for (const v of voices) {
    starts.push(at / SR)
    all.set(v, at)
    at += v.length + Math.round(gap * SR)
  }
  const vo = await engine.importFile(new File([encodeWav(all, SR)], `Voice-over (${scenes.length} scenes).wav`, { type: 'audio/wav' }))
  if (!vo) throw new Error('Could not load the voice-over.')
  addAsset(vo)
  // 4. timeline
  const st = getState()
  const t0 = st.project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  const made: Clip[] = []
  scenes.forEach((s, i) => {
    const a = footage[i]!
    const dur = lens[i]
    const srcIn = a.kind === 'video' ? Math.max(0, Math.min(a.duration - dur, a.duration * 0.15)) : 0
    made.push(
      baseClip(a.kind === 'video' ? 'video' : 'image', 'v1', {
        assetId: a.id,
        label: `Scene ${i + 1}: ${s.keywords || s.text.slice(0, 20)}`,
        start: t0 + starts[i],
        dur: a.kind === 'video' ? Math.min(dur, a.duration) : dur,
        srcIn,
        volume: 0,
        fit: 'cover',
        transIn: { type: i === 0 ? 'fade' : 'fade', dur: 0.25 },
        kf: { scale: [{ t: 0, v: 1 }, { t: dur, v: 1.08 }] },
      } as Partial<Clip>),
    )
    if (o.captions) {
      // 3-5 word caption chunks spread over the scene by word count
      const w = s.text.split(/\s+/)
      const per = 4
      const chunks: string[] = []
      for (let k = 0; k < w.length; k += per) chunks.push(w.slice(k, k + per).join(' '))
      // a lone last word joins the caption before it
      if (chunks.length > 1 && chunks[chunks.length - 1].split(' ').length < 2) chunks.splice(-2, 2, chunks[chunks.length - 2] + ' ' + chunks[chunks.length - 1])
      const speak = voices[i].length / SR
      let ct = 0
      chunks.forEach((ch) => {
        const d = (speak * ch.split(' ').length) / w.length
        made.push(baseClip('text', 'v4', { label: ch, start: t0 + starts[i] + ct, dur: Math.max(0.3, d), y: portrait ? 0.7 : 0.85, text: CAP(ch, portrait) } as Partial<Clip>))
        ct += d
      })
    }
  })
  made.push(baseClip('audio', 'a1', { assetId: vo.id, label: vo.name, start: t0, dur: vo.duration } as Partial<Clip>))
  checkpoint()
  insertSilent(made)
  engine.requestRender()
  const stockN = footage.filter((a) => a && !a.name.startsWith('Background ')).length
  return `Video made: ${scenes.length} scenes, ${total.toFixed(0)} s, ${stockN ? `${stockN} stock clips` : 'colour backgrounds'}${o.captions ? ' and captions' : ''}. Everything is editable – swap any clip from Media.`
}

const CAP = (text: string, portrait: boolean): TextProps => ({
  text,
  font: 'Impact, "Arial Narrow Bold", Haettenschweiler, "Noto Sans Devanagari", sans-serif',
  size: portrait ? 0.058 : 0.07,
  color: '#ffffff',
  stroke: '#000000',
  strokeW: 0.12,
  bg: '#000000',
  bgOpacity: 0,
  bold: true,
  italic: false,
  upper: true,
  align: 'center',
  shadow: true,
  maxW: 0.9,
  anim: 'pop',
})

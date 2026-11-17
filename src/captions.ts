import { Clip } from './types'

export interface Word {
  text: string
  start: number
  end: number
}

// Runs transformers.js (Whisper) in a worker so the editor stays responsive.
// The library and model weights are downloaded the first time and cached by the browser.
const WORKER_SRC = `
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
env.allowLocalModels = false;
let asr = null, key = '';
self.onmessage = async (e) => {
  const { model, audio, language, device } = e.data;
  try {
    const k = model + '|' + device;
    if (!asr || key !== k) {
      self.postMessage({ type: 'status', msg: 'Downloading speech model (first time only)…' });
      asr = await pipeline('automatic-speech-recognition', model, {
        device,
        progress_callback: (p) => self.postMessage({ type: 'progress', p }),
      });
      key = k;
    }
    self.postMessage({ type: 'status', msg: 'Transcribing…' });
    const opts = { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, task: 'transcribe' };
    if (language && language !== 'auto') opts.language = language;
    const out = await asr(audio, opts);
    self.postMessage({ type: 'done', chunks: out.chunks || [], text: out.text || '' });
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
`

export type Progress = (msg: string, pct?: number) => void

export async function transcribe(
  audio: Float32Array,
  opts: { model: string; language: string; gpu: boolean },
  onProgress: Progress,
  signal: { cancelled: boolean },
): Promise<Word[]> {
  const mock = (window as any).__cfMockAsr as undefined | ((a: Float32Array) => { chunks: any[] })
  const raw = mock
    ? mock(audio).chunks
    : await new Promise<any[]>((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))
        const w = new Worker(url, { type: 'module' })
        const done = () => {
          w.terminate()
          URL.revokeObjectURL(url)
        }
        const timer = setInterval(() => {
          if (signal.cancelled) {
            clearInterval(timer)
            done()
            reject(new Error('Cancelled'))
          }
        }, 300)
        w.onmessage = (e) => {
          const m = e.data
          if (m.type === 'status') onProgress(m.msg)
          else if (m.type === 'progress') {
            const p = m.p
            if (p?.status === 'progress' && typeof p.progress === 'number') onProgress('Downloading speech model (first time only)…', p.progress)
          } else if (m.type === 'done') {
            clearInterval(timer)
            done()
            resolve(m.chunks)
          } else if (m.type === 'error') {
            clearInterval(timer)
            done()
            reject(new Error(m.message))
          }
        }
        w.onerror = (e) => {
          clearInterval(timer)
          done()
          reject(new Error(e.message || 'The speech worker failed to start – are you online?'))
        }
        // transfer a copy so the caller keeps its buffer
        const copy = audio.slice()
        w.postMessage({ model: opts.model, audio: copy, language: opts.language, device: opts.gpu ? 'webgpu' : 'wasm' }, [copy.buffer])
      })
  const words: Word[] = []
  for (const ch of raw) {
    const text = String(ch.text ?? '').trim()
    if (!text) continue
    const [s, e] = ch.timestamp ?? [0, null]
    const start = typeof s === 'number' ? s : 0
    words.push({ text, start, end: typeof e === 'number' && e > start ? e : start + 0.4 })
  }
  return words
}

export function groupWords(words: Word[], maxWords: number, maxChars = 26, gap = 0.7): Word[][] {
  const groups: Word[][] = []
  let cur: Word[] = []
  const flush = () => {
    if (cur.length) groups.push(cur)
    cur = []
  }
  for (const w of words) {
    const prev = cur[cur.length - 1]
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length
    if (prev && (w.start - prev.end > gap || cur.length >= maxWords || chars > maxChars)) flush()
    cur.push(w)
    if (/[.!?…]$/.test(w.text)) flush()
  }
  flush()
  return groups
}

export type CapMode = 'phrase' | 'karaoke' | 'single'

export interface CapLine {
  text: string
  start: number
  dur: number
  hlIdx?: number
}

/** Turns transcribed words into timed caption lines on the timeline. */
export function buildLines(words: Word[], c: Clip, mode: CapMode, maxWords: number): CapLine[] {
  const toT = (s: number) => c.start + s / c.speed
  const lo = c.start
  const hi = c.start + c.dur
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v))
  const out: CapLine[] = []
  const push = (text: string, s: number, e: number, hlIdx?: number) => {
    const st = clamp(s)
    const en = clamp(e)
    if (en - st >= 0.05) out.push({ text, start: st, dur: en - st, hlIdx })
  }
  const groups = groupWords(words, mode === 'single' ? 1 : maxWords)
  groups.forEach((g, gi) => {
    const nextGroupStart = groups[gi + 1]?.[0]?.start
    const gStart = g[0].start
    let gEnd = g[g.length - 1].end
    if (nextGroupStart !== undefined && nextGroupStart - gEnd < 0.4) gEnd = nextGroupStart
    const text = g.map((w) => w.text).join(' ')
    if (mode === 'phrase') push(text, toT(gStart), toT(gEnd))
    else if (mode === 'single') push(text, toT(gStart), toT(Math.max(gEnd, gStart + 0.25)))
    else
      g.forEach((w, i) => {
        const end = i < g.length - 1 ? g[i + 1].start : gEnd
        push(text, toT(w.start), toT(Math.max(end, w.start + 0.15)), i)
      })
  })
  return out
}

// Auto-edit: turn an ordered list of clips into a finished edit – best moments, cuts, transitions,
// colour, meme moments with sound, titles, outro and (optionally) beat-synced music.
import { baseClip, getAsset, replaceTimeline } from './store'
import { Clip, DEFAULT_FILTERS, Filters, TransType } from './types'
import { FILTER_PRESETS, SFX_LIST, TEXT_PRESETS } from './library'
import { MEMES, memeClips } from './memes'
import { decodeMonoRange } from './processing'
import { detectBeats, rmsEnvelope } from './dsp'

export type AutoStyle = 'funny' | 'hype' | 'cinematic' | 'vlog'
export interface AutoItem {
  assetId: string
  caption: string
}
export interface AutoOptions {
  items: AutoItem[]
  style: AutoStyle
  presetId: string
  totalSec: number // 0 = automatic
  memes: 'none' | 'few' | 'normal' | 'lots'
  transitions: boolean
  whoosh: boolean
  trimDeadAir: boolean
  intro: string
  outro: string
  musicId: string // '' = none
  beatSync: boolean
}

interface StyleDef {
  name: string
  perClip: [number, number] // seconds per clip (min,max)
  filter: string
  trans: { type: TransType; dur: number }[]
  memePool: string[]
  captionPreset: string
  zoom: boolean
  musicVol: number
}

export const STYLES: Record<AutoStyle, StyleDef & { emoji: string; desc: string }> = {
  funny: {
    name: 'Funny / Meme',
    emoji: '😂',
    desc: 'Punchy cuts, meme reactions with sounds, bold captions.',
    perClip: [3, 6],
    filter: 'vivid',
    trans: [{ type: 'zoom-in', dur: 0.25 }, { type: 'slide-left', dur: 0.25 }, { type: 'spin', dur: 0.3 }],
    memePool: ['bruh', 'sus', 'badum', 'wow', 'shock', 'boing', 'fail', 'womp', 'sideeye', 'airhorn', 'wrong', 'oh-no', 'applause', 'cry'],
    captionPreset: 'meme-bottom',
    zoom: true,
    musicVol: 0.3,
  },
  hype: {
    name: 'Hype / Fast',
    emoji: '🔥',
    desc: 'Short fast cuts, zoom hits, airhorns and riser sounds.',
    perClip: [1.8, 3.5],
    filter: 'vivid',
    trans: [{ type: 'zoom-in', dur: 0.18 }, { type: 'slide-left', dur: 0.2 }, { type: 'wipe', dur: 0.2 }, { type: 'slide-up', dur: 0.2 }],
    memePool: ['airhorn', 'mindblown', 'wow', 'tada', 'levelup', 'shock', 'winner', 'money', 'applause'],
    captionPreset: 'title',
    zoom: true,
    musicVol: 0.45,
  },
  cinematic: {
    name: 'Cinematic',
    emoji: '🎬',
    desc: 'Longer shots, soft fades, film colour, minimal effects.',
    perClip: [4, 8],
    filter: 'cine',
    trans: [{ type: 'fade', dur: 0.6 }],
    memePool: ['suspense', 'heartbeat', 'plot'],
    captionPreset: 'subtitle',
    zoom: false,
    musicVol: 0.5,
  },
  vlog: {
    name: 'Vlog',
    emoji: '📱',
    desc: 'Natural pacing, warm colour, friendly captions and pops.',
    perClip: [4, 9],
    filter: 'warm',
    trans: [{ type: 'fade', dur: 0.35 }, { type: 'slide-left', dur: 0.3 }],
    memePool: ['wow', 'tada', 'coin', 'levelup', 'applause', 'sideeye'],
    captionPreset: 'subtitle',
    zoom: false,
    musicVol: 0.35,
  },
}

const MEME_COUNT: Record<AutoOptions['memes'], number> = { none: 0, few: 0.3, normal: 0.6, lots: 1 }

interface Analysis {
  start: number // source in-point
  len: number // chosen length
  peaks: number[] // times (relative to in-point) of loud spikes, sorted by strength
}

const preset = (id: string) => TEXT_PRESETS.find((p) => p.id === id) ?? TEXT_PRESETS[0]
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Pick the liveliest stretch of a clip: skip dead air at the start, then best-energy window. */
export async function analyze(assetId: string, want: number, trim: boolean): Promise<Analysis> {
  const a = getAsset(assetId)!
  const full = a.kind === 'image' && !a.animated ? want : a.duration
  if (a.kind === 'image') return { start: 0, len: full, peaks: [] }
  const len = Math.min(want, a.duration)
  let x: Float32Array | null = null
  try {
    x = await decodeMonoRange(a, 0, Math.min(a.duration, 150), 8000)
  } catch {
    x = null
  }
  if (!x || x.length < 8000) return { start: 0, len, peaks: [] }
  const HOP = 400 // 0.05 s
  const env = rmsEnvelope(x, HOP)
  const sorted = Array.from(env).sort((p, q) => p - q)
  const p90 = sorted[Math.floor(sorted.length * 0.9)]
  if (p90 < 0.004) return { start: 0, len, peaks: [] } // no meaningful sound
  const win = Math.max(1, Math.round(len / 0.05))
  const thr = p90 * 0.15
  let first = 0
  if (trim) {
    while (first < env.length - win && env[first] < thr) first++
    first = Math.max(0, first - 2)
  }
  // prefix sums for window means
  const ps = new Float64Array(env.length + 1)
  for (let i = 0; i < env.length; i++) ps[i + 1] = ps[i] + env[i]
  let best = first
  let bestScore = -1
  for (let i = first; i + win <= env.length; i += 2) {
    const score = (ps[i + win] - ps[i]) / win
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  // clip shorter than the wish: use all of it from `first`
  const start = a.duration <= want ? first * 0.05 : best * 0.05
  const realLen = Math.min(len, a.duration - start)
  // spikes in the chosen window
  const i0 = Math.round(start / 0.05)
  const i1 = Math.min(env.length, i0 + Math.round(realLen / 0.05))
  const med = sorted[Math.floor(sorted.length * 0.5)] || 1e-4
  const cand: { t: number; v: number }[] = []
  for (let i = i0 + 4; i < i1 - 4; i++) {
    if (env[i] > med * 3 && env[i] >= env[i - 1] && env[i] >= env[i + 1]) cand.push({ t: (i - i0) * 0.05, v: env[i] })
  }
  cand.sort((p, q) => q.v - p.v)
  const peaks: number[] = []
  for (const c of cand) if (peaks.every((p) => Math.abs(p - c.t) > 1.5)) peaks.push(c.t)
  return { start: Math.max(0, start), len: Math.max(0.5, realLen), peaks }
}

export type Progress = (msg: string, frac: number) => void

export async function autoEdit(o: AutoOptions, progress: Progress): Promise<string> {
  const S = STYLES[o.style]
  const items = o.items.filter((i) => getAsset(i.assetId))
  if (!items.length) throw new Error('Add at least one video or photo first.')
  const hasIntro = !!o.intro.trim()
  const hasOutro = !!o.outro.trim()

  // ---- 1. how long should each clip be?
  const body = o.totalSec > 0 ? Math.max(items.length * 1.2, o.totalSec - (hasIntro ? 0 : 0)) : 0
  const per = body > 0 ? body / items.length : (S.perClip[0] + S.perClip[1]) / 2
  const want = (i: number) => clamp(per * (0.85 + 0.3 * ((i * 37) % 10) / 10), body > 0 ? 1 : S.perClip[0], body > 0 ? 40 : S.perClip[1])

  // ---- 2. analyse every clip for its best moment
  const ana: Analysis[] = []
  for (let i = 0; i < items.length; i++) {
    progress(`Finding the best moment in clip ${i + 1} of ${items.length}…`, 0.05 + (0.55 * i) / items.length)
    await new Promise((r) => setTimeout(r, 0))
    ana.push(await analyze(items[i].assetId, want(i), o.trimDeadAir))
  }

  // ---- 3. music + beats
  let beats: number[] = []
  const music = o.musicId ? getAsset(o.musicId) : undefined
  if (music && o.beatSync) {
    progress('Listening to the music for beats…', 0.65)
    try {
      const x = await decodeMonoRange(music, 0, Math.min(music.duration, 180), 22050)
      if (x) beats = detectBeats(x, 22050, 0.3)
    } catch {
      beats = []
    }
  }

  // ---- 4. cut list (optionally snapped to the beat)
  progress('Cutting the sequence together…', 0.72)
  const lens = ana.map((a) => a.len)
  if (beats.length > 4) {
    let t = 0
    for (let i = 0; i < lens.length; i++) {
      const target = t + lens[i]
      const near = beats.reduce((b, x) => (Math.abs(x - target) < Math.abs(b - target) ? x : b), beats[0])
      const end = near - t >= 1 ? near : target
      lens[i] = Math.min(end - t, ana[i].len + 1.5) // never stretch past the footage we have
      const a = getAsset(items[i].assetId)!
      if (a.kind === 'video') lens[i] = Math.min(lens[i], a.duration - ana[i].start)
      t += lens[i]
    }
  }

  const clips: Clip[] = []
  const filt: Partial<Filters> = FILTER_PRESETS.find((f) => f.id === S.filter)?.f ?? {}
  let t = 0
  const starts: number[] = []
  for (let i = 0; i < items.length; i++) {
    const a = getAsset(items[i].assetId)!
    const A = ana[i]
    const dur = Math.max(0.5, lens[i])
    const tr = S.trans[i % S.trans.length]
    starts.push(t)
    clips.push(
      baseClip(a.kind === 'image' ? 'image' : 'video', 'v1', {
        assetId: a.id,
        label: a.name,
        start: t,
        dur,
        srcIn: a.kind === 'image' ? 0 : A.start,
        fit: 'cover',
        filters: { ...DEFAULT_FILTERS, ...filt },
        scale: S.zoom && i % 2 === 1 ? 1.1 : 1,
        transIn: i > 0 && o.transitions ? { ...tr } : { type: 'none', dur: 0.5 },
        fadeIn: i === 0 ? 0.2 : 0,
        fadeOut: i === items.length - 1 ? 0.5 : 0,
        volume: music ? 0.7 : 1,
      }),
    )
    t += dur
  }
  const total = t

  // ---- 5. captions per clip, intro, outro
  const sfxClip = (id: string, at: number): Clip | null => {
    const def = SFX_LIST.find((s) => s.id === id)
    if (!def) return null
    const c = baseClip('sfx', 'a1', { sfxId: id, label: def.name, start: Math.max(0, at), dur: def.dur })
    if (clips.some((x) => x.track === 'a1' && c.start < x.start + x.dur - 1e-3 && c.start + c.dur > x.start + 1e-3)) return null
    return c
  }
  const push = (c: Clip | null) => c && clips.push(c)

  const capP = preset(S.captionPreset)
  items.forEach((it, i) => {
    if (!it.caption.trim()) return
    const d = Math.min(lens[i] - 0.2, 4)
    clips.push(
      baseClip('text', 'v3', {
        label: it.caption.slice(0, 40),
        start: starts[i] + 0.15,
        dur: Math.max(0.6, d),
        y: capP.y,
        text: { ...capP.props, text: it.caption, anim: 'pop', animDur: 0.35 },
        transIn: { type: 'fade', dur: 0.15 },
      }),
    )
  })
  if (hasIntro) {
    const p = preset('title')
    clips.push(
      baseClip('text', 'v4', {
        label: o.intro.slice(0, 40),
        start: 0.2,
        dur: Math.min(2.4, total * 0.3),
        y: 0.2,
        text: { ...p.props, text: o.intro, anim: 'pop', animDur: 0.6 },
        transIn: { type: 'fade', dur: 0.15 },
      }),
    )
    push(sfxClip('whoosh', 0.1))
  }
  if (hasOutro) {
    const p = preset('title')
    const d = Math.min(2.6, total * 0.3)
    clips.push(
      baseClip('text', 'v4', {
        label: o.outro.slice(0, 40),
        start: Math.max(0, total - d),
        dur: d,
        y: 0.5,
        text: { ...p.props, text: o.outro, anim: 'pop', animDur: 0.7 },
        transIn: { type: 'fade', dur: 0.15 },
      }),
      baseClip('sticker', 'v2', {
        label: '🔔',
        emoji: '🔔',
        stickerSize: 0.16,
        start: Math.max(0, total - d),
        dur: d,
        x: 0.5,
        y: 0.64,
        transIn: { type: 'zoom-in', dur: 0.25 },
      }),
    )
    push(sfxClip('ding', total - d))
  }

  // ---- 6. transition whooshes
  if (o.whoosh && o.transitions) {
    for (let i = 1; i < items.length; i++) push(sfxClip('whoosh', starts[i] - 0.1))
  }

  // ---- 7. meme moments
  if (o.memes !== 'none') {
    progress('Adding meme moments with sound…', 0.85)
    const pool = S.memePool.map((id) => MEMES.find((m) => m.id === id)!).filter(Boolean)
    const target = Math.max(1, Math.round(items.length * MEME_COUNT[o.memes]))
    // candidate moments: loud spikes first, then the end of clips
    const moments: { at: number; score: number }[] = []
    ana.forEach((a, i) => {
      a.peaks.slice(0, 2).forEach((p, k) => {
        if (p > 0.6 && p < lens[i] - 1.4) moments.push({ at: starts[i] + p + 0.15, score: 2 - k })
      })
      moments.push({ at: starts[i] + Math.max(0.6, lens[i] - 1.7), score: 1 })
    })
    moments.sort((p, q) => q.score - p.score || p.at - q.at)
    const used: number[] = []
    let n = 0
    for (const mo of moments) {
      if (n >= target) break
      if (used.some((u) => Math.abs(u - mo.at) < 2.2)) continue
      if (mo.at > total - (hasOutro ? 4 : 1.2)) continue
      if (hasIntro && mo.at < 2.8) continue
      const m = pool[n % pool.length]
      const mc = memeClips({ ...m, dur: Math.min(m.dur, total - mo.at - (hasOutro ? 2.8 : 0), 2.4) }, mo.at, clips, ['a1'], true)
      if (!mc.length) continue
      clips.push(...mc)
      used.push(mo.at)
      n++
    }
  }

  // ---- 8. music
  if (music) {
    clips.push(
      baseClip('audio', 'a2', {
        assetId: music.id,
        label: music.name,
        start: 0,
        dur: Math.min(music.duration, total),
        volume: S.musicVol,
        fadeIn: 0.5,
        fadeOut: Math.min(1.5, total / 4),
      }),
    )
  }

  progress('Putting it on the timeline…', 0.95)
  replaceTimeline(clips, { presetId: o.presetId })
  return `Auto-edit done: ${items.length} clips → ${total.toFixed(0)}s ${S.name} edit. Press Space to preview; every piece is editable (Undo brings back your old timeline).`
}


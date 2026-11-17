// One-tap meme moments: a sound + emoji/GIF-style stickers + captions + optional effect on the video underneath.
// Everything is generated here (sounds are synthesised sound-alikes, not recordings of famous clips).
import { addClipsBatch, baseClip, clipEnd, freezeFrameAt, getState, patchClip, splitClip } from './store'
import { SFX_LIST, TEXT_PRESETS } from './library'
import { engine } from './engine'
import { Clip, DEFAULT_FILTERS, FxType, TextProps } from './types'

export type MemeCat = 'Reactions' | 'Fails' | 'Drama' | 'Wins' | 'Comedy' | 'Text memes'

interface StickerSpec {
  e: string
  x?: number
  y?: number
  size?: number
  fx?: FxType
  at?: number
  dur?: number
}
interface TextSpec {
  s: string
  preset?: string
  y?: number
  at?: number
  dur?: number
  over?: Partial<TextProps>
}
export interface Meme {
  id: string
  name: string
  emoji: string
  cat: MemeCat
  dur: number
  sounds?: { id: string; at?: number }[]
  stickers?: StickerSpec[]
  texts?: TextSpec[]
  /** effect on the video playing under the playhead for the length of the meme */
  video?: { fx?: FxType; sepia?: boolean; noir?: boolean; fried?: boolean; zoom?: boolean; freeze?: boolean }
}

export const MEMES: Meme[] = [
  // ---- reactions
  { id: 'bruh', name: 'Bruh', emoji: '🗿', cat: 'Reactions', dur: 1.8, sounds: [{ id: 'bruh' }], stickers: [{ e: '🗿', size: 0.34, fx: 'punch' }], texts: [{ s: 'BRUH', preset: 'meme-bottom', y: 0.78 }] },
  { id: 'sus', name: 'Sus', emoji: '🤨', cat: 'Reactions', dur: 2, sounds: [{ id: 'sus' }], stickers: [{ e: '🤨', size: 0.3, fx: 'float' }, { e: '📮', x: 0.78, y: 0.7, size: 0.14, at: 0.4 }], texts: [{ s: 'kinda sus…', preset: 'meme-bottom', y: 0.8, over: { upper: false } }] },
  { id: 'shock', name: 'Boom shock', emoji: '😳', cat: 'Reactions', dur: 1.4, sounds: [{ id: 'boom' }], stickers: [{ e: '😳', size: 0.36, fx: 'shake' }], video: { fx: 'shake', zoom: true } },
  { id: 'mindblown', name: 'Mind blown', emoji: '🤯', cat: 'Reactions', dur: 2.2, sounds: [{ id: 'rise' }, { id: 'boom', at: 1.6 }], stickers: [{ e: '🤯', size: 0.36, fx: 'pulse', at: 1.5, dur: 0.7 }], texts: [{ s: 'WAIT WHAT?!', preset: 'meme-top', y: 0.16, at: 1.5, dur: 0.7 }] },
  { id: 'oh-no', name: 'Oh no…', emoji: '😱', cat: 'Reactions', dur: 2, sounds: [{ id: 'sad' }], stickers: [{ e: '😱', size: 0.32, fx: 'shake' }], texts: [{ s: 'OH NO', preset: 'meme-bottom', y: 0.8 }] },
  { id: 'sideeye', name: 'Side-eye', emoji: '👀', cat: 'Reactions', dur: 1.6, sounds: [{ id: 'sparkle' }], stickers: [{ e: '👀', size: 0.28, x: 0.5, y: 0.45, fx: 'float' }], texts: [{ s: '…', preset: 'meme-bottom', y: 0.75, over: { size: 0.12 } }] },
  { id: 'cry', name: 'Crying laugh', emoji: '😭', cat: 'Reactions', dur: 2.4, sounds: [{ id: 'boing' }], stickers: [{ e: '😂', size: 0.24, x: 0.3, y: 0.45, fx: 'spin' }, { e: '😭', size: 0.24, x: 0.7, y: 0.45, fx: 'shake' }, { e: '💀', size: 0.2, x: 0.5, y: 0.62, at: 0.5, fx: 'pulse' }] },
  { id: 'wow', name: 'Wow!', emoji: '😮', cat: 'Reactions', dur: 1.8, sounds: [{ id: 'wow' }, { id: 'sparkle', at: 0.3 }], stickers: [{ e: '😮', size: 0.3, fx: 'pulse' }, { e: '✨', x: 0.28, y: 0.32, size: 0.12 }, { e: '✨', x: 0.74, y: 0.5, size: 0.1 }], texts: [{ s: 'WOW', preset: 'title', y: 0.76 }] },
  // ---- fails
  { id: 'fail', name: 'Epic fail', emoji: '🤡', cat: 'Fails', dur: 2.4, sounds: [{ id: 'sad' }], stickers: [{ e: '🤡', size: 0.3, fx: 'shake' }], texts: [{ s: 'FAIL', preset: 'meme-top', y: 0.16 }] },
  { id: 'wasted', name: 'Wasted', emoji: '☠️', cat: 'Fails', dur: 3, sounds: [{ id: 'gong' }], texts: [{ s: 'WASTED', preset: 'title', y: 0.5, over: { color: '#e11d2e', size: 0.16, bgOpacity: 0.75, bg: '#000000', upper: true } }], video: { noir: true, freeze: false } },
  { id: 'womp', name: 'Womp womp', emoji: '😞', cat: 'Fails', dur: 2.2, sounds: [{ id: 'womp' }], stickers: [{ e: '😞', size: 0.26, fx: 'float' }], texts: [{ s: 'womp womp', preset: 'meme-bottom', y: 0.8, over: { upper: false } }] },
  { id: 'wrong', name: 'Wrong answer', emoji: '❌', cat: 'Fails', dur: 1.4, sounds: [{ id: 'buzzer' }], stickers: [{ e: '❌', size: 0.42, fx: 'shake' }] },
  { id: 'wait-what', name: 'Wait… what?', emoji: '💿', cat: 'Fails', dur: 2.4, sounds: [{ id: 'scratch' }], texts: [{ s: 'WAIT… WHAT?', preset: 'meme-top', y: 0.16 }, { s: '🤨', preset: 'title', y: 0.5, at: 0.5, over: { size: 0.22 } }], video: { freeze: true } },
  { id: 'tbc', name: 'To be continued…', emoji: '➡️', cat: 'Fails', dur: 3, sounds: [{ id: 'dundundun' }], texts: [{ s: '← To Be Continued', preset: 'subtitle', y: 0.88, over: { color: '#e6b93a', size: 0.05, bgOpacity: 0 } }], video: { freeze: true, sepia: true } },
  // ---- drama
  { id: 'dun3', name: 'Dun dun DUUN', emoji: '😨', cat: 'Drama', dur: 2.4, sounds: [{ id: 'dundundun' }], stickers: [{ e: '😨', size: 0.32, fx: 'shake', at: 1.2 }], texts: [{ s: 'DUN', y: 0.3, at: 0, dur: 0.6 }, { s: 'DUN', y: 0.45, at: 0.6, dur: 0.6, preset: 'title' }, { s: 'DUUUN!', y: 0.6, at: 1.2, dur: 1.2, preset: 'title', over: { size: 0.14 } }], video: { noir: true } },
  { id: 'plot', name: 'Plot twist', emoji: '🌪️', cat: 'Drama', dur: 2.2, sounds: [{ id: 'scratch' }, { id: 'boom', at: 0.7 }], texts: [{ s: 'PLOT TWIST', preset: 'title', y: 0.5, at: 0.6, over: { size: 0.12 } }], video: { fx: 'glitch' } },
  { id: 'suspense', name: 'Suspense build', emoji: '🥁', cat: 'Drama', dur: 2.6, sounds: [{ id: 'drumroll' }], stickers: [{ e: '😬', size: 0.26, fx: 'pulse' }], texts: [{ s: '…', preset: 'title', y: 0.72 }], video: { fx: 'pulse' } },
  { id: 'alert', name: 'Breaking alert', emoji: '🚨', cat: 'Drama', dur: 2.6, sounds: [{ id: 'siren' }], stickers: [{ e: '🚨', size: 0.2, x: 0.18, y: 0.14, fx: 'pulse' }, { e: '🚨', size: 0.2, x: 0.82, y: 0.14, fx: 'pulse' }], texts: [{ s: 'BREAKING NEWS', preset: 'title', y: 0.14, over: { color: '#ffffff', bg: '#d41133', bgOpacity: 1, size: 0.07 } }] },
  { id: 'heartbeat', name: 'Heartbeat', emoji: '💓', cat: 'Drama', dur: 2.6, sounds: [{ id: 'heartbeat' }], stickers: [{ e: '💓', size: 0.26, fx: 'pulse' }], video: { noir: true, fx: 'pulse' } },
  { id: 'photo', name: 'Caught on camera', emoji: '📸', cat: 'Drama', dur: 1.6, sounds: [{ id: 'shutter' }], stickers: [{ e: '📸', size: 0.2, x: 0.8, y: 0.2 }], texts: [{ s: 'CAUGHT 📸', preset: 'meme-bottom', y: 0.8 }], video: { freeze: true } },
  // ---- wins
  { id: 'tada', name: 'Ta-da!', emoji: '🎉', cat: 'Wins', dur: 2.2, sounds: [{ id: 'tada' }, { id: 'sparkle', at: 0.3 }], stickers: [{ e: '🎉', size: 0.3, x: 0.3, y: 0.4, fx: 'pulse' }, { e: '🎊', size: 0.3, x: 0.7, y: 0.4, fx: 'pulse' }], texts: [{ s: 'TA-DA!', preset: 'title', y: 0.72 }] },
  { id: 'levelup', name: 'Level up', emoji: '🆙', cat: 'Wins', dur: 2, sounds: [{ id: 'levelup' }], stickers: [{ e: '⬆️', size: 0.2, x: 0.5, y: 0.5, fx: 'float' }], texts: [{ s: 'LEVEL UP!', preset: 'title', y: 0.34, over: { color: '#7CFF6B' } }] },
  { id: 'applause', name: 'Applause', emoji: '👏', cat: 'Wins', dur: 3, sounds: [{ id: 'applause' }], stickers: [{ e: '👏', size: 0.26, x: 0.3, y: 0.7, fx: 'pulse' }, { e: '👏', size: 0.26, x: 0.7, y: 0.7, fx: 'pulse' }] },
  { id: 'money', name: 'Cha-ching', emoji: '💰', cat: 'Wins', dur: 2, sounds: [{ id: 'kaching' }], stickers: [{ e: '💰', size: 0.26, fx: 'spin' }, { e: '💸', size: 0.16, x: 0.2, y: 0.3, fx: 'float' }, { e: '💸', size: 0.16, x: 0.8, y: 0.3, fx: 'float' }], texts: [{ s: '+$$$', preset: 'title', y: 0.72, over: { color: '#7CFF6B' } }] },
  { id: 'winner', name: 'Winner', emoji: '🏆', cat: 'Wins', dur: 2.6, sounds: [{ id: 'tada' }, { id: 'applause', at: 0.5 }], stickers: [{ e: '🏆', size: 0.34, fx: 'pulse' }], texts: [{ s: 'WINNER', preset: 'title', y: 0.72 }] },
  { id: 'coin', name: 'Coin collect', emoji: '🪙', cat: 'Wins', dur: 1.2, sounds: [{ id: 'coin' }], stickers: [{ e: '🪙', size: 0.2, y: 0.4, fx: 'spin' }] },
  // ---- comedy
  { id: 'badum', name: 'Ba-dum-tss', emoji: '🥁', cat: 'Comedy', dur: 1.8, sounds: [{ id: 'rimshot' }], stickers: [{ e: '🥁', size: 0.28, fx: 'punch' }], texts: [{ s: 'ba dum tss', preset: 'meme-bottom', y: 0.82, over: { upper: false } }] },
  { id: 'crickets', name: 'Awkward silence', emoji: '🦗', cat: 'Comedy', dur: 3, sounds: [{ id: 'crickets' }], stickers: [{ e: '🦗', size: 0.18, x: 0.25, y: 0.75, fx: 'float' }, { e: '🌙', size: 0.14, x: 0.8, y: 0.2 }], texts: [{ s: '*awkward silence*', preset: 'meme-bottom', y: 0.85, over: { upper: false, size: 0.06 } }], video: { noir: true } },
  { id: 'boing', name: 'Boing!', emoji: '🌀', cat: 'Comedy', dur: 1.4, sounds: [{ id: 'boing' }], stickers: [{ e: '🌀', size: 0.24, fx: 'spin' }], video: { fx: 'pulse' } },
  { id: 'pew', name: 'Pew pew', emoji: '🔫', cat: 'Comedy', dur: 1.2, sounds: [{ id: 'laser' }, { id: 'laser', at: 0.25 }, { id: 'laser', at: 0.5 }], stickers: [{ e: '💥', size: 0.2, x: 0.7, y: 0.4, at: 0.5, fx: 'punch' }] },
  { id: 'deepfry', name: 'Deep fried', emoji: '🍟', cat: 'Comedy', dur: 2.2, sounds: [{ id: 'airhorn' }], stickers: [{ e: '😂', size: 0.2, x: 0.2, y: 0.3, fx: 'shake' }, { e: '💯', size: 0.2, x: 0.8, y: 0.6, fx: 'shake' }, { e: '🔥', size: 0.2, x: 0.7, y: 0.2, fx: 'shake' }], video: { fried: true, fx: 'shake' } },
  { id: 'airhorn', name: 'Airhorn blast', emoji: '📯', cat: 'Comedy', dur: 1.6, sounds: [{ id: 'airhorn' }], stickers: [{ e: '📯', size: 0.26, fx: 'shake' }, { e: '💥', size: 0.2, x: 0.25, y: 0.3, fx: 'punch' }], video: { fx: 'punch' } },
  // ---- text memes (pure captions)
  { id: 'nobody', name: 'Nobody: / Me:', emoji: '🙋', cat: 'Text memes', dur: 3.2, texts: [{ s: 'Nobody:', preset: 'meme-top', y: 0.12, over: { upper: false, size: 0.07 } }, { s: 'Me:', preset: 'meme-top', y: 0.2, at: 0.9, over: { upper: false, size: 0.07 } }], sounds: [{ id: 'pop', at: 0.9 }] },
  { id: 'pov', name: 'POV:', emoji: '🎥', cat: 'Text memes', dur: 3, texts: [{ s: 'POV: you…', preset: 'title', y: 0.14, over: { size: 0.075, anim: 'pop', animDur: 0.5 } }], sounds: [{ id: 'pop' }] },
  { id: 'expect', name: 'Expectation vs Reality', emoji: '⚖️', cat: 'Text memes', dur: 4, texts: [{ s: 'EXPECTATION', preset: 'meme-top', y: 0.1, dur: 2, over: { size: 0.065 } }, { s: 'REALITY', preset: 'meme-top', y: 0.1, at: 2, dur: 2, over: { size: 0.065, color: '#ff5b6b' } }], sounds: [{ id: 'whoosh' }, { id: 'sad', at: 2 }] },
  { id: 'me-when', name: 'Me when…', emoji: '🫠', cat: 'Text memes', dur: 3, texts: [{ s: 'me when…', preset: 'meme-top', y: 0.12, over: { upper: false } }, { s: '😬', preset: 'title', y: 0.5, at: 1, over: { size: 0.2, anim: 'pop', animDur: 0.4 } }], sounds: [{ id: 'sus', at: 1 }] },
  { id: 'ranked', name: 'Tier list S', emoji: '🏅', cat: 'Text memes', dur: 2.2, texts: [{ s: 'S TIER', preset: 'title', y: 0.2, over: { color: '#ffd400', size: 0.12, anim: 'pop', animDur: 0.5 } }], sounds: [{ id: 'levelup' }] },
]

export const MEME_CATS: MemeCat[] = ['Reactions', 'Fails', 'Drama', 'Wins', 'Comedy', 'Text memes']

function pickTrack(all: Clip[], start: number, dur: number, prefer: string[]): string {
  for (const id of [...prefer, 'v2', 'v3', 'v4']) {
    const busy = all.some((c) => c.track === id && start < clipEnd(c) - 1e-3 && start + dur > c.start + 1e-3)
    if (!busy) return id
  }
  return ''
}

/** Applies the video effect to the main-track clip under the playhead for the meme's length. Returns a note if it couldn't. */
function applyVideoFx(m: Meme, t: number): string {
  const v = m.video
  if (!v) return ''
  const under = () => getState().project.clips.find((c) => c.kind === 'video' && c.track === 'v1' && t >= c.start && t < clipEnd(c) - 0.05)
  let c = under()
  if (!c) return ' (no video under the playhead for the picture effect)'
  if (v.freeze) {
    if (t <= c.start + 0.06 || t >= clipEnd(c) - 0.06) return ' (move the playhead inside the video to freeze a frame)'
    freezeFrameAt(c.id, t, m.dur)
    const f = getState().project.clips.find((x) => x.freeze && Math.abs(x.start - t) < 0.01 && x.track === 'v1')
    if (f) {
      patchClip(f.id, {
        filters: { ...f.filters, ...(v.sepia ? { sepia: 0.9, contrast: 1.1, saturate: 0.7 } : {}) },
        ...(v.fx ? { fx: v.fx } : {}),
      })
    }
    return ''
  }
  // isolate the meme's time range as its own piece so the effect only covers that stretch
  if (t > c.start + 0.06) {
    splitClip(c.id, t)
    c = under()
  }
  if (!c) return ''
  const endT = Math.min(t + m.dur, clipEnd(c))
  if (endT < clipEnd(c) - 0.06) splitClip(c.id, endT)
  const mid = getState().project.clips.find((x) => x.kind === 'video' && x.track === 'v1' && Math.abs(x.start - c!.start) < 0.01)
  if (!mid) return ''
  const filters = { ...mid.filters }
  if (v.noir) Object.assign(filters, { grayscale: 1, contrast: 1.4, brightness: 0.85 })
  if (v.sepia) Object.assign(filters, { sepia: 0.9, contrast: 1.1 })
  if (v.fried) Object.assign(filters, { contrast: 2.2, saturate: 3, brightness: 1.1 })
  patchClip(mid.id, { filters: { ...DEFAULT_FILTERS, ...filters }, ...(v.fx ? { fx: v.fx } : {}), ...(v.zoom ? { scale: 1.12 } : {}) })
  return ''
}

/** Builds the sticker / text / sound clips of a meme at time t. `base` = clips already on the timeline (to avoid collisions). */
export function memeClips(m: Meme, t: number, base: Clip[], audioTracks = ['a1', 'a2'], strict = false): Clip[] {
  const made: Clip[] = []
  for (const s of m.stickers ?? []) {
    const at = t + (s.at ?? 0)
    const dur = s.dur ?? Math.max(0.4, m.dur - (s.at ?? 0))
    const trk = pickTrack([...base, ...made], at, dur, ['v2', 'v3'])
    if (!trk && strict) continue
    made.push(
      baseClip('sticker', trk || 'v4', {
        label: s.e,
        emoji: s.e,
        stickerSize: s.size ?? 0.22,
        x: s.x ?? 0.5,
        y: s.y ?? 0.45,
        start: at,
        dur,
        fx: s.fx ?? 'none',
        transIn: { type: 'zoom-in', dur: 0.2 },
        transOut: { type: 'fade', dur: 0.25 },
      }),
    )
  }
  for (const x of m.texts ?? []) {
    const p = TEXT_PRESETS.find((q) => q.id === (x.preset ?? 'title')) ?? TEXT_PRESETS[0]
    const at = t + (x.at ?? 0)
    const dur = x.dur ?? Math.max(0.5, m.dur - (x.at ?? 0))
    const trk = pickTrack([...base, ...made], at, dur, ['v4', 'v3'])
    if (!trk && strict) continue
    made.push(
      baseClip('text', trk || 'v4', {
        label: x.s.slice(0, 40),
        start: at,
        dur,
        y: x.y ?? p.y,
        text: { ...p.props, text: x.s, ...x.over },
        transIn: { type: 'fade', dur: 0.12 },
      }),
    )
  }
  for (const s of m.sounds ?? []) {
    const def = SFX_LIST.find((q) => q.id === s.id)
    if (!def) continue
    const at = t + (s.at ?? 0)
    const all = [...base, ...made]
    const tr = audioTracks.find((id) => !all.some((c) => c.track === id && at < clipEnd(c) - 1e-3 && at + def.dur > c.start + 1e-3))
    if (!tr) continue
    made.push(baseClip('sfx', tr, { sfxId: s.id, label: def.name, start: at, dur: def.dur }))
  }
  return made
}

export function applyMeme(id: string): string {
  const m = MEMES.find((x) => x.id === id)
  if (!m) return ''
  const t = Math.max(0, engine.time)
  const made = memeClips(m, t, getState().project.clips)
  addClipsBatch(made)
  const note = applyVideoFx(m, t)
  return `${m.name} added at the playhead${note}. Click any piece to change it.`
}

export function previewSound(id: string) {
  const ctx = engine.audio
  void ctx.resume()
  const src = ctx.createBufferSource()
  src.buffer = engine.getSfx(id)
  src.connect(ctx.destination)
  src.start()
}

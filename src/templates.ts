import { addClipsBatch, baseClip, getState, projectDuration } from './store'
import { SFX_LIST, TEXT_PRESETS } from './library'
import { Clip, TextProps } from './types'

export interface Template {
  id: string
  name: string
  emoji: string
  desc: string
  needsVideo?: boolean
  pack?: string // premium pack id (Pro)
  make: (D: number) => { clips: Clip[]; project?: { presetId?: string; bg?: string } }
}

const preset = (id: string) => TEXT_PRESETS.find((p) => p.id === id) ?? TEXT_PRESETS[0]

function text(id: string, str: string, start: number, dur: number, y: number, over: Partial<TextProps> = {}, track = 'v4'): Clip {
  const p = preset(id)
  return baseClip('text', track, {
    label: str.slice(0, 40),
    start,
    dur,
    y,
    text: { ...p.props, text: str, ...over },
    transIn: { type: 'fade', dur: 0.2 },
  })
}
const sticker = (emoji: string, start: number, dur: number, x: number, y: number, size: number, track: string): Clip =>
  baseClip('sticker', track, { label: emoji, emoji, stickerSize: size, start, dur, x, y, transIn: { type: 'zoom-in', dur: 0.25 } })
const sfx = (id: string, start: number): Clip => {
  const def = SFX_LIST.find((s) => s.id === id)!
  return baseClip('sfx', 'a1', { sfxId: id, label: def.name, start, dur: def.dur })
}
const end = (D: number, len: number) => Math.max(0, D - len)

export const TEMPLATES: Template[] = [
  {
    id: 'hook-outro',
    name: 'Hook + outro',
    emoji: '🎣',
    desc: 'Attention-grabbing opener and a follow call-to-action at the end.',
    needsVideo: true,
    make: (D) => ({
      clips: [
        { ...text('title', 'WAIT FOR IT…', 0, Math.min(2.2, D / 2), 0.22, { anim: 'pop', animDur: 0.6 }) },
        text('title', 'FOLLOW FOR MORE', end(D, 2.5), Math.min(2.5, D), 0.5, { anim: 'pop', animDur: 0.8 }, 'v3'),
        sticker('🔔', end(D, 2.5), Math.min(2.5, D), 0.5, 0.64, 0.16, 'v2'),
        sfx('whoosh', 0),
        sfx('ding', end(D, 2.5)),
      ],
    }),
  },
  {
    id: 'meme',
    name: 'Meme top + bottom',
    emoji: '😂',
    desc: 'Classic impact-font caption above and below the picture.',
    needsVideo: true,
    make: (D) => ({
      clips: [text('meme-top', 'WHEN YOU…', 0, D, 0.12), text('meme-bottom', 'BUT THEN THIS HAPPENS', 0, D, 0.8, {}, 'v3')],
    }),
  },
  {
    id: 'lower-third',
    name: 'Name lower-third',
    emoji: '🪪',
    desc: 'Name and tagline that slide in at the bottom.',
    needsVideo: true,
    make: (D) => ({
      clips: [
        text('lower', 'YOUR NAME', 0.6, Math.min(4, D - 0.6), 0.72, { anim: 'slide', animDur: 0.5 }),
        text('subtitle', 'What you do · @yourhandle', 0.9, Math.min(3.7, D - 0.9), 0.78, { anim: 'fade', animDur: 0.5 }, 'v3'),
      ],
    }),
  },
  {
    id: 'top3',
    name: 'Top 3 countdown',
    emoji: '🏆',
    desc: 'Big #3, #2, #1 numbers with a ding on each.',
    needsVideo: true,
    make: (D) => {
      const seg = D / 3
      return {
        clips: [3, 2, 1].flatMap((n, i) => [
          text('title', `#${n}`, i * seg, Math.min(2, seg), 0.16, { anim: 'pop', animDur: 0.5, size: 0.14 }, i % 2 ? 'v3' : 'v4'),
          sfx('ding', i * seg),
        ]),
      }
    },
  },
  {
    id: 'countdown',
    name: '3-2-1 intro',
    emoji: '⏱️',
    desc: 'A quick countdown before your video starts.',
    needsVideo: true,
    make: () => ({
      clips: [3, 2, 1].flatMap((n, i) => [text('title', String(n), i, 1, 0.5, { size: 0.3, anim: 'pop', animDur: 0.4 }, 'v4'), sfx('pop', i)]),
    }),
  },
  {
    id: 'quote',
    name: 'Quote card',
    emoji: '💬',
    desc: 'Dark background with one big animated quote. No video needed.',
    make: () => ({
      project: { presetId: 'shorts', bg: '#111827' },
      clips: [
        text('title', '"Your quote goes here"', 0.3, 5.7, 0.46, { size: 0.075, anim: 'fade', animDur: 1.4, bgOpacity: 0 }),
        text('subtitle', '— Author name', 2, 4, 0.66, { anim: 'fade', animDur: 0.6 }, 'v3'),
      ],
    }),
  },
  {
    id: 'like-sub',
    name: 'Like · Share · Subscribe',
    emoji: '👍',
    desc: 'Animated end-screen call to action with emoji.',
    needsVideo: true,
    make: (D) => ({
      clips: [
        text('title', 'LIKE · SHARE · SUBSCRIBE', end(D, 3), Math.min(3, D), 0.44, { anim: 'pop', animDur: 1 }),
        sticker('👍', end(D, 3) + 0.2, Math.min(2.8, D), 0.3, 0.58, 0.16, 'v2'),
        sticker('🔔', end(D, 3) + 0.5, Math.min(2.5, D), 0.7, 0.58, 0.16, 'v3'),
        sfx('pop', end(D, 3) + 0.2),
        sfx('pop', end(D, 3) + 0.5),
      ],
    }),
  },
]

/* ---------- premium template packs (Pro) ---------- */
export const TEMPLATE_PACKS = [
  { id: 'wedding', name: 'Wedding', emoji: '💍' },
  { id: 'festival', name: 'Festival', emoji: '🪔' },
  { id: 'travel', name: 'Travel', emoji: '✈️' },
  { id: 'devotional', name: 'Devotional', emoji: '🙏' },
]
const gold: Partial<TextProps> = { font: '"Rozha One", Georgia, serif', color: '#fff2b0', grad: '#d99a00', stroke: '#3a2400', strokeW: 0.08, shadow: true, upper: false }
const desi: Partial<TextProps> = { font: '"Yatra One", "Noto Sans Devanagari", sans-serif', color: '#ffffff', stroke: '#7a1f00', strokeW: 0.14, shadow: true, upper: false }
const rain = (emoji: string, D: number, n: number, track: string, size = 0.07): Clip[] =>
  Array.from({ length: n }, (_, i) => sticker(emoji, (i * D) / n / 2, Math.min(D, 3 + (i % 3)), 0.08 + ((i * 0.37) % 0.84), 0.08 + ((i * 0.53) % 0.3), size, track))

export const PACK_TEMPLATES: Template[] = [
  // wedding
  { id: 'wed-title', pack: 'wedding', name: 'Wedding title', emoji: '💍', desc: 'Couple names in gold with a date line and soft shehnai-style ding.', needsVideo: true,
    make: (D) => ({ clips: [
      text('hi-title', 'Rahul ❤ Priya', 0.3, Math.min(5, D), 0.42, { ...gold, size: 0.085, anim: 'fade', animDur: 1 }),
      text('subtitle', '12 · 02 · 2026  |  Jaipur', 0.9, Math.min(4.4, D), 0.58, { ...gold, size: 0.045, grad: undefined, anim: 'fade', animDur: 1 }, 'v3'),
      sticker('🌸', 0.2, Math.min(5, D), 0.2, 0.3, 0.13, 'v2'), sticker('🌸', 0.2, Math.min(5, D), 0.8, 0.3, 0.13, 'v2'),
      sfx('ding', 0.3),
    ] }) },
  { id: 'wed-save', pack: 'wedding', name: 'Save the date', emoji: '📅', desc: 'Save-the-date card with countdown style and hearts.', needsVideo: true,
    make: (D) => ({ clips: [
      text('title', 'SAVE THE DATE', 0, Math.min(3, D), 0.36, { ...gold, size: 0.07, upper: true, anim: 'pop', animDur: 0.5 }),
      text('hi-title', '14 February', Math.min(1.2, D / 3), Math.min(4, D), 0.5, { ...gold, anim: 'letters', animDur: 0.8 }, 'v3'),
      ...rain('💖', Math.min(5, D), 6, 'v2', 0.06), sfx('pop', 0),
    ] }) },
  { id: 'wed-thanks', pack: 'wedding', name: 'Thank-you ending', emoji: '🙏', desc: 'Warm “Thank you for blessing us” ending card.', needsVideo: true,
    make: (D) => ({ clips: [
      text('hi-title', 'आशीर्वाद के लिए धन्यवाद', end(D, 4), Math.min(4, D), 0.42, { ...gold, size: 0.075, anim: 'fade', animDur: 1 }),
      text('subtitle', 'With love, the families', end(D, 3.5), Math.min(3.5, D), 0.6, { ...gold, size: 0.042, grad: undefined }, 'v3'),
      sticker('💐', end(D, 4), Math.min(4, D), 0.5, 0.3, 0.14, 'v2'), sfx('ding', end(D, 4)),
    ] }) },
  // festival
  { id: 'fest-diwali', pack: 'festival', name: 'Happy Diwali', emoji: '🪔', desc: 'Diyas, sparkles and a big शुभ दीपावली greeting.', needsVideo: true,
    make: (D) => ({ clips: [
      text('hi-festive', 'शुभ दीपावली', 0.2, Math.min(5, D), 0.4, { ...desi, color: '#ffd23f', grad: '#ff7b00', anim: 'pop', animDur: 0.6 }),
      text('subtitle', 'Happy Diwali from our family ✨', 0.8, Math.min(4.4, D), 0.52, { ...desi, size: 0.045 }, 'v3'),
      sticker('🪔', 0.2, Math.min(5, D), 0.2, 0.7, 0.13, 'v2'), sticker('🪔', 0.2, Math.min(5, D), 0.8, 0.7, 0.13, 'v2'),
      ...rain('✨', Math.min(5, D), 6, 'v2', 0.05), sfx('boom', 0.2),
    ] }) },
  { id: 'fest-holi', pack: 'festival', name: 'Happy Holi', emoji: '🎨', desc: 'Rainbow “Happy Holi” with colour splashes.', needsVideo: true,
    make: (D) => ({ clips: [
      text('title', 'HAPPY HOLI', 0.2, Math.min(5, D), 0.4, { font: '"Baloo 2", "Arial Black", sans-serif', anim: 'rainbow', animDur: 0.5, color: '#ffffff', stroke: '#000', strokeW: 0.16 }),
      text('subtitle', 'बुरा न मानो होली है! 🎉', 0.8, Math.min(4.4, D), 0.52, { ...desi, size: 0.045 }, 'v3'),
      ...rain('🎨', Math.min(5, D), 4, 'v2', 0.09), ...rain('💦', Math.min(5, D), 3, 'v2', 0.07), sfx('pop', 0.2),
    ] }) },
  { id: 'fest-greet', pack: 'festival', name: 'Festival greeting', emoji: '🎉', desc: 'Any festival: Eid, Navratri, Pongal, Christmas – edit the words.', needsVideo: true,
    make: (D) => ({ clips: [
      text('hi-festive', 'त्योहार की शुभकामनाएँ', 0.2, Math.min(5, D), 0.4, { ...desi, size: 0.075, color: '#ffffff', grad: '#ffb703', anim: 'fade', animDur: 0.8 }),
      text('subtitle', 'From all of us at @yourchannel', 0.8, Math.min(4.4, D), 0.57, { ...desi, size: 0.042 }, 'v3'),
      ...rain('🎊', Math.min(5, D), 5, 'v2', 0.07), sfx('applause', 0.4),
    ] }) },
  // travel
  { id: 'trav-title', pack: 'travel', name: 'Trip title', emoji: '✈️', desc: 'Place name, dates and a plane flying in.', needsVideo: true,
    make: (D) => ({ clips: [
      text('title', 'MANALI', 0.2, Math.min(4, D), 0.4, { font: '"Baloo 2", "Arial Black", sans-serif', bold: true, size: 0.13, color: '#ffffff', stroke: '#000', strokeW: 0.06, shadow: true, anim: 'letters', animDur: 0.8 }),
      text('subtitle', 'Day 1  ·  3 friends  ·  1 car', 0.8, Math.min(3.4, D), 0.54, { anim: 'slide', animDur: 0.5 }, 'v3'),
      sticker('✈️', 0, Math.min(2, D), 0.85, 0.25, 0.1, 'v2'), sfx('whoosh', 0),
    ] }) },
  { id: 'trav-days', pack: 'travel', name: 'Day-by-day labels', emoji: '🗺️', desc: 'Day 1 / Day 2 / Day 3 labels spread across your video.', needsVideo: true,
    make: (D) => ({ clips: [0, 1, 2].map((i) => text('lower', `DAY ${i + 1} – Place`, (i * D) / 3, Math.min(3, D / 3), 0.8, { anim: 'slide', animDur: 0.4 }, i % 2 ? 'v3' : 'v4')).concat([0, 1, 2].map((i) => sfx('whoosh', (i * D) / 3))) }) },
  { id: 'trav-budget', pack: 'travel', name: 'Trip cost card', emoji: '💸', desc: 'Total trip cost and per-person split at the end.', needsVideo: true,
    make: (D) => ({ clips: [
      text('title', 'TOTAL: ₹18,500', end(D, 4), Math.min(4, D), 0.38, { size: 0.075, anim: 'pop', animDur: 0.4, color: '#22e05a' }),
      text('subtitle', '₹6,166 per person · stay + fuel + food', end(D, 3.6), Math.min(3.6, D), 0.54, {}, 'v3'),
      sticker('💸', end(D, 4), Math.min(4, D), 0.5, 0.22, 0.12, 'v2'), sfx('kaching', end(D, 4)),
    ] }) },
  // devotional
  { id: 'dev-title', pack: 'devotional', name: 'Aarti / bhajan title', emoji: '🙏', desc: 'Calm saffron title with a temple bell.', needsVideo: true,
    make: (D) => ({ clips: [
      text('hi-festive', 'जय श्री राम', 0.3, Math.min(5, D), 0.4, { ...desi, color: '#ffcf70', grad: '#ff7a00', anim: 'fade', animDur: 1.2 }),
      text('subtitle', 'सुबह की आरती', 1, Math.min(4.3, D), 0.52, { ...desi, size: 0.045 }, 'v3'),
      sticker('🛕', 0.3, Math.min(5, D), 0.5, 0.24, 0.14, 'v2'), sfx('gong', 0.3),
    ] }) },
  { id: 'dev-lyrics', pack: 'devotional', name: 'Bhajan lyric lines', emoji: '🎶', desc: 'Four lyric lines one after another – paste your own words.', needsVideo: true,
    make: (D) => ({ clips: ['पहली पंक्ति यहाँ', 'दूसरी पंक्ति यहाँ', 'तीसरी पंक्ति यहाँ', 'चौथी पंक्ति यहाँ'].map((l, i) => text('hi-sub', l, (i * D) / 4, D / 4, 0.8, { ...desi, size: 0.055, anim: 'fade', animDur: 0.5 }, i % 2 ? 'v3' : 'v4')) }) },
  { id: 'dev-blessing', pack: 'devotional', name: 'Blessing ending', emoji: '🌺', desc: '“Share with your family” ending with flowers.', needsVideo: true,
    make: (D) => ({ clips: [
      text('hi-festive', 'सबका मंगल हो 🙏', end(D, 4), Math.min(4, D), 0.42, { ...desi, size: 0.075, color: '#ffffff', grad: '#ffb703', anim: 'fade', animDur: 1 }),
      text('subtitle', 'Share with your family', end(D, 3.5), Math.min(3.5, D), 0.53, { ...desi, size: 0.042 }, 'v3'),
      ...rain('🌺', Math.min(4, D), 6, 'v2', 0.07).map((c) => ({ ...c, start: c.start + end(D, 4) })), sfx('ding', end(D, 4)),
    ] }) },
]

export function applyTemplate(id: string): string {
  const t = TEMPLATES.find((x) => x.id === id) ?? PACK_TEMPLATES.find((x) => x.id === id)
  if (!t) return ''
  const hasVideo = getState().project.clips.some((c) => c.kind === 'video' || c.kind === 'image')
  const D = Math.max(projectDuration(), t.needsVideo && !hasVideo ? 6 : 6)
  const r = t.make(D)
  addClipsBatch(r.clips, r.project)
  return t.needsVideo && !hasVideo
    ? `${t.name} added. Add your video to the Main track – the texts are placeholders you can edit on the right.`
    : `${t.name} added – click any text to edit it.`
}

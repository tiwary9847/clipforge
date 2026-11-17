import { addClipsBatch, baseClip, getState, projectDuration } from './store'
import { SFX_LIST, TEXT_PRESETS } from './library'
import { Clip, TextProps } from './types'

export interface Template {
  id: string
  name: string
  emoji: string
  desc: string
  needsVideo?: boolean
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
      clips: [text('meme-top', 'WHEN YOU…', 0, D, 0.12), text('meme-bottom', 'BUT THEN THIS HAPPENS', 0, D, 0.88, {}, 'v3')],
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

export function applyTemplate(id: string): string {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t) return ''
  const hasVideo = getState().project.clips.some((c) => c.kind === 'video' || c.kind === 'image')
  const D = Math.max(projectDuration(), t.needsVideo && !hasVideo ? 6 : 6)
  const r = t.make(D)
  addClipsBatch(r.clips, r.project)
  return t.needsVideo && !hasVideo
    ? `${t.name} added. Add your video to the Main track – the texts are placeholders you can edit on the right.`
    : `${t.name} added – click any text to edit it.`
}

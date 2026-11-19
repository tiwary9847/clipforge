// "Reply to a comment" sticker and chat-story videos (made-up chats that pop in message by message).
import { addAsset, baseClip, checkpoint, clipEnd, getPreset, getState, insertSilent } from './store'
import { engine } from './engine'
import { Clip } from './types'

const FONT = '"Segoe UI", Roboto, "Noto Sans", Arial, sans-serif'

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w
      if (g.measureText(t).width > maxW && line) {
        out.push(line)
        line = w
      } else line = t
    }
    out.push(line)
  }
  return out
}
const hue = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7)

async function addImage(cv: HTMLCanvasElement, name: string) {
  const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/png'))
  const a = await engine.importFile(new File([blob], name, { type: 'image/png' }))
  if (!a) throw new Error('Couldn’t make the picture.')
  addAsset(a)
  return a
}

/* ================= reply-to-comment sticker ================= */

export type ReplyStyle = 'light' | 'dark' | 'glass'
export function drawReply(name: string, comment: string, style: ReplyStyle): HTMLCanvasElement {
  const W = 900
  const cv = document.createElement('canvas')
  const g = cv.getContext('2d')!
  g.font = `600 44px ${FONT}`
  const lines = wrap(g, comment.trim() || '…', W - 96)
  const H = 150 + lines.length * 56 + 30
  cv.width = W
  cv.height = H + 26
  const bg = style === 'dark' ? '#1f1f23' : style === 'glass' ? 'rgba(255,255,255,0.82)' : '#ffffff'
  const fg = style === 'dark' ? '#ffffff' : '#111111'
  const sub = style === 'dark' ? '#a0a0aa' : '#6b6b75'
  g.shadowColor = 'rgba(0,0,0,0.28)'
  g.shadowBlur = 18
  g.fillStyle = bg
  rr(g, 8, 8, W - 16, H - 8, 34)
  g.fill()
  // little tail
  g.beginPath()
  g.moveTo(70, H - 2)
  g.lineTo(60, H + 22)
  g.lineTo(110, H - 2)
  g.fill()
  g.shadowColor = 'transparent'
  // avatar
  const h = hue(name)
  g.fillStyle = `hsl(${h} 70% 55%)`
  g.beginPath()
  g.arc(78, 78, 38, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff'
  g.font = `700 38px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText((name.replace(/^@/, '')[0] ?? '?').toUpperCase(), 78, 80)
  g.textAlign = 'left'
  g.fillStyle = sub
  g.font = `500 32px ${FONT}`
  const who = name.startsWith('@') ? name : '@' + name
  g.fillText(`Reply to ${who}’s comment`, 134, 80)
  g.fillStyle = fg
  g.font = `600 44px ${FONT}`
  g.textBaseline = 'alphabetic'
  lines.forEach((l, i) => g.fillText(l, 48, 176 + i * 56))
  return cv
}

export async function addReplySticker(name: string, comment: string, style: ReplyStyle): Promise<string> {
  if (!comment.trim()) throw new Error('Type the comment you are replying to.')
  const cv = drawReply(name.trim() || 'viewer', comment, style)
  const a = await addImage(cv, `Reply to ${name || 'comment'}.png`)
  const P = getPreset()
  const portrait = P.h > P.w
  const t = engine.time
  const busy = (tr: string) => getState().project.clips.some((c) => c.track === tr && c.start < t + 4 && clipEnd(c) > t)
  const track = ['v3', 'v2', 'v4'].find((x) => !busy(x)) ?? 'v3'
  checkpoint()
  insertSilent([
    baseClip('image', track, { assetId: a.id, label: `💬 Reply: ${comment.slice(0, 24)}`, start: t, dur: 4, scale: portrait ? 0.8 : 0.42, y: portrait ? 0.3 : 0.24, x: portrait ? 0.5 : 0.3, transIn: { type: 'zoom-in', dur: 0.3 }, transOut: { type: 'fade', dur: 0.25 } }),
    baseClip('sfx', 'a1', { sfxId: 'pop', label: 'Reply pop', start: t, dur: 0.5, volume: 0.5 } as Partial<Clip>),
  ])
  engine.requestRender()
  return 'Comment bubble added for 4 s at the playhead. Drag it, resize it or stretch the clip.'
}

/* ================= chat story ================= */

export type ChatStyle = 'green' | 'blue' | 'dark'
export interface ChatMsg {
  who: string
  me: boolean
  text: string
}

const ME = /^(me|main|i|mai|myself|me\s*\(.*\))$/i
export function parseChat(src: string): ChatMsg[] {
  const out: ChatMsg[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^([^:]{1,24}):\s*(.+)$/)
    if (m) out.push({ who: m[1].trim(), me: ME.test(m[1].trim()), text: m[2].trim() })
    else if (out.length) out[out.length - 1].text += '\n' + line
    else out.push({ who: 'Me', me: true, text: line })
  }
  return out
}

const THEMES: Record<ChatStyle, { bg: string; head: string; headFg: string; me: string; meFg: string; them: string; themFg: string; sub: string; bar: string }> = {
  green: { bg: '#ece5dd', head: '#0f6f63', headFg: '#ffffff', me: '#d6f8c8', meFg: '#111', them: '#ffffff', themFg: '#111', sub: '#d8efe9', bar: '#f6f6f6' },
  blue: { bg: '#ffffff', head: '#f5f5f7', headFg: '#111', me: '#1a8cff', meFg: '#fff', them: '#e9e9ed', themFg: '#111', sub: '#7a7a85', bar: '#f5f5f7' },
  dark: { bg: '#0d0d12', head: '#1b1b22', headFg: '#fff', me: '#7c3aed', meFg: '#fff', them: '#26262e', themFg: '#fff', sub: '#9a9aa8', bar: '#1b1b22' },
}

interface Laid {
  lines: string[]
  w: number
  h: number
}

function drawChat(W: number, H: number, msgs: ChatMsg[], upto: number, typing: ChatMsg | null, style: ChatStyle, title: string, group: boolean): HTMLCanvasElement {
  const u = W / 1080
  const th = THEMES[style]
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = th.bg
  g.fillRect(0, 0, W, H)
  if (style === 'green') {
    // soft doodle pattern
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    g.strokeStyle = 'rgba(0,0,0,0.045)'
    g.lineWidth = 3 * u
    for (let i = 0; i < 140; i++) {
      g.beginPath()
      g.arc(rnd() * W, rnd() * H, (6 + rnd() * 14) * u, 0, Math.PI * (1 + rnd()))
      g.stroke()
    }
  }
  const portrait = H > W
  const headH = (portrait ? 170 : 120) * u
  const top = portrait ? H * 0.05 : 0
  g.fillStyle = th.head
  g.fillRect(0, 0, W, top + headH)
  const cy = top + headH / 2
  g.fillStyle = `hsl(${hue(title)} 65% 55%)`
  g.beginPath()
  g.arc(110 * u, cy, 48 * u, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff'
  g.font = `700 ${44 * u}px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(title[0]?.toUpperCase() ?? '?', 110 * u, cy + 2 * u)
  g.fillStyle = th.headFg
  g.font = `600 ${44 * u}px ${FONT}`
  g.textAlign = 'left'
  g.fillText(title, 180 * u, cy - 20 * u)
  g.fillStyle = style === 'green' ? th.sub : th.sub
  g.font = `400 ${30 * u}px ${FONT}`
  g.fillText(typing ? (group ? `${typing.who} is typing…` : 'typing…') : 'online', 180 * u, cy + 26 * u)
  g.strokeStyle = th.headFg
  g.lineWidth = 6 * u
  g.beginPath()
  g.moveTo(50 * u, cy - 18 * u)
  g.lineTo(32 * u, cy)
  g.lineTo(50 * u, cy + 18 * u)
  g.stroke()

  // message area
  const fs = (portrait ? 44 : 36) * u
  const pad = 26 * u
  const gap = 16 * u
  const maxW = W * (portrait ? 0.72 : 0.55)
  const barH = 120 * u
  const areaTop = top + headH + 24 * u
  const areaBot = portrait ? H * 0.8 - barH - 20 * u : H - barH - 20 * u
  g.font = `400 ${fs}px ${FONT}`
  const shown = msgs.slice(0, upto)
  const laid: Laid[] = shown.map((m) => {
    const lines = wrap(g, m.text, maxW - pad * 2)
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + pad * 2
    const nameH = group && !m.me ? fs * 0.75 : 0
    return { lines, w: Math.max(w, 120 * u), h: lines.length * fs * 1.25 + pad * 1.4 + nameH }
  })
  const typH = 90 * u
  const total = laid.reduce((s, l) => s + l.h + gap, 0) + (typing ? typH + gap : 0)
  let y = areaTop + Math.min(0, areaBot - areaTop - total)
  g.save()
  g.beginPath()
  g.rect(0, areaTop - 10 * u, W, areaBot - areaTop + 20 * u)
  g.clip()
  shown.forEach((m, i) => {
    const L = laid[i]
    const x = m.me ? W - 36 * u - L.w : 36 * u
    if (y + L.h > areaTop - 20 * u) {
      g.fillStyle = m.me ? th.me : th.them
      g.shadowColor = 'rgba(0,0,0,0.12)'
      g.shadowBlur = 4 * u
      g.shadowOffsetY = 2 * u
      rr(g, x, y, L.w, L.h, 28 * u)
      g.fill()
      g.shadowColor = 'transparent'
      let ty = y + pad * 0.7
      if (group && !m.me) {
        g.fillStyle = `hsl(${hue(m.who)} 60% 42%)`
        g.font = `600 ${fs * 0.62}px ${FONT}`
        g.textBaseline = 'top'
        g.fillText(m.who, x + pad, ty)
        ty += fs * 0.75
      }
      g.fillStyle = m.me ? th.meFg : th.themFg
      g.font = `400 ${fs}px ${FONT}`
      g.textBaseline = 'top'
      L.lines.forEach((l, k) => g.fillText(l, x + pad, ty + k * fs * 1.25))
    }
    y += L.h + gap
  })
  if (typing) {
    const x = typing.me ? W - 36 * u - 150 * u : 36 * u
    g.fillStyle = typing.me ? th.me : th.them
    rr(g, x, y, 150 * u, typH, 30 * u)
    g.fill()
    g.fillStyle = typing.me ? th.meFg : th.sub
    for (let k = 0; k < 3; k++) {
      g.globalAlpha = 0.45 + 0.25 * k
      g.beginPath()
      g.arc(x + (45 + k * 30) * u, y + typH / 2, 10 * u, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }
  g.restore()
  // input bar
  const by = areaBot + 20 * u
  g.fillStyle = th.bar
  g.fillRect(0, by, W, barH)
  g.fillStyle = style === 'dark' ? '#2a2a33' : '#ffffff'
  rr(g, 30 * u, by + 18 * u, W - 60 * u, barH - 36 * u, (barH - 36 * u) / 2)
  g.fill()
  g.fillStyle = '#9a9aa5'
  g.font = `400 ${34 * u}px ${FONT}`
  g.textBaseline = 'middle'
  g.fillText('Message', 70 * u, by + barH / 2)
  if (portrait) {
    g.fillStyle = th.bg
    g.fillRect(0, by + barH, W, H - by - barH)
  }
  return cv
}

export interface ChatOpts {
  style: ChatStyle
  speed: 'slow' | 'normal' | 'fast'
  music: boolean
}

export async function makeChatStory(src: string, o: ChatOpts, status: (m: string) => void): Promise<string> {
  const msgs = parseChat(src)
  if (msgs.length < 2) throw new Error('Write at least 2 messages, one per line, like “Rahul: kal chalein?” and “Me: haan!”.')
  const others = [...new Set(msgs.filter((m) => !m.me).map((m) => m.who))]
  const group = others.length > 1
  const title = group ? others.slice(0, 3).join(', ') : others[0] ?? 'Chat'
  const P = getPreset()
  const k = o.speed === 'slow' ? 1.35 : o.speed === 'fast' ? 0.7 : 1
  const start = Math.max(0, ...getState().project.clips.filter((c) => c.track === 'v1').map(clipEnd))
  let t = start
  const made: Clip[] = []
  for (let i = 0; i < msgs.length; i++) {
    status(`Drawing message ${i + 1} of ${msgs.length}…`)
    const m = msgs[i]
    if (!m.me && i > 0) {
      const a = await addImage(drawChat(P.w, P.h, msgs, i, m, o.style, title, group), `Chat ${i}a.png`)
      const d = 0.75 * k
      made.push(baseClip('image', 'v1', { assetId: a.id, label: `💬 typing…`, start: t, dur: d, fit: 'cover' }))
      t += d
    }
    const a = await addImage(drawChat(P.w, P.h, msgs, i + 1, null, o.style, title, group), `Chat ${i + 1}.png`)
    const read = Math.min(4.5, Math.max(1.1, 0.7 + m.text.length * 0.055)) * k + (i === msgs.length - 1 ? 1.5 : 0)
    made.push(baseClip('image', 'v1', { assetId: a.id, label: `💬 ${m.who}: ${m.text.slice(0, 20)}`, start: t, dur: read, fit: 'cover' }))
    made.push(baseClip('sfx', 'a1', { sfxId: m.me ? 'pop' : 'ding', label: m.me ? 'Sent sound' : 'Message sound', start: t, dur: 0.5, volume: m.me ? 0.45 : 0.35 } as Partial<Clip>))
    t += read
  }
  checkpoint()
  insertSilent(made)
  let extra = ''
  if (o.music) {
    status('Adding music…')
    const { addMusic } = await import('./musicgen')
    await addMusic('lofi', 'video', 1, status)
    extra = ' with lo-fi music'
  }
  engine.requestRender()
  return `Chat story made: ${msgs.length} messages, ${(t - start).toFixed(0)} s${extra}. Each message is its own clip – stretch one to hold it longer. Add a voice-over or captions if you like.`
}

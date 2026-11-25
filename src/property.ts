// Property reel builder: a short form → hook, price tag, location pin, highlights one by one,
// Call / WhatsApp end card and a RERA line, timed to the length of the user's footage.
// Everything it adds is normal text/sound clips (editable), tagged tpl: 'property' so building again replaces them.
import { SFX_LIST } from './library'
import { TEXT_STYLES } from './textstyles'
import { addMusic, Mood } from './musicgen'
import { addLogo, loadBrand } from './tools2'
import { engine } from './engine'
import { baseClip, getPreset, getState, projectDuration, replaceTimeline } from './store'
import { Clip, TextProps } from './types'

export type PropLook = 'luxury' | 'bold' | 'clean'
export type PropLang = 'en' | 'hi'
export interface PropertyInfo {
  project: string // "Neo Urban Homes"
  kind: string // "2 BHK Independent Floor"
  price: string // "₹40 Lakh"
  onwards: boolean // "onwards" / "से शुरू"
  location: string // "Sector 144, Noida"
  highlights: string[] // up to 6
  phone: string
  badge: string // "Ready to move" (optional)
  rera: string // RERA registration no. (optional)
  look: PropLook
  lang: PropLang
  music: boolean
  logo: boolean
}

export const PROPERTY_KINDS = ['1 BHK Flat', '2 BHK Flat', '3 BHK Flat', '2 BHK Independent Floor', '3 BHK Independent Floor', 'Villa', 'Plot', 'Shop / Office']
export const PROPERTY_BADGES = ['', 'Ready to move', 'Booking open', 'Limited units', 'New launch', 'Possession soon', 'Loan available']
export const PROPERTY_HIGHLIGHTS = ['Near metro', 'Car parking', '24×7 security', 'Lift', 'Park facing', 'Modular kitchen', 'Power backup', 'Gated society', 'Loan available', 'Clear title']

const KEY = 'clipforge-property'
export const DEFAULT_PROPERTY: PropertyInfo = {
  project: '',
  kind: '2 BHK Flat',
  price: '',
  onwards: true,
  location: '',
  highlights: ['Near metro', 'Car parking', '24×7 security'],
  phone: '',
  badge: 'Ready to move',
  rera: '',
  look: 'bold',
  lang: 'en',
  music: true,
  logo: true,
}
export function loadProperty(): PropertyInfo {
  try {
    return { ...DEFAULT_PROPERTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_PROPERTY }
  }
}
export function saveProperty(p: PropertyInfo) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {}
}

const WORDS = {
  en: { onwards: 'onwards', call: 'CALL / WHATSAPP', in: 'in', tc: '*T&C apply · prices subject to change', price: 'Price' },
  hi: { onwards: 'से शुरू', call: 'अभी कॉल / WhatsApp करें', in: 'में', tc: '*नियम व शर्तें लागू', price: 'कीमत' },
}

/** Price as typed, with ₹ added when it's only numbers/words ("40 lakh" → "₹40 lakh"). */
export function niceRupees(p: string) {
  const s = p.trim()
  if (!s) return ''
  return /^[₹$]|^rs\.?\s/i.test(s) ? s.replace(/^rs\.?\s*/i, '₹') : '₹' + s
}

const style = (id: string) => (TEXT_STYLES.find((s) => s.id === id) ?? TEXT_STYLES[0]).props
const F = (name: string) => `${name}, "Noto Sans Devanagari", sans-serif`

interface Look {
  hook: Partial<TextProps>
  badge: Partial<TextProps>
  price: Partial<TextProps>
  loc: Partial<TextProps>
  hl: Partial<TextProps>
  call: Partial<TextProps>
  name: Partial<TextProps>
  mood: Mood
}
const LOOKS: Record<PropLook, Look> = {
  bold: {
    hook: { ...style('t-anton'), size: 0.08 },
    badge: { ...style('b-limited'), size: 0.045, loop: 'none' },
    price: { ...style('b-price'), size: 0.075 },
    loc: { ...style('b-loc'), size: 0.042 },
    hl: { ...style('t-hormozi'), size: 0.055, upper: false, anim: 'pop', animOut: 'fade' },
    call: { ...style('b-call'), size: 0.05 },
    name: { ...style('t-bebas'), size: 0.09 },
    mood: 'hype',
  },
  luxury: {
    hook: { ...style('e-luxe'), size: 0.075, color: '#f6dfa0', bg: '#0b0b0b', bgOpacity: 0.62, boxR: 0.2, boxPad: 1.4, shadow: true, shColor: '#000000', shBlur: 0.4 },
    badge: { font: F('Montserrat'), size: 0.036, color: '#1a1206', strokeW: 0, bg: '#e9c46a', bgOpacity: 1, boxR: 1, boxPad: 1.3, spacing: 0.12, upper: true, anim: 'fade' },
    price: { font: F('"Playfair Display"'), size: 0.07, color: '#1a1206', strokeW: 0, bg: '#f6dfa0', bgOpacity: 1, boxR: 0.2, boxPad: 1.3, anim: 'fade', animDur: 0.8 },
    loc: { font: F('Montserrat'), size: 0.038, color: '#f6dfa0', strokeW: 0, bg: '#0b0b0b', bgOpacity: 0.7, boxR: 1, boxPad: 1.3, anim: 'fade' },
    hl: { font: F('Montserrat'), size: 0.048, color: '#ffffff', strokeW: 0, bg: '#0b0b0b', bgOpacity: 0.72, boxR: 0.25, boxPad: 1.3, spacing: 0.04, anim: 'fade', animDur: 0.5, animOut: 'fade' },
    call: { font: F('Montserrat'), size: 0.048, color: '#1a1206', strokeW: 0, bg: '#e9c46a', bgOpacity: 1, boxR: 1, boxPad: 1.3, anim: 'fade' },
    name: { ...style('e-luxe'), size: 0.085, color: '#f6dfa0', bg: '#0b0b0b', bgOpacity: 0.62, boxR: 0.2, boxPad: 1.4, shadow: true, shColor: '#000000', shBlur: 0.4 },
    mood: 'cinematic',
  },
  clean: {
    hook: { ...style('t-pill'), size: 0.06 },
    badge: { ...style('b-new'), size: 0.042, loop: 'none', upper: true },
    price: { ...style('t-pill'), size: 0.07, color: '#0f766e', anim: 'pop' },
    loc: { ...style('t-pill'), size: 0.04 },
    hl: { ...style('t-pill'), size: 0.05, anim: 'slide', animOut: 'fade' },
    call: { ...style('b-call'), size: 0.05, loop: 'none' },
    name: { font: F('Poppins'), size: 0.075, color: '#ffffff', stroke: '#000000', strokeW: 0.06, shadow: true },
    mood: 'vlog',
  },
}

const sfx = (id: string, start: number): Clip | null => {
  const def = SFX_LIST.find((s) => s.id === id)
  return def ? baseClip('sfx', 'a1', { sfxId: id, label: def.name, start, dur: def.dur, tpl: 'property' }) : null
}

/** Shrinks text until every typed line fits on one line inside the frame; returns size and block height (fraction of H). */
let mctx: CanvasRenderingContext2D | null = null
function fit(tp: TextProps, W: number, H: number, maxW = 0.86): { size: number; h: number } {
  mctx ??= document.createElement('canvas').getContext('2d')
  const want = tp.text.split('\n').length
  let size = tp.size
  for (let i = 0; i < 30 && mctx; i++) {
    const l = engine.layoutText(mctx, { ...tp, size, maxW: 5 }, W, H)
    if (l.lines.length <= want && l.w <= maxW * W) return { size, h: l.h / H }
    size *= 0.93
  }
  const l = mctx ? engine.layoutText(mctx, { ...tp, size, maxW: 5 }, W, H) : null
  return { size, h: l ? l.h / H : size * 1.3 * want }
}

/** The clips for a property reel `D` seconds long. Pure – no store changes. */
export function propertyClips(p: PropertyInfo, D: number, W = 1080, H = 1920): Clip[] {
  const L = LOOKS[p.look]
  const w = WORDS[p.lang]
  // every block is sized to fit (one typed line = one line on screen); returns the clip and its height
  const block = (track: string, str: string, start: number, dur: number, y: number, props: Partial<TextProps>, maxW = 0.86) => {
    const tp: TextProps = { ...style('c-white'), ...props, text: str }
    const f = fit(tp, W, H, maxW)
    const clip = baseClip('text', track, {
      label: str.replace(/\n/g, ' ').slice(0, 40),
      start,
      dur: Math.max(0.5, dur),
      y,
      text: { ...tp, size: f.size, maxW: Math.max(tp.maxW, maxW) },
      transIn: { type: 'none', dur: 0 },
      tpl: 'property',
    })
    return { clip, h: f.h }
  }
  const txt = (track: string, str: string, start: number, dur: number, y: number, props: Partial<TextProps>) => block(track, str, start, dur, y, props).clip
  const out: (Clip | null)[] = []
  const kind = p.kind.trim()
  const loc = p.location.trim()
  const price = niceRupees(p.price)
  const hls = p.highlights.map((h) => h.trim()).filter(Boolean).slice(0, 6)

  // timing that fits any length (very short clips drop the middle part first)
  const endLen = Math.min(5, Math.max(2.5, D * 0.22))
  const hookLen = Math.min(3.5, Math.max(1.8, D * 0.15))
  const priceLen = price ? Math.min(3.5, Math.max(1.8, D * 0.15)) : 0
  const midA = hookLen + priceLen
  const midB = Math.max(midA, D - endLen)
  const n = Math.min(hls.length, Math.floor((midB - midA) / 1.4))

  // 1 · hook
  const hook = kind && loc ? (p.lang === 'hi' ? `${loc} ${w.in}\n${kind}` : `${kind}\n${w.in} ${loc}`) : kind || loc || p.project || 'New property'
  const hk = block('v4', hook, 0, hookLen, 0.45, { ...L.hook, anim: L.hook.anim ?? 'pop' })
  out.push(hk.clip)
  if (p.badge.trim()) {
    const bd = block('v3', p.badge.trim(), 0.25, hookLen - 0.25, 0, L.badge, 0.7)
    bd.clip.y = Math.max(0.1, 0.45 - hk.h / 2 - 0.025 - bd.h / 2)
    out.push(bd.clip)
  }
  out.push(sfx('whoosh', 0))

  // 2 · price
  if (price) {
    out.push(txt('v4', `${price}${p.onwards ? ' ' + w.onwards : ''}*`, hookLen, priceLen, 0.6, L.price))
    out.push(sfx('kaching', hookLen + 0.1))
  }

  // 3 · location pin for the middle part + highlights one by one
  if (loc && midB - hookLen > 1) out.push(txt('v3', `📍 ${loc}`, hookLen, midB - hookLen, 0.13, L.loc))
  if (n > 0) {
    // evenly spread; each shows ≤ 3.2 s so long videos don't keep one line up for ages
    const slot = (midB - midA) / n
    const each = Math.min(3.2, slot)
    hls.slice(0, n).forEach((h, i) => {
      const at = midA + i * slot + (slot - each) / 2
      out.push(txt('v4', `✅ ${h}`, at, each, 0.72, L.hl))
      out.push(sfx('pop', at))
    })
  }

  // 4 · end card
  const callLine = p.phone.trim() ? `📞 ${w.call}\n${p.phone.trim()}` : `📞 ${w.call}`
  // end card: name + price block, then the call button right under it, centred together
  const head = [p.project.trim(), price ? `${price}${p.onwards ? ' ' + w.onwards : ''}*` : ''].filter(Boolean)
  const call = block('v4', callLine, midB, D - midB, 0, L.call, 0.8)
  const nm = head.length ? block('v3', head.join('\n'), midB, D - midB, 0, { ...L.name, size: (L.name.size ?? 0.08) * (head.length > 1 ? 0.8 : 1), anim: 'fade', animDur: 0.6 }) : null
  const gap = 0.03
  const total = (nm ? nm.h + gap : 0) + call.h
  let top = 0.5 - total / 2
  if (nm) {
    nm.clip.y = top + nm.h / 2
    top += nm.h + gap
    out.push(nm.clip)
  }
  call.clip.y = top + call.h / 2
  out.push(call.clip)
  out.push(sfx('ding', midB))

  // 5 · small print for the whole video (RERA number must be shown in property ads)
  const small = [p.rera.trim() ? `RERA: ${p.rera.trim()}` : '', price ? w.tc : ''].filter(Boolean).join('  ·  ')
  if (small) out.push(block('v2', small, 0, D, 0.965, { font: F('Montserrat'), size: 0.024, bold: true, color: '#ffffff', stroke: '#000000', strokeW: 0.15, bg: '#000000', bgOpacity: 0, anim: 'none', maxW: 0.94 }, 0.94).clip)
  return out.filter((c): c is Clip => !!c)
}

/** Builds (or rebuilds) the reel on the current project. Returns a message for the user. */
export async function buildPropertyReel(p: PropertyInfo, status: (m: string) => void = () => {}): Promise<string> {
  saveProperty(p)
  const st = getState().project
  const own = st.clips.filter((c) => !c.tpl || c.tpl !== 'property')
  const hasFootage = own.some((c) => c.track === 'v1' && (c.kind === 'video' || c.kind === 'image'))
  if (!hasFootage) throw new Error('Add your property video or photos first (Media → Import), then build the reel.')
  const D = Math.max(4, projectDuration(own))
  // load the look's fonts first so text is measured with the real letters
  const fonts = Object.values(LOOKS[p.look]).map((x) => (typeof x === 'object' && x && 'font' in x ? (x as Partial<TextProps>).font : '')).filter(Boolean) as string[]
  await Promise.all(fonts.map((f) => document.fonts.load(`700 60px ${f}`, 'Aa ₹ अ').catch(() => [])))
  const pr = getPreset()
  replaceTimeline([...own, ...propertyClips(p, D, pr.w, pr.h)], { markers: st.markers })
  const extra: string[] = []
  if (p.music && !own.some((c) => c.track === 'a2' && c.kind === 'audio')) {
    try {
      status('Making background music…')
      await addMusic(LOOKS[p.look].mood, 'video', Math.floor(Math.random() * 1e6), status)
      extra.push('music')
    } catch {}
  }
  if (p.logo) {
    const b = loadBrand()
    if (b.logo && !getState().project.clips.some((c) => c.label === 'Logo watermark')) {
      try {
        await addLogo(b)
        extra.push('your logo')
      } catch {}
    }
  }
  return `Property reel ready (${Math.round(D)} s)${extra.length ? ' with ' + extra.join(' and ') : ''} – press ▶ to watch. Click any text to change it, or edit the form and build again.`
}

/** Removes everything the builder added. */
export function removePropertyReel(): string {
  const st = getState().project
  const keep = st.clips.filter((c) => c.tpl !== 'property')
  if (keep.length === st.clips.length) return 'Nothing to remove.'
  replaceTimeline(keep, { markers: st.markers })
  return 'Property reel texts and sounds removed.'
}

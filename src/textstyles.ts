// One-tap text styles for the Text tab, grouped the way creators look for them.
// Every style is plain TextProps, so it can be edited afterwards like any other text.
import { TextPreset } from './library'
import { TextProps } from './types'

const F = (name: string) => `${name}, "Noto Sans Devanagari", sans-serif`
const base: TextProps = {
  text: 'Your text',
  font: F('Montserrat'),
  size: 0.075,
  color: '#ffffff',
  stroke: '#000000',
  strokeW: 0.1,
  bg: '#000000',
  bgOpacity: 0,
  bold: true,
  italic: false,
  upper: false,
  align: 'center',
  shadow: false,
  maxW: 0.86,
}
const S = (id: string, name: string, y: number, p: Partial<TextProps>): TextPreset => ({ id, name, y, props: { ...base, ...p } })

export const STYLE_GROUPS = ['Trending', 'Captions', 'Titles', 'Neon & glow', 'Business & sale', 'Fun', 'Elegant', 'Gaming', 'हिन्दी'] as const
export type StyleGroup = (typeof STYLE_GROUPS)[number]

export const TEXT_STYLES: (TextPreset & { group: StyleGroup })[] = [
  // ---- Trending ----
  { group: 'Trending', ...S('t-beast', 'MrBeast yellow', 0.3, { text: 'I SPENT 24 HOURS', font: F('Luckiest Guy'), size: 0.09, color: '#ffe600', stroke: '#000000', strokeW: 0.16, upper: true, shadow: true, shColor: '#000000', shBlur: 0, shX: 0.05, shY: 0.08 }) },
  { group: 'Trending', ...S('t-hormozi', 'Hormozi box', 0.65, { text: 'This changes everything', font: F('Montserrat'), size: 0.06, color: '#ffffff', strokeW: 0, bg: '#7c3aed', bgOpacity: 1, boxR: 0.2, upper: true }) },
  { group: 'Trending', ...S('t-bebas', 'Clean tall', 0.3, { text: 'WAIT FOR IT', font: F('"Bebas Neue"'), size: 0.12, bold: false, color: '#ffffff', strokeW: 0, spacing: 0.06, shadow: true, shColor: '#000000', shBlur: 0.35, shY: 0.04 }) },
  { group: 'Trending', ...S('t-anton', 'Viral title', 0.3, { text: 'NOBODY TALKS ABOUT THIS', font: F('Anton'), size: 0.085, bold: false, color: '#ffffff', stroke: '#000000', strokeW: 0.12, upper: true, grad: '#ffd400' }) },
  { group: 'Trending', ...S('t-pill', 'White pill', 0.7, { text: 'POV: you found the best deal', font: F('Poppins'), size: 0.05, color: '#111111', strokeW: 0, bg: '#ffffff', bgOpacity: 1, boxR: 1, boxPad: 1.3 }) },
  { group: 'Trending', ...S('t-3d', '3D pop', 0.3, { text: 'BOOM!', font: F('Bangers'), size: 0.14, bold: false, color: '#ffd400', stroke: '#000000', strokeW: 0.08, spacing: 0.04, shadow: true, shColor: '#ff2d55', shBlur: 0, shX: 0.06, shY: 0.07, loop: 'pulse' }) },

  // ---- Captions ----
  { group: 'Captions', ...S('c-white', 'Bold white', 0.72, { text: 'Aaj hum Noida ja rahe hain', font: F('Montserrat'), size: 0.05, color: '#ffffff', stroke: '#000000', strokeW: 0.14 }) },
  { group: 'Captions', ...S('c-yellow', 'Yellow pop', 0.72, { text: 'Yeh dekho kya mila!', font: F('Poppins'), size: 0.052, color: '#ffe600', stroke: '#000000', strokeW: 0.16, upper: true }) },
  { group: 'Captions', ...S('c-boxed', 'Black box', 0.75, { text: 'Subscribe for part 2', font: F('Poppins'), size: 0.045, color: '#ffffff', strokeW: 0, bg: '#000000', bgOpacity: 0.78, boxR: 0.3 }) },
  { group: 'Captions', ...S('c-shadow', 'Soft shadow', 0.75, { text: 'Clean and easy to read', font: F('Montserrat'), size: 0.048, color: '#ffffff', strokeW: 0, shadow: true, shColor: '#000000', shBlur: 0.45, shY: 0.05 }) },
  { group: 'Captions', ...S('c-outline2', 'Double outline', 0.72, { text: 'Watch till the end', font: F('Montserrat'), size: 0.052, color: '#ffffff', stroke: '#000000', strokeW: 0.1, stroke2: '#ff2d55', stroke2W: 0.09, upper: true }) },

  // ---- Titles ----
  { group: 'Titles', ...S('ti-cinema', 'Cinematic', 0.45, { text: 'THE JOURNEY', font: F('"Bebas Neue"'), size: 0.13, bold: false, color: '#f5f5f5', strokeW: 0, spacing: 0.35, anim: 'fade', animDur: 1.2, animOut: 'fade' }) },
  { group: 'Titles', ...S('ti-chapter', 'Chapter', 0.45, { text: 'Part 1 · The plan', font: F('Oswald'), size: 0.065, color: '#ffffff', strokeW: 0, bg: '#ff2d55', bgOpacity: 1, boxR: 0, upper: true, spacing: 0.05, anim: 'slide' }) },
  { group: 'Titles', ...S('ti-lower', 'Lower third', 0.84, { text: 'Rahul Sharma · Founder', font: F('Montserrat'), size: 0.04, color: '#ffffff', strokeW: 0, bg: '#111111', bgOpacity: 0.85, boxR: 0.15, align: 'left', anim: 'slide', animOut: 'fade' }) },
  { group: 'Titles', ...S('ti-grad', 'Sunset gradient', 0.35, { text: 'Goa Diaries', font: F('Pacifico'), size: 0.11, bold: false, color: '#ffd166', grad: '#ef476f', stroke: '#2b0a3d', strokeW: 0.06, shadow: true, shColor: '#00000080', shBlur: 0.3 }) },
  { group: 'Titles', ...S('ti-number', 'Big number', 0.4, { text: '₹40 LAKH', font: F('Anton'), size: 0.16, bold: false, color: '#22e05a', stroke: '#000000', strokeW: 0.08, shadow: true, shColor: '#000000', shBlur: 0, shY: 0.07, anim: 'pop' }) },

  // ---- Neon & glow ----
  { group: 'Neon & glow', ...S('n-pink', 'Neon pink', 0.4, { text: 'Night out', font: F('Righteous'), size: 0.1, bold: false, color: '#ffe3f4', strokeW: 0, glow: '#ff2bd6', glowAmt: 0.9 }) },
  { group: 'Neon & glow', ...S('n-cyan', 'Neon cyan', 0.4, { text: 'OPEN 24/7', font: F('Russo One'), size: 0.09, bold: false, color: '#e0fcff', strokeW: 0, glow: '#00e5ff', glowAmt: 0.9, loop: 'blink' }) },
  { group: 'Neon & glow', ...S('n-gold', 'Golden glow', 0.4, { text: 'Grand Opening', font: F('"Playfair Display"'), size: 0.09, color: '#fff2b0', grad: '#d99a00', strokeW: 0, glow: '#ffb703', glowAmt: 0.6 }) },
  { group: 'Neon & glow', ...S('n-green', 'Toxic green', 0.4, { text: 'LEVEL UP', font: F('Bungee'), size: 0.09, bold: false, color: '#d9ffd0', strokeW: 0, glow: '#39ff14', glowAmt: 1 }) },

  // ---- Business & sale ----
  { group: 'Business & sale', ...S('b-price', 'Price tag', 0.6, { text: '₹49,99,000 only', font: F('Montserrat'), size: 0.06, color: '#111111', strokeW: 0, bg: '#ffd400', bgOpacity: 1, boxR: 0.25, boxPad: 1.2, anim: 'pop', loop: 'pulse' }) },
  { group: 'Business & sale', ...S('b-sale', 'SALE', 0.35, { text: '50% OFF', font: F('Anton'), size: 0.14, bold: false, color: '#ffffff', strokeW: 0, bg: '#e11d48', bgOpacity: 1, boxR: 0.1, anim: 'pop', loop: 'heartbeat' }) },
  { group: 'Business & sale', ...S('b-sold', 'SOLD OUT stamp', 0.4, { text: 'SOLD OUT', font: F('"Archivo Black"'), size: 0.1, bold: false, color: '#e11d48', stroke: '#e11d48', strokeW: 0, bg: '#ffffff', bgOpacity: 0.9, boxR: 0.08, curve: 0, spacing: 0.08, anim: 'pop' }) },
  { group: 'Business & sale', ...S('b-limited', 'Limited offer', 0.25, { text: 'LIMITED OFFER ⏳', font: F('Oswald'), size: 0.06, color: '#ffffff', strokeW: 0, bg: '#111111', bgOpacity: 1, boxR: 1, boxPad: 1.2, upper: true, loop: 'blink' }) },
  { group: 'Business & sale', ...S('b-call', 'Call / WhatsApp', 0.82, { text: '📞 Call / WhatsApp: 98XXXXXXXX', font: F('Poppins'), size: 0.042, color: '#ffffff', strokeW: 0, bg: '#16a34a', bgOpacity: 1, boxR: 1, boxPad: 1.2, anim: 'slide', loop: 'pulse' }) },
  { group: 'Business & sale', ...S('b-loc', 'Location pin', 0.15, { text: '📍 Noida Sector 144', font: F('Poppins'), size: 0.045, color: '#111111', strokeW: 0, bg: '#ffffff', bgOpacity: 0.95, boxR: 1, boxPad: 1.2, anim: 'slide' }) },
  { group: 'Business & sale', ...S('b-new', 'NEW badge', 0.2, { text: 'NEW', font: F('"Archivo Black"'), size: 0.07, bold: false, color: '#111111', strokeW: 0, bg: '#22e05a', bgOpacity: 1, boxR: 0.2, loop: 'swing' }) },

  // ---- Fun ----
  { group: 'Fun', ...S('f-comic', 'Comic', 0.35, { text: 'KAPOW!', font: F('Bangers'), size: 0.13, bold: false, color: '#ffe600', stroke: '#000000', strokeW: 0.12, stroke2: '#ff2d55', stroke2W: 0.08, spacing: 0.04, anim: 'pop', loop: 'jelly' }) },
  { group: 'Fun', ...S('f-bubble', 'Bubble', 0.4, { text: 'So cute 🥹', font: F('Fredoka'), size: 0.09, color: '#ff7eb6', stroke: '#ffffff', strokeW: 0.16, shadow: true, shColor: '#ff7eb680', shBlur: 0.2, loop: 'float' }) },
  { group: 'Fun', ...S('f-marker', 'Marker', 0.4, { text: 'my honest review', font: F('"Permanent Marker"'), size: 0.08, bold: false, color: '#ffffff', strokeW: 0, bg: '#ff2d55', bgOpacity: 1, boxR: 0.1 }) },
  { group: 'Fun', ...S('f-hand', 'Handwritten', 0.4, { text: 'tasty af', font: F('Caveat'), size: 0.11, color: '#ffffff', strokeW: 0, shadow: true, shColor: '#000000', shBlur: 0.25, shY: 0.04 }) },
  { group: 'Fun', ...S('f-wave', 'Wavy rainbow', 0.4, { text: 'PARTY TIME', font: F('"Luckiest Guy"'), size: 0.1, color: '#ffffff', stroke: '#000000', strokeW: 0.14, anim: 'rainbow' }) },

  // ---- Elegant ----
  { group: 'Elegant', ...S('e-wedding', 'Wedding gold', 0.42, { text: 'Rahul & Priya', font: F('"Dancing Script"'), size: 0.11, color: '#fff2b0', grad: '#d99a00', strokeW: 0, shadow: true, shColor: '#3a2400', shBlur: 0.25, shY: 0.04, anim: 'fade', animDur: 1.4 }) },
  { group: 'Elegant', ...S('e-luxe', 'Luxury serif', 0.42, { text: 'The Residence', font: F('"Playfair Display"'), size: 0.09, color: '#ffffff', strokeW: 0, spacing: 0.08, anim: 'fade', animDur: 1.2, animOut: 'fade' }) },
  { group: 'Elegant', ...S('e-script', 'Script', 0.42, { text: 'Thank you', font: F('Lobster'), size: 0.11, bold: false, color: '#ffffff', strokeW: 0, glow: '#ffffff', glowAmt: 0.3 }) },
  { group: 'Elegant', ...S('e-minimal', 'Minimal', 0.5, { text: 'less is more', font: F('Montserrat'), size: 0.05, bold: false, color: '#ffffff', strokeW: 0, spacing: 0.3, upper: true, anim: 'fade', animOut: 'fade' }) },

  // ---- Gaming ----
  { group: 'Gaming', ...S('g-victory', 'Victory', 0.35, { text: 'VICTORY ROYALE', font: F('Teko'), size: 0.13, color: '#ffffff', grad: '#ffd400', stroke: '#2b1b00', strokeW: 0.08, spacing: 0.04, anim: 'pop' }) },
  { group: 'Gaming', ...S('g-glitch', 'Cyber', 0.35, { text: 'GAME OVER', font: F('"Russo One"'), size: 0.1, bold: false, color: '#ffffff', strokeW: 0, shadow: true, shColor: '#00e5ff', shBlur: 0, shX: -0.04, shY: 0, glow: '#ff2bd6', glowAmt: 0.4, loop: 'shake' }) },
  { group: 'Gaming', ...S('g-kanit', 'Headshot', 0.35, { text: 'HEADSHOT!', font: F('Kanit'), size: 0.11, color: '#ff3b3b', stroke: '#000000', strokeW: 0.12, italic: true, anim: 'pop', loop: 'heartbeat' }) },

  // ---- हिन्दी ----
  { group: 'हिन्दी', ...S('h-dhamaka', 'धमाका', 0.35, { text: 'धमाकेदार ऑफर!', font: F('"Baloo 2"'), size: 0.1, color: '#ffe600', stroke: '#b00000', strokeW: 0.14, shadow: true, shColor: '#000000', shBlur: 0, shY: 0.06, anim: 'pop', loop: 'pulse' }) },
  { group: 'हिन्दी', ...S('h-shubh', 'शुभकामनाएँ', 0.4, { text: 'शुभकामनाएँ', font: F('"Yatra One"'), size: 0.11, color: '#fff2b0', grad: '#ff7a00', stroke: '#5a1a00', strokeW: 0.1, glow: '#ffb703', glowAmt: 0.4 }) },
  { group: 'हिन्दी', ...S('h-sub', 'हिंदी कैप्शन', 0.75, { text: 'आज हम नोएडा जा रहे हैं', font: F('Mukta'), size: 0.052, color: '#ffffff', stroke: '#000000', strokeW: 0.14 }) },
  { group: 'हिन्दी', ...S('h-quote', 'सुविचार', 0.45, { text: 'मेहनत का फल मीठा होता है', font: F('"Rozha One"'), size: 0.075, color: '#ffffff', strokeW: 0, bg: '#000000', bgOpacity: 0.6, boxR: 0.2, anim: 'fade', animDur: 1.2 }) },
]

// Personal look & layout settings (saved in this browser, not in the project).
import { useSyncExternalStore } from 'react'

export type Skin = 'aurora' | 'midnight' | 'oled' | 'light' | 'paper'
export type AccentId = 'violet' | 'blue' | 'teal' | 'green' | 'orange' | 'pink' | 'red'
export type Size = 'sm' | 'md' | 'lg' | 'xl'

export interface Settings {
  skin: Skin | ''
  lastDark: Skin
  lastLight: Skin
  accent: AccentId
  uiSize: Size
  trackH: Size
  tlH: number // desktop timeline height (px); 0 = auto (fits the screen)
  tlHm: number // phone timeline height (px); 0 = auto
  leftW: number // width of the left panel (px)
  tall: boolean // side panels run the full height (timeline only under the preview)
  hints: boolean
  toolsOpen: boolean // show every tool expanded (classic long list)
  pins: string[]
  hidden: string[]
  closedSecs: string[]
  motion: boolean
  lang: 'en' | 'hinglish' | 'hi' // interface language
  nextSteps: boolean // the 'Next:' tip row under the preview
  mode: 'basic' | 'advanced' // Basic shows only the everyday tabs, tools and options
}

/* ---------- Basic mode: what stays visible ---------- */
export const BASIC_TABS = ['media', 'text', 'captions', 'audio', 'memes', 'gifs', 'tools']
export const BASIC_TOOLS = ['autopilot', 'ready', 'comments', 'mutecheck', 'ghost', 'music', 'musiclib', 'zooms', 'thumb', 'titles']
export const BASIC_SECS = new Set(['Canvas · platform', 'Quick start', 'Timing', 'Text', 'Text animation', 'Sticker', 'Transform', 'Crop', 'Speed', 'Audio', 'Volume (all audio clips)', 'Filters & colour', 'Transitions', '🎙 Studio voice'])
export const isBasic = () => state.mode === 'basic'
export const useBasic = () => useSettings((s) => s.mode === 'basic')

export const SKINS: { id: Skin; name: string; dark: boolean; sw: [string, string, string] }[] = [
  { id: 'aurora', name: 'Aurora', dark: true, sw: ['#08090d', '#12141c', '#8b6cff'] },
  { id: 'midnight', name: 'Midnight', dark: true, sw: ['#060b1d', '#0e1630', '#3b82f6'] },
  { id: 'oled', name: 'Pure black', dark: true, sw: ['#000000', '#0a0a0a', '#ffffff'] },
  { id: 'light', name: 'Light', dark: false, sw: ['#f4f5fa', '#ffffff', '#7b5cf5'] },
  { id: 'paper', name: 'Warm paper', dark: false, sw: ['#f3ede3', '#fffcf6', '#c2410c'] },
]

export const ACCENTS: { id: AccentId; name: string; a: string; b: string; c: string; soft: string; deep: string }[] = [
  { id: 'violet', name: 'Violet', a: '#8b6cff', b: '#c25cff', c: '#ff5c9a', soft: '#d2c6ff', deep: '#5b3fe0' },
  { id: 'blue', name: 'Blue', a: '#3b82f6', b: '#6366f1', c: '#22d3ee', soft: '#bfdbfe', deep: '#1d4ed8' },
  { id: 'teal', name: 'Teal', a: '#14b8a6', b: '#06b6d4', c: '#84cc16', soft: '#99f6e4', deep: '#0f766e' },
  { id: 'green', name: 'Green', a: '#22c55e', b: '#10b981', c: '#facc15', soft: '#bbf7d0', deep: '#15803d' },
  { id: 'orange', name: 'Orange', a: '#f97316', b: '#f59e0b', c: '#ef4444', soft: '#fed7aa', deep: '#c2410c' },
  { id: 'pink', name: 'Pink', a: '#ec4899', b: '#d946ef', c: '#f97316', soft: '#fbcfe8', deep: '#be185d' },
  { id: 'red', name: 'Red', a: '#ef4444', b: '#f43f5e', c: '#f59e0b', soft: '#fecaca', deep: '#b91c1c' },
]

export const UI_ZOOM: Record<Size, number> = { sm: 0.9, md: 1, lg: 1.12, xl: 1.25 }
export const TRACK_PX: Record<Size, [number, number]> = { sm: [32, 28], md: [40, 34], lg: [54, 44], xl: [70, 56] } // [desktop, phone]

const KEY = 'clipforge-settings'
const DEFAULTS: Settings = {
  skin: '',
  lastDark: 'aurora',
  lastLight: 'light',
  accent: 'violet',
  uiSize: 'md',
  trackH: 'md',
  tlH: 0,
  tlHm: 0,
  leftW: 340,
  tall: true,
  hints: true,
  lang: 'en',
  nextSteps: true,
  toolsOpen: false,
  pins: ['assistant', 'retention', 'ready', 'music'],
  hidden: [],
  closedSecs: [],
  motion: true,
  mode: 'basic',
}

let state: Settings = load()
const subs = new Set<() => void>()

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    // older versions only stored light/dark
    const old = localStorage.getItem('clipforge-theme')
    if (!s.skin && old) s.skin = old === 'light' ? 'light' : 'aurora'
    // the old fixed defaults become "auto", so the video gets more room on smaller screens
    if (s.tlH === 312) s.tlH = 0
    if (s.tlHm === 290) s.tlHm = 0
    // Basic/Advanced came later: people who already used the app keep everything (Advanced);
    // brand-new visitors start in Basic. Decided once and saved.
    if (!s.mode) {
      const used = Object.keys(s).length > 0 || Object.keys(localStorage).some((k) => k.startsWith('clipforge-') && k !== KEY)
      s.mode = used ? 'advanced' : 'basic'
      localStorage.setItem(KEY, JSON.stringify({ ...DEFAULTS, ...s }))
    }
    return { ...DEFAULTS, ...s }
  } catch {
    return { ...DEFAULTS }
  }
}

export const getSettings = () => state
/** Timeline height in use. Auto leaves the video about 55–60 % of the screen height. */
export function timelineHeight(phone: boolean): number {
  const v = phone ? state.tlHm : state.tlH
  if (v) return v
  const H = typeof innerHeight === 'number' ? innerHeight : 900
  return phone ? Math.round(Math.min(250, Math.max(165, H * 0.26))) : Math.round(Math.min(312, Math.max(200, H * 0.3)))
}
export function setSettings(p: Partial<Settings>) {
  state = { ...state, ...p }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
  applySettings()
  subs.forEach((f) => f())
}
export function resetSettings() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem('clipforge-theme')
  } catch {}
  state = { ...DEFAULTS }
  applySettings()
  subs.forEach((f) => f())
}
export function useSettings<T>(pick: (s: Settings) => T): T {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => pick(state),
  )
}

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}
const prefersLight = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches

/** The skin in use (follows the device's light/dark setting until one is picked). */
export function activeSkin(): Skin {
  return state.skin || (prefersLight() ? state.lastLight : state.lastDark)
}

export function applySettings() {
  const root = document.documentElement
  const skin = activeSkin()
  const sk = SKINS.find((s) => s.id === skin)!
  root.dataset.theme = sk.dark ? 'dark' : 'light'
  root.dataset.skin = skin
  root.dataset.ui = state.uiSize
  root.dataset.hints = state.hints ? 'on' : 'off'
  root.dataset.motion = state.motion ? 'on' : 'off'
  root.dataset.tall = state.tall ? 'on' : 'off'
  root.dataset.mode = state.mode
  const A = ACCENTS.find((a) => a.id === state.accent) ?? ACCENTS[0]
  // pure black looks best with a softer accent ring; light skins use the deeper shade for text
  const st = root.style
  st.setProperty('--accent', A.a)
  st.setProperty('--accent2', A.c)
  st.setProperty('--acc3', A.c)
  st.setProperty('--acc-rgb', rgb(A.a))
  st.setProperty('--acc2-rgb', rgb(A.b))
  st.setProperty('--acc3-rgb', rgb(A.c))
  st.setProperty('--acc-soft', sk.dark ? A.soft : A.deep)
  st.setProperty('--acc-deep', A.deep)
  st.setProperty('--grad', `linear-gradient(135deg, ${A.a} 0%, ${A.b} 55%, ${A.c} 100%)`)
  st.setProperty('--glow', `0 0 0 1px rgba(${rgb(A.a)}, 0.45), 0 8px 28px -6px rgba(${rgb(A.a)}, 0.55)`)
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 820px)').matches
  st.setProperty('--tl-h', `${timelineHeight(false)}px`)
  st.setProperty('--tl-hm', `${timelineHeight(true)}px`)
  st.setProperty('--left-w', `${Math.round(state.leftW)}px`)
  st.setProperty('--row-h', `${TRACK_PX[state.trackH][phone ? 1 : 0]}px`)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sk.dark ? sk.sw[1] : '#ffffff')
  window.dispatchEvent(new Event('cf:theme'))
}

export function rowHeight(): number {
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 820px)').matches
  return TRACK_PX[state.trackH][phone ? 1 : 0]
}

export function watchSystem() {
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => !state.skin && applySettings())
  matchMedia('(max-width: 820px)').addEventListener?.('change', () => {
    applySettings()
    subs.forEach((f) => f())
  })
}

export function togglePin(id: string) {
  const p = state.pins
  setSettings({ pins: p.includes(id) ? p.filter((x) => x !== id) : [...p, id] })
}
export function toggleSec(title: string) {
  const c = state.closedSecs
  setSettings({ closedSecs: c.includes(title) ? c.filter((x) => x !== title) : [...c, title] })
}

// auto timeline height follows the window (rotating a phone, resizing a laptop window)
if (typeof window !== 'undefined') {
  let t = 0
  window.addEventListener('resize', () => {
    if (state.tlH && state.tlHm) return
    clearTimeout(t)
    t = window.setTimeout(() => {
      document.documentElement.style.setProperty('--tl-h', `${timelineHeight(false)}px`)
      document.documentElement.style.setProperty('--tl-hm', `${timelineHeight(true)}px`)
    }, 80)
  })
}

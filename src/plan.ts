// Free / Pro. A Pro licence is a small signed text (payload.signature, ECDSA P-256) issued by the ClipForge
// server after a payment (or by the owner). The app checks the signature itself with the public key below,
// so Pro works offline and can't be faked by editing the page. Only the owner holds the private key.
import { useSyncExternalStore } from 'react'

const PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsSC8Y37yDHPrYH7ZKx/oYuImCUwLTiwADh97tJodUaxGurBYqoXbiZ078h3Xs+iFdG80zs3htBhUbwkhmnzsXg=='

/* ---- set these after creating the accounts (see MONEY-SETUP.md) ---- */
export const CONFIG = {
  server: '', // e.g. https://clipforge-pay.<you>.workers.dev – the payment + AI server
  razorpayKey: '', // Razorpay key id (rzp_live_… or rzp_test_…)
}
export const salesOpen = () => !!(CONFIG.server && (CONFIG.razorpayKey || inPlayApp()))

export interface PlanOffer {
  id: 'month' | 'year' | 'life' | 'ai100'
  name: string
  price: number // ₹
  note: string
}
export const OFFERS: PlanOffer[] = [
  { id: 'month', name: 'Monthly', price: 99, note: 'cancel any time' },
  { id: 'year', name: 'Yearly', price: 699, note: 'like ₹58 a month' },
  { id: 'life', name: 'Lifetime', price: 1999, note: 'pay once' },
  { id: 'ai100', name: '+100 AI', price: 49, note: 'this month' },
]
export const PRO_FEATURES: [string, string][] = [
  ['🚫', 'No “Made with ClipForge” mark on your videos'],
  ['🚀', 'Autopilot – one tap from raw video to edited Shorts, YouTube and Reels files with titles and thumbnails; batch many videos; auto-post to YouTube; your own saved recipes'],
  ['🤖', 'Built-in AI – assistant, hooks, titles, retention check – no key needed (300 AI requests a month)'],
  ['🗣️', 'Hindi AI voice-over – natural Hindi and Hinglish voices'],
  ['📦', 'One-tap upload kit – Short + YouTube + Instagram files, each with titles, description, hashtags and thumbnail'],
  ['✨', 'Premium caption styles – Neon, Karaoke, Gold, Comic and more'],
  ['🪔', 'Premium template packs – wedding, festival (Diwali/Holi), travel, devotional'],
  ['🎞', '4K export'],
  ['📐', 'All formats at once (16:9, 9:16, 4:5, 1:1 in one go)'],
  ['🎨', 'Brand kit – your logo, colours and fonts in one tap'],
  ['💛', 'Supports a made-in-India editor with no ads'],
]

export interface Licence {
  v: number
  sub: string // buyer id (email or payment id), or 'owner'
  plan: 'pro'
  src: 'razorpay' | 'play' | 'owner' | 'gift'
  iat: number // issued, seconds
  exp: number // expiry, seconds; 0 = lifetime
  term?: 'month' | 'year' | 'life'
  pid?: string // payment id (used to switch off refunded licences)
}

const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
let keyP: Promise<CryptoKey> | null = null
const pubKey = () => (keyP ??= crypto.subtle.importKey('spki', b64u(PUBLIC_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']))

/** Checks a licence text; returns its contents when the signature is genuine and it hasn't expired. */
export async function verifyLicence(token: string): Promise<Licence | null> {
  try {
    const [p, sig] = token.trim().split('.')
    if (!p || !sig) return null
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pubKey(), b64u(sig), new TextEncoder().encode(p))
    if (!ok) return null
    const lic = JSON.parse(new TextDecoder().decode(b64u(p))) as Licence
    if (lic.plan !== 'pro') return null
    if (lic.exp && lic.exp * 1000 < Date.now()) return null
    return lic
  } catch {
    return null
  }
}

/* ---- state ---- */
const KEY = 'clipforge-licence'
let current: Licence | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
export const isPro = () => !!current
export const licence = () => current
export const licenceText = () => localStorage.getItem(KEY) ?? ''
export function usePro(): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => !!current,
  )
}

/** Reads the saved licence at start-up. */
export async function loadLicence() {
  const t = localStorage.getItem(KEY)
  current = t ? await verifyLicence(t) : null
  if (t && !current) localStorage.removeItem(KEY) // expired or damaged
  emit()
}
/** Saves a licence text if it is genuine. */
export async function activate(token: string): Promise<Licence | null> {
  const lic = await verifyLicence(token)
  if (lic) {
    localStorage.setItem(KEY, token.trim())
    current = lic
    emit()
  }
  return lic
}
export function signOut() {
  localStorage.removeItem(KEY)
  current = null
  emit()
}

/** Days left on a pass (null for lifetime or no Pro). */
export function daysLeft(): number | null {
  if (!current?.exp) return null
  return Math.max(0, Math.ceil((current.exp * 1000 - Date.now()) / 86400e3))
}

/* ---- receipts (kept on this device) ---- */
export interface Receipt { payment_id: string; plan: string; amount: number; date: number; email?: string; coupon?: string }
const RKEY = 'clipforge-receipts'
export const receipts = (): Receipt[] => {
  try {
    return JSON.parse(localStorage.getItem(RKEY) || '[]')
  } catch {
    return []
  }
}
export function saveReceipt(r: Receipt) {
  const all = receipts().filter((x) => x.payment_id !== r.payment_id)
  localStorage.setItem(RKEY, JSON.stringify([r, ...all].slice(0, 50)))
}
export const PLAN_NAME: Record<string, string> = { month: 'ClipForge Pro – 30 days', year: 'ClipForge Pro – 1 year', life: 'ClipForge Pro – lifetime', ai100: '100 extra AI requests' }
/** Opens a printable receipt (save as PDF from the print dialog). */
export function printReceipt(r: Receipt) {
  const w = window.open('', '_blank')
  if (!w) return
  const d = new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const esc = (x: string) => x.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Receipt ${esc(r.payment_id)}</title><style>body{font:15px system-ui,sans-serif;max-width:560px;margin:40px auto;color:#111}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:24px 0}td{padding:8px 0;border-bottom:1px solid #ddd}td:last-child{text-align:right}.muted{color:#666;font-size:13px}button{margin-top:16px;padding:8px 14px}@media print{button{display:none}}</style>
<h1>ClipForge – receipt</h1><div class="muted">https://tiwary9847.github.io/clipforge/</div>
<table><tr><td>Date</td><td>${d}</td></tr><tr><td>Item</td><td>${esc(PLAN_NAME[r.plan] || r.plan)}</td></tr>${r.coupon ? `<tr><td>Coupon</td><td>${esc(r.coupon)}</td></tr>` : ''}<tr><td><b>Paid</b></td><td><b>₹${r.amount}</b></td></tr><tr><td>Payment ID</td><td>${esc(r.payment_id)}</td></tr>${r.email ? `<tr><td>Email</td><td>${esc(r.email)}</td></tr>` : ''}</table>
<div class="muted">Paid through Razorpay. Keep this payment ID – with your email it restores Pro on a new phone or computer.</div><button onclick="print()">Print / save as PDF</button>`)
  w.document.close()
}

/* ---- server calls ---- */
export async function post<T = any>(path: string, body: unknown, auth = false): Promise<T> {
  const r = await fetch(CONFIG.server + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + licenceText() } : {}) }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `The server said ${r.status}`)
  return j as T
}
/** Once a day, asks the server whether this licence was refunded or cancelled (offline: keeps Pro). */
export async function checkOnline(force = false) {
  if (!current || !CONFIG.server || current.src === 'owner') return
  const last = Number(localStorage.getItem('clipforge-licence-checked') || 0)
  if (!force && Date.now() - last < 86400e3) return
  try {
    const j = await post<{ ok: boolean; revoked?: boolean }>('/check', { licence: licenceText() })
    localStorage.setItem('clipforge-licence-checked', String(Date.now()))
    if (!j.ok && j.revoked) {
      signOut()
      window.dispatchEvent(new CustomEvent('cf:toast', { detail: 'Your Pro licence was refunded or cancelled, so Pro is off on this device.' }))
    }
  } catch {
    /* offline – try again later */
  }
}
export interface AIUsage { used: number; limit: number; left: number; bonus: number }
export const aiUsage = () => post<AIUsage>('/usage', {}, true)

/** For a Pro-only feature: true when allowed, otherwise opens the Pro screen and returns false. */
export function requirePro(why: string): boolean {
  if (current) return true
  window.dispatchEvent(new CustomEvent('cf:pro', { detail: why }))
  return false
}
export const openPro = (why = '') => window.dispatchEvent(new CustomEvent('cf:pro', { detail: why }))

/** Running as the Android app from the Play Store (Trusted Web Activity)? */
export const inPlayApp = () => document.referrer.startsWith('android-app://') || sessionStorage.getItem('cf-twa') === '1'
if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) sessionStorage.setItem('cf-twa', '1')

/** Built-in AI (through the ClipForge server) for Pro users without their own key. */
export const builtinAI = () => !!(current && CONFIG.server)
export async function askBuiltin(prompt: string, json: boolean): Promise<string> {
  const j = await post<{ text?: string }>('/ai', { prompt, json }, true)
  return j.text ?? ''
}
/** Hindi / English AI voice (Gemini TTS on the server). Returns mono samples. */
export async function ttsBuiltin(text: string, voice: string): Promise<{ audio: Float32Array; sr: number }> {
  const mock = (window as any).__cfMockCloudTts as undefined | ((t: string, v: string) => { audio: string; sr: number })
  const j = mock ? mock(text, voice) : await post<{ audio: string; sr: number }>('/tts', { text, voice }, true)
  const bin = atob(j.audio)
  const n = bin.length >> 1
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
    if (v >= 32768) v -= 65536
    out[i] = v / 32768
  }
  return { audio: out, sr: j.sr || 24000 }
}

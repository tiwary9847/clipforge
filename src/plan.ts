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
  id: 'month' | 'year' | 'life'
  name: string
  price: number // ₹
  note: string
}
export const OFFERS: PlanOffer[] = [
  { id: 'month', name: 'Monthly', price: 99, note: 'cancel any time' },
  { id: 'year', name: 'Yearly', price: 699, note: 'like ₹58 a month' },
  { id: 'life', name: 'Lifetime', price: 1999, note: 'pay once' },
]
export const PRO_FEATURES: [string, string][] = [
  ['🚫', 'No “Made with ClipForge” mark on your videos'],
  ['🤖', 'Built-in AI – assistant, hooks, titles, retention check – no key needed (300 AI requests a month)'],
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
  const r = await fetch(CONFIG.server + '/ai', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + licenceText() }, body: JSON.stringify({ prompt, json }) })
  const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string; left?: number }
  if (!r.ok) throw new Error(j.error || `The AI server said ${r.status}`)
  return j.text ?? ''
}

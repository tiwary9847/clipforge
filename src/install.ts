// Phone-app bits: the Install button, files shared into ClipForge from other apps, and app-icon shortcuts.
import { useSyncExternalStore } from 'react'
import { importFiles } from './components/MediaPanel'
import { engine } from './engine'
import { addAssetClip, getState, setProject, setUi } from './store'

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIP | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own Install button instead of Chrome's mini bar
    deferred = e as BIP
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
    setUi({ toast: '📲 ClipForge is installed – open it from your home screen.' })
  })
}
export const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true || document.referrer.startsWith('android-app://')
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
/** Can we offer installing? (Chrome/Edge/Samsung give a prompt; on iPhone we explain the Share menu.) */
export const canInstall = () => !standalone() && (!!deferred || isIOS())
export function useCanInstall() {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), canInstall)
}
export async function install() {
  if (deferred) {
    await deferred.prompt()
    const r = await deferred.userChoice
    if (r.outcome === 'accepted') deferred = null
    emit()
  } else if (isIOS()) {
    setUi({ toast: 'On iPhone: tap the Share button (□↑) in Safari, then “Add to Home Screen”.' })
  }
}

/** Runs once at start-up: files shared from other apps, and shortcut links (?start=…, ?ask=1). */
export async function handleLaunch() {
  const q = new URLSearchParams(location.search)
  if (!q.has('shared') && !q.has('start') && !q.has('ask')) return
  history.replaceState(null, '', location.pathname) // clean the address so a reload doesn't repeat it
  const start = q.get('start')
  if (start === 'shorts' || start === 'yt') setProject({ presetId: start })
  if (q.has('shared')) {
    try {
      const c = await caches.open('clipforge-shared')
      const keys = await c.keys()
      const files: File[] = []
      for (const k of keys) {
        const r = await c.match(k)
        if (!r) continue
        const b = await r.blob()
        files.push(new File([b], decodeURIComponent(r.headers.get('x-name') || 'shared'), { type: b.type }))
        await c.delete(k)
      }
      if (files.length) {
        const before = new Set(getState().assets.map((a) => a.id))
        await importFiles(files, (m) => setUi({ toast: m }))
        const fresh = getState().assets.filter((a) => !before.has(a.id))
        // a fresh project gets the shared clips on the timeline straight away
        if (!getState().project.clips.length) {
          for (const a of fresh) if (a.kind !== 'audio') addAssetClip(a.id, 'v1')
          for (const a of fresh) if (a.kind === 'audio') addAssetClip(a.id, 'a2', 0)
        }
        setUi({ toast: `📥 Added ${files.length} shared file${files.length > 1 ? 's' : ''}.` })
        setTimeout(() => engine.render(), 50)
      }
    } catch {
      setUi({ toast: 'Couldn’t read the shared file – add it with the + button instead.' })
    }
  }
  if (q.has('ask')) window.dispatchEvent(new CustomEvent('cf:assistant', { detail: '' }))
}

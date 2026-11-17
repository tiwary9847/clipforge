// Light / dark theme: follows the device setting until the user picks one; remembered in this browser.
const KEY = 'clipforge-theme'
export type Mode = 'light' | 'dark'

export function currentTheme(): Mode {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}
export function applyTheme(m: Mode) {
  document.documentElement.dataset.theme = m
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', m === 'light' ? '#ffffff' : '#7c5cff')
}
export function setTheme(m: Mode) {
  applyTheme(m)
  try {
    localStorage.setItem(KEY, m)
  } catch {}
  window.dispatchEvent(new Event('cf:theme'))
}
/** Keeps following the device setting while the user hasn't chosen. */
export function watchSystemTheme() {
  const mq = matchMedia('(prefers-color-scheme: light)')
  mq.addEventListener?.('change', (e) => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(KEY)
    } catch {}
    if (!saved) {
      applyTheme(e.matches ? 'light' : 'dark')
      window.dispatchEvent(new Event('cf:theme'))
    }
  })
}

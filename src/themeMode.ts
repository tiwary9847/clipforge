// Light / dark switch in the header – flips between your last dark and last light theme (see settings.ts).
import { activeSkin, getSettings, setSettings, SKINS } from './settings'
export type Mode = 'light' | 'dark'

export function currentTheme(): Mode {
  return SKINS.find((s) => s.id === activeSkin())?.dark ? 'dark' : 'light'
}
export function setTheme(m: Mode) {
  const s = getSettings()
  const cur = activeSkin()
  const isDark = SKINS.find((x) => x.id === cur)?.dark
  if (isDark) setSettings({ lastDark: cur })
  else setSettings({ lastLight: cur })
  setSettings({ skin: m === 'light' ? s.lastLight : s.lastDark })
}

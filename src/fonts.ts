// Hindi / Devanagari web fonts, bundled into the app so they work offline and in exports.
import './fonts.css'

export const WEB_FONTS = ['Noto Sans Devanagari', 'Baloo 2', 'Mukta', 'Hind', 'Rozha One', 'Yatra One', 'Kalam']

/** Load every bundled font up front; returns when they are ready for canvas drawing. */
export function preloadFonts(): Promise<unknown> {
  return Promise.all(WEB_FONTS.map((f) => document.fonts.load(`700 40px "${f}"`, 'नमस्ते Aa').catch(() => [])))
}

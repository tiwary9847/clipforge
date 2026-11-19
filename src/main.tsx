import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './theme.css'
import './light.css'
import { applyTheme, currentTheme, watchSystemTheme } from './themeMode'
import { preloadFonts } from './fonts'
import * as store from './store'
import * as processing from './processing'
import * as dsp from './dsp'
import * as library from './library'
import * as fastExport from './fastExport'
import { engine } from './engine'
import * as tools2 from './tools2'
import * as pro from './pro'
import * as grade from './grade'
import * as multicam from './multicam'
import * as media from './media'
import * as looks from './looks'
import * as viz from './viz'
import * as anim from './anim'
import * as shorts from './shorts'
import { setTileReady } from './travelmap'
import * as faces from './faces'
import * as speakers from './speakers'
import * as dub from './dub'
import * as dspx from './dsp'
import { setVizReady } from './viz'

// Small handle for automated tests and for power users poking around in the console.
;(window as any).__cf = { store, processing, dsp, engine, fastExport, library, tools2, pro, grade, multicam, media, looks, viz, anim, shorts, faces, speakers, dub, dspx }

createRoot(document.getElementById('root')!).render(<App />)

// Installable app + offline use when served over https (not when opened as a local file)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

// Redraw once the bundled Hindi fonts are ready (the first frame may use a fallback)
void preloadFonts().then(() => engine.requestRender())
document.fonts?.addEventListener?.('loadingdone', () => engine.requestRender())

// free disk space used by exports from previous visits
void fastExport.cleanOldExports()

applyTheme(currentTheme())
watchSystemTheme()

setVizReady(() => engine.requestRender())
setTileReady(() => engine.requestRender())

// automatic version snapshots
import('./db').then((m) => m.startVersionTimer())

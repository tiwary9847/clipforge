import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './theme.css'
import './light.css'
import { applySettings, watchSystem } from './settings'
import './skins.css'
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
import { setDepthReady } from './depth3d'
import * as faces from './faces'
import * as speakers from './speakers'
import * as dub from './dub'
import * as dspx from './dsp'
import * as creative from './creative'
import * as studio from './studio'
import * as inp from './inpaint'
import * as looks2 from './looks2'
import * as depth3d from './depth3d'
import * as s2v from './script2video'
import * as musicgen from './musicgen'
import * as autoedit2 from './autoedit2'
import * as broll from './broll'
import * as videoobj from './videoobj'
import * as retakes from './retakes'
import * as hooks from './hooks'
import * as postcheck from './postcheck'
import * as social from './social'
import * as musiclib from './musiclib'
import * as assistant from './assistant'
import * as retention from './retention'
import * as privacy from './privacy'
import * as plan from './plan'
import { setVizReady } from './viz'

// Small handle for automated tests and for power users poking around in the console.
;(window as any).__cf = { store, processing, dsp, engine, fastExport, library, tools2, pro, grade, multicam, media, looks, viz, anim, shorts, faces, speakers, dub, dspx, creative, studio, inp, looks2, depth3d, s2v, musicgen, autoedit2, broll, videoobj, retakes, hooks, postcheck, social, musiclib, assistant, retention, privacy, plan }

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

applySettings()
void plan.loadLicence().then(() => engine.requestRender())
watchSystem()
// ask the browser to keep projects and media permanently (otherwise it may clear them when space is low,
// and Safari can remove site data after 7 days without a visit)
try {
  navigator.storage?.persisted?.().then((on) => {
    if (!on) navigator.storage.persist?.().catch(() => {})
  })
} catch {
  /* older browsers */
}

setVizReady(() => engine.requestRender())
setTileReady(() => engine.requestRender())
setDepthReady(() => engine.requestRender())

// automatic version snapshots
import('./db').then((m) => m.startVersionTimer())

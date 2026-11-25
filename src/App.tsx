import { useEffect, useState } from 'react'
import { MediaPanel, importFiles } from './components/MediaPanel'
import { Preview } from './components/Preview'
import { Timeline } from './components/Timeline'
import { Inspector } from './components/Inspector'
import { ExportDialog } from './components/ExportDialog'
import { AutoEditDialog } from './components/AutoEditDialog'
import { Icon } from './components/Icon'
import { Tour, startTour } from './components/Tour'
import { SettingsDialog } from './components/SettingsDialog'
import { GuideDialog, openGuide } from './components/GuideDialog'
import { ConvertDialog } from './components/ConvertDialog'
import { useT } from './i18n'
import { AssistantDialog } from './components/AIPanels'
import { ExpiryBanner, ProDialog } from './components/ProDialog'
import { openPro, usePro } from './plan'
import { handleLaunch, install, useCanInstall } from './install'
import { currentTheme, setTheme } from './themeMode'
import { engine, FPS } from './engine'
import {
  addMarker,
  deleteMany,
  duplicateMany,
  getState,
  redo,
  resetProject,
  rippleDelete,
  selectMany,
  setProject,
  setUi,
  splitMany,
  undo,
  useStore,
  groupClips,
  ungroupClips,
} from './store'
import { cutToAngle } from './multicam'
import { enrichAsset } from './processing'
import { PRESETS } from './types'
import { restoreProject, startAutosave } from './db'

export default function App() {
  const [exporting, setExporting] = useState(false)
  const [autoOpen, setAutoOpen] = useState(false)
  const [theme, setThemeState] = useState(currentTheme())
  useEffect(() => {
    const on = () => setThemeState(currentTheme())
    window.addEventListener('cf:theme', on)
    return () => window.removeEventListener('cf:theme', on)
  }, [])
  useEffect(() => {
    const phone = () => matchMedia('(max-width: 820px)').matches
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d === 'auto') setAutoOpen(true)
      else if (phone()) setSheet('add') // panels and tools open in the bottom sheet on phones
    }
    const onTool = () => phone() && setSheet('add')
    const onExp = () => setExporting(true)
    const onAsk = (e: Event) => { setSheet(null); setAsk(String((e as CustomEvent).detail ?? '')) }
    window.addEventListener('cf:assistant', onAsk)
    const onPro = (e: Event) => { setSheet(null); setProWhy(String((e as CustomEvent).detail ?? '')) }
    window.addEventListener('cf:pro', onPro)
    window.addEventListener('cf:export', onExp)
    window.addEventListener('cf:open', on)
    window.addEventListener('cf:tool', onTool)
    return () => {
      window.removeEventListener('cf:open', on)
      window.removeEventListener('cf:tool', onTool)
      window.removeEventListener('cf:export', onExp)
      window.removeEventListener('cf:assistant', onAsk)
      window.removeEventListener('cf:pro', onPro)
    }
  }, [])
  const [dropping, setDropping] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
  const [ask, setAsk] = useState<string | null>(null)
  const [proWhy, setProWhy] = useState<string | null>(null)
  const pro = usePro()
  const installable = useCanInstall()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [guide, setGuide] = useState<string | null>(null)
  useEffect(() => {
    const on = (e: Event) => setGuide((e as CustomEvent<string>).detail ?? '')
    const key = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault()
        openGuide()
      }
    }
    window.addEventListener('cf:guide', on)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('cf:guide', on)
      window.removeEventListener('keydown', key)
    }
  }, [])
  useEffect(() => {
    const on = () => setSettingsOpen(true)
    window.addEventListener('cf:settings', on)
    return () => window.removeEventListener('cf:settings', on)
  }, [])
  const [compat, setCompat] = useState<string[]>([])
  useEffect(() => {
    const w = window as any
    const miss: string[] = []
    try {
      if (!('filter' in document.createElement('canvas').getContext('2d')!)) miss.push('colour filters, blur and meme effects (this browser cannot draw them – use Chrome, Edge or Firefox)')
    } catch {}
    if (typeof w.VideoEncoder === 'undefined') miss.push('fast export (real-time recording is used instead)')
    if (typeof w.ImageDecoder === 'undefined') miss.push('animated GIF/WebP playback (they import as still pictures)')
    if (!navigator.mediaDevices?.getUserMedia) miss.push('voice-over recording')
    if (typeof w.MediaRecorder === 'undefined' && typeof w.VideoEncoder === 'undefined') miss.push('export')
    setCompat(miss)
  }, [])
  const [compatOpen, setCompatOpen] = useState(true)
  const [sheet, setSheet] = useState<null | 'add' | 'edit'>(null)
  const hasSel = useStore((s) => s.selIds.length > 0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => engine.onTick((_t, p) => setPlaying((o) => (o === p ? o : p))), [])
  useEffect(() => {
    // picking something on the timeline on a phone opens the edit sheet
    if (hasSel) setSheet((s) => (s === 'add' ? s : s))
  }, [hasSel])
  const toast = useStore((s) => s.toast)
  const saveStatus = useStore((s) => s.saveStatus)

  useEffect(() => {
    void restoreProject().then((ok) => {
      if (ok) setUi({ toast: 'Restored your last project' })
      startAutosave()
      void handleLaunch()
    })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setUi({ toast: '' }), Math.min(15000, Math.max(3500, toast.length * 55)))
    return () => clearTimeout(t)
  }, [toast])
  const assets = useStore((s) => s.assets)
  useEffect(() => {
    // thumbnails + waveforms for video are built lazily so importing stays instant
    for (const a of assets) if (a.kind === 'video' && !a.enriched) void enrichAsset(a)
  }, [assets])
  const name = useStore((s) => s.projectName)
  const empty = useStore((s) => s.project.clips.length === 0)
  const t = useT()
  const presetId = useStore((s) => s.project.presetId)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
        if (!(el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range')) return
      }
      const mod = e.ctrlKey || e.metaKey
      const sel = getState().selectedId
      const ids = getState().selIds
      if (e.code === 'Space') {
        e.preventDefault()
        engine.toggle()
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        e.shiftKey ? ungroupClips(ids) : groupClips(ids)
      } else if (!mod && /^[1-4]$/.test(e.key) && getState().project.multicam) {
        e.preventDefault()
        setUi({ toast: cutToAngle(+e.key - 1, engine.time) })
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (ids.length) duplicateMany(ids)
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectMany(getState().project.clips.map((c) => c.id))
      } else if (e.key === 's' || e.key === 'S') {
        if (!mod && ids.length) splitMany(ids, engine.time)
      } else if (e.key === 'm' || e.key === 'M') {
        if (!mod) addMarker(engine.time)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ids.length) {
          e.preventDefault()
          e.shiftKey ? rippleDelete(ids) : deleteMany(ids)
        }
      } else if (e.key === 'ArrowLeft') {
        engine.seek(engine.time - (e.shiftKey ? 1 : 1 / FPS))
      } else if (e.key === 'ArrowRight') {
        engine.seek(engine.time + (e.shiftKey ? 1 : 1 / FPS))
      } else if (e.key === 'Home') engine.seek(0)
      else if (e.key === 'End') engine.seek(engine.duration())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className={'app' + (sheet ? ' sheet-' + sheet : '') + (empty ? ' no-clips' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDropping(true)
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        setDropping(false)
        if (e.dataTransfer.files.length) {
          e.preventDefault()
          void importFiles(e.dataTransfer.files, (m) => setUi({ toast: m }))
        }
      }}
    >
      {compat.length > 0 && compatOpen && (
        <div className="compat" onClick={() => setCompatOpen(false)} title="Click to dismiss">
          ⚠ This browser doesn’t support: {compat.join('; ')}. Everything else works.
        </div>
      )}
      <header className="top">
        <div className="logo">
          <span className="logo-mark"><Icon name="play" size={14} /></span><span className="logo-txt">Clip<b>Forge</b></span>
        </div>
        <input className="proj-name" value={name} onChange={(e) => setUi({ projectName: e.target.value })} />
        <span className="save-st" title="Your project and media are saved in this browser automatically">
          {saveStatus === 'saving' ? t('Saving…') : saveStatus === 'saved' ? t('✓ Saved') : saveStatus === 'error' ? '⚠ Not saved' : ''}
        </span>
        <div className="spacer" />
        <button className="btn sm ae-btn" onClick={() => setAutoOpen(true)} title="Upload clips, set the order – we edit it for you"><Icon name="sparkles" size={15} /> {t('Auto-edit')}</button>
          <button className={'btn pro-btn' + (pro ? ' is-pro' : '')} onClick={() => openPro()} title={pro ? 'You have ClipForge Pro' : 'ClipForge Pro – no mark, 4K, built-in AI'}>{pro ? '★ Pro' : 'Go Pro'}</button>
        <button className="btn sm hide-phone" onClick={() => setConfirmNew(true)} title="Start a new project"><Icon name="plus" size={15} /> {t('New')}</button>
        <select
          className={'preset-sel' + (empty ? ' hide-empty' : '')}
          value={presetId}
          onChange={(e) => {
            setProject({ presetId: e.target.value })
            setTimeout(() => engine.render(), 0)
          }}
          title="Output format"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <button className="ico hide-phone" onClick={() => setSettingsOpen(true)} title="Settings – theme, colours, sizes, tools" aria-label="Settings"><Icon name="gear" size={16} /></button>
        <button className="ico theme-btn hide-phone" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} aria-label="Toggle light / dark mode">
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} />
        </button>
        <button className="ico tour-btn" onClick={() => openGuide()} title="Guide – how to use every feature (F1)" aria-label="Open the guide"><Icon name="help" size={16} /></button>
        <button className="ico" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)"><Icon name="undo" size={16} /></button>
        <button className="ico" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)"><Icon name="redo" size={16} /></button>
        <button className="btn primary" onClick={() => setExporting(true)}><Icon name="upload" size={15} /> {t('Export')}</button>
        <div className="more-wrap">
          <button className="ico" onClick={() => setMore(!more)} aria-label="More" aria-expanded={more}><Icon name="more" size={18} /></button>
          {more && (
            <>
              <div className="more-scrim" onClick={() => setMore(false)} />
              <div className="more-menu" onClick={() => setMore(false)}>
                <button onClick={() => setSettingsOpen(true)}><Icon name="gear" size={17} /> {t('Settings')}</button>
                {installable && <button onClick={() => void install()}>📲 Install app</button>}
                <button onClick={() => openPro()}>⭐ {pro ? 'ClipForge Pro ✓' : 'Go Pro'}</button>
                <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} /> {theme === 'light' ? t('Dark mode') : t('Light mode')}</button>
                <button onClick={() => openGuide()}><Icon name="book" size={17} /> {t('Guide')}</button>
                <button onClick={startTour}><Icon name="help" size={17} /> {t('Quick tour')}</button>
                <hr />
                <button onClick={() => setConfirmNew(true)}><Icon name="plus" size={17} /> {t('New project')}</button>
              </div>
            </>
          )}
        </div>
      </header>
      <ExpiryBanner />
      <div className="mid">
        <MediaPanel />
        <Preview />
        <div className="right">
          <Inspector onExport={() => setExporting(true)} />
        </div>
      </div>
      <Timeline />
      <nav className="mnav">
        <button className={sheet === 'add' ? 'on' : ''} onClick={() => setSheet(sheet === 'add' ? null : 'add')}><Icon name="plus" size={21} /><span>{t('Add')}</span></button>
        <button className={sheet === 'edit' ? 'on' : ''} onClick={() => setSheet(sheet === 'edit' ? null : 'edit')}><Icon name="edit" size={20} /><span>{hasSel ? t('Edit') : t('Project')}</span></button>
        <button onClick={() => engine.toggle()}>{playing ? <Icon name="pause" size={20} /> : <Icon name="play" size={20} />}<span>{playing ? t('Pause') : t('Play')}</span></button>
        <button onClick={() => setExporting(true)}><Icon name="upload" size={20} /><span>{t('Export')}</span></button>
      </nav>
      {sheet && <button className="sheet-x" onClick={() => setSheet(null)} aria-label="Close panel"><i />{t('Close')}</button>}
      <ConvertDialog />
      {proWhy !== null && <ProDialog why={proWhy} onClose={() => setProWhy(null)} />}
      {ask !== null && <AssistantDialog initial={ask} onClose={() => setAsk(null)} />}
      {guide !== null && <GuideDialog topic={guide} onClose={() => setGuide(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {autoOpen && <AutoEditDialog onClose={() => setAutoOpen(false)} />}
      <Tour />
      {confirmNew && (
        <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && setConfirmNew(false)}>
          <div className="modal">
            <h3>Start a new project?</h3>
            <div className="hint">This clears the timeline and the media bin. Your current project can’t be recovered afterwards.</div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmNew(false)}>Cancel</button>
              <button
                className="btn primary"
                onClick={() => {
                  engine.pause()
                  engine.seek(0)
                  resetProject()
                  setConfirmNew(false)
                }}
              >
                New project
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast" onClick={() => setUi({ toast: '' })} title="Click to close">{toast}</div>}
      {dropping && <div className="drop-overlay">Drop videos, images or audio to import</div>}
    </div>
  )
}

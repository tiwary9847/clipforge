import { useEffect, useState } from 'react'
import { MediaPanel, importFiles } from './components/MediaPanel'
import { Preview } from './components/Preview'
import { Timeline } from './components/Timeline'
import { Inspector } from './components/Inspector'
import { ExportDialog } from './components/ExportDialog'
import { AutoEditDialog } from './components/AutoEditDialog'
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
  const [dropping, setDropping] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)
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
    })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setUi({ toast: '' }), 3500)
    return () => clearTimeout(t)
  }, [toast])
  const assets = useStore((s) => s.assets)
  useEffect(() => {
    // thumbnails + waveforms for video are built lazily so importing stays instant
    for (const a of assets) if (a.kind === 'video' && !a.enriched) void enrichAsset(a)
  }, [assets])
  const name = useStore((s) => s.projectName)
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
      className={'app' + (sheet ? ' sheet-' + sheet : '')}
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
          void importFiles(e.dataTransfer.files)
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
          <span className="logo-mark">▶</span> ClipForge
        </div>
        <input className="proj-name" value={name} onChange={(e) => setUi({ projectName: e.target.value })} />
        <span className="save-st" title="Your project and media are saved in this browser automatically">
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? '⚠ Not saved' : ''}
        </span>
        <div className="spacer" />
        <button className="btn sm ae-btn" onClick={() => setAutoOpen(true)} title="Upload clips, set the order – we edit it for you">✨ Auto-edit</button>
        <button className="btn sm" onClick={() => setConfirmNew(true)} title="Start a new project">＋ New</button>
        <select
          className="preset-sel"
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
        <button className="ico" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">↶</button>
        <button className="ico" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
        <button className="btn primary" onClick={() => setExporting(true)}>⬆ Export</button>
      </header>
      <div className="mid">
        <MediaPanel />
        <Preview />
        <div className="right">
          <Inspector onExport={() => setExporting(true)} />
        </div>
      </div>
      <Timeline />
      <nav className="mnav">
        <button className={sheet === 'add' ? 'on' : ''} onClick={() => setSheet(sheet === 'add' ? null : 'add')}>＋<span>Add</span></button>
        <button className={sheet === 'edit' ? 'on' : ''} onClick={() => setSheet(sheet === 'edit' ? null : 'edit')}>✎<span>{hasSel ? 'Edit' : 'Project'}</span></button>
        <button onClick={() => engine.toggle()}>{playing ? '❚❚' : '▶'}<span>{playing ? 'Pause' : 'Play'}</span></button>
        <button onClick={() => setExporting(true)}>⬆<span>Export</span></button>
      </nav>
      {sheet && <div className="sheet-x" onClick={() => setSheet(null)}>⌄ close</div>}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {autoOpen && <AutoEditDialog onClose={() => setAutoOpen(false)} />}
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
      {toast && <div className="toast">{toast}</div>}
      {dropping && <div className="drop-overlay">Drop videos, images or audio to import</div>}
    </div>
  )
}

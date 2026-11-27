import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { deleteProject, duplicateProject, getCurrentId, listProjects, newProject, onProjectsChange, openProject, ProjectInfo, renameProject } from '../db'
import { setUi } from '../store'
import { useT } from '../i18n'

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
const len = (d: number) => `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}`

export function useProjects() {
  const [list, setList] = useState<ProjectInfo[]>([])
  useEffect(() => {
    const load = () => void listProjects().then(setList)
    load()
    const off = onProjectsChange(load)
    return () => { off() }
  }, [])
  return list
}

/** Project cards: tap to open; ⋯ for rename, duplicate, delete. */
export function ProjectList({ onOpen, row }: { onOpen?: () => void; row?: boolean }) {
  const t = useT()
  const list = useProjects()
  const [menu, setMenu] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const cur = getCurrentId()
  const open = async (id: string) => {
    setBusy(true)
    try {
      await openProject(id)
      onOpen?.()
    } catch (e) {
      setUi({ toast: (e as Error).message })
    }
    setBusy(false)
  }
  const create = async () => {
    await newProject()
    onOpen?.()
    setUi({ toast: 'New project started – your other projects are kept in My projects' })
  }
  return (
    <div className={'pj' + (row ? ' pj-row' : '')}>
      <button className="pj-card pj-new" onClick={() => void create()} disabled={busy}>
        <span className="pj-thumb"><b>＋</b></span>
        <span className="pj-name">{t('New project')}</span>
      </button>
      {list.map((p) => (
        <div key={p.id} className={'pj-card' + (p.id === cur ? ' cur' : '')}>
          <button className="pj-open" onClick={() => void open(p.id)} disabled={busy} aria-label={`Open ${p.name}`}>
            <span className="pj-thumb">{p.thumb ? <img src={p.thumb} alt="" /> : <i>🎬</i>}{p.dur > 0 && <em>{len(p.dur)}</em>}</span>
            <span className="pj-name">{p.name}</span>
            <small>{p.id === cur ? t('Open now') : ago(p.savedAt)}</small>
          </button>
          <button className="pj-more" onClick={() => setMenu(menu === p.id ? null : p.id)} aria-label={`More for ${p.name}`}>⋯</button>
          {menu === p.id && (
            <div className="pj-menu" onClick={() => setMenu(null)}>
              <button onClick={() => { const n = prompt('Project name', p.name); if (n !== null) void renameProject(p.id, n) }}>✏️ {t('Rename')}</button>
              <button onClick={() => void duplicateProject(p.id).then(() => setUi({ toast: 'Copy made' }))}>📄 {t('Duplicate')}</button>
              <button className="danger" onClick={() => { if (confirm(`Delete “${p.name}”? This can’t be undone.`)) void deleteProject(p.id).then(() => setUi({ toast: 'Project deleted' })) }}>🗑 {t('Delete')}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Desktop: the list in a dialog (top-bar menu → My projects). */
export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  return createPortal(
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pj-modal">
        <h3>📁 {t('My projects')}</h3>
        <div className="hint">{t('Everything is saved on this device as you work. Open any project to keep editing.')}</div>
        <ProjectList onOpen={onClose} />
        <div className="modal-actions"><button className="btn" onClick={onClose}>{t('Close')}</button></div>
      </div>
    </div>,
    document.body,
  )
}

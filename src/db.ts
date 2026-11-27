import { getState, loadProject, resetProject, setAssets, setUi, subscribe } from './store'
import { engine } from './engine'
import { Asset } from './types'

let dbp: Promise<IDBDatabase> | null = null
const db = () =>
  (dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open('clipforge', 2)
    r.onupgradeneeded = () => {
      const names = r.result.objectStoreNames
      if (!names.contains('kv')) r.result.createObjectStore('kv')
      if (!names.contains('media')) r.result.createObjectStore('media')
      if (!names.contains('versions')) r.result.createObjectStore('versions', { keyPath: 'id' })
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  }))

function tx<T>(store: 'kv' | 'media' | 'versions', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const r = fn(d.transaction(store, mode).objectStore(store))
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      }),
  )
}

const stored = new Set<string>()
let busy = false
let again = false

/* ---------------- projects ----------------
 * kv 'proj:<id>'  → { project, name, assetIds, savedAt }
 * kv 'projects'   → ProjectInfo[] (the list shown on the home screen)
 * kv 'currentId'  → the open project
 * media is shared: a file is deleted only when no project uses it.
 * (Before multiple projects there was one record under kv 'current'; it is moved into the list once.) */
export interface ProjectInfo { id: string; name: string; savedAt: number; clips: number; dur: number; thumb?: string; assetIds: string[] }
let currentId = ''
const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
const listeners = new Set<() => void>()
export const onProjectsChange = (f: () => void) => (listeners.add(f), () => void listeners.delete(f))
const changed = () => listeners.forEach((f) => f())
export const getCurrentId = () => currentId

export async function listProjects(): Promise<ProjectInfo[]> {
  try {
    const l = ((await tx<ProjectInfo[]>('kv', 'readonly', (st) => st.get('projects'))) ?? []).filter((p) => p.clips > 0)
    return l.sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return []
  }
}
async function putIndex(f: (l: ProjectInfo[]) => ProjectInfo[]) {
  const l = (await tx<ProjectInfo[]>('kv', 'readonly', (st) => st.get('projects'))) ?? []
  await tx('kv', 'readwrite', (st) => st.put(f(l), 'projects'))
  changed()
}

/** A small picture of the current frame for the project card. */
function snapshot(): string | undefined {
  try {
    const c = [...document.querySelectorAll<HTMLCanvasElement>('.stage canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!c || !c.width) return undefined
    const o = document.createElement('canvas')
    const h = 160
    o.height = h
    o.width = Math.round((c.width / c.height) * h)
    o.getContext('2d')!.drawImage(c, 0, 0, o.width, o.height)
    return o.toDataURL('image/jpeg', 0.7)
  } catch {
    return undefined
  }
}
let lastThumb = 0

async function save() {
  if (busy) {
    again = true
    return
  }
  busy = true
  try {
    do {
      again = false
      const s = getState()
      if (!currentId) currentId = newId()
      setUi({ saveStatus: 'saving' })
      for (const a of s.assets) {
        if (!stored.has(a.id) && a.blob) {
          await tx('media', 'readwrite', (st) => st.put({ id: a.id, name: a.name, type: a.blob!.type, blob: a.blob }, a.id))
          stored.add(a.id)
        }
      }
      const rec = { project: s.project, name: s.projectName, assetIds: s.assets.map((a) => a.id), savedAt: Date.now() }
      await tx('kv', 'readwrite', (st) => st.put(rec, 'proj:' + currentId))
      await tx('kv', 'readwrite', (st) => st.put(currentId, 'currentId'))
      const dur = s.project.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0)
      const thumb = s.project.clips.length && (Date.now() - lastThumb > 20000 || !lastThumb) ? snapshot() : undefined
      if (thumb) lastThumb = Date.now()
      const id = currentId
      await putIndex((l) => {
        const old = l.find((p) => p.id === id)
        const info: ProjectInfo = { id, name: s.projectName, savedAt: rec.savedAt, clips: s.project.clips.length, dur, thumb: thumb ?? old?.thumb, assetIds: rec.assetIds }
        return [info, ...l.filter((p) => p.id !== id)]
      })
      await cleanMedia()
      setUi({ saveStatus: 'saved' })
    } while (again)
  } catch {
    setUi({ saveStatus: 'error' })
  } finally {
    busy = false
  }
}

/** Delete stored files that no project uses any more. */
async function cleanMedia() {
  const l = (await tx<ProjectInfo[]>('kv', 'readonly', (st) => st.get('projects'))) ?? []
  const used = new Set([...l.flatMap((p) => p.assetIds ?? []), ...getState().assets.map((a) => a.id)])
  const keys = (await tx('media', 'readonly', (st) => st.getAllKeys())) as string[]
  for (const k of keys) {
    if (!used.has(k)) {
      await tx('media', 'readwrite', (st) => st.delete(k))
      stored.delete(k)
    }
  }
}

async function loadRecord(rec: any): Promise<boolean> {
  const assets: Asset[] = []
  for (const id of (rec.assetIds ?? []) as string[]) {
    const m = await tx<any>('media', 'readonly', (st) => st.get(id))
    if (!m) continue
    const a = await engine.importFile(new File([m.blob], m.name, { type: m.type }), id)
    if (a) {
      assets.push(a)
      stored.add(id)
    }
  }
  const ids = new Set(assets.map((a) => a.id))
  const clips = (rec.project?.clips ?? []).filter((c: any) => !c.assetId || ids.has(c.assetId))
  setAssets(assets)
  loadProject({ ...rec.project, clips }, rec.name)
  return clips.length > 0
}

/** Opens the last project (moving an old single-project save into the list first). */
export async function restoreProject(): Promise<boolean> {
  try {
    let id = await tx<string>('kv', 'readonly', (st) => st.get('currentId'))
    if (!id) {
      const old = await tx<any>('kv', 'readonly', (st) => st.get('current'))
      if (old?.project) {
        id = newId()
        await tx('kv', 'readwrite', (st) => st.put(old, 'proj:' + id))
        await putIndex((l) => [{ id: id!, name: old.name || 'My project', savedAt: old.savedAt || Date.now(), clips: old.project.clips?.length ?? 0, dur: 0, assetIds: old.assetIds ?? [] }, ...l])
        await tx('kv', 'readwrite', (st) => st.delete('current'))
      }
    }
    if (!id) return false
    currentId = id
    const rec = await tx<any>('kv', 'readonly', (st) => st.get('proj:' + id))
    if (!rec || !rec.project?.clips?.length) return false
    return await loadRecord(rec)
  } catch {
    return false
  }
}

/** Saves now (used before switching projects). */
export async function flush() {
  await save()
  while (busy) await new Promise((r) => setTimeout(r, 50))
}
const clearEditor = () => {
  engine.pause()
  engine.seek(0)
  resetProject()
}
/** Starts an empty project; the one you were editing stays in the list. */
export async function newProject(name = 'My reel') {
  if (getState().project.clips.length) await flush()
  clearEditor()
  currentId = newId()
  setUi({ projectName: name })
  changed()
}
export async function openProject(id: string) {
  if (id === currentId) return
  if (getState().project.clips.length) await flush()
  const rec = await tx<any>('kv', 'readonly', (st) => st.get('proj:' + id))
  if (!rec) throw new Error('That project could not be found.')
  clearEditor()
  currentId = id
  await tx('kv', 'readwrite', (st) => st.put(id, 'currentId'))
  await loadRecord(rec)
  changed()
}
export async function duplicateProject(id: string) {
  if (id === currentId) await flush()
  const rec = await tx<any>('kv', 'readonly', (st) => st.get('proj:' + id))
  const info = (await tx<ProjectInfo[]>('kv', 'readonly', (st) => st.get('projects')))?.find((p) => p.id === id)
  if (!rec || !info) return
  const nid = newId()
  const name = `${rec.name} (copy)`
  await tx('kv', 'readwrite', (st) => st.put({ ...rec, name, savedAt: Date.now() }, 'proj:' + nid))
  await putIndex((l) => [{ ...info, id: nid, name, savedAt: Date.now() }, ...l])
}
export async function renameProject(id: string, name: string) {
  name = name.trim() || 'My reel'
  if (id === currentId) setUi({ projectName: name })
  const rec = await tx<any>('kv', 'readonly', (st) => st.get('proj:' + id))
  if (rec) await tx('kv', 'readwrite', (st) => st.put({ ...rec, name }, 'proj:' + id))
  await putIndex((l) => l.map((p) => (p.id === id ? { ...p, name } : p)))
}
export async function deleteProject(id: string) {
  await tx('kv', 'readwrite', (st) => st.delete('proj:' + id))
  await putIndex((l) => l.filter((p) => p.id !== id))
  if (id === currentId) {
    clearEditor()
    currentId = newId()
  }
  await cleanMedia()
}

export function startAutosave() {
  let timer: number | undefined
  let last = getState()
  subscribe(() => {
    const s = getState()
    if (s.project === last.project && s.assets === last.assets && s.projectName === last.projectName) return
    last = s
    clearTimeout(timer)
    timer = window.setTimeout(save, 700)
  })
  void save()
}

/* ---------------- version history ---------------- */

export interface Version {
  id: number
  time: number
  name: string
  auto: boolean
  projectName: string
  projectId?: string
  project: import('./types').Project
  clips: number
  dur: number
}

const MAX_AUTO = 30
let lastAutoJson = ''

export async function saveVersion(name = '', auto = false): Promise<Version | null> {
  const s = getState()
  if (!s.project.clips.length) return null
  const json = JSON.stringify(s.project)
  if (auto && json === lastAutoJson) return null
  lastAutoJson = json
  const v: Version = {
    id: Date.now(),
    time: Date.now(),
    name: name.trim(),
    auto,
    projectName: s.projectName,
    projectId: currentId,
    project: JSON.parse(json),
    clips: s.project.clips.length,
    dur: s.project.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0),
  }
  await tx('versions', 'readwrite', (st) => st.put(v))
  // keep the newest MAX_AUTO automatic snapshots; named ones are kept forever
  const all = await listVersions()
  const autos = all.filter((x) => x.auto)
  for (const old of autos.slice(MAX_AUTO)) await tx('versions', 'readwrite', (st) => st.delete(old.id))
  return v
}

export async function listVersions(): Promise<Version[]> {
  try {
    const all = ((await tx<Version[]>('versions', 'readonly', (st) => st.getAll())) ?? []).filter((v) => !v.projectId || v.projectId === currentId)
    return all.sort((a, b) => b.time - a.time)
  } catch {
    return []
  }
}

export async function deleteVersion(id: number) {
  await tx('versions', 'readwrite', (st) => st.delete(id))
}

/** Every 5 minutes, snapshot the project if it changed. */
export function startVersionTimer() {
  setInterval(() => void saveVersion('', true).catch(() => {}), 5 * 60 * 1000)
}

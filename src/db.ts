import { getState, loadProject, setAssets, setUi, subscribe } from './store'
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
      setUi({ saveStatus: 'saving' })
      for (const a of s.assets) {
        if (!stored.has(a.id) && a.blob) {
          await tx('media', 'readwrite', (st) => st.put({ id: a.id, name: a.name, type: a.blob!.type, blob: a.blob }, a.id))
          stored.add(a.id)
        }
      }
      const keys = (await tx('media', 'readonly', (st) => st.getAllKeys())) as string[]
      for (const k of keys) {
        if (!s.assets.some((a) => a.id === k)) {
          await tx('media', 'readwrite', (st) => st.delete(k))
          stored.delete(k)
        }
      }
      await tx('kv', 'readwrite', (st) =>
        st.put({ project: s.project, name: s.projectName, assetIds: s.assets.map((a) => a.id), savedAt: Date.now() }, 'current'),
      )
      setUi({ saveStatus: 'saved' })
    } while (again)
  } catch {
    setUi({ saveStatus: 'error' })
  } finally {
    busy = false
  }
}

export async function restoreProject(): Promise<boolean> {
  try {
    const rec = await tx<any>('kv', 'readonly', (st) => st.get('current'))
    if (!rec || !rec.project?.clips?.length) return false
    const assets: Asset[] = []
    for (const id of rec.assetIds as string[]) {
      const m = await tx<any>('media', 'readonly', (st) => st.get(id))
      if (!m) continue
      const a = await engine.importFile(new File([m.blob], m.name, { type: m.type }), id)
      if (a) {
        assets.push(a)
        stored.add(id)
      }
    }
    const ids = new Set(assets.map((a) => a.id))
    const clips = rec.project.clips.filter((c: any) => !c.assetId || ids.has(c.assetId))
    setAssets(assets)
    loadProject({ ...rec.project, clips }, rec.name)
    return true
  } catch {
    return false
  }
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
    const all = (await tx<Version[]>('versions', 'readonly', (st) => st.getAll())) ?? []
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

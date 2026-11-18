import { useSyncExternalStore } from 'react'
import {
  Asset,
  Clip,
  ClipKind,
  DEFAULT_FILTERS,
  KfProp,
  PRESETS,
  Project,
  TRACKS,
  TextProps,
} from './types'
import { Motion, cloneKf, evalProp, motionKeys, scaleKeyTimes, splitKeyframes, KF_PROPS } from './anim'
import { TextPreset, SFX_LIST } from './library'

export interface State {
  project: Project
  assets: Asset[]
  selectedId: string | null
  selIds: string[]
  past: Project[]
  future: Project[]
  showSafe: boolean
  projectName: string
  snap: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  toast: string
  picking: string | null
}

let state: State = {
  project: { presetId: 'shorts', bg: '#000000', clips: [], markers: [] },
  assets: [],
  selectedId: null,
  selIds: [],
  past: [],
  future: [],
  showSafe: true,
  projectName: 'My first edit',
  snap: true,
  saveStatus: 'idle',
  toast: '',
  picking: null,
}

const listeners = new Set<() => void>()
export const getState = () => state
export const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

let timeGetter: () => number = () => 0
export const setTimeGetter = (fn: () => number) => (timeGetter = fn)

let idn = 0
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(idn++).toString(36)}`

export const trackType = (id: string) => TRACKS.find((t) => t.id === id)?.type ?? 'video'
export const clipEnd = (c: Clip) => c.start + c.dur
export const projectDuration = (clips = state.project.clips) =>
  clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
export const getPreset = () => PRESETS.find((p) => p.id === state.project.presetId) ?? PRESETS[0]
export const getAsset = (id?: string) => state.assets.find((a) => a.id === id)
export const getClip = (id: string | null) => state.project.clips.find((c) => c.id === id)

/* ---------- history ---------- */
export function checkpoint() {
  const past = [...state.past, state.project].slice(-120)
  set({ past, future: [] })
}
export function undo() {
  if (!state.past.length) return
  const prev = state.past[state.past.length - 1]
  set({
    past: state.past.slice(0, -1),
    future: [state.project, ...state.future],
    project: prev,
    selectedId: prev.clips.some((c) => c.id === state.selectedId) ? state.selectedId : null,
    selIds: state.selIds.filter((i) => prev.clips.some((c) => c.id === i)),
  })
}
export function redo() {
  if (!state.future.length) return
  const next = state.future[0]
  set({
    future: state.future.slice(1),
    past: [...state.past, state.project],
    project: next,
    selectedId: next.clips.some((c) => c.id === state.selectedId) ? state.selectedId : null,
    selIds: state.selIds.filter((i) => next.clips.some((c) => c.id === i)),
  })
}

/* ---------- mutations ---------- */
function setClips(clips: Clip[]) {
  set({ project: { ...state.project, clips } })
}

/** Update without creating a history entry (call checkpoint() once at gesture start). */
export function patchClip(id: string, patch: Partial<Clip>) {
  setClips(state.project.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)))
}
/** Update and record an undo step. */
export function updateClip(id: string, patch: Partial<Clip>) {
  checkpoint()
  patchClip(id, patch)
}
export function patchText(id: string, patch: Partial<TextProps>) {
  setClips(
    state.project.clips.map((c) => (c.id === id && c.text ? { ...c, text: { ...c.text, ...patch } } : c)),
  )
}
/** All clip ids in the same group as `id` (or just [id]). */
export function groupOf(id: string): string[] {
  const g = state.project.clips.find((c) => c.id === id)?.group
  return g ? state.project.clips.filter((c) => c.group === g).map((c) => c.id) : [id]
}

export function select(id: string | null, mode: 'set' | 'toggle' = 'set') {
  if (mode === 'toggle' && id) {
    const mates = groupOf(id)
    const has = state.selIds.includes(id)
    const ids = has ? state.selIds.filter((i) => !mates.includes(i)) : [...state.selIds, ...mates.filter((m) => !state.selIds.includes(m))]
    set({ selIds: ids, selectedId: has ? ids[ids.length - 1] ?? null : id })
  } else set({ selectedId: id, selIds: id ? groupOf(id) : [] })
}

export function groupClips(ids: string[]): boolean {
  if (ids.length < 2) return false
  checkpoint()
  const g = uid('grp')
  const all = new Set(ids.flatMap((i) => groupOf(i)))
  set({ project: { ...state.project, clips: state.project.clips.map((c) => (all.has(c.id) ? { ...c, group: g } : c)) }, selIds: [...all] })
  return true
}

export function ungroupClips(ids: string[]): boolean {
  const gs = new Set(state.project.clips.filter((c) => ids.includes(c.id) && c.group).map((c) => c.group))
  if (!gs.size) return false
  checkpoint()
  set({ project: { ...state.project, clips: state.project.clips.map((c) => (c.group && gs.has(c.group) ? { ...c, group: undefined } : c)) } })
  return true
}

/** After one grouped clip was trimmed, trim the rest of its group to the same outer edge. */
export function trimGroupTo(id: string, side: 'l' | 'r') {
  const c = getClip(id)
  if (!c?.group) return
  const edge = side === 'r' ? clipEnd(c) : c.start
  const clips = state.project.clips
    .map((o) => {
      if (o.id === c.id || o.group !== c.group) return o
      if (side === 'r') {
        if (o.start >= edge - 0.05) return null
        return clipEnd(o) > edge ? { ...o, dur: edge - o.start, fadeOut: Math.min(o.fadeOut, edge - o.start) } : o
      }
      if (clipEnd(o) <= edge + 0.05) return null
      if (o.start >= edge) return o
      const cut = edge - o.start
      return { ...o, start: edge, dur: o.dur - cut, srcIn: o.kind === 'video' || o.kind === 'audio' ? o.srcIn + cut * o.speed : o.srcIn, kf: shiftKfTimes(o, -cut) }
    })
    .filter(Boolean) as Clip[]
  set({ project: { ...state.project, clips } })
}

function shiftKfTimes(c: Clip, d: number) {
  if (!c.kf) return c.kf
  const out: typeof c.kf = {}
  for (const p of KF_PROPS) if (c.kf[p]) out[p] = c.kf[p]!.map((k) => ({ ...k, t: k.t + d })).filter((k) => k.t >= -0.001)
  return out
}
export function selectMany(ids: string[]) {
  set({ selIds: ids, selectedId: ids[ids.length - 1] ?? null })
}
export function setProject(patch: Partial<Project>) {
  checkpoint()
  set({ project: { ...state.project, ...patch } })
}
export function setUi(patch: Partial<Pick<State, 'showSafe' | 'projectName' | 'snap' | 'saveStatus' | 'toast' | 'picking'>>) {
  set(patch)
}
export function addAsset(a: Asset) {
  set({ assets: [...state.assets, a] })
}
export function removeAsset(id: string) {
  checkpoint()
  set({
    assets: state.assets.filter((a) => a.id !== id),
    project: { ...state.project, clips: state.project.clips.filter((c) => c.assetId !== id) },
  })
}

export function baseClip(kind: ClipKind, track: string, over: Partial<Clip> = {}): Clip {
  return {
    id: uid('clip'),
    kind,
    track,
    label: kind,
    start: 0,
    dur: 3,
    srcIn: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    opacity: 1,
    flipX: false,
    fit: 'contain',
    filters: { ...DEFAULT_FILTERS },
    fx: 'none',
    transIn: { type: 'none', dur: 0.5 },
    transOut: { type: 'none', dur: 0.5 },
    ...over,
  }
}

/** Push a clip away from any overlapping neighbour on the same track. */
export function resolveOverlap(clips: Clip[], moved: Clip): Clip {
  let s = Math.max(0, moved.start)
  for (let i = 0; i < 40; i++) {
    const hit = clips.find(
      (o) => o.id !== moved.id && o.track === moved.track && s < clipEnd(o) - 1e-3 && s + moved.dur > o.start + 1e-3,
    )
    if (!hit) break
    const mc = s + moved.dur / 2
    const oc = hit.start + hit.dur / 2
    if (mc >= oc) s = clipEnd(hit)
    else {
      s = hit.start - moved.dur
      if (s < 0) s = clipEnd(hit)
    }
  }
  return { ...moved, start: s }
}

function trackEnd(track: string) {
  return state.project.clips.filter((c) => c.track === track).reduce((m, c) => Math.max(m, clipEnd(c)), 0)
}

function insertClip(c: Clip, resolve = true) {
  const placed = resolve ? resolveOverlap(state.project.clips, c) : c
  checkpoint()
  set({ project: { ...state.project, clips: [...state.project.clips, placed] }, selectedId: placed.id, selIds: [placed.id] })
  return placed
}

export function addAssetClip(assetId: string, track?: string, start?: number) {
  const a = getAsset(assetId)
  if (!a) return
  const t = timeGetter()
  if (a.kind === 'audio') {
    const tr = track ?? 'a2'
    return insertClip(
      baseClip('audio', tr, { assetId, label: a.name, start: start ?? t, dur: a.duration, volume: 1 }),
    )
  }
  const tr = track ?? 'v1'
  const main = tr === 'v1'
  const st = start ?? (main ? trackEnd('v1') : t)
  if (a.kind === 'video') {
    return insertClip(
      baseClip('video', tr, {
        assetId,
        label: a.name,
        start: st,
        dur: a.duration,
        fit: main ? 'cover' : 'contain',
        scale: main ? 1 : 0.5,
        x: main ? 0.5 : 0.72,
        y: main ? 0.5 : 0.28,
      }),
    )
  }
  return insertClip(
    baseClip('image', tr, {
      assetId,
      label: a.name,
      start: st,
      dur: a.animated ? Math.max(a.duration, 2) : 4,
      fit: main ? 'cover' : 'contain',
      scale: main ? 1 : 0.5,
      x: main ? 0.5 : 0.72,
      y: main ? 0.5 : 0.28,
    }),
  )
}

function freeOverlayTrack(start: number, dur: number): string {
  for (const id of ['v2', 'v3', 'v4']) {
    const busy = state.project.clips.some((c) => c.track === id && start < clipEnd(c) && start + dur > c.start)
    if (!busy) return id
  }
  return 'v4'
}

export function addText(preset: TextPreset, textOverride?: string) {
  const t = timeGetter()
  const track = freeOverlayTrack(t, 3)
  return insertClip(
    baseClip('text', track, {
      label: textOverride ?? preset.props.text,
      start: t,
      dur: 3,
      y: preset.y,
      text: { ...preset.props, text: textOverride ?? preset.props.text },
      transIn: { type: 'fade', dur: 0.25 },
    }),
  )
}

export function addSticker(emoji: string) {
  const t = timeGetter()
  const track = freeOverlayTrack(t, 3)
  return insertClip(
    baseClip('sticker', track, {
      label: emoji,
      emoji,
      stickerSize: 0.2,
      start: t,
      dur: 3,
      transIn: { type: 'zoom-in', dur: 0.25 },
    }),
  )
}

export function addSfx(sfxId: string) {
  const def = SFX_LIST.find((s) => s.id === sfxId)
  if (!def) return
  const t = timeGetter()
  return insertClip(baseClip('sfx', 'a1', { sfxId, label: def.name, start: t, dur: def.dur }))
}

export function addCaptionClips(
  lines: { text: string; start: number; dur: number; hlIdx?: number }[],
  textStyle: TextProps,
  y: number,
) {
  checkpoint()
  const made = lines.map((l) =>
    baseClip('text', 'v4', {
      label: l.text,
      start: l.start,
      dur: l.dur,
      y,
      text: { ...textStyle, text: l.text, hlIdx: l.hlIdx },
    }),
  )
  set({ project: { ...state.project, clips: [...state.project.clips, ...made] }, selectedId: made[0]?.id ?? null, selIds: made[0] ? [made[0].id] : [] })
}

export function deleteClip(id: string) {
  checkpoint()
  set({
    project: { ...state.project, clips: state.project.clips.filter((c) => c.id !== id) },
    selectedId: state.selectedId === id ? null : state.selectedId,
    selIds: state.selIds.filter((i) => i !== id),
  })
}

export function duplicateClip(id: string) {
  const c = getClip(id)
  if (!c) return
  const copy: Clip = { ...c, group: undefined, id: uid('clip'), start: clipEnd(c), filters: { ...c.filters }, kf: cloneKf(c.kf), text: c.text ? { ...c.text } : undefined }
  insertClip(copy)
}

export function splitClip(id: string | null, at: number, cp = true) {
  const c = getClip(id)
  if (!c || at <= c.start + 0.05 || at >= clipEnd(c) - 0.05) return false
  const first = at - c.start
  const [kfA, kfB] = splitKeyframes(c, first)
  const a: Clip = { ...c, dur: first, transOut: { type: 'none', dur: 0.5 }, fadeOut: 0, kf: kfA }
  const b: Clip = {
    ...c,
    id: uid('clip'),
    start: at,
    dur: c.dur - first,
    srcIn: c.srcIn + first * c.speed,
    transIn: { type: 'none', dur: 0.5 },
    fadeIn: 0,
    filters: { ...c.filters },
    kf: kfB,
    text: c.text ? { ...c.text } : undefined,
  }
  if (cp) checkpoint()
  set({
    project: { ...state.project, clips: state.project.clips.flatMap((x) => (x.id === c.id ? [a, b] : [x])) },
    selectedId: b.id,
    selIds: [b.id],
  })
  return true
}

export function setSpeed(id: string, speed: number) {
  const c = getClip(id)
  if (!c) return
  const srcLen = c.dur * c.speed
  const nd = srcLen / speed
  patchClip(id, { speed, dur: nd, kf: scaleKeyTimes(c.kf, nd / c.dur) })
}

export function trimToAsset(c: Clip, wantDur: number) {
  const a = getAsset(c.assetId)
  if (a && (c.kind === 'video' || c.kind === 'audio')) {
    const maxDur = Math.max(0.1, (a.duration - c.srcIn) / c.speed)
    return Math.min(wantDur, maxDur)
  }
  return wantDur
}


/* ---------- keyframes ---------- */
export const localTime = (c: Clip) => Math.min(Math.max(timeGetter() - c.start, 0), c.dur)

/** Set a transform property. If the property is keyframed, writes a keyframe at the playhead instead. */
export function setClipProp(id: string, prop: KfProp, v: number) {
  const c = getClip(id)
  if (!c) return
  const ks = c.kf?.[prop]
  if (ks?.length) {
    const lt = +localTime(c).toFixed(3)
    const next = ks.filter((k) => Math.abs(k.t - lt) > 0.02)
    next.push({ t: lt, v })
    next.sort((a, b) => a.t - b.t)
    patchClip(id, { kf: { ...c.kf, [prop]: next } })
  } else patchClip(id, { [prop]: v } as Partial<Clip>)
}

export function hasKeyAt(c: Clip, prop: KfProp) {
  const lt = localTime(c)
  return !!c.kf?.[prop]?.some((k) => Math.abs(k.t - lt) <= 0.02)
}

/** Diamond button: add a keyframe at the playhead, or remove the one that is there. */
export function toggleKeyframe(id: string, prop: KfProp) {
  const c = getClip(id)
  if (!c) return
  checkpoint()
  const lt = +localTime(c).toFixed(3)
  const ks = c.kf?.[prop] ?? []
  if (ks.some((k) => Math.abs(k.t - lt) <= 0.02)) {
    const rest = ks.filter((k) => Math.abs(k.t - lt) > 0.02)
    // when the last keyframe is removed, bake the value so nothing jumps
    const kf = { ...c.kf }
    if (rest.length) kf[prop] = rest
    else delete kf[prop]
    patchClip(id, rest.length ? { kf } : ({ kf, [prop]: evalProp(c, prop, lt) } as Partial<Clip>))
  } else {
    const v = evalProp(c, prop, lt)
    patchClip(id, { kf: { ...c.kf, [prop]: [...ks, { t: lt, v }].sort((a, b) => a.t - b.t) } })
  }
}

export function clearKeyframes(id: string) {
  const c = getClip(id)
  if (!c?.kf) return
  checkpoint()
  const lt = localTime(c)
  const base: Partial<Clip> = { kf: undefined }
  for (const p of KF_PROPS) if (c.kf[p]?.length) (base as any)[p] = evalProp(c, p, lt)
  patchClip(id, base)
}

export function applyMotion(id: string, m: Motion) {
  const c = getClip(id)
  if (!c) return
  checkpoint()
  const base: Partial<Clip> = {}
  const nk = motionKeys(c, m)
  patchClip(id, { ...base, kf: { ...c.kf, ...nk } })
}

/* ---------- project load / reset ---------- */
export function loadProject(p: Project, name: string) {
  set({ project: { ...p, markers: p.markers ?? [] }, projectName: name, past: [], future: [], selectedId: null, selIds: [] })
}
export function resetProject() {
  set({
    project: { presetId: state.project.presetId, bg: '#000000', clips: [], markers: [] },
    assets: [],
    past: [],
    future: [],
    selectedId: null,
    selIds: [],
    projectName: 'My first edit',
  })
}
export function setAssets(assets: Asset[]) {
  set({ assets })
}


/* ---------- multi-select helpers ---------- */
export function deleteMany(ids: string[]) {
  if (!ids.length) return
  checkpoint()
  set({
    project: { ...state.project, clips: state.project.clips.filter((c) => !ids.includes(c.id)) },
    selectedId: null,
    selIds: [],
  })
}

/** Delete clips and close the gap they leave on their own tracks. */
export function rippleDelete(ids: string[]) {
  if (!ids.length) return
  checkpoint()
  let clips = state.project.clips
  const del = clips.filter((c) => ids.includes(c.id)).sort((a, b) => b.start - a.start)
  for (const d of del) {
    clips = clips
      .filter((x) => x.id !== d.id)
      .map((x) => (x.track === d.track && x.start >= d.start + d.dur - 1e-3 ? { ...x, start: Math.max(0, x.start - d.dur) } : x))
  }
  set({ project: { ...state.project, clips }, selectedId: null, selIds: [] })
}

export function duplicateMany(ids: string[]) {
  if (ids.length < 2) return ids[0] ? duplicateClip(ids[0]) : undefined
  checkpoint()
  const src = state.project.clips.filter((c) => ids.includes(c.id))
  const minS = Math.min(...src.map((c) => c.start))
  const maxE = Math.max(...src.map(clipEnd))
  const regroup = new Map<string, string>()
  const made = src.map((c) => ({
    ...c,
    group: c.group ? (regroup.get(c.group) ?? (regroup.set(c.group, uid('grp')), regroup.get(c.group))) : undefined,
    id: uid('clip'),
    start: c.start - minS + maxE,
    filters: { ...c.filters },
    kf: cloneKf(c.kf),
    text: c.text ? { ...c.text } : undefined,
  }))
  set({ project: { ...state.project, clips: [...state.project.clips, ...made] }, selIds: made.map((m) => m.id), selectedId: made[made.length - 1].id })
}

export function splitMany(ids: string[], at: number) {
  const todo = state.project.clips.filter((c) => ids.includes(c.id) && at > c.start + 0.05 && at < clipEnd(c) - 0.05)
  for (const c of todo) splitClip(c.id, at)
  return todo.length > 0
}

/* ---------- markers ---------- */
export function addMarker(t: number) {
  if (state.project.markers.some((m) => Math.abs(m - t) < 0.03)) return
  checkpoint()
  set({ project: { ...state.project, markers: [...state.project.markers, +t.toFixed(3)].sort((a, b) => a - b) } })
}
export function addMarkers(ts: number[]) {
  if (!ts.length) return
  checkpoint()
  const all = [...state.project.markers]
  for (const t of ts) if (!all.some((m) => Math.abs(m - t) < 0.03)) all.push(+t.toFixed(3))
  set({ project: { ...state.project, markers: all.sort((a, b) => a - b) } })
}
export function removeMarker(t: number) {
  checkpoint()
  set({ project: { ...state.project, markers: state.project.markers.filter((m) => Math.abs(m - t) > 0.005) } })
}
export function clearMarkers() {
  checkpoint()
  set({ project: { ...state.project, markers: [] } })
}

/* ---------- freeze frame / asset helpers ---------- */
/** Splits the clip at `at`, inserts a held frame of `dur` seconds, and pushes later clips on the track right. */
export function freezeFrameAt(id: string, at: number, dur = 2) {
  const c = getClip(id)
  if (!c || c.kind !== 'video') return false
  const first = at - c.start
  if (first < 0.05 || first > c.dur - 0.05) return false
  const srcAt = c.srcIn + first * c.speed
  const A: Clip = { ...c, dur: first, transOut: { type: 'none', dur: 0.5 }, fadeOut: 0, kf: splitKeyframes(c, first)[0] }
  const F: Clip = {
    ...c,
    id: uid('clip'),
    label: 'Freeze frame',
    start: at,
    dur,
    srcIn: srcAt,
    speed: 1,
    freeze: true,
    kf: undefined,
    stab: undefined,
    transIn: { type: 'none', dur: 0.5 },
    transOut: { type: 'none', dur: 0.5 },
    fadeIn: 0,
    fadeOut: 0,
    filters: { ...c.filters },
  }
  const B: Clip = {
    ...c,
    id: uid('clip'),
    start: at + dur,
    dur: c.dur - first,
    srcIn: srcAt,
    transIn: { type: 'none', dur: 0.5 },
    fadeIn: 0,
    filters: { ...c.filters },
    kf: splitKeyframes(c, first)[1],
  }
  checkpoint()
  const end = clipEnd(c)
  const clips = state.project.clips.flatMap((x) => {
    if (x.id === c.id) return [A, F, B]
    if (x.track === c.track && x.start >= end - 1e-3) return [{ ...x, start: x.start + dur }]
    return [x]
  })
  set({ project: { ...state.project, clips }, selectedId: F.id, selIds: [F.id] })
  return true
}

export function updateAsset(id: string, patch: Partial<Asset>) {
  set({ assets: state.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })
}
export function setTextAnimProp(id: string, patch: Partial<TextProps>) {
  patchText(id, patch)
}


/** Replaces one clip by consecutive pieces of its source (used by silence cutting and speed ramps). Later clips on the track ripple. */
export function restructureClip(id: string, segs: { srcIn: number; srcLen: number; speed: number }[], cp = true) {
  const c = getClip(id)
  if (!c || !segs.length) return false
  if (cp) checkpoint()
  let t = c.start
  const made: Clip[] = segs.map((g, i) => {
    const dur = g.srcLen / g.speed
    const n: Clip = {
      ...c,
      id: i === 0 ? c.id : uid('clip'),
      start: t,
      dur,
      srcIn: g.srcIn,
      speed: g.speed,
      filters: { ...c.filters },
      kf: segs.length === 1 ? c.kf : undefined,
      fadeIn: i === 0 ? c.fadeIn : 0,
      fadeOut: i === segs.length - 1 ? c.fadeOut : 0,
      transIn: i === 0 ? c.transIn : { type: 'none', dur: 0.5 },
      transOut: i === segs.length - 1 ? c.transOut : { type: 'none', dur: 0.5 },
      stab: c.stab,
      duck: undefined,
      volKf: undefined,
    }
    t += dur
    return n
  })
  const delta = t - clipEnd(c)
  const oldEnd = clipEnd(c)
  const clips = state.project.clips.flatMap((x) => {
    if (x.id === c.id) return made
    if (x.track === c.track && x.start >= oldEnd - 1e-3) return [{ ...x, start: Math.max(0, x.start + delta) }]
    return [x]
  })
  set({ project: { ...state.project, clips }, selectedId: c.id, selIds: [c.id] })
  return true
}

/* ---------- user text styles (kept in this browser) ---------- */
export interface SavedStyle {
  name: string
  props: Omit<TextProps, 'text' | 'hlIdx'>
  y: number
}
const STYLE_KEY = 'clipforge-text-styles'
export function loadStyles(): SavedStyle[] {
  try {
    return JSON.parse(localStorage.getItem(STYLE_KEY) || '[]')
  } catch {
    return []
  }
}
export function saveStyle(name: string, c: Clip) {
  if (!c.text) return
  const { text: _t, hlIdx: _h, ...props } = c.text
  const list = loadStyles().filter((x) => x.name !== name)
  list.push({ name, props, y: c.y })
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(list))
  } catch {}
  set({})
}
export function deleteStyle(name: string) {
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(loadStyles().filter((x) => x.name !== name)))
  } catch {}
  set({})
}

/* ---------- SRT export ---------- */
const srtTime = (t: number) => {
  const ms = Math.round(t * 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
export function buildSrt(): string {
  const texts = state.project.clips.filter((c) => c.kind === 'text' && c.text && c.text.text.trim()).sort((a, b) => a.start - b.start)
  const cues: { a: number; b: number; t: string }[] = []
  for (const c of texts) {
    const prev = cues[cues.length - 1]
    // karaoke captions are one clip per word-highlight; merge identical consecutive lines into one cue
    if (prev && prev.t === c.text!.text && c.start - prev.b < 0.06) prev.b = clipEnd(c)
    else cues.push({ a: c.start, b: clipEnd(c), t: c.text!.text })
  }
  return cues.map((q, i) => `${i + 1}\n${srtTime(q.a)} --> ${srtTime(q.b)}\n${q.t.trim()}\n`).join('\n')
}


/** Adds several ready-made clips in one undo step (used by templates). */
export function addClipsBatch(clips: Clip[], projectPatch?: Partial<Project>) {
  if (!clips.length && !projectPatch) return
  checkpoint()
  set({
    project: { ...state.project, ...projectPatch, clips: [...state.project.clips, ...clips] },
    selectedId: clips[0]?.id ?? state.selectedId,
    selIds: clips[0] ? [clips[0].id] : state.selIds,
  })
}

/** Replace the whole timeline in one undoable step (used by Auto-edit). */
export function replaceTimeline(clips: Clip[], projectPatch?: Partial<Project>) {
  checkpoint()
  set({
    project: { ...state.project, ...projectPatch, clips, markers: projectPatch?.markers ?? [] },
    selectedId: null,
    selIds: [],
  })
}

/** Adds clips without an undo step of their own (caller already checkpointed). */
export function insertSilent(clips: Clip[]) {
  set({ project: { ...state.project, clips: [...state.project.clips, ...clips] } })
}

/** Replace the clip list without an undo step of its own (caller already checkpointed). */
export function setClipsSilent(clips: Clip[]) {
  set({ project: { ...state.project, clips } })
}

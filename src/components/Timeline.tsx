import { useEffect, useRef, useState } from 'react'
import { engine } from '../engine'
import {
  addAssetClip,
  addMarker,
  checkpoint,
  clearMarkers,
  clipEnd,
  deleteMany,
  duplicateMany,
  getAsset,
  getClip,
  getState,
  patchClip,
  removeMarker,
  resolveOverlap,
  rippleDelete,
  select,
  selectMany,
  setUi,
  splitMany,
  trackType,
  trimToAsset,
  useStore,
  groupClips,
  ungroupClips,
  trimGroupTo,
  toggleTrack,
} from '../store'
import { getSettings, rowHeight, setSettings, useSettings } from '../settings'
import { Clip, TRACKS } from '../types'
import { kfTimes, shiftKeyframes } from '../anim'
import { fmtTime } from './Fields'
import { AudioOverlay } from './AudioOverlay'
import { Icon } from './Icon'

const TRACK_SHORT: Record<string, string> = { v4: 'Layer 3', v3: 'Layer 2', v2: 'Layer 1' }
const TRACK_ICON: Record<string, string> = { v4: 'layers', v3: 'layers', v2: 'layers', v1: 'film', a1: 'volume', a2: 'music' }

// set on every render from the user's settings (track height) and screen size
let LABEL_W = 112
let ROW_H = 40
const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 820px)').matches

function Wave({ peaks, from, to, w, h, low }: { peaks: number[]; from: number; to: number; w: number; h: number; low?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    ctx.clearRect(0, 0, cv.width, cv.height)
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    const n = peaks.length
    const bars = Math.max(1, Math.floor(w / 3))
    for (let i = 0; i < bars; i++) {
      const p = from + (i / bars) * (to - from)
      const v = peaks[Math.min(n - 1, Math.max(0, Math.floor(p * n)))] ?? 0
      const bh = Math.max(1, v * h * 0.9)
      ctx.fillRect(i * 3, (h - bh) / 2, 2, bh)
    }
  }, [peaks, from, to, w, h])
  return <canvas ref={ref} className={'wave' + (low ? ' low' : '')} width={Math.max(1, Math.floor(w))} height={h} />
}

const stripImgs = new Map<string, HTMLImageElement>()
function Film({ strip, from, to, w, h }: { strip: { url: string; n: number }; from: number; to: number; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [, bump] = useState(0)
  useEffect(() => {
    let im = stripImgs.get(strip.url)
    if (!im) {
      im = new Image()
      im.src = strip.url
      stripImgs.set(strip.url, im)
    }
    const draw = () => {
      const cv = ref.current
      if (!cv || !im || !im.naturalWidth) return
      const ctx = cv.getContext('2d')!
      ctx.clearRect(0, 0, cv.width, cv.height)
      const tw = im.naturalWidth / strip.n
      const dh = cv.height
      const dw = Math.max(12, (tw / im.naturalHeight) * dh)
      for (let x = 0; x < cv.width; x += dw) {
        const u = from + ((x + dw / 2) / cv.width) * (to - from)
        const idx = Math.min(strip.n - 1, Math.max(0, Math.floor(u * strip.n)))
        ctx.drawImage(im, idx * tw, 0, tw, im.naturalHeight, x, 0, dw, dh)
      }
    }
    if (im.complete) draw()
    else im.onload = () => (draw(), bump((n) => n + 1))
  }, [strip, from, to, w, h])
  return <canvas ref={ref} className="film" width={Math.max(1, Math.floor(w))} height={h} />
}

/** Drag the top edge of the timeline to make it taller or shorter (remembered). */
function ResizeEdge() {
  const [on, setOn] = useState(false)
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const phone = isPhone()
    const y0 = e.clientY
    const h0 = phone ? getSettings().tlHm : getSettings().tlH
    setOn(true)
    const mv = (ev: PointerEvent) => {
      const max = window.innerHeight - (phone ? 230 : 260)
      const h = Math.min(max, Math.max(phone ? 140 : 170, h0 + (y0 - ev.clientY)))
      setSettings(phone ? { tlHm: h } : { tlH: h })
    }
    const up = () => {
      setOn(false)
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setTimeout(() => window.dispatchEvent(new Event('resize')), 0)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  return <div className={'tl-resize' + (on ? ' on' : '')} onPointerDown={start} title="Drag to make the timeline taller or shorter" />
}

export function Timeline() {
  useSettings((s) => s.trackH)
  const phone = useSettings(() => isPhone())
  ROW_H = rowHeight()
  LABEL_W = phone ? 34 : 112
  const tflags = useStore((s) => s.project.tracks) ?? {}
  const [trkMenu, setTrkMenu] = useState('')
  const clips = useStore((s) => s.project.clips)
  const selectedId = useStore((s) => s.selectedId)
  const selIds = useStore((s) => s.selIds)
  const markers = useStore((s) => s.project.markers)
  const snap = useStore((s) => s.snap)
  const [marq, setMarq] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [pps, setPps] = useState(70)
  const scroll = useRef<HTMLDivElement>(null)
  const lanes = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const dur = clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
  const totalW = Math.max(dur + 10, 30) * pps

  useEffect(() => {
    const place = (t: number, playing: boolean) => {
      const x = LABEL_W + t * pps
      if (head.current) head.current.style.transform = `translateX(${x}px)`
      const sc = scroll.current
      if (sc && playing && (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft + LABEL_W)) sc.scrollLeft = x - LABEL_W - 40
    }
    place(engine.time, false)
    return engine.onTick(place)
  }, [pps])

  const seekFromX = (clientX: number) => {
    const r = lanes.current!.getBoundingClientRect()
    engine.seek((clientX - r.left - LABEL_W) / pps)
  }
  const scrub = (e: React.PointerEvent) => {
    e.preventDefault()
    seekFromX(e.clientX)
    const mv = (ev: PointerEvent) => seekFromX(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const trackAtY = (clientY: number, kind: Clip['kind']): string | null => {
    const r = lanes.current!.getBoundingClientRect()
    const idx = Math.floor((clientY - r.top - 26) / ROW_H)
    const tr = TRACKS[idx]
    if (!tr || getState().project.tracks?.[tr.id]?.lock) return null
    const want = kind === 'audio' || kind === 'sfx' ? 'audio' : 'video'
    return tr.type === want ? tr.id : null
  }

  const startDrag = (e: React.PointerEvent, c: Clip, mode: 'move' | 'l' | 'r') => {
    e.stopPropagation()
    e.preventDefault()
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (mode === 'move') select(c.id, 'toggle')
      return
    }
    if (getState().project.tracks?.[c.track]?.lock) {
      select(c.id)
      setUi({ toast: 'This track is locked – click 🔒 next to its name to unlock it.' })
      return
    }
    if (!(mode === 'move' && getState().selIds.length > 1 && getState().selIds.includes(c.id))) select(c.id)
    const inGroup = mode === 'move' && getState().selIds.length > 1 && getState().selIds.includes(c.id)
    const group = inGroup ? getState().project.clips.filter((o) => getState().selIds.includes(o.id)).map((o) => ({ ...o })) : []
    const x0 = e.clientX
    const y0 = e.clientY
    const orig = { ...c }
    let moved = false
    const groupIds = new Set(group.map((g) => g.id))
    const others = getState().project.clips.filter((o) => o.id !== c.id && !groupIds.has(o.id))
    const points = [0, engine.time, ...getState().project.markers, ...others.flatMap((o) => [o.start, clipEnd(o)])]
    const thr = 9 / pps
    const snapN = (v: number): number | null => {
      if (!getState().snap) return null
      let best: number | null = null
      let bd = thr
      for (const p of points) {
        const d = Math.abs(p - v)
        if (d < bd) {
          bd = d
          best = p
        }
      }
      return best
    }
    const snapTo = (v: number) => snapN(v) ?? v
    const sameTrack = others.filter((o) => o.track === c.track)
    const prevEnd = sameTrack.filter((o) => clipEnd(o) <= orig.start + 1e-3).reduce((m, o) => Math.max(m, clipEnd(o)), 0)
    const nextStart = sameTrack.filter((o) => o.start >= clipEnd(orig) - 1e-3).reduce((m, o) => Math.min(m, o.start), Infinity)
    const isMedia = c.kind === 'video' || c.kind === 'audio'

    const move = (ev: PointerEvent) => {
      if (!moved) {
        if (Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - y0) < 3) return
        moved = true
        checkpoint()
      }
      const dx = (ev.clientX - x0) / pps
      if (inGroup) {
        const gs = Math.min(...group.map((g) => g.start))
        const ge = Math.max(...group.map(clipEnd))
        let d = Math.max(-gs, dx)
        const sa = snapN(gs + d)
        const sb = snapN(ge + d)
        const da = sa === null ? Infinity : Math.abs(sa - (gs + d))
        const db = sb === null ? Infinity : Math.abs(sb - (ge + d))
        if (da <= db && sa !== null) d = sa - gs
        else if (sb !== null) d = sb - ge
        d = Math.max(-gs, d)
        for (const g of group) patchClip(g.id, { start: g.start + d })
      } else if (mode === 'move') {
        let ns = Math.max(0, orig.start + dx)
        const sa = snapN(ns)
        const sb = snapN(ns + orig.dur)
        const da = sa === null ? Infinity : Math.abs(sa - ns)
        const db = sb === null ? Infinity : Math.abs(sb - orig.dur - ns)
        if (da <= db && sa !== null) ns = sa
        else if (sb !== null) ns = sb - orig.dur
        ns = Math.max(0, ns)
        const tr = trackAtY(ev.clientY, orig.kind) ?? orig.track
        patchClip(c.id, { start: ns, track: tr })
      } else if (mode === 'r') {
        let nd = snapTo(orig.start + orig.dur + dx) - orig.start
        nd = Math.max(0.1, nd)
        if (isFinite(nextStart)) nd = Math.min(nd, nextStart - orig.start)
        nd = trimToAsset(orig, nd)
        patchClip(c.id, { dur: Math.max(0.1, nd) })
      } else {
        let ns = snapTo(orig.start + dx)
        ns = Math.max(prevEnd, ns)
        if (isMedia) ns = Math.max(ns, orig.start - orig.srcIn / orig.speed)
        ns = Math.min(ns, orig.start + orig.dur - 0.1)
        const delta = ns - orig.start
        patchClip(c.id, {
          start: ns,
          dur: orig.dur - delta,
          srcIn: isMedia ? orig.srcIn + delta * orig.speed : orig.srcIn,
          kf: shiftKeyframes(orig, delta),
        })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (moved && (mode === 'l' || mode === 'r') && c.group) trimGroupTo(c.id, mode)
      if (moved && inGroup) {
        const rest = getState().project.clips.filter((o) => !groupIds.has(o.id))
        let shift = 0
        for (const g of group) {
          const cur = getClip(g.id)
          if (!cur) continue
          const fixed = resolveOverlap(rest, cur)
          if (Math.abs(fixed.start - cur.start) > Math.abs(shift)) shift = fixed.start - cur.start
        }
        if (shift) for (const g of group) patchClip(g.id, { start: (getClip(g.id)?.start ?? g.start) + shift })
      } else if (moved && mode === 'move') {
        const cur = getClip(c.id)
        if (cur) {
          const fixed = resolveOverlap(getState().project.clips, cur)
          if (fixed.start !== cur.start) patchClip(c.id, { start: fixed.start })
        }
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const startMarquee = (e: React.PointerEvent) => {
    // on touch screens a drag on empty space pans the timeline instead of box-selecting
    if (e.pointerType === 'touch') {
      select(null)
      return
    }
    const r = lanes.current!.getBoundingClientRect()
    const x0 = e.clientX - r.left
    const y0 = e.clientY - r.top
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    const base = additive ? [...getState().selIds] : []
    let moved = false
    const hit = (x1: number, y1: number) => {
      const xa = Math.min(x0, x1)
      const xb = Math.max(x0, x1)
      const ya = Math.min(y0, y1)
      const yb = Math.max(y0, y1)
      const ids = getState().project.clips
        .filter((c) => {
          const ti = TRACKS.findIndex((t) => t.id === c.track)
          const cy = 26 + ti * ROW_H
          const cx = LABEL_W + c.start * pps
          return cx < xb && cx + c.dur * pps > xa && cy < yb && cy + ROW_H > ya
        })
        .map((c) => c.id)
      return [...new Set([...base, ...ids])]
    }
    const mv = (ev: PointerEvent) => {
      const x1 = ev.clientX - r.left
      const y1 = ev.clientY - r.top
      if (!moved && Math.abs(x1 - x0) < 4 && Math.abs(y1 - y0) < 4) return
      moved = true
      setMarq({ x0, y0, x1, y1 })
      selectMany(hit(x1, y1))
    }
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setMarq(null)
      if (!moved && !additive) select(null)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const onDrop = (e: React.DragEvent, trackId: string) => {
    const id = e.dataTransfer.getData('text/clipforge-asset')
    if (!id) return
    e.preventDefault()
    e.stopPropagation()
    const a = getAsset(id)
    if (!a) return
    const want = a.kind === 'audio' ? 'audio' : 'video'
    const tr = trackType(trackId) === want ? trackId : want === 'audio' ? 'a2' : 'v1'
    if (getState().project.tracks?.[tr]?.lock) return setUi({ toast: 'That track is locked – unlock it first (🔒).' })
    const r = lanes.current!.getBoundingClientRect()
    const t = Math.max(0, (e.clientX - r.left - LABEL_W) / pps)
    addAssetClip(id, tr, t)
  }

  // ruler ticks
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120]
  const step = steps.find((s) => s * pps >= 70) ?? 120
  const ticks: number[] = []
  for (let t = 0; t <= totalW / pps; t += step) ticks.push(t)

  const ids = selIds
  const hasSel = ids.length > 0
  void selectedId

  return (
    <div className="timeline">
      <ResizeEdge />
      <div className="tl-bar">
        <button className="btn sm" disabled={!hasSel} onClick={() => { checkpoint(); splitMany(ids, engine.time) }} title="Split at playhead (S)"><Icon name="scissors" size={14} /><span className="tb-txt">Split</span></button>
        <button className="btn sm" disabled={!hasSel} onClick={() => duplicateMany(ids)} title="Duplicate (Ctrl+D)"><Icon name="copy" size={14} /><span className="tb-txt">Duplicate</span></button>
        <button className="btn sm danger" disabled={!hasSel} onClick={() => deleteMany(ids)} title="Delete (Del)"><Icon name="trash" size={14} /><span className="tb-txt">Delete</span></button>
        <button className="btn sm" disabled={!hasSel} onClick={() => rippleDelete(ids)} title="Delete and close the gap (Shift+Del)"><Icon name="ripple" size={14} /><span className="tb-txt">Ripple</span></button>
        <button className="btn sm" disabled={ids.length < 2} onClick={() => groupClips(ids)} title="Group selected clips (Ctrl+G)"><Icon name="link" size={14} /><span className="tb-txt">Group</span></button>
        {getState().project.clips.some((x) => ids.includes(x.id) && x.group) && <button className="btn sm" onClick={() => ungroupClips(ids)} title="Ungroup (Ctrl+Shift+G)"><Icon name="unlink" size={14} /><span className="tb-txt">Ungroup</span></button>}
        <button className="btn sm" onClick={() => addMarker(engine.time)} title="Add a marker at the playhead (M)"><Icon name="flag" size={14} /><span className="tb-txt">Marker</span></button>
        {markers.length > 0 && <button className="btn sm" onClick={() => clearMarkers()} title="Remove all markers">Clear {markers.length}</button>}
        <label className="check inline">
          <input type="checkbox" checked={snap} onChange={(e) => setUi({ snap: e.target.checked })} />
          <span>Snap</span>
        </label>
        <div className="spacer" />
        <span className="muted small zlbl">Zoom</span>
        <button className="btn sm zbtn" onClick={() => setPps((p) => Math.max(15, p / 1.35))} title="Zoom out"><Icon name="zoomOut" size={14} /></button>
        <input
          className="zoom"
          type="range"
          min={15}
          max={300}
          value={pps}
          onChange={(e) => setPps(+e.target.value)}
        />
        <button className="btn sm zbtn" onClick={() => setPps((p) => Math.min(300, p * 1.35))} title="Zoom in"><Icon name="zoomIn" size={14} /></button>
        <button
          className="btn sm"
          title="Fit the whole video in view"
          onClick={() => {
            const w = (scroll.current?.clientWidth ?? 800) - LABEL_W - 40
            setPps(Math.min(300, Math.max(15, w / Math.max(dur, 2))))
          }}
        >
          <Icon name="fit" size={14} /><span className="tb-txt">Fit</span>
        </button>
      </div>
      <div className="tl-scroll" ref={scroll}>
        <div className="tl-inner" ref={lanes} style={{ width: LABEL_W + totalW }}>
          <div className="tl-ruler" onPointerDown={scrub}>
            <div className="tl-corner" style={{ width: LABEL_W }} />
            {ticks.map((t) => (
              <div key={t} className="tick" style={{ left: LABEL_W + t * pps }}>
                <span>{fmtTime(t).replace(/\.00$/, '')}</span>
              </div>
            ))}
            {markers.map((m) => (
              <div
                key={m}
                className="marker"
                style={{ left: LABEL_W + m * pps }}
                title={`Marker ${fmtTime(m)} – click to jump, double-click to remove`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  engine.seek(m)
                }}
                onDoubleClick={() => removeMarker(m)}
              />
            ))}
          </div>
          {TRACKS.map((tr) => (
            <div
              key={tr.id}
              className={'tl-row ' + tr.type + (tflags[tr.id]?.hide ? ' t-hide' : '') + (tflags[tr.id]?.mute ? ' t-mute' : '') + (tflags[tr.id]?.lock ? ' t-lock' : '')}
              style={{ height: ROW_H }}
              onPointerDown={(e) => {
                if (!(e.target as HTMLElement).classList.contains('tl-lane')) return
                startMarquee(e)
              }}
              onDragOver={(e) => e.dataTransfer.types.includes('text/clipforge-asset') && e.preventDefault()}
              onDrop={(e) => onDrop(e, tr.id)}
            >
              <div
                className={`tl-label t-${tr.id}` + (tflags[tr.id]?.hide || tflags[tr.id]?.mute || tflags[tr.id]?.lock ? ' flagged' : '')}
                style={{ width: LABEL_W }}
                onClick={() => phone && setTrkMenu(trkMenu === tr.id ? '' : tr.id)}
              >
                {phone && trkMenu === tr.id && (
                  <div className="trk-menu" onClick={(e) => e.stopPropagation()}>
                    <b>{tr.name}</b>
                    {tr.type === 'video' && <button onClick={() => { toggleTrack(tr.id, 'hide'); setTrkMenu('') }}><Icon name={tflags[tr.id]?.hide ? 'eye' : 'eyeOff'} size={16} />{tflags[tr.id]?.hide ? 'Show track' : 'Hide track'}</button>}
                    <button onClick={() => { toggleTrack(tr.id, 'mute'); setTrkMenu('') }}><Icon name={tflags[tr.id]?.mute ? 'volume' : 'mute'} size={16} />{tflags[tr.id]?.mute ? 'Unmute' : 'Mute'}</button>
                    <button onClick={() => { toggleTrack(tr.id, 'lock'); setTrkMenu('') }}><Icon name={tflags[tr.id]?.lock ? 'unlock' : 'lock'} size={16} />{tflags[tr.id]?.lock ? 'Unlock' : 'Lock'}</button>
                  </div>
                )}
                <Icon name={TRACK_ICON[tr.id] ?? 'layers'} size={13} />
                <span className="tn" title={tr.name}>{TRACK_SHORT[tr.id] ?? tr.name}</span>
                {tr.type === 'video' && (
                  <button className={'tk-b' + (tflags[tr.id]?.hide ? ' on' : '')} onClick={() => toggleTrack(tr.id, 'hide')} title={tflags[tr.id]?.hide ? 'Show this track' : 'Hide this track (not in the video)'}>
                    <Icon name={tflags[tr.id]?.hide ? 'eyeOff' : 'eye'} size={13} />
                  </button>
                )}
                <button className={'tk-b' + (tflags[tr.id]?.mute ? ' on' : '')} onClick={() => toggleTrack(tr.id, 'mute')} title={tflags[tr.id]?.mute ? 'Unmute this track' : 'Mute this track'}>
                  <Icon name={tflags[tr.id]?.mute ? 'mute' : 'volume'} size={13} />
                </button>
                <button className={'tk-b' + (tflags[tr.id]?.lock ? ' on' : '')} onClick={() => toggleTrack(tr.id, 'lock')} title={tflags[tr.id]?.lock ? 'Unlock this track' : 'Lock this track (no accidental moves)'}>
                  <Icon name={tflags[tr.id]?.lock ? 'lock' : 'unlock'} size={13} />
                </button>
              </div>
              <div className="tl-lane" style={{ width: totalW }}>
                {clips
                  .filter((c) => c.track === tr.id)
                  .map((c) => {
                    const a = getAsset(c.assetId)
                    const w = Math.max(6, c.dur * pps)
                    const peaks =
                      c.kind === 'audio' || (c.kind === 'video' && !c.freeze)
                        ? a?.peaks
                        : c.kind === 'sfx' && c.sfxId
                          ? engine.getSfxPeaks(c.sfxId)
                          : undefined
                    const film = c.kind === 'video' && a?.strip ? a.strip : null
                    const total = c.kind === 'sfx' ? c.dur : a?.duration ?? c.dur
                    const from = c.kind === 'sfx' ? 0 : (c.freeze ? c.srcIn : c.srcIn) / total
                    const to = c.kind === 'sfx' ? 1 : (c.srcIn + (c.freeze ? 0.001 : c.dur * c.speed)) / total
                    return (
                      <div
                        key={c.id}
                        className={`tl-clip k-${c.kind}${selIds.includes(c.id) ? ' sel' : ''}${c.freeze ? ' freeze' : ''}${c.group ? ' grouped' : ''}`}
                        style={{
                          left: c.start * pps,
                          width: w,
                          backgroundImage: c.kind === 'video' && a?.thumb && !film ? `url(${a.thumb})` : undefined,
                        }}
                        onPointerDown={(e) => startDrag(e, c, 'move')}
                        title={`${c.label} · ${c.dur.toFixed(2)}s${c.speed !== 1 ? ` · ${c.speed}×` : ''}`}
                      >
                        {film && <Film strip={film} from={from} to={to} w={w} h={ROW_H - 8} />}
                        {peaks && <Wave peaks={peaks} from={from} to={to} w={w} h={c.kind === 'video' ? Math.max(12, Math.round(ROW_H * 0.3)) : ROW_H - 8} low={c.kind === 'video'} />}
                        {c.duck && <i className="duckm" title="Auto-ducked" />}
                        {selIds.includes(c.id) && selIds.length === 1 && (c.kind === 'audio' || c.kind === 'sfx' || (c.kind === 'video' && !c.freeze)) && (
                          <AudioOverlay c={c} pps={pps} h={ROW_H - 8} />
                        )}
                        <span className="cl-label ell">
                          {c.kind === 'sticker' ? c.emoji : c.label}
                          {c.speed !== 1 && <em> {c.speed}×</em>}
                        </span>
                        {kfTimes(c).map((kt) => (
                          <i key={kt} className="kfm" style={{ left: kt * pps }} />
                        ))}
                        <div className="h l" onPointerDown={(e) => startDrag(e, c, 'l')} />
                        <div className="h r" onPointerDown={(e) => startDrag(e, c, 'r')} />
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
          {marq && (
            <div
              className="marquee"
              style={{ left: Math.min(marq.x0, marq.x1), top: Math.min(marq.y0, marq.y1), width: Math.abs(marq.x1 - marq.x0), height: Math.abs(marq.y1 - marq.y0) }}
            />
          )}
          <div className="playhead" ref={head}>
            <div
              className="ph-top"
              onPointerDown={scrub}
              onDoubleClick={() => {
                // a marker you just clicked sits under the playhead handle, so let the handle remove it too
                const m = getState().project.markers.find((x) => Math.abs(x - engine.time) < 0.05)
                if (m !== undefined) removeMarker(m)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

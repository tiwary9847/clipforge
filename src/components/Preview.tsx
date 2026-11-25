import { useEffect, useRef, useState } from 'react'
import { engine, FPS, Box } from '../engine'
import { checkpoint, getClip, getPreset, getState, localTime, patchClip, select, setClipProp, setUi, useStore } from '../store'
import { evalProp } from '../anim'
import { fmtTime } from './Fields'
import { Icon } from './Icon'
import { Welcome } from './Welcome'
import { NextSteps } from './NextSteps'

export function Preview() {
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 300, h: 500 })
  const [box, setBox] = useState<Box | null>(null)
  const [guides, setGuides] = useState({ x: false, y: false })
  const [playing, setPlaying] = useState(false)
  const timeRef = useRef<HTMLSpanElement>(null)
  const preset = useStore(() => getPreset())
  const selectedId = useStore((s) => s.selectedId)
  const showSafe = useStore((s) => s.showSafe)
  const picking = useStore((s) => s.picking)
  const total = useStore((s) => s.project.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0))

  useEffect(() => {
    engine.attach(cv.current!)
  }, [])

  useEffect(() => {
    const el = wrap.current!
    const fit = () => {
      const cw = el.clientWidth - 24
      const ch = el.clientHeight - 24
      const k = Math.max(0.05, Math.min(cw / preset.w, ch / preset.h))
      setSize({ w: Math.floor(preset.w * k), h: Math.floor(preset.h * k) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [preset.w, preset.h])

  useEffect(() => {
    return engine.onTick((t, p) => {
      if (timeRef.current) timeRef.current.textContent = fmtTime(t)
      setPlaying((old) => (old === p ? old : p))
      const b = selectedId && !p ? engine.getBox(selectedId) : null
      setBox((old) => {
        if (!b && !old) return old
        if (b && old && b.cx === old.cx && b.cy === old.cy && b.w === old.w && b.h === old.h && b.rot === old.rot && b.id === old.id) return old
        return b
      })
    })
  }, [selectedId])

  useEffect(() => {
    engine.requestRender()
  }, [selectedId])

  const s = size.w / preset.w
  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d0: number; scale0: number; id: string } | null>(null)

  /** Two fingers on the canvas scale the selected clip. */
  const lastTap = useRef({ t: 0, id: '' as string | null })
  const stagePointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // double-click / double-tap on text → straight to typing new words
    {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const cv = (e.currentTarget as HTMLElement).querySelector('canvas')
      const k = cv ? cv.width / r.width : 1
      const hid = engine.hitTest((e.clientX - r.left) * k, (e.clientY - r.top) * k)
      const now = performance.now()
      if (hid && hid === lastTap.current.id && now - lastTap.current.t < 380 && getClip(hid)?.kind === 'text') {
        lastTap.current = { t: 0, id: null }
        window.dispatchEvent(new CustomEvent('cf:edittext', { detail: hid }))
      } else lastTap.current = { t: now, id: hid }
    }
    const id = getState().selectedId
    const c = id ? getClip(id) : null
    if (pointers.current.size === 2 && c) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale0: evalProp(c, 'scale', localTime(c)), id: c.id }
      checkpoint()
      const mv = (ev: PointerEvent) => {
        if (!pointers.current.has(ev.pointerId)) return
        pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
        const [p1, p2] = [...pointers.current.values()]
        if (!p2 || !pinch.current) return
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y)
        setClipProp(pinch.current.id, 'scale', Math.min(6, Math.max(0.05, pinch.current.scale0 * (d / pinch.current.d0))))
      }
      const up = (ev: PointerEvent) => {
        pointers.current.delete(ev.pointerId)
        if (pointers.current.size < 2) {
          pinch.current = null
          window.removeEventListener('pointermove', mv)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', up)
        }
      }
      window.addEventListener('pointermove', mv)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      return
    }
    const clear = (ev: PointerEvent) => {
      pointers.current.delete(ev.pointerId)
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
    }
    window.addEventListener('pointerup', clear)
    window.addEventListener('pointercancel', clear)
    drag('move')(e)
  }

  const drag = (kind: 'move' | 'scale' | 'rotate') => (e: React.PointerEvent) => {
    const pk = getState().picking
    if (pk && kind === 'move') {
      // eyedropper for the chroma key: read the clip's own colour under the cursor
      const p = toCanvas(e)
      const col = engine.sampleSource(pk, p.x, p.y)
      const c = getClip(pk)
      if (col && c?.chroma) {
        checkpoint()
        patchClip(pk, { chroma: { ...c.chroma, color: col, on: true } })
        setUi({ picking: null })
      } else setUi({ toast: 'Click on the clip itself to pick its background colour' })
      return
    }
    const id = kind === 'move' ? engine.hitTest(toCanvas(e).x, toCanvas(e).y) : selectedId
    if (kind === 'move') {
      select(id)
      if (!id) return
    }
    const clip = getClip(id)
    const b = id ? engine.getBox(id) : null
    if (!clip || !b) return
    e.preventDefault()
    e.stopPropagation()
    checkpoint()
    const start = toCanvas(e)
    const W = preset.w
    const H = preset.h
    const d0 = Math.hypot(start.x - b.cx, start.y - b.cy)
    const lt0 = localTime(clip)
    const scale0 = evalProp(clip, 'scale', lt0)
    const bx0 = b.cx / W
    const by0 = b.cy / H
    const move = (ev: PointerEvent) => {
      if (pinch.current) return
      const p = toCanvas(ev)
      if (kind === 'move') {
        let nx = bx0 + (p.x - start.x) / W
        let ny = by0 + (p.y - start.y) / H
        const gx = Math.abs(nx - 0.5) < 0.012
        const gy = Math.abs(ny - 0.5) < 0.012
        if (gx) nx = 0.5
        if (gy) ny = 0.5
        setGuides({ x: gx, y: gy })
        setClipProp(clip.id, 'x', nx)
        setClipProp(clip.id, 'y', ny)
      } else if (kind === 'scale') {
        const d = Math.hypot(p.x - b.cx, p.y - b.cy)
        setClipProp(clip.id, 'scale', Math.min(6, Math.max(0.05, scale0 * (d / Math.max(d0, 1)))))
      } else {
        let a = (Math.atan2(p.y - b.cy, p.x - b.cx) * 180) / Math.PI + 90
        if (a > 180) a -= 360
        const near = Math.round(a / 45) * 45
        if (Math.abs(a - near) < 4) a = near
        setClipProp(clip.id, 'rotation', Math.round(a))
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setGuides({ x: false, y: false })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const step = (n: number) => engine.seek(engine.time + n / FPS)

  return (
    <div className="center">
      <div className="stage-wrap" ref={wrap}>
        <div className="stage" ref={stage} style={{ width: size.w, height: size.h, cursor: picking ? 'crosshair' : undefined }} onPointerDown={stagePointerDown}>
          <canvas ref={cv} width={preset.w} height={preset.h} />
          {showSafe && preset.safe && (
            <div className="safe" title="Approximate area free of platform buttons and captions">
              <span>safe zone</span>
            </div>
          )}
          {guides.x && <div className="guide v" />}
          {guides.y && <div className="guide h" />}
          {box && !playing && (
            <div
              className="sel-box"
              style={{
                left: (box.cx - box.w / 2) * s,
                top: (box.cy - box.h / 2) * s,
                width: box.w * s,
                height: box.h * s,
                transform: `rotate(${box.rot}deg)`,
              }}
            >
              <div className="handle rot" onPointerDown={drag('rotate')} />
              <div className="stem" />
              <div className="handle br" onPointerDown={drag('scale')} />
            </div>
          )}
        </div>
      </div>
      {!total && <Welcome />}
      <div className="transport">
        <button className="ico" title="Back to start (Home)" onClick={() => engine.seek(0)}><Icon name="skipBack" size={16} /></button>
        <button className="ico" title="Previous frame (←)" onClick={() => step(-1)}><Icon name="left" size={18} /></button>
        <button className="ico big play" title="Play / pause (Space)" onClick={() => engine.toggle()}>
          {playing ? <Icon name="pause" size={20} /> : <Icon name="play" size={20} />}
        </button>
        <button className="ico" title="Next frame (→)" onClick={() => step(1)}><Icon name="right" size={18} /></button>
        <button className="ico" title="Jump to end (End)" onClick={() => engine.seek(engine.duration())}><Icon name="skipFwd" size={16} /></button>
        <div className="time">
          <span ref={timeRef}>0:00.00</span>
          <span className="muted"> / {fmtTime(total)}</span>
        </div>
      </div>
      <NextSteps />
    </div>
  )
}

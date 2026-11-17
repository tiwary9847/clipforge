import { checkpoint, getClip, patchClip } from '../store'
import { Clip } from '../types'

/** Fade handles + draggable volume points drawn on a selected audio-bearing clip. */
export function AudioOverlay({ c, pps, h }: { c: Clip; pps: number; h: number }) {
  const w = Math.max(6, c.dur * pps)
  const pts = c.volKf ?? []
  const yOf = (g: number) => 4 + (1 - Math.min(2, Math.max(0, g)) / 2) * (h - 8)
  const gOf = (y: number) => Math.min(2, Math.max(0, (1 - (y - 4) / (h - 8)) * 2))

  const drag = (e: React.PointerEvent, move: (dx: number, dy: number) => void) => {
    e.stopPropagation()
    e.preventDefault()
    checkpoint()
    const x0 = e.clientX
    const y0 = e.clientY
    const mv = (ev: PointerEvent) => move(ev.clientX - x0, ev.clientY - y0)
    const up = () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const fadeIn0 = c.fadeIn
  const fadeOut0 = c.fadeOut
  const line = pts.length ? pts.map((p) => `${p.t * pps},${yOf(p.g)}`).join(' ') : ''

  return (
    <svg
      className="aov"
      width={w}
      height={h}
      onDoubleClick={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        const t = Math.min(c.dur, Math.max(0, (e.clientX - r.left) / pps))
        const cur = getClip(c.id)
        if (!cur) return
        checkpoint()
        const next = [...(cur.volKf ?? []), { t: +t.toFixed(3), g: +gOf(e.clientY - r.top).toFixed(2) }].sort((a, b) => a.t - b.t)
        patchClip(c.id, { volKf: next })
      }}
    >
      <rect width={w} height={h} fill="transparent" />
      {c.fadeIn > 0 && <polygon points={`0,${h} 0,0 ${c.fadeIn * pps},0`} fill="rgba(0,0,0,.35)" />}
      {c.fadeOut > 0 && <polygon points={`${w},${h} ${w},0 ${w - c.fadeOut * pps},0`} fill="rgba(0,0,0,.35)" />}
      {pts.length > 1 && <polyline points={line} fill="none" stroke="#ffd400" strokeWidth={1.5} pointerEvents="none" />}
      {/* fade handles */}
      <circle
        className="fh"
        cx={fadeIn0 * pps + 5}
        cy={5}
        r={5}
        onPointerDown={(e) => {
          const base = fadeIn0
          drag(e, (dx) => patchClip(c.id, { fadeIn: Math.min(c.dur - c.fadeOut - 0.05, Math.max(0, base + dx / pps)) }))
        }}
      >
        <title>Drag to set fade-in</title>
      </circle>
      <circle
        className="fh"
        cx={w - fadeOut0 * pps - 5}
        cy={5}
        r={5}
        onPointerDown={(e) => {
          const base = fadeOut0
          drag(e, (dx) => patchClip(c.id, { fadeOut: Math.min(c.dur - c.fadeIn - 0.05, Math.max(0, base - dx / pps)) }))
        }}
      >
        <title>Drag to set fade-out</title>
      </circle>
      {pts.map((p, i) => (
        <circle
          key={i}
          className="vp"
          cx={p.t * pps}
          cy={yOf(p.g)}
          r={5}
          onDoubleClick={(e) => {
            e.stopPropagation()
            checkpoint()
            patchClip(c.id, { volKf: pts.filter((_, k) => k !== i) })
          }}
          onPointerDown={(e) => {
            const t0 = p.t
            const y0 = yOf(p.g)
            drag(e, (dx, dy) => {
              const cur = getClip(c.id)?.volKf
              if (!cur) return
              const np = { t: +Math.min(c.dur, Math.max(0, t0 + dx / pps)).toFixed(3), g: +gOf(y0 + dy).toFixed(2) }
              patchClip(c.id, { volKf: cur.map((q, k) => (k === i ? np : q)).sort((a, b) => a.t - b.t) })
            })
          }}
        >
          <title>Volume {Math.round(p.g * 100)}% – drag to move, double-click to delete</title>
        </circle>
      ))}
    </svg>
  )
}

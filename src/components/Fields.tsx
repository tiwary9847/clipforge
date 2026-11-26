import { useT } from '../i18n'
import { BASIC_SECS, toggleSec, useSettings } from '../settings'
import { ReactNode, useEffect, useState } from 'react'
import { checkpoint } from '../store'

export const fmtTime = (t: number) => {
  const s = Math.max(0, t)
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  // click the heading to fold a section away; remembered in this browser
  const closed = useSettings((s) => s.closedSecs.includes(title))
  const basic = useSettings((s) => s.mode === 'basic')
  const t = useT()
  if (basic && !BASIC_SECS.has(title)) return null
  return (
    <div className={'sec' + (closed ? ' closed' : '')}>
      <div
        className="sec-h"
        role="button"
        tabIndex={0}
        aria-expanded={!closed}
        onClick={(e) => !(e.target as HTMLElement).closest('button, a, input, select') && toggleSec(title)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), toggleSec(title))}
      >
        <span><svg className="sec-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>{t(title)}</span>
        {!closed && right}
      </div>
      {children}
    </div>
  )
}

export function Slider(p: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  fmt?: (v: number) => string
  kf?: { on: boolean; has: boolean; toggle: () => void }
}) {
  return (
    <label className="row slider">
      <span className="lbl">
        {p.kf && (
          <button
            type="button"
            className={'kfb' + (p.kf.on ? ' on' : p.kf.has ? ' has' : '')}
            title={p.kf.on ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
            onClick={(e) => {
              e.preventDefault()
              p.kf!.toggle()
            }}
          >
            ◆
          </button>
        )}
        {p.label}
      </span>
      <input
        type="range"
        min={p.min}
        max={p.max}
        step={p.step ?? 0.01}
        value={p.value}
        onPointerDown={() => checkpoint()}
        onKeyDown={(e) => e.key.startsWith('Arrow') && checkpoint()}
        onChange={(e) => p.onChange(parseFloat(e.target.value))}
      />
      <span className="val">{p.fmt ? p.fmt(p.value) : p.value.toFixed(2)}</span>
    </label>
  )
}

export function NumField(p: { label: string; value: number; onCommit: (v: number) => void; step?: number; min?: number }) {
  const [txt, setTxt] = useState(String(+p.value.toFixed(2)))
  useEffect(() => setTxt(String(+p.value.toFixed(2))), [p.value])
  const commit = () => {
    const v = parseFloat(txt)
    if (!isNaN(v) && v !== p.value) p.onCommit(Math.max(p.min ?? -1e9, v))
    else setTxt(String(+p.value.toFixed(2)))
  }
  return (
    <label className="num">
      <span className="lbl">{p.label}</span>
      <input
        type="number"
        step={p.step ?? 0.1}
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  )
}

export function Chips<T extends string | number>(p: {
  items: { id: T; name: string }[]
  value: T
  onPick: (v: T) => void
}) {
  return (
    <div className="chips">
      {p.items.map((i) => (
        <button key={String(i.id)} className={'chip' + (i.id === p.value ? ' on' : '')} onClick={() => p.onPick(i.id)}>
          {i.name}
        </button>
      ))}
    </div>
  )
}

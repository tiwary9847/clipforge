import { useEffect, useRef, useState } from 'react'
import { Section, Slider } from './Fields'
import { checkpoint, getState, hasKeyAt, localTime, patchClip, setClipProp, setUi, toggleKeyframe, updateClip, useStore } from '../store'
import { evalProp } from '../anim'
import { Chips } from './Fields'
import { engine } from '../engine'
import { Clip, Eq, Grade, KfProp, MaskMode, MaskShape } from '../types'
import { DEFAULT_GRADE, GRADE_LOOKS, histogram, isIdentity, parseCube } from '../grade'
import { LOOK_LIST } from '../library'
import { detectScenes, matchColour } from '../looks'
import { removeBackground, removeVocals, smoothSlowMo, trackMask, trackOverlay } from '../pro'

const toast = (m: string) => setUi({ toast: m })

function useBusy() {
  const [busy, setBusy] = useState('')
  const run = async (label: string, fn: () => Promise<string | void>) => {
    if (busy) return
    setBusy(label)
    try {
      const m = await fn()
      if (m) toast(m)
    } catch (e) {
      toast((e as Error).message || 'Something went wrong')
    } finally {
      setBusy('')
    }
  }
  return { busy, run, setBusy }
}

/* ---------- colour grading ---------- */

function Scope() {
  const cv = useRef<HTMLCanvasElement>(null)
  const t = useStore((s) => s.project)
  useEffect(() => {
    let alive = true
    const draw = () => {
      if (!alive || !cv.current || !engine.canvas) return
      const h = histogram(engine.canvas)
      const g = cv.current.getContext('2d')!
      const W = cv.current.width
      const H = cv.current.height
      g.clearRect(0, 0, W, H)
      g.globalCompositeOperation = 'lighter'
      ;['rgba(255,60,60,.7)', 'rgba(60,255,60,.7)', 'rgba(60,120,255,.8)'].forEach((col, c) => {
        g.fillStyle = col
        g.beginPath()
        g.moveTo(0, H)
        h[c].forEach((v, i) => g.lineTo((i / 63) * W, H - v * H))
        g.lineTo(W, H)
        g.fill()
      })
      g.globalCompositeOperation = 'source-over'
    }
    const id = setInterval(draw, 400)
    draw()
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [t])
  return <canvas ref={cv} width={260} height={60} className="scope" title="RGB histogram of the current frame" />
}

export function GradeSection({ c }: { c: Clip }) {
  const g = c.grade ?? DEFAULT_GRADE
  const set = (p: Partial<Grade>) => patchClip(c.id, { grade: { ...g, ...p } })
  const curve = (i: number, v: number) => {
    const n = [...g.curve]
    n[i] = v
    set({ curve: n })
  }
  const lutRef = useRef<HTMLInputElement>(null)
  return (
    <Section title="Colour grading" right={!isIdentity(c.grade) ? <button className="lnk" onClick={() => updateClip(c.id, { grade: undefined })}>Reset</button> : undefined}>
      <Scope />
      <div className="chips">
        {GRADE_LOOKS.map((l) => (
          <button key={l.id} className="chip" onClick={() => updateClip(c.id, { grade: { ...DEFAULT_GRADE, ...l.g } })}>{l.name}</button>
        ))}
      </div>
      <div className="hint">White balance & tone</div>
      <Slider label="Temperature" value={g.temp} min={-1} max={1} onChange={(v) => set({ temp: v })} fmt={(v) => (v > 0 ? 'warm ' : v < 0 ? 'cool ' : '') + Math.round(Math.abs(v) * 100)} />
      <Slider label="Tint" value={g.tint} min={-1} max={1} onChange={(v) => set({ tint: v })} fmt={(v) => Math.round(v * 100) + ''} />
      <Slider label="Shadows" value={g.shadows} min={-1} max={1} onChange={(v) => set({ shadows: v })} fmt={(v) => Math.round(v * 100) + ''} />
      <Slider label="Highlights" value={g.highlights} min={-1} max={1} onChange={(v) => set({ highlights: v })} fmt={(v) => Math.round(v * 100) + ''} />
      <Slider label="Vibrance" value={g.vibrance} min={-1} max={1} onChange={(v) => set({ vibrance: v })} fmt={(v) => Math.round(v * 100) + ''} />
      <div className="hint">Tone curve</div>
      {['Black point', 'Shadows', 'Midtones', 'Highlights', 'White point'].map((n, i) => (
        <Slider key={n} label={n} value={g.curve[i]} min={0} max={1} step={0.01} onChange={(v) => curve(i, v)} fmt={(v) => Math.round(v * 100) + ''} />
      ))}
      <div className="hint">Colour wheels</div>
      <div className="row2">
        <label>Shadows tint <input type="color" value={g.lift} onChange={(e) => set({ lift: e.target.value, liftAmt: g.liftAmt || 0.4 })} /></label>
        <label>Highlights tint <input type="color" value={g.gain} onChange={(e) => set({ gain: e.target.value, gainAmt: g.gainAmt || 0.4 })} /></label>
      </div>
      <Slider label="Shadow tint amount" value={g.liftAmt} min={0} max={1} onChange={(v) => set({ liftAmt: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <Slider label="Highlight tint amount" value={g.gainAmt} min={0} max={1} onChange={(v) => set({ gainAmt: v })} fmt={(v) => Math.round(v * 100) + '%'} />
      <div className="hint">LUT (.cube film looks from any colourist / LUT pack)</div>
      <div className="row2">
        <button className="btn sm" onClick={() => lutRef.current?.click()}>{g.lut ? 'Change LUT' : 'Load .cube LUT'}</button>
        {g.lut && <span className="hint">{g.lut.name}</span>}
        {g.lut && <button className="lnk" onClick={() => set({ lut: undefined })}>remove</button>}
        <input
          ref={lutRef}
          type="file"
          accept=".cube"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              checkpoint()
              set({ lut: { name: f.name, ...parseCube(await f.text()) } })
            } catch (x) {
              toast((x as Error).message)
            }
          }}
        />
      </div>
      {g.lut && <Slider label="LUT strength" value={g.lutMix} min={0} max={1} onChange={(v) => set({ lutMix: v })} fmt={(v) => Math.round(v * 100) + '%'} />}
      <button
        className="btn sm full"
        onClick={() => {
          checkpoint()
          for (const x of getState().project.clips) if ((x.kind === 'video' || x.kind === 'image') && x.id !== c.id) patchClip(x.id, { grade: c.grade })
          toast('Grade copied to every video and photo clip.')
        }}
      >
        Apply this grade to all clips
      </button>
      {c.kind !== 'adjust' && <MatchColour c={c} />}
    </Section>
  )
}

/* ---------- AI + pro video tools ---------- */

export function ProVideo({ c }: { c: Clip }) {
  const { busy, run, setBusy } = useBusy()
  const sig = useRef({ cancelled: false })
  return (
    <Section title="AI & pro tools">
      <div className="hint">Remove background (no green screen) – AI runs on your device; downloads a ~25 MB model the first time.</div>
      <button
        className="btn full"
        disabled={!!busy}
        onClick={() => {
          sig.current = { cancelled: false }
          run('bg', () => removeBackground(c.id, (m) => setBusy(m), sig.current))
        }}
      >
        {busy && busy !== 'slow' ? busy === 'bg' ? 'Starting…' : busy : '✂️ Remove background'}
      </button>
      <button
        className="btn full"
        disabled={!!busy}
        onClick={() => {
          sig.current = { cancelled: false }
          run('pb', () => removeBackground(c.id, (m) => setBusy(m), sig.current, 'blur'))
        }}
      >
        🌫 Blur background (portrait mode)
      </button>
      {busy && busy !== 'slow' && <button className="lnk" onClick={() => (sig.current.cancelled = true)}>cancel</button>}
      {c.kind === 'video' && (
        <>
          <div className="hint">Smooth slow motion – blends in-between frames so slowed clips don’t stutter (set speed below 1× first).</div>
          <button className="btn full" disabled={!!busy || c.speed >= 0.99} onClick={() => run('slow', () => smoothSlowMo(c.id, (p) => setBusy(`Smoothing… ${Math.round(p * 100)}%`)))}>
            {busy.startsWith('Smoothing') ? busy : c.speed >= 0.99 ? 'Smooth slow-mo (set speed < 1× first)' : '🐢 Make slow-mo smooth'}
          </button>
        </>
      )}
    </Section>
  )
}

export function TrackSection({ c }: { c: Clip }) {
  const { busy, run, setBusy } = useBusy()
  if (c.track === 'v1' || (c.kind !== 'sticker' && c.kind !== 'text' && c.kind !== 'image' && c.kind !== 'video')) return null
  return (
    <Section title="Motion tracking">
      <div className="hint">Put this on top of a face or object in the main video, move the playhead to where to start, then track – it will follow it.</div>
      <button className="btn full" disabled={!!busy} onClick={() => run('t', () => trackOverlay(c.id, (p) => setBusy(`Tracking… ${Math.round(p * 100)}%`)))}>
        {busy ? (busy === 't' ? 'Tracking…' : busy) : '🎯 Track & follow'}
      </button>
    </Section>
  )
}

/* ---------- audio EQ / compressor / vocal remover ---------- */

export function EqSection({ c }: { c: Clip }) {
  const { busy, run } = useBusy()
  if ((c.kind !== 'video' && c.kind !== 'audio') || c.freeze) return null
  const e: Eq = c.eq ?? { low: 0, mid: 0, high: 0, comp: false }
  const set = (p: Partial<Eq>) => patchClip(c.id, { eq: { ...e, ...p } })
  const preset = (p: Eq) => updateClip(c.id, { eq: p })
  return (
    <Section title="Equaliser & compressor">
      <div className="chips">
        <button className="chip" onClick={() => preset({ low: -6, mid: 2, high: 4, comp: true })}>🎙 Voice clarity</button>
        <button className="chip" onClick={() => preset({ low: 3, mid: 0, high: 2, comp: true })}>📻 Podcast</button>
        <button className="chip" onClick={() => preset({ low: 6, mid: -1, high: 2, comp: false })}>🔊 Bass boost</button>
        <button className="chip" onClick={() => preset({ low: -12, mid: 4, high: -10, comp: true })}>📞 Phone</button>
        <button className="chip" onClick={() => preset({ low: 0, mid: 0, high: 0, comp: false })}>Flat</button>
      </div>
      <Slider label="Bass" value={e.low} min={-15} max={15} step={0.5} onChange={(v) => set({ low: v })} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
      <Slider label="Mids" value={e.mid} min={-15} max={15} step={0.5} onChange={(v) => set({ mid: v })} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
      <Slider label="Treble" value={e.high} min={-15} max={15} step={0.5} onChange={(v) => set({ high: v })} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} />
      <label className="ochk"><input type="checkbox" checked={e.comp} onChange={(x) => updateClip(c.id, { eq: { ...e, comp: x.target.checked } })} /> Compressor (evens out loud and quiet parts)</label>
      <button className="btn full" disabled={!!busy} onClick={() => run('v', () => removeVocals(c.id))}>{busy ? 'Working…' : '🎤 Remove vocals (karaoke)'}</button>
    </Section>
  )
}

/* ---------- animated masks ---------- */

const SHAPES: { id: MaskShape; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'circle', name: '● Circle' },
  { id: 'ellipse', name: '⬭ Oval' },
  { id: 'rounded', name: '▢ Box' },
  { id: 'heart', name: '♥ Heart' },
  { id: 'star', name: '★ Star' },
  { id: 'diamond', name: '◆ Diamond' },
]
const MODES: { id: MaskMode; name: string; hint: string }[] = [
  { id: 'show', name: 'Show inside', hint: 'Only the inside of the shape is visible.' },
  { id: 'hide', name: 'Cut out', hint: 'The inside of the shape is cut away.' },
  { id: 'blur', name: 'Blur inside', hint: 'Blurs a face, number plate or logo.' },
  { id: 'pixelate', name: 'Pixelate', hint: 'Censor-style big pixels inside the shape.' },
  { id: 'spotlight', name: 'Spotlight', hint: 'Darkens everything outside the shape.' },
]

export function MaskSection({ c }: { c: Clip }) {
  const { busy, run, setBusy } = useBusy()
  const m = c.mask ?? { shape: 'none' as MaskShape, radius: 0.18 }
  const mode = m.mode ?? 'show'
  const lt = localTime(c)
  const KS = (prop: KfProp, label: string, min: number, max: number) => (
    <Slider
      label={label}
      value={evalProp(c, prop, lt)}
      min={min}
      max={max}
      onChange={(v) => setClipProp(c.id, prop, v)}
      fmt={(v) => Math.round(v * 100) + '%'}
      kf={{ on: hasKeyAt(c, prop), has: !!c.kf?.[prop]?.length, toggle: () => toggleKeyframe(c.id, prop) }}
    />
  )
  return (
    <Section title="Mask">
      <Chips items={SHAPES} value={m.shape} onPick={(v) => updateClip(c.id, { mask: { ...m, shape: v } })} />
      {m.shape !== 'none' && (
        <>
          <Chips items={MODES.map(({ id, name }) => ({ id, name }))} value={mode} onPick={(v) => updateClip(c.id, { mask: { ...m, mode: v } })} />
          <div className="hint">{MODES.find((x) => x.id === mode)!.hint} Press ◆ on a slider to keyframe it – move the playhead and change it again to animate.</div>
          {KS('mx', 'Position X', -0.5, 0.5)}
          {KS('my', 'Position Y', -0.5, 0.5)}
          {KS('ms', 'Size', 0, 2)}
          {m.shape === 'rounded' && <Slider label="Corner radius" value={m.radius} min={0} max={0.5} onChange={(v) => patchClip(c.id, { mask: { ...m, radius: v } })} fmt={(v) => Math.round(v * 100) + '%'} />}
          {(mode === 'blur' || mode === 'pixelate' || mode === 'spotlight') && (
            <Slider label="Strength" value={m.amt ?? 0.5} min={0} max={1} onChange={(v) => patchClip(c.id, { mask: { ...m, amt: v } })} fmt={(v) => Math.round(v * 100) + '%'} />
          )}
          <div className="chips">
            <button
              className="chip"
              onClick={() => {
                checkpoint()
                const d = c.dur
                patchClip(c.id, { kf: { ...c.kf, ms: [{ t: 0, v: 0 }, { t: Math.min(1.2, d * 0.5), v: 1.6 }] } })
                toast('Reveal added: the shape grows from nothing to full in the first second.')
              }}
            >
              ✨ Grow-in reveal
            </button>
            {c.kind === 'video' && (
              <button className="chip" disabled={!!busy} onClick={() => run('tm', () => trackMask(c.id, (p) => setBusy(`Tracking… ${Math.round(p * 100)}%`)))}>
                {busy ? (busy === 'tm' ? 'Tracking…' : busy) : '🎯 Track mask (follow a face)'}
              </button>
            )}
          </div>
        </>
      )}
    </Section>
  )
}

/* ---------- look effects ---------- */

export function LookSection({ c }: { c: Clip }) {
  const look = c.look
  return (
    <Section title="Effects (looks)" right={look ? <button className="lnk" onClick={() => updateClip(c.id, { look: undefined })}>Remove</button> : undefined}>
      <div className="chips">
        {LOOK_LIST.map((l) => (
          <button key={l.id} title={l.hint} className={'chip' + (look?.id === l.id ? ' on' : '')} onClick={() => updateClip(c.id, { look: look?.id === l.id ? undefined : { id: l.id, amt: look?.amt ?? 0.6 } })}>
            {l.name}
          </button>
        ))}
      </div>
      {look && (
        <>
          <div className="hint">{LOOK_LIST.find((l) => l.id === look.id)?.hint}</div>
          <Slider label="Strength" value={look.amt} min={0} max={1} onChange={(v) => patchClip(c.id, { look: { ...look, amt: v } })} fmt={(v) => Math.round(v * 100) + '%'} />
        </>
      )}
    </Section>
  )
}

export function MatchColour({ c }: { c: Clip }) {
  const clips = useStore((s) => s.project.clips)
  const others = clips.filter((x) => x.id !== c.id && (x.kind === 'video' || x.kind === 'image'))
  const [ref, setRef] = useState('')
  const { busy, run } = useBusy()
  if (!others.length) return null
  return (
    <div className="row2" style={{ flexWrap: 'nowrap' }}>
      <select className="full" value={ref} onChange={(e) => setRef(e.target.value)}>
        <option value="">Match colours to…</option>
        {others.map((o) => <option key={o.id} value={o.id}>{o.label} ({o.start.toFixed(1)}s)</option>)}
      </select>
      <button className="btn sm" disabled={!ref || !!busy} onClick={() => run('m', () => matchColour(c.id, ref))}>{busy ? '…' : 'Match'}</button>
    </div>
  )
}

export function SceneSplit({ c }: { c: Clip }) {
  const { busy, run, setBusy } = useBusy()
  return (
    <>
      <div className="hint">Scene detection – splits this clip wherever the camera cuts to a new shot.</div>
      <button className="btn full" disabled={!!busy} onClick={() => run('s', () => detectScenes(c.id, (p) => setBusy(`Looking for cuts… ${Math.round(p * 100)}%`)))}>
        {busy ? (busy === 's' ? 'Looking for cuts…' : busy) : '🎬 Split at scene changes'}
      </button>
    </>
  )
}

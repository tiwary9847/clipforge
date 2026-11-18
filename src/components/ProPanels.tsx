import { useState } from 'react'
import { Chips, Section, Slider } from './Fields'
import {
  checkpoint,
  deleteMany,
  duplicateMany,
  freezeFrameAt,
  getAsset,
  getState,
  patchClip,
  patchText,
  rippleDelete,
  saveStyle,
  setUi,
  splitMany,
  updateClip,
  useStore,
} from '../store'
import { engine } from '../engine'
import { RAMPS, dropProxy, makeProxy, needsProxy, analyzeStabilization, applySpeedRamp, autoDuck, cutSilences, markBeats, reduceNoise, reverseClip, setStabStrength } from '../processing'
import { Chroma, Clip, MaskShape, TextAnim } from '../types'
import { autoReframe, beatZoom } from '../tools2'
import { MaskSection, SceneSplit } from './ProPanels2'

const pct = (v: number) => `${Math.round(v * 100)}%`
const toast = (m: string) => setUi({ toast: m })

/** Runs a slow job with a busy label and turns failures into a toast. */
function useBusy() {
  const [busy, setBusy] = useState('')
  const run = async (label: string, fn: () => Promise<string | void>) => {
    if (busy) return
    setBusy(label)
    try {
      const msg = await fn()
      if (msg) toast(msg)
    } catch (e) {
      toast((e as Error).message || 'Something went wrong')
    } finally {
      setBusy('')
    }
  }
  return { busy, run, setBusy }
}

export const BLENDS: [string, string][] = [
  ['source-over', 'Normal'],
  ['multiply', 'Multiply'],
  ['screen', 'Screen'],
  ['overlay', 'Overlay'],
  ['soft-light', 'Soft light'],
  ['hard-light', 'Hard light'],
  ['darken', 'Darken'],
  ['lighten', 'Lighten'],
  ['color-dodge', 'Color dodge'],
  ['color-burn', 'Color burn'],
  ['difference', 'Difference'],
  ['exclusion', 'Exclusion'],
  ['hue', 'Hue'],
  ['saturation', 'Saturation'],
  ['color', 'Color'],
  ['luminosity', 'Luminosity'],
]

const MASKS: { id: MaskShape; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'circle', name: 'Circle' },
  { id: 'ellipse', name: 'Oval' },
  { id: 'rounded', name: 'Rounded' },
  { id: 'diamond', name: 'Diamond' },
  { id: 'star', name: 'Star' },
  { id: 'heart', name: 'Heart' },
]

export function CropMaskBlend({ c }: { c: Clip }) {
  const media = c.kind === 'video' || c.kind === 'image'
  const crop = c.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const setCrop = (k: 'l' | 't' | 'r' | 'b', v: number) => {
    const n = { ...crop, [k]: v }
    // never let the opposite edges cross
    if (n.l + n.r > 0.9) n[k === 'l' ? 'r' : k === 'r' ? 'l' : k] = Math.max(0, 0.9 - n[k])
    if (n.t + n.b > 0.9) n[k === 't' ? 'b' : k === 'b' ? 't' : k] = Math.max(0, 0.9 - n[k])
    patchClip(c.id, { crop: n })
  }
  const cropped = crop.l + crop.t + crop.r + crop.b > 0
  return (
    <>
      {media && (
        <Section title="Crop" right={cropped ? <button className="link" onClick={() => updateClip(c.id, { crop: undefined })}>Reset</button> : undefined}>
          <Slider label="Left" value={crop.l} min={0} max={0.9} onChange={(v) => setCrop('l', v)} fmt={pct} />
          <Slider label="Right" value={crop.r} min={0} max={0.9} onChange={(v) => setCrop('r', v)} fmt={pct} />
          <Slider label="Top" value={crop.t} min={0} max={0.9} onChange={(v) => setCrop('t', v)} fmt={pct} />
          <Slider label="Bottom" value={crop.b} min={0} max={0.9} onChange={(v) => setCrop('b', v)} fmt={pct} />
          <div className="hint">Crops the source picture; the clip refills its frame afterwards.</div>
        </Section>
      )}
      {media && <MaskSection c={c} />}
      <Section title="Blend mode">
        <select className="full" value={c.blend ?? 'source-over'} onChange={(e) => updateClip(c.id, { blend: e.target.value })}>
          {BLENDS.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div className="hint">Screen / Multiply / Overlay on a track above another clip blends the two – good for light leaks, glitch and smoke overlays.</div>
      </Section>
    </>
  )
}

const KEY_DEFAULT: Chroma = { on: true, color: '#00b140', sim: 0.4, smooth: 0.15, spill: 0.6 }

export function ChromaSection({ c }: { c: Clip }) {
  const picking = useStore((s) => s.picking === c.id)
  const ch = c.chroma
  const set = (patch: Partial<Chroma>) => patchClip(c.id, { chroma: { ...(ch ?? KEY_DEFAULT), ...patch } })
  return (
    <Section title="Green screen (chroma key)">
      <div className="toggles">
        <button className={'chip' + (ch?.on ? ' on' : '')} onClick={() => updateClip(c.id, { chroma: { ...(ch ?? KEY_DEFAULT), on: !ch?.on } })}>
          {ch?.on ? 'On' : 'Off'}
        </button>
        <button className="chip" onClick={() => updateClip(c.id, { chroma: { ...(ch ?? KEY_DEFAULT), on: true, color: '#00b140' } })}>Green</button>
        <button className="chip" onClick={() => updateClip(c.id, { chroma: { ...(ch ?? KEY_DEFAULT), on: true, color: '#0047bb' } })}>Blue</button>
        <button className={'chip' + (picking ? ' on' : '')} onClick={() => setUi({ picking: picking ? null : c.id })}>
          {picking ? 'Click the preview…' : '💧 Pick colour'}
        </button>
        <input type="color" value={ch?.color ?? KEY_DEFAULT.color} onChange={(e) => set({ color: e.target.value, on: true })} />
      </div>
      {ch?.on && (
        <>
          <Slider label="Similarity" value={ch.sim} min={0.02} max={1} onChange={(v) => set({ sim: v })} fmt={pct} />
          <Slider label="Edge softness" value={ch.smooth} min={0} max={1} onChange={(v) => set({ smooth: v })} fmt={pct} />
          <Slider label="Spill removal" value={ch.spill} min={0} max={1} onChange={(v) => set({ spill: v })} fmt={pct} />
        </>
      )}
      <div className="hint">
        Put this clip on a track <b>above</b> your background. Use <b>Pick colour</b>, then click the backdrop in the preview. Works best with evenly lit green/blue
        backdrops – it is a colour key, not AI background removal.
      </div>
    </Section>
  )
}

export function VideoTools({ c }: { c: Clip }) {
  const { busy, run, setBusy } = useBusy()
  const [freezeLen, setFreezeLen] = useState(2)
  const st = c.stab
  return (
    <Section title="Stabilise · freeze · reverse">
      {c.freeze ? (
        <div className="hint">This is a freeze frame – it holds one picture for its whole length. Drag its edge on the timeline to hold it longer or shorter.</div>
      ) : (
        <>
          <div className="hint">Shaky handheld footage</div>
          {!st ? (
            <button
              className="btn full"
              disabled={!!busy}
              onClick={() =>
                run('stab', async () => {
                  const z = await analyzeStabilization(c.id, (p) => setBusy(`Analysing… ${Math.round(p * 100)}%`))
                  return `Stabilised – zoomed ${Math.round((z - 1) * 100)}% to hide the edges.`
                })
              }
            >
              {busy.startsWith('Analysing') || busy === 'stab' ? busy === 'stab' ? 'Analysing…' : busy : 'Analyse & stabilise'}
            </button>
          ) : (
            <>
              <div className="toggles">
                <button className={'chip' + (st.on ? ' on' : '')} onClick={() => updateClip(c.id, { stab: { ...st, on: !st.on } })}>
                  {st.on ? 'Stabilise: on' : 'Stabilise: off'}
                </button>
                <button className="chip" onClick={() => updateClip(c.id, { stab: undefined })}>Remove</button>
              </div>
              <Slider label="Smoothing" value={st.strength} min={0.1} max={2} onChange={(v) => setStabStrength(c.id, v)} fmt={(v) => `${v.toFixed(1)}s`} />
              <div className="hint">Auto-zoom {Math.round((st.zoom - 1) * 100)}% to hide moving edges. Lower smoothing keeps intentional pans; higher removes more shake.</div>
            </>
          )}
          <hr className="sep" />
          <SceneSplit c={c} />
          <hr className="sep" />
          <div className="hint">Auto-reframe (wide video → vertical, follows the action)</div>
          <button
            className="btn full"
            disabled={!!busy}
            onClick={() =>
              run('reframe', async () => {
                setBusy('Following the action… 0%')
                return await autoReframe(c.id, (p) => setBusy(`Following the action… ${Math.round(p * 100)}%`))
              })
            }
          >
            {busy.startsWith('Following') ? busy : '🎯 Auto-reframe to vertical'}
          </button>
          <div className="hint">Beat zoom (pulses the picture on every beat)</div>
          <button className="btn full" disabled={!!busy} onClick={() => run('bz', () => beatZoom(c.id, 0.1))}>
            {busy === 'bz' ? 'Listening…' : '🥁 Zoom on the beat'}
          </button>
          <hr className="sep" />
          <div className="hint">Freeze frame at the playhead</div>
          <Slider label="Hold for" value={freezeLen} min={0.5} max={6} step={0.5} onChange={setFreezeLen} fmt={(v) => `${v.toFixed(1)}s`} />
          <button
            className="btn full"
            onClick={() => {
              const t = engine.time
              if (t <= c.start + 0.05 || t >= c.start + c.dur - 0.05) return toast('Move the playhead inside the clip first')
              freezeFrameAt(c.id, t, freezeLen)
            }}
          >
            ❄ Freeze here
          </button>
          <hr className="sep" />
          {(() => {
            const a = getAsset(c.assetId)
            if (!a) return null
            return a.proxyUrl ? (
              <div className="toggles">
                <span className="hint">⚡ Smooth preview is on (exports use the original).</span>
                <button className="chip" onClick={() => dropProxy(a.id)}>Turn off</button>
              </div>
            ) : (
              <>
                <button
                  className="btn full"
                  disabled={!!busy}
                  onClick={() => run('proxy', () => makeProxy(a.id, (p) => setBusy(`Making preview… ${Math.round(p * 100)}%`)))}
                >
                  {busy.startsWith('Making') ? busy : '⚡ Make smooth preview (proxy)'}
                </button>
                <div className="hint">{needsProxy(a) ? 'This is a large file – a light preview copy makes editing much smoother.' : 'For long or 4K clips that stutter while editing.'}</div>
              </>
            )
          })()}
          <hr className="sep" />
          <button
            className="btn full"
            disabled={!!busy}
            onClick={() =>
              run('rev', async () => {
                await reverseClip(c.id, (p) => setBusy(`Reversing… ${Math.round(p * 100)}%`))
                return 'Clip reversed (Undo restores the original).'
              })
            }
          >
            {busy.startsWith('Reversing') ? busy : '⏪ Reverse clip'}
          </button>
          <div className="hint">Reverse re-encodes this clip (video and sound) – best for short clips.</div>
        </>
      )}
    </Section>
  )
}

export function SpeedRamps({ c }: { c: Clip }) {
  if (c.kind !== 'video' || c.freeze) return null
  return (
    <Section title="Speed ramp">
      <div className="chips">
        {RAMPS.map((r) => (
          <button key={r.id} className="chip" onClick={() => (applySpeedRamp(c.id, r.id) ? toast('Ramp applied – it is built from short pieces, Undo to remove') : undefined)}>
            {r.name}
          </button>
        ))}
      </div>
      <div className="hint">Smoothly changes speed across the clip (0.25×–4×). Later clips on the track shift to fit. Sound follows the speed.</div>
    </Section>
  )
}

export function AudioTools({ c }: { c: Clip }) {
  const { busy, run } = useBusy()
  const [minSil, setMinSil] = useState(0.5)
  const [sens, setSens] = useState(0.5)
  const [strength, setStrength] = useState(0.7)
  const [level, setLevel] = useState(0.25)
  if (c.kind !== 'video' && c.kind !== 'audio') return null
  if (c.freeze) return null
  return (
    <Section title="Audio tools">
      <div className="hint">Noise reduction – learns the background hiss/hum from the quietest parts of this clip.</div>
      <Slider label="Strength" value={strength} min={0.2} max={1} onChange={setStrength} fmt={pct} />
      <button className="btn full" disabled={!!busy} onClick={() => run('nr', () => reduceNoise(c.id, strength))}>
        {busy === 'nr' ? 'Cleaning audio…' : '🔇 Reduce noise'}
      </button>
      <hr className="sep" />
      <div className="hint">Auto-duck – lowers this clip whenever any other clip is speaking. Best on music.</div>
      <Slider label="Duck to" value={level} min={0.05} max={0.7} onChange={setLevel} fmt={pct} />
      <div className="toggles">
        <button
          className="chip"
          disabled={!!busy}
          onClick={() =>
            run('duck', async () => {
              const n = await autoDuck(c.id, level)
              return n ? 'Ducking applied – watch the volume dip under the voice.' : 'No other speech found to duck under.'
            })
          }
        >
          {busy === 'duck' ? 'Analysing…' : '🎚 Duck under voices'}
        </button>
        {c.duck && <button className="chip" onClick={() => updateClip(c.id, { duck: undefined })}>Remove ducking</button>}
      </div>
      <hr className="sep" />
      <div className="hint">Auto-cut silences – removes dead air and closes the gaps (best on talking clips).</div>
      <Slider label="Shortest pause" value={minSil} min={0.25} max={1.5} step={0.05} onChange={setMinSil} fmt={(v) => `${v.toFixed(2)}s`} />
      <Slider label="Sensitivity" value={sens} min={0} max={1} onChange={setSens} fmt={pct} />
      <button className="btn full" disabled={!!busy} onClick={() => run('sil', () => cutSilences(c.id, minSil, sens))}>
        {busy === 'sil' ? 'Listening…' : '✂ Remove silences'}
      </button>
      <hr className="sep" />
      <div className="hint">Volume points: double-click the clip on the timeline to add one, drag to shape the volume. Drag the white dots to set fades.</div>
      {c.volKf && c.volKf.length > 0 && <button className="chip" onClick={() => updateClip(c.id, { volKf: undefined })}>Clear {c.volKf.length} volume points</button>}
      <hr className="sep" />
      <button
        className="btn full"
        disabled={!!busy}
        onClick={() =>
          run('beat', async () => {
            const n = await markBeats(c.id)
            return n ? `Added ${n} beat markers – clips snap to them.` : 'No clear beats found in this clip.'
          })
        }
      >
        {busy === 'beat' ? 'Listening…' : '🥁 Detect beats → markers'}
      </button>
    </Section>
  )
}

const TEXT_ANIMS: { id: TextAnim; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'typewriter', name: 'Typewriter' },
  { id: 'pop', name: 'Pop words' },
  { id: 'fade', name: 'Fade words' },
  { id: 'slide', name: 'Slide up' },
  { id: 'wave', name: 'Wave' },
]

export function SaveStyle({ c }: { c: Clip }) {
  const [name, setName] = useState('')
  if (c.kind !== 'text' || !c.text) return null
  return (
    <Section title="My text styles">
      <div className="toggles">
        <input className="full" placeholder="Name this look…" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="chip"
          disabled={!name.trim()}
          onClick={() => {
            saveStyle(name.trim(), c)
            setName('')
            toast('Style saved – find it in the Text tab')
          }}
        >
          Save
        </button>
      </div>
    </Section>
  )
}

export function TextAnimSection({ c }: { c: Clip }) {
  if (c.kind !== 'text' || !c.text) return null
  const anim = c.text.anim ?? 'none'
  return (
    <Section title="Text animation">
      <Chips
        items={TEXT_ANIMS}
        value={anim}
        onPick={(v) => {
          checkpoint()
          patchText(c.id, { anim: v })
          engine.seek(c.start)
        }}
      />
      {anim !== 'none' && anim !== 'wave' && (
        <Slider label="Build-in time" value={c.text.animDur ?? 0.8} min={0.2} max={Math.max(0.3, Math.min(4, c.dur))} onChange={(v) => patchText(c.id, { animDur: v })} fmt={(v) => `${v.toFixed(1)}s`} />
      )}
      <div className="hint">Plays at the start of the text clip – scrub to its start to preview.</div>
    </Section>
  )
}

export function MultiPanel({ ids }: { ids: string[] }) {
  const n = ids.length
  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-title">
          <b>{n} clips selected</b>
        </div>
      </div>
      <Section title="Edit together">
        <div className="toggles">
          <button className="chip" onClick={() => duplicateMany(ids)}>⧉ Duplicate</button>
          <button
            className="chip"
            onClick={() => {
              checkpoint()
              if (!splitMany(ids, engine.time)) toast('Move the playhead across the selected clips to split them')
            }}
          >
            ✂ Split at playhead
          </button>
          <button className="chip" onClick={() => deleteMany(ids)}>🗑 Delete</button>
          <button className="chip" onClick={() => rippleDelete(ids)}>⇤ Delete &amp; close gap</button>
        </div>
        <div className="hint">
          <b>Shift/Ctrl-click</b> adds clips to the selection, drag on empty timeline space to box-select, and dragging any selected clip moves them all together.
          <b> Shift+Del</b> deletes and closes the gap.
        </div>
      </Section>
      <Section title="Volume (all audio clips)">
        <Slider
          label="Volume"
          value={1}
          min={0}
          max={2}
          onChange={(v) => {
            const cl = getState().project.clips
            for (const id of ids) {
              const k = cl.find((x) => x.id === id)
              if (k && (k.kind === 'video' || k.kind === 'audio' || k.kind === 'sfx')) patchClip(id, { volume: v })
            }
          }}
          fmt={pct}
        />
      </Section>
    </div>
  )
}

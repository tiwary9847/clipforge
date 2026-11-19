import { useEffect, useState } from 'react'
import { Chips, NumField, Section, Slider } from './Fields'
import {
  applyMotion,
  checkpoint,
  clearKeyframes,
  hasKeyAt,
  localTime,
  setClipProp,
  toggleKeyframe,
  deleteClip,
  duplicateClip,
  getState,
  patchClip,
  patchText,
  setProject,
  setSpeed,
  setUi,
  splitClip,
  trimToAsset,
  updateClip,
  useStore,
  getAsset,
} from '../store'
import { engine } from '../engine'
import { FILTER_PRESETS, FONTS, FX_LIST, TRANS_LIST, mkFilters } from '../library'
import { Clip, DEFAULT_FILTERS, Ease, KfProp, PRESETS } from '../types'
import { Motion, evalProp, hasKeys, kfTimes } from '../anim'
import { BeautySection } from './FacePanels'
import { PersonSection } from './CreativePanels'
import { EnhanceSection } from './MorePanels'
import { EqSection, GradeSection, LookSection, ProVideo, SceneSplit, TrackSection, VoiceSection } from './ProPanels2'
import { AudioTools, ChromaSection, CropMaskBlend, MultiPanel, SaveStyle, SpeedRamps, TextAnimSection, VideoTools } from './ProPanels'

const pct = (v: number) => `${Math.round(v * 100)}%`
const deg = (v: number) => `${Math.round(v)}°`

export function Inspector({ onExport }: { onExport: () => void }) {
  const clip = useStore((s) => s.project.clips.find((c) => c.id === s.selectedId) ?? null)
  const selIds = useStore((s) => s.selIds)
  if (selIds.length > 1) return <MultiPanel ids={selIds} />
  if (!clip) return <ProjectPanel onExport={onExport} />
  return <ClipPanel clip={clip} />
}

function ProjectPanel({ onExport }: { onExport: () => void }) {
  const project = useStore((s) => s.project)
  const showSafe = useStore((s) => s.showSafe)
  const preset = PRESETS.find((p) => p.id === project.presetId)!
  return (
    <div className="inspector">
      <Section title="Canvas · platform">
        <select
          className="full"
          value={project.presetId}
          onChange={(e) => {
            setProject({ presetId: e.target.value })
            setTimeout(() => engine.render(), 0)
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="hint">
          {preset.w}×{preset.h}px · {preset.platform}. Your layout stays put when you switch formats, so one edit can
          become a Short, a Reel and a YouTube video.
        </div>
        <label className="row">
          <span className="lbl">Background</span>
          <input type="color" value={project.bg} onChange={(e) => setProject({ bg: e.target.value })} />
        </label>
        {preset.safe && (
          <label className="row check">
            <input type="checkbox" checked={showSafe} onChange={(e) => setUi({ showSafe: e.target.checked })} />
            <span>Show app-UI safe zone (approx.)</span>
          </label>
        )}
      </Section>
      <Section title="Quick start">
        <ol className="hint steps">
          <li>Import clips in <b>Media</b> (or drop files anywhere) and press <b>＋</b>.</li>
          <li>Press <b>S</b> to split at the playhead, <b>Del</b> to remove.</li>
          <li>Add <b>Text</b>, <b>Stickers</b>, <b>Audio</b> FX and <b>Captions</b>.</li>
          <li>Click anything on the canvas to move, scale or rotate it.</li>
          <li><b>Export</b> and upload.</li>
        </ol>
        <button className="btn primary full" onClick={onExport}>
          Export video
        </button>
      </Section>
      <Section title="Shortcuts">
        <div className="hint kbd">
          <span>Space</span> play/pause · <span>S</span> split · <span>Del</span> delete · <span>Ctrl/⌘+Z</span> undo ·{' '}
          <span>Ctrl/⌘+Shift+Z</span> redo · <span>Ctrl/⌘+D</span> duplicate · <span>←/→</span> frame step
        </div>
      </Section>
    </div>
  )
}

function useLocalTime(active: boolean) {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    let last = 0
    return engine.onTick((_t, playing) => {
      const now = performance.now()
      if (playing && now - last < 100) return
      last = now
      setN((n) => n + 1)
    })
  }, [active])
}

const MOTIONS: { id: Motion; name: string }[] = [
  { id: 'zoom-in', name: 'Slow zoom in' },
  { id: 'zoom-out', name: 'Slow zoom out' },
  { id: 'pan-right', name: 'Pan →' },
  { id: 'pan-left', name: 'Pan ←' },
  { id: 'pop', name: 'Pop in' },
  { id: 'drop', name: 'Drop in' },
  { id: 'spin', name: 'Spin in' },
]

function ClipPanel({ clip: c }: { clip: Clip }) {
  useLocalTime(hasKeys(c))
  const lt = localTime(c)
  const KS = (prop: KfProp, label: string, min: number, max: number, fmt: (v: number) => string, step = 0.01) => (
    <Slider
      label={label}
      value={evalProp(c, prop, lt)}
      min={min}
      max={max}
      step={step}
      onChange={(v) => setClipProp(c.id, prop, v)}
      fmt={fmt}
      kf={{ on: hasKeyAt(c, prop), has: !!c.kf?.[prop]?.length, toggle: () => toggleKeyframe(c.id, prop) }}
    />
  )
  const keys = kfTimes(c)
  const isVisual = c.kind === 'video' || c.kind === 'image' || c.kind === 'text' || c.kind === 'sticker'
  const hasAudio = c.kind === 'video' || c.kind === 'audio' || c.kind === 'sfx'
  const hasSpeed = c.kind === 'video' || c.kind === 'audio'
  const P = (patch: Partial<Clip>) => patchClip(c.id, patch)
  const U = (patch: Partial<Clip>) => updateClip(c.id, patch)

  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-title">
          <span className={`dot k-${c.kind}`} />
          <b>{c.kind === 'sfx' ? 'Sound effect' : c.kind[0].toUpperCase() + c.kind.slice(1)}</b>
          <span className="muted ell">{c.label}</span>
        </div>
        <div className="insp-actions">
          <button className="ico" title="Split at playhead (S)" onClick={() => splitClip(c.id, engine.time)}>✂</button>
          <button className="ico" title="Duplicate (Ctrl+D)" onClick={() => duplicateClip(c.id)}>⧉</button>
          <button className="ico danger" title="Delete (Del)" onClick={() => deleteClip(c.id)}>🗑</button>
        </div>
      </div>

      <Section title="Timing">
        <div className="grid2">
          <NumField label="Start (s)" value={c.start} min={0} onCommit={(v) => U({ start: v })} />
          <NumField
            label="Duration (s)"
            value={c.dur}
            min={0.1}
            onCommit={(v) => U({ dur: trimToAsset(c, v) })}
          />
        </div>
      </Section>

      {c.kind === 'text' && c.text && (
        <Section title="Text">
          <textarea
            className="full"
            rows={3}
            value={c.text.text}
            onFocus={() => checkpoint()}
            onChange={(e) => {
              patchText(c.id, { text: e.target.value })
              P({ label: e.target.value.slice(0, 40) })
            }}
          />
          <select className="full" value={c.text.font} onChange={(e) => { checkpoint(); patchText(c.id, { font: e.target.value }) }}>
            {FONTS.map((f) => (
              <option key={f.label} value={f.css}>
                {f.label}
              </option>
            ))}
          </select>
          <Slider label="Size" value={c.text.size} min={0.02} max={0.25} onChange={(v) => patchText(c.id, { size: v })} fmt={pct} />
          <Slider label="Wrap width" value={c.text.maxW} min={0.2} max={1} onChange={(v) => patchText(c.id, { maxW: v })} fmt={pct} />
          <div className="grid3">
            <label className="color"><span>Fill</span><input type="color" value={c.text.color} onChange={(e) => patchText(c.id, { color: e.target.value })} /></label>
            <label className="color"><span>Outline</span><input type="color" value={c.text.stroke} onChange={(e) => patchText(c.id, { stroke: e.target.value })} /></label>
            <label className="color"><span>Box</span><input type="color" value={c.text.bg} onChange={(e) => patchText(c.id, { bg: e.target.value })} /></label>
          </div>
          <div className="row2">
            <label className="ochk"><input type="checkbox" checked={!!c.text.grad} onChange={(e) => patchText(c.id, { grad: e.target.checked ? '#ff5c9a' : undefined })} /> Gradient fill</label>
            {c.text.grad && <label className="color"><span>to</span><input type="color" value={c.text.grad} onChange={(e) => patchText(c.id, { grad: e.target.value })} /></label>}
          </div>
          <Slider label="Curve" value={c.text.curve ?? 0} min={-1} max={1} step={0.02} onChange={(v) => patchText(c.id, { curve: Math.abs(v) < 0.03 ? 0 : v })} fmt={(v) => (Math.abs(v) < 0.03 ? 'straight' : v > 0 ? `arch ${Math.round(v * 100)}%` : `smile ${Math.round(-v * 100)}%`)} />
          <Slider label="Outline" value={c.text.strokeW} min={0} max={0.3} onChange={(v) => patchText(c.id, { strokeW: v })} fmt={pct} />
          <Slider label="Box opacity" value={c.text.bgOpacity} min={0} max={1} onChange={(v) => patchText(c.id, { bgOpacity: v })} fmt={pct} />
          <div className="toggles">
            <button className={'chip' + (c.text.bold ? ' on' : '')} onClick={() => { checkpoint(); patchText(c.id, { bold: !c.text!.bold }) }}><b>B</b></button>
            <button className={'chip' + (c.text.italic ? ' on' : '')} onClick={() => { checkpoint(); patchText(c.id, { italic: !c.text!.italic }) }}><i>I</i></button>
            <button className={'chip' + (c.text.upper ? ' on' : '')} onClick={() => { checkpoint(); patchText(c.id, { upper: !c.text!.upper }) }}>AA</button>
            <button className={'chip' + (c.text.shadow ? ' on' : '')} onClick={() => { checkpoint(); patchText(c.id, { shadow: !c.text!.shadow }) }}>Glow</button>
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} className={'chip' + (c.text!.align === a ? ' on' : '')} onClick={() => { checkpoint(); patchText(c.id, { align: a }) }}>
                {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
              </button>
            ))}
          </div>
        </Section>
      )}

      <TextAnimSection c={c} />
      <SaveStyle c={c} />

      {c.kind === 'sticker' && (
        <Section title="Sticker">
          <Slider label="Size" value={c.stickerSize ?? 0.2} min={0.05} max={0.8} onChange={(v) => P({ stickerSize: v })} fmt={pct} />
          {c.shape && (
            <>
              <div className="colors">
                <label className="color"><span>Colour</span><input type="color" value={c.color ?? '#ffd400'} onChange={(e) => P({ color: e.target.value })} /></label>
              </div>
              {(c.shape === 'subscribe' || c.shape === 'like' || c.shape === 'callout') && (
                <input className="full" value={c.shapeText ?? ''} placeholder={c.shape === 'callout' ? 'Wait for it…' : c.shape === 'like' ? 'LIKE' : 'SUBSCRIBE'} onChange={(e) => P({ shapeText: e.target.value })} />
              )}
              {c.shape === 'progress' && <div className="hint">Fills along the bottom as the video plays. Stretch it over the whole video.</div>}
              {c.shape.startsWith('viz') && <div className="hint">Follows the music track (or your voice / video sound if there’s no music).</div>}
              {c.shape === 'subscribe' && <div className="hint">Pops in, then gets “clicked” halfway and turns grey with a ringing bell.</div>}
            </>
          )}
        </Section>
      )}

      {isVisual && (
        <Section title="Transform" right={<button className="link" onClick={() => U({ x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, kf: undefined })}>Reset</button>}>
          {KS('x', 'Position X', -0.5, 1.5, pct)}
          {KS('y', 'Position Y', -0.5, 1.5, pct)}
          {KS('scale', 'Scale', 0.05, 4, pct)}
          {KS('rotation', 'Rotate', -360, 360, deg, 1)}
          {KS('opacity', 'Opacity', 0, 1, pct)}
          <div className="hint">◆ adds a keyframe at the playhead. Once a property has keyframes, moving it at another time adds more.</div>
          <div className="toggles">
            <button className={'chip' + (c.flipX ? ' on' : '')} onClick={() => U({ flipX: !c.flipX })}>Flip ↔</button>
            {(c.kind === 'video' || c.kind === 'image') && (
              <>
                <button className={'chip' + (c.fit === 'cover' ? ' on' : '')} onClick={() => U({ fit: 'cover', scale: 1, x: 0.5, y: 0.5 })}>Fill frame</button>
                <button className={'chip' + (c.fit === 'contain' ? ' on' : '')} onClick={() => U({ fit: 'contain', scale: 1, x: 0.5, y: 0.5 })}>Fit inside</button>
              </>
            )}
          </div>
        </Section>
      )}

      {isVisual && (
        <Section
          title="Keyframes & motion"
          right={keys.length ? <button className="link" onClick={() => clearKeyframes(c.id)}>Clear all</button> : undefined}
        >
          <div className="chips">
            {MOTIONS.map((m) => (
              <button key={m.id} className="chip" onClick={() => applyMotion(c.id, m.id)}>
                {m.name}
              </button>
            ))}
          </div>
          {keys.length > 0 && (
            <>
              <div className="hint">Motion curve between keyframes</div>
              <Chips items={EASES} value={c.ease ?? 'smooth'} onPick={(v) => U({ ease: v })} />
            </>
          )}
          {keys.length > 0 && (
            <div className="toggles">
              <button
                className="chip"
                onClick={() => {
                  const here = engine.time - c.start
                  const prev = [...keys].reverse().find((k) => k < here - 0.03)
                  if (prev !== undefined) engine.seek(c.start + prev)
                }}
              >
                ◂ Prev key
              </button>
              <button
                className="chip"
                onClick={() => {
                  const here = engine.time - c.start
                  const next = keys.find((k) => k > here + 0.03)
                  if (next !== undefined) engine.seek(c.start + next)
                }}
              >
                Next key ▸
              </button>
              <span className="hint">{keys.length} keyframe time{keys.length > 1 ? 's' : ''}</span>
            </div>
          )}
        </Section>
      )}

      {isVisual && <CropMaskBlend c={c} />}
      {(c.kind === 'video' || c.kind === 'image') && <ChromaSection c={c} />}
      {c.kind === 'adjust' && (
        <Section title="Adjustment layer">
          <div className="hint">Everything on the tracks below this layer gets its filters, colour grade and effect while it’s on the timeline. Use it to grade or stylise many clips at once.</div>
          {KS('opacity', 'Strength', 0, 1, pct)}
        </Section>
      )}
      <BeautySection c={c} />
      <PersonSection c={c} />
      {c.kind === 'image' && !getAsset(c.assetId)?.animated && (
        <Section title="Photo enhance & upscale">
          <EnhanceSection c={c} />
        </Section>
      )}
      {(c.kind === 'video' || c.kind === 'image' || c.kind === 'adjust') && <LookSection c={c} />}
      {(c.kind === 'video' || c.kind === 'image' || c.kind === 'adjust') && <GradeSection c={c} />}
      {(c.kind === 'video' || c.kind === 'image') && <ProVideo c={c} />}
      <TrackSection c={c} />
      {c.kind === 'video' && <VideoTools c={c} />}

      <SpeedRamps c={c} />
      {hasSpeed && !c.freeze && (
        <Section title="Speed">
          <div className="chips">
            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].map((s) => (
              <button
                key={s}
                className={'chip' + (c.speed === s ? ' on' : '')}
                onClick={() => { checkpoint(); setSpeed(c.id, s) }}
              >
                {s}×
              </button>
            ))}
          </div>
          <Slider label="Custom" value={c.speed} min={0.25} max={4} onChange={(v) => setSpeed(c.id, Math.round(v * 20) / 20)} fmt={(v) => `${v.toFixed(2)}×`} />
        </Section>
      )}

      {hasAudio && !c.freeze && (
        <Section title="Audio">
          <Slider label="Volume" value={c.volume} min={0} max={2} onChange={(v) => P({ volume: v })} fmt={pct} />
          <Slider label="Fade in" value={c.fadeIn} min={0} max={Math.min(5, c.dur)} onChange={(v) => P({ fadeIn: v })} fmt={(v) => `${v.toFixed(1)}s`} />
          <Slider label="Fade out" value={c.fadeOut} min={0} max={Math.min(5, c.dur)} onChange={(v) => P({ fadeOut: v })} fmt={(v) => `${v.toFixed(1)}s`} />
        </Section>
      )}
      <AudioTools c={c} />
      <EqSection c={c} />
      <VoiceSection c={c} />

      {(isVisual || c.kind === 'adjust') && (
        <>
          <Section title="Filters & colour" right={<button className="link" onClick={() => U({ filters: { ...DEFAULT_FILTERS } })}>Reset</button>}>
            <div className="chips">
              {FILTER_PRESETS.map((f) => (
                <button key={f.id} className="chip" onClick={() => U({ filters: mkFilters(f.f) })}>
                  {f.name}
                </button>
              ))}
            </div>
            <Slider label="Brightness" value={c.filters.brightness} min={0} max={2} onChange={(v) => P({ filters: { ...c.filters, brightness: v } })} fmt={pct} />
            <Slider label="Contrast" value={c.filters.contrast} min={0} max={3} onChange={(v) => P({ filters: { ...c.filters, contrast: v } })} fmt={pct} />
            <Slider label="Saturation" value={c.filters.saturate} min={0} max={3} onChange={(v) => P({ filters: { ...c.filters, saturate: v } })} fmt={pct} />
            <Slider label="Hue" value={c.filters.hue} min={-180} max={180} step={1} onChange={(v) => P({ filters: { ...c.filters, hue: v } })} fmt={deg} />
            <Slider label="Blur" value={c.filters.blur} min={0} max={30} step={0.5} onChange={(v) => P({ filters: { ...c.filters, blur: v } })} fmt={(v) => `${v}px`} />
            <Slider label="Sepia" value={c.filters.sepia} min={0} max={1} onChange={(v) => P({ filters: { ...c.filters, sepia: v } })} fmt={pct} />
            <Slider label="Black & white" value={c.filters.grayscale} min={0} max={1} onChange={(v) => P({ filters: { ...c.filters, grayscale: v } })} fmt={pct} />
          </Section>

          {isVisual && (
          <Section title="Animation (meme FX)">
            <Chips items={FX_LIST} value={c.fx} onPick={(v) => U({ fx: v })} />
          </Section>
          )}

          <Section title="Transitions">
            <div className="hint">In</div>
            <Chips items={TRANS_LIST} value={c.transIn.type} onPick={(v) => U({ transIn: { ...c.transIn, type: v } })} />
            <Slider label="In length" value={c.transIn.dur} min={0.1} max={Math.max(0.2, Math.min(2, c.dur / 2))} onChange={(v) => P({ transIn: { ...c.transIn, dur: v } })} fmt={(v) => `${v.toFixed(1)}s`} />
            <div className="hint">Out</div>
            <Chips items={TRANS_LIST} value={c.transOut.type} onPick={(v) => U({ transOut: { ...c.transOut, type: v } })} />
            <Slider label="Out length" value={c.transOut.dur} min={0.1} max={Math.max(0.2, Math.min(2, c.dur / 2))} onChange={(v) => P({ transOut: { ...c.transOut, dur: v } })} fmt={(v) => `${v.toFixed(1)}s`} />
          </Section>
        </>
      )}
      <div style={{ height: 24 }} />
    </div>
  )
}

const EASES: { id: Ease; name: string }[] = [
  { id: 'smooth', name: 'Smooth' },
  { id: 'linear', name: 'Linear' },
  { id: 'in', name: 'Ease in' },
  { id: 'out', name: 'Ease out' },
  { id: 'bounce', name: 'Bounce' },
  { id: 'elastic', name: 'Elastic' },
  { id: 'hold', name: 'Hold / jump' },
]

export { getState }

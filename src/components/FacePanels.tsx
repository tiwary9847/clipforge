import { useState } from 'react'
import { addFaceSticker, getState, patchClip, setUi, updateClip, useStore, checkpoint } from '../store'
import { Beauty, Clip, ShapeId } from '../types'
import { hasFaces, peopleIn, trackFaces } from '../faces'
import { Section, Slider } from './Fields'
import { engine } from '../engine'

const toast = (m: string) => setUi({ toast: m })

/** Runs the face finder with a progress label; shared by beauty and face stickers. */
function useFaceFinder() {
  const [busy, setBusy] = useState('')
  const find = async (c: Clip) => {
    if (busy) return false
    setBusy('Loading the face finder…')
    try {
      const tr = await trackFaces(c.id, (_p, m) => setBusy(m))
      const n = Math.max(0, ...tr.frames.map((r) => r.filter(Boolean).length))
      if (!n) {
        toast('No faces found in this clip. Faces need to be reasonably big, front-facing and well lit.')
        return false
      }
      toast(`Found ${n} face${n > 1 ? 's' : ''} – they’re followed through the clip.`)
      engine.requestRender()
      return true
    } catch (e) {
      toast((e as Error).message || 'Face finder failed')
      return false
    } finally {
      setBusy('')
    }
  }
  return { busy, find }
}

const LOOKS: [string, Beauty][] = [
  ['Natural', { smooth: 0.35, bright: 0.2, tone: 0.2 }],
  ['Glow', { smooth: 0.55, bright: 0.45, tone: 0.3 }],
  ['Smooth', { smooth: 0.85, bright: 0.25, tone: 0.35 }],
]

export function BeautySection({ c }: { c: Clip }) {
  const faces = useStore((s) => (c.assetId ? s.project.faces?.[c.assetId] : undefined))
  const { busy, find } = useFaceFinder()
  if (c.kind !== 'video' && c.kind !== 'image') return null
  const b = c.beauty
  const people = faces ? peopleIn(c.assetId) : 0
  const set = (p: Partial<Beauty>) => patchClip(c.id, { beauty: { ...(b ?? { smooth: 0, bright: 0, tone: 0 }), ...p } })
  return (
    <Section title="Face retouch" right={b ? <button className="lnk" onClick={() => updateClip(c.id, { beauty: undefined })}>Remove</button> : undefined}>
      {!faces ? (
        <>
          <div className="hint">Smooths skin, lights up and evens out faces only – eyes and lips stay sharp. First we find the faces in this clip (runs on your device).</div>
          <button className="btn full" disabled={!!busy} onClick={async () => { if (await find(c)) updateClip(c.id, { beauty: LOOKS[0][1] }) }}>
            {busy || '✨ Find faces & retouch'}
          </button>
        </>
      ) : (
        <>
          <div className="chips">
            {LOOKS.map(([n, v]) => (
              <button key={n} className={'chip' + (b && b.smooth === v.smooth && b.bright === v.bright ? ' on' : '')} onClick={() => updateClip(c.id, { beauty: { ...v, person: b?.person } })}>
                {n}
              </button>
            ))}
          </div>
          <Slider label="Smooth skin" value={b?.smooth ?? 0} min={0} max={1} onChange={(v) => set({ smooth: v })} fmt={(v) => Math.round(v * 100) + '%'} />
          <Slider label="Brighten face" value={b?.bright ?? 0} min={0} max={1} onChange={(v) => set({ bright: v })} fmt={(v) => Math.round(v * 100) + '%'} />
          <Slider label="Even skin tone" value={b?.tone ?? 0} min={0} max={1} onChange={(v) => set({ tone: v })} fmt={(v) => Math.round(v * 100) + '%'} />
          {people > 1 && (
            <div className="chips">
              <button className={'chip' + ((b?.person ?? -1) < 0 ? ' on' : '')} onClick={() => updateClip(c.id, { beauty: { ...(b ?? LOOKS[0][1]), person: -1 } })}>Everyone</button>
              {Array.from({ length: people }, (_, i) => (
                <button key={i} className={'chip' + (b?.person === i ? ' on' : '')} onClick={() => updateClip(c.id, { beauty: { ...(b ?? LOOKS[0][1]), person: i } })}>Person {i + 1}</button>
              ))}
            </div>
          )}
          <button className="lnk" disabled={!!busy} onClick={() => find(c)}>{busy || '↻ Find faces again (after trimming longer)'}</button>
        </>
      )}
    </Section>
  )
}

export const FACE_STICKERS: { shape: ShapeId; icon: string; name: string; emoji?: string }[] = [
  { shape: 'face-shades', icon: '🕶️', name: 'Deal with it' },
  { shape: 'face-hearteyes', icon: '😍', name: 'Heart eyes' },
  { shape: 'face-fireeyes', icon: '🔥', name: 'Fire eyes' },
  { shape: 'face-tears', icon: '😭', name: 'Tears' },
  { shape: 'face-crown', icon: '👑', name: 'Crown' },
  { shape: 'face-halo', icon: '😇', name: 'Halo' },
  { shape: 'face-horns', icon: '😈', name: 'Devil horns' },
  { shape: 'face-cap', icon: '🧢', name: 'Cap' },
  { shape: 'face-mustache', icon: '🥸', name: 'Moustache' },
  { shape: 'face-nose', icon: '🤡', name: 'Clown nose' },
  { shape: 'face-blush', icon: '☺️', name: 'Blush' },
  { shape: 'face-emoji', icon: '😂', name: 'Emoji face', emoji: '😂' },
  { shape: 'face-emoji', icon: '💀', name: 'Skull face', emoji: '💀' },
  { shape: 'face-emoji', icon: '🙈', name: 'Hide face', emoji: '🙈' },
]

/** The video clip a face sticker should follow: the selected one, else the one under the playhead. */
function targetClip(): Clip | undefined {
  const s = getState()
  const sel = s.project.clips.find((c) => c.id === s.selectedId)
  if (sel && (sel.kind === 'video' || sel.kind === 'image')) return sel
  const t = engine.time
  const under = s.project.clips.filter((c) => (c.kind === 'video' || c.kind === 'image') && t >= c.start && t < c.start + c.dur)
  return under.find((c) => c.track === 'v1') ?? under[0] ?? s.project.clips.find((c) => c.kind === 'video')
}

export function FaceStickers() {
  const { busy, find } = useFaceFinder()
  const [person, setPerson] = useState(0)
  useStore((s) => s.selectedId)
  const tgt = targetClip()
  const people = tgt ? peopleIn(tgt.assetId) : 0
  const add = async (fs: (typeof FACE_STICKERS)[0]) => {
    const c = targetClip()
    if (!c) return toast('Add a video with a face to the timeline first.')
    if (!hasFaces(c) && !(await find(c))) return
    checkpoint()
    addFaceSticker(fs.shape, fs.name, c, Math.min(person, Math.max(0, peopleIn(c.assetId) - 1)), fs.emoji)
    toast(`${fs.name} added – it follows the face in “${c.label}”.`)
  }
  return (
    <>
      <div className="group-h">Face stickers (follow the face)</div>
      <div className="hint">
        {tgt ? <>Sticks to a face in <b>{tgt.label}</b> and moves with it.</> : 'Add a video with a face first.'} {busy && <b>{busy}</b>}
      </div>
      {people > 1 && (
        <div className="chips">
          {Array.from({ length: people }, (_, i) => (
            <button key={i} className={'chip' + (person === i ? ' on' : '')} onClick={() => setPerson(i)}>Person {i + 1}</button>
          ))}
        </div>
      )}
      <div className="shape-grid">
        {FACE_STICKERS.map((f) => (
          <button key={f.name} className="shape-btn" disabled={!!busy} onClick={() => void add(f)} title={f.name}>
            <span>{f.icon}</span>
            <small>{f.name}</small>
          </button>
        ))}
      </div>
    </>
  )
}

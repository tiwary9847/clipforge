import { useRef, useState } from 'react'
import { setProject, setUi, useStore } from '../store'
import { Clip } from '../types'
import { SPEAKER_COLORS, findSpeakers, turnsOnTimeline } from '../speakers'
import { switchBySpeaker } from '../multicam'
import { dubToEnglish } from '../dub'
import { VOICES } from '../pro'
import { MODELS } from './MediaPanel'
import { engine } from '../engine'

const toast = (m: string) => setUi({ toast: m })
const speakingClips = (clips: Clip[]) => clips.filter((c) => (c.kind === 'video' || (c.kind === 'audio' && !c.label.startsWith('🇬🇧'))) && c.assetId && c.volume > 0 && !c.freeze)

export function SpeakersSection() {
  const clips = useStore((s) => s.project.clips)
  const names = useStore((s) => s.project.speakerNames)
  const speakers = useStore((s) => s.project.speakers)
  const mc = useStore((s) => s.project.multicam)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState('')
  const [map, setMap] = useState<number[]>([0, 1, 2, 3])
  const list = speakingClips(clips)
  const turns = list.flatMap(turnsOnTimeline).sort((a, b) => a.s - b.s)
  const n = speakers ? Math.max(0, ...turns.map((t) => t.spk + 1)) : 0
  const share = Array.from({ length: n }, (_, i) => turns.filter((t) => t.spk === i).reduce((s, t) => s + t.e - t.s, 0))
  const total = share.reduce((s, v) => s + v, 0) || 1
  return (
    <>
      <div className="hint">Tells voices apart (best when they differ, like a man and a woman) – then colour captions per person, dub each with their own voice, or make multicam follow whoever talks.</div>
      <div className="chips">
        {[0, 2, 3].map((k) => (
          <button key={k} className={'chip' + (count === k ? ' on' : '')} onClick={() => setCount(k)}>{k ? `${k} people` : 'Auto'}</button>
        ))}
      </div>
      <button
        className="btn full"
        disabled={!!busy || !list.length}
        onClick={async () => {
          setBusy('Listening…')
          try {
            const r = await findSpeakers(list, count, setBusy)
            toast(r.speakers ? `Found ${r.speakers} speaker${r.speakers > 1 ? 's' : ''}.` : 'No clear speech found.')
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || (list.length ? '🗣️ Find speakers' : 'Add a video with talking first')}
      </button>
      {n > 0 &&
        Array.from({ length: n }, (_, i) => (
          <div key={i} className="spk-row">
            <i style={{ background: SPEAKER_COLORS[i % 4] }} />
            <input value={names?.[i] ?? `Speaker ${i + 1}`} onChange={(e) => setProject({ speakerNames: Array.from({ length: n }, (_, k) => (k === i ? e.target.value : names?.[k] ?? `Speaker ${k + 1}`)) })} />
            <small>{Math.round((share[i] / total) * 100)}% of talk</small>
          </div>
        ))}
      {n > 1 && mc && (
        <>
          <div className="hint">Multicam: which camera shows each person?</div>
          {Array.from({ length: n }, (_, i) => (
            <label key={i} className="row2">
              <span>{names?.[i] ?? `Speaker ${i + 1}`} →</span>
              <select value={map[i]} onChange={(e) => setMap((m) => m.map((v, k) => (k === i ? +e.target.value : v)))}>
                {mc.angles.map((a, k) => (
                  <option key={k} value={k}>{a.name}</option>
                ))}
              </select>
            </label>
          ))}
          <button className="btn full" onClick={() => { try { toast(switchBySpeaker(turns, map)); engine.requestRender() } catch (e) { toast((e as Error).message) } }}>🎥 Cut to whoever is talking</button>
        </>
      )}
    </>
  )
}

export function DubSection() {
  const clips = useStore((s) => s.project.clips)
  const names = useStore((s) => s.project.speakerNames)
  const speakers = useStore((s) => s.project.speakers)
  const list = speakingClips(clips)
  const n = speakers ? Math.max(1, ...list.flatMap(turnsOnTimeline).map((t) => t.spk + 1)) : 1
  const [voices, setVoices] = useState(['kokoro:am_michael', 'kokoro:af_heart', 'kokoro:bm_george', 'kokoro:af_bella'])
  const [model, setModel] = useState(MODELS[2].id)
  const [orig, setOrig] = useState(0.15)
  const [busy, setBusy] = useState('')
  const [pct, setPct] = useState<number | undefined>()
  const sig = useRef({ cancelled: false })
  const eng = VOICES.filter((v) => v.id.startsWith('kokoro'))
  return (
    <>
      <div className="hint">Translates what you say into English and reads it in an AI voice at the same moments, with your original sound turned down. Lips won’t match – best for vlogs and voice-over style videos. Runs on your device (speech + voice models download once).</div>
      <select className="full" value={model} onChange={(e) => setModel(e.target.value)} disabled={!!busy}>
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.name}{m.id === MODELS[2].id ? ' – best for Hindi' : ''}</option>
        ))}
      </select>
      {Array.from({ length: n }, (_, i) => (
        <label key={i} className="row2">
          <span>{n > 1 ? `${names?.[i] ?? `Speaker ${i + 1}`}:` : 'Voice:'}</span>
          <select value={voices[i]} onChange={(e) => setVoices((v) => v.map((x, k) => (k === i ? e.target.value : x)))} disabled={!!busy}>
            {eng.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
      ))}
      {n === 1 && <div className="hint">Two people talking? Run <b>Find speakers</b> above first and each gets their own voice.</div>}
      <label className="row slider">
        <span className="lbl">Original sound</span>
        <input type="range" min={0} max={0.6} step={0.05} value={orig} onChange={(e) => setOrig(+e.target.value)} />
        <span className="val">{Math.round(orig * 100)}%</span>
      </label>
      {busy ? (
        <>
          <div className="progress"><div className="progress-in" style={{ width: `${pct ?? 8}%` }} /></div>
          <div className="hint">{busy}</div>
          <button className="btn full" onClick={() => (sig.current.cancelled = true)}>Cancel</button>
        </>
      ) : (
        <button
          className="btn primary full"
          disabled={!list.length}
          onClick={async () => {
            sig.current = { cancelled: false }
            setBusy('Starting…')
            try {
              toast(await dubToEnglish(list, { voices, original: orig, model, gpu: false }, (m, p) => { setBusy(m); setPct(p) }, sig.current))
            } catch (e) {
              toast((e as Error).message)
            }
            setBusy('')
            setPct(undefined)
          }}
        >
          🌍 Dub into English
        </button>
      )}
    </>
  )
}

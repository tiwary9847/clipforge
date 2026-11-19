import { useRef, useState } from 'react'
import { setUi } from '../store'
import { MOODS, Mood, addMusic, compose } from '../musicgen'
import { SfxOpts, ZoomStyle, autoSfx, autoZoom } from '../autoedit2'

const toast = (m: string) => setUi({ toast: m })

export function MusicMaker() {
  const [mood, setMood] = useState<Mood>('vlog')
  const [len, setLen] = useState<number | 'video'>('video')
  const [seed, setSeed] = useState(1)
  const [busy, setBusy] = useState('')
  const [playing, setPlaying] = useState(false)
  const audio = useRef<AudioBufferSourceNode | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const stop = () => {
    audio.current?.stop()
    audio.current = null
    setPlaying(false)
  }
  const preview = async () => {
    if (playing) return stop()
    setBusy('Composing a preview…')
    const r = await compose(mood, 15, seed)
    setBusy('')
    const ac = (ctx.current ??= new AudioContext())
    const b = ac.createBuffer(2, r.L.length, r.sr)
    b.copyToChannel(new Float32Array(r.L), 0)
    b.copyToChannel(new Float32Array(r.R), 1)
    const s = ac.createBufferSource()
    s.buffer = b
    s.connect(ac.destination)
    s.onended = () => setPlaying(false)
    s.start()
    audio.current = s
    setPlaying(true)
  }
  return (
    <>
      <div className="hint">Original background music, made on your device – nobody else owns it, so no copyright claims on YouTube or Instagram. Every “Another version” is a new tune.</div>
      <div className="chips">
        {MOODS.map((m) => (
          <button key={m.id} title={m.desc} className={'chip' + (mood === m.id ? ' on' : '')} onClick={() => { stop(); setMood(m.id) }}>{m.name}</button>
        ))}
      </div>
      <div className="chips">
        {(['video', 15, 30, 60, 120] as const).map((l) => (
          <button key={String(l)} className={'chip' + (len === l ? ' on' : '')} onClick={() => setLen(l)}>{l === 'video' ? 'Whole video' : `${l}s`}</button>
        ))}
      </div>
      <div className="row2" style={{ display: 'flex', gap: 6 }}>
        <button className="btn sm" disabled={!!busy} onClick={preview}>{playing ? '⏹ Stop' : '▶ Preview'}</button>
        <button className="btn sm" disabled={!!busy} onClick={() => { stop(); setSeed((s) => s + 1) }}>🎲 Another version (#{seed + 1})</button>
      </div>
      <button
        className="btn primary full"
        disabled={!!busy}
        onClick={async () => {
          stop()
          setBusy('Composing…')
          try {
            toast(await addMusic(mood, len, seed, setBusy))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || `🎵 Add this music (#${seed})`}
      </button>
    </>
  )
}

export function AutoZoomSection() {
  const [style, setStyle] = useState<ZoomStyle>('punchy')
  const [busy, setBusy] = useState('')
  return (
    <>
      <div className="hint">Zooms in and out on your face at key moments – when you start a sentence or stress a word – the jump-cut style that keeps Shorts viewers watching. Run Face retouch or face stickers first to centre on your face.</div>
      <div className="chips">
        {([['subtle', 'Subtle'], ['punchy', 'Punchy'], ['crazy', 'Crazy']] as const).map(([id, n]) => (
          <button key={id} className={'chip' + (style === id ? ' on' : '')} onClick={() => setStyle(id)}>{n}</button>
        ))}
      </div>
      <button
        className="btn full"
        disabled={!!busy}
        onClick={async () => {
          setBusy('Listening…')
          try {
            toast(await autoZoom(style, setBusy))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || '🎯 Add punch-in zooms'}
      </button>
    </>
  )
}

export function AutoSfxSection() {
  const [o, setO] = useState<SfxOpts>({ cuts: true, words: true, amount: 'normal' })
  return (
    <>
      <div className="hint">Whooshes on your cuts, and sounds on key words – “wow”, “paisa”, “boom”, numbers, “finally”… (uses your captions to know the words).</div>
      <label className="ochk"><input type="checkbox" checked={o.cuts} onChange={(e) => setO({ ...o, cuts: e.target.checked })} /> Whoosh on cuts</label>
      <label className="ochk"><input type="checkbox" checked={o.words} onChange={(e) => setO({ ...o, words: e.target.checked })} /> Sounds on key words</label>
      <div className="chips">
        {(['few', 'normal', 'lots'] as const).map((a) => (
          <button key={a} className={'chip' + (o.amount === a ? ' on' : '')} onClick={() => setO({ ...o, amount: a })}>{a === 'few' ? 'A few' : a === 'normal' ? 'Normal' : 'Lots'}</button>
        ))}
      </div>
      <button className="btn full" disabled={!o.cuts && !o.words} onClick={() => { try { toast(autoSfx(o)) } catch (e) { toast((e as Error).message) } }}>🔊 Add sound effects</button>
    </>
  )
}

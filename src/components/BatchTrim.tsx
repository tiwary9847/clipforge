import { useMemo, useRef, useState } from 'react'
import { addAssetClip, getAsset, getState, setUi, useStore } from '../store'
import { engine } from '../engine'
import { importFiles } from './MediaPanel'
import { allCut, allMax, allQuiet, apply, begin, fullLen, mainClips, MIN_LEN, Range, rangeOf } from '../batchtrim'
import type { Clip } from '../types'

const fmt = (s: number) => (s < 60 ? s.toFixed(1) + 's' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const toast = (m: string) => setUi({ toast: m })

/** Add picked files to the end of the main track, in the order chosen. */
export async function addToMain(files: FileList | File[]) {
  const before = new Set(getState().assets.map((a) => a.id))
  await importFiles(files, toast)
  const fresh = getState().assets.filter((a) => !before.has(a.id) && a.kind !== 'audio')
  for (const a of fresh) {
    const end = mainClips().reduce((m, c) => Math.max(m, c.start + c.dur), 0)
    addAssetClip(a.id, 'v1', end)
  }
  setTimeout(() => engine.render(), 50)
  return fresh.length
}

function Row({ c, n }: { c: Clip; n: number }) {
  const full = fullLen(c)
  const r = rangeOf(c)
  const a = getAsset(c.assetId)
  const video = c.kind === 'video'
  const set = (next: Range, which: 'a' | 'b') => {
    apply({ [c.id]: next })
    const now = mainClips().find((x) => x.id === c.id)
    if (now) engine.seek(which === 'a' ? now.start : Math.max(now.start, now.start + now.dur - 0.05))
    engine.render()
  }
  const pct = (v: number) => (v / full) * 100
  return (
    <div className="bt-row">
      <button className="bt-thumb" onClick={() => { engine.seek(c.start); engine.play() }} aria-label={`Play clip ${n}`} title="Play this clip">
        {a?.thumb ? <img src={a.thumb} alt="" /> : <span>{n}</span>}
        <i>▶</i>
      </button>
      <div className="bt-main">
        <div className="bt-top"><b>{n}. {c.label || a?.name || 'Clip'}</b><span>{fmt(c.dur)}{video ? ` of ${fmt(full / c.speed)}` : ''}</span></div>
        <div className="bt-range" style={{ ['--a' as any]: pct(r.a) + '%', ['--b' as any]: pct(r.b) + '%' }}>
          {video && (
            <input type="range" min={0} max={full} step={0.05} value={r.a} aria-label={`Clip ${n} start`}
              onPointerDown={begin} onKeyDown={(e) => e.key.startsWith('Arrow') && !e.repeat && begin()}
              onChange={(e) => set({ a: Math.min(+e.target.value, r.b - MIN_LEN), b: r.b }, 'a')} />
          )}
          <input type="range" min={0} max={full} step={0.05} value={r.b} aria-label={`Clip ${n} end`}
            onPointerDown={begin} onKeyDown={(e) => e.key.startsWith('Arrow') && !e.repeat && begin()}
            onChange={(e) => set({ a: r.a, b: Math.max(+e.target.value, r.a + MIN_LEN) }, 'b')} />
        </div>
      </div>
    </div>
  )
}

export function BatchTrim() {
  const all0 = useStore((s) => s.project.clips)
  const clips = useMemo(() => all0.filter((c) => c.track === 'v1' && !c.freeze).sort((x, y) => x.start - y.start), [all0])
  const len = clips.reduce((s, c) => s + c.dur, 0)
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const all = (o: Record<string, Range>, done: string, none: string) => {
    if (!Object.keys(o).length) return toast(none)
    begin()
    apply(o)
    engine.render()
    toast(done)
  }
  return (
    <div className="bt">
      <div className="hint">Set where each clip starts and ends, all in one list. Clips stay in order and text or stickers over a clip move with it. Undo puts it back.</div>
      <button className="btn full" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Adding…' : clips.length ? '＋ Add more videos' : '＋ Pick videos to trim'}</button>
      <input ref={file} type="file" hidden multiple accept="video/*,image/*" onChange={async (e) => {
        const f = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (!f.length) return
        setBusy(true)
        const n = await addToMain(f)
        setBusy(false)
        if (n) toast(`${n} clip${n > 1 ? 's' : ''} added – drag the handles to trim`)
      }} />
      {clips.length > 0 && (
        <>
          <div className="group-h">Apply to all {clips.length} clips</div>
          <div className="chips">
            <button className="chip" onClick={() => all(allQuiet(), 'Cut the silent start and end of every clip', 'No silent ends found (or the clips are still loading their sound)')}>🔇 Cut silent ends</button>
            <button className="chip" onClick={() => all(allCut(0.5, 0.5), 'Cut ½ s from both ends of every video', 'Clips are too short to cut more')}>✂ ½ s off both ends</button>
            {[3, 5, 10].map((s) => (
              <button key={s} className="chip" onClick={() => all(allMax(s), `Every clip is now ${s} s or shorter`, `All clips are already ${s} s or shorter`)}>Max {s}s</button>
            ))}
          </div>
          <div className="bt-list">
            {clips.map((c, i) => <Row key={c.id} c={c} n={i + 1} />)}
          </div>
          <div className="hint">Total: <b>{fmt(len)}</b></div>
        </>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { engine } from '../engine'
import { getAsset, setProject, setUi, useStore } from '../store'
import { FILLERS_EN, FILLERS_EXTRA, cutRanges, fillerIndices, pauseRanges, timelineTime, transcribeAsset, wordRange } from '../textedit'
import { LANGS, MODELS } from './MediaPanel'

export function TextEditDialog({ onClose }: { onClose: () => void }) {
  const clips = useStore((s) => s.project.clips)
  const transcripts = useStore((s) => s.project.transcripts)
  const selId = useStore((s) => s.selectedId)
  const assetIds = useMemo(() => [...new Set(clips.filter((c) => (c.kind === 'video' || c.kind === 'audio') && c.assetId && !c.freeze).map((c) => c.assetId!))], [clips])
  const sel = clips.find((c) => c.id === selId && (c.kind === 'video' || c.kind === 'audio'))
  const [assetId, setAssetId] = useState<string>(sel?.assetId ?? assetIds[0] ?? '')
  const words = (assetId && transcripts?.[assetId]) || null
  const [model, setModel] = useState(MODELS[1].id)
  const [lang, setLang] = useState('auto')
  const [roman, setRoman] = useState(true)
  const [busy, setBusy] = useState('')
  const [pct, setPct] = useState<number | undefined>()
  const [msg, setMsg] = useState('')
  const [range, setRange] = useState<[number, number] | null>(null)
  const [extra, setExtra] = useState<string[]>([])
  const [pause, setPause] = useState(0.8)
  const [now, setNow] = useState(-1)
  const drag = useRef<number | null>(null)
  const sig = useRef({ cancelled: false })

  // which words are still in the edit
  const kept = useMemo(() => (words ? words.map((w) => timelineTime(assetId, (w.start + w.end) / 2) !== null) : []), [words, clips, assetId])
  const fillers = useMemo(() => (words ? fillerIndices(words, [...FILLERS_EN, ...extra]).filter((i) => kept[i]) : []), [words, extra, kept])
  const fillerSet = useMemo(() => new Set(fillers), [fillers])
  const pauses = useMemo(() => (words ? pauseRanges(words, pause).filter(([a, b]) => timelineTime(assetId, (a + b) / 2) !== null) : []), [words, pause, clips, assetId])

  useEffect(() => {
    if (!words) return
    return engine.onTick((t) => {
      let k = -1
      for (let i = 0; i < words.length; i++) {
        const tt = timelineTime(assetId, words[i].start + 0.01)
        if (tt !== null && tt <= t + 0.02) {
          const te = timelineTime(assetId, Math.max(words[i].start + 0.01, words[i].end - 0.01))
          if (te !== null && t <= te + 0.15) k = i
        }
      }
      setNow(k)
    })
  }, [words, assetId, clips])

  const cutSel = () => {
    if (!words || !range) return
    const [i, j] = range[0] <= range[1] ? range : [range[1], range[0]]
    const s = cutRanges(assetId, [wordRange(words, i, j)])
    setRange(null)
    setMsg(s ? `Cut ${j - i + 1} word${j > i ? 's' : ''} (${s.toFixed(1)}s). Ctrl+Z to undo.` : 'Those words are already cut.')
    engine.requestRender()
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && range && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        cutSel()
      } else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })

  const run = async () => {
    const c = clips.find((x) => x.assetId === assetId && (x.kind === 'video' || x.kind === 'audio'))
    if (!c) return
    sig.current = { cancelled: false }
    setBusy('Starting…')
    setMsg('')
    try {
      const n = await transcribeAsset(c.id, { model, language: lang, gpu: false, roman }, (m, p) => { setBusy(m); setPct(p) }, sig.current)
      setMsg(`${n} words. Click a word to jump there, drag across words to select, then press Delete.`)
    } catch (e) {
      setMsg((e as Error).message)
    }
    setBusy('')
    setPct(undefined)
  }

  const inSel = (i: number) => range && i >= Math.min(...range) && i <= Math.max(...range)
  const removedSecs = words ? words.reduce((s, w, i) => s + (kept[i] ? 0 : w.end - w.start), 0) : 0

  return (
    <div className="modal-bg" onClick={() => !busy && onClose()}>
      <div className="modal ae te" onClick={(e) => e.stopPropagation()}>
        <div className="ae-h">
          <b>📝 Edit by text</b>
          <span>Delete words in the transcript and the video is cut to match.</span>
          <button className="ico" onClick={onClose} disabled={!!busy}>✕</button>
        </div>
        <div className="ae-body">
          {!assetIds.length ? (
            <div className="hint">Add a video with speech to the timeline first.</div>
          ) : (
            <>
              {assetIds.length > 1 && (
                <select className="full" value={assetId} onChange={(e) => { setAssetId(e.target.value); setRange(null) }}>
                  {assetIds.map((id) => <option key={id} value={id}>{getAsset(id)?.name ?? id}{transcripts?.[id] ? ' ✓' : ''}</option>)}
                </select>
              )}
              {!words || busy ? (
                <div className="te-setup">
                  <div className="hint">First the speech is turned into text on your device (the speech model downloads once and is cached).</div>
                  <div className="ae-grid">
                    <label>Accuracy<select value={model} onChange={(e) => setModel(e.target.value)} disabled={!!busy}>{MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                    <label>Language<select value={lang} onChange={(e) => setLang(e.target.value)} disabled={!!busy}>{LANGS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
                  </div>
                  <label className="ochk"><input type="checkbox" checked={roman} onChange={(e) => setRoman(e.target.checked)} /> Show Hindi in English letters (Hinglish)</label>
                  <button className="btn primary full" disabled={!!busy} onClick={run}>{busy ? `${busy}${pct !== undefined ? ' ' + Math.round(pct) + '%' : ''}` : '📝 Transcribe'}</button>
                  {busy && <button className="lnk" onClick={() => (sig.current.cancelled = true)}>cancel</button>}
                </div>
              ) : (
                <>
                  <div className="te-tools">
                    <button className="btn sm primary" disabled={!range} onClick={cutSel}>✂ Cut selected (Del)</button>
                    <button
                      className="btn sm"
                      disabled={!fillers.length}
                      onClick={() => {
                        const s = cutRanges(assetId, fillers.map((i) => wordRange(words, i, i)))
                        setMsg(`Removed ${fillers.length} filler word${fillers.length > 1 ? 's' : ''} (${s.toFixed(1)}s).`)
                      }}
                    >
                      🧹 Remove {fillers.length} filler{fillers.length === 1 ? '' : 's'}
                    </button>
                    <button
                      className="btn sm"
                      disabled={!pauses.length}
                      onClick={() => {
                        const s = cutRanges(assetId, pauses)
                        setMsg(`Shortened ${pauses.length} pause${pauses.length > 1 ? 's' : ''} (${s.toFixed(1)}s saved).`)
                      }}
                    >
                      ⏩ Tighten {pauses.length} pause{pauses.length === 1 ? '' : 's'}
                    </button>
                    <label className="te-pause">longer than <input type="number" min={0.3} max={5} step={0.1} value={pause} onChange={(e) => setPause(Math.max(0.3, +e.target.value))} />s</label>
                    <button className="lnk" onClick={() => setProjectTranscript(assetId)}>re-transcribe</button>
                  </div>
                  <div className="chips">
                    <span className="hint" style={{ alignSelf: 'center' }}>Also count as fillers:</span>
                    {FILLERS_EXTRA.map((f) => (
                      <button key={f} className={'chip' + (extra.includes(f) ? ' on' : '')} onClick={() => setExtra(extra.includes(f) ? extra.filter((x) => x !== f) : [...extra, f])}>{f}</button>
                    ))}
                  </div>
                  <div className="te-words" onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)}>
                    {words.map((w, i) => (
                      <span
                        key={i}
                        className={'tw' + (kept[i] ? '' : ' cut') + (inSel(i) ? ' sel' : '') + (fillerSet.has(i) ? ' fill' : '') + (i === now ? ' now' : '')}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          if (e.shiftKey && range) setRange([range[0], i])
                          else {
                            drag.current = i
                            setRange([i, i])
                          }
                        }}
                        onMouseEnter={() => drag.current !== null && setRange([drag.current, i])}
                        onClick={() => {
                          const t = timelineTime(assetId, w.start + 0.01)
                          if (t !== null && range && range[0] === range[1]) engine.seek(t)
                        }}
                        title={`${w.start.toFixed(2)}s${kept[i] ? '' : ' – cut'}`}
                      >
                        {w.text}{' '}
                      </span>
                    ))}
                  </div>
                  <div className="hint">
                    {kept.filter((k) => !k).length} words cut ({removedSecs.toFixed(1)}s of speech). Grey words are already cut – use Ctrl+Z to bring them back. Captions, stickers and music on other tracks don’t move with the cuts, so do text cuts first.
                  </div>
                </>
              )}
              {msg && <div className="hint">{msg}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )

  function setProjectTranscript(id: string) {
    const t = { ...(transcripts ?? {}) }
    delete t[id]
    setProject({ transcripts: t })
    setUi({ toast: 'Transcript cleared – transcribe again.' })
  }
}

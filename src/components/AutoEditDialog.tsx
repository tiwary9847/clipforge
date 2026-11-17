import { useEffect, useRef, useState } from 'react'
import { AutoItem, AutoOptions, AutoStyle, STYLES, autoEdit } from '../autoedit'
import { engine } from '../engine'
import { setUi, useStore } from '../store'
import { PRESETS } from '../types'
import { importFiles } from './MediaPanel'

export function AutoEditDialog({ onClose }: { onClose: () => void }) {
  const assets = useStore((s) => s.assets)
  const hasClips = useStore((s) => s.project.clips.length > 0)
  const [seq, setSeq] = useState<AutoItem[]>([])
  const seen = useRef<Set<string>>(new Set())
  const [style, setStyle] = useState<AutoStyle>('funny')
  const [presetId, setPresetId] = useState('shorts')
  const [totalSec, setTotalSec] = useState(0)
  const [memes, setMemes] = useState<AutoOptions['memes']>('normal')
  const [transitions, setTransitions] = useState(true)
  const [whoosh, setWhoosh] = useState(true)
  const [trimDeadAir, setTrim] = useState(true)
  const [intro, setIntro] = useState('')
  const [outro, setOutro] = useState('FOLLOW FOR MORE')
  const [musicId, setMusic] = useState('')
  const [beatSync, setBeat] = useState(true)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState({ msg: '', f: 0 })
  const [err, setErr] = useState('')
  const [uploading, setUploading] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // every new picture/video in the library joins the sequence (in the order it was added)
  useEffect(() => {
    const add: AutoItem[] = []
    for (const a of assets) {
      if (seen.current.has(a.id)) continue
      seen.current.add(a.id)
      if (a.kind !== 'audio') add.push({ assetId: a.id, caption: '' })
    }
    if (add.length) setSeq((s) => [...s, ...add])
  }, [assets])

  const musicAssets = assets.filter((a) => a.kind === 'audio')
  const move = (i: number, d: number) =>
    setSeq((s) => {
      const j = i + d
      if (j < 0 || j >= s.length) return s
      const n = [...s]
      ;[n[i], n[j]] = [n[j], n[i]]
      return n
    })
  const inLib = assets.filter((a) => a.kind !== 'audio' && !seq.some((x) => x.assetId === a.id))

  async function go() {
    setErr('')
    setBusy(true)
    try {
      engine.pause?.()
      const msg = await autoEdit(
        { items: seq, style, presetId, totalSec, memes, transitions, whoosh, trimDeadAir, intro, outro, musicId, beatSync },
        (m, f) => setProg({ msg: m, f }),
      )
      setUi({ toast: msg })
      setTimeout(() => engine.render(), 0)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg" onClick={() => !busy && onClose()}>
      <div className="modal ae" onClick={(e) => e.stopPropagation()}>
        <div className="ae-h">
          <b>✨ Auto-edit</b>
          <span>Drop your clips, put them in order, pick a style – we cut, colour, add memes with sound, titles and music.</span>
          <button className="ico" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <div className="ae-body">
          <h4>1 · Your clips, in order</h4>
          <div className="ae-seq">
            {seq.map((it, i) => {
              const a = assets.find((x) => x.id === it.assetId)
              if (!a) return null
              return (
                <div key={it.assetId} className="ae-row">
                  <span className="n">{i + 1}</span>
                  {a.thumb ? <img src={a.thumb} alt="" /> : <span className="ph">🎞</span>}
                  <div className="nm">
                    <b title={a.name}>{a.name}</b>
                    <small>{a.kind === 'image' ? 'photo' : a.duration.toFixed(1) + 's'}</small>
                  </div>
                  <input
                    placeholder="Caption for this clip (optional)"
                    value={it.caption}
                    onChange={(e) => setSeq((s) => s.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))}
                  />
                  <button className="ico" onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button className="ico" onClick={() => move(i, 1)} disabled={i === seq.length - 1} title="Move down">↓</button>
                  <button className="ico" onClick={() => setSeq((s) => s.filter((_, k) => k !== i))} title="Remove from edit">✕</button>
                </div>
              )
            })}
            {!seq.length && <div className="hint">No clips yet – upload some below.</div>}
          </div>
          <div className="ae-add">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              ＋ Upload videos / photos{uploading ? ` (${uploading}…)` : ''}
            </button>
            {inLib.map((a) => (
              <button key={a.id} className="btn sm" onClick={() => setSeq((s) => [...s, { assetId: a.id, caption: '' }])} title="Add back to the sequence">
                ＋ {a.name.slice(0, 18)}
              </button>
            ))}
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="video/*,image/*"
              onChange={async (e) => {
                const f = e.target.files
                if (!f) return
                setUploading(f.length)
                await importFiles(f, (m) => setUi({ toast: m }))
                setUploading(0)
                e.target.value = ''
              }}
            />
          </div>

          <h4>2 · Style</h4>
          <div className="ae-styles">
            {(Object.keys(STYLES) as AutoStyle[]).map((k) => (
              <button key={k} className={'ae-style' + (style === k ? ' on' : '')} onClick={() => setStyle(k)}>
                <span className="em">{STYLES[k].emoji}</span>
                <b>{STYLES[k].name}</b>
                <small>{STYLES[k].desc}</small>
              </button>
            ))}
          </div>

          <h4>3 · Details</h4>
          <div className="ae-grid">
            <label>
              Format
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label>
              Total length
              <select value={totalSec} onChange={(e) => setTotalSec(+e.target.value)}>
                <option value={0}>Automatic (best moments)</option>
                <option value={15}>About 15 s</option>
                <option value={30}>About 30 s</option>
                <option value={45}>About 45 s</option>
                <option value={59}>About 59 s (Shorts / Reels max)</option>
                <option value={90}>About 90 s</option>
              </select>
            </label>
            <label>
              Memes with sound
              <select value={memes} onChange={(e) => setMemes(e.target.value as AutoOptions['memes'])}>
                <option value="none">None</option>
                <option value="few">A few</option>
                <option value="normal">Normal</option>
                <option value="lots">Lots 🤪</option>
              </select>
            </label>
            <label>
              Background music
              <select value={musicId} onChange={(e) => setMusic(e.target.value)}>
                <option value="">None</option>
                {musicAssets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
            <label>
              Opening title (optional)
              <input value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="e.g. WAIT FOR IT…" />
            </label>
            <label>
              Ending text (optional)
              <input value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="e.g. FOLLOW FOR MORE" />
            </label>
          </div>
          <div className="ae-checks">
            <label><input type="checkbox" checked={transitions} onChange={(e) => setTransitions(e.target.checked)} /> Transitions</label>
            <label><input type="checkbox" checked={whoosh} onChange={(e) => setWhoosh(e.target.checked)} disabled={!transitions} /> Whoosh sound on cuts</label>
            <label><input type="checkbox" checked={trimDeadAir} onChange={(e) => setTrim(e.target.checked)} /> Cut dead air at the start</label>
            <label><input type="checkbox" checked={beatSync} onChange={(e) => setBeat(e.target.checked)} disabled={!musicId} /> Cut on the music beat</label>
          </div>
          <div className="hint">
            Upload music in the Audio tab first if you want it here. Auto-edit picks the liveliest part of each clip, so long clips get shortened.
            {hasClips && ' It replaces your current timeline – Undo (Ctrl+Z) brings it back.'}
          </div>
          {err && <div className="ae-err">⚠ {err}</div>}
        </div>
        <div className="ae-foot">
          {busy ? (
            <div className="ae-prog">
              <div className="bar"><i style={{ width: Math.round(prog.f * 100) + '%' }} /></div>
              <small>{prog.msg}</small>
            </div>
          ) : (
            <>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={!seq.length || !!uploading} onClick={go}>
                ✨ Auto-edit {seq.length || ''} clip{seq.length === 1 ? '' : 's'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

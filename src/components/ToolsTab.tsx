import { useEffect, useRef, useState } from 'react'
import { engine } from '../engine'
import { fastExport, fastExportSupport } from '../fastExport'
import { addAsset, addAssetClip, getClip, getPreset, getState, patchText, projectDuration, setProject, setUi, useStore } from '../store'
import { startVoiceover } from '../processing'
import { PRESETS } from '../types'
import { TextEditDialog } from './TextEditDialog'
import { RecMode, Recording, canRecordCamera, canRecordScreen, startRecording } from '../recorder'
import { createMulticam, cutToAngle, endMulticam } from '../multicam'
import { VOICES, measureLoudness, normaliseLoudness, speak } from '../pro'
import { Brand, Hook, addHook, addLogo, exportBackup, findHook, grabFrame, importBackup, loadBrand, renderThumb, saveBrand } from '../tools2'

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
const safeName = () => getState().projectName.replace(/[^\w\- ]+/g, '').trim() || 'clipforge'

export function ToolsTab() {
  const [dlg, setDlg] = useState<'' | 'thumb' | 'prompter' | 'text' | 'rec'>('')
  return (
    <>
      <div className="tmpls two" style={{ marginTop: 0 }}>
        <button className="tmpl" onClick={() => setDlg('text')}>
          <span className="em">📝</span>
          <b>Edit by text</b>
          <small>Delete words to cut · remove “um/uh” & pauses</small>
        </button>
        <button className="tmpl" onClick={() => setDlg('rec')}>
          <span className="em">⏺</span>
          <b>Record</b>
          <small>Screen, webcam or both (face bubble)</small>
        </button>
      </div>
      <div className="group-h">💬 WhatsApp status</div>
      <WhatsAppSplit />
      <div className="group-h">🎥 Multicam</div>
      <Multicam />
      <div className="group-h">🗣 AI voice (text-to-speech)</div>
      <AiVoice />
      <div className="group-h">📏 Loudness</div>
      <Loudness />
      <div className="group-h">🪝 Hook finder</div>
      <HookFinder />
      <div className="group-h">🖼 Thumbnail & teleprompter</div>
      <div className="tmpls two">
        <button className="tmpl" onClick={() => setDlg('thumb')}>
          <span className="em">🖼</span>
          <b>Thumbnail maker</b>
          <small>Big-text YouTube thumbnail from any frame</small>
        </button>
        <button className="tmpl" onClick={() => setDlg('prompter')}>
          <span className="em">📜</span>
          <b>Teleprompter</b>
          <small>Scrolling script + record your voice</small>
        </button>
      </div>
      <div className="group-h">🎨 Brand kit</div>
      <BrandKit />
      <div className="group-h">📦 All formats at once</div>
      <MultiExport />
      <div className="group-h">💾 Backup & restore</div>
      <Backup />
      {dlg === 'thumb' && <ThumbDialog onClose={() => setDlg('')} />}
      {dlg === 'prompter' && <Teleprompter onClose={() => setDlg('')} />}
      {dlg === 'text' && <TextEditDialog onClose={() => setDlg('')} />}
      {dlg === 'rec' && <RecordDialog onClose={() => setDlg('')} />}
    </>
  )
}

function HookFinder() {
  const [len, setLen] = useState(3)
  const [text, setText] = useState('WAIT FOR IT…')
  const [hook, setHook] = useState<Hook | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <>
      <div className="hint">Finds the most exciting few seconds of your video and copies them to the very start as a hook – the first 3 seconds decide if people keep watching.</div>
      <label className="row">
        <span className="lbl">Hook length</span>
        <input type="range" min={2} max={5} step={0.5} value={len} onChange={(e) => { setLen(+e.target.value); setHook(null) }} />
        <span className="val">{len}s</span>
      </label>
      <input className="full" value={text} onChange={(e) => setText(e.target.value)} placeholder="Hook text (optional)" />
      {!hook ? (
        <button
          className="btn full"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setMsg('')
            try {
              setHook(await findHook(len))
            } catch (e) {
              setMsg((e as Error).message)
            }
            setBusy(false)
          }}
        >
          {busy ? 'Listening…' : 'Find my hook'}
        </button>
      ) : (
        <>
          <div className="hint">Best moment: <b>{hook.srcStart.toFixed(1)}s</b> into the source video.</div>
          <button
            className="btn primary full"
            onClick={() => {
              addHook(hook, text)
              setHook(null)
              setMsg('Hook added at the start (Undo to remove).')
              setTimeout(() => engine.render(), 0)
            }}
          >
            ＋ Add as opening hook
          </button>
        </>
      )}
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

function BrandKit() {
  const [b, setB] = useState<Brand>(loadBrand)
  const [msg, setMsg] = useState('')
  const up = (p: Partial<Brand>) => {
    const n = { ...b, ...p }
    setB(n)
    saveBrand(n)
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const sel = useStore((s) => s.selectedId)
  return (
    <>
      <div className="hint">Save your channel look once, then apply it to any video.</div>
      <input className="full" placeholder="Channel name / @handle" value={b.name} onChange={(e) => up({ name: e.target.value })} />
      <div className="row2">
        <label>Main colour <input type="color" value={b.color} onChange={(e) => up({ color: e.target.value })} /></label>
        <label>Accent <input type="color" value={b.color2} onChange={(e) => up({ color2: e.target.value })} /></label>
      </div>
      <input className="full" placeholder="Call to action (ending text)" value={b.cta} onChange={(e) => up({ cta: e.target.value })} />
      <div className="row2">
        {b.logo && <img src={b.logo} alt="logo" style={{ height: 34, borderRadius: 6, background: '#000' }} />}
        <button className="btn sm" onClick={() => fileRef.current?.click()}>{b.logo ? 'Change logo' : 'Upload logo'}</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const r = new FileReader()
            r.onload = () => up({ logo: String(r.result) })
            r.readAsDataURL(f)
            e.target.value = ''
          }}
        />
      </div>
      <div className="chips">
        <button className="chip" disabled={!b.logo} onClick={async () => { try { setMsg(await addLogo(b)) } catch (e) { setMsg((e as Error).message) } }}>Add logo watermark</button>
        <button
          className="chip"
          disabled={!sel}
          onClick={() => {
            const c = getClip(getState().selectedId)
            if (c?.kind === 'text') {
              patchText(c.id, { color: b.color2, stroke: b.color })
              setMsg('Brand colours applied to the selected text.')
            } else setMsg('Select a text clip on the timeline first.')
          }}
        >
          Colours → selected text
        </button>
        <button
          className="chip"
          onClick={() => {
            // handled by the store-level helper below
            addBrandOutro(b)
            setMsg('Branded ending card added.')
          }}
        >
          Add branded ending
        </button>
      </div>
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

import { addClipsBatch, baseClip } from '../store'
import { TEXT_PRESETS } from '../library'
function addBrandOutro(b: Brand) {
  const total = Math.max(3, projectDuration())
  const p = TEXT_PRESETS.find((x) => x.id === 'title') ?? TEXT_PRESETS[0]
  const d = 2.5
  addClipsBatch([
    baseClip('text', 'v4', { label: b.cta.slice(0, 40), start: Math.max(0, total - d), dur: d, y: 0.45, text: { ...p.props, text: b.cta || 'FOLLOW', color: b.color2, stroke: b.color, anim: 'pop', animDur: 0.7 }, transIn: { type: 'fade', dur: 0.15 } }),
    ...(b.name ? [baseClip('text', 'v3', { label: b.name.slice(0, 40), start: Math.max(0, total - d), dur: d, y: 0.58, text: { ...p.props, text: b.name, size: (p.props.size ?? 0.08) * 0.6, color: '#ffffff', stroke: b.color }, transIn: { type: 'fade', dur: 0.15 } })] : []),
  ])
}

function MultiExport() {
  const [sel, setSel] = useState<Record<string, boolean>>({ shorts: true, yt: true, square: false })
  const [ok, setOk] = useState<{ ok: boolean; reason?: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { void fastExportSupport().then(setOk) }, [])
  const dur = projectDuration()
  return (
    <>
      <div className="hint">Export the same edit as Shorts/Reels (9:16), YouTube (16:9) and more in one go. Files download one after another.</div>
      {PRESETS.filter((p) => ['shorts', 'yt', 'square', 'igportrait', 'fbvideo'].includes(p.id)).map((p) => (
        <label key={p.id} className="ochk">
          <input type="checkbox" checked={!!sel[p.id]} onChange={(e) => setSel({ ...sel, [p.id]: e.target.checked })} /> {p.label}
        </label>
      ))}
      <button
        className="btn primary full"
        disabled={!!busy || dur <= 0 || !ok?.ok || !Object.values(sel).some(Boolean)}
        onClick={async () => {
          const keep = getPreset().id
          setMsg('')
          try {
            for (const p of PRESETS.filter((x) => sel[x.id])) {
              setBusy(p.label)
              setProject({ presetId: p.id })
              await new Promise((r) => setTimeout(r, 120))
              const out = await fastExport(() => {}, { cancelled: false })
              if (out) download(out.blob, `${safeName()}-${p.id}.${out.ext}`)
            }
            setMsg('All exports finished.')
          } catch (e) {
            setMsg((e as Error).message)
          }
          setProject({ presetId: keep })
          setTimeout(() => engine.render(), 0)
          setBusy('')
        }}
      >
        {busy ? `Exporting ${busy}…` : dur <= 0 ? 'Add a clip first' : ok && !ok.ok ? 'Not supported in this browser' : 'Export selected formats'}
      </button>
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

function Backup() {
  const [msg, setMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <div className="hint">Your project saves automatically in this browser. Use a backup file to move it to another computer or keep a safe copy (includes all your media).</div>
      <div className="chips">
        <button
          className="chip"
          onClick={async () => {
            try {
              download(await exportBackup(), `${safeName()}.clipforge`)
              setMsg('Backup downloaded.')
            } catch (e) {
              setMsg((e as Error).message)
            }
          }}
        >
          ⬇ Save backup file
        </button>
        <button className="chip" onClick={() => fileRef.current?.click()}>⬆ Open backup file</button>
        <input
          ref={fileRef}
          type="file"
          accept=".clipforge"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              setMsg(await importBackup(f))
            } catch (x) {
              setMsg((x as Error).message)
            }
            e.target.value = ''
          }}
        />
      </div>
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

/* ---------- thumbnail maker ---------- */

function ThumbDialog({ onClose }: { onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLCanvasElement | null>(grabFrame())
  const [o, setO] = useState({ text: getState().projectName.toUpperCase().slice(0, 30), emoji: '😱', color: '#ffe500', stroke: '#000000', pos: 'bottom' as 'top' | 'center' | 'bottom', size: 130, fit: 'fill' as 'fill' | 'blur', vignette: true })
  const [hasFrame, setHasFrame] = useState(!!frame.current)
  useEffect(() => {
    if (cv.current) renderThumb(cv.current, { ...o, frame: frame.current })
  }, [o, hasFrame])
  const blob = () => new Promise<Blob>((res) => cv.current!.toBlob((b) => res(b!), 'image/png'))
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal ae" onClick={(e) => e.stopPropagation()}>
        <div className="ae-h">
          <b>🖼 Thumbnail maker</b>
          <span>Move the playhead to your best frame, grab it, add big text.</span>
          <button className="ico" onClick={onClose}>✕</button>
        </div>
        <div className="ae-body">
          <canvas ref={cv} className="thumb-cv" />
          <div className="ae-grid">
            <label>Text<input value={o.text} onChange={(e) => setO({ ...o, text: e.target.value })} /></label>
            <label>Emoji<input value={o.emoji} onChange={(e) => setO({ ...o, emoji: e.target.value })} /></label>
            <label>Text size<input type="range" min={60} max={220} value={o.size} onChange={(e) => setO({ ...o, size: +e.target.value })} /></label>
            <label>Position
              <select value={o.pos} onChange={(e) => setO({ ...o, pos: e.target.value as 'top' | 'center' | 'bottom' })}>
                <option value="top">Top</option><option value="center">Middle</option><option value="bottom">Bottom</option>
              </select>
            </label>
            <label>Text colour<input type="color" value={o.color} onChange={(e) => setO({ ...o, color: e.target.value })} /></label>
            <label>Outline<input type="color" value={o.stroke} onChange={(e) => setO({ ...o, stroke: e.target.value })} /></label>
            <label>Picture
              <select value={o.fit} onChange={(e) => setO({ ...o, fit: e.target.value as 'fill' | 'blur' })}>
                <option value="fill">Fill (crop)</option><option value="blur">Fit on blurred background</option>
              </select>
            </label>
            <label className="ochk"><input type="checkbox" checked={o.vignette} onChange={(e) => setO({ ...o, vignette: e.target.checked })} /> Dark edges</label>
          </div>
        </div>
        <div className="ae-foot">
          <button className="btn" onClick={() => { frame.current = grabFrame(); setHasFrame(!!frame.current); setO({ ...o }) }}>📷 Grab frame at playhead</button>
          <button
            className="btn"
            onClick={async () => {
              const f = new File([await blob()], `${safeName()}-thumbnail.png`, { type: 'image/png' })
              const a = await engine.importFile(f)
              if (a) {
                addAsset(a)
                addAssetClip(a.id, 'v2', 0)
                setUi({ toast: 'Thumbnail added to the media library and timeline.' })
              }
            }}
          >
            ＋ Add to project
          </button>
          <button className="btn primary" onClick={async () => download(await blob(), `${safeName()}-thumbnail.png`)}>⬇ Download PNG</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- teleprompter ---------- */

function Teleprompter({ onClose }: { onClose: () => void }) {
  const [script, setScript] = useState('')
  const [speed, setSpeed] = useState(60)
  const [size, setSize] = useState(44)
  const [mirror, setMirror] = useState(false)
  const [phase, setPhase] = useState<'edit' | 'count' | 'run'>('edit')
  const [count, setCount] = useState(3)
  const [record, setRecord] = useState(true)
  const [msg, setMsg] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const rec = useRef<Awaited<ReturnType<typeof startVoiceover>> | null>(null)
  const raf = useRef(0)
  const pos = useRef(0)

  const begin = async () => {
    setMsg('')
    if (record) {
      try {
        rec.current = await startVoiceover()
      } catch (e) {
        setMsg((e as Error).message || 'Microphone blocked.')
        return
      }
    }
    setPhase('count')
    for (let i = 3; i > 0; i--) {
      setCount(i)
      await new Promise((r) => setTimeout(r, 1000))
    }
    pos.current = 0
    setPhase('run')
    let last = performance.now()
    const tick = (t: number) => {
      pos.current += ((t - last) / 1000) * speedRef.current
      last = t
      if (box.current) {
        box.current.style.transform = `translateY(${-pos.current}px)`
        if (pos.current > box.current.scrollHeight + 200) return void stop()
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const speedRef = useRef(speed)
  speedRef.current = speed
  const stop = async () => {
    cancelAnimationFrame(raf.current)
    setPhase('edit')
    const r = rec.current
    rec.current = null
    if (r) {
      const f = await r.stop()
      if (f) {
        const a = await engine.importFile(f)
        if (a) {
          addAsset(a)
          addAssetClip(a.id, 'a1', Math.max(0, engine.time))
          setMsg('Your voice recording was added to the timeline.')
        }
      }
    }
  }
  useEffect(() => () => { cancelAnimationFrame(raf.current); rec.current?.cancel() }, [])

  if (phase !== 'edit')
    return (
      <div className="prompter" onClick={() => phase === 'run' && void stop()}>
        {phase === 'count' ? (
          <div className="count">{count}</div>
        ) : (
          <>
            <div className="p-mid">
              <div ref={box} className="p-text" style={{ fontSize: size, transform: `translateY(0px)`, scale: mirror ? '-1 1' : '1 1' }}>
                {script.split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}
              </div>
            </div>
            <div className="p-hint">Tap anywhere to stop{rec.current ? ' and save your voice' : ''}</div>
          </>
        )}
      </div>
    )

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal ae" onClick={(e) => e.stopPropagation()}>
        <div className="ae-h">
          <b>📜 Teleprompter</b>
          <span>Paste your script. It scrolls while you read and can record your voice.</span>
          <button className="ico" onClick={onClose}>✕</button>
        </div>
        <div className="ae-body">
          <textarea className="full" rows={9} placeholder="Paste your script here…" value={script} onChange={(e) => setScript(e.target.value)} />
          <div className="ae-grid">
            <label>Scroll speed ({speed})<input type="range" min={20} max={200} value={speed} onChange={(e) => setSpeed(+e.target.value)} /></label>
            <label>Text size ({size})<input type="range" min={28} max={90} value={size} onChange={(e) => setSize(+e.target.value)} /></label>
          </div>
          <div className="ae-checks">
            <label><input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} /> Record my voice at the same time</label>
            <label><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror text (for a glass teleprompter)</label>
          </div>
          {msg && <div className="hint">{msg}</div>}
        </div>
        <div className="ae-foot">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" disabled={!script.trim()} onClick={begin}>▶ Start (3-2-1)</button>
        </div>
      </div>
    </div>
  )
}

function AiVoice() {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(VOICES[0].id)
  const [busy, setBusy] = useState('')
  const [pct, setPct] = useState<number | undefined>()
  const [msg, setMsg] = useState('')
  const v = VOICES.find((x) => x.id === voice)!
  return (
    <>
      <div className="hint">Type a script and get a voice-over at the playhead. Runs on your device; the voice downloads once (~80 MB) and is cached.</div>
      <textarea className="full" rows={3} placeholder={voice.includes('hin') ? 'नमस्ते दोस्तों, आज हम…' : 'Hey guys, welcome back…'} value={text} onChange={(e) => setText(e.target.value)} />
      <select className="full" value={voice} onChange={(e) => setVoice(e.target.value)}>
        {VOICES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {!v.commercial && <div className="hint">⚠ This voice’s licence (CC BY-NC) doesn’t allow monetised videos. Type Hindi in देवनागरी for best results.</div>}
      <button
        className="btn primary full"
        disabled={!!busy || !text.trim()}
        onClick={async () => {
          setBusy('Starting…')
          setMsg('')
          try {
            setMsg(await speak(text, voice, (m, p) => { setBusy(m); setPct(p) }))
          } catch (e) {
            setMsg((e as Error).message)
          }
          setBusy('')
          setPct(undefined)
        }}
      >
        {busy ? `${busy}${pct !== undefined ? ' ' + Math.round(pct) + '%' : ''}` : '🗣 Generate voice'}
      </button>
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

function Loudness() {
  const db = useStore((s) => s.project.loudDb ?? 0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const go = async (target: number) => {
    setBusy(true)
    setMsg('')
    try {
      setMsg(await normaliseLoudness(target))
    } catch (e) {
      setMsg((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <>
      <div className="hint">Makes the whole video as loud as YouTube / Instagram expect, with a limiter so nothing distorts. {db ? `Current master: ${db > 0 ? '+' : ''}${db.toFixed(1)} dB.` : ''}</div>
      <div className="chips">
        <button className="chip" disabled={busy} onClick={() => go(-14)}>YouTube / Instagram (−14 LUFS)</button>
        <button className="chip" disabled={busy} onClick={() => go(-16)}>Podcast (−16)</button>
        <button
          className="chip"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const l = await measureLoudness().catch(() => null)
            setMsg(l === null ? 'No sound to measure.' : `Mix loudness: ${l.toFixed(1)} LUFS (before master gain).`)
            setBusy(false)
          }}
        >
          Measure
        </button>
        {db !== 0 && <button className="chip" onClick={() => setProject({ loudDb: 0 })}>Reset</button>}
      </div>
      {busy && <div className="hint">Measuring the mix…</div>}
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

function AngleView({ assetId, name, shift, start, idx, onPick, active }: { assetId: string; name: string; shift: number; start: number; idx: number; onPick: () => void; active: boolean }) {
  const v = useRef<HTMLVideoElement>(null)
  const a = useStore((s) => s.assets.find((x) => x.id === assetId))
  const [off, setOff] = useState(false)
  useEffect(() => {
    const el = v.current
    if (!el || !a) return
    const sync = (t: number, playing: boolean) => {
      const want = t - start - shift
      const out = want < 0 || want > a.duration
      setOff(out)
      if (out) {
        if (!el.paused) el.pause()
        return
      }
      if (playing) {
        if (el.paused) el.play().catch(() => {})
        if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want
      } else {
        if (!el.paused) el.pause()
        if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want
      }
    }
    sync(engine.time, false)
    return engine.onTick(sync)
  }, [a, shift, start])
  if (!a) return null
  return (
    <button className={'angle' + (active ? ' on' : '')} onClick={onPick} title={`Cut to ${name} (key ${idx + 1})`}>
      <video ref={v} src={a.proxyUrl ?? a.url} muted playsInline preload="auto" />
      <span>{idx + 1} · {name}{off ? ' (not recording)' : ''}</span>
    </button>
  )
}

function Multicam() {
  const mc = useStore((s) => s.project.multicam)
  const allAssets = useStore((s) => s.assets)
  const assets = allAssets.filter((a) => a.kind === 'video')
  const clips = useStore((s) => s.project.clips)
  const [, setT] = useState(0)
  useEffect(() => engine.onTick((t) => setT(Math.round(t * 5))), [])
  const [pick, setPick] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  if (mc) {
    const cur = clips.find((c) => c.mc && c.track === 'v1' && engine.time >= c.start && engine.time < c.start + c.dur)
    return (
      <>
        <div className="hint">Press ▶ and click an angle (or keys 1–{mc.angles.length}) to cut to it at the playhead. Sound stays from Cam 1. Cuts are normal clips – trim or undo them like any other.</div>
        <div className="angles">
          {mc.angles.map((g, i) => (
            <AngleView key={g.assetId + i} {...g} start={mc.start} idx={i} active={cur?.assetId === g.assetId} onPick={() => setMsg(cutToAngle(i, engine.time))} />
          ))}
        </div>
        {msg && <div className="hint">{msg}</div>}
        <button className="btn sm full" onClick={() => { endMulticam(); setMsg('') }}>Finish multicam (keep the cuts)</button>
      </>
    )
  }
  return (
    <>
      <div className="hint">Filmed the same moment on 2–4 phones/cameras? Pick the angles – they’re synced automatically by their sound. Put the one with the best sound first.</div>
      {assets.length < 2 && <div className="hint">Import at least two videos in the Media tab first.</div>}
      {assets.map((a) => (
        <label key={a.id} className="ochk">
          <input
            type="checkbox"
            checked={pick.includes(a.id)}
            onChange={(e) => setPick(e.target.checked ? [...pick, a.id] : pick.filter((x) => x !== a.id))}
          />
          {pick.includes(a.id) ? `Cam ${pick.indexOf(a.id) + 1} · ` : ''}{a.name} ({a.duration.toFixed(1)}s)
        </label>
      ))}
      <button
        className="btn primary full"
        disabled={pick.length < 2 || pick.length > 4 || !!busy}
        onClick={async () => {
          setMsg('')
          try {
            setMsg(await createMulticam(pick, setBusy))
            setPick([])
          } catch (e) {
            setMsg((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || `Sync ${pick.length || ''} angles & start multicam`}
      </button>
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

/* ---------- screen / webcam recording ---------- */

function RecordDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<RecMode>(canRecordScreen() ? 'both' : 'camera')
  const [mic, setMic] = useState(true)
  const [sys, setSys] = useState(true)
  const [rec, setRec] = useState<Recording | null>(null)
  const [secs, setSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const vid = useRef<HTMLVideoElement>(null)
  const recRef = useRef<Recording | null>(null)
  recRef.current = rec
  useEffect(() => {
    if (!rec) return
    const t0 = performance.now()
    const id = setInterval(() => setSecs((performance.now() - t0) / 1000), 250)
    if (vid.current && rec.camStream) {
      vid.current.srcObject = rec.camStream
      void vid.current.play().catch(() => {})
    }
    return () => clearInterval(id)
  }, [rec])
  useEffect(() => () => recRef.current?.cancel(), [])
  const stop = async () => {
    const r = recRef.current
    if (!r) return
    setBusy(true)
    try {
      const m = await r.stop()
      setRec(null)
      recRef.current = null
      setUi({ toast: m })
      onClose()
    } catch (e) {
      setMsg((e as Error).message)
      setRec(null)
    }
    setBusy(false)
  }
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  return (
    <div className="modal-bg" onClick={() => !rec && onClose()}>
      <div className="modal ae" onClick={(e) => e.stopPropagation()}>
        <div className="ae-h">
          <b>⏺ Record</b>
          <span>Record a tutorial, gameplay, reaction or talking-head video. It lands on the timeline when you stop.</span>
          <button className="ico" onClick={onClose} disabled={!!rec}>✕</button>
        </div>
        <div className="ae-body">
          {!rec ? (
            <>
              <div className="ae-styles three">
                {([['screen', '🖥', 'Screen only', 'A window, tab or the whole screen'], ['camera', '🤳', 'Camera only', 'Talking head / vlog'], ['both', '🧑‍💻', 'Screen + face', 'Your webcam as a round bubble']] as [RecMode, string, string, string][]).map(([id, em, n, d]) => (
                  <button key={id} className={'ae-style' + (mode === id ? ' on' : '')} disabled={id !== 'camera' && !canRecordScreen()} onClick={() => setMode(id)}>
                    <span className="em">{em}</span><b>{n}</b><small>{id !== 'camera' && !canRecordScreen() ? 'Not available on this device' : d}</small>
                  </button>
                ))}
              </div>
              <div className="ae-checks">
                <label><input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} /> Microphone</label>
                {mode !== 'camera' && <label><input type="checkbox" checked={sys} onChange={(e) => setSys(e.target.checked)} /> Computer / tab sound (tick “Share audio” in the browser box)</label>}
              </div>
              {!canRecordScreen() && <div className="hint">Phones and tablets can’t record the screen from a browser – use the phone’s own screen recorder and import the file.</div>}
              {!canRecordCamera() && <div className="hint">This browser can’t use the camera.</div>}
              {msg && <div className="ae-err">⚠ {msg}</div>}
            </>
          ) : (
            <div className="rec-live">
              {rec.camStream ? <video ref={vid} muted playsInline className="rec-cam" /> : <div className="rec-dot">🖥</div>}
              <div className="rec-time"><span className="red" /> REC {fmt(secs)}</div>
              <div className="hint">{mode === 'camera' ? 'Recording your camera.' : 'Recording your screen – you can switch to the window you’re showing. Come back here (or press the browser’s Stop sharing) to finish.'}</div>
            </div>
          )}
        </div>
        <div className="ae-foot">
          {!rec ? (
            <>
              <button className="btn" onClick={onClose}>Close</button>
              <button
                className="btn primary"
                onClick={async () => {
                  setMsg('')
                  try {
                    setRec(await startRecording(mode, mic, sys, () => void stop()))
                  } catch (e) {
                    setMsg((e as Error).message)
                  }
                }}
              >
                ⏺ Start recording
              </button>
            </>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={() => { rec.cancel(); setRec(null) }}>Discard</button>
              <button className="btn primary" disabled={busy} onClick={stop}>{busy ? 'Saving…' : '⏹ Stop & add to timeline'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- WhatsApp status splitter ---------- */

function WhatsAppSplit() {
  const [len, setLen] = useState(60)
  const [label, setLabel] = useState(true)
  const [small, setSmall] = useState(true)
  const [busy, setBusy] = useState('')
  const [parts, setParts] = useState<{ name: string; blob: Blob; url: string }[]>([])
  const [msg, setMsg] = useState('')
  const dur = useStore((s) => s.project.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0))
  const n = Math.max(1, Math.ceil(dur / len - 0.02))
  const each = dur / n
  useEffect(() => () => parts.forEach((p) => URL.revokeObjectURL(p.url)), [parts])
  const canShare = (b: Blob) => {
    try {
      return !!navigator.canShare?.({ files: [new File([b], 'x.mp4', { type: 'video/mp4' })] })
    } catch {
      return false
    }
  }
  return (
    <>
      <div className="hint">Cuts your video into status-sized parts{label ? ' labelled “1/3”, “2/3”…' : ''} and makes them small enough for WhatsApp.</div>
      <div className="chips">
        {[30, 60, 90].map((s) => (
          <button key={s} className={'chip' + (len === s ? ' on' : '')} onClick={() => setLen(s)}>{s}s{s === 60 ? ' (standard)' : s === 90 ? ' (newer phones)' : ''}</button>
        ))}
      </div>
      <label className="ochk"><input type="checkbox" checked={label} onChange={(e) => setLabel(e.target.checked)} /> Show part number on the video</label>
      <label className="ochk"><input type="checkbox" checked={small} onChange={(e) => setSmall(e.target.checked)} /> Compress for WhatsApp (720p, small files)</label>
      <button
        className="btn primary full"
        disabled={dur <= 0 || !!busy}
        onClick={async () => {
          setMsg('')
          setParts([])
          const out: { name: string; blob: Blob; url: string }[] = []
          try {
            for (let i = 0; i < n; i++) {
              setBusy(`Making part ${i + 1} of ${n}…`)
              const from = i * each
              const to = i === n - 1 ? dur : (i + 1) * each
              const r = await fastExport((p) => setBusy(`Part ${i + 1}/${n} · ${Math.round(p * 100)}%`), { cancelled: false }, {
                from,
                to,
                maxSide: small ? 1280 : undefined,
                bitrate: small ? 1_800_000 : undefined,
                audioBitrate: small ? 128_000 : undefined,
                overlay: label && n > 1 ? (g, W, H) => drawPartBadge(g, W, H, `${i + 1}/${n}`) : undefined,
              })
              if (!r) break
              out.push({ name: `${safeName()}-status-${i + 1}of${n}.mp4`, blob: r.blob, url: URL.createObjectURL(r.blob) })
              setParts([...out])
            }
            setMsg(`${out.length} part${out.length > 1 ? 's' : ''} ready – post them in order.`)
          } catch (e) {
            setMsg((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || (dur <= 0 ? 'Add a clip first' : `Make ${n} status part${n > 1 ? 's' : ''} (${each.toFixed(0)}s each)`)}
      </button>
      {parts.map((p) => (
        <div key={p.name} className="wa-part">
          <span>🎬 {p.name.split('-status-')[1].replace('of', ' of ').replace('.mp4', '')} · {(p.blob.size / 1048576).toFixed(1)} MB</span>
          <button className="btn sm" onClick={() => download(p.blob, p.name)}>⬇</button>
          {canShare(p.blob) && (
            <button className="btn sm" onClick={() => navigator.share({ files: [new File([p.blob], p.name, { type: 'video/mp4' })] }).catch(() => {})}>📤 Share</button>
          )}
        </div>
      ))}
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

function drawPartBadge(g: CanvasRenderingContext2D, W: number, H: number, txt: string) {
  const s = Math.min(W, H)
  const fs = Math.round(s * 0.045)
  g.save()
  g.font = `800 ${fs}px Arial, sans-serif`
  const tw = g.measureText(txt).width
  const pad = fs * 0.45
  const x = W - tw - pad * 2 - s * 0.04
  const y = s * 0.04 + (H > W ? H * 0.06 : 0)
  g.fillStyle = 'rgba(0,0,0,0.55)'
  g.beginPath()
  g.roundRect(x, y, tw + pad * 2, fs + pad * 1.2, fs * 0.4)
  g.fill()
  g.fillStyle = '#25D366'
  g.textBaseline = 'top'
  g.fillText(txt, x + pad, y + pad * 0.6)
  g.restore()
}

import { useRef, useState } from 'react'
import { addMapClip, setUi, useStore } from '../store'
import { Found, MAP_STYLES, MODES, MapData, Stop, TravelMode, findPlace, km, rememberPlace, searchOnline, suggest } from '../travelmap'
import { Chapter, Sentence, TitlePack, aiTitles, applyChapters, makeTitles, spokenFromCaptions, suggestChapters } from '../chapters'
import { wordsOnTimeline } from '../dub'
import { EnhanceOpts, enhanceAsset } from '../enhance'
import { MODELS } from './MediaPanel'
import { Clip } from '../types'
import { engine } from '../engine'

const toast = (m: string) => setUi({ toast: m })
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

/* ---------- travel map ---------- */

export function TravelMapSection() {
  const [stops, setStops] = useState<Stop[]>([])
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<TravelMode>('car')
  const [theme, setTheme] = useState<MapData['theme']>('street')
  const [title, setTitle] = useState('')
  const [dur, setDur] = useState(5)
  const local = suggest(q)
  const [online, setOnline] = useState<Found[]>([])
  const [looking, setLooking] = useState(false)
  const timer = useRef<number>()
  const seq = useRef(0)
  const lookUp = async (text: string, auto: boolean) => {
    const my = ++seq.current
    setLooking(true)
    try {
      const r = await searchOnline(text)
      if (my !== seq.current) return
      setOnline(r)
      if (!auto && !r.length) toast(`Couldn’t find “${text}” on the map. Check the spelling, add the state (e.g. “Muzaffarpur, Bihar”), or type “Name, latitude, longitude” from Google Maps.`)
      if (!auto && r.length === 1) add(r[0])
    } catch {
      if (!auto) toast('Couldn’t search online (no internet?). Type “Name, latitude, longitude” – copy the numbers from Google Maps by long-pressing a spot.')
    } finally {
      if (my === seq.current) setLooking(false)
    }
  }
  const onType = (v: string) => {
    setQ(v)
    setOnline([])
    clearTimeout(timer.current)
    // not in the built-in list? look it up online after a short pause
    if (v.trim().length >= 3 && !findPlace(v) && suggest(v).length < 2) timer.current = window.setTimeout(() => void lookUp(v, true), 600)
  }
  const add = (s: Stop | Found) => {
    const { n, lat, lon } = s
    setStops((x) => [...x, { n, lat, lon }])
    if ('sub' in s) rememberPlace({ n, lat, lon })
    setQ('')
    setOnline([])
  }
  const submit = () => {
    const f = findPlace(q)
    if (f) return add(f)
    if (online.length === 1) return add(online[0])
    if (online.length > 1) return toast('Pick the right place from the list below.')
    if (q.trim()) void lookUp(q, false)
  }
  const dist = stops.slice(1).reduce((s, p, i) => s + km(stops[i], p), 0)
  return (
    <>
      <div className="hint">An animated route for your travel vlog intro – the line draws itself and a {MODES.find((m) => m.id === mode)?.icon} rides along. Type any town or village: 580 places work offline, everything else is found online.</div>
      <div className="osearch">
        <input placeholder={stops.length ? 'Next stop…' : 'Start (e.g. Noida)'} value={q} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="btn sm" disabled={looking && !online.length} onClick={submit}>{looking ? '…' : 'Add'}</button>
      </div>
      {local.length > 0 && (
        <div className="chips">
          {local.map((p) => (
            <button key={p.n} className="chip" onClick={() => add(p)}>{p.n}</button>
          ))}
        </div>
      )}
      {looking && !online.length && <div className="hint">Searching the map…</div>}
      {online.length > 0 && (
        <div className="chips">
          {online.map((p, i) => (
            <button key={i} className="chip" onClick={() => add(p)} title={`${p.lat}, ${p.lon}`}>📍 {p.n}{p.sub ? <small style={{ opacity: 0.7 }}> · {p.sub}</small> : null}</button>
          ))}
        </div>
      )}
      {stops.map((s, i) => (
        <div key={i} className="wa-part">
          <span>{i === 0 ? '🟢' : i === stops.length - 1 ? '🏁' : '📍'} {s.n}</span>
          <button className="ico" title="Remove" onClick={() => setStops((x) => x.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      {stops.length > 1 && <div className="hint">≈ {Math.round(dist).toLocaleString('en-IN')} km in a straight line</div>}
      <div className="chips">
        {MODES.map((m) => (
          <button key={m.id} className={'chip' + (mode === m.id ? ' on' : '')} onClick={() => setMode(m.id)}>{m.icon} {m.name}</button>
        ))}
      </div>
      <div className="chips">
        {MAP_STYLES.map((t) => (
          <button key={t.id} className={'chip' + (theme === t.id ? ' on' : '')} onClick={() => setTheme(t.id)}>{t.icon} {t.name}</button>
        ))}
      </div>
      <div className="hint">
        {theme === 'simple'
          ? 'Simple outline map – works offline.'
          : 'Real map with roads, rivers and towns – needs internet while editing and exporting; the map credit stays in the corner. ' +
            (theme === 'street' ? 'Street (OpenStreetMap) is free for any video.' : 'Free for non-commercial videos – check the provider’s terms before using it in monetised videos.')}
      </div>
      <div className="osearch">
        <input placeholder="Title (optional) e.g. Noida to Manali road trip" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <label className="row slider">
        <span className="lbl">Length</span>
        <input type="range" min={3} max={12} step={1} value={dur} onChange={(e) => setDur(+e.target.value)} />
        <span className="val">{dur}s</span>
      </label>
      <button
        className="btn primary full"
        disabled={!stops.length}
        onClick={() => {
          addMapClip({ stops, mode, theme, title: title.trim() || undefined }, dur)
          toast('Travel map added at the playhead – press Space to watch it draw.')
          engine.requestRender()
        }}
      >
        🗺 Add travel map
      </button>
    </>
  )
}

/* ---------- what was said (captions on the timeline, or listen now) ---------- */

function useSpoken() {
  const clips = useStore((s) => s.project.clips)
  const [heard, setHeard] = useState<Sentence[] | null>(null)
  const [busy, setBusy] = useState('')
  const [model, setModel] = useState(MODELS[1].id)
  const sig = useRef({ cancelled: false })
  const fromCaps = spokenFromCaptions()
  const spoken = fromCaps.length ? fromCaps : heard ?? []
  const listen = async () => {
    const list = clips.filter((c: Clip) => (c.kind === 'video' || c.kind === 'audio') && c.assetId && c.volume > 0 && !c.freeze && !c.label.startsWith('🇬🇧'))
    if (!list.length) return toast('Add a video with talking first.')
    sig.current = { cancelled: false }
    setBusy('Listening…')
    try {
      const parts = await wordsOnTimeline(list, { model, gpu: false, translate: false }, (m) => setBusy(m), sig.current)
      const ws = parts.flatMap((p) => p.words).sort((a, b) => a.start - b.start)
      const out: Sentence[] = []
      for (const w of ws) {
        const l = out[out.length - 1]
        if (l && w.start - l.end < 0.6 && l.text.split(' ').length < 14) {
          l.text += ' ' + w.text
          l.end = w.end
        } else out.push({ text: w.text, start: w.start, end: w.end })
      }
      setHeard(out)
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const ui = !fromCaps.length && !heard && (
    <>
      <div className="hint">Uses your captions if you made them – otherwise listens to the video first (on your device).</div>
      <select className="full" value={model} onChange={(e) => setModel(e.target.value)} disabled={!!busy}>
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <button className="btn full" disabled={!!busy} onClick={listen}>{busy || '👂 Listen to the video'}</button>
    </>
  )
  return { spoken, ui, ready: spoken.length > 0, source: fromCaps.length ? 'captions' : 'listening' }
}

export function ChaptersSection() {
  const { spoken, ui, ready } = useSpoken()
  const [ch, setCh] = useState<Chapter[] | null>(null)
  return (
    <>
      <div className="hint">Finds where topics change (plus long pauses and cuts) and names each chapter from what you say there.</div>
      {ui}
      {(ready || !ui) && (
        <button
          className="btn full"
          onClick={() => {
            try {
              setCh(suggestChapters(spoken))
            } catch (e) {
              toast((e as Error).message)
            }
          }}
        >
          📑 Suggest chapters
        </button>
      )}
      {ch && (
        <>
          {ch.map((c, i) => (
            <div key={i} className="spk-row">
              <small style={{ width: 40 }}>{fmt(c.t)}</small>
              <input value={c.name} onChange={(e) => setCh((x) => x!.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)))} />
              {i > 0 && <button className="ico" onClick={() => setCh((x) => x!.filter((_, k) => k !== i))}>✕</button>}
            </div>
          ))}
          <button
            className="btn primary full"
            onClick={() => {
              applyChapters(ch)
              toast(`${ch.length} chapters set as markers – Export → YouTube chapters has the list to paste.`)
            }}
          >
            ✓ Use these chapters
          </button>
        </>
      )}
    </>
  )
}

/* ---------- titles, description, hashtags ---------- */

export function TitlesSection() {
  const { spoken, ui, ready } = useSpoken()
  const [pack, setPack] = useState<TitlePack | null>(null)
  const [notes, setNotes] = useState('')
  const [prov, setProv] = useState<'gemini' | 'claude'>(() => (localStorage.getItem('clipforge-ai-prov') as any) || 'gemini')
  const [key, setKey] = useState(() => localStorage.getItem('clipforge-ai-key') ?? '')
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState('')
  const copy = (t: string, id: string) => {
    void navigator.clipboard?.writeText(t)
    setCopied(id)
    setTimeout(() => setCopied(''), 1200)
  }
  return (
    <>
      <div className="hint">Title ideas, a description (with your chapters) and hashtags from what you say in the video.</div>
      {ui}
      <div className="osearch">
        <input placeholder="Notes (optional) e.g. first trip with Seema, budget ₹5000" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn full" disabled={!ready && !!ui} onClick={() => setPack(makeTitles(spoken, notes))}>✍️ Quick ideas (free, offline)</button>
      <details className="chap">
        <summary>✨ Better ideas with an AI writer (your own key)</summary>
        <div className="hint">Google Gemini has a free key at aistudio.google.com. The key stays in this browser; what you say in the video is sent to that company to write the ideas.</div>
        <div className="chips">
          <button className={'chip' + (prov === 'gemini' ? ' on' : '')} onClick={() => setProv('gemini')}>Gemini</button>
          <button className={'chip' + (prov === 'claude' ? ' on' : '')} onClick={() => setProv('claude')}>Claude</button>
        </div>
        <div className="osearch">
          <input type="password" placeholder="API key" value={key} onChange={(e) => setKey(e.target.value)} />
          <button
            className="btn sm primary"
            disabled={!key || !!busy || (!ready && !!ui)}
            onClick={async () => {
              localStorage.setItem('clipforge-ai-key', key)
              localStorage.setItem('clipforge-ai-prov', prov)
              setBusy('Writing…')
              try {
                setPack(await aiTitles(prov, key, spoken, notes))
              } catch (e) {
                toast((e as Error).message)
              }
              setBusy('')
            }}
          >
            {busy || 'Write'}
          </button>
        </div>
      </details>
      {pack && (
        <>
          <div className="group-h">Titles</div>
          {pack.titles.map((t, i) => (
            <div key={i} className="wa-part">
              <span>{t}</span>
              <button className="btn sm" onClick={() => copy(t, 't' + i)}>{copied === 't' + i ? '✓' : '📋'}</button>
            </div>
          ))}
          <div className="group-h">Description</div>
          <textarea className="full desc" rows={8} value={pack.description} onChange={(e) => setPack({ ...pack, description: e.target.value })} />
          <button className="btn sm" onClick={() => copy(pack.description, 'd')}>{copied === 'd' ? '✓ Copied' : '📋 Copy description'}</button>
          <div className="group-h">Hashtags</div>
          <div className="hint">{pack.hashtags.join(' ')}</div>
          <button className="btn sm" onClick={() => copy(pack.hashtags.join(' '), 'h')}>{copied === 'h' ? '✓ Copied' : '📋 Copy hashtags'}</button>
        </>
      )}
    </>
  )
}

/* ---------- photo enhance ---------- */

export function EnhanceSection({ c }: { c?: Clip }) {
  const assets = useStore((s) => s.assets)
  const photos = assets.filter((a) => a.kind === 'image' && !a.animated)
  const [pick, setPick] = useState('')
  const id = c?.assetId ?? (pick || photos[0]?.id || '')
  const a = assets.find((x) => x.id === id)
  const [o, setO] = useState<EnhanceOpts>({ auto: true, denoise: 0.3, sharpen: 0.4, scale: 1, ai: false })
  const [busy, setBusy] = useState('')
  if (!photos.length && !c) return <div className="hint">Import a photo first.</div>
  const small = a ? a.width * a.height <= 1100 * 1100 : false
  return (
    <>
      {!c && (
        <select className="full" value={id} onChange={(e) => setPick(e.target.value)}>
          {photos.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.width}×{p.height})</option>
          ))}
        </select>
      )}
      <label className="ochk"><input type="checkbox" checked={o.auto} onChange={(e) => setO({ ...o, auto: e.target.checked })} /> Fix light & colour (brightens dark photos)</label>
      <label className="row slider">
        <span className="lbl">Remove grain</span>
        <input type="range" min={0} max={1} step={0.05} value={o.denoise} onChange={(e) => setO({ ...o, denoise: +e.target.value })} />
        <span className="val">{Math.round(o.denoise * 100)}%</span>
      </label>
      <label className="row slider">
        <span className="lbl">Sharpen</span>
        <input type="range" min={0} max={1} step={0.05} value={o.sharpen} onChange={(e) => setO({ ...o, sharpen: +e.target.value })} />
        <span className="val">{Math.round(o.sharpen * 100)}%</span>
      </label>
      <div className="chips">
        {([1, 2, 4] as const).map((k) => (
          <button key={k} className={'chip' + (o.scale === k ? ' on' : '')} onClick={() => setO({ ...o, scale: k })}>{k === 1 ? 'Same size' : `Enlarge ${k}×`}</button>
        ))}
      </div>
      {o.scale > 1 && (
        <label className="ochk">
          <input type="checkbox" checked={o.ai && small} disabled={!small} onChange={(e) => setO({ ...o, ai: e.target.checked })} /> Use the AI upscaler {small ? '(sharper details, downloads ~4 MB once)' : '(only for photos up to ~1000 px)'}
        </label>
      )}
      <button
        className="btn primary full"
        disabled={!a || !!busy}
        onClick={async () => {
          setBusy('Working…')
          try {
            toast(await enhanceAsset(id, o, setBusy))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || '✨ Enhance photo'}
      </button>
    </>
  )
}


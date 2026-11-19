import { useEffect, useRef, useState } from 'react'
import {
  addAsset,
  addAssetClip,
  addCaptionClips,
  addSfx,
  addSticker,
  addText,
  getAsset,
  getClip,
  getPreset,
  getState,
  projectDuration,
  removeAsset,
  buildSrt,
  deleteStyle,
  loadStyles,
  setUi,
  useStore,
} from '../store'
import { engine } from '../engine'
import { SFX_LIST, STICKER_GROUPS, TEXT_PRESETS } from '../library'
import { Asset, Clip, TextProps } from '../types'
import { fmtTime } from './Fields'
import { extractMono16k } from '../media'
import { startVoiceover } from '../processing'
import { TEMPLATES, applyTemplate } from '../templates'
import { ToolsTab } from './ToolsTab'
import { StockPanel } from './StockPanel'
import { addShape } from '../store'
import { ShapeId } from '../types'
import { Icon } from './Icon'
import { devanagariToRoman, emojiFor } from '../tools2'
import { OnlineMemes } from './OnlineMemes'
import { MEMES, MEME_CATS, MemeCat, applyMeme, previewSound } from '../memes'
import { CapMode, Word, buildLines, transcribe } from '../captions'

type Tab = 'media' | 'tools' | 'memes' | 'templates' | 'text' | 'stickers' | 'audio' | 'captions'
const TABS: { id: Tab; icon: string; name: string }[] = [
  { id: 'media', icon: 'folder', name: 'Media' },
  { id: 'memes', icon: 'smile', name: 'Memes' },
  { id: 'templates', icon: 'layout', name: 'Templates' },
  { id: 'text', icon: 'type', name: 'Text' },
  { id: 'stickers', icon: 'star', name: 'Stickers' },
  { id: 'audio', icon: 'music', name: 'Audio' },
  { id: 'captions', icon: 'captions', name: 'Captions' },
  { id: 'tools', icon: 'wrench', name: 'Tools' },
]

export async function importFiles(files: FileList | File[], setMsg?: (m: string) => void) {
  for (const f of Array.from(files)) {
    try {
      const a = await engine.importFile(f)
      if (a) addAsset(a)
      else setMsg?.(`"${f.name}" isn't a video, image or audio file.`)
    } catch (e) {
      const m = (e as Error).message
      setMsg?.(`Couldn't import "${f.name}" – ${m}.${/HEVC|Fix:/.test(m) ? '' : ' Try an MP4 (H.264) or WebM file.'}`)
    }
  }
}

export function MediaPanel() {
  const [tab, setTab] = useState<Tab>('media')
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d === 'templates' || d === 'memes') setTab(d)
      else if (d === 'record' || d === 'text') {
        ;(window as any).__cfPending = d === 'record' ? 'rec' : 'text'
        setTab('tools')
        window.dispatchEvent(new CustomEvent('cf:tools', { detail: d === 'record' ? 'rec' : 'text' }))
      }
    }
    window.addEventListener('cf:open', on)
    return () => window.removeEventListener('cf:open', on)
  }, [])
  return (
    <div className="left">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={19} />
            <small>{t.name}</small>
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'memes' && <MemeTab />}
        {tab === 'tools' && <ToolsTab />}
        {tab === 'templates' && <TemplateTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'stickers' && <StickerTab />}
        {tab === 'audio' && <AudioTab />}
        {tab === 'captions' && <CaptionTab />}
      </div>
    </div>
  )
}

function AssetCard({ a }: { a: Asset }) {
  return (
    <div
      className="asset"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/clipforge-asset', a.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDoubleClick={() => addAssetClip(a.id)}
    >
      <div className="thumb" style={a.thumb ? { backgroundImage: `url(${a.thumb})` } : undefined}>
        {a.kind === 'audio' && <span className="big">🎵</span>}
        <span className="badge">{a.kind === 'image' ? 'IMG' : fmtTime(a.duration)}</span>
      </div>
      <div className="meta">
        <span className="name ell" title={a.name}>{a.name}</span>
        <div className="acts">
          <button className="ico sm" title="Add to timeline" onClick={() => addAssetClip(a.id)}>＋</button>
          <button className="ico sm danger" title="Remove from project" onClick={() => removeAsset(a.id)}>✕</button>
        </div>
      </div>
    </div>
  )
}

function MediaTab() {
  const assets = useStore((s) => s.assets)
  const [stock, setStock] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [msg, setMsg] = useState('')
  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files)
    const n = list.length
    setBusy((b) => b + n)
    setMsg('')
    await importFiles(list, setMsg)
    setBusy((b) => b - n)
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="video/*,image/*,audio/*"
        onChange={(e) => {
          void pick(e.target.files)
          e.target.value = ''
        }}
      />
      <button className="btn primary full" onClick={() => input.current?.click()}>
        ＋ Import video, image or audio
      </button>
      <button className={'btn full' + (stock ? ' on' : '')} onClick={() => setStock(!stock)}>
        🎬 Free stock videos & photos {stock ? '▲' : '▼'}
      </button>
      {stock && <StockPanel />}
      <div className="hint">
        Files stay on your device – nothing is uploaded. Drop files anywhere, or drag a card onto the timeline.
        For memes, import short MP4/WebM reaction clips, PNG stickers and MP3 sounds.
      </div>
      {busy > 0 && <div className="hint">Importing…</div>}
      {msg && <div className="hint warn">{msg}</div>}
      <div className="assets">
        {assets.map((a) => (
          <AssetCard key={a.id} a={a} />
        ))}
      </div>
      {!assets.length && !busy && <div className="empty">No media yet</div>}
    </>
  )
}

function MemeTab() {
  const [cat, setCat] = useState<MemeCat | 'All'>('All')
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'built' | 'online'>('built')
  const fileRef = useRef<HTMLInputElement>(null)
  const list = MEMES.filter((m) => (cat === 'All' || m.cat === cat) && (!q || (m.name + ' ' + m.cat).toLowerCase().includes(q.toLowerCase())))
  if (mode === 'online')
    return (
      <>
        <div className="osrc msub">
          <button onClick={() => setMode('built')}>Built-in</button>
          <button className="on">🌐 Online</button>
        </div>
        <OnlineMemes />
      </>
    )
  return (
    <>
      <div className="osrc msub">
        <button className="on">Built-in</button>
        <button onClick={() => setMode('online')}>🌐 Online</button>
      </div>
      <div className="hint">Tap a meme to drop it at the playhead: sound + stickers + caption + a picture effect, all editable. Tap 🔈 to hear the sound first.</div>
      <input className="msearch" placeholder="Search memes…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mcats">
        {(['All', ...MEME_CATS] as const).map((c) => (
          <button key={c} className={'mcat' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="memes">
        {list.map((m) => (
          <div key={m.id} className="meme">
            <button className="meme-go" onClick={() => setUi({ toast: applyMeme(m.id) })} title={'Add ' + m.name}>
              <span className="em">{m.emoji}</span>
              <b>{m.name}</b>
              <small>{m.sounds?.length ? m.sounds.length + ' sound' + (m.sounds.length > 1 ? 's' : '') : 'text only'} · {m.dur}s</small>
            </button>
            {m.sounds?.[0] && (
              <button className="meme-play" onClick={() => previewSound(m.sounds![0].id)} title="Hear the sound">
                🔈
              </button>
            )}
          </div>
        ))}
        {!list.length && <div className="hint">No memes match.</div>}
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        Want the real viral clips? Add your own meme sounds, GIFs or images (they stay on your device) and drop them on the timeline like any other media.
      </div>
      <button className="btn" onClick={() => fileRef.current?.click()}>
        ＋ Import my meme sound / GIF / image
      </button>
      <input ref={fileRef} type="file" hidden multiple accept="audio/*,video/*,image/*,.gif" onChange={(e) => e.target.files && importFiles(e.target.files, (m) => setUi({ toast: m }))} />
    </>
  )
}

function TemplateTab() {
  return (
    <>
      <div className="hint">One-click layouts for Shorts, Reels and YouTube. They add editable text, stickers and sounds around your clips.</div>
      <div className="tmpls">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="tmpl" onClick={() => setUi({ toast: applyTemplate(t.id) })}>
            <span className="em">{t.emoji}</span>
            <b>{t.name}</b>
            <small>{t.desc}</small>
          </button>
        ))}
      </div>
    </>
  )
}

function TextTab() {
  useStore((s) => s.toast + s.project.clips.length) // re-render when styles change
  const mine = loadStyles()
  return (
    <>
      <div className="hint">Click a style to add it at the playhead. Edit the words in the right panel or drag it on the canvas.</div>
      <div className="presets">
        {TEXT_PRESETS.map((p) => (
          <button key={p.id} className="tpreset" onClick={() => addText(p)}>
            <span
              style={{
                fontFamily: p.props.font,
                fontWeight: p.props.bold ? 700 : 400,
                fontStyle: p.props.italic ? 'italic' : 'normal',
                color: p.props.color,
                textTransform: p.props.upper ? 'uppercase' : 'none',
                WebkitTextStroke: p.props.strokeW > 0 ? `${Math.max(1, p.props.strokeW * 14)}px ${p.props.stroke}` : undefined,
                paintOrder: 'stroke fill',
                background: p.props.bgOpacity > 0 ? 'rgba(0,0,0,.7)' : undefined,
                padding: p.props.bgOpacity > 0 ? '2px 6px' : undefined,
                textShadow: p.props.shadow ? `0 0 8px ${p.props.stroke}` : undefined,
              }}
            >
              {p.props.text}
            </span>
            <small>{p.name}</small>
          </button>
        ))}
      </div>
      {mine.length > 0 && (
        <>
          <div className="group-h">My styles</div>
          <div className="presets">
            {mine.map((m) => (
              <div key={m.name} className="tpreset mine">
                <button
                  className="mine-b"
                  onClick={() => addText({ id: 'mine', name: m.name, y: m.y, props: { ...m.props, text: 'Your text' } } as any)}
                >
                  <span
                    style={{
                      fontFamily: m.props.font,
                      fontWeight: m.props.bold ? 700 : 400,
                      color: m.props.color,
                      WebkitTextStroke: m.props.strokeW > 0 ? `${Math.max(1, m.props.strokeW * 14)}px ${m.props.stroke}` : undefined,
                      paintOrder: 'stroke fill',
                    }}
                  >
                    Aa
                  </span>
                  <small>{m.name}</small>
                </button>
                <button className="link" title="Delete this style" onClick={() => deleteStyle(m.name)}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

const SHAPES: [ShapeId, string, string][] = [
  ['arrow', '➡️', 'Arrow'],
  ['circle', '⭕', 'Circle it'],
  ['box', '🔲', 'Box'],
  ['underline', '〰️', 'Underline'],
  ['cross', '❌', 'Wrong'],
  ['check', '✅', 'Right'],
  ['subscribe', '🔔', 'Subscribe button'],
  ['like', '👍', 'Like button'],
  ['callout', '💬', 'Speech bubble'],
  ['progress', '▬', 'Progress bar'],
]
const VIZ: [ShapeId, string, string][] = [
  ['viz-bars', '📊', 'Bars'],
  ['viz-wave', '〰', 'Wave'],
  ['viz-circle', '🔆', 'Circle'],
]

function StickerTab() {
  return (
    <>
      <div className="group-h" style={{ marginTop: 0 }}>Callouts & shapes</div>
      <div className="shape-grid">
        {SHAPES.map(([id, em, name]) => (
          <button key={id} className="shape-btn" onClick={() => addShape(id, name)} title={name}>
            <span>{em}</span>
            <small>{name}</small>
          </button>
        ))}
      </div>
      <div className="group-h">Audio visualizers</div>
      <div className="hint">Moving bars that dance to your music or voice – great for podcasts and song clips.</div>
      <div className="shape-grid">
        {VIZ.map(([id, em, name]) => (
          <button key={id} className="shape-btn" onClick={() => addShape(id, name)} title={name}>
            <span>{em}</span>
            <small>{name}</small>
          </button>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 10 }}>Reaction stickers & meme emoji. Combine with <b>Animation → Beat punch / Shake</b> for instant meme edits.</div>
      {STICKER_GROUPS.map((g) => (
        <div key={g.name}>
          <div className="group-h">{g.name}</div>
          <div className="emoji-grid">
            {g.items.map((e) => (
              <button key={e} className="emoji" onClick={() => addSticker(e)}>
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function Voiceover() {
  const [rec, setRec] = useState<null | { level: () => number; stop: () => Promise<File | null>; cancel: () => void; at: number }>(null)
  const [secs, setSecs] = useState(0)
  const [lvl, setLvl] = useState(0)
  const [follow, setFollow] = useState(true)
  useEffect(() => {
    if (!rec) return
    const t0 = performance.now()
    const id = setInterval(() => {
      setSecs((performance.now() - t0) / 1000)
      setLvl(rec.level())
    }, 80)
    return () => clearInterval(id)
  }, [rec])
  const begin = async () => {
    try {
      const r = await startVoiceover()
      const at = engine.time
      if (follow) engine.play()
      setRec({ ...r, at })
    } catch (e) {
      setUi({ toast: (e as Error).name === 'NotAllowedError' ? 'Microphone access was blocked – allow it in the address bar' : (e as Error).message })
    }
  }
  const finish = async () => {
    if (!rec) return
    const r = rec
    setRec(null)
    engine.pause()
    const file = await r.stop()
    if (!file) return setUi({ toast: 'Nothing was recorded' })
    const a = await engine.importFile(file)
    if (!a) return setUi({ toast: 'Could not read the recording' })
    addAsset(a)
    addAssetClip(a.id, 'a1', r.at)
    setUi({ toast: 'Voice-over added on the Audio 1 track' })
  }
  return (
    <div className="vo">
      <div className="group-h">Voice-over</div>
      {!rec ? (
        <>
          <button className="btn full" onClick={begin}>🎙 Record from playhead</button>
          <label className="row check">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            <span>Play the video while recording (use headphones)</span>
          </label>
        </>
      ) : (
        <>
          <button className="btn full danger" onClick={finish}>■ Stop · {secs.toFixed(1)}s</button>
          <div className="vu"><i style={{ width: `${Math.min(100, lvl * 160)}%` }} /></div>
          <button className="link" onClick={() => { rec.cancel(); engine.pause(); setRec(null) }}>Discard</button>
        </>
      )}
    </div>
  )
}

function AudioTab() {
  const allAssets = useStore((s) => s.assets)
  const assets = allAssets.filter((a) => a.kind === 'audio')
  const preview = (id: string) => {
    const ctx = engine.audio
    void ctx.resume()
    const src = ctx.createBufferSource()
    src.buffer = engine.getSfx(id)
    src.connect(ctx.destination)
    src.start()
  }
  return (
    <>
      <Voiceover />
      <div className="hint">Sound effects are generated in your browser. ▶ to preview, ＋ to drop one at the playhead.</div>
      <div className="sfx-list">
        {SFX_LIST.map((s) => (
          <div className="sfx" key={s.id}>
            <span className="em">{s.emoji}</span>
            <span className="name">{s.name}</span>
            <button className="ico sm" title="Preview" onClick={() => preview(s.id)}>▶</button>
            <button className="ico sm" title="Add at playhead" onClick={() => addSfx(s.id)}>＋</button>
          </div>
        ))}
      </div>
      <div className="group-h">Your audio / music</div>
      {assets.length ? (
        <div className="assets">{assets.map((a) => <AssetCard key={a.id} a={a} />)}</div>
      ) : (
        <div className="hint">Import MP3/WAV files from the Media tab and they appear here.</div>
      )}
    </>
  )
}

const CAPTION_STYLES: { id: string; name: string; make: (size: number) => TextProps }[] = [
  {
    id: 'classic',
    name: 'Classic',
    make: (size) => ({ text: '', font: '"Arial Black", "Arial Bold", sans-serif', size, color: '#ffffff', stroke: '#000000', strokeW: 0.14, bg: '#000000', bgOpacity: 0, bold: false, italic: false, upper: false, align: 'center', shadow: false, maxW: 0.84 }),
  },
  {
    id: 'pop',
    name: 'Yellow pop',
    make: (size) => ({ text: '', font: 'Impact, "Arial Narrow Bold", sans-serif', size: size * 1.25, color: '#ffe500', stroke: '#000000', strokeW: 0.2, bg: '#000000', bgOpacity: 0, bold: false, italic: false, upper: true, align: 'center', shadow: true, maxW: 0.84 }),
  },
  {
    id: 'box',
    name: 'Boxed',
    make: (size) => ({ text: '', font: 'Arial, sans-serif', size, color: '#ffffff', stroke: '#000', strokeW: 0, bg: '#000000', bgOpacity: 0.72, bold: true, italic: false, upper: false, align: 'center', shadow: false, maxW: 0.8 }),
  },
]

function parseTs(s: string) {
  const m = s.trim().match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/)
  if (!m) return NaN
  return +(m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0').slice(0, 3) / 1000
}

export const MODELS = [
  { id: 'Xenova/whisper-tiny', name: 'Fast · Tiny (~40 MB)' },
  { id: 'Xenova/whisper-base', name: 'Balanced · Base (~75 MB)' },
  { id: 'Xenova/whisper-small', name: 'Accurate · Small (~250 MB)' },
]
export const LANGS = [
  ['auto', 'Auto-detect'],
  ['english', 'English'],
  ['hindi', 'Hindi'],
  ['urdu', 'Urdu'],
  ['bengali', 'Bengali'],
  ['tamil', 'Tamil'],
  ['telugu', 'Telugu'],
  ['spanish', 'Spanish'],
  ['french', 'French'],
  ['german', 'German'],
  ['portuguese', 'Portuguese'],
  ['arabic', 'Arabic'],
  ['indonesian', 'Indonesian'],
]

function AutoCaptions({ styleId }: { styleId: string }) {
  const sel = useStore((s) => s.selectedId)
  const clips = useStore((s) => s.project.clips)
  const [model, setModel] = useState(MODELS[1].id)
  const [lang, setLang] = useState('auto')
  const [mode, setMode] = useState<CapMode>('karaoke')
  const [maxWords, setMaxWords] = useState(4)
  const [gpu, setGpu] = useState(false)
  const [roman, setRoman] = useState(true)
  const [emoji, setEmoji] = useState(false)
  const [translate, setTranslate] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'run' | 'done' | 'error'>('idle')
  const [status, setStatus] = useState('')
  const [pct, setPct] = useState<number | undefined>()
  const [msg, setMsg] = useState('')
  const sig = useRef({ cancelled: false })

  const selClip = clips.find((c) => c.id === sel)
  const speaking = clips.filter((c) => c.kind === 'video' && c.volume > 0 && !c.freeze && getAsset(c.assetId))
  const [scope, setScope] = useState<'all' | 'one'>('all')
  const source =
    selClip && (selClip.kind === 'video' || selClip.kind === 'audio')
      ? selClip
      : clips.find((c) => c.kind === 'video') ?? clips.find((c) => c.kind === 'audio')
  const whole = scope === 'all' && speaking.length > 1

  /** transcribes each source file once (only the parts used), then places words on every clip */
  const transcribeClips = async (list: Clip[]) => {
    const out: { clip: Clip; words: Word[] }[] = []
    const byAsset = new Map<string, Clip[]>()
    for (const c of list) byAsset.set(c.assetId!, [...(byAsset.get(c.assetId!) ?? []), c])
    // merge the source ranges of each file (gaps under 15 s are transcribed through)
    const jobs: { asset: Asset; from: number; to: number; clips: Clip[] }[] = []
    for (const [aid, cs] of byAsset) {
      const asset = getAsset(aid)!
      const rs = cs.map((c) => ({ c, a: c.srcIn, b: c.srcIn + c.dur * c.speed })).sort((x, y) => x.a - y.a)
      let cur: (typeof jobs)[0] | null = null
      for (const r of rs) {
        if (cur && r.a - cur.to < 15) {
          cur.to = Math.max(cur.to, r.b)
          cur.clips.push(r.c)
        } else {
          cur = { asset, from: r.a, to: r.b, clips: [r.c] }
          jobs.push(cur)
        }
      }
    }
    for (let j = 0; j < jobs.length; j++) {
      const job = jobs[j]
      if (sig.current.cancelled) throw new Error('Cancelled.')
      const tag = jobs.length > 1 ? `Part ${j + 1}/${jobs.length}: ` : ''
      setStatus(tag + 'Reading the audio…')
      const fake = { ...job.clips[0], srcIn: job.from, dur: job.to - job.from, speed: 1 }
      const audio = await extractMono16k(fake, job.asset)
      if (!audio || audio.length < 1600) continue
      const words = await transcribe(audio, { model, language: lang, gpu, translate }, (m, p) => {
        setStatus(tag + m)
        setPct(p)
      }, sig.current)
      for (const c of job.clips) {
        const a = c.srcIn - job.from
        const b = a + c.dur * c.speed
        const ws = words.filter((w) => w.end > a + 0.05 && w.start < b - 0.05).map((w) => ({ ...w, start: w.start - a, end: w.end - a }))
        if (ws.length) out.push({ clip: c, words: ws })
      }
    }
    return out
  }

  const run = async () => {
    if (!source) return
    const asset = getAsset(source.assetId)
    if (!asset) return
    sig.current = { cancelled: false }
    setPhase('run')
    setMsg('')
    setPct(undefined)
    try {
      setStatus('Reading the audio…')
      const parts = whole ? await transcribeClips(speaking) : await transcribeClips([source])
      const words = parts.flatMap((p) => p.words)
      if (!words.length) throw new Error(whole ? 'No speech was found in the video.' : 'No speech was found in this clip.')
      for (const w of words) {
        if (roman && /[\u0900-\u097F]/.test(w.text)) w.text = devanagariToRoman(w.text)
        if (emoji) {
          const e = emojiFor(w.text)
          if (e) w.text += ' ' + e
        }
      }
      const preset = getPreset()
      const portrait = preset.h > preset.w
      const size = portrait ? 0.036 : 0.055
      const y = preset.safe ? 0.68 : portrait ? 0.8 : 0.86
      const st = CAPTION_STYLES.find((s) => s.id === styleId)!.make(size)
      st.hlColor = styleId === 'box' ? '#ffd400' : '#ffe500'
      if (styleId === 'pop' && mode === 'karaoke') st.color = '#ffffff'
      const lines = parts.flatMap((p) => buildLines(p.words, getClip(p.clip.id) ?? p.clip, mode, maxWords)).sort((a, b) => a.start - b.start)
      addCaptionClips(lines, st, y)
      setMsg(`Added ${lines.length} caption clips from ${words.length} words${whole ? ` across ${parts.length} clips` : ''}. Click any caption on the timeline to fix a typo.`)
      setPhase('done')
    } catch (e) {
      setMsg((e as Error).message)
      setPhase('error')
    }
  }

  return (
    <div className="auto-box">
      <div className="group-h" style={{ marginTop: 0 }}>✨ Auto-captions</div>
      <div className="hint">
        {source ? (
          whole ? (
            <>Captions the <b>whole video</b> ({speaking.length} clips). Runs on your device; the speech model downloads once and is cached.</>
          ) : (
            <>Transcribes <b>{source.label}</b>{selClip === source ? '' : ' (select another clip to change)'}. Runs on your device; the speech model downloads once and is cached.</>
          )
        ) : (
          'Add a video or audio clip to the timeline first.'
        )}
      </div>
      {speaking.length > 1 && (
        <div className="chips">
          <button className={'chip' + (scope === 'all' ? ' on' : '')} onClick={() => setScope('all')} disabled={phase === 'run'}>Whole video</button>
          <button className={'chip' + (scope === 'one' ? ' on' : '')} onClick={() => setScope('one')} disabled={phase === 'run'}>Selected clip only</button>
        </div>
      )}
      <select className="full" value={model} onChange={(e) => setModel(e.target.value)} disabled={phase === 'run'}>
        {MODELS.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <select className="full" value={lang} onChange={(e) => setLang(e.target.value)} disabled={phase === 'run'}>
        {LANGS.map(([id, n]) => (
          <option key={id} value={id}>{n}</option>
        ))}
      </select>
      <label className="ochk"><input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} /> Translate the speech into English captions</label>
      {!translate && <label className="ochk"><input type="checkbox" checked={roman} onChange={(e) => setRoman(e.target.checked)} /> Hindi in English letters (Hinglish) – otherwise देवनागरी</label>}
      <label className="ochk"><input type="checkbox" checked={emoji} onChange={(e) => setEmoji(e.target.checked)} /> Add emoji after key words 🔥💰❤️</label>
      {lang === 'hindi' && model !== MODELS[2].id && <div className="hint">Tip: pick the Accurate · Small model for Hindi – the smaller ones make more mistakes.</div>}
      <div className="chips">
        {([['karaoke', 'Word highlight'], ['phrase', 'Phrases'], ['single', 'One word at a time']] as [CapMode, string][]).map(([id, n]) => (
          <button key={id} className={'chip' + (mode === id ? ' on' : '')} onClick={() => setMode(id)} disabled={phase === 'run'}>{n}</button>
        ))}
      </div>
      {mode !== 'single' && (
        <label className="row">
          <span className="lbl">Words / line</span>
          <input type="range" min={2} max={8} step={1} value={maxWords} onChange={(e) => setMaxWords(+e.target.value)} />
          <span className="val">{maxWords}</span>
        </label>
      )}
      <label className="row check">
        <input type="checkbox" checked={gpu} onChange={(e) => setGpu(e.target.checked)} />
        <span>Use GPU (faster, experimental)</span>
      </label>
      {phase === 'run' ? (
        <>
          <div className="progress"><div className="progress-in" style={{ width: `${pct ?? 8}%` }} /></div>
          <div className="hint">{status}{pct !== undefined ? ` ${Math.round(pct)}%` : ''}</div>
          <button className="btn full" onClick={() => (sig.current.cancelled = true)}>Cancel</button>
        </>
      ) : (
        <button className="btn primary full" disabled={!source} onClick={run}>Generate captions</button>
      )}
      {msg && <div className={'hint' + (phase === 'error' ? ' warn' : '')}>{msg}</div>}
      <div className="hint">Style below applies. Hindi/Urdu come out in native script, not Roman letters. Long videos take a while on CPU.</div>
    </div>
  )
}

function SrtButton() {
  const n = useStore((s) => s.project.clips.filter((c) => c.kind === 'text').length)
  return (
    <button
      className="btn full"
      disabled={!n}
      onClick={() => {
        const srt = buildSrt()
        if (!srt) return setUi({ toast: 'No text clips to export' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(new Blob([srt], { type: 'text/plain' }))
        a.download = `${getState().projectName || 'captions'}.srt`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      }}
    >
      ⬇ Download subtitles (.srt)
    </button>
  )
}

function CaptionTab() {
  const [txt, setTxt] = useState('')
  const [style, setStyle] = useState('pop')
  const [total, setTotal] = useState(() => Math.min(120, Math.max(2, Math.round(projectDuration() - engine.time)) || 10))
  const [msg, setMsg] = useState('')
  const make = () => {
    const preset = getPreset()
    const portrait = preset.h > preset.w
    const size = portrait ? 0.036 : 0.055
    const y = preset.safe ? 0.68 : portrait ? 0.8 : 0.86
    const st = CAPTION_STYLES.find((s) => s.id === style)!.make(size)
    const lines: { text: string; start: number; dur: number }[] = []
    if (txt.includes('-->')) {
      for (const block of txt.replace(/\r/g, '').split(/\n\s*\n/)) {
        const ls = block.split('\n').filter(Boolean)
        const ti = ls.findIndex((l) => l.includes('-->'))
        if (ti < 0) continue
        const [a, b] = ls[ti].split('-->')
        const s = parseTs(a)
        const e = parseTs(b)
        const text = ls.slice(ti + 1).join('\n').trim()
        if (text && !isNaN(s) && !isNaN(e) && e > s) lines.push({ text, start: s, dur: e - s })
      }
    } else {
      const parts = txt.split('\n').map((l) => l.trim()).filter(Boolean)
      const words = parts.map((p) => Math.max(1, p.split(/\s+/).length))
      const sum = words.reduce((a, b) => a + b, 0)
      let t = engine.time
      parts.forEach((p, i) => {
        const d = (words[i] / sum) * total
        lines.push({ text: p, start: t, dur: d })
        t += d
      })
    }
    if (!lines.length) {
      setMsg('Nothing to add – paste one caption per line, or an .srt file’s text.')
      return
    }
    addCaptionClips(lines, st, y)
    setMsg(`Added ${lines.length} caption${lines.length > 1 ? 's' : ''} on the top overlay track.`)
  }
  return (
    <>
      <div className="chips">
        <span className="hint" style={{ alignSelf: 'center' }}>Style:</span>
        {CAPTION_STYLES.map((s) => (
          <button key={s.id} className={'chip' + (style === s.id ? ' on' : '')} onClick={() => setStyle(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      <AutoCaptions styleId={style} />
      <SrtButton />
      <div className="group-h">Or paste a script</div>
      <div className="hint">
        Paste a script with <b>one caption per line</b>, or paste an <b>.srt</b>. Lines are timed from the playhead across the length you set below.
      </div>
      <textarea
        className="full"
        rows={8}
        placeholder={'Wait for it…\nThis changes everything\nSubscribe for more'}
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
      />
      {!txt.includes('-->') && (
        <label className="row">
          <span className="lbl">Total length</span>
          <input type="range" min={2} max={120} step={1} value={total} onChange={(e) => setTotal(+e.target.value)} />
          <span className="val">{total}s</span>
        </label>
      )}
      <button className="btn primary full" onClick={make}>
        Create captions
      </button>
      {msg && <div className="hint">{msg}</div>}
    </>
  )
}

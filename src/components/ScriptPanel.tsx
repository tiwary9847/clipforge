import { builtinAI } from '../plan'
import { useRef, useState } from 'react'
import { setUi } from '../store'
import { Scene, scriptToVideo, splitScript, writeScript } from '../script2video'
import { VOICES } from '../pro'
import { isPro } from '../plan'

const toast = (m: string) => setUi({ toast: m })

export function ScriptToVideo() {
  const [script, setScript] = useState('')
  const [scenes, setScenes] = useState<Scene[] | null>(null)
  const [topic, setTopic] = useState('')
  const [lang, setLang] = useState<'hinglish' | 'english' | 'hindi'>('hinglish')
  const [secs, setSecs] = useState(45)
  const [voice, setVoice] = useState('kokoro:am_michael')
  const [stock, setStock] = useState<'pexels' | 'pixabay' | 'none'>('pexels')
  const [caps, setCaps] = useState(true)
  const [busy, setBusy] = useState('')
  const sig = useRef({ cancelled: false })
  const prov = (localStorage.getItem('clipforge-ai-prov') as 'gemini' | 'claude') || 'gemini'
  const key = localStorage.getItem('clipforge-ai-key') ?? ''
  const list = scenes ?? (script.trim() ? splitScript(script) : [])
  return (
    <>
      <div className="hint">Paste your script (or let the AI write one) – you get a voiced video with matching stock clips and captions.</div>
      <details className="chap">
        <summary>✨ Let the AI write it {key ? `(${prov === 'gemini' ? 'Gemini' : 'Claude'})` : builtinAI() ? '(built-in AI · Pro)' : '(needs your key or Pro)'}</summary>
        {!key && !builtinAI() && <div className="hint">Add a free Gemini key first in Tools → Title, description &amp; hashtags → AI writer.</div>}
        <div className="osearch">
          <input placeholder="Topic, e.g. 5 street foods of Old Delhi" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="chips">
          {([['hinglish', 'Hinglish'], ['english', 'English'], ['hindi', 'हिन्दी']] as const).map(([id, n]) => (
            <button key={id} className={'chip' + (lang === id ? ' on' : '')} onClick={() => setLang(id)}>{n}</button>
          ))}
          {[30, 45, 60, 90].map((s) => (
            <button key={s} className={'chip' + (secs === s ? ' on' : '')} onClick={() => setSecs(s)}>{s}s</button>
          ))}
        </div>
        <button
          className="btn full"
          disabled={(!key && !builtinAI()) || !topic.trim() || !!busy}
          onClick={async () => {
            setBusy('Writing…')
            try {
              const sc = await writeScript(prov, key, topic, lang, secs)
              setScenes(sc)
              setScript(sc.map((s) => s.text).join('\n'))
            } catch (e) {
              toast((e as Error).message)
            }
            setBusy('')
          }}
        >
          ✍️ Write the script
        </button>
      </details>
      <textarea className="full desc" rows={6} placeholder="Your script… one line per scene works best." value={script} onChange={(e) => { setScript(e.target.value); setScenes(null) }} />
      {list.length > 0 && <div className="hint">{list.length} scenes · footage keywords: {list.slice(0, 4).map((s) => s.keywords || '–').join(', ')}{list.length > 4 ? '…' : ''}</div>}
      <label className="row2">
        <span>Voice</span>
        <select value={voice} onChange={(e) => setVoice(e.target.value)}>
          {VOICES.filter((v) => !v.pro || isPro()).map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </label>
      <div className="chips">
        {([['pexels', '🎬 Pexels clips'], ['pixabay', '🎬 Pixabay clips'], ['none', '🎨 Colour backgrounds']] as const).map(([id, n]) => (
          <button key={id} className={'chip' + (stock === id ? ' on' : '')} onClick={() => setStock(id)}>{n}</button>
        ))}
      </div>
      <label className="ochk"><input type="checkbox" checked={caps} onChange={(e) => setCaps(e.target.checked)} /> Add captions</label>
      {busy ? (
        <>
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
              toast(await scriptToVideo(list, { voice, stock, captions: caps }, (m) => setBusy(m), sig.current))
            } catch (e) {
              toast((e as Error).message)
            }
            setBusy('')
          }}
        >
          🎬 Make the video
        </button>
      )}
    </>
  )
}

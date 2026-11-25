import { useEffect, useRef, useState } from 'react'
import {
  BUILTIN_RECIPES,
  Recipe,
  RunReport,
  SCHEDULE_LABEL,
  STEP_LABEL,
  STEP_ORDER,
  Schedule,
  StepId,
  StepResult,
  canYouTube,
  deleteRecipe,
  loadRecipes,
  makeFiles,
  postToYouTube,
  publishTime,
  runAutopilot,
  saveRecipe,
  undoAutopilot,
  zipKit,
} from '../autopilot'
import { KIT_TARGETS, KitItem, KitTarget } from '../uploadkit'
import { CAPTION_STYLES, importAndPlace } from './MediaPanel'
import { MOODS } from '../musicgen'
import { getState, resetProject, setUi, useStore } from '../store'
import { requirePro, usePro } from '../plan'
import { engine } from '../engine'

const toast = (m: string) => setUi({ toast: m })
const safe = (s: string) => s.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'video'
function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}
const ICON: Record<StepResult['state'], string> = { done: '✅', skipped: '➖', failed: '⚠️' }

/* ---------------- recipe editor ---------------- */

function RecipeEditor({ r, set }: { r: Recipe; set: (r: Recipe) => void }) {
  const tog = (s: StepId) => set({ ...r, steps: { ...r.steps, [s]: !r.steps[s] } })
  const out = (t: KitTarget) => set({ ...r, outputs: r.outputs.includes(t) ? r.outputs.filter((x) => x !== t) : [...r.outputs, t] })
  return (
    <div className="ap-edit">
      <div className="ap-steps">
        {STEP_ORDER.map((s) => (
          <label key={s} className="ochk">
            <input type="checkbox" checked={!!r.steps[s]} onChange={() => tog(s)} /> {STEP_LABEL[s]}
          </label>
        ))}
      </div>
      <div className="ap-grid">
        <label>
          <span>Format</span>
          <select value={r.preset} onChange={(e) => set({ ...r, preset: e.target.value })}>
            <option value="shorts">Shorts / Reels 9:16</option>
            <option value="yt">YouTube 16:9</option>
            <option value="igportrait">Instagram 4:5</option>
            <option value="square">Square 1:1</option>
          </select>
        </label>
        <label>
          <span>Caption style</span>
          <select value={r.captionStyle} onChange={(e) => set({ ...r, captionStyle: e.target.value })}>
            {CAPTION_STYLES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span>Music mood</span>
          <select value={r.mood} onChange={(e) => set({ ...r, mood: e.target.value as Recipe['mood'] })}>
            {MOODS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>
          <span>Zooms</span>
          <select value={r.zoom} onChange={(e) => set({ ...r, zoom: e.target.value as Recipe['zoom'] })}>
            <option value="subtle">Subtle</option>
            <option value="punchy">Punchy</option>
            <option value="crazy">Crazy</option>
          </select>
        </label>
        <label>
          <span>Sound effects</span>
          <select value={r.sfx} onChange={(e) => set({ ...r, sfx: e.target.value as Recipe['sfx'] })}>
            <option value="few">A few</option>
            <option value="normal">Normal</option>
            <option value="lots">Lots</option>
          </select>
        </label>
        <label className="wide">
          <span>About this video (for titles, description and hashtags)</span>
          <input value={r.about ?? ''} maxLength={160} placeholder="e.g. 2 & 3 BHK flats in Noida Sector 144, near Oxygen Business Park" onChange={(e) => set({ ...r, about: e.target.value })} />
        </label>
        <label className="wide">
          <span>Ending text (call-to-action)</span>
          <input value={r.cta} maxLength={60} placeholder="e.g. Call / WhatsApp 98XXXXXXXX" onChange={(e) => set({ ...r, cta: e.target.value })} />
        </label>
      </div>
      <div className="ap-row">
        <span>Make files for</span>
        {KIT_TARGETS.map((t) => (
          <label key={t.id} className="ochk"><input type="checkbox" checked={r.outputs.includes(t.id)} onChange={() => out(t.id)} /> {t.emoji} {t.name}</label>
        ))}
      </div>
      <div className="ap-row">
        <label className="ochk"><input type="checkbox" checked={r.youtube.on} onChange={(e) => set({ ...r, youtube: { ...r.youtube, on: e.target.checked } })} /> ▶️ Post to YouTube</label>
        {r.youtube.on && (
          <>
            <select value={r.youtube.target} onChange={(e) => set({ ...r, youtube: { ...r.youtube, target: e.target.value as KitTarget } })}>
              {KIT_TARGETS.filter((t) => r.outputs.includes(t.id) && t.id !== 'reels').map((t) => <option key={t.id} value={t.id}>{t.name} file</option>)}
            </select>
            <select value={r.youtube.when} onChange={(e) => set({ ...r, youtube: { ...r.youtube, when: e.target.value as Schedule } })}>
              {Object.entries(SCHEDULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {r.youtube.when === 'now' && (
              <select value={r.youtube.privacy} onChange={(e) => set({ ...r, youtube: { ...r.youtube, privacy: e.target.value as Recipe['youtube']['privacy'] } })}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            )}
          </>
        )}
      </div>
      {r.youtube.on && !canYouTube() && <div className="hint warn">YouTube posting needs your Google OAuth client ID once – Export → “Upload straight to YouTube” explains it. Until then Autopilot makes the files and skips posting.</div>}
      {r.youtube.on && r.youtube.when !== 'now' && <div className="hint">Uploads as private and YouTube publishes it at {new Date(publishTime(r.youtube.when)!).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</div>}
    </div>
  )
}

/* ---------------- dialog ---------------- */

interface QItem { file: File; state: 'waiting' | 'working' | 'done' | 'failed'; msg: string; link?: string }

export function AutopilotDialog({ onClose }: { onClose: () => void }) {
  const pro = usePro()
  const hasVideo = useStore((s) => s.project.clips.some((c) => c.track === 'v1' && c.kind === 'video'))
  const [tab, setTab] = useState<'one' | 'batch'>('one')
  const [recipes, setRecipes] = useState(loadRecipes)
  const [rid, setRid] = useState(() => localStorage.getItem('clipforge-recipe') || 'talk')
  const recipe = recipes.find((x) => x.id === rid) ?? recipes[0]
  const [draft, setDraft] = useState<Recipe>(recipe)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState('')
  const [prog, setProg] = useState(0)
  const [rep, setRep] = useState<RunReport | null>(null)
  const [kit, setKit] = useState<KitItem[] | null>(null)
  const [yt, setYt] = useState('')
  const [queue, setQueue] = useState<QItem[]>([])
  const ctl = useRef({ cancelled: false })
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setDraft(recipe)
    localStorage.setItem('clipforge-recipe', recipe.id)
  }, [rid]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [busy, onClose])
  const say = (m: string, f?: number) => {
    setBusy(m)
    if (f != null) setProg(f)
  }
  const changed = JSON.stringify(draft) !== JSON.stringify(recipe)
  const persist = () => {
    const saved = saveRecipe({ ...draft, name: draft.builtin ? `${draft.name} (mine)` : draft.name })
    setRecipes(loadRecipes())
    setRid(saved.id)
    setEditing(false)
    toast(`Recipe “${saved.name}” saved.`)
  }

  const runOne = async () => {
    if (!requirePro('Autopilot is part of ClipForge Pro.')) return
    ctl.current = { cancelled: false }
    setRep(null)
    setKit(null)
    setYt('')
    try {
      const r = await runAutopilot(draft, say, ctl.current)
      setRep(r)
      toast(`🚀 Autopilot finished – ${r.steps.filter((s) => s.state === 'done').length} steps done. Check the video, then make the files.`)
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const files = async () => {
    ctl.current = { cancelled: false }
    try {
      const name = safe(getState().projectName)
      const items = await makeFiles(draft, name, say, ctl.current)
      setKit(items)
      download(await zipKit(items, name), `${name}-autopilot.zip`)
      if (draft.youtube.on && canYouTube()) {
        say('Posting to YouTube…', 0)
        const url = await postToYouTube(draft, items, say)
        setYt(url)
      }
      toast('📦 Files ready – the zip has the videos, thumbnails and all the text.')
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }

  const runBatch = async () => {
    if (!requirePro('Batch Autopilot is part of ClipForge Pro.')) return
    if (!queue.length) return
    if (getState().project.clips.length && !confirm('Batch mode edits each video in its own fresh project. Your current timeline will be replaced (save a version first if you need it). Continue?')) return
    ctl.current = { cancelled: false }
    const q = [...queue]
    for (let i = 0; i < q.length; i++) {
      if (ctl.current.cancelled) break
      if (q[i].state === 'done') continue
      const upd = (p: Partial<QItem>) => {
        q[i] = { ...q[i], ...p }
        setQueue([...q])
      }
      upd({ state: 'working', msg: 'Opening…' })
      try {
        resetProject()
        setUi({ projectName: safe(q[i].file.name) })
        await importAndPlace([q[i].file])
        await new Promise((r) => setTimeout(r, 300))
        const r = await runAutopilot(draft, (m) => upd({ msg: m }), ctl.current)
        const name = safe(q[i].file.name)
        const items = await makeFiles(draft, name, (m) => upd({ msg: m }), ctl.current)
        download(await zipKit(items, name), `${name}-autopilot.zip`)
        let link: string | undefined
        if (draft.youtube.on && canYouTube()) link = await postToYouTube(draft, items, (m) => upd({ msg: m }))
        const done = r.steps.filter((s) => s.state === 'done').length
        upd({ state: 'done', msg: `${done} steps · ${items.length} file sets${r.score != null ? ` · score ${r.score}` : ''}${link ? ' · on YouTube' : ''}`, link })
      } catch (e) {
        upd({ state: 'failed', msg: (e as Error).message })
      }
    }
    setBusy('')
    engine.requestRender()
    toast(ctl.current.cancelled ? 'Batch stopped.' : 'Batch finished – one zip per video is in your downloads.')
  }

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal ap-modal">
        <div className="ap-head">
          <h3>🚀 Autopilot {!pro && <span className="pro-mini">PRO</span>}</h3>
          <div className="pro-tabs">
            <button className={'chip' + (tab === 'one' ? ' on' : '')} onClick={() => setTab('one')}>This video</button>
            <button className={'chip' + (tab === 'batch' ? ' on' : '')} onClick={() => setTab('batch')}>Batch – many videos</button>
          </div>
        </div>
        <div className="hint">
          One tap does the whole edit – pauses, bad takes, captions, hook, zooms, sound effects, music, logo, ending text, loudness, retention fixes – then makes the Shorts / YouTube / Reels files with titles, hashtags and thumbnails{draft.youtube.on ? ' and posts to YouTube' : ''}.
        </div>

        <div className="ap-recipes">
          {recipes.map((x) => (
            <button key={x.id} className={'ap-recipe' + (x.id === recipe.id ? ' on' : '')} disabled={!!busy} onClick={() => setRid(x.id)}>
              <span>{x.emoji}</span>
              <b>{x.name}</b>
              <small>{STEP_ORDER.filter((s) => x.steps[s]).length} steps{x.youtube.on ? ' · YouTube' : ''}</small>
            </button>
          ))}
        </div>
        <div className="ap-row">
          <button className="link" onClick={() => setEditing(!editing)}>{editing ? '▾ Hide recipe settings' : '▸ Change what this recipe does'}</button>
          {changed && <button className="btn sm" onClick={persist}>💾 Save as my recipe</button>}
          {!recipe.builtin && (
            <button className="btn sm ghost" onClick={() => { deleteRecipe(recipe.id); setRecipes(loadRecipes()); setRid(BUILTIN_RECIPES[0].id) }}>Delete recipe</button>
          )}
        </div>
        {editing && (
          <>
            <input className="full" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Recipe name" />
            <RecipeEditor r={draft} set={setDraft} />
          </>
        )}

        {tab === 'one' ? (
          <>
            {!rep && (
              <button className="btn primary full big-save" disabled={!!busy || !hasVideo} onClick={runOne}>
                {busy || (hasVideo ? `🚀 Run “${draft.name}” on this video` : 'Add a video first')}
              </button>
            )}
            {busy && <div className="ap-prog"><i style={{ width: `${Math.round(prog * 100)}%` }} /></div>}
            {busy && <button className="btn sm ghost" onClick={() => (ctl.current.cancelled = true)}>Stop</button>}
            {rep && (
              <div className="ap-report">
                {rep.steps.map((s, i) => (
                  <div key={i} className={'ap-step ' + s.state}>
                    <span>{ICON[s.state]}</span>
                    <b>{s.label}</b>
                    <small>{s.msg}</small>
                  </div>
                ))}
                <div className="hint">Play it through. Anything you don’t like can be changed or deleted like any other clip.</div>
                <div className="chips">
                  <button className="btn primary" disabled={!!busy} onClick={files}>{busy || `📦 Make the files${draft.youtube.on && canYouTube() ? ' + post to YouTube' : ''}`}</button>
                  <button className="btn" disabled={!!busy} onClick={() => { undoAutopilot(rep); setRep(null); setKit(null); toast('Autopilot undone – your video is back as it was.') }}>↩ Undo Autopilot</button>
                  <button className="btn ghost" disabled={!!busy} onClick={onClose}>Review on the timeline</button>
                </div>
                {kit && <div className="hint pro-ok">✓ {kit.length} file set{kit.length === 1 ? '' : 's'} saved as a zip in your downloads.</div>}
                {yt && <div className="hint pro-ok">✓ On YouTube: <a href={yt} target="_blank" rel="noreferrer">{yt}</a>{draft.youtube.when !== 'now' ? ` (goes public ${SCHEDULE_LABEL[draft.youtube.when].toLowerCase()})` : ''}</div>}
              </div>
            )}
          </>
        ) : (
          <>
            <input ref={fileRef} type="file" hidden multiple accept="video/*" onChange={(e) => { const f = Array.from(e.target.files ?? []); setQueue((q) => [...q, ...f.map((file) => ({ file, state: 'waiting' as const, msg: '' }))]); e.target.value = '' }} />
            <button className="btn full" disabled={!!busy} onClick={() => fileRef.current?.click()}>＋ Add videos to the queue</button>
            {queue.length > 0 && (
              <div className="ap-queue">
                {queue.map((q, i) => (
                  <div key={i} className={'ap-q ' + q.state}>
                    <span>{q.state === 'done' ? '✅' : q.state === 'failed' ? '⚠️' : q.state === 'working' ? '⏳' : '🎬'}</span>
                    <b>{q.file.name}</b>
                    <small>{q.msg}{q.link && <> · <a href={q.link} target="_blank" rel="noreferrer">open</a></>}</small>
                    {q.state === 'waiting' && !busy && <button className="ico sm" title="Remove" onClick={() => setQueue(queue.filter((_, j) => j !== i))}>✕</button>}
                  </div>
                ))}
              </div>
            )}
            <div className="hint">Each video gets its own fresh project, the whole recipe, and its own zip (videos + thumbnails + titles/hashtags). Keep this tab open while it works – it runs on your device.</div>
            <div className="chips">
              <button className="btn primary" disabled={!!busy || !queue.some((q) => q.state !== 'done')} onClick={() => { setBusy('Working…'); void runBatch() }}>
                {busy ? 'Working…' : `🚀 Run on ${queue.filter((q) => q.state !== 'done').length} video${queue.filter((q) => q.state !== 'done').length === 1 ? '' : 's'}`}
              </button>
              {busy && <button className="btn ghost" onClick={() => (ctl.current.cancelled = true)}>Stop after this video</button>}
            </div>
          </>
        )}
        <div className="modal-actions">
          <button className="btn" disabled={!!busy} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

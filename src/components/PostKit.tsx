// The posting side of export: where it's going, a quick "ready to post?" score, and after saving –
// "Post to …" buttons, a caption + hashtags kit and a cover-photo maker.
import { useEffect, useMemo, useState } from 'react'
import { getPreset, getState, projectDuration, setProject, setUi } from '../store'
import { engine } from '../engine'
import type { Check } from '../postcheck'
import { useT } from '../i18n'

export type Dest = 'reels' | 'status' | 'shorts' | 'fb' | 'save'
export const DESTS: { id: Dest; name: string; icon: string; max: number; app: string }[] = [
  { id: 'reels', name: 'Instagram Reels', icon: '📸', max: 180, app: 'Instagram' },
  { id: 'status', name: 'WhatsApp Status', icon: '🟢', max: 60, app: 'WhatsApp' },
  { id: 'shorts', name: 'YouTube Shorts', icon: '▶️', max: 180, app: 'YouTube' },
  { id: 'fb', name: 'Facebook Reels', icon: '📘', max: 90, app: 'Facebook' },
  { id: 'save', name: 'Just save', icon: '💾', max: 0, app: '' },
]
const KEY = 'clipforge-post-dest'
export const lastDest = (): Dest => (localStorage.getItem(KEY) as Dest) || 'reels'
export const rememberDest = (d: Dest) => localStorage.setItem(KEY, d)
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Phones with little memory or few cores export faster at 720p. */
export const slowDevice = () => ((navigator as any).deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4

/** WhatsApp only shows the first 60 s of a status – split longer videos into parts that cut at a quiet moment near the limit. */
export function statusParts(dur: number, max = 60): [number, number][] {
  if (dur <= max + 0.5) return [[0, dur]]
  const n = Math.ceil(dur / max)
  const len = dur / n
  return Array.from({ length: n }, (_, i) => [i * len, i === n - 1 ? dur : (i + 1) * len] as [number, number])
}

export function DestPicker({ dest, setDest, musicOff, setMusicOff, split, setSplit, light, setLight }: {
  dest: Dest; setDest: (d: Dest) => void; musicOff: boolean; setMusicOff: (v: boolean) => void; split: boolean; setSplit: (v: boolean) => void; light: boolean; setLight: (v: boolean) => void
}) {
  const t = useT()
  const dur = projectDuration()
  const P = getPreset()
  const portrait = P.h > P.w
  const d = DESTS.find((x) => x.id === dest)!
  const hasMusic = getState().project.clips.some((c) => c.kind === 'audio')
  const parts = statusParts(dur)
  return (
    <div className="dest">
      <div className="dest-h">{t('Where will you post it?')}</div>
      <div className="dest-row">
        {DESTS.map((x) => (
          <button key={x.id} className={dest === x.id ? 'on' : ''} onClick={() => { setDest(x.id); rememberDest(x.id) }}>
            <span>{x.icon}</span>{t(x.name)}
          </button>
        ))}
      </div>
      {dest === 'status' && dur > 60.5 && (
        <label className="ochk"><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> {t('Split into')} {parts.length} {t('parts of up to 60 s')} <small className="hint">({fmt(dur)} – {t('WhatsApp cuts statuses after 60 s')})</small></label>
      )}
      {dest !== 'save' && dest !== 'status' && d.max && dur > d.max && <div className="hint warn">⚠ {d.name} {t('allows up to')} {fmt(d.max)}; {t('yours is')} {fmt(dur)}. {t('Trim it or the app will ask you to.')}</div>}
      {dest !== 'save' && !portrait && (
        <div className="hint warn">⚠ {t('This is a wide video – it will show small with black bars.')} <button className="link" onClick={() => { setProject({ presetId: 'shorts' }); setTimeout(() => engine.render(), 0); setUi({ toast: 'Switched to vertical 9:16 – check that nothing important is cut off' }) }}>{t('Make it vertical 9:16')}</button></div>
      )}
      {hasMusic && dest !== 'save' && (
        <label className="ochk"><input type="checkbox" checked={musicOff} onChange={(e) => setMusicOff(e.target.checked)} /> {t('Music off – I’ll add a trending sound in')} {d.app || 'the app'} <small className="hint">({t('your cuts stay on the beat; voices and sound effects stay')})</small></label>
      )}
      <div className="dest-q">
        <span>{t('Quality')}</span>
        <div className="seg">
          <button className={!light ? 'on' : ''} onClick={() => setLight(false)}>HD 1080p</button>
          <button className={light ? 'on' : ''} onClick={() => setLight(true)}>{t('Light 720p · faster')}</button>
        </div>
      </div>
      {light && slowDevice() && <div className="hint">{t('Light is picked because this phone is slower – it saves 2–3× faster and still looks sharp on Instagram.')}</div>}
    </div>
  )
}

/** Quick score shown before saving; opens the full checker. */
export function QuickScore() {
  const t = useT()
  const [res, setRes] = useState<{ score: number; checks: Check[] } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    void import('../postcheck').then((m) => m.runChecks(() => {}, false)).then((r) => live && setRes(r)).catch(() => {})
    return () => { live = false }
  }, [])
  const [Full, setFull] = useState<null | (() => JSX.Element)>(null)
  if (!res) return null
  const bad = res.checks.filter((c) => c.ok === false)
  const col = res.score >= 80 ? '#16a34a' : res.score >= 55 ? '#c2410c' : '#dc2626'
  return (
    <div className="qscore">
      <button className="qs-head" onClick={async () => { if (!Full) { const m = await import('./PostPanels'); setFull(() => m.ReadyCheck) } setOpen(!open) }}>
        <span className="score" style={{ borderColor: col, color: col }}>{res.score}</span>
        <span>
          <b>{res.score >= 80 ? t('Ready to post! 🚀') : t('Ready to post?')}</b>
          <small>{bad.length ? bad.slice(0, 2).map((c) => c.title).join(' · ') : t('Hook, pace, captions and safe zone look good.')}</small>
        </span>
        <i>{open ? '▾' : '▸'}</i>
      </button>
      {open && Full && <div className="qs-body"><Full /></div>}
    </div>
  )
}

/* ---------------- after saving ---------------- */

async function shareFiles(files: File[], text: string): Promise<'shared' | 'copied' | 'none'> {
  if (text) await navigator.clipboard?.writeText(text).catch(() => {})
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, text })
      return 'shared'
    } catch {
      return 'none'
    }
  }
  return text ? 'copied' : 'none'
}
const WEB: Record<string, string> = { reels: 'https://www.instagram.com/', shorts: 'https://studio.youtube.com/', fb: 'https://www.facebook.com/reels/create', status: 'https://web.whatsapp.com/' }

export function PostButtons({ files, dest, caption }: { files: File[]; dest: Dest; caption: string }) {
  const t = useT()
  const d = DESTS.find((x) => x.id === dest)!
  const canFile = !!navigator.canShare?.({ files: files.slice(0, 1) })
  const go = async (list: File[], to: Dest) => {
    const r = await shareFiles(list, to === 'status' ? '' : caption)
    const app = DESTS.find((x) => x.id === to)!.app
    if (r === 'shared') setUi({ toast: to === 'status' ? `Pick WhatsApp → My status` : `Pick ${app}. The caption is copied – paste it there.` })
    else if (!canFile) {
      for (const f of list) {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(f)
        a.download = f.name
        a.click()
      }
      if (WEB[to]) window.open(WEB[to], '_blank', 'noopener')
      setUi({ toast: `Saved. ${caption ? 'Caption copied. ' : ''}Upload it in ${app || 'the app'} – it’s opening now.` })
    }
  }
  if (dest === 'save') return null
  return (
    <div className="post-btns">
      {dest === 'status' && files.length > 1 ? (
        files.map((f, i) => (
          <button key={f.name} className="btn primary post-main" onClick={() => void go([f], 'status')}>🟢 {t('Post part')} {i + 1}/{files.length} {t('to Status')}</button>
        ))
      ) : (
        <button className="btn primary post-main" onClick={() => void go(files, dest)}>{d.icon} {t('Post to')} {t(d.name)}</button>
      )}
      <div className="post-others">
        {DESTS.filter((x) => x.id !== dest && x.id !== 'save').map((x) => (
          <button key={x.id} className="btn sm" onClick={() => void go(x.id === 'status' ? files.slice(0, 1) : files.slice(0, 1), x.id)}>{x.icon} {x.app}</button>
        ))}
      </div>
      {!canFile && <div className="hint">{t('On a computer the video is downloaded and the site opens – upload it there.')}</div>}
    </div>
  )
}

/** Caption + hashtags + best time, made from your captions and project name. */
export function CaptionKit({ dest, onCaption }: { dest: Dest; onCaption: (c: string) => void }) {
  const t = useT()
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    void import('../uploadkit').then(({ kitMeta, kitSpoken }) => {
      const spoken = kitSpoken()
      const name = getState().projectName.trim()
      const plain = /^(my (first edit|reel|project)|untitled)/i.test(name) ? '' : name
      const base = [dest === 'shorts' ? '#Shorts' : dest === 'fb' ? '#facebookreels' : '#reels', '#viral', '#trending', '#india', '#reelsindia']
      let title = plain ? `${plain} ✨` : '✨'
      let tags = base
      if (spoken.length) {
        const m = kitMeta(spoken, plain)
        const k = dest === 'shorts' ? m.shorts : m.reels
        title = k.title
        tags = [...k.hashtags, ...base]
      } else if (plain) tags = [...plain.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3).map((w) => '#' + w.replace(/[^\p{L}\p{N}]/gu, '')), ...base]
      tags = tags.filter((x, i, a) => x.length > 1 && a.indexOf(x) === i).slice(0, 10)
      const cap = `${title}\n\n${tags.join(' ')}`
      setText(cap)
      onCaption(cap)
    })
  }, [dest])
  if (dest === 'save' || dest === 'status') return null
  return (
    <details className="kit" open>
      <summary>✍️ {t('Caption & hashtags')}</summary>
      <textarea rows={4} value={text} onChange={(e) => { setText(e.target.value); onCaption(e.target.value) }} />
      <div className="kit-row">
        <button className="btn sm" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? '✓ ' + t('Copied') : '📋 ' + t('Copy')}</button>
        <span className="hint">⏰ {t('Most Indian audiences are online 7–10 PM; weekends also 12–2 PM.')}</span>
      </div>
    </details>
  )
}

/** Cover photo for the reel (shows on your profile grid): pick a frame, add big text. */
export function CoverMaker() {
  const t = useT()
  const dur = projectDuration()
  const [at, setAt] = useState(Math.min(1, dur / 2))
  const [text, setText] = useState(getState().projectName)
  const [url, setUrl] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const make = useMemo(() => async (time: number, words: string) => {
    engine.seek(time)
    engine.render()
    await new Promise((r) => setTimeout(r, 250))
    const { kitThumb } = await import('../uploadkit')
    const b = await kitThumb('reels', words, '')
    setBlob(b)
    setUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b) })
  }, [])
  useEffect(() => {
    const h = setTimeout(() => void make(at, text), 350)
    return () => clearTimeout(h)
  }, [at, text])
  const name = `${getState().projectName.replace(/[^\w\- ]+/g, '').trim() || 'viralkaro'}-cover.jpg`
  return (
    <details className="kit cover">
      <summary>🖼 {t('Cover photo')}</summary>
      <div className="cover-grid">
        {url ? <img src={url} alt="Cover preview" /> : <div className="cover-ph" />}
        <div className="cover-ctl">
          <label>{t('Frame')}<input type="range" min={0} max={Math.max(0.1, dur - 0.05)} step={0.05} value={at} onChange={(e) => setAt(+e.target.value)} /></label>
          <label>{t('Text')}<input value={text} maxLength={40} onChange={(e) => setText(e.target.value)} /></label>
          <div className="kit-row">
            {blob && <a className="btn sm" href={url} download={name}>⬇ {t('Save cover')}</a>}
            {blob && navigator.canShare?.({ files: [new File([blob], name, { type: 'image/jpeg' })] }) && (
              <button className="btn sm" onClick={() => void navigator.share({ files: [new File([blob], name, { type: 'image/jpeg' })] }).catch(() => {})}>↗ {t('Share')}</button>
            )}
          </div>
          <div className="hint">{t('In Instagram: Edit cover → Add from camera roll.')}</div>
        </div>
      </div>
    </details>
  )
}

/* ---------- free: share the app → this video without the mark (once a day) ---------- */
const UKEY = 'clipforge-free-unmark'
export const unmarkUsedToday = () => localStorage.getItem(UKEY) === new Date().toDateString()
export const spendUnmark = () => localStorage.setItem(UKEY, new Date().toDateString())

export function ShareUnlock({ unlocked, setUnlocked }: { unlocked: boolean; setUnlocked: (v: boolean) => void }) {
  const t = useT()
  if (unmarkUsedToday() && !unlocked) return <div className="hint">{t('Free videos have a small “Made with ViralKaro” mark. You’ve used today’s free unlock – it comes back tomorrow, or get Pro.')}</div>
  if (unlocked) return <div className="hint pro-ok">✓ {t('Thanks for sharing! This video will be saved without the mark.')}</div>
  const url = import.meta.env.VITE_SITE_URL as string
  const share = async () => {
    const text = 'I edit my reels with ViralKaro – free, works in Hindi & Hinglish, and videos never leave your phone 👉'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'ViralKaro', text, url })
      } else {
        await navigator.clipboard?.writeText(`${text} ${url}`)
        setUi({ toast: 'Link copied – paste it to a friend or in your group' })
      }
      setUnlocked(true)
    } catch {
      /* closed the share sheet without sharing */
    }
  }
  return (
    <button className="unlock" onClick={() => void share()}>
      <span>🎁</span>
      <span><b>{t('Remove the mark from this video – free')}</b><small>{t('Share ViralKaro with a friend or group (once a day)')}</small></span>
    </button>
  )
}

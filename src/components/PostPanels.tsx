import { builtinAI } from '../plan'
import { useState } from 'react'
import { setUi } from '../store'
import type { Check } from '../postcheck'
import type { Retake } from '../retakes'
import type { ChatStyle, ReplyStyle } from '../social'

const toast = (m: string) => setUi({ toast: m })
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

/* ---------- Ready to post? ---------- */

export function ReadyCheck() {
  const [res, setRes] = useState<{ score: number; checks: Check[] } | null>(null)
  const [busy, setBusy] = useState('')
  const check = async () => {
    setBusy('Checking…')
    try {
      const { runChecks } = await import('../postcheck')
      setRes(await runChecks(setBusy))
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const fix = async (list: Check[]) => {
    for (const c of list) {
      if (!c.fix) continue
      setBusy(c.fix.label.replace(/^\S+\s/, '') + '…')
      try {
        toast(await c.fix.run(setBusy))
      } catch (e) {
        toast((e as Error).message)
      }
    }
    await check()
  }
  const col = !res ? '' : res.score >= 80 ? '#16a34a' : res.score >= 55 ? '#d97706' : '#dc2626'
  const fixable = res?.checks.filter((c) => c.ok === false && c.fix) ?? []
  return (
    <>
      <div className="hint">Checks your video like a Shorts/Reels coach before you post – hook, pace, captions, loudness, safe zone – and fixes most things in one tap.</div>
      <button className="btn full primary" disabled={!!busy} onClick={check}>{busy || (res ? '🔁 Check again' : '✅ Check my video')}</button>
      {res && (
        <>
          <div className="score-row">
            <span className="score" style={{ borderColor: col, color: col }}>{res.score}</span>
            <span className="hint">{res.score >= 80 ? 'Ready to post! 🚀' : res.score >= 55 ? 'Almost there – fix the orange ones.' : 'A few quick fixes will help a lot.'}</span>
          </div>
          {res.checks.map((c) => (
            <div key={c.id} className={'chk-row' + (c.ok === false ? ' bad' : '')}>
              <span className="ic">{c.ok === null ? '➖' : c.ok ? '✅' : '⚠️'}</span>
              <div className="tx">
                <b>{c.title}</b>
                <small>{c.detail}</small>
              </div>
              {c.ok === false && c.fix && (
                <button className="btn sm" disabled={!!busy} onClick={() => fix([c])}>{c.fix.label}</button>
              )}
            </div>
          ))}
          {fixable.length > 1 && <button className="btn full" disabled={!!busy} onClick={() => fix(fixable)}>✨ Fix all ({fixable.length})</button>}
        </>
      )}
    </>
  )
}

/* ---------- bad takes ---------- */

export function BadTakes() {
  const [list, setList] = useState<Retake[] | null>(null)
  const [off, setOff] = useState<Set<number>>(new Set())
  return (
    <>
      <div className="hint">Messed up a line and said it again? This finds the repeats in your captions and keeps only your last try – everything else moves up with it.</div>
      <button
        className="btn full"
        onClick={async () => {
          try {
            const { findRetakes } = await import('../retakes')
            const r = findRetakes()
            setList(r)
            setOff(new Set())
            if (!r.length) toast('No bad takes found – nice clean recording!')
          } catch (e) {
            toast((e as Error).message)
          }
        }}
      >
        🔎 Find bad takes
      </button>
      {list && list.length > 0 && (
        <>
          {list.map((r, i) => (
            <label key={i} className="take-row">
              <input type="checkbox" checked={!off.has(i)} onChange={() => setOff((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
              <div>
                <small>{fmt(r.from)} · {(r.to - r.from).toFixed(1)} s</small>
                <div className="bad">✗ {r.bad}</div>
                <div className="good">✓ {r.good}</div>
              </div>
            </label>
          ))}
          <button
            className="btn full primary"
            disabled={off.size === list.length}
            onClick={async () => {
              const { removeRetakes } = await import('../retakes')
              toast(removeRetakes(list.filter((_, i) => !off.has(i))))
              setList(null)
            }}
          >
            ✂️ Remove {list.length - off.size} bad take{list.length - off.size === 1 ? '' : 's'}
          </button>
        </>
      )}
    </>
  )
}

/* ---------- hook lines ---------- */

export function HookWriter() {
  const [hooks, setHooks] = useState<string[]>([])
  const [own, setOwn] = useState('')
  const [busy, setBusy] = useState('')
  const [prov, setProv] = useState<'gemini' | 'claude'>(() => (localStorage.getItem('clipforge-ai-prov') as 'gemini' | 'claude') || 'gemini')
  const [key, setKey] = useState(() => localStorage.getItem('clipforge-ai-key') ?? '')
  const use = async (h: string) => {
    const { addHookText } = await import('../hooks')
    toast(addHookText(h))
  }
  return (
    <>
      <div className="hint">Writes 3 opening lines from what you say (needs captions) and puts the one you pick in big text on the first 2½ seconds, with a whoosh.</div>
      <button
        className="btn full"
        onClick={async () => {
          try {
            const { quickHooks } = await import('../hooks')
            setHooks(quickHooks())
          } catch (e) {
            toast((e as Error).message)
          }
        }}
      >
        ✍️ Quick hook ideas (free, offline)
      </button>
      <details className="chap">
        <summary>✨ Better hooks with an AI writer (your own key)</summary>
        <div className="hint">Google Gemini has a free key at aistudio.google.com. What you say in the video is sent to that company to write the hooks.</div>
        <div className="chips">
          <button className={'chip' + (prov === 'gemini' ? ' on' : '')} onClick={() => setProv('gemini')}>Gemini</button>
          <button className={'chip' + (prov === 'claude' ? ' on' : '')} onClick={() => setProv('claude')}>Claude</button>
        </div>
        <div className="osearch">
          <input type="password" placeholder="API key" value={key} onChange={(e) => setKey(e.target.value)} />
          <button
            className="btn sm primary"
            disabled={(!key && !builtinAI()) || !!busy}
            onClick={async () => {
              if (key) localStorage.setItem('clipforge-ai-key', key)
              localStorage.setItem('clipforge-ai-prov', prov)
              setBusy('Writing…')
              try {
                const { aiHooks } = await import('../hooks')
                setHooks(await aiHooks(prov, key))
              } catch (e) {
                toast((e as Error).message)
              }
              setBusy('')
            }}
          >
            {busy || 'Write hooks'}
          </button>
        </div>
      </details>
      {hooks.map((h, i) => (
        <div key={i} className="wa-part">
          <span>{h}</span>
          <button className="btn sm primary" onClick={() => use(h)}>Use</button>
        </div>
      ))}
      <div className="osearch">
        <input placeholder="…or type your own hook" value={own} onChange={(e) => setOwn(e.target.value)} />
        <button className="btn sm" disabled={!own.trim()} onClick={() => use(own.trim())}>Use</button>
      </div>
    </>
  )
}

/* ---------- reply to a comment ---------- */

export function ReplySticker() {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [style, setStyle] = useState<ReplyStyle>('light')
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div className="hint">The “Replying to @name’s comment” bubble for videos that answer a viewer. It’s added at the playhead.</div>
      <div className="osearch">
        <input placeholder="@name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <textarea className="full" rows={2} placeholder="The comment, e.g. Bhai Goa ka budget kitna tha?" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="chips">
        {([['light', '⬜ Light'], ['dark', '⬛ Dark'], ['glass', '🔲 Glass']] as const).map(([id, n]) => (
          <button key={id} className={'chip' + (style === id ? ' on' : '')} onClick={() => setStyle(id)}>{n}</button>
        ))}
      </div>
      <button
        className="btn full"
        disabled={busy || !text.trim()}
        onClick={async () => {
          setBusy(true)
          try {
            const { addReplySticker } = await import('../social')
            toast(await addReplySticker(name, text, style))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy(false)
        }}
      >
        💬 Add comment bubble
      </button>
    </>
  )
}

/* ---------- chat story ---------- */

const SAMPLE = `Rahul: Bhai kal Goa chal raha hai?
Me: Paise kahan hain 😅
Rahul: Main sponsor kar dunga
Me: Sach mein??
Rahul: Haan… agar tu gaadi chalayega 😂`

export function ChatStory() {
  const [src, setSrc] = useState(SAMPLE)
  const [style, setStyle] = useState<ChatStyle>('green')
  const [speed, setSpeed] = useState<'slow' | 'normal' | 'fast'>('normal')
  const [music, setMusic] = useState(true)
  const [busy, setBusy] = useState('')
  return (
    <>
      <div className="hint">Type a made-up chat – one message per line as <b>Name: message</b>, and <b>Me:</b> for your side. The messages pop in one by one with typing dots and message sounds.</div>
      <textarea className="full desc" rows={6} value={src} onChange={(e) => setSrc(e.target.value)} />
      <div className="chips">
        {([['green', '🟢 Green'], ['blue', '🔵 Blue'], ['dark', '🌙 Dark']] as const).map(([id, n]) => (
          <button key={id} className={'chip' + (style === id ? ' on' : '')} onClick={() => setStyle(id)}>{n}</button>
        ))}
      </div>
      <div className="chips">
        {([['slow', '🐢 Slow'], ['normal', 'Normal'], ['fast', '⚡ Fast']] as const).map(([id, n]) => (
          <button key={id} className={'chip' + (speed === id ? ' on' : '')} onClick={() => setSpeed(id)}>{n}</button>
        ))}
        <button className={'chip' + (music ? ' on' : '')} onClick={() => setMusic(!music)}>🎵 Music</button>
      </div>
      <button
        className="btn full primary"
        disabled={!!busy}
        onClick={async () => {
          setBusy('Starting…')
          try {
            const { makeChatStory } = await import('../social')
            toast(await makeChatStory(src, { style, speed, music }, setBusy))
          } catch (e) {
            toast((e as Error).message)
          }
          setBusy('')
        }}
      >
        {busy || '💬 Make chat video'}
      </button>
    </>
  )
}

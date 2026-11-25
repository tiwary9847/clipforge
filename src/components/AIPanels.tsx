import { useEffect, useRef, useState } from 'react'
import { EXAMPLES, RunResult, STEP_ICON, STEP_TEXT, Step, aiPlan, rulePlan, runPlan, undoAll } from '../assistant'
import { engine } from '../engine'
import { useT } from '../i18n'
import { Person, applyBlur, clearBlur, findPeople } from '../privacy'
import { Issue, KIND_LABEL, Report, analyse, fixCut, fixSpeed, fixZoom, fmt } from '../retention'
import { setUi, useStore } from '../store'
import { Project } from '../types'
import { openTool } from './Welcome'
import { builtinAI } from '../plan'

const toast = (m: string) => setUi({ toast: m })
const ownKey = () => ({ provider: ((localStorage.getItem('clipforge-ai-prov') as 'gemini' | 'claude') || 'gemini') as 'gemini' | 'claude', key: localStorage.getItem('clipforge-ai-key') ?? '' })
/** The AI to use: your own key, else Pro's built-in AI (askAI routes an empty key to the server), else none. */
export const aiKey = () => {
  const o = ownKey()
  return o.key ? o : builtinAI() ? { provider: o.provider, key: '' , builtin: true } : { ...o, builtin: false }
}
export const hasAI = () => !!ownKey().key || builtinAI()

/** Shared "your own AI key" box (Gemini has a free key). */
export function KeyBox({ note }: { note: string }) {
  const [prov, setProv] = useState(ownKey().provider)
  const [key, setKey] = useState(ownKey().key)
  const save = (k: string, p = prov) => {
    setKey(k)
    localStorage.setItem('clipforge-ai-key', k)
    localStorage.setItem('clipforge-ai-prov', p)
  }
  return (
    <details className="chap">
      <summary>✨ {key ? 'AI key added' : 'Smarter with a free AI key (optional)'}</summary>
      <div className="hint">{note} Google Gemini gives a free key at aistudio.google.com.</div>
      <div className="chips">
        <button className={'chip' + (prov === 'gemini' ? ' on' : '')} onClick={() => { setProv('gemini'); save(key, 'gemini') }}>Gemini</button>
        <button className={'chip' + (prov === 'claude' ? ' on' : '')} onClick={() => { setProv('claude'); save(key, 'claude') }}>Claude</button>
      </div>
      <input className="full" type="password" placeholder="API key" value={key} onChange={(e) => save(e.target.value)} />
    </details>
  )
}

/* ================= AI edit assistant ================= */

export const openAssistant = (text = '') => window.dispatchEvent(new CustomEvent('cf:assistant', { detail: text }))

type SR = { lang: string; interimResults: boolean; onresult: (e: any) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void }
const speechRec = (): (new () => SR) | null => (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null

export function AssistantDialog({ initial, onClose }: { initial: string; onClose: () => void }) {
  const t = useT()
  const [text, setText] = useState(initial)
  const [plan, setPlan] = useState<Step[] | null>(null)
  const [skip, setSkip] = useState<Set<number>>(new Set())
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState('')
  const [cur, setCur] = useState<{ i: number; m: string } | null>(null)
  const [done, setDone] = useState<RunResult[] | null>(null)
  const [before, setBefore] = useState<Project | null>(null)
  const [listening, setListening] = useState(false)
  const rec = useRef<SR | null>(null)
  const sig = useRef({ cancelled: false })
  const hasClips = useStore((s) => s.project.clips.length > 0)

  const think = async (q = text) => {
    if (!q.trim()) return
    setDone(null)
    setReply('')
    const { provider, key } = aiKey()
    let steps: Step[] = []
    if (hasAI()) {
      setBusy('Thinking…')
      try {
        const r = await aiPlan(q, provider, key)
        steps = r.steps
        setReply(r.reply)
      } catch {
        setReply('The AI service didn’t answer – planned it on the device instead.')
      }
      setBusy('')
    }
    if (!steps.length) steps = rulePlan(q)
    if (!steps.length) setReply('I couldn’t tell what to do. Try words like: captions, music, zoom, 30 seconds, boring parts hatao, galtiyan hatao, blur.')
    setSkip(new Set())
    setPlan(steps)
  }
  useEffect(() => {
    if (initial) void think(initial)
  }, [])

  const go = async () => {
    if (!plan) return
    const steps = plan.filter((_, i) => !skip.has(i))
    sig.current = { cancelled: false }
    setBusy('run')
    engine.pause()
    const r = await runPlan(steps, (i, m) => setCur({ i, m }), sig.current)
    setBefore(r.before)
    setDone(r.results)
    setCur(null)
    setBusy('')
  }

  const mic = () => {
    const R = speechRec()
    if (!R) return toast('Voice input needs Chrome or Edge.')
    if (listening) return rec.current?.stop()
    const r = new R()
    r.lang = 'en-IN' // Indian English understands Hinglish and writes it in Roman letters
    r.interimResults = true
    r.onresult = (e: any) => setText(Array.from(e.results as ArrayLike<any>).map((x: any) => x[0].transcript).join(' '))
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    setListening(true)
    r.start()
  }

  const running = busy === 'run'
  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="modal asst">
        <h3>🤖 {t('AI assistant')}</h3>
        {!hasClips && <div className="hint warn">Add your video first – then tell me what to do with it.</div>}
        {!done && !running && (
          <>
            <div className="asst-in">
              <textarea rows={2} placeholder={t('Tell me what to do… e.g. “30 second ki reel bana do, captions aur music ke saath”')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), void think())} />
              {speechRec() && <button className={'ico mic' + (listening ? ' on' : '')} onClick={mic} title="Speak (Hindi/English)" aria-label="Speak">🎤</button>}
            </div>
            {!plan && <div className="chips asst-ex">
              {EXAMPLES.map((x) => (
                <button key={x} className="chip" onClick={() => { setText(x); void think(x) }}>{x}</button>
              ))}
            </div>}
            <button className="btn primary full" disabled={!text.trim() || !!busy} onClick={() => void think()}>{busy || '✨ ' + t('Make a plan')}</button>
          </>
        )}
        {reply && <div className="asst-reply">{reply}</div>}
        {plan && plan.length > 0 && !done && (
          <div className="asst-plan">
            <div className="hint">{running ? 'Working – keep this tab open…' : 'My plan (untick anything you don’t want):'}</div>
            {plan.map((s, i) => {
              const off = skip.has(i)
              const idx = plan.filter((_, k) => !skip.has(k)).indexOf(s)
              const now = running && cur?.i === idx
              const past = running && cur && idx < cur.i
              return (
                <label key={s.do} className={'asst-step' + (off ? ' off' : '') + (now ? ' now' : '') + (past ? ' past' : '')}>
                  {!running && <input type="checkbox" checked={!off} onChange={() => { const n = new Set(skip); off ? n.delete(i) : n.add(i); setSkip(n) }} />}
                  <span className="ic">{past ? '✓' : STEP_ICON[s.do]}</span>
                  <span>{STEP_TEXT[s.do](s)}{now && <small> · {cur!.m}</small>}</span>
                </label>
              )
            })}
            {running ? (
              <button className="btn danger full" onClick={() => (sig.current.cancelled = true)}>{t('Cancel')}</button>
            ) : (
              <button className="btn primary full big-save" disabled={!hasClips || skip.size === plan.length} onClick={go}>▶ {t('Do it')}</button>
            )}
          </div>
        )}
        {done && (
          <div className="asst-plan">
            {done.map((r) => (
              <div key={r.step.do} className={'asst-step ' + (r.ok ? 'past' : 'bad')}>
                <span className="ic">{r.ok ? '✓' : '⚠'}</span>
                <span>{STEP_TEXT[r.step.do](r.step)}<small> · {r.msg}</small></span>
              </div>
            ))}
            <div className="row2">
              <button className="btn" onClick={() => { if (before) undoAll(before); setDone(null); setPlan(null); toast('Put back exactly as before.') }}>↩ {t('Undo everything')}</button>
              <button className="btn primary" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('cf:export')) }}>⬆ {t('Save video')}</button>
            </div>
            <button className="link" onClick={() => { setDone(null); setPlan(null); setText('') }}>＋ {t('Ask for something else')}</button>
          </div>
        )}
        {!running && !done && <KeyBox note="Without a key I understand common requests in English and Hinglish. With a key I understand anything you type – only your request and a short project summary are sent." />}
        <div className="modal-actions">
          <button className="btn" disabled={running} onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  )
}

/** The card in Tools that opens the assistant. */
export function AssistantCard() {
  const [q, setQ] = useState('')
  return (
    <>
      <div className="hint">Tell it in your own words – Hinglish or English, typed or spoken – and it runs the right tools in the right order. You see the plan first, and one tap undoes everything.</div>
      <div className="asst-in">
        <textarea rows={2} placeholder="e.g. Boring parts hatao, captions lagao, travel music" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button className="btn primary full" onClick={() => openAssistant(q)}>🤖 Open the assistant</button>
    </>
  )
}

/* ================= Retention coach ================= */

export function RetentionCoach() {
  const [rep, setRep] = useState<Report | null>(null)
  const [busy, setBusy] = useState('')
  const [useAi, setUseAi] = useState(() => hasAI())
  const clips = useStore((s) => s.project.clips)
  const stale = useRef(false)
  useEffect(() => {
    stale.current = true
  }, [clips])
  const run = async () => {
    setBusy('Starting…')
    try {
      stale.current = false
      setRep(await analyse(setBusy, useAi && hasAI() ? aiKey() : undefined))
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const fix = async (s: Issue, f: string) => {
    let m = ''
    if (f === 'cut') m = fixCut(s)
    else if (f === 'zoom') m = fixZoom(s)
    else if (f === 'speed') m = fixSpeed(s)
    else if (f === 'broll') return openTool('broll')
    else if (f === 'hook') return openTool('hooklines')
    toast(m)
    await run() // timings change after a fix: check again
  }
  const safeAll = async () => {
    if (!rep) return
    // the safe ones: cut silences/slow start, zoom on same-shot stretches (latest first so times stay right)
    const list = rep.issues.filter((s) => s.kind === 'pause' || s.kind === 'start' || s.kind === 'static').sort((a, b) => b.from - a.from)
    for (const s of list) s.kind === 'static' ? fixZoom(s) : fixCut(s)
    toast(`Fixed ${list.length} spot${list.length === 1 ? '' : 's'}. Undo to go back.`)
    await run()
  }
  const W = 320
  const H = 90
  return (
    <>
      <div className="hint">Finds where viewers are likely to swipe away – pauses, the same shot for too long, flat delivery, slow talking, a slow start – and fixes each in one tap.</div>
      <label className="check"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> <span>Also let the AI read the captions for boring or repeated parts (needs captions + key)</span></label>
      <button className="btn primary full" disabled={!!busy} onClick={run}>{busy || (rep ? '🔄 Check again' : '📈 Check my video')}</button>
      {rep && (
        <>
          <div className="ret-score">
            <b className={rep.score >= 70 ? 'good' : rep.score >= 50 ? 'mid' : 'low'}>{rep.score}</b>
            <span>{rep.score >= 70 ? 'Holds attention well.' : rep.score >= 50 ? 'Some slow spots – fix the top ones.' : 'Viewers will likely leave early – start with the first fixes.'}{stale.current ? ' (changed since – check again)' : ''}</span>
          </div>
          <svg className="ret-graph" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label="Estimated viewers still watching">
            {rep.issues.map((s, i) => (
              <rect key={i} x={(s.from / rep.dur) * W} y={0} width={Math.max(2, ((s.to - s.from) / rep.dur) * W)} height={H} className={'ret-band k-' + s.kind} onClick={() => engine.seek(s.from)} />
            ))}
            {(() => {
              const lo = Math.max(0, Math.floor((Math.min(...rep.curve) - 8) / 10) * 10)
              const y = (v: number) => 4 + (H - 8) * (1 - (v - lo) / (100 - lo))
              return (
                <>
                  <polyline fill="none" className="ret-line" points={rep.curve.map((v, i) => `${(i / Math.max(1, rep.curve.length - 1)) * W},${y(v)}`).join(' ')} />
                  <text x={4} y={12} className="ret-ax">100%</text>
                  <text x={4} y={H - 2} className="ret-ax">{lo}%</text>
                  <text x={W - 4} y={12} textAnchor="end" className="ret-ax">{Math.round(rep.curve[rep.curve.length - 1] ?? 0)}% at the end</text>
                </>
              )
            })()}
            <text x={2} y={H + 12} className="ret-ax">0:00</text>
            <text x={W - 2} y={H + 12} textAnchor="end" className="ret-ax">{fmt(rep.dur)}</text>
          </svg>
          <div className="hint">Line = estimated viewers still watching (from these signals, not YouTube data). Coloured bands = problem spots; tap one to jump there.</div>
          {rep.issues.length ? (
            <>
              <button className="btn full" onClick={safeAll}>⚡ Fix the safe ones (cut pauses + zoom on long shots)</button>
              <div className="ret-list">
                {rep.issues.map((s, i) => (
                  <div key={i} className="ret-item">
                    <button className="ret-t" onClick={() => engine.seek(s.from)} title="Jump there">{fmt(s.from)}</button>
                    <div>
                      <b>{KIND_LABEL[s.kind]}</b> <small>{s.why}</small>
                      <div className="chips">
                        {s.fixes.map((f) => (
                          <button key={f} className="chip" onClick={() => void fix(s, f)}>{f === 'cut' ? '✂️ Cut' : f === 'zoom' ? '🎯 Zoom in' : f === 'speed' ? '⏩ 1.25×' : f === 'broll' ? '🎬 B-roll' : '🪝 Add hook'}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="hint">No problem spots found. 🎉</div>
          )}
        </>
      )}
    </>
  )
}

/* ================= Auto-blur strangers ================= */

export function BlurStrangers() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [keep, setKeep] = useState<Set<number>>(new Set([0]))
  const [mode, setMode] = useState<'blur' | 'pixel'>('blur')
  const [busy, setBusy] = useState('')
  const sig = useRef({ cancelled: false })
  const blurred = useStore((s) => s.project.clips.some((c) => c.privacy))
  const find = async () => {
    sig.current = { cancelled: false }
    setBusy('Starting…')
    try {
      const p = await findPeople((m) => setBusy(m), sig.current)
      setPeople(p)
      setKeep(new Set([0]))
      if (!p.length) toast('No faces found in the main video.')
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  return (
    <>
      <div className="hint">Shooting in a market, metro or street? Blurs the faces of people who didn’t agree to be in your video, and follows them as they move. You stay sharp. Works on your device – nothing is uploaded.</div>
      <button className="btn primary full" disabled={!!busy} onClick={find}>{busy || (people ? '🔄 Find faces again' : '👀 Find the faces')}</button>
      {busy && <button className="btn sm" onClick={() => (sig.current.cancelled = true)}>Cancel</button>}
      {people && people.length > 0 && (
        <>
          <div className="hint">Tap the people to keep sharp (the main person is picked for you):</div>
          <div className="faces-pick">
            {people.map((p, i) => (
              <button key={p.assetId + p.index} className={'face' + (keep.has(i) ? ' on' : '')} onClick={() => { const n = new Set(keep); n.has(i) ? n.delete(i) : n.add(i); setKeep(n) }}>
                {p.thumb ? <img src={p.thumb} alt="" /> : <span>👤</span>}
                <small>{keep.has(i) ? 'Keep' : 'Blur'} · {Math.round(p.share * 100)}%</small>
              </button>
            ))}
          </div>
          <div className="chips">
            <button className={'chip' + (mode === 'blur' ? ' on' : '')} onClick={() => setMode('blur')}>🌫 Blur</button>
            <button className={'chip' + (mode === 'pixel' ? ' on' : '')} onClick={() => setMode('pixel')}>▦ Pixelate</button>
          </div>
          <button className="btn primary full" onClick={() => { toast(applyBlur(people, people.filter((_, i) => keep.has(i)), mode)); engine.requestRender() }}>🙈 Blur the others</button>
        </>
      )}
      {blurred && <button className="btn full" onClick={() => { toast(clearBlur()); engine.requestRender() }}>Remove blur</button>}
      <div className="hint">Face finding can miss someone who is very small, side-on or behind glass – play it through before posting.</div>
    </>
  )
}


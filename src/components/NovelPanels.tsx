import { useEffect, useRef, useState } from 'react'
import { CommentReport, PComment, fixComment, previewComments } from '../comments'
import { engine } from '../engine'
import { GhostTarget, Take, frameAt, ghostTarget, lastWords, placeTake, signature, similarity, startTake } from '../ghost'
import { Lost, MuteReport, addTextFor, muteCheck } from '../mutecheck'
import { HOP } from '../retention'
import { getAsset, getPreset, setUi, useStore } from '../store'
import { KeyBox, aiKey, hasAI } from './AIPanels'

const toast = (m: string) => m && setUi({ toast: m })
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const kfmt = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n))

/* ================= Comment preview ================= */

const FIX_LABEL: Record<string, string> = {
  cut: '✂️ Cut it',
  zoom: '🔍 Add zoom',
  speed: '⏩ Speed up',
  captions: '💬 Add captions',
  loudness: '🔊 Fix volume',
  hook: '🪝 Add hook text',
  cta: '👉 Add “Follow for part 2”',
  text: '✏️ Add text here',
  check: '🛠 Fix',
}
const COLORS = ['#f97316', '#8b5cf6', '#06b6d4', '#22c55e', '#ec4899', '#eab308', '#3b82f6', '#ef4444']

export function CommentPreview() {
  const [rep, setRep] = useState<CommentReport | null>(null)
  const [busy, setBusy] = useState('')
  const [useAi, setUseAi] = useState(() => hasAI())
  const [fixed, setFixed] = useState<Set<string>>(new Set())
  const run = async () => {
    setBusy('Starting…')
    setFixed(new Set())
    try {
      const was = engine.time
      setRep(await previewComments(setBusy, useAi && hasAI() ? aiKey() : undefined))
      engine.seek(was)
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const fix = async (c: PComment) => {
    setBusy(c.id)
    try {
      toast(await fixComment(c, (m) => setBusy(m)))
      setFixed((s) => new Set(s).add(c.id))
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  return (
    <>
      <div className="hint">See the comments your reel will probably get – before you post it. Every complaint points to the exact second, with a one-tap fix.</div>
      <label className="check"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> <span>Let the AI watch it too, for real-sounding comments (Pro, or your own free Gemini key)</span></label>
      {useAi && !hasAI() && <KeyBox note="For AI comments, paste your own key (or get Pro)." />}
      <button className="btn primary full" disabled={!!busy} onClick={run}>{busy && !busy.startsWith('m') && !busy.startsWith('a') ? busy : rep ? '🔄 Preview again' : '💬 Preview comments'}</button>
      {rep && (
        <div className="cp">
          <div className="cp-h">
            <b>{rep.comments.length} comments</b>
            <span>{rep.complaints ? `${rep.complaints} to fix before posting` : 'Looks ready 🎉'}{rep.ai ? ' · 🤖 AI watched it' : ''}</span>
          </div>
          {rep.aiNote && <div className="hint">{rep.aiNote}</div>}
          <ul className="cp-list">
            {rep.comments.map((c, i) => (
              <li key={c.id} className={'cp-c k-' + c.kind + (fixed.has(c.id) ? ' done' : '')}>
                <span className="cp-av" style={{ background: COLORS[i % COLORS.length] }}>{c.user[0]?.toUpperCase()}</span>
                <div className="cp-body">
                  <div className="cp-u">
                    <b>{c.user}</b>
                    {c.at != null && <button className="cp-at" onClick={() => engine.seek(c.at!)} title="Go to this moment">▶ {fmt(c.at)}</button>}
                    <span className="cp-src">{c.src === 'ai' ? '🤖' : '📏 measured'}</span>
                  </div>
                  <div className="cp-t">{c.text}</div>
                  <div className="cp-why">{c.why}</div>
                  {c.kind !== 'praise' && c.fix !== 'none' && !fixed.has(c.id) && (
                    <button className="btn sm cp-fix" disabled={!!busy} onClick={() => fix(c)}>{busy === c.id ? '…' : FIX_LABEL[c.fix] ?? 'Fix'}</button>
                  )}
                  {fixed.has(c.id) && <span className="cp-ok">✓ Fixed – preview again to check</span>}
                </div>
                <span className="cp-like">♥<small>{kfmt(c.likes)}</small></span>
              </li>
            ))}
          </ul>
          <div className="hint">These are predictions from your video, not real comments.</div>
        </div>
      )}
    </>
  )
}

/* ================= Mute check ================= */

export function MuteCheck() {
  const [rep, setRep] = useState<MuteReport | null>(null)
  const [busy, setBusy] = useState('')
  const [muted, setMuted] = useState(false)
  const clips = useStore((s) => s.project.clips)
  const ran = useRef(false)
  useEffect(() => () => {
    engine.previewMute = false
  }, [])
  const run = async () => {
    setBusy('Starting…')
    try {
      setRep(await muteCheck(setBusy))
      ran.current = true
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  // keep it fresh after a fix (text added, captions made)
  useEffect(() => {
    if (!ran.current || busy) return
    const id = setTimeout(() => void muteCheck(() => {}).then(setRep).catch(() => {}), 600)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips])
  const toggleMute = (on = !muted) => {
    engine.previewMute = on
    setMuted(on)
    if (on && !engine.playing) engine.play()
  }
  const see = (l: Lost) => {
    engine.seek(Math.max(0, l.from - 0.3))
    toggleMute(true)
  }
  const captions = async () => {
    setBusy('Making captions…')
    try {
      const { autoCaptions } = await import('../captionsAuto')
      toast(await autoCaptions((m) => setBusy(m)))
      setRep(await muteCheck(setBusy))
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const W = 320
  return (
    <>
      <div className="hint">Most people scroll with the sound off. See your reel the way they do: every red part is someone talking with nothing on screen to say what.</div>
      <div className="mc-go">
        <button className="btn primary" disabled={!!busy} onClick={run}>{busy || (rep ? '🔄 Check again' : '🔇 Check with sound off')}</button>
        <button className={'btn' + (muted ? ' on' : '')} onClick={() => toggleMute()} title="Play with the sound off">{muted ? '🔈 Sound back on' : '🔇 Watch muted'}</button>
      </div>
      {rep && (
        <>
          <div className="ret-score">
            <b className={rep.score >= 85 ? 'good' : rep.score >= 60 ? 'mid' : 'low'}>{rep.score}%</b>
            <span>{rep.speech < 1 ? 'No talking found – make sure your words are on screen if they matter.' : rep.score >= 85 ? 'Muted viewers can follow along.' : `of what you say is understandable with the sound off.`}</span>
          </div>
          <svg className="mc-strip" viewBox={`0 0 ${W} 22`} role="img" aria-label="Green: words on screen; red: talking with nothing on screen; grey: quiet">
            {Array.from(rep.strip).map((v, i) => (
              <rect key={i} x={(i * HOP * W) / rep.dur} width={Math.max(0.6, (HOP * W) / rep.dur + 0.3)} y={0} height={22} className={'mc-' + v} onClick={() => engine.seek(i * HOP)} />
            ))}
          </svg>
          <div className="mc-key"><span className="k1">words on screen</span><span className="k2">lost when muted</span><span className="k0">quiet</span></div>
          {!rep.hasCaptions && rep.speech > 2 && (
            <button className="btn full" disabled={!!busy} onClick={captions}>💬 Add captions for everything (fixes all at once)</button>
          )}
          <ul className="mc-list">
            {rep.lost.slice(0, 12).map((l, i) => (
              <li key={i}>
                <button className="cp-at" onClick={() => see(l)}>▶ {fmt(l.from)}</button>
                <span>{l.kind === 'opening' ? 'No words on screen in the first 2 s – muted viewers see no reason to stay' : `${(l.to - l.from).toFixed(1)} s of talking with nothing on screen`}</span>
                <button className="btn sm" onClick={() => toast(addTextFor(l))}>{l.kind === 'opening' ? '🪝 Add hook' : '✏️ Add text'}</button>
              </li>
            ))}
          </ul>
          {!rep.lost.length && <div className="hint">🎉 Nothing lost – your reel works with the sound off.</div>}
        </>
      )}
    </>
  )
}

/* ================= Ghost re-take ================= */

export function GhostRetakeCard() {
  const clips = useStore((s) => s.project.clips)
  const [open, setOpen] = useState<GhostTarget | null>(null)
  const [, setT] = useState(0)
  // follow the playhead (rounded, so this doesn't redraw every frame)
  useEffect(() => engine.onTick((t) => setT(Math.round(t * 4))), [])
  const tg = ghostTarget()
  void clips
  return (
    <>
      <div className="hint">Made a mistake in the middle? Put the playhead just before it. Your last good frame shows see-through over the camera so you can line up exactly where you were, then record only from there – it joins in without a jump.</div>
      <button className="btn primary full" disabled={!tg || !navigator.mediaDevices?.getUserMedia} onClick={() => tg && setOpen(tg)}>
        {tg ? `👻 Re-take from ${fmt(tg.t)}` : 'Put the playhead on your video first'}
      </button>
      {!navigator.mediaDevices?.getUserMedia && <div className="hint">This browser can’t use the camera.</div>}
      {open && <GhostCam target={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function GhostCam({ target, onClose }: { target: GhostTarget; onClose: () => void }) {
  const live = useRef<HTMLVideoElement>(null)
  const ghostImg = useRef<HTMLCanvasElement | null>(null)
  const ghostSig = useRef<Float32Array | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const recRef = useRef<ReturnType<typeof startTake> | null>(null)
  const [ghostUrl, setGhostUrl] = useState('')
  const [opacity, setOpacity] = useState(0.45)
  const [face, setFace] = useState<'user' | 'environment'>('user')
  const [match, setMatch] = useState(0)
  const [phase, setPhase] = useState<'line' | 'count' | 'rec' | 'review' | 'saving'>('line')
  const [count, setCount] = useState(3)
  const [secs, setSecs] = useState(0)
  const [take, setTake] = useState<Take | null>(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'replace' | 'insert'>('replace')
  const cue = lastWords(target.t)
  const P = getPreset()

  // the ghost: the clip's own frame at the re-take point
  useEffect(() => {
    const url = getAssetUrl(target)
    if (!url) return setErr('Couldn’t read this video.')
    let gone = false
    void frameAt(url, target.src).then((cv) => {
      if (gone) return
      ghostImg.current = cv
      ghostSig.current = signature(cv, cv.width, cv.height)
      setGhostUrl(cv.toDataURL('image/jpeg', 0.85))
    }).catch((e) => setErr((e as Error).message))
    return () => {
      gone = true
    }
  }, [target])

  // camera
  useEffect(() => {
    let gone = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (gone) return s.getTracks().forEach((t) => t.stop())
        stream.current?.getTracks().forEach((t) => t.stop())
        stream.current = s
        if (live.current) {
          live.current.srcObject = s
          void live.current.play().catch(() => {})
        }
      })
      .catch((e) => setErr(e?.name === 'NotAllowedError' ? 'Allow the camera and microphone to re-take.' : 'No camera found.'))
    return () => {
      gone = true
    }
  }, [face])
  useEffect(() => () => {
    recRef.current?.cancel()
    stream.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // live match score
  useEffect(() => {
    if (phase !== 'line' && phase !== 'count') return
    const id = setInterval(() => {
      const v = live.current
      if (!v || !ghostSig.current || !v.videoWidth) return
      setMatch(similarity(signature(v, v.videoWidth, v.videoHeight), ghostSig.current))
    }, 250)
    return () => clearInterval(id)
  }, [phase])

  const go = () => {
    setPhase('count')
    setCount(3)
    let n = 3
    const id = setInterval(() => {
      n--
      setCount(n)
      if (n <= 0) {
        clearInterval(id)
        if (!stream.current) return setErr('The camera isn’t ready.')
        recRef.current = startTake(stream.current)
        setPhase('rec')
        const t0 = performance.now()
        const tid = setInterval(() => {
          if (!recRef.current) return clearInterval(tid)
          setSecs((performance.now() - t0) / 1000)
        }, 200)
      }
    }, 800)
  }
  const stop = async () => {
    const r = recRef.current
    recRef.current = null
    if (!r) return
    const tk = await r.stop()
    setTake(tk)
    setPhase('review')
  }
  const use = async () => {
    if (!take) return
    setPhase('saving')
    try {
      toast(await placeTake(target, take, ghostSig.current, mode))
      onClose()
    } catch (e) {
      setErr((e as Error).message)
      setPhase('review')
    }
  }
  const mirror = face === 'user'
  const good = match >= 75
  return (
    <div className="modal-bg gh-bg" onClick={onClose}>
      <div className="modal gh" onClick={(e) => e.stopPropagation()}>
        <div className="gh-top">
          <b>👻 Re-take from {fmt(target.t)}</b>
          <button className="ico" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="gh-stage" style={{ aspectRatio: `${P.w} / ${P.h}` }}>
          {phase === 'review' && take ? (
            <video className="gh-live" src={take.url} controls playsInline autoPlay />
          ) : (
            <>
              <video ref={live} className={'gh-live' + (mirror ? ' mir' : '')} muted playsInline />
              {ghostUrl && phase !== 'rec' && <img className={'gh-ghost' + (mirror ? ' mir' : '')} src={ghostUrl} alt="" style={{ opacity }} />}
            </>
          )}
          {(phase === 'line' || phase === 'count') && ghostUrl && <div className={'gh-match' + (good ? ' ok' : '')}>{good ? '✓ ' : ''}Match {match}%</div>}
          {phase === 'count' && <div className="gh-count">{count || '🎬'}</div>}
          {phase === 'rec' && <div className="gh-rec">● REC {secs.toFixed(0)} s</div>}
          {cue && phase !== 'review' && <div className="gh-cue">Continue after: <i>“…{cue}”</i></div>}
        </div>
        {err && <div className="ae-err">⚠ {err}</div>}
        {phase === 'line' && (
          <>
            <label className="gh-row">Ghost <input type="range" min={0} max={0.9} step={0.05} value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>
            <div className="hint">{good ? 'Lined up – press record and carry on from the words above.' : 'Move until the see-through picture lines up with you (same spot, same distance).'}</div>
            <div className="gh-btns">
              <button className="btn" onClick={() => setFace(face === 'user' ? 'environment' : 'user')}>🔄 Flip camera</button>
              <button className="btn primary" disabled={!ghostUrl || !!err} onClick={go}>⏺ Record from here</button>
            </div>
          </>
        )}
        {phase === 'rec' && (
          <div className="gh-btns"><button className="btn primary" onClick={stop}>⏹ Stop</button></div>
        )}
        {(phase === 'review' || phase === 'saving') && (
          <>
            <div className="chips">
              <button className={'chip' + (mode === 'replace' ? ' on' : '')} onClick={() => setMode('replace')}>Replace the rest of this clip</button>
              <button className={'chip' + (mode === 'insert' ? ' on' : '')} onClick={() => setMode('insert')}>Insert, keep the rest</button>
            </div>
            <div className="gh-btns">
              <button className="btn" disabled={phase === 'saving'} onClick={() => { setTake(null); setPhase('line') }}>↺ Record again</button>
              <button className="btn primary" disabled={phase === 'saving'} onClick={use}>{phase === 'saving' ? 'Joining…' : '✓ Use this take'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function getAssetUrl(t: GhostTarget) {
  return getAsset(t.clip.assetId)?.url ?? ''
}

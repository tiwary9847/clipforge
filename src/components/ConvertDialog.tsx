import { useEffect, useRef, useState } from 'react'
import { ConvertInfo, ConvertProgress, ConvertQuality, convertVideo, converterCached, outSize, pendingConversions, takeConversion } from '../convert'
import { engine } from '../engine'
import { addAsset, addAssetClip, getState, setUi } from '../store'

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Shows itself when an imported video can't be played and offers to convert it in the app. */
export function ConvertDialog() {
  const [job, setJob] = useState<{ file: File; info: ConvertInfo | null } | null>(null)
  const [q, setQ] = useState<ConvertQuality>('quick')
  const [prog, setProg] = useState<ConvertProgress | null>(null)
  const [err, setErr] = useState('')
  const [left, setLeft] = useState(0)
  const ctl = useRef<AbortController | null>(null)

  const next = () => {
    const j = takeConversion()
    setJob(j ?? null)
    setProg(null)
    setErr('')
    setLeft(pendingConversions().length)
  }
  useEffect(() => {
    const on = () => setJob((cur) => (cur ? (setLeft(pendingConversions().length), cur) : (takeConversion() ?? null)))
    window.addEventListener('cf:convert', on)
    if (pendingConversions().length) on()
    return () => window.removeEventListener('cf:convert', on)
  }, [])
  if (!job) return null
  const info = job.info
  const running = !!prog && !err
  const mins = info ? info.duration / 60 : 0
  // measured in Chrome on a 2-core machine: quick 720p ≈ 1.5× the video length, full ≈ 4×; faster computers are quicker
  const est = info ? mmss(info.duration * (q === 'quick' ? 1.5 : 4)) : ''
  const size = info ? outSize(info, q) : null

  const start = async () => {
    if (!info) return
    ctl.current = new AbortController()
    setProg({ stage: 'download', frac: 0 })
    try {
      const out = await convertVideo(job.file, info, q, setProg, ctl.current.signal)
      const a = await engine.importFile(out)
      if (a) {
        addAsset(a)
        if (!getState().project.clips.some((c) => c.track === 'v1')) addAssetClip(a.id, 'v1')
        setUi({ toast: `✓ "${job.file.name}" converted and added to your media.` })
      }
      next()
    } catch (e) {
      if ((e as Error).name === 'AbortError') return next()
      setErr((e as Error).message)
    }
  }

  return (
    <div className="modal-bg">
      <div className="modal convert">
        <h2>🔄 Convert this video?</h2>
        <p>
          <b>{job.file.name}</b> is {info?.codec === 'hevc' ? <>“High Efficiency” (HEVC) video</> : <>in a format ({(info?.codec || 'unknown').toUpperCase()})</>} that this browser can’t play.
          ViralKaro can turn it into a normal MP4 right here – nothing is uploaded.
        </p>
        {!info ? (
          <div className="hint warn">⚠ This file couldn’t be read at all, so it can’t be converted. Try exporting it again from your phone’s gallery.</div>
        ) : (
          <>
            <div className="seg conv-q">
              <button className={q === 'quick' ? 'on' : ''} disabled={running} onClick={() => setQ('quick')}>⚡ Quick · 720p</button>
              <button className={q === 'full' ? 'on' : ''} disabled={running} onClick={() => setQ('full')}>💎 Full quality{Math.min(info.width, info.height) > 720 ? ' · 1080p' : ''}</button>
            </div>
            <div className="hint">
              {mmss(info.duration)} of video → {size!.w}×{size!.h}. Takes up to about {est}
              {mins > 10 ? ' – long videos are slow, so think about trimming on the phone first' : ''}.
              {!converterCached() && ' The first time, the converter (10–30 MB) is downloaded once; after that it works offline.'}
            </div>
            {prog && !err && (
              <>
                <div className="progress"><div className="progress-in" style={{ width: `${Math.round((prog.stage === 'download' ? prog.frac * 0.08 : 0.08 + prog.frac * 0.92) * 100)}%` }} /></div>
                <div className="hint">
                  {prog.stage === 'download' ? 'Getting the converter ready…' : `Converting… ${Math.round(prog.frac * 100)}%${prog.eta != null ? ` · about ${mmss(prog.eta)} left` : ''}`} Keep this tab open.
                </div>
              </>
            )}
            {err && <div className="hint warn">⚠ Conversion failed: {err}. {/internet|fetch|start/i.test(err) ? 'The first conversion needs internet to get the converter.' : 'Try “Quick · 720p”, or set the phone camera to “Most Compatible”.'}</div>}
          </>
        )}
        <details className="hint">
          <summary>Avoid this next time</summary>
          On iPhone: Settings → Camera → Formats → <b>Most Compatible</b>. On Samsung: Camera settings → Advanced video options → turn off <b>High efficiency video</b>. Chrome or Edge on Windows 11, Mac and Android can usually play HEVC directly.
        </details>
        <div className="modal-actions">
          {running ? (
            <button className="btn" onClick={() => ctl.current?.abort()}>Cancel</button>
          ) : (
            <>
              <button className="btn" onClick={next}>{left ? 'Skip' : 'Not now'}</button>
              {info && <button className="btn primary" onClick={start}>{err ? 'Try again' : 'Convert'}</button>}
            </>
          )}
        </div>
        {left > 0 && <div className="hint">{left} more video{left > 1 ? 's' : ''} waiting to convert.</div>}
      </div>
    </div>
  )
}

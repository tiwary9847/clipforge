import { useEffect, useRef, useState } from 'react'
import { engine } from '../engine'
import { Ctl, fastExport, fastExportSupport } from '../fastExport'
import { getPreset, getState, projectDuration } from '../store'
import { fmtTime } from './Fields'
import { getClientId, setClientId, uploadSupported, uploadToYouTube } from '../youtube'

function canShare(blob: Blob, name: string) {
  try {
    return !!navigator.canShare?.({ files: [new File([blob], name, { type: blob.type })] })
  } catch {
    return false
  }
}

type Phase = 'idle' | 'running' | 'done' | 'error'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<'fast' | 'realtime'>('realtime')
  const [fast, setFast] = useState<{ ok: boolean; reason?: string } | null>(null)
  const [label, setLabel] = useState('')
  const ctl = useRef<Ctl>({ cancelled: false })
  const [prog, setProg] = useState(0)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ url: string; ext: string; size: number; codec: string; blob: Blob } | null>(null)
  const [yt, setYt] = useState({ open: false, client: getClientId(), title: getState().projectName, desc: '', privacy: 'private' as 'private' | 'unlisted' | 'public', busy: false, p: 0, msg: '' })
  const bar = useRef<HTMLDivElement>(null)
  const preset = getPreset()
  const dur = projectDuration()

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])
  useEffect(() => {
    void fastExportSupport().then((r) => {
      setFast(r)
      if (r.ok) setMode('fast')
    })
  }, [])

  const start = async () => {
    setPhase('running')
    setErr('')
    setProg(0)
    try {
      ctl.current = { cancelled: false }
      const onP = (p: number, l?: string) => {
        if (bar.current) bar.current.style.width = `${Math.round(p * 100)}%`
        setProg(p)
        if (l) setLabel(l)
      }
      const out =
        mode === 'fast' ? await fastExport(onP, ctl.current) : await engine.exportVideo((p) => onP(p, 'Recording in real time…'))
      if (!out) {
        setPhase('idle')
        return
      }
      setResult({ url: URL.createObjectURL(out.blob), ext: out.ext, size: out.blob.size, codec: out.codec, blob: out.blob })
      setPhase('done')
    } catch (e) {
      setErr((e as Error).message)
      setPhase('error')
    }
  }

  const cancel = () => {
    if (phase === 'running') {
      ctl.current.cancelled = true
      if (mode === 'realtime') engine.cancelExport()
    } else onClose()
  }

  const name = `${getState().projectName.replace(/[^\w\- ]+/g, '').trim() || 'clipforge'}-${preset.id}.${result?.ext ?? 'mp4'}`

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && phase !== 'running' && onClose()}>
      <div className="modal">
        <h3>Export video</h3>
        <div className="kv">
          <span>Format</span><b>{preset.label}</b>
          <span>Resolution</span><b>{preset.w}×{preset.h} · 30 fps</b>
          <span>Length</span><b>{fmtTime(dur)}</b>
        </div>

        {phase === 'idle' && (
          <>
            <label className={'opt' + (mode === 'fast' ? ' on' : '')}>
              <input type="radio" checked={mode === 'fast'} disabled={!fast?.ok} onChange={() => setMode('fast')} />
              <div>
                <b>Fast export · H.264 MP4</b>
                <div className="hint">
                  {fast === null
                    ? 'Checking this browser…'
                    : fast.ok
                      ? 'Frame-by-frame render with a standard H.264 MP4. Much faster than real time on computers with hardware video encoding (most laptops and phones); on slow machines real-time mode can be quicker.'
                      : `Not available: ${fast.reason} Use real-time recording instead.`}
                </div>
              </div>
            </label>
            <label className={'opt' + (mode === 'realtime' ? ' on' : '')}>
              <input type="radio" checked={mode === 'realtime'} onChange={() => setMode('realtime')} />
              <div>
                <b>Real-time recording</b>
                <div className="hint">
                  Works everywhere but takes about {Math.ceil(dur)}s for this video. Keep this tab open and in front.
                </div>
              </div>
            </label>
            <div className="hint">Nothing is uploaded – everything is processed on your device.</div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn primary" disabled={dur <= 0} onClick={start}>
                {dur <= 0 ? 'Add a clip first' : 'Start export'}
              </button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <div className="progress"><div ref={bar} className="progress-in" /></div>
            <div className="hint">
              {label} {Math.round(prog * 100)}%{mode === 'realtime' ? ' – don’t switch tabs.' : ''}
            </div>
            <div className="modal-actions">
              <button className="btn danger" onClick={cancel}>Cancel</button>
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <>
            <video className="result" src={result.url} controls playsInline />
            <div className="hint">
              {(result.size / 1048576).toFixed(1)} MB · .{result.ext} · {result.codec}
              {result.codec.startsWith('H.264 + AAC') || result.codec === 'H.264 (no audio)'
                ? ' – the standard format for YouTube, Facebook and Instagram.'
                : ' – works on YouTube and Facebook. This browser can’t make AAC audio, so if Instagram rejects the file, run it through a free converter such as HandBrake, or export from Chrome/Edge on Windows or Mac.'}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Close</button>
              {canShare(result.blob, name) && (
                <button className="btn" onClick={() => void navigator.share({ files: [new File([result.blob], name, { type: result.blob.type })], title: name }).catch(() => {})}>
                  ↗ Share…
                </button>
              )}
              <a className="btn primary" href={result.url} download={name}>⬇ Download</a>
            </div>
            <div className="yt">
              <button className="link" onClick={() => setYt({ ...yt, open: !yt.open })}>{yt.open ? '▾' : '▸'} Upload straight to YouTube</button>
              {yt.open && (
                <div className="yt-box">
                  {!uploadSupported() ? (
                    <div className="hint warn">Direct upload only works when ClipForge is opened from a web address (https://…), not from a file on your computer. Download the video and upload it in YouTube Studio, or host this page (e.g. on GitHub Pages) and add that address to your Google OAuth client.</div>
                  ) : (
                    <>
                      <input className="full" placeholder="Google OAuth client ID (…apps.googleusercontent.com)" value={yt.client} onChange={(e) => { setYt({ ...yt, client: e.target.value }); setClientId(e.target.value) }} />
                      <input className="full" placeholder="Title" value={yt.title} onChange={(e) => setYt({ ...yt, title: e.target.value })} />
                      <textarea className="full" rows={2} placeholder={preset.h > preset.w ? 'Description (add #Shorts)' : 'Description'} value={yt.desc} onChange={(e) => setYt({ ...yt, desc: e.target.value })} />
                      <select className="full" value={yt.privacy} onChange={(e) => setYt({ ...yt, privacy: e.target.value as any })}>
                        <option value="private">Private (safest – new Google projects are limited to this until verified)</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="public">Public</option>
                      </select>
                      <button
                        className="btn primary full"
                        disabled={yt.busy}
                        onClick={async () => {
                          setYt((y) => ({ ...y, busy: true, p: 0, msg: '' }))
                          try {
                            const desc = preset.h > preset.w && !/#shorts/i.test(yt.desc) ? `${yt.desc}\n#Shorts`.trim() : yt.desc
                            const link = await uploadToYouTube(result.blob, { title: yt.title, description: desc, privacy: yt.privacy }, (p) => setYt((y) => ({ ...y, p })))
                            setYt((y) => ({ ...y, busy: false, msg: `Uploaded: ${link}` }))
                          } catch (e) {
                            setYt((y) => ({ ...y, busy: false, msg: (e as Error).message }))
                          }
                        }}
                      >
                        {yt.busy ? `Uploading… ${Math.round(yt.p * 100)}%` : '⬆ Upload to YouTube'}
                      </button>
                      {yt.msg && <div className="hint">{yt.msg}</div>}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="hint warn">{err}</div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Close</button>
              {mode === 'fast' && (
                <button className="btn" onClick={() => { setMode('realtime'); setPhase('idle') }}>Use real-time instead</button>
              )}
              <button className="btn primary" onClick={start}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

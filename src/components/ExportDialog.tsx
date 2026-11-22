import { useEffect, useRef, useState } from 'react'
import { engine } from '../engine'
import { Ctl, buildChapters, exportAudio, exportGif, fastExport, fastExportSupport, sourceFps } from '../fastExport'
import { getPreset, getState, projectDuration } from '../store'
import { fmtTime } from './Fields'
import { useT } from '../i18n'
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
  const [fpsPick, setFpsPick] = useState<'auto' | 24 | 30 | 60>('auto')
  const [srcFps, setSrcFps] = useState(30)
  useEffect(() => {
    void sourceFps().then(setSrcFps)
  }, [])
  const [what, setWhat] = useState<'video' | 'gif' | 'audio'>('video')
  const [part, setPart] = useState(false)
  const [more, setMore] = useState(false)
  const t = useT()
  const selRange = (() => {
    const st = getState()
    const sel = st.project.clips.filter((c) => st.selIds.includes(c.id))
    return sel.length ? [Math.min(...sel.map((c) => c.start)), Math.max(...sel.map((c) => c.start + c.dur))] : [0, Math.min(projectDuration(), 10)]
  })()
  const [rFrom, setRFrom] = useState(+selRange[0].toFixed(1))
  const [rTo, setRTo] = useState(+selRange[1].toFixed(1))
  const [chap, setChap] = useState<{ text: string; problems: string[] } | null>(null)
  const [copied, setCopied] = useState(false)
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
      const range = part ? { from: Math.max(0, Math.min(rFrom, rTo)), to: Math.max(rFrom, rTo) } : {}
      const out =
        what === 'gif'
          ? await exportGif(onP, ctl.current, range)
          : what === 'audio'
            ? await exportAudio(onP, ctl.current, range)
            : mode === 'fast' || part
              ? await fastExport(onP, ctl.current, { ...range, fps: fpsPick === 'auto' ? srcFps : fpsPick })
              : await engine.exportVideo((p) => onP(p, 'Recording in real time…'))
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
        <h3>{t('Export video')}</h3>
        <div className="kv">
          <span>{t('Format')}</span><b>{preset.label}</b>
          <span>{t('Resolution')}</span><b>{Math.min(preset.w, preset.h) >= 2000 ? '4K' : `${Math.min(preset.w, preset.h)}p`} · {mode === 'fast' || part ? (fpsPick === 'auto' ? srcFps : fpsPick) : 30} fps</b>
          <span>{t('Length')}</span><b>{fmtTime(dur)}</b>
        </div>

        {phase === 'idle' && (
          <>
            <div className="exp-simple">
              {what === 'video' ? (
                <span>🎬 MP4 · {mode === 'fast' ? t('Fast (recommended)') : t('Safe mode')} · {(fpsPick === 'auto' ? srcFps : fpsPick)} fps{part ? ` · ${rFrom}–${rTo} s` : ''}</span>
              ) : (
                <span>{what === 'gif' ? '🖼 GIF' : '🎵 Sound only'}</span>
              )}
              <button className="link" onClick={() => setMore(!more)}>{more ? '▾ ' + t('Fewer options') : '▸ ' + t('More options')}</button>
            </div>
            {more && (
            <div className="exp-more">
            <div className="osrc">
              <button className={what === 'video' ? 'on' : ''} onClick={() => setWhat('video')}>🎬 Video (MP4)</button>
              <button className={what === 'gif' ? 'on' : ''} onClick={() => { setWhat('gif'); setPart(dur > 30 || part) }}>🖼 GIF</button>
              <button className={what === 'audio' ? 'on' : ''} onClick={() => setWhat('audio')}>🎵 Sound only</button>
            </div>
            <label className="ochk">
              <input type="checkbox" checked={part} onChange={(e) => setPart(e.target.checked)} /> {t('Only part of the video')}
            </label>
            {part && (
              <div className="row2 range-row">
                <label>From <input type="number" min={0} max={dur} step={0.1} value={rFrom} onChange={(e) => setRFrom(+e.target.value)} /> s</label>
                <label>to <input type="number" min={0} max={dur} step={0.1} value={rTo} onChange={(e) => setRTo(+e.target.value)} /> s</label>
                <span className="hint">({Math.max(0, rTo - rFrom).toFixed(1)} s{getState().selIds.length ? ', from your selection' : ''})</span>
              </div>
            )}
            {what === 'gif' && <div className="hint">GIFs are silent, 480 px, 12 fps and up to 30 s – good for WhatsApp, Twitter/X and websites.</div>}
            {what === 'audio' && <div className="hint">Exports just the mixed sound – as .m4a (AAC), or .wav where the browser can’t make AAC. Handy for podcasts.</div>}
            {what === 'video' && (
            <>
            <label className={'opt' + (mode === 'fast' ? ' on' : '')}>
              <input type="radio" checked={mode === 'fast'} disabled={!fast?.ok} onChange={() => setMode('fast')} />
              <div>
                <b>{t('Fast (recommended)')}</b>
                <div className="hint">
                  {fast === null
                    ? 'Checking this browser…'
                    : fast.ok
                      ? 'Usually much quicker than the video’s length. Makes a standard MP4 for YouTube, Instagram and Facebook.'
                      : `Not available in this browser (${fast.reason}) – Safe mode is used instead.`}
                </div>
              </div>
            </label>
            {(mode === 'fast' || part) && (
              <div className="fps-row">
                <span>{t('Smoothness')}</span>
                <div className="seg">
                  {([['auto', `Same as my video (${srcFps} fps)`], [30, '30 fps'], [60, '60 fps'], [24, '24 fps · film']] as const).map(([v, n]) => (
                    <button key={String(v)} className={fpsPick === v ? 'on' : ''} onClick={() => setFpsPick(v)}>{n}</button>
                  ))}
                </div>
                <div className="hint">{(fpsPick === 'auto' ? srcFps : fpsPick) >= 50 ? '60 fps looks smoothest for action, sports and walking shots; the export takes about twice as long.' : 'Recorded at 60 fps? Pick 60 fps to keep it smooth.'}</div>
              </div>
            )}
            <label className={'opt' + (mode === 'realtime' ? ' on' : '')}>
              <input type="radio" checked={mode === 'realtime'} onChange={() => setMode('realtime')} />
              <div>
                <b>{t('Safe mode')}</b>
                <div className="hint">
                  Plays the video once while recording it – works on every device but takes {fmtTime(Math.ceil(dur))}. Keep this tab open and in front.{part ? ' (Parts always use Fast.)' : ''}
                </div>
              </div>
            </label>
            </>
            )}
            <details className="chap" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setChap(buildChapters())}>
              <summary>📑 YouTube chapters from your markers</summary>
              {chap && (
                <>
                  <textarea readOnly rows={Math.min(8, chap.text.split('\n').length + 1)} value={chap.text} />
                  {chap.problems.map((p) => <div key={p} className="hint warn">⚠ {p}</div>)}
                  <div className="hint">Put a marker (M) where each chapter starts; a title clip near a marker names the chapter. Paste this list into your YouTube description.</div>
                  <button className="btn sm" onClick={() => { void navigator.clipboard?.writeText(chap.text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? '✓ Copied' : '📋 Copy chapters'}</button>
                </>
              )}
            </details>
            </div>
            )}
            <div className="hint">{t('Nothing is uploaded – everything is processed on your device.')}</div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>{t('Close')}</button>
              <button className="btn primary big-save" disabled={dur <= 0} onClick={start}>
                {dur <= 0 ? 'Add a clip first' : '⬆ ' + t('Save video')}
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
              <button className="btn danger" onClick={cancel}>{t('Cancel')}</button>
            </div>
          </>
        )}

        {phase === 'done' && result && (
          <>
            {result.ext === 'gif' ? <img className="result" src={result.url} alt="GIF preview" /> : result.ext === 'm4a' || result.ext === 'wav' ? <audio className="result" src={result.url} controls /> : <video className="result" src={result.url} controls playsInline />}
            <div className="hint">
              {(result.size / 1048576).toFixed(1)} MB · .{result.ext}
              {result.ext === 'gif' || result.ext === 'm4a' || result.ext === 'wav'
                ? ''
                : result.codec.startsWith('H.264 + AAC') || result.codec === 'H.264 (no audio)'
                  ? ' – ready for YouTube, Instagram and Facebook.'
                  : ' – ready for YouTube and Facebook. This browser couldn’t make Instagram’s sound format; if Instagram refuses it, save the video again in Chrome on Android, Windows or Mac.'}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>{t('Close')}</button>
              {canShare(result.blob, name) && (
                <button className="btn" onClick={() => void navigator.share({ files: [new File([result.blob], name, { type: result.blob.type })], title: name }).catch(() => {})}>
                  ↗ {t('Share')}…
                </button>
              )}
              <a className="btn primary" href={result.url} download={name}>⬇ {t('Download')}</a>
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
                <button className="btn" onClick={() => { setMode('realtime'); setPhase('idle') }}>Try Safe mode instead</button>
              )}
              <button className="btn primary" onClick={start}>Try again</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

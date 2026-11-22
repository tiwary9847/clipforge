import { useEffect, useRef, useState } from 'react'
import { setUi } from '../store'
import type { Track } from '../musiclib'
import { MUSIC_MOODS, licenseLabel, needsCredit, searchMusic, addTrack } from '../musiclib'
import { Icon } from './Icon'

const toast = (m: string) => setUi({ toast: m })
const fmt = (s: number) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

/** Search free, video-safe music (and sound effects) and add it in one tap. */
export function MusicLibrary({ compact = false }: { compact?: boolean }) {
  const [kind, setKind] = useState<'music' | 'sound_effect'>('music')
  const [q, setQ] = useState('')
  const [length, setLength] = useState<'' | 'short' | 'medium' | 'long'>('')
  const [noCredit, setNoCredit] = useState(false)
  const [list, setList] = useState<Track[]>([])
  const [page, setPage] = useState(1)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState('')
  const [adding, setAdding] = useState('')
  const [blocked, setBlocked] = useState<Track | null>(null)
  const [playing, setPlaying] = useState('')
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => audio.current?.pause(), [])

  const run = async (query = q, pg = 1) => {
    setBusy(pg === 1 ? 'Searching…' : 'Loading more…')
    setBlocked(null)
    try {
      const r = await searchMusic({ q: query, kind, length, noCredit, page: pg })
      setList(pg === 1 ? r.tracks : [...list, ...r.tracks])
      setMore(r.more)
      setPage(pg)
      if (pg === 1 && !r.tracks.length) toast('Nothing found – try another word (in English: “happy”, “guitar”, “wedding”).')
    } catch (e) {
      toast((e as Error).message)
    }
    setBusy('')
  }
  const play = (t: Track) => {
    if (playing === t.id) {
      audio.current?.pause()
      setPlaying('')
      return
    }
    audio.current?.pause()
    const a = new Audio(t.url)
    a.volume = 0.8
    a.onended = () => setPlaying('')
    a.onerror = () => {
      setPlaying('')
      toast('This track can’t be played right now – try another one.')
    }
    a.play().catch(() => {})
    audio.current = a
    setPlaying(t.id)
  }
  const add = async (t: Track, at: 'start' | 'playhead') => {
    setAdding(t.id)
    try {
      toast(await addTrack(t, at, (m) => setBusy(m)))
    } catch (e) {
      if ((e as Error).message === 'blocked') setBlocked(t)
      else toast((e as Error).message)
    }
    setAdding('')
    setBusy('')
  }

  return (
    <div className="mlib">
      <div className="hint">
        Free {kind === 'music' ? 'music' : 'sound effects'} from Openverse (Jamendo, Freesound, Wikimedia Commons and more). Only licences that are safe in monetised videos are shown.{' '}
        <b>CC0</b> tracks need no credit; <b>CC BY</b> tracks need a credit line, which ClipForge adds to your description.
      </div>
      <div className="chips">
        <button className={'chip' + (kind === 'music' ? ' on' : '')} onClick={() => { setKind('music'); setList([]) }}>🎵 Music</button>
        <button className={'chip' + (kind === 'sound_effect' ? ' on' : '')} onClick={() => { setKind('sound_effect'); setList([]) }}>💥 Sound effects</button>
      </div>
      <form className="osearch" onSubmit={(e) => { e.preventDefault(); run() }}>
        <input placeholder={kind === 'music' ? 'Search: happy, guitar, wedding, travel…' : 'Search: whoosh, applause, rain…'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search free music" />
        <button className="btn sm primary" disabled={!!busy}><Icon name="search" size={14} /></button>
      </form>
      {kind === 'music' && (
        <div className="chips mlib-moods">
          {MUSIC_MOODS.slice(0, compact ? 8 : 16).map((m) => (
            <button key={m.q} className="chip" onClick={() => { setQ(m.q); run(m.q) }}>{m.name}</button>
          ))}
        </div>
      )}
      <div className="chips">
        {kind === 'music' &&
          ([['', 'Any length'], ['short', '30 s – 2 min'], ['medium', '2 – 10 min']] as const).map(([id, n]) => (
            <button key={id} className={'chip' + (length === id ? ' on' : '')} onClick={() => setLength(id)}>{n}</button>
          ))}
        <label className="ochk"><input type="checkbox" checked={noCredit} onChange={(e) => setNoCredit(e.target.checked)} /> No credit needed only</label>
      </div>
      {busy && <div className="hint">{busy}</div>}
      {blocked && (
        <div className="warn-box">
          <b>This site doesn’t let apps download “{blocked.title}” directly.</b> Download it, then drag the file into ClipForge.
          <div className="chips">
            <a className="btn sm" href={blocked.url} target="_blank" rel="noopener" download>⬇ Download</a>
            <a className="btn sm" href={blocked.page} target="_blank" rel="noopener">Open its page</a>
            {needsCredit(blocked) && <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(blocked.credit); toast('Credit line copied – paste it in your description.') }}>📋 Copy credit</button>}
          </div>
        </div>
      )}
      <div className="mlib-list">
        {list.map((t) => (
          <div key={t.id} className={'mtrack' + (playing === t.id ? ' on' : '')}>
            <button className="ico mt-play" onClick={() => play(t)} aria-label={playing === t.id ? 'Stop' : 'Listen'} title={playing === t.id ? 'Stop' : 'Listen'}>{playing === t.id ? '⏸' : '▶'}</button>
            <div className="mt-t">
              <b title={t.title}>{t.title}</b>
              <small>
                {t.creator}
                {t.duration ? ` · ${fmt(t.duration)}` : ''}
                {t.source ? ` · ${t.source}` : ''}
              </small>
              <span className={'mt-lic' + (needsCredit(t) ? ' credit' : '')} title={needsCredit(t) ? 'Free to use, also in monetised videos – put the credit line in your description' : 'Free to use for anything – no credit needed'}>
                {needsCredit(t) ? `${licenseLabel(t)} · credit needed` : `${licenseLabel(t)} · no credit needed`}
              </span>
            </div>
            <div className="mt-add">
              <button className="btn sm primary" disabled={!!adding} onClick={() => add(t, kind === 'music' ? 'start' : 'playhead')} title={kind === 'music' ? 'Add under the whole video' : 'Add at the playhead'}>
                {adding === t.id ? '…' : '+ Add'}
              </button>
              {kind === 'music' && <button className="btn sm" disabled={!!adding} onClick={() => add(t, 'playhead')} title="Start this track at the playhead">At ▸</button>}
            </div>
          </div>
        ))}
      </div>
      {more && <button className="btn full" disabled={!!busy} onClick={() => run(q, page + 1)}>Show more</button>}
      {!list.length && !busy && <div className="hint" style={{ textAlign: 'center' }}>Pick a mood or search to see tracks.</div>}
      <details className="chap">
        <summary>Using YouTube’s Audio Library?</summary>
        <div className="hint">
          YouTube doesn’t let other apps search its Audio Library, but you can still use it: open YouTube Studio → <b>Audio Library</b>, download a track, then drag the file into ClipForge. If the track says “Attribution required”, copy its credit text into your description.
        </div>
      </details>
    </div>
  )
}

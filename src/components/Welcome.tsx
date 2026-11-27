import { LegalLinks } from './LegalLinks'
import { PhoneHome, usePhone } from './PhoneHome'
import { ProjectList, useProjects } from './Projects'
import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { startTour } from './Tour'
import { importFiles } from './MediaPanel'
import { addAssetClip, getPreset, getState, setProject, setUi, useStore } from '../store'
import { engine } from '../engine'
import { LANGS, useT } from '../i18n'
import { install, useCanInstall } from '../install'
import { setSettings, useSettings } from '../settings'

/** Phones and tablets: you tap, you can't drop files. */
export const touch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
/** Opens one tool card in Tools (e.g. 'music', 'script'). */
export const openTool = (id: string) => {
  ;(window as any).__cfTool = id // picked up by the Tools panel when it mounts
  window.dispatchEvent(new CustomEvent('cf:tool', { detail: id }))
}

export const openPanel = (what: 'auto' | 'record' | 'templates' | 'memes' | 'gifs' | 'text' | 'texttab' | 'captions' | 'audio' | 'tools' | 'media') => window.dispatchEvent(new CustomEvent('cf:open', { detail: what }))

const FORMATS = [
  { id: 'shorts', icon: 'phone', name: 'Shorts · Reels', sub: '9:16 vertical' },
  { id: 'yt', icon: 'monitor', name: 'YouTube', sub: '16:9 widescreen' },
  { id: 'igportrait', icon: 'image', name: 'Insta post', sub: '4:5 portrait' },
  { id: 'square', icon: 'square', name: 'Square', sub: '1:1 feed' },
]

export function Welcome() {
  const presetId = useStore(() => getPreset().id)
  const t = useT()
  const lang = useSettings((x) => x.lang)
  const installable = useCanInstall()
  const [busy, setBusy] = useState(0)
  const [over, setOver] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const phone = usePhone()
  const projects = useProjects()
  const take = async (files: FileList | File[]) => {
    const before = new Set(getState().assets.map((a) => a.id))
    setBusy(Array.from(files).length)
    await importFiles(files, (m) => setUi({ toast: m }))
    setBusy(0)
    // drop new pictures/videos straight onto the timeline, in the order chosen
    const fresh = getState().assets.filter((a) => !before.has(a.id))
    for (const a of fresh) if (a.kind !== 'audio') addAssetClip(a.id, 'v1')
    for (const a of fresh) if (a.kind === 'audio') addAssetClip(a.id, 'a2', 0)
    setTimeout(() => engine.render(), 50)
  }
  if (phone) return <div className="welcome ph-host"><PhoneHome /></div>
  return (
    <div
      className={'welcome' + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); if (e.dataTransfer.files.length) void take(e.dataTransfer.files) }}
    >
      <div className="wl-card">
        <div className="wl-lang" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => setSettings({ lang: l.id })}>{l.name}</button>
          ))}
        </div>
        <div className="wl-hero">
          <div className="wl-orb"><Icon name="play" size={26} /></div>
          <h1>{t('Create something')} <span className="grad">{t('scroll-stopping')}</span></h1>
          <p>{t('Edit Shorts, Reels and YouTube videos with memes, captions and effects – right on your device.')}</p>
        </div>

        <button className="wl-drop" onClick={() => file.current?.click()} disabled={!!busy}>
          <Icon name="upload" size={26} />
          <b>{busy ? t('Importing…') : touch() ? t('Tap to add videos, photos or music') : t('Add videos, photos or music')}</b>
          <span>{touch() ? t('from your phone gallery · nothing is uploaded') : t('click to choose, or drop files here · nothing is uploaded')}</span>
        </button>
        <input ref={file} type="file" hidden multiple accept="video/*,image/*,audio/*" onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = '' }} />

        <div className="wl-label">{t('Format')}</div>
        <div className="wl-formats">
          {FORMATS.map((f) => (
            <button key={f.id} className={'wl-fmt' + (presetId === f.id ? ' on' : '')} onClick={() => { setProject({ presetId: f.id }); setTimeout(() => engine.render(), 0) }}>
              <Icon name={f.icon} size={20} />
              <b>{t(f.name)}</b>
              <small>{t(f.sub)}</small>
            </button>
          ))}
        </div>

        {installable && touch() && (
          <button className="wl-install" onClick={() => void install()}>📲 {t('Install ViralKaro on this phone')} <small>{t('– opens like an app, works offline')}</small></button>
        )}
        <div className="wl-label">{t('Or start with')} <button className="lnk wl-tour" onClick={startTour}>{t('· New here? Make your first reel in 60 seconds')}</button></div>
        <div className="wl-actions">
          <button onClick={() => openPanel('record')}><span className="wa-ic b"><Icon name="record" size={18} /></span><b>{t('Record')}</b><small>{t('Screen, webcam or both')}</small></button>
          <button onClick={() => openPanel('templates')}><span className="wa-ic c"><Icon name="layout" size={18} /></span><b>{t('Templates')}</b><small>{t('Ready-made layouts')}</small></button>
          <button onClick={() => openPanel('memes')}><span className="wa-ic d"><Icon name="smile" size={18} /></span><b>{t('Memes')}</b><small>{t('With sound, one tap')}</small></button>
          <button onClick={() => openTool('script')}><span className="wa-ic a"><Icon name="type" size={18} /></span><b>{t('Script to video')}</b><small>{t('Type a script – get a video')}</small></button>
        </div>
        {projects.length > 0 && (
          <>
            <div className="wl-label">📁 {t('My projects')}</div>
            <ProjectList row />
          </>
        )}
        <LegalLinks className="wl-legal" />
      </div>
    </div>
  )
}

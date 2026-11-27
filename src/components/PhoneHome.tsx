import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { startTour } from './Tour'
import { openPanel, openTool } from './Welcome'
import { addToMain } from './BatchTrim'
import { LegalLinks } from './LegalLinks'
import { TemplateFeed } from './TemplateFeed'
import { ProjectList, useProjects } from './Projects'
import { getPreset, getState, setProject, setUi, useStore } from '../store'
import { engine } from '../engine'
import { LANGS, useT } from '../i18n'
import { install, useCanInstall } from '../install'
import { setSettings, useSettings } from '../settings'

/** Phones (narrow screens) get the home screen instead of the desktop welcome card. */
export function usePhone() {
  const q = '(max-width: 820px)'
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** Show or hide the home screen over the editor (phones). */
export const showHome = (on: boolean) => window.dispatchEvent(new CustomEvent('cf:home', { detail: on }))

const FORMATS = [
  { id: 'shorts', name: 'Reel · Short', icon: 'phone' },
  { id: 'yt', name: 'YouTube', icon: 'monitor' },
  { id: 'igportrait', name: 'Insta post', icon: 'image' },
  { id: 'square', name: 'Square', icon: 'square' },
]

const openText = () => {
  ;(window as any).__cfPending = 'text'
  openPanel('tools')
  setTimeout(() => window.dispatchEvent(new CustomEvent('cf:tools', { detail: 'text' })), 80)
}

type Tool = { id: string; name: string; icon: string; badge?: 'hot' | 'new'; go: () => void; col: string }
const TOOLS: Tool[] = [
  { id: 'captions', name: 'Auto captions', icon: 'captions', badge: 'hot', go: () => openPanel('captions'), col: 'a' },
  { id: 'record', name: 'Camera', icon: 'record', go: () => openPanel('record'), col: 'b' },
  { id: 'fillers', name: 'Remove “um, uh”', icon: 'type', go: openText, col: 'c' },
  { id: 'batchtrim', name: 'Batch trim', icon: 'scissors', badge: 'new', go: () => openTool('batchtrim'), col: 'd' },
  { id: 'memes', name: 'Memes', icon: 'smile', go: () => openPanel('memes'), col: 'd' },
  { id: 'gifs', name: 'GIFs', icon: 'image', go: () => openPanel('gifs'), col: 'a' },
  { id: 'enhance', name: 'Photo enhance', icon: 'sparkles', go: () => openTool('enhance'), col: 'b' },
  { id: 'more', name: 'More tools', icon: 'more', go: () => openPanel('tools'), col: 'c' },
]

export function PhoneHome({ overlay }: { overlay?: boolean }) {
  const t = useT()
  const lang = useSettings((x) => x.lang)
  const presetId = useStore(() => getPreset().id)
  const clips = useStore((s) => s.project.clips.length)
  const name = useStore((s) => s.projectName)
  const installable = useCanInstall()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const projects = useProjects()
  const go = (f: () => void) => { showHome(false); f() }
  return (
    <div className={'ph' + (overlay ? ' ph-over' : '')}>
      <div className="ph-lang" role="group" aria-label="Language">
        {LANGS.map((l) => (
          <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => setSettings({ lang: l.id })}>{l.name}</button>
        ))}
      </div>

      {clips > 0 && (
        <button className="ph-cont" onClick={() => showHome(false)}>
          <span className="ph-cont-ic"><Icon name="play" size={18} /></span>
          <span><b>{t('Continue editing')}</b><small>{name} · {clips} {clips === 1 ? 'clip' : 'clips'}</small></span>
          <Icon name="right" size={18} />
        </button>
      )}

      <div className="ph-hero">
        <button className="ph-create" disabled={busy} onClick={() => file.current?.click()}>
          <span className="ph-plus"><Icon name="plus" size={30} /></span>
          <b>{busy ? t('Importing…') : t('Create')}</b>
          <small>{t('Pick videos & photos')}</small>
        </button>
        <button className="ph-side a" onClick={() => go(() => openPanel('auto'))}>
          <Icon name="sparkles" size={20} /><b>{t('Auto-edit')}</b><i className="bdg hot">Hot</i>
        </button>
        <button className="ph-side b" onClick={() => go(() => openTool('script'))}>
          <Icon name="type" size={20} /><b>{t('Script to video')}</b>
        </button>
      </div>
      <input ref={file} type="file" hidden multiple accept="video/*,image/*,audio/*" onChange={async (e) => {
        const f = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (!f.length) return
        setBusy(true)
        await addToMain(f)
        setBusy(false)
        showHome(false)
      }} />

      <div className="ph-tools">
        {TOOLS.map((x) => (
          <button key={x.id} className="ph-tool" onClick={() => go(x.go)}>
            <span className={'ph-ic wa-ic ' + x.col}><Icon name={x.icon} size={20} /></span>
            <span className="ph-name">{t(x.name)}</span>
            {x.badge && <i className={'bdg ' + x.badge}>{x.badge === 'hot' ? 'Hot' : 'New'}</i>}
          </button>
        ))}
      </div>

      {projects.length > 0 && (
        <>
          <div className="ph-h">📁 {t('My projects')}</div>
          <ProjectList row onOpen={() => showHome(false)} />
        </>
      )}

      <div className="ph-h">{t('Format')}</div>
      <div className="ph-fmts">
        {FORMATS.map((f) => (
          <button key={f.id} className={presetId === f.id ? 'on' : ''} onClick={() => { setProject({ presetId: f.id }); setTimeout(() => engine.render(), 0) }}>
            <Icon name={f.icon} size={15} /> {t(f.name)}
          </button>
        ))}
      </div>

      <TemplateFeed onPick={() => showHome(false)} />

      {installable && (
        <button className="wl-install" onClick={() => void install()}>📲 {t('Install ViralKaro on this phone')} <small>{t('– opens like an app, works offline')}</small></button>
      )}
      {!getState().project.clips.length && <button className="lnk ph-tour" onClick={startTour}>{t('New here? Make your first reel in 60 seconds')} →</button>}
      <LegalLinks className="wl-legal" />
      {busy && <div className="ph-busy" onClick={() => setUi({ toast: 'Importing your files…' })} />}
    </div>
  )
}

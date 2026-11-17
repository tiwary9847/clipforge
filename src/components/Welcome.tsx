import { useRef, useState } from 'react'
import { Icon } from './Icon'
import { importFiles } from './MediaPanel'
import { addAssetClip, getPreset, getState, setProject, setUi, useStore } from '../store'
import { engine } from '../engine'

export const openPanel = (what: 'auto' | 'record' | 'templates' | 'memes' | 'text') => window.dispatchEvent(new CustomEvent('cf:open', { detail: what }))

const FORMATS = [
  { id: 'shorts', icon: 'phone', name: 'Shorts · Reels', sub: '9:16 vertical' },
  { id: 'yt', icon: 'monitor', name: 'YouTube', sub: '16:9 widescreen' },
  { id: 'igportrait', icon: 'image', name: 'Insta post', sub: '4:5 portrait' },
  { id: 'square', icon: 'square', name: 'Square', sub: '1:1 feed' },
]

export function Welcome() {
  const presetId = useStore(() => getPreset().id)
  const [busy, setBusy] = useState(0)
  const [over, setOver] = useState(false)
  const file = useRef<HTMLInputElement>(null)
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
  return (
    <div
      className={'welcome' + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); if (e.dataTransfer.files.length) void take(e.dataTransfer.files) }}
    >
      <div className="wl-card">
        <div className="wl-hero">
          <div className="wl-orb"><Icon name="play" size={26} /></div>
          <h1>Create something <span className="grad">scroll-stopping</span></h1>
          <p>Edit Shorts, Reels and YouTube videos with memes, captions and effects – right on your device.</p>
        </div>

        <button className="wl-drop" onClick={() => file.current?.click()} disabled={!!busy}>
          <Icon name="upload" size={26} />
          <b>{busy ? `Importing ${busy} file${busy > 1 ? 's' : ''}…` : 'Drop videos, photos or music here'}</b>
          <span>or click to browse · nothing is uploaded</span>
        </button>
        <input ref={file} type="file" hidden multiple accept="video/*,image/*,audio/*" onChange={(e) => { if (e.target.files) void take(e.target.files); e.target.value = '' }} />

        <div className="wl-label">Format</div>
        <div className="wl-formats">
          {FORMATS.map((f) => (
            <button key={f.id} className={'wl-fmt' + (presetId === f.id ? ' on' : '')} onClick={() => { setProject({ presetId: f.id }); setTimeout(() => engine.render(), 0) }}>
              <Icon name={f.icon} size={20} />
              <b>{f.name}</b>
              <small>{f.sub}</small>
            </button>
          ))}
        </div>

        <div className="wl-label">Or start with</div>
        <div className="wl-actions">
          <button onClick={() => openPanel('auto')}><span className="wa-ic a"><Icon name="sparkles" size={18} /></span><b>Auto-edit</b><small>Clips in → edited video out</small></button>
          <button onClick={() => openPanel('record')}><span className="wa-ic b"><Icon name="record" size={18} /></span><b>Record</b><small>Screen, webcam or both</small></button>
          <button onClick={() => openPanel('templates')}><span className="wa-ic c"><Icon name="layout" size={18} /></span><b>Templates</b><small>Ready-made layouts</small></button>
          <button onClick={() => openPanel('memes')}><span className="wa-ic d"><Icon name="smile" size={18} /></span><b>Memes</b><small>With sound, one tap</small></button>
        </div>
      </div>
    </div>
  )
}

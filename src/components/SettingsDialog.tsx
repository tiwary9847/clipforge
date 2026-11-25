import { LANGS } from '../i18n'
import { useState } from 'react'
import { ACCENTS, activeSkin, resetSettings, setSettings, SKINS, Size, useSettings } from '../settings'
import { TOOL_META } from './ToolCards'
import { Icon } from './Icon'

const SIZES: [Size, string][] = [
  ['sm', 'Small'],
  ['md', 'Normal'],
  ['lg', 'Large'],
  ['xl', 'Extra large'],
]

function Seg<T extends string>({ value, list, onPick }: { value: T; list: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {list.map(([id, n]) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} onClick={() => onPick(id)}>{n}</button>
      ))}
    </div>
  )
}
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings((x) => x)
  const skin = activeSkin()
  const [tab, setTab] = useState<'look' | 'layout' | 'tools'>('look')
  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal set" role="dialog" aria-label="Settings">
        <div className="set-h">
          <Icon name="gear" size={20} />
          <b>Settings</b>
          <button className="ico" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div className="set-tabs">
          {([['look', '🎨 Look'], ['layout', '📐 Layout & timeline'], ['tools', '🛠 Tools']] as const).map(([id, n]) => (
            <button key={id} className={'chip' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{n}</button>
          ))}
        </div>
        <div className="set-body">
          {tab === 'look' && (
            <>
              <div className="set-lbl">Language · भाषा</div>
              <div className="seg set-lang">
                {LANGS.map((l) => (
                  <button key={l.id} className={s.lang === l.id ? 'on' : ''} onClick={() => setSettings({ lang: l.id })}>{l.name}</button>
                ))}
              </div>
              <small className="muted">Buttons, tabs, tool names and Save are translated; the settings inside each tool stay in English for now.</small>
              <div className="set-lbl">Theme</div>
              <div className="skins">
                {SKINS.map((k) => (
                  <button key={k.id} className={'skin' + (skin === k.id ? ' on' : '')} onClick={() => setSettings(k.dark ? { skin: k.id, lastDark: k.id } : { skin: k.id, lastLight: k.id })}>
                    <span className="sk-pv" style={{ background: k.sw[0] }}>
                      <i style={{ background: k.sw[1] }} />
                      <i style={{ background: k.sw[1] }}><u style={{ background: k.id === 'oled' || k.id === 'paper' || k.id === 'midnight' ? k.sw[2] : 'var(--accent)' }} /></i>
                    </span>
                    <small>{k.name}</small>
                  </button>
                ))}
              </div>
              <div className="set-row">
                <div>
                  <b>Follow my device</b>
                  <small>Switch between your light and dark theme with the phone/computer setting</small>
                </div>
                <Switch label="Follow my device" on={!s.skin} onChange={(v) => setSettings({ skin: v ? '' : skin })} />
              </div>
              <div className="set-lbl">Accent colour</div>
              <div className="accents">
                {ACCENTS.map((a) => (
                  <button key={a.id} className={'acc' + (s.accent === a.id ? ' on' : '')} style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b} 60%, ${a.c})` }} title={a.name} aria-label={`${a.name} accent`} onClick={() => setSettings({ accent: a.id })} />
                ))}
              </div>
              <div className="set-row">
                <div>
                  <b>Animations</b>
                  <small>Turn off for a calmer, faster feel on older phones</small>
                </div>
                <Switch label="Animations" on={s.motion} onChange={(v) => setSettings({ motion: v })} />
              </div>
              <div className="set-row">
                <div>
                  <b>“Next” tips under the video</b>
                  <small>One-tap Auto-edit, captions, music, text and Save once a video is added</small>
                </div>
                <Switch label="Next tips" on={s.nextSteps} onChange={(v) => setSettings({ nextSteps: v })} />
              </div>
            </>
          )}
          {tab === 'layout' && (
            <>
              <div className="set-row">
                <div>
                  <b>Text & button size</b>
                  <small>Side panels, timeline toolbar and windows</small>
                </div>
                <Seg value={s.uiSize} list={SIZES} onPick={(v) => setSettings({ uiSize: v })} />
              </div>
              <div className="set-row">
                <div>
                  <b>Tall side panels</b>
                  <small>Tools and the Inspector use the full screen height; the timeline sits under the preview only (computer)</small>
                </div>
                <Switch label="Tall side panels" on={s.tall} onChange={(v) => setSettings({ tall: v })} />
              </div>
              <div className="set-row">
                <div>
                  <b>Track height</b>
                  <small>Taller tracks show bigger thumbnails and waveforms</small>
                </div>
                <Seg value={s.trackH} list={SIZES} onPick={(v) => setSettings({ trackH: v })} />
              </div>
              <div className="set-row">
                <div>
                  <b>Timeline height</b>
                  <small>Or drag the top edge of the timeline</small>
                </div>
                <Seg<string>
                  value={String(innerWidth <= 820 ? s.tlHm : s.tlH)}
                  list={(innerWidth <= 820 ? [['0', 'Auto'], ['200', 'Short'], ['280', 'Normal'], ['380', 'Tall']] : [['0', 'Auto'], ['230', 'Short'], ['300', 'Normal'], ['420', 'Tall'], ['540', 'Huge']]) as [string, string][]}
                  onPick={(v) => setSettings(innerWidth <= 820 ? { tlHm: +v } : { tlH: +v })}
                />
              </div>
            </>
          )}
          {tab === 'tools' && (
            <>
              <div className="set-row">
                <div>
                  <b>Show explanations</b>
                  <small>The grey help lines under tools and settings. Turn off once you know your way around.</small>
                </div>
                <Switch label="Show explanations" on={s.hints} onChange={(v) => setSettings({ hints: v })} />
              </div>
              <div className="set-row">
                <div>
                  <b>Open every tool</b>
                  <small>The classic long list instead of fold-up cards</small>
                </div>
                <Switch label="Open every tool" on={s.toolsOpen} onChange={(v) => setSettings({ toolsOpen: v })} />
              </div>
              <div className="set-lbl">Tools to show in the Tools tab</div>
              <div className="tool-list">
                {TOOL_META.map(([name, id]) => (
                  <label key={id}>
                    <input type="checkbox" checked={!s.hidden.includes(id)} onChange={(e) => setSettings({ hidden: e.target.checked ? s.hidden.filter((x) => x !== id) : [...s.hidden, id] })} />
                    {name}
                    {s.pins.includes(id) && <span title="Pinned">★</span>}
                  </label>
                ))}
              </div>
              <div className="chips">
                <button className="chip" onClick={() => setSettings({ hidden: [] })}>Show all</button>
                <button className="chip" onClick={() => setSettings({ pins: [] })}>Unpin all</button>
              </div>
            </>
          )}
        </div>
        <div className="set-foot">
          <button className="btn" onClick={resetSettings}>Reset to default</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

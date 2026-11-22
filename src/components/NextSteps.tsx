import { useT } from '../i18n'
import { setSettings, useSettings } from '../settings'
import { useStore } from '../store'
import { openPanel, openTool } from './Welcome'

/** A row of the usual next moves once a video is on the timeline – so nobody has to hunt through tabs. */
export function NextSteps() {
  const t = useT()
  const on = useSettings((s) => s.nextSteps)
  const has = useStore((s) => s.project.clips.some((c) => c.kind === 'video' || c.kind === 'image'))
  const captioned = useStore((s) => s.project.clips.some((c) => c.kind === 'text' && c.track === 'v4'))
  const music = useStore((s) => s.project.clips.some((c) => c.track === 'a2'))
  if (!on || !has) return null
  const steps: [string, string, () => void, boolean?][] = [
    ['🤖', t('Ask AI'), () => window.dispatchEvent(new CustomEvent('cf:assistant', { detail: '' }))],
    ['✨', t('Auto-edit'), () => openPanel('auto')],
    ['💬', t('Add captions'), () => openPanel('captions'), captioned],
    ['🎵', t('Add music'), () => openTool('music'), music],
    ['🔤', t('Add text'), () => openPanel('texttab')],
    ['✅', t('Check & fix'), () => openTool('ready')],
  ]
  return (
    <div className="nextsteps" role="toolbar" aria-label="Next steps">
      <span className="ns-lbl">{t('Next:')}</span>
      {steps.map(([ic, name, go, done]) => (
        <button key={name} className={'ns' + (done ? ' done' : '')} onClick={go}>
          <span>{done ? '✓' : ic}</span>
          {name}
        </button>
      ))}
      <button className="ns save" onClick={() => window.dispatchEvent(new CustomEvent('cf:export'))}>⬆ {t('Save video')}</button>
      <button className="ns-x" title={t('Hide these tips')} aria-label={t('Hide these tips')} onClick={() => setSettings({ nextSteps: false })}>×</button>
    </div>
  )
}

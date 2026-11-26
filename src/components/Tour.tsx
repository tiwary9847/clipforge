import { useEffect, useLayoutEffect, useState } from 'react'
import { Icon } from './Icon'
import { getState } from '../store'

// First-run guide: make your first reel in 60 seconds – add a video → one-tap Auto-edit → change anything → export.
// Each step spotlights the first visible element from its selector list (desktop and phone layouts differ).
// Step 1 moves on by itself as soon as a video is on the timeline.

interface Step {
  sel: string[]
  icon: string
  title: string
  text: string
  phone?: string
  waitFor?: () => boolean // moves on by itself when this becomes true
}

const STEPS: Step[] = [
  {
    sel: ['.wl-drop', '.ph-create', '.left .tab:nth-child(1)', '.mnav button:nth-child(1)'],
    icon: 'upload',
    title: '1 · Add your video',
    text: 'Click here and pick a video (or a few clips). It goes straight onto the timeline – nothing is uploaded, it all stays on your device.',
    phone: 'Tap here and pick a video from your gallery. Nothing is uploaded.',
    waitFor: () => getState().project.clips.length > 0,
  },
  {
    sel: ['.ae-btn'],
    icon: 'sparkles',
    title: '2 · One tap: Auto-edit',
    text: 'Auto-edit cuts the dead air and adds music, memes, transitions and an ending for you. Prefer to do it yourself? Just press Next.',
  },
  {
    sel: ['.stage canvas', '.stage'],
    icon: 'type',
    title: '3 · Change anything',
    text: 'Double-click any text on the video to change the words, drag it to move it. Add your own text, captions, GIFs and music from the tabs on the left.',
    phone: 'Double-tap any text on the video to change it, drag to move. Tap “Add” for text, captions, GIFs and music.',
  },
  {
    sel: ['.top .btn.primary', '.mnav .mn-export'],
    icon: 'upload',
    title: '4 · Export & post',
    text: 'Export makes an MP4 ready for Reels, Shorts and YouTube. Tip: Tools → 💬 Comment preview shows the comments you’d get – fix them before you post.',
    phone: 'Tap Export for an MP4 ready for Reels, Shorts, YouTube and WhatsApp.',
  },
]

const KEY = 'clipforge-tour-done'
export const tourDone = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}
export const startTour = () => window.dispatchEvent(new Event('cf:tour'))

const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
}

export function Tour() {
  const [step, setStep] = useState(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(max-width: 820px)').matches

  useEffect(() => {
    const go = () => setStep(0)
    window.addEventListener('cf:tour', go)
    // first visit: start automatically (not for automated browsers)
    const id = !tourDone() && !navigator.webdriver ? window.setTimeout(go, 900) : undefined
    return () => {
      window.removeEventListener('cf:tour', go)
      clearTimeout(id)
    }
  }, [])

  // follow the target as the layout changes
  useLayoutEffect(() => {
    if (step < 0) return
    const find = () => {
      const el = STEPS[step].sel.map((s) => document.querySelector(s)).find(visible) ?? null
      const r = el?.getBoundingClientRect() ?? null
      setRect((old) => (old && r && Math.abs(old.x - r.x) < 1 && Math.abs(old.y - r.y) < 1 && Math.abs(old.width - r.width) < 1 && Math.abs(old.height - r.height) < 1 ? old : r))
    }
    find()
    const id = setInterval(find, 250)
    addEventListener('resize', find)
    return () => {
      clearInterval(id)
      removeEventListener('resize', find)
    }
  }, [step])

  // "do it" steps: move on as soon as it's done
  useEffect(() => {
    const w = step >= 0 ? STEPS[step].waitFor : undefined
    if (!w) return
    const id = setInterval(() => w() && setStep((x) => (x === step ? x + 1 : x)), 400)
    return () => clearInterval(id)
  }, [step])

  const close = () => {
    setStep(-1)
    try {
      localStorage.setItem(KEY, '1')
    } catch {}
  }
  useEffect(() => {
    if (step < 0) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') step < STEPS.length - 1 ? setStep(step + 1) : close()
      else if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1)
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    addEventListener('keydown', k, true)
    return () => removeEventListener('keydown', k, true)
  })

  if (step < 0) return null
  const s = STEPS[step]
  const pad = 8
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null

  // place the card beside the spotlight where there's most room
  const CW = Math.min(340, innerWidth - 24)
  const CH = 210
  let pos: React.CSSProperties = { left: (innerWidth - CW) / 2, top: (innerHeight - CH) / 2 }
  if (hole) {
    const below = innerHeight - (hole.top + hole.height)
    const above = hole.top
    const right = innerWidth - (hole.left + hole.width)
    const cx = Math.min(Math.max(12, hole.left + hole.width / 2 - CW / 2), innerWidth - CW - 12)
    if (below >= CH + 16) pos = { left: cx, top: hole.top + hole.height + 14 }
    else if (above >= CH + 16) pos = { left: cx, top: hole.top - CH - 14 }
    else if (right >= CW + 16) pos = { left: hole.left + hole.width + 14, top: Math.min(Math.max(12, hole.top), innerHeight - CH - 12) }
    else pos = { left: Math.max(12, hole.left - CW - 14), top: Math.min(Math.max(12, hole.top), innerHeight - CH - 12) }
  }

  return (
    <div className="tour" role="dialog" aria-label="Make your first reel">
      {hole ? <div className="tour-hole" style={hole} /> : <div className="tour-dim" />}
      <div className="tour-card" style={{ ...pos, width: CW }} key={step}>
        <div className="tour-top">
          <span className="tour-ic"><Icon name={s.icon} size={18} /></span>
          <b>{s.title}</b>
          {step === 0 && <small className="tour-sub">Your first reel in 60 seconds</small>}
          <button className="tour-x" onClick={close} aria-label="Close tour"><Icon name="x" size={16} /></button>
        </div>
        <p>{phone && s.phone ? s.phone : s.text}</p>
        <div className="tour-foot">
          <div className="tour-dots">
            {STEPS.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)} />)}
          </div>
          <button className="lnk" onClick={close}>Skip</button>
          {step > 0 && <button className="btn sm" onClick={() => setStep(step - 1)}>Back</button>}
          <button className="btn sm primary" onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : close())}>
            {step < STEPS.length - 1 ? (s.waitFor && !s.waitFor() ? 'Skip this step' : 'Next') : 'Done 🎬'}
          </button>
        </div>
      </div>
    </div>
  )
}

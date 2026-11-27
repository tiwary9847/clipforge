// "Pick your clips → make the video" used by festival cards, birthdays and the daily idea.
import { applyVideoTemplate } from './creative'
import { importFiles } from './components/MediaPanel'
import { getState, setUi } from './store'
import { engine } from './engine'

const toast = (m: string) => setUi({ toast: m })

/** Must be called from a tap/click (opens the gallery). */
export function pickAndMake(template: string, texts?: string[], after?: () => void) {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.multiple = true
  inp.accept = 'video/*,image/*'
  inp.style.display = 'none'
  document.body.appendChild(inp)
  inp.onchange = async () => {
    const files = Array.from(inp.files ?? [])
    inp.remove()
    if (!files.length) return
    try {
      const before = new Set(getState().assets.map((a) => a.id))
      await importFiles(files, toast)
      const ids = getState().assets.filter((a) => !before.has(a.id) && (a.kind === 'video' || a.kind === 'image')).map((a) => a.id)
      if (!ids.length) throw new Error('Pick videos or photos.')
      after?.()
      const start = getState().project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, c.start + c.dur), 0)
      toast(await applyVideoTemplate(template, ids, undefined, toast, { texts }))
      engine.seek(start)
      setTimeout(() => engine.play(), 400)
    } catch (e) {
      toast((e as Error).message)
    }
  }
  inp.click()
}

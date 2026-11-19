// Tap an object in a video once: blur/pixelate it through the whole clip, or cut it out as its own video.
import { followPoint, objectMask, removeBackground } from './pro'
import { checkpoint, getAsset, getClip, getState, insertSilent, patchClip, setClipsSilent, uid } from './store'
import { engine } from './engine'
import { Clip, Keyframe } from './types'

export interface ObjBox {
  // source pixels of the object on the tapped frame
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Track the object's centre forwards and backwards from the tapped moment. Returns clip-local times + source px. */
async function trackBoth(c: Clip, cx: number, cy: number, onProgress: (p: number) => void) {
  const t0 = engine.time >= c.start && engine.time < c.start + c.dur ? engine.time : c.start
  const fwd = await followPoint(c.id, cx, cy, t0, (p) => onProgress(0.5 + 0.5 * p))
  // and backwards to the start of the clip
  const bwd = t0 - c.start > 0.1 ? await followPoint(c.id, cx, cy, t0, (p) => onProgress(0.5 * p), true) : { t: [], pts: [], lost: 0 }
  const t: number[] = []
  const pts: [number, number][] = []
  for (let k = bwd.t.length - 1; k >= 1; k--) {
    t.push(bwd.t[k])
    pts.push(bwd.pts[k])
  }
  for (let k = 0; k < fwd.t.length; k++) {
    t.push(fwd.t[k])
    pts.push(fwd.pts[k])
  }
  const lost = fwd.lost + bwd.lost
  return { t, pts, lost }
}

/** Blur or pixelate the object through the whole clip (a soft mask that follows it). */
export async function hideObjectInVideo(clipId: string, box: ObjBox, mode: 'blur' | 'pixelate', onProgress: (p: number) => void): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Pick a video clip.')
  const cl = c.crop?.l ?? 0
  const ct = c.crop?.t ?? 0
  const fw = 1 - cl - (c.crop?.r ?? 0)
  const fh = 1 - ct - (c.crop?.b ?? 0)
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  const tr = await trackBoth(c, cx, cy, onProgress)
  const mx: Keyframe[] = []
  const my: Keyframe[] = []
  tr.t.forEach((t, i) => {
    mx.push({ t: +t.toFixed(3), v: +((tr.pts[i][0] / a.width - cl) / fw - 0.5).toFixed(4) })
    my.push({ t: +t.toFixed(3), v: +((tr.pts[i][1] / a.height - ct) / fh - 0.5).toFixed(4) })
  })
  const ms = Math.min(1, Math.max((box.x1 - box.x0) / a.width / fw, (box.y1 - box.y0) / a.height / fh) * 1.35)
  checkpoint()
  patchClip(c.id, { mask: { shape: 'ellipse', radius: 0.2, mode, amt: 0.75 }, ms, kf: { ...(c.kf ?? {}), mx, my } })
  engine.requestRender()
  return `The object is ${mode === 'blur' ? 'blurred' : 'pixelated'} through the whole clip${tr.lost ? ' (it was lost for a moment – check by playing)' : ''}. Adjust in Mask; Undo to remove.`
}

/** Cut the object out of the whole clip: re-finds it every few frames at the tracked spot. Adds it on a layer above. */
export async function cutObjectInVideo(clipId: string, box: ObjBox, status: (m: string, p?: number) => void, signal: { cancelled: boolean }): Promise<string> {
  const c = getClip(clipId)
  const a = c && getAsset(c.assetId)
  if (!c || !a || c.kind !== 'video') throw new Error('Pick a video clip.')
  status('Following the object…')
  const tr = await trackBoth(c, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (p) => status(`Following the object… ${Math.round(p * 100)}%`))
  const srcOf = (lt: number) => c.srcIn + lt * c.speed
  const at = (srcT: number): [number, number] => {
    // tracked point nearest in time
    let best = 0
    let bd = Infinity
    tr.t.forEach((t, i) => {
      const d = Math.abs(srcOf(t) - srcT)
      if (d < bd) {
        bd = d
        best = i
      }
    })
    return tr.pts[best]
  }
  checkpoint()
  const track = c.track === 'v1' ? 'v2' : c.track === 'v2' ? 'v3' : 'v4'
  const dup: Clip = { ...c, id: uid('clip'), track, volume: 0, group: undefined, label: `${c.label} (object)`, mask: undefined, kf: c.kf ? JSON.parse(JSON.stringify(c.kf)) : undefined }
  insertSilent([dup])
  try {
    await removeBackground(dup.id, (m, p) => status(m.replace('Removing background', 'Cutting out the object'), p), signal, 'remove', false, async (d, w, h, srcT) => {
      const [px, py] = at(srcT)
      return objectMask(d, w, h, [[(px / a.width) * w, (py / a.height) * h]], [1])
    })
  } catch (e) {
    setClipsSilent(getState().project.clips.filter((x) => x.id !== dup.id))
    throw e
  }
  engine.requestRender()
  return 'The object is cut out of the whole clip, on the layer above. Put any background under it, move it, or add a glow.'
}

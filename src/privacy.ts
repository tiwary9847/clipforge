// Auto-blur strangers: track every face in the main videos, keep the people you choose (by default the
// person on screen the most – usually you) and blur or pixelate everyone else. Runs on the device.
import { CanvasSink } from 'mediabunny'
import { trackFaces } from './faces'
import { getInput } from './media'
import { checkpoint, getAsset, getState, setClipsSilent } from './store'

export interface Person {
  assetId: string
  index: number // face slot in the track
  share: number // 0..1 of the tracked time this person is on screen
  size: number // average face width (0..1 of the frame)
  thumb?: string // data URL of the face
}

/** Main-track videos that have people in them. */
const videos = () => getState().project.clips.filter((c) => c.kind === 'video' && c.track === 'v1' && getAsset(c.assetId))

/** Tracks faces in every main video (only once per clip) and lists the people found, main person first. */
export async function findPeople(status: (m: string, p?: number) => void, signal?: { cancelled: boolean }): Promise<Person[]> {
  const list = videos()
  if (!list.length) throw new Error('Put your video on the Main track first.')
  const done = new Set<string>()
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (done.has(c.assetId!)) continue
    done.add(c.assetId!)
    await trackFaces(c.id, (p, m) => status(list.length > 1 ? `Clip ${i + 1}/${list.length}: ${m}` : m, p), signal)
  }
  const people: Person[] = []
  for (const aid of done) {
    const tr = getState().project.faces?.[aid]
    if (!tr) continue
    const n = Math.max(0, ...tr.frames.map((r) => r.length))
    for (let k = 0; k < n; k++) {
      let seen = 0
      let size = 0
      let best = -1
      let bestW = 0
      tr.frames.forEach((r, i) => {
        const f = r[k]
        if (!f) return
        seen++
        size += f[2]
        if (f[2] > bestW) {
          bestW = f[2]
          best = i
        }
      })
      if (seen < 2) continue // a one-frame blip is not a person
      people.push({ assetId: aid, index: k, share: seen / tr.frames.length, size: size / seen, thumb: best >= 0 ? await faceThumb(aid, tr.t0 + best / tr.fps, tr.frames[best][k]!) : undefined })
    }
  }
  // main person first: on screen the most, then biggest
  return people.sort((a, b) => b.share * 2 + b.size - (a.share * 2 + a.size))
}

async function faceThumb(assetId: string, t: number, f: number[]): Promise<string | undefined> {
  try {
    const a = getAsset(assetId)!
    const tr = await getInput(a).getPrimaryVideoTrack()
    if (!tr) return
    const W = 480
    const H = Math.round((W * a.height) / Math.max(1, a.width))
    const fr = await new CanvasSink(tr, { width: W, height: H, fit: 'fill' }).getCanvas(t)
    if (!fr) return
    const cv = document.createElement('canvas')
    cv.width = cv.height = 64
    const s = Math.max(f[2] * W, f[3] * H) * 1.3
    cv.getContext('2d')!.drawImage(fr.canvas as HTMLCanvasElement, f[0] * W - s / 2, f[1] * H - s / 2, s, s, 0, 0, 64, 64)
    return cv.toDataURL('image/jpeg', 0.7)
  } catch {
    return
  }
}

/** Blurs everyone except `keep` (people from findPeople) on every main video. */
export function applyBlur(people: Person[], keep: Person[], mode: 'blur' | 'pixel'): string {
  const keepBy = new Map<string, number[]>()
  for (const p of people) if (!keepBy.has(p.assetId)) keepBy.set(p.assetId, [])
  for (const p of keep) keepBy.get(p.assetId)?.push(p.index)
  checkpoint()
  let n = 0
  setClipsSilent(
    getState().project.clips.map((c) => {
      if (c.kind !== 'video' || !c.assetId || !keepBy.has(c.assetId)) return c
      n++
      return { ...c, privacy: { keep: keepBy.get(c.assetId)!, mode } }
    }),
  )
  const hidden = people.length - keep.length
  return hidden > 0 ? `Blurring ${hidden} face${hidden > 1 ? 's' : ''} on ${n} clip${n > 1 ? 's' : ''} – they follow the face as it moves. Undo to remove.` : 'Everyone is kept, nothing is blurred.'
}

export function clearBlur(): string {
  checkpoint()
  setClipsSilent(getState().project.clips.map((c) => (c.privacy ? { ...c, privacy: undefined } : c)))
  return 'Blur removed.'
}

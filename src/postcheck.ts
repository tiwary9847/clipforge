// "Ready to post?" – checks a video the way a Shorts/Reels coach would, with one-tap fixes.
import { spokenFromCaptions } from './chapters'
import { cutTimeline } from './retakes'
import { addHookText, quickHooks } from './hooks'
import { clipEnd, getPreset, getState, patchClip, checkpoint, projectDuration } from './store'
import { engine } from './engine'

export interface Check {
  id: string
  title: string
  ok: boolean | null // null = couldn't check
  detail: string
  points: number
  fix?: { label: string; run: (status: (m: string) => void) => Promise<string> }
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export async function runChecks(status: (m: string) => void = () => {}, withLoudness = true): Promise<{ score: number; checks: Check[] }> {
  const st = getState()
  const clips = st.project.clips
  const P = getPreset()
  const portrait = P.h > P.w
  const dur = projectDuration()
  const said = spokenFromCaptions()
  const checks: Check[] = []
  if (!clips.some((c) => c.kind === 'video' || c.kind === 'image')) throw new Error('Add your video first.')

  // 1. talking starts fast
  if (said.length) {
    const first = said[0].start
    checks.push({
      id: 'start',
      title: 'You start talking in the first second',
      ok: first <= 1.0,
      detail: first <= 1.0 ? `Speech starts at ${first.toFixed(1)} s.` : `Nothing is said for the first ${first.toFixed(1)} s – many people swipe away here.`,
      points: 15,
      fix: first > 1.0 ? { label: '✂️ Cut the slow start', run: async () => `Removed ${cutTimeline([[0, first - 0.25]]).toFixed(1)} s from the start.` } : undefined,
    })
  } else checks.push({ id: 'start', title: 'You start talking in the first second', ok: null, detail: 'Make captions first so this can be checked.', points: 15 })

  // 2. hook text on screen
  const caption = (c: (typeof clips)[number]) => c.track === 'v4' && c.kind === 'text'
  const hookText = clips.some((c) => c.kind === 'text' && !caption(c) && c.start < 1 && clipEnd(c) > 1.2)
  checks.push({
    id: 'hook',
    title: 'Big hook text in the first 2 seconds',
    ok: hookText,
    detail: hookText ? 'There is text on screen at the start.' : 'Add a line that makes people stay – a question or a bold promise.',
    points: 15,
    fix: !hookText && said.length ? { label: '🪝 Add a hook line', run: async () => addHookText(quickHooks()[0]) } : undefined,
  })

  // 3. captions
  const hasCaps = clips.some(caption)
  checks.push({
    id: 'captions',
    title: 'Captions',
    ok: hasCaps,
    detail: hasCaps ? 'Captions are on.' : 'Most people scroll with the sound off – add captions in the Captions tab (Auto captions).',
    points: 15,
  })

  // 4. long pauses
  const gaps: [number, number][] = []
  for (let i = 1; i < said.length; i++) if (said[i].start - said[i - 1].end > 1.0) gaps.push([said[i - 1].end + 0.25, said[i].start - 0.2])
  checks.push({
    id: 'pauses',
    title: 'No long pauses',
    ok: said.length ? gaps.length === 0 : null,
    detail: !said.length ? 'Make captions first so pauses can be found.' : gaps.length ? `${gaps.length} pause${gaps.length > 1 ? 's' : ''} longer than 1 s (first at ${fmt(gaps[0][0])}).` : 'Tight pace.',
    points: 10,
    fix: gaps.length ? { label: '✂️ Remove the pauses', run: async () => `Removed ${cutTimeline(gaps).toFixed(1)} s of pauses.` } : undefined,
  })

  // 5. something changes on screen often
  const changes = new Set<number>([0, dur])
  for (const c of clips) {
    if (c.kind === 'video' || c.kind === 'image') {
      changes.add(+c.start.toFixed(2))
      if (c.track !== 'v1') changes.add(+clipEnd(c).toFixed(2))
      for (const k of c.kf?.scale ?? []) changes.add(+(c.start + k.t).toFixed(2))
    }
  }
  const ts = [...changes].filter((t) => t <= dur).sort((a, b) => a - b)
  let longest = 0
  let at = 0
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > longest) [longest, at] = [ts[i] - ts[i - 1], ts[i - 1]]
  const lim = portrait ? 6 : 12
  checks.push({
    id: 'visual',
    title: `Something changes on screen every ${lim} s`,
    ok: longest <= lim,
    detail: longest <= lim ? `Longest still stretch: ${longest.toFixed(1)} s.` : `${longest.toFixed(0)} s with the same shot from ${fmt(at)} – add zooms, b-roll or cuts.`,
    points: 10,
    fix:
      longest > lim && clips.some((c) => c.track === 'v1' && c.kind === 'video')
        ? {
            label: '🎯 Add punch-in zooms',
            run: async (s) => {
              const { autoZoom } = await import('./autoedit2')
              return autoZoom('punchy', s)
            },
          }
        : undefined,
  })

  // 6. length
  if (portrait) {
    checks.push({
      id: 'length',
      title: 'Short length',
      ok: dur <= 60,
      detail: dur <= 60 ? `${fmt(dur)} – good for Shorts and Reels.` : dur <= 180 ? `${fmt(dur)} – allowed (up to 3 min), but under 1 minute gets more full watches and replays.` : `${fmt(dur)} – Shorts allow at most 3 minutes. Use Long → Shorts in Tools.`,
      points: 5,
    })
  }

  // 7. safe zone
  const unsafe = portrait ? clips.filter((c) => (c.kind === 'text' || c.kind === 'sticker') && (c.y > 0.82 || c.x > 0.88)) : []
  checks.push({
    id: 'safe',
    title: 'Text clear of the app buttons',
    ok: unsafe.length === 0,
    detail: unsafe.length ? `${unsafe.length} text/sticker${unsafe.length > 1 ? 's sit' : ' sits'} where the like/comment buttons or the description cover it.` : 'Nothing is hidden under the app buttons.',
    points: 5,
    fix: unsafe.length
      ? {
          label: '⬆️ Move them up',
          run: async () => {
            checkpoint()
            for (const c of unsafe) patchClip(c.id, { y: Math.min(c.y, 0.72), x: Math.min(c.x, 0.82) })
            engine.requestRender()
            return `Moved ${unsafe.length} item${unsafe.length > 1 ? 's' : ''} into the safe area.`
          },
        }
      : undefined,
  })

  // 8. gaps on the main track
  const v1 = clips.filter((c) => c.track === 'v1').sort((a, b) => a.start - b.start)
  const holes: [number, number][] = []
  let end = 0
  for (const c of v1) {
    if (c.start - end > 0.1) holes.push([end, c.start])
    end = Math.max(end, clipEnd(c))
  }
  const covered = (a: number, b: number) => clips.some((c) => (c.kind === 'video' || c.kind === 'image') && c.track !== 'v1' && c.start <= a + 0.05 && clipEnd(c) >= b - 0.05)
  const black = holes.filter(([a, b]) => !covered(a, b))
  checks.push({
    id: 'gaps',
    title: 'No black gaps',
    ok: black.length === 0,
    detail: black.length ? `${black.length} empty gap${black.length > 1 ? 's' : ''} on the main track (first at ${fmt(black[0][0])}).` : 'No empty gaps.',
    points: 10,
    fix: black.length ? { label: '🧲 Close the gaps', run: async () => `Closed ${black.length} gap${black.length > 1 ? 's' : ''} (${cutTimeline(black).toFixed(1)} s).` } : undefined,
  })

  // 9. background music
  const music = clips.some((c) => c.kind === 'audio' && (c.track === 'a2' || /music|song|bgm/i.test(c.label)))
  checks.push({
    id: 'music',
    title: 'Background music',
    ok: music,
    detail: music ? 'There is music.' : 'Soft music under your voice keeps the energy up.',
    points: 5,
    fix: music
      ? undefined
      : {
          label: '🎵 Add no-copyright music',
          run: async (s) => {
            const { addMusic } = await import('./musicgen')
            return addMusic('vlog', 'video', 1, s)
          },
        },
  })

  // 10. loudness
  if (withLoudness) {
    status('Measuring loudness…')
    const { measureLoudness, normaliseLoudness } = await import('./pro')
    const l = await measureLoudness()
    const ok = l == null ? null : Math.abs(l + 14) <= 2
    checks.push({
      id: 'loud',
      title: 'Loudness right for the apps (−14 LUFS)',
      ok,
      detail: l == null ? 'No sound found.' : ok ? `${l.toFixed(1)} LUFS – perfect.` : `${l.toFixed(1)} LUFS – ${l < -14 ? 'too quiet next to other videos' : 'too loud, the app will turn it down'}.`,
      points: 10,
      fix: ok === false ? { label: '🔊 Fix loudness', run: async () => normaliseLoudness(-14) } : undefined,
    })
  }

  const counted = checks.filter((c) => c.ok !== null)
  const total = counted.reduce((s, c) => s + c.points, 0)
  const got = counted.filter((c) => c.ok).reduce((s, c) => s + c.points, 0)
  return { score: total ? Math.round((100 * got) / total) : 0, checks }
}

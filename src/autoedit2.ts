// One-tap "retention" edits: punch-in zooms on emphasis, and sound effects on cuts and key words.
import { decodeMono } from './media'
import { rmsEnvelope } from './dsp'
import { faceAt } from './faces'
import { spokenFromCaptions } from './chapters'
import { SFX_LIST } from './library'
import { baseClip, checkpoint, clipEnd, getAsset, getState, insertSilent, patchClip } from './store'
import { engine } from './engine'
import { Clip, Keyframe } from './types'

/* ================= auto punch-in zooms ================= */

export type ZoomStyle = 'subtle' | 'punchy' | 'crazy'

/** Moments worth a punch-in, in clip-local seconds: phrase starts after a pause (strong) and the biggest
 *  jumps in loudness (emphasis, weaker). */
async function emphasis(c: Clip): Promise<{ starts: number[]; peaks: { t: number; v: number }[] }> {
  const a = getAsset(c.assetId)
  if (!a) return { starts: [], peaks: [] }
  const sr = 8000
  const x = await decodeMono(a, c.srcIn, Math.min(a.duration, c.srcIn + c.dur * c.speed), sr)
  if (!x) return { starts: [], peaks: [] }
  const hop = 0.05
  const raw = rmsEnvelope(x, Math.round(sr * hop))
  // smooth over ~150 ms so single syllables don't count as pauses
  const env = raw.map((_, i) => (raw[i - 1] ?? raw[i]) * 0.25 + raw[i] * 0.5 + (raw[i + 1] ?? raw[i]) * 0.25)
  const sorted = [...env].sort((p, q) => p - q)
  const quiet = sorted[Math.floor(sorted.length * 0.15)] ?? 0
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? 0
  const gate = quiet + (loud - quiet) * 0.25
  const starts: number[] = []
  const peaks: { t: number; v: number }[] = []
  let silentFor = 0
  for (let i = 1; i < env.length; i++) {
    const t = (i * hop) / c.speed
    if (env[i] < gate) {
      silentFor += hop
      continue
    }
    if (silentFor >= 0.3) starts.push(Math.max(0, t - 0.05))
    else if (i > 3) peaks.push({ t, v: env[i] / Math.max(1e-5, Math.min(env[i - 3], env[i - 2])) })
    silentFor = 0
  }
  return { starts, peaks: peaks.filter((p) => p.v > 1.6).sort((p, q) => q.v - p.v) }
}

export async function autoZoom(style: ZoomStyle, status: (m: string) => void): Promise<string> {
  const st = getState()
  const clips = st.project.clips.filter((c) => c.track === 'v1' && (c.kind === 'video' || c.kind === 'image'))
  if (!clips.length) throw new Error('Put your talking clips on the Main track first.')
  const S = { subtle: [1.0, 1.08, 1.14], punchy: [1.0, 1.15, 1.28], crazy: [1.0, 1.25, 1.45] }[style]
  const minGap = style === 'crazy' ? 1.2 : style === 'punchy' ? 1.8 : 2.8
  checkpoint()
  let total = 0
  for (const c of clips) {
    status(`Listening to “${c.label}”…`)
    const em = c.kind === 'video' ? await emphasis(c) : { starts: [], peaks: [] }
    const ok = (t: number, list: number[]) => t < c.dur - 0.4 && list.every((x) => Math.abs(x - t) >= minGap)
    // 1) every phrase start after a pause, 2) the strongest emphasis inside long stretches, 3) a gentle change every ~4.5 s
    const times: number[] = [0]
    for (const t of em.starts) if (ok(t, times)) times.push(t)
    times.sort((p, q) => p - q)
    const fillGap = style === 'subtle' ? 5 : 3.5
    for (const pk of em.peaks) {
      const sorted = [...times, c.dur].sort((p, q) => p - q)
      const i = sorted.findIndex((x) => x > pk.t)
      if (i > 0 && sorted[i] - sorted[i - 1] > fillGap && ok(pk.t, times)) times.push(pk.t)
    }
    times.sort((p, q) => p - q)
    for (let i = 1; i < times.length + 1; i++) {
      const a = times[i - 1]
      const b = times[i] ?? c.dur
      if (b - a > 6) times.splice(i, 0, a + (b - a) / 2)
    }
    times.sort((p, q) => p - q)
    const scale: Keyframe[] = []
    const xs: Keyframe[] = []
    const ys: Keyframe[] = []
    let last = -1
    times.forEach((t, i) => {
      // alternate wide → close → closer, never the same twice in a row
      let lvl = i === 0 ? 0 : [1, 2, 0, 1, 2, 1][i % 6]
      if (lvl === last) lvl = (lvl + 1) % 3
      last = lvl
      const s = S[lvl] * (c.scale || 1)
      scale.push({ t, v: s })
      // centre the zoom on the face when we know where it is
      const f = c.kind === 'video' ? faceAt(c.assetId, c.srcIn + t * c.speed, 0) : null
      const fx = f ? f[0] : 0.5
      const fy = f ? f[1] - f[3] * 0.1 : 0.42
      const k = s / (c.scale || 1) - 1
      xs.push({ t, v: (c.x ?? 0.5) + (0.5 - fx) * k * 0.9 })
      ys.push({ t, v: (c.y ?? 0.5) + (0.5 - fy) * k * 0.9 })
    })
    patchClip(c.id, { kf: { ...(c.kf ?? {}), scale, x: xs, y: ys }, ease: 'hold' })
    total += times.length - 1
  }
  engine.requestRender()
  return `Added ${total} punch-in zooms on your key moments${clips.some((c) => c.assetId && st.project.faces?.[c.assetId]) ? ', centred on your face' : ''}. Undo to remove, or change any zoom with the ◆ keyframes.`
}

/* ================= auto sound effects ================= */

// words that get a sound (English + Hinglish)
const WORD_SFX: [RegExp, string][] = [
  [/^(boom|dhamaka|blast|explode|bang)\b/i, 'boom'],
  [/^(wow|wah|waah|amazing|kamaal|zabardast|awesome|incredible|mast)\b/i, 'wow'],
  [/^(money|paisa|paise|rupees?|₹|lakh|crore|price|cost|kamai|salary|profit|sale)\b/i, 'kaching'],
  [/^(fail|galti|wrong|nahi|no|oops|ghalat)\b/i, 'buzzer'],
  [/^(finally|done|success|jeet|win|won|ho gaya|completed)\b/i, 'tada'],
  [/^(secret|raaz|suspicious|sus|shak)\b/i, 'sus'],
  [/^(sad|dukh|ro|crying|rona|breakup)\b/i, 'sad'],
  [/^(level|upgrade|next)\b/i, 'levelup'],
  [/^(photo|picture|click|selfie)\b/i, 'shutter'],
  [/^(magic|jadoo|sparkle|shiny|chamak)\b/i, 'sparkle'],
  [/^(\d+|one|two|three|first|second|third|pehla|doosra|teesra|number)\b/i, 'ding'],
]

export interface SfxOpts {
  cuts: boolean // whoosh on cuts
  words: boolean // sounds on key words (needs captions)
  amount: 'few' | 'normal' | 'lots'
}

export function autoSfx(o: SfxOpts): string {
  const st = getState()
  const made: Clip[] = []
  const def = (id: string) => SFX_LIST.find((s) => s.id === id)
  const taken: number[] = []
  const free = (t: number, gap: number) => taken.every((x) => Math.abs(x - t) >= gap)
  const gap = o.amount === 'lots' ? 1.2 : o.amount === 'normal' ? 2.5 : 5
  const vol = 0.55
  if (o.cuts) {
    const v1 = st.project.clips.filter((c) => c.track === 'v1').sort((a, b) => a.start - b.start)
    for (let i = 1; i < v1.length; i++) {
      const t = v1[i].start
      if (Math.abs(clipEnd(v1[i - 1]) - t) > 0.3 || !free(t, gap * 0.6)) continue
      const d = def('whoosh')!
      made.push(baseClip('sfx', 'a1', { sfxId: 'whoosh', label: 'Whoosh (auto)', start: Math.max(0, t - 0.25), dur: d.dur, volume: vol * 0.8 } as Partial<Clip>))
      taken.push(t)
    }
  }
  let words = 0
  if (o.words) {
    const said = spokenFromCaptions()
    if (!said.length && !o.cuts) throw new Error('Make captions first (Captions tab) so ClipForge knows your words.')
    for (const s of said) {
      const ws = s.text.split(/\s+/)
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i].replace(/[^\p{L}\p{N}₹]/gu, '')
        const hit = WORD_SFX.find(([re]) => re.test(w))
        if (!hit) continue
        const t = s.start + ((s.end - s.start) * i) / Math.max(1, ws.length)
        if (!free(t, gap)) continue
        const d = def(hit[1])
        if (!d) continue
        made.push(baseClip('sfx', 'a1', { sfxId: hit[1], label: `${d.name} (auto: “${w}”)`, start: t, dur: d.dur, volume: vol } as Partial<Clip>))
        taken.push(t)
        words++
      }
    }
  }
  if (!made.length) return o.words && !spokenFromCaptions().length ? 'No cuts found – and make captions first so sounds can follow your words.' : 'No good spots found for sounds.'
  // sound effects go on the Audio track; if busy there, layer them anyway (sfx are short)
  checkpoint()
  insertSilent(made)
  engine.requestRender()
  return `Added ${made.length} sound effects (${made.length - words} on cuts, ${words} on key words). Each is its own clip – delete or swap any.`
}

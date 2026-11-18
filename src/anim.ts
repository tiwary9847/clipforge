import { Ease, Clip, KfMap, KfProp, Keyframe } from './types'

export const KF_PROPS: KfProp[] = ['x', 'y', 'scale', 'rotation', 'opacity', 'mx', 'my', 'ms']
const KF_DEFAULT: Partial<Record<KfProp, number>> = { mx: 0, my: 0, ms: 1 }

export function easeFn(e: Ease | undefined, u: number): number {
  switch (e) {
    case 'linear':
      return u
    case 'in':
      return u * u * u
    case 'out':
      return 1 - Math.pow(1 - u, 3)
    case 'hold':
      return u < 1 ? 0 : 1
    case 'bounce': {
      const n = 7.5625
      const d = 2.75
      let x = u
      if (x < 1 / d) return n * x * x
      if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75
      if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375
      return n * (x -= 2.625 / d) * x + 0.984375
    }
    case 'elastic':
      return u === 0 || u === 1 ? u : Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
    default:
      return u * u * (3 - 2 * u) // smooth
  }
}

export function evalKeys(ks: Keyframe[], lt: number, ease?: Ease): number {
  if (lt <= ks[0].t) return ks[0].v
  const last = ks[ks.length - 1]
  if (lt >= last.t) return last.v
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i]
    const b = ks[i + 1]
    if (lt < b.t) {
      const u = (lt - a.t) / Math.max(1e-6, b.t - a.t)
      const e = easeFn(ease, u)
      return a.v + (b.v - a.v) * e
    }
  }
  return last.v
}

export function evalProp(c: Clip, p: KfProp, lt: number): number {
  const ks = c.kf?.[p]
  return ks && ks.length ? evalKeys(ks, lt, c.ease) : ((c[p] as number | undefined) ?? KF_DEFAULT[p] ?? 0)
}

export const hasKeys = (c: Clip) => !!c.kf && KF_PROPS.some((p) => c.kf![p]?.length)

export function kfTimes(c: Clip): number[] {
  const set = new Set<number>()
  if (c.kf) for (const p of KF_PROPS) c.kf[p]?.forEach((k) => set.add(+k.t.toFixed(3)))
  return [...set].sort((a, b) => a - b)
}

export function cloneKf(kf?: KfMap): KfMap | undefined {
  if (!kf) return undefined
  const out: KfMap = {}
  for (const p of KF_PROPS) if (kf[p]) out[p] = kf[p]!.map((k) => ({ ...k }))
  return out
}

/** Re-base keyframes when the clip's start moves by `delta` seconds (trim-left > 0). */
export function shiftKeyframes(c: Clip, delta: number): KfMap | undefined {
  if (!c.kf) return undefined
  const out: KfMap = {}
  for (const p of KF_PROPS) {
    const ks = c.kf[p]
    if (!ks?.length) continue
    if (delta > 0) {
      const v0 = evalKeys(ks, delta)
      out[p] = [{ t: 0, v: v0 }, ...ks.filter((k) => k.t > delta + 1e-6).map((k) => ({ t: k.t - delta, v: k.v }))]
    } else out[p] = ks.map((k) => ({ t: k.t - delta, v: k.v }))
  }
  return out
}

export function scaleKeyTimes(kf: KfMap | undefined, ratio: number): KfMap | undefined {
  if (!kf) return undefined
  const out: KfMap = {}
  for (const p of KF_PROPS) if (kf[p]) out[p] = kf[p]!.map((k) => ({ t: k.t * ratio, v: k.v }))
  return out
}

/** Split keyframes at local time `at` → [forFirstHalf, forSecondHalf]. */
export function splitKeyframes(c: Clip, at: number): [KfMap | undefined, KfMap | undefined] {
  if (!c.kf) return [undefined, undefined]
  const a: KfMap = {}
  for (const p of KF_PROPS) {
    const ks = c.kf[p]
    if (!ks?.length) continue
    a[p] = [...ks.filter((k) => k.t < at - 1e-6).map((k) => ({ ...k })), { t: at, v: evalKeys(ks, at) }]
  }
  return [a, shiftKeyframes(c, at)]
}

export type Motion = 'zoom-in' | 'zoom-out' | 'pan-right' | 'pan-left' | 'pop' | 'drop' | 'spin'

export function motionKeys(c: Clip, m: Motion): KfMap {
  const d = Math.max(0.2, c.dur)
  const s = c.scale
  switch (m) {
    case 'zoom-in':
      return { scale: [{ t: 0, v: s }, { t: d, v: s * 1.3 }] }
    case 'zoom-out':
      return { scale: [{ t: 0, v: s * 1.3 }, { t: d, v: s }] }
    case 'pan-right':
      return { x: [{ t: 0, v: c.x - 0.08 }, { t: d, v: c.x + 0.08 }], scale: [{ t: 0, v: s * 1.2 }, { t: d, v: s * 1.2 }] }
    case 'pan-left':
      return { x: [{ t: 0, v: c.x + 0.08 }, { t: d, v: c.x - 0.08 }], scale: [{ t: 0, v: s * 1.2 }, { t: d, v: s * 1.2 }] }
    case 'pop':
      return {
        scale: [{ t: 0, v: s * 0.2 }, { t: Math.min(0.25, d / 2), v: s * 1.15 }, { t: Math.min(0.4, d), v: s }],
        opacity: [{ t: 0, v: 0 }, { t: Math.min(0.15, d / 2), v: c.opacity }],
      }
    case 'drop':
      return {
        y: [{ t: 0, v: c.y - 0.35 }, { t: Math.min(0.5, d), v: c.y }],
        opacity: [{ t: 0, v: 0 }, { t: Math.min(0.2, d / 2), v: c.opacity }],
      }
    case 'spin':
      return {
        rotation: [{ t: 0, v: c.rotation - 360 }, { t: Math.min(0.7, d), v: c.rotation }],
        scale: [{ t: 0, v: s * 0.1 }, { t: Math.min(0.7, d), v: s }],
      }
  }
}

export function volAt(c: Clip, lt: number): number {
  return curveAt(c.volKf, lt)
}
export function duckAt(c: Clip, lt: number): number {
  return curveAt(c.duck, lt)
}
export function curveAt(d: { t: number; g: number }[] | undefined, lt: number): number {
  if (!d || !d.length) return 1
  if (lt <= d[0].t) return d[0].g
  const last = d[d.length - 1]
  if (lt >= last.t) return last.g
  for (let i = 0; i < d.length - 1; i++) {
    if (lt < d[i + 1].t) {
      const u = (lt - d[i].t) / Math.max(1e-6, d[i + 1].t - d[i].t)
      return d[i].g + (d[i + 1].g - d[i].g) * u
    }
  }
  return last.g
}

/** Stabilisation: translation (fractions of frame size) that cancels camera shake at a clip-local time. */
export function stabCorrection(c: Clip, lt: number): [number, number] {
  const st = c.stab
  if (!st || !st.on || st.px.length < 2) return [0, 0]
  const srcT = c.freeze ? c.srcIn : c.srcIn + lt * c.speed
  const n = st.px.length
  const f = Math.min(n - 1, Math.max(0, (srcT - st.t0) * st.fps))
  const i0 = Math.floor(f)
  const i1 = Math.min(n - 1, i0 + 1)
  const u = f - i0
  const P = (arr: number[]) => arr[i0] * (1 - u) + arr[i1] * u
  const R = Math.max(1, Math.round(st.strength * st.fps))
  const lo = Math.max(0, i0 - R)
  const hi = Math.min(n - 1, i0 + R)
  let sx = 0
  let sy = 0
  for (let j = lo; j <= hi; j++) {
    sx += st.px[j]
    sy += st.py[j]
  }
  const cnt = hi - lo + 1
  return [sx / cnt - P(st.px), sy / cnt - P(st.py)]
}

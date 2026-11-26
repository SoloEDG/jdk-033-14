import { axis, dot, pointAt, subtract } from '../../../shared/math'
import type { Gate, GatePose, Point } from '../../../shared/race'
import { linePoseAt } from '../../chart/lib/geometry'

export function gateCrossing(gate: Pick<Gate, 'center' | 'bearing' | 'width'>, from: Point, to: Point): { fraction: number; point: Point } | null {
  const forward = axis(gate.bearing)
  const start = dot(subtract(from, gate.center), forward)
  const end = dot(subtract(to, gate.center), forward)
  if (start >= 0 || end < 0 || start === end) return null
  const fraction = -start / (end - start)
  const point = pointAt(from, to, fraction)
  const across = dot(subtract(point, gate.center), axis(gate.bearing + 90))
  return Math.abs(across) <= gate.width / 2 ? { fraction, point } : null
}

export interface MovingGateCrossing {
  fraction: number
  time: number
  point: Point
  pose: GatePose
  lateral: number
  /** +1 is the gate's sanctioned crossing direction, -1 is a recrossing. */
  direction: 1 | -1
  /** The boat's own displacement has positive normal component. */
  active: boolean
  /** Relative sign crossed, but the boat did not actively drive through. */
  swept: boolean
}

export interface CrossingOptions {
  start?: number
  duration?: number
  line?: 'gate' | 'approach'
  samples?: number
}

const EPS = 1e-9

/**
 * Intersect a linearly interpolated boat segment with a continuously moving
 * and/or turning gate line. Signed distance is evaluated in the gate pose at
 * the candidate time, so translation and rotation both participate.
 */
export function findGateCrossings(
  gate: Gate,
  from: Point,
  to: Point,
  options: CrossingOptions = {},
): MovingGateCrossing[] {
  const start = options.start ?? 0
  const duration = options.duration ?? 1
  const line = options.line ?? 'gate'
  const sampleCount = Math.max(8, Math.floor(options.samples ?? 96))
  const boatAt = (fraction: number) => pointAt(from, to, fraction)
  const signedAt = (fraction: number): number => {
    const pose = linePoseAt(gate, line, start + duration * fraction)
    if (!pose) return Number.NaN
    return dot(subtract(boatAt(fraction), pose.center), axis(pose.bearing))
  }

  const values: number[] = []
  for (let i = 0; i <= sampleCount; i++) values.push(signedAt(i / sampleCount))

  const brackets: Array<[number, number, number, number]> = []
  const exactRoots: number[] = []
  for (let i = 1; i <= sampleCount; i++) {
    const previous = values[i - 1]
    const current = values[i]
    const left = (i - 1) / sampleCount
    const right = i / sampleCount
    if (Number.isFinite(current) && Math.abs(current) <= EPS && right > 0) {
      const before = values[i - 1]
      const after = i < sampleCount ? values[i + 1] : current
      const signCrossing =
        (before < -EPS && after > EPS) ||
        (before > EPS && after < -EPS) ||
        (i === sampleCount && before < -EPS)
      if (signCrossing) exactRoots.push(right)
    }
    if (Number.isFinite(previous) && Number.isFinite(current) && previous * current < 0) {
      brackets.push([left, right, previous, current])
    } else if (i === sampleCount && Math.abs(current) <= EPS && previous < 0) {
      brackets.push([left, right, previous, current])
    }
  }

  const roots: number[] = [...exactRoots]
  for (const [rawLeft, rawRight, leftValue, rightValue] of brackets) {
    let lo = rawLeft, hi = rawRight
    let qLo = leftValue
    const direction: 1 | -1 = rightValue > leftValue ? 1 : -1
    for (let iteration = 0; iteration < 48; iteration++) {
      const mid = (lo + hi) / 2
      const qMid = signedAt(mid)
      if (direction === 1) {
        if (qMid < 0) { lo = mid; qLo = qMid } else hi = mid
      } else {
        if (qMid > 0) { lo = mid; qLo = qMid } else hi = mid
      }
      if (hi - lo < 1e-11) break
    }
    const fraction = (lo + hi) / 2
    if (!roots.some(root => Math.abs(root - fraction) < 1e-7)) roots.push(fraction)
  }

  const travel = subtract(to, from)
  const uniqueRoots = roots
    .sort((a, b) => a - b)
    .filter((fraction, index, all) => index === 0 || fraction - all[index - 1] > 1e-6)
  const result: MovingGateCrossing[] = []
  for (const fraction of uniqueRoots) {
    const time = start + duration * fraction
    const pose = linePoseAt(gate, line, time)
    if (!pose) continue
    const point = boatAt(fraction)
    const lateral = dot(subtract(point, pose.center), axis(pose.bearing + 90))
    if (Math.abs(lateral) > pose.width / 2 + 1e-6) continue

    // Reconstruct direction from a tiny neighbourhood when bisection landed exactly.
    const delta = Math.max(1e-7, 1 / sampleCount / 8)
    const before = signedAt(clampFraction(fraction - delta))
    const after = signedAt(clampFraction(fraction + delta))
    const direction: 1 | -1 = after >= before ? 1 : -1
    const travelNormal = dot(travel, axis(pose.bearing))
    const active = direction === 1 ? travelNormal > EPS : travelNormal < -EPS
    result.push({
      fraction,
      time,
      point,
      pose,
      lateral,
      direction,
      active,
      swept: direction === 1 && !active,
    })
  }
  return result
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** First sanctioned, boat-active crossing. Static callers can omit timing. */
export function activeGateCrossing(
  gate: Gate,
  from: Point,
  to: Point,
  start = 0,
  duration = 1,
  line: 'gate' | 'approach' = 'gate',
): MovingGateCrossing | null {
  return findGateCrossings(gate, from, to, { start, duration, line })
    .find(hit => hit.direction === 1 && hit.active) ?? null
}

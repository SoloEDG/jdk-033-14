import { distance, pointAt } from '../../../shared/math'
import type { Gate, Point } from '../../../shared/race'
import { buoyPositionAt } from '../../chart/lib/geometry'

export interface MarkContact {
  fraction: number
  time: number
  /** Boat position at first contact. */
  point: Point
  /** Moving buoy position at first contact. */
  markPoint: Point
  distance: number
  gateId: string
  gateName: string
}

/**
 * Continuous collision check against one moving endpoint/buoy. It finds the
 * earliest moment the interpolated boat segment enters the contact radius,
 * including tunnelling cases where both endpoints are already outside.
 */
export function findBuoyContact(
  gate: Gate,
  from: Point,
  to: Point,
  start: number,
  duration: number,
  radius = 13,
  samples = 80,
): MarkContact | null {
  const boatAt = (fraction: number) => pointAt(from, to, fraction)
  const markAt = (fraction: number) => buoyPositionAt(gate, start + duration * fraction)
  const clearance = (fraction: number) => distance(boatAt(fraction), markAt(fraction)) - radius

  if (clearance(0) <= 0) {
    const markPoint = markAt(0)
    return {
      fraction: 0, time: start, point: { ...from }, markPoint,
      distance: distance(from, markPoint), gateId: gate.id, gateName: gate.name,
    }
  }

  const count = Math.max(16, samples)
  let previousFraction = 0
  let previousClearance = clearance(0)
  for (let index = 1; index <= count; index++) {
    const fraction = index / count
    const currentClearance = clearance(fraction)
    if (currentClearance <= 0) {
      let lo = previousFraction
      let hi = fraction
      let hiClearance = currentClearance
      for (let iteration = 0; iteration < 44; iteration++) {
        const mid = (lo + hi) / 2
        const midClearance = clearance(mid)
        if (midClearance <= 0) {
          hi = mid
          hiClearance = midClearance
        } else {
          lo = mid
          previousClearance = midClearance
        }
        if (hi - lo < 1e-10) break
      }
      const root = hi
      const point = boatAt(root)
      const markPoint = markAt(root)
      return {
        fraction: root,
        time: start + duration * root,
        point,
        markPoint,
        distance: distance(point, markPoint),
        gateId: gate.id,
        gateName: gate.name,
      }
    }
    previousFraction = fraction
    previousClearance = currentClearance
  }
  return null
}

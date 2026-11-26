import { axis, clamp, distance, dot, pointAt, radians, subtract } from '../../../shared/math'
import type { Course, Gate, GatePose, Point } from '../../../shared/race'

export const soundings = [
  [245,112,18],[312,108,21],[406,139,32],[489,103,41],[608,132,36],[720,112,27],[814,136,14],
  [195,283,13],[341,258,25],[447,284,38],[564,298,29],[630,248,32],[782,275,25],[896,251,19],
  [64,331,11],[137,385,18],[267,444,28],[342,427,35],[404,467,24],[611,393,18],
  [87,529,12],[253,531,17],[355,521,25],[439,534,16],[635,520,13],[733,471,23],[837,527,16],
]

export function pathFor(points: Point[]): string {
  return points.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
}

/**
 * Resolve the continuous pose of a possibly dragged/turning gate.
 * Simple courses can use motion.velocity/turnRate; authorial courses can
 * provide motion.poseAt(time) for reversing or swinging marks.
 */
export function gatePoseAt(gate: Gate, time = 0): GatePose {
  const t = Number.isFinite(time) ? time : 0
  const hook = gate.poseAt ?? gate.motion?.poseAt
  if (hook) {
    const posed = hook(t, gate)
    return {
      center: { x: posed.center.x, y: posed.center.y },
      bearing: posed.bearing,
      width: posed.width ?? gate.width,
    }
  }
  const velocity = gate.motion?.velocity
  const turnRate = gate.motion?.turnRate ?? 0
  return {
    center: velocity
      ? { x: gate.center.x + velocity.x * t, y: gate.center.y + velocity.y * t }
      : { ...gate.center },
    bearing: gate.bearing + turnRate * t,
    width: gate.width,
  }
}

function rotateVector(vector: Point, degrees: number): Point {
  const angle = radians(degrees)
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos }
}

/** Apply the gate assembly translation/rotation to its optional entry line. */
export function linePoseAt(gate: Gate, line: 'gate' | 'approach', time = 0): GatePose | null {
  const pose = gatePoseAt(gate, time)
  if (line === 'gate' || !gate.approach) return pose
  const offset = rotateVector(subtract(gate.approach.center, gate.center), pose.bearing - gate.bearing)
  const widthScale = pose.width / gate.width
  return {
    center: { x: pose.center.x + offset.x, y: pose.center.y + offset.y },
    bearing: gate.approach.bearing + pose.bearing - gate.bearing,
    width: gate.approach.width * (Number.isFinite(widthScale) && widthScale > 0 ? widthScale : 1),
  }
}

export function gateEnds(gate: Pick<Gate, 'center' | 'bearing' | 'width'>): [Point, Point] {
  const across = axis(gate.bearing + 90)
  const half = gate.width / 2
  return [
    { x: gate.center.x - across.x * half, y: gate.center.y - across.y * half },
    { x: gate.center.x + across.x * half, y: gate.center.y + across.y * half },
  ]
}

export const buoyPosition = (gate: Gate) => gateEnds(gate)[gate.buoySide === -1 ? 0 : 1]
export const buoyPositionAt = (gate: Gate, time = 0) =>
  gateEnds(gatePoseAt(gate, time))[gate.buoySide === -1 ? 0 : 1]

export function inspectWaterAt(course: Course, position: Point, time = 0, margin = 0): string[] {
  const contacts = course.hazards.filter(h => distance(h.center, position) <= h.radius + 5 + margin).map(h => h.id)
  for (const gate of course.gates) {
    if (distance(buoyPositionAt(gate, time), position) <= 13 + margin) contacts.push(gate.name)
  }
  const border = 12 + margin
  if (position.x < border || position.x > course.size.x - border || position.y < border || position.y > course.size.y - border) {
    contacts.push('航域边界')
  }
  return contacts
}

export function inspectWater(course: Course, position: Point, margin = 0): string[] {
  return inspectWaterAt(course, position, 0, margin)
}

export function isOffCourse(from: Point, gate: Gate, position: Point, time = 0): boolean {
  const gateCenter = gatePoseAt(gate, time).center
  const courseAxis = subtract(gateCenter, from)
  const ratio = clamp(dot(subtract(position, from), courseAxis) / dot(courseAxis, courseAxis), 0, 1)
  return distance(position, pointAt(from, gateCenter, ratio)) > 125
}

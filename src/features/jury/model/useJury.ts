import { ref } from 'vue'
import { inspectWaterAt, isOffCourse } from '../../chart'
import type { Course, EventKind, Point, RaceEvent } from '../../../shared/race'
import { axis, dot, subtract } from '../../../shared/math'

import { findGateCrossings, type MovingGateCrossing } from '../lib/crossing'
import { findBuoyContact, type MarkContact } from '../lib/collision'

export interface InspectionVerdict {
  blocked: boolean
  finish: { time: number; position: Point } | null
  contact?: { time: number; position: Point } | null
  crossing?: { time: number; position: Point } | null
}

export function useJury(course: Course) {
  const nextGate = ref(0)
  const penalty = ref(0)
  const events = ref<RaceEvent[]>([])
  let contacts = new Set<string>()
  let outside = false
  let approached = false
  let legStart: Point = { ...course.start }

  function add(
    kind: EventKind,
    label: string,
    time: number,
    position: Point,
    seconds = 0,
    extra: Partial<Pick<RaceEvent, 'gateId' | 'reason'>> = {},
  ): RaceEvent {
    penalty.value += seconds
    const event: RaceEvent = {
      id: String(events.value.length + 1),
      kind,
      label,
      time,
      position: { ...position },
      penalty: seconds,
      ...extra,
      totalPenalty: penalty.value,
      nextGate: nextGate.value,
    }
    events.value.push(event)
    return event
  }

  function reset() {
    nextGate.value = penalty.value = 0
    events.value = []
    contacts = new Set()
    outside = false
    approached = false
    legStart = { ...course.start }
  }

  function inspect(from: Point, to: Point, start: number, dt: number): InspectionVerdict {
    const end = start + dt

    // Continuous mark/buoy contact first. A swept endpoint must still produce
    // an exact encounter time even when the boat segment tunnels through it.
    const markHits = course.gates
      .map(gate => findBuoyContact(gate, from, to, start, dt, 13))
      .filter((hit): hit is MarkContact => hit !== null)
      .sort((a, b) => a.time - b.time)
    const newMarkHits: MarkContact[] = []

    for (const hit of markHits) {
      if (!contacts.has(hit.gateName)) {
        add('collision', `碰撞 · ${hit.gateName}`, hit.time, hit.point, 5, {
          gateId: hit.gateId, reason: 'contact',
        })
        newMarkHits.push(hit)
      }
      contacts.add(hit.gateName)
    }

    const endContacts = new Set(inspectWaterAt(course, to, end))
    for (const name of endContacts) {
      if (!contacts.has(name)) {
        add('collision', `碰撞 · ${name}`, end, to, 5, { reason: 'contact' })
      }
      contacts.add(name)
    }

    if (newMarkHits.length || endContacts.size) {
      const earliestNew = newMarkHits[0] ?? null
      return {
        blocked: true,
        finish: null,
        contact: earliestNew ? { time: earliestNew.time, position: earliestNew.point } : null,
      }
    }

    const nearby = new Set(inspectWaterAt(course, to, end, 3))
    for (const name of contacts) if (!nearby.has(name)) contacts.delete(name)

    const gate = course.gates[nextGate.value]
    if (!gate) return { blocked: false, finish: null }

    const approachHits = gate.approach
      ? findGateCrossings(gate, from, to, { start, duration: dt, line: 'approach' })
      : []
    const gateHits = findGateCrossings(gate, from, to, { start, duration: dt, line: 'gate' })

    type TimelineItem =
      | { type: 'approach'; time: number; hit: MovingGateCrossing }
      | { type: 'gate'; time: number; hit: MovingGateCrossing }
    const timeline: TimelineItem[] = [
      ...approachHits.map(hit => ({ type: 'approach' as const, time: hit.time, hit })),
      ...gateHits.map(hit => ({ type: 'gate' as const, time: hit.time, hit })),
    ].sort((a, b) => a.time - b.time)

    let approachState = approached
    let scored: MovingGateCrossing | null = null
    let deniedSweep = false

    for (const item of timeline) {
      const hit = item.hit
      if (item.type === 'approach') {
        if (hit.direction === 1 && hit.active) {
          approachState = true
        } else if (hit.direction === -1 && approachState) {
          approachState = false
          const boatNormal = dot(axis(hit.pose.bearing), subtract(to, from))
          const boatReverse = boatNormal < -1e-9
          add(
            'invalid',
            boatReverse
              ? `尝试失效 · ${gate.name} 反向驶出入口`
              : `尝试失效 · ${gate.name} 浮标回摆扫回入口`,
            hit.time,
            hit.point,
            0,
            { gateId: gate.id, reason: boatReverse ? 'boat-reverse' : 'line-sweep' },
          )
        }
        continue
      }

      if (scored || hit.direction !== 1) continue
      if (gate.approach && !approachState) continue
      if (!hit.active) {
        if (!deniedSweep) {
          deniedSweep = true
          add(
            'invalid',
            `移动标扫过船位 · ${gate.name} 不予通过`,
            hit.time,
            hit.point,
            0,
            { gateId: gate.id, reason: 'swept-crossing' },
          )
        }
        continue
      }
      scored = hit
      break
    }

    approached = approachState

    if (scored) {
      nextGate.value++
      approached = false
      outside = false
      legStart = { ...scored.pose.center }
      const time = scored.time
      const position = scored.point
      if (nextGate.value === course.gates.length) {
        add('finish', '冲过终点', time, position, 0, { gateId: gate.id, reason: 'active-crossing' })
        return { blocked: false, finish: { time, position }, crossing: { time, position } }
      }
      add('mark', `通过 ${gate.name}`, time, position, 0, { gateId: gate.id, reason: 'active-crossing' })
      return { blocked: false, finish: null, crossing: { time, position } }
    }

    const offCourse = isOffCourse(legStart, gate, to, end)
    if (offCourse && !outside) add('deviation', '偏离航段', end, to, 3)
    outside = offCourse
    return { blocked: false, finish: null }
  }

  return { nextGate, penalty, events, reset, add, inspect }
}

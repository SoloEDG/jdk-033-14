export interface Point { x: number; y: number }

export interface GatePose {
  center: Point
  bearing: number
  width: number
}

export interface GateMotion {
  /** Translation in chart units per race second. */
  velocity?: Point
  /** Continuous bearing change in degrees per race second. */
  turnRate?: number
  /** Authorial continuous pose for dragged, turning, or reversing marks. */
  poseAt?: (time: number, base: Gate) => GatePose
}

export interface Gate {
  id: string
  name: string
  center: Point
  bearing: number
  width: number
  buoySide: -1 | 1
  approach?: { center: Point; bearing: number; width: number }
  /** Continuous motion of the whole gate assembly, keyed by race time. */
  motion?: GateMotion
  /** Convenience hook equivalent to motion.poseAt. */
  poseAt?: (time: number) => GatePose
}

export interface Course {
  id: string
  name: string
  size: Point
  start: Point
  heading: number
  gates: Gate[]
  hazards: { id: string; center: Point; radius: number }[]
}

export type WindMode = 'steady' | 'shifting'
export interface Wind { bearing: number; knots: number }
export interface Boat { position: Point; heading: number; knots: number; sheet: number; rudder: number }
export type RaceStatus = 'ready' | 'running' | 'paused' | 'finished' | 'abandoned'
export type EventKind = 'start' | 'mark' | 'collision' | 'deviation' | 'invalid' | 'finish' | 'abandon'
export interface RaceEvent {
  id: string
  time: number
  kind: EventKind
  position: Point
  label: string
  penalty: number
  /** Cumulative penalty immediately after this event was adjudicated. */
  totalPenalty?: number
  /** Next gate index immediately after this event was adjudicated. */
  nextGate?: number
  gateId?: string
  reason?: 'active-crossing' | 'swept-crossing' | 'boat-reverse' | 'line-sweep' | 'contact'
}
export interface Sample {
  time: number
  boat: Boat
  wind: Wind
  nextGate: number
  penalty: number
}
export interface Voyage {
  id: string
  date: string
  courseId: string
  windMode: WindMode
  status: 'finished' | 'abandoned'
  duration: number
  penalty: number
  samples: Sample[]
  events: RaceEvent[]
}

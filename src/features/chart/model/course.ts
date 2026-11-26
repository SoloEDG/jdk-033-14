import type { Course } from '../../../shared/race'
import { axis } from '../../../shared/math'

const smoothStep = (start: number, end: number, time: number) => {
  const x = Math.max(0, Math.min(1, (time - start) / (end - start)))
  return x * x * (3 - 2 * x)
}

/** A surveyed gate gently drifts, then is towed forward and swings back. */
function firstGateOffset(time: number) {
  let tow = 0
  if (time >= 13.4 && time < 14.7) tow = 34 * smoothStep(13.4, 14.7, time)
  else if (time >= 14.7 && time < 15.4) tow = 34
  else if (time >= 15.4 && time < 16.8) tow = 34 * (1 - smoothStep(15.4, 16.8, time))
  else if (time >= 16.8) tow = 0

  const forward = axis(-33)
  return {
    x: forward.x * tow + 13 * Math.sin(time / 6.4),
    y: forward.y * tow + 8 * Math.sin(time / 4.9),
  }
}

export const course: Course = {
  id: 'needle-bay',
  name: '针岬湾',
  size: { x: 960, y: 570 },
  start: { x: 125, y: 469 },
  heading: -32,
  gates: [
    { id: '01', name: '岬角标', center: { x: 303, y: 354 }, bearing: -33, width: 102, buoySide: -1,
      approach: { center: { x: 257, y: 397 }, bearing: -31, width: 108 },
      poseAt: (time) => {
        const offset = firstGateOffset(time)
        return {
          center: { x: 303 + offset.x, y: 354 + offset.y },
          bearing: -33 + 7 * Math.sin(time / 5.3),
          width: 102,
        }
      } },
    { id: '02', name: '外湾标', center: { x: 531, y: 232 }, bearing: 26, width: 94, buoySide: -1,
      approach: { center: { x: 486, y: 236 }, bearing: -29, width: 82 },
      // One tow-and-return cycle is aligned with the default landfall. The
      // gate is still translating/turning at the exact graze, while its
      // full-period pose returns close to the surveyed position.
      poseAt: (time) => {
        const phase = time / 4.14
        return {
          center: {
            x: 531 + 6 * Math.sin(phase),
            y: 232 + 5 * (1 - Math.cos(phase)),
          },
          bearing: 26 + 6 * Math.sin(phase),
          width: 94,
        }
      } },
    { id: '03', name: '礁口标', center: { x: 697, y: 333 }, bearing: 34, width: 112, buoySide: 1,
      approach: { center: { x: 658, y: 307 }, bearing: 31, width: 102 } },
    { id: 'F', name: '终点线', center: { x: 847, y: 445 }, bearing: 37, width: 115, buoySide: -1 },
  ],
  hazards: [
    { id: '针岬岸', center: { x: 107, y: 120 }, radius: 156 },
    { id: '潮音礁', center: { x: 540, y: 485 }, radius: 59 },
    { id: '东岸浅滩', center: { x: 943, y: 147 }, radius: 105 },
  ],
}

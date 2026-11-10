import type { Direction, NodeId, RoadOption } from '@jikjwau/shared/types'
import { TURN_ANGLES, type TurnAngles } from '@jikjwau/shared/config'

export interface TurnCandidate {
  via: NodeId
  angleDeg: number
}

export function directionOf(angleDeg: number, angles: TurnAngles = TURN_ANGLES): Direction | null {
  const abs = Math.abs(angleDeg)
  if (abs <= angles.straightMaxDeg) return 'straight'
  if (abs > angles.turnMaxDeg) return null
  return angleDeg < 0 ? 'left' : 'right'
}

/**
 * 나갈 수 있는 길들을 좌·직·우 최대 3개로 정리한다.
 * 같은 분류에 여러 길이 있으면 기준 각도에 가장 가까운 길 하나만 남긴다.
 */
export function classifyTurns(candidates: TurnCandidate[], angles: TurnAngles = TURN_ANGLES): RoadOption[] {
  const best = new Map<Direction, RoadOption>()
  for (const c of candidates) {
    const direction = directionOf(c.angleDeg, angles)
    if (!direction) continue
    const current = best.get(direction)
    const target = angles.target[direction]
    if (!current || Math.abs(c.angleDeg - target) < Math.abs(current.angleDeg - target)) {
      best.set(direction, { direction, via: c.via, angleDeg: c.angleDeg })
    }
  }
  const order: Direction[] = ['left', 'straight', 'right']
  return order.flatMap((d) => {
    const option = best.get(d)
    return option ? [option] : []
  })
}

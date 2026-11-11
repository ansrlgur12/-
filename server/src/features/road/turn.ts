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

const ORDER: Direction[] = ['left', 'straight', 'right']

/**
 * 나갈 수 있는 길들을 좌·직·우 최대 3개로 정리한다.
 * 각 길은 자기 분류나 바로 옆 분류(좌↔직, 직↔우)에만 들어갈 수 있고, 왼쪽 길이 오른쪽 길보다 오른쪽 칸에 가지 않는다.
 * 그 안에서 되도록 많은 길을 남기고(같은 분류에 길이 둘이어도 옆 칸이 비었으면 둘 다 갈 수 있게),
 * 남는 길 수가 같으면 기준 각도와의 차이가 작은 쪽을 고른다.
 * 거의 되돌아가는 길(turnMaxDeg 초과)은 넣지 않는다.
 */
export function classifyTurns(candidates: TurnCandidate[], angles: TurnAngles = TURN_ANGLES): RoadOption[] {
  const usable = candidates
    .flatMap((c) => {
      const direction = directionOf(c.angleDeg, angles)
      return direction ? [{ ...c, natural: ORDER.indexOf(direction) }] : []
    })
    .sort((a, b) => a.angleDeg - b.angleDeg)

  let best: { count: number; cost: number; picks: Array<[number, number]> } = { count: 0, cost: 0, picks: [] }
  // usable[i]부터 보고, slot 칸부터 채울 수 있다
  const search = (i: number, slot: number, picks: Array<[number, number]>, cost: number) => {
    if (picks.length > best.count || (picks.length === best.count && cost < best.cost)) {
      best = { count: picks.length, cost, picks: [...picks] }
    }
    if (i >= usable.length || slot >= ORDER.length) return
    const c = usable[i]
    for (let s = Math.max(slot, c.natural - 1); s <= Math.min(ORDER.length - 1, c.natural + 1); s++) {
      picks.push([i, s])
      search(i + 1, s + 1, picks, cost + Math.abs(c.angleDeg - angles.target[ORDER[s]]))
      picks.pop()
    }
    search(i + 1, slot, picks, cost)
  }
  search(0, 0, [], 0)

  return best.picks.map(([i, s]) => ({ direction: ORDER[s], via: usable[i].via, angleDeg: usable[i].angleDeg }))
}

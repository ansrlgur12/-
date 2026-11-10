import type { NodeId, RoadArrival, Vec2 } from '@jikjwau/shared/types'
import { BEARING_SAMPLE_M } from '@jikjwau/shared/config'
import type { RoadGraph } from './graph'
import { bearingDeg, pointAtDistance, turnAngleDeg } from './geo'
import { classifyTurns, type TurnCandidate } from './turn'

/**
 * from → via 방향으로 출발해, 길이 2개뿐인 지점은 그냥 지나치고
 * 교차로(3개 이상)나 막다른 길(1개)에 도착할 때까지 따라간다.
 * 반환값은 from부터 도착 노드까지의 노드 목록.
 */
export function walkToDecision(graph: RoadGraph, from: NodeId, via: NodeId): NodeId[] {
  if (!graph.adj.get(from)?.has(via)) {
    throw new Error(`${via} is not a neighbor of ${from}`)
  }
  const path = [from, via]
  const visited = new Set(path)
  let prev = from
  let cur = via
  while (graph.adj.get(cur)!.size === 2) {
    const next = [...graph.adj.get(cur)!].find((n) => n !== prev)!
    if (visited.has(next)) {
      // 교차로 없이 원을 그리는 길. 출발점으로 돌아왔다면 거기서 멈춘다.
      if (next === from) path.push(next)
      break
    }
    path.push(next)
    visited.add(next)
    prev = cur
    cur = next
  }
  return path
}

function positions(graph: RoadGraph, ids: NodeId[]): Vec2[] {
  return ids.map((id) => graph.nodes.get(id)!)
}

/** path를 따라 도착한 노드에서 고를 수 있는 방향을 판정한다. */
export function arrivalAt(graph: RoadGraph, path: NodeId[]): RoadArrival {
  const nodeId = path[path.length - 1]
  const incomingFrom = path[path.length - 2]
  const here = graph.nodes.get(nodeId)!
  const neighbors = graph.adj.get(nodeId)!

  if (neighbors.size <= 1) {
    return { nodeId, kind: 'deadEnd', incomingFrom, options: [] }
  }

  const behind = pointAtDistance(positions(graph, [...path].reverse()), BEARING_SAMPLE_M)
  const inBearing = bearingDeg(behind, here)

  const candidates: TurnCandidate[] = []
  for (const via of neighbors) {
    if (via === incomingFrom) continue
    const ahead = pointAtDistance(positions(graph, walkToDecision(graph, nodeId, via)), BEARING_SAMPLE_M)
    candidates.push({ via, angleDeg: turnAngleDeg(inBearing, bearingDeg(here, ahead)) })
  }

  const options = classifyTurns(candidates)
  // 갈 수 있는 방향이 하나도 없으면 막다른 길처럼 유턴한다
  return { nodeId, kind: options.length === 0 ? 'deadEnd' : 'intersection', incomingFrom, options }
}

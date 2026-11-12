import type { LatLng, NodeId, Vec2 } from '@jikjwau/shared/types'
import { distance, project } from './geo'

export interface OsmElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

export interface RoadGraph {
  origin: LatLng
  nodes: Map<NodeId, Vec2>
  adj: Map<NodeId, Set<NodeId>>
  /** [nodeA, nodeB, highway] — 중복 없는 무방향 구간 */
  segments: Array<[NodeId, NodeId, string]>
}

/** 사람이 걸을 수 없는 도로 */
const EXCLUDED_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'construction',
  'proposed',
  'abandoned',
  'raceway',
  'bus_guideway',
  'escape',
  'corridor',
  'elevator',
  'platform',
])

export function isWalkable(tags: Record<string, string> | undefined): boolean {
  if (!tags?.highway) return false
  if (EXCLUDED_HIGHWAYS.has(tags.highway)) return false
  if (tags.foot === 'no') return false
  if (tags.access === 'no' || tags.access === 'private') return false
  if (tags.area === 'yes') return false
  return true
}

/** OSM 요소(node + way)로 보행 도로 그래프를 만든다 */
export function buildGraph(elements: OsmElement[], origin: LatLng): RoadGraph {
  const positions = new Map<NodeId, Vec2>()
  for (const el of elements) {
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      positions.set(el.id, project({ lat: el.lat, lng: el.lon }, origin))
    }
  }
  const segments: Array<[NodeId, NodeId, string]> = []
  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes || !isWalkable(el.tags)) continue
    for (let i = 1; i < el.nodes.length; i++) segments.push([el.nodes[i - 1], el.nodes[i], el.tags!.highway])
  }
  return buildGraphFromSegments(positions, segments, origin)
}

/**
 * 보행 구간들로 그래프를 만든다. 같은 구간이 여러 번 들어와도(타일 경계) 한 번만 쓰고,
 * 서로 이어진 가장 큰 덩어리만 남긴다.
 */
export function buildGraphFromSegments(
  positions: Map<NodeId, Vec2>,
  allSegments: Iterable<[NodeId, NodeId, string]>,
  origin: LatLng,
): RoadGraph {
  const adj = new Map<NodeId, Set<NodeId>>()
  const segmentMap = new Map<string, [NodeId, NodeId, string]>()
  for (const [a, b, highway] of allSegments) {
    if (a === b || !positions.has(a) || !positions.has(b)) continue
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (segmentMap.has(key)) continue
    segmentMap.set(key, [a, b, highway])
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  const keep = largestComponent(adj)
  const nodes = new Map<NodeId, Vec2>()
  for (const id of keep) nodes.set(id, positions.get(id)!)
  for (const id of [...adj.keys()]) {
    if (!keep.has(id)) adj.delete(id)
  }
  const segments = [...segmentMap.values()].filter(([a]) => keep.has(a))

  return { origin, nodes, adj, segments }
}

function largestComponent(adj: Map<NodeId, Set<NodeId>>): Set<NodeId> {
  const seen = new Set<NodeId>()
  let best = new Set<NodeId>()
  for (const start of adj.keys()) {
    if (seen.has(start)) continue
    const component = new Set<NodeId>([start])
    const stack = [start]
    seen.add(start)
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const next of adj.get(cur)!) {
        if (seen.has(next)) continue
        seen.add(next)
        component.add(next)
        stack.push(next)
      }
    }
    if (component.size > best.size) best = component
  }
  return best
}

/** allow를 주면 그 노드들 중에서만 고른다 */
export function nearestNode(graph: RoadGraph, point: Vec2, allow?: (id: NodeId) => boolean): NodeId {
  let best: NodeId | undefined
  let bestDist = Infinity
  for (const [id, p] of graph.nodes) {
    if (allow && !allow(id)) continue
    const d = distance(p, point)
    if (d < bestDist) {
      bestDist = d
      best = id
    }
  }
  if (best === undefined) throw new Error('empty road graph')
  return best
}

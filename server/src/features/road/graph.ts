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
  /** 노드 위치. 교차로를 합치며 빠진 노드도 위치는 남겨 둔다 (지나온 길을 그릴 때) */
  nodes: Map<NodeId, Vec2>
  /** 길로 이어진 노드 (합친 교차로는 대표 노드 하나만) */
  adj: Map<NodeId, Set<NodeId>>
  /** [nodeA, nodeB, highway] — 중복 없는 무방향 구간 */
  segments: Array<[NodeId, NodeId, string]>
  /** 합친 교차로에 들어간 노드 → 대표 노드 */
  alias: Map<NodeId, NodeId>
}

/** 합쳐졌을 수 있는 노드를 지금 그래프의 노드로 */
export function canonicalNode(graph: RoadGraph, id: NodeId): NodeId {
  return graph.alias.get(id) ?? id
}

/**
 * 사람이 걸을 수 없는 길. 자동차 전용도로·고속도로·대교·터널도 걸어서 다닌다 (광안대교, 인천대교 같은 곳도 가 볼 수 있게)
 */
const EXCLUDED_HIGHWAYS = new Set([
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

/** 차가 다니는 큰 도로 (보행 금지 표시가 있어도 게임에서는 걷는다) */
const MOTOR_ROADS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'])

export function isWalkable(tags: Record<string, string> | undefined): boolean {
  if (!tags?.highway) return false
  if (EXCLUDED_HIGHWAYS.has(tags.highway)) return false
  // 따로 그려진 보도·횡단보도는 뺀다. 차도 자체를 걸으니 나란한 선과 잔 교차로만 늘린다
  if (tags.footway === 'sidewalk' || tags.footway === 'crossing') return false
  if (tags.foot === 'no' && !MOTOR_ROADS.has(tags.highway)) return false
  if (tags.access === 'private') return false
  if (tags.access === 'no' && !MOTOR_ROADS.has(tags.highway)) return false
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

export interface MergeOptions {
  /** 길을 따라 이보다 가까운 교차로끼리 합친다 */
  mergeM: number
  /** 합친 덩어리의 최대 크기 (가로·세로 대각선) */
  maxClusterM: number
}

/**
 * 보행 구간들로 그래프를 만든다. 같은 구간이 여러 번 들어와도(타일 경계) 한 번만 쓰고,
 * 서로 이어진 가장 큰 덩어리만 남긴다. merge를 주면 가까이 붙은 교차로를 하나로 합친다.
 */
export function buildGraphFromSegments(
  positions: Map<NodeId, Vec2>,
  allSegments: Iterable<[NodeId, NodeId, string]>,
  origin: LatLng,
  merge?: MergeOptions,
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

  let segments = [...segmentMap.values()]
  let alias = new Map<NodeId, NodeId>()
  let graphAdj = adj
  if (merge && merge.mergeM > 0) {
    alias = junctionClusters(adj, positions, merge)
    const root = (id: NodeId) => alias.get(id) ?? id
    graphAdj = new Map()
    const merged = new Map<string, [NodeId, NodeId, string]>()
    for (const [a0, b0, highway] of segments) {
      const a = root(a0)
      const b = root(b0)
      if (a === b) continue
      if (!graphAdj.has(a)) graphAdj.set(a, new Set())
      if (!graphAdj.has(b)) graphAdj.set(b, new Set())
      graphAdj.get(a)!.add(b)
      graphAdj.get(b)!.add(a)
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (!merged.has(key)) merged.set(key, [a, b, highway])
    }
    segments = [...merged.values()]
  }

  const keep = largestComponent(graphAdj)
  const nodes = new Map<NodeId, Vec2>()
  for (const id of keep) nodes.set(id, positions.get(id)!)
  for (const [id, to] of alias) if (keep.has(to)) nodes.set(id, positions.get(id)!)
  for (const id of [...graphAdj.keys()]) {
    if (!keep.has(id)) graphAdj.delete(id)
  }
  segments = segments.filter(([a]) => keep.has(a))

  return { origin, nodes, adj: graphAdj, segments, alias }
}

/**
 * 길을 따라 mergeM 안에 붙은 교차로(길 3개 이상)들을 묶는다. 사이의 길 노드도 같이 묶인다.
 * 묶음의 대표는 가장 작은 id (타일을 더 읽어 그래프를 다시 만들어도 되도록 같은 노드가 대표가 되게).
 * 반환: 묶음에 들어간 노드 → 대표 (대표 자신은 빠진다)
 */
function junctionClusters(adj: Map<NodeId, Set<NodeId>>, positions: Map<NodeId, Vec2>, { mergeM, maxClusterM }: MergeOptions) {
  const parent = new Map<NodeId, NodeId>()
  const find = (id: NodeId): NodeId => {
    let r = id
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!
    // 경로 압축
    let cur = id
    while (cur !== r) {
      const next = parent.get(cur)!
      parent.set(cur, r)
      cur = next
    }
    return r
  }
  /** 대표 → 묶음 범위 [minX, minY, maxX, maxY] */
  const box = new Map<NodeId, [number, number, number, number]>()
  const boxOf = (r: NodeId): [number, number, number, number] => {
    const p = positions.get(r)!
    return box.get(r) ?? [p.x, p.y, p.x, p.y]
  }
  const union = (ids: NodeId[]) => {
    const roots = [...new Set(ids.map(find))]
    if (roots.length < 2) return
    let b = boxOf(roots[0])
    for (const r of roots.slice(1)) {
      const o = boxOf(r)
      b = [Math.min(b[0], o[0]), Math.min(b[1], o[1]), Math.max(b[2], o[2]), Math.max(b[3], o[3])]
    }
    if (Math.hypot(b[2] - b[0], b[3] - b[1]) > maxClusterM) return
    const top = roots.reduce((m, r) => (r < m ? r : m))
    for (const r of roots) if (r !== top) parent.set(r, top)
    parent.set(top, top)
    box.set(top, b)
  }

  const degree = (id: NodeId) => adj.get(id)?.size ?? 0
  for (const [j, around] of adj) {
    if (around.size < 3) continue
    for (const first of around) {
      // 길 노드(2개)만 지나 다음 교차로까지, mergeM 안에서
      const chain: NodeId[] = [j, first]
      let prev = j
      let cur = first
      let length = distance(positions.get(j)!, positions.get(cur)!)
      while (degree(cur) === 2 && length <= mergeM) {
        const next = [...adj.get(cur)!].find((n) => n !== prev)!
        length += distance(positions.get(cur)!, positions.get(next)!)
        chain.push(next)
        prev = cur
        cur = next
      }
      if (cur !== j && degree(cur) >= 3 && length <= mergeM) union(chain)
    }
  }

  const alias = new Map<NodeId, NodeId>()
  for (const id of parent.keys()) {
    const r = find(id)
    if (r !== id) alias.set(id, r)
  }
  return alias
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

/** allow를 주면 그 노드들 중에서만 고른다. 합쳐져 빠진 노드는 고르지 않는다 */
export function nearestNode(graph: RoadGraph, point: Vec2, allow?: (id: NodeId) => boolean): NodeId {
  let best: NodeId | undefined
  let bestDist = Infinity
  for (const [id, p] of graph.nodes) {
    if (!graph.adj.has(id)) continue
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

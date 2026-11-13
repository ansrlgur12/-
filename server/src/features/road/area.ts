import type { LatLng, NodeId, RoadCheck, Vec2 } from '@jikjwau/shared/types'
import { JUNCTION_CLUSTER_MAX_M, JUNCTION_MERGE_M, ROAD_GRAPH_MARGIN_M, ROAD_GRAPH_RADIUS_M } from '@jikjwau/shared/config'
import { parseTileKey, tileFlatToLocal, tilesAround, unproject } from '@jikjwau/shared/geo'
import { HttpError } from '../../common/http-error'
import { assertTilesReady, latLngInRegion, readRoadTile } from '../map/tile-store'
import { buildGraphFromSegments, nearestNode, type MergeOptions, type RoadGraph } from './graph'

/** 게임 그래프는 가까이 붙은 교차로를 합친다 */
const GAME_MERGE: MergeOptions = { mergeM: JUNCTION_MERGE_M, maxClusterM: JUNCTION_CLUSTER_MAX_M }
import { distance, project } from './geo'

type Segment = [NodeId, NodeId, string]

/** 도로 타일들을 읽어 origin 기준 좌표로 positions·segments에 더한다. 본토와 안 이어진 노드는 off에 */
async function readTiles(keys: string[], origin: LatLng, positions: Map<NodeId, Vec2>, segments: Segment[], off: Set<NodeId>) {
  const tiles = await Promise.all(keys.map(readRoadTile))
  tiles.forEach((tile, i) => {
    if (!tile) return
    for (const id of tile.off ?? []) off.add(id)
    const [row, col] = parseTileKey(keys[i])
    const xy: number[] = []
    for (let k = 0; k < tile.nodes.length; k += 3) xy.push(tile.nodes[k + 1], tile.nodes[k + 2])
    const local = tileFlatToLocal(xy, row, col, origin)
    for (let k = 0, j = 0; k < tile.nodes.length; k += 3, j += 2) {
      positions.set(tile.nodes[k], { x: local[j], y: local[j + 1] })
    }
    segments.push(...tile.segments)
  })
}

/**
 * 게임 한 판의 보행 도로 그래프. 처음에는 출발지 주변만 읽고,
 * 일행이 읽어 둔 범위의 가장자리에 다가가면 ensureAround로 더 넓힌다.
 */
export class RoadArea {
  graph: RoadGraph
  private readonly loaded = new Set<string>()
  /** 본토와 걸어서 이어지지 않는 노드 (섬 등). 출발점으로 쓰지 않는다 */
  readonly off = new Set<NodeId>()
  private readonly positions = new Map<NodeId, Vec2>()
  private readonly segments: Segment[] = []

  private constructor(readonly origin: LatLng) {
    this.graph = buildGraphFromSegments(this.positions, [], origin, GAME_MERGE)
  }

  static async load(origin: LatLng): Promise<RoadArea> {
    await assertTilesReady()
    const area = new RoadArea(origin)
    await area.ensureAround({ x: 0, y: 0 })
    if (area.graph.nodes.size === 0) throw new HttpError(404, '출발지 주변에 걸을 수 있는 길이 없습니다')
    return area
  }

  /** point 주변 ROAD_GRAPH_MARGIN_M 안에 안 읽은 타일이 있으면 ROAD_GRAPH_RADIUS_M까지 읽는다. 넓혔으면 true */
  async ensureAround(point: Vec2): Promise<boolean> {
    const center = unproject(point, this.origin)
    if (tilesAround(center, ROAD_GRAPH_MARGIN_M).every((k) => this.loaded.has(k))) return false
    const keys = tilesAround(center, ROAD_GRAPH_RADIUS_M).filter((k) => !this.loaded.has(k))
    await readTiles(keys, this.origin, this.positions, this.segments, this.off)
    for (const k of keys) this.loaded.add(k)
    this.graph = buildGraphFromSegments(this.positions, this.segments, this.origin, GAME_MERGE)
    return true
  }
}

/** 이 반경 안에 길이 없으면 "길이 없는 곳"으로 본다 */
export const SNAP_RADIUS_M = 300

/** 본토와 이어진 길 중 latLng에서 가장 가까운 지점 (origin 기준). 근처에 없으면 이유와 함께 null */
async function snapNear(latLng: LatLng, origin: LatLng): Promise<{ point: Vec2 } | { point: null; reason: 'island' | 'none' }> {
  const positions = new Map<NodeId, Vec2>()
  const segments: Segment[] = []
  const off = new Set<NodeId>()
  await readTiles(tilesAround(latLng, SNAP_RADIUS_M), origin, positions, segments, off)
  const graph = buildGraphFromSegments(positions, segments, origin)
  const target = project(latLng, origin)
  const near = (id: NodeId | undefined) => id !== undefined && distance(graph.nodes.get(id)!, target) <= SNAP_RADIUS_M
  const any = graph.nodes.size > 0 ? nearestNode(graph, target) : undefined
  if (!near(any)) return { point: null, reason: 'none' }
  const main = off.size > 0 && [...graph.nodes.keys()].some((id) => !off.has(id)) ? nearestNode(graph, target, (id) => !off.has(id)) : undefined
  if (!off.has(any!)) return { point: graph.nodes.get(any!)! }
  // 가장 가까운 길이 섬 쪽이면, 300m 안에 본토 길이 있을 때만 그쪽으로
  return near(main) ? { point: graph.nodes.get(main!)! } : { point: null, reason: 'island' }
}

/** latLng에서 가장 가까운, 본토와 걸어서 이어진 길 위의 지점 (origin 기준). 없으면 null */
export async function snapToRoad(latLng: LatLng, origin: LatLng): Promise<Vec2 | null> {
  return (await snapNear(latLng, origin)).point
}

/** 출발지·목적지로 고른 곳 확인: 대한민국 안인지, 걸어서 갈 수 있는 길이 가까이 있는지 */
export async function checkSpot(latLng: LatLng): Promise<RoadCheck> {
  await assertTilesReady()
  if (!(await latLngInRegion(latLng))) return { road: null, reason: 'abroad' }
  const snap = await snapNear(latLng, latLng)
  if (!snap.point) return { road: null, reason: snap.reason }
  const at = unproject(snap.point, latLng)
  return { road: { lat: at.lat, lng: at.lng, distanceM: Math.round(distance(snap.point, { x: 0, y: 0 })) } }
}

/** 확인 결과를 사용자에게 보일 문장으로 (방을 만들 때 거절 사유) */
export function spotProblem(check: RoadCheck, what: '출발지' | '목적지'): string | null {
  if (check.road) return null
  if (check.reason === 'abroad') return `${what}는 대한민국 안에서만 고를 수 있습니다`
  if (check.reason === 'island') return `${what}가 걸어서 갈 수 없는 곳(다리 없는 섬 등)입니다`
  return `${what} 근처 ${SNAP_RADIUS_M}m 안에 걸을 수 있는 길이 없습니다`
}

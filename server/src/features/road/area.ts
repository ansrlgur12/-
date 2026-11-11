import type { LatLng, NodeId, Vec2 } from '@jikjwau/shared/types'
import { ROAD_GRAPH_MARGIN_M, ROAD_GRAPH_RADIUS_M } from '@jikjwau/shared/config'
import { parseTileKey, tileFlatToLocal, tilesAround, unproject } from '@jikjwau/shared/geo'
import { HttpError } from '../../common/http-error'
import { assertTilesReady, readRoadTile } from '../map/tile-store'
import { buildGraphFromSegments, nearestNode, type RoadGraph } from './graph'
import { distance, project } from './geo'

type Segment = [NodeId, NodeId, string]

/** 도로 타일들을 읽어 origin 기준 좌표로 positions·segments에 더한다 */
async function readTiles(keys: string[], origin: LatLng, positions: Map<NodeId, Vec2>, segments: Segment[]) {
  const tiles = await Promise.all(keys.map(readRoadTile))
  tiles.forEach((tile, i) => {
    if (!tile) return
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
  private readonly positions = new Map<NodeId, Vec2>()
  private readonly segments: Segment[] = []

  private constructor(readonly origin: LatLng) {
    this.graph = buildGraphFromSegments(this.positions, [], origin)
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
    await readTiles(keys, this.origin, this.positions, this.segments)
    for (const k of keys) this.loaded.add(k)
    this.graph = buildGraphFromSegments(this.positions, this.segments, this.origin)
    return true
  }
}

/** 이 반경 안에 길이 없으면 "길이 없는 곳"으로 본다 */
const SNAP_RADIUS_M = 300

/** latLng에서 가장 가까운 길 위의 지점 (origin 기준). 근처에 길이 없으면 null */
export async function snapToRoad(latLng: LatLng, origin: LatLng): Promise<Vec2 | null> {
  const positions = new Map<NodeId, Vec2>()
  const segments: Segment[] = []
  await readTiles(tilesAround(latLng, SNAP_RADIUS_M), origin, positions, segments)
  const graph = buildGraphFromSegments(positions, segments, origin)
  if (graph.nodes.size === 0) return null
  const target = project(latLng, origin)
  const p = graph.nodes.get(nearestNode(graph, target))!
  return distance(p, target) <= SNAP_RADIUS_M ? p : null
}

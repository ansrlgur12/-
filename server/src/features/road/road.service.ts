import type { LatLng, NodeId, RoadAreaResponse, RoadStepResponse } from '@jikjwau/shared/types'
import { HttpError } from '../../common/http-error'
import { bearingDeg } from './geo'
import { buildGraph, nearestNode, type OsmElement, type RoadGraph } from './graph'
import { fetchRoads } from './overpass'
import { arrivalAt, walkToDecision } from './walk'

// Phase 1: 메모리 캐시. 이후 MongoDB roadGraphs 컬렉션으로 옮긴다.
const areas = new Map<string, RoadGraph>()

const round1 = (n: number) => Math.round(n * 10) / 10

export async function createArea(center: LatLng, radiusM: number): Promise<RoadAreaResponse> {
  const areaId = `${center.lat.toFixed(5)},${center.lng.toFixed(5)},${radiusM}`
  let graph = areas.get(areaId)
  if (!graph) {
    let elements: OsmElement[]
    try {
      elements = await fetchRoads(center, radiusM)
    } catch (err) {
      throw new HttpError(502, `도로 데이터를 받아오지 못했습니다: ${(err as Error).message}`)
    }
    graph = buildGraph(elements, center)
    if (graph.nodes.size === 0) throw new HttpError(404, '이 주변에 걸을 수 있는 길이 없습니다')
    areas.set(areaId, graph)
  }

  const g = graph
  const startId = nearestNode(g, { x: 0, y: 0 })
  const start = g.nodes.get(startId)!

  return {
    areaId,
    origin: center,
    nodes: [...g.nodes].map(([id, p]) => [id, round1(p.x), round1(p.y)]),
    segments: g.segments,
    start: {
      nodeId: startId,
      choices: [...g.adj.get(startId)!].map((via) => ({
        via,
        bearingDeg: Math.round(bearingDeg(start, g.nodes.get(via)!)),
      })),
    },
  }
}

export function step(areaId: string, from: NodeId, via: NodeId): RoadStepResponse {
  const graph = areas.get(areaId)
  if (!graph) throw new HttpError(404, '지역 정보가 없습니다. 다시 불러와 주세요')
  if (!graph.adj.get(from)?.has(via)) throw new HttpError(400, '이어지지 않은 길입니다')

  const path = walkToDecision(graph, from, via)
  return { path, arrival: arrivalAt(graph, path) }
}

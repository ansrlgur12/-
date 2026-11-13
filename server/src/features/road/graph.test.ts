import { describe, expect, it } from 'vitest'
import type { NodeId, Vec2 } from '@jikjwau/shared/types'
import { buildGraphFromSegments, canonicalNode, isWalkable, nearestNode } from './graph'

const origin = { lat: 37.5, lng: 127 }
const MERGE = { mergeM: 25, maxClusterM: 40 }

function graphOf(points: Record<number, [number, number]>, edges: Array<[number, number]>, merge = true) {
  const positions = new Map<NodeId, Vec2>(Object.entries(points).map(([id, [x, y]]) => [Number(id), { x, y }]))
  return buildGraphFromSegments(
    positions,
    edges.map(([a, b]) => [a, b, 'residential'] as [NodeId, NodeId, string]),
    origin,
    merge ? MERGE : undefined,
  )
}

describe('isWalkable', () => {
  it('자동차 전용도로·대교도 걷는다', () => {
    expect(isWalkable({ highway: 'motorway' })).toBe(true)
    expect(isWalkable({ highway: 'trunk', foot: 'no', bridge: 'yes' })).toBe(true)
  })
  it('따로 그린 보도·횡단보도와 사유지는 빼고, 공사 중인 길도 뺀다', () => {
    expect(isWalkable({ highway: 'footway', footway: 'sidewalk' })).toBe(false)
    expect(isWalkable({ highway: 'footway', footway: 'crossing' })).toBe(false)
    expect(isWalkable({ highway: 'footway' })).toBe(true)
    expect(isWalkable({ highway: 'service', access: 'private' })).toBe(false)
    expect(isWalkable({ highway: 'construction' })).toBe(false)
    expect(isWalkable({ highway: 'cycleway', foot: 'no' })).toBe(false)
  })
})

describe('교차로 합치기', () => {
  // 큰길 둘이 만나는 곳: 왕복 차로가 따로 그려져 20m 네모 안에 교차로 넷 (1,2,3,4)
  //        10   11
  //        |    |
  //  20 -- 1 -- 2 -- 21
  //        |    |
  //  22 -- 3 -- 4 -- 23
  //        |    |
  //        12   13
  const points: Record<number, [number, number]> = {
    1: [0, 20],
    2: [20, 20],
    3: [0, 0],
    4: [20, 0],
    10: [0, 200],
    11: [20, 200],
    12: [0, -200],
    13: [20, -200],
    20: [-200, 20],
    21: [220, 20],
    22: [-200, 0],
    23: [220, 0],
  }
  const edges: Array<[number, number]> = [
    [1, 2],
    [3, 4],
    [1, 3],
    [2, 4],
    [10, 1],
    [11, 2],
    [12, 3],
    [13, 4],
    [20, 1],
    [21, 2],
    [22, 3],
    [23, 4],
  ]

  it('가까이 붙은 교차로 넷이 하나가 된다 (대표는 가장 작은 id)', () => {
    const g = graphOf(points, edges)
    for (const id of [2, 3, 4]) expect(canonicalNode(g, id)).toBe(1)
    expect(g.adj.get(1)!.size).toBe(8)
    expect([...g.adj.get(10)!]).toEqual([1])
    // 합쳐진 노드도 위치는 남아 있다 (지나온 길 그리기)
    expect(g.nodes.get(4)).toEqual({ x: 20, y: 0 })
    // 가장 가까운 노드로는 대표만 고른다
    expect(nearestNode(g, { x: 19, y: 1 })).toBe(1)
  })

  it('합치지 않으면 그대로', () => {
    const g = graphOf(points, edges, false)
    expect(g.adj.get(1)!.size).toBe(4)
    expect(g.alias.size).toBe(0)
  })

  it('멀리 떨어진 교차로는 합치지 않는다', () => {
    // 60m 간격 골목
    const far = graphOf(
      { 1: [0, 0], 2: [60, 0], 3: [0, 60], 4: [0, -60], 5: [60, 60], 6: [60, -60] },
      [
        [1, 2],
        [1, 3],
        [1, 4],
        [2, 5],
        [2, 6],
      ],
    )
    expect(far.alias.size).toBe(0)
  })

  it('골목이 촘촘해도 한 덩어리가 너무 커지지 않는다', () => {
    // 20m 간격으로 교차로가 일렬로 6개: 다 합치면 100m
    const pts: Record<number, [number, number]> = {}
    const es: Array<[number, number]> = []
    for (let i = 0; i < 6; i++) {
      pts[i + 1] = [i * 20, 0]
      pts[i + 101] = [i * 20, 100]
      pts[i + 201] = [i * 20, -100]
      es.push([i + 1, i + 101], [i + 1, i + 201])
      if (i > 0) es.push([i, i + 1])
    }
    const g = graphOf(pts, es)
    const groups = new Set([1, 2, 3, 4, 5, 6].map((id) => canonicalNode(g, id)))
    expect(groups.size).toBeGreaterThan(1)
  })
})

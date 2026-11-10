import { describe, expect, it } from 'vitest'
import { buildGraph, type OsmElement } from './graph'
import { arrivalAt, walkToDecision } from './walk'

const ORIGIN = { lat: 37.5, lng: 127 }
// 위도 1m ≈ 0.000009°, 이 위도에서 경도 1m ≈ 0.0000113°
const M_LAT = 1 / 111_195
const M_LNG = 1 / (111_195 * Math.cos((37.5 * Math.PI) / 180))

/** 로컬 미터 좌표로 OSM 노드를 만든다 */
function node(id: number, x: number, y: number): OsmElement {
  return { type: 'node', id, lat: ORIGIN.lat + y * M_LAT, lon: ORIGIN.lng + x * M_LNG }
}

function way(id: number, nodes: number[], highway = 'residential', tags: Record<string, string> = {}): OsmElement {
  return { type: 'way', id, nodes, tags: { highway, ...tags } }
}

/**
 *            5 (0,100)
 *            |
 *  4 (-100,0)-1 (0,0)-3 (100,0)
 *            |
 *            6 (0,-50)
 *            |
 *            2 (0,-100)
 */
const crossroad = buildGraph(
  [
    node(1, 0, 0),
    node(2, 0, -100),
    node(3, 100, 0),
    node(4, -100, 0),
    node(5, 0, 100),
    node(6, 0, -50),
    way(10, [2, 6, 1, 5]),
    way(11, [4, 1, 3]),
  ],
  ORIGIN,
)

describe('buildGraph', () => {
  it('보행 불가 도로와 떨어진 조각은 제외한다', () => {
    const graph = buildGraph(
      [
        node(1, 0, 0),
        node(2, 100, 0),
        node(3, 200, 0),
        node(4, 100, 100),
        node(8, 0, 500),
        node(9, 100, 500),
        way(10, [1, 2, 4]),
        way(11, [2, 3], 'motorway'),
        way(12, [8, 9], 'footway'),
        way(13, [1, 8], 'residential', { access: 'private' }),
      ],
      ORIGIN,
    )
    expect([...graph.nodes.keys()].sort()).toEqual([1, 2, 4])
  })
})

describe('walkToDecision', () => {
  it('길이 2개뿐인 지점은 지나쳐 교차로까지 간다', () => {
    expect(walkToDecision(crossroad, 2, 6)).toEqual([2, 6, 1])
  })

  it('이웃이 아니면 에러', () => {
    expect(() => walkToDecision(crossroad, 2, 1)).toThrow()
  })
})

describe('arrivalAt', () => {
  it('남쪽에서 북쪽으로 들어오면 서쪽이 좌, 북쪽이 직, 동쪽이 우', () => {
    const arrival = arrivalAt(crossroad, [2, 6, 1])
    expect(arrival.kind).toBe('intersection')
    expect(arrival.incomingFrom).toBe(6)
    expect(arrival.options.map((o) => [o.direction, o.via])).toEqual([
      ['left', 4],
      ['straight', 5],
      ['right', 3],
    ])
  })

  it('동쪽에서 서쪽으로 들어오면 남쪽이 좌, 서쪽이 직, 북쪽이 우', () => {
    const arrival = arrivalAt(crossroad, [3, 1])
    expect(arrival.options.map((o) => [o.direction, o.via])).toEqual([
      ['left', 6],
      ['straight', 4],
      ['right', 5],
    ])
  })

  it('막다른 길', () => {
    const arrival = arrivalAt(crossroad, [1, 5])
    expect(arrival).toMatchObject({ kind: 'deadEnd', incomingFrom: 1, options: [] })
  })

  it('교차로 바로 앞의 짧은 꺾임은 무시하고 20m 지점 기준으로 방향을 잰다', () => {
    // 북쪽으로 가다가 교차로 2m 전에서 동쪽으로 살짝 틀어 들어오는 길
    const graph = buildGraph(
      [
        node(1, 0, -100),
        node(2, 0, -2),
        node(3, 2, 0),
        node(4, 2, 100),
        node(5, -98, 0),
        node(6, 102, 0),
        way(10, [1, 2, 3, 4]),
        way(11, [5, 3, 6]),
      ],
      ORIGIN,
    )
    const arrival = arrivalAt(graph, [1, 2, 3])
    expect(arrival.options.map((o) => [o.direction, o.via])).toEqual([
      ['left', 5],
      ['straight', 4],
      ['right', 6],
    ])
  })
})

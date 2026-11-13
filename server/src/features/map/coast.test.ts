import { describe, expect, it } from 'vitest'
import { Coast, seaPolygons, type SeaPolygon } from './coast'

const TILE = 100_000

/** 점들을 이은 해안선 (마지막 점에서 첫 점으로 닫을지) */
function coastOf(points: Array<[number, number]>, closed: boolean) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const segA: number[] = []
  const segB: number[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    segA.push(i)
    segB.push(i + 1)
  }
  if (closed) {
    segA.push(points.length - 1)
    segB.push(0)
  }
  return new Coast(xs, ys, segA, segB, TILE)
}

describe('Coast', () => {
  // 시계 반대 방향으로 도는 네모 섬: 왼쪽(안쪽)이 땅
  const island = coastOf(
    [
      [0, 0],
      [400_000, 0],
      [400_000, 400_000],
      [0, 400_000],
    ],
    true,
  )

  it('섬 안은 땅, 밖은 바다', () => {
    expect(island.isSea(200_000, 200_000)).toBe(false)
    expect(island.isSea(10_000, 390_000)).toBe(false)
    expect(island.isSea(-50_000, 200_000)).toBe(true)
    expect(island.isSea(450_000, 450_000)).toBe(true)
  })

  it('모서리(꼭짓점이 가장 가까운 곳)에서도 맞게', () => {
    // 섬 모서리 바깥 대각선: 가장 가까운 것은 꼭짓점
    expect(island.isSea(-30_000, -30_000)).toBe(true)
    expect(island.isSea(430_000, 430_000)).toBe(true)
    // 모서리 바로 안쪽
    expect(island.isSea(5_000, 5_000)).toBe(false)
  })

  it('오목하게 들어간 만(灣)', () => {
    // 동쪽으로 가다 아래로 파인 만이 있는 해안: 북쪽(왼쪽)이 땅, 남쪽이 바다
    const bay = coastOf(
      [
        [0, 0],
        [200_000, 0],
        [200_000, 200_000],
        [400_000, 200_000],
        [400_000, 0],
        [600_000, 0],
      ],
      false,
    )
    expect(bay.isSea(300_000, 100_000)).toBe(true) // 만 안쪽 바다
    expect(bay.isSea(100_000, 100_000)).toBe(false) // 만 왼쪽 땅
    expect(bay.isSea(300_000, 300_000)).toBe(false) // 만 위쪽 땅
    expect(bay.isSea(300_000, -100_000)).toBe(true) // 먼바다
    // 오목한 모서리 근처 (200000, 200000의 바깥 대각선 → 땅)
    expect(bay.isSea(190_000, 210_000)).toBe(false)
    // 볼록한 모서리 근처 (200000, 0의 안쪽 대각선 → 바다)
    expect(bay.isSea(210_000, -10_000)).toBe(true)
  })

  it('가까운 해안선이 없으면 모른다', () => {
    expect(island.isSea(90_000_000, 90_000_000, 3)).toBe(null)
  })
})

/** 바다 면적 (바깥 - 구멍) */
function seaArea(polys: SeaPolygon[] | 1 | null) {
  if (polys === null) return 0
  if (polys === 1) return TILE * TILE
  const area = (ring: Array<[number, number]>) => {
    let a = 0
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
    return Math.abs(a / 2)
  }
  return polys.reduce((sum, [outer, ...holes]) => sum + area(outer) - holes.reduce((h, r) => h + area(r), 0), 0)
}

describe('seaPolygons', () => {
  it('타일을 가로지르는 해안선: 남쪽 절반이 바다', () => {
    // 동쪽으로 가는 해안선 (왼쪽=북쪽이 땅), 타일 (0,0) 가운데 높이
    const coast = coastOf(
      [
        [-300_000, 50_000],
        [400_000, 50_000],
      ],
      false,
    )
    const polys = seaPolygons(coast, 0, 0, TILE)
    expect(seaArea(polys)).toBeCloseTo((TILE * TILE) / 2, -3)
  })

  it('비스듬한 해안선도 넓이가 맞다', () => {
    // 왼쪽 아래 → 오른쪽 위 대각선, 왼쪽(북서)이 땅 → 남동쪽 삼각형이 바다
    const coast = coastOf(
      [
        [-100_000, -100_000],
        [200_000, 200_000],
      ],
      false,
    )
    expect(seaArea(seaPolygons(coast, 0, 0, TILE))).toBeCloseTo((TILE * TILE) / 2, -3)
  })

  it('바다 한가운데 작은 섬은 구멍', () => {
    const island = coastOf(
      [
        [40_000, 40_000],
        [60_000, 40_000],
        [60_000, 60_000],
        [40_000, 60_000],
      ],
      true,
    )
    const polys = seaPolygons(island, 0, 0, TILE)
    expect(polys).not.toBe(1)
    expect(seaArea(polys)).toBeCloseTo(TILE * TILE - 20_000 * 20_000, -3)
  })

  it('해안선이 없는 바다 타일은 1, 땅 타일은 null', () => {
    const island = coastOf(
      [
        [0, 0],
        [400_000, 0],
        [400_000, 400_000],
        [0, 400_000],
      ],
      true,
    )
    expect(seaPolygons(island, 6, 6, TILE)).toBe(1)
    expect(seaPolygons(island, 2, 2, TILE)).toBe(null)
  })

  it('타일을 두 번 드나드는 만: 바다 조각 둘이 맞게 닫힌다', () => {
    // 동쪽으로 가다가 타일 안으로 파고드는 만이 둘 (북쪽이 땅)
    const coast = coastOf(
      [
        [-100_000, 80_000],
        [20_000, 80_000],
        [20_000, 120_000],
        [40_000, 120_000],
        [40_000, 80_000],
        [60_000, 80_000],
        [60_000, 120_000],
        [80_000, 120_000],
        [80_000, 80_000],
        [200_000, 80_000],
      ],
      false,
    )
    // 타일 (0,0): y 0~100000. 해안선 y=80000 아래가 바다, 위쪽 20000 띠는 땅이지만 만 두 곳(폭 20000)은 바다
    const expected = TILE * 80_000 + 2 * 20_000 * 20_000
    expect(seaArea(seaPolygons(coast, 0, 0, TILE))).toBeCloseTo(expected, -3)
  })
})

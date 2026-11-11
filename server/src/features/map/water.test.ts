import { describe, expect, it } from 'vitest'
import { assembleMultipolygon, stitchRings } from './water'

const p = (x: number, y: number) => ({ x, y })

describe('stitchRings', () => {
  it('끝점이 맞닿은 조각을 (뒤집어서라도) 이어 닫힌 고리로 만든다', () => {
    const rings = stitchRings([
      [p(0, 0), p(0, 1), p(1, 1)],
      [p(0, 0), p(1, 0), p(1, 1)], // 방향이 반대인 나머지 반쪽
    ])
    expect(rings).toHaveLength(1)
    expect(rings[0]).toHaveLength(4)
  })

  it('닫히지 않는 조각은 버린다', () => {
    expect(stitchRings([[p(0, 0), p(0, 1), p(1, 1)]])).toEqual([])
  })
})

describe('assembleMultipolygon', () => {
  it('섬(inner)은 그것을 감싸는 바깥 고리의 구멍이 된다', () => {
    const polygons = assembleMultipolygon(
      [
        [p(0, 0), p(10, 0), p(10, 10)],
        [p(10, 10), p(0, 10), p(0, 0)],
        [p(20, 0), p(30, 0), p(30, 10), p(20, 0)],
      ],
      [[p(4, 4), p(6, 4), p(6, 6), p(4, 4)]],
    )
    expect(polygons.map((rings) => rings.map((r) => r.length))).toEqual([[3], [4, 3]])
  })
})

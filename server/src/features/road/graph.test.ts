import { describe, expect, it } from 'vitest'
import { isWalkable } from './graph'

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

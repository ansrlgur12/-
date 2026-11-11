import { describe, expect, it } from 'vitest'
import { buildingHeight, isBuilding } from './buildings'

describe('buildingHeight', () => {
  it('height 태그가 있으면 그대로 쓴다', () => {
    expect(buildingHeight({ building: 'yes', height: '21.5', 'building:levels': '3' })).toBe(21.5)
  })

  it('층수가 있으면 층수 × 3m', () => {
    expect(buildingHeight({ building: 'yes', 'building:levels': '5' })).toBe(15)
  })

  it('둘 다 없으면 건물 종류별 기본값', () => {
    expect(buildingHeight({ building: 'house' })).toBe(6)
    expect(buildingHeight({ building: 'apartments' })).toBe(45)
    expect(buildingHeight({ building: 'yes' })).toBe(12)
  })
})

describe('isBuilding', () => {
  it('building=no는 건물이 아니다', () => {
    expect(isBuilding({ building: 'yes' })).toBe(true)
    expect(isBuilding({ building: 'no' })).toBe(false)
    expect(isBuilding({ highway: 'residential' })).toBe(false)
  })
})

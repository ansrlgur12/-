import { describe, expect, it } from 'vitest'
import { turnAngleDeg } from './geo'
import { classifyTurns, directionOf } from './turn'

describe('turnAngleDeg', () => {
  it('왼쪽은 음수, 오른쪽은 양수', () => {
    expect(turnAngleDeg(0, 270)).toBe(-90)
    expect(turnAngleDeg(0, 90)).toBe(90)
  })

  it('0°/360° 경계를 넘어도 올바르게 계산한다', () => {
    expect(turnAngleDeg(350, 10)).toBe(20)
    expect(turnAngleDeg(10, 350)).toBe(-20)
  })

  it('정반대는 180', () => {
    expect(turnAngleDeg(90, 270)).toBe(180)
  })
})

describe('directionOf', () => {
  it.each([
    [0, 'straight'],
    [30, 'straight'],
    [-30, 'straight'],
    [31, 'right'],
    [150, 'right'],
    [-31, 'left'],
    [-150, 'left'],
    [151, null],
    [-170, null],
    [180, null],
  ] as const)('%d° → %s', (angle, expected) => {
    expect(directionOf(angle)).toBe(expected)
  })
})

describe('classifyTurns', () => {
  it('십자 교차로는 좌·직·우 3개', () => {
    const options = classifyTurns([
      { via: 1, angleDeg: -90 },
      { via: 2, angleDeg: 2 },
      { via: 3, angleDeg: 88 },
    ])
    expect(options.map((o) => [o.direction, o.via])).toEqual([
      ['left', 1],
      ['straight', 2],
      ['right', 3],
    ])
  })

  it('같은 분류가 여럿이면 기준 각도에 가까운 길만 남긴다 (오거리)', () => {
    const options = classifyTurns([
      { via: 1, angleDeg: -45 },
      { via: 2, angleDeg: -100 },
      { via: 3, angleDeg: 10 },
      { via: 4, angleDeg: 60 },
    ])
    expect(options.map((o) => [o.direction, o.via])).toEqual([
      ['left', 2],
      ['straight', 3],
      ['right', 4],
    ])
  })

  it('같은 분류에 길이 둘이고 옆 칸이 비었으면 둘 다 남긴다 (갈림길)', () => {
    const rights = classifyTurns([
      { via: 1, angleDeg: 73 },
      { via: 2, angleDeg: 49 },
    ])
    expect(rights.map((o) => [o.direction, o.via])).toEqual([
      ['straight', 2],
      ['right', 1],
    ])
    const lefts = classifyTurns([
      { via: 1, angleDeg: -53 },
      { via: 2, angleDeg: -137 },
    ])
    expect(lefts.map((o) => [o.direction, o.via])).toEqual([
      ['left', 2],
      ['straight', 1],
    ])
  })

  it('왼쪽 길을 우회전으로 보내지는 않는다', () => {
    const options = classifyTurns([
      { via: 1, angleDeg: -100 },
      { via: 2, angleDeg: -60 },
      { via: 3, angleDeg: -40 },
    ])
    expect(options.map((o) => [o.direction, o.via])).toEqual([
      ['left', 1],
      ['straight', 3],
    ])
  })

  it('거의 되돌아가는 길은 제외한다', () => {
    const options = classifyTurns([
      { via: 1, angleDeg: -165 },
      { via: 2, angleDeg: 90 },
    ])
    expect(options.map((o) => o.direction)).toEqual(['right'])
  })

  it('각도 기준값을 바꿀 수 있다', () => {
    const angles = { straightMaxDeg: 45, turnMaxDeg: 150, target: { left: -90, straight: 0, right: 90 } }
    expect(classifyTurns([{ via: 1, angleDeg: 40 }], angles)[0].direction).toBe('straight')
  })
})

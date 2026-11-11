import { describe, expect, it } from 'vitest'
import { judgeRound, randomHand } from './rps'

describe('judgeRound', () => {
  it('한 명이 이긴다', () => {
    expect(judgeRound({ A: 'rock', B: 'scissors', C: 'scissors' })).toEqual(['A'])
  })

  it('두 명이 이긴다', () => {
    expect(judgeRound({ A: 'paper', B: 'rock', C: 'paper' })).toEqual(['A', 'C'])
  })

  it('모두 같거나 셋이 모두 다르면 무승부', () => {
    expect(judgeRound({ A: 'rock', B: 'rock', C: 'rock' })).toEqual([])
    expect(judgeRound({ A: 'rock', B: 'paper', C: 'scissors' })).toEqual([])
  })

  it('두 명끼리', () => {
    expect(judgeRound({ A: 'scissors', C: 'paper' })).toEqual(['A'])
    expect(judgeRound({ B: 'paper', C: 'paper' })).toEqual([])
  })
})

describe('randomHand', () => {
  it('rand 값 범위 끝에서도 손을 고른다', () => {
    expect(randomHand(() => 0)).toBe('rock')
    expect(randomHand(() => 0.9999)).toBe('scissors')
  })
})

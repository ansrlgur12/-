import type { Hand, Seat } from '@jikjwau/shared/types'

export const HANDS: readonly Hand[] = ['rock', 'paper', 'scissors']

const BEATS: Record<Hand, Hand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }

export function randomHand(rand: () => number = Math.random): Hand {
  return HANDS[Math.min(HANDS.length - 1, Math.floor(rand() * HANDS.length))]
}

/**
 * 한 판의 승자. 모두 같은 것을 냈거나 셋이 모두 다르면 무승부(빈 배열).
 * 두 종류만 나왔으면 이기는 쪽을 낸 자리가 모두 이긴다 (3명 중 2명이 이길 수 있다).
 */
export function judgeRound(hands: Partial<Record<Seat, Hand>>): Seat[] {
  const entries = Object.entries(hands) as Array<[Seat, Hand]>
  const kinds = new Set(entries.map(([, h]) => h))
  if (kinds.size !== 2) return []
  const [a, b] = [...kinds]
  const winning = BEATS[a] === b ? a : b
  return entries.filter(([, h]) => h === winning).map(([seat]) => seat)
}

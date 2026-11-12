import type { Direction, Hand, RoomRules, Seat } from '@jikjwau/shared/types'
import { SEAT_DIRECTION } from '@jikjwau/shared/config'
import { DIRECTION_COLOR } from '../map/ChoiceArrows'
import type { IconName } from './Icon'

export const DIRECTION_LABEL: Record<Direction, string> = { left: '좌회전', straight: '직진', right: '우회전' }
export const HAND_ICON: Record<Hand, IconName> = { rock: 'rock', paper: 'paper', scissors: 'scissors' }
export const HAND_NAME: Record<Hand, string> = { rock: '바위', paper: '보', scissors: '가위' }
/** 방향 화살표 (크게 보여 줄 때) */
export const DIRECTION_ARROW: Record<Direction, string> = { left: '←', straight: '↑', right: '→' }

export const seatColor = (seat: Seat) => DIRECTION_COLOR[SEAT_DIRECTION[seat]]
export const seatLabel = (seat: Seat) => `${seat} ${DIRECTION_LABEL[SEAT_DIRECTION[seat]]}`

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function rulesLabel(rules: RoomRules) {
  if (rules.mode === 'hardcore') return '하드코어'
  return rules.limit.kind === 'time' ? `일반 · ${rules.limit.minutes}분` : `일반 · 가위바위보 ${rules.limit.count}회`
}

/** 2026-11-11 → 11월 11일 */
export function formatDay(day: string) {
  const [, m, d] = day.split('-').map(Number)
  return `${m}월 ${d}일`
}

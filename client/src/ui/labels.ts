import type { Direction, Hand, Seat } from '@jikjwau/shared/types'
import { SEAT_DIRECTION } from '@jikjwau/shared/config'
import { DIRECTION_COLOR } from '../map/ChoiceArrows'

export const DIRECTION_LABEL: Record<Direction, string> = { left: '좌회전', straight: '직진', right: '우회전' }
export const HAND_LABEL: Record<Hand, string> = { rock: '✊ 바위', paper: '✋ 보', scissors: '✌️ 가위' }
export const HAND_EMOJI: Record<Hand, string> = { rock: '✊', paper: '✋', scissors: '✌️' }

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

/** 플레이어 자리. A = 좌회전, B = 직진, C = 우회전 */
export type Seat = 'A' | 'B' | 'C'

export type Direction = 'left' | 'straight' | 'right'

export type Hand = 'rock' | 'paper' | 'scissors'

export type GameMode = 'normal' | 'hardcore'

export type GameResult = 'completed' | 'extended' | 'incomplete'

export type GamePhase =
  | 'LOBBY'
  | 'MOVING'
  | 'RPS'
  | 'RPS_REMATCH'
  | 'ARRIVED'
  | 'LIMIT_REACHED'
  | 'ABANDONED'
  | 'END'

export type SeatController = 'user' | 'ai'

export interface LatLng {
  lat: number
  lng: number
}

import type { Direction, Hand, LatLng, Seat } from './game'

/** 게임 origin(출발지) 기준 미터 [x 동쪽, y 북쪽] */
export type Point = [number, number]

export interface RpsRoundResult {
  participants: Seat[]
  hands: Partial<Record<Seat, Hand>>
  /** 이긴 자리. 비기면 빈 배열 */
  winners: Seat[]
  /** 두 명이 이겨서 다시 하는 판인지 */
  rematch: boolean
  /** 시간 안에 내지 않아 AI가 대신 낸 자리 */
  timedOut: Seat[]
}

/**
 * start: 출발 (방향은 무작위), win: 이긴 사람 방향, uturn: 첫 판 무승부,
 * deadEnd: 막다른 길 자동 유턴, only: 갈 수 있는 방향이 하나뿐
 */
export type MoveReason = 'start' | 'win' | 'uturn' | 'deadEnd' | 'only'

/** 서버가 판정한 일을 일어난 순서대로. 앱은 이것을 차례로 연출한다 */
export type GameEvent =
  | { type: 'rps'; result: RpsRoundResult }
  | { type: 'move'; reason: MoveReason; direction?: Direction; path: Point[]; distanceM: number }

export interface RpsPrompt {
  participants: Seat[]
  rematch: boolean
  /** 이번 판 참가자가 이기면 갈 방향 (toward = 그 길로 처음 지나는 지점) */
  options: Array<{ seat: Seat; direction: Direction; toward: Point }>
  /** 응답을 받은 때부터 마감까지. 앞선 이벤트 연출 시간이 포함되어 있다 */
  timeLeftMs: number
}

export interface GameStats {
  /** 재경기 포함 가위바위보 횟수 */
  rpsCount: number
  distanceM: number
  elapsedMs: number
  /** 목적지까지 직선 거리 */
  remainingM: number
}

export interface GameSnapshot {
  phase: 'RPS' | 'RPS_REMATCH' | 'ARRIVED'
  position: Point
  stats: GameStats
  /** 내가 낼 차례일 때만 있다 */
  rps: RpsPrompt | null
}

export interface CreateGameRequest {
  start: LatLng
  destination: LatLng
  seat: Seat
}

export interface CreateGameResponse {
  gameId: string
  origin: LatLng
  seat: Seat
  /** 가장 가까운 길 위로 옮긴 목적지와 도착 반경 */
  destination: { point: Point; radiusM: number }
  start: Point
  events: GameEvent[]
  snapshot: GameSnapshot
}

export interface RpsChooseRequest {
  /** null = 시간 초과 (AI가 대신 낸다) */
  hand: Hand | null
}

export interface GameUpdateResponse {
  events: GameEvent[]
  snapshot: GameSnapshot
}

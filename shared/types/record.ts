import type { Point } from './play'
import type { PlaceRef, RoomRules } from './room'

/** 끝난 게임 한 판의 기록. 함께한 사람마다 내 기록실에 남는다 */
export interface PlayRecordSummary {
  id: string
  rules: RoomRules
  solo: boolean
  /** 함께한 사람 닉네임 (AI는 빼고) */
  players: string[]
  start: PlaceRef
  destination: PlaceRef
  /** 출발지-목적지 직선 거리 */
  straightM: number
  /** 총 이동 거리 */
  distanceM: number
  rpsCount: number
  elapsedMs: number
  /** 끝났을 때 목적지까지 남은 직선 거리 (도착했으면 0) */
  remainingM: number
  arrived: boolean
  /** 끝난 시각 (ms) */
  finishedAt: number
  /** 끝난 날 (한국 시간 YYYY-MM-DD) */
  day: string
}

export interface PlayRecord extends PlayRecordSummary {
  /** 지나온 길. 출발지 기준 미터 */
  trail: Point[]
  /** 목적지 (출발지 기준 미터, 길 위로 옮긴 곳) */
  target: Point
}

/** 월드레코드 정렬: 총 이동 거리 짧은 순, 출발-목적지 거리 먼 순, 가위바위보 횟수 적은 순 */
export type WorldRecordSort = 'distance' | 'straight' | 'rps'

export interface WorldRecordResponse {
  day: string
  sort: WorldRecordSort
  records: PlayRecordSummary[]
}

export interface MyRecordsResponse {
  records: PlayRecordSummary[]
}

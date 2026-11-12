import type { Direction, Hand, LatLng, Seat, SeatController } from './game'

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
  /** 이미 낸 자리 (무엇을 냈는지는 판정 전까지 알려 주지 않는다) */
  submitted: Seat[]
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
  /** ENDED: 일반 모드의 제한(시간·횟수)을 다 써서 끝남 */
  phase: 'RPS' | 'RPS_REMATCH' | 'ARRIVED' | 'ENDED'
  position: Point
  stats: GameStats
  /** 자리마다 사람/AI. 시간 안에 안 내면 AI로 바뀐다 */
  controllers: Record<Seat, SeatController>
  /** 다음 판부터 사람이 이어받을 자리 */
  returning: Seat[]
  /** 사람이 아무도 없어서 멈춘 상태 (누가 돌아오면 이어진다) */
  paused: boolean
  /** 가위바위보 중일 때 */
  rps: RpsPrompt | null
}

/** 게임 시작(또는 진행 중에 들어왔을 때) 한 번 받는 정보 */
export interface GameIntro {
  origin: LatLng
  /** 가장 가까운 길 위로 옮긴 목적지와 도착 반경 */
  destination: { point: Point; radiusM: number }
  /** 지나온 길 (시작할 때는 출발 지점 하나) */
  trail: Point[]
  /** 서버 시작 시각부터 지난 시간 (이 기기 시계로 옮겨 쓴다) */
  elapsedMs: number
}

export interface GameUpdate {
  /** 비어 있으면 상태(누가 냈는지, 자리 주인 등)만 바뀐 것 */
  events: GameEvent[]
  snapshot: GameSnapshot
}

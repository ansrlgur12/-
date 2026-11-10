import type { Direction, Seat } from '../types'

export const SEAT_DIRECTION: Record<Seat, Direction> = {
  A: 'left',
  B: 'straight',
  C: 'right',
}

/** 가위바위보 한 판의 선택 제한 시간 */
export const RPS_TIMEOUT_MS = 20_000

/** 목적지 도착 판정 반경 (기본값, 방 설정으로 조정 가능) */
export const ARRIVAL_RADIUS_M = 30

/**
 * 좌·직·우 분류 각도 (들어온 방향 대비 bearing 차이, 왼쪽이 음수).
 * 실제 동네 데이터로 테스트하며 조정한다.
 */
export interface TurnAngles {
  straightMaxDeg: number
  turnMaxDeg: number
  target: Record<Direction, number>
}

export const TURN_ANGLES: TurnAngles = {
  straightMaxDeg: 30,
  turnMaxDeg: 150,
  target: { left: -90, straight: 0, right: 90 },
}

/**
 * 진행 방향(bearing)을 잴 때 교차로에서 이만큼 떨어진 지점을 기준으로 삼는다.
 * 교차로 바로 옆의 짧은 꺾임 때문에 방향이 틀어지는 것을 막는다.
 */
export const BEARING_SAMPLE_M = 20

/** 출발지 주변 도로를 불러오는 반경 */
export const ROAD_AREA_RADIUS_M = {
  default: 600,
  max: 1500,
} as const

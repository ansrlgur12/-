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

/**
 * 지도 타일: 위도·경도 1/100도 격자 (서울 기준 약 0.9km × 1.1km).
 * 타일 안 좌표는 남서쪽 모서리 기준 1e-6도(약 0.1m) 단위 정수로 저장한다.
 */
export const TILES_PER_DEG = 100
export const TILE_COORD_SCALE = 1e6

/**
 * 게임 도로 그래프는 일행 주변 ROAD_GRAPH_RADIUS_M 만큼 타일을 읽어 만든다.
 * 일행 주변 ROAD_GRAPH_MARGIN_M 안에 아직 안 읽은 타일이 있으면 그 자리에서 다시 넓힌다.
 */
export const ROAD_GRAPH_RADIUS_M = 3000
export const ROAD_GRAPH_MARGIN_M = 1500

/**
 * 앱이 화면 중심 주변으로 불러 두는 지도(도로·건물·물) 반경. 멀리 축소하면 MAX까지 넓힌다.
 * 불러온 반경보다 MAP_UNLOAD_MARGIN_M 더 멀어진 타일은 메모리에서 내린다.
 */
export const MAP_LOAD_RADIUS_M = 1500
export const MAP_LOAD_RADIUS_MAX_M = 3000
export const MAP_UNLOAD_MARGIN_M = 1000
/** 건물까지 그리는 반경. 그 밖은 도로·물만 그려 멀리 축소해도 가볍게 */
export const MAP_DETAIL_RADIUS_M = 1300

/** 게임 화면에서 일행이 움직이는 속도. 서버도 이 값으로 연출 시간을 계산해 가위바위보 마감을 늦춘다 */
export const MOVE_SPEED_MPS = 40
/** 가위바위보 결과를 보여 주는 시간 */
export const RPS_RESULT_SHOW_MS = 1800

/** 출발지에서 목적지까지 직선 거리 제한. WARN을 넘으면 앱이 "도착이 매우 어렵다"고 경고한다 */
export const DESTINATION_MIN_M = 100
export const DESTINATION_WARN_M = 2000
export const DESTINATION_MAX_M = 10_000

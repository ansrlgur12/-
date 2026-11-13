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
/** 지도 타일 한 칸의 땅 높이 격자 한 변의 점 수 (가장자리 포함, 약 30m 간격) */
export const TERRAIN_GRID = 33

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
export const MAP_LOAD_RADIUS_MAX_M = 2200
export const MAP_UNLOAD_MARGIN_M = 600
/** 건물까지 그리는 반경. 그 밖은 도로·물만 그려 멀리 축소해도 가볍게 */
export const MAP_DETAIL_RADIUS_M = 1300
/**
 * 카메라가 이보다 멀면(축소하면) 건물을 새로 만들지 않는다. 축소한 채 지도를 끌 때
 * 지나가는 타일마다 건물을 짓느라 화면이 멈칫하지 않게 (이미 지은 건물은 그대로 둔다)
 */
export const MAP_DETAIL_MAX_CAMERA_DISTANCE_M = 1400
/**
 * 멀리 축소하면 MAP_LOAD_RADIUS_MAX_M 바깥은 땅 높이·물만 담은 가벼운 타일로 이 반경까지 채운다
 * (산·강은 멀리까지 보이고, 도로·건물은 가까운 곳만)
 */
export const MAP_FAR_RADIUS_MAX_M = 6000

/** 게임 화면에서 일행이 걷는 기본 속도. 서버도 같은 계산(moveDurationMs)으로 연출 시간을 재 가위바위보 마감을 늦춘다 */
export const MOVE_SPEED_MPS = 40
/**
 * 긴 길(대교 등)은 달린다: 한 번 움직일 때 처음 MOVE_CRUISE_M은 기본 속도로 걷고, 그다음 점점 빨라져 최대 MOVE_MAX_SPEED_MPS.
 * 끝(다음 교차로)까지 MOVE_CRUISE_M 남으면 다시 기본 속도로 줄어든다. 짧은 길(2 × MOVE_CRUISE_M 이하)은 그대로
 */
export const MOVE_CRUISE_M = 200
export const MOVE_MAX_SPEED_MPS = 400
/** 빨라지고 느려지는 정도 (m/s²) */
export const MOVE_ACCEL_MPS2 = 60

/** 한 번 움직이는 길(total m) 중 traveled m 지점의 속도 (m/s) */
export function moveSpeedAt(traveled: number, total: number): number {
  const ramp = (d: number) => (d <= MOVE_CRUISE_M ? MOVE_SPEED_MPS : Math.sqrt(MOVE_SPEED_MPS ** 2 + 2 * MOVE_ACCEL_MPS2 * (d - MOVE_CRUISE_M)))
  return Math.min(MOVE_MAX_SPEED_MPS, ramp(traveled), ramp(total - traveled))
}

/** total m를 움직이는 데 걸리는 시간 (ms). 앱의 걷는 연출과 같은 속도로 잰다 */
export function moveDurationMs(total: number): number {
  if (total <= 2 * MOVE_CRUISE_M) return (total / MOVE_SPEED_MPS) * 1000
  const steps = 400
  const h = total / steps
  let s = 0
  for (let i = 0; i < steps; i++) s += h / moveSpeedAt((i + 0.5) * h, total)
  return s * 1000
}
/** 결과 창에서 "가위! 바위! 보!"를 한 단어씩 외치는 시간. 그다음 낸 손을 공개한다 */
export const RPS_CHANT_MS = 1350
/** 가위바위보 결과를 보여 주는 시간 (외치기 + 공개) */
export const RPS_RESULT_SHOW_MS = RPS_CHANT_MS + 2600

/**
 * 출발지에서 목적지까지 직선 거리: 최소만 있고 최대는 없다 (걸어서 이어지기만 하면 된다).
 * WARN을 넘으면 앱이 "도착이 매우 어렵다"고 알려 준다
 */
export const DESTINATION_MIN_M = 100
export const DESTINATION_WARN_M = 2000

/**
 * 게임 길 그래프에서 이보다 가깝게(길을 따라) 붙어 있는 교차로들은 하나로 합친다.
 * 큰길(왕복 차로가 따로 그려짐)이 만나는 곳처럼 좁은 곳에 갈림길이 몰려 가위바위보가 연달아 나오지 않게
 */
export const JUNCTION_MERGE_M = 25
/** 합친 교차로 한 덩어리의 최대 크기 (골목이 촘촘한 동네가 통째로 한 점이 되지 않게) */
export const JUNCTION_CLUSTER_MAX_M = 40

/** 일반 모드에서 고를 수 있는 제한 */
export const NORMAL_TIME_LIMITS_MIN = [10, 20, 30]
export const NORMAL_RPS_LIMITS = [100, 200, 300]

/** 방에 접속한 사람이 아무도 없으면 이만큼 기다렸다가 방을 없앤다 (잠깐 끊긴 것은 봐준다) */
export const ROOM_EMPTY_GRACE_MS = 60_000

export * from './economy'

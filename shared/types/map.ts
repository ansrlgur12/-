import type { NodeId } from './road'

/*
 * 미리 만들어 둔 지도 타일 (server/data/tiles). 좌표는 모두 타일 남서쪽 모서리 기준
 * [경도 차, 위도 차] × TILE_COORD_SCALE 정수를 x, y 순서로 이어 붙인 평면 배열이다.
 */

/** 타일 하나의 보행 도로. 타일 경계를 넘는 구간은 양쪽 타일에 모두 들어 있다 */
export interface RoadTile {
  /** [id, x, y, id, x, y, ...] */
  nodes: number[]
  /** [nodeA, nodeB, highway 태그] */
  segments: Array<[NodeId, NodeId, string]>
  /** 본토와 걸어서 이어지지 않는 노드 (다리 없는 섬, 제주도 등). 출발지·목적지로 못 쓴다 */
  off?: NodeId[]
}

/**
 * 지도를 보여 주고 다닐 수 있는 구역 (대한민국 영역, 0.01도 타일 단위).
 * rows: [행, 시작 열, 끝 열, 시작 열, 끝 열, ...] (끝 열 포함)
 */
export interface MapRegion {
  /** 줄마다 [행, 시작 열, 끝 열, 시작 열, 끝 열, ...] */
  rows: number[][]
  /**
   * 칸 전체가 바다인 타일 (rows와 같은 형식). 타일을 받기 전에도 멀리 보이는 바다를 미리 칠해 둔다.
   * 예전 타일이면 없다
   */
  sea?: number[][]
}

/** 타일 하나의 풍경 */
export interface SceneryTile {
  /** [높이(m), 외곽선] */
  buildings: Array<[number, number[]]>
  /**
   * [물 id, [바깥 고리, ...구멍(섬)]]. 호수·강처럼 여러 타일에 걸친 물은 걸치는 타일마다 통째로 들어 있으니
   * id로 중복을 거른다 (way는 양수, relation은 음수 id)
   */
  water: Array<[number, number[][]]>
  /** 면이 없는 하천: [폭(m), 선] */
  waterways: Array<[number, number[]]>
  /**
   * 바다 (OSM 해안선을 타일로 자른 면): [바깥 고리, ...구멍(섬)] 목록. 좌표는 water와 같다.
   * 1이면 칸 전체가 바다, 없으면 바다 없음
   */
  sea?: number[][][] | 1
  /** 모래사장 (natural=beach): water와 같은 형식 [id, [바깥 고리, ...구멍]] */
  beaches?: Array<[number, number[][]]>
}

/** 타일 한 칸의 땅 높이. 남쪽 줄부터 줄마다 서→동, n×n 점 (가장자리는 이웃 타일과 같은 값) */
export interface TerrainTile {
  n: number
  /** 해발 높이 × 10 (0.1m 단위 정수). 바다는 0 */
  heights: number[]
}

/**
 * 출발지·목적지로 고른 곳 확인 (GET /map/snap). road가 없으면 reason:
 * abroad = 대한민국 밖, island = 걸어서 못 가는 곳(다리 없는 섬 등), none = 300m 안에 걸을 수 있는 길이 없음
 */
export interface RoadCheck {
  road: RoadSnap | null
  reason?: 'abroad' | 'island' | 'none'
}

/** 고른 지점에서 가장 가까운 (본토와 이어진) 길 위의 지점 */
export interface RoadSnap {
  lat: number
  lng: number
  /** 고른 지점에서 그 길까지 직선 거리 (m) */
  distanceM: number
}

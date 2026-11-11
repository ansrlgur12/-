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
}

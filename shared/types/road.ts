import type { Direction } from './game'

/** 출발지 기준 로컬 좌표 (미터). x = 동쪽, y = 북쪽 */
export interface Vec2 {
  x: number
  y: number
}

export type NodeId = number

export interface RoadOption {
  direction: Direction
  /** 이 방향으로 나갈 때 처음 지나는 이웃 노드 */
  via: NodeId
  /** 들어온 방향 대비 회전 각도 (왼쪽 음수) */
  angleDeg: number
}

export interface RoadArrival {
  nodeId: NodeId
  kind: 'intersection' | 'deadEnd'
  /** 이 노드에 들어오기 직전 노드 (유턴할 때 via로 사용) */
  incomingFrom: NodeId
  options: RoadOption[]
}

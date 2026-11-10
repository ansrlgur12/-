import type { Direction, LatLng } from './game'

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

export interface RoadAreaResponse {
  areaId: string
  origin: LatLng
  /** [id, x, y] */
  nodes: Array<[NodeId, number, number]>
  /** [nodeA, nodeB, highway 태그] */
  segments: Array<[NodeId, NodeId, string]>
  start: {
    nodeId: NodeId
    /** 출발 지점에서는 들어온 방향이 없으므로 모든 이웃을 나침반 방향과 함께 준다 */
    choices: Array<{ via: NodeId; bearingDeg: number }>
  }
}

export interface RoadStepResponse {
  /** from부터 도착 노드까지 지나는 노드 */
  path: NodeId[]
  arrival: RoadArrival
}

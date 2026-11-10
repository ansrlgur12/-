import { create } from 'zustand'
import type { Direction, NodeId, RoadArrival, Vec2 } from '@jikjwau/shared/types'
import { createRoadArea, stepRoad } from '../api/road'

/**
 * Phase 1 길 판정 검증용 상태.
 * 서버가 판정한 선택지를 그대로 보여주고, 고른 길을 따라 이동만 한다.
 */

export interface RoadArea {
  areaId: string
  positions: Map<NodeId, Vec2>
  segments: Array<[NodeId, NodeId, string]>
}

export interface Choice {
  via: NodeId
  label: string
  /** 교차로 선택지일 때만 있음 */
  direction?: Direction
  angleDeg?: number
  kind: 'start' | 'turn' | 'uturn'
}

interface RoadExplorerState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  area?: RoadArea
  /** 일행이 서 있는 노드 */
  nodeId?: NodeId
  arrivalKind?: RoadArrival['kind'] | 'start'
  choices: Choice[]
  /** 이동 애니메이션 중인 경로. 끝나면 finishMove()로 도착 처리 */
  movePath: NodeId[] | null
  pendingArrival: RoadArrival | null
  stepCount: number
  load: (lat: number, lng: number) => Promise<void>
  choose: (via: NodeId) => Promise<void>
  finishMove: () => void
}

const DIRECTION_LABEL: Record<Direction, string> = {
  left: '좌회전 (A)',
  straight: '직진 (B)',
  right: '우회전 (C)',
}

const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']

function compassLabel(bearingDeg: number) {
  return COMPASS[Math.round(bearingDeg / 45) % 8]
}

function choicesFor(arrival: RoadArrival): Choice[] {
  if (arrival.kind === 'deadEnd') {
    return [{ via: arrival.incomingFrom, label: '유턴', kind: 'uturn' }]
  }
  return arrival.options.map((o) => ({
    via: o.via,
    label: DIRECTION_LABEL[o.direction],
    direction: o.direction,
    angleDeg: o.angleDeg,
    kind: 'turn',
  }))
}

export const useRoadExplorer = create<RoadExplorerState>((set, get) => ({
  status: 'idle',
  choices: [],
  movePath: null,
  pendingArrival: null,
  stepCount: 0,

  async load(lat, lng) {
    set({ status: 'loading', error: undefined })
    try {
      const res = await createRoadArea(lat, lng)
      set({
        status: 'ready',
        area: {
          areaId: res.areaId,
          positions: new Map(res.nodes.map(([id, x, y]) => [id, { x, y }])),
          segments: res.segments,
        },
        nodeId: res.start.nodeId,
        arrivalKind: 'start',
        choices: res.start.choices.map((c) => ({
          via: c.via,
          label: `${compassLabel(c.bearingDeg)}쪽으로 출발`,
          kind: 'start',
        })),
        movePath: null,
        pendingArrival: null,
        stepCount: 0,
      })
    } catch (err) {
      set({ status: 'error', error: (err as Error).message })
    }
  },

  async choose(via) {
    const { area, nodeId, movePath } = get()
    if (!area || nodeId === undefined || movePath) return
    set({ choices: [] })
    try {
      const res = await stepRoad(area.areaId, nodeId, via)
      set({ movePath: res.path, pendingArrival: res.arrival })
    } catch (err) {
      set({ status: 'error', error: (err as Error).message })
    }
  },

  finishMove() {
    const { pendingArrival, stepCount } = get()
    if (!pendingArrival) return
    set({
      nodeId: pendingArrival.nodeId,
      arrivalKind: pendingArrival.kind,
      choices: choicesFor(pendingArrival),
      movePath: null,
      pendingArrival: null,
      stepCount: stepCount + 1,
    })
  },
}))

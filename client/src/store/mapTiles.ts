import { create } from 'zustand'
import type { LatLng, NodeId, Vec2 } from '@jikjwau/shared/types'
import { MAP_DETAIL_RADIUS_M, MAP_UNLOAD_MARGIN_M } from '@jikjwau/shared/config'
import { parseTileKey, project, tileCorner, tileFlatToLocal, tilesAround, unproject } from '@jikjwau/shared/geo'
import { fetchRoadTile, fetchSceneryTile } from '../api/map'

/**
 * 화면 중심 주변의 지도 타일(도로·건물·물)을 받아 두고, 멀리 벗어난 타일은 내린다.
 * 좌표는 받자마자 게임 지역 origin 기준 미터로 바꿔 둔다.
 */

export interface MapTile {
  key: string
  roads: { positions: Map<NodeId, Vec2>; segments: Array<[NodeId, NodeId, string]> } | null
  /** [높이(m), 외곽선] */
  buildings: Array<[number, number[]]>
  /** [물 id, [바깥 고리, ...구멍]] — 여러 타일에 같은 물이 있을 수 있다 */
  water: Array<[number, number[][]]>
  /** [폭(m), 선] */
  waterways: Array<[number, number[]]>
}

interface MapTilesState {
  origin?: LatLng
  tiles: Map<string, MapTile>
  /** 건물까지 그리는 타일 (화면 중심 가까이). 나머지는 도로·물만 */
  detail: Set<string>
  reset: (origin: LatLng) => void
  /** point(origin 기준 미터) 주변 radiusM 타일을 받고, 먼 타일은 내린다 */
  focus: (point: Vec2, radiusM: number) => void
}

const MAX_PARALLEL = 4
/**
 * 받은 타일은 이 간격으로 하나씩 화면에 넣는다.
 * 타일마다 메시를 만드는 일이 한 프레임에 몰려 화면이 멈칫하지 않게 나눈다.
 */
const COMMIT_INTERVAL_MS = 40

/** reset 할 때마다 바뀌어서, 이전 지역의 늦게 도착한 타일을 버리게 한다 */
let generation = 0
let queue: string[] = []
const inFlight = new Set<string>()
/** 받았지만 아직 화면에 넣지 않은 타일 */
let arrived: MapTile[] = []
let commitTimer: ReturnType<typeof setTimeout> | null = null
/** 마지막 focus 지점 (어떤 타일을 먼저 넣고, 건물을 그릴지 정한다) */
let lastPoint: Vec2 = { x: 0, y: 0 }

function tileDistance(key: string, origin: LatLng, point: Vec2) {
  const [row, col] = parseTileKey(key)
  const c = project(tileCorner(row + 0.5, col + 0.5), origin)
  return Math.hypot(c.x - point.x, c.y - point.y)
}

async function loadTile(key: string, origin: LatLng): Promise<MapTile> {
  const [row, col] = parseTileKey(key)
  const local = (flat: number[]) => tileFlatToLocal(flat, row, col, origin)
  const [roads, scenery] = await Promise.all([fetchRoadTile(key), fetchSceneryTile(key)])

  let roadPart: MapTile['roads'] = null
  if (roads) {
    const xy: number[] = []
    for (let k = 0; k < roads.nodes.length; k += 3) xy.push(roads.nodes[k + 1], roads.nodes[k + 2])
    const converted = local(xy)
    const positions = new Map<NodeId, Vec2>()
    for (let k = 0, j = 0; k < roads.nodes.length; k += 3, j += 2) {
      positions.set(roads.nodes[k], { x: converted[j], y: converted[j + 1] })
    }
    roadPart = { positions, segments: roads.segments }
  }
  return {
    key,
    roads: roadPart,
    buildings: scenery?.buildings.map(([h, flat]) => [h, local(flat)]) ?? [],
    water: scenery?.water.map(([id, rings]) => [id, rings.map(local)]) ?? [],
    waterways: scenery?.waterways.map(([w, flat]) => [w, local(flat)]) ?? [],
  }
}

export const useMapTiles = create<MapTilesState>((set, get) => {
  const commitNext = () => {
    commitTimer = null
    const { origin } = get()
    if (!origin || arrived.length === 0) return
    // 화면 중심에 가까운 것부터
    let best = 0
    for (let i = 1; i < arrived.length; i++) {
      if (tileDistance(arrived[i].key, origin, lastPoint) < tileDistance(arrived[best].key, origin, lastPoint)) best = i
    }
    const [tile] = arrived.splice(best, 1)
    set((s) => ({ tiles: new Map(s.tiles).set(tile.key, tile) }))
    if (arrived.length > 0) commitTimer = setTimeout(commitNext, COMMIT_INTERVAL_MS)
  }

  const pump = () => {
    const { origin } = get()
    while (origin && inFlight.size < MAX_PARALLEL && queue.length > 0) {
      const key = queue.shift()!
      const gen = generation
      inFlight.add(key)
      loadTile(key, origin)
        .then((tile) => {
          if (gen !== generation) return
          arrived.push(tile)
          if (!commitTimer) commitTimer = setTimeout(commitNext, 0)
        })
        // 실패한 타일은 다음 focus 때 다시 시도한다
        .catch(() => undefined)
        .finally(() => {
          inFlight.delete(key)
          if (gen === generation) pump()
        })
    }
  }

  return {
    tiles: new Map(),
    detail: new Set(),

    reset(origin) {
      generation++
      queue = []
      inFlight.clear()
      arrived = []
      if (commitTimer) clearTimeout(commitTimer)
      commitTimer = null
      set({ origin, tiles: new Map(), detail: new Set() })
    },

    focus(point, radiusM) {
      const { origin, tiles, detail } = get()
      if (!origin) return
      lastPoint = point

      // 가까운 타일부터 받는다
      const pendingKeys = new Set(arrived.map((t) => t.key))
      queue = tilesAround(unproject(point, origin), radiusM).filter((k) => !tiles.has(k) && !inFlight.has(k) && !pendingKeys.has(k))

      const far = new Set([...tiles.keys()].filter((key) => tileDistance(key, origin, point) > radiusM + MAP_UNLOAD_MARGIN_M))
      arrived = arrived.filter((t) => tileDistance(t.key, origin, point) <= radiusM + MAP_UNLOAD_MARGIN_M)

      // 건물은 화면 중심 가까운 타일만 그린다
      const nextDetail = new Set(tilesAround(unproject(point, origin), MAP_DETAIL_RADIUS_M))
      const detailChanged = nextDetail.size !== detail.size || [...nextDetail].some((k) => !detail.has(k))

      if (far.size > 0 || detailChanged) {
        const next = far.size > 0 ? new Map([...tiles].filter(([key]) => !far.has(key))) : tiles
        set({ tiles: next, detail: detailChanged ? nextDetail : detail })
      }
      pump()
    },
  }
})

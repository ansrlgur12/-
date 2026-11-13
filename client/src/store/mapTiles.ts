import { create } from 'zustand'
import type { LatLng, NodeId, Vec2 } from '@jikjwau/shared/types'
import { MAP_DETAIL_RADIUS_M, MAP_UNLOAD_MARGIN_M, TERRAIN_GRID, TILE_COORD_SCALE, TILES_PER_DEG } from '@jikjwau/shared/config'
import { parseTileKey, project, tileCorner, tileFlatToLocal, tilesAround, unproject } from '@jikjwau/shared/geo'
import { fetchRoadTile, fetchSceneryTile, fetchTerrainTile } from '../api/map'
import { dropTerrain, putBeaches, putTerrain, putWater, seaWaterId, setSeaLevel, setTerrainOrigin } from '../map/terrain'
import { inRegionKey, isAllSeaKey } from '../map/region'

/**
 * 화면 중심 주변의 지도 타일(도로·건물·물)을 받아 두고, 멀리 벗어난 타일은 내린다.
 * 좌표는 받자마자 게임 지역 origin 기준 미터로 바꿔 둔다.
 */

export interface MapTile {
  key: string
  /** 땅·물만 담은 먼 타일 (도로·건물 없음, 땅도 성기게 그린다) */
  lite: boolean
  roads: { positions: Map<NodeId, Vec2>; segments: Array<[NodeId, NodeId, string]> } | null
  /** [높이(m), 외곽선] */
  buildings: Array<[number, number[]]>
  /** [물 id, [바깥 고리, ...구멍]] — 여러 타일에 같은 물이 있을 수 있다 */
  water: Array<[number, number[][]]>
  /** 모래사장 [id, 고리들] 로컬 좌표 */
  beaches: Array<[number, number[][]]>
  /** [폭(m), 선] */
  waterways: Array<[number, number[]]>
}

interface MapTilesState {
  origin?: LatLng
  tiles: Map<string, MapTile>
  /** 건물까지 그리는 타일 (화면 중심 가까이). 나머지는 도로·물만 */
  detail: Set<string>
  reset: (origin: LatLng) => void
  /**
   * point(origin 기준 미터) 주변 radiusM 타일을 받고, 먼 타일은 내린다.
   * growDetail이 false면(멀리 축소) 건물을 그릴 타일을 늘리지 않는다.
   * farRadiusM까지는 땅·물만 담은 가벼운 타일로 채운다
   */
  focus: (point: Vec2, radiusM: number, growDetail?: boolean, farRadiusM?: number) => void
}

const MAX_PARALLEL = 6
/**
 * 받은 타일은 이 간격으로 하나씩 화면에 넣는다.
 * 타일마다 메시를 만드는 일이 한 프레임에 몰려 화면이 멈칫하지 않게 나눈다.
 */
const COMMIT_INTERVAL_MS = 40

/** reset 할 때마다 바뀌어서, 이전 지역의 늦게 도착한 타일을 버리게 한다 */
let generation = 0
/** [타일 키, 가벼운 타일인지] 받을 차례 */
let queue: Array<[string, boolean]> = []
const inFlight = new Set<string>()
/** 받았지만 아직 화면에 넣지 않은 타일 */
let arrived: MapTile[] = []
let commitTimer: ReturnType<typeof setTimeout> | null = null
/** 마지막 focus 지점 (어떤 타일을 먼저 넣고, 건물을 그릴지 정한다) */
let lastPoint: Vec2 = { x: 0, y: 0 }
/** 건물을 그리기로 했지만 아직 안 넣은 타일. 한 번에 하나씩 넣는다 (건물 짓기가 한 프레임에 몰리지 않게) */
let detailQueue: string[] = []

function tileDistance(key: string, origin: LatLng, point: Vec2) {
  const [row, col] = parseTileKey(key)
  const c = project(tileCorner(row + 0.5, col + 0.5), origin)
  return Math.hypot(c.x - point.x, c.y - point.y)
}

/** 타일 한 칸의 길이 (타일 안 좌표 단위) */
const TILE_UNITS = TILE_COORD_SCALE / TILES_PER_DEG

async function loadTile(key: string, origin: LatLng, lite: boolean): Promise<MapTile> {
  const [row, col] = parseTileKey(key)
  const local = (flat: number[]) => tileFlatToLocal(flat, row, col, origin)
  // 칸 전체가 바다면 땅 높이는 받지 않고 해수면으로 (서버가 고도 자료를 새로 받느라 느린 경우가 많다)
  const allSea = isAllSeaKey(key)
  const [roads, scenery, terrain] = await Promise.all([
    lite ? null : fetchRoadTile(key),
    fetchSceneryTile(key),
    allSea ? { n: TERRAIN_GRID, heights: new Array<number>(TERRAIN_GRID * TERRAIN_GRID).fill(0) } : fetchTerrainTile(key),
  ])
  // 메시를 만들 때 높이를 찾으므로 화면에 넣기 전에 둔다
  putTerrain(key, terrain.n, terrain.heights)

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
  const water: MapTile['water'] = scenery?.water.map(([id, rings]) => [id, rings.map(local)]) ?? []
  // 바다도 강·호수와 같은 물 면으로 (수면은 해수면). 1이면 칸 전체
  const sea = scenery?.sea
  const seaPolys = sea === 1 ? [[[0, 0, TILE_UNITS, 0, TILE_UNITS, TILE_UNITS, 0, TILE_UNITS]]] : (sea ?? [])
  seaPolys.forEach((rings, k) => {
    const id = seaWaterId(row, col, k)
    setSeaLevel(id)
    water.push([id, rings.map(local)])
  })
  // 물 칸과 수면 높이도 화면에 넣기 전에 (다리·물 밑 땅 높이에 쓴다)
  putWater(key, water)
  // 모래사장: 물가 땅을 낮춘 다음에 모래 높이로 평평하게
  const beaches: MapTile['beaches'] = scenery?.beaches?.map(([id, rings]) => [id, rings.map(local)]) ?? []
  putBeaches(key, beaches)
  return {
    key,
    lite,
    roads: roadPart,
    buildings: lite ? [] : (scenery?.buildings.map(([h, flat]) => [h, local(flat)]) ?? []),
    water,
    beaches,
    waterways: scenery?.waterways.map(([w, flat]) => [w, local(flat)]) ?? [],
  }
}

/**
 * 아직 화면에 다 못 넣은 지도 일: 받을 차례·받는 중·받았지만 안 넣은 타일, 건물을 그릴 차례인 타일.
 * 지도 로딩 화면이 0이 될 때까지 기다린다
 */
export function mapPendingCount() {
  const { tiles } = useMapTiles.getState()
  // 건물 차례 중 아직 안 받은(또는 영역 밖이라 영영 안 올) 타일은 세지 않는다
  const details = detailQueue.filter((k) => tiles.get(k)?.lite === false).length
  return queue.length + inFlight.size + arrived.length + details
}

export const useMapTiles = create<MapTilesState>((set, get) => {
  const commitNext = () => {
    commitTimer = null
    const { origin, tiles, detail } = get()
    if (!origin) return
    // 받은 타일이 먼저, 다 넣었으면 건물 그릴 타일을 하나 늘린다
    if (arrived.length === 0) {
      const full = (k: string) => tiles.get(k)?.lite === false
      const i = detailQueue.findIndex(full)
      if (i < 0) return
      const [key] = detailQueue.splice(i, 1)
      set({ detail: new Set(detail).add(key) })
      if (detailQueue.some(full)) commitTimer = setTimeout(commitNext, COMMIT_INTERVAL_MS)
      return
    }
    // 화면 중심에 가까운 것부터
    let best = 0
    for (let i = 1; i < arrived.length; i++) {
      if (tileDistance(arrived[i].key, origin, lastPoint) < tileDistance(arrived[best].key, origin, lastPoint)) best = i
    }
    const [tile] = arrived.splice(best, 1)
    set((s) => ({ tiles: new Map(s.tiles).set(tile.key, tile) }))
    if (arrived.length > 0 || detailQueue.length > 0) commitTimer = setTimeout(commitNext, COMMIT_INTERVAL_MS)
  }

  const pump = () => {
    const { origin } = get()
    while (origin && inFlight.size < MAX_PARALLEL && queue.length > 0) {
      const [key, lite] = queue.shift()!
      const gen = generation
      inFlight.add(key)
      loadTile(key, origin, lite)
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
      detailQueue = []
      if (commitTimer) clearTimeout(commitTimer)
      commitTimer = null
      setTerrainOrigin(origin)
      set({ origin, tiles: new Map(), detail: new Set() })
    },

    focus(point, radiusM, growDetail = true, farRadiusM = 0) {
      const { origin, tiles, detail } = get()
      if (!origin) return
      lastPoint = point
      const center = unproject(point, origin)
      const outer = Math.max(radiusM, farRadiusM)

      // 가까운 타일(도로·건물까지)부터, 그다음 먼 가벼운 타일. 가벼운 타일이 가까워지면 다시 받는다
      const pending = new Map(arrived.map((t) => [t.key, t.lite]))
      // 대한민국 밖 타일은 받지 않는다
      const nearKeys = tilesAround(center, radiusM).filter(inRegionKey)
      const nearSet = new Set(nearKeys)
      const want = (k: string, lite: boolean) => {
        if (inFlight.has(k)) return false
        const have = tiles.get(k)?.lite ?? pending.get(k)
        return have === undefined || (have && !lite)
      }
      queue = [
        ...nearKeys.filter((k) => want(k, false)).map((k): [string, boolean] => [k, false]),
        // 먼 곳의 칸 전체 바다는 받지 않는다 (먼 바다 칠하기 FarSea가 그린다)
        ...(farRadiusM > radiusM ? tilesAround(center, farRadiusM) : [])
          .filter((k) => !nearSet.has(k) && inRegionKey(k) && !isAllSeaKey(k) && want(k, true))
          .map((k): [string, boolean] => [k, true]),
      ]

      // 가까운 타일은 radiusM, 가벼운 타일은 outer 밖으로 벗어나면 내린다
      const keep = (key: string, lite: boolean) => tileDistance(key, origin, point) <= (lite ? outer : radiusM) + MAP_UNLOAD_MARGIN_M
      const far = new Set([...tiles].filter(([key, t]) => !keep(key, t.lite)).map(([key]) => key))
      arrived = arrived.filter((t) => keep(t.key, t.lite))

      // 건물은 화면 중심 가까운 타일만 그린다. 빠지는 타일은 바로, 새로 드는 타일은 가까운 것부터 하나씩
      const wanted = tilesAround(unproject(point, origin), MAP_DETAIL_RADIUS_M)
      const wantedSet = new Set(wanted)
      const kept = new Set([...detail].filter((k) => (growDetail ? wantedSet.has(k) : !far.has(k))))
      detailQueue = growDetail ? wanted.filter((k) => !kept.has(k)) : []
      const detailChanged = kept.size !== detail.size

      if (far.size > 0 || detailChanged) {
        const next = far.size > 0 ? new Map([...tiles].filter(([key]) => !far.has(key))) : tiles
        for (const key of far) dropTerrain(key)
        set({ tiles: next, detail: detailChanged ? kept : detail })
      }
      if (detailQueue.length > 0 && !commitTimer) commitTimer = setTimeout(commitNext, COMMIT_INTERVAL_MS)
      pump()
    },
  }
})

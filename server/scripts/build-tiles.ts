/**
 * 대한민국 OSM 원본(.osm.pbf)을 지도 타일로 미리 쪼개 둔다. 한 번 만들어 두면 서버는 파일만 읽는다.
 *
 *   npm run osm:download -w server   # 원본 받기 (약 300MB)
 *   npm run osm:tiles -w server      # 타일 만들기 (몇 분)
 *
 * 결과: data/tiles-<만든 시각>/<행>/<열>.roads.json.gz, <열>.scenery.json.gz  (형식은 shared/types/map.ts)
 *       data/tiles-<만든 시각>/region.json — 대한민국 영역 (MapRegion). 이 밖은 그리지도, 가지도 않는다
 *
 * 대한민국 국경(OSM 관계, 영해 포함) 밖의 길·건물·물은 버린다 (원본에 섞인 북한 접경 등).
 * 걸을 수 있는 길을 이어진 묶음으로 나눠 가장 큰 묶음(본토)만 놀이 구역으로 친다.
 * 다리 없는 섬, 제주도, 울릉도, 독도처럼 걸어서 못 가는 곳의 노드는 타일의 off에 적는다.
 *       data/tiles.json — 서버가 읽을 폴더를 가리킨다. 다 만든 뒤에 바꾸므로 서버를 켠 채로 다시 만들어도 된다.
 *       (Windows에서는 다른 프로그램이 들여다보는 폴더를 rename할 수 없어서, 바꿔치기 대신 가리키는 파일을 쓴다)
 *
 * 노드가 4천만 개 가까이 되므로 좌표·참조는 typed array에 담고,
 * 결과는 위도 띠 단위로 나눠 쓰고 비운다 (메모리 1GB 안팎).
 * 원본은 node → way → relation 순서이고 노드 id가 오름차순이라는 점을 이용해 세 번 읽는다.
 *   1) relation: 물 멀티폴리곤, 대한민국 국경이 쓰는 way id
 *   2) way: 필요한 way와 그 노드 참조
 *   3) node: 필요한 노드 좌표
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { createOSMStream } from 'osm-pbf-parser-node'
import type { MapRegion, RoadTile, SceneryTile } from '@jikjwau/shared/types'
import { Coast, seaPolygons, type SeaPolygon } from '../src/features/map/coast'
import { buildingHeight, isBuilding } from '../src/features/map/buildings'
import { assembleMultipolygon, contains, isWaterArea, WATERWAY_WIDTH } from '../src/features/map/water'
import { isWalkable } from '../src/features/road/graph'

const DATA_DIR = path.resolve(import.meta.dirname, '../data')
const PBF = process.argv[2] ?? path.join(DATA_DIR, 'south-korea-latest.osm.pbf')
const OUT_NAME = `tiles-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}`
const OUT = path.join(DATA_DIR, OUT_NAME)

/** 좌표는 1e-7도 정수. 타일 한 칸 = 1e-2도 = 1e5, 타일 안 좌표 단위 1e-6도 = 10 */
const E7_PER_TILE = 100_000
const E7_PER_TILE_UNIT = 10
const BAND_ROWS = 10
const MISSING = -2147483648

const t0 = Date.now()
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${msg}`)

/** 늘어나는 typed array */
class Grow<T extends Float64Array | Uint32Array | Int32Array | Float32Array | Uint8Array> {
  n = 0
  constructor(
    public a: T,
    private readonly make: (size: number) => T,
  ) {}
  push(v: number) {
    if (this.n === this.a.length) {
      const next = this.make(this.a.length * 2)
      next.set(this.a)
      this.a = next
    }
    this.a[this.n++] = v
  }
  view(): T {
    return this.a.subarray(0, this.n) as T
  }
}
const f64 = () => new Grow(new Float64Array(1 << 20), (n) => new Float64Array(n))
const u32 = () => new Grow(new Uint32Array(1 << 20), (n) => new Uint32Array(n))
const f32 = () => new Grow(new Float32Array(1 << 20), (n) => new Float32Array(n))
const u8 = () => new Grow(new Uint8Array(1 << 20), (n) => new Uint8Array(n))

type Item =
  | { type: 'node'; id: number; lat: number; lon: number }
  | { type: 'way'; id: number; refs: number[]; tags?: Record<string, string> }
  | { type: 'relation'; id: number; members: Array<{ type: string; ref: number; role: string }>; tags?: Record<string, string> }

function stream(withTags: { node?: boolean | string[]; way?: boolean | string[]; relation?: boolean | string[] }) {
  return createOSMStream(PBF, { withTags, withInfo: false }) as AsyncGenerator<Item>
}

// ── 1) relation ────────────────────────────────────────────────
interface WaterRelation {
  id: number
  outer: number[]
  inner: number[]
}
const waterRelations: WaterRelation[] = []
/** 모래사장 멀티폴리곤 (natural=beach) */
const beachRelations: WaterRelation[] = []
const memberWayIds = new Set<number>()
/** 대한민국 국경 관계(ISO3166-1=KR)의 바깥·안쪽 선 way */
const border = { outer: [] as number[], inner: [] as number[] }
for await (const it of stream({ node: false, way: false, relation: ['type', 'natural', 'waterway', 'landuse', 'boundary', 'admin_level', 'ISO3166-1'] })) {
  if (it.type !== 'relation') continue
  if (it.tags?.['ISO3166-1'] === 'KR' && it.tags.admin_level === '2') {
    for (const m of it.members) {
      if (m.type !== 'way' || (m.role !== 'outer' && m.role !== 'inner')) continue
      ;(m.role === 'inner' ? border.inner : border.outer).push(m.ref)
      memberWayIds.add(m.ref)
    }
    continue
  }
  const beach = it.tags?.natural === 'beach'
  if (it.tags?.type !== 'multipolygon' || !(beach || isWaterArea(it.tags))) continue
  const rel: WaterRelation = { id: it.id, outer: [], inner: [] }
  for (const m of it.members) {
    if (m.type !== 'way') continue
    ;(m.role === 'inner' ? rel.inner : rel.outer).push(m.ref)
    memberWayIds.add(m.ref)
  }
  ;(beach ? beachRelations : waterRelations).push(rel)
}
log(`relation: 물 멀티폴리곤 ${waterRelations.length}개, 국경 선 ${border.outer.length + border.inner.length}개, 조각 way ${memberWayIds.size}개`)
if (border.outer.length === 0) throw new Error('원본에 대한민국 국경(ISO3166-1=KR) 관계가 없습니다')

// ── 2) way ─────────────────────────────────────────────────────
const enum Kind {
  Road = 1,
  Building = 2,
  WaterArea = 3,
  Waterway = 4,
  MemberOnly = 5,
  Coast = 6,
  Beach = 7,
}
const WAY_TAGS = ['highway', 'foot', 'footway', 'access', 'area', 'building', 'building:levels', 'height', 'natural', 'waterway', 'landuse', 'tunnel']
const highwayNames: string[] = []
const highwayIndex = new Map<string, number>()

const refs = f64()
const wayStart = u32()
const wayLen = u32()
const wayKind = u8()
const wayValue = f32()
const wayId = f64()
const memberWayIndex = new Map<number, number>()

for await (const it of stream({ node: false, way: WAY_TAGS, relation: false })) {
  if (it.type === 'relation') break
  if (it.type !== 'way') continue
  const tags = it.tags ?? {}
  const closed = it.refs.length >= 4 && it.refs[0] === it.refs[it.refs.length - 1]
  let kind: Kind | 0 = 0
  let value = 0
  if (isWalkable(tags)) {
    kind = Kind.Road
    if (!highwayIndex.has(tags.highway)) {
      highwayIndex.set(tags.highway, highwayNames.length)
      highwayNames.push(tags.highway)
    }
    value = highwayIndex.get(tags.highway)!
  } else if (tags.natural === 'coastline') {
    kind = Kind.Coast
  } else if (closed && tags.natural === 'beach') {
    kind = Kind.Beach
  } else if (closed && isBuilding(tags)) {
    kind = Kind.Building
    value = buildingHeight(tags)
  } else if (closed && isWaterArea(tags)) {
    kind = Kind.WaterArea
  } else if (tags.waterway && WATERWAY_WIDTH[tags.waterway] && !tags.tunnel) {
    kind = Kind.Waterway
    value = WATERWAY_WIDTH[tags.waterway]
  }
  const isMember = memberWayIds.has(it.id)
  if (!kind && !isMember) continue
  if (isMember) memberWayIndex.set(it.id, wayKind.n)
  wayStart.push(refs.n)
  wayLen.push(it.refs.length)
  wayKind.push(kind || Kind.MemberOnly)
  wayValue.push(value)
  wayId.push(it.id)
  for (const r of it.refs) refs.push(r)
}
const wayCount = wayKind.n
log(`way: ${wayCount}개 사용, 노드 참조 ${refs.n}개`)

// 필요한 노드 id (정렬·중복 제거)
const needIds = (() => {
  const sorted = refs.view().slice().sort()
  let n = 0
  for (let i = 0; i < sorted.length; i++) if (i === 0 || sorted[i] !== sorted[i - 1]) sorted[n++] = sorted[i]
  return sorted.slice(0, n)
})()
log(`필요한 노드 ${needIds.length}개`)

// ── 3) node ────────────────────────────────────────────────────
const latE7 = new Int32Array(needIds.length).fill(MISSING)
const lngE7 = new Int32Array(needIds.length).fill(MISSING)
{
  let p = 0
  for await (const it of stream({ node: false, way: false, relation: false })) {
    if (it.type === 'way' || it.type === 'relation') break
    if (it.type !== 'node') continue
    while (p < needIds.length && needIds[p] < it.id) p++
    if (p < needIds.length && needIds[p] === it.id) {
      latE7[p] = Math.round(it.lat * 1e7)
      lngE7[p] = Math.round(it.lon * 1e7)
    }
  }
}
log('node: 좌표 채움')

// 참조 → 노드 배열 위치
const refIdx = new Uint32Array(refs.n)
{
  const all = refs.view()
  for (let i = 0; i < all.length; i++) {
    let lo = 0
    let hi = needIds.length - 1
    const id = all[i]
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (needIds[mid] < id) lo = mid + 1
      else hi = mid
    }
    refIdx[i] = lo
  }
}
refs.a = new Float64Array(0)

const rowOf = (k: number) => Math.floor(latE7[k] / E7_PER_TILE)
const colOf = (k: number) => Math.floor(lngE7[k] / E7_PER_TILE)
const hasCoord = (k: number) => latE7[k] !== MISSING

// way마다 걸치는 행 범위 (띠 나누기용)
const wayMinRow = new Int32Array(wayCount)
const wayMaxRow = new Int32Array(wayCount)
let globalMinRow = Infinity
let globalMaxRow = -Infinity
for (let w = 0; w < wayCount; w++) {
  let lo = Infinity
  let hi = -Infinity
  for (let i = wayStart.a[w]; i < wayStart.a[w] + wayLen.a[w]; i++) {
    const k = refIdx[i]
    if (!hasCoord(k)) continue
    const r = rowOf(k)
    if (r < lo) lo = r
    if (r > hi) hi = r
  }
  wayMinRow[w] = lo === Infinity ? 1 : lo
  wayMaxRow[w] = hi === -Infinity ? 0 : hi
  if (wayKind.a[w] !== Kind.MemberOnly && lo <= hi) {
    globalMinRow = Math.min(globalMinRow, lo)
    globalMaxRow = Math.max(globalMaxRow, hi)
  }
}

// 물 멀티폴리곤 조립 (좌표는 1e-7도 정수, x = 경도)
interface E7Point {
  x: number
  y: number
}
interface WaterPolygon {
  id: number
  rings: E7Point[][]
  /** 이 물이 걸치는 타일 [행, 열] */
  tiles: Array<[number, number]>
}
const wayPoints = (w: number): E7Point[] | null => {
  const pts: E7Point[] = []
  for (let i = wayStart.a[w]; i < wayStart.a[w] + wayLen.a[w]; i++) {
    const k = refIdx[i]
    if (!hasCoord(k)) return null
    pts.push({ x: lngE7[k], y: latE7[k] })
  }
  return pts
}
/** 내부 타일까지 검사할 최대 bbox 크기 (그보다 큰 물은 경계가 지나는 타일에만 넣는다) */
const MAX_INTERIOR_TEST_TILES = 2500
/**
 * 물이 걸치는 타일: 바깥 고리가 지나가는 타일 + 중심이 물 안에 있는 타일.
 * (bbox 전체에 넣으면 한강처럼 대각선으로 긴 물이 수천 타일에 복사된다)
 */
const tilesOf = (outer: E7Point[]): Array<[number, number]> => {
  const set = new Set<string>()
  const add = (x: number, y: number) => set.add(`${Math.floor(y / E7_PER_TILE)}_${Math.floor(x / E7_PER_TILE)}`)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]
    const b = outer[(i + 1) % outer.length]
    const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / (E7_PER_TILE / 4)) + 1
    for (let s = 0; s <= steps; s++) add(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps)
    minX = Math.min(minX, a.x)
    maxX = Math.max(maxX, a.x)
    minY = Math.min(minY, a.y)
    maxY = Math.max(maxY, a.y)
  }
  const [r0, r1, c0, c1] = [minY, maxY, minX, maxX].map((v) => Math.floor(v / E7_PER_TILE))
  if ((r1 - r0 + 1) * (c1 - c0 + 1) <= MAX_INTERIOR_TEST_TILES) {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const center = { x: (c + 0.5) * E7_PER_TILE, y: (r + 0.5) * E7_PER_TILE }
        if (contains(outer, center)) add(center.x, center.y)
      }
    }
  }
  return [...set].map((k) => k.split('_').map(Number) as [number, number])
}
const withTiles = (id: number, rings: E7Point[][]): WaterPolygon => ({ id, rings, tiles: tilesOf(rings[0]) })
/** 관계 멤버 way id들 → 선 조각 */
const lines = (ids: number[]) =>
  ids.flatMap((id) => {
    const w = memberWayIndex.get(id)
    const pts = w === undefined ? null : wayPoints(w)
    return pts ? [pts] : []
  })
const waterPolygons: WaterPolygon[] = []
for (const rel of waterRelations) {
  assembleMultipolygon(lines(rel.outer), lines(rel.inner)).forEach((rings, i) => {
    // relation은 음수 id. 바깥 고리가 여러 개면 고리마다 따로 id를 준다
    waterPolygons.push(withTiles(-(rel.id * 100 + i), rings))
  })
}
for (let w = 0; w < wayCount; w++) {
  if (wayKind.a[w] !== Kind.WaterArea) continue
  const pts = wayPoints(w)
  if (pts) waterPolygons.push(withTiles(wayId.a[w], [pts.slice(0, -1)]))
}
log(`물 면 ${waterPolygons.length}개 조립, 타일 배정 ${waterPolygons.reduce((n, p) => n + p.tiles.length, 0)}건`)

// 모래사장: 물 면과 같은 방식 (id 규칙도 같다)
const beachPolygons: WaterPolygon[] = []
for (const rel of beachRelations) {
  assembleMultipolygon(lines(rel.outer), lines(rel.inner)).forEach((rings, i) => beachPolygons.push(withTiles(-(rel.id * 100 + i), rings)))
}
for (let w = 0; w < wayCount; w++) {
  if (wayKind.a[w] !== Kind.Beach) continue
  const pts = wayPoints(w)
  if (pts) beachPolygons.push(withTiles(wayId.a[w], [pts.slice(0, -1)]))
}
log(`모래사장 ${beachPolygons.length}개`)

// ── 대한민국 영역 ───────────────────────────────────────────────
// 국경 고리의 변을 위도 행마다 나눠 두고(점 안팎 판정을 빠르게), 국경이 지나는 타일을 표시한다
const borderPolys = assembleMultipolygon(lines(border.outer), lines(border.inner))
if (borderPolys.length === 0) throw new Error('대한민국 국경 고리를 만들지 못했습니다 (원본에 국경 선이 빠져 있음)')
const borderEdges = new Map<number, number[]>()
const borderTiles = new Set<string>()
let regionMinRow = Infinity
let regionMaxRow = -Infinity
let regionMinCol = Infinity
let regionMaxCol = -Infinity
let borderVertices = 0
for (const rings of borderPolys) {
  for (const ring of rings) {
    borderVertices += ring.length
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const r0 = Math.floor(Math.min(a.y, b.y) / E7_PER_TILE)
      const r1 = Math.floor(Math.max(a.y, b.y) / E7_PER_TILE)
      for (let r = r0; r <= r1; r++) {
        let edges = borderEdges.get(r)
        if (!edges) borderEdges.set(r, (edges = []))
        edges.push(a.x, a.y, b.x, b.y)
      }
      const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / (E7_PER_TILE / 8)) + 1
      for (let s = 0; s <= steps; s++) {
        const x = a.x + ((b.x - a.x) * s) / steps
        const y = a.y + ((b.y - a.y) * s) / steps
        borderTiles.add(`${Math.floor(y / E7_PER_TILE)}_${Math.floor(x / E7_PER_TILE)}`)
      }
      regionMinRow = Math.min(regionMinRow, r0)
      regionMaxRow = Math.max(regionMaxRow, r1)
      regionMinCol = Math.min(regionMinCol, Math.floor(Math.min(a.x, b.x) / E7_PER_TILE))
      regionMaxCol = Math.max(regionMaxCol, Math.floor(Math.max(a.x, b.x) / E7_PER_TILE))
    }
  }
}
/** 점이 국경 안인지 (고리 전체 짝홀 규칙: 구멍도 함께 처리된다) */
const insideBorder = (x: number, y: number) => {
  const edges = borderEdges.get(Math.floor(y / E7_PER_TILE))
  if (!edges) return false
  let inside = false
  for (let i = 0; i < edges.length; i += 4) {
    const ax = edges[i]
    const ay = edges[i + 1]
    const bx = edges[i + 2]
    const by = edges[i + 3]
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}
/** 타일이 영역에 드는지: 국경이 지나면 걸친 것으로, 아니면 가운데 점으로 */
const regionTileCache = new Map<string, boolean>()
const inRegionTile = (row: number, col: number) => {
  const key = `${row}_${col}`
  let v = regionTileCache.get(key)
  if (v === undefined) {
    v = borderTiles.has(key) || insideBorder((col + 0.5) * E7_PER_TILE, (row + 0.5) * E7_PER_TILE)
    regionTileCache.set(key, v)
  }
  return v
}
/** 점이 국경 안인지. 국경이 지나는 타일만 정확히 따진다 */
const insidePoint = (x: number, y: number) => {
  const row = Math.floor(y / E7_PER_TILE)
  const col = Math.floor(x / E7_PER_TILE)
  return borderTiles.has(`${row}_${col}`) ? insideBorder(x, y) : inRegionTile(row, col)
}
const nodeInsideCache = new Int8Array(needIds.length)
const nodeInside = (k: number) => {
  if (nodeInsideCache[k] === 0) nodeInsideCache[k] = hasCoord(k) && insidePoint(lngE7[k], latE7[k]) ? 1 : 2
  return nodeInsideCache[k] === 1
}
const regionRows: number[][] = []
for (let r = regionMinRow; r <= regionMaxRow; r++) {
  const row = [r]
  let runStart: number | null = null
  for (let c = regionMinCol; c <= regionMaxCol + 1; c++) {
    const inside = c <= regionMaxCol && inRegionTile(r, c)
    if (inside && runStart === null) runStart = c
    if (!inside && runStart !== null) {
      row.push(runStart, c - 1)
      runStart = null
    }
  }
  if (row.length > 1) regionRows.push(row)
}
log(`국경: 면 ${borderPolys.length}개, 점 ${borderVertices}개, 영역 타일 ${regionTileCache.size}개 검사`)

// ── 걸어서 이어진 길 묶음 ──────────────────────────────────────
// 국경 안의 걸을 수 있는 길로 노드를 묶고(union-find), 가장 큰 묶음을 본토로 본다
const parent = new Int32Array(needIds.length)
for (let i = 0; i < parent.length; i++) parent[i] = i
const find = (k: number) => {
  while (parent[k] !== k) {
    parent[k] = parent[parent[k]]
    k = parent[k]
  }
  return k
}
const isRoadNode = new Uint8Array(needIds.length)
for (let w = 0; w < wayCount; w++) {
  if (wayKind.a[w] !== Kind.Road) continue
  for (let i = wayStart.a[w] + 1; i < wayStart.a[w] + wayLen.a[w]; i++) {
    const a = refIdx[i - 1]
    const c = refIdx[i]
    if (!nodeInside(a) || !nodeInside(c)) continue
    isRoadNode[a] = 1
    isRoadNode[c] = 1
    const ra = find(a)
    const rc = find(c)
    if (ra !== rc) parent[ra] = rc
  }
}
const groupSize = new Int32Array(needIds.length)
let mainland = -1
let roadNodeCount = 0
for (let k = 0; k < needIds.length; k++) {
  if (!isRoadNode[k]) continue
  roadNodeCount++
  const r = find(k)
  groupSize[r]++
  if (mainland < 0 || groupSize[r] > groupSize[mainland]) mainland = r
}
const onMainland = (k: number) => find(k) === mainland
log(`길 노드 ${roadNodeCount}개 중 본토 ${groupSize[mainland]}개 (나머지는 섬이거나 끊긴 길)`)

// ── 바다 ────────────────────────────────────────────────────────
// 해안선(왼쪽이 땅)으로 영역 안 타일마다 바다 면을 만든다 (강·호수처럼 그린다).
// 해안선이 지나는 타일은 해안선을 잘라 면으로, 안 지나는 타일은 이어진 묶음마다 한 점으로 판정한다
const seaByTile = new Map<string, SeaPolygon[] | 1>()
{
  const segA: number[] = []
  const segB: number[] = []
  for (let w = 0; w < wayCount; w++) {
    if (wayKind.a[w] !== Kind.Coast) continue
    for (let i = wayStart.a[w] + 1; i < wayStart.a[w] + wayLen.a[w]; i++) {
      const a = refIdx[i - 1]
      const b = refIdx[i]
      if (!hasCoord(a) || !hasCoord(b) || a === b) continue
      segA.push(a)
      segB.push(b)
    }
  }
  const coast = new Coast(lngE7, latE7, segA, segB, E7_PER_TILE)
  log(`해안선 조각 ${coast.segmentCount}개`)

  const regionTiles: Array<[number, number]> = []
  for (const [r, ...runs] of regionRows) for (let i = 0; i < runs.length; i += 2) for (let c = runs[i]; c <= runs[i + 1]; c++) regionTiles.push([r, c])
  const inRegion = new Set(regionTiles.map(([r, c]) => `${r}_${c}`))

  let coastal = 0
  for (const [r, c] of regionTiles) {
    if (!coast.hasCoast(r, c)) continue
    coastal++
    const polys = seaPolygons(coast, r, c, E7_PER_TILE)
    if (polys) seaByTile.set(`${r}_${c}`, polys)
  }
  log(`해안 타일 ${coastal}개 바다 면 만듦`)

  // 해안선이 안 지나는 타일은 이어진 묶음 전체가 같은 쪽이다. 해안 타일 옆 칸 하나로 판정한다
  const seen = new Set<string>()
  let seaTiles = 0
  for (const [r0, c0] of regionTiles) {
    const k0 = `${r0}_${c0}`
    if (seen.has(k0) || coast.hasCoast(r0, c0)) continue
    const group: string[] = []
    let probe: [number, number] | null = null
    const stack: Array<[number, number]> = [[r0, c0]]
    seen.add(k0)
    while (stack.length > 0) {
      const [r, c] = stack.pop()!
      group.push(`${r}_${c}`)
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr
        const nc = c + dc
        const nk = `${nr}_${nc}`
        if (coast.hasCoast(nr, nc)) {
          probe ??= [r, c]
          continue
        }
        if (seen.has(nk) || !inRegion.has(nk)) continue
        seen.add(nk)
        stack.push([nr, nc])
      }
    }
    const sea = probe ? coast.isSea((probe[1] + 0.5) * E7_PER_TILE, (probe[0] + 0.5) * E7_PER_TILE) === true : false
    if (sea) {
      for (const k of group) seaByTile.set(k, 1)
      seaTiles += group.length
    }
  }
  log(`바다 타일: 해안 ${[...seaByTile.values()].filter((v) => v !== 1).length}개 + 전부 바다 ${seaTiles}개`)
}

// ── 띠 단위로 타일 쓰기 ─────────────────────────────────────────
interface Bucket {
  row: number
  col: number
  nodeSeen: Set<number>
  roads: RoadTile & { off: number[] }
  scenery: SceneryTile
}

let roadFiles = 0
let sceneryFiles = 0
let bytes = 0

for (let bandStart = globalMinRow; bandStart <= globalMaxRow; bandStart += BAND_ROWS) {
  const bandEnd = bandStart + BAND_ROWS - 1
  const buckets = new Map<string, Bucket>()
  const bucket = (row: number, col: number) => {
    const key = `${row}_${col}`
    let b = buckets.get(key)
    if (!b) {
      b = { row, col, nodeSeen: new Set(), roads: { nodes: [], segments: [], off: [] }, scenery: { buildings: [], water: [], waterways: [] } }
      buckets.set(key, b)
    }
    return b
  }
  const inBand = (row: number) => row >= bandStart && row <= bandEnd
  // 타일 모서리 기준 1e-6도 정수 (x, y)
  const pushLocal = (out: number[], b: Bucket, xE7: number, yE7: number) => {
    out.push(Math.round((xE7 - b.col * E7_PER_TILE) / E7_PER_TILE_UNIT), Math.round((yE7 - b.row * E7_PER_TILE) / E7_PER_TILE_UNIT))
  }
  const addRoadNode = (b: Bucket, k: number) => {
    const id = needIds[k]
    if (b.nodeSeen.has(id)) return
    b.nodeSeen.add(id)
    b.roads.nodes.push(id)
    pushLocal(b.roads.nodes, b, lngE7[k], latE7[k])
    if (!onMainland(k)) b.roads.off.push(id)
  }

  for (let w = 0; w < wayCount; w++) {
    if (wayMaxRow[w] < bandStart || wayMinRow[w] > bandEnd) continue
    const kind = wayKind.a[w]
    const start = wayStart.a[w]
    const end = start + wayLen.a[w]

    if (kind === Kind.Road) {
      const highway = highwayNames[wayValue.a[w]]
      for (let i = start + 1; i < end; i++) {
        const a = refIdx[i - 1]
        const c = refIdx[i]
        if (!nodeInside(a) || !nodeInside(c)) continue
        const ra = rowOf(a)
        const ca = colOf(a)
        const rc = rowOf(c)
        const cc = colOf(c)
        for (const [row, col] of ra === rc && ca === cc ? [[ra, ca]] : [[ra, ca], [rc, cc]]) {
          if (!inBand(row)) continue
          const b = bucket(row, col)
          addRoadNode(b, a)
          addRoadNode(b, c)
          b.roads.segments.push([needIds[a], needIds[c], highway])
        }
      }
    } else if (kind === Kind.Building) {
      // 마지막 점 = 첫 점은 빼고, 무게중심이 있는 타일에 넣는다
      let sx = 0
      let sy = 0
      let ok = true
      for (let i = start; i < end - 1; i++) {
        const k = refIdx[i]
        if (!hasCoord(k)) ok = false
        sx += lngE7[k]
        sy += latE7[k]
      }
      if (!ok) continue
      const n = end - 1 - start
      const row = Math.floor(sy / n / E7_PER_TILE)
      if (!inBand(row) || !insidePoint(sx / n, sy / n)) continue
      const b = bucket(row, Math.floor(sx / n / E7_PER_TILE))
      const flat: number[] = []
      for (let i = start; i < end - 1; i++) pushLocal(flat, b, lngE7[refIdx[i]], latE7[refIdx[i]])
      b.scenery.buildings.push([Math.round(wayValue.a[w] * 10) / 10, flat])
    } else if (kind === Kind.Waterway) {
      // 구간 중점이 있는 타일별로 이어지는 조각을 만든다
      const width = wayValue.a[w]
      let run: number[] | null = null
      let runKey = ''
      for (let i = start + 1; i < end; i++) {
        const a = refIdx[i - 1]
        const c = refIdx[i]
        if (!hasCoord(a) || !hasCoord(c)) {
          run = null
          continue
        }
        const row = Math.floor((latE7[a] + latE7[c]) / 2 / E7_PER_TILE)
        const col = Math.floor((lngE7[a] + lngE7[c]) / 2 / E7_PER_TILE)
        if (!inBand(row) || !inRegionTile(row, col)) {
          run = null
          continue
        }
        const b = bucket(row, col)
        const key = `${row}_${col}`
        if (!run || runKey !== key) {
          run = []
          runKey = key
          pushLocal(run, b, lngE7[a], latE7[a])
          b.scenery.waterways.push([width, run])
        }
        pushLocal(run, b, lngE7[c], latE7[c])
      }
    }
  }

  for (const poly of waterPolygons) {
    for (const [row, col] of poly.tiles) {
      if (!inBand(row) || !inRegionTile(row, col)) continue
      const b = bucket(row, col)
      b.scenery.water.push([
        poly.id,
        poly.rings.map((ring) => {
          const flat: number[] = []
          for (const p of ring) pushLocal(flat, b, p.x, p.y)
          return flat
        }),
      ])
    }
  }

  for (const poly of beachPolygons) {
    for (const [row, col] of poly.tiles) {
      if (!inBand(row) || !inRegionTile(row, col)) continue
      const b = bucket(row, col)
      ;(b.scenery.beaches ??= []).push([
        poly.id,
        poly.rings.map((ring) => {
          const flat: number[] = []
          for (const p of ring) pushLocal(flat, b, p.x, p.y)
          return flat
        }),
      ])
    }
  }

  // 바다가 있는 타일 (건물·길이 없어도 바다만으로 풍경 타일을 쓴다)
  for (const [key, sea] of seaByTile) {
    const [row, col] = key.split('_').map(Number)
    if (!inBand(row)) continue
    const b = bucket(row, col)
    b.scenery.sea =
      sea === 1
        ? 1
        : sea.map((rings) =>
            rings.map((ring) => {
              const flat: number[] = []
              for (const [x, y] of ring) pushLocal(flat, b, x, y)
              return flat
            }),
          )
  }

  for (const b of buckets.values()) {
    const dir = path.join(OUT, String(b.row))
    await mkdir(dir, { recursive: true })
    if (b.roads.segments.length > 0) {
      const { off, ...rest } = b.roads
      const gz = gzipSync(JSON.stringify(off.length > 0 ? b.roads : rest))
      await writeFile(path.join(dir, `${b.col}.roads.json.gz`), gz)
      roadFiles++
      bytes += gz.length
    }
    const s = b.scenery
    if (s.buildings.length + s.water.length + s.waterways.length > 0 || s.sea || s.beaches) {
      const gz = gzipSync(JSON.stringify(s))
      await writeFile(path.join(dir, `${b.col}.scenery.json.gz`), gz)
      sceneryFiles++
      bytes += gz.length
    }
  }
  log(`위도 ${(bandStart / 100).toFixed(1)}~${((bandEnd + 1) / 100).toFixed(1)}: 타일 ${buckets.size}개`)
}

await mkdir(OUT, { recursive: true })
// 칸 전체가 바다인 타일을 줄마다 이어진 범위로 (앱이 타일을 받기 전에 먼 바다를 미리 칠한다)
const seaRowsMap = new Map<number, number[]>()
for (const [key, sea] of seaByTile) {
  if (sea !== 1) continue
  const [row, col] = key.split('_').map(Number)
  let cols = seaRowsMap.get(row)
  if (!cols) seaRowsMap.set(row, (cols = []))
  cols.push(col)
}
const seaRows: number[][] = []
for (const [row, cols] of [...seaRowsMap].sort((a, b) => a[0] - b[0])) {
  cols.sort((a, b) => a - b)
  const line = [row]
  for (let i = 0; i < cols.length; i++) {
    if (i === 0 || cols[i] !== cols[i - 1] + 1) line.push(cols[i], cols[i])
    else line[line.length - 1] = cols[i]
  }
  seaRows.push(line)
}
await writeFile(path.join(OUT, 'region.json'), JSON.stringify({ rows: regionRows, sea: seaRows } satisfies MapRegion))
await writeFile(
  path.join(DATA_DIR, 'tiles.json'),
  JSON.stringify({ dir: OUT_NAME, source: path.basename(PBF), builtAt: new Date().toISOString(), roadFiles, sceneryFiles }, null, 2),
)
// 이전에 만든 타일 폴더 정리. 다른 프로그램이 쓰는 중이면 남겨 두고 알려만 준다
for (const name of await readdir(DATA_DIR)) {
  if (!name.startsWith('tiles') || name === OUT_NAME || name === 'tiles.json') continue
  // 이름이 만든 시각이라, 이번보다 나중에 시작한 폴더(동시에 돌고 있는 다른 빌드)는 건드리지 않는다
  if (name > OUT_NAME) continue
  try {
    await rm(path.join(DATA_DIR, name), { recursive: true, force: true })
  } catch (err) {
    log(`이전 타일 폴더 ${name}을(를) 지우지 못했습니다 (${(err as Error).message}). 나중에 직접 지워도 됩니다.`)
  }
}
log(`완료: 도로 타일 ${roadFiles}개, 풍경 타일 ${sceneryFiles}개, ${(bytes / 1e6).toFixed(0)}MB → ${OUT}`)

import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three'
import type { LatLng } from '@jikjwau/shared/types'
import { project } from '@jikjwau/shared/geo'
import { useMapTiles } from '../store/mapTiles'
import { nightMaterials } from './daylight'
import { terrainHeightAt } from './terrain'
import { LANDMARKS, type TowerStyle } from './landmarks'

const PALETTE = ['#f3e9dc', '#e9dccb', '#dfe6ea', '#efe1df', '#e3ecdf', '#ece6d6']
const WALL_SHADE = 0.82
/** 비탈에 선 건물도 땅에 떠 보이지 않게 벽을 땅속까지 내린다 */
const SINK_M = 3

/** 이보다 높으면 유리 외벽 고층 건물로 그린다 */
const TOWER_MIN_M = 50
/** 고층 건물 기본 유리색들 [유리, 띠] */
const TOWER_PALETTE: Array<[string, string]> = [
  ['#5f8db5', '#3f617f'],
  ['#6aa5a8', '#467a7c'],
  ['#93a5b7', '#66788c'],
  ['#56697e', '#36475a'],
  ['#a3bccf', '#71899c'],
]
/** 유리는 위로 갈수록 하늘을 비춰 밝아진다 */
const GLASS_SKY = new Color('#e3eff8')
/** 한 층 띠 높이 (최대 띠 수를 넘으면 더 두껍게) */
const TOWER_FLOOR_M = 4
const TOWER_MAX_BANDS = 60
/** 이보다 높은 건물은 꼭대기에 안테나와 빨간 항공등 */
const ANTENNA_MIN_M = 150
const BEACON_MIN_M = 100

// 밤에 켜지는 창문
const FLOOR_M = 3
const WINDOW_W = 1.4
const WINDOW_H = 1.5
const WINDOW_GAP_M = 5
/** 켜져 있는 창문 비율 */
const LIT_RATIO = 0.15
/** 고층 건물은 한 층 전체가 켜진다. 켜진 층 비율 */
const TOWER_LIT_RATIO = 0.2
/** 벽에서 살짝 띄운다 (벽과 겹쳐 깜빡이지 않게) */
const WINDOW_OFFSET = 0.08
/** 타일 하나에 최대 창문 수 */
const MAX_WINDOWS = 3000
const WINDOW_COLORS = ['#ffd27a', '#ffe7a8', '#fff3d1', '#ffc56b'].map((c) => new Color(c))
const OFFICE_COLORS = ['#eaf2ff', '#fff6dc', '#dfeaff'].map((c) => new Color(c))

/** 같은 건물은 늘 같은 모양이 되게 하는 가벼운 해시 (0~1) */
function hash(a: number, b: number, c: number, d: number) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + d * 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 외곽선을 반시계 방향 점 목록으로 */
function outline(flat: number[]): Vector2[] | null {
  const pts: Vector2[] = []
  for (let k = 0; k + 1 < flat.length; k += 2) pts.push(new Vector2(flat[k], flat[k + 1]))
  if (pts.length < 3) return null
  // 반시계 방향으로 맞춰야 지붕은 위, 벽은 바깥을 향한다
  if (ShapeUtils.isClockWise(pts)) pts.reverse()
  return pts
}

function centroid(pts: Vector2[]) {
  const c = new Vector2()
  for (const p of pts) c.add(p)
  return c.divideScalar(pts.length)
}

/** 점이 외곽선 안에 있는지 */
function contains(pts: Vector2[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

class GeometryBuilder {
  positions: number[] = []
  normals: number[] = []
  colors: number[] = []

  push(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Color) {
    this.positions.push(x, y, z)
    this.normals.push(nx, ny, nz)
    this.colors.push(c.r, c.g, c.b)
  }

  /** 외곽선을 중심 기준 scale배 한 지붕 */
  roof(pts: Vector2[], y: number, c: Color, center = centroid(pts), scale = 1) {
    const at = (p: Vector2) => [center.x + (p.x - center.x) * scale, -(center.y + (p.y - center.y) * scale)]
    for (const tri of ShapeUtils.triangulateShape(pts, [])) {
      for (const idx of tri) {
        const [x, z] = at(pts[idx])
        this.push(x, y, z, 0, 1, 0, c)
      }
    }
  }

  /** y0~y1 사이 벽 한 바퀴. 위아래 외곽선을 중심 기준 s0, s1배로 줄일 수 있다 (가늘어지는 탑) */
  walls(pts: Vector2[], y0: number, y1: number, c: Color, center = centroid(pts), s0 = 1, s1 = 1) {
    const at = (p: Vector2, s: number) => [center.x + (p.x - center.x) * s, -(center.y + (p.y - center.y) * s)]
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j]
      const b = pts[(j + 1) % pts.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len === 0) continue
      // 반시계 외곽선에서 바깥쪽 법선은 진행 방향의 오른쪽
      const nx = (b.y - a.y) / len
      const nz = (b.x - a.x) / len
      const [ax0, az0] = at(a, s0)
      const [bx0, bz0] = at(b, s0)
      const [ax1, az1] = at(a, s1)
      const [bx1, bz1] = at(b, s1)
      this.push(ax0, y0, az0, nx, 0, nz, c)
      this.push(bx0, y0, bz0, nx, 0, nz, c)
      this.push(bx1, y1, bz1, nx, 0, nz, c)
      this.push(ax0, y0, az0, nx, 0, nz, c)
      this.push(bx1, y1, bz1, nx, 0, nz, c)
      this.push(ax1, y1, az1, nx, 0, nz, c)
    }
  }

  build(): BufferGeometry | null {
    if (this.positions.length === 0) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3))
    return geometry
  }
}

/** [높이, 외곽선, 번호, 바닥 해발] */
type Low = [number, Vector2[], number, number]

interface Tower {
  pts: Vector2[]
  center: Vector2
  height: number
  /** 바닥 해발 */
  base: number
  style: Required<TowerStyle>
  seed: number
}

/** 높이 t(0~1)에서 외곽선 크기. 위로 갈수록 부드럽게 가늘어진다 */
const taper = (style: Required<TowerStyle>, t: number) => 1 - (1 - style.topScale) * t ** 1.4

/** 일반 건물과 고층 건물(랜드마크 포함)을 나눈다 */
function classify(buildings: Array<[number, number[]]>, origin: LatLng | undefined, tileKey: string) {
  const landmarks = origin ? LANDMARKS.map((l) => ({ ...l, at: project(l.latLng, origin) })) : []
  const low: Low[] = []
  const towers: Tower[] = []
  buildings.forEach(([height, flat], i) => {
    const pts = outline(flat)
    if (!pts) return
    const landmark = landmarks.find((l) => contains(pts, l.at.x, l.at.y))
    const h = landmark?.height ?? height
    // 바닥은 외곽선 꼭짓점 중 가장 낮은 땅
    let base = Infinity
    for (const p of pts) base = Math.min(base, terrainHeightAt(p.x, p.y, tileKey))
    if (!landmark && h < TOWER_MIN_M) return low.push([h, pts, i, base])
    const [glass, band] = TOWER_PALETTE[i % TOWER_PALETTE.length]
    const style = { glass, band, roof: '#cbd5e1', topScale: 1, spire: 0, ...landmark?.style }
    towers.push({ pts, center: centroid(pts), height: h, base, style, seed: i })
  })
  return { low, towers }
}

/** 일반 건물: 지붕은 외곽선을 삼각분할하고, 벽은 변마다 사각형을 세운다 */
function buildLow(low: Low[], out: GeometryBuilder) {
  const roof = new Color()
  const wall = new Color()
  for (const [height, pts, i, base] of low) {
    roof.set(PALETTE[i % PALETTE.length])
    wall.copy(roof).multiplyScalar(WALL_SHADE)
    out.roof(pts, base + height, roof)
    out.walls(pts, base - SINK_M, base + height, wall)
  }
}

/** 고층 건물: 층마다 유리와 띠를 번갈아 쌓고, 꼭대기에 옥탑·안테나를 올린다. 항공등 자리를 돌려준다 */
function buildTowers(towers: Tower[], out: GeometryBuilder): number[] {
  const beacons: number[] = []
  const glass = new Color()
  const band = new Color()
  const c = new Color()
  for (const { pts, center, height, base, style } of towers) {
    glass.set(style.glass)
    band.set(style.band)
    const bands = Math.max(1, Math.min(TOWER_MAX_BANDS, Math.round(height / TOWER_FLOOR_M)))
    const step = height / bands
    for (let k = 0; k < bands; k++) {
      const y0 = k * step
      const ySplit = y0 + step * 0.78
      const y1 = y0 + step
      const s0 = taper(style, y0 / height)
      const sSplit = taper(style, ySplit / height)
      const s1 = taper(style, y1 / height)
      out.walls(pts, base + y0 - (k === 0 ? SINK_M : 0), base + ySplit, c.copy(glass).lerp(GLASS_SKY, (y0 / height) * 0.4), center, s0, sSplit)
      out.walls(pts, base + ySplit, base + y1, band, center, sSplit, s1)
    }
    const top = taper(style, 1)
    const roofY = base + height
    out.roof(pts, roofY, c.set(style.band), center, top)
    // 옥탑: 조금 안쪽으로 들인 상자
    const crownH = Math.max(3, height * 0.025)
    c.set(style.roof)
    out.walls(pts, roofY, roofY + crownH, c, center, top * 0.8, top * 0.8)
    out.roof(pts, roofY + crownH, c, center, top * 0.8)
    let peak = roofY + crownH
    if (style.spire > 0) {
      // 외곽선을 한 점으로 모아 뾰족하게
      out.walls(pts, peak, peak + style.spire, c, center, top * 0.8, 0.01)
      peak += style.spire
    } else if (height >= ANTENNA_MIN_M) {
      const antenna = height * 0.08
      const r = 0.7
      const square = [new Vector2(-r, -r), new Vector2(r, -r), new Vector2(r, r), new Vector2(-r, r)].map((p) => p.add(center))
      out.walls(square, peak, peak + antenna, c.set('#94a3b8'), center)
      peak += antenna
    }
    if (height >= BEACON_MIN_M) beacons.push(center.x, peak + 0.6, -center.y)
  }
  return beacons
}

/** 밤에 켜지는 창문. 일반 건물은 창문 몇 개씩, 고층 건물은 몇 층씩 통째로 */
function buildWindows(low: Low[], towers: Tower[]): BufferGeometry | null {
  const positions: number[] = []
  const colors: number[] = []
  let count = 0

  const quad = (ax: number, ay: number, bx: number, by: number, y0: number, y1: number, ux: number, uy: number, color: Color) => {
    // 바깥(진행 방향 오른쪽)으로 조금 띄운다
    const ox = uy * WINDOW_OFFSET
    const oy = -ux * WINDOW_OFFSET
    const x0 = ax + ox
    const z0 = -(ay + oy)
    const x1 = bx + ox
    const z1 = -(by + oy)
    positions.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0)
    for (let v = 0; v < 6; v++) colors.push(color.r, color.g, color.b)
  }

  for (const [height, pts, i, base] of low) {
    const floors = Math.floor(height / FLOOR_M)
    for (let j = 0; j < pts.length && floors > 0; j++) {
      const a = pts[j]
      const b = pts[(j + 1) % pts.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      const cols = Math.floor(len / WINDOW_GAP_M)
      if (cols < 1) continue
      const ux = (b.x - a.x) / len
      const uy = (b.y - a.y) / len
      for (let f = 0; f < floors; f++) {
        const y0 = base + f * FLOOR_M + (FLOOR_M - WINDOW_H) / 2 + 0.2
        for (let c = 0; c < cols; c++) {
          const r = hash(i, j, f, c)
          if (r > LIT_RATIO) continue
          if (count++ >= MAX_WINDOWS) return finish()
          const mid = (c + 0.5) * (len / cols)
          const s0 = mid - WINDOW_W / 2
          const s1 = mid + WINDOW_W / 2
          const color = WINDOW_COLORS[Math.floor((r / LIT_RATIO) * WINDOW_COLORS.length) % WINDOW_COLORS.length]
          quad(a.x + ux * s0, a.y + uy * s0, a.x + ux * s1, a.y + uy * s1, y0, y0 + WINDOW_H, ux, uy, color)
        }
      }
    }
  }

  for (const { pts, center, height, base, style, seed } of towers) {
    const floors = Math.floor(height / TOWER_FLOOR_M)
    for (let f = 1; f < floors; f++) {
      const r = hash(seed, f, 7, 3)
      if (r > TOWER_LIT_RATIO) continue
      const y = f * TOWER_FLOOR_M + 0.8
      const y0 = base + y
      const s = taper(style, y / height)
      const color = OFFICE_COLORS[Math.floor((r / TOWER_LIT_RATIO) * OFFICE_COLORS.length) % OFFICE_COLORS.length]
      for (let j = 0; j < pts.length; j++) {
        const a = pts[j]
        const b = pts[(j + 1) % pts.length]
        const len = Math.hypot(b.x - a.x, b.y - a.y)
        if (len === 0) continue
        if (count++ >= MAX_WINDOWS) return finish()
        const ax = center.x + (a.x - center.x) * s
        const ay = center.y + (a.y - center.y) * s
        const bx = center.x + (b.x - center.x) * s
        const by = center.y + (b.y - center.y) * s
        quad(ax, ay, bx, by, y0, y0 + 1.6, (b.x - a.x) / len, (b.y - a.y) / len, color)
      }
    }
  }
  return finish()

  function finish() {
    if (positions.length === 0) return null
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
    return geometry
  }
}

/** 항공등: 작은 상자 */
function buildBeacons(points: number[]): BufferGeometry | null {
  if (points.length === 0) return null
  const out = new GeometryBuilder()
  const red = new Color('#ff3b3b')
  const r = 0.9
  for (let i = 0; i < points.length; i += 3) {
    const [x, y, z] = [points[i], points[i + 1], -points[i + 2]]
    const square = [new Vector2(x - r, z - r), new Vector2(x + r, z - r), new Vector2(x + r, z + r), new Vector2(x - r, z + r)]
    out.walls(square, y - r, y + r, red)
    out.roof(square, y + r, red)
  }
  return out.build()
}

/**
 * 타일 하나의 건물을 합친다 (드로우콜을 줄이려고).
 * 일반 건물·고층 건물 몸체 / 밤 창문 / 항공등 세 덩어리.
 */
export function BuildingMesh({ buildings, tileKey }: { buildings: Array<[number, number[]]>; tileKey: string }) {
  const origin = useMapTiles((s) => s.origin)
  const { body, windows, beacons } = useMemo(() => {
    const { low, towers } = classify(buildings, origin, tileKey)
    const out = new GeometryBuilder()
    buildLow(low, out)
    const beaconPoints = buildTowers(towers, out)
    return { body: out.build(), windows: buildWindows(low, towers), beacons: buildBeacons(beaconPoints) }
  }, [buildings, origin, tileKey])
  useEffect(
    () => () => {
      body?.dispose()
      windows?.dispose()
      beacons?.dispose()
    },
    [body, windows, beacons],
  )

  return (
    <>
      {body && (
        <mesh geometry={body}>
          <meshLambertMaterial vertexColors />
        </mesh>
      )}
      {/* 재질은 모든 타일이 같이 쓴다. 낮에는 DayNight가 숨긴다 */}
      {windows && <mesh geometry={windows} material={nightMaterials.window} />}
      {beacons && <mesh geometry={beacons} material={nightMaterials.beacon} />}
    </>
  )
}

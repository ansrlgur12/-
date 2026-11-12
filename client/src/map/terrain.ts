import type { LatLng } from '@jikjwau/shared/types'
import { TILES_PER_DEG } from '@jikjwau/shared/config'
import { tileKey } from '@jikjwau/shared/geo'

/*
 * 땅 높이(해발 m). 지도 타일마다 서버에서 받은 격자를 두고, 로컬 좌표(origin 기준 m, x 동쪽 y 북쪽)로 찾는다.
 * 월드 y가 곧 해발 높이다. 매 프레임 여러 번 불려도 되게 가볍게.
 */

interface Grid {
  n: number
  /** 해발(m). 남쪽 줄부터 서→동 */
  h: Float32Array
  min: number
}

const grids = new Map<string, Grid>()
const DEG = Math.PI / 180
const EARTH_RADIUS_M = 6_371_008.8
let origin: LatLng = { lat: 0, lng: 0 }
let mPerDegLat = DEG * EARTH_RADIUS_M
let mPerDegLng = mPerDegLat
/** 높이를 모르는 곳에 쓰는 값: 마지막으로 찾은 높이 */
let fallback = 0

export function setTerrainOrigin(next: LatLng) {
  origin = next
  mPerDegLng = mPerDegLat * Math.cos(next.lat * DEG)
}

export function putTerrain(key: string, n: number, heights: number[]) {
  const h = new Float32Array(heights.length)
  let min = Infinity
  for (let i = 0; i < heights.length; i++) {
    h[i] = heights[i] / 10
    min = Math.min(min, h[i])
  }
  grids.set(key, { n, h, min })
}

export function dropTerrain(key: string) {
  grids.delete(key)
  masks.delete(key)
}

/** 격자 안 (fx, fy)는 0~1. 밖이면 가장자리로 붙인다 */
function sample({ n, h }: Grid, fx: number, fy: number) {
  const gx = Math.min(n - 1, Math.max(0, fx * (n - 1)))
  const gy = Math.min(n - 1, Math.max(0, fy * (n - 1)))
  const x0 = Math.min(n - 2, Math.floor(gx))
  const y0 = Math.min(n - 2, Math.floor(gy))
  const tx = gx - x0
  const ty = gy - y0
  const i = y0 * n + x0
  // 지형 메시와 같은 삼각형으로 나눠야 높이가 메시 면과 딱 맞는다 (왼쪽 아래 / 오른쪽 위)
  if (tx + ty <= 1) return h[i] + (h[i + 1] - h[i]) * tx + (h[i + n] - h[i]) * ty
  const top = h[i + n + 1]
  return top + (h[i + n] - top) * (1 - tx) + (h[i + 1] - top) * (1 - ty)
}

/**
 * 로컬 (x, y) 지점의 땅 높이(해발, 물 밑 바닥 그대로). 그 칸 격자가 아직 없으면 hint 타일 격자를
 * 가장자리까지 늘려 쓰고, 그것도 없으면 마지막으로 찾은 높이. 건물 바닥처럼 땅 자체가 필요할 때
 */
export function terrainHeightAt(x: number, y: number, hint?: string): number {
  const lat = origin.lat + y / mPerDegLat
  const lng = origin.lng + x / mPerDegLng
  const fr = lat * TILES_PER_DEG
  const fc = lng * TILES_PER_DEG
  const row = Math.floor(fr)
  const col = Math.floor(fc)
  const own = grids.get(tileKey(row, col))
  if (own) return (fallback = sample(own, fc - col, fr - row))
  const near = hint ? grids.get(hint) : undefined
  if (near && hint) {
    const [hr, hc] = hint.split('_').map(Number)
    return sample(near, fc - hc, fr - hr)
  }
  return fallback
}

/** 그 지점의 격자가 있는지 */
export function hasTerrain(x: number, y: number) {
  const lat = origin.lat + y / mPerDegLat
  const lng = origin.lng + x / mPerDegLng
  return grids.has(tileKey(Math.floor(lat * TILES_PER_DEG), Math.floor(lng * TILES_PER_DEG)))
}

export function terrainGrid(key: string) {
  return grids.get(key)
}

/** 받아 둔 땅 중 가장 낮은 곳 (멀리 깔린 바닥판 높이) */
export function terrainFloor() {
  let min = Infinity
  for (const g of grids.values()) min = Math.min(min, g.min)
  return Number.isFinite(min) ? min : 0
}

/*
 * 물. 고도 데이터는 수면도 땅처럼 담고 있고, 다리는 수면 높이에 붙어 있다.
 * 그래서 타일마다 호수·강이 덮는 칸을 격자(WATER_CELLS²)로 칠해 두고
 *  - 물마다 수면 높이를 하나로 정하고 (물 안쪽 땅 높이 중 낮은 쪽)
 *  - 물 밑 땅은 수면보다 낮추고 (지형 메시)
 *  - 물 위를 지나는 것(다리 위 도로·사람)은 수면보다 BRIDGE_DECK_M 위로 올린다.
 */

const WATER_CELLS = 64
/** 다리 높이: 수면 위 (m) */
export const BRIDGE_DECK_M = 9
/** 물 밑 땅은 수면보다 이만큼 낮춘다 */
const WATER_BED_M = 1.5
/**
 * 물가 둑: 물에서 이 거리(물 칸 수) 안의 땅 격자 점도 수면 바로 아래로 낮춘다.
 * 땅 삼각형(약 30m)이 물보다 커서, 물에 걸친 삼각형의 꼭짓점이 하나라도 높으면
 * 비스듬한 면이 물을 덮어 물가가 톱니처럼 잘려 보이기 때문
 */
const BANK_CELLS = 3
const BANK_BELOW_M = 0.3
/** 칸마다 그 칸을 덮는 물의 수면 높이. 물이 아니면 NaN */
const masks = new Map<string, Float32Array>()
/** 물 id → 수면 높이. 처음 정한 값을 계속 쓴다 (이미 그린 다리와 어긋나지 않게) */
const levels = new Map<number, number>()

function tileBox(row: number, col: number) {
  const x0 = (col / TILES_PER_DEG - origin.lng) * mPerDegLng
  const y0 = (row / TILES_PER_DEG - origin.lat) * mPerDegLat
  const x1 = ((col + 1) / TILES_PER_DEG - origin.lng) * mPerDegLng
  const y1 = ((row + 1) / TILES_PER_DEG - origin.lat) * mPerDegLat
  return { x0, y0, w: x1 - x0, h: y1 - y0 }
}

const percentile = (values: number[], p: number) => {
  values.sort((a, b) => a - b)
  return values[Math.min(values.length - 1, Math.floor(values.length * p))]
}

/**
 * 타일 한 칸의 물 칸 칠하기. 땅 격자를 넣은 뒤에 부른다 (수면 높이를 땅 높이로 정한다).
 * water: [물 id, [바깥 고리, ...구멍]] 로컬 좌표
 */
export function putWater(key: string, water: Array<[number, number[][]]>) {
  const grid = grids.get(key)
  if (!grid || water.length === 0) return
  const [row, col] = key.split('_').map(Number)
  const box = tileBox(row, col)
  const M = WATER_CELLS
  const owner = new Int32Array(M * M).fill(-1)
  const xs: number[] = []
  water.forEach(([, rings], w) => {
    for (let r = 0; r < M; r++) {
      const yc = box.y0 + ((r + 0.5) / M) * box.h
      // 이 줄과 고리 변들이 만나는 x (구멍도 같이 세면 짝·홀로 안팎이 갈린다)
      xs.length = 0
      for (const flat of rings) {
        for (let i = 0, j = flat.length - 2; i + 1 < flat.length; j = i, i += 2) {
          const ya = flat[i + 1]
          const yb = flat[j + 1]
          if (ya > yc !== yb > yc) xs.push(flat[i] + ((yc - ya) * (flat[j] - flat[i])) / (yb - ya))
        }
      }
      if (xs.length < 2) continue
      xs.sort((a, b) => a - b)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil(((xs[k] - box.x0) / box.w) * M - 0.5))
        const c1 = Math.min(M - 1, Math.floor(((xs[k + 1] - box.x0) / box.w) * M - 0.5))
        for (let c = c0; c <= c1; c++) owner[r * M + c] = w
      }
    }
  })

  // 물마다 수면 높이: 물 안에 든 땅 격자 점 높이 중 아래쪽 15%
  const { n, h } = grid
  const cellOf = (i: number, j: number) =>
    Math.min(M - 1, Math.floor((i / (n - 1)) * M)) * M + Math.min(M - 1, Math.floor((j / (n - 1)) * M))
  water.forEach(([id, rings], w) => {
    if (levels.has(id)) return
    const inside: number[] = []
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (owner[cellOf(i, j)] === w) inside.push(h[i * n + j])
    if (inside.length >= 6) return void levels.set(id, percentile(inside, 0.15))
    // 이 타일에 조금만 걸친 물: 물가 점 높이로
    const edge: number[] = []
    const outer = rings[0]
    const step = Math.max(2, Math.floor(outer.length / 800) * 2)
    for (let k = 0; k + 1 < outer.length; k += step) edge.push(terrainHeightAt(outer[k], outer[k + 1], key))
    const samples = inside.length > 0 ? inside : edge
    if (samples.length > 0) levels.set(id, percentile(samples, 0.2))
  })

  const mask = new Float32Array(M * M).fill(NaN)
  for (let k = 0; k < mask.length; k++) if (owner[k] >= 0) mask[k] = levels.get(water[owner[k]][0]) ?? NaN
  masks.set(key, mask)

  // 땅 격자를 물 밑·물가만큼 낮춘다. 메시·높이 찾기·건물 바닥이 모두 이 값을 쓴다
  let min = Infinity
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r0 = Math.min(M - 1, Math.floor((i / (n - 1)) * M))
      const c0 = Math.min(M - 1, Math.floor((j / (n - 1)) * M))
      const under = mask[r0 * M + c0]
      let bank = NaN
      for (let r = Math.max(0, r0 - BANK_CELLS); r <= Math.min(M - 1, r0 + BANK_CELLS); r++) {
        for (let c = Math.max(0, c0 - BANK_CELLS); c <= Math.min(M - 1, c0 + BANK_CELLS); c++) {
          const v = mask[r * M + c]
          if (!Number.isNaN(v) && !(v >= bank)) bank = v
        }
      }
      const k = i * n + j
      if (!Number.isNaN(under)) h[k] = Math.min(h[k], under - WATER_BED_M)
      else if (!Number.isNaN(bank)) h[k] = Math.min(h[k], bank - BANK_BELOW_M)
      min = Math.min(min, h[k])
    }
  }
  grid.min = min
}

/** 물 id의 수면 높이 (아직 모르면 undefined) */
export const waterLevel = (id: number) => levels.get(id)

/** 그 지점을 덮는 물의 수면 높이. 물이 아니면 NaN */
export function waterAt(x: number, y: number): number {
  const lat = origin.lat + y / mPerDegLat
  const lng = origin.lng + x / mPerDegLng
  const fr = lat * TILES_PER_DEG
  const fc = lng * TILES_PER_DEG
  const row = Math.floor(fr)
  const col = Math.floor(fc)
  const mask = masks.get(tileKey(row, col))
  if (!mask) return NaN
  const r = Math.min(WATER_CELLS - 1, Math.floor((fr - row) * WATER_CELLS))
  const c = Math.min(WATER_CELLS - 1, Math.floor((fc - col) * WATER_CELLS))
  return mask[r * WATER_CELLS + c]
}

/**
 * 걸어 다니는 높이: 땅 위면 땅, 물 위면 다리(수면 + BRIDGE_DECK_M).
 * 도로·사람·깃발·가로등·카메라가 쓴다.
 */
export function heightAt(x: number, y: number, hint?: string): number {
  const ground = terrainHeightAt(x, y, hint)
  const level = waterAt(x, y)
  return Number.isNaN(level) ? ground : Math.max(ground, level + BRIDGE_DECK_M)
}

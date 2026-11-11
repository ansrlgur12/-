import type { LatLng, Vec2 } from '../types'
import { TILE_COORD_SCALE, TILES_PER_DEG } from '../config'

const EARTH_RADIUS_M = 6_371_008.8
const DEG = Math.PI / 180

/** 위경도를 origin 기준 로컬 평면 좌표(미터)로 바꾼다. 수 km 안에서는 오차가 무시할 만하다. */
export function project(point: LatLng, origin: LatLng): Vec2 {
  return {
    x: (point.lng - origin.lng) * DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG),
    y: (point.lat - origin.lat) * DEG * EARTH_RADIUS_M,
  }
}

/** 타일 = 위도·경도 1/TILES_PER_DEG 도 격자 한 칸. 키는 "행_열" */
export function tileRowCol(lat: number, lng: number): [number, number] {
  return [Math.floor(lat * TILES_PER_DEG), Math.floor(lng * TILES_PER_DEG)]
}

export const tileKey = (row: number, col: number) => `${row}_${col}`

export function parseTileKey(key: string): [number, number] {
  const [row, col] = key.split('_').map(Number)
  return [row, col]
}

/** 타일 남서쪽 모서리 */
export function tileCorner(row: number, col: number): LatLng {
  return { lat: row / TILES_PER_DEG, lng: col / TILES_PER_DEG }
}

/** center에서 radiusM 안에 걸치는 타일 키 (가까운 순) */
export function tilesAround(center: LatLng, radiusM: number): string[] {
  const dLat = radiusM / (DEG * EARTH_RADIUS_M)
  const dLng = dLat / Math.cos(center.lat * DEG)
  const [r0, c0] = tileRowCol(center.lat - dLat, center.lng - dLng)
  const [r1, c1] = tileRowCol(center.lat + dLat, center.lng + dLng)
  const [rc, cc] = tileRowCol(center.lat, center.lng)
  const keys: Array<[number, string]> = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) keys.push([(r - rc) ** 2 + (c - cc) ** 2, tileKey(r, c)])
  }
  return keys.sort((a, b) => a[0] - b[0]).map(([, k]) => k)
}

/**
 * 타일 안의 정수 좌표(모서리 기준 경도·위도 차 × TILE_COORD_SCALE, x·y 순서 평면 배열)를
 * origin 기준 미터 좌표 평면 배열로 바꾼다.
 */
export function tileFlatToLocal(flat: number[], row: number, col: number, origin: LatLng): number[] {
  const corner = tileCorner(row, col)
  const kx = DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG)
  const ky = DEG * EARTH_RADIUS_M
  const ox = (corner.lng - origin.lng) * kx
  const oy = (corner.lat - origin.lat) * ky
  const out = new Array<number>(flat.length)
  for (let i = 0; i + 1 < flat.length; i += 2) {
    out[i] = ox + (flat[i] / TILE_COORD_SCALE) * kx
    out[i + 1] = oy + (flat[i + 1] / TILE_COORD_SCALE) * ky
  }
  return out
}

/** project의 역변환 */
export function unproject(p: Vec2, origin: LatLng): LatLng {
  return {
    lat: origin.lat + p.y / (DEG * EARTH_RADIUS_M),
    lng: origin.lng + p.x / (DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG)),
  }
}

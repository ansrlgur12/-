import type { LatLng } from '@jikjwau/shared/types'
import { parseTileKey, tileRowCol } from '@jikjwau/shared/geo'
import { fetchRegion } from '../api/map'

/**
 * 지도를 보여 주고 다닐 수 있는 대한민국 영역 (서버 타일과 함께 만든 region.json).
 * 이 밖의 타일은 받지 않고, 카메라도 나가지 못한다. 못 받았으면(예전 타일) 어디든 허용
 */
let rows: Map<number, number[]> | null = null

/** 앱을 켤 때 한 번 */
export async function loadRegion() {
  try {
    const region = await fetchRegion()
    if (region) rows = new Map(region.rows.map(([row, ...runs]) => [row, runs]))
  } catch {
    // 못 받으면 제한 없이
  }
}

function inRegionTile(row: number, col: number) {
  if (!rows) return true
  const runs = rows.get(row)
  if (!runs) return false
  for (let i = 0; i < runs.length; i += 2) if (col >= runs[i] && col <= runs[i + 1]) return true
  return false
}

export const inRegionKey = (key: string) => inRegionTile(...parseTileKey(key))
export const inRegionLatLng = (p: LatLng) => inRegionTile(...tileRowCol(p.lat, p.lng))

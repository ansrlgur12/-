import type { LatLng, MapRegion, RoadCheck, RoadTile, SceneryTile, TerrainTile } from '@jikjwau/shared/types'
import { API_BASE_URL } from './http'

/**
 * 타일 주소에 붙이는 판. 휴대폰에 예전 방식(하루 보관)으로 저장된 타일을 쓰지 않게 바꿀 때 올린다.
 * (지금 서버는 매번 바뀌었는지 묻게 해서, 타일을 다시 만들어도 이 값을 올릴 필요는 없다)
 */
const TILE_URL_VERSION = 2

/** 데이터가 없는 칸(바다·산 등)은 null */
async function getTile<T>(key: string, layer: 'roads' | 'scenery'): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}/map/tiles/${key}/${layer}?v=${TILE_URL_VERSION}`)
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`타일 ${key} ${layer}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export const fetchRoadTile = (key: string) => getTile<RoadTile>(key, 'roads')
export const fetchSceneryTile = (key: string) => getTile<SceneryTile>(key, 'scenery')

/** 타일 한 칸의 땅 높이 격자 */
export async function fetchTerrainTile(key: string): Promise<TerrainTile> {
  const res = await fetch(`${API_BASE_URL}/map/terrain/${key}?v=${TILE_URL_VERSION}`)
  if (!res.ok) throw new Error(`타일 ${key} 지형: HTTP ${res.status}`)
  return (await res.json()) as TerrainTile
}

/** 출발지·목적지로 고른 곳 확인: 가장 가까운 (본토와 이어진) 길, 없으면 이유 */
export async function fetchSpotCheck(at: LatLng): Promise<RoadCheck> {
  const res = await fetch(`${API_BASE_URL}/map/snap?lat=${at.lat}&lng=${at.lng}`)
  if (!res.ok) throw new Error(`길 찾기: HTTP ${res.status}`)
  return (await res.json()) as RoadCheck
}

/** 지도를 보여 주고 다닐 수 있는 대한민국 영역. 서버에 정보가 없으면 null */
export async function fetchRegion(): Promise<MapRegion | null> {
  const res = await fetch(`${API_BASE_URL}/map/region?v=${TILE_URL_VERSION}`)
  if (!res.ok) throw new Error(`영역: HTTP ${res.status}`)
  return (await res.json()) as MapRegion | null
}

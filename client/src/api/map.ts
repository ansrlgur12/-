import type { LatLng, MapRegion, RoadCheck, RoadTile, SceneryTile, TerrainTile } from '@jikjwau/shared/types'
import { API_BASE_URL } from './http'

/** 데이터가 없는 칸(바다·산 등)은 null */
async function getTile<T>(key: string, layer: 'roads' | 'scenery'): Promise<T | null> {
  const res = await fetch(`${API_BASE_URL}/map/tiles/${key}/${layer}`)
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`타일 ${key} ${layer}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export const fetchRoadTile = (key: string) => getTile<RoadTile>(key, 'roads')
export const fetchSceneryTile = (key: string) => getTile<SceneryTile>(key, 'scenery')

/** 타일 한 칸의 땅 높이 격자 */
export async function fetchTerrainTile(key: string): Promise<TerrainTile> {
  const res = await fetch(`${API_BASE_URL}/map/terrain/${key}`)
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
  const res = await fetch(`${API_BASE_URL}/map/region`)
  if (!res.ok) throw new Error(`영역: HTTP ${res.status}`)
  return (await res.json()) as MapRegion | null
}

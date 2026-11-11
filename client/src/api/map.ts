import type { RoadTile, SceneryTile } from '@jikjwau/shared/types'
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

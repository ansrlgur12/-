const LEVEL_HEIGHT_M = 3

/** 층수 정보가 없을 때 건물 종류별 기본 층수 */
const DEFAULT_LEVELS: Record<string, number> = {
  house: 2,
  detached: 2,
  apartments: 15,
  garage: 1,
  garages: 1,
  shed: 1,
  kiosk: 1,
  roof: 1,
  hut: 1,
  church: 3,
  school: 4,
}
const FALLBACK_LEVELS = 4

export function buildingHeight(tags: Record<string, string>): number {
  const height = Number.parseFloat(tags.height)
  if (height > 0) return height
  const levels = Number.parseFloat(tags['building:levels'])
  if (levels > 0) return levels * LEVEL_HEIGHT_M
  return (DEFAULT_LEVELS[tags.building] ?? FALLBACK_LEVELS) * LEVEL_HEIGHT_M
}

export function isBuilding(tags: Record<string, string> = {}) {
  return !!tags.building && tags.building !== 'no'
}

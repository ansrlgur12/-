import type { LatLng, PlaceResult, PlaceSearchResponse } from '@jikjwau/shared/types'
import { getJson } from './http'

/** near를 주면 그 근처를 우선한다 */
export function searchPlaces(query: string, near?: LatLng) {
  const params = new URLSearchParams({ q: query })
  if (near) {
    params.set('lat', String(near.lat))
    params.set('lng', String(near.lng))
  }
  return getJson<PlaceSearchResponse>(`/places/search?${params}`)
}

/** 지점의 대표 이름 (가까운 역·명소·건물, 없으면 주소) */
export function reversePlace(at: LatLng) {
  return getJson<PlaceResult>(`/places/reverse?lat=${at.lat}&lng=${at.lng}`)
}

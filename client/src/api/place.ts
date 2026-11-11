import type { LatLng, PlaceSearchResponse } from '@jikjwau/shared/types'
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

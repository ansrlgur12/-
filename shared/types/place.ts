export interface PlaceResult {
  name: string
  /** 도로명 주소가 있으면 그것, 없으면 지번 주소 */
  address: string
  lat: number
  lng: number
  /** 검색 기준점에서의 거리 (기준점을 줬을 때만) */
  distanceM?: number
}

export interface PlaceSearchResponse {
  /** kakao = 카카오 로컬 API, osm = Nominatim (카카오 키가 없을 때) */
  source: 'kakao' | 'osm'
  places: PlaceResult[]
}

import type { LatLng, PlaceResult, PlaceSearchResponse } from '@jikjwau/shared/types'
import { HttpError } from '../../common/http-error'
import { distance, project } from '../road/geo'
import { latLngInRegion } from '../map/tile-store'

const KAKAO_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json'
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
export const USER_AGENT = 'jikjwau-dev/0.1 (game prototype)'
const LIMIT = 10

/** Nominatim 이용 정책: 초당 1건 이하 */
const NOMINATIM_INTERVAL_MS = 1100
let lastNominatimAt = 0

/** Nominatim 호출 간격을 지킨다 (검색·위치 이름 찾기가 함께 쓴다) */
export async function waitNominatim() {
  const wait = lastNominatimAt + NOMINATIM_INTERVAL_MS - Date.now()
  lastNominatimAt = Math.max(Date.now(), lastNominatimAt + NOMINATIM_INTERVAL_MS)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}

function withDistance(places: PlaceResult[], near?: LatLng): PlaceResult[] {
  if (!near) return places
  return places.map((p) => ({ ...p, distanceM: Math.round(distance({ x: 0, y: 0 }, project(p, near))) }))
}

export async function fetchJson(url: string, headers: Record<string, string>) {
  let res: Response
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
  } catch {
    throw new HttpError(502, '장소 검색 서버에 연결하지 못했습니다')
  }
  if (!res.ok) throw new HttpError(502, `장소 검색에 실패했습니다 (${res.status})`)
  return res.json()
}

interface KakaoDoc {
  place_name: string
  address_name: string
  road_address_name: string
  x: string
  y: string
}

async function searchKakao(query: string, key: string, near?: LatLng): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ query, size: String(LIMIT) })
  if (near) {
    params.set('x', String(near.lng))
    params.set('y', String(near.lat))
  }
  const json = (await fetchJson(`${KAKAO_URL}?${params}`, { Authorization: `KakaoAK ${key}` })) as { documents: KakaoDoc[] }
  return json.documents.map((d) => ({
    name: d.place_name,
    address: d.road_address_name || d.address_name,
    lat: Number(d.y),
    lng: Number(d.x),
  }))
}

interface NominatimItem {
  name: string
  display_name: string
  lat: string
  lon: string
}

async function searchNominatim(query: string, near?: LatLng): Promise<PlaceResult[]> {
  await waitNominatim()
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: String(LIMIT), countrycodes: 'kr', 'accept-language': 'ko' })
  // 기준점 주변 ±0.2도를 우선한다 (밖도 나온다)
  if (near) params.set('viewbox', [near.lng - 0.2, near.lat + 0.2, near.lng + 0.2, near.lat - 0.2].join(','))
  const items = (await fetchJson(`${NOMINATIM_URL}?${params}`, { 'User-Agent': USER_AGENT })) as NominatimItem[]
  return items.map((it) => {
    // "이름, 도로, 동, 구, 시, 우편번호, 대한민국" → "시 구 동 도로"
    const parts = it.display_name.split(',').map((p) => p.trim())
    const address = parts
      .slice(1)
      .filter((p) => p !== '대한민국' && !/^\d+$/.test(p))
      .reverse()
      .join(' ')
    return { name: it.name || parts[0], address, lat: Number(it.lat), lng: Number(it.lon) }
  })
}

/** 대한민국 영역 밖 결과는 뺀다 (갈 수도 볼 수도 없는 곳) */
async function inKorea(places: PlaceResult[]) {
  const keep = await Promise.all(places.map((p) => latLngInRegion(p)))
  return places.filter((_, i) => keep[i])
}

/** 카카오 키(KAKAO_REST_API_KEY)가 있으면 카카오, 없으면 OSM Nominatim으로 찾는다 */
export async function searchPlaces(query: string, near?: LatLng): Promise<PlaceSearchResponse> {
  const key = process.env.KAKAO_REST_API_KEY
  if (key) return { source: 'kakao', places: withDistance(await inKorea(await searchKakao(query, key, near)), near) }
  return { source: 'osm', places: withDistance(await inKorea(await searchNominatim(query, near)), near) }
}

import type { LatLng, PlaceResult } from '@jikjwau/shared/types'
import { fetchJson, USER_AGENT, waitNominatim } from './place.service'

const KAKAO = 'https://dapi.kakao.com/v2/local'
const NO_NAME = '이름 없는 곳'
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

/**
 * 고른 지점을 부를 이름. 대표적인 것부터:
 * 가까운 지하철역 → 가까운 명소·공공기관·학교·문화시설 → 그 자리 건물 이름 → 아주 가까운 가게 → 도로명 주소
 * [카테고리 코드, 이 거리(m) 안이면 쓴다]
 */
const LANDMARK_TIERS: Array<Array<[string, number]>> = [
  [['SW8', 150]],
  [
    ['AT4', 80],
    ['PO3', 80],
    ['SC4', 80],
    ['CT1', 80],
  ],
]
const NEARBY_SHOPS: Array<[string, number]> = [
  ['CE7', 50],
  ['FD6', 50],
  ['CS2', 50],
  ['BK9', 50],
  ['MT1', 50],
  ['HP8', 50],
]

interface KakaoPlace {
  place_name: string
  road_address_name: string
  address_name: string
  distance: string
}

interface KakaoAddressDoc {
  road_address: { address_name: string; building_name: string } | null
  address: { address_name: string } | null
}

/** 여러 카테고리에서 radius 안의 가장 가까운 곳 */
async function nearestOf(key: string, at: LatLng, categories: Array<[string, number]>): Promise<KakaoPlace | null> {
  const results = await Promise.all(
    categories.map(async ([code, radius]) => {
      const params = new URLSearchParams({ category_group_code: code, x: String(at.lng), y: String(at.lat), radius: String(radius), sort: 'distance', size: '1' })
      const json = (await fetchJson(`${KAKAO}/search/category.json?${params}`, { Authorization: `KakaoAK ${key}` })) as { documents: KakaoPlace[] }
      return json.documents[0] ?? null
    }),
  )
  return results.filter((p): p is KakaoPlace => !!p).sort((a, b) => Number(a.distance) - Number(b.distance))[0] ?? null
}

async function reverseKakao(at: LatLng, key: string): Promise<PlaceResult> {
  const params = new URLSearchParams({ x: String(at.lng), y: String(at.lat) })
  const addressJob = fetchJson(`${KAKAO}/geo/coord2address.json?${params}`, { Authorization: `KakaoAK ${key}` }) as Promise<{ documents: KakaoAddressDoc[] }>
  const tierJobs = LANDMARK_TIERS.map((tier) => nearestOf(key, at, tier))
  const shopJob = nearestOf(key, at, NEARBY_SHOPS)

  const doc = (await addressJob).documents[0]
  const address = doc?.road_address?.address_name || doc?.address?.address_name || ''
  const of = (p: KakaoPlace) => ({ ...at, name: p.place_name, address: p.road_address_name || p.address_name })

  for (const job of tierJobs) {
    const place = await job
    if (place) return of(place)
  }
  if (doc?.road_address?.building_name) return { ...at, name: doc.road_address.building_name, address }
  const shop = await shopJob
  if (shop) return of(shop)
  // 도로명 주소의 "서울 마포구 월드컵로 83" → "월드컵로 83"
  const short = (doc?.road_address?.address_name ?? doc?.address?.address_name ?? '').split(' ').slice(-2).join(' ')
  if (short) return { ...at, name: short, address }
  // 바다 위 대교처럼 카카오에 주소가 없는 곳: OSM은 다리·도로 자체 이름(예: 인천대교)을 안다
  const osm = await reverseNominatim(at).catch(() => null)
  if (osm && osm.name !== NO_NAME) return osm
  // 그래도 없으면 행정 구역 이름으로
  const region = await regionName(at, key).catch(() => '')
  return { ...at, name: region ? `${region} 근처` : NO_NAME, address: region }
}

/** 그 지점의 행정 구역 (예: "인천 중구"). 바다 위여도 가까운 구역을 준다 */
async function regionName(at: LatLng, key: string): Promise<string> {
  const params = new URLSearchParams({ x: String(at.lng), y: String(at.lat) })
  const json = (await fetchJson(`${KAKAO}/geo/coord2regioncode.json?${params}`, { Authorization: `KakaoAK ${key}` })) as {
    documents: Array<{ region_type: string; region_1depth_name: string; region_2depth_name: string }>
  }
  const doc = json.documents.find((d) => d.region_type === 'H') ?? json.documents[0]
  return doc ? [doc.region_1depth_name, doc.region_2depth_name].filter(Boolean).join(' ') : ''
}

interface NominatimReverse {
  name?: string
  display_name?: string
  address?: Record<string, string>
}

async function reverseNominatim(at: LatLng): Promise<PlaceResult> {
  await waitNominatim()
  const params = new URLSearchParams({ lat: String(at.lat), lon: String(at.lng), format: 'jsonv2', zoom: '18', 'accept-language': 'ko', addressdetails: '1' })
  const r = (await fetchJson(`${NOMINATIM_REVERSE_URL}?${params}`, { 'User-Agent': USER_AGENT })) as NominatimReverse
  const a = r.address ?? {}
  const road = [a.road, a.house_number].filter(Boolean).join(' ')
  const area = a.quarter || a.neighbourhood || a.suburb || a.borough || a.city || ''
  const address = [a.city, a.borough, area !== a.borough ? area : '', road].filter(Boolean).join(' ')
  return { ...at, name: r.name || road || (area ? `${area} 근처` : NO_NAME), address }
}

/** 지점의 이름과 주소. 카카오 키가 있으면 카카오, 없으면 OSM Nominatim */
export function reversePlace(at: LatLng): Promise<PlaceResult> {
  const key = process.env.KAKAO_REST_API_KEY
  return key ? reverseKakao(at, key) : reverseNominatim(at)
}

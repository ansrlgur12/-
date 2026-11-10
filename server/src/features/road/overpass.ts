import type { LatLng } from '@jikjwau/shared/types'
import type { OsmElement } from './graph'

// 공용 서버는 자주 혼잡하므로 실패하면 다음 미러로 넘어간다. 출시 전에는 자체 전처리 데이터로 교체한다.
const OVERPASS_URLS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ]

/** 반경 안의 도로(way)와 그 노드들을 받아온다. 보행 가능 여부는 graph에서 거른다. */
export async function fetchRoads(center: LatLng, radiusM: number): Promise<OsmElement[]> {
  const query = `[out:json][timeout:25];way["highway"](around:${radiusM},${center.lat},${center.lng});(._;>;);out body;`
  const errors: string[] = []

  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'jikjwau-dev/0.0 (road graph prototype)',
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(40_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { elements: OsmElement[] }
      return json.elements
    } catch (err) {
      errors.push(`${new URL(url).host}: ${(err as Error).message}`)
    }
  }
  throw new Error(errors.join(', '))
}

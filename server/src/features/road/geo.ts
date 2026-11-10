import type { LatLng, Vec2 } from '@jikjwau/shared/types'

const EARTH_RADIUS_M = 6_371_008.8
const DEG = Math.PI / 180

/** 위경도를 origin 기준 로컬 평면 좌표(미터)로 바꾼다. 동네 반경 정도에서는 오차가 무시할 만하다. */
export function project(point: LatLng, origin: LatLng): Vec2 {
  return {
    x: (point.lng - origin.lng) * DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG),
    y: (point.lat - origin.lat) * DEG * EARTH_RADIUS_M,
  }
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** 북쪽 0°, 시계 방향 [0, 360) */
export function bearingDeg(from: Vec2, to: Vec2): number {
  const deg = Math.atan2(to.x - from.x, to.y - from.y) / DEG
  return (deg + 360) % 360
}

/** 들어온 방향 대비 나가는 방향의 회전 각도 (-180, 180]. 왼쪽이 음수 */
export function turnAngleDeg(inBearing: number, outBearing: number): number {
  let d = (outBearing - inBearing) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

/** 폴리라인을 points[0]부터 따라가서 d미터 지점. 선이 더 짧으면 끝점 */
export function pointAtDistance(points: Vec2[], d: number): Vec2 {
  let remaining = d
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = distance(a, b)
    if (len >= remaining && len > 0) {
      const t = remaining / len
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    remaining -= len
  }
  return points[points.length - 1]
}

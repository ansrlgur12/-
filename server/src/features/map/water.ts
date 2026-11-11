/** 면으로 그릴 수 없는 하천(선)의 폭 (m) */
export const WATERWAY_WIDTH: Record<string, number> = {
  river: 12,
  canal: 6,
  stream: 3,
  drain: 2,
  ditch: 1.5,
}

export function isWaterArea(tags: Record<string, string> = {}) {
  return (
    tags.natural === 'water' ||
    tags.waterway === 'riverbank' ||
    tags.landuse === 'reservoir' ||
    tags.landuse === 'basin'
  )
}

/** x = 경도, y = 위도 (어느 단위든 같은 좌표계면 된다) */
export interface Point {
  x: number
  y: number
}

const keyOf = (p: Point) => `${p.x},${p.y}`

/**
 * 멀티폴리곤의 조각난 선들을 끝점끼리 이어 닫힌 고리로 만든다.
 * 돌려주는 고리는 마지막 점(= 첫 점) 중복을 뺀 것. 끝까지 닫히지 않는 조각(데이터 누락)은 버린다.
 */
export function stitchRings<P extends Point>(lines: P[][]): P[][] {
  const rest = lines.filter((l) => l.length >= 2).map((l) => [...l])
  const rings: P[][] = []
  while (rest.length > 0) {
    const ring = rest.pop()!
    let extended = true
    while (extended && keyOf(ring[0]) !== keyOf(ring[ring.length - 1])) {
      extended = false
      const end = keyOf(ring[ring.length - 1])
      for (let i = 0; i < rest.length; i++) {
        const l = rest[i]
        if (keyOf(l[0]) === end) ring.push(...l.slice(1))
        else if (keyOf(l[l.length - 1]) === end) ring.push(...l.slice(0, -1).reverse())
        else continue
        rest.splice(i, 1)
        extended = true
        break
      }
    }
    if (ring.length >= 4 && keyOf(ring[0]) === keyOf(ring[ring.length - 1])) rings.push(ring.slice(0, -1))
  }
  return rings
}

export function contains(ring: Point[], p: Point) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 멀티폴리곤의 outer·inner 선 조각으로 면들을 만든다. 각 면은 [바깥 고리, ...구멍(섬)] */
export function assembleMultipolygon<P extends Point>(outerLines: P[][], innerLines: P[][]): P[][][] {
  const polygons = stitchRings(outerLines).map((outer) => [outer])
  for (const inner of stitchRings(innerLines)) {
    polygons.find((rings) => contains(rings[0], inner[0]))?.push(inner)
  }
  return polygons
}

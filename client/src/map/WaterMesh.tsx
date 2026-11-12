import { memo, useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, ShapeUtils, Vector2 } from 'three'
import type { Vec2 } from '@jikjwau/shared/types'
import { buildRibbon } from './RoadMesh'
import { terrainHeightAt, waterLevel } from './terrain'

const WATER_COLOR = '#7db9e8'
// 수면(terrain이 정한 높이)보다 조금 위. 멀리서 깜빡이지 않게 polygonOffset도 함께 쓴다
const AREA_HEIGHT = 0.2
const LINE_HEIGHT = 0.004

const toVectors = (flat: number[]) => {
  const pts: Vector2[] = []
  for (let k = 0; k + 1 < flat.length; k += 2) pts.push(new Vector2(flat[k], flat[k + 1]))
  return pts
}

/** 호수·강 하나의 면. 섬은 구멍으로 뚫는다 */
function buildArea(id: number, [outerFlat, ...holeFlats]: number[][]): BufferGeometry {
  const positions: number[] = []
  const outer = toVectors(outerFlat)
  if (outer.length >= 3) {
    const level = (waterLevel(id) ?? terrainHeightAt(outer[0].x, outer[0].y)) + AREA_HEIGHT
    const holes = holeFlats.map(toVectors).filter((h) => h.length >= 3)
    const all = [outer, ...holes].flat()
    for (const tri of ShapeUtils.triangulateShape(outer, holes)) {
      for (const idx of tri) positions.push(all[idx].x, level, -all[idx].y)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(positions.map((_, i) => (i % 3 === 1 ? 1 : 0))), 3))
  geometry.computeBoundingSphere()
  return geometry
}
/** 하천 선은 폭별로 묶어 도로처럼 리본으로 그린다 */
function buildLines(waterways: Array<[number, number[]]>): BufferGeometry[] {
  const byWidth = new Map<number, Array<[Vec2, Vec2]>>()
  for (const [width, flat] of waterways) {
    const segs = byWidth.get(width) ?? []
    for (let k = 0; k + 3 < flat.length; k += 2) {
      segs.push([
        { x: flat[k], y: flat[k + 1] },
        { x: flat[k + 2], y: flat[k + 3] },
      ])
    }
    byWidth.set(width, segs)
  }
  // 하천 선은 다리처럼 띄우지 않고 땅 그대로
  return [...byWidth].map(([width, segs]) => buildRibbon(segs, width, LINE_HEIGHT, undefined, terrainHeightAt))
}

/**
 * 호수·강 하나. 같은 물이 여러 타일에 들어 있어도 id로 한 번만 그리고,
 * 다른 타일이 들어와도 다시 만들지 않는다 (한강처럼 큰 물은 삼각분할이 무겁다).
 */
export const WaterArea = memo(function WaterArea({ id, rings }: { id: number; rings: number[][] }) {
  const geometry = useMemo(() => buildArea(id, rings), [id, rings])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial color={WATER_COLOR} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  )
})

/** 타일 하나의 하천 선 */
export const WaterwayLines = memo(function WaterwayLines({ waterways }: { waterways: Array<[number, number[]]> }) {
  const lines = useMemo(() => buildLines(waterways), [waterways])
  useEffect(() => () => lines.forEach((g) => g.dispose()), [lines])
  return (
    <>
      {lines.map((geometry, i) => (
        <mesh key={i} geometry={geometry}>
          <meshLambertMaterial color={WATER_COLOR} side={DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
      ))}
    </>
  )
})

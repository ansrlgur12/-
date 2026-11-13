import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, MeshLambertMaterial, ShapeUtils, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Vec2 } from '@jikjwau/shared/types'
import { buildRibbon } from './RoadMesh'
import { sandLevel, terrainHeightAt, waterLevel } from './terrain'

export const WATER_COLOR = '#6cb4f0'
/** 모래사장 색 */
export const SAND_COLOR = '#f2dfa6'
// 수면(terrain이 정한 높이)보다 조금 위. 멀리서 깜빡이지 않게 polygonOffset도 함께 쓴다
const AREA_HEIGHT = 0.2
const LINE_HEIGHT = 0.004

const toVectors = (flat: number[]) => {
  const pts: Vector2[] = []
  for (let k = 0; k + 1 < flat.length; k += 2) pts.push(new Vector2(flat[k], flat[k + 1]))
  return pts
}

/** 면 하나 (삼각형 정점들). 섬은 구멍으로 뚫는다. 높이는 levelOf(id), 모르면 첫 점의 땅 높이 */
function triangulateArea(id: number, [outerFlat, ...holeFlats]: number[][], levelOf: (id: number) => number | undefined, lift: number): Float32Array {
  const positions: number[] = []
  const outer = toVectors(outerFlat)
  if (outer.length >= 3) {
    const level = (levelOf(id) ?? terrainHeightAt(outer[0].x, outer[0].y)) + lift
    const holes = holeFlats.map(toVectors).filter((h) => h.length >= 3)
    const all = [outer, ...holes].flat()
    for (const tri of ShapeUtils.triangulateShape(outer, holes)) {
      for (const idx of tri) positions.push(all[idx].x, level, -all[idx].y)
    }
  }
  return new Float32Array(positions)
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

// 모든 물이 같이 쓴다 (재질이 하나면 그리기 준비가 가볍다)
const AREA_MATERIAL = new MeshLambertMaterial({ color: WATER_COLOR, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
const SAND_MATERIAL = new MeshLambertMaterial({ color: SAND_COLOR, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
/** 모래는 땅을 모래 높이로 평평하게 해 두므로 아주 조금만 띄운다 */
const SAND_HEIGHT = 0.05
const LINE_MATERIAL = new MeshLambertMaterial({ color: WATER_COLOR, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
/** 물이 연달아 들어오는 동안은 기다렸다가 한 번에 다시 합친다 */
const MERGE_DELAY_MS = 300

interface AreaKind {
  material: MeshLambertMaterial
  levelOf: (id: number) => number | undefined
  lift: number
  /** id → 삼각분할한 정점 (한강처럼 큰 물은 삼각분할이 무거우니 한 번만) */
  cache: Map<number, Float32Array>
  cacheOrigin: unknown
}
const WATER_KIND: AreaKind = { material: AREA_MATERIAL, levelOf: waterLevel, lift: AREA_HEIGHT, cache: new Map(), cacheOrigin: null }
const SAND_KIND: AreaKind = { material: SAND_MATERIAL, levelOf: sandLevel, lift: SAND_HEIGHT, cache: new Map(), cacheOrigin: null }

/** 지금 받아 둔 호수·강·바다 전부를 한 메시로 */
export function WaterAreas({ water, origin }: { water: Array<[number, number[][]]>; origin: unknown }) {
  return <FlatAreas areas={water} origin={origin} kind={WATER_KIND} />
}

/** 지금 받아 둔 모래사장 전부를 한 메시로 */
export function SandAreas({ beaches, origin }: { beaches: Array<[number, number[][]]>; origin: unknown }) {
  return <FlatAreas areas={beaches} origin={origin} kind={SAND_KIND} />
}

/**
 * 평평한 면들을 한 메시로 그린다. 면마다 따로 그리면 축소했을 때 수백 번 그려야 해서
 * (React Native에서는 그리기 명령이 모두 JS를 거친다) 화면이 끊긴다.
 */
function FlatAreas({ areas: water, origin, kind }: { areas: Array<[number, number[][]]>; origin: unknown; kind: AreaKind }) {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)
  // 새 타일이 와도 물 목록(id)이 그대로면(한강만 또 들어온 경우 등) 다시 합치지 않는다
  const ids = useMemo(() => water.map(([id]) => id).join(','), [water])
  const latest = useRef(water)
  latest.current = water
  useEffect(() => {
    const water = latest.current
    const timer = setTimeout(() => {
      const areaCache = kind.cache
      if (kind.cacheOrigin !== origin) {
        areaCache.clear()
        kind.cacheOrigin = origin
      }
      let total = 0
      const parts: Float32Array[] = []
      const keep = new Set<number>()
      for (const [id, rings] of water) {
        keep.add(id)
        let part = areaCache.get(id)
        if (!part) {
          part = triangulateArea(id, rings, kind.levelOf, kind.lift)
          areaCache.set(id, part)
        }
        parts.push(part)
        total += part.length
      }
      for (const id of [...areaCache.keys()]) if (!keep.has(id)) areaCache.delete(id)
      const positions = new Float32Array(total)
      let o = 0
      for (const part of parts) {
        positions.set(part, o)
        o += part.length
      }
      const normals = new Float32Array(total)
      for (let k = 1; k < total; k += 3) normals[k] = 1
      const next = new BufferGeometry()
      next.setAttribute('position', new BufferAttribute(positions, 3))
      next.setAttribute('normal', new BufferAttribute(normals, 3))
      next.computeBoundingSphere()
      setGeometry(next)
    }, MERGE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [ids, origin, kind])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry ? <mesh geometry={geometry} material={kind.material} /> : null
}

/** 타일 하나의 하천 선 (폭이 달라도 한 메시) */
export const WaterwayLines = memo(function WaterwayLines({ waterways }: { waterways: Array<[number, number[]]> }) {
  const geometry = useMemo(() => {
    const parts = buildLines(waterways)
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts)
    if (parts.length > 1) parts.forEach((g) => g.dispose())
    return merged
  }, [waterways])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry ? <mesh geometry={geometry} material={LINE_MATERIAL} /> : null
})

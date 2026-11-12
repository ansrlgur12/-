import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, MeshLambertMaterial } from 'three'
import type { NodeId, Vec2 } from '@jikjwau/shared/types'
import type { CameraRig } from './cameraRig'
import { HideWhenFar } from './Lod'
import { heightAt } from './terrain'

export type RoadClass = 'major' | 'minor' | 'path'

export const ROAD_STYLE: Record<RoadClass, { width: number; color: string; height: number }> = {
  major: { width: 10, color: '#f4f1ea', height: 0.03 },
  minor: { width: 5, color: '#ffffff', height: 0.02 },
  path: { width: 2.5, color: '#d9cdb8', height: 0.01 },
}

/** 땅 위로 띄우는 높이. 땅 메시(약 30m 격자)와 도로를 나누는 간격이 달라 생기는 틈을 덮는다 */
export const GROUND_LIFT_M = 0.35
/** 도로 구간을 이 길이로 잘게 나눠 땅 굴곡을 따라가게 한다 */
const DRAPE_STEP_M = 18

// 모든 타일이 같이 쓴다
const ROAD_MATERIAL = Object.fromEntries(
  (Object.keys(ROAD_STYLE) as RoadClass[]).map((cls) => [
    cls,
    new MeshLambertMaterial({ color: ROAD_STYLE[cls].color, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  ]),
) as Record<RoadClass, MeshLambertMaterial>

/** 멀리 축소하면 일반 도로도 숨긴다 (큰길만 남긴다) */
const MINOR_MAX_CAMERA_DISTANCE_M = 2200

/** 골목길·산책로는 이보다 가까이 볼 때만 (멀리서는 큰길과 일반 도로만) */
const PATH_MAX_CAMERA_DISTANCE_M = 1500

const MAJOR = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'])
const PATH = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'bridleway'])

export function classify(highway: string): RoadClass {
  if (MAJOR.has(highway)) return 'major'
  if (PATH.has(highway)) return 'path'
  return 'minor'
}

/**
 * 구간마다 폭이 있는 사각형(삼각형 2개)을 만들어 하나의 지오메트리로 합친다.
 * 긴 구간은 잘게 나누고, 정점마다 ground(기본: 걷는 높이, 물 위면 다리) + height 만큼 올린다. hint: 높이를 찾을 타일
 */
export function buildRibbon(
  segments: Array<[Vec2, Vec2]>,
  width: number,
  height: number,
  hint?: string,
  ground: (x: number, y: number, hint?: string) => number = heightAt,
): BufferGeometry {
  let pieces = 0
  for (const [a, b] of segments) pieces += Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / DRAPE_STEP_M))
  const vertices = new Float32Array(pieces * 4 * 3)
  const indices = new Uint32Array(pieces * 6)
  const half = width / 2
  const lift = height + GROUND_LIFT_M
  let i = 0

  for (const [a, b] of segments) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * half
    const ny = (dx / len) * half
    const count = Math.max(1, Math.ceil(len / DRAPE_STEP_M))
    // 나눈 점마다 땅 높이 (이웃 조각과 같은 값을 써서 이어지게)
    const ys: number[] = []
    for (let k = 0; k <= count; k++) ys.push(ground(a.x + (dx * k) / count, a.y + (dy * k) / count, hint) + lift)
    for (let k = 0; k < count; k++, i++) {
      const p = { x: a.x + (dx * k) / count, y: a.y + (dy * k) / count }
      const q = { x: a.x + (dx * (k + 1)) / count, y: a.y + (dy * (k + 1)) / count }
      vertices.set(
        [p.x + nx, ys[k], -(p.y + ny), p.x - nx, ys[k], -(p.y - ny), q.x - nx, ys[k + 1], -(q.y - ny), q.x + nx, ys[k + 1], -(q.y + ny)],
        i * 12,
      )
      const v = i * 4
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(vertices, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

interface Props {
  positions: Map<NodeId, Vec2>
  segments: Array<[NodeId, NodeId, string]>
  rig: CameraRig
  tileKey: string
}

export function RoadMesh({ positions, segments, rig, tileKey }: Props) {
  const geometries = useMemo(() => {
    const groups: Record<RoadClass, Array<[Vec2, Vec2]>> = { major: [], minor: [], path: [] }
    for (const [a, b, highway] of segments) {
      const pa = positions.get(a)
      const pb = positions.get(b)
      if (pa && pb) groups[classify(highway)].push([pa, pb])
    }
    return (Object.keys(groups) as RoadClass[]).map((cls) => ({
      cls,
      geometry: buildRibbon(groups[cls], ROAD_STYLE[cls].width, ROAD_STYLE[cls].height, tileKey),
    }))
  }, [positions, segments, tileKey])

  useEffect(() => () => geometries.forEach((g) => g.geometry.dispose()), [geometries])

  return (
    <>
      {geometries.map(({ cls, geometry }) => {
        const mesh = <mesh key={cls} geometry={geometry} material={ROAD_MATERIAL[cls]} />
        if (cls === 'major') return mesh
        return (
          <HideWhenFar key={cls} rig={rig} maxDistance={cls === 'path' ? PATH_MAX_CAMERA_DISTANCE_M : MINOR_MAX_CAMERA_DISTANCE_M}>
            {mesh}
          </HideWhenFar>
        )
      })}
    </>
  )
}

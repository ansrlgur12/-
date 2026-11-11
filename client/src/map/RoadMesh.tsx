import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide } from 'three'
import type { NodeId, Vec2 } from '@jikjwau/shared/types'
import type { CameraRig } from './cameraRig'
import { HideWhenFar } from './Lod'

type RoadClass = 'major' | 'minor' | 'path'

const ROAD_STYLE: Record<RoadClass, { width: number; color: string; height: number }> = {
  major: { width: 10, color: '#f4f1ea', height: 0.03 },
  minor: { width: 5, color: '#ffffff', height: 0.02 },
  path: { width: 2.5, color: '#d9cdb8', height: 0.01 },
}

/** 골목길·산책로는 이보다 가까이 볼 때만 (멀리서는 큰길과 일반 도로만) */
const PATH_MAX_CAMERA_DISTANCE_M = 1500

const MAJOR = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'])
const PATH = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'bridleway'])

function classify(highway: string): RoadClass {
  if (MAJOR.has(highway)) return 'major'
  if (PATH.has(highway)) return 'path'
  return 'minor'
}

/** 구간마다 폭이 있는 사각형(삼각형 2개)을 만들어 하나의 지오메트리로 합친다 */
export function buildRibbon(segments: Array<[Vec2, Vec2]>, width: number, height: number): BufferGeometry {
  const vertices = new Float32Array(segments.length * 4 * 3)
  const indices = new Uint32Array(segments.length * 6)
  const half = width / 2

  segments.forEach(([a, b], i) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * half
    const ny = (dx / len) * half
    const corners = [
      [a.x + nx, a.y + ny],
      [a.x - nx, a.y - ny],
      [b.x - nx, b.y - ny],
      [b.x + nx, b.y + ny],
    ]
    corners.forEach(([x, y], j) => {
      vertices.set([x, height, -y], (i * 4 + j) * 3)
    })
    const v = i * 4
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6)
  })

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
}

export function RoadMesh({ positions, segments, rig }: Props) {
  const geometries = useMemo(() => {
    const groups: Record<RoadClass, Array<[Vec2, Vec2]>> = { major: [], minor: [], path: [] }
    for (const [a, b, highway] of segments) {
      const pa = positions.get(a)
      const pb = positions.get(b)
      if (pa && pb) groups[classify(highway)].push([pa, pb])
    }
    return (Object.keys(groups) as RoadClass[]).map((cls) => ({
      cls,
      geometry: buildRibbon(groups[cls], ROAD_STYLE[cls].width, ROAD_STYLE[cls].height),
    }))
  }, [positions, segments])

  useEffect(() => () => geometries.forEach((g) => g.geometry.dispose()), [geometries])

  return (
    <>
      {geometries.map(({ cls, geometry }) => {
        const mesh = (
          <mesh key={cls} geometry={geometry}>
            <meshLambertMaterial color={ROAD_STYLE[cls].color} side={DoubleSide} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
          </mesh>
        )
        return cls === 'path' ? (
          <HideWhenFar key={cls} rig={rig} maxDistance={PATH_MAX_CAMERA_DISTANCE_M}>
            {mesh}
          </HideWhenFar>
        ) : (
          mesh
        )
      })}
    </>
  )
}

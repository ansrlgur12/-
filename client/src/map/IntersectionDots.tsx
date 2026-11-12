import { useLayoutEffect, useMemo, useRef } from 'react'
import { Matrix4, type InstancedMesh } from 'three'
import type { NodeId, Vec2 } from '@jikjwau/shared/types'
import { GROUND_LIFT_M } from './RoadMesh'
import { heightAt } from './terrain'

/** 원판 중심 높이. 도로(0.01~0.03)보다 위 */
const DOT_HEIGHT = 0.15

interface Props {
  positions: Map<NodeId, Vec2>
  segments: Array<[NodeId, NodeId, string]>
  tileKey: string
}

/** 길이 3개 이상 만나는 노드(교차로)를 작은 원판으로 표시한다. 판정 검증용 */
export function IntersectionDots({ positions, segments, tileKey }: Props) {
  const ref = useRef<InstancedMesh>(null)

  const points = useMemo(() => {
    const degree = new Map<NodeId, number>()
    for (const [a, b] of segments) {
      degree.set(a, (degree.get(a) ?? 0) + 1)
      degree.set(b, (degree.get(b) ?? 0) + 1)
    }
    return [...degree].filter(([, d]) => d >= 3).flatMap(([id]) => positions.get(id) ?? [])
  }, [positions, segments])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new Matrix4()
    points.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, heightAt(p.x, p.y, tileKey) + GROUND_LIFT_M + DOT_HEIGHT, -p.y)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [points, tileKey])

  if (points.length === 0) return null

  return (
    <instancedMesh key={points.length} ref={ref} args={[undefined, undefined, points.length]}>
      <cylinderGeometry args={[1.6, 1.6, 0.1, 12]} />
      {/* 도로(-4)·지나온 길(-6)보다 앞에 그려지게 */}
      <meshLambertMaterial color="#f59e0b" polygonOffset polygonOffsetFactor={-8} polygonOffsetUnits={-8} />
    </instancedMesh>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import type { Group, Vector3 } from 'three'
import type { NodeId, Vec2 } from '@jikjwau/shared/types'
import { toWorld } from './coords'

/** 검증용이라 실제 걸음보다 훨씬 빠르게 움직인다 */
const MOVE_SPEED_MPS = 40

interface Props {
  positions: Map<NodeId, Vec2>
  nodeId: NodeId
  movePath: NodeId[] | null
  onArrive: () => void
  /** 카메라가 따라가도록 현재 위치를 써 넣는다 */
  positionOut: Vector3
}

/** 일행 마커. Phase 5에서 3D 캐릭터 3명으로 바뀐다 */
export function Party({ positions, nodeId, movePath, onArrive, positionOut }: Props) {
  const ref = useRef<Group>(null)
  const traveled = useRef(0)

  const route = useMemo(() => {
    if (!movePath) return null
    const points = movePath.map((id) => positions.get(id)!)
    const lengths = [0]
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
    }
    return { points, lengths, total: lengths[lengths.length - 1] }
  }, [movePath, positions])

  useEffect(() => {
    traveled.current = 0
    if (!route) toWorld(positions.get(nodeId)!, 0, positionOut)
  }, [route, nodeId, positions, positionOut])

  useFrame((_, delta) => {
    if (route) {
      traveled.current = Math.min(traveled.current + MOVE_SPEED_MPS * delta, route.total)
      const d = traveled.current
      let i = 1
      while (i < route.lengths.length - 1 && route.lengths[i] < d) i++
      const a = route.points[i - 1]
      const b = route.points[i]
      const segLen = route.lengths[i] - route.lengths[i - 1]
      const t = segLen > 0 ? (d - route.lengths[i - 1]) / segLen : 1
      toWorld({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 0, positionOut)
      if (d >= route.total) onArrive()
    }
    ref.current?.position.copy(positionOut)
  })

  return (
    <group ref={ref}>
      <mesh position={[0, 3, 0]}>
        <capsuleGeometry args={[1.8, 3, 4, 12]} />
        <meshLambertMaterial color="#6366f1" />
      </mesh>
    </group>
  )
}

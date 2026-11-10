import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { NodeId, Vec2 } from '@jikjwau/shared/types'
import type { Choice } from '../store/roadExplorer'
import { toWorld } from './coords'

export const CHOICE_COLOR: Record<string, string> = {
  left: '#3b82f6',
  straight: '#22c55e',
  right: '#ef4444',
  start: '#f59e0b',
  uturn: '#a855f7',
}

const ARROW_DISTANCE_M = 14
const UP = new Vector3(0, 1, 0)

interface Props {
  positions: Map<NodeId, Vec2>
  nodeId: NodeId
  choices: Choice[]
}

/** 고를 수 있는 방향마다 그 길 쪽으로 화살표(원뿔)를 세운다 */
export function ChoiceArrows({ positions, nodeId, choices }: Props) {
  const arrows = useMemo(() => {
    const here = positions.get(nodeId)!
    return choices.flatMap((c) => {
      const next = positions.get(c.via)
      if (!next) return []
      const dir = new Vector3(next.x - here.x, 0, -(next.y - here.y)).normalize()
      const position = toWorld(here, 2).addScaledVector(dir, ARROW_DISTANCE_M)
      const quaternion = new Quaternion().setFromUnitVectors(UP, dir)
      return [{ key: c.via, position, quaternion, color: CHOICE_COLOR[c.direction ?? c.kind] }]
    })
  }, [positions, nodeId, choices])

  return (
    <>
      {arrows.map((a) => (
        <mesh key={a.key} position={a.position} quaternion={a.quaternion}>
          <coneGeometry args={[2.5, 6, 12]} />
          <meshLambertMaterial color={a.color} />
        </mesh>
      ))}
    </>
  )
}

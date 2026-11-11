import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { Direction, Point } from '@jikjwau/shared/types'

export const DIRECTION_COLOR: Record<Direction, string> = {
  left: '#3b82f6',
  straight: '#22c55e',
  right: '#ef4444',
}

const ARROW_DISTANCE_M = 14
const UP = new Vector3(0, 1, 0)

interface Props {
  here: Point
  options: Array<{ direction: Direction; toward: Point }>
}

/** 이번 가위바위보에서 갈 수 있는 방향마다 그 길 쪽으로 화살표(원뿔)를 세운다 */
export function ChoiceArrows({ here, options }: Props) {
  const arrows = useMemo(
    () =>
      options.map((o) => {
        const dir = new Vector3(o.toward[0] - here[0], 0, -(o.toward[1] - here[1])).normalize()
        const position = new Vector3(here[0], 2, -here[1]).addScaledVector(dir, ARROW_DISTANCE_M)
        const quaternion = new Quaternion().setFromUnitVectors(UP, dir)
        return { key: o.direction, position, quaternion, color: DIRECTION_COLOR[o.direction] }
      }),
    [here, options],
  )

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

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber/native'
import { Vector3 } from 'three'

/** 남쪽 위에서 비스듬히 내려다보는 방향 */
const VIEW_DIR = new Vector3(0, 1, 0.75).normalize()

interface Props {
  target: Vector3
  distance: number
}

export function FollowCamera({ target, distance }: Props) {
  const camera = useThree((s) => s.camera)
  const desired = useRef(new Vector3())
  const lookAt = useRef(new Vector3())

  useFrame((_, delta) => {
    desired.current.copy(target).addScaledVector(VIEW_DIR, distance)
    const t = 1 - Math.exp(-delta * 6)
    camera.position.lerp(desired.current, t)
    lookAt.current.lerp(target, t)
    camera.lookAt(lookAt.current)
  })

  return null
}

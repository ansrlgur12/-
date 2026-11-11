import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber/native'
import { Fog, Vector3 } from 'three'
import type { CameraRig } from './cameraRig'

interface Props {
  target: Vector3
  rig: CameraRig
}

/**
 * rig.focus를 중심으로 rig의 거리·회전·기울기대로 카메라를 둔다. 값은 부드럽게 따라간다.
 * rig.following이면 focus를 target(일행)에 맞춘다. 지도를 끌면 풀린다.
 */
export function FollowCamera({ target, rig }: Props) {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const lookAt = useRef(new Vector3())
  const current = useRef({ ...rig })

  useFrame((_, delta) => {
    const t = 1 - Math.exp(-delta * 10)
    const c = current.current
    c.distance += (rig.distance - c.distance) * t
    c.yaw += (rig.yaw - c.yaw) * t
    c.pitch += (rig.pitch - c.pitch) * t
    if (rig.following) {
      rig.focus.copy(target)
      lookAt.current.lerp(rig.focus, t)
    } else {
      // 끄는 동안에는 손가락을 바로 따라가야 자연스럽다
      lookAt.current.copy(rig.focus)
    }

    const horizontal = Math.cos(c.pitch) * c.distance
    camera.position.set(
      lookAt.current.x + Math.sin(c.yaw) * horizontal,
      lookAt.current.y + Math.sin(c.pitch) * c.distance,
      lookAt.current.z + Math.cos(c.yaw) * horizontal,
    )
    camera.lookAt(lookAt.current)

    // 멀리서 내려다볼 때도 일행 주변은 안개에 가리지 않게
    if (scene.fog instanceof Fog) {
      scene.fog.near = c.distance + 600
      scene.fog.far = c.distance * 1.5 + 2000
    }
  })

  return null
}

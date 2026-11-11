import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber/native'
import type { Group } from 'three'
import type { CameraRig } from './cameraRig'

/** 카메라가 maxDistance보다 멀어지면(축소하면) 안의 것을 숨긴다. 리렌더 없이 매 프레임 확인 */
export function HideWhenFar({ rig, maxDistance, children }: { rig: CameraRig; maxDistance: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.visible = rig.distance <= maxDistance
  })
  return <group ref={ref}>{children}</group>
}

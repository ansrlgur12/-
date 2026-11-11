import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import { AdditiveBlending, BufferAttribute, CylinderGeometry, DoubleSide, type Group } from 'three'
import type { Point } from '@jikjwau/shared/types'
import type { CameraRig } from './cameraRig'
import type { ScenePicker } from './scenePicker'

const COLOR = '#e11d48'

/** 깃대. 목적지는 빨강, 출발지는 초록 */
export function FlagMarker({ point, color }: { point: Point; color: string }) {
  const [x, y] = point
  return (
    <group position={[x, 0, -y]}>
      <mesh position={[0, 12, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 24, 8]} />
        <meshLambertMaterial color="#374151" />
      </mesh>
      <mesh position={[4, 21, 0]}>
        <boxGeometry args={[8, 5, 0.4]} />
        <meshLambertMaterial color={color} />
      </mesh>
    </group>
  )
}

/** 핀 높이(m). 카메라가 멀어지면 이 배율로 키운다 */
export const PIN_HEIGHT_M = 22
const PIN_SCALE_PER_DISTANCE = 1 / 220
const PIN_COLOR = '#f59e0b'

/** 고르는 중인 위치: 땅에 꽂힌 큰 핀. 끌어서 옮길 수 있도록 위치·높이를 picker에 알린다 */
export function PickMarker({ point, rig, picker }: { point: Point; rig: CameraRig; picker: ScenePicker }) {
  const ref = useRef<Group>(null)
  const [x, y] = point

  useFrame(() => {
    const k = Math.max(1, rig.distance * PIN_SCALE_PER_DISTANCE)
    ref.current?.scale.setScalar(k)
    picker.pin = { x, z: -y, height: PIN_HEIGHT_M * k }
  })
  useEffect(() => () => void (picker.pin = null), [picker])

  return (
    <group ref={ref} position={[x, 0, -y]}>
      {/* 머리 */}
      <mesh position={[0, PIN_HEIGHT_M - 5, 0]}>
        <sphereGeometry args={[5, 20, 14]} />
        <meshLambertMaterial color={PIN_COLOR} />
      </mesh>
      {/* 끝이 땅에 닿는 몸통 */}
      <mesh position={[0, (PIN_HEIGHT_M - 8) / 2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[3.2, PIN_HEIGHT_M - 8, 16]} />
        <meshLambertMaterial color={PIN_COLOR} />
      </mesh>
      {/* 꽂힌 자리 그림자 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <circleGeometry args={[4, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.25} />
      </mesh>
    </group>
  )
}

const BEAM_HEIGHT_M = 1500
const BEAM_RADIUS_M = 5
/** 멀리 축소해도 가늘어 보이지 않게 카메라 거리에 맞춰 굵힌다 */
const BEAM_SCALE_PER_DISTANCE = 1 / 200

/** 아래는 진하고 위로 갈수록 흐려지는 원기둥 (정점 알파) */
function buildBeam(radius: number) {
  const geometry = new CylinderGeometry(radius, radius, BEAM_HEIGHT_M, 20, 8, true)
  geometry.translate(0, BEAM_HEIGHT_M / 2, 0)
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 4)
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / BEAM_HEIGHT_M
    colors.set([1, 0.45, 0.55, (1 - t) ** 1.5], i * 4)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 4))
  return geometry
}

/** 하늘로 솟은 빛기둥. 안개에 가리지 않아 멀리서도 보인다 */
function LightBeam({ rig }: { rig: CameraRig }) {
  const ref = useRef<Group>(null)
  const core = useMemo(() => buildBeam(BEAM_RADIUS_M * 0.45), [])
  const glow = useMemo(() => buildBeam(BEAM_RADIUS_M), [])
  useEffect(
    () => () => {
      core.dispose()
      glow.dispose()
    },
    [core, glow],
  )

  useFrame(() => {
    const k = Math.max(1, rig.distance * BEAM_SCALE_PER_DISTANCE)
    ref.current?.scale.set(k, 1, k)
  })

  const material = (opacity: number) => (
    <meshBasicMaterial
      vertexColors
      transparent
      opacity={opacity}
      blending={AdditiveBlending}
      depthWrite={false}
      side={DoubleSide}
      fog={false}
      toneMapped={false}
    />
  )

  return (
    <group ref={ref}>
      <mesh geometry={glow} renderOrder={10}>
        {material(0.35)}
      </mesh>
      <mesh geometry={core} renderOrder={11}>
        {material(0.8)}
      </mesh>
    </group>
  )
}

/** 목적지 깃대, 도착 반경, 빛기둥 */
export function DestinationMarker({ point, radiusM, rig }: { point: Point; radiusM: number; rig: CameraRig }) {
  const [x, y] = point
  return (
    <>
      <FlagMarker point={point} color={COLOR} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.05, -y]}>
        <ringGeometry args={[radiusM - 1.5, radiusM, 48]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.7} />
      </mesh>
      <group position={[x, 0, -y]}>
        <LightBeam rig={rig} />
      </group>
    </>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import { AdditiveBlending, BufferAttribute, Color, CylinderGeometry, DoubleSide, LatheGeometry, PlaneGeometry, Vector2, type Group } from 'three'
import type { Point } from '@jikjwau/shared/types'
import type { CameraRig } from './cameraRig'
import type { ScenePicker } from './scenePicker'
import { heightAt } from './terrain'

const COLOR = '#e11d48'

/** 깃발 크기(m). 카메라가 멀어지면 이 배율로 키워 멀리서도 잘 보이게 */
const FLAG_POLE_M = 30
const FLAG_W = 14
const FLAG_H = 9
const FLAG_SCALE_PER_DISTANCE = 1 / 240
/** 천이 펄럭이는 세기와 빠르기 */
const WAVE_AMP = 1.3
const WAVE_SPEED = 3.2

/** 펄럭이는 천: 깃대 쪽은 고정, 끝으로 갈수록 크게 흔들린다. 가운데에 흰 띠 */
function buildCloth(color: string) {
  const geometry = new PlaneGeometry(FLAG_W, FLAG_H, 16, 6)
  geometry.translate(FLAG_W / 2, 0, 0)
  const pos = geometry.getAttribute('position')
  const base = new Color(color)
  const light = base.clone().lerp(new Color('#ffffff'), 0.85)
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const c = Math.abs(y) < FLAG_H * 0.12 ? light : base
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

/** 깃발. 목적지는 빨강, 출발지는 초록. 흰 깃대 끝에 금색 구슬, 천은 바람에 펄럭인다 */
export function FlagMarker({ point, color, rig }: { point: Point; color: string; rig: CameraRig }) {
  const ref = useRef<Group>(null)
  const cloth = useMemo(() => buildCloth(color), [color])
  const rest = useMemo(() => Float32Array.from(cloth.getAttribute('position').array as Float32Array), [cloth])
  useEffect(() => () => cloth.dispose(), [cloth])
  const [x, y] = point

  useFrame(({ clock }) => {
    const group = ref.current
    if (!group) return
    group.scale.setScalar(Math.max(1, rig.distance * FLAG_SCALE_PER_DISTANCE))
    group.position.y = heightAt(x, y)
    // 천이 늘 카메라 쪽 옆면을 보이게
    group.rotation.y = rig.yaw
    const pos = cloth.getAttribute('position') as BufferAttribute
    const t = clock.elapsedTime * WAVE_SPEED
    for (let i = 0; i < pos.count; i++) {
      const px = rest[i * 3]
      const k = px / FLAG_W
      pos.setZ(i, Math.sin(px * 0.45 - t) * WAVE_AMP * k)
      pos.setY(i, rest[i * 3 + 1] - k * k * 0.8 + Math.sin(px * 0.3 - t * 0.7) * 0.25 * k)
    }
    pos.needsUpdate = true
    cloth.computeVertexNormals()
  })

  return (
    <group ref={ref} position={[x, 0, -y]}>
      {/* 받침 */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[2.4, 3, 1.2, 20]} />
        <meshLambertMaterial color="#e2e8f0" />
      </mesh>
      {/* 깃대 */}
      <mesh position={[0, FLAG_POLE_M / 2, 0]}>
        <cylinderGeometry args={[0.45, 0.6, FLAG_POLE_M, 12]} />
        <meshLambertMaterial color="#f8fafc" />
      </mesh>
      {/* 꼭대기 금색 구슬 */}
      <mesh position={[0, FLAG_POLE_M + 0.9, 0]}>
        <sphereGeometry args={[1.3, 16, 12]} />
        <meshLambertMaterial color="#fbbf24" emissive="#7c4a03" />
      </mesh>
      <mesh geometry={cloth} position={[0.5, FLAG_POLE_M - FLAG_H / 2 - 0.6, 0]}>
        <meshLambertMaterial vertexColors side={DoubleSide} />
      </mesh>
      {/* 꽂힌 자리 그림자 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <circleGeometry args={[4.5, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>
    </group>
  )
}

/** 핀 높이(m). 카메라가 멀어지면 이 배율로 키운다 */
export const PIN_HEIGHT_M = 24
const PIN_SCALE_PER_DISTANCE = 1 / 220
const PIN_COLOR = '#ef4444'
const PIN_HEAD_RADIUS = 6.5

/**
 * 지도 앱 마커 모양(물방울을 거꾸로 세운 모양)의 옆모습을 돌려 만든다.
 * 끝(0, 0)에서 머리 원에 접하는 선을 긋고, 접점부터 원 위쪽을 따라 꼭대기까지.
 */
function buildMarkerGeometry() {
  const r = PIN_HEAD_RADIUS
  const h = PIN_HEIGHT_M - r
  const alpha = Math.asin(r / h)
  const points = [new Vector2(0, 0)]
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const a = -alpha + ((Math.PI / 2 + alpha) * i) / steps
    points.push(new Vector2(Math.max(0.0001, r * Math.cos(a)), h + r * Math.sin(a)))
  }
  return new LatheGeometry(points, 32)
}

/** 고르는 중인 위치: 땅에 꽂힌 빨간 마커. 끌어서 옮길 수 있도록 위치·높이를 picker에 알린다 */
export function PickMarker({ point, rig, picker }: { point: Point; rig: CameraRig; picker: ScenePicker }) {
  const ref = useRef<Group>(null)
  const geometry = useMemo(buildMarkerGeometry, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  const [x, y] = point

  useFrame(() => {
    const k = Math.max(1, rig.distance * PIN_SCALE_PER_DISTANCE)
    const ground = heightAt(x, y)
    const group = ref.current
    if (group) {
      group.scale.setScalar(k)
      group.position.y = ground
      // 가운데 흰 원이 늘 보이게 카메라 쪽으로 돌린다
      group.rotation.y = rig.yaw
    }
    picker.pin = { x, y: ground, z: -y, height: PIN_HEIGHT_M * k }
  })
  useEffect(() => () => void (picker.pin = null), [picker])

  return (
    <group ref={ref} position={[x, 0, -y]}>
      <mesh geometry={geometry}>
        <meshLambertMaterial color={PIN_COLOR} />
      </mesh>
      {/* 마커 가운데 흰 원 */}
      <mesh position={[0, PIN_HEIGHT_M - PIN_HEAD_RADIUS, PIN_HEAD_RADIUS + 0.05]}>
        <circleGeometry args={[PIN_HEAD_RADIUS * 0.42, 24]} />
        <meshBasicMaterial color="#ffffff" />
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
    colors.set([1, 0.85, 0.25, (1 - t) ** 1.5], i * 4)
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
  const ground = heightAt(x, y)
  return (
    <>
      <FlagMarker point={point} color={COLOR} rig={rig} />
      {/* 비탈에서도 보이게 도착 반경 고리는 조금 띄우고 깊이 검사를 끈다 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, ground + 1, -y]} renderOrder={5}>
        <ringGeometry args={[radiusM - 1.5, radiusM, 48]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.7} depthTest={false} />
      </mesh>
      <group position={[x, ground, -y]}>
        <LightBeam rig={rig} />
      </group>
    </>
  )
}

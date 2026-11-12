import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import type { Group } from 'three'
import type { LatLng } from '@jikjwau/shared/types'
import { project } from '@jikjwau/shared/geo'
import { useMapTiles } from '../store/mapTiles'
import { nightMaterials } from './daylight'
import { hasTerrain, terrainHeightAt } from './terrain'

/** 남산 꼭대기 탑. 지도 데이터에 건물로 없어서 직접 세운다 */
const TOWER_LATLNG: LatLng = { lat: 37.55119, lng: 126.98823 }
/** 땅 높이를 아직 모를 때 쓰는 탑 바닥 해발(m) */
const DEFAULT_BASE_M = 243
/** 출발지에서 이보다 멀면 그리지 않는다 */
const MAX_DISTANCE_M = 8000

const WHITE = '#eef1f4'
const GLASS = '#4b5d73'
const RED = '#e04848'

function Cyl({ y, h, r0, r1 = r0, color, seg = 20 }: { y: number; h: number; r0: number; r1?: number; color: string; seg?: number }) {
  return (
    <mesh position={[0, y + h / 2, 0]}>
      <cylinderGeometry args={[r1, r0, h, seg]} />
      <meshLambertMaterial color={color} />
    </mesh>
  )
}

/**
 * 받침 건물 → 가늘어지는 기둥 → 전망대 → 빨강·흰색 줄무늬 안테나 (전체 약 236m).
 * 밤에는 전망대 둘레가 켜지고 꼭대기 항공등이 깜빡인다.
 */
export function SeoulTower() {
  const origin = useMapTiles((s) => s.origin)
  const ref = useRef<Group>(null)
  const at = useMemo(() => (origin ? project(TOWER_LATLNG, origin) : { x: 1e9, y: 1e9 }), [origin])
  const far = Math.hypot(at.x, at.y) > MAX_DISTANCE_M

  // 남산 땅이 들어오면 그 높이에 세운다
  useFrame(() => {
    if (ref.current) ref.current.position.y = hasTerrain(at.x, at.y) ? terrainHeightAt(at.x, at.y) : DEFAULT_BASE_M
  })

  if (far) return null
  const mast = [0, 1, 2, 3, 4, 5, 6, 7]
  return (
    <group ref={ref} position={[at.x, DEFAULT_BASE_M, -at.y]}>
      <Cyl y={-6} h={24} r0={16} r1={14} color={WHITE} />
      <Cyl y={18} h={102} r0={5.5} r1={4.2} color={WHITE} />
      {/* 전망대 */}
      <Cyl y={118} h={4} r0={9} r1={13} color={WHITE} />
      <Cyl y={122} h={16} r0={13} color={GLASS} />
      <mesh position={[0, 130, 0]} material={nightMaterials.lampHead}>
        <cylinderGeometry args={[13.3, 13.3, 1.2, 24, 1, true]} />
      </mesh>
      <Cyl y={138} h={4} r0={13} r1={10} color={WHITE} />
      <Cyl y={142} h={10} r0={9} color={GLASS} />
      <Cyl y={152} h={4} r0={9} r1={5} color={WHITE} />
      {/* 안테나: 빨강·흰색 번갈아 */}
      {mast.map((i) => (
        <Cyl key={i} y={156 + i * 10} h={10} r0={2.2 - i * 0.18} r1={2.2 - (i + 1) * 0.18} color={i % 2 ? WHITE : RED} seg={10} />
      ))}
      <mesh position={[0, 237, 0]} material={nightMaterials.beacon}>
        <boxGeometry args={[2, 2, 2]} />
      </mesh>
    </group>
  )
}

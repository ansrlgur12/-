import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import { MAP_LOAD_RADIUS_M, MAP_LOAD_RADIUS_MAX_M } from '@jikjwau/shared/config'
import { useMapTiles } from '../store/mapTiles'
import { clamp, type CameraRig } from './cameraRig'

/** 이만큼 움직이면 주변 타일을 다시 확인한다 */
const REFOCUS_DISTANCE_M = 100
/** 움직이지 않아도 이 간격으로 다시 확인한다 (실패한 타일 재시도) */
const REFOCUS_INTERVAL_S = 5
/** 멀리 축소할수록 넓게 불러온다 (카메라 거리 대비) */
const RADIUS_PER_DISTANCE = 0.9

/** 카메라가 바라보는 곳을 따라 지도 타일을 불러오게 한다. 그리는 것은 없다 */
export function TileStreamer({ rig }: { rig: CameraRig }) {
  const last = useRef<{ x: number; z: number; radius: number } | null>(null)
  const elapsed = useRef(0)
  const origin = useMapTiles((s) => s.origin)

  // 새 지역을 불러오면 바로 다시 확인한다
  useEffect(() => {
    last.current = null
  }, [origin])

  useFrame((_, delta) => {
    elapsed.current += delta
    const { x, z } = rig.focus
    const radius = Math.round(clamp(rig.distance * RADIUS_PER_DISTANCE, MAP_LOAD_RADIUS_M, MAP_LOAD_RADIUS_MAX_M) / 250) * 250
    const changed =
      !last.current || Math.hypot(x - last.current.x, z - last.current.z) > REFOCUS_DISTANCE_M || radius !== last.current.radius
    if (!changed && elapsed.current < REFOCUS_INTERVAL_S) return
    last.current = { x, z, radius }
    elapsed.current = 0
    // 월드(x, -z) → 로컬(x 동쪽, y 북쪽)
    useMapTiles.getState().focus({ x, y: -z }, radius)
  })

  return null
}

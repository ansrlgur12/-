import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import type { Group, Vector3 } from 'three'
import type { Point, Seat } from '@jikjwau/shared/types'
import { MOVE_SPEED_MPS, SEAT_DIRECTION } from '@jikjwau/shared/config'
import { DIRECTION_COLOR } from './ChoiceArrows'
import { Person, type PersonHandle } from './Person'
import type { CameraRig } from './cameraRig'

interface Props {
  /** 서 있는 곳 */
  position: Point
  /** 이동 중인 경로. 끝까지 가면 onArrive */
  route: Point[] | null
  onArrive: () => void
  /** 카메라가 따라가도록 현재 위치를 써 넣는다 */
  positionOut: Vector3
  mySeat?: Seat
  rig: CameraRig
}

/** 맡은 방향대로 선다: A(좌) 왼쪽, B(직) 가운데 앞, C(우) 오른쪽. 일행 기준 [오른쪽, 앞] m */
const FORMATION: Record<Seat, [number, number]> = { A: [-3.4, 0], B: [0, 1.6], C: [3.4, 0] }
const SEATS: Seat[] = ['A', 'B', 'C']
/** 한 걸음 주기 (m당 라디안) */
const STEP_PHASE_PER_M = 0.9
/** 멀리 축소해도 보이게 카메라 거리에 맞춰 키운다 */
const SCALE_PER_DISTANCE = 1 / 220

/** 일행 3명. 실제 도로를 따라 걷고, 가는 방향을 바라본다 */
export function Party({ position, route, onArrive, positionOut, mySeat, rig }: Props) {
  const ref = useRef<Group>(null)
  const people = useRef<Record<Seat, PersonHandle | null>>({ A: null, B: null, C: null })
  const traveled = useRef(0)
  const arrived = useRef(false)
  const heading = useRef(0)
  const phase = useRef(0)
  const walk = useRef(0)

  const track = useMemo(() => {
    if (!route) return null
    const lengths = [0]
    for (let i = 1; i < route.length; i++) {
      lengths.push(lengths[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]))
    }
    return { points: route, lengths, total: lengths[lengths.length - 1] }
  }, [route])

  useEffect(() => {
    traveled.current = 0
    arrived.current = false
    if (!track) positionOut.set(position[0], 0, -position[1])
  }, [track, position, positionOut])

  useFrame((_, delta) => {
    const moving = !!track && !arrived.current
    if (moving) {
      traveled.current = Math.min(traveled.current + MOVE_SPEED_MPS * delta, track.total)
      const d = traveled.current
      let i = 1
      while (i < track.lengths.length - 1 && track.lengths[i] < d) i++
      const a = track.points[i - 1]
      const b = track.points[Math.min(i, track.points.length - 1)]
      const segLen = track.lengths[i] - track.lengths[i - 1]
      const t = segLen > 0 ? (d - track.lengths[i - 1]) / segLen : 1
      positionOut.set(a[0] + (b[0] - a[0]) * t, 0, -(a[1] + (b[1] - a[1]) * t))
      // 지금 걷는 구간 방향을 바라본다 (월드 -z가 북쪽)
      if (segLen > 0) heading.current = Math.atan2(-(b[0] - a[0]), b[1] - a[1])
      phase.current += MOVE_SPEED_MPS * delta * STEP_PHASE_PER_M
      if (d >= track.total) {
        arrived.current = true
        onArrive()
      }
    }

    // 걷기 ↔ 멈춤을 부드럽게
    walk.current += ((moving ? 1 : 0) - walk.current) * Math.min(1, delta * 8)
    if (!moving) phase.current += delta * 2 * walk.current

    const group = ref.current
    if (group) {
      group.position.copy(positionOut)
      // 돌 때 가까운 쪽으로 부드럽게
      let diff = heading.current - group.rotation.y
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      group.rotation.y += diff * Math.min(1, delta * 10)
      const k = Math.max(1, rig.distance * SCALE_PER_DISTANCE)
      group.scale.setScalar(k)
    }
    for (const seat of SEATS) people.current[seat]?.pose(phase.current + (seat === 'B' ? Math.PI / 2 : 0), walk.current)
  })

  return (
    <group ref={ref}>
      {SEATS.map((seat) => {
        const [right, forward] = FORMATION[seat]
        return (
          <group key={seat} position={[right, 0, -forward]}>
            <Person
              ref={(h) => {
                people.current[seat] = h
              }}
              color={DIRECTION_COLOR[SEAT_DIRECTION[seat]]}
              mine={seat === mySeat}
            />
          </group>
        )
      })}
    </group>
  )
}

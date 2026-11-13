import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import { Vector3, type Group } from 'three'
import type { Outfit, Point, Seat } from '@jikjwau/shared/types'
import { EMOTE_SHOW_MS, MOVE_SPEED_MPS, moveSpeedAt, SEAT_DIRECTION } from '@jikjwau/shared/config'
import { activeEmotes, emoteAnchors } from '../store/social'
import { DIRECTION_COLOR } from './ChoiceArrows'
import { PERSON_HEIGHT, Person, type PersonHandle } from './Person'
import type { CameraRig } from './cameraRig'
import { heightAt } from './terrain'

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
  outfits: Record<Seat, Outfit>
  /** 다른 방 일행 (반투명) */
  ghost?: boolean
  /** 이모티콘을 찾고 말풍선 위치를 남길 캐릭터 key */
  emoteKey: (seat: Seat) => string
}

/** 맡은 방향대로 선다: A(좌) 왼쪽, B(직) 가운데 앞, C(우) 오른쪽. 일행 기준 [오른쪽, 앞] m */
const FORMATION: Record<Seat, [number, number]> = { A: [-3.4, 0], B: [0, 1.6], C: [3.4, 0] }
const SEATS: Seat[] = ['A', 'B', 'C']
/** 한 걸음 주기 (m당 라디안) */
const STEP_PHASE_PER_M = 0.9
/** 멀리 축소해도 보이게 카메라 거리에 맞춰 키운다 */
const SCALE_PER_DISTANCE = 1 / 220

/** 일행 3명. 실제 도로를 따라 걷고, 가는 방향을 바라본다 */
export function Party({ position, route, onArrive, positionOut, mySeat, rig, outfits, ghost, emoteKey }: Props) {
  const ref = useRef<Group>(null)
  const people = useRef<Record<Seat, PersonHandle | null>>({ A: null, B: null, C: null })
  const spots = useRef<Record<Seat, Group | null>>({ A: null, B: null, C: null })
  const keys = useMemo(() => Object.fromEntries(SEATS.map((s) => [s, emoteKey(s)])) as Record<Seat, string>, [emoteKey])

  // 말풍선 위치는 이 일행이 있는 동안만
  useEffect(() => {
    for (const seat of SEATS) emoteAnchors.set(keys[seat], new Vector3(0, -1e6, 0))
    return () => {
      for (const seat of SEATS) emoteAnchors.delete(keys[seat])
    }
  }, [keys])
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
    if (!track) positionOut.set(position[0], heightAt(position[0], position[1]), -position[1])
  }, [track, position, positionOut])

  useFrame((_, delta) => {
    const moving = !!track && !arrived.current
    if (moving) {
      // 긴 길은 점점 빨라졌다가 다음 교차로 앞에서 다시 걷는다 (서버도 같은 속도로 시간을 잰다)
      const speed = moveSpeedAt(traveled.current, track.total)
      traveled.current = Math.min(traveled.current + speed * delta, track.total)
      const d = traveled.current
      let i = 1
      while (i < track.lengths.length - 1 && track.lengths[i] < d) i++
      const a = track.points[i - 1]
      const b = track.points[Math.min(i, track.points.length - 1)]
      const segLen = track.lengths[i] - track.lengths[i - 1]
      const t = segLen > 0 ? (d - track.lengths[i - 1]) / segLen : 1
      const x = a[0] + (b[0] - a[0]) * t
      const y = a[1] + (b[1] - a[1]) * t
      positionOut.set(x, heightAt(x, y), -y)
      // 지금 걷는 구간 방향을 바라본다 (월드 -z가 북쪽)
      if (segLen > 0) heading.current = Math.atan2(-(b[0] - a[0]), b[1] - a[1])
      // 다리 움직임은 기본 속도의 두 배까지만 빨라진다 (그 이상은 정신없어 보여서)
      phase.current += Math.min(speed, MOVE_SPEED_MPS * 2) * delta * STEP_PHASE_PER_M
      if (d >= track.total) {
        arrived.current = true
        onArrive()
      }
    }

    // 걷기 ↔ 멈춤을 부드럽게
    walk.current += ((moving ? 1 : 0) - walk.current) * Math.min(1, delta * 8)
    if (!moving) phase.current += delta * 2 * walk.current

    // 서 있을 때도 땅 높이를 다시 본다 (지형이 늦게 도착할 수 있다)
    if (!moving) positionOut.y = heightAt(positionOut.x, -positionOut.z)
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
    const now = Date.now()
    for (const seat of SEATS) {
      const e = activeEmotes.get(keys[seat])
      const act = e && now - e.at < EMOTE_SHOW_MS ? { emote: e.emote, t: (now - e.at) / 1000 } : undefined
      people.current[seat]?.pose(phase.current + (seat === 'B' ? Math.PI / 2 : 0), walk.current, act)
      const spot = spots.current[seat]
      const anchor = emoteAnchors.get(keys[seat])
      if (spot && anchor) {
        spot.getWorldPosition(anchor)
        anchor.y += PERSON_HEIGHT * (group?.scale.y ?? 1)
      }
    }
  })

  return (
    <group ref={ref}>
      {SEATS.map((seat) => {
        const [right, forward] = FORMATION[seat]
        return (
          <group
            key={seat}
            position={[right, 0, -forward]}
            ref={(g) => {
              spots.current[seat] = g
            }}
          >
            <Person
              ref={(h) => {
                people.current[seat] = h
              }}
              outfit={outfits[seat]}
              ring={DIRECTION_COLOR[SEAT_DIRECTION[seat]]}
              mine={seat === mySeat}
              ghost={ghost}
            />
          </group>
        )
      })}
    </group>
  )
}

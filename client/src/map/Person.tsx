import { forwardRef, useImperativeHandle, useRef, type RefObject } from 'react'
import type { Group } from 'three'

/** 걷기 애니메이션을 밖(Party의 useFrame)에서 매 프레임 넣는다 */
export interface PersonHandle {
  /** phase: 걸음 주기 각도, amount: 0(서 있음) ~ 1(걷는 중) */
  pose: (phase: number, amount: number) => void
}

const SKIN = '#f2c9a0'
const PANTS = '#374151'
const SHOE = '#1f2937'

// 실제 사람보다 크게 (게임 시점에서 잘 보이게). 단위 m
const LEG = 2.2
const BODY = 2.4
const HEAD = 0.95
const ARM = 2.0
const STRIDE_RAD = 0.7

/**
 * 로우폴리 사람. 앞이 -z(월드 북쪽)를 보도록 만든다.
 * 다리는 엉덩이, 팔은 어깨를 축으로 흔든다.
 */
export const Person = forwardRef<PersonHandle, { color: string; mine?: boolean }>(function Person({ color, mine }, ref) {
  const leftLeg = useRef<Group>(null)
  const rightLeg = useRef<Group>(null)
  const leftArm = useRef<Group>(null)
  const rightArm = useRef<Group>(null)
  const body = useRef<Group>(null)

  useImperativeHandle(ref, () => ({
    pose(phase, amount) {
      const swing = Math.sin(phase) * STRIDE_RAD * amount
      leftLeg.current?.rotation.set(swing, 0, 0)
      rightLeg.current?.rotation.set(-swing, 0, 0)
      leftArm.current?.rotation.set(-swing * 0.8, 0, 0.12)
      rightArm.current?.rotation.set(swing * 0.8, 0, -0.12)
      // 걸을 때 위아래로 살짝 들썩인다
      if (body.current) body.current.position.y = Math.abs(Math.cos(phase)) * 0.18 * amount
    },
  }))

  const hipY = LEG
  const shoulderY = LEG + BODY * 0.92

  return (
    <group ref={body}>
      {/* 다리 */}
      {[
        [leftLeg, -0.45],
        [rightLeg, 0.45],
      ].map(([legRef, x]) => (
        <group key={x as number} ref={legRef as RefObject<Group>} position={[x as number, hipY, 0]}>
          <mesh position={[0, -LEG / 2, 0]}>
            <boxGeometry args={[0.7, LEG, 0.75]} />
            <meshLambertMaterial color={PANTS} />
          </mesh>
          <mesh position={[0, -LEG + 0.15, -0.2]}>
            <boxGeometry args={[0.75, 0.3, 1.1]} />
            <meshLambertMaterial color={SHOE} />
          </mesh>
        </group>
      ))}

      {/* 몸통 */}
      <mesh position={[0, LEG + BODY / 2, 0]}>
        <boxGeometry args={[1.7, BODY, 1.0]} />
        <meshLambertMaterial color={color} />
      </mesh>

      {/* 팔 */}
      {[
        [leftArm, -1.1],
        [rightArm, 1.1],
      ].map(([armRef, x]) => (
        <group key={x as number} ref={armRef as RefObject<Group>} position={[x as number, shoulderY, 0]}>
          <mesh position={[0, -ARM / 2, 0]}>
            <boxGeometry args={[0.5, ARM, 0.55]} />
            <meshLambertMaterial color={color} />
          </mesh>
          <mesh position={[0, -ARM - 0.15, 0]}>
            <sphereGeometry args={[0.32, 8, 6]} />
            <meshLambertMaterial color={SKIN} />
          </mesh>
        </group>
      ))}

      {/* 머리 */}
      <mesh position={[0, LEG + BODY + HEAD + 0.1, 0]}>
        <sphereGeometry args={[HEAD, 14, 10]} />
        <meshLambertMaterial color={SKIN} />
      </mesh>
      {/* 앞을 알 수 있게 모자 챙 */}
      <mesh position={[0, LEG + BODY + HEAD * 1.55, -0.5]}>
        <boxGeometry args={[1.5, 0.18, 1.0]} />
        <meshLambertMaterial color={color} />
      </mesh>

      {/* 내 캐릭터 표시: 머리 위 역삼각형 */}
      {mine && (
        <mesh position={[0, LEG + BODY + HEAD * 2 + 1.6, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.8, 1.4, 4]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      )}
    </group>
  )
})

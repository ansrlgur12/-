import { createContext, forwardRef, useContext, useImperativeHandle, useRef, type ReactNode, type RefObject } from 'react'
import { DoubleSide, type Group } from 'three'
import type { ThreeElements } from '@react-three/fiber/native'
import type { EmoteId, ItemStyle, Outfit } from '@jikjwau/shared/types'
import { EMOTE_SHOW_MS, SHOP_ITEM_BY_ID } from '@jikjwau/shared/config'

/** 걷기·이모티콘 동작을 밖(Party의 useFrame)에서 매 프레임 넣는다 */
export interface PersonHandle {
  /** phase: 걸음 주기 각도, amount: 0(서 있음) ~ 1(걷는 중), act: 하고 있는 이모티콘과 시작한 지 몇 초 */
  pose: (phase: number, amount: number, act?: { emote: EmoteId; t: number }) => void
}

const SKIN = '#f6d2b0'
const HAIR = '#3b2416'
const SHOE = '#374151'
const CHEEK = '#f9a8a8'
const EYE = '#1f2937'

// 블록 인형. 실제 사람보다 크게 (게임 시점에서 잘 보이게). 단위 m
const LEG = 2.0
const LEG_W = 0.95
const HIP_X = 0.5
const BODY = 2.2
const BODY_W = 2.0
const BODY_D = 1.0
const ARM = 2.1
const ARM_W = 0.9
const SHOULDER_X = BODY_W / 2 + ARM_W / 2 + 0.02
const HEAD = 1.9
const STRIDE_RAD = 0.7
/** 머리 꼭대기까지 높이 + 모자 자리 (이모티콘 말풍선 위치) */
export const PERSON_HEIGHT = LEG + BODY + HEAD + 1.2

/** 다른 방 일행은 반투명 */
const GhostContext = createContext(false)

function Mat({ color }: { color: string }) {
  const ghost = useContext(GhostContext)
  return <meshLambertMaterial color={color} transparent={ghost} opacity={ghost ? 0.38 : 1} depthWrite={!ghost} />
}

function Part({ children, color, ...props }: { children: ReactNode; color: string } & ThreeElements['mesh']) {
  return (
    <mesh {...props}>
      {children}
      <Mat color={color} />
    </mesh>
  )
}

/** 상자 하나. 거의 모든 부위를 이걸로 만든다 */
function Box({ size, ...props }: { size: [number, number, number]; color: string } & Omit<ThreeElements['mesh'], 'children'>) {
  return (
    <Part {...props}>
      <boxGeometry args={size} />
    </Part>
  )
}

const item = (id: string) => SHOP_ITEM_BY_ID[id] ?? { style: 'none' as ItemStyle, color: '#000', accent: undefined }

// 머리 기준(목) 좌표: 머리 중심 높이, 꼭대기, 얼굴 앞면(-z)
const HEAD_Y = HEAD / 2 + 0.02
const HEAD_TOP = HEAD_Y + HEAD / 2
const FACE_Z = -HEAD / 2
/** 모자 껍데기 크기: 머리카락(+0.08)보다 조금 크게 */
const HAT_W = HEAD + 0.22
/** 모자는 눈 위까지만 내려온다 (앞에서 눈을 가리지 않게) */
const HAT_BOTTOM = HEAD_Y + 0.25

function Hat({ id }: { id: string }) {
  const { style, color, accent = color } = item(id)
  const T = HEAD_TOP
  switch (style) {
    case 'cap': {
      const h = T + 0.12 - HAT_BOTTOM
      return (
        <>
          <Box color={color} size={[HAT_W, h, HAT_W]} position={[0, HAT_BOTTOM + h / 2, 0]} />
          {/* 챙: 얼굴 앞으로 납작하게 */}
          <Box color={color} size={[HAT_W * 0.86, 0.12, 1.05]} position={[0, HAT_BOTTOM + 0.06, -HAT_W / 2 - 0.5]} rotation={[0.08, 0, 0]} />
          <Box color={accent} size={[0.62, 0.36, 0.04]} position={[0, HAT_BOTTOM + h * 0.55, -HAT_W / 2 - 0.02]} />
          <Box color={accent} size={[0.26, 0.12, 0.26]} position={[0, T + 0.18, 0]} />
        </>
      )
    }
    case 'beanie': {
      const h = T + 0.2 - HAT_BOTTOM
      return (
        <>
          <Box color={color} size={[HAT_W, h, HAT_W]} position={[0, HAT_BOTTOM + h / 2, 0]} />
          <Box color={accent} size={[HAT_W + 0.08, 0.3, HAT_W + 0.08]} position={[0, HAT_BOTTOM + 0.15, 0]} />
          <Box color={accent} size={[0.46, 0.46, 0.46]} position={[0, T + 0.43, 0]} />
        </>
      )
    }
    case 'party':
      return (
        <>
          <Part color={color} position={[0, T + 0.95, 0]} rotation={[0, Math.PI / 4, 0.1]}>
            <coneGeometry args={[0.85, 1.8, 4]} />
          </Part>
          <Box color={accent} size={[0.32, 0.32, 0.32]} position={[-0.18, T + 1.9, 0]} />
          <Box color={accent} size={[1.24, 0.16, 1.24]} position={[0, T + 0.12, 0]} />
        </>
      )
    case 'straw': {
      const crownTop = T + 0.45
      return (
        <>
          <Box color={color} size={[3.0, 0.12, 3.0]} position={[0, HAT_BOTTOM + 0.06, 0]} />
          <Box color={color} size={[HAT_W - 0.06, crownTop - HAT_BOTTOM, HAT_W - 0.06]} position={[0, (HAT_BOTTOM + crownTop) / 2, 0]} />
          <Box color={accent} size={[HAT_W, 0.22, HAT_W]} position={[0, HAT_BOTTOM + 0.24, 0]} />
        </>
      )
    }
    case 'helmet': {
      const h = T + 0.22 - HAT_BOTTOM
      const w = HAT_W + 0.06
      return (
        <>
          <Box color={color} size={[w, h, w]} position={[0, HAT_BOTTOM + h / 2, 0]} />
          {/* 귀 덮개는 옆으로만 더 내려온다 */}
          {[-1, 1].map((side) => (
            <Box key={side} color={color} size={[0.12, 0.7, w * 0.6]} position={[side * (w / 2 + 0.06), HAT_BOTTOM - 0.25, 0.25]} />
          ))}
          <Box color={accent} size={[0.36, 0.06, w + 0.02]} position={[0, T + 0.25, 0]} />
          <Box color={accent} size={[0.36, h, 0.06]} position={[0, HAT_BOTTOM + h / 2, -w / 2 - 0.02]} />
        </>
      )
    }
    case 'bunny':
      return (
        <>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * 0.48, T + 0.75, 0.15]} rotation={[0, 0, -side * 0.14]}>
              <Box color={color} size={[0.42, 1.5, 0.26]} />
              <Box color={accent} size={[0.22, 1.1, 0.04]} position={[0, -0.05, -0.14]} />
            </group>
          ))}
        </>
      )
    case 'crown': {
      const w = 1.5
      const y = T + 0.32
      const edge = w / 2 - 0.06
      const tooth = w / 2 - 0.12
      return (
        <>
          <Box color={color} size={[w, 0.45, 0.12]} position={[0, y, -edge]} />
          <Box color={color} size={[w, 0.45, 0.12]} position={[0, y, edge]} />
          <Box color={color} size={[0.12, 0.45, w]} position={[-edge, y, 0]} />
          <Box color={color} size={[0.12, 0.45, w]} position={[edge, y, 0]} />
          {/* 뾰족한 이: 네 모서리와 각 변 가운데 */}
          {[-1, 0, 1].flatMap((x) =>
            [-1, 0, 1]
              .filter((z) => x !== 0 || z !== 0)
              .map((z) => <Box key={`${x},${z}`} color={color} size={[0.24, 0.3, 0.24]} position={[x * tooth, y + 0.37, z * tooth]} />),
          )}
          <Box color={accent} size={[0.3, 0.3, 0.06]} position={[0, y, -w / 2 - 0.02]} />
        </>
      )
    }
    default:
      return null
  }
}

/** 몸통 위 장식. 몸통 중심 기준, 앞이 -z */
function TopDetail({ id }: { id: string }) {
  const { style, color, accent = color } = item(id)
  const front = -BODY_D / 2 - 0.02
  switch (style) {
    case 'stripe':
      return (
        <>
          {[-0.6, -0.1, 0.4].map((y) => (
            <Box key={y} color={accent} size={[BODY_W + 0.04, 0.22, BODY_D + 0.04]} position={[0, y, 0]} />
          ))}
        </>
      )
    case 'jersey':
      return (
        <>
          {/* 가슴 번호 7 */}
          <Box color={accent} size={[0.62, 0.15, 0.03]} position={[0, 0.38, front]} />
          <Box color={accent} size={[0.16, 0.8, 0.03]} position={[0.12, -0.04, front]} rotation={[0, 0, -0.35]} />
          <Box color={accent} size={[0.8, 0.12, 0.03]} position={[0, BODY / 2 - 0.08, front]} />
          {[-1, 1].map((side) => (
            <Box key={side} color={accent} size={[0.03, BODY, 0.32]} position={[side * (BODY_W / 2 + 0.01), 0, 0]} />
          ))}
        </>
      )
    case 'hoodie':
      return (
        <>
          <Box color={color} size={[1.6, 0.65, 0.5]} position={[0, BODY / 2 + 0.05, BODY_D / 2 + 0.1]} />
          <Box color={accent} size={[1.2, 0.5, 0.04]} position={[0, -0.6, front]} />
          {[-0.25, 0.25].map((x) => (
            <Box key={x} color={accent} size={[0.08, 0.55, 0.03]} position={[x, BODY / 2 - 0.35, front]} />
          ))}
        </>
      )
    case 'suit':
      return (
        <>
          <Box color="#f8fafc" size={[0.6, 1.1, 0.03]} position={[0, 0.5, front]} />
          <Box color={accent} size={[0.26, 0.2, 0.05]} position={[0, BODY / 2 - 0.16, front - 0.02]} />
          <Box color={accent} size={[0.2, 0.8, 0.04]} position={[0, 0.25, front - 0.02]} />
          {[0.2, -0.3, -0.8].map((y) => (
            <Box key={y} color="#9ca3af" size={[0.1, 0.1, 0.03]} position={[0.45, y, front]} />
          ))}
        </>
      )
    default:
      return null
  }
}

/** 네모난 안경테 하나 */
function Frame({ x, color }: { x: number; color: string }) {
  const w = 0.58
  const h = 0.62
  const t = 0.07
  const z = FACE_Z - 0.04
  return (
    <>
      <Box color={color} size={[w, t, 0.04]} position={[x, HEAD_Y + h / 2, z]} />
      <Box color={color} size={[w, t, 0.04]} position={[x, HEAD_Y - h / 2, z]} />
      <Box color={color} size={[t, h, 0.04]} position={[x - w / 2, HEAD_Y, z]} />
      <Box color={color} size={[t, h, 0.04]} position={[x + w / 2, HEAD_Y, z]} />
    </>
  )
}

/** 얼굴에 쓰는 소품. 머리(목) 기준이라 고개를 돌리면 같이 돈다 */
function FaceAccessory({ id }: { id: string }) {
  const { style, color } = item(id)
  if (style !== 'glasses' && style !== 'shades') return null
  return (
    <>
      {[-0.42, 0.42].map((x) =>
        style === 'glasses' ? (
          <Frame key={x} x={x} color={color} />
        ) : (
          <Box key={x} color={color} size={[0.66, 0.46, 0.06]} position={[x, HEAD_Y, FACE_Z - 0.05]} />
        ),
      )}
      <Box color={color} size={[0.3, 0.07, 0.04]} position={[0, HEAD_Y + 0.12, FACE_Z - 0.04]} />
      {/* 안경다리 */}
      {[-1, 1].map((side) => (
        <Box key={side} color={color} size={[0.04, 0.07, HEAD * 0.55]} position={[side * (HEAD / 2 + 0.06), HEAD_Y + 0.12, FACE_Z + HEAD * 0.27]} />
      ))}
    </>
  )
}

/** 몸에 붙는 소품. 발밑 기준 */
function Accessory({ id, capeRef }: { id: string; capeRef: RefObject<Group | null> }) {
  const { style, color, accent = color } = item(id)
  const neck = LEG + BODY
  const back = BODY_D / 2
  switch (style) {
    case 'scarf':
      return (
        <>
          <Box color={color} size={[BODY_W - 0.2, 0.42, BODY_D + 0.14]} position={[0, neck - 0.18, 0]} />
          <Box color={color} size={[0.45, 1.0, 0.1]} position={[0.45, neck - 0.85, -back - 0.1]} rotation={[0.06, 0, 0]} />
          <Box color={accent} size={[0.47, 0.14, 0.11]} position={[0.45, neck - 1.3, -back - 0.13]} rotation={[0.06, 0, 0]} />
        </>
      )
    case 'backpack':
      return (
        <>
          <group position={[0, LEG + BODY * 0.5, back + 0.32]}>
            <Box color={color} size={[1.5, 1.6, 0.62]} />
            <Box color={accent} size={[1.54, 0.5, 0.66]} position={[0, 0.58, 0]} />
            <Box color={accent} size={[0.9, 0.5, 0.06]} position={[0, -0.35, 0.33]} />
          </group>
          {/* 앞에서 보이는 어깨끈 */}
          {[-0.55, 0.55].map((x) => (
            <Box key={x} color={accent} size={[0.22, BODY * 0.85, 0.04]} position={[x, LEG + BODY * 0.55, -back - 0.03]} />
          ))}
        </>
      )
    case 'cape':
      return (
        <group ref={capeRef} position={[0, neck - 0.1, back + 0.05]}>
          <mesh position={[0, -1.4, 0]}>
            <planeGeometry args={[BODY_W + 0.3, 2.8]} />
            <CapeMat color={color} />
          </mesh>
          <Box color={accent} size={[BODY_W, 0.2, 0.15]} position={[0, 0, -0.05]} />
        </group>
      )
    default:
      return null
  }
}

function CapeMat({ color }: { color: string }) {
  const ghost = useContext(GhostContext)
  return <meshLambertMaterial color={color} side={DoubleSide} transparent={ghost} opacity={ghost ? 0.38 : 1} depthWrite={!ghost} />
}

interface Pose {
  l: [number, number]
  r: [number, number]
  head: [number, number, number]
  y: number
  tilt: number
}

/** 이모티콘마다 동작. 팔은 [앞으로 드는 각, 옆으로 드는 각(왼팔 음수가 바깥)] */
function emotePose(emote: EmoteId, t: number): Pose {
  const pose: Pose = { l: [0, -0.1], r: [0, 0.1], head: [0, 0, 0], y: 0, tilt: 0 }
  switch (emote) {
    case 'wave':
      pose.r = [0.2, 2.6 + 0.4 * Math.sin(t * 12)]
      pose.head = [0.1, 0, -0.12]
      break
    case 'cheer':
      pose.l = [0.15, -2.75]
      pose.r = [0.15, 2.75]
      pose.y = Math.abs(Math.sin(t * 7)) * 1.1
      break
    case 'clap': {
      const c = (Math.sin(t * 16) + 1) / 2
      pose.l = [1.35, 0.1 + 0.4 * c]
      pose.r = [1.35, -0.1 - 0.4 * c]
      pose.y = Math.abs(Math.sin(t * 8)) * 0.15
      break
    }
    case 'laugh':
      pose.l = [0.9, 0.45]
      pose.r = [0.9, -0.45]
      pose.head = [0.35 + 0.08 * Math.sin(t * 18), 0, 0]
      pose.y = Math.abs(Math.sin(t * 9)) * 0.35
      break
    case 'cry':
      pose.l = [2.35, 0.5]
      pose.r = [2.35, -0.5]
      pose.head = [-0.4, 0, 0]
      pose.tilt = 0.05 * Math.sin(t * 22)
      break
    case 'angry':
      pose.l = [0.3, -0.55]
      pose.r = [0.3, 0.55]
      pose.head = [-0.1, 0.25 * Math.sin(t * 18), 0]
      pose.y = Math.abs(Math.sin(t * 10)) * 0.3
      break
    case 'think':
      pose.r = [2.1, -0.55]
      pose.l = [0.6, 0.55]
      pose.head = [0.15, 0, 0.25]
      break
    case 'heart':
      pose.l = [0.25, -2.85]
      pose.r = [0.25, 2.85]
      pose.tilt = 0.12 * Math.sin(t * 4)
      break
  }
  return pose
}

const mix = (a: number, b: number, w: number) => a + (b - a) * w

/**
 * 블록 인형. 앞이 -z(월드 북쪽)를 보도록 만든다.
 * 다리는 엉덩이, 팔은 어깨, 머리는 목을 축으로 움직인다. 옷은 상점 아이템 모양대로.
 */
export const Person = forwardRef<PersonHandle, { outfit: Outfit; mine?: boolean; ghost?: boolean; ring?: string }>(function Person(
  { outfit, mine, ghost = false, ring },
  ref,
) {
  const leftLeg = useRef<Group>(null)
  const rightLeg = useRef<Group>(null)
  const leftArm = useRef<Group>(null)
  const rightArm = useRef<Group>(null)
  const head = useRef<Group>(null)
  const body = useRef<Group>(null)
  const cape = useRef<Group>(null)

  useImperativeHandle(ref, () => ({
    pose(phase, amount, act) {
      const swing = Math.sin(phase) * STRIDE_RAD * amount
      let pose: Pose = {
        l: [-swing * 0.8, -0.1],
        r: [swing * 0.8, 0.1],
        head: [0, 0, 0],
        y: Math.abs(Math.cos(phase)) * 0.18 * amount,
        tilt: 0,
      }
      if (act) {
        // 처음과 끝은 부드럽게 들어가고 나온다
        const end = EMOTE_SHOW_MS / 1000
        const w = Math.min(1, act.t / 0.2, Math.max(0, (end - act.t) / 0.3))
        const target = emotePose(act.emote, act.t)
        pose = {
          l: [mix(pose.l[0], target.l[0], w), mix(pose.l[1], target.l[1], w)],
          r: [mix(pose.r[0], target.r[0], w), mix(pose.r[1], target.r[1], w)],
          head: [mix(0, target.head[0], w), mix(0, target.head[1], w), mix(0, target.head[2], w)],
          y: mix(pose.y, target.y, w),
          tilt: mix(0, target.tilt, w),
        }
      }
      leftLeg.current?.rotation.set(swing, 0, 0)
      rightLeg.current?.rotation.set(-swing, 0, 0)
      leftArm.current?.rotation.set(pose.l[0], 0, pose.l[1])
      rightArm.current?.rotation.set(pose.r[0], 0, pose.r[1])
      head.current?.rotation.set(pose.head[0], pose.head[1], pose.head[2])
      if (body.current) {
        body.current.position.y = pose.y
        body.current.rotation.z = pose.tilt
      }
      // 걸을 때 망토가 뒤로 날린다
      if (cape.current) cape.current.rotation.x = 0.12 + amount * 0.45 + Math.sin(phase * 2) * 0.06 * amount
    },
  }))

  const top = item(outfit.top)
  const bottom = item(outfit.bottom)
  const longSleeve = top.style === 'hoodie' || top.style === 'suit'
  const legColor = bottom.style === 'pants' ? bottom.color : SKIN
  const sleeve = longSleeve ? ARM - 0.45 : 0.7

  return (
    <GhostContext.Provider value={ghost}>
      {/* 맡은 방향 색 고리 */}
      {ring && (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 2.1, 28]} />
          <meshBasicMaterial color={ring} transparent opacity={ghost ? 0.3 : 0.9} depthWrite={false} />
        </mesh>
      )}
      <group ref={body}>
        {/* 다리 */}
        {[
          [leftLeg, -HIP_X],
          [rightLeg, HIP_X],
        ].map(([legRef, x]) => (
          <group key={x as number} ref={legRef as RefObject<Group>} position={[x as number, LEG, 0]}>
            <Box color={legColor} size={[LEG_W, LEG, LEG_W]} position={[0, -LEG / 2, 0]} />
            {bottom.style === 'shorts' && <Box color={bottom.color} size={[LEG_W + 0.06, 0.9, LEG_W + 0.06]} position={[0, -0.45, 0]} />}
            <Box color={SHOE} size={[LEG_W + 0.06, 0.4, LEG_W + 0.25]} position={[0, -LEG + 0.2, -0.1]} />
          </group>
        ))}
        {/* 아래가 넓은 네모 치마 (네 모서리 원뿔대를 45도 돌려 앞이 평평하게) */}
        {bottom.style === 'skirt' && (
          <group position={[0, LEG - 0.4, 0]} scale={[1, 1, 0.55]}>
            <Part color={bottom.color} rotation={[0, Math.PI / 4, 0]}>
              <cylinderGeometry args={[1.48, 1.85, 1.0, 4]} />
            </Part>
          </group>
        )}

        {/* 몸통 */}
        <group position={[0, LEG + BODY / 2, 0]}>
          <Box color={top.color} size={[BODY_W, BODY, BODY_D]} />
          <TopDetail id={outfit.top} />
        </group>

        {/* 팔: 어깨에 매달린 상자. 소매는 위에 조금 크게 덧씌운다 */}
        {[
          [leftArm, -SHOULDER_X],
          [rightArm, SHOULDER_X],
        ].map(([armRef, x]) => (
          <group key={x as number} ref={armRef as RefObject<Group>} position={[x as number, LEG + BODY - 0.1, 0]}>
            <Box color={SKIN} size={[ARM_W, ARM, ARM_W]} position={[0, -ARM / 2 + 0.1, 0]} />
            <Box color={top.color} size={[ARM_W + 0.06, sleeve, ARM_W + 0.06]} position={[0, -sleeve / 2 + 0.13, 0]} />
          </group>
        ))}

        {/* 머리 (목 기준) */}
        <group ref={head} position={[0, LEG + BODY, 0]}>
          <Box color={SKIN} size={[HEAD, HEAD, HEAD]} position={[0, HEAD_Y, 0]} />
          {/* 머리카락: 위·뒤·옆 판과 앞머리 */}
          <Box color={HAIR} size={[HEAD + 0.08, 0.3, HEAD + 0.08]} position={[0, HEAD_TOP - 0.1, 0]} />
          <Box color={HAIR} size={[HEAD + 0.08, HEAD * 0.75, 0.12]} position={[0, HEAD_TOP - HEAD * 0.375, HEAD / 2 + 0.02]} />
          {[-1, 1].map((side) => (
            <Box key={side} color={HAIR} size={[0.1, HEAD * 0.5, HEAD + 0.08]} position={[side * (HEAD / 2 + 0.02), HEAD_TOP - HEAD * 0.25, 0]} />
          ))}
          <Box color={HAIR} size={[HEAD + 0.08, 0.3, 0.1]} position={[0, HEAD_TOP - 0.25, FACE_Z - 0.02]} />
          {/* 얼굴 */}
          {[-0.42, 0.42].map((x) => (
            <group key={x}>
              <Box color={EYE} size={[0.24, 0.4, 0.04]} position={[x, HEAD_Y, FACE_Z - 0.02]} />
              <Box color="#ffffff" size={[0.09, 0.12, 0.02]} position={[x + 0.05, HEAD_Y + 0.1, FACE_Z - 0.045]} />
            </group>
          ))}
          {[-0.68, 0.68].map((x) => (
            <Box key={x} color={CHEEK} size={[0.3, 0.15, 0.03]} position={[x, HEAD_Y - 0.28, FACE_Z - 0.015]} />
          ))}
          <Box color={EYE} size={[0.36, 0.08, 0.04]} position={[0, HEAD_Y - 0.45, FACE_Z - 0.02]} />
          <Hat id={outfit.hat} />
          <FaceAccessory id={outfit.acc} />
        </group>

        <Accessory id={outfit.acc} capeRef={cape} />
      </group>

      {/* 내 캐릭터 표시: 머리 위 역삼각형 */}
      {mine && (
        <mesh position={[0, PERSON_HEIGHT + 0.6, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.8, 1.4, 4]} />
          <meshBasicMaterial color="#facc15" />
        </mesh>
      )}
    </GhostContext.Provider>
  )
})

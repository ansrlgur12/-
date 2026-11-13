import type { ReactNode } from 'react'
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg'
import type { ShopItem } from '@jikjwau/shared/types'
import { BORDER, INK } from './theme'

/** 그림 칸 (48 × 48) */
const VIEW = 48

/**
 * 옷장 상품 그림: 모양(style)마다 만화 아이콘을 그 상품의 색(color, accent)으로 칠한다.
 * 테두리는 화면 어디서나 같은 굵기(BORDER px)
 */
export function ItemIcon({ item, size }: { item: ShopItem; size: number }) {
  const c = item.color
  const a = item.accent ?? shade(item.color)
  const line = { stroke: INK, strokeWidth: (BORDER * VIEW) / size, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      <G {...line}>{draw(item.style, c, a)}</G>
    </Svg>
  )
}

/** 강조색이 없으면 기본색을 조금 어둡게 */
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(v * 0.7)
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`
}

/** 윗옷 기본 모양 (반팔) */
const TEE = 'M15 8 L20 6 Q24 11 28 6 L33 8 L44 17 L38 23 L35 20 V42 H13 V20 L10 23 L4 17 Z'

function draw(style: ShopItem['style'], c: string, a: string): ReactNode {
  switch (style) {
    case 'none':
      return (
        <>
          <Circle cx={24} cy={24} r={15} fill="#eef1fb" />
          <Line x1={14} y1={34} x2={34} y2={14} />
        </>
      )

    // ── 모자 ──
    case 'cap':
      return (
        <>
          <Path d="M6 32 H30 Q34 32 36 35 H8 Q6 35 6 32 Z" fill={a} />
          <Path d="M10 32 V24 Q10 13 24 13 Q38 13 38 24 V32 Z" fill={c} />
          <Line x1={24} y1={14} x2={24} y2={31} />
          <Rect x={21.5} y={9.5} width={5} height={4} rx={1.5} fill={a} />
        </>
      )
    case 'beanie':
      return (
        <>
          <Circle cx={24} cy={9} r={5} fill={a} />
          <Path d="M10 32 V24 Q10 13 24 13 Q38 13 38 24 V32 Z" fill={c} />
          <Rect x={8} y={29} width={32} height={9} rx={3} fill={a} />
          <Line x1={16} y1={30} x2={16} y2={37} />
          <Line x1={24} y1={30} x2={24} y2={37} />
          <Line x1={32} y1={30} x2={32} y2={37} />
        </>
      )
    case 'party':
      return (
        <>
          <Path d="M24 7 L37 40 H11 Z" fill={c} />
          <Path d="M19.5 20 L28.5 20 M15.5 30 L32.5 30" stroke={a} strokeWidth={4} />
          <Path d="M24 7 L37 40 H11 Z" fill="none" />
          <Circle cx={24} cy={7} r={4} fill={a} />
        </>
      )
    case 'straw':
      return (
        <>
          <Ellipse cx={24} cy={33} rx={21} ry={6} fill={c} />
          <Path d="M14 32 V20 Q14 13 24 13 Q34 13 34 20 V32 Z" fill={c} />
          <Rect x={14} y={25} width={20} height={6} fill={a} />
        </>
      )
    case 'helmet':
      return (
        <>
          <Path d="M8 34 V25 Q8 10 24 10 Q40 10 40 25 V34 Z" fill={c} />
          <Rect x={21} y={10.5} width={6} height={23} fill={a} stroke="none" />
          <Path d="M8 34 V25 Q8 10 24 10 Q40 10 40 25 V34 Z" fill="none" />
          <Rect x={6} y={31} width={36} height={7} rx={3} fill={a} />
        </>
      )
    case 'bunny':
      return (
        <>
          <Ellipse cx={16} cy={16} rx={5.5} ry={13} fill={c} />
          <Ellipse cx={16} cy={17} rx={2.5} ry={8} fill={a} stroke="none" />
          <Ellipse cx={32} cy={16} rx={5.5} ry={13} fill={c} />
          <Ellipse cx={32} cy={17} rx={2.5} ry={8} fill={a} stroke="none" />
          <Path d="M7 40 Q24 24 41 40" fill="none" strokeWidth={7} stroke={INK} />
          <Path d="M7 40 Q24 24 41 40" fill="none" strokeWidth={3.5} stroke={c} />
        </>
      )
    case 'crown':
      return (
        <>
          <Path d="M7 36 L9 14 L17 24 L24 10 L31 24 L39 14 L41 36 Z" fill={c} />
          <Rect x={7} y={33} width={34} height={6} rx={2} fill={c} />
          <Circle cx={24} cy={27} r={3.5} fill={a} />
          <Circle cx={14} cy={29} r={2.5} fill={a} />
          <Circle cx={34} cy={29} r={2.5} fill={a} />
        </>
      )

    // ── 윗옷 ──
    case 'tee':
      return (
        <>
          <Path d={TEE} fill={c} />
          <Path d="M20 6.5 Q24 11 28 6.5" fill="none" />
        </>
      )
    case 'stripe':
      return (
        <>
          <Path d={TEE} fill={c} />
          {[24, 31, 38].map((y) => (
            <Rect key={y} x={14.5} y={y - 2} width={19} height={3.5} fill={a} stroke="none" />
          ))}
          <Path d={TEE} fill="none" />
        </>
      )
    case 'jersey':
      return (
        <>
          <Path d={TEE} fill={c} />
          <Path d="M4 17 L10 23 M44 17 L38 23" stroke={a} strokeWidth={3} />
          <Path d={TEE} fill="none" />
          <Path d="M19.5 7 Q24 13 28.5 7" fill="none" stroke={a} strokeWidth={3} />
          <Path d="M20 21 H28 L23 35" fill="none" stroke={a} strokeWidth={4} />
        </>
      )
    case 'hoodie':
      return (
        <>
          <Path d="M16 9 Q24 1 32 9 L30 13 H18 Z" fill={c} />
          <Path d={TEE} fill={c} />
          <Path d="M18 9 Q24 15 30 9" fill={a} />
          <Rect x={17} y={30} width={14} height={8} rx={2} fill={a} />
          <Line x1={22} y1={13} x2={21} y2={21} />
          <Line x1={26} y1={13} x2={27} y2={21} />
        </>
      )
    case 'suit':
      return (
        <>
          <Path d={TEE} fill={c} />
          <Path d="M20 7 L24 24 L28 7 Z" fill="#ffffff" />
          <Path d="M24 13 L26 17 L24 28 L22 17 Z" fill={a} />
          <Circle cx={24} cy={33} r={1.5} fill="#ffffff" />
          <Circle cx={24} cy={38} r={1.5} fill="#ffffff" />
        </>
      )

    // ── 아래옷 ──
    case 'pants':
      return (
        <>
          <Path d="M12 7 H36 L37 43 H27 L24 19 L21 43 H11 Z" fill={c} />
          <Rect x={12} y={7} width={24} height={5} fill={a} />
          <Line x1={24} y1={12} x2={24} y2={19} />
        </>
      )
    case 'shorts':
      return (
        <>
          <Path d="M10 10 H38 L40 34 H27 L24 22 L21 34 H8 Z" fill={c} />
          <Rect x={10} y={10} width={28} height={5} fill={a} />
          <Line x1={24} y1={15} x2={24} y2={22} />
        </>
      )
    case 'skirt':
      return (
        <>
          <Path d="M15 9 H33 L41 37 H7 Z" fill={c} />
          <Rect x={15} y={9} width={18} height={5} fill={a} />
          <Line x1={20} y1={14} x2={16} y2={37} />
          <Line x1={24} y1={14} x2={24} y2={37} />
          <Line x1={28} y1={14} x2={32} y2={37} />
        </>
      )

    // ── 소품 ──
    case 'glasses':
      return (
        <>
          <Rect x={5} y={17} width={16} height={13} rx={4} fill="#d6ecff" stroke={c} strokeWidth={4} />
          <Rect x={27} y={17} width={16} height={13} rx={4} fill="#d6ecff" stroke={c} strokeWidth={4} />
          <Path d="M21 22 Q24 19 27 22" fill="none" stroke={c} strokeWidth={4} />
        </>
      )
    case 'shades':
      return (
        <>
          <Path d="M4 17 H22 V24 Q22 32 13 32 Q4 32 4 24 Z" fill={c} />
          <Path d="M26 17 H44 V24 Q44 32 35 32 Q26 32 26 24 Z" fill={c} />
          <Line x1={22} y1={20} x2={26} y2={20} />
          <Line x1={8} y1={21} x2={12} y2={21} stroke="#ffffff" />
          <Line x1={30} y1={21} x2={34} y2={21} stroke="#ffffff" />
        </>
      )
    case 'scarf':
      return (
        <>
          <Rect x={7} y={12} width={34} height={11} rx={5} fill={c} />
          <Path d="M27 20 H36 V42 H27 Z" fill={c} />
          <Rect x={27} y={28} width={9} height={3.5} fill={a} stroke="none" />
          <Rect x={27} y={35} width={9} height={3.5} fill={a} stroke="none" />
          <Path d="M27 20 H36 V42 H27 Z" fill="none" />
        </>
      )
    case 'backpack':
      return (
        <>
          <Path d="M17 12 Q17 5 24 5 Q31 5 31 12" fill="none" />
          <Rect x={10} y={10} width={28} height={33} rx={7} fill={c} />
          <Rect x={15} y={27} width={18} height={12} rx={3} fill={a} />
          <Line x1={15} y1={31} x2={33} y2={31} />
        </>
      )
    case 'cape':
      return (
        <>
          <Path d="M14 9 H34 L42 42 Q33 38 24 42 Q15 38 6 42 Z" fill={c} />
          <Rect x={12} y={6} width={24} height={6} rx={3} fill={a} />
          <Circle cx={24} cy={9} r={2.5} fill={a} />
        </>
      )
    default:
      return <Circle cx={24} cy={24} r={15} fill={c} />
  }
}

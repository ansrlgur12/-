import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { FONT, INK, TEXT_STROKE } from './theme'

interface Props {
  children: ReactNode
  style?: StyleProp<TextStyle>
  /** 테두리 두께 (px) */
  stroke?: number
  strokeColor?: string
  /** 아래로 깔리는 두께 (입체감). 0이면 없음 */
  depth?: number
  /** 두께 색 (기본: 테두리 색) */
  shadowColor?: string
  containerStyle?: StyleProp<ViewStyle>
}

/** 테두리 방향 수. 많을수록 둥글다 */
const DIRECTIONS = 16

/**
 * 굵은 테두리를 두른 글자 (게임 로고·버튼 글씨). React Native 글자에는 테두리가 없어서
 * 같은 글자를 사방으로 조금씩 밀어 테두리 색으로 깔고, 그 위에 원래 글자를 놓는다
 */
export function OutlinedText({ children, style, stroke = 3, strokeColor = INK, depth = 0, shadowColor, containerStyle }: Props) {
  const offsets: Array<[number, number]> = []
  for (let i = 0; i < DIRECTIONS; i++) {
    const a = (i / DIRECTIONS) * Math.PI * 2
    offsets.push([Math.cos(a) * stroke, Math.sin(a) * stroke])
  }
  // 입체 두께: 테두리 바깥을 아래로 몇 번 더 깐다
  const under: Array<[number, number]> = []
  for (let d = 1; d <= depth; d++) for (const [x, y] of offsets) if (y >= 0) under.push([x, y + d])

  return (
    <View style={containerStyle}>
      {under.map(([x, y], i) => (
        <Text key={`d${i}`} style={[style, styles.copy, { left: x, top: y, color: shadowColor ?? strokeColor }]} accessible={false}>
          {children}
        </Text>
      ))}
      {offsets.map(([x, y], i) => (
        <Text key={i} style={[style, styles.copy, { left: x, top: y, color: strokeColor }]} accessible={false}>
          {children}
        </Text>
      ))}
      <Text style={style}>{children}</Text>
    </View>
  )
}

/**
 * 만화 같은 제목: 굵은 글꼴에 흰 테두리와 남색 그림자 (창 제목·항목 이름).
 * light면 흰 글자에 남색 테두리 (하늘 배경 위 화면 제목)
 */
export function CartoonTitle({ children, size = 24, light = false, color }: { children: ReactNode; size?: number; light?: boolean; color?: string }) {
  return (
    <OutlinedText
      style={{ fontFamily: FONT.title, fontSize: size, lineHeight: size * 1.25, color: color ?? (light ? '#ffffff' : INK) }}
      stroke={TEXT_STROKE}
      strokeColor={light ? INK : '#ffffff'}
      depth={2}
      shadowColor={light ? INK : 'rgba(27,37,89,0.85)'}
    >
      {children}
    </OutlinedText>
  )
}

const styles = StyleSheet.create({
  copy: { position: 'absolute' },
})

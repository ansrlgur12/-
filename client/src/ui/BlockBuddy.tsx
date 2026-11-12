import { StyleSheet, View } from 'react-native'

const SKIN = '#f6d2b0'
const HAIR = '#3b2416'
const PANTS = '#3b5b8c'
const SHOE = '#374151'
const EYE = '#1f2937'
const CHEEK = '#f9a8a8'

export type BuddyPoint = 'up' | 'left' | 'right' | 'none'

/**
 * 게임 캐릭터와 같은 블록 인형을 화면(2D)에 상자로 그린다. 3D 없이 가볍게.
 * point: 맡은 방향으로 팔을 뻗는다 (직진은 위로, 좌·우는 옆으로)
 */
export function BlockBuddy({ unit: u, shirt, point = 'none' }: { unit: number; shirt: string; point?: BuddyPoint }) {
  const cx = 1.6 * u
  const box = (left: number, top: number, width: number, height: number, color: string, extra?: object) => ({
    position: 'absolute' as const,
    left,
    top,
    width,
    height,
    backgroundColor: color,
    ...extra,
  })
  const shoulder = 2.0 * u
  const arm = (side: -1 | 1) => {
    const x = side < 0 ? cx - 0.6 * u - 0.42 * u : cx + 0.6 * u + 0.02 * u
    // 뻗는 팔: 옆이면 가로로, 위면 어깨 위로 세운다. 손(살색)은 끝에
    if ((point === 'left' && side < 0) || (point === 'right' && side > 0)) {
      const left = side < 0 ? cx - 0.6 * u - 1.1 * u : cx + 0.6 * u
      return (
        <View key={side} style={[box(left, shoulder, 1.1 * u, 0.4 * u, shirt), styles.edge]}>
          <View style={box(side < 0 ? 0 : 0.82 * u, 0, 0.28 * u, 0.4 * u, SKIN)} />
        </View>
      )
    }
    if (point === 'up' && side > 0) {
      return (
        <View key={side} style={[box(x, shoulder - 0.75 * u, 0.4 * u, 1.05 * u, shirt), styles.edge]}>
          <View style={box(0, 0, 0.4 * u, 0.28 * u, SKIN)} />
        </View>
      )
    }
    return (
      <View key={side} style={[box(x, shoulder, 0.4 * u, 1.0 * u, shirt), styles.edge]}>
        <View style={box(0, 0.74 * u, 0.4 * u, 0.26 * u, SKIN)} />
      </View>
    )
  }

  return (
    <View style={{ width: 3.2 * u, height: 4.1 * u }}>
      {/* 다리 */}
      {[-0.5, 0.04].map((dx) => (
        <View key={dx} style={[box(cx + dx * u, 3.05 * u, 0.46 * u, 0.85 * u, PANTS), styles.edge]}>
          <View style={box(-0.02 * u, 0.65 * u, 0.5 * u, 0.22 * u, SHOE)} />
        </View>
      ))}
      {/* 몸통 */}
      <View style={[box(cx - 0.6 * u, shoulder, 1.2 * u, 1.1 * u, shirt), styles.edge]} />
      {arm(-1)}
      {arm(1)}
      {/* 머리: 얼굴, 머리카락, 눈, 볼 */}
      <View style={[box(cx - 0.56 * u, 0.9 * u, 1.12 * u, 1.12 * u, SKIN), styles.edge]}>
        <View style={box(-0.04 * u, -0.04 * u, 1.2 * u, 0.32 * u, HAIR)} />
        <View style={box(-0.04 * u, 0.2 * u, 0.12 * u, 0.36 * u, HAIR)} />
        <View style={box(1.04 * u, 0.2 * u, 0.12 * u, 0.36 * u, HAIR)} />
        <View style={box(0.27 * u, 0.48 * u, 0.15 * u, 0.24 * u, EYE)} />
        <View style={box(0.7 * u, 0.48 * u, 0.15 * u, 0.24 * u, EYE)} />
        <View style={box(0.1 * u, 0.76 * u, 0.2 * u, 0.1 * u, CHEEK)} />
        <View style={box(0.82 * u, 0.76 * u, 0.2 * u, 0.1 * u, CHEEK)} />
        <View style={box(0.44 * u, 0.86 * u, 0.24 * u, 0.06 * u, EYE)} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  edge: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
})

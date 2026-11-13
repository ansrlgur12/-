import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { OutlinedText } from './OutlinedText'
import { BORDER, FONT, INK, LIP, PALETTE, TEXT_STROKE, type PaletteName } from './theme'

interface Props {
  label: string
  sub?: string
  color?: PaletteName
  /** 글자 옆(가로) 또는 위(세로)에 놓을 그림 */
  icon?: ReactNode
  /** 그림을 글자 위에 (작은 정사각 버튼) */
  stacked?: boolean
  size?: 'lg' | 'md' | 'sm'
  onPress?: () => void
  disabled?: boolean
  /** 오른쪽 위 빨간 점 (받을 보상 등) */
  badge?: boolean
  style?: StyleProp<ViewStyle>
}

const SIZE = {
  lg: { height: 84, radius: 26, label: 30, sub: 14 },
  md: { height: 60, radius: 20, label: 22, sub: 12 },
  sm: { height: 48, radius: 16, label: 18, sub: 11 },
}
/** 글자 하나의 대략 너비 (글자 크기 배수): 한글은 거의 정사각, 숫자·영문·기호는 좁다 */
function labelEm(label: string) {
  let em = 0
  for (const ch of label) em += /[가-힣]/.test(ch) ? 1 : ch === ' ' ? 0.3 : /[()·.,!]/.test(ch) ? 0.35 : 0.62
  return em
}
/** 그림·안쪽 여백·사이 간격으로 쓰는 너비 */
const ICON_SPACE = 52
const SIDE_SPACE = 36

/** 밝은 버튼은 흰 테두리 두른 남색 글자, 나머지는 남색 테두리 두른 흰 글자 (만화처럼 굵은 글꼴) */
const DARK_TEXT: PaletteName[] = ['yellow', 'white']

/**
 * 게임 버튼: 굵은 남색 테두리, 위쪽 반짝임, 아래 턱. 누르면 턱이 눌려 들어간다
 */
export function GameButton({ label, sub, color = 'yellow', icon, stacked, size = 'md', onPress, disabled, badge, style }: Props) {
  const s = SIZE[size]
  const [face, lip] = PALETTE[color]
  const dark = DARK_TEXT.includes(color)
  // 글자는 늘 한 줄: 버튼 폭에 안 들어가면 글자 크기를 줄인다
  const [faceWidth, setFaceWidth] = useState(0)
  const room = faceWidth - SIDE_SPACE - (icon && !stacked ? ICON_SPACE : 0)
  const fontSize = faceWidth > 0 ? Math.max(11, Math.min(s.label, room / labelEm(label))) : s.label
  const labelStyle = { fontFamily: FONT.button, fontSize, lineHeight: fontSize * 1.25, color: dark ? INK : '#fff' }

  return (
    <Pressable style={[styles.outline, { borderRadius: s.radius, minHeight: stacked ? undefined : s.height }, disabled && styles.disabled, style]} disabled={disabled} onPress={onPress}>
      {({ pressed }) => (
        <>
          <View style={[styles.lip, { borderRadius: s.radius - BORDER, backgroundColor: lip, paddingTop: pressed ? LIP - 2 : 0, paddingBottom: pressed ? 2 : LIP }]}>
            <View
              style={[styles.face, { borderRadius: s.radius - BORDER, backgroundColor: face, minHeight: stacked ? undefined : s.height - LIP - BORDER * 2 }, stacked ? styles.stacked : styles.row]}
              onLayout={(e) => setFaceWidth(e.nativeEvent.layout.width)}
            >
              <View style={[styles.gloss, { borderTopLeftRadius: s.radius - BORDER, borderTopRightRadius: s.radius - BORDER }]} />
              {icon}
              <View style={styles.text}>
                <OutlinedText style={labelStyle} stroke={TEXT_STROKE} strokeColor={dark ? '#fff' : INK} depth={2} shadowColor={dark ? 'rgba(27,37,89,0.35)' : INK}>
                  {label}
                </OutlinedText>
                {sub && <Text style={[styles.sub, { fontSize: s.sub, color: dark ? INK : '#fff' }]}>{sub}</Text>}
              </View>
            </View>
          </View>
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>!</Text>
            </View>
          )}
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  outline: { backgroundColor: INK, padding: BORDER },
  lip: { overflow: 'hidden' },
  face: { overflow: 'hidden', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  stacked: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 4 },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.22)' },
  text: { alignItems: 'center' },
  sub: { fontFamily: FONT.body, opacity: 0.9, marginTop: -2 },
  disabled: { opacity: 0.45 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ef4444',
    borderWidth: BORDER,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontFamily: FONT.body, fontSize: 14, marginTop: -1 },
})

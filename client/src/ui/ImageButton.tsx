import { useRef } from 'react'
import { Animated, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import { BORDER, FONT } from './theme'

interface Props {
  source: ImageSourcePropType
  width: number
  /** 주면 이 높이 안에 맞춘다 (그림 비율이 달라도 줄 맞추기). 없으면 그림 비율대로 */
  height?: number
  onPress?: () => void
  disabled?: boolean
  /** 오른쪽 위 빨간 점 (받을 보상 등) */
  badge?: boolean
  style?: StyleProp<ViewStyle>
}

/** 그림으로 된 버튼. 누르면 살짝 눌렸다가 통 튀어 오른다 */
export function ImageButton({ source, width, height, onPress, disabled, badge, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const asset = Image.resolveAssetSource(source)
  const boxHeight = height ?? (asset?.width && asset.height ? (width * asset.height) / asset.width : width / 4)

  const to = (value: number, bounce: boolean) =>
    (bounce
      ? Animated.spring(scale, { toValue: value, speed: 30, bounciness: 12, useNativeDriver: true })
      : Animated.timing(scale, { toValue: value, duration: 70, useNativeDriver: true })
    ).start()

  return (
    <Pressable
      style={[{ width, height: boxHeight }, disabled && styles.disabled, style]}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => to(0.93, false)}
      onPressOut={() => to(1, true)}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}>
        <Image source={source} style={styles.image} resizeMode="contain" />
      </Animated.View>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>!</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  disabled: { opacity: 0.45 },
  badge: {
    position: 'absolute',
    top: -4,
    right: 0,
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

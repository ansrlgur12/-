import { useEffect, useRef } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { GameButton } from './GameButton'
import { CartoonTitle } from './OutlinedText'
import { CARD, FONT } from './theme'
import type { PaletteName } from './theme'

interface Props {
  title: string
  message?: string
  cancelLabel?: string
  confirmLabel: string
  /** 확인 버튼 색 (나가기처럼 되돌릴 수 없는 일은 빨강) */
  confirmColor?: PaletteName
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 앱 모양에 맞춘 확인 창 (시스템 Alert 대신). 화면을 덮는 층으로 그리니 이미 떠 있는 Modal 안에도 둘 수 있다.
 * 버튼은 아래쪽, 왼쪽이 취소 / 오른쪽이 확인
 */
export function ConfirmDialog({ title, message, cancelLabel = '취소', confirmLabel, confirmColor = 'red', onCancel, onConfirm }: Props) {
  const pop = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(pop, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start()
  }, [pop])

  return (
    <View style={styles.layer}>
      <Pressable style={styles.dim} onPress={onCancel} />
      <Animated.View
        style={[
          styles.card,
          { opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
        ]}
      >
        <CartoonTitle size={24}>{title}</CartoonTitle>
        {message && <Text style={styles.message}>{message}</Text>}
        <View style={styles.buttons}>
          <GameButton style={styles.button} label={cancelLabel} color="white" size="md" onPress={onCancel} />
          <GameButton style={styles.button} label={confirmLabel} color={confirmColor} size="md" onPress={onConfirm} />
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(27,37,89,0.45)' },
  card: { ...CARD, alignSelf: 'stretch', maxWidth: 420, padding: 20, gap: 12, alignItems: 'center', backgroundColor: '#f4f8ff' },
  message: { fontFamily: FONT.body, fontSize: 16, lineHeight: 23, color: '#4b557a', textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 4 },
  button: { flex: 1 },
})

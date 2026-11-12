import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { toScreen, type ScenePicker } from '../map/scenePicker'

const WIDTH = 190
/** 핀 꼭대기에서 이만큼 위 (px) */
const GAP = 10

/**
 * 핀 머리 위에 떠서 핀을 따라다니는 말풍선.
 * 매 프레임 핀 위치를 화면 좌표로 옮겨 Animated 값에 바로 넣는다 (리렌더 없이).
 */
export function PinTooltip({ picker, hidden }: { picker: ScenePicker; hidden: boolean }) {
  const pos = useRef(new Animated.ValueXY({ x: -1000, y: -1000 })).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const pin = picker.pin
      const top = pin && toScreen(picker, pin.x, pin.y + pin.height, pin.z)
      if (top) {
        pos.setValue({ x: top.x - WIDTH / 2, y: top.y - GAP })
        opacity.setValue(hidden ? 0 : 1)
      } else {
        opacity.setValue(0)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [picker, hidden, pos, opacity])

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity, transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}
    >
      <Text style={styles.bubble}>핀을 끌어서 위치를 옮길 수 있어요</Text>
      <Text style={styles.tail}>▼</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // 말풍선 아래 끝이 (x, y)에 오도록 위로 올린다
  wrap: { position: 'absolute', left: 0, top: 0, width: WIDTH, alignItems: 'center', marginTop: -44 },
  bubble: { backgroundColor: 'rgba(17,24,39,0.88)', color: '#fff', fontSize: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  tail: { color: 'rgba(17,24,39,0.88)', fontSize: 10, marginTop: -3 },
})

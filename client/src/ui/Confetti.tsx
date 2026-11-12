import { useEffect, useMemo } from 'react'
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native'

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#fde047']
const PIECES = 60

/**
 * 화면 맨 위에서 꽃종이를 한 번 쏟는다. 새로 쏟으려면 key를 바꿔 다시 그린다.
 * 조각마다 따로 움직인다: 처음부터 화면 위쪽에 흩어져 있다가 각자 속도로 떨어진다
 */
export function Confetti() {
  const { width, height } = useWindowDimensions()
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, () => ({
        v: new Animated.Value(0),
        x: Math.random() * width,
        // 시작 높이: 화면 맨 위 근처 (일부는 이미 보이는 곳에서)
        y: -40 + Math.random() * height * 0.25,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 350,
        duration: 1700 + Math.random() * 1100,
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540),
        w: 7 + Math.random() * 6,
        h: 10 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      })),
    [width, height],
  )

  useEffect(() => {
    const anims = pieces.map((p) => Animated.timing(p.v, { toValue: 1, duration: p.duration, delay: p.delay, easing: Easing.linear, useNativeDriver: true }))
    Animated.parallel(anims).start()
    return () => anims.forEach((a) => a.stop())
  }, [pieces])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: p.v.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, height - p.y + 40] }) },
              { translateX: p.v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.drift, p.drift * 0.3] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  )
}

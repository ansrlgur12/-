import { useEffect, useMemo, useRef } from 'react'
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native'
import { Color } from 'three'
import { DIRECTION_COLOR } from '../map/ChoiceArrows'
import { isDarkSky, kstHour, skyAt } from '../map/daylight'
import { BlockBuddy, type BuddyPoint } from './BlockBuddy'

/** 하늘을 위→아래로 이만큼 띠를 나눠 칠한다 (그라데이션 대신) */
const SKY_STRIPS = 8
const BUDDIES: Array<{ point: BuddyPoint; color: string }> = [
  { point: 'left', color: DIRECTION_COLOR.left },
  { point: 'up', color: DIRECTION_COLOR.straight },
  { point: 'right', color: DIRECTION_COLOR.right },
]

/** 같은 자리에 늘 같은 별 (0~1 좌표) */
const STARS = Array.from({ length: 28 }, (_, i) => ({
  x: ((i * 37) % 100) / 100,
  y: ((i * 53) % 47) / 100,
  r: 1 + (i % 3),
}))

function Bob({ delay, children }: { delay: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(900 - delay),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [v, delay])
  return <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }] }}>{children}</Animated.View>
}

function Cloud({ top, width, speed, from }: { top: number; width: number; speed: number; from: number }) {
  const { width: screen } = useWindowDimensions()
  const v = useRef(new Animated.Value(from)).current
  useEffect(() => {
    // 화면을 가로질러 흘러가고 다시 왼쪽에서 나온다
    const run = (start: number) =>
      Animated.timing(v, { toValue: 1, duration: (1 - start) * speed, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return
        v.setValue(0)
        run(0)
      })
    run(from)
    return () => v.stopAnimation()
  }, [v, speed, from])
  const x = v.interpolate({ inputRange: [0, 1], outputRange: [-width * 1.4, screen + width * 0.2] })
  return (
    <Animated.View style={[styles.cloud, { top, width, height: width * 0.32, transform: [{ translateX: x }] }]}>
      <View style={[styles.puff, { width: width * 0.45, height: width * 0.45, left: width * 0.15, top: -width * 0.2 }]} />
      <View style={[styles.puff, { width: width * 0.35, height: width * 0.35, left: width * 0.48, top: -width * 0.12 }]} />
    </Animated.View>
  )
}

/**
 * 메인 메뉴 배경. 3D 지도 대신 지금 한국 시각의 하늘, 언덕, 맡은 방향을 가리키는 세 사람.
 * 밤이면 별과 달, 낮이면 해와 흘러가는 구름.
 */
export function MenuBackdrop() {
  const { width, height } = useWindowDimensions()
  const sky = useMemo(() => {
    const now = skyAt(kstHour())
    const horizon = now.sky.clone().lerp(new Color('#ffffff'), isDarkSky(now.sky) ? 0.12 : 0.45)
    const strips = Array.from({ length: SKY_STRIPS }, (_, i) => `#${now.sky.clone().lerp(horizon, i / (SKY_STRIPS - 1)).getHexString()}`)
    return { strips, dark: isDarkSky(now.sky), night: now.night }
  }, [])
  const hillTop = height * 0.4

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {sky.strips.map((c, i) => (
        <View key={i} style={{ position: 'absolute', left: 0, right: 0, top: (hillTop * i) / SKY_STRIPS, height: hillTop / SKY_STRIPS + 1, backgroundColor: c }} />
      ))}
      <View style={{ position: 'absolute', left: 0, right: 0, top: hillTop, bottom: 0, backgroundColor: sky.strips[SKY_STRIPS - 1] }} />

      {sky.dark ? (
        <>
          {STARS.map((s, i) => (
            <View key={i} style={[styles.star, { left: s.x * width, top: s.y * hillTop, width: s.r, height: s.r, opacity: 0.5 + (i % 4) * 0.12 }]} />
          ))}
          <View style={[styles.moon, { left: width * 0.72, top: hillTop * 0.18 }]} />
        </>
      ) : (
        <>
          <View style={[styles.sun, { left: width * 0.7, top: hillTop * 0.12 }]} />
          <Cloud top={hillTop * 0.3} width={110} speed={70000} from={0.3} />
          <Cloud top={hillTop * 0.55} width={80} speed={55000} from={0.75} />
        </>
      )}

      {/* 언덕: 뒤는 진하게, 앞은 밝게. 밤이면 어둡게 */}
      <View style={[styles.hill, { width: width * 1.6, height: width * 1.6, left: -width * 0.55, top: hillTop + 30, backgroundColor: sky.dark ? '#24452f' : '#7fb26b' }]} />
      <View style={[styles.hill, { width: width * 1.8, height: width * 1.8, left: -width * 0.2, top: hillTop + 70, backgroundColor: sky.dark ? '#2f5a3b' : '#9ccc83' }]} />

      <View style={[styles.buddies, { top: hillTop - 30 }]}>
        {BUDDIES.map((b, i) => (
          <Bob key={b.point} delay={i * 220}>
            <BlockBuddy unit={20} shirt={b.color} point={b.point} />
          </Bob>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#ffffff' },
  moon: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: '#f8f3d6', shadowColor: '#f8f3d6', shadowOpacity: 0.8, shadowRadius: 16 },
  sun: { position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: '#ffe08a', shadowColor: '#ffd04d', shadowOpacity: 0.9, shadowRadius: 22 },
  cloud: { position: 'absolute', left: 0, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.92)' },
  puff: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)' },
  hill: { position: 'absolute', borderRadius: 9999 },
  buddies: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 14 },
})

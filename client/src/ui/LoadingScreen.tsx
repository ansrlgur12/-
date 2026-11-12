import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { hapticImpact } from '../lib/haptics'
import { DIRECTION_COLOR } from '../map/ChoiceArrows'
import { isDarkSky, kstHour, skyAt } from '../map/daylight'
import { useGame } from '../store/game'
import { loadSounds } from '../lib/sound'
import { BlockBuddy, type BuddyPoint } from './BlockBuddy'

/** 로딩 화면을 적어도 이만큼은 보여 준다 (글자·사람이 다 나올 때까지) */
const MIN_SHOW_MS = 2300
/** 글자가 하나씩 "탕" 찍히는 시각 (ms) */
const STAMP_AT = [250, 700, 1150]

const TIPS = [
  '갈림길마다 세 사람이 가위바위보! 이긴 사람이 맡은 방향으로 가요',
  'A는 좌회전, B는 직진, C는 우회전을 맡아요',
  '첫 판에 모두 비기면 왔던 길로 유턴해요',
  '하드코어로 도착하면 그날의 월드레코드에 올라가요',
]

/** 직 · 좌 · 우 글자와 그 방향을 맡은 사람 */
const LETTERS: Array<{ text: string; color: string; point: BuddyPoint }> = [
  { text: '직', color: DIRECTION_COLOR.straight, point: 'up' },
  { text: '좌', color: DIRECTION_COLOR.left, point: 'left' },
  { text: '우', color: DIRECTION_COLOR.right, point: 'right' },
]

/**
 * 글자 하나와 그 아래 사람. v가 0→1로 튕기며 들어온다.
 * 글자는 크게 떴다가 도장처럼 찍히고, 사람은 직진은 앞에서 다가오듯, 좌는 왼쪽에서, 우는 오른쪽에서 뛰어든다
 */
function Stamp({ letter, v, ink }: { letter: (typeof LETTERS)[number]; v: Animated.Value; ink: string }) {
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [2.6, 1] })
  const opacity = v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' })
  const enter =
    letter.point === 'up'
      ? [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }]
      : [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [letter.point === 'left' ? -220 : 220, 0] }) }]
  return (
    <View style={styles.column}>
      <Animated.Text style={[styles.letter, { color: letter.color, textShadowColor: ink, opacity, transform: [{ scale }] }]}>{letter.text}</Animated.Text>
      <Animated.View style={{ opacity, transform: enter }}>
        <BlockBuddy unit={18} shirt={letter.color} point={letter.point} />
      </Animated.View>
    </View>
  )
}

/** 앱을 켜면 처음 보이는 화면. 신원·서버 연결·소리를 준비하고 onDone을 부른다 */
export function LoadingScreen({ onDone }: { onDone: (rejoined: boolean) => void }) {
  const [step, setStep] = useState('서버에 연결하는 중…')
  const progress = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const stamps = useRef(LETTERS.map(() => new Animated.Value(0))).current
  const subtitle = useRef(new Animated.Value(0)).current
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  // 배경은 지금 한국 시각의 하늘색. 밝은 하늘이면 글자를 어둡게
  const [sky] = useState(() => {
    const color = skyAt(kstHour()).sky
    return { color: `#${color.getHexString()}`, dark: isDarkSky(color) }
  })
  const ink = sky.dark ? dark : light

  // 직 · 좌 · 우 를 하나씩 찍는다
  useEffect(() => {
    const timers = STAMP_AT.map((at, i) =>
      setTimeout(() => {
        Animated.spring(stamps[i], { toValue: 1, speed: 18, bounciness: 14, useNativeDriver: true }).start()
        hapticImpact('heavy')
      }, at),
    )
    const sub = setTimeout(
      () => Animated.timing(subtitle, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(),
      STAMP_AT[STAMP_AT.length - 1] + 400,
    )
    return () => {
      timers.forEach(clearTimeout)
      clearTimeout(sub)
    }
  }, [stamps, subtitle])

  useEffect(() => {
    let cancelled = false
    const started = Date.now()
    const to = (value: number) => Animated.timing(progress, { toValue: value, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: false }).start()

    ;(async () => {
      const rejoined = await useGame.getState().init()
      to(0.6)
      setStep('소리를 준비하는 중…')
      await loadSounds()
      to(1)
      setStep(rejoined ? '하던 게임으로 돌아가는 중…' : '준비 완료!')
      await new Promise((r) => setTimeout(r, Math.max(350, MIN_SHOW_MS - (Date.now() - started))))
      if (cancelled) return
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => !cancelled && onDone(rejoined))
    })()
    return () => {
      cancelled = true
    }
  }, [progress, fade, onDone])

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: sky.color, opacity: fade }]}>
      <StatusBar style={sky.dark ? 'light' : 'dark'} />
      <View style={styles.center}>
        <View style={styles.row}>
          {LETTERS.map((l, i) => (
            <Stamp key={l.text} letter={l} v={stamps[i]} ink={sky.dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)'} />
          ))}
        </View>
        <Animated.Text style={[styles.subtitle, ink.sub, { opacity: subtitle }]}>가위바위보로 정하는 길</Animated.Text>
      </View>
      <View style={styles.bottom}>
        <View style={[styles.bar, ink.bar]}>
          <Animated.View style={[styles.barFill, { width }]} />
        </View>
        <Text style={[styles.step, ink.title]}>{step}</Text>
        <Text style={[styles.tip, ink.sub]}>TIP · {tip}</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { justifyContent: 'space-between', paddingVertical: 80, paddingHorizontal: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  row: { flexDirection: 'row', gap: 10 },
  column: { alignItems: 'center', gap: 10, width: 86 },
  letter: { fontSize: 64, fontWeight: '900', textShadowRadius: 6, textShadowOffset: { width: 0, height: 3 } },
  subtitle: { fontSize: 16, fontWeight: '700' },
  bottom: { gap: 10 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: '#fbbf24' },
  step: { textAlign: 'center', fontWeight: '600' },
  tip: { textAlign: 'center', fontSize: 12, marginTop: 8 },
})

const dark = StyleSheet.create({
  title: { color: '#fff' },
  sub: { color: '#cbd5e1' },
  bar: { backgroundColor: 'rgba(255,255,255,0.15)' },
})
const light = StyleSheet.create({
  title: { color: '#0f172a' },
  sub: { color: '#334155' },
  bar: { backgroundColor: 'rgba(15,23,42,0.12)' },
})

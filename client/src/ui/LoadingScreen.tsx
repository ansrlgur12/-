import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { hapticImpact } from '../lib/haptics'
import { useGame } from '../store/game'
import { loadSounds } from '../lib/sound'
import { Icon } from './Icon'
import { OutlinedText } from './OutlinedText'
import { BORDER, FONT, INK, TEXT_STROKE } from './theme'

/** 로딩 화면을 적어도 이만큼은 보여 준다 (타이틀이 나오고 막대가 차는 것까지) */
const MIN_SHOW_MS = 2300

const TIPS = [
  '갈림길마다 세 사람이 가위바위보!\n이긴 사람이 맡은 방향으로 가요',
  '파랑은 좌회전, 초록은 직진,\n빨강은 우회전을 맡아요',
  '첫 판에 모두 비기면\n왔던 길로 유턴해요',
  '하드코어로 도착하면\n그날의 월드레코드에 올라가요',
]

/** 배경 그림(assets/main/loading.png를 줄인 것): 세 사람이 풀밭에 서 있는 낮 하늘 */
const BG = require('../../assets/main/soft/loading-bg.jpg')
const TITLE = require('../../assets/main/soft/menu-title.png')
const BG_ASPECT = 1086 / 1448
const TITLE_ASPECT = 1080 / 567
/** 그림 안에서 세 사람이 차지하는 가로 범위 (양옆이 잘리지 않게) */
const MEN_SPAN = 0.84
/** 그림 안 위치 (높이 비율): 세 사람 머리 위, 진행 막대 */
const MEN_TOP = 0.42
const BAR_AT = 0.755
/** 그림 맨 위 하늘색 (그림이 화면보다 짧으면 위를 이 색으로 채우고 부드럽게 잇는다) */
const SKY = 'rgb(31,153,252)'
const FADE_STRIPS = 12
const FADE_H = 90

/** 노란 막대 위 사선 무늬 */
function Stripes() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 30 }, (_, i) => (
        <View key={i} style={[styles.stripe, { left: i * 18 - 10 }]} />
      ))}
    </View>
  )
}

/** 앱을 켜면 처음 보이는 화면. 신원·서버 연결·소리를 준비하고 onDone을 부른다 */
export function LoadingScreen({ onDone }: { onDone: (rejoined: boolean) => void }) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState('서버에 연결하는 중…')
  const [percent, setPercent] = useState(0)
  const progress = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const title = useRef(new Animated.Value(0)).current
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])

  // 타이틀이 통 튀어나온다
  useEffect(() => {
    const timer = setTimeout(() => {
      hapticImpact('heavy')
      Animated.spring(title, { toValue: 1, speed: 12, bounciness: 14, useNativeDriver: true }).start()
    }, 200)
    return () => clearTimeout(timer)
  }, [title])

  useEffect(() => {
    const id = progress.addListener(({ value }) => setPercent(Math.round(value * 100)))
    return () => progress.removeListener(id)
  }, [progress])

  useEffect(() => {
    let cancelled = false
    const started = Date.now()
    const to = (value: number, duration = 450) => Animated.timing(progress, { toValue: value, duration, easing: Easing.out(Easing.quad), useNativeDriver: false }).start()

    ;(async () => {
      to(0.2)
      const rejoined = await useGame.getState().init()
      to(0.65)
      setStep('소리를 준비하는 중…')
      await loadSounds()
      to(1, Math.max(350, MIN_SHOW_MS - (Date.now() - started) - 300))
      setStep(rejoined ? '하던 게임으로 돌아가는 중…' : '준비 완료!')
      await new Promise((r) => setTimeout(r, Math.max(350, MIN_SHOW_MS - (Date.now() - started))))
      if (cancelled) return
      Animated.timing(fade, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => !cancelled && onDone(rejoined))
    })()
    return () => {
      cancelled = true
    }
  }, [progress, fade, onDone])

  // 배경: 세 사람이 양옆으로 잘리지 않을 만큼만 키우고, 아래(풀밭)에 붙인다.
  // 화면이 더 길면 위쪽 남는 곳은 같은 하늘색으로 채워 그림 위 끝과 부드럽게 잇는다
  const bgW = Math.min(height * BG_ASPECT, width / MEN_SPAN)
  const bgH = bgW / BG_ASPECT
  const bgTop = height - bgH
  const bgLeft = (width - bgW) / 2
  const titleW = Math.min(width - 40, 380)
  const titleH = titleW / TITLE_ASPECT
  // 타이틀은 하늘(화면 위 ~ 세 사람 머리 위) 한가운데
  const skyTop = insets.top + 8
  const skyBottom = bgTop + bgH * MEN_TOP
  const titleTop = Math.max(skyTop, skyTop + (skyBottom - skyTop - titleH) / 2)
  const barTop = bgTop + bgH * BAR_AT
  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <StatusBar style="light" />
      <Image source={BG} style={{ position: 'absolute', left: bgLeft, top: bgTop, width: bgW, height: bgH }} resizeMode="stretch" />
      {bgTop > 0 &&
        Array.from({ length: FADE_STRIPS }, (_, i) => (
          <View
            key={i}
            style={{ position: 'absolute', left: 0, right: 0, top: bgTop - 1 + (FADE_H * i) / FADE_STRIPS, height: FADE_H / FADE_STRIPS + 1, backgroundColor: SKY, opacity: 1 - i / FADE_STRIPS }}
          />
        ))}

      <Animated.View
        style={{
          position: 'absolute',
          top: titleTop,
          left: (width - titleW) / 2,
          opacity: title.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [{ scale: title.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
        }}
      >
        <Image source={TITLE} style={{ width: titleW, height: titleH }} resizeMode="contain" />
      </Animated.View>

      <View style={[styles.barBlock, { top: barTop - 40 }]}>
        <OutlinedText style={styles.step} stroke={TEXT_STROKE}>
          {step}
        </OutlinedText>
        <View style={styles.bar}>
          <Animated.View style={[styles.barFill, { width: barWidth }]}>
            <Stripes />
          </Animated.View>
          <View style={styles.percentBox} pointerEvents="none">
            <OutlinedText style={styles.percent} stroke={TEXT_STROKE}>
              {`${percent}%`}
            </OutlinedText>
          </View>
        </View>
      </View>

      <View style={[styles.tip, { bottom: insets.bottom + 18 }]}>
        <View style={styles.tipBadge}>
          <Icon name="bulb" size={22} />
          <Text style={styles.tipBadgeText}>TIP</Text>
        </View>
        <View style={styles.tipLine} />
        <Text style={styles.tipText}>{tip}</Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { backgroundColor: SKY, overflow: 'hidden' },
  barBlock: { position: 'absolute', left: 36, right: 36, alignItems: 'center', gap: 6 },
  step: { fontFamily: FONT.body, color: '#fff', fontSize: 20 },
  bar: { alignSelf: 'stretch', height: 30, borderRadius: 15, backgroundColor: INK, borderWidth: BORDER, borderColor: '#fff', overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#ffc928', borderRadius: 12, overflow: 'hidden' },
  stripe: { position: 'absolute', top: -10, width: 8, height: 50, backgroundColor: 'rgba(255,255,255,0.35)', transform: [{ rotate: '30deg' }] },
  percentBox: { position: 'absolute', right: 10 },
  percent: { fontFamily: FONT.body, color: '#fff', fontSize: 15 },
  tip: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15,40,30,0.55)',
    borderRadius: 22,
    borderWidth: BORDER,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tipBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#ffd84d', borderRadius: 999, paddingLeft: 4, paddingRight: 10, paddingVertical: 3 },
  tipBadgeText: { fontFamily: FONT.body, color: INK, fontSize: 15 },
  tipLine: { width: 1.5, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.4)' },
  tipText: { flex: 1, fontFamily: FONT.body, color: '#fff', fontSize: 14, lineHeight: 20 },
})

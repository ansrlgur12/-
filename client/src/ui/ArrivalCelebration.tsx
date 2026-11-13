import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import type { Seat } from '@jikjwau/shared/types'
import type { CameraRig } from '../map/cameraRig'
import { hapticImpact, hapticResult } from '../lib/haptics'
import { useGame } from '../store/game'
import { meKey, useSocial } from '../store/social'
import { Confetti } from './Confetti'
import { Icon } from './Icon'
import { formatDistance, formatDuration } from './labels'
import { OutlinedText } from './OutlinedText'
import { FONT } from './theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const SEATS: Seat[] = ['A', 'B', 'C']
/** 일행에게 확 다가간 카메라 */
const CLOSE_UP = { distance: 38, pitch: 0.38, spin: 0.35 }
/** 연출이 끝나면 돌아갈 카메라 */
const AFTER = { distance: 160, pitch: 0.95 }
/** 꽃가루를 쏟는 시각 (ms) */
const BURSTS = [250, 1000, 1800, 2700]
const SHOW_MS = 4800
/** 위아래 검은 띠 높이 (영화처럼) */
const BAR_H = 56

/** 실패 연출 카메라: 일행에게 다가가지만 돌지 않는다 */
const FAIL_CLOSE_UP = { distance: 44, pitch: 0.45 }
const FAIL_SHOW_MS = 3600

/**
 * 끝 연출. 도착이면 아래, 실패(시간·횟수를 다 씀)면 카메라가 일행에게 다가가고 큰 "실패"가 찍힌 뒤 일행이 운다.
 *
 * 도착 연출: 번쩍 → 화면 위아래 검은 띠 → 카메라가 일행에게 확 다가가 천천히 돈다 →
 * 큰 "도착!"이 도장처럼 찍히고 꽃가루가 여러 번 쏟아진다. 일행은 환호한다.
 * 이번 판에서 막 도착했을 때만 (끝난 방에 다시 들어왔을 때는 아님)
 */
export function ArrivalCelebration({ rig }: { rig: CameraRig }) {
  const insets = useSafeAreaInsets()
  const arrivedAt = useGame((s) => s.arrivedAt)
  const failedAt = useGame((s) => s.failedAt)
  const remainingM = useGame((s) => s.snapshot?.stats.remainingM)
  const limit = useGame((s) => (s.room?.rules.mode === 'normal' ? s.room.rules.limit : null))
  const rpsCount = useGame((s) => s.rpsCount)
  const distanceM = useGame((s) => s.distanceM)
  const elapsedMs = useGame((s) => s.finalElapsedMs)
  const [bursts, setBursts] = useState<number[]>([])
  const [showing, setShowing] = useState(false)
  const flash = useRef(new Animated.Value(0)).current
  const bars = useRef(new Animated.Value(0)).current
  const stamp = useRef(new Animated.Value(0)).current
  const sub = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!arrivedAt) return
    setShowing(true)
    setBursts([])
    for (const v of [flash, bars, stamp, sub]) v.setValue(0)
    fade.setValue(1)

    // 멈춘 듯 번쩍, 영화처럼 띠가 들어오고, 카메라가 일행에게 확
    hapticImpact('heavy')
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start()
    Animated.timing(bars, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    rig.following = true
    rig.distance = CLOSE_UP.distance
    rig.pitch = CLOSE_UP.pitch
    for (const seat of SEATS) useSocial.getState().showEmote(meKey(seat), 'cheer')

    const timers = [
      setTimeout(() => {
        hapticResult('success')
        Animated.spring(stamp, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }).start()
      }, 250),
      setTimeout(() => {
        rig.spin = CLOSE_UP.spin
        Animated.timing(sub, { toValue: 1, duration: 400, useNativeDriver: true }).start()
      }, 900),
      // 환호를 한 번 더
      setTimeout(() => SEATS.forEach((seat) => useSocial.getState().showEmote(meKey(seat), 'cheer')), 2300),
      ...BURSTS.map((at, i) => setTimeout(() => setBursts((b) => [...b, i]), at)),
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(fade, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(bars, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start(() => setShowing(false))
        rig.spin = 0
        rig.distance = AFTER.distance
        rig.pitch = AFTER.pitch
      }, SHOW_MS),
    ]
    return () => {
      timers.forEach(clearTimeout)
      rig.spin = 0
    }
  }, [arrivedAt, rig, flash, bars, stamp, sub, fade])

  // 실패: 번쩍임·꽃가루 없이 띠가 들어오고 카메라가 일행에게 다가간 다음 "실패"
  useEffect(() => {
    if (!failedAt) return
    setShowing(true)
    setBursts([])
    for (const v of [flash, bars, stamp, sub]) v.setValue(0)
    fade.setValue(1)
    hapticResult('error')
    Animated.timing(bars, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    rig.following = true
    rig.distance = FAIL_CLOSE_UP.distance
    rig.pitch = FAIL_CLOSE_UP.pitch
    const timers = [
      setTimeout(() => {
        hapticImpact('heavy')
        Animated.spring(stamp, { toValue: 1, speed: 12, bounciness: 8, useNativeDriver: true }).start()
        SEATS.forEach((seat) => useSocial.getState().showEmote(meKey(seat), 'cry'))
      }, 500),
      setTimeout(() => Animated.timing(sub, { toValue: 1, duration: 400, useNativeDriver: true }).start(), 1100),
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(fade, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(bars, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start(() => setShowing(false))
        rig.distance = AFTER.distance
        rig.pitch = AFTER.pitch
      }, FAIL_SHOW_MS),
    ]
    return () => timers.forEach(clearTimeout)
  }, [failedAt, rig, flash, bars, stamp, sub, fade])

  if (!showing) return null
  const failed = !!failedAt && !arrivedAt
  // 검은 띠와 번쩍임은 노치·홈 바 밑까지 (이 층은 안전 영역 안에 있어서)
  const edge = { top: -insets.top, bottom: -insets.bottom }
  const barShift = (dir: 1 | -1) => ({ transform: [{ translateY: bars.interpolate({ inputRange: [0, 1], outputRange: [dir * BAR_H, 0] }) }] })

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.bar, { top: edge.top, height: BAR_H + insets.top }, barShift(-1)]} />
      <Animated.View style={[styles.bar, { bottom: edge.bottom, height: BAR_H + insets.bottom }, barShift(1)]} />

      <Animated.View style={[styles.center, { opacity: fade }]}>
        <Animated.View
          style={{
            alignItems: 'center',
            opacity: stamp.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
            transform: [{ scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [3, 1] }) }, { rotate: stamp.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '-4deg'] }) }],
          }}
        >
          <Icon name={failed ? (limit?.kind === 'rps' ? 'rock' : 'alarm') : 'trophy'} size={88} />
          <OutlinedText style={[styles.title, failed && styles.failTitle]} stroke={5} depth={6}>
            {failed ? '실패' : '도착!'}
          </OutlinedText>
        </Animated.View>
        <Animated.View style={[styles.stats, { opacity: sub, transform: [{ translateY: sub.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}>
          <Text style={styles.statsText}>
            {failed
              ? `${limit?.kind === 'rps' ? '가위바위보 횟수를 다 썼어요' : '시간이 다 됐어요'}${remainingM !== undefined ? ` · ${formatDistance(remainingM)} 남았는데!` : ''}`
              : `가위바위보 ${rpsCount}회 · ${formatDistance(distanceM)}${elapsedMs !== undefined ? ` · ${formatDuration(elapsedMs)}` : ''}`}
          </Text>
        </Animated.View>
      </Animated.View>

      {bursts.map((i) => (
        <Confetti key={i} />
      ))}
      <Animated.View style={[styles.flash, edge, { opacity: flash }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, height: BAR_H, backgroundColor: '#000' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { fontFamily: FONT.title, fontSize: 92, lineHeight: 110, color: '#ffd84d', letterSpacing: 2 },
  failTitle: { color: '#ec7b75' },
  stats: { backgroundColor: 'rgba(15,23,42,0.75)', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8 },
  statsText: { fontFamily: FONT.button, color: '#fff', fontSize: 18 },
  flash: { position: 'absolute', left: 0, right: 0, backgroundColor: '#fff' },
})

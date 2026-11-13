import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mapPendingCount } from '../store/mapTiles'
import { ScreenBackdrop } from './ScreenBackdrop'
import { CartoonTitle, OutlinedText } from './OutlinedText'
import { Icon } from './Icon'
import { TIPS } from './LoadingScreen'
import { BORDER, FONT, INK, TEXT_STROKE } from './theme'

/** 이만큼마다 남은 지도 일을 센다 */
const POLL_MS = 150
/** 남은 일이 0인 채로 이만큼 지나면 다 그린 것으로 본다 (받은 타일의 메시는 몇 프레임에 나눠 만든다) */
const SETTLE_MS = 600
/** 지도 일이 시작되기도 전에 끝났다고 보지 않게, 처음 이만큼은 기다린다 */
const MIN_MS = 900
/** 무슨 일이 있어도 이만큼 지나면 닫는다 */
const MAX_MS = 15_000

/**
 * 지도를 새 곳으로 옮겼을 때(출발지를 정했을 때 등) 주변 타일을 다 그릴 때까지 덮는 로딩 화면.
 * 타일이 하나씩 들어와 지도가 조각조각 그려지는 모습을 보이지 않게 한다. 다 되면 onDone
 */
export function MapLoading({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets()
  const progress = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const [percent, setPercent] = useState(0)
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)])
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const id = progress.addListener(({ value }) => setPercent(Math.round(value * 100)))
    return () => progress.removeListener(id)
  }, [progress])

  useEffect(() => {
    const started = Date.now()
    let most = 0
    let idleSince = 0
    let closing = false
    const timer = setInterval(() => {
      const now = Date.now()
      const pending = mapPendingCount()
      most = Math.max(most, pending)
      // 남은 일이 줄어든 만큼 (처음 본 가장 많은 일 기준)
      if (most > 0) {
        Animated.timing(progress, { toValue: Math.min(0.95, 1 - pending / most), duration: POLL_MS, easing: Easing.linear, useNativeDriver: false }).start()
      }
      if (pending > 0) idleSince = 0
      else if (!idleSince) idleSince = now
      const settled = now - started > MIN_MS && idleSince > 0 && now - idleSince >= SETTLE_MS
      if ((settled || now - started > MAX_MS) && !closing) {
        closing = true
        clearInterval(timer)
        Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: false }).start(() =>
          Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => done.current()),
        )
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [progress, fade])

  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
  return (
    <Animated.View style={[styles.root, { top: -insets.top, bottom: -insets.bottom, opacity: fade }]}>
      <ScreenBackdrop />
      <View style={styles.center}>
        <Icon name="map" size={72} />
        <CartoonTitle size={30} light>
          지도를 그리는 중
        </CartoonTitle>
        <View style={styles.bar}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
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
  root: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 36 },
  bar: { alignSelf: 'stretch', height: 30, borderRadius: 15, backgroundColor: INK, borderWidth: BORDER, borderColor: '#fff', overflow: 'hidden', justifyContent: 'center', marginTop: 6 },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#ffc928', borderRadius: 12 },
  percentBox: { position: 'absolute', right: 10 },
  percent: { fontFamily: FONT.button, color: '#fff', fontSize: 15 },
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
  tipBadgeText: { fontFamily: FONT.button, color: INK, fontSize: 15 },
  tipLine: { width: 1.5, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.4)' },
  tipText: { flex: 1, fontFamily: FONT.body, color: '#fff', fontSize: 14, lineHeight: 20 },
})

import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import type { GameEvent, RpsRoundResult, Seat } from '@jikjwau/shared/types'
import { RPS_CHANT_MS, SEAT_DIRECTION } from '@jikjwau/shared/config'
import { DIRECTION_COLOR } from '../map/ChoiceArrows'
import { playEffect } from '../lib/sound'
import { hapticImpact, hapticResult } from '../lib/haptics'
import { useGame, useMySeat } from '../store/game'
import { Confetti } from './Confetti'
import { Icon, type IconName } from './Icon'
import { DIRECTION_ARROW, DIRECTION_LABEL, HAND_ICON, HAND_NAME, UTURN_COLOR, seatColor, seatPastel, seatTint } from './labels'
import { useSeatName } from './useSeatName'
import { OutlinedText } from './OutlinedText'
import { BORDER, FONT, INK, TEXT_STROKE } from './theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** 이번 판이 나에게 어떤 결과인지 */
type Outcome = 'win' | 'through' | 'lose' | 'draw' | 'watch'

function outcomeFor(r: RpsRoundResult, mine?: Seat): Outcome {
  if (r.winners.length === 0) return 'draw'
  if (!mine || !r.participants.includes(mine)) return 'watch'
  if (!r.winners.includes(mine)) return 'lose'
  return r.winners.length === 1 ? 'win' : 'through'
}

const HEADLINE: Record<Exclude<Outcome, 'watch'>, { icon: IconName; text: string; color: string }> = {
  win: { icon: 'party', text: '이겼다!', color: '#e0607e' },
  through: { icon: 'fist', text: '살아남았다!', color: '#d9913a' },
  lose: { icon: 'crying', text: '졌다…', color: '#6b7590' },
  draw: { icon: 'handshake', text: '비겼다!', color: INK },
}

const UTURN = UTURN_COLOR

/** 손을 공개하기 전에 한 단어씩 외친다. RPS_CHANT_MS 안에 셋 다 나온다 */
const CHANT = ['가위!', '바위!', '보!']
const CHANT_STEP_MS = RPS_CHANT_MS / CHANT.length

/**
 * 가위바위보 결과: 화면 가운데 큰 창.
 * 먼저 "가위! 바위! 보!"를 외치며 주먹을 흔들고, 그다음 누가 무엇을 냈고 누가 이겼고 어디로 가는지 보여 준다
 */
function ResultModal({ result }: { result: RpsRoundResult }) {
  const insets = useSafeAreaInsets()
  const mine = useMySeat()
  const name = useSeatName()
  const outcome = outcomeFor(result, mine)
  /** 지금 외치는 단어 번호. CHANT.length면 공개 */
  const [step, setStep] = useState(0)
  const revealed = step >= CHANT.length
  const pop = useRef(new Animated.Value(0)).current
  const word = useRef(new Animated.Value(0)).current
  const pump = useRef(new Animated.Value(0)).current
  const reveal = useRef(new Animated.Value(0)).current
  const shake = useRef(new Animated.Value(0)).current

  // 창이 튀어나오고, 단어를 하나씩 외친다
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, speed: 18, bounciness: 10, useNativeDriver: true }).start()
    const timers = CHANT.map((_, i) => setTimeout(() => setStep(i), i * CHANT_STEP_MS))
    timers.push(setTimeout(() => setStep(CHANT.length), RPS_CHANT_MS))
    return () => timers.forEach(clearTimeout)
  }, [pop])

  useEffect(() => {
    if (!revealed) {
      // 단어가 크게 찍히고, 주먹을 한 번 흔든다
      word.setValue(0)
      Animated.spring(word, { toValue: 1, speed: 24, bounciness: 14, useNativeDriver: true }).start()
      pump.setValue(0)
      Animated.sequence([
        Animated.timing(pump, { toValue: 1, duration: CHANT_STEP_MS * 0.4, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pump, { toValue: 0, duration: CHANT_STEP_MS * 0.4, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start()
      hapticImpact('light')
      playEffect('tap')
      return
    }
    // 공개
    Animated.spring(reveal, { toValue: 1, speed: 16, bounciness: 12, useNativeDriver: true }).start()
    if (outcome === 'lose') {
      Animated.sequence(
        [14, -12, 9, -6, 3, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 60, easing: Easing.linear, useNativeDriver: true })),
      ).start()
    }
    if (outcome === 'win' || outcome === 'through') hapticResult('success')
    else if (outcome === 'lose') hapticResult('error')
    else hapticImpact('heavy')
  }, [step, revealed, outcome, word, pump, reveal, shake])

  const single = result.winners.length === 1 ? result.winners[0] : null
  const headline =
    outcome === 'watch'
      ? { icon: 'eyes' as IconName, text: single ? `${name(single)} 승리!` : `${result.winners.map(name).join(' · ')} 승리!`, color: '#0f172a' }
      : HEADLINE[outcome]

  // 어디로 가는지: 한 명이 이기면 그 방향, 둘이 이기면 한 판 더, 비기면 다시 또는 유턴
  const go = single
    ? { arrow: DIRECTION_ARROW[SEAT_DIRECTION[single]], label: DIRECTION_LABEL[SEAT_DIRECTION[single]], color: seatColor(single) }
    : result.winners.length === 2
      ? { arrow: null, label: '둘이서 한 판 더!', color: '#e3a347' }
      : result.rematch
        ? { arrow: null, label: '다시 한 판!', color: '#56618f' }
        : { arrow: null, label: '유턴', color: UTURN }

  const shown = (v: Animated.Value, from: number) => ({
    opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }],
  })

  return (
    <>
      <View style={[styles.dim, { top: -insets.top, bottom: -insets.bottom }]} />
      <Animated.View
        style={[
          styles.modal,
          revealed && outcome === 'lose' && styles.modalLose,
          { opacity: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ translateX: shake }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
        ]}
      >
        {revealed ? (
          <Animated.View style={[styles.headlineRow, shown(reveal, 0.4)]}>
            <Icon name={headline.icon} size={44} />
            <Text style={[styles.headline, { color: headline.color }]} numberOfLines={1} adjustsFontSizeToFit>
              {headline.text}
            </Text>
          </Animated.View>
        ) : (
          <Animated.View style={shown(word, 2.2)}>
            <OutlinedText style={styles.chant} stroke={TEXT_STROKE} depth={3}>
              {CHANT[step]}
            </OutlinedText>
          </Animated.View>
        )}

        <View style={styles.hands}>
          {result.participants.map((seat) => {
            const won = revealed && result.winners.includes(seat)
            const lost = revealed && result.winners.length > 0 && !won
            const hand = result.hands[seat]!
            const dir = SEAT_DIRECTION[seat]
            return (
              <View key={seat} style={[styles.hand, { borderColor: seatColor(seat), backgroundColor: seatTint(seat) }, won && { backgroundColor: seatPastel(seat), borderWidth: BORDER + 2 }, lost && styles.handLost]}>
                <View style={styles.crown}>{won && <Icon name="crown" size={26} />}</View>
                {revealed ? (
                  <Animated.View style={shown(reveal, 0.3)}>
                    <Icon name={HAND_ICON[hand]} size={60} />
                  </Animated.View>
                ) : (
                  // 외치는 동안은 다들 주먹을 흔든다
                  <Animated.View style={{ transform: [{ translateY: pump.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }, { rotate: pump.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] }) }] }}>
                    <Icon name="rock" size={60} />
                  </Animated.View>
                )}
                <Text style={styles.handName}>{revealed ? HAND_NAME[hand] : ' '}</Text>
                <Text style={[styles.handSeat, seat === mine && styles.me]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {name(seat)}
                </Text>
                <Text style={[styles.handDir, { color: seatColor(seat) }]}>
                  {DIRECTION_LABEL[dir]}
                </Text>
              </View>
            )
          })}
        </View>

        {/* 공개 전에도 자리를 잡아 둬서 창 크기가 변하지 않게 */}
        <Animated.View style={[styles.go, { backgroundColor: go.color }, revealed ? shown(reveal, 0.5) : styles.hidden]}>
          {go.arrow && <Text style={styles.goArrow}>{go.arrow}</Text>}
          <Text style={styles.goLabel}>{go.label}</Text>
        </Animated.View>
        <Text style={[styles.note, !revealed && styles.hidden]}>
          {result.timedOut.length > 0
            ? `시간이 지나 ${result.timedOut.map(name).join(', ')} 대신 AI가 냈어요`
            : !single && result.winners.length === 0 && !result.rematch
              ? '모두 비겨서 왔던 길로 돌아가요'
              : ' '}
        </Text>
      </Animated.View>
      {revealed && (outcome === 'win' || outcome === 'through') && <Confetti />}
    </>
  )
}

function moveBanner(e: Extract<GameEvent, { type: 'move' }>): { icon?: IconName; text: string; color: string } {
  const dir = e.direction
  const color = dir ? DIRECTION_COLOR[dir] : UTURN
  switch (e.reason) {
    case 'start':
      return { text: '출발!', color: '#56618f' }
    case 'win':
      return { text: `${DIRECTION_ARROW[dir!]} ${DIRECTION_LABEL[dir!]} 중`, color }
    case 'uturn':
      return { text: '유턴 중', color: UTURN }
    case 'deadEnd':
      return { text: '막다른 길! 돌아가요', color: UTURN }
    case 'only':
      return { text: dir ? `${DIRECTION_ARROW[dir]} 외길이라 ${DIRECTION_LABEL[dir]}` : '외길이라 그대로', color }
  }
}

/** 이벤트마다 번호를 매겨, 같은 결과가 연달아 나와도 결과 창이 새로 뜨게 한다 */
const ids = new WeakMap<object, number>()
let nextId = 0
const eventId = (e: object) => {
  if (!ids.has(e)) ids.set(e, nextId++)
  return ids.get(e)!
}

/** 지도 위에 겹치는 연출: 가위바위보 결과 창, 움직이는 동안 어디로 가는지 (도착 연출은 ArrivalCelebration) */
export function RoundOverlay() {
  const current = useGame((s) => s.current)
  const banner = current?.type === 'move' ? moveBanner(current) : null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {current?.type === 'rps' && <ResultModal key={eventId(current)} result={current.result} />}
      {banner && (
        <View style={styles.bannerWrap}>
          <View style={[styles.banner, { backgroundColor: banner.color }]}>
            {banner.icon && <Icon name={banner.icon} size={28} />}
            <Text style={styles.bannerText}>{banner.text}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,37,89,0.25)' },
  modal: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '12%',
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  modalLose: { backgroundColor: '#eef1f6' },
  chant: { fontFamily: FONT.body, fontSize: 48, lineHeight: 56, color: '#ffd84d' },
  headlineRow: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { fontFamily: FONT.body, fontSize: 36, flexShrink: 1 },
  hands: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignSelf: 'stretch' },
  hand: { flex: 1, maxWidth: 120, borderWidth: BORDER + 1, borderRadius: 16, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
  handLost: { opacity: 0.4 },
  crown: { height: 28, justifyContent: 'center' },
  handName: { fontFamily: FONT.body, fontSize: 15, color: '#4b557a', marginTop: 2 },
  // 누가 누군지 한눈에: 이름을 가장 크게
  handSeat: { fontFamily: FONT.button, fontSize: 20, lineHeight: 26, color: INK, marginTop: 2, paddingHorizontal: 4 },
  me: { color: '#4a78c9' },
  handDir: { fontFamily: FONT.button, fontSize: 14, marginTop: 2 },
  go: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 22 },
  goArrow: { fontFamily: FONT.body, fontSize: 44, color: '#fff' },
  goLabel: { fontFamily: FONT.body, fontSize: 36, color: '#fff' },
  hidden: { opacity: 0 },
  note: { fontFamily: FONT.body, fontSize: 13, color: '#475569' },
  bannerWrap: { position: 'absolute', top: 12, left: 60, right: 60, alignItems: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bannerText: { fontFamily: FONT.body, color: '#fff', fontSize: 24 },
})

import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { ATTENDANCE_REWARDS, MISSIONS } from '@jikjwau/shared/config'
import type { MissionDef } from '@jikjwau/shared/types'
import { useProfile } from '../store/profile'
import { playEffect } from '../lib/sound'
import { Icon, type IconName } from './Icon'
import { CartoonTitle, OutlinedText } from './OutlinedText'
import { GameButton } from './GameButton'
import { BORDER, FONT, INK, LIP, TEXT_STROKE } from './theme'

/** 받을 수 있는 보상이 있는지 (메뉴 버튼의 빨간 점) */
export function useHasReward() {
  return useProfile((s) => {
    const p = s.profile
    if (!p) return false
    if (!p.attendance.claimedToday) return true
    return p.missions.some((m) => !m.claimed && m.progress >= (MISSIONS.find((d) => d.id === m.id)?.goal ?? Infinity))
  })
}

/** 묶음 이름표: 아이콘 + 굵은 이름 + 작은 설명 (남색·보라 띠) */
function SectionLabel({ icon, title, sub, color }: { icon: IconName; title: string; sub?: string; color: string }) {
  return (
    <View style={[styles.label, { backgroundColor: color }]}>
      <Icon name={icon} size={30} style={styles.labelIcon} />
      <OutlinedText style={styles.labelTitle} stroke={TEXT_STROKE}>
        {title}
      </OutlinedText>
      {sub && <Text style={styles.labelSub}> · {sub}</Text>}
    </View>
  )
}

/** 받을 수 있는 보상 버튼은 살짝 통통 뛰어 눈에 띄게 */
function usePulse(on: boolean) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!on) return void v.setValue(0)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(500),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [on, v])
  return v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })
}

/** 코인 보상 / 받음 버튼 (노란 알약에 주황 테두리, 받은 것은 초록) */
function Claim({ reward, done, claimed, busy, onPress }: { reward: number; done: boolean; claimed: boolean; busy: boolean; onPress: () => void }) {
  const scale = usePulse(done && !claimed)
  if (claimed) {
    return (
      <View style={[styles.claim, styles.claimed]}>
        <OutlinedText style={styles.claimText} stroke={TEXT_STROKE} strokeColor="#22702b">
          ✓ 받음
        </OutlinedText>
      </View>
    )
  }
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable style={({ pressed }) => [styles.claim, pressed && styles.claimPressed]} disabled={!done || busy} onPress={onPress}>
        <Icon name="coin" size={26} />
        <OutlinedText style={styles.claimText} stroke={TEXT_STROKE} strokeColor="#9a5300">
          {reward}
        </OutlinedText>
      </Pressable>
    </Animated.View>
  )
}

function MissionRow({ def }: { def: MissionDef }) {
  const state = useProfile((s) => s.profile?.missions.find((m) => m.id === def.id))
  const busy = useProfile((s) => s.busy)
  const progress = state?.progress ?? 0
  const done = progress >= def.goal
  const claimed = !!state?.claimed
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{def.title}</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.min(1, progress / def.goal) * 100}%` }, done && styles.barDone]} />
        </View>
        <Text style={styles.rowSub}>
          {Math.min(progress, def.goal)} / {def.goal}
        </Text>
      </View>
      <Claim reward={def.reward} done={done} claimed={claimed} busy={busy} onPress={() => (playEffect('win'), useProfile.getState().claim(def.id))} />
    </View>
  )
}

function Panel({ color, children }: { color: string; children: ReactNode }) {
  return <View style={[styles.panel, { backgroundColor: color }]}>{children}</View>
}

/** 출석 · 일일 미션 · 주간 미션 */
export function MissionSheet({ onClose }: { onClose: () => void }) {
  const profile = useProfile((s) => s.profile)
  const busy = useProfile((s) => s.busy)
  const error = useProfile((s) => s.error)
  const att = profile?.attendance
  // 7일 주기에서 오늘(받았으면 받은 날)의 칸
  const todayIndex = att ? ((att.claimedToday ? att.streak : att.streak + 1) - 1) % ATTENDANCE_REWARDS.length : 0

  return (
    <View style={styles.frame}>
      {/* 머리: 리본 같은 이름표와 닫기 */}
      <View style={styles.head}>
        <View style={styles.headSide} />
        <View style={styles.ribbon}>
          <Icon name="clipboard" size={40} />
          <CartoonTitle size={32} light>
            미션
          </CartoonTitle>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.inner}>
        {error && <Text style={styles.error}>{error}</Text>}

        <SectionLabel icon="calendar" title="출석 미션" sub={att && att.streak > 0 ? `${att.streak}일 연속` : undefined} color="#33438a" />
        <Panel color="#fbefc9">
          <View style={styles.days}>
            {ATTENDANCE_REWARDS.map((r, i) => {
              const past = i < todayIndex || (i === todayIndex && !!att?.claimedToday)
              const today = i === todayIndex && !att?.claimedToday
              return (
                <View key={i} style={[styles.day, past && styles.dayPast, today && styles.dayToday]}>
                  <Text style={styles.dayLabel}>{i + 1}일</Text>
                  {past ? (
                    <OutlinedText style={styles.check} stroke={TEXT_STROKE} strokeColor="#fff">
                      ✓
                    </OutlinedText>
                  ) : (
                    <View style={styles.dayReward}>
                      <Icon name="coin" size={14} />
                      <Text style={styles.dayRewardText}>{r}</Text>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
          {att && !att.claimedToday && (
            <GameButton
              label={`오늘 출석하고 ${att.todayReward}코인 받기`}
              color="green"
              size="sm"
              icon={<Icon name="gift" size={26} />}
              disabled={busy}
              onPress={() => (playEffect('win'), useProfile.getState().attend())}
            />
          )}
        </Panel>

        <SectionLabel icon="target" title="오늘의 미션" sub="매일 0시 초기화" color="#5b3fc4" />
        <Panel color="#e3edff">
          {MISSIONS.filter((m) => m.period === 'daily').map((m) => (
            <MissionRow key={m.id} def={m} />
          ))}
        </Panel>

        <SectionLabel icon="calendar" title="이번 주 미션" sub="월요일 0시 초기화" color="#5b3fc4" />
        <Panel color="#ece6ff">
          {MISSIONS.filter((m) => m.period === 'weekly').map((m) => (
            <MissionRow key={m.id} def={m} />
          ))}
        </Panel>

        <Text style={styles.note}>게임 시간과 가위바위보는 직접 낸 것만 세요. 판을 끝까지 하면 코인을 받아요 (포기하면 없음).</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#5b9bff', borderRadius: 28, borderWidth: BORDER, borderColor: INK, padding: 8, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center' },
  headSide: { width: 40 },
  ribbon: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 18,
    backgroundColor: '#3f7ef0',
    borderWidth: BORDER,
    borderColor: INK,
  },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', borderWidth: BORDER, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  close: { fontFamily: FONT.body, fontSize: 18, color: INK },
  inner: { backgroundColor: '#fffaf0', borderRadius: 22, borderWidth: BORDER, borderColor: INK, padding: 10, gap: 8 },
  error: { fontFamily: FONT.body, color: '#dc2626' },
  label: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: BORDER, borderColor: INK, paddingLeft: 30, paddingRight: 14, paddingVertical: 3, marginLeft: 14, marginTop: 4 },
  labelIcon: { position: 'absolute', left: -16 },
  labelTitle: { fontFamily: FONT.title, fontSize: 18, lineHeight: 23, color: '#ffe066' },
  labelSub: { fontFamily: FONT.body, fontSize: 13, color: '#fff' },
  panel: { borderRadius: 18, borderWidth: BORDER, borderColor: '#cdd8f0', padding: 8, gap: 8 },
  days: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 12, backgroundColor: '#fff', borderWidth: BORDER, borderColor: '#cdd8f0', borderBottomWidth: LIP, gap: 2 },
  dayPast: { backgroundColor: '#8fdc6c', borderColor: '#3f9b3c' },
  dayToday: { borderColor: '#f0a020', backgroundColor: '#fff6d1' },
  dayLabel: { fontFamily: FONT.body, fontSize: 13, color: INK },
  check: { fontFamily: FONT.title, fontSize: 20, lineHeight: 24, color: '#1f7a2e' },
  dayReward: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  dayRewardText: { fontFamily: FONT.body, fontSize: 14, color: INK },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, borderWidth: BORDER, borderColor: '#cdd8f0', borderBottomWidth: LIP, paddingHorizontal: 12, paddingVertical: 8 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: FONT.body, fontSize: 16, color: INK },
  rowSub: { fontFamily: FONT.body, fontSize: 12, color: '#5b6593' },
  bar: { height: 10, borderRadius: 5, backgroundColor: '#d3dcf0', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5, backgroundColor: '#3b82f6' },
  barDone: { backgroundColor: '#3cc84a' },
  claim: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 80, height: 40, borderRadius: 14, backgroundColor: '#ffd23f', borderWidth: BORDER, borderColor: '#d98a00', borderBottomWidth: LIP, paddingHorizontal: 10 },
  claimPressed: { borderBottomWidth: BORDER, marginTop: LIP - BORDER },
  claimed: { backgroundColor: '#46c24f', borderColor: '#2d8a35' },
  claimText: { fontFamily: FONT.button, fontSize: 19, lineHeight: 24, color: '#fff' },
  note: { fontFamily: FONT.body, fontSize: 12, color: '#5b6593', lineHeight: 17, textAlign: 'center', marginTop: 2 },
})

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ATTENDANCE_REWARDS, MISSIONS } from '@jikjwau/shared/config'
import type { MissionDef } from '@jikjwau/shared/types'
import { useProfile } from '../store/profile'
import { playEffect } from '../lib/sound'
import { Icon } from './Icon'

/** 받을 수 있는 보상이 있는지 (메뉴 버튼의 빨간 점) */
export function useHasReward() {
  return useProfile((s) => {
    const p = s.profile
    if (!p) return false
    if (!p.attendance.claimedToday) return true
    return p.missions.some((m) => !m.claimed && m.progress >= (MISSIONS.find((d) => d.id === m.id)?.goal ?? Infinity))
  })
}

function MissionRow({ def }: { def: MissionDef }) {
  const state = useProfile((s) => s.profile?.missions.find((m) => m.id === def.id))
  const busy = useProfile((s) => s.busy)
  const progress = state?.progress ?? 0
  const done = progress >= def.goal
  const claimed = !!state?.claimed
  return (
    <View style={[styles.row, claimed && styles.rowDone]}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{def.title}</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${(progress / def.goal) * 100}%` }, done && styles.barDone]} />
        </View>
        <Text style={styles.rowSub}>
          {progress} / {def.goal}
        </Text>
      </View>
      <Pressable
        style={[styles.claim, (!done || claimed || busy) && styles.claimOff]}
        disabled={!done || claimed || busy}
        onPress={() => (playEffect('win'), useProfile.getState().claim(def.id))}
      >
        <Text style={styles.claimText}>{claimed ? '받음' : <><Icon name="coin" size={14} /> {def.reward}</>}</Text>
      </Pressable>
    </View>
  )
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
    <View style={styles.sheet}>
      <View style={styles.head}>
        <Text style={styles.title}>미션</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>출석{att && att.streak > 0 ? ` · ${att.streak}일 연속` : ''}</Text>
      <View style={styles.days}>
        {ATTENDANCE_REWARDS.map((r, i) => {
          const past = i < todayIndex || (i === todayIndex && !!att?.claimedToday)
          const today = i === todayIndex && !att?.claimedToday
          return (
            <View key={i} style={[styles.day, past && styles.dayPast, today && styles.dayToday]}>
              <Text style={styles.dayLabel}>{i + 1}일</Text>
              <Text style={styles.dayReward}>{past ? '✓' : r}</Text>
            </View>
          )
        })}
      </View>
      {att && !att.claimedToday && (
        <Pressable style={[styles.attend, busy && styles.claimOff]} disabled={busy} onPress={() => (playEffect('win'), useProfile.getState().attend())}>
          <Text style={styles.attendText}>
            <Icon name="gift" size={20} /> 오늘 출석하고 <Icon name="coin" size={18} /> {att.todayReward} 받기
          </Text>
        </Pressable>
      )}

      <Text style={styles.section}>오늘의 미션 · 매일 0시 초기화</Text>
      {MISSIONS.filter((m) => m.period === 'daily').map((m) => (
        <MissionRow key={m.id} def={m} />
      ))}
      <Text style={styles.section}>이번 주 미션 · 월요일 0시 초기화</Text>
      {MISSIONS.filter((m) => m.period === 'weekly').map((m) => (
        <MissionRow key={m.id} def={m} />
      ))}
      <Text style={styles.note}>게임 시간과 가위바위보는 직접 낸 것만 세요. 판을 끝까지 하면 코인을 받아요 (포기하면 없음).</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 16, gap: 8 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  close: { fontSize: 18, color: '#6b7280' },
  error: { color: '#dc2626' },
  section: { marginTop: 8, fontWeight: '800', color: '#374151' },
  days: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: '#f1f5f9' },
  dayPast: { backgroundColor: '#dcfce7' },
  dayToday: { backgroundColor: '#fef3c7', borderWidth: 2, borderColor: '#f59e0b' },
  dayLabel: { fontSize: 11, color: '#6b7280' },
  dayReward: { fontWeight: '800', color: '#a16207' },
  attend: { backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  attendText: { color: '#fff', fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10 },
  rowDone: { opacity: 0.5 },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontWeight: '700', color: '#111827' },
  rowSub: { fontSize: 11, color: '#6b7280' },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: '#60a5fa' },
  barDone: { backgroundColor: '#22c55e' },
  claim: { backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  claimOff: { backgroundColor: '#cbd5e1' },
  claimText: { color: '#fff', fontWeight: '800' },
  note: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
})

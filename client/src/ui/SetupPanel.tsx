import { Pressable, StyleSheet, Text, View } from 'react-native'
import { project } from '@jikjwau/shared/geo'
import { DESTINATION_MAX_M, DESTINATION_MIN_M, DESTINATION_WARN_M } from '@jikjwau/shared/config'
import { useGame, type Spot } from '../store/game'
import { playEffect } from '../lib/sound'
import { Icon, type IconName } from './Icon'
import { formatDistance, rulesLabel } from './labels'

/** 이보다 멀리 떨어진 길로 옮겨지면 알려 준다 */
const ROAD_NOTE_M = 40

/** 고른 곳과 길 사이 안내. 길이 없으면 막는다 */
function roadNote(spot: Spot | null, kind: 'start' | 'destination') {
  if (!spot) return null
  if (spot.road === 'checking') return { text: '근처 길을 확인하는 중…', bad: false }
  if (spot.road === 'none') return { text: '300m 안에 걸을 수 있는 길이 없어요. 다른 곳을 골라 주세요', bad: true }
  if (spot.road === 'island') return { text: '걸어서 갈 수 없는 곳이에요 (다리 없는 섬, 제주도 등). 육지를 골라 주세요', bad: true }
  if (spot.road === 'abroad') return { text: '대한민국 안에서만 할 수 있어요', bad: true }
  if (typeof spot.road === 'number' && spot.road > ROAD_NOTE_M)
    return { text: `가장 가까운 길(${formatDistance(spot.road)} 떨어짐)에서 ${kind === 'start' ? '출발해요' : '도착으로 쳐요'}`, bad: false }
  return null
}

interface RowProps {
  kind: 'start' | 'destination'
  icon: IconName
  label: string
  spot: Spot | null
  placeholder: string
  onPress: () => void
}

function PlaceRow({ kind, icon, label, spot, placeholder, onPress }: RowProps) {
  const note = roadNote(spot, kind)
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed, note?.bad && styles.rowBad]} onPress={onPress}>
      <Icon name={icon} size={30} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.place, !spot && styles.placeholder]} numberOfLines={1}>
          {spot?.name ?? placeholder}
        </Text>
        {note && (
          <Text style={[styles.note, note.bad && styles.noteBad]} numberOfLines={2}>
            {note.text}
          </Text>
        )}
      </View>
      <Text style={styles.change}>{spot ? '바꾸기' : '고르기'}</Text>
    </Pressable>
  )
}

/** 메뉴에서 고른 규칙으로 출발지·목적지를 정한다. 혼자면 바로 출발, 멀티면 방을 만든다 */
export function SetupPanel() {
  const { start, startChosen, destination, plan, busy, error, createRoom, setScreen, setPlaceSheet } = useGame()
  const from = startChosen ? start : null

  const offset = from && destination ? project(destination.latLng, from.latLng) : null
  const straight = offset ? Math.hypot(offset.x, offset.y) : null
  const tooNear = straight !== null && straight < DESTINATION_MIN_M
  const tooFar = straight !== null && straight > DESTINATION_MAX_M
  // 확인을 못 했으면(통신 실패) 막지 않는다. 방을 만들 때 서버가 다시 확인한다
  const roadOk = (spot: Spot | null) => !!spot && (spot.road === undefined || typeof spot.road === 'number')
  const roadsOk = roadOk(from) && roadOk(destination)
  const canCreate = roadsOk && !tooNear && !tooFar && !busy && !!plan

  const open = (sheet: 'start' | 'destination') => {
    playEffect('tap')
    setPlaceSheet(sheet)
  }

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Pressable onPress={() => (playEffect('tap'), setScreen('menu'))} hitSlop={10}>
          <Text style={styles.back}>← 메뉴</Text>
        </Pressable>
        {plan && (
          <Text style={[styles.badge, plan.rules.mode === 'hardcore' && styles.badgeHard]}>
            {plan.solo ? '혼자' : '멀티'} · {rulesLabel(plan.rules)}
          </Text>
        )}
      </View>

      <PlaceRow kind="start" icon="flag" label="출발" spot={from} placeholder="출발할 곳을 골라 주세요" onPress={() => open('start')} />
      <PlaceRow kind="destination" icon="finish" label="도착" spot={destination} placeholder="도착할 곳을 골라 주세요" onPress={() => open('destination')} />
      {straight !== null && (
        <Text style={[styles.hint, (tooNear || tooFar || straight > DESTINATION_WARN_M) && styles.warn]}>
          직선 거리 {formatDistance(straight)}
          {tooNear && ` · ${DESTINATION_MIN_M}m 이상 떨어진 곳을 골라 주세요`}
          {tooFar && ` · ${DESTINATION_MAX_M / 1000}km 안쪽만 고를 수 있어요`}
          {!tooFar && straight > DESTINATION_WARN_M && ' · 무작위로 움직이는 게임이라 도착이 매우 어려울 수 있어요'}
        </Text>
      )}

      <Pressable style={[styles.primary, !canCreate && styles.disabled]} onPress={() => (playEffect('tap'), createRoom())} disabled={!canCreate}>
        <Text style={styles.primaryText}>{busy ? (plan?.solo ? '길을 불러오는 중…' : '방 만드는 중…') : plan?.solo ? '출발하기' : '방 만들기'}</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { color: '#2563eb', fontWeight: '800', fontSize: 15 },
  badge: { backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  badgeHard: { backgroundColor: '#1f2937', color: '#fca5a5' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f1f5f9', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  rowPressed: { backgroundColor: '#e2e8f0' },
  rowBad: { backgroundColor: '#fee2e2' },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 12, fontWeight: '800', color: '#64748b' },
  place: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  placeholder: { color: '#94a3b8', fontWeight: '600' },
  note: { fontSize: 12, color: '#b45309', marginTop: 2 },
  noteBad: { color: '#dc2626', fontWeight: '700' },
  change: { color: '#2563eb', fontWeight: '800' },
  hint: { color: '#6b7280', fontSize: 13, textAlign: 'center' },
  warn: { color: '#b45309' },
  error: { color: '#dc2626', textAlign: 'center' },
  primary: { backgroundColor: '#e11d48', borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  disabled: { opacity: 0.4 },
})

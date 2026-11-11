import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Seat } from '@jikjwau/shared/types'
import { project } from '@jikjwau/shared/geo'
import { DESTINATION_MAX_M, DESTINATION_MIN_M, DESTINATION_WARN_M } from '@jikjwau/shared/config'
import { useGame } from '../store/game'
import { formatDistance, seatColor, seatLabel } from './labels'

const SEATS: Seat[] = ['A', 'B', 'C']

/** 고른 출발지·목적지를 보여 주고, 내 자리를 골라 게임을 시작한다 */
export function SetupPanel() {
  const { start, destination, seat, status, error, setSeat, startGame } = useGame()

  const offset = destination ? project(destination.latLng, start.latLng) : null
  const straight = offset ? Math.hypot(offset.x, offset.y) : null
  const tooNear = straight !== null && straight < DESTINATION_MIN_M
  const tooFar = straight !== null && straight > DESTINATION_MAX_M
  const canStart = destination && !tooNear && !tooFar && status === 'setup'

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
        <Text style={styles.place} numberOfLines={1}>
          {start.name}
        </Text>
      </View>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: '#e11d48' }]} />
        <Text style={[styles.place, !destination && styles.placeholder]} numberOfLines={1}>
          {destination?.name ?? '목적지를 검색하거나 지도를 길게 눌러 고르세요'}
        </Text>
      </View>

      {straight !== null && (
        <Text style={[styles.hint, (tooNear || tooFar || straight > DESTINATION_WARN_M) && styles.warn]}>
          직선 거리 {formatDistance(straight)}
          {tooNear && ` · ${DESTINATION_MIN_M}m 이상 떨어진 곳을 골라 주세요`}
          {tooFar && ` · ${DESTINATION_MAX_M / 1000}km 안쪽만 고를 수 있어요`}
          {!tooFar && straight > DESTINATION_WARN_M && ' · 무작위로 움직이는 게임이라 도착이 매우 어려울 수 있어요'}
        </Text>
      )}

      <View style={styles.row}>
        {SEATS.map((s) => (
          <Pressable
            key={s}
            style={[styles.seat, { borderColor: seatColor(s) }, seat === s && { backgroundColor: seatColor(s) }]}
            onPress={() => setSeat(s)}
          >
            <Text style={[styles.seatText, seat === s && styles.seatTextOn]}>{seatLabel(s)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>내 자리를 고르세요. 나머지 두 자리는 AI가 맡아요</Text>

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.startButton, !canStart && styles.disabled]} onPress={startGame} disabled={!canStart}>
        <Text style={styles.startText}>{status === 'starting' ? '준비 중…' : '게임 시작'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#eee' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  place: { flex: 1, fontWeight: '600', color: '#111827' },
  placeholder: { color: '#9ca3af', fontWeight: '400' },
  hint: { color: '#6b7280', fontSize: 12 },
  warn: { color: '#b45309' },
  error: { color: '#dc2626' },
  seat: { flex: 1, borderWidth: 2, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  seatText: { fontWeight: '700', color: '#374151' },
  seatTextOn: { color: '#fff' },
  startButton: { backgroundColor: '#e11d48', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  startText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
})

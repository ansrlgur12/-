import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameEvent, Hand, RpsRoundResult, Seat } from '@jikjwau/shared/types'
import { SEAT_DIRECTION } from '@jikjwau/shared/config'
import { useGame } from '../store/game'
import { useNow } from './useNow'
import { DIRECTION_LABEL, HAND_EMOJI, HAND_LABEL, formatDistance, formatDuration, seatColor, seatLabel } from './labels'

const HANDS: Hand[] = ['scissors', 'rock', 'paper']

function seatName(seat: Seat, mine: Seat) {
  return seat === mine ? `${seat}(나)` : seat
}

function resultText(r: RpsRoundResult, mine: Seat) {
  if (r.winners.length === 1) {
    const w = r.winners[0]
    return `${seatName(w, mine)} 승리 → ${DIRECTION_LABEL[SEAT_DIRECTION[w]]}`
  }
  if (r.winners.length === 2) return `${r.winners.map((s) => seatName(s, mine)).join('·')} 승리 → 둘이서 다시!`
  return r.rematch ? '비겼어요 → 다시!' : '모두 비겼어요 → 왔던 길로 유턴'
}

function moveText(e: Extract<GameEvent, { type: 'move' }>) {
  switch (e.reason) {
    case 'start':
      return '출발! 첫 교차로까지 걸어가요'
    case 'win':
      return `${DIRECTION_LABEL[e.direction!]} 하는 중`
    case 'uturn':
      return '유턴하는 중'
    case 'deadEnd':
      return '막다른 길이라 돌아가는 중'
    case 'only':
      return `갈 수 있는 길이 하나뿐이라 ${e.direction ? DIRECTION_LABEL[e.direction] : '그대로'} 하는 중`
  }
}

function RoundCard({ result, mine }: { result: RpsRoundResult; mine: Seat }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{result.rematch ? '재경기' : '가위바위보'}</Text>
      <View style={styles.hands}>
        {result.participants.map((seat) => {
          const hand = result.hands[seat]!
          const won = result.winners.includes(seat)
          return (
            <View key={seat} style={[styles.handBox, { borderColor: seatColor(seat) }, won && { backgroundColor: seatColor(seat) }]}>
              <Text style={styles.handEmoji}>{HAND_EMOJI[hand]}</Text>
              <Text style={[styles.handSeat, won && styles.onColor]}>{seatName(seat, mine)}</Text>
            </View>
          )
        })}
      </View>
      <Text style={styles.resultText}>{resultText(result, mine)}</Text>
      {result.timedOut.includes(mine) && <Text style={styles.warn}>시간이 지나 AI가 대신 냈어요</Text>}
    </View>
  )
}

/** 게임 중 아래쪽 패널: 기록, 연출 설명, 내 차례면 가위바위보 버튼 */
export function GamePanel() {
  const { game, status, current, prompt, sending, error, rpsCount, distanceM, position, finalElapsedMs, choose, backToSetup } = useGame()
  const now = useNow(250, status === 'playing')

  const timeLeft = prompt ? Math.max(0, prompt.deadline - now) : 0
  const myTurn = !!prompt && !current

  // 시간이 다 되면 서버에 알려 AI가 대신 내게 한다 (한 판에 한 번만)
  const timedOutFor = useRef<number | null>(null)
  useEffect(() => {
    if (!myTurn || timeLeft > 0 || sending || timedOutFor.current === prompt.deadline) return
    timedOutFor.current = prompt.deadline
    choose(null)
  }, [myTurn, timeLeft, sending, prompt, choose])

  if (!game) return null
  const mine = game.seat
  const [dx, dy] = [game.destination.point[0] - position[0], game.destination.point[1] - position[1]]
  const elapsed = finalElapsedMs ?? now - game.startedAt

  return (
    <View style={styles.panel}>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>✊ {rpsCount}회</Text>
        <Text style={styles.stat}>🚶 {formatDistance(distanceM)}</Text>
        <Text style={styles.stat}>🚩 {formatDistance(Math.hypot(dx, dy))}</Text>
        <Text style={styles.stat}>⏱ {formatDuration(elapsed)}</Text>
      </View>

      {status === 'arrived' && (
        <View style={styles.card}>
          <Text style={styles.arrived}>🎉 도착했어요!</Text>
          <Text style={styles.resultText}>
            가위바위보 {rpsCount}회 · {formatDistance(distanceM)} · {formatDuration(elapsed)}
          </Text>
        </View>
      )}

      {current?.type === 'rps' && <RoundCard result={current.result} mine={mine} />}
      {current?.type === 'move' && <Text style={styles.info}>{moveText(current)}</Text>}

      {myTurn && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {prompt.rematch ? '재경기' : '교차로'} · {prompt.participants.map((s) => (s === mine ? `${seatLabel(s)}(나)` : seatLabel(s))).join(' / ')}
          </Text>
          <Text style={[styles.countdown, timeLeft < 5000 && styles.warn]}>{Math.ceil(timeLeft / 1000)}초</Text>
          <View style={styles.hands}>
            {HANDS.map((h) => (
              <Pressable key={h} style={[styles.handButton, sending && styles.disabled]} disabled={sending} onPress={() => choose(h)}>
                <Text style={styles.handButtonText}>{HAND_LABEL[h]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.quit} onPress={backToSetup}>
        <Text style={styles.quitText}>{status === 'arrived' ? '새 게임' : '그만하기'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#eee', minHeight: 200 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { color: '#111827', fontWeight: '600' },
  info: { color: '#374151', textAlign: 'center', paddingVertical: 8 },
  card: { alignItems: 'center', gap: 6 },
  cardTitle: { color: '#374151', fontWeight: '600' },
  hands: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  handBox: { borderWidth: 2, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center' },
  handEmoji: { fontSize: 28 },
  handSeat: { fontWeight: '700', color: '#374151' },
  onColor: { color: '#fff' },
  resultText: { fontWeight: '700', color: '#111827' },
  countdown: { fontSize: 20, fontWeight: '700', color: '#111827' },
  handButton: { backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  handButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  arrived: { fontSize: 20, fontWeight: '800', color: '#e11d48' },
  warn: { color: '#dc2626' },
  error: { color: '#dc2626' },
  disabled: { opacity: 0.4 },
  quit: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  quitText: { color: '#6b7280', textDecorationLine: 'underline' },
})

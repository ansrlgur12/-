import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import type { Seat } from '@jikjwau/shared/types'
import { SEAT_DIRECTION } from '@jikjwau/shared/config'
import { useGame, useMySeat } from '../store/game'
import { DIRECTION_ARROW, DIRECTION_LABEL, rulesLabel, seatColor } from './labels'
import { BlockBuddy } from './BlockBuddy'
import { Icon } from './Icon'

const SEATS: Seat[] = ['A', 'B', 'C']

/** 대기실: 초대 코드, 자리마다 한 줄(누가 들어왔는지 + 맡은 방향, 빈 자리는 눌러서 옮기기), 나가기·시작 버튼 */
export function LobbyPanel() {
  const { room, playerId, busy, error, changeSeat, startGame, leaveRoom } = useGame()
  const mySeat = useMySeat()
  if (!room) return null

  // 혼자 하기는 대기실 없이 바로 시작한다. 시작이 실패했을 때만 여기 머문다
  if (room.solo) {
    return (
      <View style={styles.panel}>
        {busy || !error ? (
          <Text style={styles.waiting}>길을 불러오는 중…</Text>
        ) : (
          <>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={[styles.button, styles.primary]} onPress={startGame}>
              <Text style={styles.primaryText}>다시 시도</Text>
            </Pressable>
          </>
        )}
        <Pressable style={[styles.button, styles.leave]} onPress={leaveRoom}>
          <Text style={styles.leaveText}>메뉴로</Text>
        </Pressable>
      </View>
    )
  }
  const isHost = room.hostId === playerId

  const share = () => {
    Share.share({ message: `직좌우 같이 하자! 초대 코드: ${room.code}` }).catch(() => undefined)
  }

  return (
    <View style={styles.panel}>
      <View style={styles.codeRow}>
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>초대 코드</Text>
          <Text style={styles.code} selectable>
            {room.code}
          </Text>
        </View>
        <Text style={[styles.badge, room.rules.mode === 'hardcore' && styles.badgeHard]}>{rulesLabel(room.rules)}</Text>
        <Pressable style={styles.shareButton} onPress={share}>
          <Text style={styles.shareText}>공유</Text>
        </Pressable>
      </View>

      {/* 자리마다 한 줄: 왼쪽은 누가 들어왔는지, 오른쪽은 그 자리가 맡은 방향 */}
      <View style={styles.seats}>
        {SEATS.map((seat) => {
          const player = room.players.find((p) => p.seat === seat)
          const mine = seat === mySeat
          const dir = SEAT_DIRECTION[seat]
          const color = seatColor(seat)
          return (
            <Pressable
              key={seat}
              style={({ pressed }) => [styles.seat, mine && { borderColor: color }, pressed && !player && styles.seatPressed]}
              disabled={!!player || busy}
              onPress={() => changeSeat(seat)}
            >
              <View style={[styles.avatar, !player && styles.avatarEmpty]}>
                <BlockBuddy unit={9} shirt={player ? color : '#cbd5e1'} />
              </View>
              <View style={styles.seatBody}>
                {player ? (
                  <View style={styles.nameRow}>
                    <Text style={styles.seatName} numberOfLines={1}>
                      {player.nickname}
                    </Text>
                    {player.id === room.hostId && <Icon name="crown" size={18} />}
                    {mine && <Text style={styles.meTag}>나</Text>}
                  </View>
                ) : (
                  <Text style={[styles.seatName, styles.empty]}>비어 있음</Text>
                )}
                <Text style={[styles.seatSub, player && !player.connected && styles.warn]}>
                  {player ? (player.connected ? '들어왔어요' : '연결이 끊겼어요') : '눌러서 이 자리로 옮기기'}
                </Text>
              </View>
              <View style={[styles.dirPill, { backgroundColor: color }]}>
                <Text style={styles.dirArrow}>{DIRECTION_ARROW[dir]}</Text>
                <Text style={styles.dirLabel}>{DIRECTION_LABEL[dir]}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {!isHost && <Text style={styles.waiting}>방장이 시작하기를 기다리는 중…</Text>}
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.half, styles.leave]} onPress={leaveRoom}>
          <Text style={styles.leaveText}>방 나가기</Text>
        </Pressable>
        {isHost && (
          <Pressable style={[styles.button, styles.half, styles.primary, busy && styles.disabled]} disabled={busy} onPress={startGame}>
            <Text style={styles.primaryText}>{busy ? '길을 불러오는 중…' : '시작하기'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeBox: { flex: 1 },
  codeLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  code: { fontSize: 26, fontWeight: '900', letterSpacing: 4, color: '#0f172a' },
  badge: { backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  badgeHard: { backgroundColor: '#1f2937', color: '#fca5a5' },
  shareButton: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 16, height: 40, justifyContent: 'center' },
  shareText: { color: '#fff', fontWeight: '800' },
  seats: { gap: 8 },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f8fafc' },
  seatPressed: { backgroundColor: '#e2e8f0' },
  avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarEmpty: { backgroundColor: '#f1f5f9', opacity: 0.6 },
  seatBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seatName: { flexShrink: 1, fontSize: 18, fontWeight: '900', color: '#0f172a' },
  meTag: { fontSize: 12, fontWeight: '900', color: '#fff', backgroundColor: '#0f172a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  seatSub: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  empty: { color: '#94a3b8' },
  warn: { color: '#dc2626' },
  dirPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12, height: 40, minWidth: 92 },
  dirArrow: { color: '#fff', fontSize: 22, fontWeight: '900' },
  dirLabel: { color: '#fff', fontSize: 16, fontWeight: '900' },
  error: { color: '#dc2626', textAlign: 'center' },
  waiting: { textAlign: 'center', color: '#334155', fontWeight: '700', paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  button: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  half: { flex: 1 },
  primary: { backgroundColor: '#e11d48' },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  leave: { backgroundColor: '#e2e8f0' },
  leaveText: { color: '#334155', fontWeight: '900', fontSize: 18 },
  disabled: { opacity: 0.4 },
})

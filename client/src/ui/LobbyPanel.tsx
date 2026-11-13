import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import type { Seat } from '@jikjwau/shared/types'
import { SEAT_DIRECTION } from '@jikjwau/shared/config'
import { useGame, useMySeat } from '../store/game'
import { DIRECTION_LABEL, rulesLabel, seatColor, seatTint } from './labels'
import { BlockBuddy } from './BlockBuddy'
import { ProfileAvatar } from './ProfileAvatar'
import { Icon } from './Icon'
import { GameButton } from './GameButton'
import { BORDER, FONT } from './theme'

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
            <GameButton label="다시 시도" color="yellow" size="md" onPress={startGame} />
          </>
        )}
        <GameButton label="메뉴로" color="white" size="md" onPress={leaveRoom} />
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
              {player ? (
                // 들어온 사람은 옷장에서 입은 옷 그대로
                <ProfileAvatar size={44} outfit={player.outfit} style={[styles.avatarOn, { borderColor: color, backgroundColor: seatTint(seat) }]} />
              ) : (
                <View style={[styles.avatar, styles.avatarEmpty]}>
                  <BlockBuddy unit={9} shirt="#cbd5e1" />
                </View>
              )}
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
                <Text style={styles.dirLabel}>{DIRECTION_LABEL[dir]}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {!isHost && <Text style={styles.waiting}>방장이 시작하기를 기다리는 중…</Text>}
      <View style={styles.actions}>
        <GameButton style={styles.half} label="방 나가기" color="white" size="md" onPress={leaveRoom} />
        {isHost && <GameButton style={styles.half} label={busy ? '불러오는 중…' : '시작하기'} color="yellow" size="md" disabled={busy} onPress={startGame} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { padding: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeBox: { flex: 1 },
  codeLabel: { fontFamily: FONT.body, color: '#64748b', fontSize: 12 },
  code: { fontFamily: FONT.body, fontSize: 26, letterSpacing: 4, color: '#0f172a' },
  badge: { fontFamily: FONT.body, backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden' },
  badgeHard: { backgroundColor: '#1f2937', color: '#fca5a5' },
  shareButton: { backgroundColor: '#0f172a', borderRadius: 10, paddingHorizontal: 16, height: 40, justifyContent: 'center' },
  shareText: { fontFamily: FONT.body, color: '#fff' },
  seats: { gap: 8 },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: BORDER, borderColor: '#e2e8f0', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f8fafc' },
  seatPressed: { backgroundColor: '#e2e8f0' },
  avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarOn: { borderRadius: 12 },
  avatarEmpty: { backgroundColor: '#f1f5f9', opacity: 0.6 },
  seatBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  seatName: { fontFamily: FONT.body, flexShrink: 1, fontSize: 18, color: '#0f172a' },
  meTag: { fontFamily: FONT.body, fontSize: 12, color: '#fff', backgroundColor: '#0f172a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  seatSub: { fontFamily: FONT.body, fontSize: 12, color: '#64748b' },
  empty: { color: '#94a3b8' },
  warn: { color: '#dc2626' },
  dirPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12, height: 40, minWidth: 92 },
  dirLabel: { fontFamily: FONT.body, color: '#fff', fontSize: 16 },
  error: { color: '#dc2626', textAlign: 'center' },
  waiting: { fontFamily: FONT.body, textAlign: 'center', color: '#334155', paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
})

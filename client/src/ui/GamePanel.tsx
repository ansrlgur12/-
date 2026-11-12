import { Pressable, StyleSheet, Text, View } from 'react-native'
import { hapticTap } from '../lib/haptics'
import type { GameEvent, Hand } from '@jikjwau/shared/types'
import { RPS_TIMEOUT_MS, SEAT_DIRECTION } from '@jikjwau/shared/config'
import { useGame, useMySeat } from '../store/game'
import { useNow } from './useNow'
import { useSeatName } from './useSeatName'
import { Icon, type IconName } from './Icon'
import { DIRECTION_ARROW, DIRECTION_LABEL, HAND_ICON, HAND_NAME, formatDistance, formatDuration, rulesLabel, seatColor } from './labels'

/**
 * 패널 높이. 상태(가위바위보·이동·결과)에 따라 내용이 바뀌어도 높이는 그대로라 지도가 흔들리지 않는다.
 * 가장 큰 내용(가위바위보 버튼)이 들어가는 높이. 나가기·설정은 지도 오른쪽 위 메뉴(GameMenu)에
 */
const PANEL_HEIGHT = 250

const HANDS: Array<{ hand: Hand; color: string }> = [
  { hand: 'scissors', color: '#fef3c7' },
  { hand: 'rock', color: '#fee2e2' },
  { hand: 'paper', color: '#dbeafe' },
]

function moveText(e: Extract<GameEvent, { type: 'move' }>) {
  switch (e.reason) {
    case 'start':
      return '출발! 첫 교차로까지 걸어가요'
    case 'win':
      return `${DIRECTION_ARROW[e.direction!]} ${DIRECTION_LABEL[e.direction!]} 하는 중`
    case 'uturn':
      return '↩ 유턴하는 중'
    case 'deadEnd':
      return '↩ 막다른 길이라 돌아가는 중'
    case 'only':
      return e.direction ? `외길이라 ${DIRECTION_ARROW[e.direction]} ${DIRECTION_LABEL[e.direction]} 하는 중` : '외길이라 그대로 가는 중'
  }
}

function Stat({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={18} />
      <Text style={styles.statText}>{text}</Text>
    </View>
  )
}

/** 게임 중 아래쪽 패널: 기록, 지금 무슨 일인지, 내 차례면 큰 가위바위보 버튼. 결과는 지도 위 RoundOverlay가 크게 보여 준다 */
export function GamePanel() {
  const { game, room, playerId, status, current, snapshot, deadline, busy, error, rpsCount, distanceM, position, finalElapsedMs, myHand } = useGame()
  const { choose, returnToSeat, resetGame, restartSolo, leaveRoom } = useGame()
  const mine = useMySeat()
  const name = useSeatName()
  const now = useNow(250, status === 'playing')
  if (!game || !mine) return null

  const rps = !current && status === 'playing' ? snapshot?.rps : null
  const iAmAi = snapshot?.controllers[mine] === 'ai'
  const returning = !!snapshot?.returning.includes(mine)
  const myTurn = !!rps && rps.participants.includes(mine)
  const inRound = myTurn && !iAmAi && !snapshot?.paused
  const submitted = !!rps && rps.submitted.includes(mine)
  const waitingFor = rps ? rps.participants.filter((s) => snapshot?.controllers[s] === 'user' && !rps.submitted.includes(s)) : []
  const timeLeft = Math.max(0, deadline - now)
  const myDirection = SEAT_DIRECTION[mine]

  const [dx, dy] = [game.destination.point[0] - position[0], game.destination.point[1] - position[1]]
  const elapsed = finalElapsedMs ?? now - game.startedAt
  const isHost = room?.hostId === playerId
  const rules = room?.rules
  const hardcore = rules?.mode === 'hardcore'
  const limit = rules?.mode === 'normal' ? rules.limit : null
  const limitLeft = !limit
    ? null
    : limit.kind === 'time'
      ? `${formatDuration(Math.max(0, limit.minutes * 60_000 - elapsed))} 남음`
      : `${Math.max(0, limit.count - rpsCount)}회 남음`
  const arrived = snapshot?.phase === 'ARRIVED'

  const pick = (hand: Hand) => {
    hapticTap()
    choose(hand)
  }

  // 가운데 칸: 끝났으면 결과, 가위바위보 차례면 버튼, 아니면 지금 무슨 일인지
  let body: React.ReactNode
  if (status === 'ended') {
    body = (
      <View style={styles.center}>
        {arrived ? (
          <View style={styles.iconRow}>
            <Icon name="party" size={36} />
            <Text style={styles.arrived}>도착했어요!</Text>
          </View>
        ) : (
          <>
            <View style={styles.iconRow}>
              <Icon name={limit?.kind === 'time' ? 'alarm' : 'rock'} size={30} />
              <Text style={styles.ended}>{limit?.kind === 'time' ? '시간이 다 됐어요' : '가위바위보 횟수를 다 썼어요'}</Text>
            </View>
            <Text style={styles.line}>목적지까지 {formatDistance(snapshot?.stats.remainingM ?? Math.hypot(dx, dy))} 남기고 끝났어요</Text>
          </>
        )}
        {room?.recordId && (
          <View style={styles.iconRow}>
            {arrived && hardcore && <Icon name="trophy" size={20} />}
            <Text style={styles.saved}>{arrived && hardcore ? '오늘의 월드레코드에 올랐어요! 기록실에서 확인해 보세요' : '기록실에 저장했어요'}</Text>
          </View>
        )}
        {playerId && room?.rewards[playerId] ? (
          <View style={styles.iconRow}>
            <Icon name="coin" size={22} />
            <Text style={styles.reward}>+{room.rewards[playerId]} 코인을 받았어요</Text>
          </View>
        ) : null}
        <View style={styles.endActions}>
          {room?.solo && (
            <Pressable style={[styles.endButton, styles.endMain]} disabled={busy} onPress={restartSolo}>
              <Text style={styles.endMainText}>{busy ? '길을 불러오는 중…' : '같은 코스로 다시'}</Text>
            </Pressable>
          )}
          {!room?.solo && isHost && (
            <Pressable style={[styles.endButton, styles.endMain]} disabled={busy} onPress={resetGame}>
              <Text style={styles.endMainText}>대기실로</Text>
            </Pressable>
          )}
          <Pressable style={styles.endButton} onPress={leaveRoom}>
            <Text style={styles.endText}>{room?.solo ? '메뉴로' : '방 나가기'}</Text>
          </Pressable>
        </View>
      </View>
    )
  } else if (iAmAi) {
    body = (
      <View style={styles.center}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{returning ? '다음 판부터 다시 참여해요' : '자리를 비워서 AI가 대신하고 있어요'}</Text>
          {!returning && (
            <Pressable style={styles.bannerButton} disabled={busy} onPress={returnToSeat} hitSlop={8}>
              <Text style={styles.bannerButtonText}>다시 참여</Text>
            </Pressable>
          )}
        </View>
      </View>
    )
  } else if (snapshot?.paused && !current) {
    body = (
      <View style={styles.center}>
        <Text style={styles.line}>모두 자리를 비워 게임이 멈췄어요. 누군가 돌아오면 이어져요</Text>
      </View>
    )
  } else if (rps) {
    const seconds = Math.ceil(timeLeft / 1000)
    body = (
      <View style={styles.round}>
        <View style={styles.roundHead}>
          {myTurn ? (
            <Text style={styles.roundTitle}>
              {rps.rematch ? '재경기! ' : ''}이기면 <Text style={{ color: seatColor(mine) }}>{DIRECTION_ARROW[myDirection]} {DIRECTION_LABEL[myDirection]}</Text>
            </Text>
          ) : (
            <Text style={styles.roundTitleSmall}>이번 판은 내 방향이 없어요 · 구경 중</Text>
          )}
          <Text style={[styles.seconds, seconds <= 5 && styles.warn]}>{timeLeft > 0 ? `${seconds}초` : '…'}</Text>
        </View>
        <View style={styles.timer}>
          <View style={[styles.timerFill, { width: `${Math.min(1, timeLeft / RPS_TIMEOUT_MS) * 100}%` }, seconds <= 5 && styles.timerWarn]} />
        </View>
        {inRound && !submitted ? (
          <View style={styles.hands}>
            {HANDS.map(({ hand, color }) => (
              <Pressable
                key={hand}
                style={({ pressed }) => [styles.handButton, { backgroundColor: color }, pressed && styles.pressed, busy && styles.disabled]}
                disabled={busy}
                onPress={() => pick(hand)}
              >
                <Icon name={HAND_ICON[hand]} size={52} />
                <Text style={styles.handLabel}>{HAND_NAME[hand]}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.waiting}>
            {submitted && myHand && <Icon name={HAND_ICON[myHand]} size={64} />}
            <View style={styles.waitingText}>
              <Text style={styles.line}>{submitted ? '냈어요! 결과를 기다리는 중' : myTurn ? 'AI가 대신 내는 중' : `${rps.participants.map(name).join(' · ')} 대결 중`}</Text>
              {waitingFor.length > 0 && <Text style={styles.sub}>기다리는 중: {waitingFor.map(name).join(', ')}</Text>}
            </View>
          </View>
        )}
      </View>
    )
  } else {
    body = (
      <View style={styles.center}>
        <Text style={styles.moving}>{current?.type === 'move' ? moveText(current) : current?.type === 'rps' ? '결과 발표!' : '다음 교차로로 가는 중…'}</Text>
      </View>
    )
  }

  return (
    <View style={styles.panel}>
      <View style={styles.statsRow}>
        {rules && <Text style={[styles.badge, hardcore && styles.badgeHard]}>{rulesLabel(rules)}</Text>}
        <Stat icon="rock" text={`${rpsCount}`} />
        <Stat icon="walking" text={formatDistance(distanceM)} />
        <Stat icon="flag" text={formatDistance(Math.hypot(dx, dy))} />
        <Stat icon="stopwatch" text={formatDuration(elapsed)} />
      </View>
      {limitLeft && status === 'playing' && (
        <View style={styles.iconRow}>
          <Icon name={limit?.kind === 'time' ? 'hourglass' : 'rock'} size={18} />
          <Text style={[styles.limitLeft, limit?.kind === 'time' && elapsed > limit.minutes * 60_000 - 60_000 && styles.warn]}>{limitLeft}</Text>
        </View>
      )}

      <View style={styles.body}>{body}</View>

      {error && (
        <Text style={styles.error} numberOfLines={1}>
          {error}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { height: PANEL_HEIGHT, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: '#f1f5f9', borderRadius: 8, paddingVertical: 5 },
  statText: { color: '#0f172a', fontWeight: '800', fontSize: 14 },
  iconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  badge: { backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  badgeHard: { backgroundColor: '#1f2937', color: '#fca5a5' },
  limitLeft: { fontWeight: '800', color: '#1d4ed8', textAlign: 'center' },
  body: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  line: { fontSize: 16, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  sub: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  moving: { fontSize: 22, fontWeight: '900', color: '#0f172a', textAlign: 'center' },
  round: { gap: 8 },
  roundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a', flexShrink: 1 },
  roundTitleSmall: { fontSize: 16, fontWeight: '700', color: '#475569', flexShrink: 1 },
  seconds: { fontSize: 24, fontWeight: '900', color: '#0f172a', fontVariant: ['tabular-nums'] },
  timer: { height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 4, backgroundColor: '#22c55e' },
  timerWarn: { backgroundColor: '#ef4444' },
  hands: { flexDirection: 'row', gap: 10 },
  handButton: { flex: 1, height: 100, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(15,23,42,0.12)' },
  handLabel: { fontSize: 17, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  pressed: { transform: [{ scale: 0.94 }] },
  waiting: { height: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  waitingText: { flexShrink: 1, gap: 4 },
  arrived: { fontSize: 28, fontWeight: '900', color: '#e11d48' },
  ended: { fontSize: 22, fontWeight: '900', color: '#b45309' },
  saved: { color: '#2563eb', fontWeight: '700', fontSize: 14, textAlign: 'center' },
  reward: { color: '#a16207', fontWeight: '900', fontSize: 17 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 12 },
  bannerText: { flex: 1, color: '#92400e', fontWeight: '700', fontSize: 15 },
  bannerButton: { backgroundColor: '#d97706', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  bannerButtonText: { color: '#fff', fontWeight: '800' },
  warn: { color: '#dc2626' },
  error: { color: '#dc2626', textAlign: 'center' },
  disabled: { opacity: 0.4 },
  endActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  endButton: { height: 46, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  endMain: { backgroundColor: '#e11d48' },
  endMainText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  endText: { color: '#334155', fontWeight: '800', fontSize: 15 },
})

import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { hapticTap } from '../lib/haptics'
import type { GameEvent, Hand } from '@jikjwau/shared/types'
import { RPS_TIMEOUT_MS, SEAT_DIRECTION } from '@jikjwau/shared/config'
import { useGame, useMySeat } from '../store/game'
import { useNow } from './useNow'
import { useSeatName } from './useSeatName'
import { Icon, type IconName } from './Icon'
import { DIRECTION_ARROW, DIRECTION_LABEL, HAND_ICON, HAND_NAME, formatDistance, formatDuration, rulesLabel, seatColor } from './labels'
import { GameButton } from './GameButton'
import { BORDER, FONT, INK, LIP } from './theme'

/**
 * 패널 높이. 상태(가위바위보·이동·결과)에 따라 내용이 바뀌어도 높이는 그대로라 지도가 흔들리지 않는다.
 * 가장 큰 내용(가위바위보 버튼)이 들어가는 높이. 나가기·설정은 지도 오른쪽 위 메뉴(GameMenu)에
 */
const PANEL_HEIGHT = 290
/** 위 모서리 둥글기. 그만큼 지도 위로 겹친다 */
const RADIUS = 26

/** 손 버튼: 방향 색과 같은 파랑·초록·빨강 (파스텔 바탕 + 같은 색 테두리) */
const HANDS: Array<{ hand: Hand; color: string; line: string }> = [
  { hand: 'scissors', color: '#dfe9ff', line: '#6b9cf0' },
  { hand: 'rock', color: '#dcf3e4', line: '#4fbd7c' },
  { hand: 'paper', color: '#fde3e1', line: '#ec7b75' },
]

function moveText(e: Extract<GameEvent, { type: 'move' }>) {
  switch (e.reason) {
    case 'start':
      return '출발! 첫 교차로까지 걸어가요'
    case 'win':
      return `${DIRECTION_ARROW[e.direction!]} ${DIRECTION_LABEL[e.direction!]} 하는 중`
    case 'uturn':
      return '유턴하는 중'
    case 'deadEnd':
      return '막다른 길이라 돌아가는 중'
    case 'only':
      return e.direction ? `외길이라 ${DIRECTION_ARROW[e.direction]} ${DIRECTION_LABEL[e.direction]} 하는 중` : '외길이라 그대로 가는 중'
  }
}

/** 기록 한 칸: 그림과 값, 아래에 작은 이름 */
function Stat({ icon, text, label }: { icon: IconName; text: string; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <Icon name={icon} size={18} />
        <Text style={styles.statText} numberOfLines={1} adjustsFontSizeToFit>
          {text}
        </Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
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
  const insets = useSafeAreaInsets()
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
            <Text style={styles.failed}>실패</Text>
            <Text style={styles.endLine}>
              {limit?.kind === 'rps' ? '가위바위보 횟수를 다 썼어요' : '시간이 다 됐어요'} · 목적지까지 {formatDistance(snapshot?.stats.remainingM ?? Math.hypot(dx, dy))} 남았어요
            </Text>
          </>
        )}
        {room?.recordId && arrived && hardcore && (
          <View style={styles.iconRow}>
            <Icon name="trophy" size={20} />
            <Text style={styles.saved}>오늘의 월드레코드에 올랐어요! 기록실에서 확인해 보세요</Text>
          </View>
        )}
        {playerId && room?.rewards[playerId] ? (
          <View style={styles.iconRow}>
            <Icon name="coin" size={22} />
            <Text style={styles.reward}>+{room.rewards[playerId]} 코인을 받았어요</Text>
          </View>
        ) : null}
        <View style={styles.endActions}>
          {/* 실패하면 메뉴로 돌아가기만 */}
          {!arrived && <GameButton label="메뉴로 돌아가기" color="white" size="md" style={styles.endButton} onPress={leaveRoom} />}
          {arrived && room?.solo && <GameButton label={busy ? '불러오는 중…' : '같은 코스로 다시'} color="yellow" size="sm" disabled={busy} onPress={restartSolo} />}
          {arrived && !room?.solo && isHost && <GameButton label="대기실로" color="yellow" size="sm" disabled={busy} onPress={resetGame} />}
          {arrived && <GameButton label={room?.solo ? '메뉴로' : '방 나가기'} color="white" size="sm" onPress={leaveRoom} />}
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
            {HANDS.map(({ hand, color, line }) => (
              <Pressable
                key={hand}
                style={({ pressed }) => [styles.handButton, { backgroundColor: color, borderColor: line }, pressed && styles.pressed, busy && styles.disabled]}
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

  const limitWarn = limit?.kind === 'time' ? elapsed > limit.minutes * 60_000 - 60_000 : !!limit && limit.count - rpsCount <= 3

  return (
    // 준비 패널처럼 둥근 위 모서리만큼 지도 위로 겹치고, 아래는 홈 바 영역까지 패널 색으로 채운다
    <View style={[styles.panel, { height: PANEL_HEIGHT + insets.bottom, marginBottom: -insets.bottom, paddingBottom: 10 + insets.bottom }]}>
      {/* 위 줄: 왼쪽 규칙, 오른쪽 남은 시간·횟수 */}
      <View style={styles.headRow}>
        {rules && (
          <View style={[styles.pill, styles.modePill, hardcore && styles.modeHard]}>
            <Icon name="gamepad" size={18} />
            <Text style={[styles.pillText, hardcore && styles.modeTextHard]} numberOfLines={1}>
              {rulesLabel(rules)}
            </Text>
          </View>
        )}
        {limitLeft && status === 'playing' && (
          <View style={[styles.pill, styles.leftPill, limitWarn && styles.leftWarn]}>
            <Icon name={limit?.kind === 'time' ? 'hourglass' : 'rock'} size={18} />
            <Text style={[styles.pillText, styles.leftText, limitWarn && styles.warn]}>{limitLeft}</Text>
          </View>
        )}
      </View>
      <View style={styles.statsRow}>
        <Stat icon="rock" text={`${rpsCount}판`} label="가위바위보" />
        <Stat icon="walking" text={formatDistance(distanceM)} label="걸은 거리" />
        <Stat icon="flag" text={formatDistance(Math.hypot(dx, dy))} label="남은 거리" />
        <Stat icon="stopwatch" text={formatDuration(elapsed)} label="걸린 시간" />
      </View>

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
  panel: {
    marginTop: -RADIUS,
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
    backgroundColor: '#f4f8ff',
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    borderWidth: BORDER,
    borderBottomWidth: 0,
    borderColor: INK,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, borderRadius: 16, borderWidth: BORDER, paddingHorizontal: 12 },
  pillText: { fontFamily: FONT.button, fontSize: 14, color: INK, flexShrink: 1 },
  modePill: { flexShrink: 1, backgroundColor: '#e3edff', borderColor: '#a9c3f2' },
  modeHard: { backgroundColor: '#2a3463', borderColor: INK },
  modeTextHard: { color: '#ffc4c0' },
  leftPill: { marginLeft: 'auto', backgroundColor: '#fff6d6', borderColor: '#efcf6a' },
  leftWarn: { backgroundColor: '#fdeceb', borderColor: '#ec7b75' },
  leftText: { fontVariant: ['tabular-nums'] },
  statsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: BORDER, borderBottomWidth: LIP, borderColor: '#c5d3ee', paddingVertical: 5, paddingHorizontal: 4 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontFamily: FONT.button, color: INK, fontSize: 15, flexShrink: 1, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: FONT.body, color: '#8a94b3', fontSize: 10 },
  iconRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  body: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  line: { fontFamily: FONT.body, fontSize: 16, color: '#0f172a', textAlign: 'center' },
  sub: { fontFamily: FONT.body, fontSize: 13, color: '#64748b', textAlign: 'center' },
  moving: { fontFamily: FONT.button, fontSize: 24, color: INK, textAlign: 'center' },
  round: { gap: 8 },
  roundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundTitle: { fontFamily: FONT.button, fontSize: 24, color: INK, flexShrink: 1 },
  roundTitleSmall: { fontFamily: FONT.body, fontSize: 16, color: '#5b6593', flexShrink: 1 },
  seconds: { fontFamily: FONT.button, fontSize: 26, color: INK, fontVariant: ['tabular-nums'] },
  timer: { height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 4, backgroundColor: '#4fbd7c' },
  timerWarn: { backgroundColor: '#ec7b75' },
  hands: { flexDirection: 'row', gap: 10 },
  // 게임 버튼처럼: 굵은 남색 테두리와 아래 턱 (누르면 턱이 눌린다)
  handButton: { flex: 1, height: 100, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: BORDER + 1, borderBottomWidth: LIP + 1 },
  handLabel: { fontFamily: FONT.button, fontSize: 19, color: INK, marginTop: 2 },
  pressed: { borderBottomWidth: BORDER, marginTop: LIP - BORDER },
  waiting: { height: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  waitingText: { flexShrink: 1, gap: 4 },
  arrived: { fontFamily: FONT.title, fontSize: 32, color: '#e0607e' },
  failed: { fontFamily: FONT.title, fontSize: 44, lineHeight: 52, color: '#ec7b75' },
  endLine: { fontFamily: FONT.button, fontSize: 16, color: INK, textAlign: 'center' },
  saved: { fontFamily: FONT.button, color: '#4a78c9', fontSize: 14, textAlign: 'center' },
  reward: { fontFamily: FONT.button, color: '#b7791f', fontSize: 17 },
  endButton: { width: 220 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 12 },
  bannerText: { fontFamily: FONT.body, flex: 1, color: '#92400e', fontSize: 15 },
  bannerButton: { backgroundColor: '#d97706', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  bannerButtonText: { fontFamily: FONT.body, color: '#fff' },
  warn: { color: '#d4524c' },
  error: { color: '#dc2626', textAlign: 'center' },
  disabled: { opacity: 0.4 },
  endActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
})

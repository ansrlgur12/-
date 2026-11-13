import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Direction } from '@jikjwau/shared/types'
import { project } from '@jikjwau/shared/geo'
import { DESTINATION_MIN_M, DESTINATION_WARN_M, SEAT_DIRECTION } from '@jikjwau/shared/config'
import type { Seat } from '@jikjwau/shared/types'
import { useGame, type Spot } from '../store/game'
import { playEffect } from '../lib/sound'
import { Icon, type IconName } from './Icon'
import { DIRECTION_LABEL, formatDistance, rulesLabel, seatColor, seatTint } from './labels'
import { GameButton } from './GameButton'
import { BORDER, FONT, INK, LIP } from './theme'

/** 이보다 멀리 떨어진 길로 옮겨지면 알려 준다 */
const ROAD_NOTE_M = 40
const BLUE = '#2f6fe0'

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

/** 출발지·도착지 한 줄: 왼쪽 그림, 이름표와 장소 이름, 오른쪽 변경/선택 버튼 */
function PlaceRow({ kind, icon, label, spot, placeholder, onPress }: RowProps) {
  const note = roadNote(spot, kind)
  return (
    <Pressable style={[styles.row, spot ? styles.rowSet : styles.rowEmpty, note?.bad && styles.rowBad]} onPress={onPress}>
      <Icon name={icon} size={44} />
      <View style={styles.rowBody}>
        <Text style={styles.chip}>{label}</Text>
        <Text style={[styles.place, !spot && styles.placeholder]} numberOfLines={1}>
          {spot?.name ?? placeholder}
        </Text>
        {note && (
          <Text style={[styles.note, note.bad && styles.noteBad]} numberOfLines={2}>
            {note.text}
          </Text>
        )}
      </View>
      <GameButton label={spot ? '변경' : '선택'} color="blue" size="sm" style={styles.rowButton} onPress={onPress} />
    </Pressable>
  )
}

const SEATS: Seat[] = ['A', 'B', 'C']
/** 패널 위 모서리 둥글기. 그만큼 지도 위로 겹쳐 올려 모서리 뒤로 지도가 보이게 한다 */
const RADIUS = 26
const ARROW_TURN: Record<Direction, number> = { left: -90, straight: 0, right: 90 }

/** 굵은 화살표 (위 방향 그림을 돌려 쓴다) */
function FatArrow({ dir, color, size }: { dir: Direction; color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${ARROW_TURN[dir]}deg` }] }}>
      <Path d="M12 2.5 L21.5 12 H15.5 V21.5 H8.5 V12 H2.5 Z" fill={color} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  )
}

/** 혼자 하기: 내가 맡을 방향. 나머지 두 방향은 철수·영희가 맡는다 */
function SeatPicker({ seat, onPick }: { seat: Seat; onPick: (seat: Seat) => void }) {
  return (
    <View style={styles.seatBox}>
      <Text style={styles.seatTitle}>
        내 방향 <Text style={styles.seatTitleSub}>· 이기면 이쪽으로 가요</Text>
      </Text>
      <View style={styles.seatRow}>
        {SEATS.map((s) => {
          const on = s === seat
          const dir = SEAT_DIRECTION[s]
          return (
            <Pressable
              key={s}
              style={({ pressed }) => [
                styles.seatOption,
                on ? { borderColor: seatColor(s), backgroundColor: seatTint(s) } : styles.seatOff,
                pressed && styles.seatPressed,
              ]}
              onPress={() => (playEffect('tap'), onPick(s))}
            >
              <View style={!on && styles.dimmed}>
                <FatArrow dir={dir} color={seatColor(s)} size={30} />
              </View>
              <Text style={[styles.seatLabel, !on && styles.seatLabelOff]}>{DIRECTION_LABEL[dir]}</Text>
              {on && <Text style={[styles.seatMine, { backgroundColor: seatColor(s) }]}>내 방향</Text>}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

/** 메뉴에서 고른 규칙으로 출발지·목적지를 정한다. 혼자면 바로 출발, 멀티면 방을 만든다 */
export function SetupPanel() {
  const { start, startChosen, destination, plan, busy, error, createRoom, setScreen, setPlaceSheet, setSoloSeat } = useGame()
  const insets = useSafeAreaInsets()
  const from = startChosen ? start : null

  const offset = from && destination ? project(destination.latLng, from.latLng) : null
  const straight = offset ? Math.hypot(offset.x, offset.y) : null
  const tooNear = straight !== null && straight < DESTINATION_MIN_M
  // 확인을 못 했으면(통신 실패) 막지 않는다. 방을 만들 때 서버가 다시 확인한다
  const roadOk = (spot: Spot | null) => !!spot && (spot.road === undefined || typeof spot.road === 'number')
  const roadsOk = roadOk(from) && roadOk(destination)
  const canCreate = roadsOk && !tooNear && !busy && !!plan

  const open = (sheet: 'start' | 'destination') => {
    playEffect('tap')
    setPlaceSheet(sheet)
  }

  return (
    // 아래는 홈 바 영역까지 패널 색으로 채우고, 내용은 그 위에 둔다
    <View style={[styles.panel, { marginBottom: -insets.bottom, paddingBottom: 12 + insets.bottom }]}>
      <View style={styles.head}>
        <Pressable style={({ pressed }) => [styles.pill, styles.backPill, pressed && styles.pillPressed]} onPress={() => (playEffect('tap'), setScreen('menu'))} hitSlop={6}>
          <Text style={styles.backText}>메뉴로 돌아가기</Text>
        </Pressable>
        {plan && (
          <View style={[styles.pill, styles.modePill, plan.rules.mode === 'hardcore' && styles.modeHard]}>
            <Icon name="gamepad" size={22} />
            <Text style={[styles.modeText, plan.rules.mode === 'hardcore' && styles.modeTextHard]} numberOfLines={1}>
              {plan.solo ? '혼자' : '멀티'} · {rulesLabel(plan.rules)}
            </Text>
          </View>
        )}
      </View>

      <PlaceRow kind="start" icon="flag" label="출발지" spot={from} placeholder="출발할 곳을 골라 주세요" onPress={() => open('start')} />
      <PlaceRow kind="destination" icon="finish" label="도착지" spot={destination} placeholder="도착할 곳을 골라 주세요" onPress={() => open('destination')} />
      {straight !== null && (
        <Text style={[styles.hint, (tooNear || straight > DESTINATION_WARN_M) && styles.warn]}>
          직선 거리 {formatDistance(straight)}
          {tooNear && ` · ${DESTINATION_MIN_M}m 이상 떨어진 곳을 골라 주세요`}
          {straight > DESTINATION_WARN_M && ' · 무작위로 움직이는 게임이라 도착이 매우 어려울 수 있어요'}
        </Text>
      )}

      {plan?.solo && <SeatPicker seat={plan.seat ?? 'B'} onPick={setSoloSeat} />}

      <GameButton
        label={busy ? (plan?.solo ? '길을 불러오는 중…' : '방 만드는 중…') : plan?.solo ? '출발하기' : '방 만들기'}
        color="yellow"
        size="lg"
        icon={<Icon name="pin" size={44} />}
        disabled={!canCreate}
        onPress={() => (playEffect('tap'), createRoom())}
      />

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    padding: 12,
    gap: 10,
    backgroundColor: '#f4f8ff',
    marginTop: -RADIUS,
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    // 양옆은 화면 끝까지. 둥근 위 모서리가 이어지도록 옆 테두리도 둔다
    borderWidth: BORDER,
    borderBottomWidth: 0,
    borderColor: INK,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 20, borderWidth: BORDER, borderBottomWidth: LIP, paddingHorizontal: 14 },
  pillPressed: { borderBottomWidth: BORDER, marginTop: LIP - BORDER },
  backPill: { backgroundColor: '#ffffff', borderColor: BLUE },
  backText: { fontFamily: FONT.button, fontSize: 15, color: INK },
  modePill: { flexShrink: 1, backgroundColor: '#e3edff', borderColor: '#a9c3f2' },
  modeHard: { backgroundColor: '#1f2340', borderColor: INK },
  modeText: { flexShrink: 1, fontFamily: FONT.button, fontSize: 14, color: INK },
  modeTextHard: { color: '#ffb4b4' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff', borderRadius: 20, borderWidth: BORDER, borderBottomWidth: LIP, paddingLeft: 12, paddingRight: 10, paddingVertical: 10 },
  rowSet: { borderColor: BLUE },
  rowEmpty: { borderColor: '#c5d3ee' },
  rowBad: { borderColor: '#e5484d', backgroundColor: '#fff1f1' },
  rowBody: { flex: 1, gap: 3 },
  chip: { alignSelf: 'flex-start', fontFamily: FONT.button, fontSize: 12, color: BLUE, backgroundColor: '#dbe7ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  place: { fontFamily: FONT.body, fontSize: 18, color: INK },
  placeholder: { color: '#8a94b3' },
  note: { fontFamily: FONT.body, fontSize: 12, color: '#b45309' },
  noteBad: { color: '#dc2626' },
  rowButton: { width: 84 },
  hint: { fontFamily: FONT.body, color: '#5b6593', fontSize: 13, textAlign: 'center' },
  warn: { color: '#b45309' },
  error: { fontFamily: FONT.body, color: '#dc2626', textAlign: 'center' },
  seatBox: { gap: 10 },
  seatTitle: { fontFamily: FONT.button, fontSize: 16, color: INK, paddingLeft: 4 },
  seatTitleSub: { fontFamily: FONT.body, fontSize: 13, color: '#5b6593' },
  seatRow: { flexDirection: 'row', gap: 8 },
  seatOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 60, borderRadius: 20, borderWidth: BORDER + 1, borderBottomWidth: LIP + 1 },
  seatOff: { borderColor: '#d5deef', backgroundColor: '#ffffff' },
  seatPressed: { borderBottomWidth: BORDER + 1, marginTop: LIP - BORDER },
  dimmed: { opacity: 0.45 },
  seatLabel: { fontFamily: FONT.button, fontSize: 18, color: INK },
  seatLabelOff: { color: '#8a94b3' },
  seatMine: { position: 'absolute', top: -10, alignSelf: 'center', fontFamily: FONT.button, fontSize: 11, color: '#ffffff', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
})

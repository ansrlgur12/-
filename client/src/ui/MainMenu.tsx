import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NormalLimit, RoomRules } from '@jikjwau/shared/types'
import { NORMAL_RPS_LIMITS, NORMAL_TIME_LIMITS_MIN } from '@jikjwau/shared/config'
import { socket } from '../api/socket'
import { useGame } from '../store/game'
import { playEffect, useSound } from '../lib/sound'
import { useProfile } from '../store/profile'
import { InputPopup } from './InputPopup'
import { MissionSheet, useHasReward } from './MissionSheet'
import { MenuBackdrop } from './MenuBackdrop'
import { Icon } from './Icon'

type Popup = 'nickname' | 'code' | null

function useOnline() {
  const [online, setOnline] = useState(socket.connected)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    socket.on('connect', on)
    socket.on('disconnect', off)
    return () => {
      socket.off('connect', on)
      socket.off('disconnect', off)
    }
  }, [])
  return online
}

/** 혼자/멀티를 누르면 뜨는 난이도 고르기 */
function ModeSheet({ solo, onClose, onJoinCode }: { solo: boolean; onClose: () => void; onJoinCode: () => void }) {
  const [mode, setMode] = useState<RoomRules['mode']>('normal')
  const [limit, setLimit] = useState<NormalLimit>({ kind: 'time', minutes: NORMAL_TIME_LIMITS_MIN[0] })
  const busy = useGame((s) => s.busy)

  const next = () => {
    playEffect('tap')
    useGame.getState().openSetup({ solo, rules: mode === 'hardcore' ? { mode } : { mode, limit } })
  }

  const chips =
    limit.kind === 'time'
      ? NORMAL_TIME_LIMITS_MIN.map((m) => ({ label: `${m}분`, value: { kind: 'time', minutes: m } as NormalLimit, on: limit.minutes === m }))
      : NORMAL_RPS_LIMITS.map((c) => ({ label: `${c}회`, value: { kind: 'rps', count: c } as NormalLimit, on: limit.count === c }))

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle}>{solo ? '혼자서 플레이' : '멀티플레이'}</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      {!solo && <Text style={styles.sheetHint}>방을 만들고 친구를 초대해요. 빈 자리는 AI가 맡아요.</Text>}

      <Pressable style={[styles.mode, mode === 'normal' && styles.modeOn]} onPress={() => setMode('normal')}>
        <Text style={styles.modeTitle}>
          <Icon name="sun_cloud" size={20} /> 일반
        </Text>
        <Text style={styles.modeDesc}>제한 안에서 가볍게 떠나 보기. 목적지에 얼마나 가까이 갔는지 기록실에 남아요.</Text>
        {mode === 'normal' && (
          <View style={styles.limitBox}>
            <View style={styles.segment}>
              {(['time', 'rps'] as const).map((kind) => (
                <Pressable
                  key={kind}
                  style={[styles.segmentItem, limit.kind === kind && styles.segmentOn]}
                  onPress={() => setLimit(kind === 'time' ? { kind, minutes: NORMAL_TIME_LIMITS_MIN[0] } : { kind, count: NORMAL_RPS_LIMITS[0] })}
                >
                  <Text style={[styles.segmentText, limit.kind === kind && styles.segmentTextOn]}><Icon name={kind === 'time' ? 'stopwatch' : 'rock'} size={16} /> {kind === 'time' ? '시간 제한' : '횟수 제한'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.chips}>
              {chips.map((c) => (
                <Pressable key={c.label} style={[styles.chip, c.on && styles.chipOn]} onPress={() => setLimit(c.value)}>
                  <Text style={[styles.chipText, c.on && styles.chipTextOn]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </Pressable>

      <Pressable style={[styles.mode, mode === 'hardcore' && styles.modeHard]} onPress={() => setMode('hardcore')}>
        <Text style={[styles.modeTitle, mode === 'hardcore' && styles.light]}>
          <Icon name="fire" size={20} /> 하드코어
        </Text>
        <Text style={[styles.modeDesc, mode === 'hardcore' && styles.lightDim]}>
          제한 없이 도착할 때까지. 중간 저장은 없고 포기만 할 수 있어요. 도착하면 오늘의 월드레코드에 올라가요.
        </Text>
      </Pressable>

      <Pressable style={styles.primary} onPress={next}>
        <Text style={styles.primaryText}>출발지·목적지 정하기 →</Text>
      </Pressable>
      {!solo && (
        <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={onJoinCode}>
          <Text style={styles.secondaryText}>초대 코드로 참가</Text>
        </Pressable>
      )}
    </View>
  )
}

/** 첫 화면: 하늘·언덕 배경 위에 혼자서 플레이 / 멀티플레이 / 기록실 */
export function MainMenu() {
  const { nickname, error, busy, setNickname, joinRoom, setScreen } = useGame()
  const muted = useSound((s) => s.muted)
  const online = useOnline()
  const [sheet, setSheet] = useState<'solo' | 'multi' | 'missions' | null>(null)
  const coins = useProfile((s) => s.profile?.coins)
  const attended = useProfile((s) => s.profile?.attendance.claimedToday ?? true)
  const gained = useProfile((s) => s.gained)
  const hasReward = useHasReward()
  const [toast, setToast] = useState<number | null>(null)

  // 메뉴에 올 때마다 코인·미션을 새로 받는다 (판을 끝내고 돌아오면 늘어 있다)
  useEffect(() => {
    useProfile.getState().refresh()
  }, [])

  // 보상을 받으면 잠깐 "+15 코인"
  useEffect(() => {
    if (!gained || Date.now() - gained.at > 1000) return
    setToast(gained.amount)
    const timer = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(timer)
  }, [gained])
  const [popup, setPopup] = useState<Popup>(null)
  /** 닉네임을 정하고 나서 이어서 할 일 */
  const [afterNickname, setAfterNickname] = useState<(() => void) | null>(null)

  const withNickname = (run: () => void) => {
    playEffect('tap')
    if (nickname.trim()) return run()
    setAfterNickname(() => run)
    setPopup('nickname')
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <MenuBackdrop />
      <View style={styles.top} pointerEvents="none">
        <Text style={styles.title}>직좌우</Text>
        <Text style={styles.subtitle}>가위바위보로 정하는 길</Text>
      </View>

      <View style={styles.topBar}>
        <Pressable style={styles.pill} onPress={() => (playEffect('tap'), setPopup('nickname'))}>
          <Text style={styles.pillText}>
            <Icon name="person" size={16} /> {nickname.trim() || '닉네임 정하기'}
          </Text>
        </Pressable>
        <View style={styles.pillRow}>
          <Pressable style={styles.pill} onPress={() => (playEffect('tap'), setScreen('closet'))}>
            <Text style={styles.pillText}>
              <Icon name="coin" size={16} /> {coins ?? '…'}
            </Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={() => useSound.getState().setMuted(!muted)}>
            <Icon name={muted ? 'muted' : 'speaker'} size={20} />
          </Pressable>
        </View>
      </View>
      {toast !== null && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>
            +{toast} <Icon name="coin" size={20} />
          </Text>
        </View>
      )}

      <ScrollView style={styles.bottomScroll} contentContainerStyle={styles.bottom} keyboardShouldPersistTaps="handled">
        {!online && <Text style={styles.offline}>서버에 연결하는 중… (같은 와이파이인지 확인해 주세요)</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
        {sheet === 'missions' ? (
          <MissionSheet onClose={() => setSheet(null)} />
        ) : sheet ? (
          <ModeSheet solo={sheet === 'solo'} onClose={() => setSheet(null)} onJoinCode={() => withNickname(() => setPopup('code'))} />
        ) : (
          <>
            {!attended && (
              <Pressable style={styles.attend} onPress={() => (playEffect('win'), useProfile.getState().attend())}>
                <Text style={styles.attendText}>
                  <Icon name="gift" size={20} /> 오늘의 출석 보상 받기
                </Text>
              </Pressable>
            )}
            <Pressable style={[styles.menuButton, styles.solo]} onPress={() => withNickname(() => setSheet('solo'))}>
              <Text style={styles.menuText}>혼자서 플레이</Text>
              <Text style={styles.menuSub}>AI 둘과 함께</Text>
            </Pressable>
            <Pressable style={[styles.menuButton, styles.multi]} onPress={() => withNickname(() => setSheet('multi'))}>
              <Text style={styles.menuText}>멀티플레이</Text>
              <Text style={styles.menuSub}>친구와 최대 3명</Text>
            </Pressable>
            <View style={styles.smallRow}>
              <Pressable style={[styles.menuButton, styles.small, styles.records]} onPress={() => (playEffect('tap'), setScreen('records'))}>
                <Text style={styles.smallText}>
                  <Icon name="trophy" size={18} /> 기록실
                </Text>
              </Pressable>
              <Pressable style={[styles.menuButton, styles.small, styles.closet]} onPress={() => (playEffect('tap'), setScreen('closet'))}>
                <Text style={styles.smallText}>
                  <Icon name="tshirt" size={18} /> 옷장
                </Text>
              </Pressable>
              <Pressable style={[styles.menuButton, styles.small, styles.missions]} onPress={() => (playEffect('tap'), setSheet('missions'))}>
                <Text style={styles.smallText}>
                  <Icon name="clipboard" size={18} /> 미션
                </Text>
                {hasReward && <View style={styles.dot} />}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <InputPopup
        visible={popup === 'nickname'}
        title="닉네임"
        initialValue={nickname}
        placeholder="다른 사람에게 보일 이름 (12자까지)"
        maxLength={12}
        onConfirm={(v) => {
          setNickname(v)
          const next = afterNickname
          setAfterNickname(null)
          // 팝업이 닫힌 다음에 이어서 한다 (다음 팝업을 바로 띄울 수도 있으니)
          if (next) setTimeout(next, 350)
        }}
        onClose={() => setPopup((p) => (p === 'nickname' ? null : p))}
      />
      <InputPopup
        visible={popup === 'code'}
        title="초대 코드"
        placeholder="6자리 코드"
        maxLength={6}
        minLength={6}
        uppercase
        confirmLabel={busy ? '들어가는 중…' : '참가하기'}
        onConfirm={joinRoom}
        onClose={() => setPopup((p) => (p === 'code' ? null : p))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 90, left: 0, right: 0, alignItems: 'center', gap: 6 },
  title: { color: '#fff', fontSize: 56, fontWeight: '900', letterSpacing: 6, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 3 } },
  subtitle: { color: '#fff', fontSize: 16, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  topBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  pill: { backgroundColor: 'rgba(15,23,42,0.7)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  pillText: { color: '#fff', fontWeight: '700' },
  bottomScroll: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%' },
  bottom: { padding: 16, paddingBottom: 28, gap: 12 },
  menuButton: { borderRadius: 18, paddingVertical: 16, paddingHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  solo: { backgroundColor: '#e11d48' },
  multi: { backgroundColor: '#2563eb' },
  records: { backgroundColor: '#0f172a' },
  closet: { backgroundColor: '#7c3aed' },
  missions: { backgroundColor: '#d97706' },
  smallRow: { flexDirection: 'row', gap: 10 },
  small: { flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  smallText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dot: { position: 'absolute', top: 6, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', borderWidth: 1.5, borderColor: '#fff' },
  pillRow: { flexDirection: 'row', gap: 8 },
  attend: { backgroundColor: '#f59e0b', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  attendText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  toast: { position: 'absolute', top: 60, right: 16, backgroundColor: '#f59e0b', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  toastText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  menuText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  menuSub: { color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  offline: { color: '#fff', backgroundColor: 'rgba(180,83,9,0.9)', borderRadius: 10, padding: 10, textAlign: 'center', overflow: 'hidden' },
  error: { color: '#fff', backgroundColor: 'rgba(220,38,38,0.9)', borderRadius: 10, padding: 10, textAlign: 'center', overflow: 'hidden' },

  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 16, gap: 10 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  sheetHint: { color: '#6b7280', fontSize: 13 },
  close: { fontSize: 18, color: '#6b7280' },
  mode: { borderWidth: 2, borderColor: '#e5e7eb', borderRadius: 14, padding: 12, gap: 4 },
  modeOn: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  modeHard: { borderColor: '#b91c1c', backgroundColor: '#1f2937' },
  modeTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  modeDesc: { color: '#4b5563', fontSize: 13, lineHeight: 18 },
  light: { color: '#fff' },
  lightDim: { color: '#d1d5db' },
  limitBox: { gap: 8, marginTop: 6 },
  segment: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 10, padding: 3 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentOn: { backgroundColor: '#fff' },
  segmentText: { color: '#6b7280', fontWeight: '600' },
  segmentTextOn: { color: '#111827', fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
  chipOn: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  chipText: { fontWeight: '700', color: '#334155' },
  chipTextOn: { color: '#fff' },
  primary: { backgroundColor: '#e11d48', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondary: { backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.4 },
})

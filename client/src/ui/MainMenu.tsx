import { useEffect, useRef, useState } from 'react'
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import type { NormalLimit, RoomRules } from '@jikjwau/shared/types'
import { NORMAL_RPS_LIMITS, NORMAL_TIME_LIMITS_MIN } from '@jikjwau/shared/config'
import { socket } from '../api/socket'
import { useGame } from '../store/game'
import { playEffect } from '../lib/sound'
import { useProfile } from '../store/profile'
import { InputPopup } from './InputPopup'
import { MissionSheet, useHasReward } from './MissionSheet'
import { Icon } from './Icon'
import { SettingsButton } from './SoundSettings'
import { ProfileAvatar } from './ProfileAvatar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GameButton } from './GameButton'
import { ImageButton } from './ImageButton'
import { OutlinedText } from './OutlinedText'
import { BORDER, CARD, FONT, INK, TEXT_STROKE } from './theme'
import { CartoonTitle } from './OutlinedText'

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
        <CartoonTitle size={28}>{solo ? '혼자서 플레이' : '멀티플레이'}</CartoonTitle>
        <Pressable style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      {!solo && <Text style={styles.sheetHint}>방을 만들고 친구를 초대해요. 빈 자리는 AI가 맡아요.</Text>}

      <Pressable style={[styles.mode, mode === 'normal' && styles.modeOn]} onPress={() => setMode('normal')}>
        <View style={styles.modeHead}>
          <Icon name="sun_cloud" size={28} />
          <CartoonTitle size={22}>일반</CartoonTitle>
        </View>
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
                  <Icon name={kind === 'time' ? 'stopwatch' : 'rock'} size={18} />
                  <Text style={[styles.segmentText, limit.kind === kind && styles.segmentTextOn]}>{kind === 'time' ? '시간 제한' : '횟수 제한'}</Text>
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
        <View style={styles.modeHead}>
          <Icon name="fire" size={28} />
          <CartoonTitle size={22} light={mode === 'hardcore'}>
            하드코어
          </CartoonTitle>
        </View>
        <Text style={[styles.modeDesc, mode === 'hardcore' && styles.lightDim]}>
          제한 없이 도착할 때까지. 중간 저장은 없고 포기만 할 수 있어요. 도착하면 오늘의 월드레코드에 올라가요.
        </Text>
      </Pressable>

      <GameButton label="출발지·목적지 정하기" color="yellow" size="md" onPress={next} />
      {!solo && <GameButton label="초대 코드로 참가" color="white" size="sm" disabled={busy} onPress={onJoinCode} />}
    </View>
  )
}

/** 메인 화면 그림 (assets/main의 원본을 다듬어 줄인 것: 투명 여백·부스러기 제거) */
const ART = {
  bg: require('../../assets/main/soft/menu-bg.jpg'),
  title: require('../../assets/main/soft/menu-title.png'),
  men: require('../../assets/main/soft/menu-men.png'),
  solo: require('../../assets/main/soft/menu-solo.png'),
  multi: require('../../assets/main/soft/menu-multi.png'),
  record: require('../../assets/main/soft/menu-record.png'),
  closet: require('../../assets/main/soft/menu-closet.png'),
  mission: require('../../assets/main/soft/menu-mission.png'),
}

/** 배경 그림 비율 (가로/세로)과, 그림 안에서 풀밭 앞쪽(사람이 설 곳)의 높이 비율 */
const BG_ASPECT = 1086 / 1448
const BG_FEET = 0.69
/** 세 사람 그림 비율 (가로/세로) */
const MEN_ASPECT = 1080 / 521
/** 작은 버튼 그림 비율 (가로/세로) */
const SMALL_ASPECT = { record: 600 / 308, closet: 600 / 259, mission: 600 / 273 }

/** 세 사람이 처음 한 번 통 튀어나오며 등장한다 */
function Entrance({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.sequence([Animated.delay(150), Animated.spring(v, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true })]).start()
  }, [v])
  return (
    <Animated.View
      style={[
        styles.fill,
        {
          opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}

/** 코인 옆 + (글자 대신 막대 두 개라 늘 가운데) */
function PlusMark() {
  return (
    <View style={styles.plus}>
      <View style={styles.plusH} />
      <View style={styles.plusV} />
    </View>
  )
}

/** 첫 화면: 하늘·풀밭 배경 그림, 타이틀, 세 사람, 혼자서 플레이 / 멀티플레이 / 기록실·옷장·미션 (모두 assets/main 그림) */
export function MainMenu() {
  const { nickname, error, busy, setNickname, joinRoom, setScreen } = useGame()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  /** 메뉴 칸 높이, 타이틀 아래 끝, 버튼 묶음 위 끝 (배경·사람 자리를 맞춘다) */
  const [box, setBox] = useState({ h: 0, titleBottom: 0, buttonsTop: 0 })
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

  // 배경은 노치·홈 바 밑까지 화면 전체를 덮고, 그림 세로 전체(하늘 끝 ~ 꽃)가 다 보이게 높이에 맞춘다.
  // 화면이 그림보다 좁으면 양옆만 조금 잘린다 (넓은 화면이면 너비에 맞추고 아래를 맞춘다)
  const fullH = box.h + insets.top + insets.bottom
  const bgH = Math.max(fullH, width / BG_ASPECT)
  const bgW = bgH * BG_ASPECT
  const bgTop = -insets.top + (fullH - bgH)
  // 사람은 풀밭 앞쪽에 서고, 버튼에 너무 가리지 않게 버튼 묶음 위쪽 근처까지만 내려온다
  // 버튼 묶음 위로 14px 띄워 혼자서 플레이 버튼에 붙지 않게
  const feet = Math.min(bgTop + bgH * BG_FEET, box.buttonsTop - 14)
  const menH = Math.max(0, Math.min(feet - box.titleBottom - 4, (width - 16) / MEN_ASPECT))
  const menW = menH * MEN_ASPECT

  const titleWidth = Math.min(width - 32, 400)
  const buttonWidth = Math.min(width - 24, 440)
  // 작은 버튼 셋은 그림 비율이 조금씩 달라서, 늘리거나 줄이지 않고 높이를 똑같이 맞춘다 (너비는 그림 비율대로)
  const smallHeight = (buttonWidth - 16) / (SMALL_ASPECT.record + SMALL_ASPECT.closet + SMALL_ASPECT.mission)

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" onLayout={(e) => setBox((b) => ({ ...b, h: e.nativeEvent.layout.height }))}>
      {box.h > 0 && <Image source={ART.bg} style={{ position: 'absolute', left: (width - bgW) / 2, top: bgTop, width: bgW, height: bgH }} resizeMode="stretch" />}
      {/* 세 사람: 풀밭 위에 선다 */}
      {box.buttonsTop > 0 && menH > 40 && (
        <View style={{ position: 'absolute', left: (width - menW) / 2, top: feet - menH, width: menW, height: menH }} pointerEvents="none">
          <Entrance>
            <Image source={ART.men} style={styles.fill} resizeMode="contain" />
          </Entrance>
        </View>
      )}

      <View style={styles.column} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Pressable style={styles.profile} onPress={() => (playEffect('tap'), setPopup('nickname'))}>
            <ProfileAvatar size={42} />
            <Text style={styles.profileName} numberOfLines={1}>
              {nickname.trim() || '닉네임 정하기'}
            </Text>
          </Pressable>
          <View style={styles.topRight}>
            <Pressable style={styles.coins} onPress={() => (playEffect('tap'), setScreen('closet'))}>
              <Icon name="coin" size={26} />
              <Text style={styles.coinText}>{coins ?? '…'}</Text>
              <PlusMark />
            </Pressable>
            <SettingsButton style={styles.round} />
          </View>
        </View>

        <View style={styles.logo} pointerEvents="none" onLayout={(e) => setBox((b) => ({ ...b, titleBottom: e.nativeEvent.layout.y + e.nativeEvent.layout.height }))}>
          <Image source={ART.title} style={{ width: titleWidth, height: titleWidth * 0.525 }} resizeMode="contain" />
        </View>

        <View style={styles.spacer} pointerEvents="none" />

        <View style={styles.bottom} onLayout={(e) => setBox((b) => ({ ...b, buttonsTop: e.nativeEvent.layout.y }))}>
          {!online && <Text style={styles.offline}>서버에 연결하는 중… (같은 와이파이인지 확인해 주세요)</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
          {!attended && <GameButton label="오늘의 출석 보상 받기" color="green" size="sm" icon={<Icon name="gift" size={26} />} onPress={() => (playEffect('win'), useProfile.getState().attend())} />}
          <ImageButton source={ART.solo} width={buttonWidth} onPress={() => withNickname(() => setSheet('solo'))} />
          <ImageButton source={ART.multi} width={buttonWidth} onPress={() => withNickname(() => setSheet('multi'))} />
          <View style={styles.smallRow}>
            <ImageButton source={ART.record} width={smallHeight * SMALL_ASPECT.record} height={smallHeight} onPress={() => (playEffect('tap'), setScreen('records'))} />
            <ImageButton source={ART.closet} width={smallHeight * SMALL_ASPECT.closet} height={smallHeight} onPress={() => (playEffect('tap'), setScreen('closet'))} />
            <ImageButton source={ART.mission} width={smallHeight * SMALL_ASPECT.mission} height={smallHeight} badge={hasReward} onPress={() => (playEffect('tap'), setSheet('missions'))} />
          </View>
        </View>
      </View>

      {toast !== null && (
        <View style={styles.toast} pointerEvents="none">
          <Icon name="coin" size={24} />
          <OutlinedText style={styles.toastText} stroke={TEXT_STROKE}>
            +{toast}
          </OutlinedText>
        </View>
      )}

      {/* 난이도·미션 창은 아래 버튼들 위에 띄운다 */}
      {sheet && (
        <View style={styles.sheetLayer}>
          {/* 어둡게 덮는 판은 노치·홈 바 밑까지 */}
          <Pressable style={[styles.sheetDim, { top: -insets.top, bottom: -insets.bottom }]} onPress={() => setSheet(null)} />
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            {sheet === 'missions' ? (
              <MissionSheet onClose={() => setSheet(null)} />
            ) : (
              <ModeSheet solo={sheet === 'solo'} onClose={() => setSheet(null)} onJoinCode={() => withNickname(() => setPopup('code'))} />
            )}
          </ScrollView>
        </View>
      )}

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

const PILL = { backgroundColor: 'rgba(27,37,89,0.85)', borderWidth: BORDER, borderColor: INK } as const

const styles = StyleSheet.create({
  column: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  profile: { ...PILL, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, paddingLeft: 5, paddingRight: 14, paddingVertical: 5 },
  profileName: { flexShrink: 1, fontFamily: FONT.body, color: '#fff', fontSize: 18 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coins: { ...PILL, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingLeft: 6, paddingRight: 4, height: 46 },
  coinText: { fontFamily: FONT.body, color: '#fff', fontSize: 19, minWidth: 28 },
  plus: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#4f8dff', borderWidth: BORDER, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  plusH: { position: 'absolute', width: 13, height: 3.5, borderRadius: 2, backgroundColor: '#fff' },
  plusV: { position: 'absolute', width: 3.5, height: 13, borderRadius: 2, backgroundColor: '#fff' },
  round: { ...PILL, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  logo: { alignItems: 'center', marginTop: 6 },
  spacer: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  bottom: { alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, gap: 6 },
  // 큰 버튼 둘과 작은 버튼 줄 사이를 띄운다
  smallRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  offline: { fontFamily: FONT.body, color: '#fff', backgroundColor: 'rgba(180,83,9,0.92)', borderRadius: 12, padding: 10, textAlign: 'center', overflow: 'hidden' },
  error: { fontFamily: FONT.body, color: '#fff', backgroundColor: 'rgba(220,38,38,0.92)', borderRadius: 12, padding: 10, textAlign: 'center', overflow: 'hidden' },
  toast: { position: 'absolute', top: 64, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ffd84d', borderRadius: 16, borderWidth: BORDER, borderColor: INK, paddingHorizontal: 12, paddingVertical: 6 },
  toastText: { fontFamily: FONT.body, color: '#fff', fontSize: 20 },

  sheetLayer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  sheetDim: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheetScroll: { flexGrow: 0, maxHeight: '85%' },
  sheetContent: { padding: 12, paddingBottom: 16 },
  sheet: { ...CARD, padding: 16, gap: 12 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetHint: { fontFamily: FONT.body, color: '#5b6593', fontSize: 14 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef1fb', borderWidth: BORDER, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  close: { fontFamily: FONT.body, fontSize: 16, color: INK },
  mode: { borderWidth: BORDER, borderColor: INK, borderRadius: 18, padding: 14, gap: 6, backgroundColor: '#f7f9ff' },
  modeOn: { borderColor: '#4f8dff', backgroundColor: '#eaf2ff' },
  modeHard: { borderColor: '#ff5a5f', backgroundColor: '#1f2340' },
  modeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeDesc: { fontFamily: FONT.body, color: '#5b6593', fontSize: 14, lineHeight: 20 },
  lightDim: { color: '#c9cfe6' },
  limitBox: { gap: 8, marginTop: 4 },
  segment: { flexDirection: 'row', backgroundColor: '#dfe5f7', borderRadius: 14, padding: 4 },
  segmentItem: { flex: 1, flexDirection: 'row', gap: 4, paddingVertical: 9, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: '#fff', borderWidth: BORDER, borderColor: INK },
  segmentText: { fontFamily: FONT.button, color: '#5b6593', fontSize: 15 },
  segmentTextOn: { color: INK },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderWidth: BORDER, borderColor: INK, borderRadius: 12, paddingVertical: 9, alignItems: 'center', backgroundColor: '#fff' },
  chipOn: { borderColor: INK, backgroundColor: '#4f8dff' },
  chipText: { fontFamily: FONT.button, color: '#33438a', fontSize: 16 },
  chipTextOn: { color: '#fff' },
})

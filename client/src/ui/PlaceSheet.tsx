import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import type { LatLng, PlaceResult } from '@jikjwau/shared/types'
import { reversePlace, searchPlaces } from '../api/place'
import { playEffect } from '../lib/sound'
import { useGame, type Spot } from '../store/game'
import { Icon, type IconName } from './Icon'
import { formatDistance } from './labels'
import { BORDER, FONT, INK, LIP } from './theme'
import { GameButton } from './GameButton'
import { ScreenBackdrop } from './ScreenBackdrop'

interface Props {
  /** 지도 화면 가운데 (현재 위치를 모를 때 출발지 검색 기준) */
  near: () => LatLng
  /** 출발지·목적지를 정하면 지도를 그쪽으로 */
  onChosen: (kind: 'start' | 'destination', spot: Spot) => void
}

/** 단계마다: 팻말 글, 제목 그림(어디서 출발할까요? / 어디로 도착할까요?), 검색창 안내 */
const COPY = {
  start: { step: '1/2', heading: require('../../assets/main/soft/place-start.png'), placeholder: '출발할 곳 검색 (예: 홍대입구역)' },
  destination: { step: '2/2', heading: require('../../assets/main/soft/place-destination.png'), placeholder: '도착할 곳 검색 (예: 남산타워)' },
}
/** 제목 그림 비율 (세로/가로) */
const HEADING_RATIO = 557 / 1080

/**
 * 게임 준비: 출발지 → 목적지를 차례로 고르는 전체 화면 창.
 * 검색하거나, (출발지는) 지금 있는 곳, 또는 창을 닫고 지도를 길게 눌러 고른다
 */
export function PlaceSheet({ near, onChosen }: Props) {
  const sheet = useGame((s) => s.placeSheet)
  const start = useGame((s) => s.start)
  const startChosen = useGame((s) => s.startChosen)
  const destination = useGame((s) => s.destination)
  const { setPlaceSheet, setStart, setDestination } = useGame()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [source, setSource] = useState<'kakao' | 'osm'>('kakao')
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string>()
  /** 검색창에 쓰는 중이면 위 그림을 접어 자리를 만든다 */
  const [typing, setTyping] = useState(false)

  // 창이 바뀌면(출발지 → 목적지) 검색을 비운다
  useEffect(() => {
    setQuery('')
    setResults(null)
    setError(undefined)
  }, [sheet])

  const { width } = useWindowDimensions()
  if (!sheet) return null
  const copy = COPY[sheet]
  const headW = Math.min(width - 24, 420)
  // 검색 중이거나 결과가 있으면 제목 그림을 줄여 목록 자리를 만든다
  const compact = typing || !!results
  // 목적지는 출발지 근처부터 (결과의 거리도 출발지에서 잰 것)
  const searchNear = () => (sheet === 'destination' && startChosen ? start.latLng : near())

  const search = async () => {
    const q = query.trim()
    if (!q) return
    Keyboard.dismiss()
    setLoading(true)
    setError(undefined)
    try {
      const res = await searchPlaces(q, searchNear())
      setResults(res.places)
      setSource(res.source)
    } catch (err) {
      setError((err as Error).message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const choose = (spot: Spot) => {
    playEffect('tap')
    if (sheet === 'start') {
      setStart(spot)
      // 출발지를 정하면 목적지를 고른다 (이미 있으면 닫는다)
      setPlaceSheet(destination ? null : 'destination')
    } else {
      setDestination(spot)
      setPlaceSheet(null)
    }
    onChosen(sheet, spot)
  }

  const here = async () => {
    setLocating(true)
    setError(undefined)
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (!permission.granted) throw new Error('위치 권한이 없어요. 설정에서 허용하거나 검색으로 골라 주세요')
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const latLng = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      const found = await reversePlace(latLng).catch(() => null)
      choose({ latLng, name: found ? `${found.name} (지금 위치)` : '지금 위치', address: found?.address })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLocating(false)
    }
  }

  const close = () => {
    // 출발지 없이 닫으면 메뉴로 (게임을 시작할 수 없으니)
    if (sheet === 'start' && !startChosen) useGame.getState().setScreen('menu')
    setPlaceSheet(null)
  }

  const clearSearch = () => {
    setResults(null)
    setQuery('')
  }

  // Modal은 앱의 SafeAreaProvider 밖에 그려져서 안에 따로 둬야 노치·홈 바를 피한다.
  // 아이폰은 위쪽에 손이 잘 안 닿으므로 위는 제목과 그림만, 누르는 것(고르기·검색·돌아가기)은 아래에
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaProvider>
        <ScreenBackdrop />
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.head}>
              <WoodSign text={copy.step} />
              {/* 제목 그림 (assets/main): 검색 중이면 작게 */}
              <Image source={copy.heading} style={{ width: headW * (compact ? 0.62 : 1), height: headW * HEADING_RATIO * (compact ? 0.62 : 1) }} resizeMode="contain" />
              {sheet === 'destination' && startChosen && (
                <Text style={styles.from} numberOfLines={1}>
                  {start.name}에서 출발해요
                </Text>
              )}
            </View>

            {/* 검색창이 맨 위, 그다음 지금 있는 곳, 지도에서 고르기 */}
            <View style={styles.searchBlock}>
              <View style={styles.bar}>
                <Icon name="search" size={28} />
                <TextInput
                  style={styles.input}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={copy.placeholder}
                  placeholderTextColor="#94a3b8"
                  returnKeyType="search"
                  onSubmitEditing={search}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                />
                {loading ? <ActivityIndicator style={styles.spinner} color="#1f9a47" /> : <GameButton label="검색" color="green" size="sm" style={styles.searchButton} onPress={search} />}
              </View>
              {results && (
                <Pressable style={styles.clear} onPress={clearSearch} hitSlop={8}>
                  <Text style={styles.clearText}>검색 지우기 ✕</Text>
                </Pressable>
              )}
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {error && <Text style={styles.error}>{error}</Text>}
              {results?.length === 0 && <Text style={styles.message}>검색 결과가 없어요. 다른 이름으로 찾아보세요</Text>}
              {results?.map((p, i) => (
                <Pressable
                  key={`${p.lat},${p.lng},${i}`}
                  style={({ pressed }) => [styles.card, styles.result, pressed && styles.cardPressed]}
                  onPress={() => choose({ latLng: { lat: p.lat, lng: p.lng }, name: p.name, address: p.address })}
                >
                  <View style={styles.cardBody}>
                    <View style={styles.resultHead}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {p.distanceM !== undefined && <Text style={styles.distance}>{formatDistance(p.distanceM)}</Text>}
                    </View>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {p.address}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
              {results && source === 'osm' && <Text style={styles.source}>OpenStreetMap 검색 결과 (카카오 키를 설정하면 더 정확해요)</Text>}

              {!results && (
                <>
                  {sheet === 'start' && (
                    <OptionCard icon="pin" title={locating ? '위치를 찾는 중…' : '지금 있는 곳에서 출발'} sub="휴대폰 위치를 사용해요" disabled={locating} onPress={here} />
                  )}
                  {sheet === 'destination' && startChosen && (
                    <OptionCard icon="flag" title="출발지 바꾸기" sub={`지금: ${start.name}`} onPress={() => setPlaceSheet('start')} />
                  )}
                  <OptionCard
                    icon="map"
                    title="지도에서 직접 고르기"
                    sub={`지도를 길게 눌러 ${sheet === 'start' ? '출발지' : '도착지'}를 골라요`}
                    onPress={() => setPlaceSheet(null)}
                  />
                </>
              )}
            </ScrollView>

            <View style={styles.bottom}>
              <Pressable style={({ pressed }) => [styles.back, pressed && styles.backPressed]} onPress={close}>
                <Text style={styles.backText}>{sheet === 'start' && !startChosen ? '메뉴로 돌아가기' : '닫기'}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

/** 왼쪽 위 나무 팻말 (단계 1/2, 2/2): 끈 두 줄에 매달린 나무판 */
function WoodSign({ text }: { text: string }) {
  return (
    <View style={styles.sign}>
      <View style={[styles.rope, { left: 14 }]} />
      <View style={[styles.rope, { right: 14 }]} />
      <View style={styles.signBoard}>
        <Text style={styles.signText}>{text}</Text>
      </View>
    </View>
  )
}

/** 큰 고르기 카드: 왼쪽 그림, 제목과 설명, 오른쪽 › */
function OptionCard({ icon, title, sub, onPress, disabled }: { icon: IconName; title: string; sub: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed, disabled && styles.disabled]} disabled={disabled} onPress={onPress}>
      <Icon name={icon} size={56} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

const BLUE = '#2f6fe0'

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  head: { alignItems: 'center', paddingHorizontal: 12, paddingTop: 4 },
  from: { fontFamily: FONT.button, fontSize: 14, color: INK, backgroundColor: '#ffffff', borderRadius: 999, borderWidth: BORDER, borderColor: INK, paddingHorizontal: 14, paddingVertical: 4, overflow: 'hidden', marginTop: 2 },
  searchBlock: { paddingHorizontal: 16, paddingTop: 10, gap: 6 },
  sign: { position: 'absolute', left: 14, top: 4, zIndex: 1, paddingTop: 12 },
  rope: { position: 'absolute', top: 0, width: BORDER + 1, height: 16, backgroundColor: '#6b4420' },
  signBoard: { backgroundColor: '#f0b45a', borderRadius: 10, borderWidth: BORDER, borderColor: '#6b4420', borderBottomWidth: LIP, paddingHorizontal: 16, paddingVertical: 4 },
  signText: { fontFamily: FONT.button, fontSize: 20, color: '#4a2c10' },
  list: { flex: 1, marginTop: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fffaf0',
    borderRadius: 22,
    borderWidth: BORDER,
    borderColor: BLUE,
    borderBottomWidth: LIP,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardPressed: { borderBottomWidth: BORDER, marginTop: LIP - BORDER },
  result: { paddingVertical: 12 },
  cardBody: { flex: 1, gap: 4 },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontFamily: FONT.button, fontSize: 19, color: INK },
  cardSub: { fontFamily: FONT.body, fontSize: 14, color: '#5b6593' },
  chevron: { fontFamily: FONT.button, fontSize: 30, color: INK, marginTop: -4 },
  distance: { fontFamily: FONT.body, color: '#5b6593', fontSize: 14 },
  message: { fontFamily: FONT.body, padding: 12, color: '#ffffff', fontSize: 16, textAlign: 'center', textShadowColor: INK, textShadowRadius: 4 },
  error: { fontFamily: FONT.body, padding: 12, color: '#fff', backgroundColor: 'rgba(220,38,38,0.9)', borderRadius: 12, overflow: 'hidden', fontSize: 15, textAlign: 'center' },
  source: { fontFamily: FONT.body, padding: 8, color: '#ffffff', fontSize: 12, textAlign: 'center' },
  disabled: { opacity: 0.55 },
  bottom: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, gap: 12, alignItems: 'center' },
  clear: { alignSelf: 'flex-end', paddingVertical: 2, paddingHorizontal: 6 },
  clearText: { fontFamily: FONT.button, fontSize: 15, color: '#ffffff', textShadowColor: INK, textShadowRadius: 4 },
  bar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    height: 64,
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: BORDER,
    borderColor: BLUE,
    borderBottomWidth: LIP,
  },
  input: { flex: 1, fontFamily: FONT.body, fontSize: 17, color: INK, height: '100%' },
  searchButton: { width: 92 },
  spinner: { width: 92 },
  back: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minWidth: 220, height: 52, paddingHorizontal: 24, backgroundColor: '#fff', borderRadius: 26, borderWidth: BORDER, borderColor: INK, borderBottomWidth: LIP },
  backPressed: { borderBottomWidth: BORDER, marginTop: LIP - BORDER },
  backText: { fontFamily: FONT.button, fontSize: 18, color: INK },
})

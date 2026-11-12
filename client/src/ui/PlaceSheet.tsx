import { useEffect, useState } from 'react'
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import type { LatLng, PlaceResult } from '@jikjwau/shared/types'
import { reversePlace, searchPlaces } from '../api/place'
import { playEffect } from '../lib/sound'
import { useGame, type Spot } from '../store/game'
import { Icon } from './Icon'
import { formatDistance } from './labels'

interface Props {
  /** 지도 화면 가운데 (현재 위치를 모를 때 출발지 검색 기준) */
  near: () => LatLng
  /** 출발지·목적지를 정하면 지도를 그쪽으로 */
  onChosen: (kind: 'start' | 'destination', spot: Spot) => void
}

const COPY = {
  start: { step: '1 / 2', title: '어디서 출발할까요?', placeholder: '출발할 곳 검색 (예: 홍대입구역)', color: '#16a34a' },
  destination: { step: '2 / 2', title: '어디로 갈까요?', placeholder: '도착할 곳 검색 (예: 남산타워)', color: '#e11d48' },
}

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

  // 창이 바뀌면(출발지 → 목적지) 검색을 비운다
  useEffect(() => {
    setQuery('')
    setResults(null)
    setError(undefined)
  }, [sheet])

  if (!sheet) return null
  const copy = COPY[sheet]
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

  const searchBar = (
    <View style={styles.bar}>
      <Icon name="search" size={24} />
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={copy.placeholder}
        placeholderTextColor="#94a3b8"
        returnKeyType="search"
        onSubmitEditing={search}
      />
      {loading ? (
        <ActivityIndicator style={styles.searchButton} />
      ) : (
        <Pressable style={[styles.searchButton, { backgroundColor: copy.color }]} onPress={search}>
          <Text style={styles.searchText}>검색</Text>
        </Pressable>
      )}
    </View>
  )

  const clearSearch = () => {
    setResults(null)
    setQuery('')
  }

  // Modal은 앱의 SafeAreaProvider 밖에 그려져서 안에 따로 둬야 노치·홈 바를 피한다.
  // 아이폰은 위쪽에 손이 잘 안 닿으므로 제목만 위에, 누르는 것(고르기·검색·닫기)은 아래에
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.head}>
              <Text style={[styles.step, { color: copy.color }]}>{copy.step}</Text>
              <Text style={styles.title}>{copy.title}</Text>
              {sheet === 'destination' && startChosen && (
                <View style={styles.from}>
                  <View style={[styles.dot, { backgroundColor: COPY.start.color }]} />
                  <Text style={styles.fromText} numberOfLines={1}>
                    {start.name}에서 출발
                  </Text>
                </View>
              )}
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {error && <Text style={styles.error}>{error}</Text>}
              {!results && !error && <Text style={styles.message}>아래 검색창에 장소 이름을 입력해 주세요</Text>}
              {results?.length === 0 && <Text style={styles.message}>검색 결과가 없어요. 다른 이름으로 찾아보세요</Text>}
              {results?.map((p, i) => (
                <Pressable
                  key={`${p.lat},${p.lng},${i}`}
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  onPress={() => choose({ latLng: { lat: p.lat, lng: p.lng }, name: p.name, address: p.address })}
                >
                  <View style={styles.itemHead}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.distanceM !== undefined && <Text style={styles.distance}>{formatDistance(p.distanceM)}</Text>}
                  </View>
                  <Text style={styles.address} numberOfLines={1}>
                    {p.address}
                  </Text>
                </Pressable>
              ))}
              {results && source === 'osm' && <Text style={styles.source}>OpenStreetMap 검색 결과 (카카오 키를 설정하면 더 정확해요)</Text>}
            </ScrollView>

            <View style={styles.bottom}>
              {!results && (
                <View style={styles.options}>
                  {sheet === 'start' && (
                    <Pressable style={[styles.option, locating && styles.disabled]} disabled={locating} onPress={here}>
                      <Icon name="pin" size={32} />
                      <View style={styles.optionBody}>
                        <Text style={styles.optionTitle}>{locating ? '위치를 찾는 중…' : '지금 있는 곳에서 출발'}</Text>
                        <Text style={styles.optionSub}>휴대폰 위치를 써요</Text>
                      </View>
                    </Pressable>
                  )}
                  {sheet === 'destination' && startChosen && (
                    <Pressable style={styles.option} onPress={() => setPlaceSheet('start')}>
                      <Icon name="flag" size={32} />
                      <View style={styles.optionBody}>
                        <Text style={styles.optionTitle}>출발지 바꾸기</Text>
                        <Text style={styles.optionSub} numberOfLines={1}>
                          지금: {start.name}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                  <Pressable style={styles.option} onPress={() => setPlaceSheet(null)}>
                    <Icon name="map" size={32} />
                    <View style={styles.optionBody}>
                      <Text style={styles.optionTitle}>지도에서 직접 고르기</Text>
                      <Text style={styles.optionSub}>창을 닫고 지도를 길게 눌러요</Text>
                    </View>
                  </Pressable>
                </View>
              )}
              {results && (
                <Pressable style={styles.clear} onPress={clearSearch} hitSlop={8}>
                  <Text style={styles.link}>검색 지우기</Text>
                </Pressable>
              )}
              {searchBar}
              <Pressable style={styles.close} onPress={close}>
                <Text style={styles.closeText}>{sheet === 'start' && !startChosen ? '메뉴로 돌아가기' : '닫기'}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  fill: { flex: 1 },
  head: { paddingHorizontal: 20, paddingTop: 18, gap: 4 },
  step: { fontSize: 15, fontWeight: '900' },
  title: { fontSize: 28, fontWeight: '900', color: '#0f172a' },
  from: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  fromText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#334155' },
  link: { color: '#2563eb', fontWeight: '800' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    height: 56,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  input: { flex: 1, fontSize: 17, color: '#0f172a', height: '100%' },
  searchButton: { height: 44, marginRight: 6, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  list: { flex: 1, marginTop: 12 },
  bottom: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  clear: { alignSelf: 'center', paddingVertical: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  item: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  itemPressed: { backgroundColor: '#e2e8f0' },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0f172a' },
  distance: { color: '#64748b', fontSize: 14, fontWeight: '700' },
  address: { color: '#64748b', fontSize: 13, marginTop: 3 },
  message: { padding: 12, color: '#64748b', fontSize: 15, textAlign: 'center' },
  error: { padding: 12, color: '#dc2626', fontSize: 15, textAlign: 'center' },
  source: { padding: 8, color: '#94a3b8', fontSize: 12 },
  options: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  optionBody: { flex: 1, gap: 2 },
  optionTitle: { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  optionSub: { fontSize: 13, color: '#64748b' },
  disabled: { opacity: 0.5 },
  close: { height: 48, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#475569', fontSize: 16, fontWeight: '800' },
})

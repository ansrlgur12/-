import { useState } from 'react'
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { LatLng, PlaceResult } from '@jikjwau/shared/types'
import { searchPlaces } from '../api/place'
import { formatDistance } from './labels'

interface Props {
  /** 검색 결과를 이 근처 순으로 */
  near: () => LatLng
  onSelect: (place: PlaceResult) => void
}

/** 지도 위쪽 장소 검색창. 결과를 누르면 onSelect */
export function SearchBar({ near, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [source, setSource] = useState<'kakao' | 'osm'>('kakao')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(undefined)
    try {
      const res = await searchPlaces(q, near())
      setResults(res.places)
      setSource(res.source)
    } catch (err) {
      setError((err as Error).message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const close = () => {
    setResults(null)
    setError(undefined)
    Keyboard.dismiss()
  }

  const select = (place: PlaceResult) => {
    close()
    onSelect(place)
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="장소 검색 (예: 망원역, 일산호수공원)"
          returnKeyType="search"
          onSubmitEditing={search}
        />
        {loading ? (
          <ActivityIndicator style={styles.button} />
        ) : (
          <Pressable style={styles.button} onPress={results || error ? close : search}>
            <Text style={styles.buttonText}>{results || error ? '닫기' : '검색'}</Text>
          </Pressable>
        )}
      </View>

      {error && <Text style={[styles.list, styles.message]}>{error}</Text>}
      {results && (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {results.length === 0 && <Text style={styles.message}>검색 결과가 없어요</Text>}
          {results.map((p, i) => (
            <Pressable key={`${p.lat},${p.lng},${i}`} style={styles.item} onPress={() => select(p)}>
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
          {source === 'osm' && <Text style={styles.source}>OpenStreetMap 검색 결과 (카카오 키를 설정하면 더 정확해요)</Text>}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 60, top: 10 },
  bar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 10, paddingLeft: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  input: { flex: 1, height: 42 },
  button: { paddingHorizontal: 14, justifyContent: 'center' },
  buttonText: { color: '#2563eb', fontWeight: '700' },
  list: { marginTop: 6, maxHeight: 280, backgroundColor: '#fff', borderRadius: 10 },
  message: { padding: 12, color: '#6b7280' },
  item: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontWeight: '700', color: '#111827' },
  distance: { color: '#6b7280', fontSize: 12 },
  address: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  source: { padding: 10, color: '#9ca3af', fontSize: 11 },
})

import { useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { RoadScene } from './map/RoadScene'
import { CHOICE_COLOR } from './map/ChoiceArrows'
import { useRoadExplorer } from './store/roadExplorer'

// 기본 출발지: 망원역
const DEFAULT_LAT = '37.5560'
const DEFAULT_LNG = '126.9101'

const ZOOM_STEPS = [60, 100, 160, 260, 420, 700]

export default function App() {
  const [lat, setLat] = useState(DEFAULT_LAT)
  const [lng, setLng] = useState(DEFAULT_LNG)
  const [zoom, setZoom] = useState(2)
  const { status, error, load, choose, choices, movePath, arrivalKind, nodeId, stepCount } = useRoadExplorer()

  const onLoad = () => {
    const la = Number(lat)
    const ln = Number(lng)
    if (Number.isFinite(la) && Number.isFinite(ln)) load(la, ln)
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TextInput style={styles.input} value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="위도" />
          <TextInput style={styles.input} value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="경도" />
          <Pressable style={styles.loadButton} onPress={onLoad} disabled={status === 'loading'}>
            <Text style={styles.loadText}>{status === 'loading' ? '불러오는 중' : '불러오기'}</Text>
          </Pressable>
        </View>

        <View style={styles.sceneWrap}>
          <RoadScene cameraDistance={ZOOM_STEPS[zoom]} />

          {status === 'loading' && (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={styles.hint}>OSM 도로 데이터를 받는 중 (최대 30초 정도)</Text>
            </View>
          )}
          {status === 'idle' && (
            <View style={styles.center}>
              <Text style={styles.hint}>좌표를 확인하고 불러오기를 눌러 주세요</Text>
            </View>
          )}

          <View style={styles.zoom}>
            <Pressable style={styles.zoomButton} onPress={() => setZoom((z) => Math.max(0, z - 1))}>
              <Text style={styles.zoomText}>＋</Text>
            </Pressable>
            <Pressable style={styles.zoomButton} onPress={() => setZoom((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}>
              <Text style={styles.zoomText}>－</Text>
            </Pressable>
          </View>
          <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
        </View>

        <View style={styles.panel}>
          {error && <Text style={styles.error}>{error}</Text>}
          {status === 'ready' && (
            <Text style={styles.info}>
              {movePath ? '이동 중…' : arrivalKind === 'start' ? '출발 지점' : arrivalKind === 'deadEnd' ? '막다른 길' : `교차로 · 선택지 ${choices.length}개`}
              {`  ·  이동 ${stepCount}회  ·  node ${nodeId}`}
            </Text>
          )}
          <View style={styles.choices}>
            {choices.map((c) => (
              <Pressable
                key={c.via}
                style={[styles.choice, { backgroundColor: CHOICE_COLOR[c.direction ?? c.kind] }]}
                onPress={() => choose(c.via)}
              >
                <Text style={styles.choiceText}>{c.label}</Text>
                {c.angleDeg !== undefined && <Text style={styles.choiceAngle}>{Math.round(c.angleDeg)}°</Text>}
              </Pressable>
            ))}
          </View>
        </View>
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', gap: 6, padding: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 8, height: 40 },
  loadButton: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center' },
  loadText: { color: '#fff', fontWeight: '600' },
  sceneWrap: { flex: 1 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { color: '#374151', backgroundColor: 'rgba(255,255,255,0.85)', padding: 8, borderRadius: 8 },
  zoom: { position: 'absolute', right: 10, top: 10, gap: 6 },
  zoomButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  zoomText: { fontSize: 20, fontWeight: '600' },
  attribution: { position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: '#374151' },
  panel: { padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#eee', minHeight: 110 },
  info: { color: '#374151' },
  error: { color: '#dc2626' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center' },
  choiceText: { color: '#fff', fontWeight: '700' },
  choiceAngle: { color: '#fff', fontSize: 11, opacity: 0.9 },
})

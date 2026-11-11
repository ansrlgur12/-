import { useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import type { LatLng, PlaceResult } from '@jikjwau/shared/types'
import { project, unproject } from '@jikjwau/shared/geo'
import { RoadScene } from './map/RoadScene'
import { CameraGestures } from './map/CameraGestures'
import { createCameraRig } from './map/cameraRig'
import { createScenePicker, hitsPin, pickGround } from './map/scenePicker'
import type { DragHandlers } from './map/CameraGestures'
import { useGame, type Spot } from './store/game'
import { SetupPanel } from './ui/SetupPanel'
import { GamePanel } from './ui/GamePanel'
import { SearchBar } from './ui/SearchBar'
import { PickCard } from './ui/PickCard'
import { PinTooltip } from './ui/PinTooltip'

/** 검색한 장소로 옮겨 갈 때의 카메라 거리 */
const SEARCH_VIEW_DISTANCE_M = 350

export default function App() {
  const [rig] = useState(createCameraRig)
  const [picker] = useState(createScenePicker)
  const status = useGame((s) => s.status)
  const picked = useGame((s) => s.picked)
  const inSetup = status === 'setup' || status === 'starting'
  const [draggingPin, setDraggingPin] = useState(false)
  /** 핀을 잡은 곳과 핀이 꽂힌 곳의 차이 (잡은 채로 옮겨도 핀이 손가락 아래로 튀지 않게) */
  const grabOffset = useRef({ x: 0, y: 0 })

  // 처음 열면 기본 출발지 지도를 띄운다
  useEffect(() => {
    const { start, setStart } = useGame.getState()
    setStart(start)
  }, [])

  // 게임을 시작하면 일행을 따라간다
  useEffect(() => {
    if (status === 'starting') rig.following = true
  }, [status, rig])

  // 화면 중심(카메라가 바라보는 곳)의 위경도. 월드 (x, z) → 로컬 (x, -z)
  const focusLatLng = (): LatLng => unproject({ x: rig.focus.x, y: -rig.focus.z }, useGame.getState().start.latLng)

  // 가장 가까운 "북쪽이 위" 각도로 되돌린다 (여러 바퀴 돌렸어도 되감기지 않게)
  const faceNorth = () => {
    rig.yaw = Math.round(rig.yaw / (Math.PI * 2)) * Math.PI * 2
  }

  const lookAt = (latLng: LatLng) => {
    const p = project(latLng, useGame.getState().start.latLng)
    rig.following = false
    rig.focus.set(p.x, 0, -p.y)
  }

  const pickAt = (x: number, y: number) => {
    const p = pickGround(picker, x, y)
    if (!p) return
    useGame.getState().setPicked({ latLng: unproject(p, useGame.getState().start.latLng), name: '지도에서 고른 위치' })
  }

  const pickPlace = (place: PlaceResult) => {
    const spot: Spot = { latLng: { lat: place.lat, lng: place.lng }, name: place.name, address: place.address }
    useGame.getState().setPicked(spot)
    lookAt(spot.latLng)
    rig.distance = Math.min(rig.distance, SEARCH_VIEW_DISTANCE_M)
  }

  // 핀을 잡고 끌면 손가락 아래 땅으로 핀을 옮긴다
  const pinDrag: DragHandlers = {
    start: (x, y) => {
      const { picked, start } = useGame.getState()
      if (!picked || !hitsPin(picker, x, y)) return false
      const ground = pickGround(picker, x, y)
      if (!ground) return false
      const pin = project(picked.latLng, start.latLng)
      grabOffset.current = { x: pin.x - ground.x, y: pin.y - ground.y }
      setDraggingPin(true)
      return true
    },
    move: (x, y) => {
      const ground = pickGround(picker, x, y)
      if (!ground) return
      const { start, setPicked } = useGame.getState()
      const p = { x: ground.x + grabOffset.current.x, y: ground.y + grabOffset.current.y }
      setPicked({ latLng: unproject(p, start.latLng), name: '지도에서 고른 위치' })
    },
    end: () => setDraggingPin(false),
  }

  // 출발지가 바뀌면 지도 좌표의 기준점도 바뀐다. 보고 있던 곳이 그대로 보이게 카메라 중심을 옮긴다
  const chooseStart = (spot: Spot) => {
    const viewing = focusLatLng()
    useGame.getState().setStart(spot)
    lookAt(viewing)
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.sceneWrap}>
            <RoadScene rig={rig} picker={picker} />
            <CameraGestures rig={rig} onLongPress={status === 'setup' ? pickAt : undefined} drag={status === 'setup' ? pinDrag : undefined} />
            {status === 'setup' && picked && <PinTooltip picker={picker} hidden={draggingPin} />}

            {status === 'setup' && <SearchBar near={focusLatLng} onSelect={pickPlace} />}
            {status === 'setup' && picked && (
              <PickCard
                spot={picked}
                onStart={() => chooseStart(picked)}
                onDestination={() => useGame.getState().setDestination(picked)}
                onClose={() => useGame.getState().setPicked(null)}
              />
            )}

            {status === 'starting' && (
              <View style={styles.center} pointerEvents="none">
                <ActivityIndicator size="large" />
                <Text style={styles.hint}>주변 길을 불러오는 중</Text>
              </View>
            )}

            <Pressable style={[styles.roundButton, styles.compass]} onPress={faceNorth}>
              <Text style={styles.compassText}>N</Text>
            </Pressable>
            <Pressable style={[styles.roundButton, styles.recenter]} onPress={() => (rig.following = true)}>
              <Text style={styles.recenterText}>◎</Text>
            </Pressable>
            <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
          </View>

          {inSetup ? <SetupPanel /> : <GamePanel />}
          <StatusBar style="dark" />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  sceneWrap: { flex: 1 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { color: '#374151', backgroundColor: 'rgba(255,255,255,0.85)', padding: 8, borderRadius: 8 },
  roundButton: { position: 'absolute', right: 10, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  compass: { top: 10 },
  compassText: { fontSize: 16, fontWeight: '700', color: '#dc2626' },
  recenter: { top: 60 },
  recenterText: { fontSize: 22, color: '#2563eb' },
  attribution: { position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: '#374151' },
})

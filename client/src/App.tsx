import { useCallback, useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import type { LatLng } from '@jikjwau/shared/types'
import { project, unproject } from '@jikjwau/shared/geo'
import { RoadScene } from './map/RoadScene'
import { CameraGestures } from './map/CameraGestures'
import { CAMERA_LIMITS, createCameraRig } from './map/cameraRig'
import { createScenePicker, hitsPin, pickGround } from './map/scenePicker'
import type { DragHandlers } from './map/CameraGestures'
import { useGame, type Spot } from './store/game'
import { SetupPanel } from './ui/SetupPanel'
import { Compass } from './ui/Compass'
import { GamePanel } from './ui/GamePanel'
import { LobbyPanel } from './ui/LobbyPanel'
import { PlaceSheet } from './ui/PlaceSheet'
import { PickCard } from './ui/PickCard'
import { PinTooltip } from './ui/PinTooltip'
import { LoadingScreen } from './ui/LoadingScreen'
import { MainMenu } from './ui/MainMenu'
import { RecordsScreen } from './ui/RecordsScreen'
import { ClosetScreen } from './ui/ClosetScreen'
import { EmoteBar } from './ui/EmoteBar'
import { EmoteBubbles } from './ui/EmoteBubbles'
import { RoundOverlay } from './ui/RoundOverlay'
import { GameMenu } from './ui/GameMenu'
import { ArrivalCelebration } from './ui/ArrivalCelebration'
import { setBgm } from './lib/sound'
import { useFonts } from 'expo-font'
import { FONT_FILES, FONT } from './ui/theme'

/** 출발지를 정했을 때 카메라 거리 */
const START_VIEW_DISTANCE_M = 350
const GAME_CAMERA = { distance: 160, pitch: 0.95 }

export default function App() {
  // 게임 글꼴(로고·버튼). 읽는 동안(아주 잠깐)은 하늘색 빈 화면
  const [fontsLoaded] = useFonts(FONT_FILES)
  const [rig] = useState(createCameraRig)
  const [picker] = useState(createScenePicker)
  const status = useGame((s) => s.status)
  const screen = useGame((s) => s.screen)
  const [booted, setBooted] = useState(false)
  const inGame = booted && screen === 'game'
  const playing = inGame && (status === 'playing' || status === 'ended')
  const picked = useGame((s) => s.picked)
  const [draggingPin, setDraggingPin] = useState(false)
  /** 핀을 잡은 곳과 핀이 꽂힌 곳의 차이 (잡은 채로 옮겨도 핀이 손가락 아래로 튀지 않게) */
  const grabOffset = useRef({ x: 0, y: 0 })

  // 로딩 화면이 init(저장된 신원, 서버 연결, 하던 방으로 돌아가기)을 마치면 메뉴로
  const onBooted = useCallback(() => {
    if (useGame.getState().screen === 'loading') useGame.getState().setScreen('menu')
    setBooted(true)
  }, [])

  // BGM은 메뉴·기록실에서만
  useEffect(() => {
    setBgm(booted && screen !== 'game' && screen !== 'loading')
  }, [booted, screen])

  // 게임에 들어갈 때마다 일행 가까이에서 시작한다
  useEffect(() => {
    if (screen !== 'game') return
    rig.distance = GAME_CAMERA.distance
    rig.pitch = GAME_CAMERA.pitch
    rig.following = true
  }, [screen, rig])

  // 게임을 시작하면(또는 대기실에 들어가면) 일행·출발지를 따라간다
  useEffect(() => {
    if (status === 'playing' || status === 'lobby') rig.following = true
  }, [status, rig])

  // 화면 중심(카메라가 바라보는 곳)의 위경도. 월드 (x, z) → 로컬 (x, -z)
  const focusLatLng = (): LatLng => unproject({ x: rig.focus.x, y: -rig.focus.z }, useGame.getState().start.latLng)

  // 가장 가까운 "북쪽이 위" 각도로 되돌린다 (여러 바퀴 돌렸어도 되감기지 않게)
  const lookAt = (latLng: LatLng) => {
    const p = project(latLng, useGame.getState().start.latLng)
    rig.following = false
    rig.focus.set(p.x, 0, -p.y)
  }

  const pickAt = (x: number, y: number) => {
    const p = pickGround(picker, x, y)
    if (!p) return
    useGame.getState().pickPoint(unproject(p, useGame.getState().start.latLng))
  }

  // 고르는 창에서 정하면: 출발지는 그 주변을, 목적지는 출발지와 함께 보이게
  const onPlaceChosen = (kind: 'start' | 'destination', spot: Spot) => {
    if (kind === 'start') {
      rig.following = true
      rig.distance = START_VIEW_DISTANCE_M
      return
    }
    const p = project(spot.latLng, useGame.getState().start.latLng)
    rig.following = false
    rig.focus.set(p.x / 2, 0, -p.y / 2)
    rig.distance = Math.min(Math.max(Math.hypot(p.x, p.y) * 1.3, START_VIEW_DISTANCE_M), CAMERA_LIMITS.distance.max)
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
      // 끄는 동안에는 위치만 옮기고, 놓으면 이름을 찾는다
      setPicked({ latLng: unproject(p, start.latLng), name: '근처 장소 이름을 찾는 중…', resolving: true })
    },
    end: () => {
      setDraggingPin(false)
      const { picked, pickPoint } = useGame.getState()
      if (picked) pickPoint(picked.latLng)
    },
  }

  // 출발지가 바뀌면 지도 좌표의 기준점도 바뀐다. 보고 있던 곳이 그대로 보이게 카메라 중심을 옮긴다
  const chooseStart = (spot: Spot) => {
    const viewing = focusLatLng()
    useGame.getState().setStart(spot)
    lookAt(viewing)
  }

  if (!fontsLoaded) return <View style={styles.fontWait} />

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
          {/* 지도 + 아래 패널. 결과 창·꽃종이는 둘 다 덮는다 */}
          <View style={styles.gameArea}>
            <View style={styles.sceneWrap}>
              {/* 3D 지도는 게임 화면에서만 그린다. 메뉴·기록실·옷장에서는 멈춰 두고 그 화면이 덮는다 */}
              <RoadScene rig={rig} picker={picker} active={inGame} />
              {inGame && (
                <CameraGestures rig={rig} onLongPress={status === 'setup' ? pickAt : undefined} drag={status === 'setup' ? pinDrag : undefined} />
              )}
              {inGame && status === 'setup' && picked && <PinTooltip picker={picker} hidden={draggingPin} />}

              {inGame && status === 'setup' && <PlaceSheet near={focusLatLng} onChosen={onPlaceChosen} />}
              {inGame && status === 'setup' && picked && (
                <PickCard
                  spot={picked}
                  onStart={() => chooseStart(picked)}
                  onDestination={() => useGame.getState().setDestination(picked)}
                  onClose={() => useGame.getState().setPicked(null)}
                />
              )}

              {/* 오른쪽 위 버튼들. 게임 중이면 맨 위에 메뉴 */}
              {inGame && (
                <>
                  <Compass rig={rig} top={playing ? 60 : 10} />
                  <Pressable style={[styles.roundButton, { top: playing ? 110 : 60 }]} onPress={() => (rig.following = true)}>
                    <Text style={styles.recenterText}>◎</Text>
                  </Pressable>
                </>
              )}
              {playing && (
                <>
                  <EmoteBubbles picker={picker} />
                  <EmoteBar top={160} />
                  <GameMenu top={10} />
                </>
              )}
              {/* 준비·게임 패널은 둥근 모서리만큼 지도 위로 올라오니 그만큼 비켜 둔다. 고르기 카드가 뜨면 그 카드가 덮으니 숨긴다 */}
              {!(inGame && status === 'setup' && picked) && (
                <Text style={[styles.attribution, inGame && status !== 'lobby' && styles.attributionRaised]}>© OpenStreetMap contributors</Text>
              )}
              {booted && screen === 'menu' && <MainMenu />}
            </View>

            {inGame && (status === 'setup' ? <SetupPanel /> : status === 'lobby' ? <LobbyPanel /> : <GamePanel />)}
            {playing && <RoundOverlay />}
            {playing && <ArrivalCelebration rig={rig} />}
          </View>
          {booted && screen === 'records' && <RecordsScreen />}
          {booted && screen === 'closet' && <ClosetScreen />}
          {/* 로딩 화면은 자기 상태바를 쓴다. 메뉴는 파란 하늘 그림 위라 흰 글자 */}
          <StatusBar style={screen === 'menu' ? 'light' : 'dark'} />
        </SafeAreaView>
        {!booted && <LoadingScreen onDone={onBooted} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  fontWait: { flex: 1, backgroundColor: '#7cc4f5' },
  gameArea: { flex: 1 },
  sceneWrap: { flex: 1 },
  roundButton: { position: 'absolute', right: 10, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  recenterText: { fontFamily: FONT.body, fontSize: 22, color: '#2563eb' },
  attributionRaised: { bottom: 30 },
  attribution: { fontFamily: FONT.body, position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: '#374151' },
})

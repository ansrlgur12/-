import { useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Canvas, useFrame } from '@react-three/fiber/native'
import type { Group } from 'three'
import type { EmoteId, Outfit, OutfitSlot, ShopItem } from '@jikjwau/shared/types'
import { DEFAULT_OUTFIT, EMOTE_SHOW_MS, OUTFIT_SLOTS, SHOP_ITEMS } from '@jikjwau/shared/config'
import { Person, type PersonHandle } from '../map/Person'
import { useGame } from '../store/game'
import { useProfile } from '../store/profile'
import { playEffect } from '../lib/sound'
import { Icon } from './Icon'
import { GameButton } from './GameButton'
import { BORDER, FONT, INK, LIP } from './theme'
import { ScreenBackdrop, ScreenHeader } from './ScreenBackdrop'
import { ItemIcon } from './ItemIcon'

/** 미리보기 회전: 저절로 한 바퀴씩 돌고, 손가락으로 끌면 그만큼 돌린다 (뒷모습도 보이게) */
interface Spin {
  angle: number
  dragging: boolean
  /** 손을 뗀 시각. 잠깐 멈췄다가 다시 저절로 돈다 */
  releasedAt: number
}
/** 저절로 도는 빠르기 (라디안/초) */
const AUTO_SPIN = 0.7
/** 손을 떼고 다시 돌기 시작할 때까지 */
const RESUME_MS = 1500
/** 끈 거리(px)당 회전 */
const DRAG_SPIN = 0.012

/** 돌면서 숨 쉬는 미리보기 캐릭터. 새 옷을 사면 기뻐한다 */
function Preview({ outfit, cheerAt, spin }: { outfit: Outfit; cheerAt: number; spin: Spin }) {
  const turn = useRef<Group>(null)
  const person = useRef<PersonHandle>(null)
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    if (!spin.dragging && Date.now() - spin.releasedAt > RESUME_MS) spin.angle += AUTO_SPIN * delta
    if (turn.current) turn.current.rotation.y = Math.PI + spin.angle
    const since = Date.now() - cheerAt
    const act = since < EMOTE_SHOW_MS ? { emote: 'cheer' as EmoteId, t: since / 1000 } : undefined
    person.current?.pose(t.current * 2, 0, act)
  })
  return (
    <group ref={turn} position={[0, -3.6, 0]}>
      <Person ref={person} outfit={outfit} />
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.2, 32]} />
        <meshLambertMaterial color="#cbd5e1" />
      </mesh>
    </group>
  )
}

/** 옷장: 부위별로 입어 보고, 없는 옷은 코인으로 산다 */
export function ClosetScreen() {
  const profile = useProfile((s) => s.profile)
  const busy = useProfile((s) => s.busy)
  const error = useProfile((s) => s.error)
  const [slot, setSlot] = useState<OutfitSlot>('hat')
  const [trying, setTrying] = useState<Outfit>(profile?.outfit ?? DEFAULT_OUTFIT)
  const [cheerAt, setCheerAt] = useState(0)
  const [spin] = useState<Spin>(() => ({ angle: 0, dragging: false, releasedAt: 0 }))
  // 미리보기를 좌우로 끌면 캐릭터가 돈다
  const dragToSpin = useMemo(() => {
    let lastX = 0
    const release = () => {
      spin.dragging = false
      spin.releasedAt = Date.now()
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
      onPanResponderGrant: () => {
        spin.dragging = true
        lastX = 0
      },
      onPanResponderMove: (_, g) => {
        spin.angle += (g.dx - lastX) * DRAG_SPIN
        lastX = g.dx
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    })
  }, [spin])

  useEffect(() => {
    useProfile.getState().refresh()
  }, [])
  // 서버에서 받은 옷으로 처음 맞춘다
  const synced = useRef(false)
  useEffect(() => {
    if (profile && !synced.current) {
      synced.current = true
      setTrying(profile.outfit)
    }
  }, [profile])

  const owned = new Set(profile?.owned ?? [])
  const items = SHOP_ITEMS.filter((i) => i.slot === slot)
  const selected = SHOP_ITEMS.find((i) => i.id === trying[slot])!
  const selectedOwned = owned.has(selected.id)
  // 입어 본 것 중 가지고 있는 것만 실제로 입는다
  const wearable = (o: Outfit): Outfit => {
    const base = profile?.outfit ?? DEFAULT_OUTFIT
    return Object.fromEntries(OUTFIT_SLOTS.map(({ slot: s }) => [s, owned.has(o[s]) ? o[s] : base[s]])) as Outfit
  }

  const pick = (item: ShopItem) => {
    playEffect('tap')
    const next = { ...trying, [item.slot]: item.id }
    setTrying(next)
    if (owned.has(item.id)) useProfile.getState().equip(wearable(next))
  }

  const buy = async () => {
    if (!(await useProfile.getState().buy(selected.id))) return
    playEffect('win')
    setCheerAt(Date.now())
    await useProfile.getState().equip({ ...wearable(trying), [selected.slot]: selected.id })
  }

  const back = () => {
    playEffect('tap')
    useGame.getState().setScreen('menu')
  }

  return (
    // 화면을 통째로 덮으므로 노치·홈 바 영역은 직접 피한다 (바깥 SafeAreaView의 여백은 absolute 자식에 안 먹는다)
    <SafeAreaView style={[StyleSheet.absoluteFill, styles.root]} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenBackdrop />
      <ScreenHeader
        title="옷장"
        onBack={back}
        right={
          <View style={styles.coins}>
            <Icon name="coin" size={22} />
            <Text style={styles.coinText}>{profile?.coins ?? '…'}</Text>
          </View>
        }
      />

      <View style={styles.preview} {...dragToSpin.panHandlers}>
        <Canvas camera={{ position: [0, 1.2, 15], fov: 40 }}>
          <ambientLight intensity={0.85} />
          <directionalLight position={[5, 10, 8]} intensity={1.4} />
          <Preview outfit={trying} cheerAt={cheerAt} spin={spin} />
        </Canvas>
        <View style={styles.itemName} pointerEvents="none">
          <Text style={styles.itemNameText}>{selected.name}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {OUTFIT_SLOTS.map((s) => (
          <Pressable key={s.slot} style={[styles.tab, slot === s.slot && styles.tabOn]} onPress={() => setSlot(s.slot)}>
            <Text style={[styles.tabText, slot === s.slot && styles.tabTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {items.map((item) => {
          const on = trying[slot] === item.id
          const have = owned.has(item.id)
          return (
            <Pressable key={item.id} style={[styles.cell, on && styles.cellOn]} onPress={() => pick(item)}>
              <ItemIcon item={item} size={52} />
              <Text style={styles.cellName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.cellPrice, have && styles.cellHave]}>{have ? (profile?.outfit[slot] === item.id ? '입는 중' : '보유') : <><Icon name="coin" size={14} /> {item.price}</>}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.error}>{error}</Text>}
        {selectedOwned && <Text style={styles.hint}>가지고 있는 옷은 누르면 바로 입어요. 다른 사람에게도 이 모습으로 보여요.</Text>}
        {/* 한 손으로 닿게 아래에도 나가는 버튼을 둔다 */}
        <View style={styles.footerRow}>
          <GameButton style={styles.footerButton} label={selectedOwned ? '다 입었어요' : '나가기'} color="white" size="md" onPress={back} />
          {!selectedOwned && (
            <GameButton
              style={styles.footerButton}
              label={(profile?.coins ?? 0) < selected.price ? `코인이 모자라요 (${selected.price})` : `${selected.price}에 사서 입기`}
              color="yellow"
              size="md"
              icon={<Icon name="coin" size={24} />}
              disabled={busy || (profile?.coins ?? 0) < selected.price}
              onPress={buy}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  footerButton: { flex: 1 },
  root: { backgroundColor: '#3a8fe8' },
  coinText: { fontFamily: FONT.body, color: '#fff', fontSize: 17 },
  coins: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(27,37,89,0.85)', borderRadius: 999, borderWidth: BORDER, borderColor: INK, paddingHorizontal: 8, height: 40 },
  preview: { height: 250, marginHorizontal: 16, borderRadius: 24, backgroundColor: '#cfe9ff', borderWidth: BORDER, borderColor: INK, overflow: 'hidden' },
  itemName: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
  itemNameText: { fontFamily: FONT.body, fontSize: 16, backgroundColor: INK, color: '#fff', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, borderWidth: BORDER, borderColor: INK, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 12 },
  tabOn: { backgroundColor: '#4f8dff' },
  tabText: { fontFamily: FONT.button, fontSize: 16, color: '#5b6593' },
  tabTextOn: { fontFamily: FONT.button, fontSize: 16, color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  cell: { width: '30%', flexGrow: 1, maxWidth: '32%', backgroundColor: '#fff', borderRadius: 16, borderWidth: BORDER, borderColor: INK, borderBottomWidth: LIP, padding: 10, alignItems: 'center', gap: 4 },
  cellOn: { backgroundColor: '#fff3c4' },
  cellName: { fontFamily: FONT.body, color: INK, fontSize: 14 },
  cellPrice: { fontFamily: FONT.body, color: '#a16207', fontSize: 12 },
  cellHave: { color: '#16a34a' },
  footer: { padding: 16, paddingTop: 4, gap: 8 },
  footerRow: { flexDirection: 'row', gap: 10 },
  hint: { fontFamily: FONT.body, color: '#fff', textAlign: 'center', fontSize: 13, textShadowColor: INK, textShadowRadius: 4 },
  error: { color: '#dc2626', textAlign: 'center' },
})

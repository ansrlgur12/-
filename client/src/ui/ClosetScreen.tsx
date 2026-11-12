import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
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

/** 천천히 돌면서 숨 쉬는 미리보기 캐릭터. 새 옷을 사면 기뻐한다 */
function Preview({ outfit, cheerAt }: { outfit: Outfit; cheerAt: number }) {
  const turn = useRef<Group>(null)
  const person = useRef<PersonHandle>(null)
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += delta
    if (turn.current) turn.current.rotation.y = Math.PI + Math.sin(t.current * 0.6) * 0.7
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

function Swatch({ item }: { item: ShopItem }) {
  if (item.style === 'none') return <Text style={styles.none}>－</Text>
  return (
    <View style={[styles.swatch, { backgroundColor: item.color }]}>
      {item.accent && <View style={[styles.swatchDot, { backgroundColor: item.accent }]} />}
    </View>
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
      <View style={styles.header}>
        <Pressable onPress={back} hitSlop={16}>
          <Text style={styles.back}>← 메뉴</Text>
        </Pressable>
        <Text style={styles.title}>옷장</Text>
        <Text style={styles.coins}><Icon name="coin" size={18} /> {profile?.coins ?? '…'}</Text>
      </View>

      <View style={styles.preview}>
        <Canvas camera={{ position: [0, 1.2, 15], fov: 40 }}>
          <ambientLight intensity={0.85} />
          <directionalLight position={[5, 10, 8]} intensity={1.4} />
          <Preview outfit={trying} cheerAt={cheerAt} />
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
              <Swatch item={item} />
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
          <Pressable style={[styles.done, selectedOwned && styles.doneWide]} onPress={back}>
            <Text style={styles.doneText}>{selectedOwned ? '다 입었어요' : '나가기'}</Text>
          </Pressable>
          {!selectedOwned && (
            <Pressable
              style={[styles.buy, (busy || (profile?.coins ?? 0) < selected.price) && styles.disabled]}
              disabled={busy || (profile?.coins ?? 0) < selected.price}
              onPress={buy}
            >
              <Text style={styles.buyText}>
                {(profile?.coins ?? 0) < selected.price ? <>코인이 모자라요 (<Icon name="coin" size={16} /> {selected.price})</> : <><Icon name="coin" size={16} /> {selected.price}에 사서 입기</>}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: '#2563eb', fontWeight: '700', width: 70 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  coins: { width: 70, textAlign: 'right', fontWeight: '800', color: '#a16207' },
  preview: { height: 260, marginHorizontal: 16, borderRadius: 20, backgroundColor: '#e0f2fe', overflow: 'hidden' },
  itemName: { position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' },
  itemNameText: { backgroundColor: 'rgba(15,23,42,0.75)', color: '#fff', fontWeight: '700', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, backgroundColor: '#e5e7eb', borderRadius: 12, padding: 3 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: '#6b7280', fontWeight: '600' },
  tabTextOn: { color: '#111827', fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  cell: { width: '30%', flexGrow: 1, maxWidth: '32%', backgroundColor: '#fff', borderRadius: 14, borderWidth: 2, borderColor: '#e5e7eb', padding: 10, alignItems: 'center', gap: 4 },
  cellOn: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', alignItems: 'flex-end', justifyContent: 'flex-end' },
  swatchDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  none: { fontSize: 26, color: '#9ca3af', height: 40, lineHeight: 40 },
  cellName: { fontWeight: '700', color: '#111827', fontSize: 13 },
  cellPrice: { color: '#a16207', fontWeight: '700', fontSize: 12 },
  cellHave: { color: '#16a34a' },
  footer: { padding: 16, paddingTop: 4, gap: 8 },
  footerRow: { flexDirection: 'row', gap: 10 },
  done: { backgroundColor: '#e5e7eb', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  doneWide: { flex: 1, backgroundColor: '#2563eb' },
  doneText: { color: '#111827', fontWeight: '800', fontSize: 16 },
  buy: { flex: 1, backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buyText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },
  hint: { color: '#6b7280', textAlign: 'center', fontSize: 12 },
  error: { color: '#dc2626', textAlign: 'center' },
})

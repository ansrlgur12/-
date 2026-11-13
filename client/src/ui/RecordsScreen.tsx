import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import type { PlayRecord, PlayRecordSummary, WorldRecordSort } from '@jikjwau/shared/types'
import { fetchMyRecords, fetchRecord, fetchWorldRecords } from '../api/records'
import { useGame } from '../store/game'
import { playEffect } from '../lib/sound'
import { formatDay, formatDistance, formatDuration, rulesLabel } from './labels'
import { TrailMap } from './TrailMap'
import { Icon } from './Icon'
import { GameButton } from './GameButton'
import { BORDER, FONT, INK, LIP } from './theme'
import { ScreenBackdrop, ScreenHeader } from './ScreenBackdrop'

type Tab = 'mine' | 'world'

const SORTS: Array<{ sort: WorldRecordSort; label: string; hint: string }> = [
  { sort: 'distance', label: '총 이동 거리', hint: '짧은 순' },
  { sort: 'straight', label: '출발-목적지 거리', hint: '먼 순' },
  { sort: 'rps', label: '가위바위보 횟수', hint: '적은 순' },
]

/** 한국 시간 오늘 */
function today() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

function shiftDay(day: string, by: number) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const reload = useCallback(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    load()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((err: Error) => alive && setState({ error: err.message, loading: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(reload, [reload])
  return { ...state, reload }
}

function ResultBadge({ r }: { r: PlayRecordSummary }) {
  return r.arrived ? (
    <Text style={[styles.badge, styles.badgeArrived]}>도착</Text>
  ) : (
    <Text style={[styles.badge, styles.badgeLeft]}>{formatDistance(r.remainingM)} 남음</Text>
  )
}

function MyRow({ r, onPress }: { r: PlayRecordSummary; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowHead}>
        <Text style={[styles.mode, r.rules.mode === 'hardcore' && styles.modeHard]}>{rulesLabel(r.rules)}</Text>
        <Text style={styles.meta}>
          {formatDay(r.day)} · {r.solo ? '혼자' : `${r.players.length}명`}
        </Text>
        <ResultBadge r={r} />
      </View>
      <Text style={styles.course} numberOfLines={1}>
        {r.start.name} → {r.destination.name}
      </Text>
      <Text style={styles.meta}>
        <Icon name="walking" size={13} /> {formatDistance(r.distanceM)} · <Icon name="rock" size={13} /> {r.rpsCount}회 · <Icon name="stopwatch" size={13} />{' '}
        {formatDuration(r.elapsedMs)} · 직선 {formatDistance(r.straightM)}
      </Text>
    </Pressable>
  )
}

function mainValue(r: PlayRecordSummary, sort: WorldRecordSort) {
  if (sort === 'distance') return formatDistance(r.distanceM)
  if (sort === 'straight') return formatDistance(r.straightM)
  return `${r.rpsCount}회`
}

function WorldRow({ r, rank, sort, onPress }: { r: PlayRecordSummary; rank: number; sort: WorldRecordSort; onPress: () => void }) {
  return (
    <Pressable style={[styles.row, styles.worldRow]} onPress={onPress}>
      {rank <= 3 ? (
        <View style={styles.rankMedal}>
          <Icon name={(['medal1', 'medal2', 'medal3'] as const)[rank - 1]} size={30} />
        </View>
      ) : (
        <Text style={styles.rank}>{rank}</Text>
      )}
      <View style={styles.worldBody}>
        <Text style={styles.names} numberOfLines={1}>
          {r.players.join(' · ')}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {r.start.name} → {r.destination.name}
        </Text>
        <Text style={styles.meta}>
          <Icon name="walking" size={13} /> {formatDistance(r.distanceM)} · 직선 {formatDistance(r.straightM)} · <Icon name="rock" size={13} /> {r.rpsCount}회 ·{' '}
          <Icon name="stopwatch" size={13} /> {formatDuration(r.elapsedMs)}
        </Text>
      </View>
      <Text style={styles.value}>{mainValue(r, sort)}</Text>
    </Pressable>
  )
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { width } = useWindowDimensions()
  const { data, error, loading } = useLoad<PlayRecord>(() => fetchRecord(id), [id])
  const mapSize = Math.min(width - 32, 420)

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {/* Modal은 앱의 SafeAreaProvider 밖이라 안에 따로 둬야 노치·홈 바를 피한다 */}
      <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <ScreenBackdrop />
        <ScreenHeader title="기록" back="목록" onBack={onClose} />
        {loading && <ActivityIndicator style={styles.loading} />}
        {error && <Text style={styles.error}>{error}</Text>}
        {data && (
          <ScrollView contentContainerStyle={styles.detail}>
            {/* 머리 카드: 위 줄은 규칙과 결과, 아래는 출발 → 도착 */}
            <View style={styles.headCard}>
              <View style={styles.headRow}>
                <Text style={[styles.mode, styles.modePill, data.rules.mode === 'hardcore' && styles.modeHard]}>{rulesLabel(data.rules)}</Text>
                <View style={[styles.resultPill, data.arrived ? styles.resultOk : styles.resultFail]}>
                  <Icon name={data.arrived ? 'party' : 'crying'} size={20} />
                  <Text style={[styles.resultText, data.arrived ? styles.ok : styles.warn]}>
                    {data.arrived ? '도착 성공' : `실패 · ${formatDistance(data.remainingM)} 남음`}
                  </Text>
                </View>
              </View>
              <Text style={styles.detailTitle}>
                {data.start.name} <Text style={styles.arrow}>→</Text> {data.destination.name}
              </Text>
            </View>
            <TrailMap trail={data.trail} target={data.target} origin={data.start.latLng} arrived={data.arrived} width={mapSize} height={mapSize} />
            <Text style={styles.legend}>
              <Text style={{ color: '#16a34a' }}>●</Text> 출발 <Text style={{ color: '#e11d48' }}>●</Text> 목적지{' '}
              <Text style={{ color: '#f97316' }}>●</Text> 일행
            </Text>
            <View style={styles.grid}>
              {[
                ['총 이동 거리', formatDistance(data.distanceM)],
                ['출발-목적지 직선', formatDistance(data.straightM)],
                ['가위바위보', `${data.rpsCount}회`],
                ['걸린 시간', formatDuration(data.elapsedMs)],
                ['함께한 사람', data.players.join(', ')],
                ['날짜', formatDay(data.day)],
              ].map(([k, v]) => (
                <View key={k} style={styles.cell}>
                  <Text style={styles.cellKey}>{k}</Text>
                  <Text style={styles.cellValue}>{v}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        {/* 위쪽 버튼은 손이 잘 안 닿으니 아래에도 */}
        <GameButton style={styles.bottomBack} label="목록으로" color="white" size="md" onPress={onClose} />
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

function MyRecords({ onOpen }: { onOpen: (id: string) => void }) {
  const playerId = useGame((s) => s.playerId)
  const { data, error, loading, reload } = useLoad(() => (playerId ? fetchMyRecords(playerId) : Promise.resolve({ records: [] })), [playerId])
  return (
    <FlatList
      data={data?.records ?? []}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      onRefresh={reload}
      refreshing={loading}
      ListEmptyComponent={
        loading ? undefined : <Text style={styles.empty}>{error ?? '아직 기록이 없어요.\n일반이나 하드코어로 한 판 끝내면 여기에 남아요.'}</Text>
      }
      renderItem={({ item }) => <MyRow r={item} onPress={() => onOpen(item.id)} />}
    />
  )
}

function WorldRecords({ onOpen }: { onOpen: (id: string) => void }) {
  const [day, setDay] = useState(today)
  const [sort, setSort] = useState<WorldRecordSort>('distance')
  const { data, error, loading, reload } = useLoad(() => fetchWorldRecords(sort, day), [sort, day])
  const isToday = day >= today()

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.dayRow}>
        <Pressable hitSlop={12} onPress={() => setDay((d) => shiftDay(d, -1))}>
          <Text style={styles.dayArrow}>‹</Text>
        </Pressable>
        <Text style={styles.day}>
          {formatDay(day)}
          {isToday ? ' (오늘)' : ''}
        </Text>
        <Pressable hitSlop={12} disabled={isToday} onPress={() => setDay((d) => shiftDay(d, 1))}>
          <Text style={[styles.dayArrow, isToday && styles.disabledText]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.sorts}>
        {SORTS.map((s) => (
          <Pressable key={s.sort} style={[styles.sort, sort === s.sort && styles.sortOn]} onPress={() => setSort(s.sort)}>
            <Text style={[styles.sortText, sort === s.sort && styles.sortTextOn]}>{s.label}</Text>
            <Text style={[styles.sortHint, sort === s.sort && styles.sortTextOn]}>{s.hint}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={data?.records ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        onRefresh={reload}
        refreshing={loading}
        ListHeaderComponent={<Text style={styles.worldHint}>하드코어로 그날 목적지에 도착한 사람들</Text>}
        ListEmptyComponent={loading ? undefined : <Text style={styles.empty}>{error ?? '이날 하드코어로 도착한 사람이 아직 없어요.\n첫 번째가 되어 보세요!'}</Text>}
        renderItem={({ item, index }) => <WorldRow r={item} rank={index + 1} sort={sort} onPress={() => onOpen(item.id)} />}
      />
    </View>
  )
}

/** 기록실: 내 기록 / 월드레코드 */
export function RecordsScreen() {
  const [tab, setTab] = useState<Tab>('mine')
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SafeAreaView style={[StyleSheet.absoluteFill, styles.root]} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenBackdrop />
      <ScreenHeader title="기록실" onBack={() => (playEffect('tap'), useGame.getState().setScreen('menu'))} />
      <View style={styles.tabs}>
        {(['mine', 'world'] as Tab[]).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'mine' ? '내 기록' : <><Icon name="trophy" size={15} /> 월드레코드</>}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'mine' ? <MyRecords onOpen={setOpen} /> : <WorldRecords onOpen={setOpen} />}
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3a8fe8' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, borderWidth: BORDER, borderColor: INK, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  tabOn: { backgroundColor: '#4f8dff' },
  tabText: { fontFamily: FONT.button, fontSize: 16, color: '#5b6593' },
  tabTextOn: { color: '#fff' },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  row: { backgroundColor: '#fff', borderRadius: 18, borderWidth: BORDER, borderColor: INK, borderBottomWidth: LIP, padding: 12, gap: 4 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mode: { fontFamily: FONT.body, backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  modeHard: { backgroundColor: '#1f2937', color: '#fca5a5' },
  meta: { fontFamily: FONT.body, color: '#64748b', fontSize: 12, flexShrink: 1 },
  badge: { fontFamily: FONT.body, marginLeft: 'auto', fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  badgeArrived: { backgroundColor: '#dcfce7', color: '#15803d' },
  badgeLeft: { backgroundColor: '#fef3c7', color: '#b45309' },
  course: { fontFamily: FONT.body, color: INK, fontSize: 17 },
  empty: { fontFamily: FONT.body, fontSize: 16, textAlign: 'center', color: '#fff', marginTop: 60, lineHeight: 24, textShadowColor: INK, textShadowRadius: 4 },
  error: { textAlign: 'center', color: '#dc2626', margin: 20 },
  loading: { marginTop: 40 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 14 },
  dayArrow: { fontFamily: FONT.body, fontSize: 32, color: '#fff', paddingHorizontal: 8, textShadowColor: INK, textShadowRadius: 4 },
  disabledText: { color: '#cbd5e1' },
  day: { fontFamily: FONT.body, fontSize: 19, color: '#fff', minWidth: 130, textAlign: 'center', textShadowColor: INK, textShadowRadius: 4 },
  sorts: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 10 },
  sort: { flex: 1, borderRadius: 14, borderWidth: BORDER, borderColor: INK, paddingVertical: 7, alignItems: 'center', backgroundColor: '#fff' },
  sortOn: { borderColor: INK, backgroundColor: '#4f8dff' },
  sortText: { fontFamily: FONT.body, fontSize: 12, color: '#334155' },
  sortHint: { fontFamily: FONT.body, fontSize: 10, color: '#94a3b8' },
  sortTextOn: { color: '#fff' },
  worldHint: { fontFamily: FONT.body, color: '#fff', fontSize: 13, textAlign: 'center', textShadowColor: INK, textShadowRadius: 4 },
  worldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { fontFamily: FONT.body, width: 32, textAlign: 'center', fontSize: 16, color: '#64748b' },
  rankMedal: { width: 32, alignItems: 'center' },
  worldBody: { flex: 1, gap: 2 },
  names: { fontFamily: FONT.body, color: INK, fontSize: 17 },
  value: { fontFamily: FONT.body, fontSize: 16, color: '#e11d48' },
  detail: { padding: 16, gap: 10, alignItems: 'center' },
  bottomBack: { marginHorizontal: 16, marginBottom: 8 },
  modePill: { fontFamily: FONT.button, fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  headCard: { alignSelf: 'stretch', backgroundColor: '#ffffff', borderRadius: 20, borderWidth: BORDER, borderBottomWidth: LIP, borderColor: INK, padding: 12, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultPill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, borderRadius: 16, borderWidth: BORDER, paddingHorizontal: 12 },
  resultOk: { backgroundColor: '#e4f6ea', borderColor: '#4fbd7c' },
  resultFail: { backgroundColor: '#fdeceb', borderColor: '#ec7b75' },
  resultText: { fontFamily: FONT.button, fontSize: 14 },
  detailTitle: { fontFamily: FONT.button, fontSize: 19, lineHeight: 26, color: INK },
  arrow: { color: '#6b9cf0' },
  ok: { color: '#2f8a55' },
  warn: { color: '#c85651' },
  legend: { fontFamily: FONT.body, color: '#fff', fontSize: 13, textShadowColor: INK, textShadowRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' },
  cell: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: BORDER, borderColor: INK, padding: 10 },
  cellKey: { fontFamily: FONT.body, color: '#64748b', fontSize: 12 },
  cellValue: { fontFamily: FONT.button, color: INK, fontSize: 16, marginTop: 2 },
})

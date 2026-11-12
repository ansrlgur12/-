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
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.back}>← 목록</Text>
          </Pressable>
          <Text style={styles.headerTitle}>기록</Text>
          <View style={{ width: 50 }} />
        </View>
        {loading && <ActivityIndicator style={styles.loading} />}
        {error && <Text style={styles.error}>{error}</Text>}
        {data && (
          <ScrollView contentContainerStyle={styles.detail}>
            <Text style={[styles.mode, data.rules.mode === 'hardcore' && styles.modeHard, { alignSelf: 'flex-start' }]}>{rulesLabel(data.rules)}</Text>
            <Text style={styles.detailTitle}>
              {data.start.name} → {data.destination.name}
            </Text>
            <Text style={[styles.detailResult, data.arrived ? styles.ok : styles.warn]}>
              {data.arrived ? (
                <>
                  <Icon name="party" size={20} /> 도착했어요!
                </>
              ) : (
                `목적지까지 ${formatDistance(data.remainingM)} 남기고 끝났어요`
              )}
            </Text>
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
        <Pressable style={styles.bottomBack} onPress={onClose}>
          <Text style={styles.bottomBackText}>목록으로</Text>
        </Pressable>
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
      <View style={styles.header}>
        <Pressable onPress={() => (playEffect('tap'), useGame.getState().setScreen('menu'))} hitSlop={16}>
          <Text style={styles.back}>← 메뉴</Text>
        </Pressable>
        <Text style={styles.headerTitle}>기록실</Text>
        <View style={{ width: 50 }} />
      </View>
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
  root: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { color: '#2563eb', fontWeight: '700', width: 60 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#e2e8f0', borderRadius: 12, padding: 3 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: '#64748b', fontWeight: '700' },
  tabTextOn: { color: '#0f172a' },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  row: { backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mode: { backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  modeHard: { backgroundColor: '#1f2937', color: '#fca5a5' },
  meta: { color: '#64748b', fontSize: 12, flexShrink: 1 },
  badge: { marginLeft: 'auto', fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  badgeArrived: { backgroundColor: '#dcfce7', color: '#15803d' },
  badgeLeft: { backgroundColor: '#fef3c7', color: '#b45309' },
  course: { fontWeight: '700', color: '#0f172a', fontSize: 15 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 60, lineHeight: 22 },
  error: { textAlign: 'center', color: '#dc2626', margin: 20 },
  loading: { marginTop: 40 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: 14 },
  dayArrow: { fontSize: 28, color: '#0f172a', paddingHorizontal: 8 },
  disabledText: { color: '#cbd5e1' },
  day: { fontSize: 17, fontWeight: '800', color: '#0f172a', minWidth: 130, textAlign: 'center' },
  sorts: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 10 },
  sort: { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#cbd5e1', paddingVertical: 7, alignItems: 'center', backgroundColor: '#fff' },
  sortOn: { borderColor: '#0f172a', backgroundColor: '#0f172a' },
  sortText: { fontWeight: '700', fontSize: 12, color: '#334155' },
  sortHint: { fontSize: 10, color: '#94a3b8' },
  sortTextOn: { color: '#fff' },
  worldHint: { color: '#94a3b8', fontSize: 12, textAlign: 'center' },
  worldRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 32, textAlign: 'center', fontSize: 16, fontWeight: '800', color: '#64748b' },
  rankMedal: { width: 32, alignItems: 'center' },
  worldBody: { flex: 1, gap: 2 },
  names: { fontWeight: '800', color: '#0f172a', fontSize: 15 },
  value: { fontWeight: '900', fontSize: 16, color: '#e11d48' },
  detail: { padding: 16, gap: 10, alignItems: 'center' },
  bottomBack: { marginHorizontal: 16, marginBottom: 8, height: 50, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  bottomBackText: { fontSize: 16, fontWeight: '800', color: '#334155' },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', alignSelf: 'flex-start' },
  detailResult: { fontSize: 15, fontWeight: '700', alignSelf: 'flex-start' },
  ok: { color: '#15803d' },
  warn: { color: '#b45309' },
  legend: { color: '#64748b', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' },
  cell: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10 },
  cellKey: { color: '#64748b', fontSize: 12 },
  cellValue: { color: '#0f172a', fontWeight: '800', fontSize: 15, marginTop: 2 },
})

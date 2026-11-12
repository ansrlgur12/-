import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, G, Path, Polyline } from 'react-native-svg'
import type { LatLng, Point } from '@jikjwau/shared/types'
import { parseTileKey, tileFlatToLocal, tileKey, tileRowCol, unproject } from '@jikjwau/shared/geo'
import { fetchRoadTile, fetchSceneryTile } from '../api/map'
import { classify, type RoadClass } from '../map/RoadMesh'
import { Icon } from './Icon'

interface Props {
  trail: Point[]
  target: Point
  /** 출발지 (trail·target 좌표의 기준점) */
  origin: LatLng
  width: number
  height: number
  /** 도착했으면 다시보기 끝에 목적지가 번쩍 */
  arrived: boolean
}

/** 지도 색 (보통 지도 앱처럼: 연한 땅, 흰 길, 큰 길은 노랑, 파란 물) */
const MAP = {
  land: '#f2efe9',
  water: '#a9d3f5',
  building: '#e3ddd3',
  roadEdge: '#d6d0c4',
  road: { major: '#ffe69a', minor: '#ffffff', path: '#ffffff' } as Record<RoadClass, string>,
  roadWidth: { major: 6, minor: 3.5, path: 1.6 } as Record<RoadClass, number>,
}
/** 이보다 많은 타일이 걸리면 건물은 빼고, 그보다 더 많으면 지도를 그리지 않는다 (너무 넓은 판) */
const BUILDING_TILE_MAX = 12
const MAP_TILE_MAX = 80
/** 다시보기 속도: 이 시간 안팎으로 끝까지 */
const REPLAY_MIN_MS = 3500
const REPLAY_MAX_MS = 9000
const REPLAY_M_PER_S = 150

interface View2D {
  sx: (x: number) => number
  sy: (y: number) => number
  /** 화면 1px당 미터 */
  mPerPx: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** 길·물·건물을 SVG 경로로. 한 번 받아 두고 다시보기 동안 다시 그리지 않는다 */
interface MapPaths {
  water: string
  waterways: Array<[number, string]>
  buildings: string
  roads: Record<RoadClass, string>
}

const pt = (v: View2D, x: number, y: number) => `${v.sx(x).toFixed(1)},${v.sy(y).toFixed(1)}`

async function loadMap(origin: LatLng, v: View2D): Promise<MapPaths | null> {
  const sw = unproject({ x: v.minX, y: v.minY }, origin)
  const ne = unproject({ x: v.maxX, y: v.maxY }, origin)
  const [r0, c0] = tileRowCol(sw.lat, sw.lng)
  const [r1, c1] = tileRowCol(ne.lat, ne.lng)
  const keys: string[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) keys.push(tileKey(r, c))
  if (keys.length > MAP_TILE_MAX) return null
  const withBuildings = keys.length <= BUILDING_TILE_MAX

  const tiles = await Promise.all(
    keys.map(async (key) => {
      const [roads, scenery] = await Promise.all([fetchRoadTile(key).catch(() => null), fetchSceneryTile(key).catch(() => null)])
      return { key, roads, scenery }
    }),
  )

  const roads: Record<RoadClass, string[]> = { major: [], minor: [], path: [] }
  const water: string[] = []
  const seenWater = new Set<number>()
  const waterways: Array<[number, string]> = []
  const buildings: string[] = []
  const ring = (flat: number[]) => {
    let d = ''
    for (let i = 0; i + 1 < flat.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${pt(v, flat[i], flat[i + 1])}`
    return d + 'Z'
  }
  // 화면 밖으로 크게 벗어난 것은 뺀다
  const margin = 40 * v.mPerPx
  const visible = (x: number, y: number) => x > v.minX - margin && x < v.maxX + margin && y > v.minY - margin && y < v.maxY + margin

  for (const { key, roads: rt, scenery } of tiles) {
    const [row, col] = parseTileKey(key)
    const local = (flat: number[]) => tileFlatToLocal(flat, row, col, origin)
    if (rt) {
      const xy: number[] = []
      for (let k = 0; k < rt.nodes.length; k += 3) xy.push(rt.nodes[k + 1], rt.nodes[k + 2])
      const p = local(xy)
      const at = new Map<number, [number, number]>()
      for (let k = 0, j = 0; k < rt.nodes.length; k += 3, j += 2) at.set(rt.nodes[k], [p[j], p[j + 1]])
      for (const [a, b, highway] of rt.segments) {
        const pa = at.get(a)
        const pb = at.get(b)
        if (!pa || !pb || (!visible(pa[0], pa[1]) && !visible(pb[0], pb[1]))) continue
        roads[classify(highway)].push(`M${pt(v, pa[0], pa[1])}L${pt(v, pb[0], pb[1])}`)
      }
    }
    if (scenery) {
      for (const [id, rings] of scenery.water) {
        if (seenWater.has(id)) continue
        seenWater.add(id)
        water.push(rings.map((r) => ring(local(r))).join(''))
      }
      for (const [w, line] of scenery.waterways) {
        const p = local(line)
        let d = ''
        for (let i = 0; i + 1 < p.length; i += 2) d += `${i === 0 ? 'M' : 'L'}${pt(v, p[i], p[i + 1])}`
        waterways.push([Math.max(1, w / v.mPerPx), d])
      }
      if (withBuildings) {
        for (const [, outline] of scenery.buildings) {
          const p = local(outline)
          if (visible(p[0], p[1])) buildings.push(ring(p))
        }
      }
    }
  }
  return {
    water: water.join(''),
    waterways,
    buildings: buildings.join(''),
    roads: { major: roads.major.join(''), minor: roads.minor.join(''), path: roads.path.join('') },
  }
}

/** 바탕 지도 (한 번 그리면 그대로) */
const BaseMap = memo(function BaseMap({ paths, width, height }: { paths: MapPaths | null; width: number; height: number }) {
  if (!paths) return null
  const order: RoadClass[] = ['path', 'minor', 'major']
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {paths.water && <Path d={paths.water} fill={MAP.water} fillRule="evenodd" />}
      {paths.waterways.map(([w, d], i) => (
        <Path key={i} d={d} stroke={MAP.water} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {paths.buildings && <Path d={paths.buildings} fill={MAP.building} />}
      {/* 길: 테두리를 먼저 깔고 위에 길 색 */}
      <G strokeLinecap="round" strokeLinejoin="round" fill="none">
        {order.map((c) => paths.roads[c] && <Path key={`e${c}`} d={paths.roads[c]} stroke={MAP.roadEdge} strokeWidth={MAP.roadWidth[c] + 1.5} />)}
        {order.map((c) => paths.roads[c] && <Path key={c} d={paths.roads[c]} stroke={MAP.road[c]} strokeWidth={MAP.roadWidth[c]} />)}
      </G>
    </Svg>
  )
})

/**
 * 기록의 지나온 길을 위에서 내려다본 지도 (북쪽이 위). 바탕은 게임과 같은 지도 데이터(길·물·건물).
 * 열면 출발지부터 지나온 길을 따라 다시보기하고, 끝나면 "다시보기" 버튼이 나온다.
 */
export function TrailMap({ trail, target, origin, width, height, arrived }: Props) {
  const view = useMemo((): View2D => {
    const pad = 28
    const all = [...trail, target, [0, 0] as Point]
    const xs = all.map((p) => p[0])
    const ys = all.map((p) => p[1])
    let minX = Math.min(...xs)
    let maxX = Math.max(...xs)
    let minY = Math.min(...ys)
    let maxY = Math.max(...ys)
    const scale = Math.min((width - pad * 2) / Math.max(60, maxX - minX), (height - pad * 2) / Math.max(60, maxY - minY))
    // 화면 전체가 지도로 차도록 보이는 범위를 화면 비율에 맞춰 넓힌다
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    minX = cx - width / 2 / scale
    maxX = cx + width / 2 / scale
    minY = cy - height / 2 / scale
    maxY = cy + height / 2 / scale
    return { sx: (x) => (x - minX) * scale, sy: (y) => height - (y - minY) * scale, mPerPx: 1 / scale, minX, maxX, minY, maxY }
  }, [trail, target, width, height])

  const [paths, setPaths] = useState<MapPaths | null>(null)
  useEffect(() => {
    let alive = true
    loadMap(origin, view)
      .then((p) => alive && setPaths(p))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [origin, view])

  // 지나온 길의 누적 길이 (다시보기에서 어디까지 그릴지)
  const { cum, total } = useMemo(() => {
    const c = [0]
    for (let i = 1; i < trail.length; i++) c.push(c[i - 1] + Math.hypot(trail[i][0] - trail[i - 1][0], trail[i][1] - trail[i - 1][1]))
    return { cum: c, total: c[c.length - 1] ?? 0 }
  }, [trail])

  const [progress, setProgress] = useState(0)
  const frame = useRef<number | null>(null)
  const play = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    const duration = Math.min(REPLAY_MAX_MS, Math.max(REPLAY_MIN_MS, (total / REPLAY_M_PER_S) * 1000))
    const started = Date.now()
    const tick = () => {
      const t = Math.min(1, (Date.now() - started) / duration)
      // 처음과 끝은 천천히
      setProgress(t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
      frame.current = t < 1 ? requestAnimationFrame(tick) : null
    }
    setProgress(0)
    frame.current = requestAnimationFrame(tick)
  }, [total])
  useEffect(() => {
    play()
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [play])

  // 지금까지 걸은 부분과 머리 위치
  const walked = progress * total
  let i = 1
  while (i < cum.length && cum[i] < walked) i++
  const head: Point =
    trail.length === 0
      ? [0, 0]
      : i >= trail.length
        ? trail[trail.length - 1]
        : (() => {
            const seg = cum[i] - cum[i - 1] || 1
            const k = (walked - cum[i - 1]) / seg
            return [trail[i - 1][0] + (trail[i][0] - trail[i - 1][0]) * k, trail[i - 1][1] + (trail[i][1] - trail[i - 1][1]) * k]
          })()
  const shown = [...trail.slice(0, Math.min(i, trail.length)), head]
  const done = progress >= 1
  const line = shown.map((p) => pt(view, p[0], p[1])).join(' ')

  return (
    <View style={[styles.box, { width, height }]}>
      <BaseMap paths={paths} width={width} height={height} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {/* 도착 반경 */}
        <Circle cx={view.sx(target[0])} cy={view.sy(target[1])} r={Math.max(8, 30 / view.mPerPx)} fill="#e11d48" fillOpacity={done && arrived ? 0.3 : 0.15} stroke="#e11d48" strokeWidth={1.5} />
        <Polyline points={line} fill="none" stroke="#ffffff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
        <Polyline points={line} fill="none" stroke="#2563eb" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={view.sx(0)} cy={view.sy(0)} r={6} fill="#16a34a" stroke="#fff" strokeWidth={2} />
        <Circle cx={view.sx(target[0])} cy={view.sy(target[1])} r={6} fill="#e11d48" stroke="#fff" strokeWidth={2} />
        {/* 지금 걷고 있는 곳 */}
        <Circle cx={view.sx(head[0])} cy={view.sy(head[1])} r={11} fill="#f97316" fillOpacity={0.3} />
        <Circle cx={view.sx(head[0])} cy={view.sy(head[1])} r={6.5} fill="#f97316" stroke="#fff" strokeWidth={2.5} />
      </Svg>
      {!paths && <Text style={styles.loading}>지도를 불러오는 중…</Text>}
      {done && arrived && (
        <View style={styles.arrivedBadge} pointerEvents="none">
          <Icon name="party" size={20} />
          <Text style={styles.arrivedText}>도착!</Text>
        </View>
      )}
      {done && (
        <Pressable style={styles.replay} onPress={play} hitSlop={8}>
          <Text style={styles.replayText}>▶ 다시보기</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { backgroundColor: MAP.land, borderRadius: 16, overflow: 'hidden' },
  loading: { position: 'absolute', top: 10, left: 12, fontSize: 12, color: '#64748b' },
  arrivedBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  arrivedText: { fontWeight: '900', color: '#e11d48' },
  replay: { position: 'absolute', right: 10, bottom: 10, backgroundColor: '#0f172a', borderRadius: 12, paddingHorizontal: 16, height: 42, justifyContent: 'center' },
  replayText: { color: '#fff', fontWeight: '900', fontSize: 15 },
})

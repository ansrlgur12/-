import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber/native'
import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial, type Mesh } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LatLng } from '@jikjwau/shared/types'
import { TILES_PER_DEG } from '@jikjwau/shared/config'
import { parseTileKey, project, tileCorner, unproject } from '@jikjwau/shared/geo'
import { useMapTiles } from '../store/mapTiles'
import { terrainFloor, terrainGrid } from './terrain'
import { forEachSeaTile } from './region'
import { WATER_COLOR } from './WaterMesh'
import type { CameraRig } from './cameraRig'

/** 높이별 땅 색 [해발 m, 색]: 평지 풀밭 → 산 숲 → 높은 산 바위 */
const BANDS: Array<[number, Color]> = [
  [0, new Color('#aedc8c')],
  [60, new Color('#9fd47e')],
  [180, new Color('#7fbc63')],
  [450, new Color('#6b9a5c')],
  [900, new Color('#8f957c')],
  [1400, new Color('#b3b0a2')],
]

function colorAt(h: number, out: Color) {
  let i = 0
  while (i < BANDS.length - 2 && BANDS[i + 1][0] <= h) i++
  const [h0, c0] = BANDS[i]
  const [h1, c1] = BANDS[i + 1]
  return out.lerpColors(c0, c1, Math.min(1, Math.max(0, (h - h0) / (h1 - h0))))
}

// 모든 타일이 같이 쓴다
const material = new MeshLambertMaterial({ vertexColors: true })

/** 타일 한 칸의 땅. 격자 점을 정점으로 쓰고(coarse면 하나 걸러), 높이로 색을 칠한다 */
function buildTerrain(key: string, origin: LatLng, coarse: boolean): BufferGeometry | null {
  const grid = terrainGrid(key)
  if (!grid) return null
  const step = coarse ? 2 : 1
  const full = grid.n
  const n = Math.floor((full - 1) / step) + 1
  const h = new Float32Array(n * n)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) h[i * n + j] = grid.h[i * step * full + j * step]
  const [row, col] = parseTileKey(key)
  const positions = new Float32Array(n * n * 3)
  const colors = new Float32Array(n * n * 3)
  const c = new Color()
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = i * n + j
      const p = project({ lat: (row + i / (n - 1)) / TILES_PER_DEG, lng: (col + j / (n - 1)) / TILES_PER_DEG }, origin)
      positions.set([p.x, h[k], -p.y], k * 3)
      colorAt(h[k], c)
      colors.set([c.r, c.g, c.b], k * 3)
    }
  }
  // 칸마다 삼각형 둘 (terrain.ts의 높이 찾기와 같은 대각선)
  const index = new Uint32Array((n - 1) * (n - 1) * 6)
  let o = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j
      index.set([a, a + 1, a + n, a + 1, a + n + 1, a + n], o)
      o += 6
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export const TerrainMesh = memo(function TerrainMesh({ tileKey, coarse = false }: { tileKey: string; coarse?: boolean }) {
  const origin = useMapTiles((s) => s.origin)
  const geometry = useMemo(() => (origin ? buildTerrain(tileKey, origin, coarse) : null), [tileKey, origin, coarse])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return <mesh geometry={geometry} material={material} />
})

/**
 * 먼 땅(가벼운 타일) 여러 칸을 한 메시로. 타일마다 따로 그리면 멀리 축소했을 때 백 번 넘게 그려야 해서 끊긴다.
 * keys가 그대로면 다시 만들지 않는다
 */
export const TerrainBlock = memo(function TerrainBlock({ keys }: { keys: string }) {
  const origin = useMapTiles((s) => s.origin)
  const geometry = useMemo(() => {
    if (!origin) return null
    const parts = keys.split(',').flatMap((key) => buildTerrain(key, origin, true) ?? [])
    if (parts.length === 0) return null
    if (parts.length === 1) return parts[0]
    const merged = mergeGeometries(parts)
    parts.forEach((g) => g.dispose())
    return merged
  }, [keys, origin])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return <mesh geometry={geometry} material={material} />
})

/** 이만큼(m) 안의 먼 바다를 미리 칠해 둔다 */
const FAR_SEA_RADIUS_M = 30_000
/** 카메라가 보는 곳이 이만큼 옮겨 가면 먼 바다를 다시 만든다 */
const FAR_SEA_REBUILD_M = 5_000
// 멀리서는 바로 밑 풀색 바닥과 깊이가 겹쳐 깜빡일 수 있어 앞으로 당겨 그린다
const farSeaMaterial = new MeshLambertMaterial({ color: WATER_COLOR, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })

/**
 * 먼 바다: 타일을 받기 전에도 "칸 전체가 바다"인 곳(영역 정보)을 물색 네모로 깔아 둔다.
 * 멀리 축소하거나 다른 곳을 보다 돌아올 때 바다가 풀색 바닥으로 보이지 않게.
 * 받은 땅·물보다 아래에 두니, 타일이 들어오면 그 아래로 가려진다
 */
export function FarSea({ rig }: { rig: CameraRig }) {
  const origin = useMapTiles((s) => s.origin)
  const ref = useRef<Mesh>(null)
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null)
  useFrame(() => {
    const f = rig.focus
    if (!center || Math.hypot(f.x - center.x, -f.z - center.y) > FAR_SEA_REBUILD_M) setCenter({ x: f.x, y: -f.z })
    if (ref.current) ref.current.position.y = terrainFloor() - 0.5
  })
  const geometry = useMemo(() => {
    if (!origin || !center) return null
    const c = unproject(center, origin)
    const dRow = Math.ceil((FAR_SEA_RADIUS_M / 111_000) * TILES_PER_DEG)
    const dCol = Math.ceil((FAR_SEA_RADIUS_M / (111_000 * Math.cos((c.lat * Math.PI) / 180))) * TILES_PER_DEG)
    const row0 = Math.floor(c.lat * TILES_PER_DEG)
    const col0 = Math.floor(c.lng * TILES_PER_DEG)
    const positions: number[] = []
    forEachSeaTile(row0 - dRow, row0 + dRow, col0 - dCol, col0 + dCol, (row, col) => {
      const a = project(tileCorner(row, col), origin)
      const b = project(tileCorner(row + 1, col + 1), origin)
      // 위에서 보이는 면 둘 (x 동쪽, 월드 z = -북쪽)
      positions.push(a.x, 0, -a.y, b.x, 0, -a.y, b.x, 0, -b.y, a.x, 0, -a.y, b.x, 0, -b.y, a.x, 0, -b.y)
    })
    if (positions.length === 0) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    const normals = new Float32Array(positions.length)
    for (let k = 1; k < normals.length; k += 3) normals[k] = 1
    g.setAttribute('normal', new BufferAttribute(normals, 3))
    g.computeBoundingSphere()
    return g
  }, [origin, center])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return <mesh ref={ref} geometry={geometry} material={farSeaMaterial} />
}

/** 받아 둔 땅 바깥까지 깔리는 넓은 바닥. 받은 땅 중 가장 낮은 높이에 둔다 */
export function FarGround() {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    if (ref.current) ref.current.position.y = terrainFloor() - 1
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20000, 20000]} />
      <meshLambertMaterial color="#aedc8c" />
    </mesh>
  )
}

import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/native'
import { BufferAttribute, BufferGeometry, Color, MeshLambertMaterial, type Mesh } from 'three'
import type { LatLng } from '@jikjwau/shared/types'
import { TILES_PER_DEG } from '@jikjwau/shared/config'
import { parseTileKey, project } from '@jikjwau/shared/geo'
import { useMapTiles } from '../store/mapTiles'
import { terrainFloor, terrainGrid } from './terrain'

/** 높이별 땅 색 [해발 m, 색]: 평지 풀밭 → 산 숲 → 높은 산 바위 */
const BANDS: Array<[number, Color]> = [
  [0, new Color('#bcd9a6')],
  [60, new Color('#acd096')],
  [180, new Color('#86b471')],
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

/** 받아 둔 땅 바깥까지 깔리는 넓은 바닥. 받은 땅 중 가장 낮은 높이에 둔다 */
export function FarGround() {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    if (ref.current) ref.current.position.y = terrainFloor() - 1
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20000, 20000]} />
      <meshLambertMaterial color="#b9d8a8" />
    </mesh>
  )
}

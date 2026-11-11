import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color, ShapeUtils, Vector2 } from 'three'

const PALETTE = ['#f3e9dc', '#e9dccb', '#dfe6ea', '#efe1df', '#e3ecdf', '#ece6d6']
const WALL_SHADE = 0.82

/**
 * 모든 건물을 하나의 지오메트리로 합친다 (드로우콜 1번).
 * 지붕은 외곽선을 삼각분할하고, 벽은 변마다 사각형을 세운다.
 */
function buildGeometry(buildings: Array<[number, number[]]>): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const roof = new Color()
  const wall = new Color()

  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Color) => {
    positions.push(x, y, z)
    normals.push(nx, ny, nz)
    colors.push(c.r, c.g, c.b)
  }

  buildings.forEach(([height, flat], i) => {
    const pts: Vector2[] = []
    for (let k = 0; k + 1 < flat.length; k += 2) pts.push(new Vector2(flat[k], flat[k + 1]))
    if (pts.length < 3) return
    // 반시계 방향으로 맞춰야 지붕은 위, 벽은 바깥을 향한다
    if (ShapeUtils.isClockWise(pts)) pts.reverse()

    roof.set(PALETTE[i % PALETTE.length])
    wall.copy(roof).multiplyScalar(WALL_SHADE)

    for (const tri of ShapeUtils.triangulateShape(pts, [])) {
      for (const idx of tri) push(pts[idx].x, height, -pts[idx].y, 0, 1, 0, roof)
    }

    for (let j = 0; j < pts.length; j++) {
      const a = pts[j]
      const b = pts[(j + 1) % pts.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len === 0) continue
      // 반시계 외곽선에서 바깥쪽 법선은 진행 방향의 오른쪽
      const nx = (b.y - a.y) / len
      const nz = (b.x - a.x) / len
      push(a.x, 0, -a.y, nx, 0, nz, wall)
      push(b.x, 0, -b.y, nx, 0, nz, wall)
      push(b.x, height, -b.y, nx, 0, nz, wall)
      push(a.x, 0, -a.y, nx, 0, nz, wall)
      push(b.x, height, -b.y, nx, 0, nz, wall)
      push(a.x, height, -a.y, nx, 0, nz, wall)
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  return geometry
}

export function BuildingMesh({ buildings }: { buildings: Array<[number, number[]]> }) {
  const geometry = useMemo(() => buildGeometry(buildings), [buildings])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry}>
      <meshLambertMaterial vertexColors />
    </mesh>
  )
}

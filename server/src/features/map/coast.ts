/**
 * 바다 판정. OSM 해안선(natural=coastline)은 늘 왼쪽이 땅, 오른쪽이 바다가 되게 그려진다.
 * 그래서 어떤 점에서 가장 가까운 해안선 조각을 찾아 그 조각의 어느 쪽에 있는지 보면 바다인지 안다.
 * (해안선 전체를 면으로 조립하지 않아도 되고, 원본 경계에서 잘린 해안선에도 잘 버틴다)
 *
 * 좌표는 1e-7도 정수 (x = 경도, y = 위도). 거리는 경도를 위도 cos만큼 줄여 미터 비율에 맞춘다.
 */

/** 한국 가운데 위도의 cos (경도 1도가 위도 1도보다 짧은 비율) */
const X_SCALE = Math.cos((36.5 * Math.PI) / 180)

export class Coast {
  /** 타일 → 그 타일을 지나는 조각 번호들 */
  private readonly buckets = new Map<string, number[]>()
  /** 노드 → 그 노드로 들어오는 조각 / 나가는 조각 (꼭짓점에서 어느 쪽인지 따질 때) */
  private readonly into: Int32Array
  private readonly outOf: Int32Array

  /**
   * @param xs, ys 노드 좌표
   * @param segA, segB 조각마다 시작·끝 노드 (해안선 방향대로)
   * @param tileE7 공간 색인 칸 크기
   */
  constructor(
    private readonly xs: ArrayLike<number>,
    private readonly ys: ArrayLike<number>,
    private readonly segA: ArrayLike<number>,
    private readonly segB: ArrayLike<number>,
    private readonly tileE7: number,
  ) {
    this.into = new Int32Array(xs.length).fill(-1)
    this.outOf = new Int32Array(xs.length).fill(-1)
    for (let s = 0; s < segA.length; s++) {
      const a = segA[s]
      const b = segB[s]
      this.outOf[a] = s
      this.into[b] = s
      // 조각이 지나는 칸마다 넣는다 (긴 조각도 bbox 전체가 아니라 지나는 칸만)
      const steps = Math.ceil(Math.max(Math.abs(xs[b] - xs[a]), Math.abs(ys[b] - ys[a])) / (tileE7 / 4)) + 1
      let last = ''
      for (let i = 0; i <= steps; i++) {
        const key = this.key(xs[a] + ((xs[b] - xs[a]) * i) / steps, ys[a] + ((ys[b] - ys[a]) * i) / steps)
        if (key === last) continue
        last = key
        let list = this.buckets.get(key)
        if (!list) this.buckets.set(key, (list = []))
        if (list[list.length - 1] !== s) list.push(s)
      }
    }
  }

  get segmentCount() {
    return this.segA.length
  }

  private key(x: number, y: number) {
    return `${Math.floor(y / this.tileE7)}_${Math.floor(x / this.tileE7)}`
  }

  /** 해안선이 지나는 칸인지 */
  hasCoast(row: number, col: number) {
    return this.buckets.has(`${row}_${col}`)
  }

  /** 그 칸을 지나는 조각 번호들 */
  segmentsIn(row: number, col: number): readonly number[] {
    return this.buckets.get(`${row}_${col}`) ?? []
  }

  /** 해안선에서 다음 조각 (없으면 -1) */
  nextSegment(s: number) {
    return this.outOf[this.segB[s]]
  }

  /** 해안선에서 앞 조각 (없으면 -1) */
  prevSegment(s: number) {
    return this.into[this.segA[s]]
  }

  /** 조각의 [시작 x, 시작 y, 끝 x, 끝 y] */
  segment(s: number): [number, number, number, number] {
    const a = this.segA[s]
    const b = this.segB[s]
    return [this.xs[a], this.ys[a], this.xs[b], this.ys[b]]
  }

  /**
   * 점이 바다인지. 가까운 해안선이 maxTiles 칸 안에 없으면 null (판단할 근거가 없음)
   */
  isSea(x: number, y: number, maxTiles = 400): boolean | null {
    const row = Math.floor(y / this.tileE7)
    const col = Math.floor(x / this.tileE7)
    let best = Infinity
    let bestSeg = -1
    let bestT = 0
    const seen = new Set<number>()
    for (let r = 0; r <= maxTiles; r++) {
      // r칸 떨어진 테두리 칸들
      for (let dr = -r; dr <= r; dr++) {
        const edge = Math.abs(dr) === r
        for (let dc = -r; dc <= r; dc += edge ? 1 : 2 * r) {
          const list = this.buckets.get(`${row + dr}_${col + dc}`)
          if (list) {
            for (const s of list) {
              if (seen.has(s)) continue
              seen.add(s)
              const [d, t] = this.distance(s, x, y)
              if (d < best) {
                best = d
                bestSeg = s
                bestT = t
              }
            }
          }
          if (r === 0) break
        }
      }
      // 다음 테두리 칸은 적어도 r칸(경도 방향이면 줄어든 r칸) 떨어져 있다
      if (bestSeg >= 0 && best <= r * this.tileE7 * X_SCALE) break
    }
    if (bestSeg < 0) return null
    return !this.landSide(bestSeg, bestT, x, y)
  }

  /** 조각까지 거리(줄인 좌표)와 가장 가까운 곳의 위치 t(0~1) */
  private distance(s: number, x: number, y: number): [number, number] {
    const a = this.segA[s]
    const b = this.segB[s]
    const ax = this.xs[a] * X_SCALE
    const ay = this.ys[a]
    const dx = this.xs[b] * X_SCALE - ax
    const dy = this.ys[b] - ay
    const px = x * X_SCALE - ax
    const py = y - ay
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / len2)) : 0
    return [Math.hypot(px - t * dx, py - t * dy), t]
  }

  /** 조각 s의 위치 t에서 가장 가까운 점 (x, y)가 땅 쪽(왼쪽)인지 */
  private landSide(s: number, t: number, x: number, y: number) {
    const dir = (k: number): [number, number] => [(this.xs[this.segB[k]] - this.xs[this.segA[k]]) * X_SCALE, this.ys[this.segB[k]] - this.ys[this.segA[k]]]
    const cross = (d: [number, number], vx: number, vy: number) => d[0] * vy - d[1] * vx
    // 꼭짓점이 가장 가까우면 앞뒤 두 조각을 함께 본다
    let vertex = -1
    let prev = -1
    let next = -1
    if (t <= 0) {
      vertex = this.segA[s]
      prev = this.into[vertex]
      next = s
    } else if (t >= 1) {
      vertex = this.segB[s]
      prev = s
      next = this.outOf[vertex]
    }
    if (vertex < 0 || prev < 0 || next < 0) {
      const a = this.segA[s]
      return cross(dir(s), (x - this.xs[a]) * X_SCALE, y - this.ys[a]) > 0
    }
    const vx = (x - this.xs[vertex]) * X_SCALE
    const vy = y - this.ys[vertex]
    const d1 = dir(prev)
    const d2 = dir(next)
    const s1 = cross(d1, vx, vy) > 0
    const s2 = cross(d2, vx, vy) > 0
    // 왼쪽으로 꺾이면 땅은 두 조각 모두의 왼쪽(좁은 쪽), 오른쪽으로 꺾이면 어느 하나의 왼쪽이면 땅
    return cross(d1, d2[0], d2[1]) >= 0 ? s1 && s2 : s1 || s2
  }
}

type P = [number, number]
/** 바다 면 하나: [바깥 고리, ...구멍(섬)] */
export type SeaPolygon = P[][]

/** 고리 넓이 (부호: 반시계 +) */
function signedArea(ring: P[]) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return a / 2
}

function inside(ring: P[], [x, y]: P) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/**
 * 타일 한 칸의 바다 면. 해안선을 타일 네모로 잘라 이어 붙이고, 타일 가장자리를 따라 닫는다.
 * 해안선은 왼쪽이 땅이라, 잘린 조각을 따라가다 가장자리에 닿으면 시계 방향으로 가장자리를 돌아 다음 조각으로 간다.
 * 다 바다면 1, 바다가 없으면 null.
 */
export function seaPolygons(coast: Coast, row: number, col: number, tileE7: number): SeaPolygon[] | 1 | null {
  const x0 = col * tileE7
  const y0 = row * tileE7
  const x1 = x0 + tileE7
  const y1 = y0 + tileE7
  const EPS = 1
  const T = tileE7

  // 1) 조각마다 타일 안 부분 (Liang–Barsky)
  interface Piece {
    s: number
    p0: P
    p1: P
    whole0: boolean
    whole1: boolean
  }
  const pieces = new Map<number, Piece>()
  for (const s of new Set(coast.segmentsIn(row, col))) {
    const [ax, ay, bx, by] = coast.segment(s)
    const dx = bx - ax
    const dy = by - ay
    let t0 = 0
    let t1 = 1
    let ok = true
    for (const [p, q] of [
      [-dx, ax - x0],
      [dx, x1 - ax],
      [-dy, ay - y0],
      [dy, y1 - ay],
    ]) {
      if (p === 0) {
        if (q < 0) ok = false
      } else {
        const r = q / p
        if (p < 0) t0 = Math.max(t0, r)
        else t1 = Math.min(t1, r)
      }
    }
    if (!ok || t1 - t0 <= 1e-9) continue
    pieces.set(s, { s, p0: [ax + dx * t0, ay + dy * t0], p1: [ax + dx * t1, ay + dy * t1], whole0: t0 === 0, whole1: t1 === 1 })
  }

  const onEdge = ([x, y]: P) => Math.abs(x - x0) < EPS || Math.abs(x - x1) < EPS || Math.abs(y - y0) < EPS || Math.abs(y - y1) < EPS
  const nextOf = (p: Piece) => {
    if (!p.whole1) return undefined
    const n = coast.nextSegment(p.s)
    const q = n >= 0 ? pieces.get(n) : undefined
    return q && q.whole0 ? q : undefined
  }
  const prevOf = (p: Piece) => {
    if (!p.whole0) return undefined
    const n = coast.prevSegment(p.s)
    const q = n >= 0 ? pieces.get(n) : undefined
    return q && q.whole1 ? q : undefined
  }

  // 2) 이어 붙이기: 가장자리에서 들어와 나가는 줄, 타일 안에서 닫힌 고리
  const open: Array<{ pts: P[]; start: number; end: number }> = []
  const loops: P[][] = []
  const used = new Set<number>()
  for (const first of pieces.values()) {
    if (used.has(first.s) || prevOf(first)) continue
    const pts: P[] = [first.p0]
    let cur: Piece | undefined = first
    while (cur && !used.has(cur.s)) {
      used.add(cur.s)
      pts.push(cur.p1)
      cur = nextOf(cur)
    }
    // 원본이 끊긴 해안선(가장자리가 아닌 곳에서 끝남)은 버린다
    if (onEdge(pts[0]) && onEdge(pts[pts.length - 1]) && pts.length >= 2) open.push({ pts, start: 0, end: 0 })
  }
  for (const first of pieces.values()) {
    if (used.has(first.s)) continue
    const pts: P[] = []
    let cur: Piece | undefined = first
    while (cur && !used.has(cur.s)) {
      used.add(cur.s)
      pts.push(cur.p0)
      cur = nextOf(cur)
    }
    if (pts.length >= 3) loops.push(pts)
  }

  // 가장자리 위치 (반시계로 0 ~ 4T: 아래 → 오른쪽 → 위 → 왼쪽)
  const perim = ([x, y]: P) => {
    const d = [Math.abs(y - y0), Math.abs(x - x1), Math.abs(y - y1), Math.abs(x - x0)]
    const e = d.indexOf(Math.min(...d))
    if (e === 0) return Math.min(T, Math.max(0, x - x0))
    if (e === 1) return T + Math.min(T, Math.max(0, y - y0))
    if (e === 2) return 2 * T + Math.min(T, Math.max(0, x1 - x))
    return (3 * T + Math.min(T, Math.max(0, y1 - y))) % (4 * T)
  }
  const corners: Array<[number, P]> = [
    [0, [x0, y0]],
    [T, [x1, y0]],
    [2 * T, [x1, y1]],
    [3 * T, [x0, y1]],
  ]
  const back = (from: number, to: number) => (((from - to) % (4 * T)) + 4 * T) % (4 * T)
  for (const c of open) {
    c.start = perim(c.pts[0])
    c.end = perim(c.pts[c.pts.length - 1])
  }

  // 3) 바다 고리: 줄 끝에서 가장자리를 시계 방향(위치가 줄어드는 쪽)으로 돌아 가장 먼저 만나는 줄 시작으로
  const outers: P[][] = []
  const done = new Set<number>()
  for (let i = 0; i < open.length; i++) {
    if (done.has(i)) continue
    const ring: P[] = []
    let cur = i
    for (let guard = 0; guard <= open.length; guard++) {
      done.add(cur)
      ring.push(...open[cur].pts)
      const from = open[cur].end
      let next = -1
      let best = Infinity
      for (let k = 0; k < open.length; k++) {
        const d = back(from, open[k].start)
        if (d < best && (k === i || !done.has(k))) {
          best = d
          next = k
        }
      }
      if (next < 0) break
      // 그 사이 지나는 모서리
      for (const [t, p] of [...corners].sort((a, b) => back(from, a[0]) - back(from, b[0]))) {
        const d = back(from, t)
        if (d > 0 && d < best) ring.push(p)
      }
      if (next === i) break
      cur = next
    }
    if (ring.length >= 3) outers.push(ring)
  }

  // 4) 타일 안에서 닫힌 고리: 반시계 = 섬(구멍), 시계 = 땅에 둘러싸인 바다
  const islands = loops.filter((l) => signedArea(l) > 0)
  for (const l of loops) if (signedArea(l) < 0) outers.push(l)

  if (open.length === 0) {
    // 가장자리를 지나는 해안선이 없다: 모서리 점으로 바깥이 바다인지 정한다
    if (coast.isSea(x0, y0) === true) {
      if (islands.length === 0 && outers.length === 0) return 1
      outers.unshift([
        [x0, y0],
        [x0, y1],
        [x1, y1],
        [x1, y0],
      ])
    }
  }
  if (outers.length === 0) return null

  const polygons: SeaPolygon[] = outers.map((o) => [o])
  for (const island of islands) {
    const host = polygons.find((p) => inside(p[0], island[0]))
    if (host) host.push(island)
  }
  return polygons
}

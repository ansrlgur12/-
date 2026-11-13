/**
 * 대한민국 영역의 모든 타일(칸 전체가 바다인 곳은 빼고) 땅 높이 격자를 미리 만들어 둔다.
 * 처음 가 보는 동네도 서버가 고도 자료를 그때 받지 않아 지도가 빨리 뜬다. 이미 있는 칸은 건너뛴다.
 *
 *   npm run terrain:prebuild -w server            # 처음부터 (중간에 끊어도 다시 돌리면 이어서)
 *   npm run terrain:prebuild -w server -- --jobs 2 # 동시에 만들 칸 수 (기본 4)
 *
 * 고도 원본(AWS Terrain Tiles)을 수천 장 받으므로 시간이 걸린다. 출시 서버에서 한 번 돌려 둔다.
 */
import { access } from 'node:fs/promises'
import path from 'node:path'
import { getRegion } from '../src/features/map/tile-store'
import { terrainTile } from '../src/features/map/terrain'

const jobsArg = process.argv.indexOf('--jobs')
const JOBS = jobsArg >= 0 ? Number(process.argv[jobsArg + 1]) : 4
const GRID_DIR = path.resolve(import.meta.dirname, '../data/terrain/grid')

const region = await getRegion()
if (!region) {
  console.error('영역 정보(region.json)가 없습니다. 지도 타일을 먼저 올려 주세요')
  process.exit(1)
}

const runsOf = (rows: number[][] | undefined) => new Map((rows ?? []).map(([row, ...runs]) => [row, runs]))
const sea = runsOf(region.sea)
const allSea = (row: number, col: number) => {
  const runs = sea.get(row)
  if (!runs) return false
  for (let i = 0; i < runs.length; i += 2) if (col >= runs[i] && col <= runs[i + 1]) return true
  return false
}

const keys: string[] = []
for (const [row, ...runs] of region.rows) {
  for (let i = 0; i < runs.length; i += 2) for (let col = runs[i]; col <= runs[i + 1]; col++) if (!allSea(row, col)) keys.push(`${row}_${col}`)
}

const exists = (key: string) => {
  const [row, col] = key.split('_')
  return access(path.join(GRID_DIR, row, `${col}.json`)).then(
    () => true,
    () => false,
  )
}

const t0 = Date.now()
let done = 0
let made = 0
let failed = 0
let next = 0
const worker = async () => {
  while (next < keys.length) {
    const key = keys[next++]
    if (!(await exists(key))) {
      try {
        await terrainTile(key)
        made++
      } catch (err) {
        failed++
        console.error(`${key} 실패: ${(err as Error).message}`)
      }
    }
    done++
    if (done % 500 === 0 || done === keys.length) {
      const min = (Date.now() - t0) / 60_000
      console.log(`${done}/${keys.length} (새로 ${made}, 실패 ${failed}) ${min.toFixed(1)}분`)
    }
  }
}
console.log(`땅 높이 격자: 대상 ${keys.length}칸, 동시에 ${JOBS}칸`)
await Promise.all(Array.from({ length: JOBS }, worker))
console.log(failed > 0 ? `끝. 실패 ${failed}칸은 다시 돌리면 이어서 만듭니다` : '끝')

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { RoadTile } from '@jikjwau/shared/types'
import { parseTileKey } from '@jikjwau/shared/geo'
import { HttpError } from '../../common/http-error'

// 그래프를 만들 때마다 같은 타일을 다시 풀지 않도록 최근 것만 메모리에 둔다
const ROAD_TILE_CACHE_SIZE = 400
const roadTileCache = new Map<string, RoadTile | null>()

const DATA_DIR = path.resolve(import.meta.dirname, '../../../data')
const NOT_READY = '지도 타일이 없습니다. server에서 npm run osm:download, npm run osm:tiles를 먼저 실행해 주세요'

/** scripts/build-tiles.ts가 만든 타일 폴더. data/tiles.json이 가리킨다 (다시 만들면 바뀐다) */
let tilesDir: string | null = null

async function refreshTilesDir(): Promise<string | null> {
  try {
    const { dir } = JSON.parse(await readFile(path.join(DATA_DIR, 'tiles.json'), 'utf8')) as { dir: string }
    const next = path.join(DATA_DIR, dir)
    if (next !== tilesDir) roadTileCache.clear()
    tilesDir = next
  } catch {
    tilesDir = null
  }
  return tilesDir
}

export type TileLayer = 'roads' | 'scenery'

const TILE_KEY = /^-?\d+_-?\d+$/

async function fileOf(key: string, layer: TileLayer) {
  if (!TILE_KEY.test(key)) throw new HttpError(400, '잘못된 타일 키입니다')
  const dir = tilesDir ?? (await refreshTilesDir())
  if (!dir) throw new HttpError(503, NOT_READY)
  const [row, col] = parseTileKey(key)
  return path.join(dir, String(row), `${col}.${layer}.json.gz`)
}

/** gzip된 타일 파일 그대로. 데이터가 없는 칸(바다·산 등)은 null */
export async function readTileGz(key: string, layer: TileLayer): Promise<Buffer | null> {
  try {
    return await readFile(await fileOf(key, layer))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** 게임 지역을 만들 때마다 tiles.json을 다시 읽어, 타일을 새로 만들었으면 그쪽으로 바꾼다 */
export async function assertTilesReady() {
  if (!(await refreshTilesDir())) throw new HttpError(503, NOT_READY)
}

export async function readRoadTile(key: string): Promise<RoadTile | null> {
  if (roadTileCache.has(key)) {
    const hit = roadTileCache.get(key)!
    roadTileCache.delete(key)
    roadTileCache.set(key, hit)
    return hit
  }
  const gz = await readTileGz(key, 'roads')
  const tile = gz ? (JSON.parse(gunzipSync(gz).toString('utf8')) as RoadTile) : null
  roadTileCache.set(key, tile)
  if (roadTileCache.size > ROAD_TILE_CACHE_SIZE) roadTileCache.delete(roadTileCache.keys().next().value!)
  return tile
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { TERRAIN_GRID, TILES_PER_DEG } from '@jikjwau/shared/config'
import { parseTileKey } from '@jikjwau/shared/geo'
import type { TerrainTile } from '@jikjwau/shared/types'
import { HttpError } from '../../common/http-error'

/*
 * 땅 높이. 공개 고도 타일(AWS Terrain Tiles, Terrarium 형식, SRTM 등 기반)을 처음 필요할 때 받아
 * 우리 지도 타일 한 칸마다 TERRAIN_GRID × TERRAIN_GRID 격자로 뽑아 둔다. 받은 원본과 격자는 디스크에 남긴다.
 */

const SOURCE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
/** 줌 12: 한국 위도에서 한 픽셀 약 30m */
const ZOOM = 12
const PX = 256
const CACHE_DIR = path.resolve(import.meta.dirname, '../../../data/terrain')
/** 풀어 둔 원본 이미지를 메모리에 이만큼 */
const IMAGE_CACHE_SIZE = 48

const TILE_KEY = /^-?\d+_-?\d+$/

/** Terrarium 픽셀 → 해발(m) */
export const terrariumHeight = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768

/** 위경도 → 줌 ZOOM 전체 지도에서의 픽셀 좌표 (웹 메르카토르) */
export function toPixel(lat: number, lng: number): [number, number] {
  const size = PX * 2 ** ZOOM
  const rad = (lat * Math.PI) / 180
  const x = ((lng + 180) / 360) * size
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size
  return [x, y]
}

const images = new Map<string, Promise<Float32Array | null>>()

async function fetchImage(x: number, y: number): Promise<Float32Array | null> {
  const file = path.join(CACHE_DIR, 'src', String(ZOOM), String(x), `${y}.png`)
  let png: Buffer
  try {
    png = await readFile(file)
  } catch {
    const res = await fetch(`${SOURCE}/${ZOOM}/${x}/${y}.png`)
    if (res.status === 404) return null
    if (!res.ok) throw new HttpError(502, `고도 데이터를 받지 못했어요 (HTTP ${res.status})`)
    png = Buffer.from(await res.arrayBuffer())
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, png)
  }
  const { data, width, height } = PNG.sync.read(png)
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = terrariumHeight(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])
  return out
}

/** 원본 이미지 하나 (같은 것을 동시에 여러 번 받지 않는다) */
function image(x: number, y: number) {
  const key = `${x}/${y}`
  let hit = images.get(key)
  if (hit) {
    images.delete(key)
  } else {
    hit = fetchImage(x, y)
    hit.catch(() => images.delete(key))
  }
  images.set(key, hit)
  while (images.size > IMAGE_CACHE_SIZE) images.delete(images.keys().next().value!)
  return hit
}

/** 그 픽셀의 높이. 없는 곳(바다 밖)은 0 */
async function pixel(px: number, py: number) {
  const tx = Math.floor(px / PX)
  const ty = Math.floor(py / PX)
  const img = await image(tx, ty)
  if (!img) return 0
  return img[(py - ty * PX) * PX + (px - tx * PX)]
}

/** 위경도의 높이. 이웃 픽셀 넷을 섞는다 */
async function heightAt(lat: number, lng: number) {
  const [x, y] = toPixel(lat, lng)
  // 픽셀 값은 픽셀 가운데 것
  const fx = x - 0.5
  const fy = y - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const [a, b, c, d] = await Promise.all([pixel(x0, y0), pixel(x0 + 1, y0), pixel(x0, y0 + 1), pixel(x0 + 1, y0 + 1)])
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

async function buildTile(row: number, col: number): Promise<TerrainTile> {
  const n = TERRAIN_GRID
  const heights: number[] = []
  // 남쪽 줄부터, 줄마다 서→동. 가장자리 값은 이웃 타일과 같아서 이음매가 맞는다
  for (let i = 0; i < n; i++) {
    const lat = (row + i / (n - 1)) / TILES_PER_DEG
    const line = await Promise.all(
      Array.from({ length: n }, (_, j) => heightAt(lat, (col + j / (n - 1)) / TILES_PER_DEG)),
    )
    // 바다는 0으로. 0.1m 단위 정수로 줄인다
    for (const h of line) heights.push(Math.round(Math.max(0, h) * 10))
  }
  return { n, heights }
}

const building = new Map<string, Promise<TerrainTile>>()

/** 지도 타일 한 칸의 높이 격자 */
export async function terrainTile(key: string): Promise<TerrainTile> {
  if (!TILE_KEY.test(key)) throw new HttpError(400, '잘못된 타일 키입니다')
  const [row, col] = parseTileKey(key)
  const file = path.join(CACHE_DIR, 'grid', String(row), `${col}.json`)
  try {
    return JSON.parse(await readFile(file, 'utf8')) as TerrainTile
  } catch {
    // 아직 없으면 만든다
  }
  let job = building.get(key)
  if (!job) {
    job = buildTile(row, col).then(async (tile) => {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, JSON.stringify(tile))
      return tile
    })
    job.finally(() => building.delete(key)).catch(() => undefined)
    building.set(key, job)
  }
  return job
}

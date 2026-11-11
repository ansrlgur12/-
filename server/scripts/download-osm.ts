/**
 * 대한민국 OSM 원본(.osm.pbf, 약 300MB)을 받는다. Geofabrik은 연결 하나당 속도가 느려서
 * 4MB씩 나눠 여러 연결로 동시에 받은 뒤 이어 붙인다.
 *
 *   npm run osm:download -w server
 */
import { mkdir, open, rename } from 'node:fs/promises'
import path from 'node:path'

const URL_PBF = process.env.OSM_PBF_URL ?? 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf'
const OUT = path.resolve(import.meta.dirname, '../data/south-korea-latest.osm.pbf')
const CHUNK = 4 * 1024 * 1024
const CONCURRENCY = 24
const RETRIES = 5

async function fetchRange(start: number, end: number): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(URL_PBF, { headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(180_000) })
      if (res.status !== 206) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length !== end - start + 1) throw new Error(`short read ${buf.length}`)
      return buf
    } catch (err) {
      if (attempt >= RETRIES) throw err
    }
  }
}

const head = await fetch(URL_PBF, { method: 'HEAD' })
const size = Number(head.headers.get('content-length'))
if (!size) throw new Error('파일 크기를 알 수 없습니다')
console.log(`${URL_PBF}\n${(size / 1e6).toFixed(0)}MB, 수정 ${head.headers.get('last-modified')}`)

await mkdir(path.dirname(OUT), { recursive: true })
const tmp = `${OUT}.part`
const file = await open(tmp, 'w')
const chunks = Math.ceil(size / CHUNK)
let next = 0
let done = 0
const t0 = Date.now()

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < chunks) {
      const i = next++
      const start = i * CHUNK
      const buf = await fetchRange(start, Math.min(start + CHUNK, size) - 1)
      await file.write(buf, 0, buf.length, start)
      done++
      const sec = (Date.now() - t0) / 1000
      process.stdout.write(`\r${done}/${chunks} 조각, ${((done * CHUNK) / 1e6 / sec).toFixed(1)}MB/s   `)
    }
  }),
)
await file.close()
await rename(tmp, OUT)
console.log(`\n완료: ${OUT} (${((Date.now() - t0) / 1000).toFixed(0)}초)`)

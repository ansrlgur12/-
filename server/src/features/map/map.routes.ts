import { Router } from 'express'
import { gunzipSync } from 'node:zlib'
import { z } from 'zod'
import { getRegion, inRegion, readTileGz } from './tile-store'
import { parseTileKey } from '@jikjwau/shared/geo'
import { HttpError } from '../../common/http-error'
import { terrainTile } from './terrain'
import { checkSpot } from '../road/area'

export const mapRouter = Router()

const layerSchema = z.enum(['roads', 'scenery'])

/** 미리 만든 지도 타일. 파일이 이미 gzip이라 그대로 보낸다. 데이터가 없는 칸은 204 */
mapRouter.get('/tiles/:key/:layer', async (req, res) => {
  const layer = layerSchema.parse(req.params.layer)
  const gz = await readTileGz(req.params.key, layer)
  if (!gz) {
    res.status(204).end()
    return
  }
  res.set('Cache-Control', 'public, max-age=86400')
  res.type('application/json')
  if (req.acceptsEncodings('gzip')) {
    res.set('Content-Encoding', 'gzip').send(gz)
  } else {
    res.send(gunzipSync(gz))
  }
})

/** 타일 한 칸의 땅 높이 격자. 처음이면 고도 데이터를 받아 만든다 */
mapRouter.get('/terrain/:key', async (req, res) => {
  const [row, col] = parseTileKey(req.params.key)
  if (!(await inRegion(row, col))) throw new HttpError(404, '대한민국 밖은 지도를 보여 주지 않습니다')
  const tile = await terrainTile(req.params.key)
  res.set('Cache-Control', 'public, max-age=86400')
  res.json(tile)
})

const latLngSchema = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) })

/** 출발지·목적지 확인: 가장 가까운 (본토와 이어진) 길. 없으면 { road: null, reason } */
mapRouter.get('/snap', async (req, res) => {
  const at = latLngSchema.parse(req.query)
  res.json(await checkSpot(at))
})

/** 지도를 보여 주고 다닐 수 있는 대한민국 영역. 예전 타일이라 정보가 없으면 null */
mapRouter.get('/region', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(await getRegion())
})

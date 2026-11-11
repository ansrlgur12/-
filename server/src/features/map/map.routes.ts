import { Router } from 'express'
import { gunzipSync } from 'node:zlib'
import { z } from 'zod'
import { readTileGz } from './tile-store'

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

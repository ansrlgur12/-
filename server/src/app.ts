import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import { attachSocket } from './socket'
import { mapRouter } from './features/map/map.routes'
import { placeRouter } from './features/place/place.routes'
import { recordRouter } from './features/record/record.routes'
import { profileRouter } from './features/profile/profile.routes'
import { errorHandler } from './common/error-handler'

const PORT = Number(process.env.PORT ?? 4000)
/** 출시 서버에서는 127.0.0.1로 두고 nginx(HTTPS)를 거쳐서만 받는다. 개발 중에는 같은 와이파이의 휴대폰이 붙도록 전부 */
const HOST = process.env.HOST ?? '0.0.0.0'
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/map', mapRouter)
app.use('/places', placeRouter)
app.use('/records', recordRouter)
app.use('/profile', profileRouter)
app.use(errorHandler)

const httpServer = createServer(app)
attachSocket(httpServer, CLIENT_ORIGIN)

httpServer.listen(PORT, HOST, () => {
  console.log(`server listening on ${HOST}:${PORT}`)
})

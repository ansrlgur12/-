import { createServer } from 'node:http'
import express from 'express'
import cors from 'cors'
import { attachSocket } from './socket'
import { gameRouter } from './features/game/game.routes'
import { mapRouter } from './features/map/map.routes'
import { placeRouter } from './features/place/place.routes'
import { errorHandler } from './common/error-handler'

const PORT = Number(process.env.PORT ?? 4000)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/game', gameRouter)
app.use('/map', mapRouter)
app.use('/places', placeRouter)
app.use(errorHandler)

const httpServer = createServer(app)
attachSocket(httpServer, CLIENT_ORIGIN)

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT}`)
})

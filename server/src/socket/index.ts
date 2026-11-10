import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'

export function attachSocket(httpServer: HttpServer, clientOrigin: string) {
  const io = new Server(httpServer, { cors: { origin: clientOrigin } })

  io.on('connection', (socket) => {
    console.log(`socket connected: ${socket.id}`)
  })

  return io
}

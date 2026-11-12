import { io, type Socket } from 'socket.io-client'
import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@jikjwau/shared/types'
import { API_BASE_URL } from './http'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** 앱 전체에서 하나만 쓴다. 끊기면 socket.io가 알아서 다시 붙는다 */
export const socket: GameSocket = io(API_BASE_URL, { transports: ['websocket'], autoConnect: false })

const ACK_TIMEOUT_MS = 15_000

/** ack로 답하는 요청을 Promise로. 서버가 거절하면 그 메시지로 실패한다 */
export function request<T extends object = object>(send: (ack: (res: AckResult<T>) => void) => void): Promise<T> {
  if (!socket.connected) socket.connect()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('서버 응답이 없어요')), ACK_TIMEOUT_MS)
    send((res) => {
      clearTimeout(timer)
      if (res.ok) resolve(res as T)
      else reject(new Error(res.error))
    })
  })
}

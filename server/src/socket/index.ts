import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import { z } from 'zod'
import type { AckResult, ClientToServerEvents, EmoteId, ServerToClientEvents } from '@jikjwau/shared/types'
import { HttpError } from '../common/http-error'
import { EMOTE_COOLDOWN_MS, EMOTES, NORMAL_RPS_LIMITS, NORMAL_TIME_LIMITS_MIN } from '@jikjwau/shared/config'
import { createRoom, getRoom } from '../features/room/rooms'
import { setGhostOutput } from '../features/ghost/ghosts'

type IO = Server<ClientToServerEvents, ServerToClientEvents>
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, { playerId?: string; roomCode?: string; lastEmoteAt?: number }>

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
const place = z.object({ latLng, name: z.string().trim().min(1).max(80) })
const playerId = z.string().min(8).max(64)
const nickname = z.string().trim().min(1).max(12)
const seat = z.enum(['A', 'B', 'C'])
const hand = z.enum(['rock', 'paper', 'scissors'])
const emote = z.enum(EMOTES.map((e) => e.id) as [EmoteId, ...EmoteId[]])

const limit = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time'), minutes: z.number().refine((n) => NORMAL_TIME_LIMITS_MIN.includes(n)) }),
  z.object({ kind: z.literal('rps'), count: z.number().refine((n) => NORMAL_RPS_LIMITS.includes(n)) }),
])
const rules = z.discriminatedUnion('mode', [z.object({ mode: z.literal('hardcore') }), z.object({ mode: z.literal('normal'), limit })])
const createSchema = z.object({ playerId, nickname, start: place, destination: place, rules, solo: z.boolean() })
const joinSchema = z.object({ code: z.string().trim().min(4).max(8), playerId, nickname })

function errorMessage(err: unknown) {
  if (err instanceof z.ZodError) return '잘못된 요청입니다'
  if (err instanceof HttpError) return err.message
  console.error(err)
  return '서버 오류가 발생했습니다'
}

/** 핸들러를 감싸 결과/에러를 ack로 돌려준다 (ack가 없는 요청도 견딘다) */
async function reply<T extends object>(ack: unknown, run: () => Promise<T> | T) {
  const send = typeof ack === 'function' ? (ack as (res: AckResult<T>) => void) : () => undefined
  try {
    send({ ok: true, ...(await run()) })
  } catch (err) {
    send({ ok: false, error: errorMessage(err) })
  }
}

export function attachSocket(httpServer: HttpServer, clientOrigin: string) {
  const io: IO = new Server(httpServer, { cors: { origin: clientOrigin } })

  const output = (code: string) => ({
    state: (room: Parameters<ServerToClientEvents['room:state']>[0]) => io.to(code).emit('room:state', room),
    intro: (intro: Parameters<ServerToClientEvents['game:intro']>[0]) => io.to(code).emit('game:intro', intro),
    update: (update: Parameters<ServerToClientEvents['game:update']>[0]) => io.to(code).emit('game:update', update),
    emote: (e: Parameters<ServerToClientEvents['emote']>[0]) => io.to(code).emit('emote', e),
  })

  setGhostOutput({
    list: (code, ghosts) => io.to(code).emit('ghost:list', ghosts),
    move: (code, e) => io.to(code).emit('ghost:move', e),
    emote: (code, e) => io.to(code).emit('ghost:emote', e),
  })

  io.on('connection', (socket: ClientSocket) => {
    /** 지금 소켓이 들어가 있는 방 */
    const current = () => {
      const room = socket.data.roomCode ? getRoom(socket.data.roomCode) : undefined
      if (!room || !socket.data.playerId) throw new HttpError(409, '방에 들어가 있지 않아요')
      return { room, playerId: socket.data.playerId }
    }

    const leaveCurrent = async () => {
      const code = socket.data.roomCode
      const id = socket.data.playerId
      if (!code || !id) return
      socket.data.roomCode = undefined
      await socket.leave(code)
      const room = getRoom(code)
      if (!room) return
      // 마지막 사람이 나가면 방이 스스로 없어진다
      await room.run(() => room.leave(id))
    }

    const enter = async (code: string, id: string, name: string) => {
      const room = getRoom(code)
      if (!room) throw new HttpError(404, '방을 찾을 수 없어요. 초대 코드를 확인해 주세요')
      if (socket.data.roomCode && socket.data.roomCode !== room.code) await leaveCurrent()
      socket.data.playerId = id
      socket.data.roomCode = room.code
      await socket.join(room.code)
      return room.run(() => room.join(id, name, socket.id))
    }

    socket.on('room:create', (req, ack) =>
      reply(ack, async () => {
        const { playerId: id, nickname: name, start, destination, rules: roomRules, solo } = createSchema.parse(req)
        const room = createRoom({ host: { id, nickname: name }, start, destination, rules: roomRules, solo }, output)
        return enter(room.code, id, name)
      }),
    )

    socket.on('room:join', (req, ack) =>
      reply(ack, async () => {
        const { code, playerId: id, nickname: name } = joinSchema.parse(req)
        return enter(code, id, name)
      }),
    )

    socket.on('room:leave', () => {
      leaveCurrent().catch((err) => console.error('room:leave', err))
    })

    socket.on('room:seat', (req, ack) =>
      reply(ack, () => {
        const { room, playerId: id } = current()
        return room.run(() => room.changeSeat(id, seat.parse(req?.seat))).then(() => ({}))
      }),
    )

    socket.on('game:start', (ack) =>
      reply(ack, () => {
        const { room, playerId: id } = current()
        return room.run(() => room.startGame(id)).then(() => ({}))
      }),
    )

    socket.on('game:reset', (ack) =>
      reply(ack, () => {
        const { room, playerId: id } = current()
        return room.run(() => room.resetGame(id)).then(() => ({}))
      }),
    )

    socket.on('rps:choose', (req, ack) =>
      reply(ack, () => {
        const { room, playerId: id } = current()
        return room.run(() => room.choose(id, hand.parse(req?.hand))).then(() => ({}))
      }),
    )

    socket.on('seat:return', (ack) =>
      reply(ack, () => {
        const { room, playerId: id } = current()
        return room.run(() => room.returnToSeat(id)).then(() => ({}))
      }),
    )

    socket.on('emote:send', (req) => {
      const parsed = emote.safeParse(req?.emote)
      const room = socket.data.roomCode ? getRoom(socket.data.roomCode) : undefined
      const now = Date.now()
      if (!parsed.success || !room || !socket.data.playerId || now - (socket.data.lastEmoteAt ?? 0) < EMOTE_COOLDOWN_MS) return
      socket.data.lastEmoteAt = now
      room.emote(socket.data.playerId, parsed.data)
    })

    socket.on('disconnect', () => {
      const room = socket.data.roomCode ? getRoom(socket.data.roomCode) : undefined
      if (room && socket.data.playerId) room.disconnect(socket.data.playerId, socket.id)
    })
  })

  return io
}

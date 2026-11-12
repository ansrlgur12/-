/**
 * 가짜 플레이어. 휴대폰 한 대로 멀티플레이를 시험할 때 나머지 자리를 채운다.
 *
 *   npm run bot -w server -- <초대코드> [--count 2] [--skip 0.15] [--drop 0.05] [--url http://localhost:4000]
 *   npm run bot -w server -- --create [--count 3]   (봇끼리만 방을 만들어 돌려 본다)
 *
 * --skip: 판마다 일부러 안 내서 시간 초과로 AI에게 넘어갈 확률 (넘어가면 몇 초 뒤 돌아온다)
 * --drop: 판마다 접속을 끊었다가 잠시 뒤 다시 들어올 확률
 */
import { randomUUID } from 'node:crypto'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, GameEvent, GameUpdate, Hand, RoomJoined, ServerToClientEvents, AckResult } from '@jikjwau/shared/types'
import { MOVE_SPEED_MPS, RPS_RESULT_SHOW_MS } from '@jikjwau/shared/config'

const args = process.argv.slice(2)
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const create = args.includes('--create')
const code = create ? null : args.find((a) => !a.startsWith('--') && !/^[\d.]+$/.test(a) && !a.startsWith('http'))
const count = Number(flag('count', create ? '3' : '2'))
const skipRate = Number(flag('skip', '0.15'))
const dropRate = Number(flag('drop', '0.05'))
const url = flag('url', `http://localhost:${process.env.PORT ?? 4000}`)

if (!create && !code) {
  console.log('사용법: npm run bot -w server -- <초대코드> [--count 2] [--skip 0.15] [--drop 0.05]')
  process.exit(1)
}

const HANDS: Hand[] = ['rock', 'paper', 'scissors']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const playback = (events: GameEvent[]) =>
  events.reduce((ms, e) => ms + (e.type === 'move' ? (e.distanceM / MOVE_SPEED_MPS) * 1000 : RPS_RESULT_SHOW_MS), 0)

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>

function ask<T>(emit: (ack: (res: AckResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => emit((res) => (res.ok ? resolve(res as T) : reject(new Error(res.error)))))
}

async function runBot(index: number, roomCode: string | null): Promise<string> {
  const playerId = randomUUID()
  const nickname = `봇${index + 1}`
  let seat = '?'
  let joinedCode = roomCode
  let lastRound = ''
  const log = (...m: unknown[]) => console.log(`[${nickname} ${seat}]`, ...m)

  const socket: BotSocket = io(url, { transports: ['websocket'] })

  const onJoined = (res: RoomJoined) => {
    joinedCode = res.room.code
    seat = res.room.players.find((p) => p.id === playerId)?.seat ?? '?'
    log('입장', res.room.code, res.game ? '(게임 중)' : '')
    if (res.game) void act(res.game.update)
  }

  const join = async () => {
    if (!joinedCode) {
      const res = await ask<RoomJoined>((ack) =>
        socket.emit(
          'room:create',
          {
            playerId,
            nickname,
            start: { latLng: { lat: 37.556, lng: 126.9101 }, name: '망원역' },
            destination: { latLng: { lat: 37.5585, lng: 126.9135 }, name: '봇 목적지' },
            rules: { mode: 'hardcore' },
            solo: false,
          },
          ack,
        ),
      )
      onJoined(res)
      return
    }
    onJoined(await ask<RoomJoined>((ack) => socket.emit('room:join', { code: joinedCode!, playerId, nickname }, ack)))
  }

  /** 상태가 바뀔 때마다: 내 차례면 (연출을 기다렸다가) 낸다 */
  const act = async ({ events, snapshot }: GameUpdate) => {
    for (const e of events) {
      if (e.type === 'rps' && index === 0) {
        const r = e.result
        console.log(`  판정 ${r.participants.map((s) => `${s}:${r.hands[s]}`).join(' ')} → ${r.winners.join(',') || '무승부'}${r.timedOut.length ? ` (시간초과 ${r.timedOut})` : ''}`)
      }
    }
    if (snapshot.phase === 'ARRIVED') {
      log('도착!', snapshot.stats)
      return
    }
    const mySeat = seat as 'A' | 'B' | 'C'
    if (snapshot.controllers[mySeat] === 'ai' && !snapshot.returning.includes(mySeat)) {
      log('AI로 바뀜 → 4초 뒤 돌아오기')
      await sleep(4000)
      await ask((ack) => socket.emit('seat:return', ack)).catch((err) => log('돌아오기 실패', err.message))
      return
    }
    const rps = snapshot.rps
    if (!rps || !rps.participants.includes(mySeat) || rps.submitted.includes(mySeat) || snapshot.controllers[mySeat] !== 'user') return
    const round = `${snapshot.stats.rpsCount}:${rps.participants.join('')}`
    if (round === lastRound) return
    lastRound = round

    if (Math.random() < dropRate) {
      log('접속 끊기 (8초 뒤 다시 들어옴)')
      socket.disconnect()
      await sleep(8000)
      socket.connect()
      return
    }
    if (Math.random() < skipRate) {
      log('일부러 안 냄')
      return
    }
    await sleep(playback(events) + 500 + Math.random() * 2500)
    const hand = HANDS[Math.floor(Math.random() * 3)]
    await ask((ack) => socket.emit('rps:choose', { hand }, ack)).catch((err) => log('내기 실패', err.message))
  }

  socket.on('connect', () => {
    join().catch((err) => log('입장 실패', err.message))
  })
  socket.on('room:state', (room) => {
    seat = room.players.find((p) => p.id === playerId)?.seat ?? seat
  })
  socket.on('game:intro', () => log('게임 시작'))
  socket.on('game:update', (u) => void act(u))
  socket.on('connect_error', (err) => log('연결 실패', err.message))

  // 방 코드를 알 때까지 기다린다
  while (!joinedCode) await sleep(100)
  if (create && index === 0) {
    ;(globalThis as { hostSocket?: BotSocket }).hostSocket = socket
  }
  return joinedCode
}

const first = await runBot(0, code ?? null)
console.log(`방 코드: ${first}`)
for (let i = 1; i < count; i++) await runBot(i, first)
if (create) {
  await sleep(1000)
  const host = (globalThis as { hostSocket?: BotSocket }).hostSocket!
  await ask((ack) => host.emit('game:start', ack))
}

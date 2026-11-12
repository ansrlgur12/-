import type { PlaceRef, RoomRules } from '@jikjwau/shared/types'
import { Room, type RoomOutput } from './room'

/** 초대 코드: 헷갈리는 글자(0/O, 1/I/L)를 뺀 6자리 */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

// 메모리. 서버를 다시 켜면 방은 사라진다 (끝난 게임 기록은 record.store에 남는다)
const rooms = new Map<string, Room>()

function newCode() {
  for (;;) {
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    if (!rooms.has(code)) return code
  }
}

export interface CreateRoomRequest {
  host: { id: string; nickname: string }
  start: PlaceRef
  destination: PlaceRef
  rules: RoomRules
  solo: boolean
}

export function createRoom(req: CreateRoomRequest, output: (code: string) => RoomOutput) {
  const code = newCode()
  const room = new Room({ ...req, code, out: output(code), onEmpty: () => deleteRoom(code) })
  rooms.set(code, room)
  return room
}

// 1분마다 방마다 게임한 시간을 센다 (미션)
setInterval(() => {
  const now = Date.now()
  for (const room of rooms.values()) room.tickMinute(now)
}, 60_000).unref?.()

export function getRoom(code: string) {
  return rooms.get(code.trim().toUpperCase())
}

export function deleteRoom(code: string) {
  rooms.get(code)?.dispose()
  rooms.delete(code)
}

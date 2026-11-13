import type { GameSnapshot, RoomView, Seat } from '@jikjwau/shared/types'
import { BUDDY_NAMES } from './labels'

const SEATS: Seat[] = ['A', 'B', 'C']
import { useGame, useMySeat } from '../store/game'

/** 자리 이름: 사람이면 닉네임, 빈 자리(AI)는 철수·영희, 사람이 잠깐 자리를 비우면 닉네임(AI) */
export function useSeatName() {
  const room = useGame((s) => s.room)
  const snapshot = useGame((s) => s.snapshot)
  const mine = useMySeat()
  return (seat: Seat) => seatName(seat, room, snapshot, mine)
}

function seatName(seat: Seat, room: RoomView | null, snapshot: GameSnapshot | null, mine?: Seat) {
  if (seat === mine) return '나'
  const player = room?.players.find((p) => p.seat === seat)
  if (!player) {
    const empty = SEATS.filter((s) => !room?.players.some((p) => p.seat === s))
    return BUDDY_NAMES[empty.indexOf(seat)] ?? BUDDY_NAMES[0]
  }
  if (snapshot?.controllers[seat] === 'ai') return `${player.nickname}(AI)`
  return player.nickname
}

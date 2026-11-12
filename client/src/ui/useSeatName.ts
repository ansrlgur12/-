import type { GameSnapshot, RoomView, Seat } from '@jikjwau/shared/types'
import { useGame, useMySeat } from '../store/game'

/** 자리 이름: 사람이면 닉네임, AI가 맡고 있으면 AI */
export function useSeatName() {
  const room = useGame((s) => s.room)
  const snapshot = useGame((s) => s.snapshot)
  const mine = useMySeat()
  return (seat: Seat) => seatName(seat, room, snapshot, mine)
}

function seatName(seat: Seat, room: RoomView | null, snapshot: GameSnapshot | null, mine?: Seat) {
  if (seat === mine) return '나'
  const player = room?.players.find((p) => p.seat === seat)
  if (!player || snapshot?.controllers[seat] === 'ai') return `AI ${seat}`
  return player.nickname
}

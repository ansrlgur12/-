import type { CreateGameRequest, CreateGameResponse, GameUpdateResponse, Hand } from '@jikjwau/shared/types'
import { postJson } from './http'

export function createGame(req: CreateGameRequest) {
  return postJson<CreateGameResponse>('/game', req)
}

/** hand = null 이면 시간 초과 (서버가 AI로 대신 낸다) */
export function chooseRps(gameId: string, hand: Hand | null) {
  return postJson<GameUpdateResponse>(`/game/${gameId}/rps`, { hand })
}

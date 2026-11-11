import { randomUUID } from 'node:crypto'
import type { CreateGameRequest, CreateGameResponse, GameUpdateResponse, Hand } from '@jikjwau/shared/types'
import { ARRIVAL_RADIUS_M, DESTINATION_MAX_M, DESTINATION_MIN_M } from '@jikjwau/shared/config'
import { HttpError } from '../../common/http-error'
import { RoadArea, snapToRoad } from '../road/area'
import { distance, project } from '../road/geo'
import { nearestNode } from '../road/graph'
import { Game } from './game'

// Phase 2: 메모리. Phase 3에서 방(room)과 함께 관리한다.
const MAX_GAMES = 100
const games = new Map<string, Game>()

const round1 = (n: number) => Math.round(n * 10) / 10

export async function createGame({ start, destination, seat }: CreateGameRequest): Promise<CreateGameResponse> {
  const straight = distance({ x: 0, y: 0 }, project(destination, start))
  if (straight < DESTINATION_MIN_M) throw new HttpError(400, `목적지가 출발지에서 ${DESTINATION_MIN_M}m 이상 떨어져 있어야 합니다`)
  if (straight > DESTINATION_MAX_M) throw new HttpError(400, `목적지는 출발지에서 ${DESTINATION_MAX_M / 1000}km 안이어야 합니다`)

  const area = await RoadArea.load(start)
  const target = await snapToRoad(destination, start)
  if (!target) throw new HttpError(400, '목적지 근처에 걸을 수 있는 길이 없습니다')
  const startNode = nearestNode(area.graph, { x: 0, y: 0 })

  const game = new Game({ source: area, startNode, destination: target, arrivalRadiusM: ARRIVAL_RADIUS_M, seat })
  const events = await game.begin()

  const gameId = randomUUID()
  games.set(gameId, game)
  if (games.size > MAX_GAMES) games.delete(games.keys().next().value!)

  const startPos = area.graph.nodes.get(startNode)!
  return {
    gameId,
    origin: start,
    seat,
    destination: { point: [round1(target.x), round1(target.y)], radiusM: ARRIVAL_RADIUS_M },
    start: [round1(startPos.x), round1(startPos.y)],
    events,
    snapshot: game.snapshot(),
  }
}

export async function chooseHand(gameId: string, hand: Hand | null): Promise<GameUpdateResponse> {
  const game = games.get(gameId)
  if (!game) throw new HttpError(404, '게임을 찾을 수 없습니다. 새로 시작해 주세요')
  const events = await game.choose(hand)
  return { events, snapshot: game.snapshot() }
}

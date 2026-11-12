import type { GameIntro, LatLng, NormalLimit, Point, Seat, SeatController } from '@jikjwau/shared/types'
import { ARRIVAL_RADIUS_M, DESTINATION_MAX_M, DESTINATION_MIN_M } from '@jikjwau/shared/config'
import { HttpError } from '../../common/http-error'
import { checkSpot, RoadArea, SNAP_RADIUS_M, snapToRoad, spotProblem } from '../road/area'
import { distance, project } from '../road/geo'
import { nearestNode } from '../road/graph'
import { Game } from './game'

const round1 = (n: number) => Math.round(n * 10) / 10

/** 방장이 고른 출발지·목적지가 게임할 수 있는 거리인지 */
export function checkDistance(start: LatLng, destination: LatLng) {
  const straight = distance({ x: 0, y: 0 }, project(destination, start))
  if (straight < DESTINATION_MIN_M) throw new HttpError(400, `목적지가 출발지에서 ${DESTINATION_MIN_M}m 이상 떨어져 있어야 합니다`)
  if (straight > DESTINATION_MAX_M) throw new HttpError(400, `목적지는 출발지에서 ${DESTINATION_MAX_M / 1000}km 안이어야 합니다`)
}

/** 출발지 주변 길을 읽고, 목적지를 길 위로 옮겨 게임을 만든다. 좌표 origin은 출발지 */
export async function buildGame(start: LatLng, destination: LatLng, controllers: Record<Seat, SeatController>, limit?: NormalLimit) {
  checkDistance(start, destination)
  // 둘 다 대한민국 본토(걸어서 이어진 길)여야 한다
  const [startCheck, destinationCheck] = await Promise.all([checkSpot(start), checkSpot(destination)])
  const problem = spotProblem(startCheck, '출발지') ?? spotProblem(destinationCheck, '목적지')
  if (problem) throw new HttpError(400, problem)
  const area = await RoadArea.load(start)
  const target = await snapToRoad(destination, start)
  if (!target) throw new HttpError(400, spotProblem({ road: null }, '목적지')!)
  const startNode = nearestNode(area.graph, { x: 0, y: 0 }, (id) => !area.off.has(id))
  if (distance(area.graph.nodes.get(startNode)!, { x: 0, y: 0 }) > SNAP_RADIUS_M) throw new HttpError(400, spotProblem({ road: null }, '출발지')!)
  const game = new Game({ source: area, startNode, destination: target, arrivalRadiusM: ARRIVAL_RADIUS_M, controllers, limit })
  const intro = (): GameIntro => ({
    origin: start,
    destination: { point: [round1(target.x), round1(target.y)], radiusM: ARRIVAL_RADIUS_M },
    trail: game.trailPoints(),
    elapsedMs: Date.now() - game.startedAt,
  })
  const point: Point = [round1(target.x), round1(target.y)]
  return { game, intro, target: point }
}

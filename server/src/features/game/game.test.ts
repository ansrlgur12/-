import { describe, expect, it } from 'vitest'
import type { GameEvent, Vec2 } from '@jikjwau/shared/types'
import { buildGraph, type OsmElement } from '../road/graph'
import { Game, type GameOptions } from './game'

const ORIGIN = { lat: 37.5, lng: 127 }
const M_LAT = 1 / 111_195
const M_LNG = 1 / (111_195 * Math.cos((37.5 * Math.PI) / 180))

function node(id: number, x: number, y: number): OsmElement {
  return { type: 'node', id, lat: ORIGIN.lat + y * M_LAT, lon: ORIGIN.lng + x * M_LNG }
}

function way(id: number, nodes: number[]): OsmElement {
  return { type: 'way', id, nodes, tags: { highway: 'residential' } }
}

/**
 *              2 (0,100)
 *              |
 *  4 (-100,0)--1 (0,0)--3 (100,0)
 *              |
 *              5 (0,-100)  ← 출발
 * withWest = false 이면 4가 없는 T자 (남쪽에서 오면 좌회전이 없다)
 */
function cross(withWest = true) {
  return buildGraph(
    [
      node(1, 0, 0),
      node(2, 0, 100),
      node(3, 100, 0),
      node(4, -100, 0),
      node(5, 0, -100),
      way(10, [5, 1, 2]),
      way(11, withWest ? [4, 1, 3] : [1, 3]),
    ],
    ORIGIN,
  )
}

// randomHand: 0 → 바위, 0.4 → 보, 0.7 → 가위
const R = { rock: 0, paper: 0.4, scissors: 0.7 }

function makeGame(rands: number[], overrides: Partial<GameOptions> = {}) {
  const queue = [...rands]
  return new Game({
    source: { graph: cross(), ensureAround: async () => false },
    startNode: 5,
    destination: { x: 5000, y: 5000 },
    arrivalRadiusM: 30,
    seat: 'B',
    // 첫 값은 출발 방향 고르기 (출발 노드는 길이 하나뿐)
    rand: () => queue.shift() ?? 0,
    now: () => 0,
    ...overrides,
  })
}

const moves = (events: GameEvent[]) => events.flatMap((e) => (e.type === 'move' ? [e.reason] : []))
/** 첫 이동이 끝난 지점 */
const firstMoveEnd = (events: GameEvent[]): Vec2 => {
  const first = events.find((e) => e.type === 'move')
  if (first?.type !== 'move') throw new Error('no move')
  const [x, y] = first.path.at(-1)!
  return { x, y }
}

describe('Game', () => {
  it('출발해서 첫 교차로에서 셋이 가위바위보를 시작한다', async () => {
    const game = makeGame([0])
    const events = await game.begin()
    expect(moves(events)).toEqual(['start'])
    const snap = game.snapshot()
    expect(snap.phase).toBe('RPS')
    expect(snap.position).toEqual([0, 0])
    expect(snap.rps?.participants).toEqual(['A', 'B', 'C'])
    expect(snap.rps?.options.map((o) => o.direction)).toEqual(['left', 'straight', 'right'])
    expect(snap.stats.distanceM).toBe(100)
  })

  it('한 명이 이기면 그 방향으로 가고, 막다른 길이면 자동 유턴한다', async () => {
    const game = makeGame([0, R.scissors, R.scissors])
    await game.begin()
    const events = await game.choose('rock')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: ['B'], rematch: false } })
    expect(moves(events)).toEqual(['win', 'deadEnd'])
    expect(game.snapshot().phase).toBe('RPS')
    expect(game.rpsCount).toBe(1)
    expect(game.distanceM).toBeCloseTo(300, 0)
  })

  it('첫 판이 전원 무승부면 왔던 길로 돌아간다', async () => {
    const game = makeGame([0, R.paper, R.scissors])
    await game.begin()
    const events = await game.choose('rock')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: [] } })
    expect(moves(events)).toEqual(['uturn', 'deadEnd'])
  })

  it('두 명이 이기면 둘이서 다시 하고, 둘끼리 비기면 또 한다', async () => {
    const game = makeGame([0, R.paper, R.rock, R.rock, R.rock])
    await game.begin()
    await game.choose('paper')
    let snap = game.snapshot()
    expect(snap.phase).toBe('RPS_REMATCH')
    expect(snap.rps?.participants).toEqual(['A', 'B'])

    // 재경기 무승부 → 유턴하지 않고 다시
    let events = await game.choose('rock')
    expect(moves(events)).toEqual([])
    expect(game.snapshot().rps?.participants).toEqual(['A', 'B'])

    events = await game.choose('scissors')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: ['A'], rematch: true } })
    expect(moves(events)[0]).toBe('win')
    expect(firstMoveEnd(events).x).toBe(-100)
    expect(game.rpsCount).toBe(3)
  })

  it('목적지 반경에 들어오면 도착한다', async () => {
    const game = makeGame([0, R.rock, R.paper], { destination: { x: 110, y: 0 } })
    await game.begin()
    const events = await game.choose('rock')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: ['C'] } })
    expect(moves(events)).toEqual(['win'])
    const snap = game.snapshot()
    expect(snap.phase).toBe('ARRIVED')
    expect(snap.rps).toBeNull()
    expect(snap.stats.remainingM).toBe(10)
    await expect(game.choose('rock')).rejects.toThrow()
  })

  it('내 방향이 없는 교차로는 AI끼리 바로 한다', async () => {
    const game = makeGame([0, R.rock, R.scissors, R.rock, R.rock, R.paper, R.rock], {
      source: { graph: cross(false), ensureAround: async () => false },
      seat: 'A',
    })
    const events = await game.begin()
    const rounds = events.filter((e) => e.type === 'rps')
    // T자에서 B·C만 → B 승 → 북쪽 막다른 길 유턴 → 이제 A(좌=동)·B(직=남) 교차로라 내 차례
    expect(rounds[0]).toMatchObject({ result: { participants: ['B', 'C'], winners: ['B'] } })
    expect(moves(events)).toEqual(['start', 'win', 'deadEnd'])
    expect(game.snapshot().rps?.participants).toEqual(['A', 'B'])
  })

  it('시간 초과면 AI가 대신 내고, 다음 마감은 연출 시간만큼 늦춰진다', async () => {
    let now = 0
    const game = makeGame([0, R.paper, R.scissors, R.rock], { now: () => now })
    await game.begin()
    const first = game.snapshot().rps!.timeLeftMs
    // 100m 이동 연출(2.5초) + 20초
    expect(first).toBe(22_500)

    now = 30_000
    const events = await game.choose('paper')
    expect(events[0]).toMatchObject({ type: 'rps', result: { timedOut: ['B'], hands: { B: 'scissors' } } })
  })
})

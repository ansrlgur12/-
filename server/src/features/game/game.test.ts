import { describe, expect, it } from 'vitest'
import type { GameEvent, Vec2 } from '@jikjwau/shared/types'
import { buildGraph, type OsmElement } from '../road/graph'
import { enterCircle, Game, type GameOptions } from './game'

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
    controllers: { A: 'ai', B: 'user', C: 'ai' },
    // 첫 값은 출발 방향 고르기 (출발 노드는 길이 하나뿐)
    rand: () => queue.shift() ?? 0,
    now: () => 0,
    ...overrides,
  })
}

/** B(사람)가 내고 판정까지 */
async function choose(game: Game, hand: 'rock' | 'paper' | 'scissors') {
  const events = await game.submit('B', hand)
  if (!events) throw new Error('round did not resolve')
  return events
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
    const events = await choose(game, 'rock')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: ['B'], rematch: false } })
    expect(moves(events)).toEqual(['win', 'deadEnd'])
    expect(game.snapshot().phase).toBe('RPS')
    expect(game.rpsCount).toBe(1)
    expect(game.distanceM).toBeCloseTo(300, 0)
  })

  it('첫 판이 전원 무승부면 왔던 길로 돌아간다', async () => {
    const game = makeGame([0, R.paper, R.scissors])
    await game.begin()
    const events = await choose(game, 'rock')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: [] } })
    expect(moves(events)).toEqual(['uturn', 'deadEnd'])
  })

  it('두 명이 이기면 둘이서 다시 하고, 둘끼리 비기면 또 한다', async () => {
    const game = makeGame([0, R.paper, R.rock, R.rock, R.rock])
    await game.begin()
    await choose(game, 'paper')
    let snap = game.snapshot()
    expect(snap.phase).toBe('RPS_REMATCH')
    expect(snap.rps?.participants).toEqual(['A', 'B'])

    // 재경기 무승부 → 유턴하지 않고 다시
    let events = await choose(game, 'rock')
    expect(moves(events)).toEqual([])
    expect(game.snapshot().rps?.participants).toEqual(['A', 'B'])

    events = await choose(game, 'scissors')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: ['A'], rematch: true } })
    expect(moves(events)[0]).toBe('win')
    expect(firstMoveEnd(events).x).toBe(-100)
    expect(game.rpsCount).toBe(3)
  })

  it('목적지 반경에 들어오면 도착한다', async () => {
    const game = makeGame([0, R.rock, R.paper], { destination: { x: 110, y: 0 } })
    await game.begin()
    const events = await choose(game, 'rock')
    expect(events[0]).toMatchObject({ type: 'rps', result: { winners: ['C'] } })
    expect(moves(events)).toEqual(['win'])
    const snap = game.snapshot()
    expect(snap.phase).toBe('ARRIVED')
    expect(snap.rps).toBeNull()
    // 원(반경 30m)에 닿는 순간 멈춘다
    expect(snap.stats.remainingM).toBe(30)
    await expect(game.submit('B', 'rock')).rejects.toThrow()
  })

  it('내 방향이 없는 교차로는 AI끼리 바로 한다', async () => {
    const game = makeGame([0, R.rock, R.scissors, R.rock, R.rock, R.paper, R.rock], {
      source: { graph: cross(false), ensureAround: async () => false },
      controllers: { A: 'user', B: 'ai', C: 'ai' },
    })
    const events = await game.begin()
    const rounds = events.filter((e) => e.type === 'rps')
    // T자에서 B·C만 → B 승 → 북쪽 막다른 길 유턴 → 이제 A(좌=동)·B(직=남) 교차로라 내 차례
    expect(rounds[0]).toMatchObject({ result: { participants: ['B', 'C'], winners: ['B'] } })
    expect(moves(events)).toEqual(['start', 'win', 'deadEnd'])
    expect(game.snapshot().rps?.participants).toEqual(['A', 'B'])
  })

  it('마감은 연출 시간만큼 늦춰지고, 시간이 지나면 AI가 대신 낸 뒤 사람이 없어 멈춘다', async () => {
    const game = makeGame([0, R.paper, R.scissors, R.rock])
    await game.begin()
    // 100m 이동 연출(2.5초) + 20초
    expect(game.snapshot().rps!.timeLeftMs).toBe(22_500)

    const events = await game.timeout()
    expect(events[0]).toMatchObject({ type: 'rps', result: { timedOut: ['B'], hands: { B: 'scissors' } } })
    const snap = game.snapshot()
    expect(snap.controllers.B).toBe('ai')
    // 사람이 아무도 없으니 AI끼리 끝없이 가지 않고 다음 판에서 멈춘다
    expect(snap.paused).toBe(true)
    expect(game.waitingFor()).toEqual([])
  })

  it('멈춘 게임에 돌아오면 바로 이어받는다', async () => {
    const game = makeGame([0, R.paper, R.scissors, R.rock])
    await game.begin()
    await game.timeout()
    expect(await game.setController('B', 'user')).toEqual([])
    expect(game.snapshot().paused).toBe(false)
    expect(game.waitingFor()).toEqual(['B'])
    expect(game.snapshot().rps!.timeLeftMs).toBe(20_000)
  })

  it('여러 사람이면 모두 낼 때까지 기다리고, 무엇을 냈는지는 알려 주지 않는다', async () => {
    const game = makeGame([0, R.rock], { controllers: { A: 'user', B: 'user', C: 'ai' } })
    await game.begin()
    expect(game.waitingFor()).toEqual(['A', 'B'])
    expect(await game.submit('A', 'paper')).toBeNull()
    expect(game.snapshot().rps!.submitted).toEqual(['A'])
    await expect(game.submit('A', 'rock')).rejects.toThrow('이미 냈습니다')
    const events = (await game.submit('B', 'scissors'))!
    // A 보, B 가위, C(AI) 바위 → 셋 다 달라서 무승부
    expect(events[0]).toMatchObject({ type: 'rps', result: { hands: { A: 'paper', B: 'scissors', C: 'rock' }, winners: [] } })
  })

  it('시간이 지나 AI로 바뀐 사람은 다음 판부터 다시 맡는다', async () => {
    const game = makeGame([0, R.scissors, R.rock, R.rock], { controllers: { A: 'user', B: 'user', C: 'ai' } })
    await game.begin()
    await game.submit('A', 'rock')
    // B가 안 냄 → AI(가위), C(AI) 바위 → A·C 바위 승 → 둘이 재경기
    const events = await game.timeout()
    expect(events[0]).toMatchObject({ type: 'rps', result: { timedOut: ['B'], winners: ['A', 'C'] } })
    expect(game.snapshot().controllers.B).toBe('ai')

    await game.setController('B', 'user')
    expect(game.snapshot().returning).toEqual(['B'])
    expect(game.snapshot().controllers.B).toBe('ai')
    // 재경기(A vs C) 판정이 끝나 새 판이 시작되면 B가 돌아온다
    await game.submit('A', 'scissors')
    const snap = game.snapshot()
    expect(snap.controllers.B).toBe('user')
    expect(snap.returning).toEqual([])
  })

  it('나간 사람만 기다리던 판은 바로 AI가 마무리한다', async () => {
    const game = makeGame([0, R.rock, R.rock], { controllers: { A: 'user', B: 'user', C: 'ai' } })
    await game.begin()
    await game.submit('A', 'paper')
    const events = await game.setController('B', 'ai')
    expect(events[0]).toMatchObject({ type: 'rps', result: { hands: { A: 'paper', B: 'rock', C: 'rock' }, winners: ['A'] } })
  })
})

describe('일반 모드 제한', () => {
  it('가위바위보 횟수를 다 쓰면 다음 교차로에서 끝난다', async () => {
    const game = makeGame([0, R.scissors, R.scissors], { limit: { kind: 'rps', count: 1 } })
    await game.begin()
    const events = await choose(game, 'rock')
    // 이긴 방향으로 마저 움직이고 (막다른 길 유턴까지) 다음 판 대신 끝난다
    expect(moves(events)).toEqual(['win', 'deadEnd'])
    const snap = game.snapshot()
    expect(snap.phase).toBe('ENDED')
    expect(snap.rps).toBeNull()
    expect(game.waitingFor()).toEqual([])
    await expect(game.submit('B', 'rock')).rejects.toThrow()
  })

  it('시간이 다 되면 낼 차례를 기다리던 중이어도 끝난다', async () => {
    let now = 0
    const game = makeGame([0], { limit: { kind: 'time', minutes: 10 }, now: () => now })
    await game.begin()
    expect(game.endsAt).toBe(600_000)
    now = 599_999
    await game.expire()
    expect(game.snapshot().phase).toBe('RPS')
    now = 600_000
    await game.expire()
    expect(game.snapshot().phase).toBe('ENDED')
    expect(game.finished).toBe(true)
  })

  it('하드코어(제한 없음)는 시간이 지나도 끝나지 않는다', async () => {
    let now = 0
    const game = makeGame([0], { now: () => now })
    await game.begin()
    now = 10 * 3600_000
    await game.expire()
    expect(game.endsAt).toBeNull()
    expect(game.finished).toBe(false)
  })
})

describe('enterCircle', () => {
  it('노드가 원 안에 없어도 길이 원을 지나가면 들어서는 지점을 찾는다', () => {
    // (0,0) → (200,0) 길, 원 중심 (100,10) 반경 30 → x = 100 - √(900-100) ≈ 71.7
    const hit = enterCircle([{ x: 0, y: 0 }, { x: 200, y: 0 }], { x: 100, y: 10 }, 30)
    expect(hit?.index).toBe(0)
    expect(hit?.point.x).toBeCloseTo(100 - Math.sqrt(800), 5)
    expect(hit?.point.y).toBe(0)
  })

  it('원에 닿지 않으면 null', () => {
    expect(enterCircle([{ x: 0, y: 0 }, { x: 200, y: 0 }], { x: 100, y: 50 }, 30)).toBeNull()
  })

  it('두 번째 구간에서 들어서면 그 앞 점 번호', () => {
    const hit = enterCircle([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }], { x: 80, y: 100 }, 30)
    expect(hit?.index).toBe(1)
    expect(hit?.point).toEqual({ x: 50, y: 100 })
  })
})

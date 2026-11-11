import type {
  Direction,
  GameEvent,
  GameSnapshot,
  Hand,
  MoveReason,
  NodeId,
  Point,
  RoadArrival,
  Seat,
  Vec2,
} from '@jikjwau/shared/types'
import { MOVE_SPEED_MPS, RPS_RESULT_SHOW_MS, RPS_TIMEOUT_MS, SEAT_DIRECTION } from '@jikjwau/shared/config'
import { HttpError } from '../../common/http-error'
import type { RoadGraph } from '../road/graph'
import { distance } from '../road/geo'
import { arrivalAt, walkToDecision } from '../road/walk'
import { judgeRound, randomHand } from './rps'

/** 일행이 움직이면 넓어지는 도로 그래프 (RoadArea). 테스트에서는 고정 그래프를 넣는다 */
export interface GraphSource {
  readonly graph: RoadGraph
  ensureAround(point: Vec2): Promise<boolean>
}

export interface GameOptions {
  source: GraphSource
  startNode: NodeId
  destination: Vec2
  arrivalRadiusM: number
  /** 사람이 앉은 자리. 나머지 두 자리는 AI */
  seat: Seat
  rand?: () => number
  now?: () => number
}

const SEATS: Seat[] = ['A', 'B', 'C']
/** 마감 직후 도착한 선택은 받아 준다 (네트워크 지연) */
const LATE_GRACE_MS = 3000
/** 자동 이동(막다른 길·외길)이 끝없이 이어지는 것을 막는다 */
const MAX_AUTO_MOVES = 50
/** 사람 차례 없이 이어지는 AI끼리의 판. 정상 진행이지만 응답 하나가 끝없이 커지지 않게 막는다 */
const MAX_AI_ROUNDS = 2000

const round1 = (n: number) => Math.round(n * 10) / 10
const toPoint = (p: Vec2): Point => [round1(p.x), round1(p.y)]

/**
 * 게임 한 판의 진행. 가위바위보 판정, 방향 결정, 이동, 도착을 모두 여기서 정한다.
 * 사람이 낼 차례가 되면 멈추고, 그 사이에 일어난 일은 GameEvent 목록으로 돌려준다.
 */
export class Game {
  phase: GameSnapshot['phase'] = 'RPS'
  rpsCount = 0
  distanceM = 0
  /** 지나온 노드 (기록용) */
  readonly trail: NodeId[]
  readonly startedAt: number

  private node: NodeId
  private arrival: RoadArrival | null = null
  private participants: Seat[] = []
  private rematch = false
  private deadline = 0
  private busy = false
  private readonly rand: () => number
  private readonly now: () => number

  constructor(private readonly opts: GameOptions) {
    this.node = opts.startNode
    this.trail = [opts.startNode]
    this.rand = opts.rand ?? Math.random
    this.now = opts.now ?? Date.now
    this.startedAt = this.now()
  }

  private get graph() {
    return this.opts.source.graph
  }

  private pos(id: NodeId): Vec2 {
    return this.graph.nodes.get(id)!
  }

  /** 출발 방향은 무작위로 정하고 첫 가위바위보까지 진행한다 */
  begin(): Promise<GameEvent[]> {
    return this.exclusive(async (events) => {
      const neighbors = [...this.graph.adj.get(this.node)!]
      const via = neighbors[Math.floor(this.rand() * neighbors.length)]
      await this.move(via, 'start', undefined, events)
    })
  }

  /** 사람이 낸 손. null이거나 마감이 지났으면 AI가 대신 낸다 */
  choose(hand: Hand | null): Promise<GameEvent[]> {
    return this.exclusive(async (events) => {
      if (this.phase === 'ARRIVED') throw new HttpError(409, '이미 도착한 게임입니다')
      const timedOut = hand === null || this.now() > this.deadline + LATE_GRACE_MS
      const hands: Partial<Record<Seat, Hand>> = {}
      for (const seat of this.participants) {
        hands[seat] = seat === this.opts.seat && !timedOut ? hand! : randomHand(this.rand)
      }
      await this.resolve(hands, timedOut ? [this.opts.seat] : [], events)
    })
  }

  snapshot(): GameSnapshot {
    const here = this.pos(this.node)
    const waiting = this.phase !== 'ARRIVED'
    return {
      phase: this.phase,
      position: toPoint(here),
      stats: {
        rpsCount: this.rpsCount,
        distanceM: Math.round(this.distanceM),
        elapsedMs: this.now() - this.startedAt,
        remainingM: Math.round(distance(here, this.opts.destination)),
      },
      rps: waiting
        ? {
            participants: this.participants,
            rematch: this.rematch,
            options: this.participants.map((seat) => {
              const direction = SEAT_DIRECTION[seat]
              const via = this.arrival!.options.find((o) => o.direction === direction)!.via
              return { seat, direction, toward: toPoint(this.pos(via)) }
            }),
            timeLeftMs: Math.max(0, this.deadline - this.now()),
          }
        : null,
    }
  }

  /** 요청이 겹치지 않게 하고, 사람 차례가 되면 연출 시간만큼 늦춰 마감을 정한다 */
  private async exclusive(run: (events: GameEvent[]) => Promise<void>): Promise<GameEvent[]> {
    if (this.busy) throw new HttpError(409, '이전 요청을 처리하는 중입니다')
    this.busy = true
    try {
      const events: GameEvent[] = []
      await run(events)
      this.deadline = this.now() + playbackMs(events) + RPS_TIMEOUT_MS
      return events
    } finally {
      this.busy = false
    }
  }

  /**
   * via 쪽으로 다음 교차로까지 간다. 막다른 길이나 외길이면 이어서 자동으로 움직이고,
   * 고를 방향이 2개 이상인 교차로에 서면 가위바위보를 시작한다.
   */
  private async move(firstVia: NodeId, firstReason: MoveReason, firstDirection: Direction | undefined, events: GameEvent[]) {
    let via = firstVia
    let reason = firstReason
    let direction = firstDirection
    /** 이번 자동 이동에서 이미 지나간 "노드 → 다음 노드" */
    const taken = new Set<string>()

    for (let i = 0; i < MAX_AUTO_MOVES; i++) {
      await this.opts.source.ensureAround(this.pos(this.node))
      let path = walkToDecision(this.graph, this.node, via)
      // 아주 긴 외길 끝이 읽어 둔 범위 밖이었다면 넓힌 그래프로 다시 따라간다
      if (await this.opts.source.ensureAround(this.pos(path[path.length - 1]))) {
        path = walkToDecision(this.graph, this.node, via)
      }

      const reached = path.findIndex((id, k) => k > 0 && distance(this.pos(id), this.opts.destination) <= this.opts.arrivalRadiusM)
      if (reached > 0) path = path.slice(0, reached + 1)

      const points = path.map((id) => this.pos(id))
      let length = 0
      for (let k = 1; k < points.length; k++) length += distance(points[k - 1], points[k])
      this.distanceM += length
      this.trail.push(...path.slice(1))
      this.node = path[path.length - 1]
      events.push({ type: 'move', reason, direction, path: points.map(toPoint), distanceM: Math.round(length) })

      if (reached > 0) {
        this.phase = 'ARRIVED'
        this.arrival = null
        this.participants = []
        return
      }

      const arrival = arrivalAt(this.graph, path)
      this.arrival = arrival
      if (arrival.kind === 'deadEnd') {
        via = arrival.incomingFrom
        reason = 'deadEnd'
        direction = undefined
        continue
      }
      if (arrival.options.length === 1) {
        via = arrival.options[0].via
        reason = 'only'
        direction = arrival.options[0].direction
        // 작은 고리 길에서는 매번 같은 방향 하나만 남아 끝없이 돌 수 있다.
        // 같은 곳을 다시 지나게 되면 판정에서 빠졌던(너무 뒤로 꺾인) 다른 길로 빠져나간다.
        if (taken.has(`${this.node}>${via}`)) {
          const exits = [...this.graph.adj.get(this.node)!].filter((n) => n !== via && n !== arrival.incomingFrom)
          const unused = exits.filter((n) => !taken.has(`${this.node}>${n}`))
          via = unused[0] ?? exits[0] ?? arrival.incomingFrom
          direction = undefined
        }
        taken.add(`${this.node}>${via}`)
        continue
      }
      // 그 교차로에 없는 방향을 맡은 자리는 빠진다
      const available = new Set(arrival.options.map((o) => o.direction))
      await this.startRound(SEATS.filter((s) => available.has(SEAT_DIRECTION[s])), false, events)
      return
    }
    throw new Error('auto moves did not reach a decision')
  }

  private async startRound(participants: Seat[], rematch: boolean, events: GameEvent[]) {
    this.participants = participants
    this.rematch = rematch
    this.phase = rematch ? 'RPS_REMATCH' : 'RPS'
    if (participants.includes(this.opts.seat)) return

    // 사람이 빠진 판은 AI끼리 바로 한다
    if (events.filter((e) => e.type === 'rps').length > MAX_AI_ROUNDS) throw new Error('too many AI rounds')
    const hands: Partial<Record<Seat, Hand>> = {}
    for (const seat of participants) hands[seat] = randomHand(this.rand)
    await this.resolve(hands, [], events)
  }

  private async resolve(hands: Partial<Record<Seat, Hand>>, timedOut: Seat[], events: GameEvent[]) {
    this.rpsCount++
    const winners = judgeRound(hands)
    events.push({ type: 'rps', result: { participants: this.participants, hands, winners, rematch: this.rematch, timedOut } })

    if (winners.length === 1) {
      const direction = SEAT_DIRECTION[winners[0]]
      const via = this.arrival!.options.find((o) => o.direction === direction)!.via
      await this.move(via, 'win', direction, events)
    } else if (winners.length === 2) {
      await this.startRound(winners, true, events)
    } else if (!this.rematch) {
      // 첫 판 전원 무승부: 왔던 길로 돌아간다
      await this.move(this.arrival!.incomingFrom, 'uturn', undefined, events)
    } else {
      await this.startRound(this.participants, true, events)
    }
  }
}

/** 앱이 이벤트를 연출하는 데 걸리는 시간 (서버와 앱이 같은 상수를 쓴다) */
export function playbackMs(events: GameEvent[]): number {
  let ms = 0
  for (const e of events) ms += e.type === 'move' ? (e.distanceM / MOVE_SPEED_MPS) * 1000 : RPS_RESULT_SHOW_MS
  return Math.round(ms)
}

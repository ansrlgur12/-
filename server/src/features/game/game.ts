import type {
  Direction,
  GameEvent,
  GameSnapshot,
  Hand,
  MoveReason,
  NormalLimit,
  NodeId,
  Point,
  RoadArrival,
  Seat,
  SeatController,
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
  /** 자리마다 사람(user)인지 AI인지. 사람이 시간 안에 안 내면 AI로 바뀐다 */
  controllers: Record<Seat, SeatController>
  /** 일반 모드의 제한. 없으면(하드코어) 도착할 때까지 */
  limit?: NormalLimit
  rand?: () => number
  now?: () => number
}

export const SEATS: Seat[] = ['A', 'B', 'C']
/** 자동 이동(막다른 길·외길)이 끝없이 이어지는 것을 막는다 */
const MAX_AUTO_MOVES = 50
/** 사람 차례 없이 이어지는 AI끼리의 판. 정상 진행이지만 한 번에 끝없이 커지지 않게 막는다 */
const MAX_AI_ROUNDS = 2000

const round1 = (n: number) => Math.round(n * 10) / 10
const toPoint = (p: Vec2): Point => [round1(p.x), round1(p.y)]

/**
 * 게임 한 판의 진행. 가위바위보 판정, 방향 결정, 이동, 도착을 모두 여기서 정한다.
 * 사람이 낼 차례가 되면 멈추고, 그 사이에 일어난 일은 GameEvent 목록으로 돌려준다.
 *
 * 사람 자리는 submit으로 내고, 마감이 지나면 timeout()이 안 낸 자리를 AI로 바꿔 마무리한다.
 * 돌아온 사람(setController 'user')은 진행 중인 판은 AI에게 맡기고 다음 판부터 이어받는다.
 * 사람이 한 명도 없으면 AI끼리 끝없이 가지 않도록 멈춰(paused) 기다린다.
 * 일반 모드는 제한(시간·횟수)을 다 쓰면 다음 가위바위보 대신 그 자리에서 끝난다(ENDED).
 */
export class Game {
  phase: GameSnapshot['phase'] = 'RPS'
  rpsCount = 0
  distanceM = 0
  paused = false
  /** 지나온 노드 (기록용) */
  readonly trail: NodeId[]
  readonly startedAt: number
  /** 이번 판 마감 시각 (연출 시간 포함) */
  deadline = 0

  private node: NodeId
  private arrival: RoadArrival | null = null
  private participants: Seat[] = []
  private rematch = false
  private hands: Partial<Record<Seat, Hand>> = {}
  private readonly controllers: Record<Seat, SeatController>
  /** 다음 판부터 사람에게 돌려줄 자리 */
  private readonly returning = new Set<Seat>()
  /** 판이 새로 시작될 때마다 늘어난다 (마감을 다시 잡을지 판단) */
  private roundSerial = 0
  private aiRounds = 0
  private busy = false
  private readonly rand: () => number
  private readonly now: () => number

  constructor(private readonly opts: GameOptions) {
    this.node = opts.startNode
    this.trail = [opts.startNode]
    this.controllers = { ...opts.controllers }
    this.rand = opts.rand ?? Math.random
    this.now = opts.now ?? Date.now
    this.startedAt = this.now()
  }

  private get graph() {
    return this.opts.source.graph
  }

  /** 도착했거나 제한을 다 써서 끝났다 */
  get finished() {
    return this.phase === 'ARRIVED' || this.phase === 'ENDED'
  }

  /** 시간 제한이 있으면 끝나는 시각 */
  get endsAt(): number | null {
    const limit = this.opts.limit
    return limit?.kind === 'time' ? this.startedAt + limit.minutes * 60_000 : null
  }

  private get limitReached() {
    const limit = this.opts.limit
    if (!limit) return false
    return limit.kind === 'time' ? this.now() >= this.endsAt! : this.rpsCount >= limit.count
  }

  private pos(id: NodeId): Vec2 {
    return this.graph.nodes.get(id)!
  }

  /** 도착 원에 들어선 지점 (길 중간일 수 있다). 도착하기 전에는 null */
  private endPoint: Vec2 | null = null

  /** 지금 서 있는 곳 */
  private here(): Vec2 {
    return this.endPoint ?? this.pos(this.node)
  }

  /** 지나온 길 (다시 들어온 사람에게 보여 줄 때) */
  trailPoints(): Point[] {
    const points = this.trail.map((id) => toPoint(this.pos(id)))
    if (this.endPoint) points.push(toPoint(this.endPoint))
    return points
  }

  controllerOf(seat: Seat): SeatController {
    return this.controllers[seat]
  }

  /** 이번 판에서 아직 안 낸 사람 자리 */
  waitingFor(): Seat[] {
    if (this.finished || this.paused) return []
    return this.participants.filter((s) => this.controllers[s] === 'user' && !this.hands[s])
  }

  /** 출발 방향은 무작위로 정하고 첫 가위바위보까지 진행한다 */
  begin(): Promise<GameEvent[]> {
    return this.exclusive(async (events) => {
      const neighbors = [...this.graph.adj.get(this.node)!]
      const via = neighbors[Math.floor(this.rand() * neighbors.length)]
      await this.move(via, 'start', undefined, events)
    })
  }

  /** 사람 자리의 선택. 이번 판의 사람이 다 냈으면 판정하고 이벤트를, 아직이면 null */
  async submit(seat: Seat, hand: Hand): Promise<GameEvent[] | null> {
    if (this.finished) throw new HttpError(409, '이미 끝난 게임입니다')
    if (this.busy || this.paused || !this.participants.includes(seat) || this.controllers[seat] !== 'user') {
      throw new HttpError(400, '이번 판에 낼 차례가 아닙니다')
    }
    if (this.hands[seat]) throw new HttpError(400, '이미 냈습니다')
    this.hands[seat] = hand
    if (this.waitingFor().length > 0) return null
    return this.exclusive((events) => this.resolveCurrent([], events))
  }

  /** 마감이 지났다: 안 낸 사람 자리는 AI로 바꾸고 대신 내서 판정한다 */
  timeout(): Promise<GameEvent[]> {
    return this.exclusive(async (events) => {
      const late = this.waitingFor()
      if (late.length === 0) return
      for (const seat of late) this.controllers[seat] = 'ai'
      await this.resolveCurrent(late, events)
    })
  }

  /** 시간 제한이 지났다: 낼 차례를 기다리던 중이어도 그 자리에서 끝낸다 */
  expire(): Promise<GameEvent[]> {
    return this.exclusive(async () => {
      if (this.finished || this.endsAt === null || this.now() < this.endsAt) return
      this.end()
    })
  }

  private end() {
    this.phase = 'ENDED'
    this.arrival = null
    this.participants = []
    this.hands = {}
    this.paused = false
  }

  /**
   * 자리 주인 바꾸기. 'user'(돌아옴)는 다음 판부터, 게임이 멈춰 있었으면 바로 이어받는다.
   * 'ai'(나감)는 바로 바뀌고, 그 사람만 기다리던 판이면 판정까지 한다.
   */
  setController(seat: Seat, controller: SeatController): Promise<GameEvent[]> {
    return this.exclusive(async (events) => {
      if (this.finished) return
      if (controller === 'user') {
        if (this.controllers[seat] === 'user') {
          this.returning.delete(seat)
          return
        }
        if (!this.paused) {
          this.returning.add(seat)
          return
        }
        this.controllers[seat] = 'user'
        this.paused = false
        this.roundSerial++
        // 멈춘 판에 돌아온 사람 자리가 없으면 AI끼리 바로 하고 넘어간다
        if (!this.participants.includes(seat)) await this.resolveCurrent([], events)
        return
      }
      this.returning.delete(seat)
      if (this.controllers[seat] === 'ai') return
      const wasWaiting = this.waitingFor().includes(seat)
      this.controllers[seat] = 'ai'
      if (wasWaiting && this.waitingFor().length === 0) await this.resolveCurrent([], events)
    })
  }

  snapshot(): GameSnapshot {
    const here = this.here()
    const waiting = !this.finished
    return {
      phase: this.phase,
      position: toPoint(here),
      stats: {
        rpsCount: this.rpsCount,
        distanceM: Math.round(this.distanceM),
        elapsedMs: this.now() - this.startedAt,
        remainingM: Math.round(distance(here, this.opts.destination)),
      },
      controllers: { ...this.controllers },
      returning: [...this.returning],
      paused: this.paused,
      rps: waiting
        ? {
            participants: this.participants,
            rematch: this.rematch,
            options: this.participants.map((seat) => {
              const direction = SEAT_DIRECTION[seat]
              const via = this.arrival!.options.find((o) => o.direction === direction)!.via
              return { seat, direction, toward: toPoint(this.pos(via)) }
            }),
            submitted: this.participants.filter((s) => !!this.hands[s]),
            timeLeftMs: this.paused ? RPS_TIMEOUT_MS : Math.max(0, this.deadline - this.now()),
          }
        : null,
    }
  }

  /** 겹쳐 실행되지 않게 하고, 새 판이 시작됐으면 연출 시간만큼 늦춰 마감을 정한다 */
  private async exclusive(run: (events: GameEvent[]) => Promise<void>): Promise<GameEvent[]> {
    if (this.busy) throw new HttpError(409, '이전 요청을 처리하는 중입니다')
    this.busy = true
    const serial = this.roundSerial
    try {
      const events: GameEvent[] = []
      this.aiRounds = 0
      await run(events)
      if (this.roundSerial !== serial) this.deadline = this.now() + playbackMs(events) + RPS_TIMEOUT_MS
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

      // 도착 원에 닿는 순간 끝난다: 길이 원을 처음 넘는 지점에서 멈춘다 (노드 사이여도)
      const entry = enterCircle(
        path.map((id) => this.pos(id)),
        this.opts.destination,
        this.opts.arrivalRadiusM,
      )
      if (entry) path = path.slice(0, entry.index + 1)

      const points = path.map((id) => this.pos(id))
      if (entry) {
        points.push(entry.point)
        this.endPoint = entry.point
      }
      let length = 0
      for (let k = 1; k < points.length; k++) length += distance(points[k - 1], points[k])
      this.distanceM += length
      this.trail.push(...path.slice(1))
      this.node = path[path.length - 1]
      events.push({ type: 'move', reason, direction, path: points.map(toPoint), distanceM: Math.round(length) })

      if (entry) {
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
    if (this.limitReached) return this.end()
    // 돌아온 사람은 새 판부터 이어받는다
    for (const seat of this.returning) this.controllers[seat] = 'user'
    this.returning.clear()

    this.participants = participants
    this.rematch = rematch
    this.hands = {}
    this.phase = rematch ? 'RPS_REMATCH' : 'RPS'
    this.roundSerial++

    if (!SEATS.some((s) => this.controllers[s] === 'user')) {
      // 사람이 아무도 없으면 누가 돌아올 때까지 멈춘다
      this.paused = true
      return
    }
    if (participants.some((s) => this.controllers[s] === 'user')) return

    // 사람이 빠진 판은 AI끼리 바로 한다
    if (++this.aiRounds > MAX_AI_ROUNDS) throw new Error('too many AI rounds')
    await this.resolveCurrent([], events)
  }

  /** 이번 판에서 사람이 안 낸 자리는 AI가 내고 판정한다 */
  private async resolveCurrent(timedOut: Seat[], events: GameEvent[]) {
    const hands: Partial<Record<Seat, Hand>> = {}
    for (const seat of this.participants) hands[seat] = this.hands[seat] ?? randomHand(this.rand)
    await this.resolve(hands, timedOut, events)
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

/**
 * 꺾은선 points를 따라가다 원(center, radius)에 처음 닿는 지점.
 * index는 그 지점 바로 앞 점. 출발점이 이미 원 안이면 무시한다 (첫 구간부터 본다)
 */
export function enterCircle(points: Vec2[], center: Vec2, radius: number): { index: number; point: Vec2 } | null {
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]
    const b = points[k]
    const fx = b.x - a.x
    const fy = b.y - a.y
    const gx = a.x - center.x
    const gy = a.y - center.y
    const A = fx * fx + fy * fy
    const B = 2 * (fx * gx + fy * gy)
    const C = gx * gx + gy * gy - radius * radius
    if (A === 0) continue
    const disc = B * B - 4 * A * C
    if (disc < 0) continue
    // 원에 들어가는 쪽 근 (a가 이미 안이면 a 자리)
    const t = C <= 0 ? 0 : (-B - Math.sqrt(disc)) / (2 * A)
    if (t < 0 || t > 1 || (k === 1 && C <= 0)) continue
    return { index: k - 1, point: { x: a.x + fx * t, y: a.y + fy * t } }
  }
  return null
}

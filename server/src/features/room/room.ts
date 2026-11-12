import type {
  EmoteId,
  GameIntro,
  GameUpdate,
  Hand,
  LatLng,
  Outfit,
  PlaceRef,
  Point,
  RoomJoined,
  RoomRules,
  RoomView,
  Seat,
  SeatController,
} from '@jikjwau/shared/types'
import { ACTIVE_HAND_WINDOW_MS, AI_OUTFIT, REWARD_MIN_HANDS, ROOM_EMPTY_GRACE_MS } from '@jikjwau/shared/config'
import { unproject } from '@jikjwau/shared/geo'
import { HttpError } from '../../common/http-error'
import { distance, project } from '../road/geo'
import { records } from '../record/record.store'
import { profiles } from '../profile/profile.store'
import { ghostEmote, ghostMoved, placeGhost, removeGhost } from '../ghost/ghosts'
import { SEATS, type Game } from '../game/game'
import { buildGame, checkDistance } from '../game/game.service'

/** 마감 직후 도착한 선택은 받아 준다 (네트워크 지연) */
const LATE_GRACE_MS = 3000

interface Player {
  id: string
  nickname: string
  seat: Seat
  /** 접속 중인 소켓 (끊기면 null) */
  socketId: string | null
  outfit: Outfit
  /** 이번 게임에서 직접 낸 가위바위보 수와 마지막으로 낸 때 (AI에게 맡겨 두고 보상 받기 방지) */
  hands: number
  lastHandAt: number
}

/** 방이 사람들에게 알릴 것. 소켓 계층이 채운다 */
export interface RoomOutput {
  state: (room: RoomView) => void
  intro: (intro: GameIntro) => void
  update: (update: GameUpdate) => void
  emote: (e: { seat: Seat; emote: EmoteId }) => void
}

export interface RoomOptions {
  code: string
  host: { id: string; nickname: string }
  start: PlaceRef
  destination: PlaceRef
  rules: RoomRules
  solo: boolean
  out: RoomOutput
  /** 사람이 아무도 남지 않았다. 방을 없앤다 */
  onEmpty: () => void
}

/**
 * 방 하나: 대기실(자리 배정), 게임 진행, 20초 타이머, 나가고 돌아오기.
 * 게임 판정은 Game이 하고, 여기서는 누가 어느 자리인지와 언제 알릴지를 맡는다.
 * 요청들이 겹치지 않도록 모든 변경은 run()으로 한 줄로 세운다.
 *
 * 접속한 사람이 아무도 없으면 잠깐(ROOM_EMPTY_GRACE_MS) 기다렸다가 방을 없앤다.
 * 하드코어는 중간 저장이 없어서, 모두 나가면 그 판은 그대로 사라진다.
 */
export class Room {
  readonly players = new Map<string, Player>()
  readonly code: string
  readonly start: PlaceRef
  readonly destination: PlaceRef
  readonly rules: RoomRules
  readonly solo: boolean
  hostId: string
  status: RoomView['status'] = 'lobby'
  recordId: string | null = null
  /** 끝난 게임에서 받은 코인 (playerId → 코인) */
  private rewards: Record<string, number> = {}

  private game: Game | null = null
  private intro: (() => GameIntro) | null = null
  private target: Point | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private emptyTimer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private readonly out: RoomOutput
  private readonly onEmpty: () => void

  constructor(opts: RoomOptions) {
    checkDistance(opts.start.latLng, opts.destination.latLng)
    this.code = opts.code
    this.start = opts.start
    this.destination = opts.destination
    this.rules = opts.rules
    this.solo = opts.solo
    this.out = opts.out
    this.onEmpty = opts.onEmpty
    this.hostId = opts.host.id
    this.players.set(opts.host.id, this.newPlayer(opts.host.id, opts.host.nickname, 'B', null))
  }

  private newPlayer(id: string, nickname: string, seat: Seat, socketId: string | null): Player {
    return { id, nickname, seat, socketId, outfit: AI_OUTFIT, hands: 0, lastHandAt: 0 }
  }

  /** 변경을 차례로 실행한다. 실패하면 그 요청에만 에러를 돌려준다 */
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const next = this.chain.then(fn)
    this.chain = next.catch(() => undefined)
    return next
  }

  view(): RoomView {
    return {
      code: this.code,
      hostId: this.hostId,
      start: this.start,
      destination: this.destination,
      players: [...this.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, seat: p.seat, connected: !!p.socketId, outfit: p.outfit })),
      status: this.status,
      rules: this.rules,
      solo: this.solo,
      recordId: this.recordId,
      rewards: this.rewards,
    }
  }

  /** 자리마다 옷. 사람이 있는 자리는 그 사람 옷, 빈 자리(AI)는 AI 옷 */
  private outfits(): Record<Seat, Outfit> {
    const bySeat = new Map([...this.players.values()].map((p) => [p.seat, p.outfit]))
    return Object.fromEntries(SEATS.map((s) => [s, bySeat.get(s) ?? AI_OUTFIT])) as Record<Seat, Outfit>
  }

  private toLatLng(p: Point): LatLng {
    return unproject({ x: p[0], y: p[1] }, this.start.latLng)
  }

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.socketId).length
  }

  private freeSeat(): Seat | undefined {
    const taken = new Set([...this.players.values()].map((p) => p.seat))
    // 직진(B)부터: 혼자 하면 가운데, 둘이면 좌·직
    return (['B', 'A', 'C'] as Seat[]).find((s) => !taken.has(s))
  }

  /** 들어오기 / 다시 들어오기. 게임 중이면 자리를 다시 맡는다 (진행 중인 판은 AI가 마무리) */
  async join(playerId: string, nickname: string, socketId: string): Promise<RoomJoined> {
    let player = this.players.get(playerId)
    if (!player) {
      if (this.solo) throw new HttpError(403, '혼자 하는 방이라 들어갈 수 없어요')
      const seat = this.freeSeat()
      if (!seat) throw new HttpError(409, '방이 가득 찼어요')
      player = this.newPlayer(playerId, nickname, seat, socketId)
      this.players.set(playerId, player)
    }
    player.socketId = socketId
    player.nickname = nickname
    // 옷장에서 갈아입었으면 들어올 때 반영된다
    try {
      player.outfit = profiles().outfit(playerId)
    } catch (err) {
      console.error('load outfit', err)
    }
    this.clearEmptyTimer()

    if (this.game && this.status === 'playing') {
      // 자리 주인(다음 판부터 돌아옴)이 바뀌었으니 모두에게 알린다
      this.afterGameChange(await this.game.setController(player.seat, 'user'), true)
    }
    this.out.state(this.view())
    return { room: this.view(), game: this.game && this.intro ? { intro: this.intro(), update: { events: [], snapshot: this.game.snapshot() } } : null }
  }

  /** 접속이 끊겼다. 자리는 그대로 두고, 시간 안에 안 내면 AI가 대신한다 */
  disconnect(playerId: string, socketId: string) {
    const player = this.players.get(playerId)
    if (!player || player.socketId !== socketId) return
    player.socketId = null
    this.out.state(this.view())
    this.checkEmpty()
  }

  /** 스스로 나갔다(포기). 게임 중이면 그 자리는 AI가 계속 맡는다 */
  async leave(playerId: string) {
    const player = this.players.get(playerId)
    if (!player) return
    this.players.delete(playerId)
    if (this.hostId === playerId) {
      const next = [...this.players.values()][0]
      if (next) this.hostId = next.id
    }
    if (this.players.size === 0) return this.onEmpty()
    if (this.game && this.status === 'playing') {
      this.afterGameChange(await this.game.setController(player.seat, 'ai'), true)
    }
    this.out.state(this.view())
    this.checkEmpty()
  }

  changeSeat(playerId: string, seat: Seat) {
    if (this.status !== 'lobby') throw new HttpError(409, '게임 중에는 자리를 바꿀 수 없어요')
    const player = this.players.get(playerId)
    if (!player) throw new HttpError(403, '방에 없는 사람입니다')
    if ([...this.players.values()].some((p) => p.seat === seat && p.id !== playerId)) throw new HttpError(409, '이미 다른 사람이 있는 자리예요')
    player.seat = seat
    this.out.state(this.view())
  }

  async startGame(playerId: string) {
    if (playerId !== this.hostId) throw new HttpError(403, '방장만 시작할 수 있어요')
    if (this.status === 'playing') throw new HttpError(409, '이미 시작했어요')
    const seated = new Set([...this.players.values()].map((p) => p.seat))
    const controllers = Object.fromEntries(SEATS.map((s) => [s, seated.has(s) ? 'user' : 'ai'])) as Record<Seat, SeatController>
    const limit = this.rules.mode === 'normal' ? this.rules.limit : undefined

    const { game, intro, target } = await buildGame(this.start.latLng, this.destination.latLng, controllers, limit)
    // 출발 지점에서 시작하는 모습으로 알린 다음 첫 이동을 보낸다
    const first = intro()
    this.game = game
    this.intro = intro
    this.target = target
    this.status = 'playing'
    this.recordId = null
    this.rewards = {}
    for (const p of this.players.values()) Object.assign(p, { hands: 0, lastHandAt: 0 })
    const events = await game.begin()
    this.out.state(this.view())
    this.out.intro(first)
    this.afterGameChange(events, true)
  }

  resetGame(playerId: string) {
    if (playerId !== this.hostId) throw new HttpError(403, '방장만 할 수 있어요')
    this.clearTimer()
    this.game = null
    this.intro = null
    this.status = 'lobby'
    this.recordId = null
    this.rewards = {}
    removeGhost(this.code)
    this.out.state(this.view())
  }

  async choose(playerId: string, hand: Hand) {
    const player = this.players.get(playerId)
    if (!player) throw new HttpError(403, '방에 없는 사람입니다')
    if (!this.game || this.status !== 'playing') throw new HttpError(409, '진행 중인 게임이 없어요')
    const events = await this.game.submit(player.seat, hand)
    player.hands++
    player.lastHandAt = Date.now()
    try {
      profiles().addStat(playerId, 'rps')
    } catch (err) {
      console.error('count rps', err)
    }
    this.afterGameChange(events ?? [], true)
  }

  /** 게임 중이나 끝난 뒤 이모티콘. 같은 방과 근처 다른 방에 보인다 */
  emote(playerId: string, emote: EmoteId) {
    const player = this.players.get(playerId)
    if (!player || this.status === 'lobby') return
    this.out.emote({ seat: player.seat, emote })
    ghostEmote(this.code, player.seat, emote)
  }

  /** 1분마다: 최근에 직접 낸 적이 있는 사람만 게임한 시간을 센다 */
  tickMinute(now = Date.now()) {
    if (this.status !== 'playing') return
    for (const p of this.players.values()) {
      if (!p.socketId || now - p.lastHandAt > ACTIVE_HAND_WINDOW_MS) continue
      try {
        profiles().addStat(p.id, 'minutes', 1, now)
      } catch (err) {
        console.error('count minutes', err)
      }
    }
  }

  /** 시간이 지나 AI로 바뀐 내 자리를 다시 맡는다 (다음 판부터) */
  async returnToSeat(playerId: string) {
    const player = this.players.get(playerId)
    if (!player || !this.game || this.status !== 'playing') return
    this.afterGameChange(await this.game.setController(player.seat, 'user'), true)
  }

  /** 게임이 바뀌었으면 모두에게 알리고, 끝났는지·다음 마감은 언제인지 정리한다 */
  private afterGameChange(events: Array<GameUpdate['events'][number]>, always = false) {
    const game = this.game
    if (!game) return
    this.shareGhost(events)
    if (game.finished && this.status === 'playing') {
      this.status = 'ended'
      this.clearTimer()
      this.saveRecord(game)
      this.giveRewards(game)
    }
    if (events.length > 0 || always) this.out.update({ events, snapshot: game.snapshot() })
    if (this.status === 'ended') {
      this.out.state(this.view())
      return
    }
    this.armTimer()
  }

  /** 근처 다른 방에 우리 일행이 걸어간 길과 지금 위치를 알린다. 끝나면 사라진다 */
  private shareGhost(events: Array<GameUpdate['events'][number]>) {
    const game = this.game
    if (!game) return
    if (game.finished) return removeGhost(this.code)
    const here = this.toLatLng(game.snapshot().position)
    const path: Point[] = []
    for (const e of events) if (e.type === 'move') path.push(...(path.length > 0 ? e.path.slice(1) : e.path))
    placeGhost(this.code, path.length > 0 ? this.toLatLng(path[0]) : here, this.outfits())
    if (path.length > 1) ghostMoved(this.code, path.map((p) => this.toLatLng(p)))
    placeGhost(this.code, here, this.outfits())
  }

  /** 끝까지 함께한 사람(직접 몇 번은 낸 사람)에게 미션 진행과 클리어 보상 */
  private giveRewards(game: Game) {
    const arrived = game.snapshot().phase === 'ARRIVED'
    for (const p of this.players.values()) {
      if (p.hands < REWARD_MIN_HANDS) continue
      try {
        this.rewards[p.id] = profiles().finishGame(p.id, { rules: this.rules, arrived })
      } catch (err) {
        console.error('give reward', err)
      }
    }
  }

  /** 끝난 판을 방에 남아 있는 사람들의 기록실에 남긴다 */
  private saveRecord(game: Game) {
    try {
      const { stats, phase } = game.snapshot()
      const straight = distance({ x: 0, y: 0 }, project(this.destination.latLng, this.start.latLng))
      const record = records().save({
        rules: this.rules,
        solo: this.solo,
        players: [...this.players.values()].map((p) => ({ id: p.id, nickname: p.nickname })),
        start: this.start,
        destination: this.destination,
        straightM: Math.round(straight),
        distanceM: stats.distanceM,
        rpsCount: stats.rpsCount,
        elapsedMs: stats.elapsedMs,
        arrived: phase === 'ARRIVED',
        remainingM: phase === 'ARRIVED' ? 0 : stats.remainingM,
        finishedAt: Date.now(),
        trail: game.trailPoints(),
        target: this.target ?? [0, 0],
      })
      this.recordId = record.id
    } catch (err) {
      // 기록을 못 남겨도 게임 결과는 보여 준다
      console.error('save record', err)
    }
  }

  /** 다음에 깨어날 때: 가위바위보 마감 또는 시간 제한 중 먼저 오는 것 */
  private armTimer() {
    this.clearTimer()
    const game = this.game
    if (!game || game.finished) return
    const deadline = !game.paused && game.waitingFor().length > 0 ? game.deadline + LATE_GRACE_MS : Infinity
    const wakeAt = Math.min(deadline, game.endsAt ?? Infinity)
    if (wakeAt === Infinity) return
    this.timer = setTimeout(
      () => {
        this.timer = null
        this.run(async () => {
          if (this.game !== game || game.finished) return
          const now = Date.now()
          if (game.endsAt !== null && now >= game.endsAt) return this.afterGameChange(await game.expire(), true)
          if (now < game.deadline + LATE_GRACE_MS) return this.armTimer()
          this.afterGameChange(await game.timeout(), true)
        }).catch((err) => console.error('room timer', err))
      },
      Math.max(0, wakeAt - Date.now()),
    )
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** 접속한 사람이 없으면 잠깐 기다렸다가 방을 없앤다 (그 사이 누가 돌아오면 취소) */
  private checkEmpty() {
    if (this.connectedCount > 0 || this.emptyTimer) return
    this.emptyTimer = setTimeout(() => {
      this.emptyTimer = null
      if (this.connectedCount === 0) this.onEmpty()
    }, ROOM_EMPTY_GRACE_MS)
  }

  private clearEmptyTimer() {
    if (this.emptyTimer) clearTimeout(this.emptyTimer)
    this.emptyTimer = null
  }

  dispose() {
    removeGhost(this.code)
    this.clearTimer()
    this.clearEmptyTimer()
  }
}

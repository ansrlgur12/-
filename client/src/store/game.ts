import { create } from 'zustand'
import type {
  CreateGameResponse,
  GameEvent,
  GameSnapshot,
  Hand,
  LatLng,
  Point,
  RpsPrompt,
  RpsRoundResult,
  Seat,
} from '@jikjwau/shared/types'
import { RPS_RESULT_SHOW_MS } from '@jikjwau/shared/config'
import { chooseRps, createGame } from '../api/game'
import { useMapTiles } from './mapTiles'

/**
 * Phase 2 싱글 플레이: 나 + AI 2명.
 * 판정은 모두 서버가 하고, 앱은 받은 이벤트(가위바위보 결과, 이동)를 차례로 연출한다.
 */

export type GameStatus = 'setup' | 'starting' | 'playing' | 'arrived'

export interface GameInfo {
  gameId: string
  seat: Seat
  destination: CreateGameResponse['destination']
  /** 서버 시작 시각을 이 기기 시계로 옮긴 값 (경과 시간 표시용) */
  startedAt: number
}

/** 지도에서 고르거나 검색한 위치 */
export interface Spot {
  latLng: LatLng
  name: string
  address?: string
}

interface GameState {
  status: GameStatus
  error?: string
  /** 설정 화면에서 고른 값. 게임(과 지도 타일) 좌표의 origin은 출발지다 */
  start: Spot
  destination: Spot | null
  seat: Seat
  /** 길게 누르거나 검색해서 고른, 출발/도착으로 정하기 전의 위치 */
  picked: Spot | null

  game?: GameInfo
  /** 일행이 서 있는 곳 (이동 중이면 출발한 곳) */
  position: Point
  /** 지나온 길 */
  trail: Point[]
  /** 지금 연출 중인 이벤트 */
  current: GameEvent | null
  /** 화면에 보이는 횟수·거리 (연출에 맞춰 늘어난다) */
  rpsCount: number
  distanceM: number
  /** 내가 낼 차례. deadline은 이 기기 시계 기준 */
  prompt: (RpsPrompt & { deadline: number }) | null
  /** 선택을 보내는 중 */
  sending: boolean
  lastResult: RpsRoundResult | null
  /** 도착했을 때 서버 기준 플레이 시간 */
  finalElapsedMs?: number

  setPicked: (spot: Spot | null) => void
  setStart: (start: Spot) => void
  setDestination: (destination: Spot | null) => void
  setSeat: (seat: Seat) => void
  startGame: () => Promise<void>
  choose: (hand: Hand | null) => Promise<void>
  /** Party가 이동 애니메이션을 끝내면 부른다 */
  finishMove: () => void
  backToSetup: () => void
}

// 기본 출발지: 망원역
const DEFAULT_START: Spot = { latLng: { lat: 37.556, lng: 126.9101 }, name: '망원역' }

/** 새 게임이나 설정 화면으로 돌아가면 바뀌어서, 이전 연출 타이머를 무시하게 한다 */
let token = 0
let queue: GameEvent[] = []
let pending: { snapshot: GameSnapshot; receivedAt: number } | null = null

export const useGame = create<GameState>((set, get) => {
  /** 다음 이벤트를 연출한다. 다 끝나면 서버 스냅샷을 반영한다 */
  const advance = () => {
    const next = queue.shift()
    if (next?.type === 'rps') {
      const t = token
      set((s) => ({ current: next, lastResult: next.result, rpsCount: s.rpsCount + 1 }))
      setTimeout(() => t === token && advance(), RPS_RESULT_SHOW_MS)
      return
    }
    if (next?.type === 'move') {
      set({ current: next })
      return
    }
    if (!pending) return
    const { snapshot, receivedAt } = pending
    pending = null
    set({
      current: null,
      status: snapshot.phase === 'ARRIVED' ? 'arrived' : 'playing',
      position: snapshot.position,
      rpsCount: snapshot.stats.rpsCount,
      distanceM: snapshot.stats.distanceM,
      prompt: snapshot.rps ? { ...snapshot.rps, deadline: receivedAt + snapshot.rps.timeLeftMs } : null,
      finalElapsedMs: snapshot.phase === 'ARRIVED' ? snapshot.stats.elapsedMs : undefined,
    })
  }

  const play = (events: GameEvent[], snapshot: GameSnapshot) => {
    queue = [...events]
    pending = { snapshot, receivedAt: Date.now() }
    advance()
  }

  return {
    status: 'setup',
    start: DEFAULT_START,
    destination: null,
    seat: 'B',
    picked: null,
    position: [0, 0],
    trail: [],
    current: null,
    rpsCount: 0,
    distanceM: 0,
    prompt: null,
    sending: false,
    lastResult: null,

    setPicked: (picked) => set({ picked }),
    setStart(start) {
      // 출발지가 바뀌면 이전 목적지와의 거리 제한이 달라지므로 목적지는 그대로 두고 다시 검사한다
      set({ start, picked: null, error: undefined })
      useMapTiles.getState().reset(start.latLng)
    },
    setDestination: (destination) => set({ destination, picked: null, error: undefined }),
    setSeat: (seat) => set({ seat }),

    async startGame() {
      const { start, destination, seat, status } = get()
      if (!destination || status === 'starting') return
      const t = ++token
      set({ status: 'starting', error: undefined })
      try {
        const res = await createGame({ start: start.latLng, destination: destination.latLng, seat })
        if (t !== token) return
        if (useMapTiles.getState().origin !== start.latLng) useMapTiles.getState().reset(res.origin)
        set({
          game: {
            gameId: res.gameId,
            seat: res.seat,
            destination: res.destination,
            startedAt: Date.now() - res.snapshot.stats.elapsedMs,
          },
          status: 'playing',
          position: res.start,
          trail: [res.start],
          rpsCount: 0,
          distanceM: 0,
          prompt: null,
          lastResult: null,
          finalElapsedMs: undefined,
        })
        play(res.events, res.snapshot)
      } catch (err) {
        if (t === token) set({ status: 'setup', error: (err as Error).message })
      }
    },

    async choose(hand) {
      const { game, prompt, sending } = get()
      if (!game || !prompt || sending) return
      const t = token
      set({ sending: true, error: undefined })
      try {
        const res = await chooseRps(game.gameId, hand)
        if (t !== token) return
        set({ sending: false, prompt: null })
        play(res.events, res.snapshot)
      } catch (err) {
        if (t === token) set({ sending: false, error: (err as Error).message })
      }
    },

    finishMove() {
      const { current } = get()
      if (current?.type !== 'move') return
      const end = current.path[current.path.length - 1]
      set((s) => ({ position: end, trail: [...s.trail, ...current.path.slice(1)], distanceM: s.distanceM + current.distanceM }))
      advance()
    },

    backToSetup() {
      token++
      queue = []
      pending = null
      set({ status: 'setup', game: undefined, picked: null, current: null, prompt: null, sending: false, lastResult: null, trail: [], position: [0, 0] })
    },
  }
})

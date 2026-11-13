import { create } from 'zustand'
import type {
  AckResult,
  GameEvent,
  GameIntro,
  GameSnapshot,
  GameUpdate,
  Hand,
  LatLng,
  Point,
  RoomJoined,
  RoomRules,
  RoomView,
  RpsRoundResult,
  Seat,
} from '@jikjwau/shared/types'
import { RPS_CHANT_MS, RPS_RESULT_SHOW_MS } from '@jikjwau/shared/config'
import { request, socket } from '../api/socket'
import { reversePlace } from '../api/place'
import { fetchSpotCheck } from '../api/map'
import { loadRegion } from '../map/region'
import { loadIdentity, saveIdentity } from '../lib/identity'
import { playEffect } from '../lib/sound'
import { useMapTiles } from './mapTiles'
import { useSocial } from './social'

/**
 * 화면과 방·게임 상태. 판정은 모두 서버가 하고, 앱은 받은 이벤트(가위바위보 결과, 이동)를 차례로 연출한다.
 * 화면: loading → menu(혼자/멀티/기록실) → game 또는 records
 * game 안에서: setup(출발·도착 고르기) → lobby(대기실, 혼자면 바로 시작) → playing → ended(도착 또는 제한 끝)
 */

export type Screen = 'loading' | 'menu' | 'records' | 'closet' | 'game'
export type GameStatus = 'setup' | 'lobby' | 'playing' | 'ended'

/** 메뉴에서 고른 것: 혼자인지, 어떤 규칙인지 */
export interface Plan {
  solo: boolean
  rules: RoomRules
  /** 혼자 하기에서 내가 맡을 자리(방향). 없으면 직진(B) */
  seat?: Seat
}

/** 지도에서 고르거나 검색한 위치 */
export interface Spot {
  latLng: LatLng
  name: string
  address?: string
  /** 이름을 서버에서 찾는 중 */
  resolving?: boolean
  /**
   * 가장 가까운 (본토와 걸어서 이어진) 길까지 거리(m). 확인 중이면 'checking'.
   * 못 쓰는 곳이면 이유: 'none' 300m 안에 길 없음, 'island' 걸어서 못 가는 섬, 'abroad' 대한민국 밖
   */
  road?: number | 'checking' | 'none' | 'island' | 'abroad'
}

/** 출발지·목적지를 고르는 전체 화면 창 */
export type PlaceSheet = 'start' | 'destination' | null

export interface GameInfo {
  destination: GameIntro['destination']
  /** 서버 시작 시각을 이 기기 시계로 옮긴 값 (경과 시간 표시용) */
  startedAt: number
}

interface GameState {
  screen: Screen
  /** 방을 만들 때 쓸 규칙 (메뉴에서 고른다) */
  plan: Plan | null
  status: GameStatus
  error?: string
  /** 요청을 보내는 중 (버튼 잠금) */
  busy: boolean
  playerId?: string
  nickname: string

  /** 설정 화면에서 고른 값. 방에 들어가면 방의 출발·도착으로 바뀐다. 지도 좌표 origin은 출발지 */
  start: Spot
  destination: Spot | null
  /** 길게 누르거나 검색해서 고른, 출발/도착으로 정하기 전의 위치 */
  picked: Spot | null

  room: RoomView | null
  game?: GameInfo
  /** 서버가 알려 준 마지막 상태 (연출이 다 끝난 뒤 반영한다) */
  snapshot: GameSnapshot | null
  /** 지금 반영된 스냅샷의 rps 마감 (이 기기 시계) */
  deadline: number
  /** 일행이 서 있는 곳 (이동 중이면 출발한 곳) */
  position: Point
  /** 지나온 길 */
  trail: Point[]
  /** 지금 연출 중인 이벤트 */
  current: GameEvent | null
  /** 화면에 보이는 횟수·거리 (연출에 맞춰 늘어난다) */
  rpsCount: number
  distanceM: number
  lastResult: RpsRoundResult | null
  /** 이번 판에서 막 도착한 시각 (도착 연출을 띄운다). 끝난 방에 다시 들어온 경우는 null */
  arrivedAt: number | null
  /** 이번 판에서 막 실패한 시각 (시간·횟수를 다 써서 끝남. 실패 연출을 띄운다) */
  failedAt: number | null
  /** 이번 판에 내가 낸 손 (결과가 나오면 지운다) */
  myHand: Hand | null
  /** 끝났을 때 서버 기준 플레이 시간 */
  finalElapsedMs?: number

  /** 저장된 신원을 읽고 서버에 연결한다. 하던 방에 돌아갔으면 true */
  init: () => Promise<boolean>
  setScreen: (screen: Screen) => void
  /** 메뉴에서 혼자/멀티와 규칙을 고르고 출발·도착 고르기로 */
  openSetup: (plan: Plan) => void
  /** 혼자 하기: 내가 맡을 방향 고르기 */
  setSoloSeat: (seat: Seat) => void
  setNickname: (nickname: string) => void
  setPicked: (spot: Spot | null) => void
  /** 이번 판 출발지를 직접 골랐는지 (고르기 전 start는 지도 기준점일 뿐) */
  startChosen: boolean
  placeSheet: PlaceSheet
  setPlaceSheet: (sheet: PlaceSheet) => void
  /** 지도에서 고른 지점: 핀을 꽂고 근처 대표 장소 이름을 찾아 붙인다 */
  pickPoint: (latLng: LatLng) => void
  setStart: (start: Spot) => void
  setDestination: (destination: Spot | null) => void
  createRoom: () => Promise<void>
  joinRoom: (code: string) => Promise<void>
  leaveRoom: () => void
  changeSeat: (seat: Seat) => Promise<void>
  startGame: () => Promise<void>
  resetGame: () => Promise<void>
  /** 혼자 하기: 같은 코스로 다시 */
  restartSolo: () => Promise<void>
  choose: (hand: Hand) => Promise<void>
  returnToSeat: () => Promise<void>
  /** Party가 이동 애니메이션을 끝내면 부른다 */
  finishMove: () => void
}

/** 출발지를 고르기 전 지도 기준점 (서울시청). 출발지로 쓰지는 않는다 */
const DEFAULT_START: Spot = { latLng: { lat: 37.5663, lng: 126.9779 }, name: '서울시청' }

/** 방을 바꾸거나 새 게임이 시작되면 바뀌어서, 이전 연출 타이머를 무시하게 한다 */
let token = 0
let queue: GameEvent[] = []
let pending: { snapshot: GameSnapshot; receivedAt: number } | null = null

const sameLatLng = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng
/** 서버 연결을 기다리는 최대 시간 (로딩 화면) */
const CONNECT_WAIT_MS = 4000

function waitConnected() {
  if (socket.connected) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer)
      socket.off('connect', onConnect)
      resolve(ok)
    }
    const onConnect = () => done(true)
    const timer = setTimeout(() => done(false), CONNECT_WAIT_MS)
    socket.on('connect', onConnect)
  })
}

export const useGame = create<GameState>((set, get) => {
  /** 고른 곳 가까이에 걸을 수 있는 길이 있는지 서버에 묻는다. 그 사이 다른 곳을 골랐으면 버린다 */
  const checkRoad = (kind: 'start' | 'destination', latLng: LatLng) => {
    fetchSpotCheck(latLng)
      .then((r) => (r.road ? r.road.distanceM : (r.reason ?? 'none')))
      .catch(() => undefined)
      .then((road) => {
        const spot = get()[kind]
        if (spot && sameLatLng(spot.latLng, latLng)) set({ [kind]: { ...spot, road } } as Partial<GameState>)
      })
  }

  /** 다음 이벤트를 연출한다. 다 끝나면 서버 스냅샷을 반영한다 */
  const mySeat = () => {
    const { room, playerId } = get()
    return room?.players.find((p) => p.id === playerId)?.seat
  }

  const advance = () => {
    const next = queue.shift()
    if (next?.type === 'rps') {
      const t = token
      const { winners } = next.result
      // 효과음은 "가위! 바위! 보!"를 다 외치고 손을 공개할 때
      const effect = winners.length === 1 && winners[0] === mySeat() ? 'win' : 'result'
      setTimeout(() => t === token && playEffect(effect), RPS_CHANT_MS)
      set((s) => ({ current: next, lastResult: next.result, myHand: null, rpsCount: s.rpsCount + 1 }))
      setTimeout(() => t === token && advance(), RPS_RESULT_SHOW_MS)
      return
    }
    if (next?.type === 'move') {
      set({ current: next })
      return
    }
    set({ current: null })
    applyPending()
  }

  const applyPending = () => {
    if (!pending) return
    const { snapshot, receivedAt } = pending
    pending = null
    const ended = snapshot.phase === 'ARRIVED' || snapshot.phase === 'ENDED'
    const justEnded = ended && get().status === 'playing'
    if (justEnded) playEffect(snapshot.phase === 'ARRIVED' ? 'arrive' : 'end')
    if (justEnded) set(snapshot.phase === 'ARRIVED' ? { arrivedAt: Date.now() } : { failedAt: Date.now() })
    set({
      status: ended ? 'ended' : 'playing',
      snapshot,
      deadline: snapshot.rps ? receivedAt + snapshot.rps.timeLeftMs : 0,
      position: snapshot.position,
      rpsCount: snapshot.stats.rpsCount,
      distanceM: snapshot.stats.distanceM,
      finalElapsedMs: ended ? snapshot.stats.elapsedMs : undefined,
    })
  }

  /** 서버에서 온 갱신. 연출 중이면 뒤에 이어 붙인다 */
  const onUpdate = ({ events, snapshot }: GameUpdate) => {
    pending = { snapshot, receivedAt: Date.now() }
    const idle = !get().current && queue.length === 0
    queue.push(...events)
    if (idle) advance()
  }

  /** 게임 시작 또는 진행 중에 들어왔을 때. 지나간 일은 연출하지 않고 지금 모습으로 맞춘다 */
  const onIntro = (intro: GameIntro) => {
    token++
    useSocial.getState().clear()
    queue = []
    pending = null
    const origin = useMapTiles.getState().origin
    if (!origin || !sameLatLng(origin, intro.origin)) useMapTiles.getState().reset(intro.origin)
    const here = intro.trail[intro.trail.length - 1]
    set({
      game: { destination: intro.destination, startedAt: Date.now() - intro.elapsedMs },
      status: 'playing',
      position: here,
      trail: intro.trail,
      current: null,
      snapshot: null,
      rpsCount: 0,
      distanceM: 0,
      lastResult: null,
      myHand: null,
      finalElapsedMs: undefined,
      arrivedAt: null,
      failedAt: null,
    })
  }

  const onRoom = (room: RoomView) => {
    const s = get()
    // 대기실로 돌아왔다 (방장이 다시 하기)
    const back = room.status === 'lobby' && (s.status === 'playing' || s.status === 'ended')
    if (back) {
      token++
      queue = []
      pending = null
    }
    set({
      room,
      destination: { latLng: room.destination.latLng, name: room.destination.name },
      ...(back ? { status: 'lobby' as const, game: undefined, snapshot: null, current: null, trail: [], position: [0, 0] as Point } : {}),
    })
    if (!sameLatLng(s.start.latLng, room.start.latLng)) get().setStart({ latLng: room.start.latLng, name: room.start.name })
  }

  const entered = (res: RoomJoined) => {
    saveIdentity({ lastRoom: res.room.code })
    set({ picked: null, screen: 'game', plan: { solo: res.room.solo, rules: res.room.rules } })
    onRoom(res.room)
    if (res.game) {
      onIntro(res.game.intro)
      onUpdate(res.game.update)
    } else {
      set({ status: 'lobby', game: undefined, snapshot: null, trail: [], position: [0, 0] })
    }
  }

  socket.on('room:state', onRoom)
  socket.on('game:intro', onIntro)
  socket.on('game:update', onUpdate)
  // 끊겼다 다시 붙으면 하던 방으로 돌아간다 (서버가 지금 상태를 다시 보내 준다)
  socket.on('connect', () => {
    const { room, playerId, nickname } = get()
    if (!room || !playerId) return
    request<RoomJoined>((ack) => socket.emit('room:join', { code: room.code, playerId, nickname: nickname.trim() }, ack))
      .then(entered)
      .catch(() => {
        // 그 사이 모두 나가서 방이 없어졌다 (하드코어는 중간 저장이 없다)
        get().leaveRoom()
        set({ error: '연결이 끊긴 사이 방이 없어졌어요' })
      })
  })

  /** 요청 하나를 보내는 동안 busy로 두고, 실패하면 error에 보여 준다 */
  const guarded = async (run: () => Promise<void>) => {
    if (get().busy) return
    set({ busy: true, error: undefined })
    try {
      await run()
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ busy: false })
    }
  }

  const send = (emit: (ack: (res: AckResult) => void) => void) => guarded(() => request(emit).then(() => undefined))

  return {
    screen: 'loading',
    plan: null,
    status: 'setup',
    busy: false,
    nickname: '',
    start: DEFAULT_START,
    startChosen: false,
    placeSheet: null,
    destination: null,
    picked: null,
    room: null,
    snapshot: null,
    deadline: 0,
    position: [0, 0],
    trail: [],
    current: null,
    rpsCount: 0,
    distanceM: 0,
    lastResult: null,
    myHand: null,
    arrivedAt: null,
    failedAt: null,

    async init() {
      const identity = await loadIdentity()
      set({ playerId: identity.playerId, nickname: identity.nickname })
      useMapTiles.getState().reset(get().start.latLng)
      // 지도를 보여 줄 대한민국 영역은 연결을 기다리는 동안 받아 둔다
      const region = loadRegion()
      socket.connect()
      const connected = await waitConnected()
      await region
      if (!connected) return false
      // 앱이 꺼지기 전 하던 방이 아직 있으면 돌아간다 (모두 나가서 방이 없어졌으면 못 돌아간다)
      if (identity.lastRoom && identity.nickname) {
        try {
          entered(
            await request<RoomJoined>((ack) =>
              socket.emit('room:join', { code: identity.lastRoom!, playerId: identity.playerId, nickname: identity.nickname }, ack),
            ),
          )
          return true
        } catch {
          saveIdentity({ lastRoom: null })
        }
      }
      return false
    },

    setScreen: (screen) => set({ screen, error: undefined }),
    // 게임 준비: 출발지부터 고르는 창을 띄운다
    openSetup: (plan) => set({ plan, screen: 'game', status: 'setup', destination: null, picked: null, error: undefined, startChosen: false, placeSheet: 'start' }),
    setPlaceSheet: (placeSheet) => set({ placeSheet }),
    setSoloSeat: (seat) => set((s) => (s.plan ? { plan: { ...s.plan, seat } } : {})),

    setNickname(nickname) {
      set({ nickname })
      saveIdentity({ nickname: nickname.trim() })
    },

    setPicked: (picked) => set({ picked }),
    pickPoint(latLng) {
      set({ picked: { latLng, name: '근처 장소 이름을 찾는 중…', resolving: true } })
      const fallback = `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`
      reversePlace(latLng)
        .then((p) => ({ name: p.name, address: p.address }))
        .catch(() => ({ name: fallback, address: '이름을 찾지 못했어요' }))
        .then((found) => {
          // 그 사이 핀을 또 옮겼으면 버린다
          const picked = get().picked
          if (picked && sameLatLng(picked.latLng, latLng)) set({ picked: { latLng, ...found } })
        })
    },
    setStart(start) {
      set({ start: { ...start, road: 'checking' }, startChosen: true, picked: null, error: undefined })
      useMapTiles.getState().reset(start.latLng)
      checkRoad('start', start.latLng)
    },
    setDestination(destination) {
      set({ destination: destination && { ...destination, road: 'checking' }, picked: null, error: undefined })
      if (destination) checkRoad('destination', destination.latLng)
    },

    createRoom: () =>
      guarded(async () => {
        const { playerId, nickname, start, startChosen, destination, plan } = get()
        if (!playerId || !startChosen || !destination || !plan) return
        if (!nickname.trim()) throw new Error('닉네임을 입력해 주세요')
        entered(
          await request<RoomJoined>((ack) =>
            socket.emit(
              'room:create',
              {
                playerId,
                nickname: nickname.trim(),
                start: { latLng: start.latLng, name: start.name },
                destination: { latLng: destination.latLng, name: destination.name },
                rules: plan.rules,
                solo: plan.solo,
              },
              ack,
            ),
          ),
        )
        // 혼자 하기는 대기실 없이 바로 출발한다
        if (plan.solo) {
          // 고른 방향 자리로 옮긴 다음 출발 (서버는 처음에 직진 자리에 앉힌다)
          const seat = plan.seat
          if (seat && seat !== 'B') await request((ack) => socket.emit('room:seat', { seat }, ack))
          await request((ack) => socket.emit('game:start', ack))
        }
      }),

    joinRoom: (code) =>
      guarded(async () => {
        const { playerId, nickname } = get()
        if (!playerId) return
        if (!nickname.trim()) throw new Error('닉네임을 입력해 주세요')
        entered(
          await request<RoomJoined>((ack) => socket.emit('room:join', { code: code.trim().toUpperCase(), playerId, nickname: nickname.trim() }, ack)),
        )
      }),

    leaveRoom() {
      socket.emit('room:leave')
      useSocial.getState().clear()
      saveIdentity({ lastRoom: null })
      token++
      queue = []
      pending = null
      set({
        screen: 'menu',
        status: 'setup',
        room: null,
        game: undefined,
        snapshot: null,
        current: null,
        picked: null,
        destination: null,
        trail: [],
        position: [0, 0],
        error: undefined,
      })
    },

    changeSeat: (seat) => send((ack) => socket.emit('room:seat', { seat }, ack)),
    startGame: () => send((ack) => socket.emit('game:start', ack)),
    resetGame: () => send((ack) => socket.emit('game:reset', ack)),
    restartSolo: () =>
      guarded(async () => {
        await request((ack) => socket.emit('game:reset', ack))
        await request((ack) => socket.emit('game:start', ack))
      }),
    choose: (hand) => {
      set({ myHand: hand })
      return send((ack) => socket.emit('rps:choose', { hand }, ack))
    },
    returnToSeat: () => send((ack) => socket.emit('seat:return', ack)),

    finishMove() {
      const { current } = get()
      if (current?.type !== 'move') return
      const end = current.path[current.path.length - 1]
      set((s) => ({ position: end, trail: [...s.trail, ...current.path.slice(1)], distanceM: s.distanceM + current.distanceM }))
      advance()
    },
  }
})

/** 방에서 내 자리 */
export function useMySeat(): Seat | undefined {
  return useGame((s) => s.room?.players.find((p) => p.id === s.playerId)?.seat)
}

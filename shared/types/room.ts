import type { Hand, LatLng, Seat } from './game'
import type { GameIntro, GameUpdate } from './play'
import type { Outfit } from './profile'
import type { EmoteId, GhostView } from './social'

/** 검색하거나 지도에서 고른 장소 */
export interface PlaceRef {
  latLng: LatLng
  name: string
}

/** 일반 모드의 제한: 시간(분) 또는 가위바위보 횟수. 다 쓰면 그 자리에서 끝난다 */
export type NormalLimit = { kind: 'time'; minutes: number } | { kind: 'rps'; count: number }

/** 하드코어: 제한 없이 도착할 때까지 (포기만 할 수 있다). 일반: 제한 안에서 얼마나 가까이 가는지 */
export type RoomRules = { mode: 'hardcore' } | { mode: 'normal'; limit: NormalLimit }

export interface RoomPlayer {
  id: string
  nickname: string
  seat: Seat
  /** 지금 접속해 있는지 */
  connected: boolean
  outfit: Outfit
}

export interface RoomView {
  /** 초대 코드 */
  code: string
  hostId: string
  start: PlaceRef
  destination: PlaceRef
  players: RoomPlayer[]
  status: 'lobby' | 'playing' | 'ended'
  rules: RoomRules
  /** 혼자 하는 방 (다른 사람은 들어올 수 없고, 빈 자리는 AI) */
  solo: boolean
  /** 끝난 게임의 기록 id (기록실에 저장됨) */
  recordId: string | null
  /** 끝난 게임에서 사람마다 받은 코인 (playerId → 코인) */
  rewards: Record<string, number>
}

export type AckResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }
type Ack<T = object> = (res: AckResult<T>) => void

/** 방에 들어가면(다시 들어와도) 받는 것. 게임 중이면 game이 있다 */
export interface RoomJoined {
  room: RoomView
  game: { intro: GameIntro; update: GameUpdate } | null
}

export interface ClientToServerEvents {
  'room:create': (
    req: { playerId: string; nickname: string; start: PlaceRef; destination: PlaceRef; rules: RoomRules; solo: boolean },
    ack: Ack<RoomJoined>,
  ) => void
  /** 처음 들어오기와 다시 들어오기(재접속) 모두 */
  'room:join': (req: { code: string; playerId: string; nickname: string }, ack: Ack<RoomJoined>) => void
  'room:leave': () => void
  /** 대기실에서 빈 자리로 옮기기 */
  'room:seat': (req: { seat: Seat }, ack: Ack) => void
  /** 방장만. 빈 자리는 AI가 맡는다 */
  'game:start': (ack: Ack) => void
  /** 방장만. 끝난 게임에서 대기실로 */
  'game:reset': (ack: Ack) => void
  'rps:choose': (req: { hand: Hand }, ack: Ack) => void
  /** AI가 대신하던 내 자리를 다시 맡기 (다음 판부터) */
  'seat:return': (ack: Ack) => void
  /** 게임 중 이모티콘. 같은 방과 근처 다른 방에 보인다 */
  'emote:send': (req: { emote: EmoteId }) => void
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void
  'game:intro': (intro: GameIntro) => void
  'game:update': (update: GameUpdate) => void
  'emote': (e: { seat: Seat; emote: EmoteId }) => void
  /** 근처 다른 방 일행 (주기적으로 전체 목록) */
  'ghost:list': (ghosts: GhostView[]) => void
  /** 다른 방 일행이 걸어간 길 */
  'ghost:move': (e: { id: string; path: LatLng[] }) => void
  'ghost:emote': (e: { id: string; seat: Seat; emote: EmoteId }) => void
}

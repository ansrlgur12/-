import type { LatLng, Seat } from './game'
import type { Outfit } from './profile'

export type EmoteId = 'wave' | 'cheer' | 'clap' | 'laugh' | 'cry' | 'angry' | 'think' | 'heart'

/**
 * 근처에서 게임 중인 다른 방의 일행. 어디서 왔는지 알 수 없도록 지금 위치와 옷만 보낸다.
 * id는 게임마다 새로 만드는 값이라 방 코드와 상관없다.
 */
export interface GhostView {
  id: string
  latLng: LatLng
  outfits: Record<Seat, Outfit>
}

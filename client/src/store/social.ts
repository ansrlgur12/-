import { create } from 'zustand'
import { Vector3 } from 'three'
import type { EmoteId, GhostView, LatLng, Outfit, Seat } from '@jikjwau/shared/types'
import { EMOTE_SHOW_MS, EMOTES } from '@jikjwau/shared/config'
import { socket } from '../api/socket'

/**
 * 이모티콘과 근처 다른 방 일행(반투명).
 * 캐릭터마다 key가 있다: 우리 방은 `me:A`, 다른 방은 `g:<id>:A`.
 */

export interface GhostState {
  id: string
  latLng: LatLng
  outfits: Record<Seat, Outfit>
  /** 걷는 중인 길. 다 걸으면 null */
  route: LatLng[] | null
  routeId: number
}

export interface Bubble {
  id: number
  key: string
  emoji: string
  at: number
}

interface SocialState {
  ghosts: Record<string, GhostState>
  bubbles: Bubble[]
  showEmote: (key: string, emote: EmoteId) => void
  /** 다른 방 일행이 길 끝까지 걸었다 */
  arrived: (id: string, routeId: number) => void
  clear: () => void
}

/** 지금 하고 있는 이모티콘 동작 (Party가 매 프레임 읽는다. 리렌더 없이) */
export const activeEmotes = new Map<string, { emote: EmoteId; at: number }>()
/** 캐릭터 머리 위 월드 좌표 (Party가 매 프레임 써 넣고 말풍선이 읽는다) */
export const emoteAnchors = new Map<string, Vector3>()

export const meKey = (seat: Seat) => `me:${seat}`
export const ghostKey = (id: string, seat: Seat) => `g:${id}:${seat}`

const EMOJI = Object.fromEntries(EMOTES.map((e) => [e.id, e.emoji])) as Record<EmoteId, string>
let bubbleId = 0

export const useSocial = create<SocialState>((set, get) => ({
  ghosts: {},
  bubbles: [],

  showEmote(key, emote) {
    const at = Date.now()
    const id = ++bubbleId
    activeEmotes.set(key, { emote, at })
    // 같은 캐릭터의 이전 말풍선은 바꾼다
    set((s) => ({ bubbles: [...s.bubbles.filter((b) => b.key !== key), { id, key, emoji: EMOJI[emote], at }] }))
    setTimeout(() => set((s) => ({ bubbles: s.bubbles.filter((b) => b.id !== id) })), EMOTE_SHOW_MS)
  },

  arrived(id, routeId) {
    const g = get().ghosts[id]
    if (!g?.route || g.routeId !== routeId) return
    set((s) => ({ ghosts: { ...s.ghosts, [id]: { ...g, latLng: g.route![g.route!.length - 1], route: null } } }))
  },

  clear() {
    activeEmotes.clear()
    set({ ghosts: {}, bubbles: [] })
  },
}))

function onList(list: GhostView[]) {
  const prev = useSocial.getState().ghosts
  const next: Record<string, GhostState> = {}
  for (const g of list) {
    const old = prev[g.id]
    // 걷는 중이면 연출이 끝날 때까지 둔다. 서 있으면 서버 위치로 맞춘다
    next[g.id] = old ? { ...old, outfits: g.outfits, latLng: old.route ? old.latLng : g.latLng } : { ...g, route: null, routeId: 0 }
  }
  useSocial.setState({ ghosts: next })
}

function onMove({ id, path }: { id: string; path: LatLng[] }) {
  const g = useSocial.getState().ghosts[id]
  if (!g) return
  useSocial.setState((s) => ({ ghosts: { ...s.ghosts, [id]: { ...g, route: path, routeId: g.routeId + 1 } } }))
}

socket.on('emote', (e) => useSocial.getState().showEmote(meKey(e.seat), e.emote))
socket.on('ghost:emote', (e) => {
  if (useSocial.getState().ghosts[e.id]) useSocial.getState().showEmote(ghostKey(e.id, e.seat), e.emote)
})
socket.on('ghost:list', onList)
socket.on('ghost:move', onMove)

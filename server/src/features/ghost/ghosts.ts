import { randomUUID } from 'node:crypto'
import type { EmoteId, GhostView, LatLng, Outfit, Seat } from '@jikjwau/shared/types'
import { GHOST_MAX, GHOST_RADIUS_M, GHOST_TICK_MS } from '@jikjwau/shared/config'
import { distance, project } from '../road/geo'

/**
 * 게임 중인 방들이 서로의 일행을 반투명하게 볼 수 있게 위치를 모아 둔다.
 * 다른 방에는 지금 위치·옷·걸어간 길만 보낸다 (출발지·목적지·이름·방 코드는 보내지 않는다).
 */
export interface GhostOutput {
  list: (code: string, ghosts: GhostView[]) => void
  move: (code: string, e: { id: string; path: LatLng[] }) => void
  emote: (code: string, e: { id: string; seat: Seat; emote: EmoteId }) => void
}

interface Entry {
  code: string
  id: string
  latLng: LatLng
  outfits: Record<Seat, Outfit>
}

const entries = new Map<string, Entry>()
let output: GhostOutput | null = null
let ticker: ReturnType<typeof setInterval> | null = null

const far = (a: LatLng, b: LatLng) => distance({ x: 0, y: 0 }, project(b, a)) > GHOST_RADIUS_M

/** 이 위치(들) 근처에서 게임 중인 다른 방. 가까운 순으로 GHOST_MAX까지 */
function nearby(code: string, around: LatLng[]): Entry[] {
  const found: Array<{ e: Entry; d: number }> = []
  for (const e of entries.values()) {
    if (e.code === code) continue
    const d = Math.min(...around.map((p) => distance({ x: 0, y: 0 }, project(e.latLng, p))))
    if (d <= GHOST_RADIUS_M) found.push({ e, d })
  }
  return found
    .sort((a, b) => a.d - b.d)
    .slice(0, GHOST_MAX)
    .map((f) => f.e)
}

const view = (e: Entry): GhostView => ({ id: e.id, latLng: e.latLng, outfits: e.outfits })

function tick() {
  if (!output) return
  for (const e of entries.values()) output.list(e.code, nearby(e.code, [e.latLng]).map(view))
}

export function setGhostOutput(out: GhostOutput) {
  output = out
  ticker ??= setInterval(tick, GHOST_TICK_MS)
  ticker.unref?.()
}

/** 방의 일행이 지금 여기 있다 (처음이면 새 id로 나타난다) */
export function placeGhost(code: string, latLng: LatLng, outfits: Record<Seat, Outfit>) {
  const e = entries.get(code)
  if (e) Object.assign(e, { latLng, outfits })
  else entries.set(code, { code, id: randomUUID().slice(0, 8), latLng, outfits })
}

/** 걸어간 길을 근처 방들에 알린다 (출발·도착 어느 쪽이든 가까우면) */
export function ghostMoved(code: string, path: LatLng[]) {
  const e = entries.get(code)
  if (!e || path.length < 2) return
  const end = path[path.length - 1]
  const watchers = [...entries.values()].filter((w) => w.code !== code && (!far(w.latLng, path[0]) || !far(w.latLng, end)))
  e.latLng = end
  for (const w of watchers) output?.move(w.code, { id: e.id, path })
}

export function ghostEmote(code: string, seat: Seat, emote: EmoteId) {
  const e = entries.get(code)
  if (!e) return
  for (const w of nearby(code, [e.latLng])) output?.emote(w.code, { id: e.id, seat, emote })
}

export function removeGhost(code: string) {
  entries.delete(code)
}

/** 테스트용 */
export function ghostsNear(code: string, latLng: LatLng) {
  return nearby(code, [latLng]).map(view)
}

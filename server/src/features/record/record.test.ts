import { describe, expect, it } from 'vitest'
import type { RoomRules } from '@jikjwau/shared/types'
import { RecordStore, dayOf, type NewRecord } from './record.store'

const place = (name: string) => ({ latLng: { lat: 37.5, lng: 127 }, name })

function record(over: Partial<NewRecord> = {}): NewRecord {
  return {
    rules: { mode: 'hardcore' },
    solo: true,
    players: [{ id: 'player-0001', nickname: '하나' }],
    start: place('출발'),
    destination: place('도착'),
    straightM: 500,
    distanceM: 2000,
    rpsCount: 30,
    elapsedMs: 60_000,
    remainingM: 0,
    arrived: true,
    finishedAt: Date.UTC(2026, 10, 11, 3),
    trail: [
      [0, 0],
      [10, 0],
    ],
    target: [400, 300],
    ...over,
  }
}

describe('RecordStore', () => {
  it('한국 시간으로 날짜를 나눈다', () => {
    // UTC 15:00 = 한국 다음날 0시
    expect(dayOf(Date.UTC(2026, 10, 11, 14, 59))).toBe('2026-11-11')
    expect(dayOf(Date.UTC(2026, 10, 11, 15, 0))).toBe('2026-11-12')
  })

  it('함께한 사람마다 내 기록에 남고, 지나온 길은 따로 읽는다', () => {
    const store = new RecordStore(':memory:')
    const saved = store.save(record({ players: [{ id: 'player-0001', nickname: '하나' }, { id: 'player-0002', nickname: '둘' }], solo: false }))
    expect(store.mine('player-0001').map((r) => r.id)).toEqual([saved.id])
    expect(store.mine('player-0002')[0].players).toEqual(['하나', '둘'])
    expect(store.mine('player-0003')).toEqual([])
    expect(store.mine('player-0001')[0]).not.toHaveProperty('trail')
    expect(store.get(saved.id)?.trail).toEqual([
      [0, 0],
      [10, 0],
    ])
  })

  it('월드레코드는 그날 하드코어로 도착한 판만, 고른 기준으로 정렬한다', () => {
    const store = new RecordStore(':memory:')
    const normal: RoomRules = { mode: 'normal', limit: { kind: 'rps', count: 100 } }
    const a = store.save(record({ distanceM: 3000, straightM: 900, rpsCount: 20 }))
    const b = store.save(record({ distanceM: 1000, straightM: 400, rpsCount: 50 }))
    store.save(record({ arrived: false, remainingM: 100, distanceM: 10 }))
    store.save(record({ rules: normal, distanceM: 10 }))
    store.save(record({ finishedAt: Date.UTC(2026, 10, 12, 3), distanceM: 10 }))

    const ids = (sort: 'distance' | 'straight' | 'rps') => store.world('2026-11-11', sort).map((r) => r.id)
    expect(ids('distance')).toEqual([b.id, a.id])
    expect(ids('straight')).toEqual([a.id, b.id])
    expect(ids('rps')).toEqual([a.id, b.id])
  })
})

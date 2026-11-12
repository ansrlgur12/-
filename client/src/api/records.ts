import type { MyRecordsResponse, PlayRecord, WorldRecordResponse, WorldRecordSort } from '@jikjwau/shared/types'
import { getJson } from './http'

/** 내 기록실 (최근 순) */
export function fetchMyRecords(playerId: string) {
  return getJson<MyRecordsResponse>(`/records/mine?playerId=${encodeURIComponent(playerId)}`)
}

/** 기록 하나 (지나온 길 포함) */
export function fetchRecord(id: string) {
  return getJson<PlayRecord>(`/records/${id}`)
}

/** day를 안 주면 오늘 (한국 시간) */
export function fetchWorldRecords(sort: WorldRecordSort, day?: string) {
  const params = new URLSearchParams({ sort })
  if (day) params.set('day', day)
  return getJson<WorldRecordResponse>(`/records/world?${params}`)
}

const KST_OFFSET_MS = 9 * 3600_000
const DAY_MS = 86_400_000

/** 한국 시간 기준 날짜 (YYYY-MM-DD) */
export function dayOf(ms: number) {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 한국 시간 기준 그 주 월요일 (YYYY-MM-DD) */
export function weekOf(ms: number) {
  const kst = new Date(ms + KST_OFFSET_MS)
  const sinceMonday = (kst.getUTCDay() + 6) % 7
  return new Date(kst.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10)
}

/** 그 날의 전날 (YYYY-MM-DD) */
export function dayBefore(day: string) {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)
}

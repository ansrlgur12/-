import { describe, expect, it } from 'vitest'
import { ATTENDANCE_REWARDS, CLEAR_REWARD, DEFAULT_OUTFIT, NORMAL_REWARD_DAILY_CAP } from '@jikjwau/shared/config'
import { weekOf } from '../../common/kst'
import { ProfileStore } from './profile.store'

const ID = 'player-0001'
// 한국 시간 2026-11-12(목) 12시
const NOW = Date.UTC(2026, 10, 12, 3)
const DAY = 86_400_000
const normal = { mode: 'normal' as const, limit: { kind: 'rps' as const, count: 100 } }

describe('ProfileStore', () => {
  it('처음에는 코인 0, 무료 옷을 입고 있다', () => {
    const p = new ProfileStore(':memory:').view(ID, NOW)
    expect(p.coins).toBe(0)
    expect(p.outfit).toEqual(DEFAULT_OUTFIT)
    expect(p.owned).toContain('hat_none')
  })

  it('한국 시간 월요일이 주의 시작', () => {
    expect(weekOf(NOW)).toBe('2026-11-09')
    // 일요일 23:59 (KST) 는 그 전 주
    expect(weekOf(Date.UTC(2026, 10, 15, 14, 59))).toBe('2026-11-09')
    expect(weekOf(Date.UTC(2026, 10, 15, 15, 0))).toBe('2026-11-16')
  })

  it('출석은 하루 한 번, 이어서 하면 보상이 늘고 하루 빠지면 처음부터', () => {
    const store = new ProfileStore(':memory:')
    expect(store.attend(ID, NOW).gained).toBe(ATTENDANCE_REWARDS[0])
    expect(() => store.attend(ID, NOW)).toThrow('이미 출석')
    expect(store.attend(ID, NOW + DAY).gained).toBe(ATTENDANCE_REWARDS[1])
    expect(store.view(ID, NOW + DAY).attendance.streak).toBe(2)
    // 하루 건너뜀
    expect(store.attend(ID, NOW + 3 * DAY).gained).toBe(ATTENDANCE_REWARDS[0])
  })

  it('미션은 다 해야 받고, 한 번만 받고, 다음 날 처음부터', () => {
    const store = new ProfileStore(':memory:')
    expect(() => store.claim(ID, 'd_games_1', NOW)).toThrow('아직')
    store.finishGame(ID, { rules: normal, arrived: false }, NOW)
    const before = store.view(ID, NOW).coins
    expect(store.claim(ID, 'd_games_1', NOW).profile.coins).toBe(before + 15)
    expect(() => store.claim(ID, 'd_games_1', NOW)).toThrow('이미')
    expect(store.view(ID, NOW + DAY).missions.find((m) => m.id === 'd_games_1')).toEqual({ id: 'd_games_1', progress: 0, claimed: false })
    // 주간은 이어진다
    expect(store.view(ID, NOW + DAY).missions.find((m) => m.id === 'w_games_10')?.progress).toBe(1)
  })

  it('클리어 보상: 하드코어 도착은 크게, 일반은 하루 상한까지', () => {
    const store = new ProfileStore(':memory:')
    expect(store.finishGame(ID, { rules: { mode: 'hardcore' }, arrived: true }, NOW)).toBe(CLEAR_REWARD.hardcoreArrived)
    for (let i = 0; i < NORMAL_REWARD_DAILY_CAP; i++) expect(store.finishGame(ID, { rules: normal, arrived: false }, NOW)).toBe(CLEAR_REWARD.normalEnded)
    expect(store.finishGame(ID, { rules: normal, arrived: true }, NOW)).toBe(0)
    expect(store.finishGame(ID, { rules: normal, arrived: true }, NOW + DAY)).toBe(CLEAR_REWARD.normalArrived)
  })

  it('코인으로 사서 입는다. 없는 옷은 못 입는다', () => {
    const store = new ProfileStore(':memory:')
    expect(() => store.buy(ID, 'hat_beanie')).toThrow('모자라')
    store.finishGame(ID, { rules: { mode: 'hardcore' }, arrived: true }, NOW)
    expect(() => store.equip(ID, { ...DEFAULT_OUTFIT, hat: 'hat_beanie' })).toThrow('가지고 있지 않은')
    const bought = store.buy(ID, 'hat_beanie')
    expect(bought.coins).toBe(CLEAR_REWARD.hardcoreArrived - 80)
    expect(store.equip(ID, { ...DEFAULT_OUTFIT, hat: 'hat_beanie' }).outfit.hat).toBe('hat_beanie')
    expect(() => store.equip(ID, { ...DEFAULT_OUTFIT, hat: 'top_suit' })).toThrow('잘못된')
  })
})

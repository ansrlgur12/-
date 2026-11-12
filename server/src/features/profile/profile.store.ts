import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { MissionStat, Outfit, OutfitSlot, ProfileView, RewardResult, RoomRules } from '@jikjwau/shared/types'
import {
  ATTENDANCE_REWARDS,
  CLEAR_REWARD,
  DEFAULT_OUTFIT,
  FREE_ITEM_IDS,
  MISSIONS,
  NORMAL_REWARD_DAILY_CAP,
  SHOP_ITEM_BY_ID,
} from '@jikjwau/shared/config'
import { HttpError } from '../../common/http-error'
import { dayBefore, dayOf, weekOf } from '../../common/kst'

/** 미션 말고 안에서만 세는 것: 오늘 보상을 받은 일반 모드 판 수 */
type Stat = MissionStat | 'normalRewards'

interface ProfileRow {
  coins: number
  owned: string
  outfit: string
  last_attend: string | null
  streak: number
}

const SLOTS: OutfitSlot[] = ['hat', 'top', 'bottom', 'acc']

/**
 * 게스트 한 명의 지갑과 옷장, 출석, 미션 진행.
 * 진행은 기간(d:날짜, w:월요일)마다 따로 세서, 날짜가 바뀌면 저절로 처음부터 시작한다.
 */
export class ProfileStore {
  private readonly db: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        player_id TEXT PRIMARY KEY,
        coins INTEGER NOT NULL,
        owned TEXT NOT NULL,
        outfit TEXT NOT NULL,
        last_attend TEXT,
        streak INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile_stats (
        player_id TEXT NOT NULL,
        period TEXT NOT NULL,
        stat TEXT NOT NULL,
        value INTEGER NOT NULL,
        PRIMARY KEY (player_id, period, stat)
      );
      CREATE TABLE IF NOT EXISTS profile_claims (
        player_id TEXT NOT NULL,
        period TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        PRIMARY KEY (player_id, period, mission_id)
      );
    `)
  }

  private row(playerId: string): ProfileRow {
    const found = this.db.prepare('SELECT coins, owned, outfit, last_attend, streak FROM profiles WHERE player_id = ?').get(playerId) as
      | ProfileRow
      | undefined
    if (found) return found
    const fresh: ProfileRow = { coins: 0, owned: JSON.stringify(FREE_ITEM_IDS), outfit: JSON.stringify(DEFAULT_OUTFIT), last_attend: null, streak: 0 }
    this.db
      .prepare('INSERT INTO profiles (player_id, coins, owned, outfit, last_attend, streak) VALUES (?, ?, ?, ?, ?, ?)')
      .run(playerId, fresh.coins, fresh.owned, fresh.outfit, fresh.last_attend, fresh.streak)
    return fresh
  }

  private owned(row: ProfileRow): string[] {
    // 나중에 무료 아이템이 늘어나도 모두 가지고 있게
    return [...new Set([...FREE_ITEM_IDS, ...(JSON.parse(row.owned) as string[])])]
  }

  private addCoins(playerId: string, n: number) {
    this.db.prepare('UPDATE profiles SET coins = coins + ? WHERE player_id = ?').run(n, playerId)
  }

  private stat(playerId: string, period: string, stat: Stat): number {
    const r = this.db.prepare('SELECT value FROM profile_stats WHERE player_id = ? AND period = ? AND stat = ?').get(playerId, period, stat) as
      | { value: number }
      | undefined
    return r?.value ?? 0
  }

  private bump(playerId: string, period: string, stat: Stat, n: number) {
    this.db
      .prepare(
        `INSERT INTO profile_stats (player_id, period, stat, value) VALUES (?, ?, ?, ?)
         ON CONFLICT (player_id, period, stat) DO UPDATE SET value = value + excluded.value`,
      )
      .run(playerId, period, stat, n)
  }

  /** 오늘·이번 주 기록에 함께 더한다 */
  addStat(playerId: string, stat: MissionStat, n = 1, now = Date.now()) {
    this.row(playerId)
    this.bump(playerId, `d:${dayOf(now)}`, stat, n)
    this.bump(playerId, `w:${weekOf(now)}`, stat, n)
  }

  view(playerId: string, now = Date.now()): ProfileView {
    const row = this.row(playerId)
    const day = dayOf(now)
    const week = weekOf(now)
    const claimed = new Set(
      (
        this.db.prepare('SELECT period, mission_id FROM profile_claims WHERE player_id = ? AND period IN (?, ?)').all(playerId, `d:${day}`, `w:${week}`) as Array<{
          period: string
          mission_id: string
        }>
      ).map((r) => `${r.period}|${r.mission_id}`),
    )
    const claimedToday = row.last_attend === day
    // 어제 받았으면 이어지고, 아니면 오늘 받을 때 1일째부터
    const streak = claimedToday ? row.streak : row.last_attend === dayBefore(day) ? row.streak : 0
    const todayStreak = claimedToday ? streak : streak + 1
    return {
      coins: row.coins,
      owned: this.owned(row),
      outfit: this.outfitOf(row),
      attendance: { streak, claimedToday, todayReward: ATTENDANCE_REWARDS[(todayStreak - 1) % ATTENDANCE_REWARDS.length] },
      missions: MISSIONS.map((m) => {
        const period = m.period === 'daily' ? `d:${day}` : `w:${week}`
        return { id: m.id, progress: Math.min(m.goal, this.stat(playerId, period, m.stat)), claimed: claimed.has(`${period}|${m.id}`) }
      }),
      day,
      week,
    }
  }

  attend(playerId: string, now = Date.now()): RewardResult {
    const before = this.view(playerId, now)
    if (before.attendance.claimedToday) throw new HttpError(409, '오늘은 이미 출석했어요')
    const gained = before.attendance.todayReward
    this.db.prepare('UPDATE profiles SET last_attend = ?, streak = ? WHERE player_id = ?').run(before.day, before.attendance.streak + 1, playerId)
    this.addCoins(playerId, gained)
    this.addStat(playerId, 'attend', 1, now)
    return { gained, profile: this.view(playerId, now) }
  }

  claim(playerId: string, missionId: string, now = Date.now()): RewardResult {
    const mission = MISSIONS.find((m) => m.id === missionId)
    if (!mission) throw new HttpError(404, '없는 미션이에요')
    const state = this.view(playerId, now).missions.find((m) => m.id === missionId)!
    if (state.claimed) throw new HttpError(409, '이미 받은 보상이에요')
    if (state.progress < mission.goal) throw new HttpError(409, '아직 미션을 다 하지 않았어요')
    const period = mission.period === 'daily' ? `d:${dayOf(now)}` : `w:${weekOf(now)}`
    this.db.prepare('INSERT INTO profile_claims (player_id, period, mission_id) VALUES (?, ?, ?)').run(playerId, period, missionId)
    this.addCoins(playerId, mission.reward)
    return { gained: mission.reward, profile: this.view(playerId, now) }
  }

  buy(playerId: string, itemId: string): ProfileView {
    const item = SHOP_ITEM_BY_ID[itemId]
    if (!item) throw new HttpError(404, '없는 아이템이에요')
    const row = this.row(playerId)
    const owned = this.owned(row)
    if (owned.includes(itemId)) throw new HttpError(409, '이미 가지고 있어요')
    if (row.coins < item.price) throw new HttpError(409, '코인이 모자라요')
    this.db.prepare('UPDATE profiles SET coins = coins - ?, owned = ? WHERE player_id = ?').run(item.price, JSON.stringify([...owned, itemId]), playerId)
    return this.view(playerId)
  }

  equip(playerId: string, outfit: Outfit): ProfileView {
    const owned = this.owned(this.row(playerId))
    for (const slot of SLOTS) {
      const item = SHOP_ITEM_BY_ID[outfit[slot]]
      if (!item || item.slot !== slot) throw new HttpError(400, '잘못된 옷이에요')
      if (!owned.includes(item.id)) throw new HttpError(409, '가지고 있지 않은 옷이에요')
    }
    const clean = Object.fromEntries(SLOTS.map((s) => [s, outfit[s]])) as Outfit
    this.db.prepare('UPDATE profiles SET outfit = ? WHERE player_id = ?').run(JSON.stringify(clean), playerId)
    return this.view(playerId)
  }

  private outfitOf(row: ProfileRow): Outfit {
    const saved = JSON.parse(row.outfit) as Partial<Outfit>
    // 상점에서 빠진 아이템이면 기본 옷으로
    return Object.fromEntries(SLOTS.map((s) => [s, saved[s] && SHOP_ITEM_BY_ID[saved[s]!] ? saved[s] : DEFAULT_OUTFIT[s]])) as Outfit
  }

  outfit(playerId: string): Outfit {
    return this.outfitOf(this.row(playerId))
  }

  /** 끝까지 함께한 판: 미션을 세고 클리어 보상을 준다. 받은 코인을 돌려준다 */
  finishGame(playerId: string, game: { rules: RoomRules; arrived: boolean }, now = Date.now()): number {
    this.addStat(playerId, 'games', 1, now)
    if (game.arrived) this.addStat(playerId, 'arrive', 1, now)
    if (game.arrived && game.rules.mode === 'hardcore') this.addStat(playerId, 'hardcoreArrive', 1, now)

    let gained = 0
    if (game.rules.mode === 'hardcore') {
      gained = game.arrived ? CLEAR_REWARD.hardcoreArrived : 0
    } else {
      const today = `d:${dayOf(now)}`
      if (this.stat(playerId, today, 'normalRewards') < NORMAL_REWARD_DAILY_CAP) {
        gained = game.arrived ? CLEAR_REWARD.normalArrived : CLEAR_REWARD.normalEnded
        this.bump(playerId, today, 'normalRewards', 1)
      }
    }
    if (gained > 0) this.addCoins(playerId, gained)
    return gained
  }
}

let store: ProfileStore | null = null

/** 서버 전체가 쓰는 프로필 저장소 (기록과 같은 파일) */
export function profiles() {
  store ??= new ProfileStore(process.env.RECORDS_DB ?? resolve(import.meta.dirname, '../../../data/records.db'))
  return store
}

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { PlayRecord, PlayRecordSummary, WorldRecordSort } from '@jikjwau/shared/types'
import { dayOf } from '../../common/kst'

/** 기록을 남길 사람 (AI 자리는 빼고) */
export interface RecordPlayer {
  id: string
  nickname: string
}

export type NewRecord = Omit<PlayRecord, 'id' | 'day' | 'players'> & { players: RecordPlayer[] }

/** 한 날에 보여 줄 월드레코드 수 */
const WORLD_LIMIT = 100
/** 기록에 남길 지나온 길 점 수 (넘으면 솎아 낸다) */
const TRAIL_MAX_POINTS = 600

const ORDER: Record<WorldRecordSort, string> = {
  distance: 'distance_m ASC, elapsed_ms ASC',
  straight: 'straight_m DESC, distance_m ASC',
  rps: 'rps_count ASC, distance_m ASC',
}

export { dayOf }

function thin<T>(points: T[]): T[] {
  if (points.length <= TRAIL_MAX_POINTS) return points
  const step = (points.length - 1) / (TRAIL_MAX_POINTS - 1)
  return Array.from({ length: TRAIL_MAX_POINTS }, (_, i) => points[Math.round(i * step)])
}

/**
 * 끝난 게임 기록. plays에 한 판씩, play_players에 함께한 사람마다 한 줄.
 * 월드레코드는 하드코어로 도착한 판을 날짜별로 보여 준다.
 */
export class RecordStore {
  private readonly db: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plays (
        id TEXT PRIMARY KEY,
        day TEXT NOT NULL,
        finished_at INTEGER NOT NULL,
        hardcore INTEGER NOT NULL,
        arrived INTEGER NOT NULL,
        distance_m REAL NOT NULL,
        straight_m REAL NOT NULL,
        rps_count INTEGER NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS plays_world ON plays (day, hardcore, arrived);
      CREATE TABLE IF NOT EXISTS play_players (
        play_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        finished_at INTEGER NOT NULL,
        PRIMARY KEY (play_id, player_id)
      );
      CREATE INDEX IF NOT EXISTS play_players_mine ON play_players (player_id, finished_at);
    `)
  }

  save(record: NewRecord): PlayRecord {
    const id = randomUUID()
    const { players, trail, target, ...rest } = record
    const summary: PlayRecordSummary = { ...rest, id, day: dayOf(record.finishedAt), players: players.map((p) => p.nickname) }
    const full: PlayRecord = { ...summary, trail: thin(trail), target }
    this.db
      .prepare(
        `INSERT INTO plays (id, day, finished_at, hardcore, arrived, distance_m, straight_m, rps_count, elapsed_ms, summary, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        summary.day,
        summary.finishedAt,
        summary.rules.mode === 'hardcore' ? 1 : 0,
        summary.arrived ? 1 : 0,
        summary.distanceM,
        summary.straightM,
        summary.rpsCount,
        summary.elapsedMs,
        JSON.stringify(summary),
        JSON.stringify({ trail: full.trail, target }),
      )
    const insert = this.db.prepare('INSERT OR IGNORE INTO play_players (play_id, player_id, finished_at) VALUES (?, ?, ?)')
    for (const p of players) insert.run(id, p.id, summary.finishedAt)
    return full
  }

  /** 내가 함께한 판들 (최근 순) */
  mine(playerId: string, limit = 100): PlayRecordSummary[] {
    const rows = this.db
      .prepare(
        `SELECT p.summary AS data FROM play_players pp JOIN plays p ON p.id = pp.play_id
         WHERE pp.player_id = ? ORDER BY pp.finished_at DESC LIMIT ?`,
      )
      .all(playerId, limit) as Array<{ data: string }>
    return rows.map((r) => JSON.parse(r.data))
  }

  get(id: string): PlayRecord | null {
    const row = this.db.prepare('SELECT summary, detail FROM plays WHERE id = ?').get(id) as { summary: string; detail: string } | undefined
    if (!row) return null
    return { ...JSON.parse(row.summary), ...JSON.parse(row.detail) }
  }

  /** 그날 하드코어로 도착한 판 */
  world(day: string, sort: WorldRecordSort): PlayRecordSummary[] {
    const rows = this.db
      .prepare(`SELECT summary AS data FROM plays WHERE day = ? AND hardcore = 1 AND arrived = 1 ORDER BY ${ORDER[sort]} LIMIT ?`)
      .all(day, WORLD_LIMIT) as Array<{ data: string }>
    return rows.map((r) => JSON.parse(r.data))
  }
}

let store: RecordStore | null = null

/** 서버 전체가 쓰는 기록 저장소 (server/data/records.db, RECORDS_DB로 바꿀 수 있다) */
export function records() {
  store ??= new RecordStore(process.env.RECORDS_DB ?? resolve(import.meta.dirname, '../../../data/records.db'))
  return store
}

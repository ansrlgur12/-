import { Router } from 'express'
import { z } from 'zod'
import type { MyRecordsResponse, WorldRecordResponse } from '@jikjwau/shared/types'
import { HttpError } from '../../common/http-error'
import { dayOf, records } from './record.store'

export const recordRouter = Router()

const mineSchema = z.object({ playerId: z.string().min(8).max(64) })

/** 내 기록실 */
recordRouter.get('/mine', (req, res) => {
  const { playerId } = mineSchema.parse(req.query)
  const body: MyRecordsResponse = { records: records().mine(playerId) }
  res.json(body)
})

const worldSchema = z.object({
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z.enum(['distance', 'straight', 'rps']).default('distance'),
})

/** 월드레코드: 그날(기본 오늘, 한국 시간) 하드코어로 도착한 판 */
recordRouter.get('/world', (req, res) => {
  const { day = dayOf(Date.now()), sort } = worldSchema.parse(req.query)
  const body: WorldRecordResponse = { day, sort, records: records().world(day, sort) }
  res.json(body)
})

/** 기록 하나 (지나온 길 포함) */
recordRouter.get('/:id', (req, res) => {
  const record = records().get(z.string().uuid().parse(req.params.id))
  if (!record) throw new HttpError(404, '기록을 찾을 수 없어요')
  res.json(record)
})

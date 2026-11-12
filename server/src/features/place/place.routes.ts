import { Router } from 'express'
import { z } from 'zod'
import { searchPlaces } from './place.service'
import { reversePlace } from './place.reverse'

export const placeRouter = Router()

const searchSchema = z.object({
  q: z.string().trim().min(1).max(100),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
})

/** 장소 검색. lat·lng를 주면 그 근처를 우선하고 거리를 붙인다 */
placeRouter.get('/search', async (req, res) => {
  const { q, lat, lng } = searchSchema.parse(req.query)
  const near = lat !== undefined && lng !== undefined ? { lat, lng } : undefined
  res.json(await searchPlaces(q, near))
})

const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

/** 지도에서 고른 지점의 대표 이름 (가까운 역·명소·건물, 없으면 주소) */
placeRouter.get('/reverse', async (req, res) => {
  const { lat, lng } = reverseSchema.parse(req.query)
  res.json(await reversePlace({ lat, lng }))
})

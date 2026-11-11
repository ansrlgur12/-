import { Router } from 'express'
import { z } from 'zod'
import { searchPlaces } from './place.service'

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

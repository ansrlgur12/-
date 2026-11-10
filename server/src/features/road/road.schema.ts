import { z } from 'zod'
import { ROAD_AREA_RADIUS_M } from '@jikjwau/shared/config'

export const createAreaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(100).max(ROAD_AREA_RADIUS_M.max).default(ROAD_AREA_RADIUS_M.default),
})

export const stepSchema = z.object({
  areaId: z.string().min(1),
  from: z.number().int(),
  via: z.number().int(),
})

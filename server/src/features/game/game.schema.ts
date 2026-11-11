import { z } from 'zod'

const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const createGameSchema = z.object({
  start: latLng,
  destination: latLng,
  seat: z.enum(['A', 'B', 'C']),
})

export const chooseSchema = z.object({
  hand: z.enum(['rock', 'paper', 'scissors']).nullable(),
})

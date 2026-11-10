import { Router } from 'express'
import { createAreaSchema, stepSchema } from './road.schema'
import { createArea, step } from './road.service'

export const roadRouter = Router()

roadRouter.post('/area', async (req, res) => {
  const { lat, lng, radiusM } = createAreaSchema.parse(req.body)
  res.json(await createArea({ lat, lng }, radiusM))
})

roadRouter.post('/step', (req, res) => {
  const { areaId, from, via } = stepSchema.parse(req.body)
  res.json(step(areaId, from, via))
})

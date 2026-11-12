import { Router } from 'express'
import { z } from 'zod'
import { profiles } from './profile.store'

export const profileRouter = Router()

// 게스트 id가 곧 신원이다 (기기에 저장된 무작위 값)
const playerId = z.string().min(8).max(64)
const itemId = z.string().min(1).max(40)
const outfit = z.object({ hat: itemId, top: itemId, bottom: itemId, acc: itemId })

/** 지갑·옷장·출석·미션 */
profileRouter.get('/', (req, res) => {
  const q = z.object({ playerId }).parse(req.query)
  res.json(profiles().view(q.playerId))
})

/** 오늘 출석 보상 받기 */
profileRouter.post('/attend', (req, res) => {
  const b = z.object({ playerId }).parse(req.body)
  res.json(profiles().attend(b.playerId))
})

/** 다 한 미션의 보상 받기 */
profileRouter.post('/claim', (req, res) => {
  const b = z.object({ playerId, missionId: z.string().min(1).max(40) }).parse(req.body)
  res.json(profiles().claim(b.playerId, b.missionId))
})

profileRouter.post('/buy', (req, res) => {
  const b = z.object({ playerId, itemId }).parse(req.body)
  res.json(profiles().buy(b.playerId, b.itemId))
})

profileRouter.post('/equip', (req, res) => {
  const b = z.object({ playerId, outfit }).parse(req.body)
  res.json(profiles().equip(b.playerId, b.outfit))
})

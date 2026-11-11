import { Router } from 'express'
import { chooseSchema, createGameSchema } from './game.schema'
import { chooseHand, createGame } from './game.service'

export const gameRouter = Router()

/** 싱글 플레이 게임을 만들고 첫 가위바위보(또는 도착)까지 진행한다 */
gameRouter.post('/', async (req, res) => {
  res.json(await createGame(createGameSchema.parse(req.body)))
})

/** 내 가위바위보 선택. 다음에 내 차례가 올 때까지 일어난 일을 돌려준다 */
gameRouter.post('/:id/rps', async (req, res) => {
  const { hand } = chooseSchema.parse(req.body)
  res.json(await chooseHand(req.params.id, hand))
})

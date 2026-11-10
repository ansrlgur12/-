import type { ErrorRequestHandler } from 'express'
import { ZodError } from 'zod'
import { HttpError } from './http-error'

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: '잘못된 요청입니다', issues: err.issues })
    return
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  // express.json()의 파싱 실패 등 클라이언트 잘못으로 생긴 에러
  if (typeof err?.status === 'number' && err.status < 500) {
    res.status(err.status).json({ error: '잘못된 요청입니다' })
    return
  }
  console.error(err)
  res.status(500).json({ error: '서버 오류가 발생했습니다' })
}

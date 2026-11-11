import { useEffect, useState } from 'react'

/** intervalMs마다 다시 그리게 하는 현재 시각. active가 아니면 멈춘다 */
export function useNow(intervalMs: number, active = true) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, active])
  return now
}

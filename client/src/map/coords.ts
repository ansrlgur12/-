import type { Vec2 } from '@jikjwau/shared/types'
import { Vector3 } from 'three'

/** 서버 로컬 좌표(x 동쪽, y 북쪽) → three.js 월드 좌표(x 동쪽, z 남쪽, y 위) */
export function toWorld(p: Vec2, height = 0, target = new Vector3()): Vector3 {
  return target.set(p.x, height, -p.y)
}

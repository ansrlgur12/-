import { describe, expect, it } from 'vitest'
import { AI_OUTFIT } from '@jikjwau/shared/config'
import { ghostsNear, placeGhost, removeGhost } from './ghosts'

const outfits = { A: AI_OUTFIT, B: AI_OUTFIT, C: AI_OUTFIT }
const here = { lat: 37.556, lng: 126.91 }

describe('ghosts', () => {
  it('근처 다른 방만 보이고 내 방과 먼 방은 안 보인다', () => {
    placeGhost('ROOM01', here, outfits)
    placeGhost('ROOM02', { lat: 37.557, lng: 126.911 }, outfits)
    placeGhost('ROOM03', { lat: 37.6, lng: 127 }, outfits)
    const seen = ghostsNear('ROOM01', here)
    expect(seen).toHaveLength(1)
    // 방 코드는 보내지 않는다
    expect(JSON.stringify(seen)).not.toContain('ROOM02')
    removeGhost('ROOM02')
    expect(ghostsNear('ROOM01', here)).toHaveLength(0)
    removeGhost('ROOM01')
    removeGhost('ROOM03')
  })
})

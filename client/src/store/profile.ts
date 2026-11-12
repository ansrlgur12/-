import { create } from 'zustand'
import type { Outfit, ProfileView } from '@jikjwau/shared/types'
import { attend, buyItem, claimMission, equipOutfit, fetchProfile } from '../api/profile'
import { useGame } from './game'

/** 코인·옷장·출석·미션. 서버가 계산하고 앱은 받은 그대로 보여 준다 */
interface ProfileState {
  profile: ProfileView | null
  busy: boolean
  error?: string
  /** 방금 받은 코인 (잠깐 띄워 준다) */
  gained: { amount: number; at: number } | null
  refresh: () => Promise<void>
  attend: () => Promise<void>
  claim: (missionId: string) => Promise<void>
  buy: (itemId: string) => Promise<boolean>
  equip: (outfit: Outfit) => Promise<void>
}

export const useProfile = create<ProfileState>((set, get) => {
  const playerId = () => useGame.getState().playerId

  /** 요청 하나를 보내고 결과 프로필로 바꾼다. 실패하면 error */
  const run = async (fn: (id: string) => Promise<ProfileView | { gained: number; profile: ProfileView }>) => {
    const id = playerId()
    if (!id || get().busy) return false
    set({ busy: true, error: undefined })
    try {
      const res = await fn(id)
      if ('gained' in res) set({ profile: res.profile, gained: { amount: res.gained, at: Date.now() } })
      else set({ profile: res })
      return true
    } catch (err) {
      set({ error: (err as Error).message })
      return false
    } finally {
      set({ busy: false })
    }
  }

  return {
    profile: null,
    busy: false,
    gained: null,

    async refresh() {
      const id = playerId()
      if (!id) return
      try {
        set({ profile: await fetchProfile(id), error: undefined })
      } catch (err) {
        set({ error: (err as Error).message })
      }
    },
    attend: () => run(attend).then(() => undefined),
    claim: (missionId) => run((id) => claimMission(id, missionId)).then(() => undefined),
    buy: (itemId) => run((id) => buyItem(id, itemId)),
    equip: (outfit) => run((id) => equipOutfit(id, outfit)).then(() => undefined),
  }
})

// 판이 끝나면 클리어 보상·미션 진행이 바뀌었으니 새로 받는다
useGame.subscribe((s, prev) => {
  if (s.status === 'ended' && prev.status !== 'ended') useProfile.getState().refresh()
})

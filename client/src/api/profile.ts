import type { Outfit, ProfileView, RewardResult } from '@jikjwau/shared/types'
import { getJson, postJson } from './http'

export function fetchProfile(playerId: string) {
  return getJson<ProfileView>(`/profile?playerId=${encodeURIComponent(playerId)}`)
}

export function attend(playerId: string) {
  return postJson<RewardResult>('/profile/attend', { playerId })
}

export function claimMission(playerId: string, missionId: string) {
  return postJson<RewardResult>('/profile/claim', { playerId, missionId })
}

export function buyItem(playerId: string, itemId: string) {
  return postJson<ProfileView>('/profile/buy', { playerId, itemId })
}

export function equipOutfit(playerId: string, outfit: Outfit) {
  return postJson<ProfileView>('/profile/equip', { playerId, outfit })
}

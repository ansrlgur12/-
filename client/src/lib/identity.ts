import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * 계정 없이 쓰는 게스트 신원. 기기에 저장해 두고 다시 접속할 때 같은 사람으로 알아보게 한다.
 * lastRoom: 앱이 꺼졌다 켜져도 하던 방으로 돌아가기 위해 기억한다.
 */
const KEY = 'jikjwau.identity.v1'

export interface Identity {
  playerId: string
  nickname: string
  lastRoom: string | null
}

function newId() {
  // 충돌만 안 나면 되는 식별자 (보안 용도 아님)
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

let cached: Identity | null = null

export async function loadIdentity(): Promise<Identity> {
  if (cached) return cached
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Identity>
      if (saved.playerId) cached = { playerId: saved.playerId, nickname: saved.nickname ?? '', lastRoom: saved.lastRoom ?? null }
    }
  } catch {
    // 저장소를 못 읽어도 이번 실행 동안은 새 신원으로 진행한다
  }
  cached ??= { playerId: newId(), nickname: '', lastRoom: null }
  return cached
}

export async function saveIdentity(patch: Partial<Identity>) {
  const next = { ...(await loadIdentity()), ...patch }
  cached = next
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 저장 실패는 무시 (다음 실행 때 새 신원)
  }
  return next
}

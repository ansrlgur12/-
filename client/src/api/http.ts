import Constants from 'expo-constants'

const DEV_SERVER_PORT = 4000

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL
  if (fromEnv) return fromEnv
  // 개발 중에는 Expo 개발 서버가 떠 있는 PC(같은 와이파이)의 IP로 접속한다
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost'
  return `http://${host}:${DEV_SERVER_PORT}`
}

export const API_BASE_URL = resolveBaseUrl()

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(`서버에 연결할 수 없습니다 (${API_BASE_URL})`)
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json as T
}

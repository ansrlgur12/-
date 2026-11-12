/** 꾸미기 부위 */
export type OutfitSlot = 'hat' | 'top' | 'bottom' | 'acc'

/** 부위마다 입고 있는 아이템 id */
export type Outfit = Record<OutfitSlot, string>

/** 아이템 모양. 앱이 이 이름으로 3D 모양을 고른다 */
export type ItemStyle =
  | 'none'
  | 'cap'
  | 'beanie'
  | 'straw'
  | 'party'
  | 'helmet'
  | 'bunny'
  | 'crown'
  | 'tee'
  | 'stripe'
  | 'hoodie'
  | 'jersey'
  | 'suit'
  | 'pants'
  | 'shorts'
  | 'skirt'
  | 'glasses'
  | 'shades'
  | 'scarf'
  | 'backpack'
  | 'cape'

export interface ShopItem {
  id: string
  slot: OutfitSlot
  name: string
  /** 0이면 처음부터 가지고 있다 */
  price: number
  style: ItemStyle
  color: string
  accent?: string
}

/** 미션이 세는 것: 게임한 시간(분), 직접 낸 가위바위보, 끝낸 판, 도착, 하드코어 도착, 출석 */
export type MissionStat = 'minutes' | 'rps' | 'games' | 'arrive' | 'hardcoreArrive' | 'attend'

export interface MissionDef {
  id: string
  period: 'daily' | 'weekly'
  stat: MissionStat
  goal: number
  reward: number
  title: string
}

export interface MissionProgress {
  id: string
  progress: number
  claimed: boolean
}

export interface ProfileView {
  coins: number
  owned: string[]
  outfit: Outfit
  attendance: {
    /** 연속 출석 일수 (오늘 받았으면 오늘 포함) */
    streak: number
    claimedToday: boolean
    /** 오늘 받으면(받았으면) 받는 코인 */
    todayReward: number
  }
  missions: MissionProgress[]
  /** 한국 시간 오늘, 이번 주 월요일 (YYYY-MM-DD) */
  day: string
  week: string
}

/** 보상을 받은 결과: 늘어난 코인과 바뀐 프로필 */
export interface RewardResult {
  gained: number
  profile: ProfileView
}

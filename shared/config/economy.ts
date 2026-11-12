import type { EmoteId, MissionDef, Outfit, OutfitSlot, ShopItem } from '../types'

/** 이모티콘: 보내면 캐릭터가 그 동작을 하고 머리 위에 잠깐 뜬다 */
export const EMOTES: Array<{ id: EmoteId; emoji: string }> = [
  { id: 'wave', emoji: '👋' },
  { id: 'cheer', emoji: '🎉' },
  { id: 'clap', emoji: '👏' },
  { id: 'laugh', emoji: '😆' },
  { id: 'cry', emoji: '😭' },
  { id: 'angry', emoji: '😡' },
  { id: 'think', emoji: '🤔' },
  { id: 'heart', emoji: '❤️' },
]
export const EMOTE_SHOW_MS = 2200
/** 한 사람이 이모티콘을 보낼 수 있는 간격 */
export const EMOTE_COOLDOWN_MS = 1500

/** 다른 방 일행을 보여 주는 거리와 최대 수 */
export const GHOST_RADIUS_M = 1200
export const GHOST_MAX = 6
export const GHOST_TICK_MS = 2000

export const OUTFIT_SLOTS: Array<{ slot: OutfitSlot; label: string }> = [
  { slot: 'hat', label: '모자' },
  { slot: 'top', label: '상의' },
  { slot: 'bottom', label: '하의' },
  { slot: 'acc', label: '소품' },
]

/** 상점. 가격 0은 처음부터 가지고 있다 */
export const SHOP_ITEMS: ShopItem[] = [
  { id: 'hat_none', slot: 'hat', name: '없음', price: 0, style: 'none', color: '#000' },
  { id: 'hat_cap_red', slot: 'hat', name: '빨간 캡', price: 0, style: 'cap', color: '#ef4444', accent: '#b91c1c' },
  { id: 'hat_cap_navy', slot: 'hat', name: '남색 캡', price: 60, style: 'cap', color: '#1e3a8a', accent: '#f8fafc' },
  { id: 'hat_beanie', slot: 'hat', name: '털모자', price: 80, style: 'beanie', color: '#f59e0b', accent: '#fff7ed' },
  { id: 'hat_party', slot: 'hat', name: '고깔모자', price: 100, style: 'party', color: '#a855f7', accent: '#facc15' },
  { id: 'hat_straw', slot: 'hat', name: '밀짚모자', price: 120, style: 'straw', color: '#e8c77a', accent: '#dc2626' },
  { id: 'hat_helmet', slot: 'hat', name: '헬멧', price: 150, style: 'helmet', color: '#f8fafc', accent: '#2563eb' },
  { id: 'hat_bunny', slot: 'hat', name: '토끼 귀', price: 220, style: 'bunny', color: '#ffffff', accent: '#f9a8d4' },
  { id: 'hat_crown', slot: 'hat', name: '왕관', price: 500, style: 'crown', color: '#facc15', accent: '#ef4444' },

  { id: 'top_tee_white', slot: 'top', name: '흰 티셔츠', price: 0, style: 'tee', color: '#f1f5f9' },
  { id: 'top_tee_mint', slot: 'top', name: '민트 티셔츠', price: 40, style: 'tee', color: '#6ee7b7' },
  { id: 'top_stripe', slot: 'top', name: '줄무늬 티', price: 100, style: 'stripe', color: '#f8fafc', accent: '#1d4ed8' },
  { id: 'top_jersey', slot: 'top', name: '축구 유니폼', price: 120, style: 'jersey', color: '#dc2626', accent: '#ffffff' },
  { id: 'top_hoodie_gray', slot: 'top', name: '회색 후드', price: 150, style: 'hoodie', color: '#9ca3af', accent: '#e5e7eb' },
  { id: 'top_hoodie_pink', slot: 'top', name: '분홍 후드', price: 150, style: 'hoodie', color: '#f472b6', accent: '#fce7f3' },
  { id: 'top_suit', slot: 'top', name: '정장', price: 300, style: 'suit', color: '#1f2937', accent: '#b91c1c' },

  { id: 'bottom_jeans', slot: 'bottom', name: '청바지', price: 0, style: 'pants', color: '#3b5b8c' },
  { id: 'bottom_shorts', slot: 'bottom', name: '반바지', price: 50, style: 'shorts', color: '#a16207' },
  { id: 'bottom_slacks', slot: 'bottom', name: '검정 바지', price: 60, style: 'pants', color: '#1f2937' },
  { id: 'bottom_cargo', slot: 'bottom', name: '카고 바지', price: 80, style: 'pants', color: '#65743a' },
  { id: 'bottom_skirt', slot: 'bottom', name: '치마', price: 100, style: 'skirt', color: '#7c3aed' },

  { id: 'acc_none', slot: 'acc', name: '없음', price: 0, style: 'none', color: '#000' },
  { id: 'acc_glasses', slot: 'acc', name: '뿔테 안경', price: 60, style: 'glasses', color: '#111827' },
  { id: 'acc_shades', slot: 'acc', name: '선글라스', price: 120, style: 'shades', color: '#111827' },
  { id: 'acc_scarf', slot: 'acc', name: '목도리', price: 100, style: 'scarf', color: '#dc2626', accent: '#fde68a' },
  { id: 'acc_backpack', slot: 'acc', name: '배낭', price: 150, style: 'backpack', color: '#f97316', accent: '#7c2d12' },
  { id: 'acc_cape', slot: 'acc', name: '망토', price: 300, style: 'cape', color: '#b91c1c', accent: '#facc15' },
]

export const SHOP_ITEM_BY_ID: Record<string, ShopItem> = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i]))
export const FREE_ITEM_IDS = SHOP_ITEMS.filter((i) => i.price === 0).map((i) => i.id)

export const DEFAULT_OUTFIT: Outfit = { hat: 'hat_cap_red', top: 'top_tee_white', bottom: 'bottom_jeans', acc: 'acc_none' }
/** AI가 맡은 자리 */
export const AI_OUTFIT: Outfit = { hat: 'hat_none', top: 'top_tee_white', bottom: 'bottom_slacks', acc: 'acc_none' }

/** 출석: 연속 출석 일수에 따라 (7일마다 처음부터) */
export const ATTENDANCE_REWARDS = [10, 10, 15, 15, 20, 20, 50]

/**
 * 판을 끝냈을 때 (포기는 없음). 가위바위보를 몇 번은 직접 내야 받는다 (AI에게 맡겨 두고 받기 방지).
 * 일반 모드 보상은 하루 NORMAL_REWARD_DAILY_CAP 판까지.
 */
export const CLEAR_REWARD = { normalEnded: 10, normalArrived: 30, hardcoreArrived: 150 }
export const REWARD_MIN_HANDS = 3
export const NORMAL_REWARD_DAILY_CAP = 10
/** 게임한 시간은 최근에 직접 낸 적이 있을 때만 센다 */
export const ACTIVE_HAND_WINDOW_MS = 3 * 60_000

/** 일일(한국 시간 0시) · 주간(월요일 0시) 미션 */
export const MISSIONS: MissionDef[] = [
  { id: 'd_minutes_10', period: 'daily', stat: 'minutes', goal: 10, reward: 10, title: '10분 동안 게임하기' },
  { id: 'd_rps_50', period: 'daily', stat: 'rps', goal: 50, reward: 10, title: '가위바위보 50번 내기' },
  { id: 'd_games_1', period: 'daily', stat: 'games', goal: 1, reward: 15, title: '한 판 끝내기' },
  { id: 'd_minutes_30', period: 'daily', stat: 'minutes', goal: 30, reward: 20, title: '30분 동안 게임하기' },
  { id: 'd_games_3', period: 'daily', stat: 'games', goal: 3, reward: 25, title: '세 판 끝내기' },

  { id: 'w_attend_5', period: 'weekly', stat: 'attend', goal: 5, reward: 50, title: '5일 출석하기' },
  { id: 'w_games_10', period: 'weekly', stat: 'games', goal: 10, reward: 60, title: '열 판 끝내기' },
  { id: 'w_rps_500', period: 'weekly', stat: 'rps', goal: 500, reward: 60, title: '가위바위보 500번 내기' },
  { id: 'w_arrive_1', period: 'weekly', stat: 'arrive', goal: 1, reward: 80, title: '목적지에 도착하기' },
  { id: 'w_hardcore_1', period: 'weekly', stat: 'hardcoreArrive', goal: 1, reward: 150, title: '하드코어로 도착하기' },
]

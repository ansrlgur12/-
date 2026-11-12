import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { create } from 'zustand'

/**
 * BGM과 효과음. 음원은 assets/sounds (scripts/make-sounds.mjs로 만든 임시 음원, 같은 이름으로 덮어쓰면 바뀐다).
 * 켜고 끄기는 기기에 저장한다.
 */

const SOURCES = {
  bgm: require('../../assets/sounds/bgm.wav'),
  tap: require('../../assets/sounds/tap.wav'),
  result: require('../../assets/sounds/result.wav'),
  win: require('../../assets/sounds/win.wav'),
  arrive: require('../../assets/sounds/arrive.wav'),
  end: require('../../assets/sounds/end.wav'),
}

export type Effect = Exclude<keyof typeof SOURCES, 'bgm'>

const BGM_VOLUME = 0.45
const STORAGE_KEY = 'jikjwau.sound.v1'

let players: Record<keyof typeof SOURCES, AudioPlayer> | null = null
let bgmWanted = false

/** 소리·진동 설정 (기기에 저장) */
interface SoundState {
  muted: boolean
  /** 진동 켜짐 (lib/haptics가 본다) */
  vibrate: boolean
  setMuted: (muted: boolean) => void
  setVibrate: (vibrate: boolean) => void
}

const save = () => {
  const { muted, vibrate } = useSound.getState()
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, vibrate })).catch(() => undefined)
}

export const useSound = create<SoundState>((set) => ({
  muted: false,
  vibrate: true,
  setMuted(muted) {
    set({ muted })
    save()
    applyBgm()
  },
  setVibrate(vibrate) {
    set({ vibrate })
    save()
  },
}))

/** 로딩 화면에서 한 번. 음원을 읽어 둔다 */
export async function loadSounds() {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}')
    if (typeof saved.muted === 'boolean') useSound.setState({ muted: saved.muted })
    if (typeof saved.vibrate === 'boolean') useSound.setState({ vibrate: saved.vibrate })
  } catch {
    // 저장된 설정이 없거나 깨졌으면 기본값
  }
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })
    players = Object.fromEntries(Object.entries(SOURCES).map(([k, src]) => [k, createAudioPlayer(src)])) as typeof players
    players!.bgm.loop = true
    players!.bgm.volume = BGM_VOLUME
    applyBgm()
  } catch (err) {
    // 소리가 안 나도 게임은 된다
    console.warn('sound', err)
  }
}

function applyBgm() {
  if (!players) return
  if (bgmWanted && !useSound.getState().muted) players.bgm.play()
  else players.bgm.pause()
}

/** 메뉴·기록실에서 켜고, 게임에 들어가면 끈다 */
export function setBgm(on: boolean) {
  if (bgmWanted === on) return
  bgmWanted = on
  applyBgm()
}

export function playEffect(effect: Effect) {
  if (!players || useSound.getState().muted) return
  const p = players[effect]
  p.seekTo(0).catch(() => undefined)
  p.play()
}

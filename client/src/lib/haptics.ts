import * as Haptics from 'expo-haptics'
import { useSound } from './sound'

/** 진동. 설정에서 끄면 아무것도 하지 않는다 */
const on = () => useSound.getState().vibrate

export function hapticTap() {
  if (on()) Haptics.selectionAsync().catch(() => undefined)
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy') {
  if (!on()) return
  const map = { light: Haptics.ImpactFeedbackStyle.Light, medium: Haptics.ImpactFeedbackStyle.Medium, heavy: Haptics.ImpactFeedbackStyle.Heavy }
  Haptics.impactAsync(map[style]).catch(() => undefined)
}

export function hapticResult(kind: 'success' | 'error') {
  if (!on()) return
  Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => undefined)
}

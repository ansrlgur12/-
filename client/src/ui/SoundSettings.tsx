import { useEffect, useRef, useState } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { playEffect, useSound } from '../lib/sound'
import { hapticTap } from '../lib/haptics'
import { Icon } from './Icon'
import { GameButton } from './GameButton'
import { BORDER, FONT, INK } from './theme'
import { CartoonTitle } from './OutlinedText'

const TRACK_W = 58
const TRACK_H = 32
const KNOB = 24

/** 켜기/끄기 스위치. 시스템 스위치는 iOS 버전마다 크기가 달라 줄 가운데에 안 맞아서 직접 그린다 */
function Toggle({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  const t = useRef(new Animated.Value(value ? 1 : 0)).current
  useEffect(() => {
    Animated.spring(t, { toValue: value ? 1 : 0, speed: 20, bounciness: 6, useNativeDriver: false }).start()
  }, [value, t])
  return (
    <Pressable
      hitSlop={8}
      onPress={() => (playEffect('tap'), onChange(!value))}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, { backgroundColor: t.interpolate({ inputRange: [0, 1], outputRange: ['#d5deef', '#4fbd7c'] }) }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, TRACK_W - BORDER * 2 - 4 - KNOB] }) }] }]} />
      </Animated.View>
      <Text style={[styles.toggleText, value ? styles.on : styles.off]}>{value ? 'ON' : 'OFF'}</Text>
    </Pressable>
  )
}

/** 소리·진동 켜고 끄는 두 줄 (메인 화면 설정, 게임 메뉴에서 같이 쓴다) */
export function SoundRows() {
  const { muted, vibrate, setMuted, setVibrate } = useSound()
  return (
    <>
      <View style={styles.row}>
        <Icon name={muted ? 'muted' : 'speaker'} size={28} />
        <Text style={styles.rowText}>소리</Text>
        <Toggle value={!muted} onChange={(on) => setMuted(!on)} />
      </View>
      <View style={styles.row}>
        <Icon name="vibrate" size={28} />
        <Text style={styles.rowText}>진동</Text>
        <Toggle
          value={vibrate}
          onChange={(on) => {
            setVibrate(on)
            if (on) hapticTap()
          }}
        />
      </View>
    </>
  )
}

/** 메인 화면 오른쪽 위 설정 버튼. 누르면 아래에서 소리·진동 설정 창이 올라온다 (버튼은 손 닿는 아래쪽) */
export function SettingsButton({ style }: { style?: object }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Pressable style={style} hitSlop={6} onPress={() => (playEffect('tap'), setOpen(true))}>
        <Icon name="gear" size={26} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Modal은 앱의 SafeAreaProvider 밖이라 안에 따로 둬야 홈 바를 피한다 */}
        <SafeAreaProvider>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <CartoonTitle size={26}>설정</CartoonTitle>
            <SoundRows />
            <GameButton label="닫기" color="white" size="md" onPress={() => setOpen(false)} />
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(27,37,89,0.4)' },
  sheet: { backgroundColor: '#f4f8ff', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: BORDER, borderBottomWidth: 0, borderColor: INK, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff', borderRadius: 16, borderWidth: BORDER, borderColor: '#c5d3ee', paddingHorizontal: 14, height: 58 },
  rowText: { flex: 1, fontFamily: FONT.button, fontSize: 18, color: INK },
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, borderWidth: BORDER, borderColor: INK, padding: 2, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#ffffff', borderWidth: BORDER, borderColor: INK },
  toggleText: { position: 'absolute', top: 0, bottom: 0, textAlignVertical: 'center', lineHeight: TRACK_H, fontFamily: FONT.button, fontSize: 11 },
  on: { left: 9, color: '#ffffff' },
  off: { right: 8, color: '#6b7590' },
})

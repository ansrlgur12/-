import { useState } from 'react'
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { playEffect, useSound } from '../lib/sound'
import { hapticTap } from '../lib/haptics'
import { useGame } from '../store/game'
import { Icon } from './Icon'

/**
 * 게임 화면 오른쪽 위 메뉴 버튼. 누르면 아래에서 올라오는 창에 소리·진동 설정과 게임 나가기.
 * (창의 버튼은 손이 닿기 쉬운 아래쪽에)
 */
export function GameMenu({ top }: { top: number }) {
  const [open, setOpen] = useState(false)
  const { muted, vibrate, setMuted, setVibrate } = useSound()
  const status = useGame((s) => s.status)
  const room = useGame((s) => s.room)
  const leaveRoom = useGame((s) => s.leaveRoom)
  const hardcore = room?.rules.mode === 'hardcore'

  const exit = () => {
    if (status !== 'playing') {
      setOpen(false)
      leaveRoom()
      return
    }
    const message = hardcore
      ? '중간 저장이 없어서 이 판은 사라져요.' + (room?.solo ? '' : ' 내 자리는 AI가 이어서 맡아요.')
      : '끝까지 하지 않으면 기록이 남지 않아요.'
    Alert.alert('게임에서 나갈까요?', message, [
      { text: '계속하기', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: () => {
          setOpen(false)
          leaveRoom()
        },
      },
    ])
  }

  return (
    <>
      <Pressable
        style={[styles.button, { top }]}
        hitSlop={8}
        onPress={() => {
          playEffect('tap')
          setOpen(true)
        }}
      >
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.bar} />
        ))}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Modal은 앱의 SafeAreaProvider 밖이라 안에 따로 둬야 홈 바를 피한다 */}
        <SafeAreaProvider>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <Text style={styles.title}>메뉴</Text>
          <View style={styles.row}>
            <Icon name={muted ? 'muted' : 'speaker'} size={28} />
            <Text style={styles.rowText}>소리</Text>
            <Switch value={!muted} onValueChange={(on) => setMuted(!on)} />
          </View>
          <View style={styles.row}>
            <Icon name="vibrate" size={28} />
            <Text style={styles.rowText}>진동</Text>
            <Switch
              value={vibrate}
              onValueChange={(on) => {
                setVibrate(on)
                if (on) hapticTap()
              }}
            />
          </View>
          <Pressable style={styles.exit} onPress={exit}>
            <Icon name="door" size={26} />
            <Text style={styles.exitText}>{status === 'playing' ? '게임 나가기' : room?.solo ? '메뉴로' : '방 나가기'}</Text>
          </Pressable>
          <Pressable style={styles.close} onPress={() => setOpen(false)}>
            <Text style={styles.closeText}>계속하기</Text>
          </Pressable>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bar: { width: 18, height: 2.5, borderRadius: 2, backgroundColor: '#0f172a' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 10 },
  title: { fontSize: 20, fontWeight: '900', color: '#0f172a', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f1f5f9', borderRadius: 14, paddingHorizontal: 14, height: 56 },
  rowText: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0f172a' },
  exit: { height: 54, borderRadius: 14, backgroundColor: '#e11d48', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  exitText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  close: { height: 50, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#475569', fontSize: 16, fontWeight: '700' },
})

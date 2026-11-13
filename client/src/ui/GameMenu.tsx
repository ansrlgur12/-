import { useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { playEffect } from '../lib/sound'
import { useGame } from '../store/game'
import { SoundRows } from './SoundSettings'
import { ConfirmDialog } from './ConfirmDialog'
import { GameButton } from './GameButton'
import { CartoonTitle } from './OutlinedText'

/**
 * 게임 화면 오른쪽 위 메뉴 버튼. 누르면 아래에서 올라오는 창에 소리·진동 설정과 게임 나가기.
 * (창의 버튼은 손이 닿기 쉬운 아래쪽에)
 */
export function GameMenu({ top }: { top: number }) {
  const [open, setOpen] = useState(false)
  /** 게임 중 나가기 전에 묻는 창 */
  const [asking, setAsking] = useState(false)
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
    setAsking(true)
  }
  const exitMessage = hardcore
    ? '중간 저장이 없어서 이 판은 사라져요.' + (room?.solo ? '' : ' 내 자리는 AI가 이어서 맡아요.')
    : '끝까지 하지 않으면 기록이 남지 않아요.'
  const close = () => {
    setAsking(false)
    setOpen(false)
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

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => (asking ? setAsking(false) : close())}>
        {/* Modal은 앱의 SafeAreaProvider 밖이라 안에 따로 둬야 홈 바를 피한다 */}
        <SafeAreaProvider>
          <Pressable style={styles.backdrop} onPress={close} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <CartoonTitle size={26}>메뉴</CartoonTitle>
          <SoundRows />
          <GameButton label={status === 'playing' ? '게임 나가기' : room?.solo ? '메뉴로' : '방 나가기'} color="red" size="md" onPress={exit} />
          <GameButton label="계속하기" color="white" size="sm" onPress={close} />
          </SafeAreaView>
          {asking && (
            <ConfirmDialog
              title="게임에서 나갈까요?"
              message={exitMessage}
              cancelLabel="계속하기"
              confirmLabel="나가기"
              onCancel={() => setAsking(false)}
              onConfirm={() => {
                close()
                leaveRoom()
              }}
            />
          )}
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
})

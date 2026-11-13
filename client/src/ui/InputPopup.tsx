import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { GameButton } from './GameButton'
import { BORDER, CARD, FONT, INK } from './theme'
import { CartoonTitle } from './OutlinedText'

interface Props {
  visible: boolean
  title: string
  initialValue?: string
  placeholder?: string
  maxLength?: number
  /** 초대 코드처럼 대문자로만 받을 때 */
  uppercase?: boolean
  /** 이 길이 이상이어야 확인할 수 있다 */
  minLength?: number
  confirmLabel?: string
  onConfirm: (value: string) => void
  onClose: () => void
}

/**
 * 화면 가운데 뜨는 입력창. 키보드가 올라와도 가리지 않게 키보드 위로 밀어 올린다.
 * (아래쪽 패널에 입력칸을 두면 키보드에 가려진다)
 */
export function InputPopup({ visible, title, initialValue = '', placeholder, maxLength, uppercase, minLength = 1, confirmLabel = '확인', onConfirm, onClose }: Props) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => {
    if (visible) setValue(initialValue)
  }, [visible, initialValue])

  const trimmed = value.trim()
  const ok = trimmed.length >= minLength
  const confirm = () => {
    if (!ok) return
    onClose()
    onConfirm(trimmed)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <CartoonTitle size={24}>{title}</CartoonTitle>
          <TextInput
            style={[styles.input, uppercase && styles.upper]}
            value={value}
            onChangeText={(t) => setValue(uppercase ? t.toUpperCase() : t)}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus
            autoCapitalize={uppercase ? 'characters' : 'none'}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={confirm}
          />
          <View style={styles.buttons}>
            <GameButton style={styles.button} label="취소" color="white" size="sm" onPress={onClose} />
            <GameButton style={styles.button} label={confirmLabel} color="yellow" size="sm" disabled={!ok} onPress={confirm} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { ...CARD, padding: 18, gap: 14 },
  input: { fontFamily: FONT.body, borderWidth: BORDER, borderColor: INK, borderRadius: 14, paddingHorizontal: 14, height: 52, fontSize: 17, backgroundColor: '#f7f9ff' },
  upper: { fontFamily: FONT.body, letterSpacing: 3, fontSize: 20, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
})

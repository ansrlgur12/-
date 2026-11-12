import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

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
          <Text style={styles.title}>{title}</Text>
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
            <Pressable style={[styles.button, styles.cancel]} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.ok, !ok && styles.disabled]} disabled={!ok} onPress={confirm}>
              <Text style={styles.okText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 14 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, height: 46, fontSize: 16 },
  upper: { letterSpacing: 3, fontWeight: '700', fontSize: 20, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancel: { backgroundColor: '#f3f4f6' },
  cancelText: { color: '#374151', fontWeight: '600' },
  ok: { backgroundColor: '#111827' },
  okText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.4 },
})

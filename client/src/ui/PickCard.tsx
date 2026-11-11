import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Spot } from '../store/game'

interface Props {
  spot: Spot
  onStart: () => void
  onDestination: () => void
  onClose: () => void
}

/** 길게 누르거나 검색한 위치를 출발지·목적지로 정하는 카드 (지도 아래쪽에 뜬다) */
export function PickCard({ spot, onStart, onDestination, onClose }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.titleBox}>
          <Text style={styles.name} numberOfLines={1}>
            {spot.name}
          </Text>
          {spot.address && (
            <Text style={styles.address} numberOfLines={1}>
              {spot.address}
            </Text>
          )}
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.buttons}>
        <Pressable style={[styles.button, styles.start]} onPress={onStart}>
          <Text style={styles.buttonText}>출발</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.destination]} onPress={onDestination}>
          <Text style={styles.buttonText}>도착</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 10, right: 10, bottom: 22, backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleBox: { flex: 1 },
  name: { fontWeight: '700', fontSize: 16, color: '#111827' },
  address: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  close: { fontSize: 16, color: '#6b7280' },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  start: { backgroundColor: '#16a34a' },
  destination: { backgroundColor: '#e11d48' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})

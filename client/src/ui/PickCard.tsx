import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Spot } from '../store/game'
import { GameButton } from './GameButton'
import { Icon } from './Icon'
import { BORDER, FONT, INK, LIP } from './theme'

interface Props {
  spot: Spot
  onStart: () => void
  onDestination: () => void
  onClose: () => void
}

/** 아래 준비 패널이 둥근 모서리만큼 지도 위로 올라와 있어서, 그 위에 뜨도록 띄우는 높이 */
const ABOVE_PANEL = 36

/** 길게 누르거나 검색한 위치를 출발지·목적지로 정하는 카드 (지도 아래쪽, 준비 패널 바로 위에 뜬다) */
export function PickCard({ spot, onStart, onDestination, onClose }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Icon name="pin" size={36} />
        <View style={styles.titleBox}>
          <Text style={[styles.name, spot.resolving && styles.resolving]} numberOfLines={1}>
            {spot.name}
          </Text>
          {spot.address && (
            <Text style={styles.address} numberOfLines={1}>
              {spot.address}
            </Text>
          )}
        </View>
        <Pressable style={({ pressed }) => [styles.close, pressed && styles.closePressed]} onPress={onClose} hitSlop={10}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.buttons}>
        <GameButton style={styles.button} label="출발지로" color="green" size="sm" icon={<Icon name="flag" size={24} />} disabled={spot.resolving} onPress={onStart} />
        <GameButton style={styles.button} label="도착지로" color="red" size="sm" icon={<Icon name="finish" size={24} />} disabled={spot.resolving} onPress={onDestination} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: ABOVE_PANEL,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: BORDER,
    borderBottomWidth: LIP,
    borderColor: INK,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleBox: { flex: 1, gap: 1 },
  name: { fontFamily: FONT.button, fontSize: 18, color: INK },
  address: { fontFamily: FONT.body, color: '#6b7590', fontSize: 12 },
  resolving: { color: '#9aa3bd' },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eef2fa', borderWidth: BORDER, borderColor: '#c5d3ee', alignItems: 'center', justifyContent: 'center' },
  closePressed: { backgroundColor: '#dde5f5' },
  closeText: { fontFamily: FONT.button, fontSize: 14, color: INK },
  buttons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1 },
})

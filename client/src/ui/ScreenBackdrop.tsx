import type { ReactNode } from 'react'
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { CartoonTitle } from './OutlinedText'
import { BORDER, FONT, INK } from './theme'

// 채도를 낮춘 복사본 (assets/main/soft, 원본은 그대로)
const BG = require('../../assets/main/soft/menu-bg.jpg')
const BG_ASPECT = 1086 / 1448

/**
 * 전체 화면(옷장·기록실 등)의 배경: 메인 화면과 같은 하늘·풀밭 그림을 화면 전체(노치·홈 바 밑까지)에 깔고
 * 위에 흰 카드가 잘 읽히게 살짝 어둡게 덮는다. 화면 맨 바깥(SafeAreaView 밖, 또는 absoluteFill)에 둔다
 */
export function ScreenBackdrop() {
  const { width, height } = useWindowDimensions()
  const h = Math.max(height, width / BG_ASPECT)
  const w = h * BG_ASPECT
  return (
    <View style={[styles.box, { width, height }]} pointerEvents="none">
      <Image source={BG} style={{ position: 'absolute', width: w, height: h, left: (width - w) / 2, bottom: 0 }} resizeMode="stretch" />
      <View style={styles.tint} />
    </View>
  )
}

/** 전체 화면 머리: 왼쪽 "‹ 메뉴" 알약 버튼, 가운데 흰 만화 제목, 오른쪽 자리(코인 등) */
export function ScreenHeader({ title, back = '메뉴', onBack, right }: { title: string; back?: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.back} onPress={onBack} hitSlop={12}>
        <Text style={styles.backText}>‹ {back}</Text>
      </Pressable>
      <CartoonTitle size={30} light>
        {title}
      </CartoonTitle>
      <View style={styles.right}>{right}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  back: { width: 86, height: 40, borderRadius: 20, backgroundColor: 'rgba(27,37,89,0.85)', borderWidth: BORDER, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  backText: { fontFamily: FONT.button, color: '#fff', fontSize: 17 },
  right: { width: 86, alignItems: 'flex-end' },
  box: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,50,120,0.18)' },
})

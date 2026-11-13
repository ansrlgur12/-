import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Canvas } from '@react-three/fiber/native'
import { DEFAULT_OUTFIT } from '@jikjwau/shared/config'
import type { Outfit } from '@jikjwau/shared/types'
import type { StyleProp, ViewStyle } from 'react-native'
import { Person } from '../map/Person'
import { useProfile } from '../store/profile'
import { BORDER } from './theme'

/**
 * 메인 화면 왼쪽 위 얼굴: 지금 입고 있는 옷(모자·윗옷·장신구) 그대로의 3D 캐릭터 상반신.
 * 옷이 바뀔 때만 다시 그린다 (frameloop demand). 대기실에서는 자리마다 그 사람 옷으로
 */
export const ProfileAvatar = memo(function ProfileAvatar({ size, outfit: given, style }: { size: number; outfit?: Outfit; style?: StyleProp<ViewStyle> }) {
  const mine = useProfile((s) => s.profile?.outfit) ?? DEFAULT_OUTFIT
  // outfit을 주면 그 옷(대기실의 다른 사람), 아니면 내 옷
  const outfit = given ?? mine
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.26 }, style]}>
      <Canvas frameloop="demand" camera={{ position: [0, 0.3, 6.2], fov: 40 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 6, 8]} intensity={1.3} />
        {/* 머리와 어깨가 가운데 오게 내려 두고, 얼굴이 앞을 보게 돌린다 */}
        <group position={[0, -5, 0]} rotation={[0, Math.PI, 0]}>
          <Person outfit={outfit} />
        </group>
      </Canvas>
    </View>
  )
})

const styles = StyleSheet.create({
  box: { backgroundColor: '#c7b8ff', borderWidth: BORDER, borderColor: '#7c5cf0', overflow: 'hidden' },
})

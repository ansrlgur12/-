import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg'
import type { CameraRig } from '../map/cameraRig'
import { playEffect } from '../lib/sound'
import { INK } from './theme'

const SIZE = 42

/**
 * 지도 오른쪽 위 나침반. 지도를 돌리면 같이 돌아 늘 북쪽(빨간 바늘)을 가리킨다.
 * 누르면 북쪽이 위로 오게 돌린다 (카메라가 부드럽게 따라가며 나침반도 같이 돈다)
 */
export function Compass({ rig, top }: { rig: CameraRig; top: number }) {
  const [deg, setDeg] = useState(0)

  // 카메라 회전은 리렌더 없이 매 프레임 바뀌니, 화면 갱신마다 읽어서 조금이라도 달라졌을 때만 다시 그린다
  useEffect(() => {
    let last = NaN
    let frame = 0
    const tick = () => {
      // yaw만큼 돌리면 북쪽이 화면에서 시계 방향으로 그만큼 돌아가 보인다
      const next = (rig.viewYaw * 180) / Math.PI
      if (!(Math.abs(next - last) < 0.5)) {
        last = next
        setDeg(next)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [rig])

  const faceNorth = () => {
    playEffect('tap')
    rig.yaw = Math.round(rig.yaw / (Math.PI * 2)) * Math.PI * 2
  }

  return (
    <Pressable style={[styles.button, { top }]} onPress={faceNorth} hitSlop={6} accessibilityLabel="북쪽을 위로">
      <View style={{ transform: [{ rotate: `${deg}deg` }] }}>
        <Svg width={SIZE - 4} height={SIZE - 4} viewBox="0 0 40 40">
          {/* 북쪽 바늘(빨강)과 남쪽 바늘(흰색) */}
          <Path d="M20 11 L24.5 21 L15.5 21 Z" fill="#ec7b75" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M20 31 L24.5 21 L15.5 21 Z" fill="#ffffff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
          <Circle cx={20} cy={21} r={2} fill={INK} />
          <SvgText x={20} y={9.5} fontSize={7.5} fontWeight="bold" fill="#c85651" textAnchor="middle">
            N
          </SvgText>
        </Svg>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 10,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

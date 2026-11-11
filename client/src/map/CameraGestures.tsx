import { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  GestureDetector,
  useLongPressGesture,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler'
import { CAMERA_LIMITS, clamp, panRig, type CameraRig } from './cameraRig'

const PITCH_PER_PX = 0.005

/**
 * 3D 화면 위에 덮는 투명한 터치 영역. 지도 앱(카카오맵·구글지도 3D)과 같은 조작:
 * 한 손가락 끌기 = 지도 이동, 두 손가락 벌리기/오므리기 = 확대/축소,
 * 두 손가락 비틀기 = 회전, 두 손가락 함께 위아래로 끌기 = 기울기
 * 길게 누르기: onLongPress (화면 좌표). 없으면 꺼 둔다
 * 끌어 옮기기: 한 손가락이 닿은 곳에서 drag.start가 true를 돌려주면 지도 대신 그것(핀)을 끈다
 */
export interface DragHandlers {
  /** 끌기를 시작할지. true면 지도는 움직이지 않는다 */
  start: (x: number, y: number) => boolean
  move: (x: number, y: number) => void
  end: () => void
}

interface Props {
  rig: CameraRig
  onLongPress?: (x: number, y: number) => void
  drag?: DragHandlers
}

export function CameraGestures({ rig, onLongPress, drag }: Props) {
  const common = { runOnJS: true, disableReanimated: true } as const
  const [height, setHeight] = useState(1)
  const dragging = useRef(false)

  const pan = usePanGesture({
    ...common,
    maxPointers: 1,
    onBegin: (e) => {
      dragging.current = !!drag?.start(e.x, e.y)
    },
    onUpdate: (e) => {
      if (dragging.current) drag?.move(e.x, e.y)
      else panRig(rig, e.changeX, e.changeY, height)
    },
    onFinalize: () => {
      if (dragging.current) drag?.end()
      dragging.current = false
    },
  })

  const tilt = usePanGesture({
    ...common,
    minPointers: 2,
    averageTouches: true,
    onUpdate: (e) => {
      rig.pitch = clamp(rig.pitch + e.changeY * PITCH_PER_PX, CAMERA_LIMITS.pitch.min, CAMERA_LIMITS.pitch.max)
    },
  })

  const pinch = usePinchGesture({
    ...common,
    onUpdate: (e) => {
      if (e.scaleChange > 0) {
        rig.distance = clamp(rig.distance / e.scaleChange, CAMERA_LIMITS.distance.min, CAMERA_LIMITS.distance.max)
      }
    },
  })

  const rotation = useRotationGesture({
    ...common,
    onUpdate: (e) => {
      rig.yaw += e.rotationChange
    },
  })

  const longPress = useLongPressGesture({
    ...common,
    enabled: !!onLongPress,
    minDuration: 450,
    onActivate: (e) => onLongPress?.(e.x, e.y),
  })

  const gesture = useSimultaneousGestures(pan, tilt, pinch, rotation, longPress)

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)} />
    </GestureDetector>
  )
}

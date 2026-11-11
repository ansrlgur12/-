import { useFrame } from '@react-three/fiber/native'
import type { ScenePicker } from './scenePicker'

/** Canvas 안에서 카메라와 화면 크기를 picker에 넘긴다 */
export function PickerBridge({ picker }: { picker: ScenePicker }) {
  useFrame(({ camera, size }) => {
    picker.camera = camera
    picker.width = size.width
    picker.height = size.height
  })
  return null
}

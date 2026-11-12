import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import type { Vec2 } from '@jikjwau/shared/types'
import { heightAt } from './terrain'

/**
 * 화면 좌표 ↔ 땅 위 지점. Canvas 안의 PickerBridge가 카메라와 크기를 써 넣고,
 * Canvas 밖(제스처, 툴팁)에서 읽는다.
 * pin: 지금 꽂혀 있는 핀 (PickMarker가 매 프레임 써 넣는다). 월드 좌표와 높이(m)
 */
export interface ScenePicker {
  camera?: Camera
  width: number
  height: number
  pin: { x: number; y: number; z: number; height: number } | null
}

export function createScenePicker(): ScenePicker {
  return { width: 1, height: 1, pin: null }
}

const GROUND = new Plane(new Vector3(0, 1, 0), 0)
const raycaster = new Raycaster()
const ndc = new Vector2()
const hit = new Vector3()
const tmp = new Vector3()

/**
 * 화면의 (x, y) px 아래 땅 지점을 로컬 좌표(x 동쪽, y 북쪽)로. 하늘을 가리키면 null.
 * 땅이 울퉁불퉁하니 평면과 만나는 점을 구하고, 그 점의 땅 높이로 평면을 옮기기를 몇 번 되풀이한다.
 */
export function pickGround(picker: ScenePicker, x: number, y: number): Vec2 | null {
  if (!picker.camera) return null
  ndc.set((x / picker.width) * 2 - 1, -(y / picker.height) * 2 + 1)
  raycaster.setFromCamera(ndc, picker.camera)
  GROUND.constant = 0
  let found: Vec2 | null = null
  for (let i = 0; i < 5; i++) {
    if (!raycaster.ray.intersectPlane(GROUND, hit)) break
    found = { x: hit.x, y: -hit.z }
    GROUND.constant = -heightAt(found.x, found.y)
  }
  return found
}

/** 월드 좌표 → 화면 px. 카메라 뒤면 null */
export function toScreen(picker: ScenePicker, x: number, y: number, z: number): { x: number; y: number } | null {
  if (!picker.camera) return null
  tmp.set(x, y, z).project(picker.camera)
  if (tmp.z > 1) return null
  return { x: ((tmp.x + 1) / 2) * picker.width, y: ((1 - tmp.y) / 2) * picker.height }
}

/** 손가락이 이만큼(px) 안이면 핀을 잡은 것으로 본다 */
const PIN_HIT_PX = 36

/** 화면 (x, y)가 핀(땅에서 꼭대기까지 세로 막대로 본다)을 눌렀는지 */
export function hitsPin(picker: ScenePicker, x: number, y: number): boolean {
  const pin = picker.pin
  if (!pin) return false
  const base = toScreen(picker, pin.x, pin.y, pin.z)
  const top = toScreen(picker, pin.x, pin.y + pin.height, pin.z)
  if (!base || !top) return false
  // 점과 선분 사이 거리
  const dx = top.x - base.x
  const dy = top.y - base.y
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - base.x) * dx + (y - base.y) * dy) / len2)) : 0
  return Math.hypot(x - (base.x + dx * t), y - (base.y + dy * t)) <= PIN_HIT_PX
}

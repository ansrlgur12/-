import { Vector3 } from 'three'

/**
 * 제스처가 쓰고 카메라가 매 프레임 읽는 값. 리렌더 없이 바뀌도록 일반 객체로 둔다.
 * yaw: 바라보는 지점 주위를 도는 각도 (0 = 남쪽에서 북쪽을 바라봄), pitch: 지면에서 올려본 각도
 * focus: 카메라가 바라보는 땅 위 지점 (월드 좌표). following이면 매 프레임 일행 위치로 맞춘다
 */
export interface CameraRig {
  distance: number
  yaw: number
  pitch: number
  focus: Vector3
  following: boolean
}

export const CAMERA_LIMITS = {
  distance: { min: 30, max: 3500 },
  pitch: { min: 0.3, max: 1.5 },
}

/** 화면 세로 시야각 (Canvas camera fov와 같게) */
export const CAMERA_FOV_DEG = 45

export function createCameraRig(): CameraRig {
  return { distance: 160, yaw: 0, pitch: 0.95, focus: new Vector3(), following: true }
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * 화면에서 손가락이 (dx, dy)px 움직인 만큼 지도를 끌어 focus를 옮긴다.
 * 바라보는 지점 근처에서 손가락 아래 땅이 손가락을 따라오도록 거리·기울기로 배율을 맞춘다.
 */
export function panRig(rig: CameraRig, dx: number, dy: number, viewHeight: number) {
  const metersPerPx = (2 * rig.distance * Math.tan(((CAMERA_FOV_DEG / 2) * Math.PI) / 180)) / Math.max(1, viewHeight)
  // 카메라 기준 오른쪽·앞쪽 (땅 위)
  const rightX = Math.cos(rig.yaw)
  const rightZ = -Math.sin(rig.yaw)
  const forwardX = -Math.sin(rig.yaw)
  const forwardZ = -Math.cos(rig.yaw)
  const ahead = (dy * metersPerPx) / Math.max(0.3, Math.sin(rig.pitch))
  rig.following = false
  rig.focus.x += -dx * metersPerPx * rightX + ahead * forwardX
  rig.focus.z += -dx * metersPerPx * rightZ + ahead * forwardZ
}

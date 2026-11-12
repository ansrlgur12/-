import { AdditiveBlending, Color, DoubleSide, MeshBasicMaterial } from 'three'

/** 게임은 항상 이 시각(아침)에서 시작한다 */
export const GAME_START_HOUR = 9
/** 실제 1분마다 게임 속 시간이 이만큼 흐른다 (24분이면 하루) */
export const GAME_HOURS_PER_MINUTE = 6

export interface Sky {
  sky: Color
  ambient: number
  ambientColor: Color
  sun: number
  sunColor: Color
  /** 0(낮) ~ 1(밤). 창문·가로등 불빛 세기 */
  night: number
}

// [시각, 하늘, 주변광, 주변광 색, 햇빛, 햇빛 색, 밤]
const KEYS: Array<[number, string, number, string, number, string, number]> = [
  [0, '#0b1430', 0.45, '#7f8fd0', 0.18, '#a9bbff', 1],
  [4.5, '#111c40', 0.45, '#7f8fd0', 0.18, '#a9bbff', 1],
  [5.7, '#f0a585', 0.55, '#ffd9c2', 0.55, '#ffb37a', 0.55],
  [7, '#cfe8f3', 0.72, '#ffffff', 1.15, '#fff4e0', 0],
  [12, '#cfe8f3', 0.75, '#ffffff', 1.3, '#ffffff', 0],
  [17, '#d6e5ee', 0.72, '#ffffff', 1.15, '#fff1d6', 0],
  [18.5, '#f39a68', 0.58, '#ffd2b0', 0.75, '#ff9a5a', 0.3],
  [19.5, '#3d3160', 0.48, '#9a8fd0', 0.32, '#c9a0ff', 0.8],
  [20.5, '#0b1430', 0.45, '#7f8fd0', 0.18, '#a9bbff', 1],
  [24, '#0b1430', 0.45, '#7f8fd0', 0.18, '#a9bbff', 1],
]

const a = new Color()
const b = new Color()

/** 그 시각(0~24, 넘어가면 돌아온다)의 하늘과 빛 */
export function skyAt(hour: number): Sky {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++
  const [h0, sky0, amb0, ambC0, sun0, sunC0, n0] = KEYS[i]
  const [h1, sky1, amb1, ambC1, sun1, sunC1, n1] = KEYS[i + 1]
  const t = (h - h0) / (h1 - h0)
  const mix = (x: number, y: number) => x + (y - x) * t
  return {
    sky: new Color().lerpColors(a.set(sky0), b.set(sky1), t),
    ambient: mix(amb0, amb1),
    ambientColor: new Color().lerpColors(a.set(ambC0), b.set(ambC1), t),
    sun: mix(sun0, sun1),
    sunColor: new Color().lerpColors(a.set(sunC0), b.set(sunC1), t),
    night: mix(n0, n1),
  }
}

/** 지금 한국 시각 (시, 소수) */
export function kstHour(now = Date.now()) {
  return (now / 3_600_000 + 9) % 24
}

/** 하늘이 어두워서 그 위 글자를 밝게 써야 하는지 */
export function isDarkSky(sky: Color) {
  return 0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b < 0.45
}

// 밤에 빛나는 것들은 재질 하나를 같이 쓰고, DayNight가 매 프레임 세기만 바꾼다
export const nightMaterials = {
  window: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }),
  lampHead: new MeshBasicMaterial({ color: '#64748b' }),
  /** 고층 건물 꼭대기 빨간 항공등 (밤에 깜빡인다) */
  beacon: new MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0, depthWrite: false }),
  /** 바닥 불빛. 지오메트리의 정점 색(가운데 밝고 끝은 0)이 곱해져 끝이 흐려진다 */
  lampGlow: new MeshBasicMaterial({
    color: '#ffcf7a',
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -10,
  }),
}

const LAMP_OFF = new Color('#64748b')
const LAMP_ON = new Color('#fff1b8')

export function setNight(night: number) {
  const { window, lampHead, lampGlow, beacon } = nightMaterials
  window.opacity = night
  window.visible = night > 0.01
  lampGlow.opacity = night * 0.8
  lampGlow.visible = night > 0.01
  lampHead.color.lerpColors(LAMP_OFF, LAMP_ON, night)
  // 1.5초마다 잠깐 켜진다
  const blink = (Date.now() % 1500) / 1500 < 0.35 ? 1 : 0.15
  beacon.opacity = night * blink
  beacon.visible = night > 0.01
}

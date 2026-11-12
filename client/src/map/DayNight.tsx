import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber/native'
import { Color, Fog, type AmbientLight, type DirectionalLight } from 'three'
import { useGame } from '../store/game'
import { GAME_HOURS_PER_MINUTE, GAME_START_HOUR, kstHour, setNight, skyAt } from './daylight'

/** 목표 하늘로 따라가는 빠르기 (화면이 바뀔 때 휙 바뀌지 않게) */
const EASE_PER_S = 1.5

/**
 * 하늘색·안개·빛·밤 불빛을 시각에 맞춘다.
 * 메뉴는 지금 한국 시각, 게임 준비 중은 아침, 게임이 시작되면 아침부터 시간이 흐른다.
 */
export function DayNight() {
  const scene = useThree((s) => s.scene)
  const ambient = useRef<AmbientLight>(null)
  const sun = useRef<DirectionalLight>(null)
  const status = useGame((s) => s.status)
  const startedAt = useRef(0)
  const night = useRef(0)
  const first = useRef(true)

  // 판이 시작될 때마다 아침부터 (끝난 뒤에도 그 판의 시간은 계속 흐른다)
  useEffect(() => {
    if (status === 'playing') startedAt.current = Date.now()
  }, [status])

  useEffect(() => {
    const sky = skyAt(kstHour())
    scene.background = sky.sky.clone()
    scene.fog = new Fog(sky.sky.clone(), 600, 1800)
  }, [scene])

  useFrame((_, delta) => {
    const { screen, status } = useGame.getState()
    const hour =
      screen !== 'game'
        ? kstHour()
        : status === 'playing' || status === 'ended'
          ? GAME_START_HOUR + ((startedAt.current ? Date.now() - startedAt.current : 0) / 60_000) * GAME_HOURS_PER_MINUTE
          : GAME_START_HOUR
    const target = skyAt(hour)
    const k = first.current ? 1 : 1 - Math.exp(-delta * EASE_PER_S)
    first.current = false

    ;(scene.background as Color).lerp(target.sky, k)
    scene.fog?.color.lerp(target.sky, k)
    if (ambient.current) {
      ambient.current.intensity += (target.ambient - ambient.current.intensity) * k
      ambient.current.color.lerp(target.ambientColor, k)
    }
    if (sun.current) {
      sun.current.intensity += (target.sun - sun.current.intensity) * k
      sun.current.color.lerp(target.sunColor, k)
      // 해가 동쪽에서 떠서 서쪽으로 진다 (밤에는 높이 뜬 달빛)
      const angle = ((hour - 6) / 12) * Math.PI
      const up = Math.sin(angle)
      sun.current.position.set(up > 0 ? Math.cos(angle) * 260 : 80, up > 0 ? 120 + up * 220 : 300, 180)
    }
    night.current += (target.night - night.current) * k
    setNight(night.current)
  })

  return (
    <>
      <ambientLight ref={ambient} intensity={0.75} />
      <directionalLight ref={sun} position={[120, 300, 180]} intensity={1.3} />
    </>
  )
}

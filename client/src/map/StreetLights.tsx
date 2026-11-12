import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Matrix4, MeshLambertMaterial, type InstancedMesh } from 'three'
import type { NodeId, Vec2 } from '@jikjwau/shared/types'
import { classify, ROAD_STYLE } from './RoadMesh'
import { nightMaterials } from './daylight'
import { heightAt } from './terrain'

const POLE_H = 6
/** 길을 따라 이 간격마다 하나 */
const SPACING_M = 40
/** 이보다 가까운 가로등은 하나만 (교차로에 몰리지 않게) */
const MIN_GAP_M = 18
/** 타일 하나에 최대 개수 */
const MAX_LAMPS = 400
/** 바닥에 비치는 불빛 반지름 */
const GLOW_R = 9

// 모든 타일이 같은 모양·재질을 쓴다
const poleGeometry = new BoxGeometry(0.25, POLE_H, 0.25).translate(0, POLE_H / 2, 0)
const headGeometry = new BoxGeometry(0.9, 0.35, 0.9).translate(0, POLE_H + 0.15, 0)
const glowGeometry = softDisc(GLOW_R, 6, 24).translate(0, 0.05, 0)
const poleMaterial = new MeshLambertMaterial({ color: '#475569' })

/**
 * 가운데가 밝고 끝으로 갈수록 0이 되는 바닥 원판. 정점 색이 밝기라서
 * (더하기 혼합이면 검정은 안 보인다) 동그란 테두리 없이 번진 빛처럼 보인다.
 */
function softDisc(radius: number, rings: number, segments: number) {
  const positions: number[] = [0, 0, 0]
  const colors: number[] = [1, 1, 1]
  for (let r = 1; r <= rings; r++) {
    const t = r / rings
    // 가운데는 천천히, 끝에서는 0으로 부드럽게 떨어진다
    const v = (1 - t) ** 2 * (1 - t * 0.3)
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2
      positions.push(Math.cos(a) * radius * t, 0, Math.sin(a) * radius * t)
      colors.push(v, v, v)
    }
  }
  const index: number[] = []
  for (let k = 0; k < segments; k++) index.push(0, 1 + ((k + 1) % segments), 1 + k)
  for (let r = 1; r < rings; r++) {
    const inner = 1 + (r - 1) * segments
    const outer = 1 + r * segments
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments
      index.push(inner + k, inner + k1, outer + k, inner + k1, outer + k1, outer + k)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
  geometry.setIndex(index)
  return geometry
}

interface Props {
  positions: Map<NodeId, Vec2>
  segments: Array<[NodeId, NodeId, string]>
  tileKey: string
}

/** 큰길·일반 도로 옆 가로등. 밤이 되면 머리가 켜지고 바닥에 불빛이 비친다 */
export function StreetLights({ positions, segments, tileKey }: Props) {
  const lamps = useMemo(() => {
    const out: Array<Vec2 & { h: number }> = []
    const taken = new Set<string>()
    const add = (x: number, y: number) => {
      const key = `${Math.round(x / MIN_GAP_M)},${Math.round(y / MIN_GAP_M)}`
      if (taken.has(key) || out.length >= MAX_LAMPS) return
      taken.add(key)
      out.push({ x, y, h: heightAt(x, y, tileKey) })
    }
    for (const [ia, ib, highway] of segments) {
      const cls = classify(highway)
      if (cls === 'path') continue
      const a = positions.get(ia)
      const b = positions.get(ib)
      if (!a || !b) continue
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 1) continue
      const ux = (b.x - a.x) / len
      const uy = (b.y - a.y) / len
      // 진행 방향 오른쪽 길가
      const side = ROAD_STYLE[cls].width / 2 + 1.2
      for (let d = Math.min(len / 2, SPACING_M / 2); d < len; d += SPACING_M) {
        add(a.x + ux * d + uy * side, a.y + uy * d - ux * side)
      }
    }
    return out
  }, [positions, segments, tileKey])

  const pole = useRef<InstancedMesh>(null)
  const head = useRef<InstancedMesh>(null)
  const glow = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = new Matrix4()
    for (const mesh of [pole.current, head.current, glow.current]) {
      if (!mesh) continue
      lamps.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.h, -p.y)))
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [lamps])

  if (lamps.length === 0) return null

  return (
    <group key={lamps.length}>
      <instancedMesh ref={pole} args={[poleGeometry, poleMaterial, lamps.length]} />
      <instancedMesh ref={head} args={[headGeometry, nightMaterials.lampHead, lamps.length]} />
      <instancedMesh ref={glow} args={[glowGeometry, nightMaterials.lampGlow, lamps.length]} renderOrder={2} />
    </group>
  )
}

import { useEffect, useMemo } from 'react'
import type { Point } from '@jikjwau/shared/types'
import { buildRibbon } from './RoadMesh'

/** 지나온 길 */
export function Trail({ points }: { points: Point[] }) {
  const geometry = useMemo(() => {
    const segments = []
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1]
      const [bx, by] = points[i]
      if (ax !== bx || ay !== by) segments.push([{ x: ax, y: ay }, { x: bx, y: by }] as const)
    }
    return segments.length > 0 ? buildRibbon(segments.map(([a, b]) => [a, b]), 2.2, 0.05) : null
  }, [points])

  useEffect(() => () => geometry?.dispose(), [geometry])

  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#f97316" transparent opacity={0.8} polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} />
    </mesh>
  )
}

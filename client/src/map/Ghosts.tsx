import { useCallback, useMemo } from 'react'
import { Vector3 } from 'three'
import type { LatLng, Point, Seat } from '@jikjwau/shared/types'
import { project } from '@jikjwau/shared/geo'
import { ghostKey, useSocial, type GhostState } from '../store/social'
import { Party } from './Party'
import type { CameraRig } from './cameraRig'

const toPoint = (p: LatLng, origin: LatLng): Point => {
  const v = project(p, origin)
  return [v.x, v.y]
}

/** 근처에서 게임 중인 다른 방 일행. 반투명으로 걷기만 한다 (이름·출발지·목적지 없음) */
export function Ghosts({ origin, rig }: { origin: LatLng; rig: CameraRig }) {
  const ghosts = useSocial((s) => s.ghosts)
  return (
    <>
      {Object.values(ghosts).map((g) => (
        <GhostParty key={g.id} ghost={g} origin={origin} rig={rig} />
      ))}
    </>
  )
}

function GhostParty({ ghost, origin, rig }: { ghost: GhostState; origin: LatLng; rig: CameraRig }) {
  const { id, latLng, route, routeId, outfits } = ghost
  const position = useMemo(() => toPoint(latLng, origin), [latLng, origin])
  const path = useMemo(() => route?.map((p) => toPoint(p, origin)) ?? null, [route, origin])
  const out = useMemo(() => new Vector3(), [])
  const onArrive = useCallback(() => useSocial.getState().arrived(id, routeId), [id, routeId])
  const emoteKey = useCallback((seat: Seat) => ghostKey(id, seat), [id])
  return <Party position={position} route={path} onArrive={onArrive} positionOut={out} rig={rig} outfits={outfits} ghost emoteKey={emoteKey} />
}

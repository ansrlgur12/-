import { memo, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/native'
import { Vector3 } from 'three'
import type { Point } from '@jikjwau/shared/types'
import { project } from '@jikjwau/shared/geo'
import { ARRIVAL_RADIUS_M } from '@jikjwau/shared/config'
import { useGame } from '../store/game'
import { useMapTiles, type MapTile } from '../store/mapTiles'
import { TileStreamer } from './TileStreamer'
import { RoadMesh } from './RoadMesh'
import { BuildingMesh } from './BuildingMesh'
import { WaterArea, WaterwayLines } from './WaterMesh'
import { HideWhenFar } from './Lod'
import { IntersectionDots } from './IntersectionDots'
import { Party } from './Party'
import { ChoiceArrows } from './ChoiceArrows'
import { DestinationMarker, FlagMarker, PickMarker } from './DestinationMarker'
import { Trail } from './Trail'
import { FollowCamera } from './FollowCamera'
import { PickerBridge } from './PickerBridge'
import { CAMERA_FOV_DEG, type CameraRig } from './cameraRig'
import type { ScenePicker } from './scenePicker'

interface Props {
  rig: CameraRig
  picker: ScenePicker
}

/** 교차로 점은 이보다 가까이 볼 때만 */
const DOTS_MAX_CAMERA_DISTANCE_M = 600

/**
 * 타일 하나의 도로·하천·건물. 타일 객체가 그대로면 다시 만들지 않는다.
 * 건물은 detailed(화면 중심 가까운 타일)일 때만 만든다.
 */
const TileMeshes = memo(function TileMeshes({ tile, detailed, rig }: { tile: MapTile; detailed: boolean; rig: CameraRig }) {
  return (
    <>
      {tile.roads && (
        <>
          <RoadMesh positions={tile.roads.positions} segments={tile.roads.segments} rig={rig} />
          <HideWhenFar rig={rig} maxDistance={DOTS_MAX_CAMERA_DISTANCE_M}>
            <IntersectionDots positions={tile.roads.positions} segments={tile.roads.segments} />
          </HideWhenFar>
        </>
      )}
      {tile.waterways.length > 0 && <WaterwayLines waterways={tile.waterways} />}
      {detailed && tile.buildings.length > 0 && <BuildingMesh buildings={tile.buildings} />}
    </>
  )
})

export function RoadScene({ rig, picker }: Props) {
  const tiles = useMapTiles((s) => s.tiles)
  const detail = useMapTiles((s) => s.detail)
  const status = useGame((s) => s.status)
  const game = useGame((s) => s.game)
  const start = useGame((s) => s.start)
  const destination = useGame((s) => s.destination)
  const picked = useGame((s) => s.picked)
  const position = useGame((s) => s.position)
  const trail = useGame((s) => s.trail)
  const current = useGame((s) => s.current)
  const prompt = useGame((s) => s.prompt)
  const finishMove = useGame((s) => s.finishMove)
  const partyPosition = useMemo(() => new Vector3(), [])

  // 설정 화면에서는 출발지를 중심으로 본다
  useEffect(() => {
    if (status === 'setup') partyPosition.set(0, 0, 0)
  }, [status, start, partyPosition])

  // 호수·강은 여러 타일에 같은 것이 들어 있으니 id로 한 번만 그린다
  const water = useMemo(() => {
    const unique = new Map<number, number[][]>()
    for (const tile of tiles.values()) {
      for (const [id, rings] of tile.water) if (!unique.has(id)) unique.set(id, rings)
    }
    return [...unique]
  }, [tiles])

  // 게임 중에는 서버가 길 위로 옮긴 목적지, 설정 중에는 고른 지점
  const target = useMemo((): Point | null => {
    if (game) return game.destination.point
    if (!destination) return null
    const p = project(destination.latLng, start.latLng)
    return [p.x, p.y]
  }, [game, destination, start])
  const pickedPoint = useMemo((): Point | null => {
    if (!picked) return null
    const p = project(picked.latLng, start.latLng)
    return [p.x, p.y]
  }, [picked, start])

  const route = current?.type === 'move' ? current.path : null

  return (
    <Canvas style={{ flex: 1 }} camera={{ position: [0, 200, 150], fov: CAMERA_FOV_DEG, near: 2, far: 12000 }}>
      <color attach="background" args={['#cfe8f3']} />
      <fog attach="fog" args={['#cfe8f3', 600, 1800]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[120, 300, 180]} intensity={1.3} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20000, 20000]} />
        <meshLambertMaterial color="#b9d8a8" />
      </mesh>

      {water.map(([id, rings]) => (
        <WaterArea key={id} rings={rings} />
      ))}
      {[...tiles.values()].map((tile) => (
        <TileMeshes key={tile.key} tile={tile} detailed={detail.has(tile.key)} rig={rig} />
      ))}

      {pickedPoint && <PickMarker point={pickedPoint} rig={rig} picker={picker} />}
      {status === 'setup' && <FlagMarker point={[0, 0]} color="#16a34a" />}
      {target && <DestinationMarker point={target} radiusM={game?.destination.radiusM ?? ARRIVAL_RADIUS_M} rig={rig} />}
      {status !== 'setup' && status !== 'starting' && (
        <>
          <Trail points={trail} />
          <Party position={position} route={route} onArrive={finishMove} positionOut={partyPosition} mySeat={game?.seat} rig={rig} />
          {prompt && !current && <ChoiceArrows here={position} options={prompt.options} />}
        </>
      )}

      <TileStreamer rig={rig} />
      <FollowCamera target={partyPosition} rig={rig} />
      <PickerBridge picker={picker} />
    </Canvas>
  )
}

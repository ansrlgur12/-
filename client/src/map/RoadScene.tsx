import { memo, useCallback, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/native'
import { Vector3 } from 'three'
import type { Outfit, Point, Seat } from '@jikjwau/shared/types'
import { project } from '@jikjwau/shared/geo'
import { AI_OUTFIT, ARRIVAL_RADIUS_M } from '@jikjwau/shared/config'
import { meKey } from '../store/social'
import { Ghosts } from './Ghosts'
import { useGame, useMySeat } from '../store/game'
import { useMapTiles, type MapTile } from '../store/mapTiles'
import { TileStreamer } from './TileStreamer'
import { RoadMesh } from './RoadMesh'
import { BuildingMesh } from './BuildingMesh'
import { WaterArea, WaterwayLines } from './WaterMesh'
import { HideWhenFar } from './Lod'
import { IntersectionDots } from './IntersectionDots'
import { StreetLights } from './StreetLights'
import { DayNight } from './DayNight'
import { FarGround, TerrainMesh } from './TerrainMesh'
import { SeoulTower } from './SeoulTower'
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
  /** false면 그리기를 멈춘다 (지도를 안 보는 화면) */
  active: boolean
}

/** 교차로 점은 이보다 가까이 볼 때만 */
const DOTS_MAX_CAMERA_DISTANCE_M = 600
/** 가로등은 이보다 가까이 볼 때만 */
const LAMPS_MAX_CAMERA_DISTANCE_M = 1000
/** 이보다 멀면 건물을 모두 숨기고 땅·도로·물만 (지도처럼) */
const BUILDINGS_MAX_CAMERA_DISTANCE_M = 2800

/**
 * 타일 하나의 도로·하천·건물. 타일 객체가 그대로면 다시 만들지 않는다.
 * 건물은 detailed(화면 중심 가까운 타일)일 때만 만든다.
 */
const TileMeshes = memo(function TileMeshes({ tile, detailed, rig }: { tile: MapTile; detailed: boolean; rig: CameraRig }) {
  if (tile.lite) {
    return (
      <>
        <TerrainMesh tileKey={tile.key} coarse />
        {tile.waterways.length > 0 && <WaterwayLines waterways={tile.waterways} />}
      </>
    )
  }
  return (
    <>
      <TerrainMesh tileKey={tile.key} />
      {tile.roads && (
        <>
          <RoadMesh positions={tile.roads.positions} segments={tile.roads.segments} rig={rig} tileKey={tile.key} />
          <HideWhenFar rig={rig} maxDistance={DOTS_MAX_CAMERA_DISTANCE_M}>
            <IntersectionDots positions={tile.roads.positions} segments={tile.roads.segments} tileKey={tile.key} />
          </HideWhenFar>
        </>
      )}
      {tile.waterways.length > 0 && <WaterwayLines waterways={tile.waterways} />}
      {detailed && tile.buildings.length > 0 && (
        <HideWhenFar rig={rig} maxDistance={BUILDINGS_MAX_CAMERA_DISTANCE_M}>
          <BuildingMesh buildings={tile.buildings} tileKey={tile.key} />
        </HideWhenFar>
      )}
      {detailed && tile.roads && (
        <HideWhenFar rig={rig} maxDistance={LAMPS_MAX_CAMERA_DISTANCE_M}>
          <StreetLights positions={tile.roads.positions} segments={tile.roads.segments} tileKey={tile.key} />
        </HideWhenFar>
      )}
    </>
  )
})

export function RoadScene({ rig, picker, active }: Props) {
  const tiles = useMapTiles((s) => s.tiles)
  const detail = useMapTiles((s) => s.detail)
  const status = useGame((s) => s.status)
  const startChosen = useGame((s) => s.startChosen)
  const mySeat = useMySeat()
  const snapshot = useGame((s) => s.snapshot)
  const game = useGame((s) => s.game)
  const start = useGame((s) => s.start)
  const destination = useGame((s) => s.destination)
  const picked = useGame((s) => s.picked)
  const position = useGame((s) => s.position)
  const trail = useGame((s) => s.trail)
  const current = useGame((s) => s.current)
  const finishMove = useGame((s) => s.finishMove)
  const partyPosition = useMemo(() => new Vector3(), [])
  const players = useGame((s) => s.room?.players)
  // 사람이 있는 자리는 그 사람 옷, 빈 자리(AI)는 AI 옷
  const outfits = useMemo(() => {
    const bySeat = new Map(players?.map((p) => [p.seat, p.outfit]))
    return { A: bySeat.get('A') ?? AI_OUTFIT, B: bySeat.get('B') ?? AI_OUTFIT, C: bySeat.get('C') ?? AI_OUTFIT } as Record<Seat, Outfit>
  }, [players])
  const myKey = useCallback((seat: Seat) => meKey(seat), [])

  // 설정 화면에서는 출발지를 중심으로 본다
  useEffect(() => {
    if (status === 'setup' || status === 'lobby') partyPosition.set(0, 0, 0)
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
    // 아이폰은 화면 밀도(3배)로 그려서 계단 현상이 거의 안 보인다. 멀티샘플링(4배)은 끈다 (축소했을 때 무거움)
    <Canvas style={{ flex: 1 }} frameloop={active ? 'always' : 'never'} gl={{ antialias: false }} camera={{ position: [0, 200, 150], fov: CAMERA_FOV_DEG, near: 2, far: 24000 }}>
      <DayNight />
      <FarGround />
      <HideWhenFar rig={rig} maxDistance={BUILDINGS_MAX_CAMERA_DISTANCE_M}>
        <SeoulTower />
      </HideWhenFar>

      {water.map(([id, rings]) => (
        <WaterArea key={id} id={id} rings={rings} />
      ))}
      {[...tiles.values()].map((tile) => (
        <TileMeshes key={tile.key} tile={tile} detailed={detail.has(tile.key)} rig={rig} />
      ))}

      {pickedPoint && <PickMarker point={pickedPoint} rig={rig} picker={picker} />}
      {((status === 'setup' && startChosen) || status === 'lobby') && <FlagMarker point={[0, 0]} color="#16a34a" rig={rig} />}
      {target && <DestinationMarker point={target} radiusM={game?.destination.radiusM ?? ARRIVAL_RADIUS_M} rig={rig} />}
      {(status === 'playing' || status === 'ended') && game && (
        <>
          <Trail points={trail} />
          <Party
            position={position}
            route={route}
            onArrive={finishMove}
            positionOut={partyPosition}
            mySeat={mySeat}
            rig={rig}
            outfits={outfits}
            emoteKey={myKey}
          />
          <Ghosts origin={start.latLng} rig={rig} />
          {snapshot?.rps && snapshot.phase !== 'ARRIVED' && snapshot.phase !== 'ENDED' && !current && <ChoiceArrows here={position} options={snapshot.rps.options} />}
        </>
      )}

      <TileStreamer rig={rig} />
      <FollowCamera target={partyPosition} rig={rig} />
      <PickerBridge picker={picker} />
    </Canvas>
  )
}

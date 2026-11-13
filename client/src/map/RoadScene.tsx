import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber/native'
import { Vector3 } from 'three'
import type { Outfit, Point, Seat } from '@jikjwau/shared/types'
import { parseTileKey, project } from '@jikjwau/shared/geo'
import { AI_OUTFIT, ARRIVAL_RADIUS_M } from '@jikjwau/shared/config'
import { meKey } from '../store/social'
import { Ghosts } from './Ghosts'
import { useGame, useMySeat } from '../store/game'
import { useMapTiles, type MapTile } from '../store/mapTiles'
import { TileStreamer } from './TileStreamer'
import { RoadMesh } from './RoadMesh'
import { BuildingMesh } from './BuildingMesh'
import { SandAreas, WaterAreas, WaterwayLines } from './WaterMesh'
import { HideWhenFar } from './Lod'
import { IntersectionDots } from './IntersectionDots'
import { StreetLights } from './StreetLights'
import { DayNight } from './DayNight'
import { FarGround, FarSea, TerrainBlock, TerrainMesh } from './TerrainMesh'
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

/** 먼 땅은 이만큼(타일 수) 가로·세로로 묶어 한 메시로 그린다 */
const LITE_BLOCK = 4

/** 교차로 점은 이보다 가까이 볼 때만 */
const DOTS_MAX_CAMERA_DISTANCE_M = 600
/** 가로등은 이보다 가까이 볼 때만 */
const LAMPS_MAX_CAMERA_DISTANCE_M = 1000
/** 이보다 멀면 건물을 모두 숨기고 땅·도로·물만 (지도처럼) */
const BUILDINGS_MAX_CAMERA_DISTANCE_M = 2800

/** 새 타일은 한 프레임에 다 만들지 않고 땅 → 도로 → 하천·교차로 → 건물 → 가로등 순으로 한 프레임씩 */
const TILE_STAGES = 4

/** 타일 하나를 몇 단계까지 만들었는지. 한 프레임에 한 단계씩 올린다 (지도를 옮길 때 끊김을 나눈다) */
function useStage(max: number) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (stage >= max) return
    const id = requestAnimationFrame(() => setStage((s) => s + 1))
    return () => cancelAnimationFrame(id)
  }, [stage, max])
  return stage
}

/**
 * 타일 하나의 도로·하천·건물. 타일 객체가 그대로면 다시 만들지 않는다.
 * 건물은 detailed(화면 중심 가까운 타일)일 때만 만든다.
 */
const TileMeshes = memo(function TileMeshes({ tile, detailed, rig }: { tile: MapTile; detailed: boolean; rig: CameraRig }) {
  const stage = useStage(tile.lite ? 0 : TILE_STAGES)
  // 먼 타일의 땅은 TerrainBlock이 묶어서 그린다. 가는 하천은 멀리서 안 보이니 뺀다
  if (tile.lite) return null
  return (
    <>
      <TerrainMesh tileKey={tile.key} />
      {stage >= 1 && tile.roads && (
        <>
          <RoadMesh positions={tile.roads.positions} segments={tile.roads.segments} rig={rig} tileKey={tile.key} />
          {stage >= 2 && (
            <HideWhenFar rig={rig} maxDistance={DOTS_MAX_CAMERA_DISTANCE_M}>
              <IntersectionDots positions={tile.roads.positions} segments={tile.roads.segments} tileKey={tile.key} />
            </HideWhenFar>
          )}
        </>
      )}
      {stage >= 2 && tile.waterways.length > 0 && <WaterwayLines waterways={tile.waterways} />}
      {stage >= 3 && detailed && tile.buildings.length > 0 && (
        <HideWhenFar rig={rig} maxDistance={BUILDINGS_MAX_CAMERA_DISTANCE_M}>
          <BuildingMesh buildings={tile.buildings} tileKey={tile.key} />
        </HideWhenFar>
      )}
      {stage >= 4 && detailed && tile.roads && (
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
  const origin = useMapTiles((s) => s.origin)
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

  // 먼 타일 땅은 4×4 타일씩 묶는다 (그리는 횟수 줄이기)
  const liteBlocks = useMemo(() => {
    const blocks = new Map<string, string[]>()
    for (const tile of tiles.values()) {
      if (!tile.lite) continue
      const [row, col] = parseTileKey(tile.key)
      const block = `${Math.floor(row / LITE_BLOCK)}_${Math.floor(col / LITE_BLOCK)}`
      const keys = blocks.get(block) ?? []
      keys.push(tile.key)
      blocks.set(block, keys)
    }
    return [...blocks].map(([block, keys]) => [block, keys.sort().join(',')] as const)
  }, [tiles])

  // 호수·강은 여러 타일에 같은 것이 들어 있으니 id로 한 번만 그린다
  const water = useMemo(() => {
    const unique = new Map<number, number[][]>()
    for (const tile of tiles.values()) {
      for (const [id, rings] of tile.water) if (!unique.has(id)) unique.set(id, rings)
    }
    return [...unique]
  }, [tiles])
  const beaches = useMemo(() => {
    const unique = new Map<number, number[][]>()
    for (const tile of tiles.values()) {
      for (const [id, rings] of tile.beaches) if (!unique.has(id)) unique.set(id, rings)
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
      <FarSea rig={rig} />
      <HideWhenFar rig={rig} maxDistance={BUILDINGS_MAX_CAMERA_DISTANCE_M}>
        <SeoulTower />
      </HideWhenFar>

      <WaterAreas water={water} origin={origin} />
      <SandAreas beaches={beaches} origin={origin} />
      {liteBlocks.map(([block, keys]) => (
        <TerrainBlock key={block} keys={keys} />
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

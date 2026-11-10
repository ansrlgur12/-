import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber/native'
import { Vector3 } from 'three'
import { useRoadExplorer } from '../store/roadExplorer'
import { RoadMesh } from './RoadMesh'
import { IntersectionDots } from './IntersectionDots'
import { Party } from './Party'
import { ChoiceArrows } from './ChoiceArrows'
import { FollowCamera } from './FollowCamera'

interface Props {
  cameraDistance: number
}

export function RoadScene({ cameraDistance }: Props) {
  const area = useRoadExplorer((s) => s.area)
  const nodeId = useRoadExplorer((s) => s.nodeId)
  const choices = useRoadExplorer((s) => s.choices)
  const movePath = useRoadExplorer((s) => s.movePath)
  const finishMove = useRoadExplorer((s) => s.finishMove)
  const partyPosition = useMemo(() => new Vector3(), [])

  return (
    <Canvas style={{ flex: 1 }} camera={{ position: [0, 200, 150], fov: 45, near: 1, far: 6000 }}>
      <color attach="background" args={['#cfe8f3']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[100, 300, 150]} intensity={1.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6000, 6000]} />
        <meshLambertMaterial color="#b9d8a8" />
      </mesh>

      {area && nodeId !== undefined && (
        <>
          <RoadMesh positions={area.positions} segments={area.segments} />
          <IntersectionDots positions={area.positions} segments={area.segments} />
          <Party
            positions={area.positions}
            nodeId={nodeId}
            movePath={movePath}
            onArrive={finishMove}
            positionOut={partyPosition}
          />
          {!movePath && <ChoiceArrows positions={area.positions} nodeId={nodeId} choices={choices} />}
        </>
      )}

      <FollowCamera target={partyPosition} distance={cameraDistance} />
    </Canvas>
  )
}

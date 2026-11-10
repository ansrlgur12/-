import type { NodeId, RoadAreaResponse, RoadStepResponse } from '@jikjwau/shared/types'
import { postJson } from './http'

export function createRoadArea(lat: number, lng: number, radiusM?: number) {
  return postJson<RoadAreaResponse>('/road/area', { lat, lng, radiusM })
}

export function stepRoad(areaId: string, from: NodeId, via: NodeId) {
  return postJson<RoadStepResponse>('/road/step', { areaId, from, via })
}

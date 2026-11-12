import type { LatLng } from '@jikjwau/shared/types'

/** 고층 건물 겉모습 */
export interface TowerStyle {
  /** 유리 색 */
  glass: string
  /** 층 사이 띠 색 */
  band: string
  /** 꼭대기 색 */
  roof: string
  /** 꼭대기 폭 비율 (1이면 곧게, 작을수록 위로 갈수록 가늘어진다) */
  topScale?: number
  /** 꼭대기 첨탑 높이(m) */
  spire?: number
}

/**
 * 이름난 건물. 이 점을 품은 건물 외곽선에 모양을 입힌다.
 * height가 있으면 지도 데이터의 높이 대신 쓴다 (부분별로만 높이가 적힌 건물).
 */
export const LANDMARKS: Array<{ name: string; latLng: LatLng; height?: number; style: TowerStyle }> = [
  {
    name: '63빌딩',
    latLng: { lat: 37.5198, lng: 126.9403 },
    style: { glass: '#d9a53f', band: '#9a6d22', roof: '#f0d27e' },
  },
  {
    name: '롯데월드타워',
    latLng: { lat: 37.5126, lng: 127.1025 },
    height: 555,
    style: { glass: '#d3dee8', band: '#9fb2c4', roof: '#eef3f7', topScale: 0.3, spire: 40 },
  },
]

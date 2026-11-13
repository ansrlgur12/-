
/**
 * 게임 화면 공통 모양: 남색 테두리, 아래 턱이 있는 통통한 버튼, 만화 같은 글꼴.
 * 글꼴 (assets/fonts, 출처·라이선스는 NOTICE.md):
 *   title  — 여기어때 잘난체 고딕: 창 제목, 모드 이름, 큰 연출 글자
 *   button — 메이플스토리 Bold: 주요 버튼, 시간·횟수 고르기, 보상 버튼
 *   body   — Pretendard SemiBold: 설명, 안내 문구, 그 밖의 글자
 * 사용자 지정 글꼴에는 fontWeight를 주지 않는다 (iOS에서 굵은 판을 찾다 기본 글꼴로 바뀐다)
 */
export const FONT_FILES = {
  JalnanGothic: require('../../assets/fonts/JalnanGothic.ttf'),
  MaplestoryBold: require('../../assets/fonts/Maplestory-Bold.ttf'),
  PretendardSemiBold: require('../../assets/fonts/Pretendard-SemiBold.ttf'),
}
export const FONT = { title: 'JalnanGothic', button: 'MaplestoryBold', body: 'PretendardSemiBold' }

/** 테두리·진한 글자 색 */
export const INK = '#1b2559'
/** 선 굵기 (모든 화면 같은 값): 상자 테두리, 버튼·카드 아래 턱, 글자 테두리 */
export const BORDER = 2
export const LIP = 4
export const TEXT_STROKE = 2

/** 버튼 색 [윗면, 아래 턱] */
export const PALETTE = {
  yellow: ['#ffda6b', '#e3a83c'],
  purple: ['#a48cf0', '#7a62cf'],
  navy: ['#45528f', '#2a3463'],
  blue: ['#6b9cf0', '#4a78c9'],
  pink: ['#f58fa8', '#d06783'],
  red: ['#ec7b75', '#c85651'],
  green: ['#5cc386', '#3b9a60'],
  white: ['#ffffff', '#c6cfe0'],
} as const satisfies Record<string, readonly [string, string]>

export type PaletteName = keyof typeof PALETTE

/** 흰 카드 (창·시트) */
export const CARD = {
  backgroundColor: '#ffffff',
  borderRadius: 24,
  borderWidth: BORDER,
  borderColor: INK,
} as const

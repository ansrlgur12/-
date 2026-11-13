import { Image, type ImageStyle, type StyleProp } from 'react-native'

/**
 * 앱에서 쓰는 그림 아이콘. 기기마다 다르게 보이는 글자 이모지 대신
 * Microsoft Fluent Emoji 3D (MIT, github.com/microsoft/fluentui-emoji)를 192px로 줄여 assets/emoji에 넣었다
 */
const ICONS = {
  rock: require('../../assets/emoji/rock.png'),
  paper: require('../../assets/emoji/paper.png'),
  scissors: require('../../assets/emoji/scissors.png'),
  party: require('../../assets/emoji/party.png'),
  crying: require('../../assets/emoji/crying.png'),
  handshake: require('../../assets/emoji/handshake.png'),
  fist: require('../../assets/emoji/fist.png'),
  crown: require('../../assets/emoji/crown.png'),
  walking: require('../../assets/emoji/walking.png'),
  flag: require('../../assets/emoji/flag.png'),
  stopwatch: require('../../assets/emoji/stopwatch.png'),
  hourglass: require('../../assets/emoji/hourglass.png'),
  alarm: require('../../assets/emoji/alarm.png'),
  trophy: require('../../assets/emoji/trophy.png'),
  coin: require('../../assets/emoji/coin.png'),
  grinning: require('../../assets/emoji/grinning.png'),
  sun_cloud: require('../../assets/emoji/sun_cloud.png'),
  fire: require('../../assets/emoji/fire.png'),
  person: require('../../assets/emoji/person.png'),
  muted: require('../../assets/emoji/muted.png'),
  speaker: require('../../assets/emoji/speaker.png'),
  gift: require('../../assets/emoji/gift.png'),
  tshirt: require('../../assets/emoji/tshirt.png'),
  clipboard: require('../../assets/emoji/clipboard.png'),
  medal1: require('../../assets/emoji/medal1.png'),
  medal2: require('../../assets/emoji/medal2.png'),
  medal3: require('../../assets/emoji/medal3.png'),
  wave: require('../../assets/emoji/wave.png'),
  clap: require('../../assets/emoji/clap.png'),
  laugh: require('../../assets/emoji/laugh.png'),
  angry: require('../../assets/emoji/angry.png'),
  thinking: require('../../assets/emoji/thinking.png'),
  heart: require('../../assets/emoji/heart.png'),
  eyes: require('../../assets/emoji/eyes.png'),
  uturn: require('../../assets/emoji/uturn.png'),
  vibrate: require('../../assets/emoji/vibrate.png'),
  gear: require('../../assets/emoji/gear.png'),
  pin: require('../../assets/emoji/pin.png'),
  search: require('../../assets/emoji/search.png'),
  finish: require('../../assets/emoji/finish.png'),
  map: require('../../assets/emoji/map.png'),
  people: require('../../assets/emoji/people.png'),
  bulb: require('../../assets/emoji/bulb.png'),
  calendar: require('../../assets/emoji/calendar.png'),
  target: require('../../assets/emoji/target.png'),
  mountain: require('../../assets/emoji/mountain.png'),
  gamepad: require('../../assets/emoji/gamepad.png'),
}

export type IconName = keyof typeof ICONS

/** 설정(shared)에 글자로 적힌 이모지 → 아이콘 (이모티콘 목록) */
const BY_CHAR: Record<string, IconName> = {
  '👋': 'wave',
  '🎉': 'party',
  '👏': 'clap',
  '😆': 'laugh',
  '😭': 'crying',
  '😡': 'angry',
  '🤔': 'thinking',
  '❤️': 'heart',
}

/** Text 안에 넣으면 글자와 같은 줄에 놓인다 */
export function Icon({ name, size, style }: { name: IconName; size: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={ICONS[name]} style={[{ width: size, height: size }, style]} />
}

/** 글자 이모지를 아이콘으로. 모르는 글자면 null */
export function EmojiIcon({ char, size }: { char: string; size: number }) {
  const name = BY_CHAR[char]
  return name ? <Icon name={name} size={size} /> : null
}

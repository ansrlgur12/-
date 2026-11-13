import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { EMOTE_SHOW_MS } from '@jikjwau/shared/config'
import { toScreen, type ScenePicker } from '../map/scenePicker'
import { emoteAnchors, useSocial, type Bubble } from '../store/social'
import { EmojiIcon } from './Icon'
import { FONT } from './theme'

const SIZE = 52

/** 이모티콘을 보낸 캐릭터 머리 위에 잠깐 뜨는 말풍선 */
export function EmoteBubbles({ picker }: { picker: ScenePicker }) {
  const bubbles = useSocial((s) => s.bubbles)
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bubbles.map((b) => (
        <EmoteBubble key={b.id} bubble={b} picker={picker} />
      ))}
    </View>
  )
}

function EmoteBubble({ bubble, picker }: { bubble: Bubble; picker: ScenePicker }) {
  const pos = useRef(new Animated.ValueXY({ x: -1000, y: -1000 })).current
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.3)).current
  const ghost = bubble.key.startsWith('g:')

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const anchor = emoteAnchors.get(bubble.key)
      const p = anchor && toScreen(picker, anchor.x, anchor.y, anchor.z)
      const age = Date.now() - bubble.at
      if (p) {
        pos.setValue({ x: p.x - SIZE / 2, y: p.y - SIZE - age * 0.008 })
        // 톡 튀어나왔다가 끝에 흐려진다
        const fade = Math.min(1, age / 120, (EMOTE_SHOW_MS - age) / 300)
        opacity.setValue(Math.max(0, fade) * (ghost ? 0.7 : 1))
        scale.setValue(age < 180 ? 0.3 + (age / 180) * 0.9 : Math.max(1, 1.2 - (age - 180) / 400))
      } else {
        opacity.setValue(0)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [bubble, picker, pos, opacity, scale, ghost])

  return (
    <Animated.View style={[styles.bubble, ghost && styles.ghost, { opacity, transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }] }]}>
      <EmojiIcon char={bubble.emoji} size={38} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  ghost: { backgroundColor: 'rgba(255,255,255,0.75)' },
  emoji: { fontFamily: FONT.body, fontSize: 30 },
})

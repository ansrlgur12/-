import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { EMOTE_COOLDOWN_MS, EMOTES } from '@jikjwau/shared/config'
import type { EmoteId } from '@jikjwau/shared/types'
import { socket } from '../api/socket'
import { playEffect } from '../lib/sound'
import { EmojiIcon, Icon } from './Icon'

/** 지도 오른쪽 웃는 얼굴 버튼. 누르면 이모티콘을 고르고, 내 캐릭터가 그 동작을 한다 */
export function EmoteBar({ top }: { top: number }) {
  const [open, setOpen] = useState(false)
  const last = useRef(0)

  const send = (emote: EmoteId) => {
    setOpen(false)
    const now = Date.now()
    if (now - last.current < EMOTE_COOLDOWN_MS) return
    last.current = now
    playEffect('tap')
    socket.emit('emote:send', { emote })
  }

  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      {open && (
        <View style={styles.palette}>
          {EMOTES.map((e) => (
            <Pressable key={e.id} style={styles.item} onPress={() => send(e.id)} hitSlop={4}>
              <EmojiIcon char={e.emoji} size={30} />
            </Pressable>
          ))}
        </View>
      )}
      <Pressable style={[styles.button, open && styles.buttonOn]} onPress={() => setOpen((o) => !o)}>
        {open ? <Text style={styles.emoji}>✕</Text> : <Icon name="grinning" size={30} />}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 4 * 46 + 12,
    padding: 6,
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  item: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  button: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  buttonOn: { backgroundColor: '#fde68a' },
  emoji: { fontSize: 24 },
})

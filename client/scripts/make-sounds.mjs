// 임시 음원 만들기: node scripts/make-sounds.mjs
// 진짜 음원으로 바꿀 때는 assets/sounds/ 안의 같은 이름 파일을 덮어쓰면 된다 (wav 그대로, 또는 이름·확장자를 바꾸면 src/lib/sound.ts도 같이)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 22050
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../assets/sounds')

const midi = (n) => 440 * 2 ** ((n - 69) / 12)

/** 소리 하나를 buffer에 더한다. wave: 0 사인, 1 삼각, 2 부드러운 사각 */
function note(buf, startSec, durSec, freq, { vol = 0.2, wave = 0, attack = 0.01, release = 0.12 } = {}) {
  const start = Math.floor(startSec * RATE)
  const len = Math.floor((durSec + release) * RATE)
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / RATE
    const phase = (t * freq) % 1
    let v
    if (wave === 0) v = Math.sin(2 * Math.PI * phase)
    else if (wave === 1) v = 1 - 4 * Math.abs(phase - 0.5)
    else v = Math.tanh(3 * Math.sin(2 * Math.PI * phase)) * 0.7
    const env = t < attack ? t / attack : t < durSec ? 1 : Math.max(0, 1 - (t - durSec) / release)
    buf[start + i] += v * env * vol
  }
}

function kick(buf, startSec, vol = 0.35) {
  const start = Math.floor(startSec * RATE)
  const len = Math.floor(0.18 * RATE)
  let phase = 0
  for (let i = 0; i < len && start + i < buf.length; i++) {
    const t = i / RATE
    phase += (50 + 120 * Math.exp(-t * 30)) / RATE
    buf[start + i] += Math.sin(2 * Math.PI * phase) * Math.exp(-t * 18) * vol
  }
}

function hat(buf, startSec, vol = 0.05) {
  const start = Math.floor(startSec * RATE)
  const len = Math.floor(0.04 * RATE)
  for (let i = 0; i < len && start + i < buf.length; i++) buf[start + i] += (Math.random() * 2 - 1) * Math.exp(-(i / RATE) * 90) * vol
}

function wav(name, buf) {
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0.0001)
  const gain = Math.min(1, 0.9 / peak)
  const data = Buffer.alloc(buf.length * 2)
  buf.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain)) * 32767), i * 2))
  const head = Buffer.alloc(44)
  head.write('RIFF', 0)
  head.writeUInt32LE(36 + data.length, 4)
  head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16)
  head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22)
  head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28)
  head.writeUInt16LE(2, 32)
  head.writeUInt16LE(16, 34)
  head.write('data', 36)
  head.writeUInt32LE(data.length, 40)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, name), Buffer.concat([head, data]))
  console.log(name, (data.length / 1024).toFixed(0) + 'KB')
}

const make = (sec) => new Float64Array(Math.ceil(sec * RATE))

// BGM: 산책하는 느낌의 가벼운 루프. 4마디 × 2 (C - Am - F - G), 104 BPM
{
  const beat = 60 / 104
  const bars = 8
  const buf = make(bars * 4 * beat)
  const chords = [
    [48, 52, 55, 60],
    [45, 48, 52, 57],
    [41, 45, 48, 53],
    [43, 47, 50, 55],
  ]
  const melody = [
    [72, 74, 76, 79, 76, 74, 72, null],
    [69, 72, 76, null, 74, 72, 69, null],
    [65, 69, 72, 77, 76, 72, 69, null],
    [67, 71, 74, null, 79, 77, 74, 71],
    [76, null, 79, 76, 74, 72, 74, 76],
    [72, null, 69, 72, 76, 74, 72, null],
    [77, 76, 74, 72, 69, 72, 74, null],
    [74, 71, 67, 71, 74, null, 72, null],
  ]
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat
    const chord = chords[bar % 4]
    note(buf, t0, beat * 1.8, midi(chord[0] - 12), { vol: 0.22, wave: 1, release: 0.2 })
    note(buf, t0 + beat * 2, beat * 1.8, midi(chord[0] - 12), { vol: 0.2, wave: 1, release: 0.2 })
    for (let k = 0; k < 8; k++) note(buf, t0 + k * beat * 0.5, beat * 0.35, midi(chord[1 + (k % 3)]), { vol: 0.06, wave: 0, release: 0.08 })
    melody[bar].forEach((n, k) => n && note(buf, t0 + k * beat * 0.5, beat * 0.42, midi(n), { vol: 0.11, wave: 2, release: 0.1 }))
    for (let k = 0; k < 4; k++) {
      if (k % 2 === 0) kick(buf, t0 + k * beat, 0.28)
      hat(buf, t0 + k * beat + beat * 0.5)
    }
  }
  wav('bgm.wav', buf)
}

// 버튼 누르는 소리
{
  const buf = make(0.12)
  note(buf, 0, 0.03, 1200, { vol: 0.3, wave: 0, attack: 0.002, release: 0.05 })
  wav('tap.wav', buf)
}

// 가위바위보 결과
{
  const buf = make(0.45)
  note(buf, 0, 0.08, midi(76), { vol: 0.25, wave: 1, attack: 0.003 })
  note(buf, 0.09, 0.15, midi(83), { vol: 0.25, wave: 1, attack: 0.003, release: 0.2 })
  wav('result.wav', buf)
}

// 내가 이긴 판
{
  const buf = make(0.6)
  ;[72, 76, 79, 84].forEach((n, i) => note(buf, i * 0.07, 0.1, midi(n), { vol: 0.22, wave: 2, attack: 0.003, release: 0.15 }))
  wav('win.wav', buf)
}

// 도착 팡파르
{
  const buf = make(2.2)
  ;[
    [0, 67],
    [0.15, 72],
    [0.3, 76],
    [0.45, 79],
  ].forEach(([t, n]) => note(buf, t, 0.13, midi(n), { vol: 0.2, wave: 2 }))
  ;[72, 76, 79, 84].forEach((n) => note(buf, 0.65, 1.0, midi(n), { vol: 0.12, wave: 1, release: 0.5 }))
  kick(buf, 0.65, 0.3)
  wav('arrive.wav', buf)
}

// 제한에 걸려 끝남
{
  const buf = make(1.4)
  ;[72, 69, 65, 60].forEach((n, i) => note(buf, i * 0.18, 0.16, midi(n), { vol: 0.2, wave: 1, release: 0.25 }))
  wav('end.wav', buf)
}

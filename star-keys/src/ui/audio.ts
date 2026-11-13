// Tiny WebAudio synth; no sample files.
import type { MoveKind, RunEvent } from '../types';
import { getMuted, setMuted } from './save';

export type Sfx =
  | 'key'
  | 'wrong'
  | 'word'
  | 'run'
  | 'jump'
  | 'jet'
  | 'climb'
  | 'float'
  | 'hurt'
  | 'alarm'
  | 'win'
  | 'lose'
  | 'launch'
  | 'click'
  | 'select'
  | 'start'
  | 'heal';

const VOLUME = 0.3;
const MIN_GAP = 0.03; // s between repeats of one sound

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = getMuted();
const lastAt = new Map<Sfx, number>();
const listeners = new Set<() => void>();

// Call from a user gesture; browsers block audio until then.
export function unlockAudio(): void {
  if (!ac) {
    try {
      ac = new AudioContext();
      out = ac.createGain();
      out.gain.value = muted ? 0 : VOLUME;
      out.connect(ac.destination);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      ac = null;
      return;
    }
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  setMuted(muted);
  if (ac && out) out.gain.setValueAtTime(muted ? 0 : VOLUME, ac.currentTime);
  for (const fn of listeners) fn();
  return muted;
}

// Notified when mute changes (buttons on several screens).
export function onMuteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, vol: number): void {
  if (!ac || !out) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function noise(at: number, dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', freqEnd?: number): void {
  if (!ac || !out || !noiseBuf) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, at);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, at + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.05, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

function melody(notes: number[], at: number, step: number, type: OscillatorType, vol: number): void {
  notes.forEach((n, i) => tone(type, n, n, at + i * step, i === notes.length - 1 ? step * 3 : step * 1.1, vol));
}

export function play(s: Sfx): void {
  if (!ac || !out || muted || ac.state !== 'running') return;
  const t = ac.currentTime;
  const prev = lastAt.get(s);
  if (prev !== undefined && t - prev < MIN_GAP) return;
  lastAt.set(s, t);
  switch (s) {
    case 'key': {
      const p = 1 + (Math.random() - 0.5) * 0.12;
      noise(t, 0.03, 0.12, 3200 * p, 'bandpass');
      tone('triangle', 1250 * p, 900 * p, t, 0.035, 0.05);
      break;
    }
    case 'wrong':
      tone('sawtooth', 110, 90, t, 0.16, 0.12);
      tone('square', 116, 92, t, 0.16, 0.06);
      break;
    case 'word':
      tone('sine', 880, 880, t, 0.06, 0.08);
      tone('sine', 1320, 1320, t + 0.05, 0.1, 0.07);
      break;
    case 'run':
      tone('triangle', 300, 220, t, 0.05, 0.1);
      tone('triangle', 320, 230, t + 0.12, 0.05, 0.08);
      break;
    case 'jump':
      tone('square', 260, 620, t, 0.14, 0.06);
      tone('sine', 300, 700, t, 0.14, 0.12);
      break;
    case 'jet':
      noise(t, 0.38, 0.22, 500, 'bandpass', 2400);
      tone('sawtooth', 70, 140, t, 0.3, 0.04);
      break;
    case 'climb':
      for (let i = 0; i < 3; i++) tone('square', 700 + i * 90, 700 + i * 90, t + i * 0.08, 0.03, 0.05);
      break;
    case 'float':
      tone('sine', 520, 780, t, 0.4, 0.1);
      tone('sine', 523 * 1.5, 780 * 1.5, t + 0.05, 0.35, 0.04);
      break;
    case 'hurt':
      tone('square', 420, 120, t, 0.2, 0.12);
      noise(t, 0.12, 0.15, 900);
      break;
    case 'alarm':
      for (let i = 0; i < 4; i++) tone('square', i % 2 ? 620 : 880, i % 2 ? 620 : 880, t + i * 0.1, 0.09, 0.06);
      break;
    case 'win':
      melody([523, 659, 784, 1047, 784, 1047, 1319], t, 0.1, 'square', 0.1);
      melody([262, 330, 392, 523], t, 0.2, 'triangle', 0.12);
      break;
    case 'lose':
      melody([392, 370, 330, 262, 196], t, 0.18, 'triangle', 0.2);
      break;
    case 'launch':
      noise(t, 1.6, 0.3, 200, 'lowpass', 3000);
      tone('sawtooth', 60, 300, t, 1.4, 0.05);
      break;
    case 'click':
      tone('triangle', 660, 520, t, 0.05, 0.12);
      break;
    case 'select':
      tone('square', 988, 988, t, 0.03, 0.05);
      break;
    case 'heal':
      melody([784, 988, 1319], t + 0.06, 0.06, 'sine', 0.09);
      break;
    case 'start':
      tone('sine', 440, 880, t, 0.12, 0.12);
      tone('triangle', 660, 1320, t + 0.06, 0.12, 0.08);
      break;
  }
}

const MOVE_SFX: Record<MoveKind, Sfx> = { run: 'run', jump: 'jump', jet: 'jet', climb: 'climb', float: 'float' };

export function playEvent(e: RunEvent): void {
  switch (e.type) {
    case 'start':
      return play('start');
    case 'correct':
      return play('key');
    case 'wrong':
      return play('wrong');
    case 'word':
      return play('word');
    case 'move':
      return play(MOVE_SFX[e.move] ?? 'run');
    case 'hurt':
      return e.cause === 'threat' ? play('hurt') : undefined;
    case 'danger':
      return e.on ? play('alarm') : undefined;
    case 'heal':
      return play('heal');
    case 'won':
      return play('win');
    case 'lost':
      return play('lose');
  }
}

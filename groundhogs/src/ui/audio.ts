// Tiny WebAudio synth; no sample files.
import type { GameEvent } from '../types';
import { getMuted, setMuted } from './save';

export type Sfx =
  | 'spawn'
  | 'boing'
  | 'snore'
  | 'assign'
  | 'fail'
  | 'splat'
  | 'drown'
  | 'saved'
  | 'plank'
  | 'hatch'
  | 'win'
  | 'lose'
  | 'click'
  | 'select'
  | 'alarm';

const VOLUME = 0.3;
const MIN_GAP = 0.045; // s between repeats of one sound

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = getMuted();
const lastAt = new Map<Sfx, number>();

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
  return muted;
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

function noise(at: number, dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass'): void {
  if (!ac || !out || !noiseBuf) return;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(out);
  src.start(at);
  src.stop(at + dur + 0.02);
}

function creak(at: number): void {
  if (!ac || !out) return;
  const o = ac.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(80, at);
  o.frequency.linearRampToValueAtTime(150, at + 0.3);
  o.frequency.linearRampToValueAtTime(70, at + 0.6);
  const lfo = ac.createOscillator();
  lfo.frequency.value = 23;
  const lg = ac.createGain();
  lg.gain.value = 30;
  lfo.connect(lg).connect(o.frequency);
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 800;
  f.Q.value = 2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.35, at + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.65);
  o.connect(f).connect(g).connect(out);
  o.start(at);
  lfo.start(at);
  o.stop(at + 0.7);
  lfo.stop(at + 0.7);
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
    case 'spawn':
      tone('sine', 380, 900, t, 0.07, 0.25);
      break;
    case 'assign':
      tone('square', 1500, 900, t, 0.035, 0.1);
      tone('triangle', 660, 660, t, 0.06, 0.18);
      break;
    case 'select':
      tone('square', 1046, 1046, t, 0.03, 0.06);
      break;
    case 'click':
      tone('triangle', 620, 480, t, 0.05, 0.15);
      break;
    case 'fail':
      tone('sawtooth', 130, 95, t, 0.18, 0.14);
      tone('square', 137, 98, t, 0.18, 0.07);
      break;
    case 'splat':
      noise(t, 0.22, 0.5, 700);
      tone('sine', 170, 45, t, 0.2, 0.4);
      break;
    case 'drown':
      tone('sine', 520, 200, t, 0.1, 0.22);
      tone('sine', 430, 160, t + 0.11, 0.12, 0.18);
      tone('sine', 330, 110, t + 0.25, 0.16, 0.14);
      break;
    case 'saved':
      tone('triangle', 988, 988, t, 0.08, 0.2);
      tone('triangle', 1319, 1319, t + 0.07, 0.16, 0.2);
      break;
    case 'plank':
      tone('square', 2200, 2200, t, 0.02, 0.07);
      tone('square', 2200, 2200, t + 0.09, 0.02, 0.05);
      break;
    case 'hatch':
      creak(t);
      noise(t, 0.4, 0.06, 2500, 'bandpass');
      break;
    case 'win':
      melody([523, 659, 784, 1047, 784, 1047], t, 0.11, 'square', 0.12);
      break;
    case 'lose':
      melody([392, 370, 349, 262], t, 0.2, 'triangle', 0.22);
      break;
    case 'boing':
      tone('sine', 220, 880, t, 0.18, 0.3);
      tone('triangle', 440, 1320, t + 0.02, 0.14, 0.12);
      break;
    case 'snore':
      tone('sine', 140, 110, t, 0.35, 0.18);
      noise(t + 0.05, 0.3, 0.05, 400);
      break;
    case 'alarm':
      for (let i = 0; i < 6; i++) tone('square', i % 2 ? 660 : 990, i % 2 ? 660 : 990, t + i * 0.08, 0.07, 0.08);
      break;
  }
}

export function playEvent(e: GameEvent): void {
  switch (e.type) {
    case 'spawn':
      return play('spawn');
    case 'assign':
      return play('assign');
    case 'assign-fail':
      return play('fail');
    case 'splat':
      return play('splat');
    case 'drown':
      return play('drown');
    case 'saved':
      return play('saved');
    case 'plank-low':
      return play('plank');
    case 'hatch-open':
      return play('hatch');
    case 'bounce':
      return play('boing');
    case 'nap':
      return play('snore');
    case 'end':
      return play(e.won ? 'win' : 'lose');
  }
}

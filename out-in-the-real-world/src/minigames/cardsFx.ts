// Shared juice for the Flashcard Cram and Moving Day mini-games: chiptune blips, particles, big pixel text.
import { loadMeta } from '../ui/save.ts';
import type { Ctx } from '../art/px.ts';
import { bigWord, FONT, label, rad, rgba, tint } from './hd2Kit.tsx';

// ---------- sound ----------
// The app's sfx() covers menu sounds; action games want pitched combo notes and noise crashes,
// so this keeps its own tiny WebAudio graph. It respects the player's mute setting.
let ac: AudioContext | null = null;
let out: GainNode | null = null;
let muted = false;

export function soundInit(): void {
  muted = loadMeta().muted;
  if (muted) return;
  if (!ac) {
    try {
      ac = new AudioContext();
      out = ac.createGain();
      out.gain.value = 0.2;
      out.connect(ac.destination);
    } catch {
      ac = null;
    }
  }
  if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
}

export const note = (semi: number): number => 440 * Math.pow(2, (semi - 9) / 12);

export function beep(f0: number, dur: number, type: OscillatorType = 'square', vol = 0.12, f1 = f0, delay = 0): void {
  if (!ac || !out || muted) return;
  const at = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

// Filtered white noise: thuds (low cutoff) and crashes (high cutoff).
export function noise(dur: number, vol = 0.2, cutoff = 1800, delay = 0): void {
  if (!ac || !out || muted) return;
  const at = ac.currentTime + delay;
  const n = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(at);
}

export const sound = {
  tick: () => beep(note(14), 0.07, 'square', 0.1),
  go: () => {
    beep(note(21), 0.08, 'square', 0.12);
    beep(note(26), 0.18, 'square', 0.12, note(26), 0.08);
  },
  // Combo hits climb a major scale so a long streak sings.
  combo: (streak: number) => {
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
    const s = scale[Math.min(scale.length - 1, Math.max(0, streak - 1))];
    beep(note(19 + s), 0.06, 'square', 0.12);
    beep(note(26 + s), 0.12, 'triangle', 0.14, note(26 + s), 0.05);
  },
  wrong: () => beep(180, 0.22, 'sawtooth', 0.1, 90),
  zap: () => beep(note(31), 0.05, 'square', 0.05, note(38)),
  thud: () => noise(0.12, 0.35, 260),
  crash: () => {
    noise(0.35, 0.3, 4200);
    beep(note(40), 0.1, 'triangle', 0.08, note(33), 0.03);
    beep(note(43), 0.1, 'triangle', 0.06, note(36), 0.08);
  },
  move: () => beep(note(9), 0.03, 'square', 0.05),
  rotate: () => beep(note(16), 0.04, 'square', 0.06, note(21)),
  pick: () => beep(note(12), 0.05, 'triangle', 0.1, note(19)),
  honk: () => {
    beep(330, 0.16, 'square', 0.08);
    beep(392, 0.22, 'square', 0.08, 392, 0.18);
  },
  fanfare: () => [0, 4, 7, 12].forEach((s, i) => beep(note(19 + s), 0.14, 'square', 0.1, note(19 + s), i * 0.09)),
  sad: () => [7, 4, 0].forEach((s, i) => beep(note(12 + s), 0.18, 'triangle', 0.12, note(12 + s), i * 0.14)),
};

// ---------- particles ----------
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  g: number; // gravity
  size: number;
}

export function burst(ps: Particle[], x: number, y: number, n: number, colors: string[], speed = 40, gravity = 60, life = 0.6): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: life * (0.6 + Math.random() * 0.4), max: life, c: colors[i % colors.length], g: gravity, size: Math.random() < 0.25 ? 2 : 1 });
  }
}

export function stepParticles(ps: Particle[], dt: number): void {
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) {
      ps.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawParticles(x: Ctx, ps: Particle[]): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (const p of ps) {
    const a = Math.min(1, (p.life / p.max) * 1.6);
    const r = p.size * 2.2;
    x.fillStyle = rad(x, p.x, p.y, 0, r, [rgba(p.c, 0.45 * a), rgba(p.c, 0)]);
    x.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  x.restore();
  for (const p of ps) {
    x.globalAlpha = Math.min(1, (p.life / p.max) * 2);
    x.fillStyle = p.c;
    x.beginPath();
    x.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
    x.fill();
  }
  x.globalAlpha = 1;
}

// Floating "+150" style labels.
export interface Floater {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
}
export function stepFloaters(fs: Floater[], dt: number): void {
  for (let i = fs.length - 1; i >= 0; i--) {
    fs[i].life -= dt;
    fs[i].y -= dt * 14;
    if (fs[i].life <= 0) fs.splice(i, 1);
  }
}
export function drawFloaters(x: Ctx, fs: Floater[]): void {
  for (const f of fs) {
    x.globalAlpha = Math.min(1, f.life / 0.3);
    label(x, f.s, f.x, f.y + 2.6, 7, f.c, '#1c1424', 'center', 900);
  }
  x.globalAlpha = 1;
}

// Smooth outlined text, top-left anchored like the old 3x5 pixel font so layouts carry over.
export function outlined(x: Ctx, s: string, px: number, py: number, c: string, o = '#1c1424'): void {
  label(x, s, px, py + 2.6, 6.2, c, o, 'left', 900);
}

// Big rounded gradient lettering centered on cx; y is the top, scale matches the old pixel sizes.
export function bigText(x: Ctx, s: string, cx: number, y: number, scale: number, c: string): void {
  let size = 7.4 * scale;
  x.save();
  x.font = `900 ${size}px ${FONT}`;
  const fit = ((s.length * 4 + 3) * scale) / Math.max(1, x.measureText(s).width);
  x.restore();
  if (fit < 1) size *= fit;
  bigWord(x, s, cx, y + 3.4 * scale, size, c, tint(c, 0.62));
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Calls fn exactly once, even under StrictMode double effects or a double-tap.
export function once<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
  let done = false;
  return (...a: A) => {
    if (done) return;
    done = true;
    fn(...a);
  };
}

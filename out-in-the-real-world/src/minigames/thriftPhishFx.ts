// Shared juice for Thrift Hunt and Phishing Invaders: a tiny chiptune synth (respects mute),
// particles with shards, pop-up text, shake/flash, pixel text with a few extra glyphs (@ _ ( ) = * < >),
// big outlined lettering, the "3, 2, 1, GO" count-in and the end ribbon. Plain functions, no React.
import { cached, INK, rect, text, type Ctx } from '../art/px.ts';
import { loadMeta } from '../ui/save.ts';

// ---------- sound ----------
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
      out.gain.value = 0.18;
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

let noiseBuf: AudioBuffer | null = null;
export function noise(dur: number, vol = 0.2, cutoff = 1800, delay = 0, type: BiquadFilterType = 'lowpass'): void {
  if (!ac || !out || muted) return;
  const at = ac.currentTime + delay;
  if (!noiseBuf) {
    const n = Math.floor(ac.sampleRate * 0.6);
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(at);
  src.stop(at + dur + 0.02);
}

// Shared cues both games use.
export const cue = {
  tick: () => beep(note(14), 0.08, 'square', 0.1),
  go: () => {
    beep(note(21), 0.08, 'square', 0.12);
    beep(note(28), 0.2, 'square', 0.12, note(28), 0.08);
  },
  // Streaks climb a major scale so a run of good calls sings.
  combo: (streak: number) => {
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
    const s = scale[Math.min(scale.length - 1, Math.max(0, streak - 1))];
    beep(note(19 + s), 0.06, 'square', 0.1);
    beep(note(26 + s), 0.12, 'triangle', 0.13, note(26 + s), 0.05);
  },
  wrong: () => {
    beep(220, 0.12, 'sawtooth', 0.1, 150);
    beep(150, 0.22, 'sawtooth', 0.09, 80, 0.1);
  },
  thud: () => noise(0.14, 0.32, 300),
  crash: () => {
    noise(0.35, 0.28, 4200);
    beep(note(40), 0.1, 'triangle', 0.08, note(33), 0.03);
  },
  fanfare: () => [0, 4, 7, 12, 16].forEach((s, i) => beep(note(19 + s), 0.16, 'square', 0.09, note(19 + s), i * 0.08)),
  sad: () => [7, 4, 0, -5].forEach((s, i) => beep(note(12 + s), 0.2, 'triangle', 0.12, note(12 + s), i * 0.15)),
  announce: () => {
    beep(note(24), 0.07, 'square', 0.09);
    beep(note(31), 0.07, 'square', 0.09, note(31), 0.07);
    beep(note(36), 0.16, 'square', 0.1, note(36), 0.14);
  },
};

// ---------- random ----------
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export function shuffle<T>(a: T[], r: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

// ---------- pixel text (px.ts 3x5 font + a few glyphs it lacks) ----------
const EXTRA: Record<string, string> = {
  '@': '010101111100011',
  _: '000000000000111',
  '(': '010100100100010',
  ')': '010001001001010',
  '=': '000111000111000',
  '*': '000101010101000',
  '>': '100010001010100',
  '<': '001010100010001',
  '"': '101101000000000',
  $: '111100111001111',
};
export function ptext(x: Ctx, s: string, px: number, py: number, c: string): void {
  let cx = Math.round(px);
  const y = Math.round(py);
  for (const raw of s.toUpperCase()) {
    const ch = raw === '’' || raw === '‘' ? "'" : raw;
    const g = EXTRA[ch];
    if (g) {
      x.fillStyle = c;
      for (let i = 0; i < 15; i++) if (g[i] === '1') x.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
      if (ch === '$') {
        // the dollar sign's stroke pokes out above and below the line
        x.fillRect(cx + 1, y - 1, 1, 1);
        x.fillRect(cx + 1, y + 5, 1, 1);
      }
    } else if (ch !== ' ') text(x, ch, cx, y, c);
    cx += 4;
  }
}
export const ptw = (s: string): number => Math.max(0, s.length * 4 - 1);

// Text with a 1px outline all round (cached as a little sprite).
export function outlined(x: Ctx, s: string, px: number, py: number, c: string, o: string = INK): void {
  const w = ptw(s);
  const spr = cached(`tpo|${s}|${c}|${o}`, w + 2, 7, (g) => {
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 0], [0, 2], [2, 2]]) ptext(g, s, dx, dy, o);
    ptext(g, s, 1, 1, c);
  });
  x.drawImage(spr, Math.round(px) - 1, Math.round(py) - 1);
}
export function centered(x: Ctx, s: string, cx: number, py: number, c: string, o: string | null = INK): void {
  const px = Math.round(cx - ptw(s) / 2);
  if (o) outlined(x, s, px, py, c, o);
  else ptext(x, s, px, py, c);
}

// Big lettering: the 3x5 font scaled by whole pixels, with a chunky outline and a drop shadow.
export function bigText(x: Ctx, s: string, cx: number, cy: number, scale: number, c: string, o: string = INK, hi?: string): void {
  const w = ptw(s);
  const src = (col: string) => cached(`tpb|${s}|${col}`, w + 1, 6, (g) => ptext(g, s, 0, 0, col));
  const dw = w * scale;
  const dh = 5 * scale;
  const px = Math.round(cx - dw / 2);
  const py = Math.round(cy - dh / 2);
  const ink = src(o);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [1, 2], [0, 2], [-1, 2], [1, 3], [0, 3]]) x.drawImage(ink, 0, 0, w, 5, px + dx, py + dy, dw, dh);
  x.drawImage(src(c), 0, 0, w, 5, px, py, dw, dh);
  // a highlight band across the top of the letters
  if (hi && scale >= 3) {
    x.save();
    x.beginPath();
    x.rect(px, py, dw, Math.max(1, Math.floor(scale * 0.7)));
    x.clip();
    x.drawImage(src(hi), 0, 0, w, 5, px, py, dw, dh);
    x.restore();
  }
}

// ---------- particles, shards, pops ----------
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  g: number;
  s: number;
  drag: number;
}
// A chunk of a sprite flying apart (for message cards glitching to bits).
interface Shard {
  img: CanvasImageSource;
  sx: number;
  sy: number;
  w: number;
  h: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
}
interface Pop {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
  max: number;
  big: boolean;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  c: string;
}

export class Fx {
  parts: Part[] = [];
  shards: Shard[] = [];
  pops: Pop[] = [];
  rings: Ring[] = [];
  shake = 0;
  flash = 0;
  flashC = '#ffffff';
  hitstop = 0;
  readonly rm: boolean;
  readonly w: number;
  readonly h: number;
  constructor(reducedMotion: boolean, w: number, h: number) {
    this.rm = reducedMotion;
    this.w = w;
    this.h = h;
  }
  burst(x: number, y: number, colors: string | string[], n = 8, speed = 40, g = 90, life = 0.6, size = 1): void {
    if (this.rm) n = Math.ceil(n / 2);
    const cs = Array.isArray(colors) ? colors : [colors];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: l, max: l, c: cs[i % cs.length], g, s: size + (Math.random() < 0.25 ? 1 : 0), drag: 0 });
    }
  }
  spray(x: number, y: number, colors: string[], n: number, vx: number, vy: number, spread: number, g = 120, life = 0.5): void {
    if (this.rm) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: vx + rnd(-spread, spread), vy: vy + rnd(-spread, spread), life: l, max: l, c: colors[i % colors.length], g, s: 1, drag: 2 });
    }
  }
  // Slice an image into tiles that scatter (with a horizontal glitch jitter on the way out).
  shatter(img: CanvasImageSource, iw: number, ih: number, x: number, y: number, tile = 6, power = 60, g = 140): void {
    const step = this.rm ? tile * 2 : tile;
    for (let sy = 0; sy < ih; sy += step)
      for (let sx = 0; sx < iw; sx += step) {
        const w = Math.min(step, iw - sx);
        const h = Math.min(step, ih - sy);
        const cx = sx + w / 2 - iw / 2;
        const cy = sy + h / 2 - ih / 2;
        const d = Math.hypot(cx, cy) || 1;
        const l = rnd(0.45, 0.85);
        this.shards.push({ img, sx, sy, w, h, x: x + sx, y: y + sy, vx: (cx / d) * power * rnd(0.4, 1.2) + rnd(-15, 15), vy: (cy / d) * power * rnd(0.4, 1.2) - power * 0.5, life: l, max: l, g });
      }
  }
  ring(x: number, y: number, c: string, r = 14, life = 0.35): void {
    this.rings.push({ x, y, r, life, max: life, c });
  }
  pop(x: number, y: number, s: string, c: string, big = false): void {
    this.pops.push({ x, y, s, c, life: big ? 1.3 : 1, max: big ? 1.3 : 1, big });
  }
  kick(amount: number): void {
    this.shake = Math.max(this.shake, this.rm ? Math.min(0.8, amount * 0.2) : amount);
  }
  blink(c: string, amount = 0.35): void {
    this.flashC = c;
    this.flash = Math.max(this.flash, this.rm ? amount * 0.35 : amount);
  }
  stop(sec: number): void {
    if (!this.rm) this.hitstop = Math.max(this.hitstop, sec);
  }
  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      if (p.drag) {
        p.vx *= 1 - Math.min(1, p.drag * dt);
        p.vy *= 1 - Math.min(1, p.drag * dt * 0.5);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const s of this.shards) {
      s.life -= dt;
      s.vy += s.g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.shards = this.shards.filter((s) => s.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const p of this.pops) {
      p.life -= dt;
      p.y -= dt * 16 * Math.min(1, (p.life / p.max) * 2);
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 14);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }
  offset(): [number, number] {
    if (this.shake < 0.3) return [0, 0];
    return [Math.round((Math.random() * 2 - 1) * this.shake), Math.round((Math.random() * 2 - 1) * this.shake)];
  }
  // World-space bits (particles, shards, rings).
  drawWorld(x: Ctx): void {
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r * (0.3 + k * 0.9);
      x.globalAlpha = Math.max(0, r.life / r.max);
      x.strokeStyle = r.c;
      x.lineWidth = 1;
      x.beginPath();
      // stepped octagon reads more "pixel" than a smooth arc
      for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const px = Math.round(r.x + Math.cos(a) * rad) + 0.5;
        const py = Math.round(r.y + Math.sin(a) * rad) + 0.5;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.stroke();
      x.globalAlpha = 1;
    }
    for (const s of this.shards) {
      if (s.life < s.max * 0.3 && Math.floor(s.life * 30) % 2) continue;
      const jit = s.life > s.max * 0.6 && !this.rm ? (Math.random() < 0.3 ? Math.round(rnd(-2, 2)) : 0) : 0;
      x.drawImage(s.img, s.sx, s.sy, s.w, s.h, Math.round(s.x + jit), Math.round(s.y), s.w, s.h);
    }
    for (const p of this.parts) {
      if (p.life < p.max * 0.25 && Math.floor(p.life * 30) % 2) continue;
      rect(x, p.x, p.y, p.s, p.s, p.c);
    }
  }
  // Screen-space bits (pop-up words, flash).
  drawTop(x: Ctx): void {
    for (const p of this.pops) {
      if (p.life < 0.2 && Math.floor(p.life * 30) % 2) continue;
      if (p.big) {
        const age = p.max - p.life;
        const sc = age < 0.06 ? 3 : 2;
        bigText(x, p.s, clamp(p.x, (ptw(p.s) * sc) / 2 + 3, this.w - (ptw(p.s) * sc) / 2 - 3), Math.round(p.y), sc, p.c);
      } else {
        const tw = ptw(p.s);
        const px = clamp(Math.round(p.x - tw / 2), 2, this.w - tw - 2);
        outlined(x, p.s, px, Math.round(p.y), p.c);
      }
    }
    if (this.flash > 0) {
      x.globalAlpha = Math.min(0.6, this.flash);
      rect(x, 0, 0, this.w, this.h, this.flashC);
      x.globalAlpha = 1;
    }
  }
}

// ---------- the start count-in ----------
export const COUNT_STEP = 0.6;
export const COUNT_TIME = COUNT_STEP * 3;
export function countLabel(t: number): string | null {
  if (t < COUNT_TIME) return String(3 - Math.floor(t / COUNT_STEP));
  if (t < COUNT_TIME + 0.6) return 'GO!';
  return null;
}
export function drawCount(x: Ctx, t: number, w: number, h: number, sub?: string): void {
  const lab = countLabel(t);
  if (!lab) return;
  const go = lab === 'GO!';
  const local = go ? t - COUNT_TIME : t % COUNT_STEP;
  if (!go) {
    x.globalAlpha = 0.45;
    rect(x, 0, 0, w, h, '#0c0816');
    x.globalAlpha = 1;
  }
  const base = Math.round(Math.min(w, h * 1.4) / 26);
  const sc = local < 0.06 ? base + 3 : local < 0.12 ? base + 1 : base;
  bigText(x, lab, w / 2, h / 2 - 6, go ? sc - 1 : sc, go ? '#7cf08a' : '#ffe27a', INK, go ? '#d8ffd8' : '#fff8d0');
  if (sub && !go) centered(x, sub, w / 2, h / 2 + base * 4, '#f4eedd');
}

// The end ribbon: a band across the middle with a headline and a detail line.
export function drawBanner(x: Ctx, head: string, sub: string, good: boolean, t: number, w: number, h: number): void {
  const k = Math.min(1, t / 0.18);
  const bh = Math.round(40 * k);
  const y0 = Math.round(h / 2 - bh / 2) - 6;
  x.globalAlpha = 0.88;
  rect(x, 0, y0, w, bh, '#140c22');
  x.globalAlpha = 1;
  const edge = good ? '#7cf08a' : '#ff7a5a';
  rect(x, 0, y0, w, 1, edge);
  rect(x, 0, y0 + 2, w, 1, edge);
  rect(x, 0, y0 + bh - 1, w, 1, edge);
  rect(x, 0, y0 + bh - 3, w, 1, edge);
  if (k < 1) return;
  const sc = ptw(head) * 3 > w - 10 ? 2 : 3;
  bigText(x, head, w / 2, y0 + 15, sc, good ? '#ffe27a' : '#ff9a7a', INK, good ? '#fff8d0' : '#ffd0c0');
  centered(x, sub, w / 2, y0 + 28, '#f4eedd', null);
}

// Calls fn exactly once, even under StrictMode double effects or a double tap.
export function once<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
  let done = false;
  return (...a: A) => {
    if (done) return;
    done = true;
    fn(...a);
  };
}

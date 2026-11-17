// Shared juice for Laser Tag and Roach Patrol: chiptune sound (own tiny WebAudio graph that respects
// the player's mute setting), particles, pop-up text, screen shake, the announcer, big pixel
// lettering, the "3, 2, 1, GO" count-in, and a GPU light map (multiply + soft lamps) for the night scenes.
import { cached, INK, rect, text, textWidth, type Ctx, type RGB } from '../art/px.ts';
import { loadMeta } from '../ui/save.ts';

export const VW = 256;
export const VH = 144;

// ---------- sound ----------
let ac: AudioContext | null = null;
let out: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;
let loopSrc: AudioBufferSourceNode | null = null;
let loopGain: GainNode | null = null;

export function audioInit(): void {
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

export function audioStop(): void {
  if (loopSrc) {
    try {
      loopSrc.stop();
    } catch {
      /* already stopped */
    }
  }
  loopSrc = null;
  loopGain = null;
}

export const note = (semi: number): number => 440 * Math.pow(2, (semi - 9) / 12);

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  if (!ac || !out || muted) return;
  const at = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function nbuf(): AudioBuffer | null {
  if (!ac) return null;
  if (!noiseBuf) {
    const n = ac.sampleRate;
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise(dur: number, vol: number, cutoff: number, delay = 0, type: BiquadFilterType = 'lowpass'): void {
  if (!ac || !out || muted) return;
  const b = nbuf();
  if (!b) return;
  const at = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = b;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

// A looping hiss whose volume follows on/off (the bug spray).
export function hissLoop(on: boolean, level = 1): void {
  if (!ac || !out || muted) return;
  if (!loopSrc) {
    const b = nbuf();
    if (!b) return;
    loopSrc = ac.createBufferSource();
    loopSrc.buffer = b;
    loopSrc.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 4200;
    f.Q.value = 0.7;
    loopGain = ac.createGain();
    loopGain.gain.value = 0;
    loopSrc.connect(f);
    f.connect(loopGain);
    loopGain.connect(out);
    loopSrc.start();
  }
  if (loopGain) loopGain.gain.setTargetAtTime(on ? 0.22 * level : 0, ac.currentTime, on ? 0.015 : 0.04);
}

export const snd = {
  tick: () => tone('square', note(14), note(14), 0.08, 0.1),
  go: () => {
    tone('square', note(21), note(21), 0.08, 0.12);
    tone('square', note(28), note(28), 0.22, 0.12, 0.08);
  },
  zap: () => {
    tone('square', 1700, 380, 0.09, 0.06);
    tone('triangle', 900, 200, 0.1, 0.07);
  },
  ezap: () => tone('triangle', 1100, 300, 0.12, 0.035),
  spark: () => noise(0.04, 0.05, 5000, 0, 'highpass'),
  tagHit: () => {
    noise(0.08, 0.12, 3000, 0, 'highpass');
    tone('square', note(28), note(28), 0.05, 0.08);
    tone('square', note(35), note(35), 0.12, 0.08, 0.05);
  },
  aiTag: () => tone('triangle', note(24), note(19), 0.1, 0.04),
  tagged: () => {
    tone('sawtooth', 420, 70, 0.4, 0.09);
    noise(0.25, 0.14, 500);
  },
  block: () => {
    tone('triangle', 1400, 2200, 0.08, 0.08);
    tone('square', 2200, 1600, 0.06, 0.04, 0.05);
  },
  power: () => [0, 4, 7, 12, 16].forEach((s, i) => tone('square', note(21 + s), note(21 + s), 0.07, 0.08, i * 0.045)),
  streak: (n: number) => {
    const base = 19 + Math.min(n, 6) * 2;
    [0, 4, 7, 12].forEach((s, i) => tone('square', note(base + s), note(base + s), 0.09, 0.08, i * 0.06));
  },
  grab: () => {
    tone('square', note(24), note(31), 0.1, 0.08);
    tone('triangle', note(31), note(36), 0.14, 0.1, 0.08);
  },
  capture: () => [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone('square', note(19 + s), note(19 + s), 0.1, 0.1, i * 0.07)),
  out: () => [12, 7, 4, 0].forEach((s, i) => tone('triangle', note(12 + s), note(12 + s), 0.16, 0.1, i * 0.1)),
  whistle: () => {
    tone('square', 2000, 2100, 0.18, 0.06);
    tone('square', 2000, 2100, 0.4, 0.06, 0.22);
  },
  fanfare: () => [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone('square', note(14 + s), note(14 + s), 0.13, 0.1, i * 0.09)),
  sad: () => [7, 4, 0, -5].forEach((s, i) => tone('triangle', note(12 + s), note(12 + s), 0.2, 0.1, i * 0.15)),
  // Roach Patrol
  splat: () => {
    noise(0.12, 0.2, 700);
    tone('sine', 620, 90, 0.16, 0.14);
  },
  combo: (n: number) => {
    const sc = [0, 2, 4, 7, 9, 12, 14, 16];
    const s = sc[Math.min(sc.length - 1, Math.max(0, n - 1))];
    tone('square', note(24 + s), note(24 + s), 0.06, 0.07);
    tone('triangle', note(31 + s), note(31 + s), 0.1, 0.09, 0.05);
  },
  seal: () => {
    [0, 1, 2].forEach((i) => tone('square', 700 + i * 160, 1000 + i * 160, 0.06, 0.05, i * 0.09));
    noise(0.1, 0.18, 400, 0.3);
    tone('square', note(26), note(33), 0.14, 0.08, 0.32);
  },
  skitter: () => noise(0.025, 0.03, 6000, 0, 'highpass'),
  nibble: () => noise(0.05, 0.06, 2000, 0, 'bandpass'),
  empty: () => [0, 0.07, 0.14].forEach((d) => noise(0.04, 0.08, 1500, d)),
  alarm: () => {
    tone('square', note(26), note(26), 0.1, 0.07);
    tone('square', note(21), note(21), 0.14, 0.07, 0.12);
  },
  nope: () => tone('square', 260, 200, 0.08, 0.05),
  thud: () => {
    noise(0.16, 0.25, 300);
    tone('triangle', 160, 60, 0.18, 0.1);
  },
  flick: () => noise(0.03, 0.05, 8000, 0, 'highpass'),
};

// A tiny step sequencer for background groove. Call update() every frame.
export class Groove {
  private next = -1;
  private step = 0;
  private bpm: number;
  private bass: (number | null)[];
  private vol: number;
  constructor(bpm: number, bass: (number | null)[], vol = 0.035) {
    this.bpm = bpm;
    this.bass = bass;
    this.vol = vol;
  }
  update(intensity = 1): void {
    if (!ac || !out || muted) return;
    const spb = 60 / this.bpm / 4; // 16th notes
    if (this.next < 0 || this.next < ac.currentTime - 0.2) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.12) {
      const delay = this.next - ac.currentTime;
      const b = this.bass[this.step % this.bass.length];
      if (b !== null) tone('triangle', note(b), note(b), spb * 1.6, this.vol * 1.6, delay);
      if (this.step % 4 === 2) noise(0.03, this.vol * 0.9 * intensity, 7000, delay, 'highpass');
      if (this.step % 8 === 0) noise(0.08, this.vol * 1.8, 160, delay);
      this.step++;
      this.next += spb;
    }
  }
}

// ---------- text ----------
export function outlined(x: Ctx, s: string, px: number, py: number, c: string, o: string = INK): void {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) text(x, s, px + dx, py + dy, o);
  text(x, s, px, py, c);
}
export function centered(x: Ctx, s: string, cx: number, py: number, c: string, outline = true): void {
  const px = Math.round(cx - textWidth(s) / 2);
  if (outline) outlined(x, s, px, py, c);
  else text(x, s, px, py, c);
}
// Big pixel lettering: the 3x5 font scaled up, with a chunky outline and a drop shadow.
export function bigText(x: Ctx, s: string, cx: number, cy: number, scale: number, c: string, o: string = INK): void {
  const w = textWidth(s);
  const src = (col: string): HTMLCanvasElement => cached(`tagbt|${s}|${col}`, w + 1, 6, (g) => text(g, s, 0, 0, col));
  const dw = w * scale;
  const dh = 5 * scale;
  const px = Math.round(cx - dw / 2);
  const py = Math.round(cy - dh / 2);
  const ink = src(o);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [1, 2], [0, 2], [-1, 2]]) x.drawImage(ink, 0, 0, w, 5, px + dx, py + dy, dw, dh);
  x.drawImage(src(c), 0, 0, w, 5, px, py, dw, dh);
  // top highlight band
  x.globalAlpha = 0.35;
  x.drawImage(src('#ffffff'), 0, 0, w, 1, px, py, dw, Math.max(1, Math.floor(scale / 2)));
  x.globalAlpha = 1;
}

// ---------- count-in and end banner ----------
export const COUNT_STEP = 0.6;
export const COUNT_TIME = COUNT_STEP * 3;
export function countLabel(t: number): string | null {
  if (t < COUNT_TIME) return String(3 - Math.floor(t / COUNT_STEP));
  if (t < COUNT_TIME + 0.6) return 'GO!';
  return null;
}
export function drawCount(x: Ctx, t: number, accent = '#7cf0ff'): void {
  const lab = countLabel(t);
  if (!lab) return;
  const go = lab === 'GO!';
  const local = go ? t - COUNT_TIME : t % COUNT_STEP;
  if (!go) {
    x.globalAlpha = 0.3;
    rect(x, 0, 0, VW, VH, '#0a0614');
    x.globalAlpha = 1;
  }
  const pulse = local < 0.06 ? 3 : local < 0.14 ? 2 : local < 0.24 ? 1 : 0;
  // ring burst behind the number
  const rr = Math.round(10 + local * 90);
  x.globalAlpha = Math.max(0, 0.6 - local);
  x.strokeStyle = go ? '#7cf08a' : accent;
  x.lineWidth = 2;
  x.beginPath();
  x.arc(VW / 2, VH / 2 - 4, rr, 0, Math.PI * 2);
  x.stroke();
  x.globalAlpha = 1;
  bigText(x, lab, VW / 2, VH / 2 - 4, (go ? 6 : 8) + pulse, go ? '#7cf08a' : '#ffe27a');
}

export function drawBanner(x: Ctx, head: string, sub: string, good: boolean, t: number): void {
  const k = Math.min(1, t / 0.2);
  const bh = Math.round(42 * k);
  const y0 = Math.round(VH / 2 - bh / 2) - 6;
  x.globalAlpha = 0.86;
  rect(x, 0, y0, VW, bh, '#0c0818');
  x.globalAlpha = 1;
  const edge = good ? '#7cf08a' : '#ff7a5a';
  rect(x, 0, y0, VW, 1, edge);
  rect(x, 0, y0 + bh - 1, VW, 1, edge);
  rect(x, 0, y0 + 2, VW, 1, '#2a2040');
  rect(x, 0, y0 + bh - 3, VW, 1, '#2a2040');
  if (k < 1) return;
  const sc = t < 0.3 ? 5 : 4;
  bigText(x, head, VW / 2, y0 + 15, sc, good ? '#ffe27a' : '#ff9a7a');
  centered(x, sub, VW / 2, y0 + 31, '#f4eedd');
}

// ---------- particles, pops, rings, announcer ----------
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
  glow: boolean;
  drag: number;
}
interface Pop {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
}
interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  max: number;
  c: string;
}
export interface Decal {
  x: number;
  y: number;
  life: number;
  max: number;
  draw: (x: Ctx, px: number, py: number, a: number) => void;
}
export interface BurstOpts {
  g?: number;
  life?: number;
  size?: number;
  glow?: boolean;
  drag?: number;
  up?: number;
}

export class Fx {
  parts: Part[] = [];
  pops: Pop[] = [];
  rings: Ring[] = [];
  decals: Decal[] = [];
  shake = 0;
  flash = 0;
  flashC = '#ffffff';
  ann: { s: string; sub: string; c: string; life: number } | null = null;
  rm: boolean;
  constructor(rm: boolean) {
    this.rm = rm;
  }
  burst(x: number, y: number, colors: string | string[], n = 8, speed = 40, o: BurstOpts = {}): void {
    if (this.rm) n = Math.ceil(n / 2);
    const cs = Array.isArray(colors) ? colors : [colors];
    const life = o.life ?? 0.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), life: l, max: l, c: cs[i % cs.length], g: o.g ?? 0, s: (o.size ?? 1) + (Math.random() < 0.25 ? 1 : 0), glow: o.glow ?? false, drag: o.drag ?? 2 });
    }
  }
  // A directed spray (sparks off a wall, mist from a nozzle).
  jet(x: number, y: number, ang: number, spread: number, colors: string[], n: number, speed: number, o: BurstOpts = {}): void {
    if (this.rm) n = Math.ceil(n / 2);
    const life = o.life ?? 0.4;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() * 2 - 1) * spread;
      const v = speed * (0.5 + Math.random() * 0.5);
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, c: colors[i % colors.length], g: o.g ?? 0, s: o.size ?? 1, glow: o.glow ?? false, drag: o.drag ?? 3 });
    }
  }
  ring(x: number, y: number, c: string, speed = 60, life = 0.35, r0 = 2): void {
    this.rings.push({ x, y, r: r0, vr: speed, life, max: life, c });
  }
  pop(x: number, y: number, s: string, c: string): void {
    this.pops.push({ x, y, s, c, life: 0.95 });
  }
  say(s: string, c: string, sub = ''): void {
    this.ann = { s, sub, c, life: 1.5 };
  }
  decal(d: Decal): void {
    this.decals.push(d);
    if (this.decals.length > 60) this.decals.shift();
  }
  kick(amount: number): void {
    this.shake = Math.max(this.shake, this.rm ? Math.min(0.8, amount * 0.2) : amount);
  }
  blink(c: string, amount = 0.3): void {
    this.flashC = c;
    this.flash = Math.max(this.flash, this.rm ? amount * 0.35 : amount);
  }
  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    if (this.parts.some((p) => p.life <= 0)) this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.pops) {
      p.life -= dt;
      p.y -= dt * 16 * Math.min(1, p.life * 2);
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    for (const r of this.rings) {
      r.life -= dt;
      r.r += r.vr * dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const d of this.decals) d.life -= dt;
    this.decals = this.decals.filter((d) => d.life > 0);
    if (this.ann) {
      this.ann.life -= dt;
      if (this.ann.life <= 0) this.ann = null;
    }
    this.shake = Math.max(0, this.shake - dt * 16);
    this.flash = Math.max(0, this.flash - dt * 2.8);
  }
  offset(): [number, number] {
    if (this.shake < 0.3) return [0, 0];
    return [Math.round((Math.random() * 2 - 1) * this.shake), Math.round((Math.random() * 2 - 1) * this.shake)];
  }
  drawDecals(x: Ctx): void {
    for (const d of this.decals) d.draw(x, d.x, d.y, Math.min(1, d.life / Math.min(d.max, 2)));
  }
  // glow = false: lit particles (drawn before the light pass); true: emissive ones (after it).
  drawParts(x: Ctx, glow: boolean): void {
    for (const p of this.parts) {
      if (p.glow !== glow) continue;
      if (p.life < p.max * 0.3 && Math.floor(p.life * 30) % 2) continue;
      rect(x, p.x, p.y, p.s, p.s, p.c);
    }
  }
  drawRings(x: Ctx): void {
    for (const r of this.rings) {
      x.globalAlpha = Math.max(0, r.life / r.max);
      x.strokeStyle = r.c;
      x.lineWidth = 1;
      x.beginPath();
      x.arc(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, r.r, 0, Math.PI * 2);
      x.stroke();
    }
    x.globalAlpha = 1;
  }
  drawPops(x: Ctx): void {
    for (const p of this.pops) {
      if (p.life < 0.2 && Math.floor(p.life * 30) % 2) continue;
      const tw = textWidth(p.s);
      const px = Math.max(2, Math.min(VW - tw - 2, Math.round(p.x - tw / 2)));
      outlined(x, p.s, px, Math.round(p.y), p.c);
    }
  }
  drawAnnounce(x: Ctx, y = 30): void {
    const a = this.ann;
    if (!a) return;
    const age = 1.5 - a.life;
    if (a.life < 0.25 && Math.floor(a.life * 24) % 2) return;
    const base = a.s.length > 10 ? 2 : 3;
    const sc = age < 0.06 ? base + 1 : base;
    const slide = age < 0.12 ? Math.round((0.12 - age) * 300) : 0;
    bigText(x, a.s, VW / 2 + slide, y, sc, a.c);
    if (a.sub) centered(x, a.sub, VW / 2 + slide, y + 11, '#f4eedd');
  }
  drawFlash(x: Ctx): void {
    if (this.flash <= 0) return;
    x.globalAlpha = Math.min(0.6, this.flash);
    rect(x, 0, 0, VW, VH, this.flashC);
    x.globalAlpha = 1;
  }
}

// ---------- lighting ----------
export interface Lamp {
  x: number;
  y: number;
  r: number;
  ry?: number;
  c: RGB; // brightness multiplier, e.g. [1.3, 0.6, 1.5] for magenta neon
  cone?: { ang: number; spread: number }; // a beam (flashlight) instead of a round pool
}

// Light as a multiplier on the scene, done on the GPU: a small light canvas (ambient + soft radial
// lamps, stored at half value so it can go above 1) is bilinear-scaled over the frame with 'multiply',
// then the frame is added to itself to restore the x2. Static lamps are baked once; moving lamps
// (bolts, flashes, the flashlight) are added per frame. No pixel reads, smooth falloff.
const LM_RES = 0.5;
export class LightMap {
  private base: HTMLCanvasElement;
  private flick: HTMLCanvasElement | null = null;
  private cur: HTMLCanvasElement;
  private ambient: RGB;
  constructor(ambient: RGB, lamps: Lamp[], flickLamps: Lamp[] = [], steps = 5) {
    void steps;
    this.ambient = ambient;
    const mk = (): HTMLCanvasElement => {
      const c = document.createElement('canvas');
      c.width = Math.round(VW * LM_RES);
      c.height = Math.round(VH * LM_RES);
      return c;
    };
    this.base = mk();
    this.cur = mk();
    const b = this.base.getContext('2d')!;
    b.fillStyle = rgbCss(ambient, 0.5);
    b.fillRect(0, 0, this.base.width, this.base.height);
    for (const L of lamps) this.add(b, L, 1);
    if (flickLamps.length) {
      this.flick = mk();
      const f = this.flick.getContext('2d')!;
      for (const L of flickLamps) this.add(f, L, 1);
    }
  }
  // lamp falloff (1-d)(1-0.35d), as gradient stops, of the light it adds over the ambient
  private add(x: CanvasRenderingContext2D, L: Lamp, k: number): void {
    const a = this.ambient;
    const dc: RGB = [Math.max(0, L.c[0] - a[0]) * k, Math.max(0, L.c[1] - a[1]) * k, Math.max(0, L.c[2] - a[2]) * k];
    const ry = L.ry ?? L.r;
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.setTransform(LM_RES, 0, 0, LM_RES * (ry / L.r), L.x * LM_RES, L.y * LM_RES);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, L.r);
    for (const d of [0, 0.25, 0.5, 0.75, 1]) g.addColorStop(d, rgbCss(dc, 0.5 * (1 - d) * (1 - d * 0.35)));
    x.fillStyle = g;
    x.beginPath();
    if (L.cone) {
      // a beam: a wedge with soft (feathered) sides, brightest along its axis
      const { ang, spread } = L.cone;
      x.moveTo(0, 0);
      x.arc(0, 0, L.r, ang - spread, ang + spread);
      x.closePath();
      x.fill();
      x.globalAlpha = 0.5;
      x.beginPath();
      x.moveTo(0, 0);
      x.arc(0, 0, L.r * 0.9, ang - spread * 1.35, ang + spread * 1.35);
      x.closePath();
    } else x.arc(0, 0, L.r, 0, Math.PI * 2);
    x.fill();
    x.restore();
  }
  apply(x: Ctx, dyn: Lamp[], flickK = 1, darken = 1): void {
    const c = this.cur.getContext('2d');
    if (!c) return;
    c.globalCompositeOperation = 'copy';
    c.globalAlpha = 1;
    c.drawImage(this.base, 0, 0);
    c.globalCompositeOperation = 'lighter';
    if (this.flick && flickK > 0) {
      c.globalAlpha = Math.min(1, flickK);
      c.drawImage(this.flick, 0, 0);
      c.globalAlpha = 1;
    }
    for (const L of dyn) this.add(c, L, 1);
    if (darken < 1) {
      c.globalCompositeOperation = 'multiply';
      const v = Math.round(255 * Math.max(0, darken));
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(0, 0, this.cur.width, this.cur.height);
    }
    c.globalCompositeOperation = 'source-over';
    const cv = x.canvas;
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.imageSmoothingEnabled = true;
    x.globalCompositeOperation = 'multiply';
    x.drawImage(this.cur, 0, 0, cv.width, cv.height);
    x.globalCompositeOperation = 'lighter';
    x.drawImage(cv, 0, 0);
    x.restore();
  }
}
function rgbCss(c: RGB, k: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k * 255)));
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}

// Additive soft glow (bolts, neon, muzzle flashes): stepped ellipses in 'lighter' mode.
export function bloom(x: Ctx, cx: number, cy: number, r: number, c: string, a = 0.35): void {
  const prev = x.globalCompositeOperation;
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = c;
  for (let k = 0; k < 3; k++) {
    const rr = r * (1 - k * 0.3);
    x.globalAlpha = a * 0.4;
    for (let j = -Math.floor(rr); j <= rr; j++) {
      const hw = Math.round(rr * Math.sqrt(Math.max(0, 1 - (j / (rr + 0.5)) ** 2)));
      if (hw > 0) x.fillRect(Math.round(cx - hw), Math.round(cy + j), hw * 2, 1);
    }
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = prev;
}

// Pixel line with a given colour (Bresenham), optionally 2px thick.
export function pline(x: Ctx, x0: number, y0: number, x1: number, y1: number, c: string, thick = 1): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  x.fillStyle = c;
  for (let guard = 0; guard < 400; guard++) {
    x.fillRect(x0, y0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

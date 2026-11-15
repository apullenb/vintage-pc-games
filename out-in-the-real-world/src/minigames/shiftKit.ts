// Shared juice for Shift Rush and Bus Dash: particles, pop-up text, screen shake, big pixel
// lettering, the "3, 2, 1, GO" count-in and the end banner. Plain functions, no React.
import { cached, INK, rect, text, textWidth, type Ctx } from '../art/px.ts';
import type { Look } from '../engine/types.ts';
import type { Input, Key } from './kit.tsx';

export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const irnd = (a: number, b: number): number => Math.floor(rnd(a, b + 1));
export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const approach = (v: number, to: number, step: number): number => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

// Earned/possible ratio -> 0..1 score. A tidy run (~95%) is a 1.0, ~80% is ~0.75, a coin flip is ~0.35.
export const ratioScore = (r: number): number => Math.max(0, Math.min(1, (r - 0.25) / 0.7));

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
}
interface Pop {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
}

export class Fx {
  parts: Part[] = [];
  pops: Pop[] = [];
  shake = 0;
  flash = 0;
  flashC = '#ffffff';
  private rm: boolean;
  constructor(reducedMotion: boolean) {
    this.rm = reducedMotion;
  }
  burst(x: number, y: number, colors: string | string[], n = 8, speed = 40, g = 90, life = 0.6, size = 1): void {
    if (this.rm) n = Math.ceil(n / 2);
    const cs = Array.isArray(colors) ? colors : [colors];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35, life: l, max: l, c: cs[i % cs.length], g, s: size + (Math.random() < 0.25 ? 1 : 0) });
    }
  }
  // A spray in one direction (dust kicked back, water splash).
  spray(x: number, y: number, colors: string[], n: number, vx: number, vy: number, spread: number, g = 120, life = 0.5): void {
    if (this.rm) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: vx + rnd(-spread, spread), vy: vy + rnd(-spread, spread), life: l, max: l, c: colors[i % colors.length], g, s: 1 });
    }
  }
  pop(x: number, y: number, s: string, c: string): void {
    this.pops.push({ x, y, s, c, life: 0.9 });
  }
  kick(amount: number): void {
    this.shake = Math.max(this.shake, this.rm ? Math.min(1, amount * 0.25) : amount);
  }
  blink(c: string, amount = 0.35): void {
    this.flashC = c;
    this.flash = Math.max(this.flash, this.rm ? amount * 0.4 : amount);
  }
  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.pops) {
      p.life -= dt;
      p.y -= dt * 14 * Math.min(1, p.life * 2);
    }
    this.pops = this.pops.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt * 14);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }
  offset(): [number, number] {
    if (this.shake < 0.3) return [0, 0];
    return [Math.round((Math.random() * 2 - 1) * this.shake), Math.round((Math.random() * 2 - 1) * this.shake)];
  }
  draw(x: Ctx, w = 192, h = 108): void {
    for (const p of this.parts) {
      if (p.life < p.max * 0.25 && Math.floor(p.life * 30) % 2) continue;
      rect(x, p.x, p.y, p.s, p.s, p.c);
    }
    for (const p of this.pops) {
      if (p.life < 0.2 && Math.floor(p.life * 30) % 2) continue;
      const tw = textWidth(p.s);
      const px = Math.max(1, Math.min(w - tw - 1, Math.round(p.x - tw / 2)));
      outlined(x, p.s, px, Math.round(p.y), p.c);
    }
    if (this.flash > 0) {
      x.globalAlpha = Math.min(0.7, this.flash);
      rect(x, 0, 0, w, h, this.flashC);
      x.globalAlpha = 1;
    }
  }
}

// 3x5 text with a 1px ink outline, readable over anything.
export function outlined(x: Ctx, s: string, px: number, py: number, c: string, o: string = INK): void {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) text(x, s, px + dx, py + dy, o);
  text(x, s, px, py, c);
}
export function centered(x: Ctx, s: string, cx: number, py: number, c: string, outline = true): void {
  const px = Math.round(cx - textWidth(s) / 2);
  if (outline) outlined(x, s, px, py, c);
  else text(x, s, px, py, c);
}

// Big pixel lettering: the 3x5 font scaled up, with a chunky outline.
export function bigText(x: Ctx, s: string, cx: number, cy: number, scale: number, c: string, o: string = INK): void {
  const w = textWidth(s);
  const src = (col: string) => cached(`bt|${s}|${col}`, w + 1, 6, (g) => text(g, s, 0, 0, col));
  const dw = w * scale;
  const dh = 5 * scale;
  const px = Math.round(cx - dw / 2);
  const py = Math.round(cy - dh / 2);
  const ink = src(o);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [1, 2], [0, 2]]) x.drawImage(ink, 0, 0, w, 5, px + dx, py + dy, dw, dh);
  x.drawImage(src(c), 0, 0, w, 5, px, py, dw, dh);
}

// ---------- the start count-in ----------
export const COUNT_STEP = 0.55;
export const COUNT_TIME = COUNT_STEP * 3; // play starts at "GO"
// Returns the label to show at time t since the start, or null when the count-in is over.
export function countLabel(t: number): string | null {
  if (t < COUNT_TIME) return String(3 - Math.floor(t / COUNT_STEP));
  if (t < COUNT_TIME + 0.55) return 'GO!';
  return null;
}
export function drawCount(x: Ctx, t: number, w = 192, h = 108): void {
  const lab = countLabel(t);
  if (!lab) return;
  const go = lab === 'GO!';
  const local = go ? t - COUNT_TIME : t % COUNT_STEP;
  if (!go) {
    x.globalAlpha = 0.35;
    rect(x, 0, 0, w, h, '#100a1c');
    x.globalAlpha = 1;
  }
  const sc = local < 0.08 ? 9 : local < 0.16 ? 8 : 7;
  bigText(x, lab, w / 2, h / 2 - 4, go ? sc - 2 : sc, go ? '#7cf08a' : '#ffe27a');
}

// The end beat: a ribbon across the middle with a headline and a detail line.
export function drawBanner(x: Ctx, head: string, sub: string, good: boolean, t: number, w = 192, h = 108): void {
  const k = Math.min(1, t / 0.18);
  const bh = Math.round(34 * k);
  const y0 = Math.round(h / 2 - bh / 2) - 4;
  x.globalAlpha = 0.85;
  rect(x, 0, y0, w, bh, '#140c22');
  x.globalAlpha = 1;
  rect(x, 0, y0, w, 1, good ? '#7cf08a' : '#ff7a5a');
  rect(x, 0, y0 + bh - 1, w, 1, good ? '#7cf08a' : '#ff7a5a');
  if (k < 1) return;
  bigText(x, head, w / 2, y0 + 12, 3, good ? '#ffe27a' : '#ff9a7a');
  centered(x, sub, w / 2, y0 + 24, '#f4eedd', false);
}

// Shift Rush score from accuracy (share of actions done right) and pace (share of a good shift's
// workload done). ~97%+ right at full pace = 1.0; 90% right ~0.85; 80% ~0.65; a coin flip ~0.1.
export function shiftScore(acc: number, pace: number): number {
  const a = Math.max(0, Math.min(1, (acc * 1.03 - 0.45) / 0.55));
  const p = Math.max(0, Math.min(1, pace));
  return Math.max(0, Math.min(1, a * (0.55 + 0.45 * p)));
}

// Tracks keys pressed since last frame for edge-triggered actions with the kit's Input.
export const hit = (inp: Input, k: Key): boolean => inp.pressed.has(k);

// ---------- Shift Rush modes ----------
export interface ModeEnv {
  fx: Fx;
  level: number; // 0 on the first extra shift, up to 4: later shifts start busier
  look: Look;
  rm: boolean; // reduced motion
}
export interface HudItem {
  label: string;
  value: string | number;
  warn?: boolean;
}
export interface ShiftMode {
  duration: number; // seconds of play (the host runs the clock)
  keys: { key: Key; label: string; wide?: boolean }[]; // touch buttons
  note: string; // one-line controls reminder under the canvas (keyboard)
  touchNote: string; // the same for phones
  // live = the clock is running (false during the count-in and the end beat).
  step(dt: number, t: number, inp: Input, live: boolean): void;
  pointer(x: number, y: number, kind: 'down' | 'move' | 'up'): void;
  draw(x: Ctx, t: number): void;
  hud(): HudItem[];
  finished?(): boolean; // the mode ran out of work before the clock did
  result(): { score: number; stats: Record<string, number>; line: string };
}

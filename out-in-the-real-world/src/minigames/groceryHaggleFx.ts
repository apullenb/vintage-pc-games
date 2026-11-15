// Shared juice for the Grocery Run and Haggle mini-games: scaled pixel text, particles, floating labels.
import { INK, text, textWidth, type Ctx } from '../art/px.ts';

// ---------- pixel text at any integer scale, with an optional 1px outline ----------
const LABELS = new Map<string, HTMLCanvasElement>();
function label(raw: string, color: string, outline?: string): HTMLCanvasElement {
  const s = raw.replace(/[’‘]/g, "'").replace(/[“”]/g, '');
  const key = `${s}|${color}|${outline ?? ''}`;
  let c = LABELS.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = textWidth(s) + 2;
    c.height = 7;
    const x = c.getContext('2d');
    if (x) {
      if (outline)
        for (const [dx, dy] of [
          [0, 1],
          [2, 1],
          [1, 0],
          [1, 2],
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
        ])
          text(x, s, dx, dy, outline);
      text(x, s, 1, 1, color);
    }
    if (LABELS.size > 400) LABELS.clear();
    LABELS.set(key, c);
  }
  return c;
}

export interface TextOpts {
  scale?: number;
  outline?: string;
  align?: 'left' | 'center' | 'right';
  alpha?: number;
  shadow?: string; // drop shadow one (scaled) pixel down-right
}

// Draws s with its top-left (or top-center / top-right) at (px, py). Returns the drawn width.
export function say(x: Ctx, s: string, px: number, py: number, color: string, o: TextOpts = {}): number {
  const k = o.scale ?? 1;
  const c = label(s, color, o.outline);
  const w = c.width * k;
  const left = o.align === 'center' ? px - w / 2 : o.align === 'right' ? px - w : px;
  if (o.alpha !== undefined) x.globalAlpha = Math.max(0, Math.min(1, o.alpha));
  if (o.shadow) x.drawImage(label(s, o.shadow), Math.round(left), Math.round(py), w, c.height * k);
  x.drawImage(c, Math.round(left) - k, Math.round(py) - k, w, c.height * k);
  x.globalAlpha = 1;
  return w - 2 * k;
}
export const sayWidth = (s: string, scale = 1): number => textWidth(s.replace(/[“”]/g, '')) * scale;

// ---------- particles + floating labels ----------
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  size: number;
  g: number;
}
interface Floater {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
  max: number;
  scale: number;
}

export class Fx {
  parts: Particle[] = [];
  floats: Floater[] = [];
  shakeT = 0;
  shakeAmp = 0;
  flashT = 0;
  flashC = '#ffffff';
  reduced: boolean;
  constructor(reduced: boolean) {
    this.reduced = reduced;
  }
  burst(x: number, y: number, n: number, colors: string[], speed = 40, gravity = 60, size = 1): void {
    const count = this.reduced ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6) * (this.reduced ? 0.4 : 1);
      const max = 0.4 + Math.random() * 0.5;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: max, max, c: colors[i % colors.length], size, g: gravity });
    }
  }
  float(x: number, y: number, s: string, c: string, scale = 1, life = 1.1): void {
    this.floats.push({ x, y, s, c, life, max: life, scale });
    if (this.floats.length > 8) this.floats.shift();
  }
  shake(amp: number, t = 0.25): void {
    if (this.reduced) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, t);
  }
  flash(c: string, t = 0.12): void {
    this.flashC = c;
    this.flashT = this.reduced ? Math.min(t, 0.06) : t;
  }
  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= dt * (this.reduced ? 4 : 12) * (f.life / f.max);
    }
    this.floats = this.floats.filter((f) => f.life > 0);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeAmp = 0;
    this.flashT = Math.max(0, this.flashT - dt);
  }
  offset(): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const a = this.shakeAmp * (0.5 + this.shakeT * 2);
    return [Math.round((Math.random() * 2 - 1) * a), Math.round((Math.random() * 2 - 1) * a)];
  }
  drawParts(x: Ctx): void {
    for (const p of this.parts) {
      x.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      x.fillStyle = p.c;
      x.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    x.globalAlpha = 1;
  }
  drawFloats(x: Ctx, W: number): void {
    for (const f of this.floats) {
      const w = sayWidth(f.s, f.scale);
      const cx = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, f.x));
      say(x, f.s, cx, f.y, f.c, { scale: f.scale, outline: INK, align: 'center', alpha: Math.min(1, (f.life / f.max) * 3) });
    }
  }
  drawFlash(x: Ctx, W: number, H: number): void {
    if (this.flashT <= 0) return;
    x.globalAlpha = Math.min(0.45, this.flashT * 3);
    x.fillStyle = this.flashC;
    x.fillRect(0, 0, W, H);
    x.globalAlpha = 1;
  }
}

export const dollars = (v: number): string => `$${v.toFixed(2)}`;
export const wholeDollars = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;

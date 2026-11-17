// Shared juice for the Grocery Run and Haggle mini-games: smooth outlined text, particles, floating labels.
import { INK, textWidth, type Ctx } from '../art/px.ts';
import { FONT, rad, rgba } from './hd2Kit.tsx';

export interface TextOpts {
  scale?: number;
  outline?: string;
  align?: 'left' | 'center' | 'right';
  alpha?: number;
  shadow?: string; // drop shadow one (scaled) pixel down-right
}

// Draws s with its top-left (or top-center / top-right) at (px, py), in a smooth rounded face that
// keeps the old pixel font's footprint (5 * scale tall, the same width), so every layout still fits.
// Returns the drawn width.
export function say(x: Ctx, raw: string, px: number, py: number, color: string, o: TextOpts = {}): number {
  const s = raw.replace(/[’‘]/g, "'").replace(/[“”]/g, '');
  const k = o.scale ?? 1;
  const box = Math.max(1, textWidth(s)) * k;
  const size = 6.6 * k;
  x.save();
  x.font = `900 ${size}px ${FONT}`;
  const mw = x.measureText(s).width;
  const sx = mw > box * 1.04 ? (box * 1.04) / mw : 1;
  const w = mw * sx;
  const left = o.align === 'center' ? px - w / 2 : o.align === 'right' ? px - w : px;
  x.translate(left, py + 2.6 * k);
  x.scale(sx, 1);
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  if (o.alpha !== undefined) x.globalAlpha = Math.max(0, Math.min(1, o.alpha));
  if (o.shadow) {
    x.fillStyle = o.shadow;
    x.fillText(s, k * 0.8, k * 0.8);
  }
  if (o.outline) {
    x.lineWidth = Math.max(1, 1.8 * Math.sqrt(k));
    x.strokeStyle = o.outline;
    x.strokeText(s, 0, 0);
  }
  x.fillStyle = color;
  x.fillText(s, 0, 0);
  x.restore();
  return w;
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
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const a = Math.min(1, (p.life / p.max) * 1.6);
      const r = p.size * 2.2;
      x.fillStyle = rad(x, p.x, p.y, 0, r, [rgba(p.c, 0.45 * a), rgba(p.c, 0)]);
      x.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    x.restore();
    for (const p of this.parts) {
      x.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      x.fillStyle = p.c;
      x.beginPath();
      x.arc(p.x, p.y, p.size * 0.65, 0, Math.PI * 2);
      x.fill();
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
    x.fillStyle = rad(x, W / 2, H / 2, W * 0.1, W * 0.7, [rgba(this.flashC, 0.25), rgba(this.flashC, 1)]);
    x.fillRect(0, 0, W, H);
    x.globalAlpha = 1;
  }
}

export const dollars = (v: number): string => `$${v.toFixed(2)}`;
export const wholeDollars = (v: number): string => `$${Math.round(v).toLocaleString('en-US')}`;

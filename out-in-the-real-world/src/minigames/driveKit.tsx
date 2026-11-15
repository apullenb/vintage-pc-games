// Shared bits for the driving mini-games (Driving Test, Delivery Rush): top-down vehicle sprites,
// particles, floating text, screen shake, big pixel text, touch pedals and the start overlay.
import type { ReactNode } from 'react';
import { INK, rect, shade, text, textWidth, type Ctx } from '../art/px.ts';
import type { Input, Key } from './kit.tsx';
import './drive.css';

// ---------- sprites ----------
export type VehicleKind = 'sedan' | 'hatch' | 'van' | 'truck' | 'police' | 'taxi' | 'bike';
export interface VehicleLook {
  kind: VehicleKind;
  body: string;
  heads?: string[]; // hair colors seen through the windshield (driver, passenger)
  shirt?: string; // bike rider
  bag?: string; // delivery bag on a bike / roof sign color
}

// Pattern rows, nose up. Each char is a palette slot.
const PATTERNS: Record<Exclude<VehicleKind, 'bike'>, string[]> = {
  sedan: [
    '  kkkkkkk  ',
    ' khBbbbbhk ',
    'wkBbbbbbskw',
    'wkBbbbbbskw',
    'kkgGGggggkk',
    ' kgGgggggk ',
    ' kbbbbbbsk ',
    ' kbRRRRRsk ',
    ' kbRRRRRsk ',
    ' kbRRRRRsk ',
    ' kbbbbbbsk ',
    ' kgggggggk ',
    'wkBbbbbbskw',
    'wkBbbbbbskw',
    ' krBbbbsrk ',
    '  kkkkkkk  ',
  ],
  hatch: [
    '  kkkkkkk  ',
    ' khBbbbbhk ',
    'wkBbbbbbskw',
    'kkgGGggggkk',
    ' kgGgggggk ',
    ' kbRRRRRsk ',
    ' kbRRRRRsk ',
    ' kbRRRRRsk ',
    ' kbbbbbbsk ',
    ' kgggggggk ',
    'wkBbbbbbskw',
    ' krBbbbsrk ',
    '  kkkkkkk  ',
  ],
  van: [
    '  kkkkkkk  ',
    ' khBbbbbhk ',
    'wkBbbbbbskw',
    'kkgGGggggkk',
    ' kgGgggggk ',
    ' kRRRRRRsk ',
    ' kRRRRRRsk ',
    ' kRRRRRRsk ',
    ' kRRRRRRsk ',
    ' kRRRRRRsk ',
    ' kRRRRRRsk ',
    ' kRRRRRRsk ',
    'wkBbbbbbskw',
    'wkBbbbbbskw',
    ' krBbbbsrk ',
    '  kkkkkkk  ',
  ],
  truck: [
    '   kkkkkkk   ',
    '  khBbbbbhk  ',
    ' wkBbbbbbskw ',
    'kkkgGGggggkkk',
    '  kgGgggggk  ',
    '  kbbbbbbsk  ',
    ' kkkkkkkkkkk ',
    ' kWWWWWWWWSk ',
    'wkWWWWWWWWSkw',
    'wkWWWWWWWWSkw',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    ' kWWWWWWWWSk ',
    'wkWWWWWWWWSkw',
    'wkWWWWWWWWSkw',
    ' krWWWWWWSrk ',
    ' kkkkkkkkkkk ',
  ],
  police: [
    '  kkkkkkk  ',
    ' khBbbbbhk ',
    'wkBbbbbbskw',
    'wkBbbbbbskw',
    'kkgGGggggkk',
    ' kgGgggggk ',
    ' kWWWWWWSk ',
    ' kxxxzzzSk ',
    ' kWWWWWWSk ',
    ' kWWWWWWSk ',
    ' kbbbbbbsk ',
    ' kgggggggk ',
    'wkBbbbbbskw',
    'wkBbbbbbskw',
    ' krBbbbsrk ',
    '  kkkkkkk  ',
  ],
  taxi: [
    '  kkkkkkk  ',
    ' khBbbbbhk ',
    'wkBbbbbbskw',
    'wkBbbbbbskw',
    'kkgGGggggkk',
    ' kgGgggggk ',
    ' kbbbbbbsk ',
    ' kbbYYYbsk ',
    ' kbbYYYbsk ',
    ' kbbbbbbsk ',
    ' kbbbbbbsk ',
    ' kgggggggk ',
    'wkBbbbbbskw',
    'wkBbbbbbskw',
    ' krBbbbsrk ',
    '  kkkkkkk  ',
  ],
};

const SPRITES = new Map<string, HTMLCanvasElement>();

export function vehicleSprite(l: VehicleLook): HTMLCanvasElement {
  const key = JSON.stringify(l);
  const hit = SPRITES.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const x = c.getContext('2d')!;
  if (l.kind === 'bike') {
    c.width = 7;
    c.height = 12;
    drawBikeSprite(x, l);
  } else {
    const pat = PATTERNS[l.kind];
    c.width = pat[0].length;
    c.height = pat.length;
    const pal: Record<string, string> = {
      k: INK,
      b: l.body,
      B: shade(l.body, 1.18),
      s: shade(l.body, 0.74),
      R: shade(l.body, 1.08),
      g: '#26304a',
      G: '#7d9cc8',
      h: '#fff6c0',
      r: '#b8302a',
      w: '#120e18',
      W: l.kind === 'truck' ? '#e8e4da' : '#f2f0ea',
      S: '#b8b2a8',
      x: '#e0403a',
      z: '#3f7fff',
      Y: l.bag ?? '#f2d048',
    };
    pat.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const col = pal[row[i]];
        if (col) rect(x, i, j, 1, 1, col);
      }
    });
    // people seen through the windshield
    const glassRow = pat.findIndex((r) => r.includes('gG'));
    (l.heads ?? []).forEach((h, k) => {
      const hx = k === 0 ? 2 + (c.width - 11) / 2 + 1 : 2 + (c.width - 11) / 2 + 5;
      rect(x, hx, glassRow, 2, 1, h);
      rect(x, hx, glassRow + 1, 2, 1, shade(h, 0.8));
    });
  }
  SPRITES.set(key, c);
  return c;
}

function drawBikeSprite(x: Ctx, l: VehicleLook): void {
  // wheels front/back, rider's shoulders + head, delivery box on the back
  rect(x, 3, 0, 1, 3, '#1a1622');
  rect(x, 3, 9, 1, 3, '#1a1622');
  rect(x, 1, 2, 5, 1, '#8a8a9a'); // handlebar
  rect(x, 1, 4, 5, 3, l.shirt ?? '#3f7fd8');
  rect(x, 1, 4, 5, 1, shade(l.shirt ?? '#3f7fd8', 1.2));
  rect(x, 2, 3, 3, 3, (l.heads ?? ['#2a1b12'])[0]);
  rect(x, 2, 3, 3, 1, shade((l.heads ?? ['#2a1b12'])[0], 1.3));
  rect(x, 1, 7, 5, 3, INK);
  rect(x, 2, 7, 3, 2, l.bag ?? '#e0503c');
  rect(x, 2, 7, 3, 1, shade(l.bag ?? '#e0503c', 1.25));
}

export interface LightsOpts {
  brake?: boolean;
  blink?: -1 | 0 | 1; // turn signal side
  blinkOn?: boolean;
  reverse?: boolean;
  hazard?: boolean;
  siren?: boolean;
  t?: number;
}

// Draw a vehicle centered at (cx, cy), rotated by ang radians (0 = nose up, + = clockwise).
export function drawVehicle(x: Ctx, l: VehicleLook, cx: number, cy: number, ang = 0, o: LightsOpts = {}): void {
  const img = vehicleSprite(l);
  const w = img.width;
  const h = img.height;
  const q = Math.round(ang / (Math.PI / 48)) * (Math.PI / 48);
  x.save();
  x.translate(Math.round(cx), Math.round(cy));
  if (q) x.rotate(q);
  const ox = -Math.floor(w / 2);
  const oy = -Math.floor(h / 2);
  // ground shadow
  x.fillStyle = 'rgba(12,6,22,0.28)';
  x.fillRect(ox + 1, oy + 2, w - 1, h - 1);
  x.drawImage(img, ox, oy);
  if (l.kind !== 'bike') {
    const rearY = oy + h - (l.kind === 'van' ? 3 : 2);
    if (o.brake) {
      x.fillStyle = '#ff5040';
      x.fillRect(ox + 2, rearY, 2, 1);
      x.fillRect(ox + w - 4, rearY, 2, 1);
      x.fillStyle = 'rgba(255,60,40,0.35)';
      x.fillRect(ox + 1, rearY + 1, 4, 2);
      x.fillRect(ox + w - 5, rearY + 1, 4, 2);
    }
    if (o.reverse) {
      x.fillStyle = '#ffffff';
      x.fillRect(ox + 4, rearY, 1, 1);
      x.fillRect(ox + w - 5, rearY, 1, 1);
    }
    const sides: number[] = o.hazard ? [-1, 1] : o.blink ? [o.blink] : [];
    if (o.blinkOn && sides.length)
      for (const sd of sides) {
        const bx = sd < 0 ? ox + 1 : ox + w - 3;
        x.fillStyle = '#ffb020';
        x.fillRect(bx, oy + 1, 2, 2);
        x.fillRect(bx, rearY - 1, 2, 2);
        x.fillStyle = 'rgba(255,180,40,0.35)';
        x.fillRect(bx - 1, oy - 1, 4, 2);
        x.fillRect(bx - 1, rearY + 1, 4, 2);
      }
    if (o.siren && l.kind === 'police') {
      const on = Math.floor((o.t ?? 0) * 8) % 2 === 0;
      x.fillStyle = on ? 'rgba(255,60,60,0.45)' : 'rgba(60,120,255,0.45)';
      x.fillRect(ox - 3, oy + 4, w + 6, 6);
    }
  }
  x.restore();
}

export function vehicleSize(kind: VehicleKind): { w: number; h: number } {
  if (kind === 'bike') return { w: 7, h: 12 };
  const p = PATTERNS[kind];
  return { w: p[0].length - 2, h: p.length };
}

// ---------- particles & floating text ----------
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  s: number;
  g?: number; // gravity
}

export interface Floater {
  x: number;
  y: number;
  s: string;
  c: string;
  life: number;
}

export class Fx {
  parts: Particle[] = [];
  floats: Floater[] = [];
  shakeT = 0;
  shakeMag = 0;
  flashT = 0;
  flashC = '#ffffff';
  reduced: boolean;
  constructor(reduced: boolean) {
    this.reduced = reduced;
  }

  burst(x: number, y: number, n: number, colors: string[], speed = 30, life = 0.6, g = 0): void {
    if (this.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, c: colors[i % colors.length], s: Math.random() < 0.3 ? 2 : 1, g });
    }
  }
  puff(x: number, y: number, c: string, vx = 0, vy = 6): void {
    this.parts.push({ x, y, vx: vx + (Math.random() - 0.5) * 6, vy: vy + (Math.random() - 0.5) * 4, life: 0.5, max: 0.5, c, s: 1 });
  }
  float(x: number, y: number, s: string, c: string): void {
    this.floats.push({ x, y, s, c, life: 1.1 });
  }
  shake(mag: number, t = 0.3): void {
    this.shakeMag = Math.max(this.shakeMag, this.reduced ? Math.min(1, mag * 0.25) : mag);
    this.shakeT = Math.max(this.shakeT, t);
  }
  flash(c: string, t = 0.18): void {
    this.flashC = c;
    this.flashT = this.reduced ? Math.min(t, 0.08) : t;
  }
  update(dt: number): void {
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.g ?? 0) * dt;
      p.vx *= 1 - dt * 2;
      p.vy *= 1 - dt * 2;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= dt * 14;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
    this.shakeT = Math.max(0, this.shakeT - dt);
    if (this.shakeT <= 0) this.shakeMag = 0;
    this.flashT = Math.max(0, this.flashT - dt);
  }
  offset(): [number, number] {
    if (this.shakeT <= 0 || this.shakeMag <= 0) return [0, 0];
    const m = this.shakeMag * Math.min(1, this.shakeT / 0.15);
    return [Math.round((Math.random() * 2 - 1) * m), Math.round((Math.random() * 2 - 1) * m)];
  }
  // world -> screen mapping is passed in so this works with any camera
  draw(x: Ctx, toScreen: (wx: number, wy: number) => [number, number]): void {
    for (const p of this.parts) {
      const [sx, sy] = toScreen(p.x, p.y);
      x.globalAlpha = Math.max(0, Math.min(1, (p.life / p.max) * 1.5));
      rect(x, sx, sy, p.s, p.s, p.c);
    }
    x.globalAlpha = 1;
    for (const f of this.floats) {
      const [sx, sy] = toScreen(f.x, f.y);
      const w = textWidth(f.s);
      x.globalAlpha = Math.min(1, f.life * 2.5);
      outlinedText(x, f.s, sx - w / 2, sy, f.c);
      x.globalAlpha = 1;
    }
  }
  drawFlash(x: Ctx, w: number, h: number): void {
    if (this.flashT <= 0) return;
    x.globalAlpha = Math.min(0.35, this.flashT * 2);
    rect(x, 0, 0, w, h, this.flashC);
    x.globalAlpha = 1;
  }
}

// ---------- text ----------
export function outlinedText(x: Ctx, s: string, px: number, py: number, c: string, ink = INK): void {
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [1, 1],
  ])
    text(x, s, px + dx, py + dy, ink);
  text(x, s, px, py, c);
}

// Big pixel text: the 3x5 font scaled up, centered on cx, with an ink drop shadow.
export function bigText(x: Ctx, s: string, cx: number, cy: number, scale: number, c: string, ink = INK): void {
  const w = textWidth(s) * scale;
  const px = Math.round(cx - w / 2);
  const py = Math.round(cy - (5 * scale) / 2);
  x.save();
  x.translate(px, py);
  x.scale(scale, scale);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [1, 1],
  ]) {
    x.save();
    x.translate(dx / scale, dy / scale);
    text(x, s, 0, 0, ink);
    x.restore();
  }
  text(x, s, 1 / scale, 1 / scale, ink);
  text(x, s, 0, 0, c);
  x.restore();
}

// ---------- touch controls ----------
export function PadBtn({ input, k, label, cls = '', aria }: { input: Input; k: Key; label: ReactNode; cls?: string; aria?: string }) {
  return (
    <button
      type="button"
      className={`tp-btn drive-btn ${cls}`}
      aria-label={aria ?? k}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        input.press(k);
      }}
      onPointerUp={() => input.release(k)}
      onPointerCancel={() => input.release(k)}
      onLostPointerCapture={() => input.release(k)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

// ---------- start overlay ----------
// Shown over the canvas: a few lines of how-to plus the 3-2-1-GO count. t = seconds since start.
export const COUNT_TIME = 3.6;
export function StartOverlay({ t, title, lines }: { t: number; title: string; lines: ReactNode[] }) {
  if (t >= COUNT_TIME + 0.5) return null;
  const n = t < 1 ? '3' : t < 2 ? '2' : t < 3 ? '1' : 'GO!';
  const fading = t >= COUNT_TIME;
  return (
    <div className={`drive-overlay ${fading ? 'fade' : ''}`} aria-live="polite">
      {t < 3 && (
        <div className="drive-howto">
          <b>{title}</b>
          <ul>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      <div key={n} className={`drive-count ${n === 'GO!' ? 'go' : ''}`}>
        {n}
      </div>
    </div>
  );
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const smooth = (t: number): number => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

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

// ---------- HD vehicles ----------
// Smooth-shaded, glossy top-down cars built from the same patterns (so sizes and proportions match the
// collision boxes): a lacquered body lit from the top-left, tinted glass with a sky reflection, a
// highlighted roof, rubber tyres, real light glows. Drawn at any angle (no rotation snapping).
interface Bands {
  w: number; // body width (without wheel columns)
  h: number;
  glass: [number, number][]; // [y0, y1] row ranges of glass
  roof: [number, number] | null;
  cargo: [number, number] | null;
  wheels: number[]; // wheel rows
  bar: number; // police light bar row (-1 none)
  sign: [number, number] | null; // taxi sign rows
}
const BANDS = new Map<string, Bands>();
function bandsOf(kind: Exclude<VehicleKind, 'bike'>): Bands {
  const hit = BANDS.get(kind);
  if (hit) return hit;
  const pat = PATTERNS[kind];
  const W = pat[0].length;
  const b: Bands = { w: W - 2, h: pat.length, glass: [], roof: null, cargo: null, wheels: [], bar: -1, sign: null };
  let gStart = -1;
  pat.forEach((row, j) => {
    const has = (c: string) => row.includes(c);
    if (row.includes('w')) b.wheels.push(j);
    const isGlass = /g{3,}|gG/.test(row);
    if (isGlass && gStart < 0) gStart = j;
    if (!isGlass && gStart >= 0) {
      b.glass.push([gStart, j]);
      gStart = -1;
    }
    if (has('R')) b.roof = b.roof ? [b.roof[0], j + 1] : [j, j + 1];
    if (has('W')) b.cargo = b.cargo ? [b.cargo[0], j + 1] : [j, j + 1];
    if (has('x')) b.bar = j;
    if (has('Y')) b.sign = b.sign ? [b.sign[0], j + 1] : [j, j + 1];
  });
  if (gStart >= 0) b.glass.push([gStart, pat.length]);
  BANDS.set(kind, b);
  return b;
}

function rr(x: Ctx, px: number, py: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  x.beginPath();
  x.moveTo(px + k, py);
  x.arcTo(px + w, py, px + w, py + h, k);
  x.arcTo(px + w, py + h, px, py + h, k);
  x.arcTo(px, py + h, px, py, k);
  x.arcTo(px, py, px + w, py, k);
  x.closePath();
}
function lightGlow(x: Ctx, cx: number, cy: number, r: number, rgb: string, a: number): void {
  const prev = x.globalCompositeOperation;
  x.globalCompositeOperation = 'lighter';
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
  g.addColorStop(0.4, `rgba(${rgb},${(a * 0.4).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = prev;
}
function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function tint(c: string, k: number): string {
  const [r, g, b] = hex(c);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Headlight beams (additive), for dusk/night scenes. Call before drawVehicle so the car sits on top.
export function drawHeadlights(x: Ctx, l: VehicleLook, cx: number, cy: number, ang: number, power: number, len = 34): void {
  if (power <= 0) return;
  const h = vehicleSize(l.kind).h;
  const w = l.kind === 'bike' ? 4 : vehicleSize(l.kind).w;
  x.save();
  x.translate(cx, cy);
  x.rotate(ang);
  x.globalCompositeOperation = 'lighter';
  const fy = -h / 2;
  for (const sx of l.kind === 'bike' ? [0] : [-w / 2 + 1.6, w / 2 - 1.6]) {
    const g = x.createRadialGradient(sx, fy, 0, sx, fy, len);
    g.addColorStop(0, `rgba(255,236,170,${(0.55 * power).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(255,226,150,${(0.2 * power).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,220,140,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(sx - 1, fy);
    x.lineTo(sx - len * 0.42, fy - len);
    x.quadraticCurveTo(sx, fy - len * 1.12, sx + len * 0.42, fy - len);
    x.lineTo(sx + 1, fy);
    x.closePath();
    x.fill();
  }
  x.restore();
}

function drawBikeHd(x: Ctx, l: VehicleLook): void {
  const shirt = l.shirt ?? '#3f7fd8';
  const hair = (l.heads ?? ['#2a1b12'])[0];
  const bag = l.bag ?? '#e0503c';
  // tyres
  x.fillStyle = '#16121e';
  rr(x, -0.9, -6, 1.8, 3.6, 0.9);
  x.fill();
  rr(x, -0.9, 2.6, 1.8, 3.6, 0.9);
  x.fill();
  // handlebar
  x.strokeStyle = '#9a9aac';
  x.lineWidth = 0.7;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(-2.6, -3.6);
  x.lineTo(2.6, -3.6);
  x.stroke();
  x.lineCap = 'butt';
  // delivery box
  const bg = x.createLinearGradient(-2.6, 0, 2.6, 0);
  bg.addColorStop(0, tint(bag, 0.35));
  bg.addColorStop(0.5, bag);
  bg.addColorStop(1, tint(bag, -0.45));
  rr(x, -2.6, 0.8, 5.2, 3.8, 0.8);
  x.fillStyle = bg;
  x.fill();
  x.strokeStyle = 'rgba(16,10,24,0.7)';
  x.lineWidth = 0.4;
  x.stroke();
  // shoulders + head
  const sg = x.createRadialGradient(-0.8, -1.8, 0.2, 0, -1, 3);
  sg.addColorStop(0, tint(shirt, 0.4));
  sg.addColorStop(0.6, shirt);
  sg.addColorStop(1, tint(shirt, -0.5));
  x.fillStyle = sg;
  x.beginPath();
  x.ellipse(0, -1, 2.7, 1.8, 0, 0, Math.PI * 2);
  x.fill();
  const hg = x.createRadialGradient(-0.5, -2.4, 0.1, 0, -1.8, 1.7);
  hg.addColorStop(0, tint(hair, 0.45));
  hg.addColorStop(1, tint(hair, -0.3));
  x.fillStyle = hg;
  x.beginPath();
  x.arc(0, -1.8, 1.5, 0, Math.PI * 2);
  x.fill();
}

function drawCarHd(x: Ctx, l: VehicleLook, o: LightsOpts): void {
  const b = bandsOf(l.kind as Exclude<VehicleKind, 'bike'>);
  const w = b.w;
  const h = b.h;
  const ox = -w / 2;
  const oy = -h / 2;
  const body = l.body;
  // tyres peeking out at the wheel rows
  x.fillStyle = '#121018';
  const wr: number[][] = [];
  for (const j of b.wheels) {
    const last = wr[wr.length - 1];
    if (last && last[1] === j) last[1] = j + 1;
    else wr.push([j, j + 1]);
  }
  for (const [j0, j1] of wr) {
    rr(x, ox - 0.9, oy + j0 - 0.2, 1.8, j1 - j0 + 0.4, 0.7);
    x.fill();
    rr(x, ox + w - 0.9, oy + j0 - 0.2, 1.8, j1 - j0 + 0.4, 0.7);
    x.fill();
  }
  // lacquered body: cross gradient (lit left), plus a long-axis sheen
  const bodyCol = l.kind === 'truck' ? body : body;
  rr(x, ox, oy, w, h, Math.min(3, w * 0.32));
  const g = x.createLinearGradient(ox, 0, ox + w, 0);
  g.addColorStop(0, tint(bodyCol, 0.32));
  g.addColorStop(0.28, tint(bodyCol, 0.08));
  g.addColorStop(0.62, bodyCol);
  g.addColorStop(1, tint(bodyCol, -0.48));
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = 'rgba(14,8,22,0.85)';
  x.lineWidth = 0.55;
  x.stroke();
  const sheen = x.createLinearGradient(0, oy, 0, oy + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
  sheen.addColorStop(0.25, 'rgba(255,255,255,0.04)');
  sheen.addColorStop(0.75, 'rgba(0,0,0,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  x.fillStyle = sheen;
  rr(x, ox, oy, w, h, Math.min(3, w * 0.32));
  x.fill();
  // cargo box (truck)
  if (b.cargo) {
    const [c0, c1] = b.cargo;
    const cg = x.createLinearGradient(ox, 0, ox + w, 0);
    cg.addColorStop(0, '#fbf9f2');
    cg.addColorStop(0.6, '#e4e0d6');
    cg.addColorStop(1, '#a8a296');
    rr(x, ox + 0.4, oy + c0, w - 0.8, c1 - c0, 0.8);
    x.fillStyle = cg;
    x.fill();
    x.strokeStyle = 'rgba(14,8,22,0.7)';
    x.lineWidth = 0.45;
    x.stroke();
    x.strokeStyle = 'rgba(120,112,100,0.45)';
    x.lineWidth = 0.35;
    for (let yy = oy + c0 + 2; yy < oy + c1 - 1; yy += 2) {
      x.beginPath();
      x.moveTo(ox + 1.2, yy);
      x.lineTo(ox + w - 1.2, yy);
      x.stroke();
    }
  }
  // glass: dark tint with a diagonal sky reflection
  b.glass.forEach(([g0, g1], k) => {
    const front = k === 0;
    const inset = 0.9;
    const gx0 = ox + inset;
    const gw = w - inset * 2;
    const gy = oy + g0 - (front ? 0.6 : 0.2);
    const gh = g1 - g0 + (front ? 0.8 : 0.5);
    x.beginPath();
    const taper = front ? 0.9 : -0.6;
    x.moveTo(gx0 + Math.max(0, taper), gy);
    x.lineTo(gx0 + gw - Math.max(0, taper), gy);
    x.lineTo(gx0 + gw - Math.max(0, -taper), gy + gh);
    x.lineTo(gx0 + Math.max(0, -taper), gy + gh);
    x.closePath();
    const gg = x.createLinearGradient(gx0, gy, gx0 + gw, gy + gh);
    gg.addColorStop(0, '#86aed8');
    gg.addColorStop(0.3, '#2c4264');
    gg.addColorStop(1, '#0c1222');
    x.fillStyle = gg;
    x.fill();
    // reflection streak
    x.save();
    x.clip();
    x.strokeStyle = 'rgba(235,248,255,0.55)';
    x.lineWidth = 0.7;
    x.beginPath();
    x.moveTo(gx0 + gw * 0.25, gy + gh + 0.5);
    x.lineTo(gx0 + gw * 0.55, gy - 0.5);
    x.stroke();
    x.restore();
  });
  // heads through the windshield
  if (b.glass.length) {
    const [g0] = b.glass[0];
    (l.heads ?? []).forEach((hc, k) => {
      const hx = k === 0 ? ox + w * 0.32 : ox + w * 0.7;
      const hy = oy + g0 + 1.6;
      const hg = x.createRadialGradient(hx - 0.4, hy - 0.4, 0.1, hx, hy, 1.3);
      hg.addColorStop(0, tint(hc, 0.45));
      hg.addColorStop(1, tint(hc, -0.35));
      x.fillStyle = hg;
      x.beginPath();
      x.arc(hx, hy, 1.15, 0, Math.PI * 2);
      x.fill();
    });
  }
  // roof panel with a soft specular hotspot
  if (b.roof) {
    const [r0, r1] = b.roof;
    rr(x, ox + 1, oy + r0, w - 2, r1 - r0, 1.4);
    const rg = x.createRadialGradient(ox + w * 0.35, oy + r0 + 1, 0.2, ox + w * 0.5, oy + (r0 + r1) / 2, (r1 - r0) * 0.9);
    rg.addColorStop(0, tint(body, 0.55));
    rg.addColorStop(0.35, tint(body, 0.14));
    rg.addColorStop(1, tint(body, -0.25));
    x.fillStyle = rg;
    x.fill();
  }
  if (b.sign) {
    const [s0, s1] = b.sign;
    const sg = x.createLinearGradient(0, oy + s0, 0, oy + s1);
    sg.addColorStop(0, '#fff2a0');
    sg.addColorStop(1, l.bag ?? '#e0b830');
    rr(x, ox + w * 0.3, oy + s0, w * 0.4, s1 - s0, 0.6);
    x.fillStyle = sg;
    x.fill();
    x.strokeStyle = 'rgba(14,8,22,0.7)';
    x.lineWidth = 0.35;
    x.stroke();
  }
  if (l.kind === 'police') {
    // white doors + light bar
    const by = oy + b.bar;
    const on = Math.floor((o.t ?? 0) * 8) % 2 === 0;
    rr(x, ox + 1, by, w / 2 - 1, 1, 0.5);
    x.fillStyle = o.siren && on ? '#ff6a5a' : '#c02a26';
    x.fill();
    rr(x, ox + w / 2, by, w / 2 - 1, 1, 0.5);
    x.fillStyle = o.siren && !on ? '#7ab0ff' : '#2a5ad8';
    x.fill();
    if (o.siren) lightGlow(x, on ? ox + w * 0.3 : ox + w * 0.7, by + 0.5, 10, on ? '255,70,60' : '70,130,255', 0.75);
  }
  // headlights + taillights (always visible as lenses)
  for (const sx of [ox + 1.8, ox + w - 1.8]) {
    x.fillStyle = '#fff8d8';
    x.beginPath();
    x.ellipse(sx, oy + 0.9, 1.0, 0.55, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = o.brake ? '#ff5a48' : '#a8281f';
    x.beginPath();
    x.ellipse(sx, oy + h - 0.8, 1.0, 0.5, 0, 0, Math.PI * 2);
    x.fill();
  }
  if (o.brake) for (const sx of [ox + 1.8, ox + w - 1.8]) lightGlow(x, sx, oy + h - 0.4, 5, '255,60,40', 0.6);
  if (o.reverse) for (const sx of [ox + 3, ox + w - 3]) lightGlow(x, sx, oy + h - 0.4, 3.5, '255,255,255', 0.6);
  const sides: number[] = o.hazard ? [-1, 1] : o.blink ? [o.blink] : [];
  if (o.blinkOn && sides.length)
    for (const sd of sides) {
      const bx = sd < 0 ? ox + 0.6 : ox + w - 0.6;
      x.fillStyle = '#ffc040';
      x.beginPath();
      x.arc(bx, oy + 1.4, 0.8, 0, Math.PI * 2);
      x.arc(bx, oy + h - 1.6, 0.8, 0, Math.PI * 2);
      x.fill();
      lightGlow(x, bx, oy + 1.4, 4.5, '255,180,40', 0.7);
      lightGlow(x, bx, oy + h - 1.6, 4.5, '255,180,40', 0.7);
    }
}

// Draw a vehicle centered at (cx, cy), rotated by ang radians (0 = nose up, + = clockwise).
// `hd` draws the smooth-shaded version (for HD canvases); otherwise the original pixel sprite.
export function drawVehicle(x: Ctx, l: VehicleLook, cx: number, cy: number, ang = 0, o: LightsOpts & { hd?: boolean } = {}): void {
  if (o.hd) {
    const sz = vehicleSize(l.kind);
    // soft ground shadow, cast down-right (not rotated with the car's light)
    const ca = Math.abs(Math.cos(ang));
    const sa = Math.abs(Math.sin(ang));
    const rx = (sz.w * ca + sz.h * sa) * 0.62 + 1;
    const ry = (sz.h * ca + sz.w * sa) * 0.58 + 1;
    x.save();
    x.translate(cx + 1.2, cy + 1.8);
    x.scale(1, ry / rx);
    const sg = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    sg.addColorStop(0, 'rgba(10,6,20,0.5)');
    sg.addColorStop(0.65, 'rgba(10,6,20,0.3)');
    sg.addColorStop(1, 'rgba(10,6,20,0)');
    x.fillStyle = sg;
    x.beginPath();
    x.arc(0, 0, rx, 0, Math.PI * 2);
    x.fill();
    x.restore();
    x.save();
    x.translate(cx, cy);
    if (ang) x.rotate(ang);
    if (l.kind === 'bike') drawBikeHd(x, l);
    else drawCarHd(x, l, o);
    x.restore();
    return;
  }
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

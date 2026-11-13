// Chasing threats: per-frame pixel shader band at the front + sprite overlays.
// Animation is driven by t alone so slow fronts still churn.
import { VIEW_H, VIEW_W, type ThreatKind } from '../types.ts';
import { bayer, Buf, ctx2d, hash2, hex, hexes, makeCanvas, mulberry32, pack, smooth, tn } from './px.ts';
import { rock } from './paint.ts';

const LEAD = 80; // px shaded ahead of the front (glow, tongues)
const BAND = 200; // px shaded behind; further left tiles the band

type Shader = (x: number, y: number, d: number) => number;

const P = (h: string, a = 1): number => pack(hex(h), a * 255);
function rampP(stops: string[], a = 1): Uint32Array {
  return Uint32Array.from(stops.map((s) => P(s, a)));
}
function pick(r: Uint32Array, v: number, x: number, y: number): number {
  const n = r.length - 1;
  let i = Math.floor(v * n + bayer(x, y));
  if (i < 0) i = 0; else if (i > n) i = n;
  return r[i];
}

const withA = (col: number, a: number): number => (a <= 0.02 ? 0 : ((col & 0xffffff) | (Math.round(Math.min(1, a) * 255) << 24)) >>> 0);

let buf: Buf | null = null;
let bufC: HTMLCanvasElement | null = null;

function band(ctx: CanvasRenderingContext2D, fx: number, sh: Shader, lead = LEAD): void {
  const x0 = Math.max(0, Math.floor(fx - BAND)), x1 = Math.min(VIEW_W, Math.ceil(fx + lead));
  if (x1 <= x0) return;
  if (!buf) { buf = new Buf(VIEW_W, VIEW_H); bufC = makeCanvas(VIEW_W, VIEW_H); }
  const W = buf.w, px = buf.px;
  for (let y = 0; y < VIEW_H; y++) {
    const row = y * W;
    for (let x = x0; x < x1; x++) px[row + x] = sh(x, y, fx - x);
  }
  const bc = bufC!;
  const bx = ctx2d(bc);
  bx.putImageData(buf.img, 0, 0, x0, 0, x1 - x0, VIEW_H);
  ctx.drawImage(bc, x0, 0, x1 - x0, VIEW_H, x0, 0, x1 - x0, VIEW_H);
  // deep body: tile the band's back 96px
  if (x0 > 0) {
    const tw = Math.min(96, x1 - x0);
    for (let dx = x0 - tw; dx > -tw; dx -= tw) ctx.drawImage(bc, x0, 0, tw, VIEW_H, dx, 0, tw, VIEW_H);
  }
}

const h1 = (i: number, k: number) => hash2(i, k, 9137);
function rect(ctx: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
// Soft glow ahead of the front, strongest near the front's height.
let GFY = 0;
function glowAhead(d: number, _x: number, y: number, col: number, reach: number, k: number): number {
  if (d >= 0 || d < -reach) return 0;
  const f = 1 + d / reach;
  const v = (y - GFY) / 90;
  const a = f * f * k * Math.exp(-v * v) * ((col >>> 24) / 255);
  return a < 0.02 ? 0 : ((col & 0xffffff) | (Math.round(Math.min(1, a) * 255) << 24)) >>> 0;
}

// ---------- sprite caches ----------
const rockCache = new Map<string, HTMLCanvasElement[]>();
function rocks(key: string, pal: string[], outline: string): HTMLCanvasElement[] {
  let r = rockCache.get(key);
  if (!r) {
    r = [];
    const rnd = mulberry32(key.length * 977 + 13);
    for (let i = 0; i < 8; i++) {
      const rad = 2 + (i % 4) * 2 + rnd() * 1.5;
      const b = new Buf(rad * 2 + 6, rad * 2 + 6);
      rock(b, rad + 3, rad + 3, rad, rnd, hexes(...pal), 0.6, -0.7, hex(outline));
      r.push(b.canvas());
    }
    rockCache.set(key, r);
  }
  return r;
}
function blitC(ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number, flip: boolean): void {
  const X = Math.round(x - c.width / 2), Y = Math.round(y - c.height / 2);
  if (!flip) { ctx.drawImage(c, X, Y); return; }
  ctx.save();
  ctx.translate(X + c.width, Y);
  ctx.scale(-1, 1);
  ctx.drawImage(c, 0, 0);
  ctx.restore();
}

// ---------- palettes ----------
const FIRE = rampP(['#5a0c0c', '#a3170f', '#e3401a', '#ff7a1a', '#ffb52e', '#ffe27a', '#fff6d0']);
const SMOKE = rampP(['#120c12', '#22181e', '#34262a', '#4c3a36']);
const EMBER_GLOW = P('#ff7a2a');
const DUST = rampP(['#121218', '#24242e', '#3c3c48', '#5e5e6c', '#8a8a98']);
const VOID = rampP(['#020205', '#06060c', '#0c0c16']);
const ASH = rampP(['#0e0610', '#1e0a16', '#34101c', '#521a1c', '#7a2a1a']);
const RED_GLOW = P('#ff4a2a');
const DSTORM = rampP(['#3a140c', '#5e2412', '#8a3a1a', '#b85a2a', '#dc8a4a', '#f4b878']);
const WATER = rampP(['#020814', '#061430', '#0a2048', '#123064']);
const MIST = rampP(['#3a5a88', '#6a8cbc', '#a8cbec', '#dcefff']);
const SKIN = rampP(['#1a0a24', '#34163e', '#521f5c', '#73307a', '#9a4e96', '#c47ab8']);
const AIR = rampP(['#3a6a9a', '#6a9cc8', '#a8d4f0', '#dff2ff', '#ffffff']);
const CLOUD = rampP(['#0a0716', '#16102a', '#251c40', '#3a2e5c', '#584a84', '#8a7ab8']);
const MACH = rampP(['#0c0a12', '#16131e', '#211c2c', '#2e2838']);
const TAIL = rampP(['#06102a', '#0e2a5a', '#1e5aa0', '#4a9ae0', '#a8e0ff', '#ffffff']);
const VOIDR = rampP(['#000000', '#0a0420', '#1c0a3c', '#341260', '#5a1e8a']);
const NOVA = rampP(['#1a0630', '#4a1050', '#8a1a60', '#d03a6a', '#ff7a50', '#ffb860', '#fff0c0']);

// ---------- kinds ----------
function fuelFire(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  band(ctx, fx, (x, y, d) => {
    const fl = (tn(y * 2.3, t * 55) - 0.5) * 18 * (1 + c * 0.6) + (tn(y * 0.6 + 40, t * 22) - 0.5) * 22;
    const dd = d + fl + c * 6;
    const sy = fy - 46 - c * 24 - tn(x * 0.9 + t * 5, 77) * 50;
    if (y < sy) {
      if (dd < 0) return glowAhead(dd, x, y, EMBER_GLOW, 50, 0.15 + c * 0.25);
      const v = tn(x * 1.1 + t * 9, y * 1.1 + t * 32);
      if (bayer(x, y) > smooth(0, 22, dd + (v - 0.5) * 20)) return 0;
      const under = smooth(sy - 30, sy, y);
      return under * (0.6 + v * 0.6) > 0.55 + bayer(x + 2, y) * 0.4 ? pick(FIRE, 0.12 + v * 0.25, x, y) : pick(SMOKE, v * 1.1, x, y);
    }
    const n = tn(x * 2.2, y * 2.2 + t * 110), n2 = tn(x * 0.9 + 30, y * 0.9 + t * 50);
    if (dd < 0) {
      const tongue = (n - 0.3) * 1.5 + dd / 16;
      if (tongue > 0.12) return pick(FIRE, tongue * 0.7, x, y);
      return glowAhead(dd, x, y, EMBER_GLOW, 60, 0.25 + c * 0.45);
    }
    const heat = smooth(-2, 26, dd) * (0.5 + (n - 0.5) * 1.1 + (n2 - 0.5) * 0.8) + smooth(fy - 12, fy + 8, y) * 0.3 * Math.exp(-dd / 70) + Math.exp(-dd / 9) * 0.3 - smooth(40, 220, dd) * 0.22;
    if (heat < 0.14) return dd > 8 ? pick(SMOKE, n2, x, y) : 0;
    return pick(FIRE, heat, x, y);
  });
  // embers
  const N = 14 + Math.round(c * 26);
  for (let i = 0; i < N; i++) {
    const life = (t * (0.45 + h1(i, 0) * 0.4) + h1(i, 1)) % 1;
    const x = fx - h1(i, 2) * 110 + life * (30 + h1(i, 3) * 70);
    const y = fy + 6 - life * (110 + h1(i, 4) * 90) + Math.sin(t * 5 + i) * 3;
    if (x > fx + 50) continue;
    rect(ctx, life < 0.3 ? '#fff2b0' : life < 0.65 ? '#ffb52e' : '#e3401a', x, y, h1(i, 5) < 0.25 ? 2 : 1, 1);
  }
}

function moonquake(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  const shake = (hash2(Math.floor(t * 20), 1, 5) - 0.5) * (1 + c * 3);
  band(ctx, fx + shake, (x, y, d) => {
    const dd = d + (tn(y * 1.7, t * 26) - 0.5) * 12;
    if (y > fy + 1) {
      if (dd < 0) return 0;
      const v = tn(x * 1.3 + t * 6, y * 1.3 + t * 14);
      return v > 0.6 ? pick(DUST, (v - 0.6) * 2.5, x, y) : pick(VOID, (y - fy) / 120, x, y);
    }
    const v = tn(x * 1.1 + t * 8, y * 1.1 - t * 22);
    if (dd < 0) return 0;
    const tall = 0.25 + 0.75 * Math.exp(-(fy - y) / (60 + c * 60));
    const a = smooth(0, 30, dd + (v - 0.5) * 30) * Math.min(1, tall * (0.7 + v * 0.8));
    return withA(pick(DUST, v * 0.8 + smooth(fy - 120, fy, y) * 0.25, x, y), a);
  }, 4);
  const R = rocks('moon', ['#2a2a34', '#55556a', '#8a8a9a', '#c4c4d0'], '#121218');
  // chunks breaking off the lip and tumbling into the chasm
  const N = 16 + Math.round(c * 18);
  for (let i = 0; i < N; i++) {
    const ph = (t * (0.35 + c * 0.35) * (0.7 + h1(i, 0) * 0.6) + h1(i, 1)) % 1;
    const x0 = fx - 2 - h1(i, 2) * 70 - (i % 3 === 0 ? 0 : 20);
    const y = fy + 2 + ph * ph * 230 + (ph < 0.08 ? Math.sin(t * 60 + i) : 0);
    const x = x0 - ph * 14 * h1(i, 3);
    if (y > VIEW_H + 8) continue;
    blitC(ctx, R[(i + Math.floor(ph * 6)) % R.length], x, y, Math.floor(ph * 8 + i) % 2 === 0);
  }
  // cracks racing ahead of the front
  const reach = 10 + c * 34 + Math.sin(t * 7) * 3;
  for (let k = 0; k < 2; k++) {
    let y = fy + 1 + k * 3;
    for (let x = 0; x < reach; x++) {
      if (hash2(x >> 2, k, Math.floor(t * 4)) < 0.3) y += hash2(x, k, 3) < 0.5 ? -1 : 1;
      y = Math.max(fy, Math.min(fy + 8, y));
      rect(ctx, '#0a0a10', fx + x + shake, y);
      if (x % 5 === 0) rect(ctx, '#d4d4de', fx + x + shake, y - 1);
    }
  }
  // dust puffs at the lip
  for (let i = 0; i < 5; i++) {
    const life = (t * 0.8 + i / 5) % 1;
    const r = 1 + Math.round(life * 4);
    ctx.globalAlpha = 0.6 * (1 - life);
    rect(ctx, '#8a8a98', fx - 6 + i * 2 - r, fy - life * 18 - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
}

function meteors(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  band(ctx, fx, (x, y, d) => {
    const dd = d + (tn(y * 1.4, t * 18) - 0.5) * 22;
    if (dd < 0) return glowAhead(dd, x, y, RED_GLOW, 70, 0.2 + c * 0.4);
    const v = tn(x * 0.7 + t * 6, y * 0.7 - t * 12);
    if (dd < 3) return bayer(x, y) < 0.7 ? P('#ff8a3a') : P('#ffd070');
    if (bayer(x, y) > smooth(0, 16, dd) + 0.2) return 0;
    return pick(ASH, v * 0.7 + Math.exp(-dd / 10) * 0.7 + smooth(fy - 30, fy + 30, y) * 0.15, x, y);
  });
  const N = 8 + Math.round(c * 10);
  for (let i = 0; i < N; i++) {
    const per = 1.0 + h1(i, 0) * 0.9;
    const k = Math.floor((t + h1(i, 1) * 5) / per);
    const ph = ((t + h1(i, 1) * 5) / per) % 1;
    const vx = 70 + hash2(i, k, 2) * 50, vy = 190 + hash2(i, k, 3) * 90;
    const yEnd = fy + 4 + hash2(i, k, 4) * 30;
    const flight = (yEnd + 30) / vy;
    const tt = ph * per;
    const xEnd = fx - 6 - hash2(i, k, 5) * 170 * (1 - c * 0.4);
    const x0 = xEnd - vx * flight;
    if (tt < flight) {
      const x = x0 + vx * tt, y = -30 + vy * tt;
      const ux = vx / Math.hypot(vx, vy), uy = vy / Math.hypot(vx, vy);
      const L = 26 + (i % 3) * 6;
      for (let s = L; s >= 0; s--) {
        const u = s / L;
        const col = u < 0.12 ? '#fff6d0' : u < 0.35 ? '#ffc63a' : u < 0.65 ? '#ff7a1a' : '#a3170f';
        const w = u < 0.3 ? 3 : u < 0.6 ? 2 : 1;
        ctx.globalAlpha = 1 - u * 0.85;
        rect(ctx, col, x - ux * s - (w >> 1), y - uy * s, w, 1);
      }
      ctx.globalAlpha = 0.35;
      rect(ctx, '#ffb52e', x - 4, y - 4, 9, 9);
      ctx.globalAlpha = 1;
      rect(ctx, '#2a1210', x - 2, y - 2, 5, 5);
      rect(ctx, '#5a2a1a', x - 1, y - 2, 3, 2);
      rect(ctx, '#ffe27a', x + 2, y, 1, 3);
      rect(ctx, '#ffe27a', x, y + 2, 3, 1);
    } else if (tt < flight + 0.35) {
      const u = (tt - flight) / 0.35;
      const r = 3 + u * 12;
      ctx.globalAlpha = 1 - u * 0.8;
      for (let j = -r; j <= 0; j++) {
        const w = Math.sqrt(r * r - j * j);
        rect(ctx, j > -r * 0.4 ? '#ffe27a' : '#ff7a1a', xEnd - w, yEnd + j, w * 2 + 1, 1);
      }
      ctx.globalAlpha = 1;
      for (let q = 0; q < 7; q++) {
        const a = Math.PI + (q / 6) * Math.PI;
        rect(ctx, q % 2 ? '#ffb52e' : '#5a2a1a', xEnd + Math.cos(a) * r * 1.4, yEnd + Math.sin(a) * r * 1.2 + u * u * 20, 2, 2);
      }
    }
  }
}

function dustStorm(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  band(ctx, fx, (x, y, d) => {
    const wob = (tn(y * 0.8 + t * 14, t * 9) - 0.5) * 34 + Math.sin(y * 0.045 + t * 1.7) * 10;
    const dd = d + wob + c * 6;
    if (dd < 0) {
      const st = tn(x * 0.25 - t * 120, y * 3);
      if (st > 0.66 && dd > -70 * (0.35 + c)) return bayer(x, y) < 0.6 ? pick(DSTORM, 0.6 + st * 0.4, x, y) : 0;
      return 0;
    }
    const warp = tn(x * 0.6 + t * 12, y * 0.6) * 50;
    const v = tn(x + warp - t * 38, y + t * 7);
    if (bayer(x, y) > smooth(0, 18, dd)) return 0;
    return pick(DSTORM, v * 0.9 - smooth(30, 200, dd) * 0.25 + 0.12 - smooth(fy - 20, fy + 60, y) * 0.15, x, y);
  });
  const N = 22 + Math.round(c * 30);
  for (let i = 0; i < N; i++) {
    const sp = (150 + h1(i, 0) * 150) * (0.7 + c * 0.6);
    const x = fx - 140 + ((t * sp + h1(i, 1) * 400) % (200 + c * 60));
    const y = 10 + h1(i, 2) * (VIEW_H - 20) + Math.sin(t * 4 + i) * 4;
    if (x > fx + 20 + c * 50) continue;
    const big = h1(i, 3) < 0.25;
    rect(ctx, big ? '#5e2412' : '#f4b878', x, y, big ? 2 : 4, big ? 2 : 1);
  }
}

function iceCrack(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  band(ctx, fx, (x, y, d) => {
    if (y > fy + 2) {
      const dd = d + (tn(y * 3, t * 8) - 0.5) * 8;
      if (dd < 0) return 0;
      const rip = Math.sin(x * 0.25 - t * 3 + tn(x * 1.5, y * 3) * 6 + y * 0.9);
      if (rip > 0.88) return P('#4a7ab8');
      return pick(WATER, 1 - (y - fy) / 90, x, y);
    }
    const v = tn(x * 0.8 - t * 7, y * 0.8 + t * 3);
    const dd = d + (v - 0.5) * 34 + (tn(y * 1.5, t * 12) - 0.5) * 10;
    if (dd < 0) return glowAhead(dd, x, y, P('#cfe8ff'), 40, 0.12 + c * 0.25);
    const tall = 0.2 + 0.8 * Math.exp(-(fy - y) / (50 + c * 40));
    const a = smooth(0, 40, dd) * Math.min(1, tall * (0.6 + v));
    return withA(pick(MIST, v * 0.8 + smooth(fy - 60, fy, y) * 0.3, x, y), a);
  });
  // tilting ice slabs bobbing and sinking
  const N = 7 + Math.round(c * 5);
  for (let i = 0; i < N; i++) {
    const back = i * 15 + h1(i, 0) * 8;
    const cx = fx - 8 - back, sink = Math.max(0, back - 20) * 0.12;
    const ang = (h1(i, 1) - 0.5) * 0.9 + Math.sin(t * 2 + i) * 0.15 + (i === 0 ? Math.sin(t * 9) * 0.1 * (1 + c) : 0);
    const w = 10 + h1(i, 2) * 12, hgt = 4;
    const cy = fy + 2 + sink + Math.sin(t * 1.7 + i * 2) * 1.2;
    if (cx < -20) break;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let j = 0; j < hgt; j++)
      for (let k = 0; k < w; k++) {
        const lx = k - w / 2, ly = j - hgt / 2;
        const X = cx + lx * ca - ly * sa, Y = cy + lx * sa + ly * ca;
        if (Y > fy + 3 + sink * 0.5 + 2 && j > 0) continue;
        rect(ctx, j === 0 ? '#ffffff' : j === hgt - 1 ? '#6a9ad0' : '#c8e4fa', X, Y);
      }
  }
  // shattered ice spikes jutting up at the break
  for (let i = 0; i < 6; i++) {
    const x = fx - 3 - i * 7 - h1(i, 20) * 4;
    const hgt = (6 + h1(i, 21) * 14) * (1 - i * 0.12) * (0.8 + 0.2 * Math.sin(t * 6 + i));
    const lean = (h1(i, 22) - 0.6) * 0.6;
    for (let k = 0; k < hgt; k++) {
      const w = Math.max(1, Math.round((1 - k / hgt) * 3));
      rect(ctx, '#14244a', x + lean * k - 1, fy + 2 - k, w + 2, 1);
      rect(ctx, k > hgt * 0.6 ? '#ffffff' : '#bfe0ff', x + lean * k, fy + 2 - k, w, 1);
    }
  }
  // cracks racing ahead along the ice surface
  const reach = 14 + c * 46 + (Math.sin(t * 5) + 1) * 3;
  let y = fy;
  for (let x = 0; x < reach; x++) {
    if (hash2(x >> 2, 7, 1) < 0.35) y = fy + (hash2(x, 8, 1) < 0.5 ? 0 : 1);
    rect(ctx, '#ffffff', fx + x, y);
    if (x % 9 === 4) { rect(ctx, '#bfe0ff', fx + x + 1, y - 1); rect(ctx, '#bfe0ff', fx + x + 2, y - 2); }
  }
  // splashes
  for (let i = 0; i < 6; i++) {
    const life = (t * 1.3 + i / 6) % 1;
    const x = fx - 4 - i * 6 + life * 4, yy = fy + 1 - Math.sin(life * Math.PI) * (8 + i);
    rect(ctx, life < 0.5 ? '#ffffff' : '#8ab8e8', x, yy);
  }
}

function slug(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  const breathe = Math.sin(t * 2.2) * 2;
  const hx = fx - 36, hy = fy - 24, rx = 36 + breathe * 0.5, ry = 40;
  const edge = (y: number): number => {
    const dy = (y - hy) / ry;
    if (Math.abs(dy) < 1) return hx + rx * Math.sqrt(1 - dy * dy);
    return hx - 8 - (Math.abs(y - hy) - ry) * 0.5;
  };
  band(ctx, fx + 2, (x, y) => {
    const e = edge(y) + Math.sin(y * 0.12 + t * 3) * 1.2;
    const d = e - x;
    if (d < 0) {
      // slime sheen on the ground ahead
      if (y >= fy && y <= fy + 1 && -d < 8 + c * 16) return P(y === fy ? '#b8ff8a' : '#5aa04a', 0.85);
      return 0;
    }
    if (d < 1) return P('#12061a');
    const ring = Math.sin((x - fx) * 0.17 + t * 2.4 + Math.sin(y * 0.05) * 1.5);
    const sn = tn((x - fx) * 3 + 11, y * 3 + 40);
    const spot = sn > 0.71 ? (sn > 0.74 ? 2 : 1) : 0;
    const rim = Math.exp(-d / 7) * 0.5;
    const top = (hy - y) / 120;
    let v = 0.35 + rim + top * 0.3 + (ring > 0.8 ? -0.25 : 0) + (tn(x * 1.2, y * 1.2 + t * 6) - 0.5) * 0.3;
    if (y > fy - 4) v = 0.2;
    if (spot === 2) return v > 0.45 ? P('#b8e07a') : P('#6a9a4a');
    if (spot === 1) return P('#3a5a3a');
    // gloss highlight on the head
    const gx = x - (hx + rx * 0.45), gy = y - (hy - ry * 0.6);
    if (gx * gx + gy * gy * 2 < 30 && bayer(x, y) < 0.6) return P('#f0c8f0');
    return pick(SKIN, v, x, y);
  }, 60);
  // mouth
  const open = (0.35 + c * 0.65) * (0.55 + 0.45 * Math.sin(t * 3.1)) ;
  const mx = fx - 14, my = fy - 14, mw = 17, mh = Math.round(3 + open * 15);
  for (let j = -mh; j <= mh; j++) {
    const half = Math.round(mw * Math.sqrt(1 - (j / (mh + 0.5)) ** 2));
    rect(ctx, '#12061a', mx - half - 1, my + j, half * 2 + 3, 1);
    rect(ctx, j > mh * 0.3 ? '#d0507a' : '#5a0a24', mx - half, my + j, half * 2 + 1, 1);
  }
  for (let k = -mw + 3; k < mw - 1; k += 4) {
    const top = my - Math.round(mh * Math.sqrt(Math.max(0, 1 - (k / mw) ** 2)));
    const bot = my + Math.round(mh * Math.sqrt(Math.max(0, 1 - (k / mw) ** 2)));
    rect(ctx, '#fff6e0', mx + k, top, 2, 2); rect(ctx, '#fff6e0', mx + k, top + 2, 1, 1);
    rect(ctx, '#fff6e0', mx + k + 1, bot - 1, 2, 1); rect(ctx, '#fff6e0', mx + k + 2, bot - 2, 1, 1);
  }
  // drool
  const dl = (t * 0.9) % 1;
  rect(ctx, '#b8ff8a', mx + 4, my + mh, 1, 2 + dl * 8);
  rect(ctx, '#e8ffd0', mx + 4, my + mh + 2 + dl * 8, 2, 2);
  // eyestalks with googly eyes
  const blink = (t % 3.7) > 3.55;
  for (let e = 0; e < 2; e++) {
    const bx = hx + (e ? -4 : 14), by = hy - ry + (e ? 6 : 8);
    const sway = Math.sin(t * 2.6 + e * 1.7) * (3 + c * 2);
    const ex = bx + 8 + sway + e * -6, ey = by - 24 - e * 4;
    for (let k = 0; k <= 20; k++) {
      const u = k / 20;
      const x = bx + (ex - bx) * u + Math.sin(u * Math.PI) * 3, y = by + (ey - by) * u;
      rect(ctx, '#12061a', x - 3, y, 7, 1);
      rect(ctx, '#73307a', x - 2, y, 5, 1);
      rect(ctx, '#c47ab8', x - 1, y, 1, 1);
    }
    const r = e ? 8 : 9;
    for (let j = -r - 1; j <= r + 1; j++) {
      const w = Math.round(Math.sqrt(Math.max(0, (r + 1) ** 2 - j * j)));
      rect(ctx, '#12061a', ex - w, ey + j, w * 2 + 1, 1);
    }
    if (blink) { rect(ctx, '#9a4e96', ex - r, ey - 1, r * 2 + 1, 3); continue; }
    for (let j = -r; j <= r; j++) {
      const w = Math.round(Math.sqrt(r * r - j * j));
      rect(ctx, j > r * 0.5 ? '#d8d0e0' : '#fffaf4', ex - w, ey + j, w * 2 + 1, 1);
    }
    if (c > 0.55) for (let q = 0; q < 3; q++) rect(ctx, '#e04a5a', ex - r + 1 + q * 2, ey + r - 2 - q, 2, 1);
    const jit = Math.sin(t * 13 + e) * c;
    const px = ex + 2 + jit, py = ey + 1 + Math.sin(t * 1.3) * 1.5;
    rect(ctx, '#0a0410', px - 3, py - 2, 6, 5);
    rect(ctx, '#0a0410', px - 2, py - 3, 4, 7);
    rect(ctx, '#ffffff', px - 2, py - 2, 2, 2);
  }
}

function oxygen(ctx: CanvasRenderingContext2D, fx: number, _fy: number, t: number, c: number): void {
  band(ctx, fx, (x, y, d) => {
    const st = tn(x * 0.12 - t * 150, y * 3.5);
    const dd = d + (tn(y * 2.5, t * 25) - 0.5) * 26 + (st - 0.5) * 50;
    if (dd < 0) {
      if (st > 0.7 && dd > -90 * (0.3 + c)) return P('#e8f6ff', 0.55);
      return 0;
    }
    if (bayer(x, y) > smooth(0, 28, dd)) return 0;
    return pick(AIR, st * 0.85 + 0.15 - smooth(60, 240, dd) * 0.35, x, y);
  }, 100);
  // debris: panels, bolts, cups, wrenches tumbling rightward
  const N = 10 + Math.round(c * 14);
  for (let i = 0; i < N; i++) {
    const sp = (120 + h1(i, 0) * 180) * (0.75 + c * 0.6);
    const span = 220 + c * 80;
    const x = fx - 170 + ((t * sp + h1(i, 1) * 500) % span);
    const y = 16 + h1(i, 2) * (VIEW_H - 40) + Math.sin(t * 3 + i * 2) * 5;
    const spin = Math.floor(t * 8 + i) % 4;
    const kind = i % 5;
    if (kind === 0) { // panel
      const w = spin % 2 ? 3 : 6, h = spin % 2 ? 6 : 3;
      rect(ctx, '#3a4258', x - 1, y - 1, w + 2, h + 2); rect(ctx, '#8a96b0', x, y, w, h); rect(ctx, '#ff8a2b', x, y, 1, 1);
    } else if (kind === 1) { // wrench
      rect(ctx, '#1a1e2c', x - 1, y - 1, 9, 4);
      rect(ctx, '#c8d0e0', x, y + (spin % 2), 7, 1); rect(ctx, '#c8d0e0', x + 6, y - 1 + (spin % 2) * 2, 2, 2);
    } else if (kind === 2) { // cup
      rect(ctx, '#3a4258', x - 1, y - 1, 5, 5); rect(ctx, '#ffffff', x, y, 3, 3); rect(ctx, '#ff8a2b', x, y + 1, 3, 1);
    } else if (kind === 3) { // paper
      rect(ctx, '#e8f0ff', x, y, spin % 2 ? 2 : 4, spin % 2 ? 4 : 2);
    } else rect(ctx, '#5a6478', x, y, 2, 2);
  }
  for (let i = 0; i < 12; i++) {
    const x = fx - 40 + ((t * 260 + h1(i, 7) * 300) % 120), y = h1(i, 8) * VIEW_H;
    rect(ctx, '#ffffff', x, y, 6, 1);
  }
}

function lightning(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  const per = 0.9 - c * 0.45;
  const k = Math.floor(t / per), ph = t - k * per;
  const flash = ph < 0.12 ? 1 - ph / 0.12 : 0;
  // flickering glow pockets inside the cloud
  const pk = Math.floor(t * 7);
  const pocketX = fx - 20 - hash2(pk, 1, 3) * 160, pocketY = fy - 40 - hash2(pk, 2, 3) * 120;
  const pocketA = hash2(pk, 3, 3) < 0.5 + c * 0.3 ? 0.45 : 0;
  band(ctx, fx, (x, y, d) => {
    const v = tn(x * 0.6 + t * 9, y * 0.6 + t * 4);
    const lit = v - tn(x * 0.6 + t * 9 + 2, y * 0.6 + t * 4 + 2);
    const dd = d + (tn(y * 1.1 + t * 10, t * 8) - 0.5) * 30 + (v - 0.5) * 16;
    if (dd < 0) return glowAhead(dd, x, y, P('#8ab8ff'), 60, 0.1 + flash * (0.3 + c * 0.4));
    if (bayer(x, y) > smooth(0, 14, dd)) return 0;
    const px2 = x - pocketX, py2 = y - pocketY;
    const pocket = Math.max(0, 1 - (px2 * px2 + py2 * py2) / 900) * pocketA;
    return pick(CLOUD, v * 0.6 + lit * 1.1 + flash * 0.4 * Math.exp(-dd / 80) + pocket + 0.12, x, y);
  });
  // rain
  for (let i = 0; i < 40 + c * 40; i++) {
    const x = fx - 10 - h1(i, 0) * 220 - ((t * 60) % 20), y = (h1(i, 1) * VIEW_H + t * 340) % VIEW_H;
    rect(ctx, '#6a7ab8', x, y, 1, 3);
  }
  // bolts
  const strikes = c > 0.5 ? 2 : 1;
  for (let s = 0; s < strikes; s++) {
    if (ph > 0.16) break;
    const seed = k * 7 + s * 101;
    let x = s === 1 ? fx + 6 + hash2(seed, 1) * 18 : fx - 10 - hash2(seed, 2) * 150;
    let y = 0;
    const pts: [number, number][] = [[x, y]];
    while (y < fy + 2) {
      y += 6 + hash2(seed, y, 3) * 8;
      x += (hash2(seed, y, 4) - 0.5) * 14;
      pts.push([x, Math.min(y, fy + 2)]);
    }
    const seg = (a: [number, number], b: [number, number], col: string, w: number) => {
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (let q = 0; q <= n; q++) rect(ctx, col, a[0] + ((b[0] - a[0]) * q) / n - (w >> 1), a[1] + ((b[1] - a[1]) * q) / n, w, 1);
    };
    ctx.globalAlpha = 0.5;
    for (let q = 1; q < pts.length; q++) seg(pts[q - 1], pts[q], '#8ab8ff', 3);
    ctx.globalAlpha = 1;
    for (let q = 1; q < pts.length; q++) seg(pts[q - 1], pts[q], '#ffffff', 1);
    // branch
    const bi = 2 + Math.floor(hash2(seed, 9) * (pts.length - 3));
    if (pts[bi]) {
      let [bx, by] = pts[bi];
      for (let q = 0; q < 4; q++) { const nx = bx + 5 + hash2(seed, q, 5) * 5, ny = by + 6; seg([bx, by], [nx, ny], '#cfe0ff', 1); bx = nx; by = ny; }
    }
    // ground spark
    const [gx, gy] = pts[pts.length - 1];
    for (let q = 0; q < 6; q++) rect(ctx, '#ffffff', gx + Math.cos(q) * (3 + ph * 30), gy - Math.abs(Math.sin(q)) * (2 + ph * 20));
  }
}

function crusher(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  band(ctx, fx, (x, y, d) => {
    if (d < 0) return 0;
    const col = (x - fx) & 31;
    if (y > fy + 1) return y === fy + 2 ? P('#5a5468') : pick(MACH, ((x >> 1) + y) & 1 ? 0.1 : 0.4, x, y);
    const pipe = col === 4 || col === 5 ? 0.75 : col === 6 ? 0.25 : 0;
    return pick(MACH, 0.15 + pipe + tn(x, y * 0.3) * 0.25, x, y);
  }, 0);
  const sp = 0.9 + c * 0.9;
  for (let k = 0; ; k++) {
    const x = fx - 26 - k * 30;
    if (x < -30) break;
    const ph = (t * sp + k * 0.37) % 1;
    let lift: number;
    if (ph < 0.55) lift = (ph / 0.55) * 70;
    else if (ph < 0.68) lift = 70;
    else if (ph < 0.76) lift = 70 * (1 - (ph - 0.68) / 0.08) ** 2;
    else lift = 0;
    const yb = fy - lift;
    // rod
    rect(ctx, '#2a2634', x + 7, 0, 10, yb - 18);
    rect(ctx, '#a8a0b8', x + 8, 0, 2, yb - 18);
    rect(ctx, '#6a6478', x + 10, 0, 5, yb - 18);
    // head
    rect(ctx, '#0e0c14', x - 1, yb - 19, 26, 20);
    rect(ctx, '#6a6478', x, yb - 18, 24, 13);
    rect(ctx, '#9a92aa', x, yb - 18, 24, 2);
    rect(ctx, '#3a3444', x, yb - 7, 24, 2);
    for (let s = 0; s < 24; s++) rect(ctx, ((s + Math.floor(k * 3)) >> 2) % 2 ? '#ffc93a' : '#1a1620', x + s, yb - 5, 1, 5);
    rect(ctx, '#ff4a3a', x + 3, yb - 15, 2, 2);
    // impact
    if (ph >= 0.76 && ph < 0.9) {
      const u = (ph - 0.76) / 0.14;
      for (let q = 0; q < 6; q++) {
        const a = Math.PI + (q / 5) * Math.PI;
        rect(ctx, q % 2 ? '#ffe27a' : '#ff9a3a', x + 12 + Math.cos(a) * (14 + u * 14), fy - 1 + Math.sin(a) * (2 + u * 10));
      }
      ctx.globalAlpha = 0.6 * (1 - u);
      rect(ctx, '#9a92aa', x - 4 - u * 6, fy - 4 - u * 4, 8, 4);
      rect(ctx, '#9a92aa', x + 20 + u * 6, fy - 4 - u * 4, 8, 4);
      ctx.globalAlpha = 1;
    }
  }
  // leading hazard plate + beacon
  for (let y = 0; y < fy + 2; y++) rect(ctx, ((y >> 2) & 1) ? '#ffc93a' : '#1a1620', fx - 3, y, 3, 1);
  const on = Math.floor(t * (3 + c * 5)) % 2 === 0;
  rect(ctx, on ? '#ff4a3a' : '#5a1a1a', fx - 4, 8, 4, 4);
  if (on) { ctx.globalAlpha = 0.3; rect(ctx, '#ff4a3a', fx - 8, 4, 14, 12); ctx.globalAlpha = 1; }
}

function cometTail(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  band(ctx, fx, (x, y, d) => {
    const dd = d + (tn(y * 2.2, t * 22) - 0.5) * 22;
    if (dd < 0) return glowAhead(dd, x, y, P('#a8e0ff', 0.35), 50, 0.15 + c * 0.35);
    if (dd < 2) return P('#ffffff');
    const flow = tn(x * 0.2 + t * 80, y * 2.8);
    if (bayer(x, y) > smooth(0, 10, dd)) return 0;
    return pick(TAIL, flow * 0.55 + Math.exp(-dd / 36) * 0.55 - smooth(60, 260, dd) * 0.2 + 0.05, x, y);
  });
  const R = rocks('ice', ['#1e3a6a', '#4a7ab0', '#9cc8f0', '#ffffff'], '#0a1630');
  const N = 10 + Math.round(c * 12);
  for (let i = 0; i < N; i++) {
    const life = (t * (0.3 + h1(i, 0) * 0.3) + h1(i, 1)) % 1;
    const x = fx + 4 - life * (60 + h1(i, 2) * 120);
    const y = fy - 70 + h1(i, 3) * 120 + Math.sin(t + i) * 3 - life * 10;
    blitC(ctx, R[i % R.length], x, y, Math.floor(life * 10) % 2 === 0);
  }
  for (let i = 0; i < 10; i++) {
    const tw = (t * 3 + h1(i, 5) * 7) % 1;
    if (tw > 0.4) continue;
    const x = fx - h1(i, 6) * 80, y = h1(i, 7) * VIEW_H;
    rect(ctx, '#ffffff', x, y); rect(ctx, '#a8e0ff', x - 1, y); rect(ctx, '#a8e0ff', x + 1, y); rect(ctx, '#a8e0ff', x, y - 1); rect(ctx, '#a8e0ff', x, y + 1);
  }
}

function blackHole(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  const R = 560, cx = fx - R;
  band(ctx, fx, (x, y) => {
    const dx = x - cx, dy = y - fy;
    const r = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
    const dd = R - r + (tn(a * 220 + 30, t * 26) - 0.5) * 9 + Math.sin(a * 40 + t * 6) * 2;
    if (dd < 0) {
      if (dd > -5) return bayer(x, y) < 0.55 ? P('#000000', 0.7) : 0;
      return glowAhead(dd + 5, x, y, P('#9a5aff', 0.35), 60, 0.2 + c * 0.4);
    }
    if (dd < 2) return P('#fff6e0');
    if (dd < 4) return P('#ffc860');
    if (dd < 7) return bayer(x, y) < 0.6 ? P('#ff6a2a') : P('#8a1a4a');
    const sw = tn(a * 130 + r * 0.35 - t * 50, r * 0.5 - t * 14);
    const arm = Math.sin(a * 18 + r * 0.06 - t * 2.5) * 0.5 + 0.5;
    return pick(VOIDR, (sw * 0.8 + arm * 0.35) * (1 - smooth(8, 200, dd) * 0.6) + Math.exp(-dd / 18) * 0.4 - 0.1, x, y);
  });
  // lensed star streaks sliding along the rim + infalling debris
  for (let i = 0; i < 10 + c * 10; i++) {
    const a = ((h1(i, 0) - 0.5) * 0.6) + ((t * 0.08 * (h1(i, 1) + 0.5)) % 0.6) - 0.3;
    const rr = R + 6 + h1(i, 2) * 30 * (1 - c * 0.5);
    for (let k = 0; k < 6; k++) {
      const aa = a + k * 0.004;
      ctx.globalAlpha = 0.8 - k * 0.12;
      rect(ctx, '#e8e0ff', cx + Math.cos(aa) * rr, fy + Math.sin(aa) * rr);
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const life = (t * 0.25 + h1(i, 4)) % 1;
    const a = (h1(i, 5) - 0.5) * 0.5 + life * 0.15;
    const rr = R + 50 - life * 52;
    rect(ctx, '#5a3a40', cx + Math.cos(a) * rr - 1, fy + Math.sin(a) * rr - 1, 3, 2);
    rect(ctx, '#ff9a50', cx + Math.cos(a) * rr - 1, fy + Math.sin(a) * rr - 1, 1, 1);
  }
}

function supernova(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number): void {
  const R = 520, cx = fx - R;
  const halo = P('#ffe0c0', 0.4);
  band(ctx, fx, (x, y) => {
    const dx = x - cx, dy = y - fy;
    const r = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
    const dd = R - r + (tn(a * 300, t * 32) - 0.5) * 7;
    if (dd < 0) return glowAhead(dd, x, y, halo, 70, 0.25 + c * 0.5);
    if (dd < 3) return P('#ffffff');
    if (dd < 7) return P('#fff0c0');
    const fil = tn(a * 170 - t * 6, r * 0.25 - t * 55);
    const ring = (r + t * 90) % 64 < 2.5 ? 0.22 : 0;
    return pick(NOVA, fil * 0.6 + Math.exp(-dd / 45) * 0.6 + ring - smooth(80, 320, dd) * 0.15, x, y);
  });
  const N = 18 + Math.round(c * 28);
  for (let i = 0; i < N; i++) {
    const life = (t * (0.8 + h1(i, 0)) + h1(i, 1)) % 1;
    const y = h1(i, 2) * VIEW_H;
    const x = fx - 6 + life * (30 + c * 60 + h1(i, 3) * 30);
    ctx.globalAlpha = 1 - life;
    rect(ctx, life < 0.4 ? '#ffffff' : '#ffb860', x, y, 3, 1);
  }
  ctx.globalAlpha = 1;
}

const KINDS: Record<ThreatKind, (ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, c: number) => void> = {
  'fuel-fire': fuelFire,
  moonquake,
  meteors,
  'dust-storm': dustStorm,
  'ice-crack': iceCrack,
  slug,
  oxygen,
  lightning,
  crusher,
  'comet-tail': cometTail,
  'black-hole': blackHole,
  supernova,
};

export function drawThreat(ctx: CanvasRenderingContext2D, kind: ThreatKind, frontSx: number, frontSy: number, t: number, closeness: number): void {
  if (frontSx < -LEAD - 40) return;
  const c = Math.min(1, Math.max(0, closeness));
  const jit = c > 0.75 ? Math.round((hash2(Math.floor(t * 24), 3, 1) - 0.5) * 2 * (c - 0.75) * 8) : 0;
  GFY = frontSy;
  (KINDS[kind] ?? fuelFire)(ctx, Math.round(frontSx) + jit, Math.round(frontSy), t, c);
}

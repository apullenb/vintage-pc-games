// Escape craft: retro rocket, shuttle, portal. Ground point (sx, sy); bottom row sits at sy - 1.
import type { EscapeKind } from '../types.ts';
import { bayer, Buf, hash2, hex, mix, type RGB } from './px.ts';

const C = {
  o: hex('#1b1533'),
  W: hex('#f7f4ec'),
  w: hex('#d3cde0'),
  s: hex('#a59fbd'),
  A: hex('#ff8a2b'),
  a: hex('#cf5518'),
  y: hex('#ffd27a'),
  V: hex('#2b3d82'),
  v: hex('#18204f'),
  h: hex('#8ff0ff'),
  g: hex('#6c6789'),
  G: hex('#9690b0'),
  L: hex('#ffe066'),
  in: hex('#ffcf6a'),
  inD: hex('#d08a3a'),
};

// Door offsets from (sx, sy): where the hero walks in.
export const ESCAPE_DOOR: Record<EscapeKind, { dx: number; dy: number }> = {
  rocket: { dx: 0, dy: 0 },
  shuttle: { dx: 4, dy: 0 },
  portal: { dx: 0, dy: 0 },
};

function outline(b: Buf, c: RGB): void {
  const add: [number, number][] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      if (!b.alpha(x, y) && (b.alpha(x - 1, y) || b.alpha(x + 1, y) || b.alpha(x, y - 1) || b.alpha(x, y + 1))) add.push([x, y]);
  for (const [x, y] of add) b.set(x, y, c);
}

// ---------- rocket ----------
const RW = 34, RH = 64, RCX = 17; // canvas; centre column, bottom row = RH - 1
let rocketImg: [HTMLCanvasElement, HTMLCanvasElement] | null = null;

function buildRocket(open: boolean): HTMLCanvasElement {
  const b = new Buf(RW, RH);
  const top = 2, bodyBot = RH - 9;
  const half = (y: number): number => {
    const u = (y - top) / (bodyBot - top);
    if (u < 0.32) return 1 + Math.sqrt(u / 0.32) * 7.5;
    if (u > 0.9) return 8.5 - (u - 0.9) * 20;
    return 8.5;
  };
  // fins behind body
  for (let y = 0; y < 20; y++) {
    const yy = RH - 2 - y;
    const reach = Math.round(14 - y * 0.55 - (y > 14 ? (y - 14) * 1.5 : 0));
    if (reach < 8) continue;
    for (let x = 7; x <= reach; x++) {
      const c = x === reach || y === 0 ? C.a : x > reach - 2 ? C.A : C.a;
      b.set(RCX - x, yy, c === C.A ? C.A : C.a);
      b.set(RCX + x, yy, c);
    }
  }
  // nozzle
  for (let y = RH - 10; y < RH - 2; y++) {
    const hw = 3 + Math.floor((y - (RH - 10)) * 0.4);
    for (let x = -hw; x <= hw; x++) b.set(RCX + x, y, x < -hw + 2 ? C.G : x > hw - 2 ? C.g : mix(C.G, C.g, 0.5));
  }
  // body
  for (let y = top; y <= bodyBot; y++) {
    const hw = half(y);
    for (let x = Math.ceil(-hw); x <= Math.floor(hw); x++) {
      const u = (x + hw) / (2 * hw);
      let c = u < 0.18 ? C.w : u < 0.62 ? C.W : u < 0.85 ? C.w : C.s;
      if (u > 0.22 && u < 0.32 && y > top + 8) c = mix(C.W, hex('#ffffff'), 0.6);
      const ny = (y - top) / (bodyBot - top);
      if (ny < 0.2) c = u < 0.3 ? C.y : u < 0.7 ? C.A : C.a;
      if (Math.abs(ny - 0.62) < 0.035 || Math.abs(ny - 0.7) < 0.02) c = u < 0.75 ? C.A : C.a;
      b.set(RCX + x, y, c);
    }
  }
  // porthole
  const py = top + 20;
  for (let y = -4; y <= 4; y++)
    for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x, y);
      if (d <= 2.8) b.set(RCX + x, py + y, y > 1 ? C.v : C.V);
      else if (d <= 4.2) b.set(RCX + x, py + y, d < 3.6 ? C.G : C.g);
    }
  b.set(RCX - 1, py - 1, C.h); b.set(RCX - 2, py, C.h); b.set(RCX - 1, py - 2, hex('#ffffff'));
  // hatch near the base
  const hy0 = bodyBot - 15, hy1 = bodyBot - 1;
  for (let y = hy0; y <= hy1; y++)
    for (let x = -4; x <= 4; x++) {
      const edge = Math.abs(x) === 4 || y === hy0 || y === hy1 || (y === hy0 + 1 && Math.abs(x) === 3);
      if (y === hy0 && Math.abs(x) >= 3) continue;
      if (open) b.set(RCX + x, y, edge ? C.o : y < hy0 + 3 ? C.inD : bayer(x, y) < 0.3 ? C.L : C.in);
      else b.set(RCX + x, y, edge ? C.s : x === 2 && y === hy0 + 7 ? C.A : C.w);
    }
  if (open) {
    // door swung out to the right
    for (let y = hy0 + 1; y <= hy1; y++) for (let x = 0; x < 3; x++) b.set(RCX + 9 + x, y, x === 2 ? C.s : C.w);
    b.set(RCX + 10, hy0 + 7, C.A);
    // little steps
    for (let k = 0; k < 2; k++) for (let x = -3 - k; x <= 3 + k; x++) b.set(RCX + x, hy1 + 2 + k * 3, C.g);
  }
  outline(b, C.o);
  // nose tip
  b.set(RCX, 0, C.o); b.set(RCX, 1, C.s);
  return b.canvas();
}

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, col = '#ebe7f4', sh = '#b9b3cc'): void {
  if (r <= 0 || a <= 0) return;
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = sh;
  disc(ctx, x, y + 1, r);
  ctx.fillStyle = col;
  disc(ctx, x, y, r - (r > 2 ? 1 : 0));
  ctx.globalAlpha = 1;
}
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy + r * 0.6));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}
function flame(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, t: number): void {
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const hw = Math.max(0, Math.round(w * (1 - u * u) + Math.sin(t * 40 + i) * 0.7));
    const col = u < 0.15 ? '#ffffff' : u < 0.35 ? '#fff2a0' : u < 0.6 ? '#ffb52e' : u < 0.85 ? '#ff7a1a' : '#c0301a';
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x - hw), Math.round(y + i), hw * 2 + 1, 1);
  }
}

function rocket(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, phase: 'idle' | 'boarding' | 'launch'): void {
  rocketImg ??= [buildRocket(false), buildRocket(true)];
  let lift = 0, shake = 0;
  if (phase === 'launch') {
    shake = t < 0.6 ? Math.round(Math.sin(t * 90)) : 0;
    lift = t < 0.5 ? 0 : (t - 0.5) * (t - 0.5) * 140;
  }
  const x = Math.round(sx) - RCX + shake, y = Math.round(sy) - RH - Math.round(lift);
  // base smoke / steam
  if (phase === 'launch') {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const life = (t * 0.9 + i / n) % 1;
      const side = i % 2 ? 1 : -1;
      const r = 2 + Math.round(life * 6 + hash2(i, 1) * 2);
      puff(ctx, sx + side * (6 + life * (30 + hash2(i, 2) * 20)), sy - 3 - life * 6 - hash2(i, 3) * 4, r, Math.min(1, t * 2) * (1 - life * 0.7));
    }
    const fl = Math.min(1, t * 3);
    flame(ctx, sx + shake, y + RH - 2, Math.round((10 + Math.sin(t * 50) * 2) * fl + (lift > 0 ? 10 : 0)), 4, t);
  }
  ctx.drawImage(rocketImg[phase === 'boarding' ? 1 : 0], x, y);
  // blinking nose light
  const blink = phase === 'launch' || Math.floor(t * 2) % 2 === 0;
  ctx.fillStyle = blink ? '#ff4a4a' : '#7a1a2a';
  ctx.fillRect(x + RCX, y + 1, 1, 1);
  if (blink) { ctx.globalAlpha = 0.35; ctx.fillRect(x + RCX - 1, y, 3, 3); ctx.globalAlpha = 1; }
  if (phase !== 'launch') {
    // steam from the base vents
    for (let i = 0; i < 4; i++) {
      const life = (t * 0.7 + i / 4) % 1;
      const side = i % 2 ? 1 : -1;
      puff(ctx, sx + side * (8 + life * 10), sy - 4 - life * 10, 1 + Math.round(life * 2), 0.8 * (1 - life));
    }
  }
  if (phase === 'boarding') {
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 4);
    ctx.fillStyle = '#ffcf6a';
    ctx.fillRect(Math.round(sx) - 6, Math.round(sy) - 2, 13, 2);
    ctx.globalAlpha = 1;
  }
}

// ---------- shuttle ----------
const SW = 70, SH = 32;
let shuttleImg: [HTMLCanvasElement, HTMLCanvasElement] | null = null;

function buildShuttle(open: boolean): HTMLCanvasElement {
  const b = new Buf(SW, SH);
  const gy = SH - 1; // ground row
  // delta wing (dark, seen from slightly below)
  for (let y = 0; y < 6; y++) for (let x = 12 + y * 3; x < 52; x++) b.set(x, gy - 9 + y, y === 0 ? hex('#5a5468') : hex('#3a3444'));
  // fuselage
  const top = gy - 22, bot = gy - 6;
  for (let x = 6; x < 60; x++) {
    const nose = x > 46 ? (x - 46) / 14 : 0;
    const yt = top + Math.round(nose * nose * 9), yb = bot - Math.round(nose * 3);
    for (let y = yt; y <= yb; y++) {
      const v = (y - yt) / Math.max(1, yb - yt);
      let c = v < 0.2 ? C.W : v < 0.7 ? C.W : v < 0.85 ? C.w : C.s;
      if (x > 50 && v > 0.55) c = hex('#2a2634'); // dark nose underside
      if (Math.abs(v - 0.62) < 0.08 && x < 50) c = C.A;
      if (y === yt && x < 46) c = mix(C.W, hex('#ffffff'), 0.7);
      b.set(x, y, c);
    }
  }
  // tail fin
  for (let y = 0; y < 13; y++) for (let x = 6 + Math.round(y * 0.3); x < 15 - Math.round(y * 0.4); x++) b.set(x, top - y, y > 9 ? C.A : x > 12 - y * 0.4 ? C.w : C.W);
  // engines
  for (let k = 0; k < 2; k++) for (let y = 0; y < 4; y++) for (let x = 2; x < 6; x++) b.set(x, top + 4 + k * 6 + y, x === 2 ? C.g : C.G);
  // cockpit windows
  for (let i = 0; i < 3; i++) { b.set(48 + i * 3, top + 5 + i, C.V); b.set(49 + i * 3, top + 5 + i, C.V); b.set(48 + i * 3, top + 6 + i, C.v); b.set(49 + i * 3, top + 6 + i, C.v); }
  b.set(48, top + 5, C.h);
  // side door
  const dx = 34, dy = top + 4;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 7; x++) {
      const edge = x === 0 || x === 6 || y === 0 || y === 9;
      b.set(dx + x, dy + y, open ? (edge ? C.o : y < 2 ? C.inD : C.in) : edge ? C.s : C.w);
    }
  // landing gear
  for (const lx of [16, 50]) { for (let y = bot + 1; y < gy - 1; y++) b.set(lx, y, C.g); b.set(lx - 1, gy - 1, C.o); b.set(lx, gy - 1, C.g); b.set(lx + 1, gy - 1, C.o); }
  if (open) for (let k = 0; k < 4; k++) for (let x = 0; x < 6; x++) b.set(dx + 1 + x - k * 2, dy + 10 + k * 2, C.g);
  outline(b, C.o);
  return b.canvas();
}

function shuttle(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, phase: 'idle' | 'boarding' | 'launch'): void {
  shuttleImg ??= [buildShuttle(false), buildShuttle(true)];
  let ox = 0, oy = 0;
  if (phase === 'launch' && t > 0.4) { const u = t - 0.4; ox = u * u * 160; oy = -u * u * 90; }
  const x = Math.round(sx - 37 + ox), y = Math.round(sy - SH + oy);
  if (phase === 'launch') {
    for (let k = 0; k < 2; k++) {
      const L = Math.round(6 + Math.sin(t * 45 + k) * 2 + Math.min(10, t * 14));
      for (let i = 0; i < L; i++) {
        const u = i / L;
        ctx.fillStyle = u < 0.2 ? '#ffffff' : u < 0.5 ? '#ffd27a' : u < 0.8 ? '#ff8a2b' : '#c0301a';
        const hw = Math.round(2 * (1 - u));
        ctx.fillRect(x + 1 - i, y + SH - 1 - 22 + 4 + k * 6 + 2 - hw, 1, hw * 2 + 1);
      }
    }
    for (let i = 0; i < 8; i++) {
      const life = (t * 1.2 + i / 8) % 1;
      puff(ctx, sx - 30 - life * 30 + ox * 0.3, sy - 4 - life * 8, 2 + Math.round(life * 5), Math.min(1, t * 2) * (1 - life));
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const life = (t * 0.6 + i / 3) % 1;
      puff(ctx, sx - 34 - life * 6, sy - 18 - life * 8, 1 + Math.round(life * 2), 0.7 * (1 - life));
    }
  }
  ctx.drawImage(shuttleImg[phase === 'boarding' ? 1 : 0], x, y);
  const blink = Math.floor(t * 2.5) % 2 === 0;
  ctx.fillStyle = blink ? '#5aff8a' : '#1a5a3a';
  ctx.fillRect(x + 7, y + SH - 1 - 22 - 12, 1, 1);
  ctx.fillStyle = blink ? '#ff4a4a' : '#5a1a1a';
  ctx.fillRect(x + 30, y + SH - 1 - 9, 1, 1);
}

// ---------- portal ----------
function portal(ctx: CanvasRenderingContext2D, sx: number, sy: number, t: number, phase: 'idle' | 'boarding' | 'launch'): void {
  const cx = Math.round(sx), cy = Math.round(sy) - 26;
  let scale = 1, power = phase === 'boarding' ? 1 : 0.55;
  if (phase === 'launch') {
    power = 1.4;
    scale = t < 0.35 ? 1 + t * 0.6 : Math.max(0, 1.21 - (t - 0.35) * 2.2);
  }
  const rx = 14 * scale, ry = 22 * scale;
  // pedestal stones
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#1b1533'; ctx.fillRect(cx + s * 13 - 4, sy - 6, 9, 6);
    ctx.fillStyle = '#4a4466'; ctx.fillRect(cx + s * 13 - 3, sy - 5, 7, 5);
    ctx.fillStyle = '#7a72a0'; ctx.fillRect(cx + s * 13 - 3, sy - 5, 7, 1);
    ctx.fillStyle = power > 0.9 ? '#8ff0ff' : '#3ab0c0'; ctx.fillRect(cx + s * 13, sy - 3, 1, 1);
  }
  if (scale <= 0.02) {
    if (t < 1.2) {
      ctx.globalAlpha = Math.max(0, 1 - (t - 0.9) * 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.globalAlpha = 1;
    }
    return;
  }
  // swirling interior
  const RX = Math.ceil(rx), RY = Math.ceil(ry);
  for (let y = -RY; y <= RY; y++)
    for (let x = -RX; x <= RX; x++) {
      const nx = x / rx, ny = y / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const r = Math.sqrt(d);
      const a = Math.atan2(ny, nx);
      const sw = Math.sin(a * 3 + r * 9 - t * 5 * (0.6 + power * 0.6));
      let col: string;
      if (r > 0.86) col = sw > 0 ? '#8ff0ff' : '#c08aff';
      else if (sw > 0.55) col = r < 0.35 ? '#ffffff' : '#7a5aff';
      else if (sw > 0) col = '#3a2a9a';
      else col = r < 0.3 && power > 0.9 ? '#c08aff' : '#160c3a';
      if (bayer(x + 64, y + 64) < 0.15 && r < 0.86) col = '#24165a';
      ctx.fillStyle = col;
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  // ring outline + orbiting sparks
  ctx.fillStyle = '#1b1533';
  for (let k = 0; k < 120; k++) {
    const a = (k / 120) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * (rx + 1)), Math.round(cy + Math.sin(a) * (ry + 1)), 1, 1);
  }
  const N = Math.round(8 + power * 10);
  for (let i = 0; i < N; i++) {
    const a = t * (1.5 + power) + (i / N) * Math.PI * 2;
    const rr = 1.05 + 0.12 * Math.sin(t * 3 + i * 1.7) + (phase === 'boarding' ? -((t * 0.8 + i / N) % 1) * 0.6 : 0.15);
    const col = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#8ff0ff' : '#ff8ae0';
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx + Math.cos(a) * rx * rr), Math.round(cy + Math.sin(a) * ry * rr), i % 4 === 0 ? 2 : 1, 1);
  }
  if (phase === 'launch' && t < 0.5) {
    ctx.globalAlpha = 0.6 * (1 - t / 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - RX - 4, cy - RY - 4, RX * 2 + 9, RY * 2 + 9);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 0.18 + power * 0.1;
  ctx.fillStyle = '#8ff0ff';
  ctx.fillRect(cx - RX, sy - 2, RX * 2 + 1, 2);
  ctx.globalAlpha = 1;
}

export function drawEscape(ctx: CanvasRenderingContext2D, kind: EscapeKind, sx: number, sy: number, t: number, phase: 'idle' | 'boarding' | 'launch'): void {
  if (kind === 'shuttle') shuttle(ctx, sx, sy, t, phase);
  else if (kind === 'portal') portal(ctx, sx, sy, t, phase);
  else rocket(ctx, sx, sy, t, phase);
}


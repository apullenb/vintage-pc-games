// Cadet Comet: composed from procedural parts into char grids, outlined, cached per frame.
import type { HeroPose } from '../types.ts';
import { css, ctx2d, fillRect, flipH, hex, makeCanvas, mix, type Palette } from './px.ts';

export const HERO_PAL: Palette = {
  o: '#1b1533', // outline
  W: '#f7f4ec', // suit
  w: '#d3cde0', // suit shade
  s: '#a59fbd', // suit deep shade
  H: '#ffffff', // glint
  A: '#ff8a2b', // signature orange
  a: '#cf5518', // orange shade
  y: '#ffd27a', // orange light
  V: '#2b3d82', // visor
  v: '#18204f', // visor dark
  h: '#8ff0ff', // visor glint
  E: '#fff7dd', // eyes
  r: '#ff8fa6', // blush
  m: '#9690b0', // pack
  M: '#6c6789', // pack shade
  b: '#3c3558', // boots
  B: '#675f8e', // boot light
  L: '#ffe066', // antenna bulb
};

// ---------- char grid ----------
interface Grid { w: number; h: number; c: string[] }
const grid = (w: number, h: number): Grid => ({ w, h, c: new Array(w * h).fill('.') });
const gget = (g: Grid, x: number, y: number): string => (x >= 0 && y >= 0 && x < g.w && y < g.h ? g.c[y * g.w + x] : '.');
function gset(g: Grid, x: number, y: number, ch: string): void {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.c[y * g.w + x] = ch;
}
function stamp(dst: Grid, src: Grid, ox = 0, oy = 0): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const ch = src.c[y * src.w + x];
      if (ch !== '.') gset(dst, x + ox, y + oy, ch);
    }
}
// 4-neighbour outline on empty cells.
function outlined(g: Grid): Grid {
  const o = { w: g.w, h: g.h, c: g.c.slice() };
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (g.c[y * g.w + x] !== '.') continue;
      if (gget(g, x - 1, y) !== '.' || gget(g, x + 1, y) !== '.' || gget(g, x, y - 1) !== '.' || gget(g, x, y + 1) !== '.') o.c[y * g.w + x] = 'o';
    }
  return o;
}

// ---------- canvas frame layout ----------
// Body box 16x24 sits at (MX, MY) inside a CW x CH canvas; feet line = sy.
const CW = 28, CH = 36, MX = 6, MY = 8;

// Thick limb segment from (x0,y0) to (x1,y1).
function limb(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string, thick = 2): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let k = 0; k < thick; k++) for (let j = 0; j < thick; j++) gset(g, x + k, y + j, ch);
  }
}

type Eyes = 'look' | 'back' | 'blink' | 'happy' | 'hurt' | 'wide' | 'x' | 'up';

// Helmet fill (no outline) with visor; local coords, 14x11.
function helmet(eyes: Eyes, backView = false): Grid {
  const g = grid(14, 11);
  const cx = 6.5, cy = 5, rx = 6.4, ry = 5.1;
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 14; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      let ch = 'W';
      if (dy > 0.55 || (dx < -0.62 && dy > -0.1)) ch = 'w';
      if (dy > 0.82 || (dx < -0.8 && dy > 0.35)) ch = 's';
      gset(g, x, y, ch);
    }
  gset(g, 3, 1, 'H'); gset(g, 2, 2, 'H'); gset(g, 4, 1, 'H');
  if (backView) {
    // orange crest band and vent
    for (let y = 0; y < 11; y++) if (gget(g, 6, y) !== '.' && y < 8) { gset(g, 6, y, 'A'); gset(g, 7, y, 'a'); }
    gset(g, 5, 8, 's'); gset(g, 8, 8, 's');
    return g;
  }
  // visor
  const vx = 9.2, vy = 5.2, vrx = 4.6, vry = 3.0;
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 14; x++) {
      const dx = (x - vx) / vrx, dy = (y - vy) / vry;
      const d = dx * dx + dy * dy;
      if (gget(g, x, y) === '.' || x > 12) continue;
      if (d <= 1) gset(g, x, y, dy > 0.45 ? 'v' : 'V');
      else if (d <= 1.55 && x > 4) gset(g, x, y, 'a');
    }
  // rim highlight on top of orange ring
  for (let x = 6; x <= 11; x++) if (gget(g, x, 2) === 'a') gset(g, x, 2, 'A');
  gset(g, 6, 4, 'h'); gset(g, 7, 3, 'h'); gset(g, 6, 3, 'H');
  // eyes
  const E = (x: number, y: number, ch = 'E') => gset(g, x, y, ch);
  switch (eyes) {
    case 'look': E(9, 4); E(9, 5); E(11, 4); E(11, 5); E(12, 6, 'r'); break;
    case 'back': E(7, 4); E(7, 5); E(9, 4); E(9, 5); break;
    case 'up': E(9, 3); E(9, 4); E(11, 3); E(11, 4); break;
    case 'blink': E(9, 5); E(11, 5); E(12, 6, 'r'); break;
    case 'happy': E(8, 5); E(9, 4); E(10, 5); E(11, 4); E(12, 5); E(12, 6, 'r'); break;
    case 'hurt': E(8, 4); E(9, 5); E(8, 6); E(12, 4); E(11, 5); E(12, 6); break;
    case 'wide': E(7, 3); E(8, 3); E(8, 4); E(10, 3); E(11, 3); E(11, 4); E(7, 4, 'v'); E(10, 4, 'v'); E(9, 6); E(9, 7, 'r'); break;
    case 'x': E(8, 4); E(10, 4); E(9, 5); E(8, 6); E(10, 6); E(11, 4); E(12, 5); E(11, 6); break;
  }
  return g;
}

interface Rig {
  by: number; // torso+helmet drop (+down)
  hx: number; // helmet x shift
  hy: number; // extra helmet drop
  feet: [number, number, number, number]; // back foot x,y; front foot x,y (box coords, y = boot top row)
  hands: [number, number, number, number]; // back hand, front hand
  eyes: Eyes;
  antenna?: number; // bulb sway -1..1
  flame?: number; // jet flame length (0 = none)
  back?: boolean; // back view (climb)
}

function compose(r: Rig): Grid {
  const G = grid(CW, CH);
  const B = (gx: number, gy: number) => [gx + MX, gy + MY] as const;
  const by = r.by;
  // back arm + back leg
  const backArm = grid(CW, CH);
  {
    const [sx, sy] = B(r.back ? 5 : 6, 12 + by);
    const [hx, hy] = B(r.hands[0], r.hands[1]);
    limb(backArm, sx, sy, hx, hy, 's');
    limb(backArm, hx, hy, hx, hy, 'a');
  }
  const backLeg = grid(CW, CH);
  {
    const [hx, hy] = B(r.back ? 6 : 7, 17 + by);
    const [fx, fy] = B(r.feet[0], r.feet[1]);
    limb(backLeg, hx, hy, fx, fy - 1, 'w');
    for (let i = -1; i <= (r.back ? 1 : 2); i++) { gset(backLeg, fx + i, fy, 'M'); gset(backLeg, fx + i, fy + 1, 'b'); }
  }
  if (!r.back) stamp(G, outlined(backArm));
  stamp(G, outlined(backLeg));
  // pack
  const pack = grid(CW, CH);
  if (!r.back) {
    for (let y = 11; y <= 16; y++) for (let x = 2; x <= 5; x++) gset(pack, ...B(x, y + by), x === 2 || y === 16 ? 'M' : 'm');
    gset(pack, ...B(3, 12 + by), 'A'); gset(pack, ...B(3, 13 + by), 'a');
    gset(pack, ...B(3, 17 + by), 'M'); gset(pack, ...B(4, 17 + by), 'M');
    stamp(G, outlined(pack));
  }
  // torso
  const torso = grid(CW, CH);
  for (let y = 11; y <= 16; y++)
    for (let x = 5; x <= 12; x++) {
      let ch = x === 5 ? 'w' : 'W';
      if (y === 16) ch = 's';
      if (y === 15) ch = x <= 6 ? 'a' : 'A';
      if (r.back && x === 5) ch = 'W';
      gset(torso, ...B(x, y + by), ch);
    }
  if (!r.back) { gset(torso, ...B(10, 13 + by), 'A'); gset(torso, ...B(9, 13 + by), 'y'); gset(torso, ...B(10, 12 + by), 'y'); gset(torso, ...B(11, 13 + by), 'y'); gset(torso, ...B(10, 14 + by), 'a'); }
  // front leg
  const frontLeg = grid(CW, CH);
  {
    const [hx, hy] = B(10, 17 + by);
    const [fx, fy] = B(r.feet[2], r.feet[3]);
    limb(frontLeg, hx, hy, fx, fy - 1, 'W');
    for (let i = -1; i <= (r.back ? 1 : 2); i++) { gset(frontLeg, fx + i, fy, 'B'); gset(frontLeg, fx + i, fy + 1, 'b'); }
  }
  stamp(G, outlined(frontLeg));
  if (r.back) {
    // big pack on the back view
    for (let y = 11; y <= 16; y++) for (let x = 6; x <= 11; x++) gset(torso, ...B(x, y + by), x === 6 || y === 16 ? 'M' : 'm');
    for (let x = 7; x <= 10; x++) gset(torso, ...B(x, 12 + by), 'A');
    gset(torso, ...B(8, 14 + by), 'L');
  }
  stamp(G, outlined(torso));
  // helmet
  const hg = helmet(r.eyes, r.back);
  const hl = grid(CW, CH);
  stamp(hl, hg, MX + 1 + r.hx, MY + 0 + by + r.hy);
  // antenna on back of helmet
  const ax = MX + 3 + r.hx + Math.round(r.antenna ?? 0), ay = MY - 2 + by + r.hy;
  gset(hl, MX + 3 + r.hx, ay + 1, 's');
  gset(hl, ax, ay, 'L');
  stamp(G, outlined(hl));
  // front arm on top
  const fa = grid(CW, CH);
  {
    const [sx, sy] = B(11, 12 + by);
    const [hx, hy] = B(r.hands[2], r.hands[3]);
    limb(fa, sx, sy, hx, hy, 'W');
    limb(fa, hx, hy, hx, hy, 'A');
  }
  if (r.back) stamp(G, outlined(backArm));
  stamp(G, outlined(fa));
  // jet flame under the pack nozzle
  if (r.flame && !r.back) {
    const [nx, ny] = B(3, 18 + by);
    const L = r.flame;
    for (let i = 0; i < L; i++) {
      const wdt = i < 1 ? 2 : i < L - 2 ? 2 : 1;
      const ch = i < 1 ? 'H' : i < 3 ? 'L' : i < L - 1 ? 'A' : 'a';
      for (let k = 0; k < wdt; k++) gset(G, nx + k + (wdt === 1 ? (i & 1) : 0), ny + i, ch);
    }
  }
  return G;
}

// Scale2x (EPX) for rotsprite-style rotation.
function scale2x(g: Grid): Grid {
  const o = grid(g.w * 2, g.h * 2);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const P = gget(g, x, y), A = gget(g, x, y - 1), B = gget(g, x + 1, y), C = gget(g, x - 1, y), D = gget(g, x, y + 1);
      const e0 = C === A && C !== D && A !== B ? A : P;
      const e1 = A === B && A !== C && B !== D ? B : P;
      const e2 = D === C && D !== B && C !== A ? C : P;
      const e3 = B === D && B !== A && D !== C ? D : P;
      o.c[2 * y * o.w + 2 * x] = e0;
      o.c[2 * y * o.w + 2 * x + 1] = e1;
      o.c[(2 * y + 1) * o.w + 2 * x] = e2;
      o.c[(2 * y + 1) * o.w + 2 * x + 1] = e3;
    }
  return o;
}

// Rotsprite-lite rotation about (px,py); returns grid and new pivot.
function rotate(g: Grid, ang: number, px: number, py: number): { g: Grid; px: number; py: number } {
  const big = scale2x(scale2x(scale2x(g)));
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const pts = [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]].map(([x, y]) => [(x - px) * ca - (y - py) * sa, (x - px) * sa + (y - py) * ca]);
  const minX = Math.floor(Math.min(...pts.map((p) => p[0]))), maxX = Math.ceil(Math.max(...pts.map((p) => p[0])));
  const minY = Math.floor(Math.min(...pts.map((p) => p[1]))), maxY = Math.ceil(Math.max(...pts.map((p) => p[1])));
  const o = grid(maxX - minX + 1, maxY - minY + 1);
  for (let y = 0; y < o.h; y++)
    for (let x = 0; x < o.w; x++) {
      const rx = x + minX + 0.5, ry = y + minY + 0.5;
      const sx = rx * ca + ry * sa + px, sy = -rx * sa + ry * ca + py;
      o.c[y * o.w + x] = gget(big, Math.floor(sx * 8), Math.floor(sy * 8));
    }
  return { g: o, px: -minX, py: -minY };
}

// ---------- poses ----------
const STAND: Rig = { by: 0, hx: 0, hy: 0, feet: [6, 21, 10, 21], hands: [5, 15, 12, 15], eyes: 'look' };
const rig = (p: Partial<Rig>): Rig => ({ ...STAND, ...p });

function runRig(i: number): Rig {
  const th = (i / 6) * Math.PI * 2;
  const s = Math.sin(th), c = Math.cos(th);
  const foot = (ph: number, hip: number): [number, number] => {
    const ss = Math.sin(th + ph), cc = Math.cos(th + ph);
    return [Math.round(hip + ss * 3.2), Math.round(21 - Math.max(0, cc) * 2.4)];
  };
  const fb = foot(Math.PI, 7), ff = foot(0, 10);
  const bob = Math.abs(c) > 0.8 ? 0 : 1;
  return rig({
    by: bob - 1 + 1,
    hx: 1,
    feet: [fb[0], fb[1], ff[0], ff[1]],
    hands: [Math.round(6 + s * 3), Math.round(15 - Math.abs(s)), Math.round(12 - s * 3), Math.round(15 - Math.abs(s) * 2)],
    antenna: -1 - (bob ? 0 : 1),
  });
}

type FrameKey = string;
interface Frame { img: HTMLCanvasElement; flip: HTMLCanvasElement; red: HTMLCanvasElement; redFlip: HTMLCanvasElement; ax: number; ay: number }
const cache = new Map<FrameKey, Frame>();

const RED_PAL: Palette = Object.fromEntries(
  Object.entries(HERO_PAL).map(([k, v]) => [k, k === 'o' ? '#4a0614' : css(mix(hex(v), hex('#ff3348'), 0.62))]),
);

function gridCanvas(g: Grid, pal: Palette): HTMLCanvasElement {
  const c = makeCanvas(g.w, g.h);
  const x = ctx2d(c);
  for (let y = 0; y < g.h; y++)
    for (let i = 0; i < g.w; i++) {
      const ch = g.c[y * g.w + i];
      if (ch === '.') continue;
      x.fillStyle = pal[ch];
      x.fillRect(i, y, 1, 1);
    }
  return c;
}

function frame(key: FrameKey, make: () => { g: Grid; ax: number; ay: number }): Frame {
  let f = cache.get(key);
  if (!f) {
    const m = make();
    const img = gridCanvas(m.g, HERO_PAL), red = gridCanvas(m.g, RED_PAL);
    f = { img, flip: flipH(img), red, redFlip: flipH(red), ax: m.ax, ay: m.ay };
    cache.set(key, f);
  }
  return f;
}
const upright = (r: Rig) => () => ({ g: compose(r), ax: MX + 8, ay: MY + 24 });
function rotated(r: Rig, ang: number, pivX: number, pivY: number, outAx: number, outAy: number) {
  return () => {
    const R = rotate(compose(r), ang, MX + pivX, MY + pivY);
    return { g: R.g, ax: R.px + outAx, ay: R.py + outAy };
  };
}

function blit(ctx: CanvasRenderingContext2D, f: Frame, sx: number, sy: number, dir: number, red: boolean): void {
  const x = Math.round(sx), y = Math.round(sy);
  if (dir >= 0) ctx.drawImage(red ? f.red : f.img, x - f.ax, y - f.ay);
  else ctx.drawImage(red ? f.redFlip : f.flip, x - (f.img.width - f.ax), y - f.ay);
}

// ---------- effects ----------
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  ctx.globalAlpha = a;
  fillRect(ctx, '#b9b3cc', x - r, y - r + 1, r * 2 + 1, r * 2);
  fillRect(ctx, '#ebe7f4', x - r + 1, y - r, r * 2 - 1, r * 2);
  if (r >= 2) fillRect(ctx, '#ffffff', x - r + 1, y - r, r - 1, 1);
  ctx.globalAlpha = 1;
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, big: boolean): void {
  fillRect(ctx, col, x, y);
  fillRect(ctx, col, x - 1, y); fillRect(ctx, col, x + 1, y); fillRect(ctx, col, x, y - 1); fillRect(ctx, col, x, y + 1);
  if (big) { fillRect(ctx, '#ffffff', x, y); fillRect(ctx, col, x - 2, y); fillRect(ctx, col, x + 2, y); }
}

// ---------- public ----------
export function drawHero(ctx: CanvasRenderingContext2D, pose: HeroPose, t: number, sx: number, sy: number, dir: 1 | -1, flash: boolean): void {
  const D = dir < 0 ? -1 : 1;
  const T = Math.max(0, t);
  const F = (k: string, make: () => { g: Grid; ax: number; ay: number }) => frame(k, make);
  switch (pose) {
    case 'idle': {
      const breath = Math.floor(T / 0.6) % 2;
      const cyc = T % 4.2;
      const glance = cyc > 2.6 && cyc < 3.5;
      const blink = !glance && (T % 3.1) > 2.95;
      const eyes: Eyes = glance ? 'back' : blink ? 'blink' : 'look';
      const key = `idle${breath}${eyes}`;
      blit(ctx, F(key, upright(rig({ by: breath, hands: [5, 15 + breath, 12, 15 + breath], eyes, hx: glance ? -1 : 0, antenna: breath ? 0 : -1 }))), sx, sy, D, flash);
      return;
    }
    case 'run': {
      const i = Math.floor(T * 13) % 6;
      blit(ctx, F(`run${i}`, upright(runRig(i))), sx, sy, D, flash);
      if (i === 0 || i === 3) {
        // kicked-up dust
        const k = (T * 13) % 1;
        puff(ctx, Math.round(sx - D * (6 + k * 4)), Math.round(sy - 2 - k * 2), 1, 0.7 * (1 - k));
      }
      return;
    }
    case 'jump': {
      let r: Rig, k: string;
      if (T < 0.07) { k = 'jc'; r = rig({ by: 2, feet: [5, 21, 11, 21], hands: [4, 17, 13, 17], antenna: 1 }); }
      else if (T < 0.22) { k = 'jr'; r = rig({ by: -1, feet: [7, 22, 9, 22], hands: [2, 7, 16, 5], eyes: 'up', antenna: 1 }); }
      else if (T < 0.5) { k = 'jt'; r = rig({ by: -1, feet: [6, 18, 11, 18], hands: [3, 13, 15, 12], eyes: 'look', antenna: 0 }); }
      else { k = 'jf'; r = rig({ by: -1, feet: [6, 21, 10, 22], hands: [2, 9, 16, 8], antenna: -1 }); }
      blit(ctx, F(k, upright(r)), sx, sy, D, flash);
      return;
    }
    case 'jet': {
      const fl = Math.floor(T * 20) % 3;
      const r = rig({ by: 0, hx: 1, feet: [5, 22, 8, 21], hands: [5, 14, 16, 12], antenna: -2, flame: [6, 5, 7][fl] });
      blit(ctx, F(`jet${fl}`, upright(r)), sx, sy, D, flash);
      // exhaust puffs trailing down and back
      for (let i = 0; i < 4; i++) {
        const life = (T * 2.2 + i / 4) % 1;
        const px = sx - D * (5 + life * 10 + i), py = sy + 1 + life * 6;
        puff(ctx, Math.round(px), Math.round(py), life < 0.5 ? 1 : 2, 0.75 * (1 - life));
      }
      return;
    }
    case 'climb': {
      const i = Math.floor(T * 8) % 4;
      const up = i < 2;
      const ph = i % 2;
      const r = rig({
        back: true, eyes: 'look', by: ph,
        hands: up ? [1, 6, 14, 10] : [1, 10, 14, 6],
        feet: up ? [6, 21, 10, 19] : [6, 19, 10, 21],
      });
      blit(ctx, F(`climb${i}`, upright(r)), sx, sy, 1, flash);
      return;
    }
    case 'float': {
      const steps = 16;
      const a = Math.round(((T * 0.9) % (Math.PI * 2)) / ((Math.PI * 2) / steps)) % steps;
      const blink = (T % 2.7) > 2.55;
      const r = rig({ by: 0, feet: [6, 21, 11, 20], hands: [2, 11, 15, 10], eyes: blink ? 'blink' : 'look' });
      const bob = Math.round(Math.sin(T * 2.2) * 1.5);
      blit(ctx, F(`float${a}${blink}`, rotated(r, (a / steps) * Math.PI * 2, 8, 12, 0, 12)), sx, sy + bob, D, flash);
      return;
    }
    case 'hurt': {
      const i = Math.floor(T * 14) % 2;
      const r = rig({ by: 1, hx: -1, eyes: 'hurt', feet: [5, 21, 10, 20], hands: [2, 8, 16, 7 + i], antenna: 2 });
      blit(ctx, F(`hurt${i}`, upright(r)), sx - D * (i ? 1 : 0), sy, D, flash);
      if (T < 0.3) {
        for (let k = 0; k < 4; k++) {
          const ang = -Math.PI / 2 + (k - 1.5) * 0.6;
          const d = 12 + T * 20;
          fillRect(ctx, '#ffe066', sx + Math.cos(ang) * d * 0.8, sy - 14 + Math.sin(ang) * d * 0.6, 1, 2);
        }
      }
      return;
    }
    case 'scared': {
      const jitter = Math.floor(T * 30) % 2;
      const blink = (T % 2.3) > 2.2;
      const r = rig({ by: 1, hx: -1, eyes: blink ? 'blink' : 'wide', feet: [7, 21, 9, 21], hands: [8, 14, 14, 10], antenna: jitter ? 1 : -1 });
      blit(ctx, F(`scared${jitter}${blink}`, upright(r)), sx + (jitter ? 1 : 0) - (D < 0 ? 1 : 0), sy, D, flash);
      // sweat drop sliding down the back of the helmet
      const k = (T * 1.4) % 1;
      const dx = sx - D * 6, dy = sy - 22 + k * 5;
      ctx.globalAlpha = 1 - k * 0.6;
      fillRect(ctx, '#8ff0ff', dx, dy, 1, 2);
      fillRect(ctx, '#ffffff', dx, dy - 1);
      fillRect(ctx, '#3e9fd8', dx, dy + 2);
      ctx.globalAlpha = 1;
      return;
    }
    case 'cheer': {
      const ph = (T * 2.4) % 1;
      const air = Math.sin(ph * Math.PI);
      const i = Math.floor(T * 6) % 2;
      const inAir = air > 0.3;
      const r = rig({
        by: inAir ? -1 : 1, eyes: 'happy', antenna: i ? 1 : -1,
        hands: i ? [2, 4, 16, 3] : [1, 5, 17, 4],
        feet: inAir ? [6, 20, 11, 20] : [6, 21, 11, 21],
      });
      blit(ctx, F(`cheer${i}${inAir}`, upright(r)), sx, sy - Math.round(air * 6), D, flash);
      for (let k = 0; k < 3; k++) {
        const life = (T * 1.5 + k / 3) % 1;
        const ang = k * 2.1 + T;
        const col = ['#ffe066', '#8ff0ff', '#ff8a2b'][k];
        if (life < 0.8) star(ctx, Math.round(sx + Math.cos(ang) * (8 + life * 8)), Math.round(sy - 26 - life * 6 + Math.sin(ang) * 3), col, life < 0.3);
      }
      return;
    }
    case 'board': {
      if (T < 0.9) {
        const i = Math.floor(T * 7) % 2;
        const r = rig({ eyes: 'happy', hands: [5, 15, 16 + i, 3 + i], antenna: i ? 1 : 0 });
        blit(ctx, F(`wave${i}`, upright(r)), sx, sy, D, flash);
      } else {
        const i = Math.floor(T * 10) % 6;
        blit(ctx, F(`run${i}`, upright(runRig(i))), sx, sy, D, flash);
      }
      return;
    }
    case 'faint': {
      if (T < 0.35) {
        const i = Math.floor(T * 10) % 2;
        const r = rig({ by: 1 + i, eyes: 'x', feet: [6, 21, 10, 21], hands: [5, 17, 12, 17], antenna: i ? 2 : -2 });
        blit(ctx, F(`wob${i}`, upright(r)), sx + (i ? 1 : -1), sy, D, flash);
        return;
      }
      const lying = T > 0.6;
      const ang = lying ? -Math.PI / 2 : -Math.PI / 4;
      const r = rig({ by: 0, eyes: 'x', feet: [6, 21, 10, 21], hands: [2, 12, 15, 13], antenna: 0 });
      // pivot at mid-body; land centred on sx with back on the ground
      const f = F(`faint${lying}`, rotated(r, ang, 8, 14, lying ? 2 : 0, lying ? 9 : 14));
      blit(ctx, f, sx, sy, D, flash);
      if (lying) {
        const hxp = sx - D * 9, hyp = sy - 14;
        for (let k = 0; k < 3; k++) {
          const a = T * 3 + (k * Math.PI * 2) / 3;
          star(ctx, Math.round(hxp + Math.cos(a) * 7), Math.round(hyp + Math.sin(a) * 2.5), k === 1 ? '#8ff0ff' : '#ffe066', Math.sin(a) > 0);
        }
      }
      return;
    }
  }
}

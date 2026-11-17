// Location backdrops at 192x108, painted in code. t = time in seconds (for small animations).
// Each scene is split into cached static layers and small animated layers, so the
// static parts can afford per-pixel shading and dithering.
import type { ArtId, PathId } from '../engine/types.ts';
import { CAST, drawPerson, drawSeated, type Person } from './people.ts';
import {
  bayer,
  bevel,
  cached,
  cone,
  disc,
  dot,
  glow,
  grad,
  grade,
  H,
  hash,
  INK,
  line,
  mix,
  outlineRect,
  rect,
  shade,
  stipple,
  text,
  textWidth,
  W,
  type Ctx,
  type Light,
  type RGB,
} from './px.ts';

export interface SceneDef {
  paint: (x: Ctx, t: number) => void;
  player: number; // x position of player
  npc: number; // x position of speaker
  floor: number; // y of feet line
  extras?: (x: Ctx, t: number) => void; // drawn after people (foreground)
}

export interface SceneOpts {
  night?: boolean; // evening tint for home scenes (bedroom, dorm, apartment)
  path?: PathId | null;
}

type Static = (x: Ctx) => void;
type Anim = (x: Ctx, t: number) => void;
interface Spec {
  player: number;
  npc: number;
  floor: number;
  bg: Static; // cached
  anim?: Anim; // per frame, over bg
  mid?: Static; // cached, over anim (e.g. buildings over moving clouds)
  anim2?: Anim; // per frame, over mid
  fg?: Static; // cached, after people
  fgAnim?: Anim; // per frame, after people
  lights?: (t: number) => Light[]; // night grading, applied last
  ambient?: RGB;
}

function build(key: string, s: Spec): SceneDef {
  const layer = (name: string, f: Static): HTMLCanvasElement => cached(`${key}:${name}`, W, H, f);
  const hasFront = !!(s.fg || s.fgAnim || s.lights);
  return {
    player: s.player,
    npc: s.npc,
    floor: s.floor,
    paint: (x, t) => {
      x.drawImage(layer('bg', s.bg), 0, 0);
      s.anim?.(x, t);
      if (s.mid) x.drawImage(layer('mid', s.mid), 0, 0);
      s.anim2?.(x, t);
    },
    extras: hasFront
      ? (x, t) => {
          if (s.fg) x.drawImage(layer('fg', s.fg), 0, 0);
          s.fgAnim?.(x, t);
          if (s.lights) grade(x, s.ambient ?? NIGHT_AMBIENT, [FILL, ...s.lights(t)]);
        }
      : undefined,
  };
}

const NIGHT_AMBIENT: RGB = [0.42, 0.44, 0.72];
const MOON: RGB = [0.7, 0.78, 1.05];
const FILL: Light = { x: 96, y: 84, r: 80, ry: 40, c: [0.66, 0.64, 0.8] };

// ---------- shared pieces ----------
const frameOf = (t: number, fps: number): number => Math.floor(t * fps);

function wall(x: Ctx, base: string, floorY: number, pattern?: (i: number, j: number) => string | null): void {
  rect(x, 0, 0, W, floorY, base);
  if (pattern)
    for (let j = 0; j < floorY - 5; j++)
      for (let i = 0; i < W; i++) {
        const c = pattern(i, j);
        if (c) dot(x, i, j, c);
      }
  // ceiling shadow and corner falloff
  stipple(x, 0, 0, W, 3, shade(base, 0.78), 0.5);
  stipple(x, 0, 3, W, 6, shade(base, 0.82), 0.25);
  stipple(x, 0, 0, 6, floorY, shade(base, 0.85), 0.3);
  stipple(x, W - 6, 0, 6, floorY, shade(base, 0.85), 0.3);
}
function baseboard(x: Ctx, floorY: number, c: string): void {
  rect(x, 0, floorY - 5, W, 1, INK);
  rect(x, 0, floorY - 4, W, 4, c);
  rect(x, 0, floorY - 4, W, 1, shade(c, 1.2));
  rect(x, 0, floorY - 1, W, 1, shade(c, 0.7));
}
function wainscot(x: Ctx, y0: number, y1: number, c: string, groove = 10): void {
  rect(x, 0, y0, W, y1 - y0, c);
  for (let i = 4; i < W; i += groove) {
    rect(x, i, y0 + 3, 1, y1 - y0 - 3, shade(c, 0.82));
    rect(x, i + 1, y0 + 3, 1, y1 - y0 - 3, shade(c, 1.1));
  }
  rect(x, 0, y0, W, 2, shade(c, 1.15));
  rect(x, 0, y0 + 2, W, 1, shade(c, 0.7));
}

// Perspective floor: per-pixel world coordinates from a vanishing point.
function perspFloor(x: Ctx, y0: number, color: (wx: number, wz: number, i: number, j: number) => string, horizon = 44): void {
  const vx = W / 2;
  const vy = y0 - horizon;
  for (let j = y0; j < H; j++) {
    const s = (j - vy) / (H - vy);
    const wz = 1 / s;
    for (let i = 0; i < W; i++) dot(x, i, j, color((i - vx) / s, wz, i, j));
  }
  rect(x, 0, y0, W, 1, 'rgba(16,8,28,0.25)');
}
function woodFloor(x: Ctx, y0: number, base: string, horizon = 44): void {
  const dark = shade(base, 0.72);
  perspFloor(
    x,
    y0,
    (wx, wz, i, j) => {
      const b = Math.floor(wx / 10);
      const fx = wx / 10 - b;
      const s = 1 / wz;
      if (fx < 0.9 / (10 * s) + 0.02) return dark; // seam
      const jz = wz * 3 + hash(b * 7) * 5;
      if (jz - Math.floor(jz) < 0.06 * wz) return dark; // board end
      let c = shade(base, 0.9 + hash(b * 13 + Math.floor(jz)) * 0.18);
      if (hash(i * 131 + j * 71) > 0.93) c = shade(c, 0.9); // grain
      if (Math.abs(wx) < 26 && wz < 1.5 && 0.18 > bayer(i, j)) c = shade(c, 1.12); // sheen
      return c;
    },
    horizon,
  );
}
function tileFloor(x: Ctx, y0: number, a: string, b: string, size = 14, horizon = 44, speck = 0): void {
  const grout = shade(b, 0.86);
  perspFloor(
    x,
    y0,
    (wx, wz, i, j) => {
      const s = 1 / wz;
      const u = wx / size;
      const v = wz * 2.2;
      const fu = u - Math.floor(u);
      const fv = v - Math.floor(v);
      if (fu < 0.9 / (size * s) || fv < 0.05 * wz) return grout;
      let c = (Math.floor(u) + Math.floor(v)) & 1 ? a : b;
      if (speck && hash(i * 97 + j * 31) < speck) c = shade(c, 0.85);
      if (Math.abs(wx) < 30 && wz < 1.35 && 0.22 > bayer(i, j)) c = shade(c, 1.07);
      return c;
    },
    horizon,
  );
}
function carpet(x: Ctx, y0: number, a: string, b: string): void {
  perspFloor(x, y0, (wx, wz, i, j) => {
    const u = Math.floor(wx / 6);
    const v = Math.floor(wz * 6);
    if ((u + v) % 4 === 0 && 0.5 > bayer(i, j)) return b;
    return hash(i * 31 + j * 17) > 0.85 ? shade(a, 0.93) : a;
  });
}
function concrete(x: Ctx, y0: number, a: string, horizon = 44): void {
  perspFloor(
    x,
    y0,
    (wx, wz, i, j) => {
      const v = wz * 1.4;
      const u = wx / 40;
      if (v - Math.floor(v) < 0.03 * wz || u - Math.floor(u) < 0.6 / (40 / wz)) return shade(a, 0.8);
      const n = hash(i * 53 + j * 101);
      return n > 0.9 ? shade(a, 0.9) : n < 0.05 ? shade(a, 1.08) : a;
    },
    horizon,
  );
}
// Furniture shadow on the floor.
function floorShadow(x: Ctx, px: number, py: number, w: number, h = 3): void {
  stipple(x, px, py, w, h, 'rgba(16,8,28,0.55)', 0.5);
}

function skyLayer(x: Ctx, px: number, py: number, w: number, h: number, stops: string[]): void {
  x.drawImage(cached(`sky:${w}x${h}:${stops.join()}`, w, h, (c) => grad(c, 0, 0, w, h, stops)), Math.round(px), Math.round(py));
}
function cloud(x: Ctx, cx: number, cy: number, w: number, c = '#ffffff', sh = '#d6e6f2'): void {
  cx = Math.round(cx);
  rect(x, cx, cy + 3, w, 3, c);
  rect(x, cx + 2, cy + 1, Math.round(w * 0.45), 3, c);
  rect(x, cx + Math.round(w * 0.38), cy, Math.round(w * 0.4), 4, c);
  rect(x, cx + 1, cy + 6, w - 2, 1, sh);
  rect(x, cx + Math.round(w * 0.55), cy + 5, Math.round(w * 0.4), 1, sh);
}
function clouds(x: Ctx, t: number, px: number, py: number, w: number, h: number, seed: number, n = 3, c?: string, sh?: string): void {
  x.save();
  x.beginPath();
  x.rect(px, py, w, h);
  x.clip();
  for (let i = 0; i < n; i++) {
    const cw = 12 + Math.floor(hash(seed + i * 5) * 16);
    const sp = 1.2 + hash(seed + i * 3) * 1.6;
    const span = w + cw + 10;
    const cx = px - cw + ((hash(seed + i) * span + t * sp) % span);
    cloud(x, cx, py + 2 + Math.floor(hash(seed + i * 9) * Math.max(1, h - 10)), cw, c, sh);
  }
  x.restore();
}
function stars(x: Ctx, t: number, px: number, py: number, w: number, h: number, n: number, seed = 0): void {
  for (let i = 0; i < n; i++) {
    const tw = (Math.floor(t * 2) + i * 3) % 11;
    if (tw === 0) continue;
    const sx = px + Math.floor(hash(seed + i * 7) * w);
    const sy = py + Math.floor(hash(seed + i * 13) * h);
    dot(x, sx, sy, tw === 1 || i % 5 === 0 ? '#ffffff' : '#c8c8f0');
  }
}
function moon(x: Ctx, cx: number, cy: number, r = 4): void {
  glow(x, cx, cy, r * 3, r * 3, '#c8d0ff', 0.25);
  disc(x, cx, cy, r, '#fff6d0');
  dot(x, cx - 1, cy + 1, '#e6dcb0');
  dot(x, cx + 1, cy - 2, '#e6dcb0');
}

// Window: static frame in bg, animated sky inside.
function windowFrame(x: Ctx, px: number, py: number, w: number, h: number, frame = '#ece4d4'): void {
  rect(x, px - 3, py - 3, w + 6, h + 6, INK);
  rect(x, px - 2, py - 2, w + 4, h + 4, frame);
  rect(x, px - 2, py - 2, w + 4, 1, shade(frame, 1.1));
  rect(x, px - 4, py + h + 2, w + 8, 3, frame); // sill
  rect(x, px - 4, py + h + 4, w + 8, 1, shade(frame, 0.7));
  outlineRect(x, px - 5, py + h + 1, w + 10, 5, INK);
  stipple(x, px - 3, py + h + 6, w + 6, 2, 'rgba(16,8,28,0.5)', 0.5);
}
function windowView(x: Ctx, t: number, px: number, py: number, w: number, h: number, night: boolean, opts: { sky?: string[]; scenery?: (x: Ctx) => void; seed?: number; frame?: string } = {}): void {
  const sky = night ? ['#0b0b26', '#141440', '#22205a'] : (opts.sky ?? ['#6cb8ec', '#9ad2f6', '#cfeafc']);
  skyLayer(x, px, py, w, h, sky);
  x.save();
  x.beginPath();
  x.rect(px, py, w, h);
  x.clip();
  if (night) {
    stars(x, t, px, py, w, h * 0.6, Math.floor(w / 4), opts.seed ?? 3);
    moon(x, px + w * 0.72, py + 7, 3);
  } else clouds(x, t, px, py, w, h * 0.6, opts.seed ?? 3, 2);
  opts.scenery?.(x);
  x.restore();
  const f = opts.frame ?? '#ece4d4';
  rect(x, px + Math.floor(w / 2) - 1, py, 2, h, f);
  rect(x, px, py + Math.floor(h / 2) - 1, w, 2, f);
  if (!night) {
    line(x, px + 3, py + h - 4, px + 8, py + h - 9, 'rgba(255,255,255,0.5)');
    line(x, px + 5, py + h - 3, px + 10, py + h - 8, 'rgba(255,255,255,0.35)');
  }
}
function curtains(x: Ctx, px: number, py: number, w: number, h: number, c: string): void {
  rect(x, px - 8, py - 6, w + 16, 2, '#6a5040');
  for (const side of [0, 1]) {
    const cx = side ? px + w - 4 : px - 8;
    rect(x, cx, py - 4, 12, h + 10, c);
    for (let k = 0; k < 12; k += 3) rect(x, cx + k, py - 4, 1, h + 10, shade(c, 0.78));
    for (let k = 1; k < 12; k += 3) rect(x, cx + k, py - 4, 1, h + 10, shade(c, 1.12));
    outlineRect(x, cx - 1, py - 5, 14, h + 12, INK);
    rect(x, cx + (side ? 0 : 0), py + h - 2, 12, 2, shade(c, 0.65)); // tie-back
  }
}
function poster(x: Ctx, px: number, py: number, w: number, h: number, bg: string, fg: string, art: 'lines' | 'mountain' | 'bolt' | 'star' | 'chart' = 'lines'): void {
  rect(x, px + 1, py + 1, w, h, 'rgba(16,8,28,0.3)');
  rect(x, px, py, w, h, bg);
  outlineRect(x, px, py, w, h, INK);
  switch (art) {
    case 'mountain':
      for (let i = 0; i < w - 4; i++) {
        const hh = Math.max(0, Math.round((h - 8) * 0.6 - Math.abs(i - (w - 4) * 0.45) * 0.9));
        rect(x, px + 2 + i, py + h - 3 - hh, 1, hh, fg);
      }
      disc(x, px + w - 6, py + 6, 2, '#ffe27a');
      break;
    case 'bolt':
      for (let k = 0; k < 6; k++) rect(x, px + w / 2 + 2 - k, py + 3 + k, 3, 1, fg);
      for (let k = 0; k < 6; k++) rect(x, px + w / 2 - 3 + k, py + 9 + k, 3, 1, fg);
      rect(x, px + 2, py + h - 5, w - 4, 2, fg);
      break;
    case 'star':
      rect(x, px + w / 2 - 1, py + 3, 2, 8, fg);
      rect(x, px + w / 2 - 4, py + 6, 8, 2, fg);
      rect(x, px + 3, py + h - 5, w - 6, 1, fg);
      break;
    case 'chart':
      for (let k = 0; k < 4; k++) rect(x, px + 3 + k * 4, py + h - 3 - (3 + k * 3), 3, 3 + k * 3, fg);
      break;
    default:
      rect(x, px + 2, py + 2, w - 4, 2, fg);
      rect(x, px + 2, py + 6, w - 6, 1, fg);
      rect(x, px + 2, py + 8, w - 5, 1, fg);
  }
}
function plant(x: Ctx, px: number, py: number, big = false): void {
  const s = big ? 1.4 : 1;
  floorShadow(x, px - 1, py + 15, 11, 2);
  rect(x, px, py + 8, 9, 7, '#b5643a');
  rect(x, px - 1, py + 8, 11, 2, '#c87a4a');
  rect(x, px + 6, py + 10, 2, 5, '#94502c');
  outlineRect(x, px - 2, py + 7, 13, 9, INK);
  const leaves: [number, number, number, number][] = [
    [3, -4, 3, 12],
    [-2, 0, 5, 3],
    [5, -1, 5, 3],
    [-1, 3, 4, 3],
    [6, 3, 4, 3],
    [1, -6, 3, 4],
    [5, -6, 2, 4],
  ];
  for (const [lx, ly, lw, lh] of leaves) rect(x, px + lx * s, py + ly * s, lw, lh, '#2f8a4a');
  for (const [lx, ly, lw] of leaves) rect(x, px + lx * s, py + ly * s, lw, 1, '#55c47e');
}
function desk(x: Ctx, px: number, py: number, w: number, top: string, front: string, h = 15): void {
  rect(x, px - 1, py - 1, w + 2, h + 2, INK);
  rect(x, px, py, w, 3, top);
  rect(x, px, py, w, 1, shade(top, 1.2));
  rect(x, px, py + 3, w, h - 3, front);
  rect(x, px, py + 3, w, 1, shade(front, 0.7));
  for (let k = px + 4; k < px + w - 4; k += 10) rect(x, k, py + 5, 1, h - 6, shade(front, 0.85));
  rect(x, px + 2, py + 6, w - 4, 1, shade(front, 0.8));
  rect(x, px + w / 2 - 2, py + 7, 4, 1, shade(top, 1.3));
}
function lampDesk(x: Ctx, px: number, py: number, shadeC = '#f2d48a'): void {
  rect(x, px - 3, py + 10, 7, 2, '#3a3a4a');
  rect(x, px, py + 3, 1, 7, '#3a3a4a');
  rect(x, px - 4, py, 9, 4, shadeC);
  rect(x, px - 3, py, 7, 1, shade(shadeC, 1.15));
  outlineRect(x, px - 5, py - 1, 11, 6, INK);
}
function sign(x: Ctx, label: string, px: number, py: number, bg: string, fg: string): void {
  const w = textWidth(label) + 6;
  rect(x, px + 1, py + 1, w, 9, 'rgba(16,8,28,0.35)');
  bevel(x, px, py, w, 9, bg);
  text(x, label, px + 3, py + 2, fg);
}
function clock(x: Ctx, cx: number, cy: number, t: number, r = 5): void {
  disc(x, cx, cy, r + 1, INK);
  disc(x, cx, cy, r, '#fbf8ee');
  for (let k = 0; k < 12; k += 3) dot(x, cx + Math.round(Math.cos((k / 12) * Math.PI * 2) * (r - 1)), cy + Math.round(Math.sin((k / 12) * Math.PI * 2) * (r - 1)), '#8a8a9a');
  const a = t * 0.6 - Math.PI / 2;
  const b = t * 0.05 - Math.PI / 3;
  line(x, cx, cy, cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), '#c0392b');
  line(x, cx, cy, cx + Math.cos(b) * (r - 2), cy + Math.sin(b) * (r - 2), INK);
}
function car(x: Ctx, px: number, py: number, body: string, flip = false): void {
  px = Math.round(px);
  py = Math.round(py);
  const hi = shade(body, 1.25);
  const lo = shade(body, 0.7);
  stipple(x, px + 1, py + 16, 34, 3, 'rgba(16,8,28,0.6)', 0.5);
  rect(x, px + 6, py - 1, 22, 9, INK);
  rect(x, px - 1, py + 5, 38, 10, INK);
  rect(x, px + 7, py, 20, 7, body);
  rect(x, px, py + 6, 36, 8, body);
  rect(x, px, py + 6, 36, 1, hi);
  rect(x, px + 7, py, 20, 1, hi);
  rect(x, px, py + 11, 36, 3, lo);
  rect(x, px + 1, py + 10, 34, 1, shade(body, 0.85));
  rect(x, px + 9, py + 2, 7, 4, '#8fcbe8');
  rect(x, px + 18, py + 2, 7, 4, '#8fcbe8');
  dot(x, px + 10, py + 2, '#e8f8ff');
  dot(x, px + 19, py + 2, '#e8f8ff');
  rect(x, px + 9, py + 5, 7, 1, '#6aa8c8');
  rect(x, px + 18, py + 5, 7, 1, '#6aa8c8');
  rect(x, px + 17, py + 7, 1, 4, lo);
  rect(x, px + 13, py + 8, 2, 1, INK);
  rect(x, px + 22, py + 8, 2, 1, INK);
  for (const wx of [px + 5, px + 24]) {
    rect(x, wx, py + 11, 8, 7, INK);
    rect(x, wx + 1, py + 12, 6, 5, '#2a2a33');
    rect(x, wx + 2, py + 13, 4, 3, '#9a9aa8');
    dot(x, wx + 3, py + 14, '#5a5a68');
  }
  rect(x, flip ? px : px + 33, py + 7, 3, 2, '#fff27a');
  rect(x, flip ? px + 33 : px, py + 7, 3, 2, '#e0503c');
  rect(x, px - 1, py + 12, 2, 2, '#b8b8c4');
  rect(x, px + 35, py + 12, 2, 2, '#b8b8c4');
}
function miniCar(x: Ctx, px: number, py: number, body: string, dir: 1 | -1): void {
  px = Math.round(px);
  rect(x, px + 4, py - 1, 14, 6, INK);
  rect(x, px - 1, py + 3, 24, 7, INK);
  rect(x, px + 5, py, 12, 4, body);
  rect(x, px, py + 4, 22, 5, body);
  rect(x, px, py + 4, 22, 1, shade(body, 1.25));
  rect(x, px + 6, py + 1, 4, 3, '#8fcbe8');
  rect(x, px + 11, py + 1, 4, 3, '#8fcbe8');
  rect(x, px + 3, py + 8, 4, 3, INK);
  rect(x, px + 15, py + 8, 4, 3, INK);
  rect(x, dir > 0 ? px + 21 : px, py + 5, 1, 1, '#fff27a');
  rect(x, dir > 0 ? px : px + 21, py + 5, 1, 1, '#e0503c');
}
function traffic(x: Ctx, t: number, y: number, seed: number, n = 3): void {
  const colors = ['#c0392b', '#3f7fd8', '#f2b632', '#eeeae0', '#3caa6a', '#6a5a8a'];
  for (let i = 0; i < n; i++) {
    const dir: 1 | -1 = i % 2 ? -1 : 1;
    const sp = 18 + hash(seed + i) * 14;
    const span = W + 70;
    const off = (hash(seed + i * 7) * span + t * sp) % span;
    const cx = dir > 0 ? off - 35 : W + 35 - off - 22;
    miniCar(x, cx, y + (dir > 0 ? 3 : 0), colors[Math.floor(hash(seed + i * 3) * colors.length)], dir);
  }
}
function skyline(x: Ctx, y: number, c: string, seed: number, lit = '#ffe9a0', litP = 0.55, roof = true): void {
  let px = -2;
  let i = 0;
  while (px < W) {
    const w = 12 + Math.floor(hash(seed + i) * 16);
    const h = 14 + Math.floor(hash(seed + i * 13) * 26);
    rect(x, px, y - h, w, h, c);
    rect(x, px + w - 2, y - h, 2, h, shade(c, 0.85));
    rect(x, px, y - h, w, 1, shade(c, 1.15));
    if (roof && hash(seed + i * 17) > 0.6) {
      rect(x, px + 3, y - h - 3, 4, 3, c);
      rect(x, px + w - 5, y - h - 6, 1, 6, shade(c, 0.85));
    }
    for (let wy = y - h + 3; wy < y - 2; wy += 5) for (let wx = px + 2; wx < px + w - 3; wx += 4) if (hash(wx * 31 + wy + seed) > litP) rect(x, wx, wy, 2, 2, lit);
    px += w + 1;
    i++;
  }
}
function tree(x: Ctx, cx: number, base: number, h: number, t = 0, leaf = '#3c8a3a'): void {
  const sway = Math.round(Math.sin(t * 1.3 + cx) * 0.6);
  rect(x, cx - 2, base - h * 0.45, 4, h * 0.45, '#6a4a2a');
  rect(x, cx + 1, base - h * 0.45, 1, h * 0.45, '#4a321c');
  const blobs: [number, number, number][] = [
    [0, -0.62, 0.32],
    [-0.28, -0.52, 0.24],
    [0.28, -0.5, 0.24],
    [-0.12, -0.8, 0.22],
    [0.16, -0.78, 0.2],
  ];
  for (const [bx, by, r] of blobs) disc(x, cx + bx * h + sway, base + by * h, Math.round(r * h) + 1, INK);
  for (const [bx, by, r] of blobs) disc(x, cx + bx * h + sway, base + by * h, Math.round(r * h), leaf);
  for (const [bx, by, r] of blobs) {
    const rr = Math.round(r * h);
    stipple(x, cx + bx * h + sway - rr + 1, base + by * h - rr + 1, rr, rr, shade(leaf, 1.3), 0.4);
    stipple(x, cx + bx * h + sway, base + by * h + 1, rr, rr - 1, shade(leaf, 0.72), 0.45);
  }
}
function bookRow(x: Ctx, sx: number, sy: number, w: number, seed: number): void {
  const cols = ['#c0392b', '#2e3f6e', '#3caa6a', '#d8a232', '#7a4ab0', '#e8e0d0', '#8a3a2a', '#2a6a6a'];
  let k = sx;
  let i = 0;
  while (k < sx + w - 2) {
    const bw = 2 + Math.floor(hash(seed + i) * 2);
    const bh = 6 + Math.floor(hash(seed + i * 3) * 4);
    if (k + bw > sx + w) break;
    if (hash(seed + i * 11) > 0.92) {
      k += bw + 1; // gap
      i++;
      continue;
    }
    const c = cols[Math.floor(hash(seed + i * 5) * cols.length)];
    rect(x, k, sy - bh, bw, bh, c);
    rect(x, k, sy - bh, 1, bh, shade(c, 1.2));
    if (bh > 7) rect(x, k, sy - bh + 2, bw, 1, shade(c, 0.6));
    k += bw;
    i++;
  }
}
function crowd(x: Ctx, people: Person[], xs: number[], y: number, t: number, rate = 1.5): void {
  people.forEach((p, i) => drawPerson(x, p, xs[i], y, Math.floor(t * rate + i) % 2, false, { face: xs[i] < W / 2 ? 1 : -1, blink: frameOf(t, 8) % 41 === i * 7 }));
}
const P = (skin: number, hair: number, style: number, shirt: string, extra: Partial<Person> = {}): Person => ({
  skin: ['#f7d7bd', '#eab38c', '#c98c62', '#a26a46', '#714a32', '#4b3022'][skin],
  hair: ['#2a1b12', '#5b3a22', '#a7652b', '#e3c26b', '#c2412f', '#14131d', '#a3a3b4'][hair],
  style,
  shirt,
  pants: '#3a3a52',
  ...extra,
});
const dim = (p: Person, f: number, tint = '#3a2a6a'): Person => ({
  ...p,
  skin: mix(shade(p.skin, f), tint, 0.25),
  hair: mix(shade(p.hair, f), tint, 0.25),
  shirt: mix(shade(p.shirt, f), tint, 0.25),
  pants: mix(shade(p.pants, f), tint, 0.25),
});

// ---------- home scenes (with night variants) ----------
function bedroom(night: boolean): Spec {
  return {
    player: 60,
    npc: 120,
    floor: 96,
    bg: (x) => {
      wall(x, '#86b0d4', 76, (i, j) => ((i % 8 === 0 && j % 8 === 0) || (i % 8 === 4 && j % 8 === 4) ? '#78a2c8' : null));
      baseboard(x, 76, '#ece4d4');
      woodFloor(x, 76, '#b07a4a');
      // rug
      for (let j = 0; j < 14; j++) {
        const hw = Math.round(44 * Math.sqrt(1 - ((j - 7) / 7.5) ** 2));
        rect(x, 100 - hw, 86 + j, hw * 2, 1, j === 0 || j === 13 ? '#8a2a3a' : '#c0485a');
        if (j > 1 && j < 12) stipple(x, 100 - hw + 3, 86 + j, hw * 2 - 6, 1, '#e8a0a0', j % 3 === 0 ? 0.5 : 0);
      }
      // window + curtains
      windowFrame(x, 124, 12, 34, 26);
      curtains(x, 124, 12, 34, 26, '#d8563c');
      // posters & pennant & corkboard
      poster(x, 14, 12, 18, 24, '#2a2a5a', '#7fd0d8', 'mountain');
      poster(x, 36, 18, 12, 16, '#e0503c', '#f2b632', 'bolt');
      rect(x, 62, 10, 26, 9, '#3caa6a');
      for (let k = 0; k < 6; k++) rect(x, 88 + k, 11 + k / 2, 1, 7 - k, '#3caa6a');
      outlineRect(x, 61, 9, 28, 11, INK);
      text(x, 'GRAD', 66, 12, '#ffffff');
      bevel(x, 92, 22, 24, 16, '#c89a64');
      stipple(x, 92, 22, 24, 16, '#b0844e', 0.4);
      rect(x, 95, 25, 7, 5, '#f2efe6');
      rect(x, 96, 26, 5, 3, '#6ab0e0');
      rect(x, 104, 24, 6, 7, '#f2efe6');
      rect(x, 105, 25, 4, 4, '#e8a070');
      rect(x, 98, 31, 9, 5, '#f2f2a0');
      for (const [a, b] of [[98, 25], [107, 24], [102, 31]]) dot(x, a, b, '#e0503c');
      // shelf with trophy & books above bed
      rect(x, 8, 40, 38, 2, '#8a5a34');
      outlineRect(x, 7, 39, 40, 4, INK);
      bookRow(x, 10, 40, 18, 5);
      rect(x, 34, 34, 5, 4, '#f2c230');
      rect(x, 35, 38, 3, 2, '#c99a18');
      // bed
      floorShadow(x, 4, 84, 50);
      rect(x, 2, 46, 6, 39, INK);
      bevel(x, 3, 47, 4, 37, '#8a5a34', false);
      rect(x, 2, 60, 52, 25, INK);
      rect(x, 3, 61, 50, 7, '#f2efe6');
      rect(x, 3, 66, 50, 2, '#d8d0c0');
      rect(x, 8, 56, 14, 7, INK);
      rect(x, 9, 57, 12, 5, '#ffffff');
      rect(x, 9, 61, 12, 1, '#d8d8e4');
      rect(x, 20, 61, 33, 16, '#3f6fc8');
      for (let k = 0; k < 33; k += 6) rect(x, 20 + k, 61, 3, 16, '#4f80d8');
      rect(x, 20, 61, 33, 1, '#7fa8f0');
      rect(x, 20, 75, 33, 2, '#2f4f98');
      rect(x, 3, 77, 50, 6, '#8a5a34');
      rect(x, 3, 77, 50, 1, '#a8744a');
      rect(x, 4, 83, 3, 2, '#5a3a20');
      rect(x, 49, 83, 3, 2, '#5a3a20');
      // dresser + clock
      floorShadow(x, 162, 78, 28);
      desk(x, 164, 56, 24, '#c08a5a', '#a06a3a', 21);
      rect(x, 168, 64, 16, 1, '#7a4a28');
      rect(x, 168, 70, 16, 1, '#7a4a28');
      dot(x, 175, 61, '#f2d48a');
      dot(x, 175, 67, '#f2d48a');
      dot(x, 175, 73, '#f2d48a');
      lampDesk(x, 170, 44, night ? '#ffe8a0' : '#f2d48a');
      rect(x, 177, 50, 10, 6, INK);
      rect(x, 178, 51, 8, 4, '#2a2a33');
    },
    anim: (x, t) => {
      windowView(x, t, 124, 12, 34, 26, night, {
        seed: 11,
        scenery: (c) => {
          rect(c, 124, 32, 34, 6, night ? '#14142a' : '#5a8a5a');
          rect(c, 130, 28, 12, 6, night ? '#1c1c34' : '#c8b8a0');
          for (let k = 0; k < 8; k++) rect(c, 128 + k, 28 - k / 2, 16 - k * 2, 1, night ? '#1c1c34' : '#a05040');
          if (night) rect(c, 135, 30, 2, 2, '#ffe9a0');
        },
      });
      // alarm clock
      const blink = frameOf(t, 2) % 2 === 0;
      text(x, night ? '11' : '7', night ? 178 : 179, 51, '#ff4a3a');
      if (blink) dot(x, night ? 186 : 183, 52, '#ff4a3a');
      // cat on the bed: tail swish, breathing
      const br = frameOf(t, 1.2) % 2;
      rect(x, 33, 55 + br, 12, 7 - br, INK);
      rect(x, 34, 56 + br, 10, 5 - br, '#e8954a');
      rect(x, 35, 56 + br, 8, 1, '#f2b070');
      rect(x, 41, 54, 5, 5, INK);
      rect(x, 42, 55, 3, 3, '#e8954a');
      dot(x, 42, 53, INK);
      dot(x, 44, 53, INK);
      const sw = Math.round(Math.sin(t * 2.2) * 2);
      rect(x, 30, 59 + sw, 4, 1, INK);
      rect(x, 30, 60 + sw, 4, 1, '#e8954a');
      if (frameOf(t, 8) % 29 < 2) dot(x, 43, 56, INK);
      else rect(x, 43, 56, 1, 1, '#2a2a33');
    },
    lights: night
      ? (t) => [
          { x: 170, y: 50, r: 70, ry: 54, c: [1.1, 0.95, 0.74] },
          { x: 141, y: 28, r: 26, c: MOON },
          { x: 182, y: 53, r: 8 + (frameOf(t, 2) % 2), c: [1.0, 0.5, 0.5] },
        ]
      : undefined,
  };
}

function dorm(night: boolean): Spec {
  const lightsX = [54, 70, 86, 102, 118, 134, 150, 166, 182];
  return {
    player: 70,
    npc: 130,
    floor: 96,
    bg: (x) => {
      // painted cinderblock
      wall(x, '#dcd3c2', 78, (i, j) => {
        const row = Math.floor(j / 7);
        const off = row % 2 ? 8 : 0;
        if (j % 7 === 6 || (i + off) % 16 === 15) return '#c2b8a4';
        if (j % 7 === 0) return '#e6dfd0';
        return null;
      });
      baseboard(x, 78, '#6a6a7a');
      tileFloor(x, 78, '#b0a28c', '#a29480', 12, 44, 0.06);
      // window with blinds frame
      windowFrame(x, 82, 10, 30, 24, '#e8e8ec');
      // posters, pennant, corkboard
      poster(x, 54, 12, 16, 22, '#9a5ad0', '#f2efe6', 'star');
      rect(x, 120, 12, 30, 9, '#c0392b');
      for (let k = 0; k < 7; k++) rect(x, 150 + k, 13 + k / 2, 1, 7 - k, '#c0392b');
      outlineRect(x, 119, 11, 32, 11, INK);
      text(x, 'STATE', 123, 14, '#f2efe6');
      // bunk bed
      floorShadow(x, 2, 80, 48);
      for (const px of [4, 44]) {
        rect(x, px - 1, 18, 4, 64, INK);
        rect(x, px, 19, 2, 62, '#8a8a9a');
        rect(x, px, 19, 1, 62, '#aaaab8');
      }
      for (const by of [30, 62]) {
        rect(x, 3, by - 6, 44, 10, INK);
        rect(x, 6, by - 5, 38, 5, by === 30 ? '#3f7fd8' : '#e0503c');
        rect(x, 6, by - 5, 38, 1, by === 30 ? '#7fa8f0' : '#f08070');
        rect(x, 8, by - 7, 10, 3, '#f2efe6');
        outlineRect(x, 7, by - 8, 12, 5, INK);
        rect(x, 4, by, 42, 3, '#7a7a8a');
      }
      rect(x, 30, 26, 6, 2, '#e8e0c0'); // book on top bunk
      // ladder
      for (let k = 0; k < 5; k++) rect(x, 44, 36 + k * 9, 8, 1, '#8a8a9a');
      rect(x, 50, 30, 2, 50, '#8a8a9a');
      outlineRect(x, 49, 29, 4, 52, INK);
      // laundry basket
      rect(x, 20, 70, 16, 12, INK);
      rect(x, 21, 71, 14, 10, '#f2efe6');
      for (let k = 0; k < 14; k += 3) rect(x, 21 + k, 73, 1, 8, '#c8c8d0');
      rect(x, 23, 68, 6, 3, '#2fb5b0');
      rect(x, 28, 67, 5, 4, '#e0503c');
      // mini fridge + microwave
      floorShadow(x, 118, 80, 22);
      bevel(x, 120, 62, 18, 18, '#e8e8ec');
      rect(x, 121, 69, 16, 1, '#a8a8b4');
      rect(x, 135, 64, 1, 4, '#8a8a9a');
      rect(x, 124, 72, 3, 3, '#f2b632');
      rect(x, 129, 73, 3, 2, '#3caa6a');
      bevel(x, 120, 52, 18, 9, '#5a5a6a');
      rect(x, 122, 54, 10, 5, '#2a2a33');
      // desk + chair
      floorShadow(x, 144, 80, 46);
      desk(x, 146, 60, 44, '#9a7a5a', '#7a5a3a', 20);
      lampDesk(x, 184, 44, night ? '#ffe8a0' : '#f2d48a');
      rect(x, 152, 46, 18, 13, INK);
      rect(x, 153, 47, 16, 11, '#3a3a48');
      rect(x, 150, 58, 22, 2, '#5a5a6a');
      rect(x, 174, 55, 6, 5, '#f2efe6');
      rect(x, 175, 54, 6, 1, '#d8d0c0');
    },
    anim: (x, t) => {
      windowView(x, t, 82, 10, 30, 24, night, {
        seed: 23,
        frame: '#e8e8ec',
        scenery: (c) => {
          rect(c, 82, 28, 30, 6, night ? '#151530' : '#7a6a5a');
          for (let k = 0; k < 4; k++) rect(c, 85 + k * 7, 30, 4, 2, night ? (k % 2 ? '#ffe9a0' : '#202040') : '#c8d8e8');
        },
      });
      // blinds pulled a third down
      for (let k = 0; k < 4; k++) {
        rect(x, 82, 10 + k * 2, 30, 1, '#f2f2f4');
        rect(x, 82, 11 + k * 2, 30, 1, '#c8c8d0');
      }
      // laptop screen
      rect(x, 154, 48, 14, 9, night ? '#284a9a' : '#3f7fd8');
      const scroll = frameOf(t, 3) % 8;
      for (let k = 0; k < 4; k++) rect(x, 156, 49 + ((k * 2 + 8 - scroll) % 8), 4 + ((k * 5) % 7), 1, '#d8e8ff');
      // microwave 12:00 blink
      if (frameOf(t, 2) % 2) text(x, '12', 123, 54, '#7fe08a');
      // string lights
      for (let i = 0; i < lightsX.length; i++) {
        const lx = lightsX[i];
        const ly = 5 + Math.round(Math.sin((i / (lightsX.length - 1)) * Math.PI) * 3);
        if (i < lightsX.length - 1) line(x, lx, ly - 1, lightsX[i + 1], 5 + Math.round(Math.sin(((i + 1) / (lightsX.length - 1)) * Math.PI) * 3) - 1, '#3a4a3a');
        const on = (i + frameOf(t, 1.5)) % 4 !== 0;
        rect(x, lx, ly, 2, 2, on ? ['#ffe27a', '#ff8ab0', '#8ae0ff'][i % 3] : '#6a6a5a');
      }
    },
    lights: night
      ? (t) => [
          { x: 184, y: 48, r: 54, ry: 44, c: [1.1, 0.96, 0.76] },
          { x: 161, y: 52, r: 22, c: [0.7, 0.85, 1.2] },
          { x: 97, y: 22, r: 22, c: MOON },
          { x: 118, y: 6, r: 40, ry: 14, c: [0.95, 0.85, 0.85 + (frameOf(t, 1.5) % 2) * 0.1] },
        ]
      : undefined,
  };
}

function apartment(night: boolean): Spec {
  return {
    player: 64,
    npc: 128,
    floor: 96,
    bg: (x) => {
      wall(x, '#e2c49a', 78, (i, j) => (i % 12 === 0 || (i % 12 === 6 && j % 4 === 0) ? '#d4b688' : null));
      wainscot(x, 52, 74, '#b88a5a');
      baseboard(x, 78, '#8a5a34');
      woodFloor(x, 78, '#9a6a44');
      rect(x, 120, 2, 18, 1, '#c8aa80'); // ceiling crack
      rect(x, 134, 3, 1, 4, '#c8aa80');
      // window + radiator
      windowFrame(x, 14, 10, 40, 30);
      floorShadow(x, 16, 78, 38);
      rect(x, 17, 60, 36, 18, INK);
      for (let k = 0; k < 34; k += 3) {
        rect(x, 18 + k, 61, 2, 16, '#d8d8dc');
        rect(x, 18 + k, 61, 1, 16, '#f2f2f4');
      }
      // couch
      floorShadow(x, 80, 78, 64, 4);
      rect(x, 83, 46, 60, 33, INK);
      rect(x, 86, 47, 54, 14, '#3a9a62');
      for (let k = 0; k < 3; k++) {
        rect(x, 87 + k * 18, 48, 16, 12, '#44aa6c');
        rect(x, 87 + k * 18, 48, 16, 1, '#6cc48c');
        rect(x, 87 + k * 18 + 15, 48, 1, 12, '#2f8050');
      }
      rect(x, 86, 61, 54, 8, '#4ab474');
      rect(x, 86, 61, 54, 1, '#7ad09a');
      rect(x, 104, 61, 1, 8, '#2f8050');
      rect(x, 122, 61, 1, 8, '#2f8050');
      rect(x, 86, 69, 54, 7, '#2f8a55');
      rect(x, 84, 52, 6, 24, '#2f8a55');
      rect(x, 136, 52, 6, 24, '#2f8a55');
      rect(x, 84, 52, 6, 1, '#58b07a');
      rect(x, 136, 52, 6, 1, '#58b07a');
      rect(x, 85, 76, 3, 2, '#4a3020');
      rect(x, 138, 76, 3, 2, '#4a3020');
      rect(x, 90, 54, 9, 8, INK);
      rect(x, 91, 55, 7, 6, '#f2b632');
      rect(x, 91, 55, 7, 1, '#f8d070');
      // framed picture
      bevel(x, 100, 18, 26, 18, '#6a4a2a');
      rect(x, 102, 20, 22, 14, '#9ad2f6');
      rect(x, 102, 28, 22, 6, '#5a9a4a');
      for (let k = 0; k < 8; k++) rect(x, 106 + k, 28 - k / 2, 12 - k * 1.4, 1, '#7a8aa0');
      // floor lamp
      rect(x, 147, 32, 2, 44, '#3a3a4a');
      rect(x, 143, 76, 10, 2, '#3a3a4a');
      rect(x, 140, 22, 16, 10, INK);
      rect(x, 141, 23, 14, 8, night ? '#ffe8b0' : '#f2dca8');
      rect(x, 141, 23, 14, 1, '#fff4d8');
      // moving box + TV
      floorShadow(x, 158, 78, 32, 3);
      bevel(x, 160, 62, 28, 16, '#c9a36a');
      rect(x, 160, 66, 28, 2, '#e8d8a8');
      text(x, 'TV', 168, 70, '#6a4a2a');
      rect(x, 161, 43, 26, 19, INK);
      rect(x, 162, 44, 24, 17, '#5a5a6a');
      rect(x, 162, 44, 24, 1, '#7a7a8a');
      rect(x, 179, 59, 2, 2, '#3caa6a');
      line(x, 168, 43, 164, 37, INK);
      line(x, 176, 43, 181, 37, INK);
      // stack of small boxes, plant
      bevel(x, 4, 66, 10, 12, '#d8b27a');
      plant(x, 2, 50);
    },
    anim: (x, t) => {
      windowView(x, t, 14, 10, 40, 30, night, {
        sky: ['#ff9a68', '#ffc488', '#ffe4b4'],
        seed: 41,
        scenery: (c) => {
          c.drawImage(
            cached(`apt-city:${night}`, 40, 12, (q) => {
              let k = 0;
              let px = 0;
              while (px < 40) {
                const w = 5 + Math.floor(hash(k + 70) * 7);
                const h = 4 + Math.floor(hash(k * 3 + 71) * 8);
                rect(q, px, 12 - h, w, h, night ? '#1a1a34' : '#a06a6a');
                for (let wy = 12 - h + 2; wy < 11; wy += 3) for (let wx = px + 1; wx < px + w - 1; wx += 2) if (hash(wx * 7 + wy * 3) > (night ? 0.5 : 0.8)) dot(q, wx, wy, '#ffe9a0');
                px += w + 1;
                k++;
              }
            }),
            14,
            28,
          );
        },
      });
      // TV picture
      const f = frameOf(t, 4);
      const tvI = Math.floor(f / 6) % 4;
      const tvC = ['#5a8ad8', '#6aa0e8', '#4a7ac8', '#e8a060'][Number.isFinite(tvI) ? (tvI + 4) % 4 : 0];
      rect(x, 164, 46, 20, 13, tvC);
      rect(x, 164, 46 + (f % 13), 20, 1, shade(tvC, 1.2));
      rect(x, 167, 52, 6, 6, shade(tvC, 0.7));
      rect(x, 175, 49, 6, 9, shade(tvC, 0.8));
      dot(x, 165, 47, '#ffffff');
    },
    lights: night
      ? (t) => [
          { x: 148, y: 32, r: 72, ry: 58, c: [1.12, 0.98, 0.76] },
          { x: 174, y: 52, r: 28 + (frameOf(t, 4) % 3), ry: 22, c: [0.75, 0.85, 1.2] },
          { x: 34, y: 25, r: 26, c: MOON },
        ]
      : undefined,
  };
}

// ---------- other scenes ----------
const SCENES_BASE: Record<Exclude<ArtId, 'bedroom' | 'dorm' | 'apartment'>, Spec> = {
  dmv: {
    player: 50,
    npc: 146,
    floor: 98,
    bg: (x) => {
      wall(x, '#d4dccb', 78);
      wainscot(x, 48, 74, '#8faa98', 16);
      baseboard(x, 78, '#5a6a5a');
      tileFloor(x, 78, '#b8b4a4', '#a6a294', 16, 44, 0.12);
      // drop ceiling
      rect(x, 0, 0, W, 8, '#e8ece2');
      for (let i = 0; i < W; i += 16) rect(x, i, 0, 1, 8, '#c4c8be');
      rect(x, 0, 8, W, 1, '#b4b8ae');
      // state seal
      disc(x, 22, 22, 10, INK);
      disc(x, 22, 22, 9, '#2b3f7a');
      disc(x, 22, 22, 6, '#f2d48a');
      text(x, 'DMV', 17, 20, '#2b3f7a');
      // now-serving board
      rect(x, 52, 13, 64, 24, INK);
      rect(x, 53, 14, 62, 22, '#16161e');
      text(x, 'NOW SERVING', 58, 16, '#ff6a4a');
      rect(x, 55, 23, 58, 1, '#2a2a34');
      // posters
      poster(x, 40, 40, 14, 18, '#f2efe6', '#c0392b', 'lines');
      text(x, 'ID', 43, 50, '#2b3f7a');
      // chairs row
      for (let i = 0; i < 3; i++) {
        const cx = 4 + i * 13;
        rect(x, cx - 1, 63, 12, 17, INK);
        rect(x, cx, 64, 10, 7, '#ff8a1e');
        rect(x, cx, 64, 10, 1, '#ffb060');
        rect(x, cx, 72, 10, 2, '#e07a10');
        rect(x, cx + 1, 74, 1, 6, '#5a5a6a');
        rect(x, cx + 8, 74, 1, 6, '#5a5a6a');
      }
      rect(x, 2, 74, 40, 1, '#5a5a6a');
      // ticket dispenser
      rect(x, 69, 60, 2, 20, '#5a5a6a');
      bevel(x, 65, 50, 10, 10, '#c0392b');
      rect(x, 67, 57, 6, 2, '#f2efe6');
      floorShadow(x, 64, 80, 12, 2);
      // back office behind the counter
      bevel(x, 104, 40, 70, 14, '#e8e0cc');
      text(x, 'WINDOW 3', 108, 44, '#2b3f7a');
      rect(x, 104, 30, 1, 10, '#5a5a6a');
      rect(x, 172, 30, 1, 10, '#5a5a6a');
      bevel(x, 178, 52, 12, 26, '#8a8a9a');
      rect(x, 180, 60, 8, 1, '#5a5a6a');
      rect(x, 180, 68, 8, 1, '#5a5a6a');
    },
    anim: (x, t) => {
      // fluorescent tubes, one flickering
      for (let i = 0; i < 4; i++) {
        const cx = 8 + i * 48;
        const flick = i === 2 && (frameOf(t, 8) % 23 < 3 || frameOf(t, 8) % 23 === 5);
        rect(x, cx, 2, 28, 4, flick ? '#c8ccc4' : '#fffef0');
        rect(x, cx, 2, 28, 1, flick ? '#b8bcb4' : '#ffffff');
      }
      // queue number
      const n = 41 + (Math.floor(t / 5) % 9);
      const flash = t % 5 < 1 && frameOf(t, 4) % 2 === 0;
      if (!flash) text(x, `A-0${n}`, 72, 27, '#ffd23a');
      // waiting customers
      drawSeated(x, P(1, 3, 1, '#9a5ad0', { pants: '#2f3a5c' }), 4, 70, frameOf(t, 1.1), 1, frameOf(t, 8) % 37 === 3);
      drawPerson(x, P(4, 0, 4, '#c0392b', { holds: 'phone', pants: '#3a3a4a' }), 28, 50, frameOf(t, 0.9) % 2, false, { face: -1, blink: frameOf(t, 8) % 43 === 9 });
    },
    fg: (x) => {
      // customer counter (only the clerk's side), glass partition frame
      rect(x, 104, 30, 2, 57, '#8a9aa8');
      rect(x, 190, 30, 2, 57, '#8a9aa8');
      rect(x, 104, 30, 88, 2, '#8a9aa8');
      outlineRect(x, 103, 29, 90, 59, INK);
      line(x, 108, 80, 118, 70, 'rgba(255,255,255,0.45)');
      line(x, 110, 82, 122, 70, 'rgba(255,255,255,0.3)');
      line(x, 176, 50, 186, 40, 'rgba(255,255,255,0.4)');
      rect(x, 101, 87, 91, 21, INK);
      rect(x, 102, 88, 90, 3, '#e2dacb');
      rect(x, 102, 88, 90, 1, '#f4eee2');
      rect(x, 102, 91, 90, 17, '#8a7a6a');
      for (let k = 106; k < W; k += 14) {
        rect(x, k, 93, 10, 12, '#7a6a5a');
        rect(x, k, 93, 10, 1, '#9a8a7a');
      }
      // monitor on the counter
      rect(x, 166, 75, 18, 13, INK);
      rect(x, 167, 76, 16, 10, '#3a3a48');
      rect(x, 168, 77, 14, 8, '#3a6aa8');
      rect(x, 173, 86, 4, 2, '#5a5a6a');
      rect(x, 112, 85, 12, 3, '#f2efe6'); // forms
      rect(x, 113, 84, 12, 1, '#e2dccb');
    },
  },

  bank: {
    player: 56,
    npc: 146,
    floor: 98,
    bg: (x) => {
      wall(x, '#ece4d2', 78, (i, j) => (hash(i * 7 + j * 131) > 0.995 || (j + Math.floor(i / 3)) % 47 === 0 ? '#d8cfb8' : null));
      wainscot(x, 52, 74, '#7a4e30', 12);
      baseboard(x, 78, '#5a3a20');
      tileFloor(x, 78, '#e0d6c0', '#a8987c', 16, 44, 0.04);
      // columns
      for (const px of [62, 92]) {
        rect(x, px - 3, 4, 16, 4, '#d9cfb8');
        rect(x, px - 3, 68, 16, 6, '#d9cfb8');
        outlineRect(x, px - 4, 3, 18, 6, INK);
        outlineRect(x, px - 4, 67, 18, 8, INK);
        rect(x, px, 9, 10, 58, '#f6f0e0');
        rect(x, px, 9, 2, 58, '#ffffff');
        rect(x, px + 7, 9, 3, 58, '#d4cab0');
        for (let k = px + 3; k < px + 7; k += 2) rect(x, k, 9, 1, 58, '#e2d8c4');
        outlineRect(x, px - 1, 8, 12, 60, INK);
      }
      // vault door
      disc(x, 24, 38, 19, INK);
      disc(x, 24, 38, 18, '#9aa0a8');
      disc(x, 24, 38, 15, '#b8bec6');
      disc(x, 24, 38, 13, '#a4aab2');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        disc(x, 24 + Math.cos(a) * 16, 38 + Math.sin(a) * 16, 1, '#6a7078');
      }
      disc(x, 24, 38, 4, '#6a7078');
      stipple(x, 10, 26, 10, 10, '#ffffff', 0.25);
      // rate board
      rect(x, 104, 10, 60, 28, INK);
      rect(x, 105, 11, 58, 26, '#22305a');
      rect(x, 105, 11, 58, 1, '#3a4a7a');
      text(x, 'SAVINGS APY', 112, 14, '#f2d48a');
      rect(x, 107, 29, 54, 7, '#16203e');
      clockStatic(x, 182, 18);
      // stanchions
      for (const sx of [72, 96]) {
        rect(x, sx, 84, 2, 14, '#c9a032');
        rect(x, sx - 2, 97, 6, 2, '#a07a18');
        rect(x, sx - 1, 83, 4, 2, '#f2d060');
      }
      for (let k = 0; k < 22; k++) dot(x, 74 + k, 86 + Math.round(Math.sin((k / 22) * Math.PI) * 3), '#a02040');
      // teller cage behind counter
      bevel(x, 110, 40, 80, 8, '#5a3a20');
      text(x, 'TELLER', 138, 41, '#f2d48a');
      plant(x, 40, 64, true);
    },
    anim: (x, t) => {
      text(x, `${(4.0 + Math.round(Math.sin(t * 0.5) * 2) / 100).toFixed(2)}%`, 118, 22, '#7fe08a');
      x.save();
      x.beginPath();
      x.rect(107, 29, 54, 7);
      x.clip();
      const msg = 'CD 4.50%  AUTO LOAN 6.9%  CHECKING 0.01%  ';
      const off = Math.floor(t * 10) % (msg.length * 4);
      text(x, msg + msg, 107 - off, 30, '#ffd23a');
      x.restore();
      clock(x, 182, 18, t, 5);
      // vault glint
      const g = frameOf(t, 8) % 40;
      if (g < 6) line(x, 10 + g * 3, 30, 14 + g * 3, 24, '#ffffff');
    },
    fg: (x) => {
      // brass cage posts with an opening at the teller
      for (const px of [110, 188]) {
        rect(x, px, 48, 2, 39, '#c9a032');
        rect(x, px, 48, 1, 39, '#f2d060');
      }
      for (let k = 114; k < 130; k += 3) rect(x, k, 48, 1, 39, '#b8901e');
      for (let k = 166; k < 186; k += 3) rect(x, k, 48, 1, 39, '#b8901e');
      rect(x, 110, 48, 80, 1, '#f2d060');
      rect(x, 104, 87, 88, 21, INK);
      rect(x, 105, 88, 87, 3, '#8a5a34');
      rect(x, 105, 88, 87, 1, '#b07a4a');
      rect(x, 105, 91, 87, 1, '#c9a032');
      rect(x, 105, 92, 87, 16, '#5a3a20');
      for (let k = 110; k < W; k += 20) {
        rect(x, k, 94, 15, 12, '#4a2e18');
        outlineRect(x, k, 94, 15, 12, '#6a4a2a');
      }
      rect(x, 170, 84, 8, 4, '#3a3a4a'); // pen stand
      rect(x, 176, 79, 1, 6, '#2a2a33');
      rect(x, 118, 85, 10, 3, '#f2efe6');
    },
  },

  dentist: {
    player: 56,
    npc: 124,
    floor: 98,
    bg: (x) => {
      wall(x, '#cfeef0', 80);
      // tiled wainscot
      rect(x, 0, 52, W, 24, '#a8dce0');
      for (let j = 52; j < 76; j += 6) rect(x, 0, j, W, 1, '#90c8cc');
      for (let j = 52; j < 76; j += 6) for (let i = (j / 6) % 2 ? 0 : 3; i < W; i += 6) rect(x, i, j, 1, 6, '#90c8cc');
      rect(x, 0, 51, W, 1, INK);
      baseboard(x, 80, '#5a9aa0');
      tileFloor(x, 80, '#eef6f6', '#d4e6e6', 12);
      windowFrame(x, 152, 10, 30, 24, '#f4f8f8');
      // x-ray lightbox
      rect(x, 11, 11, 30, 22, INK);
      rect(x, 12, 12, 28, 20, '#1e2a34');
      // cabinet + fish tank
      floorShadow(x, 2, 80, 44);
      bevel(x, 4, 60, 40, 20, '#f4f4f0');
      rect(x, 23, 61, 1, 18, '#c8c8c4');
      rect(x, 18, 68, 3, 1, '#8a9aa8');
      rect(x, 26, 68, 3, 1, '#8a9aa8');
      rect(x, 5, 41, 38, 19, INK);
      // tooth sign
      rect(x, 55, 7, 18, 14, INK);
      rect(x, 56, 8, 16, 11, '#ffffff');
      rect(x, 56, 19, 6, 6, INK);
      rect(x, 66, 19, 6, 6, INK);
      rect(x, 57, 19, 4, 5, '#ffffff');
      rect(x, 67, 19, 4, 5, '#ffffff');
      rect(x, 58, 9, 4, 2, '#e8f8ff');
      text(x, 'SMILE', 79, 10, '#2fb5b0');
      // dental chair
      floorShadow(x, 78, 80, 54, 3);
      rect(x, 96, 70, 8, 11, INK);
      rect(x, 97, 70, 6, 10, '#8a9aa8');
      rect(x, 90, 79, 20, 2, '#6a7a88');
      rect(x, 79, 61, 46, 10, INK);
      rect(x, 80, 62, 44, 8, '#2fb5b0');
      rect(x, 80, 62, 44, 1, '#6ad8d0');
      rect(x, 80, 68, 44, 2, '#249a94');
      for (let k = 0; k < 18; k++) rect(x, 118 + k / 3, 61 - k, 8, 1, k === 17 ? INK : '#2fb5b0');
      for (let k = 0; k < 18; k++) dot(x, 117 + k / 3, 61 - k, INK);
      for (let k = 0; k < 18; k++) dot(x, 126 + k / 3, 61 - k, INK);
      rect(x, 122, 40, 9, 5, INK);
      rect(x, 123, 41, 7, 3, '#249a94');
      // tray arm
      rect(x, 70, 54, 2, 10, '#8a9aa8');
      rect(x, 64, 51, 16, 4, INK);
      rect(x, 65, 52, 14, 2, '#d8e0e8');
      dot(x, 67, 51, '#8a9aa8');
      dot(x, 71, 51, '#8a9aa8');
      dot(x, 75, 51, '#8a9aa8');
      // overhead lamp arm
      rect(x, 100, 0, 2, 20, '#8a9aa8');
      rect(x, 100, 20, 14, 2, '#8a9aa8');
      outlineRect(x, 99, 0, 4, 22, INK);
    },
    anim: (x, t) => {
      // x-ray glow flicker
      const xr = frameOf(t, 8) % 31 === 0 ? '#9ab8c8' : '#c8e4f0';
      rect(x, 13, 13, 26, 18, '#2a4a5a');
      for (let k = 0; k < 6; k++) {
        rect(x, 14 + k * 4, 15 + (k === 0 || k === 5 ? 2 : 0), 3, 5, xr);
        rect(x, 14 + k * 4, 24 - (k === 0 || k === 5 ? 2 : 0), 3, 5, xr);
      }
      // fish tank
      skyLayer(x, 6, 42, 36, 17, ['#5ab8e0', '#2a7ab0']);
      rect(x, 6, 42, 36, 2, '#9ad8f0');
      rect(x, 6, 56, 36, 3, '#d8c890');
      for (const [px, h] of [[10, 9], [14, 6], [36, 8]] as const) {
        rect(x, px, 56 - h, 1, h, '#3caa6a');
        dot(x, px + 1 + (frameOf(t, 2) % 2), 54 - h, '#55c47e');
      }
      for (let i = 0; i < 3; i++) {
        const span = 30;
        const pos = (t * (5 + i * 2) + i * 11) % (span * 2);
        const dir = pos < span ? 1 : -1;
        const fx = 8 + (pos < span ? pos : span * 2 - pos);
        const fy = 46 + i * 3 + Math.round(Math.sin(t * 2 + i) * 1);
        const c = ['#ff8a1e', '#f2c230', '#ef7fae'][i];
        rect(x, fx, fy, 3, 2, c);
        dot(x, dir > 0 ? fx - 1 : fx + 3, fy + (frameOf(t, 4) % 2), c);
        dot(x, dir > 0 ? fx + 2 : fx, fy, INK);
      }
      for (let i = 0; i < 3; i++) dot(x, 30 + i * 2, 55 - ((t * 6 + i * 5) % 12), '#e8f8ff');
      // window
      windowView(x, t, 152, 10, 30, 24, false, { seed: 7, frame: '#f4f8f8' });
      // lamp head and beam
      const on = frameOf(t, 8) % 53 !== 0;
      rect(x, 108, 22, 12, 5, INK);
      rect(x, 109, 23, 10, 3, on ? '#fffef0' : '#c8c8c0');
      if (on) cone(x, 114, 27, 60, 10, 26, '#fff8c0', 0.28);
    },
  },

  clinic: {
    player: 56,
    npc: 124,
    floor: 98,
    bg: (x) => {
      wall(x, '#e2ecf4', 80);
      rect(x, 0, 48, W, 28, '#cbd8e4');
      rect(x, 0, 46, W, 3, '#3caa6a');
      rect(x, 0, 46, W, 1, '#6ac48a');
      rect(x, 0, 49, W, 1, INK);
      baseboard(x, 80, '#5a6a7a');
      tileFloor(x, 80, '#eaf0f6', '#d4dce6', 12, 44, 0.05);
      sign(x, 'URGENT CARE', 70, 8, '#e0503c', '#ffffff');
      // eye chart
      bevel(x, 52, 22, 12, 20, '#ffffff');
      rect(x, 56, 24, 4, 4, INK);
      for (let k = 0; k < 4; k++) rect(x, 54 + k / 2, 30 + k * 3, 8 - k, 1, INK);
      // monitor on wall arm
      rect(x, 22, 34, 2, 10, '#8a9aa8');
      rect(x, 13, 15, 30, 21, INK);
      rect(x, 14, 16, 28, 19, '#101c18');
      // sink cabinet
      floorShadow(x, 0, 80, 40);
      bevel(x, 2, 60, 36, 20, '#e8e8f0');
      rect(x, 19, 61, 1, 18, '#b8b8c4');
      rect(x, 1, 57, 38, 4, INK);
      rect(x, 2, 58, 36, 2, '#c8c8d0');
      rect(x, 14, 51, 2, 7, '#a8b0b8');
      rect(x, 14, 51, 6, 2, '#a8b0b8');
      bevel(x, 28, 50, 6, 7, '#7fd0d8');
      bevel(x, 4, 52, 8, 5, '#3f7fd8');
      // exam table
      floorShadow(x, 74, 80, 56, 3);
      rect(x, 75, 60, 52, 9, INK);
      rect(x, 76, 61, 50, 7, '#6a8aa8');
      rect(x, 76, 61, 50, 1, '#8aaac8');
      rect(x, 84, 61, 34, 3, '#fbfbf8');
      rect(x, 79, 69, 44, 11, INK);
      rect(x, 80, 69, 42, 10, '#e8e8f0');
      for (let k = 0; k < 3; k++) {
        rect(x, 82 + k * 14, 71, 11, 6, '#d8d8e4');
        rect(x, 86 + k * 14, 73, 3, 1, '#8a9aa8');
      }
      rect(x, 118, 54, 8, 7, INK);
      rect(x, 119, 55, 6, 6, '#6a8aa8');
      // curtain rail
      rect(x, 140, 4, 52, 2, '#8a9aa8');
      // IV pole
      rect(x, 136, 18, 1, 62, '#8a9aa8');
      rect(x, 133, 79, 7, 1, '#6a7a88');
      rect(x, 134, 18, 5, 8, INK);
      rect(x, 135, 19, 3, 6, '#d8eef8');
    },
    anim: (x, t) => {
      // heart monitor trace
      const sc = frameOf(t, 8);
      for (let i = 0; i < 26; i++) {
        const ph = (i + sc) % 13;
        const yy = ph === 5 ? -6 : ph === 6 ? 3 : ph === 4 ? -2 : 0;
        dot(x, 15 + i, 27 + yy, i === 25 ? '#ffffff' : '#3cff7a');
      }
      text(x, String(70 + (Math.floor(t / 3) % 5)), 16, 17, '#3cff7a');
      if (sc % 13 === 5) dot(x, 39, 17, '#ff4a4a');
      // curtain with a gentle sway
      const sw = Math.round(Math.sin(t * 0.9) * 1);
      for (let k = 0; k < 40; k++) {
        const cx = 152 + k + (k > 20 ? sw : 0);
        const c = k % 5 === 0 ? '#8ab0d0' : k % 5 === 2 ? '#c8e0f4' : '#a8c8e4';
        rect(x, cx, 6, 1, 70 - (k % 5 === 0 ? 0 : 1), c);
      }
      rect(x, 151, 6, 1, 70, INK);
      for (let k = 152; k < W; k += 5) rect(x, k, 5, 2, 2, '#6a7a88');
    },
  },

  grocery: {
    player: 50,
    npc: 128,
    floor: 98,
    bg: (x) => {
      wall(x, '#f2efe6', 80);
      baseboard(x, 80, '#3caa6a');
      tileFloor(x, 80, '#efe9db', '#ddd5c2', 14, 46, 0.03);
      rect(x, 0, 0, W, 7, '#dcd8cc');
      sign(x, 'FRESH FIELDS', 58, 9, '#2f8a4a', '#ffffff');
      disc(x, 54, 13, 3, '#3caa6a');
      rect(x, 54, 13, 1, 4, '#2f6a3a');
      // gondola shelves
      for (let s = 0; s < 3; s++) {
        const sx = 4 + s * 50;
        const w = 46;
        rect(x, sx - 1, 21, w + 2, 58, INK);
        rect(x, sx, 22, w, 56, '#c8b49a');
        rect(x, sx, 22, 2, 56, '#b49a7e');
        stipple(x, sx + 2, 22, w - 2, 56, '#b8a488', 0.25);
        for (let r = 0; r < 4; r++) {
          const by = 33 + r * 12;
          // products by row type
          for (let k = 0; k < 11; k++) {
            const px = sx + 2 + k * 4;
            const c = ['#e0503c', '#f2b632', '#3caa6a', '#3f7fd8', '#ef7fae', '#9a5ad0', '#ff8a1e'][(k * 3 + r * 5 + s * 2) % 7];
            if (r === 0) {
              rect(x, px, by - 9, 3, 9, c);
              rect(x, px, by - 7, 3, 2, '#f2efe6');
              rect(x, px, by - 9, 1, 9, shade(c, 1.2));
            } else if (r === 1) {
              rect(x, px, by - 5, 3, 5, '#c8ccd4');
              rect(x, px, by - 4, 3, 2, c);
              dot(x, px, by - 5, '#ffffff');
              rect(x, px, by - 10, 3, 5, '#c8ccd4');
              rect(x, px, by - 9, 3, 2, c);
            } else if (r === 2) {
              rect(x, px + 1, by - 9, 1, 2, shade(c, 0.7));
              rect(x, px, by - 7, 3, 7, c);
              rect(x, px, by - 7, 1, 7, shade(c, 1.25));
            } else {
              rect(x, px, by - 6, 4, 6, shade(c, 0.9));
              rect(x, px, by - 6, 4, 1, shade(c, 1.2));
            }
          }
          rect(x, sx, by, w, 2, '#8a7a6a');
          rect(x, sx, by + 2, w, 1, '#f8f8f0');
          for (let k = 3; k < w - 3; k += 9) dot(x, sx + k, by + 2, '#e0503c');
        }
        rect(x, sx, 72, w, 6, '#9a8670');
      }
      // lane light pole
      rect(x, 186, 26, 2, 54, '#6a6a7a');
      // cart
      floorShadow(x, 2, 96, 26, 2);
      outlineRect(x, 4, 80, 22, 10, '#8a9aa8');
      for (let k = 6; k < 26; k += 3) rect(x, k, 80, 1, 10, '#a8b4c0');
      for (let k = 82; k < 90; k += 3) rect(x, 4, k, 22, 1, '#a8b4c0');
      line(x, 26, 80, 30, 74, '#8a9aa8');
      rect(x, 6, 90, 18, 1, '#8a9aa8');
      disc(x, 8, 94, 1, INK);
      disc(x, 22, 94, 1, INK);
      rect(x, 8, 78, 6, 4, '#f2b632');
      rect(x, 15, 77, 4, 5, '#3caa6a');
    },
    anim: (x, t) => {
      for (let i = 0; i < 4; i++) {
        const cx = 6 + i * 48;
        const flick = i === 1 && frameOf(t, 8) % 37 < 2;
        rect(x, cx, 2, 30, 3, flick ? '#c8c4b8' : '#fffef0');
      }
      // hanging aisle signs, gently swinging
      for (const [cx, label] of [
        [27, 'AISLE 3'],
        [127, 'AISLE 5'],
      ] as const) {
        const sw = Math.round(Math.sin(t * 1.4 + cx) * 1);
        rect(x, cx - 6, 7, 1, 6, '#6a6a7a');
        rect(x, cx + 6, 7, 1, 6, '#6a6a7a');
        rect(x, cx - 15 + sw, 13, 31, 8, INK);
        rect(x, cx - 14 + sw, 14, 29, 6, '#2b5fa8');
        text(x, label, cx - 13 + sw, 15, '#ffffff');
      }
      // lane light
      rect(x, 182, 18, 10, 9, INK);
      rect(x, 183, 19, 8, 7, frameOf(t, 2) % 2 ? '#ffe27a' : '#c8a020');
      text(x, '3', 186, 20, '#2a2a33');
    },
    fg: (x) => {
      rect(x, 147, 82, 46, 26, INK);
      rect(x, 148, 83, 44, 4, '#3a3a44');
      rect(x, 148, 87, 44, 21, '#5a6a5a');
      rect(x, 148, 87, 44, 1, '#7a8a7a');
      for (let k = 152; k < W; k += 10) rect(x, k, 90, 7, 15, '#4a5a4a');
      // register
      rect(x, 160, 70, 16, 12, INK);
      rect(x, 161, 71, 14, 10, '#d8d8dc');
      rect(x, 162, 72, 12, 5, '#1c1c24');
      rect(x, 163, 78, 10, 2, '#a8a8b4');
    },
    fgAnim: (x, t) => {
      const off = Math.floor(t * 6) % 4;
      for (let k = 148 - 4 + off; k < W; k += 4) rect(x, k, 84, 1, 2, '#4a4a56');
      const items = ['#e0503c', '#f2b632', '#3caa6a'];
      for (let i = 0; i < 3; i++) {
        const ix = 148 + ((t * 6 + i * 16) % 44);
        rect(x, ix, 80 - (i % 2), 4, 3 + (i % 2), items[i]);
      }
      text(x, frameOf(t, 1) % 2 ? '$4.99' : '$12.4', 163, 72, '#7fe08a');
    },
  },

  warehouse: {
    player: 54,
    npc: 128,
    floor: 98,
    bg: (x) => {
      // corrugated wall
      rect(x, 0, 0, W, 80, '#6a7380');
      for (let i = 0; i < W; i += 4) {
        rect(x, i, 14, 1, 66, '#7a8490');
        rect(x, i + 2, 14, 1, 66, '#5a626e');
      }
      grad(x, 0, 0, W, 16, ['#2a2e36', '#3a404a', '#4a525c']);
      // trusses
      for (let i = 0; i < W; i += 24) {
        line(x, i, 14, i + 12, 4, '#7a8290');
        line(x, i + 12, 4, i + 24, 14, '#7a8290');
      }
      rect(x, 0, 3, W, 1, '#7a8290');
      rect(x, 0, 14, W, 1, '#7a8290');
      // dock door
      rect(x, 3, 24, 40, 56, INK);
      grad(x, 4, 52, 38, 28, ['#cfe4f0', '#f4f0e0']);
      rect(x, 4, 66, 38, 14, '#8a8a90');
      rect(x, 8, 56, 30, 10, '#e8e8ec'); // trailer
      rect(x, 8, 56, 30, 1, '#ffffff');
      for (let j = 25; j < 52; j += 3) {
        rect(x, 4, j, 38, 2, '#9aa4b0');
        rect(x, 4, j + 2, 38, 1, '#7a8490');
      }
      for (let i = 0; i < 38; i += 6) {
        rect(x, 4 + i, 51, 3, 2, '#f2c230');
        rect(x, 7 + i, 51, 3, 2, INK);
      }
      // racks
      for (const [rx, rw] of [
        [50, 70],
        [124, 66],
      ] as const) {
        rect(x, rx, 18, 3, 62, '#ff8a1e');
        rect(x, rx + rw - 3, 18, 3, 62, '#ff8a1e');
        rect(x, rx, 18, 1, 62, '#ffb060');
        outlineRect(x, rx - 1, 17, 5, 64, INK);
        outlineRect(x, rx + rw - 4, 17, 5, 64, INK);
        for (let s = 0; s < 3; s++) {
          const by = 32 + s * 16;
          rect(x, rx + 3, by - 1, rw - 6, 1, INK);
          rect(x, rx + 3, by, rw - 6, 2, '#2b5fa8');
          rect(x, rx + 3, by + 2, rw - 6, 1, INK);
          // pallets of boxes
          for (let b = 0; b < Math.floor((rw - 8) / 20); b++) {
            const bx = rx + 5 + b * 20;
            const hgt = 8 + Math.floor(hash(rx + s * 7 + b) * 4);
            rect(x, bx, by - 2, 18, 2, '#a07a4a');
            rect(x, bx - 1, by - 3 - hgt, 20, hgt + 1, INK);
            rect(x, bx, by - 2 - hgt, 18, hgt, '#c9a36a');
            rect(x, bx, by - 2 - hgt, 18, 1, '#e0c08a');
            rect(x, bx + 8, by - 2 - hgt, 2, hgt, '#d8b880');
            rect(x, bx + 9, by - 2 - hgt, 1, hgt, '#a8844e');
            if (hash(b + s * 3 + rx) > 0.5) stipple(x, bx, by - 2 - hgt, 18, hgt, '#e8eef4', 0.25);
          }
        }
      }
      sign(x, 'PARCELPOINT', 70, 3, '#2b2b38', '#ff8a1e');
      bevel(x, 152, 4, 34, 10, '#f2efe6');
      text(x, 'SAFE:', 154, 7, '#2a2a33');
      text(x, '112', 174, 7, '#2f8a4a');
      // floor
      concrete(x, 80, '#8e9096', 46);
      perspLines(x, 80, [-62, 62], '#f2c230');
      for (const cx of [30, 96, 140]) cone(x, cx, 16, 80, 8, 40, '#f6f2d0', 0.16);
    },
    anim: (x, t) => {
      for (const cx of [30, 96, 140]) {
        const flick = cx === 140 && frameOf(t, 8) % 29 < 2;
        rect(x, cx, 4, 1, 8, '#3a3a44');
        rect(x, cx - 5, 12, 11, 4, INK);
        rect(x, cx - 4, 13, 9, 2, flick ? '#9a9a90' : '#fffef0');
      }
      // conveyor
      rect(x, 44, 63, W - 44, 7, INK);
      rect(x, 45, 64, W - 45, 4, '#4a4a54');
      const off = Math.floor(t * 8) % 6;
      for (let k = 45 + off; k < W; k += 6) rect(x, k, 64, 1, 4, '#3a3a44');
      for (let k = 52; k < W; k += 30) rect(x, k, 70, 2, 10, '#5a5a64');
      for (let i = 0; i < 4; i++) {
        const span = W - 40;
        const bx = 44 + ((t * 9 + i * (span / 4)) % span);
        const bw = 9 + (i % 2) * 3;
        if (bx + bw > W) continue;
        rect(x, bx - 1, 56 + (i % 2), bw + 2, 9 - (i % 2), INK);
        rect(x, bx, 57 + (i % 2), bw, 7 - (i % 2), '#c9a36a');
        rect(x, bx, 57 + (i % 2), bw, 1, '#e0c08a');
        rect(x, bx + 2, 59 + (i % 2), 3, 2, '#f2efe6');
      }
    },
  },

  jobsite: {
    player: 56,
    npc: 120,
    floor: 98,
    bg: (x) => {
      grad(x, 0, 0, W, 64, ['#5aa8e4', '#8cc8f0', '#c8e6f8', '#e8f4fa']);
    },
    anim: (x, t) => {
      clouds(x, t, 0, 2, W, 30, 91, 4);
      // crane hook swinging
      const sw = Math.sin(t * 0.8) * 3;
      line(x, 72, 8, 72 + sw, 30, '#3a3a44');
      rect(x, 70 + sw, 30, 4, 3, '#f2c230');
    },
    mid: (x) => {
      // distant tree line
      for (let i = 0; i < W; i += 6) {
        const h = 6 + Math.floor(hash(i + 3) * 6);
        disc(x, i + 3, 62 - h / 2, Math.ceil(h / 2) + 1, '#6a9a8a');
      }
      rect(x, 0, 60, W, 6, '#6a9a8a');
      // crane
      for (let j = 6; j < 66; j += 4) {
        line(x, 10, j, 15, j + 4, '#e0a020');
        line(x, 15, j, 10, j + 4, '#e0a020');
      }
      rect(x, 9, 6, 1, 60, '#c08010');
      rect(x, 15, 6, 1, 60, '#c08010');
      rect(x, 4, 6, 82, 2, '#e0a020');
      rect(x, 4, 8, 82, 1, '#c08010');
      rect(x, 2, 4, 8, 4, '#5a5a6a');
      // framed house
      rect(x, 26, 76, 140, 3, '#b08a54');
      for (let i = 26; i <= 162; i += 8) {
        rect(x, i, 34, 3, 42, '#d8b27a');
        rect(x, i + 2, 34, 1, 42, '#b08a54');
      }
      rect(x, 26, 32, 140, 3, '#c9a36a');
      rect(x, 26, 32, 140, 1, '#e8c890');
      rect(x, 26, 54, 140, 2, '#c9a36a');
      for (let i = 0; i < 72; i++) {
        const yy = 32 - Math.floor(i / 3.1);
        rect(x, 26 + i, yy, 2, 2, '#c9a36a');
        rect(x, 165 - i, yy, 2, 2, '#c9a36a');
      }
      for (let i = 34; i < 160; i += 12) {
        const hh = Math.max(0, 23 - Math.abs(i + 1 - 96) / 3.1);
        rect(x, i, 32 - hh, 2, hh, '#d8b27a');
      }
      // sheathing on the left wall
      for (let j = 34; j < 76; j++)
        for (let i = 26; i < 58; i++) {
          const n = hash(i * 13 + j * 7);
          dot(x, i, j, n > 0.7 ? '#b08a50' : n > 0.35 ? '#c8a262' : '#d4b070');
        }
      rect(x, 42, 34, 1, 42, '#a07a40');
      rect(x, 26, 55, 32, 1, '#a07a40');
      // window header on the right
      rect(x, 130, 44, 26, 3, '#b08a54');
      rect(x, 130, 62, 26, 2, '#b08a54');
      // electrical: panel + boxes + wire runs
      bevel(x, 108, 40, 10, 16, '#a8b0b8');
      for (let k = 0; k < 5; k++) rect(x, 110, 42 + k * 3, 6, 1, '#3a3a44');
      for (const bx of [70, 86, 140]) {
        rect(x, bx, 60, 4, 6, '#3f7fd8');
        outlineRect(x, bx - 1, 59, 6, 8, INK);
      }
      rect(x, 72, 48, 1, 12, '#c0392b');
      rect(x, 72, 48, 36, 1, '#c0392b');
      rect(x, 88, 50, 1, 10, '#f2c230');
      rect(x, 88, 50, 20, 1, '#f2c230');
      rect(x, 118, 52, 24, 1, '#2a2a33');
      rect(x, 141, 52, 1, 8, '#2a2a33');
      // ground
      for (let j = 78; j < H; j++)
        for (let i = 0; i < W; i++) {
          const n = hash(i * 31 + j * 17);
          dot(x, i, j, n > 0.92 ? '#7a5a3a' : n > 0.86 ? '#b8946a' : j < 81 ? '#8a6a46' : '#9a7a54');
        }
      for (let i = 0; i < W; i++) if (hash(i * 5) > 0.6) dot(x, i, 78, '#6a8a4a');
      // tire tracks
      for (let j = 84; j < H; j += 2) {
        rect(x, 80 + (j - 84) * 0.6, j, 3, 1, '#8a6a46');
        rect(x, 96 + (j - 84) * 0.9, j, 3, 1, '#8a6a46');
      }
      // lumber pile + sawhorse
      for (let k = 0; k < 3; k++) {
        rect(x, 2, 78 + k * 4, 34, 4, INK);
        rect(x, 3, 79 + k * 4, 32, 2, '#d8b27a');
        rect(x, 3, 79 + k * 4, 32, 1, '#ecd09a');
      }
      for (let k = 0; k < 3; k++) for (let m = 0; m < 4; m++) rect(x, 4 + m * 8, 79 + k * 4, 1, 2, '#a07a40');
      // van
      rect(x, 151, 49, 42, 30, INK);
      rect(x, 152, 50, 40, 22, '#f2f2ee');
      rect(x, 152, 50, 40, 1, '#ffffff');
      rect(x, 152, 66, 40, 6, '#d8d8d4');
      text(x, 'BRIGHT', 158, 56, '#2b5fa8');
      for (let k = 0; k < 4; k++) rect(x, 183 - k, 53 + k * 2, 2, 2, '#f2c230');
      rect(x, 152, 63, 40, 1, '#2b5fa8');
      for (const wx of [156, 180]) {
        rect(x, wx, 70, 9, 8, INK);
        rect(x, wx + 2, 72, 5, 4, '#9a9aa8');
      }
      // cone
      rect(x, 177, 85, 8, 12, INK);
      rect(x, 178, 86, 6, 10, '#ff8a1e');
      rect(x, 178, 89, 6, 2, '#ffffff');
      rect(x, 174, 95, 14, 3, '#e07010');
      outlineRect(x, 173, 94, 16, 5, INK);
      // extension cord
      for (let i = 30; i < 110; i++) dot(x, i, 92 + Math.round(Math.sin(i / 7) * 2), '#ff8a1e');
    },
    anim2: (x, t) => {
      // occasional spark from the panel
      if (frameOf(t, 8) % 19 < 2) {
        dot(x, 107, 39, '#fff27a');
        dot(x, 105, 37, '#ffffff');
        dot(x, 109, 36, '#fff27a');
      }
    },
  },

  campus: {
    player: 60,
    npc: 128,
    floor: 98,
    bg: (x) => grad(x, 0, 0, W, 72, ['#5aa8e4', '#8cc8f0', '#c8e6f8']),
    anim: (x, t) => {
      clouds(x, t, 0, 2, W, 22, 17, 3);
      for (let i = 0; i < 2; i++) {
        const bx = ((t * 8 + i * 70) % (W + 20)) - 10;
        const fl = frameOf(t, 4 + i) % 2;
        dot(x, bx, 30 + i * 6, INK);
        dot(x, bx - 1, 29 + i * 6 + fl, INK);
        dot(x, bx + 1, 29 + i * 6 + fl, INK);
      }
    },
    mid: (x) => {
      // brick hall
      rect(x, 31, 15, 130, 56, INK);
      for (let j = 16; j < 70; j++)
        for (let i = 32; i < 160; i++) {
          const row = Math.floor((j - 16) / 3);
          const mortar = (j - 16) % 3 === 2 || (i + (row % 2) * 3) % 6 === 0;
          dot(x, i, j, mortar ? '#c8a088' : hash(i * 7 + row * 131) > 0.85 ? '#a04a30' : '#b55a3a');
        }
      rect(x, 30, 14, 132, 4, '#e8e0d0');
      rect(x, 30, 17, 132, 1, '#b8b0a0');
      rect(x, 32, 42, 128, 2, '#e8e0d0');
      // windows
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 6; i++) {
          if (i === 2 || i === 3) continue;
          const wx = 38 + i * 20;
          const wy = 22 + r * 24;
          rect(x, wx - 1, wy - 1, 10, 15, INK);
          rect(x, wx, wy, 8, 13, '#e8e0d0');
          rect(x, wx + 1, wy + 1, 6, 11, '#5a8ab8');
          rect(x, wx + 1, wy + 1, 2, 5, '#a8d0f0');
          rect(x, wx + 4, wy + 1, 1, 11, '#e8e0d0');
          rect(x, wx + 1, wy + 6, 6, 1, '#e8e0d0');
        }
      // portico with columns and pediment
      for (let k = 0; k < 14; k++) rect(x, 78 + k * 1.4, 14 - k, 36 - k * 2.8, 1, '#efe8d8');
      for (let k = 0; k < 14; k++) {
        dot(x, 77 + k * 1.4, 14 - k, INK);
        dot(x, 114 - k * 1.4, 14 - k, INK);
      }
      rect(x, 76, 14, 40, 8, '#e8e0d0');
      rect(x, 76, 21, 40, 1, '#b8b0a0');
      text(x, 'STATE U', 83, 16, '#6a5a3a');
      rect(x, 79, 22, 34, 44, '#4a3a3a');
      rect(x, 88, 34, 16, 32, '#6a4a2a');
      rect(x, 95, 34, 1, 32, '#4a321c');
      for (const cx of [79, 89, 101, 110]) {
        rect(x, cx, 22, 4, 44, '#f6f0e0');
        rect(x, cx + 3, 22, 1, 44, '#c8c0b0');
        dot(x, cx + 1, 22, '#ffffff');
      }
      for (let k = 0; k < 3; k++) rect(x, 74 - k * 3, 66 + k * 2, 44 + k * 6, 2, k % 2 ? '#d8d0c0' : '#e8e0d0');
      // lawn
      for (let j = 70; j < H; j++)
        for (let i = 0; i < W; i++) {
          const n = hash(i * 17 + j * 59);
          dot(x, i, j, n > 0.88 ? '#6ab85a' : n > 0.72 ? '#4a8a3a' : '#5aa04a');
        }
      // path widening toward the viewer
      for (let j = 72; j < H; j++) {
        const f = (j - 72) / (H - 72);
        const hw = 14 + f * 40;
        rect(x, 96 - hw, j, hw * 2, 1, (j & 1) ^ (Math.floor(j / 4) & 1) ? '#d8c8a8' : '#ccbc9c');
      }
      rect(x, 0, 74, W, 2, '#ccbc9c');
      // lamp posts with banners
      for (const lx of [44, 148]) {
        rect(x, lx, 40, 2, 34, '#2a2a33');
        rect(x, lx - 2, 37, 6, 4, '#f2efe6');
        outlineRect(x, lx - 3, 36, 8, 6, INK);
      }
    },
    anim2: (x, t) => {
      // tower clock
      clock(x, 96, 8, t, 3);
      // banners flutter
      for (const lx of [44, 148]) {
        const fl = frameOf(t, 3) % 2;
        rect(x, lx + 2, 44, 6 + fl, 10, '#2b5fa8');
        rect(x, lx + 2, 50, 6 + fl, 2, '#f2c230');
        dot(x, lx + 7 + fl, 54, '#2b5fa8');
      }
      // trees with rustling leaves
      tree(x, 14, 76, 44, t);
      tree(x, 178, 76, 46, t + 1);
      // distant students crossing on the front path
      for (let i = 0; i < 3; i++) {
        const dir = i % 2 ? -1 : 1;
        const pos = (t * (6 + i * 2) + i * 60) % (W + 20);
        const sx = dir > 0 ? pos - 10 : W + 10 - pos;
        const st = frameOf(t, 4) % 2;
        const c = ['#e0503c', '#3f7fd8', '#f2b632'][i];
        rect(x, sx, 66, 3, 3, ['#eab38c', '#714a32', '#c98c62'][i]);
        rect(x, sx, 69, 3, 4, c);
        rect(x, sx + st, 73, 1, 2, '#2a2a3a');
        rect(x, sx + 2 - st, 73, 1, 2, '#2a2a3a');
      }
    },
  },

  carlot: {
    player: 52,
    npc: 120,
    floor: 98,
    bg: (x) => {
      grad(x, 0, 0, W, 64, ['#5aa8e4', '#8cc8f0', '#d0e8f8']);
    },
    anim: (x, t) => clouds(x, t, 0, 2, W, 18, 33, 3),
    mid: (x) => {
      skyline(x, 60, '#a8bccc', 7, '#c8d8e4', 0.7);
      stipple(x, 0, 30, W, 30, '#d0e8f8', 0.3);
      // asphalt
      for (let j = 60; j < H; j++)
        for (let i = 0; i < W; i++) {
          const n = hash(i * 23 + j * 41);
          dot(x, i, j, n > 0.93 ? '#6a6a74' : n < 0.04 ? '#9a9aa4' : '#808088');
        }
      perspLines(x, 60, [-150, -75, 0, 75, 150], '#ecece0', 30);
      stipple(x, 30, 96, 20, 4, '#4a4a52', 0.5);
      // sales office trailer
      rect(x, 147, 33, 46, 30, INK);
      rect(x, 148, 34, 44, 28, '#f2efe6');
      for (let j = 36; j < 62; j += 3) rect(x, 148, j, 44, 1, '#d8d4c8');
      rect(x, 152, 40, 14, 10, INK);
      rect(x, 153, 41, 12, 8, '#8fcbe8');
      rect(x, 153, 41, 4, 3, '#d8f0ff');
      rect(x, 174, 40, 10, 22, INK);
      rect(x, 175, 41, 8, 21, '#c0392b');
      dot(x, 181, 52, '#f2d048');
      sign(x, 'OFFICE', 154, 26, '#2b3f7a', '#ffffff');
      // big sign pole
      rect(x, 30, 32, 3, 30, '#5a5a6a');
      rect(x, 3, 13, 58, 20, INK);
      rect(x, 4, 14, 56, 18, '#f2b632');
      rect(x, 4, 14, 56, 1, '#ffd870');
      text(x, 'USED CARS', 14, 17, '#1c1424');
      text(x, 'EZ CREDIT!', 12, 24, '#c0392b');
      // bunting poles
      rect(x, 0, 36, 2, 28, '#5a5a6a');
      rect(x, 140, 32, 2, 32, '#5a5a6a');
    },
    anim2: (x, t) => {
      // marquee bulbs chase
      const f = frameOf(t, 6);
      for (let k = 0; k < 28; k++) {
        const pos = k < 14 ? [4 + k * 4, 13] : [4 + (k - 14) * 4, 32];
        dot(x, pos[0] + 1, pos[1], (k + f) % 3 === 0 ? '#ffffff' : '#c8902a');
      }
      // bunting flutter
      for (let i = 2; i < 140; i += 6) {
        const sag = Math.round(Math.sin(((i - 2) / 138) * Math.PI) * 6);
        const c = ['#e0503c', '#f2b632', '#3f7fd8', '#3caa6a'][(i / 6) % 4 | 0];
        const fl = (frameOf(t, 4) + i) % 2;
        dot(x, i, 37 + sag, INK);
        rect(x, i + 1, 38 + sag, 3, 2 + fl, c);
        dot(x, i + 2, 40 + sag + fl, c);
      }
      // inflatable tube guy
      const a = t * 4;
      const segs = 7;
      let px = 94;
      let py = 62;
      rect(x, 90, 62, 12, 3, '#3a3a44');
      for (let s = 0; s < segs; s++) {
        const lean = Math.sin(a + s * 0.6) * (s * 0.6);
        const nx = 94 + lean;
        const ny = 62 - (s + 1) * 5;
        rect(x, Math.min(px, nx) - 3, ny - 1, 8, 7, INK);
        rect(x, Math.min(px, nx) - 2, ny, 6, 6, s % 2 ? '#ff8a1e' : '#ff9a30');
        px = nx;
        py = ny;
      }
      const arm = Math.sin(a * 1.3) * 5;
      line(x, px - 3, py + 8, px - 9, py + 3 - arm, '#ff8a1e');
      line(x, px + 4, py + 8, px + 10, py + 3 + arm, '#ff8a1e');
      line(x, px - 3, py + 9, px - 9, py + 4 - arm, '#e07010');
      line(x, px + 4, py + 9, px + 10, py + 4 + arm, '#e07010');
      dot(x, px - 1, py + 2, INK);
      dot(x, px + 2, py + 2, INK);
      rect(x, px - 1, py + 4, 4, 1, INK);
      // cars with a glint sweeping across the windshields
      car(x, 2, 70, '#c0392b', true);
      car(x, 148, 70, '#3f7fd8');
      for (const [cx, price] of [
        [12, '$4995'],
        [158, '$7450'],
      ] as const) {
        rect(x, cx - 1, 62, 22, 7, INK);
        rect(x, cx, 63, 20, 5, '#ffffff');
        text(x, price, cx + 1, 63, '#c0392b');
      }
      const g = frameOf(t, 8) % 24;
      if (g < 5) {
        dot(x, 12 + g, 72, '#ffffff');
        dot(x, 158 + g, 72, '#ffffff');
      }
    },
  },

  street: {
    player: 60,
    npc: 126,
    floor: 98,
    bg: (x) => grad(x, 0, 0, W, 40, ['#5aa8e4', '#8cc8f0', '#c8e6f8']),
    anim: (x, t) => clouds(x, t, 0, 1, W, 14, 51, 3),
    mid: (x) => {
      skyline(x, 30, '#b8c8d8', 3, '#d8e4ee', 0.75, false);
      // storefronts across the street
      const fronts: [number, number, string, string][] = [
        [0, 62, '#b86a4a', 'CAFE'],
        [62, 60, '#6a8ab0', 'LAUNDRY'],
        [122, 70, '#c8a868', 'BOOKS'],
      ];
      for (const [fx, fw, c, label] of fronts) {
        rect(x, fx, 14, fw, 50, INK);
        rect(x, fx + 1, 15, fw - 2, 48, c);
        rect(x, fx + 1, 15, fw - 2, 2, shade(c, 1.2));
        for (let wx = fx + 5; wx < fx + fw - 8; wx += 12) {
          rect(x, wx - 1, 19, 8, 10, INK);
          rect(x, wx, 20, 6, 8, '#8fbcd8');
          rect(x, wx, 20, 2, 3, '#d8f0ff');
          rect(x, wx - 1, 29, 8, 1, shade(c, 0.7));
        }
        // shop window + door
        rect(x, fx + 3, 42, fw - 6, 22, INK);
        rect(x, fx + 4, 43, fw - 18, 20, '#4a6a88');
        stipple(x, fx + 4, 43, fw - 18, 20, '#6a8aa8', 0.3);
        line(x, fx + 6, 60, fx + 14, 46, '#a8c8e0');
        rect(x, fx + fw - 13, 45, 9, 18, shade(c, 0.6));
        dot(x, fx + fw - 11, 54, '#f2d048');
        sign(x, label, fx + Math.floor((fw - textWidth(label) - 6) / 2), 32, '#f2efe6', shade(c, 0.6));
      }
      // cafe awning
      for (let k = 0; k < 54; k += 6) {
        rect(x, 4 + k, 42, 3, 5, '#c0392b');
        rect(x, 7 + k, 42, 3, 5, '#f2efe6');
      }
      for (let k = 0; k < 54; k += 3) dot(x, 5 + k, 47, k % 6 ? '#f2efe6' : '#c0392b');
      outlineRect(x, 3, 41, 56, 7, INK);
      // road
      rect(x, 0, 64, W, 12, '#4e4e58');
      for (let i = 0; i < W; i += 4) if (hash(i) > 0.5) dot(x, i, 65 + (i % 9), '#5a5a64');
      for (let i = 0; i < W; i += 16) rect(x, i, 70, 8, 1, '#f2e27a');
      // curb + sidewalk
      rect(x, 0, 76, W, 2, '#e8e0d0');
      rect(x, 0, 78, W, 1, '#8a8478');
      concrete(x, 79, '#c8c0b0', 30);
    },
    fg: (x) => {
      // street lamp
      rect(x, 47, 44, 2, 42, '#2a3a3a');
      rect(x, 45, 40, 8, 4, '#2a3a3a');
      rect(x, 46, 44, 6, 1, '#f2efd0');
      rect(x, 44, 84, 8, 3, '#2a3a3a');
      // bus stop + bench
      rect(x, 184, 50, 2, 36, '#3a3a4a');
      rect(x, 178, 44, 14, 8, INK);
      rect(x, 179, 45, 12, 6, '#2b5fa8');
      text(x, 'BUS', 180, 46, '#ffffff');
      rect(x, 150, 78, 30, 3, '#8a5a34');
      rect(x, 150, 74, 30, 2, '#8a5a34');
      rect(x, 152, 81, 2, 5, '#3a3a4a');
      rect(x, 176, 81, 2, 5, '#3a3a4a');
      // hydrant + trash can
      rect(x, 141, 79, 7, 10, INK);
      rect(x, 142, 80, 5, 8, '#c0392b');
      rect(x, 141, 82, 7, 2, '#a02a20');
      rect(x, 143, 78, 3, 2, '#c0392b');
      floorShadow(x, 140, 88, 10, 2);
      rect(x, 2, 76, 12, 14, INK);
      rect(x, 3, 77, 10, 12, '#3a6a4a');
      for (let k = 4; k < 12; k += 3) rect(x, k, 78, 1, 10, '#2a5a3a');
    },
    anim2: (x, t) => {
      traffic(x, t, 63, 5, 3);
      // OPEN neon in the laundromat
      const on = frameOf(t, 8) % 17 > 1;
      rect(x, 79, 47, 21, 9, INK);
      text(x, 'OPEN', 82, 49, on ? '#ff5aa0' : '#6a2a4a');
      if (on) glow(x, 89, 51, 14, 6, '#ff5aa0', 0.3);
      // cafe steam
      const s = frameOf(t, 3) % 4;
      dot(x, 50, 50 - s, '#e8e8e8');
      dot(x, 51, 48 - s, '#e8e8e8');
    },
  },

  office: {
    player: 54,
    npc: 130,
    floor: 98,
    bg: (x) => {
      wall(x, '#c4ccd4', 80);
      baseboard(x, 80, '#5a6470');
      carpet(x, 80, '#7a8aa0', '#6a7a90');
      windowFrame(x, 10, 8, 56, 34, '#e8ecf0');
      // whiteboard
      bevel(x, 80, 10, 40, 24, '#fbfbf8');
      line(x, 84, 28, 92, 22, '#3f7fd8');
      line(x, 92, 22, 98, 25, '#3f7fd8');
      line(x, 98, 25, 108, 15, '#3f7fd8');
      rect(x, 110, 16, 6, 1, '#e0503c');
      rect(x, 110, 19, 5, 1, '#e0503c');
      rect(x, 84, 31, 30, 1, '#8a9aa8');
      // water cooler
      floorShadow(x, 158, 80, 16, 2);
      rect(x, 159, 60, 12, 20, INK);
      rect(x, 160, 61, 10, 19, '#e8ecf0');
      rect(x, 160, 61, 10, 1, '#ffffff');
      rect(x, 163, 66, 4, 2, '#3f7fd8');
      rect(x, 160, 42, 10, 18, INK);
      plant(x, 178, 60);
      // printer
      bevel(x, 6, 66, 22, 13, '#d8d8dc');
      rect(x, 8, 64, 18, 2, '#f2f2f4');
      floorShadow(x, 5, 80, 24, 2);
    },
    anim: (x, t) => {
      windowView(x, t, 10, 8, 56, 34, false, {
        seed: 61,
        frame: '#e8ecf0',
        scenery: (c) =>
          c.drawImage(
            cached('office-city', 56, 16, (q) => {
              for (let i = 0, px = 0; px < 56; i++) {
                const w = 5 + Math.floor(hash(i + 300) * 8);
                const h = 5 + Math.floor(hash(i * 7 + 301) * 11);
                rect(q, px, 16 - h, w, h, i % 2 ? '#8a9ab8' : '#7a8aa8');
                for (let wy = 18 - h; wy < 15; wy += 3) for (let wx = px + 1; wx < px + w - 1; wx += 2) if (hash(wx * 5 + wy * 9) > 0.6) dot(q, wx, wy, '#c8d8ec');
                px += w + 1;
              }
            }),
            10,
            26,
          ),
      });
      // blinds
      for (let k = 0; k < 5; k++) {
        rect(x, 10, 8 + k * 2, 56, 1, '#f2f2f4');
        rect(x, 10, 9 + k * 2, 56, 1, '#c8ccd4');
      }
      clock(x, 136, 18, t, 6);
      // water jug with rising bubbles
      rect(x, 161, 43, 8, 16, '#8ac8f0');
      rect(x, 161, 43, 2, 16, '#b8e0f8');
      const b = (t * 5) % 14;
      dot(x, 165, 57 - b, '#e8f8ff');
      dot(x, 166, 57 - ((b + 7) % 14), '#e8f8ff');
      // coworker typing behind the cubicle wall
      const bob = frameOf(t, 2) % 2;
      drawPerson(x, P(2, 3, 0, '#e0503c'), 86, 40 + bob, 0, false, { clipY: 16, face: 1, blink: frameOf(t, 8) % 47 === 0 });
      // printer light
      dot(x, 24, 70, frameOf(t, 2) % 2 ? '#7fe08a' : '#2a5a3a');
    },
    mid: (x) => {
      // cubicle wall
      rect(x, 72, 51, 82, 29, INK);
      rect(x, 73, 52, 80, 27, '#8a98ac');
      stipple(x, 73, 52, 80, 27, '#7a889c', 0.3);
      rect(x, 73, 52, 80, 2, '#b8c0cc');
      rect(x, 112, 52, 1, 27, '#5a6a80');
      rect(x, 100, 43, 12, 9, INK);
      rect(x, 104, 52, 4, 1, '#3a3a44');
    },
    anim2: (x, t) => {
      rect(x, 101, 44, 10, 7, frameOf(t, 1) % 2 ? '#6ac0f0' : '#5ab0e0');
    },
    fg: (x) => {
      // desk sits low enough to show the speaker from the waist up
      desk(x, 100, 88, 72, '#8a6a4a', '#6a4a2e', 20);
      rect(x, 147, 74, 18, 14, INK);
      rect(x, 148, 75, 16, 11, '#2a2a33');
      rect(x, 154, 86, 4, 2, '#3a3a44');
      rect(x, 106, 85, 12, 3, '#f2efe6');
      rect(x, 107, 84, 12, 1, '#e2dccb');
      rect(x, 168, 83, 3, 5, '#e0503c');
    },
    fgAnim: (x, t) => {
      rect(x, 149, 76, 14, 9, '#3f7fd8');
      for (let k = 0; k < 3; k++) rect(x, 150, 77 + k * 3, 4 + ((k * 5 + frameOf(t, 1)) % 9), 1, '#d8e8ff');
      const s = frameOf(t, 3) % 3;
      dot(x, 169, 81 - s, '#e8e8f0');
      dot(x, 170, 79 - s, '#d8d8e0');
    },
  },

  library: {
    player: 56,
    npc: 134,
    floor: 98,
    bg: (x) => {
      wall(x, '#7a4a2a', 80, (i, j) => (i % 16 === 0 ? '#6a3e22' : i % 16 === 1 && j % 2 ? '#8a5a3a' : null));
      baseboard(x, 80, '#4a2a16');
      woodFloor(x, 80, '#6a4a2e');
      // runner rug
      perspFloorRect(x, 80, -22, 22, '#8a2a2a', '#a83a3a');
      // arched window with light
      rect(x, 63, 15, 66, 46, INK);
      for (let k = 0; k < 10; k++) rect(x, 72 - k, 6 + k, 48 + k * 2, 1, INK);
      grad(x, 64, 16, 64, 44, ['#a8d8f8', '#d8eefa', '#f4f0d8']);
      for (let k = 0; k < 9; k++) rect(x, 72 - k, 7 + k, 48 + k * 2, 1, '#bce2f8');
      rect(x, 95, 7, 2, 53, '#5a3820');
      rect(x, 64, 36, 64, 2, '#5a3820');
      rect(x, 79, 16, 1, 44, '#5a3820');
      rect(x, 112, 16, 1, 44, '#5a3820');
      rect(x, 62, 60, 68, 3, '#5a3820');
      // light beams
      for (let j = 62; j < 100; j++) {
        const sh = (j - 62) * 0.7;
        const a = 0.16 * (1 - (j - 62) / 46);
        rect(x, 66 + sh, j, 58, 1, `rgba(255,242,192,${a.toFixed(3)})`);
        rect(x, 76 + sh, j, 12, 1, `rgba(255,242,192,${a.toFixed(3)})`);
        rect(x, 100 + sh, j, 12, 1, `rgba(255,242,192,${a.toFixed(3)})`);
      }
      // tall shelves
      for (const [sx, sw] of [
        [2, 50],
        [142, 48],
      ] as const) {
        rect(x, sx - 1, 3, sw + 2, 78, INK);
        rect(x, sx, 4, sw, 76, '#4a2c16');
        rect(x, sx, 4, 2, 76, '#6a4426');
        rect(x, sx + sw - 2, 4, 2, 76, '#3a2010');
        for (let r = 0; r < 6; r++) {
          const by = 16 + r * 12;
          bookRow(x, sx + 2, by, sw - 4, sx * 31 + r * 7);
          rect(x, sx, by, sw, 2, '#6a4426');
          rect(x, sx, by + 2, sw, 1, '#2a160a');
        }
      }
      // ladder on the left shelf
      line(x, 38, 4, 46, 80, '#9a6a3a');
      line(x, 44, 4, 52, 80, '#9a6a3a');
      for (let k = 0; k < 8; k++) rect(x, 39 + k, 10 + k * 9, 6, 1, '#9a6a3a');
      // study table with lamps
      rect(x, 69, 64, 54, 4, INK);
      rect(x, 70, 65, 52, 2, '#8a5a34');
      rect(x, 72, 68, 2, 12, '#5a3a20');
      rect(x, 118, 68, 2, 12, '#5a3a20');
      bevel(x, 96, 60, 8, 3, '#2f8a4a');
      rect(x, 99, 63, 2, 2, '#c9a032');
    },
    anim: (x, t) => {
      // a student studying at the back table
      drawSeated(x, P(4, 5, 3, '#f2b632', { pants: '#2a3a5a', glasses: true }), 80, 65, frameOf(t, 0.7), 1, frameOf(t, 8) % 51 === 4);
      const pg = frameOf(t, 0.5) % 2;
      rect(x, 92, 62, 6, 2, '#f2efe6');
      rect(x, 92 + pg * 3, 61, 3, 1, '#ffffff');
      // banker's lamp glow
      glow(x, 100, 64, 10, 4, '#fff2a0', 0.4);
      // dust motes drifting in the light
      for (let i = 0; i < 7; i++) {
        const mx = 70 + hash(i * 3) * 60 + Math.sin(t * 0.5 + i) * 3 + ((t * 1.5) % 10);
        const my = 66 + ((hash(i * 7) * 30 + t * 2) % 30);
        if ((frameOf(t, 2) + i) % 5) dot(x, mx, my, '#fff6d0');
      }
    },
    fg: (x) => {
      // circulation desk in front of the speaker
      rect(x, 105, 87, 66, 21, INK);
      rect(x, 106, 88, 64, 3, '#9a6a3a');
      rect(x, 106, 88, 64, 1, '#b8844e');
      rect(x, 106, 91, 64, 17, '#5a3a20');
      for (let k = 110; k < 168; k += 14) {
        rect(x, k, 93, 10, 12, '#4a2c16');
        outlineRect(x, k, 93, 10, 12, '#6a4426');
      }
      text(x, 'CHECKOUT', 122, 97, '#c9a032');
      // stack of returns + bell
      for (let k = 0; k < 4; k++) {
        const c = ['#c0392b', '#2e3f6e', '#3caa6a', '#d8a232'][k];
        rect(x, 108 + (k % 2), 85 - k * 2, 12, 2, c);
        rect(x, 108 + (k % 2), 85 - k * 2, 12, 1, shade(c, 1.2));
      }
      rect(x, 160, 86, 6, 2, '#c9a032');
      dot(x, 162, 85, '#f2d060');
      dot(x, 163, 85, '#f2d060');
    },
  },

  party: {
    player: 62,
    npc: 118,
    floor: 98,
    bg: (x) => {
      wall(x, '#3a2a5a', 82, (i, j) => (i % 10 === 0 && j % 3 ? '#342452' : null));
      grad(x, 0, 0, W, 12, ['#1c1430', '#3a2a5a']);
      baseboard(x, 82, '#2a1a40');
      woodFloor(x, 82, '#5a3a5a');
      rect(x, 70, 14, 36, 26, INK);
      poster(x, 12, 14, 16, 22, '#e0503c', '#ffe27a', 'bolt');
      poster(x, 120, 16, 20, 14, '#2a8a8a', '#ffe27a', 'star');
      // speakers
      for (const sx of [32, 146]) {
        floorShadow(x, sx - 1, 82, 16, 2);
        bevel(x, sx, 56, 14, 26, '#22222c');
        disc(x, sx + 7, 63, 3, '#3a3a48');
        disc(x, sx + 7, 74, 5, '#3a3a48');
      }
      // snack table
      floorShadow(x, 156, 82, 34, 2);
      desk(x, 158, 66, 32, '#c08a5a', '#a06a3a', 14);
      rect(x, 162, 62, 16, 4, INK);
      rect(x, 163, 62, 14, 3, '#f2b632');
      dot(x, 166, 62, '#c0392b');
      dot(x, 172, 63, '#c0392b');
      for (const cx of [180, 184]) {
        rect(x, cx, 61, 3, 5, '#e0303c');
        rect(x, cx, 61, 3, 1, '#ffffff');
      }
    },
    anim: (x, t) => {
      windowView(x, t, 71, 15, 34, 24, true, { seed: 77 });
      // string lights
      for (let i = 0; i < 16; i++) {
        const lx = 4 + i * 12;
        const ly = 4 + Math.round(Math.sin((i / 15) * Math.PI) * 4);
        const c = ['#ff6ab0', '#6ae0ff', '#ffe96a', '#8aff6a'][(i + frameOf(t, 3)) % 4];
        rect(x, lx, ly, 2, 2, c);
        if (i < 15) line(x, lx + 2, ly, lx + 11, 4 + Math.round(Math.sin(((i + 1) / 15) * Math.PI) * 4), '#1c1430');
      }
      // disco ball + sweeping light spots
      rect(x, 96, 0, 1, 6, '#8a8a9a');
      disc(x, 96, 9, 3, '#c8c8d8');
      dot(x, 95 + (frameOf(t, 4) % 3), 8, '#ffffff');
      for (let i = 0; i < 14; i++) {
        const a = t * 0.8 + i * 0.9;
        const sx = 96 + Math.cos(a) * (40 + hash(i) * 50);
        const sy = 30 + Math.sin(a * 1.3 + i) * 18 + hash(i * 3) * 20;
        if (sy < 80) rect(x, sx, sy, 2, 1, ['#ff6ab0', '#6ae0ff', '#ffe96a', '#ffffff'][i % 4]);
      }
      // speaker cones pump to the beat
      const beat = frameOf(t, 4) % 2;
      for (const sx of [32, 146]) {
        disc(x, sx + 7, 74, beat ? 4 : 3, '#5a5a6a');
        dot(x, sx + 7, 74, '#1a1a22');
      }
      // background dancers
      const d = [P(1, 4, 1, '#3caa6a'), P(3, 0, 6, '#f2b632'), P(0, 3, 8, '#2fb5b0')];
      [10, 84, 132].forEach((dx, i) => drawPerson(x, dim(d[i], 0.62), dx, 54 + ((frameOf(t, 4) + i) % 2), 0, false, { face: dx < 96 ? 1 : -1 }));
    },
    fgAnim: (x, t) => {
      crowd(x, [dim(P(2, 3, 0, '#3caa6a'), 0.85), dim(P(5, 0, 7, '#e0503c'), 0.85)], [6, 172], 68, t, 4);
    },
  },

  road: {
    player: 60,
    npc: 122,
    floor: 98,
    bg: (x) => {
      grad(x, 0, 0, W, 52, ['#6a5aa8', '#e07a8a', '#ffb070', '#ffe0a0']);
      disc(x, 150, 44, 9, '#fff0b0');
      disc(x, 150, 44, 7, '#ffffd8');
    },
    anim: (x, t) => clouds(x, t * 0.5, 0, 6, W, 20, 9, 3, '#ffc8b0', '#e08a8a'),
    mid: (x) => {
      // mountains, two layers
      for (let i = 0; i < W; i++) {
        const h1 = 14 + Math.sin(i / 17) * 6 + Math.sin(i / 7) * 2;
        rect(x, i, 52 - h1, 1, h1, '#8a6a9a');
        const h2 = 8 + Math.sin(i / 11 + 2) * 4 + Math.sin(i / 5) * 1;
        rect(x, i, 52 - h2, 1, h2, '#6a5a7a');
      }
      // fields
      grad(x, 0, 50, W, 10, ['#8a8a5a', '#7a8a4a']);
      for (let i = 0; i < W; i += 9) rect(x, i, 52, 1, 6, '#5a4a3a');
      rect(x, 0, 54, W, 1, '#5a4a3a');
      // telephone poles + wire
      for (const px of [24, 104, 184]) {
        rect(x, px, 16, 2, 42, '#4a3424');
        rect(x, px - 5, 19, 12, 2, '#4a3424');
      }
      for (const [a, b] of [
        [24, 104],
        [104, 184],
      ])
        for (let i = a; i <= b; i++) dot(x, i, 20 + Math.round(Math.sin(((i - a) / (b - a)) * Math.PI) * 6), '#2a1a1a');
      // road
      rect(x, 0, 58, W, 2, '#c8c0b0');
      rect(x, 0, 60, W, 16, '#4a4a54');
      for (let i = 0; i < W; i += 3) if (hash(i * 3) > 0.6) dot(x, i, 61 + (i % 13), '#5a5a64');
      for (let i = 0; i < W; i += 20) rect(x, i, 67, 10, 1, '#f2e27a');
      rect(x, 0, 76, W, 1, '#e8e0d0');
      // gravel shoulder
      for (let j = 77; j < H; j++)
        for (let i = 0; i < W; i++) {
          const n = hash(i * 29 + j * 13);
          dot(x, i, j, n > 0.9 ? '#6a5a4a' : n > 0.8 ? '#a8987a' : j < 80 ? '#7a6a58' : '#8a7a64');
        }
      for (let i = 0; i < W; i++) if (hash(i * 7 + 1) > 0.75) rect(x, i, 77 - Math.floor(hash(i) * 3), 1, 3, '#7a8a4a');
    },
    fg: (x) => {
      // mile marker
      rect(x, 14, 66, 1, 16, '#8a8a9a');
      rect(x, 10, 60, 10, 7, INK);
      rect(x, 11, 61, 8, 5, '#2f8a4a');
      text(x, '12', 11, 61, '#ffffff');
      // broken-down car with the hood up
      car(x, 150, 74, '#3caa6a', true);
      rect(x, 148, 66, 14, 2, INK);
      for (let k = 0; k < 8; k++) rect(x, 149 + k, 72 - k, 12 - k, 1, '#3caa6a');
      line(x, 148, 72, 156, 64, INK);
    },
    anim2: (x, t) => traffic(x, t, 59, 2, 2),
    fgAnim: (x, t) => {
      const on = frameOf(t, 3) % 2 === 0;
      for (const hx of [150, 183]) {
        rect(x, hx, 81, 3, 2, on ? '#ffb020' : '#7a5010');
        if (on) glow(x, hx + 1, 82, 4, 3, '#ffd060', 0.4);
      }
      // smoke from the engine
      for (let i = 0; i < 3; i++) {
        const s = (t * 4 + i * 5) % 15;
        disc(x, 154 + Math.sin(s + i) * 2, 70 - s, 1 + Math.floor(s / 6), (i + frameOf(t, 2)) % 2 ? '#c8c0c0' : '#a8a0a0');
      }
    },
  },

  night: {
    player: 60,
    npc: 126,
    floor: 98,
    bg: (x) => {
      grad(x, 0, 0, W, 66, ['#06061c', '#0e0e2e', '#1a1a46', '#262458']);
      moon(x, 160, 14, 5);
    },
    anim: (x, t) => stars(x, t, 0, 0, W, 40, 34, 5),
    mid: (x) => {
      skyline(x, 64, '#1a1a32', 11, '#ffe9a0', 0.7);
      rect(x, 0, 64, W, 12, '#22222c');
      for (let i = 0; i < W; i += 16) rect(x, i, 70, 8, 1, '#5a5a3a');
      rect(x, 0, 76, W, 2, '#4a4a54');
      concrete(x, 78, '#34343e', 30);
      // street lamp
      rect(x, 28, 30, 2, 56, '#1a1a22');
      rect(x, 24, 26, 10, 5, '#1a1a22');
      rect(x, 25, 30, 8, 1, '#fff2c0');
      cone(x, 29, 31, 92, 6, 46, '#ffe9a0', 0.32);
      rect(x, 25, 84, 8, 3, '#1a1a22');
    },
    anim2: (x, t) => {
      // a few apartment lights switching
      for (let i = 0; i < 4; i++) {
        const on = (Math.floor(t / 2) + i * 3) % 5 < 3;
        rect(x, 20 + i * 44 + (i % 2) * 6, 40 + (i % 3) * 5, 2, 2, on ? '#ffe9a0' : '#1a1a32');
      }
      // moths
      for (let i = 0; i < 2; i++) dot(x, 29 + Math.cos(t * 3 + i * 2) * 4, 34 + Math.sin(t * 4 + i) * 3, '#e8e0c8');
      // police cruiser with light bar
      const flash = frameOf(t, 4) % 2;
      car(x, 140, 58, '#eeeae0');
      rect(x, 147, 64, 22, 2, '#1c1c24');
      rect(x, 150, 55, 6, 3, flash ? '#4a8aff' : '#3a1a1a');
      rect(x, 156, 55, 6, 3, flash ? '#2a1a3a' : '#ff3a3a');
      outlineRect(x, 149, 54, 14, 5, INK);
    },
    fgAnim: (x, t) => {
      const flash = frameOf(t, 4) % 2;
      glow(x, 156, 82, 56, 22, flash ? '#4a8aff' : '#ff3a3a', 0.28);
    },
  },

  beach: {
    player: 64,
    npc: 118,
    floor: 100,
    bg: (x) => {
      grad(x, 0, 0, W, 48, ['#7a5ab0', '#e07a9a', '#ffa070', '#ffd890']);
      // striped retro sun, half set
      for (let j = -14; j <= 0; j++) {
        const hw = Math.floor(Math.sqrt(196 - j * j));
        if (j > -9 && (j + 20) % 3 === 0) continue;
        rect(x, 140 - hw, 48 + j, hw * 2, 1, j < -8 ? '#fff0a0' : '#ffd060');
      }
    },
    anim: (x, t) => {
      clouds(x, t * 0.4, 0, 6, W, 20, 3, 2, '#ffc0b0', '#e0909a');
      // sailboat
      const bx = ((t * 1.5) % (W + 30)) - 15;
      rect(x, bx, 44, 8, 2, '#3a2a4a');
      for (let k = 0; k < 6; k++) rect(x, bx + 4, 38 + k, k / 1.5 + 1, 1, '#f2efe6');
      // gulls
      for (let i = 0; i < 2; i++) {
        const gx = ((t * (6 + i * 3) + i * 90) % (W + 20)) - 10;
        const gy = 16 + i * 8 + Math.round(Math.sin(t * 2 + i) * 2);
        const up = frameOf(t, 4 + i) % 2;
        dot(x, gx, gy, INK);
        dot(x, gx - 1, gy - up, INK);
        dot(x, gx - 2, gy - 1 + up, INK);
        dot(x, gx + 1, gy - up, INK);
        dot(x, gx + 2, gy - 1 + up, INK);
      }
    },
    mid: (x) => {
      grad(x, 0, 48, W, 24, ['#3a6ab0', '#3a8ad0', '#5aa8e0']);
      // sand
      for (let j = 72; j < H; j++)
        for (let i = 0; i < W; i++) {
          const n = hash(i * 37 + j * 11);
          dot(x, i, j, n > 0.92 ? '#e0c088' : n < 0.05 ? '#fff0c8' : j < 76 ? '#e8cc90' : '#f2d8a0');
        }
      // umbrella, towel, cooler, castle
      stipple(x, 8, 84, 48, 6, '#c8a870', 0.5);
      rect(x, 30, 52, 2, 36, '#5a3a2a');
      for (let k = 0; k < 8; k++) {
        const hw = 6 + k * 2.6;
        for (let s = -hw; s < hw; s++) dot(x, 31 + s, 47 + k, Math.floor((s + 30) / 6) % 2 ? '#e0503c' : '#f2efe6');
      }
      for (let k = 0; k < 40; k++) dot(x, 11 + k, 55 + (k % 4 === 0 ? 0 : 1), INK);
      rect(x, 8, 92, 34, 7, '#3f7fd8');
      for (let k = 8; k < 42; k += 6) rect(x, k, 92, 3, 7, '#f2efe6');
      outlineRect(x, 7, 91, 36, 9, INK);
      bevel(x, 44, 86, 12, 9, '#2fb5b0');
      rect(x, 44, 86, 12, 2, '#f2efe6');
      for (let k = 0; k < 3; k++) rect(x, 162 + k * 2, 88 - k * 4, 18 - k * 4, 4, k % 2 ? '#d8b878' : '#e0c088');
      rect(x, 169, 74, 1, 4, '#5a3a2a');
      rect(x, 170, 74, 3, 2, '#e0503c');
      rect(x, 162, 92, 18, 1, '#c8a060');
    },
    anim2: (x, t) => {
      // sun glitter column + wave lines
      for (let j = 50; j < 72; j += 2) {
        const w = 18 - (j - 50) * 0.5;
        const off = Math.round(Math.sin(t * 3 + j) * 2);
        if ((frameOf(t, 4) + j) % 3) rect(x, 140 - w / 2 + off, j, w, 1, '#ffd890');
      }
      for (let i = 0; i < W; i += 12) rect(x, i + Math.round(Math.sin(t * 1.5 + i) * 3), 54 + ((i / 12) % 4) * 4, 7, 1, '#8ac8f0');
      // foam sliding in and out
      const tide = Math.round(Math.sin(t * 0.8) * 2);
      for (let i = 0; i < W; i++) {
        const y = 72 + tide + Math.round(Math.sin(i / 9 + t) * 1);
        dot(x, i, y, '#ffffff');
        if ((i + frameOf(t, 2)) % 3) dot(x, i, y + 1, '#cfe8f4');
      }
    },
  },

  stage: {
    player: 70,
    npc: 120,
    floor: 98,
    bg: (x) => {
      grad(x, 0, 0, W, 84, ['#140c22', '#2a1a3a', '#3a2448']);
      // back curtain folds
      for (let i = 20; i < W - 20; i++) {
        const f = Math.sin(i / 3);
        dot(x, i, 0, INK);
        rect(x, i, 10, 1, 74, f > 0.6 ? '#4a2a5a' : f < -0.6 ? '#22122e' : '#34203f');
      }
      // banner
      rect(x, 55, 16, 82, 13, INK);
      rect(x, 56, 17, 80, 11, '#f2c230');
      rect(x, 56, 17, 80, 1, '#ffe27a');
      rect(x, 56, 27, 80, 1, '#c99a18');
      text(x, 'CONGRATS!', 80, 20, '#5a1a2a');
      for (const sx of [61, 128]) {
        rect(x, sx, 20, 3, 1, '#c0392b');
        rect(x, sx + 1, 19, 1, 3, '#c0392b');
      }
      // side curtains
      for (const [cx, dir] of [
        [0, 1],
        [W - 24, -1],
      ] as const) {
        for (let i = 0; i < 24; i++) {
          const f = Math.sin((i + (dir > 0 ? 0 : 1)) / 2.2);
          rect(x, cx + i, 0, 1, H, f > 0.5 ? '#c02848' : f < -0.5 ? '#701028' : '#a02040');
        }
        rect(x, dir > 0 ? cx + 23 : cx, 0, 1, H, INK);
      }
      // valance with gold fringe
      for (let i = 0; i < W; i++) {
        const sag = Math.round(Math.abs(Math.sin((i / W) * Math.PI * 4)) * 4);
        rect(x, i, 0, 1, 8 + sag, i % 4 < 2 ? '#a02040' : '#8a1834');
        dot(x, i, 8 + sag, i % 2 ? '#f2c230' : '#c99a18');
      }
      // stage floor
      woodFloor(x, 84, '#8a5a32', 30);
      rect(x, 0, 100, W, 2, '#4a2a16');
      rect(x, 0, 102, W, 6, '#140c18');
    },
    anim: (x, t) => {
      for (let i = 0; i < 3; i++) {
        const cx = 50 + i * 46 + Math.sin(t * 0.7 + i * 2) * 14;
        cone(x, cx, 9, 100, 4, 38, '#fff6d0', 0.22);
        glow(x, cx, 96, 18, 3, '#fff6d0', 0.35);
        rect(x, cx - 2, 8, 4, 3, '#ffe27a');
      }
    },
    fgAnim: (x, t) => {
      // confetti
      for (let i = 0; i < 26; i++) {
        const cx = 24 + hash(i * 5) * 144 + Math.sin(t * 2 + i) * 3;
        const cy = ((hash(i * 11) * 110 + t * (10 + hash(i) * 8)) % 110) - 4;
        if (cy > 100) continue;
        rect(x, cx, cy, (frameOf(t, 6) + i) % 2 ? 2 : 1, 1, ['#ffe27a', '#ff6ab0', '#6ae0ff', '#8aff6a'][i % 4]);
      }
      // audience heads
      for (let i = 0; i < 12; i++) {
        const hx = 6 + i * 16 + (i % 2) * 4;
        const bob = (frameOf(t, 2) + i) % 3 === 0 ? 1 : 0;
        disc(x, hx, 106 - bob, 5, '#0a0610');
        if (i % 3 === 0) rect(x, hx - 6, 98 - bob - (frameOf(t, 3) + i) % 2, 2, 5, '#0a0610'); // waving arm
      }
    },
  },
};

function clockStatic(x: Ctx, cx: number, cy: number): void {
  disc(x, cx, cy, 7, INK);
  disc(x, cx, cy, 6, '#c9a032');
}
// Lines on a perspective floor at fixed world x offsets.
function perspLines(x: Ctx, y0: number, xs: number[], c: string, horizon = 44): void {
  const vx = W / 2;
  const vy = y0 - horizon;
  for (let j = y0; j < H; j++) {
    const s = (j - vy) / (H - vy);
    for (const wx of xs) dot(x, vx + wx * s, j, c);
  }
}
function perspFloorRect(x: Ctx, y0: number, x0: number, x1: number, a: string, b: string, horizon = 44): void {
  const vx = W / 2;
  const vy = y0 - horizon;
  for (let j = y0 + 2; j < H; j++) {
    const s = (j - vy) / (H - vy);
    const l = vx + x0 * s;
    const r = vx + x1 * s;
    rect(x, l, j, r - l, 1, a);
    stipple(x, l + 2, j, r - l - 4, 1, b, 0.5);
    dot(x, l, j, shade(a, 0.7));
    dot(x, r - 1, j, shade(a, 0.7));
  }
}

const HOME: Record<'bedroom' | 'dorm' | 'apartment', (night: boolean) => Spec> = { bedroom, dorm, apartment };
const DEFS = new Map<string, SceneDef>();

// The raw layer spec behind a scene (used by the HD stage to upscale scenes that
// don't have an HD painting yet, and to reuse their night lights).
export type SceneSpec = Spec;
export const NIGHT_GRADE = { ambient: NIGHT_AMBIENT, fill: FILL };
export function sceneSpec(id: ArtId, opts: SceneOpts = {}): Spec {
  const night = !!opts.night && id in HOME;
  return id in HOME ? HOME[id as keyof typeof HOME](night) : (SCENES_BASE[id as keyof typeof SCENES_BASE] ?? SCENES_BASE.street);
}

export function sceneDef(id: ArtId, opts: SceneOpts = {}): SceneDef {
  const night = !!opts.night && id in HOME;
  const key = `${id}${night ? ':night' : ''}`;
  let d = DEFS.get(key);
  if (!d) {
    const spec = id in HOME ? HOME[id as keyof typeof HOME](night) : (SCENES_BASE[id as keyof typeof SCENES_BASE] ?? SCENES_BASE.street);
    d = build(key, spec);
    DEFS.set(key, d);
  }
  return d;
}

export { CAST };

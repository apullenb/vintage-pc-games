import { NAP_TICKS, PLANT_TICKS, TICK_RATE, type Groundhog } from '../types.ts';
import { flipH, hash2, rowsToCanvas } from './pixel.ts';
import { moundSprite } from './mound.ts';
import * as F from './ghFrames.ts';
import type { FrameDef } from './ghFrames.ts';

interface Spr {
  img: HTMLCanvasElement;
  flip: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const cache = new Map<FrameDef, Spr>();
const hardCache = new Map<FrameDef, Spr>();
const PAL = { ...F.GH_PAL, ...F.LEAF_PAL };
const HARD = { ...PAL, ...F.HARD_PAL };

function spr(fd: FrameDef, hard = false): Spr {
  const m = hard ? hardCache : cache;
  let s = m.get(fd);
  if (!s) {
    const img = rowsToCanvas(fd.rows, hard ? HARD : PAL);
    s = { img, flip: flipH(img), ax: fd.ax, ay: fd.ay };
    m.set(fd, s);
  }
  return s;
}

let leafSpr: HTMLCanvasElement | null = null;

// Draws a frame anchored at feet; returns the sprite's top row.
function blit(ctx: CanvasRenderingContext2D, fd: FrameDef, sx: number, sy: number, dir: number, hard = false): number {
  const s = spr(fd, hard);
  if (dir >= 0) ctx.drawImage(s.img, sx - s.ax, sy - s.ay);
  else ctx.drawImage(s.flip, sx - (s.img.width - 1 - s.ax), sy - s.ay);
  return sy - s.ay;
}

const pick = <T>(arr: readonly T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length];
const clampIdx = <T>(arr: readonly T[], i: number): T => arr[Math.max(0, Math.min(arr.length - 1, i))];

function px(ctx: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

const DIRT_BITS = ['#7a4f2a', '#5c3a1e', '#a0703f'];

// Clods arcing away from (ox, oy) toward side `dir` (0 = both sides).
function dirtSpray(ctx: CanvasRenderingContext2D, ox: number, oy: number, t: number, dir: number, seed: number): void {
  for (let i = 0; i < 4; i++) {
    const life = (t + i * 3) % 10;
    const side = dir === 0 ? (i % 2 ? 1 : -1) : dir;
    const vx = (1 + hash2(i, seed, 7) * 1.5) * side;
    const vy = -2.4 - hash2(i, seed, 9) * 1.2;
    const x = Math.round(ox + vx * life * 0.7);
    const y = Math.round(oy + vy * life * 0.7 + 0.18 * life * life);
    px(ctx, DIRT_BITS[i % 3], x, y, i === 0 ? 2 : 1, 1);
  }
}

// 3x5 digits for the alarm countdown.
const DIGITS: Record<number, string> = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010',
  8: '111101111101111', 9: '111101111001111',
};

const BUBBLE_ROWS = [
  '..ooo..',
  '.offfo.',
  'offfffo',
  'offfffo',
  'offfffo',
  'offfffo',
  'offfffo',
  '.offfo.',
  '..ooo..',
  '...o...',
];

// Round timer bubble with a pointer; bottom row sits at `bottom`.
function drawDigit(ctx: CanvasRenderingContext2D, n: number, cx: number, bottom: number, hot: boolean): void {
  const bits = DIGITS[Math.min(9, Math.max(0, n))];
  const x0 = cx - 3, y0 = bottom - BUBBLE_ROWS.length + 1;
  const fill = hot ? '#ff7046' : '#fff4d2';
  BUBBLE_ROWS.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) if (r[x] !== '.') px(ctx, r[x] === 'o' ? '#2b1a0f' : fill, x0 + x, y0 + y);
  });
  ctx.fillStyle = hot ? '#fffaf0' : '#9a2b14';
  for (let i = 0; i < 15; i++) if (bits[i] === '1') ctx.fillRect(x0 + 2 + (i % 3), y0 + 2 + ((i / 3) | 0), 1, 1);
}

function brackets(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  const draw = (col: string, o: number) => {
    ctx.fillStyle = col;
    for (const [cx, cy, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.fillRect(cx + o, cy + o, 1, 1);
      ctx.fillRect(cx + dx + o, cy + o, 1, 1);
      ctx.fillRect(cx + o, cy + dy + o, 1, 1);
    }
  };
  draw('rgba(20,10,5,0.7)', 1);
  draw('#fff27a', 0);
}

const PUFF = { lo: '#c9b48f', mid: '#e8dbbd', hi: '#fffaf0' };
export const POOF_LEN = 18; // ticks; clamped to the last frame after

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string): void {
  ctx.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.round(Math.sqrt(r * r - dy * dy + r * 0.8));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

// Shaded dust ball: shadow under, body, highlight upper-left.
function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (r <= 0) {
    px(ctx, PUFF.mid, x, y);
    return;
  }
  disc(ctx, x, y + 1, r, PUFF.lo);
  disc(ctx, x, y, r, PUFF.mid);
  if (r >= 2) disc(ctx, x - 1, y - 1, r - 2, PUFF.hi);
  else px(ctx, PUFF.hi, x - 1, y - 1);
}

// Pop: startled swell, flash, billowing dust ring + flung clods, then wisps.
function poof(ctx: CanvasRenderingContext2D, sx: number, sy: number, tRaw: number, id: number): void {
  const t = Math.min(tRaw, POOF_LEN - 1);
  const cy = sy - 4;
  if (t < 2) {
    blit(ctx, F.FRONT_F, sx, sy - t, 1);
    return;
  }
  const u = (t - 2) / (POOF_LEN - 3); // 0..1
  const ease = 1 - (1 - u) * (1 - u);
  const fade = u < 0.55 ? 1 : Math.max(0.15, 1 - (u - 0.55) / 0.45);
  ctx.globalAlpha = fade;

  // clods from the crater
  for (let i = 0; i < 6; i++) {
    const life = t - 2;
    if (life > 12) break;
    const side = i % 2 ? 1 : -1;
    const vx = (0.6 + hash2(id, i, 11) * 1.1) * side;
    const vy = -1.6 - hash2(id, i, 13) * 1.2;
    const x = Math.round(sx + vx * life);
    const y = Math.round(cy + vy * life + 0.16 * life * life);
    px(ctx, DIRT_BITS[i % 3], x, y, i < 2 ? 2 : 1, 1);
  }

  // ring of puffs drifting out and up
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash2(id, 1, 5) * 6;
    const d = 2 + ease * (4 + hash2(id, i, 7) * 2);
    const x = Math.round(sx + Math.cos(a) * d);
    const y = Math.round(cy + Math.sin(a) * d * 0.7 - u * 3);
    puff(ctx, x, y, Math.round(2.2 - u * 2.6 + hash2(id, i, 9) * 0.6));
  }
  // core
  if (u < 0.4) puff(ctx, sx, Math.round(cy - u * 2), Math.round(3 - u * 6));
  // flash
  if (t < 5) {
    disc(ctx, sx, cy, t < 3 ? 2 : 1, PUFF.hi);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const k = (t - 1) * 2 + (dx && dy ? 1 : 3);
      px(ctx, '#fff8e0', sx + dx * k, cy + dy * Math.round(k * 0.8));
    }
  }
  // drifting motes
  for (let i = 0; i < 5; i++) {
    const a = hash2(id, i, 3) * Math.PI * 2;
    const d = 6 + ease * 5;
    px(ctx, '#bfa682', Math.round(sx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.6 - u * 4));
  }
  ctx.globalAlpha = 1;
}

const SPROUTS = [
  ['.q.', '.s.'],
  ['.q.', 'qsq', '.s.'],
  ['.qq.', 'qsqQ', '.s.'],
  ['.qsq.', 'qqqsQ', '..s..'],
];
const sproutCache: HTMLCanvasElement[] = [];

// Mushroom sprout at the planter's feet, size 0..3.
function sprout(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  const c = (sproutCache[size] ??= rowsToCanvas(SPROUTS[size], PAL));
  ctx.drawImage(c, sx - (c.width >> 1), sy - c.height + 1);
}

const Z_BIG = ['zzzz', '..z.', '.z..', 'zzzz'];

// Sleepy z's drifting up from (x, y).
function zzz(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, dir: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 2; i++) {
    const life = (t + i * 6) % 12;
    ctx.globalAlpha = alpha * (i === 0 ? 1 : 0.7);
    const zx = x + dir * (life >> 2) + (i === 0 ? 0 : dir * 2);
    const zy = y - life;
    Z_BIG.forEach((r, ry) => {
      for (let rx = 0; rx < r.length; rx++) {
        if (r[rx] !== 'z') continue;
        px(ctx, 'rgba(30,20,40,0.55)', zx + rx, zy + ry + 1);
        px(ctx, '#eef4ff', zx + rx, zy + ry);
      }
    });
  }
  ctx.globalAlpha = 1;
}

export function drawGroundhog(ctx: CanvasRenderingContext2D, g: Groundhog, sxf: number, syf: number, highlighted: boolean): void {
  if (g.state === 'saved' || g.state === 'dead') return;
  const sx = Math.round(sxf);
  const sy = Math.round(syf);
  const t = g.stateTicks;
  const d = g.dir;
  let top = sy - 10; // sprite top, for countdown / highlight

  switch (g.state) {
    case 'walking':
      blit(ctx, pick(F.WALK, (t / 3) | 0), sx, sy, d);
      top = sy - 10;
      break;
    case 'falling':
      top = blit(ctx, pick(F.FALL, (t / 3) | 0), sx, sy, d);
      break;
    case 'gliding': {
      const sway = [0, 1, 0, -1][((t / 6) | 0) % 4];
      const hangTop = blit(ctx, pick(F.HANG, (t / 4) | 0), sx, sy, d);
      if (!leafSpr) leafSpr = rowsToCanvas(F.LEAF, PAL);
      top = hangTop - F.LEAF.length + 1;
      ctx.drawImage(leafSpr, sx - 6 + sway, top);
      break;
    }
    case 'climbing':
      blit(ctx, pick(F.CLIMB, (t / 2) | 0), sx, sy, d);
      top = sy - 11;
      break;
    case 'hoisting':
      top = blit(ctx, clampIdx(F.HOIST, (t / 2) | 0), sx, sy, d);
      break;
    case 'sentry': {
      const i = [0, 0, 1, 0, 0, 2][((t / 6) | 0) % 6];
      top = blit(ctx, F.SENTRY[i], sx, sy, 1);
      break;
    }
    case 'planking':
      top = blit(ctx, F.PLANK[((t % 8) / 2) | 0], sx, sy, d);
      break;
    case 'shrugging':
      top = blit(ctx, clampIdx(F.SHRUG, (t / 3) | 0), sx, sy, d);
      break;
    case 'tunneling': {
      const i = ((t / 2) | 0) % 4;
      top = blit(ctx, F.TUNNEL[i], sx, sy, d);
      dirtSpray(ctx, sx - d * 3, sy - 3, t, -d, g.id);
      break;
    }
    case 'burrowing': {
      top = blit(ctx, pick(F.BURROW, (t / 2) | 0), sx, sy, d) + 1;
      dirtSpray(ctx, sx, sy - 2, t, 0, g.id);
      break;
    }
    case 'scraping': {
      const i = ((t / 3) | 0) % 4;
      blit(ctx, F.SCRAPE[i], sx, sy, d);
      top = sy - 10;
      if (i >= 2) dirtSpray(ctx, sx + d * 4, sy - 1, t, d, g.id);
      break;
    }
    case 'planting': {
      // ta-da, set down, then pat-pat
      const seq = [0, 0, 0, 1, 1, 1, 2, 3, 2, 3, 3, 3];
      const i = seq[Math.min(seq.length - 1, Math.floor((t * seq.length) / PLANT_TICKS))];
      top = blit(ctx, F.PLANT[i], sx, sy, d);
      if (i > 0) sprout(ctx, sx, sy, Math.min(3, Math.floor((t * 4) / PLANT_TICKS)));
      break;
    }
    case 'launched': {
      const fr = g.vy < 0 ? F.LAUNCH_UP : F.LAUNCH_DOWN;
      top = blit(ctx, pick(fr, (t / 3) | 0), sx, sy, d);
      if (fr === F.LAUNCH_UP && t % 4 < 2) {
        // whoosh streaks
        px(ctx, '#fffaf0', sx - 3, sy + 2, 1, 2);
        px(ctx, '#fffaf0', sx + 3, sy + 3, 1, 2);
      }
      break;
    }
    case 'napping': {
      const u = t / NAP_TICKS; // 0..1
      if (u < 0.25) {
        top = blit(ctx, F.NAP_YAWN[u < 0.08 ? 0 : 1], sx, sy, d);
      } else if (u < 0.4) {
        top = blit(ctx, F.NAP_LIE, sx, sy, d);
      } else {
        const ball = F.NAP_BALL[((t / 4) | 0) % 2];
        top = blit(ctx, ball, sx, sy, d);
        const harden = Math.max(0, Math.min(1, (u - 0.55) / 0.3)); // fur -> earth
        if (harden > 0) {
          ctx.globalAlpha = harden;
          blit(ctx, ball, sx, sy, d, true);
          ctx.globalAlpha = 1;
        }
        const settle = Math.max(0, Math.min(1, (u - 0.8) / 0.2)); // ball -> mound shape
        if (settle > 0) {
          const m = moundSprite();
          ctx.globalAlpha = settle;
          ctx.drawImage(m.img, sx - m.ax, sy - m.ay);
          ctx.globalAlpha = 1;
        }
        top = sy - 7;
        zzz(ctx, sx + d * 3 - (d < 0 ? 3 : 0), sy - 13, t, d, 1 - harden * 0.8);
      }
      break;
    }
    case 'splatting': {
      const i = t < 3 ? 0 : 1;
      blit(ctx, F.SPLAT[i], sx, sy, d);
      if (t < 8) {
        // impact dust
        const s = 3 + t;
        px(ctx, '#e6d5b4', sx - s, sy - 1);
        px(ctx, '#e6d5b4', sx + s, sy - 1);
        px(ctx, '#cbb690', sx - s + 1, sy - 2 - (t >> 2));
        px(ctx, '#cbb690', sx + s - 1, sy - 2 - (t >> 2));
      }
      top = sy - 5;
      break;
    }
    case 'drowning': {
      const sink = Math.min(12, (t / 2) | 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx - 8, sy - 30, 16, 30 + 1 - 3);
      ctx.clip();
      blit(ctx, pick(F.FALL, (t / 2) | 0), sx, sy + sink, d);
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const life = (t + i * 5) % 14;
        const bx = sx + [-2, 2, 0][i] + (((life >> 2) & 1) ? 1 : 0);
        const by = sy - 3 - life;
        ctx.fillStyle = '#d8f3ff';
        if (life > 2) ctx.fillRect(bx, by, 1, 1);
        if (i === 1 && life > 5) {
          ctx.fillStyle = '#9fd8f5';
          ctx.fillRect(bx - 1, by, 1, 1);
          ctx.fillRect(bx + 1, by, 1, 1);
          ctx.fillRect(bx, by - 1, 1, 1);
          ctx.fillRect(bx, by + 1, 1, 1);
        }
      }
      top = sy - 10 + sink;
      break;
    }
    case 'exiting': {
      if (t < 8) {
        blit(ctx, pick(F.WAVE, (t / 3) | 0), sx, sy, d);
      } else {
        const sink = Math.min(11, (t - 8) * 2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx - 8, sy - 20, 16, 21);
        ctx.clip();
        blit(ctx, F.FRONT_F, sx, sy + sink, d);
        ctx.restore();
      }
      break;
    }
    case 'poofing':
      poof(ctx, sx, sy, t, g.id);
      return;
  }

  if (g.alarmTicks >= 0) {
    const n = Math.ceil(g.alarmTicks / TICK_RATE);
    const sinceChange = (TICK_RATE - (g.alarmTicks % TICK_RATE)) % TICK_RATE;
    if (n > 0) drawDigit(ctx, n, sx, top - 2, sinceChange < 5);
  }
  if (highlighted) brackets(ctx, sx - 6, top - 1, sx + 6, sy + 1);
}

// Small pure helpers shared by Laser Tag and Roach Patrol (no DOM, safe in tests).

export type Rng = () => number;

// Seeded RNG (mulberry32) so tests and replays are stable.
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);

// Signed smallest difference b - a between two angles, in -PI..PI.
export function angDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inBox = (b: Box, x: number, y: number, pad = 0): boolean => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

// Does the segment (x0,y0)-(x1,y1) pass through the box (grown by pad)? Slab test.
export function segHitsBox(x0: number, y0: number, x1: number, y1: number, b: Box, pad = 0): boolean {
  const bx0 = b.x - pad;
  const by0 = b.y - pad;
  const bx1 = b.x + b.w + pad;
  const by1 = b.y + b.h + pad;
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x0 - bx0) && clip(dx, bx1 - x0) && clip(-dy, y0 - by0) && clip(dy, by1 - y0) && t0 <= t1;
}

// Push a circle (x,y,r) out of a box. Returns the corrected position.
export function pushOut(x: number, y: number, r: number, b: Box): [number, number] {
  const cx = clamp(x, b.x, b.x + b.w);
  const cy = clamp(y, b.y, b.y + b.h);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return [x, y];
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * r, cy + (dy / d) * r];
  }
  // centre inside the box: leave by the nearest side
  const l = x - b.x;
  const rr = b.x + b.w - x;
  const t = y - b.y;
  const bt = b.y + b.h - y;
  const m = Math.min(l, rr, t, bt);
  if (m === l) return [b.x - r, y];
  if (m === rr) return [b.x + b.w + r, y];
  if (m === t) return [x, b.y - r];
  return [x, b.y + b.h + r];
}

import type { Theme } from '../types.ts';
import { bayer, ctx2d, hash2, hexToRgb, makeCanvas, mix, mulberry32, pack, ramp, shade, themeSeed, valueNoise, type RGB } from './pixel.ts';

// Pixel buffer with simple paint ops.
class Buf {
  w: number;
  h: number;
  img: ImageData;
  px: Uint32Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.img = new ImageData(w, h);
    this.px = new Uint32Array(this.img.data.buffer);
  }
  set(x: number, y: number, c: RGB): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = pack(c);
  }
  get(x: number, y: number): RGB {
    const v = this.px[y * this.w + x];
    return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
  }
  blend(x: number, y: number, c: RGB, a: number): void {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.set(x, y, mix(this.get(x, y), c, a));
  }
}

const hexes = (...h: string[]): RGB[] => h.map(hexToRgb);

// Banded, ordered-dithered vertical gradient.
function sky(b: Buf, stops: RGB[], bands: number, endY: number): void {
  for (let y = 0; y < b.h; y++) {
    const t = Math.min(1, y / endY);
    for (let x = 0; x < b.w; x++) {
      const k = Math.min(bands, Math.max(0, Math.floor(t * bands + bayer(x, y))));
      b.set(x, y, ramp(stops, k / bands));
    }
  }
}

// Rolling ridge line: returns top y per column.
function ridge(w: number, base: number, amp: number, rnd: () => number, freq = 1): number[] {
  const waves = [0, 1, 2].map((i) => ({ f: (0.004 + rnd() * 0.006) * (i + 1) * freq, p: rnd() * 100, a: amp / (i + 1) }));
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    let y = base;
    for (const v of waves) y -= Math.sin(x * v.f + v.p) * v.a;
    out.push(Math.round(y));
  }
  return out;
}

function fillHills(b: Buf, tops: number[], body: RGB, rim: RGB, shadowC: RGB, seed: number, tex = 0.04): void {
  for (let x = 0; x < b.w; x++) {
    const slope = (tops[Math.min(b.w - 1, x + 3)] ?? tops[x]) - (tops[Math.max(0, x - 3)] ?? tops[x]);
    for (let y = Math.max(0, tops[x]); y < b.h; y++) {
      const dy = y - tops[x];
      let c = dy === 0 ? rim : slope > 1 && dy < 6 + slope ? mix(body, shadowC, 0.5) : body;
      if (dy > 0 && hash2(x, y, seed) < tex) c = shade(c, 0.9);
      b.set(x, y, c);
    }
  }
}

function cloud(b: Buf, cx: number, cy: number, size: number, rnd: () => number, cols: RGB[]): void {
  const puffs: [number, number, number][] = [];
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const px = cx + (i - n / 2) * size * 0.9 + (rnd() - 0.5) * size;
    const r = size * (0.7 + rnd() * 0.8) * (1 - Math.abs(i - n / 2) / n);
    puffs.push([px, cy - r * 0.4, Math.max(3, r)]);
  }
  const base = cy + size * 0.35;
  const best = new Map<number, number>();
  for (const [px, py, r] of puffs) {
    for (let y = Math.floor(py - r); y <= Math.min(base, py + r); y++) {
      if (y < 0 || y >= b.h) continue;
      for (let x = Math.floor(px - r); x <= px + r; x++) {
        if (x < 0 || x >= b.w || Math.hypot(x - px, (y - py) * 1.15) > r) continue;
        const shadeT = (y - (py - r)) / (base - (py - r) + 1);
        const k = Math.max(0, Math.min(cols.length - 1, Math.floor(shadeT * cols.length + bayer(x, y) - 0.3)));
        const key = y * b.w + x;
        const prev = best.get(key);
        if (prev === undefined || k < prev) best.set(key, k);
      }
    }
  }
  for (const [key, k] of best) b.px[key] = pack(cols[k]);
}

function tree(b: Buf, x: number, groundY: number, h: number, kind: 'pine' | 'round', body: RGB, snow?: RGB): void {
  if (kind === 'pine') {
    for (let y = 0; y < h; y++) {
      const half = Math.floor((y / h) * (h * 0.35)) + (y % 3 === 2 ? 1 : 0);
      for (let dx = -half; dx <= half; dx++) {
        const isSnow = snow && y % 3 === 0 && dx <= 0;
        b.set(x + dx, groundY - h + y, isSnow ? snow! : body);
      }
    }
    b.set(x, groundY, body);
  } else {
    const r = h * 0.4;
    const cy = groundY - h + r;
    for (let y = -r; y <= r; y++)
      for (let dx = -r; dx <= r; dx++) if (dx * dx + y * y <= r * r) b.set(x + dx, cy + y, body);
    for (let y = cy + r; y <= groundY; y++) b.set(x, y, body);
  }
}

// ---------------- themes ----------------
function meadow(b: Buf, rnd: () => number, seed: number): void {
  sky(b, hexes('#4aa3e8', '#7fc3f2', '#b4dcf6', '#e3f4fb'), 9, b.h * 0.72);
  // sun
  const sx = Math.round(b.w * 0.78), sy = 36;
  for (let y = -18; y <= 18; y++)
    for (let x = -18; x <= 18; x++) {
      const d = Math.hypot(x, y);
      if (d <= 8) b.set(sx + x, sy + y, d > 7 ? hexToRgb('#ffe9a0') : hexToRgb('#fff8d8'));
      else if (d <= 13 && bayer(sx + x, sy + y) < (13 - d) / 10) b.blend(sx + x, sy + y, hexToRgb('#fff4c0'), 0.5);
    }
  const cc = hexes('#ffffff', '#f3f9fe', '#dcecf8', '#c3dbef');
  for (let i = 0; i < Math.max(3, b.w / 110); i++) cloud(b, rnd() * b.w, 22 + rnd() * 60, 6 + rnd() * 5, rnd, cc);
  const far = ridge(b.w, b.h * 0.56, 14, rnd);
  fillHills(b, far, hexToRgb('#9ccaa8'), hexToRgb('#b8dcbc'), hexToRgb('#8bbb9a'), seed);
  const mid = ridge(b.w, b.h * 0.68, 12, rnd, 1.6);
  fillHills(b, mid, hexToRgb('#6fb35a'), hexToRgb('#94d06e'), hexToRgb('#5d9c4b'), seed + 1);
  // copses on the mid hills
  for (let i = 0; i < b.w / 40; i++) {
    const x = Math.floor(rnd() * b.w);
    tree(b, x, mid[x] + 2, 6 + Math.floor(rnd() * 5), rnd() > 0.5 ? 'round' : 'pine', hexToRgb('#3f7f3c'));
  }
  const near = ridge(b.w, b.h * 0.82, 8, rnd, 2.4);
  fillHills(b, near, hexToRgb('#4f9a3e'), hexToRgb('#79bf55'), hexToRgb('#418535'), seed + 2, 0.08);
  // wildflower specks
  for (let i = 0; i < b.w / 6; i++) {
    const x = Math.floor(rnd() * b.w);
    const y = near[x] + 2 + Math.floor(rnd() * (b.h - near[x]));
    b.set(x, y, rnd() > 0.5 ? hexToRgb('#fff2a8') : hexToRgb('#f7b6d0'));
  }
}

function dusk(b: Buf, rnd: () => number, seed: number): void {
  sky(b, hexes('#1e1640', '#3c2463', '#7a3270', '#c64f66', '#f08a4c', '#ffcb72'), 12, b.h * 0.74);
  // stars, fading toward the horizon
  for (let i = 0; i < b.w / 4; i++) {
    const x = Math.floor(rnd() * b.w), y = Math.floor(rnd() * b.h * 0.42);
    const a = 1 - y / (b.h * 0.42);
    b.blend(x, y, hexToRgb('#fff4e0'), 0.35 + a * 0.6);
    if (rnd() < 0.08) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.blend(x + dx, y + dy, hexToRgb('#ffe0c0'), 0.4 * a);
    }
  }
  // low sun
  const sx = Math.round(b.w * 0.3), sy = Math.round(b.h * 0.66);
  for (let y = -22; y <= 22; y++)
    for (let x = -22; x <= 22; x++) {
      const d = Math.hypot(x, y);
      if (d <= 14) b.set(sx + x, sy + y, mix(hexToRgb('#fff1b0'), hexToRgb('#ffb85c'), (y + 14) / 28));
      else if (d <= 22 && bayer(sx + x, sy + y) < (22 - d) / 14) b.blend(sx + x, sy + y, hexToRgb('#ffd08a'), 0.45);
    }
  const far = ridge(b.w, b.h * 0.62, 12, rnd);
  fillHills(b, far, hexToRgb('#7a3a68'), hexToRgb('#94487a'), hexToRgb('#6a3160'), seed, 0);
  const mid = ridge(b.w, b.h * 0.72, 10, rnd, 1.5);
  const sil = hexToRgb('#3a1f4a');
  fillHills(b, mid, sil, sil, sil, seed + 1, 0);
  for (let x = 2; x < b.w; x += 3 + Math.floor(rnd() * 7)) {
    if (rnd() < 0.35) continue;
    tree(b, x, mid[x] + 1, 7 + Math.floor(rnd() * 12), rnd() > 0.4 ? 'pine' : 'round', sil);
  }
  const near = ridge(b.w, b.h * 0.85, 6, rnd, 2.2);
  fillHills(b, near, hexToRgb('#24142f'), hexToRgb('#2c1838'), hexToRgb('#24142f'), seed + 2, 0);
  // fireflies
  for (let i = 0; i < b.w / 30; i++) {
    const x = Math.floor(rnd() * b.w), y = Math.floor(b.h * 0.7 + rnd() * b.h * 0.28);
    b.set(x, y, hexToRgb('#fff09a'));
    b.blend(x + 1, y, hexToRgb('#fff09a'), 0.3);
    b.blend(x - 1, y, hexToRgb('#fff09a'), 0.3);
  }
}

function winter(b: Buf, rnd: () => number, seed: number): void {
  sky(b, hexes('#8fb6dc', '#b5cfe8', '#d6e5f2', '#f0f5fa'), 9, b.h * 0.7);
  // pale sun haze
  const sx = Math.round(b.w * 0.65), sy = 44;
  for (let y = -16; y <= 16; y++)
    for (let x = -16; x <= 16; x++) {
      const d = Math.hypot(x, y);
      if (d <= 7) b.set(sx + x, sy + y, hexToRgb('#fbfdff'));
      else if (d <= 16 && bayer(sx + x, sy + y) < (16 - d) / 12) b.blend(sx + x, sy + y, hexToRgb('#ffffff'), 0.5);
    }
  // distant peaks
  const peaks = ridge(b.w, b.h * 0.5, 22, rnd, 2.2);
  for (let x = 0; x < b.w; x++) {
    for (let y = Math.max(0, peaks[x]); y < b.h; y++) {
      const dy = y - peaks[x];
      b.set(x, y, dy < 5 + ((x * 7) % 3) ? hexToRgb('#f4f8fc') : hexToRgb('#a9bfd6'));
    }
  }
  const mid = ridge(b.w, b.h * 0.66, 12, rnd, 1.4);
  fillHills(b, mid, hexToRgb('#e4edf6'), hexToRgb('#ffffff'), hexToRgb('#c3d4e6'), seed, 0.02);
  for (let x = 3; x < b.w; x += 5 + Math.floor(rnd() * 14)) {
    if (rnd() < 0.3) continue;
    tree(b, x, mid[x] + 2, 8 + Math.floor(rnd() * 9), 'pine', hexToRgb('#2f5560'), hexToRgb('#eef5fb'));
  }
  const near = ridge(b.w, b.h * 0.82, 7, rnd, 2);
  fillHills(b, near, hexToRgb('#f3f7fb'), hexToRgb('#ffffff'), hexToRgb('#cbdaea'), seed + 1, 0.03);
  // baked-in snowfall
  for (let i = 0; i < (b.w * b.h) / 140; i++) {
    const x = Math.floor(rnd() * b.w), y = Math.floor(rnd() * b.h);
    const big = rnd() < 0.15;
    b.blend(x, y, hexToRgb('#ffffff'), 0.85);
    if (big) { b.blend(x + 1, y, hexToRgb('#ffffff'), 0.6); b.blend(x, y + 1, hexToRgb('#ffffff'), 0.6); b.blend(x + 1, y + 1, hexToRgb('#ffffff'), 0.4); }
  }
}

function burrow(b: Buf, rnd: () => number, seed: number): void {
  const top = hexToRgb('#2e2016'), bot = hexToRgb('#170f0a');
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const strata = Math.sin(y * 0.12 + valueNoise(x, y, 40, seed) * 5) * 0.5 + 0.5;
      const n = valueNoise(x, y, 9, seed + 1);
      let c = mix(top, bot, y / b.h);
      c = shade(c, 0.86 + strata * 0.12 + n * 0.12 + (bayer(x, y) - 0.5) * 0.06);
      b.set(x, y, c);
    }
  }
  // pebbles
  for (let i = 0; i < b.w / 7; i++) {
    const px = rnd() * b.w, py = rnd() * b.h, r = 1 + rnd() * 2;
    const base = rnd() > 0.5 ? hexToRgb('#4c4038') : hexToRgb('#3d332d');
    for (let y = -r; y <= r; y++)
      for (let x = -r * 1.4; x <= r * 1.4; x++) {
        if ((x * x) / (r * r * 1.96) + (y * y) / (r * r) > 1) continue;
        b.set(px + x, py + y, y < -r * 0.3 && x < 0 ? shade(base, 1.35) : base);
      }
  }
  // hanging roots
  const ROOT = hexToRgb('#4d3220'), ROOT_L = hexToRgb('#674530');
  for (let i = 0; i < b.w / 22; i++) {
    let x = rnd() * b.w, y = 0;
    const len = 20 + rnd() * 70;
    let dx = (rnd() - 0.5) * 0.6;
    const thick = rnd() > 0.6 ? 2 : 1;
    for (let s = 0; s < len; s++) {
      dx += (rnd() - 0.5) * 0.3;
      dx = Math.max(-0.7, Math.min(0.7, dx));
      x += dx;
      y += 1;
      const tk = s > len * 0.7 ? 1 : thick;
      b.set(x, y, ROOT);
      if (tk > 1) b.set(x + 1, y, ROOT_L);
      if (rnd() < 0.05) {
        // rootlet
        let bx = x, by = y;
        const side = rnd() > 0.5 ? 1 : -1;
        for (let k = 0; k < 4 + rnd() * 8; k++) { bx += side * (0.6 + rnd() * 0.6); by += 0.6; b.set(bx, by, ROOT); }
      }
    }
  }
  // glowworms
  const GLOW = hexToRgb('#8ff5c8');
  for (let i = 0; i < b.w / 18; i++) {
    const x = Math.floor(rnd() * b.w), y = Math.floor(rnd() * b.h * 0.6);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= 2.2) b.blend(x + dx, y + dy, GLOW, d < 0.5 ? 0.9 : 0.16 / d);
      }
  }
}

export function renderBackground(theme: Theme, width: number, height: number): HTMLCanvasElement {
  const w = Math.max(1, Math.ceil(width)), h = Math.max(1, Math.ceil(height));
  const b = new Buf(w, h);
  const seed = themeSeed(theme);
  const rnd = mulberry32(seed);
  if (theme === 'meadow') meadow(b, rnd, seed);
  else if (theme === 'dusk') dusk(b, rnd, seed);
  else if (theme === 'winter') winter(b, rnd, seed);
  else burrow(b, rnd, seed);
  const c = makeCanvas(w, h);
  ctx2d(c).putImageData(b.img, 0, 0);
  return c;
}

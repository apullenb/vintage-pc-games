import { EMPTY, MOUND, PLANK, ROCK, type DirtyRect, type TerrainAPI, type Theme } from '../types.ts';
import { moundColor, moundTones } from './mound.ts';
import { ctx2d, hash2, hexToRgb, makeCanvas, mix, pack, shade, valueNoise, type RGB } from './pixel.ts';

interface SoilPal {
  soil: RGB[]; // light -> dark tones
  deep: RGB;
  top: RGB[]; // surface layer: highlight, main, shade
  seam: RGB; // line under the surface layer
  pebble: RGB;
  root: RGB;
}

const P = (soil: string[], deep: string, top: string[], seam: string, pebble: string, root: string): SoilPal => ({
  soil: soil.map(hexToRgb),
  deep: hexToRgb(deep),
  top: top.map(hexToRgb),
  seam: hexToRgb(seam),
  pebble: hexToRgb(pebble),
  root: hexToRgb(root),
});

const PALS: Record<Theme, SoilPal> = {
  meadow: P(['#a06a38', '#8a5a2e', '#764b26'], '#3f2513', ['#a6e46e', '#6cbd44', '#4a9a33'], '#3c5a22', '#c2ad90', '#5a3a20'),
  dusk: P(['#8e5446', '#79453b', '#663a33'], '#2f1a1c', ['#b4c86a', '#76a04e', '#4f7c46'], '#3a3a2a', '#c09a8c', '#4a2622'),
  winter: P(['#86705f', '#735f50', '#615044'], '#2e2621', ['#ffffff', '#eaf3fc', '#c3d7ee'], '#8ea2b8', '#b9b2aa', '#4a3a30'),
  burrow: P(['#9a6e46', '#835c3a', '#6f4d31'], '#3a2717', ['#9ccf5e', '#64a03e', '#467b2f'], '#33461f', '#b8a68e', '#4c3220'),
};

const ROCK_TONES = ['#a5a9b1', '#959aa3', '#868a93', '#777b84'].map(hexToRgb);
const ROCK_HI = hexToRgb('#d0d3d9');
const ROCK_LO = hexToRgb('#4a4c54');
const ROCK_MORTAR = hexToRgb('#5d6068');
const PLANK_C = hexToRgb('#d4904a');
const PLANK_HI = hexToRgb('#efb46c');
const PLANK_GRAIN = hexToRgb('#94592a');

function soilColor(pal: SoilPal, x: number, y: number, depth: number): RGB {
  const n = valueNoise(x, y, 7, 3) + (hash2(x, y, 1) - 0.5) * 0.45;
  let c = pal.soil[Math.max(0, Math.min(2, Math.floor(n * 3)))];
  const r = hash2(x, y, 2);
  if (r < 0.012) c = pal.pebble;
  else if (r < 0.026) c = pal.root;
  const t = Math.min(Math.max(depth, 0), 36) / 36;
  return mix(c, pal.deep, t * t * 0.6);
}

function rockColor(x: number, y: number): RGB {
  const row = Math.floor(y / 6);
  const off = Math.floor(hash2(row, 0, 9) * 9);
  const col = Math.floor((x + off) / 9);
  const lx = (x + off) % 9, ly = y % 6;
  if (ly === 5 || lx === 8) return ROCK_MORTAR;
  let c = ROCK_TONES[Math.floor(hash2(col, row, 4) * ROCK_TONES.length)];
  if (ly === 0 || lx === 0) c = mix(c, ROCK_HI, 0.45);
  else if (ly === 4 || lx === 7) c = shade(c, 0.86);
  const r = hash2(x, y, 5);
  if (r < 0.07) c = shade(c, 0.8);
  else if (r > 0.95) c = mix(c, ROCK_HI, 0.6);
  return c;
}

function plankColor(x: number, y: number): RGB {
  const r = hash2(x, y, 8);
  if (r < 0.16 || (x + y * 3) % 7 === 0) return PLANK_GRAIN;
  return r > 0.75 ? PLANK_HI : PLANK_C;
}

export function createTerrainView(terrain: TerrainAPI, theme: Theme): { canvas: HTMLCanvasElement; update(rects: DirtyRect[]): void } {
  const w = terrain.width, h = terrain.height;
  const mask = terrain.mask;
  const pal = PALS[theme] ?? PALS.meadow;
  const canvas = makeCanvas(w, h);
  const ctx = ctx2d(canvas);
  const img = ctx.createImageData(w, h);
  const px = new Uint32Array(img.data.buffer);
  const orig = new Uint8Array(mask);
  const base = new Uint32Array(w * h);

  // chamfer distance to nearest air; edges of the world count as solid
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = orig[i] === EMPTY ? 0 : 99;
  const relax = (i: number, j: number, c: number) => { if (dist[j] + c < dist[i]) dist[i] = dist[j] + c; };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dist[i]) continue;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) { relax(i, i - w, 1); if (x > 0) relax(i, i - w - 1, 1.4); if (x < w - 1) relax(i, i - w + 1, 1.4); }
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!dist[i]) continue;
      if (x < w - 1) relax(i, i + 1, 1);
      if (y < h - 1) { relax(i, i + w, 1); if (x < w - 1) relax(i, i + w + 1, 1.4); if (x > 0) relax(i, i + w - 1, 1.4); }
    }

  // napper mound: curl bands parallel to its open surface, grass/snow tufts on top
  const mt = moundTones(pal.soil[1]);
  const moundAt = (x: number, y: number): RGB => {
    let best = 49;
    for (let j = -6; j <= 6; j++) {
      const yy = y + j;
      if (yy < 0 || yy >= h) continue;
      for (let k = -6; k <= 6; k++) {
        const xx = x + k, d2 = k * k + j * j;
        if (d2 < best && xx >= 0 && xx < w && mask[yy * w + xx] === EMPTY) best = d2;
      }
    }
    const i = y * w + x;
    // locate this mound's centre column and feet row
    let x0 = x, x1 = x, fy = y;
    while (x0 > 0 && x - x0 < 16 && mask[i - (x - x0) - 1] === MOUND) x0--;
    while (x1 < w - 1 && x1 - x < 16 && mask[i + (x1 - x) + 1] === MOUND) x1++;
    while (fy < h - 1 && fy - y < 14 && mask[(fy + 1) * w + x] === MOUND) fy++;
    let c = moundColor(mt, x, y, Math.sqrt(best), (x0 + x1) / 2, fy);
    if (y > 0 && mask[i - w] === EMPTY && hash2(x, y, 23) < 0.3) c = pal.top[1];
    else if (y < h - 1 && mask[i + w] === EMPTY) c = shade(c, 0.72);
    return c;
  };

  const solidAt = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && orig[y * w + x] !== EMPTY;

  for (let x = 0; x < w; x++) {
    // surface layer thickness 1..3 per column
    const thick = 1 + Math.floor(valueNoise(x, 0, 5, 12) * 2.2 + hash2(x, 0, 13) * 0.9);
    let depth = 20; // solid at the top edge = no surface layer
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      const m = orig[i];
      if (m === EMPTY) { depth = 0; continue; }
      let c: RGB;
      if (m === ROCK) {
        c = rockColor(x, y);
        if (!solidAt(x, y - 1) || (orig[i - w] !== ROCK && y > 0)) c = ROCK_HI;
        else if (!solidAt(x, y + 1)) c = ROCK_LO;
        else if (!solidAt(x - 1, y) || !solidAt(x + 1, y)) c = shade(c, 0.78);
      } else if (m === PLANK) {
        c = plankColor(x, y);
      } else if (m === MOUND) {
        c = moundAt(x, y);
      } else {
        if (depth < thick) c = pal.top[Math.min(2, depth)];
        else if (depth === thick && depth < 20) c = mix(pal.seam, soilColor(pal, x, y, dist[i] - 1), 0.35);
        else c = soilColor(pal, x, y, dist[i] - 1);
        if (!solidAt(x, y + 1)) c = shade(c, 0.72); // overhang underside
      }
      base[i] = pack(c);
      depth++;
    }
  }

  const fresh = (m: number, x: number, y: number): number => {
    if (m === PLANK) return pack(plankColor(x, y));
    if (m === MOUND) return pack(moundAt(x, y));
    if (m === ROCK) return pack(rockColor(x, y));
    return pack(soilColor(pal, x, y, 10));
  };

  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) {
      let i = y * w + x0;
      for (let x = x0; x < x1; x++, i++) {
        const m = mask[i];
        px[i] = m === EMPTY ? 0 : m === orig[i] ? base[i] : fresh(m, x, y);
      }
    }
  };

  paint(0, 0, w, h);
  ctx.putImageData(img, 0, 0);

  return {
    canvas,
    update(rects: DirtyRect[]): void {
      for (const r of rects) {
        const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
        const x1 = Math.min(w, Math.ceil(r.x + r.w)), y1 = Math.min(h, Math.ceil(r.y + r.h));
        if (x1 <= x0 || y1 <= y0) continue;
        paint(x0, y0, x1, y1);
        ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
      }
    },
  };
}


// Shared pixel-art helpers: canvases, string sprites, colour maths, seeded noise.

export type Palette = Readonly<Record<string, string>>;
export type RGB = [number, number, number];

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d', { willReadFrequently: false });
  if (!x) throw new Error('2d context unavailable');
  x.imageSmoothingEnabled = false;
  return x;
}

// '.' or ' ' = transparent; every other char must be in the palette.
export function rowsToCanvas(rows: readonly string[], pal: Palette): HTMLCanvasElement {
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = makeCanvas(w, h);
  stampRows(ctx2d(c), rows, pal, 0, 0);
  return c;
}

export function stampRows(ctx: CanvasRenderingContext2D, rows: readonly string[], pal: Palette, ox: number, oy: number): void {
  for (let y = 0; y < rows.length; y++) {
    const r = rows[y];
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) throw new Error(`palette missing '${ch}'`);
      ctx.fillStyle = col;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

export function flipH(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const x = ctx2d(c);
  x.translate(src.width, 0);
  x.scale(-1, 1);
  x.drawImage(src, 0, 0);
  return c;
}

// ---------- colour ----------
export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}

export function css(c: RGB, a = 1): string {
  const r = Math.round(c[0]), g = Math.round(c[1]), b = Math.round(c[2]);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

// Packed ABGR for little-endian Uint32 views of ImageData.
export function pack(c: RGB, a = 255): number {
  const cl = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  return ((a << 24) | (cl(c[2]) << 16) | (cl(c[1]) << 8) | cl(c[0])) >>> 0;
}

// Multi-stop gradient lookup, t in [0,1].
export function ramp(stops: readonly RGB[], t: number): RGB {
  const n = stops.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  return mix(stops[i], stops[i + 1], f - i);
}

// ---------- randomness ----------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable per-pixel hash in [0,1).
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// Smooth value noise in [0,1).
export function valueNoise(x: number, y: number, scale: number, seed = 0): number {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Ordered-dither threshold in [0,1).
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

export function themeSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

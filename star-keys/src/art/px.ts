// Shared pixel helpers: canvases, colour maths, seeded noise, an RGBA pixel buffer.

export type RGB = [number, number, number];
export type Palette = Readonly<Record<string, string>>;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext('2d');
  if (!x) throw new Error('2d context unavailable');
  x.imageSmoothingEnabled = false;
  return x;
}

export function flipH(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const x = ctx2d(c);
  x.translate(src.width, 0);
  x.scale(-1, 1);
  x.drawImage(src, 0, 0);
  return c;
}

// '.' or ' ' transparent.
export function rowsToCanvas(rows: readonly string[], pal: Palette): HTMLCanvasElement {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const c = makeCanvas(w, rows.length);
  const x = ctx2d(c);
  rows.forEach((r, y) => {
    for (let i = 0; i < r.length; i++) {
      const ch = r[i];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) throw new Error(`palette missing '${ch}'`);
      x.fillStyle = col;
      x.fillRect(i, y, 1, 1);
    }
  });
  return c;
}

// ---------- colour ----------
export function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const hexes = (...h: string[]): RGB[] => h.map(hex);

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function shade(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}
export function css(c: RGB, a = 1): string {
  const r = Math.round(Math.min(255, Math.max(0, c[0])));
  const g = Math.round(Math.min(255, Math.max(0, c[1])));
  const b = Math.round(Math.min(255, Math.max(0, c[2])));
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${Math.max(0, a).toFixed(3)})`;
}
export function pack(c: RGB, a = 255): number {
  const cl = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  return ((cl(a) << 24) | (cl(c[2]) << 16) | (cl(c[1]) << 8) | cl(c[0])) >>> 0;
}
export function ramp(stops: readonly RGB[], t: number): RGB {
  const n = stops.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  return mix(stops[i], stops[i + 1], f - i);
}
// Stepped ramp lookup with ordered dither between steps.
export function dramp(stops: readonly RGB[], t: number, x: number, y: number): RGB {
  const n = stops.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(n, Math.floor(f + bayer(x, y) - 0.5 + 0.5));
  return stops[Math.max(0, i)];
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
export function hash2(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
export function valueNoise(x: number, y: number, scale: number, seed = 0): number {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export function fbm(x: number, y: number, scale: number, seed = 0, oct = 3): number {
  let s = 0, amp = 1, tot = 0, sc = scale;
  for (let i = 0; i < oct; i++) {
    s += valueNoise(x, y, sc, seed + i * 31) * amp;
    tot += amp;
    amp *= 0.5;
    sc /= 2;
  }
  return s / tot;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

export function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Tiling fbm noise (period 128) for cheap per-frame sampling.
const NT = 128;
let noiseTex: Float32Array | null = null;
function buildNoise(): Float32Array {
  const a = new Float32Array(NT * NT);
  const per = (x: number, y: number, cells: number, seed: number) => {
    const s = NT / cells;
    const fx = x / s, fy = y / s;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
    const h = (i: number, j: number) => hash2(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
    const p = h(ix, iy), q = h(ix + 1, iy), r = h(ix, iy + 1), t = h(ix + 1, iy + 1);
    return p + (q - p) * ux + (r - p) * uy + (p - q - r + t) * ux * uy;
  };
  for (let y = 0; y < NT; y++)
    for (let x = 0; x < NT; x++) a[y * NT + x] = (per(x, y, 8, 11) * 0.55 + per(x, y, 16, 12) * 0.3 + per(x, y, 32, 13) * 0.15);
  return a;
}
export function tn(x: number, y: number): number {
  const a = (noiseTex ??= buildNoise());
  return a[((y | 0) & 127) * NT + ((x | 0) & 127)];
}

// ---------- RGBA buffer ----------
export class Buf {
  w: number;
  h: number;
  img: ImageData;
  px: Uint32Array;
  constructor(w: number, h: number) {
    this.w = Math.max(1, Math.ceil(w));
    this.h = Math.max(1, Math.ceil(h));
    this.img = new ImageData(this.w, this.h);
    this.px = new Uint32Array(this.img.data.buffer);
  }
  set(x: number, y: number, c: RGB, a = 255): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = pack(c, a);
  }
  alpha(x: number, y: number): number {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x] >>> 24;
  }
  get(x: number, y: number): RGB {
    const v = this.px[Math.floor(y) * this.w + Math.floor(x)];
    return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
  }
  // Straight-alpha "over".
  blend(x: number, y: number, c: RGB, a: number): void {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = y * this.w + x;
    const v = this.px[i];
    const da = (v >>> 24) / 255;
    if (da <= 0) { this.px[i] = pack(c, a * 255); return; }
    const oa = a + da * (1 - a);
    const d: RGB = [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
    const k = a / oa;
    this.px[i] = pack(mix(d, c, k), oa * 255);
  }
  // Blend only where something is already painted (keeps silhouettes).
  tint(x: number, y: number, c: RGB, a: number): void {
    if (this.alpha(x, y) === 0) return;
    const d = this.get(x, y);
    this.px[Math.floor(y) * this.w + Math.floor(x)] = pack(mix(d, c, a), this.alpha(x, y));
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  // Soft dithered glow.
  glow(cx: number, cy: number, r: number, c: RGB, a: number): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1) continue;
        const k = (1 - d) * (1 - d) * a;
        if (bayer(x, y) < k * 2.2) this.blend(x, y, c, Math.min(1, k + 0.15));
      }
  }
  canvas(): HTMLCanvasElement {
    const c = makeCanvas(this.w, this.h);
    ctx2d(c).putImageData(this.img, 0, 0);
    return c;
  }
}

export function fillRect(ctx: CanvasRenderingContext2D, col: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const smooth = (e0: number, e1: number, v: number): number => {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

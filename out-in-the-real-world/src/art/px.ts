// Tiny pixel-painting kit: rects, dithers, ordered gradients, lighting, a 3x5 sign font.

export const W = 192;
export const H = 108;
export const INK = '#1c1424';

export type Ctx = CanvasRenderingContext2D;

export function rect(x: Ctx, px: number, py: number, w: number, h: number, c: string): void {
  x.fillStyle = c;
  x.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h));
}

export function dot(x: Ctx, px: number, py: number, c: string): void {
  x.fillStyle = c;
  x.fillRect(Math.round(px), Math.round(py), 1, 1);
}

// 50% checker dither between two colors.
export function dither(x: Ctx, px: number, py: number, w: number, h: number, a: string, b: string): void {
  px = Math.round(px);
  py = Math.round(py);
  rect(x, px, py, w, h, a);
  x.fillStyle = b;
  for (let j = 0; j < h; j++) for (let i = (j + px + py) & 1; i < w; i += 2) x.fillRect(px + i, py + j, 1, 1);
}

// Vertical banded gradient (retro sky).
export function bands(x: Ctx, px: number, py: number, w: number, h: number, colors: string[]): void {
  const n = colors.length;
  for (let i = 0; i < n; i++) {
    const y0 = py + Math.floor((h * i) / n);
    const y1 = py + Math.floor((h * (i + 1)) / n);
    rect(x, px, y0, w, y1 - y0, colors[i]);
    if (i > 0) {
      x.fillStyle = colors[i - 1];
      for (let k = 0; k < w; k += 2) x.fillRect(px + k + (i & 1), y0, 1, 1);
    }
  }
}

export function outlineRect(x: Ctx, px: number, py: number, w: number, h: number, c: string): void {
  rect(x, px, py, w, 1, c);
  rect(x, px, py + h - 1, w, 1, c);
  rect(x, px, py, 1, h, c);
  rect(x, px + w - 1, py, 1, h, c);
}

// Deterministic noise for scattering details.
export function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- color math ----------
export type RGB = [number, number, number];
export function rgbOf(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function hexOf(r: number, g: number, b: number): string {
  const c = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
// Multiply brightness (f < 1 darkens, f > 1 brightens).
export function shade(hex: string, f: number): string {
  const [r, g, b] = rgbOf(hex);
  return hexOf(r * f, g * f, b * f);
}
export function mix(a: string, b: string, t: number): string {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return hexOf(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

// ---------- ordered dithering ----------
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(i: number, j: number): number {
  return (BAYER4[((j & 3) << 2) | (i & 3)] + 0.5) / 16;
}

// Vertical gradient through color stops with a 4x4 ordered dither between stops.
export function grad(x: Ctx, px: number, py: number, w: number, h: number, stops: string[]): void {
  const n = stops.length - 1;
  for (let j = 0; j < h; j++) {
    const f = n === 0 ? 0 : (j / Math.max(1, h - 1)) * n;
    const k = Math.min(n - 1, Math.floor(f));
    const fr = f - k;
    const a = stops[Math.max(0, k)];
    const b = stops[Math.min(n, k + 1)];
    rect(x, px, py + j, w, 1, a);
    if (fr <= 0) continue;
    x.fillStyle = b;
    for (let i = 0; i < w; i++) if (fr > bayer(px + i, py + j)) x.fillRect(px + i, py + j, 1, 1);
  }
}

// Ordered-dither coverage of one color: level 0 = nothing, 1 = solid.
export function stipple(x: Ctx, px: number, py: number, w: number, h: number, c: string, level: number): void {
  if (level <= 0) return;
  px = Math.round(px);
  py = Math.round(py);
  x.fillStyle = c;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (level > bayer(px + i, py + j)) x.fillRect(px + i, py + j, 1, 1);
}

// Soft stepped glow (or shadow): concentric translucent ellipses, 3 hard steps.
export function glow(x: Ctx, cx: number, cy: number, rx: number, ry: number, c: string, strength = 0.6): void {
  const [r, g, b] = rgbOf(c);
  x.fillStyle = `rgba(${r},${g},${b},${(strength * 0.3).toFixed(3)})`;
  for (let k = 0; k < 3; k++) {
    const sx = rx * (1 - k * 0.3);
    const sy = ry * (1 - k * 0.3);
    for (let j = -Math.floor(sy); j <= sy; j++) {
      const hw = Math.round(sx * Math.sqrt(Math.max(0, 1 - (j / (sy + 0.5)) ** 2)));
      if (hw > 0) x.fillRect(Math.round(cx - hw), Math.round(cy + j), hw * 2, 1);
    }
  }
}

// A downward light cone (lamps, spotlights): a bright core inside a fainter beam.
export function cone(x: Ctx, cx: number, top: number, bottom: number, w0: number, w1: number, c: string, strength = 0.35): void {
  const [r, g, b] = rgbOf(c);
  const h = bottom - top;
  for (let j = 0; j < h; j++) {
    const f = j / h;
    const hw = (w0 + (w1 - w0) * f) / 2;
    const a = strength * (1 - f * 0.6);
    x.fillStyle = `rgba(${r},${g},${b},${(a * 0.45).toFixed(3)})`;
    x.fillRect(Math.round(cx - hw), top + j, Math.round(hw * 2), 1);
    x.fillStyle = `rgba(${r},${g},${b},${(a * 0.5).toFixed(3)})`;
    x.fillRect(Math.round(cx - hw * 0.55), top + j, Math.round(hw * 1.1), 1);
  }
}

// Filled box with highlight on top/left, shadow on bottom/right, ink outline.
export function bevel(x: Ctx, px: number, py: number, w: number, h: number, c: string, outline = true): void {
  rect(x, px, py, w, h, c);
  rect(x, px, py, w, 1, shade(c, 1.22));
  rect(x, px, py, 1, h, shade(c, 1.12));
  rect(x, px, py + h - 1, w, 1, shade(c, 0.72));
  rect(x, px + w - 1, py, 1, h, shade(c, 0.8));
  if (outline) outlineRect(x, px - 1, py - 1, w + 2, h + 2, INK);
}

export function line(x: Ctx, x0: number, y0: number, x1: number, y1: number, c: string): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  x.fillStyle = c;
  for (;;) {
    x.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) {
      e += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      e += dx;
      y0 += sy;
    }
  }
}

export function disc(x: Ctx, cx: number, cy: number, r: number, c: string): void {
  x.fillStyle = c;
  for (let j = -r; j <= r; j++) {
    const hw = Math.floor(Math.sqrt(r * r - j * j + r * 0.8));
    x.fillRect(Math.round(cx - hw), Math.round(cy + j), hw * 2 + 1, 1);
  }
}

// ---------- caching static layers ----------
const CACHE = new Map<string, HTMLCanvasElement>();
export function cached(key: string, w: number, h: number, draw: (x: Ctx) => void): HTMLCanvasElement {
  let c = CACHE.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    if (x) {
      x.imageSmoothingEnabled = false;
      draw(x);
    }
    CACHE.set(key, c);
  }
  return c;
}

// ---------- lighting ----------
export interface Light {
  x: number;
  y: number;
  r: number; // radius in px
  c: RGB; // multiplier color, e.g. [1.2, 0.95, 0.6] warm
  ry?: number; // vertical radius (defaults to r)
}

// Re-grade the whole canvas: dark ambient tint plus pools of light, quantized
// into dithered steps so it reads like a hand-shaded palette, not a blur.
export function grade(x: Ctx, ambient: RGB, lights: Light[], steps = 4): void {
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let mr = ambient[0];
      let mg = ambient[1];
      let mb = ambient[2];
      const th = bayer(i, j);
      for (const L of lights) {
        const dist = Math.hypot((i - L.x) / L.r, (j - L.y) / (L.ry ?? L.r));
        if (dist >= 1) continue;
        const f = Math.floor((1 - dist) * (1 - dist * 0.35) * steps + th) / steps;
        if (f <= 0) continue;
        mr += (L.c[0] - ambient[0]) * f;
        mg += (L.c[1] - ambient[1]) * f;
        mb += (L.c[2] - ambient[2]) * f;
      }
      const k = (j * W + i) * 4;
      d[k] = Math.min(255, d[k] * mr);
      d[k + 1] = Math.min(255, d[k + 1] * mg);
      d[k + 2] = Math.min(255, d[k + 2] * mb);
    }
  x.putImageData(img, 0, 0);
}

// 3x5 font for signs.
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '-': '000000111000000', ':': '000010000010000', '$': '011110010011110', '%': '101001010100101',
  '!': '010010010000010', '.': '000000000000010', '/': '001001010100100', '&': '010101010101011', "'": '010010000000000',
  '+': '000010111010000', '#': '101111101111101', '?': '110001010000010', ',': '000000000010100',
};

export function text(x: Ctx, s: string, px: number, py: number, c: string): number {
  let cx = Math.round(px);
  py = Math.round(py);
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch];
    if (g) {
      x.fillStyle = c;
      for (let i = 0; i < 15; i++) if (g[i] === '1') x.fillRect(cx + (i % 3), py + Math.floor(i / 3), 1, 1);
    }
    cx += 4;
  }
  return cx - px;
}
export const textWidth = (s: string): number => s.length * 4 - 1;

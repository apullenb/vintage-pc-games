// Tiny pixel-painting kit: rects, dithers, a 3x5 sign font.

export const W = 192;
export const H = 108;

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
};

export function text(x: Ctx, s: string, px: number, py: number, c: string): number {
  let cx = px;
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

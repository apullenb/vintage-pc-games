// Napper mound look: furry grey-brown earth with curl rings. Shared by terrain view and the napping sprite.
import { NAP_RX, NAP_RY } from '../types.ts';
import { ctx2d, css, hash2, hexToRgb, makeCanvas, mix, shade, type RGB } from './pixel.ts';

export interface MoundTones {
  base: RGB;
  light: RGB;
  dark: RGB;
}

const FUR = hexToRgb('#a08e7a');
const PALE = hexToRgb('#d2c2a6');

export function moundTones(soil: RGB): MoundTones {
  const base = mix(soil, FUR, 0.72);
  return { base, light: mix(base, PALE, 0.45), dark: shade(base, 0.62) };
}

export const MOUND_MEADOW = moundTones(hexToRgb('#8a5a2e'));

// d = distance (px) to open air (>= 1); (cx, fy) = mound centre column and feet row. Spiral = curled sleeper.
export function moundColor(t: MoundTones, x: number, y: number, d: number, cx: number, fy: number): RGB {
  const u = (x - cx) / NAP_RX, v = (y - (fy - 2.5)) / 4;
  const rr = Math.sqrt(u * u + v * v);
  const spiral = (((rr * 2.3 + Math.atan2(v, u) / (Math.PI * 2)) % 1) + 1) % 1;
  let c = d < 1.5 ? t.light : spiral < 0.3 && rr > 0.18 ? t.dark : t.base;
  const r = hash2(x, y >> 1, 21); // fur streaks
  if (r < 0.12) c = mix(c, t.light, 0.5);
  else if (r > 0.9) c = mix(c, t.dark, 0.6);
  return c;
}

// Engine-shaped mound (feet row = bottom), for the end of the napping anim.
let sprite: { img: HTMLCanvasElement; ax: number; ay: number } | null = null;
export function moundSprite(): { img: HTMLCanvasElement; ax: number; ay: number } {
  if (sprite) return sprite;
  const w = NAP_RX * 2 + 1, h = NAP_RY + 1;
  const inside = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const dx = (x - NAP_RX) / (NAP_RX + 0.5), dy = (h - 1 - y) / (NAP_RY + 0.5);
    return dx * dx + dy * dy <= 1;
  };
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      let best = 99;
      for (let j = -6; j <= 6; j++)
        for (let i = -6; i <= 6; i++) {
          const yy = y + j;
          if (yy < h && !inside(x + i, yy)) best = Math.min(best, i * i + j * j);
        }
      ctx.fillStyle = css(moundColor(MOUND_MEADOW, x, y, Math.sqrt(best), NAP_RX, h - 1));
      ctx.fillRect(x, y, 1, 1);
    }
  sprite = { img: c, ax: NAP_RX, ay: h - 1 };
  return sprite;
}

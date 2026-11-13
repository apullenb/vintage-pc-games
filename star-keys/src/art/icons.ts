// HUD heart and 32x32 star-map world badges.
import type { Theme } from '../types.ts';
import { bayer, Buf, dramp, fbm, hex, hexes, mix, mulberry32, rowsToCanvas, shade, type RGB } from './px.ts';
import { lambert, rock, sphere } from './paint.ts';

const HEART_FULL = [
  '.ooo.ooo.',
  'oRRRoRRRo',
  'oRHRRRRro',
  'oRRRRRRro',
  '.oRRRRro.',
  '..oRRro..',
  '...oro...',
  '....o....',
];
const HEART_EMPTY = HEART_FULL.map((r) => r.replace(/[RHr]/g, 'e'));
const HEART_PAL = { o: '#1b1533', R: '#ff3a5a', r: '#c01a3a', H: '#ffffff', e: '#3a2a4a' };
const hearts: (HTMLCanvasElement | null)[] = [null, null];

export function heart(full: boolean): HTMLCanvasElement {
  const i = full ? 1 : 0;
  return (hearts[i] ??= rowsToCanvas(full ? HEART_FULL : HEART_EMPTY, HEART_PAL));
}

const OUT = hex('#120c22');
function outline(b: Buf): void {
  const add: [number, number][] = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++)
      if (!b.alpha(x, y) && (b.alpha(x - 1, y) || b.alpha(x + 1, y) || b.alpha(x, y - 1) || b.alpha(x, y + 1))) add.push([x, y]);
  for (const [x, y] of add) b.set(x, y, OUT);
}

const L: [number, number, number] = [-0.55, -0.55, 0.63];
function planet(b: Buf, cx: number, cy: number, r: number, col: (nx: number, ny: number, nz: number, x: number, y: number) => RGB): void {
  sphere(b, cx, cy, r, (nx, ny, nz, x, y) => {
    const base = col(nx, ny, nz, x, y);
    const l = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    return dramp([shade(base, 0.3), shade(base, 0.62), base, mix(base, hex('#ffffff'), 0.35)], 0.15 + l * 0.95, x, y);
  });
}

const icons = new Map<Theme, HTMLCanvasElement>();

export function worldIcon(theme: Theme): HTMLCanvasElement {
  const hit = icons.get(theme);
  if (hit) return hit;
  const b = new Buf(32, 32);
  const rnd = mulberry32(theme.length * 31 + 7);
  switch (theme) {
    case 'launchpad': {
      planet(b, 15, 17, 11, (nx, ny, _z, x, y) => (fbm(x * 2, y * 2, 6, 3) > 0.55 ? hex('#5aa35a') : fbm(nx * 30, ny * 40, 5, 4) > 0.62 ? hex('#f4f8ff') : hex('#2f6fd0')));
      outline(b);
      // little rocket lifting off the limb
      for (let k = 0; k < 6; k++) b.set(22 + k * 0.6, 12 - k, k < 2 ? hex('#ff8a2b') : hex('#ffd27a'));
      for (let y = 0; y < 5; y++) { b.set(26, 2 + y, y === 0 ? hex('#ff8a2b') : hex('#f7f4ec')); b.set(27, 3 + y, y === 0 ? hex('#cf5518') : hex('#d3cde0')); }
      b.set(25, 6, hex('#ff8a2b')); b.set(28, 7, hex('#cf5518'));
      break;
    }
    case 'moon':
      planet(b, 16, 16, 12, (nx, ny) => {
        const cr = [[0.3, -0.2, 0.25], [-0.35, 0.3, 0.2], [0.1, 0.5, 0.15], [-0.4, -0.4, 0.12]];
        for (const [a, c, r] of cr) if (Math.hypot(nx - a, ny - c) < r) return hex('#6c6c7a');
        return fbm(nx * 20, ny * 20, 4, 9) > 0.6 ? hex('#8a8a98') : hex('#b4b4c0');
      });
      outline(b);
      break;
    case 'asteroids':
      rock(b, 12, 14, 9, rnd, hexes('#231f30', '#3f3848', '#6a5e6a', '#9a8a88', '#c9b6a2'), -0.6, -0.6);
      rock(b, 24, 22, 5, rnd, hexes('#231f30', '#3f3848', '#6a5e6a', '#9a8a88', '#c9b6a2'), -0.6, -0.6);
      rock(b, 23, 7, 3, rnd, hexes('#3f3848', '#6a5e6a', '#9a8a88'), -0.6, -0.6);
      outline(b);
      break;
    case 'mars':
      planet(b, 15, 17, 11, (_nx, ny, _z, x, y) => (Math.abs(ny) > 0.85 ? hex('#f4e8e0') : fbm(x * 2, y * 2, 5, 12) > 0.58 ? hex('#8a3a26') : hex('#d0643a')));
      rock(b, 27, 6, 2.5, rnd, hexes('#3a2420', '#6a4a40', '#9a7a68', '#c8aa90'), -0.6, -0.6);
      rock(b, 5, 4, 1.6, rnd, hexes('#6a4a40', '#c8aa90'), -0.6, -0.6);
      outline(b);
      break;
    case 'icemoon':
      planet(b, 16, 17, 11, (nx, ny, _z, x, y) => (ny < -0.55 ? hex('#ffffff') : Math.sin(nx * 9 + ny * 14 + fbm(x, y, 4, 2) * 4) > 0.8 ? hex('#5a86c0') : hex('#b8daf4')));
      outline(b);
      for (let x = 4; x < 28; x++) {
        const y = 6 + Math.round(Math.sin(x * 0.5) * 1.5);
        if (b.alpha(x, y) === 0 || bayer(x, y) < 0.5) b.set(x, y, x % 3 ? hex('#7affc0') : hex('#b06aff'));
      }
      break;
    case 'jungle':
      planet(b, 16, 16, 12, (nx, ny, _z, x, y) => (fbm(nx * 30 + 5, ny * 50, 6, 21) > 0.6 ? hex('#e8d8ff') : fbm(x * 2, y * 2, 6, 22) > 0.52 ? hex('#2fb39a') : hex('#6a3a9a')));
      outline(b);
      b.set(9, 22, hex('#ff7ad9')); b.set(20, 10, hex('#9fffe0'));
      break;
    case 'station': {
      // ring station with hub and spokes
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const dx = (x - 16) / 13, dy = (y - 16) / 6;
          const d = Math.hypot(dx, dy);
          if (d > 0.78 && d <= 1) b.set(x, y, dy < 0 ? (x < 16 ? hex('#d8e0f0') : hex('#8a96b0')) : (x < 16 ? hex('#8a96b0') : hex('#56607a')));
        }
      for (let k = -1; k <= 1; k += 2) for (let i = 4; i < 11; i++) b.set(16 + k * i, 16, hex('#8a96b0'));
      sphere(b, 16, 16, 4, (nx, ny, nz, x, y) => lambert(nx, ny, nz, L, hexes('#3a4258', '#8a96b0', '#f0f4ff'), x, y));
      for (let y = 4; y < 10; y++) b.set(16, y, hex('#8a96b0'));
      b.set(16, 3, hex('#ff4a5a'));
      for (let i = 0; i < 4; i++) b.set(5 + i * 7, 15 + (i % 2), hex('#ffd27a'));
      outline(b);
      break;
    }
    case 'gasgiant': {
      const BANDS = hexes('#f4e2c0', '#e0b07a', '#c27a4a', '#f0d8b0', '#b06842');
      planet(b, 16, 16, 10, (_nx, ny, _z, x, y) => BANDS[Math.floor((ny + 1) * 4 + fbm(x, y, 4, 5) * 0.8) % 5]);
      for (let x = 0; x < 32; x++)
        for (let k = 0; k < 2; k++) {
          const y = Math.round(16 + (x - 16) * 0.3 + k);
          const behind = Math.hypot(x - 16, y - 16) < 10 && x > 14 === false && k === 0;
          if (!behind && (Math.abs(x - 16) > 9 || y > 16)) b.set(x, y, k ? hex('#a08070') : hex('#f0dcc8'));
        }
      outline(b);
      break;
    }
    case 'factory': {
      for (let y = 9; y < 25; y++)
        for (let x = 7; x < 25; x++) {
          let c = x > 20 ? hex('#3a3444') : y < 12 ? hex('#9a92aa') : hex('#5a5468');
          if (y >= 18 && y < 21) c = ((x + y) >> 1) % 2 ? hex('#ffc93a') : hex('#1a1620');
          b.set(x, y, c);
        }
      for (let x = 2; x < 30; x++) { b.set(x, 16, hex('#6a6478')); }
      for (const px of [3, 28]) for (let y = 13; y < 20; y++) b.set(px, y, hex('#2b3d82'));
      b.set(11, 14, hex('#ff9a3a')); b.set(15, 14, hex('#ff9a3a')); b.set(19, 14, hex('#ff4a3a'));
      for (let y = 4; y < 9; y++) b.set(12, y, hex('#6a6478'));
      b.set(12, 3, hex('#ffe066'));
      outline(b);
      break;
    }
    case 'comet':
      for (let x = 0; x < 22; x++)
        for (let y = 0; y < 32; y++) {
          const u = (22 - x) / 22, dy = y - (19 + u * 5);
          const w = 2 + u * 6;
          if (Math.abs(dy) < w && bayer(x, y) < (1 - u) * (1 - Math.abs(dy) / w) * 1.4) b.set(x, y, Math.abs(dy) < w * 0.4 ? hex('#e8f6ff') : hex('#6ab8ff'));
        }
      rock(b, 22, 17, 7, rnd, hexes('#2a3450', '#4a6a9a', '#9cc4ea', '#ffffff'), -0.4, -0.7);
      outline(b);
      break;
    case 'blackhole':
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const dx = (x - 16) / 15, dy = (y - 16 - (x - 16) * 0.1) / 4;
          const d = Math.hypot(dx, dy);
          if (d < 1 && d > 0.3) b.set(x, y, dramp(hexes('#7a1a3a', '#f06a2a', '#ffc860', '#fff6e0'), 1 - d, x, y));
        }
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const d = Math.hypot(x - 16, y - 16);
          if (d < 5.5 && !(y > 17 && b.alpha(x, y) && d > 4)) b.set(x, y, hex('#000000'));
          else if (d < 6.5 && y <= 17) b.set(x, y, hex('#fff0d0'));
        }
      outline(b);
      break;
    case 'nova':
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const len = k % 2 ? 14 : 15;
        for (let i = 9; i < len; i++) b.set(16 + Math.cos(a) * i, 16 + Math.sin(a) * i, i < 12 ? hex('#ffb860') : hex('#ff6aa0'));
      }
      sphere(b, 16, 16, 9, (_nx, _ny, nz, x, y) => dramp(hexes('#ff7a3a', '#ffc860', '#fff2c0', '#ffffff'), nz * 0.9 + (fbm(x * 2, y * 2, 3, 4) - 0.5) * 0.4, x, y));
      outline(b);
      break;
  }
  const c = b.canvas();
  icons.set(theme, c);
  return c;
}

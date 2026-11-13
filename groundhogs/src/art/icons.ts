import type { SkillId } from '../types.ts';
import { ctx2d, hash2, makeCanvas } from './pixel.ts';
import { GH_PAL } from './ghFrames.ts';
import { PAD_PAL } from './pad.ts';

const GHP: Record<string, string> = { ...GH_PAL };

const N = 16;
type Layer = (string | null)[];

const C = {
  o: '#24150b',
  dirt: '#94603a',
  dirtD: '#734826',
  dirtS: '#b8895c',
  grass: '#6cbd44',
  grassL: '#a6e46e',
  hole: '#3a2414',
  holeL: '#4f331d',
  a: '#ffe27a',
  A: '#e3a83a',
  b: '#93663d',
  B: '#bd864b',
  d: '#6c4629',
  D: '#47291a',
  h: '#b59e80',
  t: '#dcc095',
  c: '#f2e7cf',
  F: '#33200f',
  e: '#0b0604',
  w: '#fffaf0',
  n: '#1d110b',
  y: '#fff4d2', // timer bubble
  r: '#9a2b14', // timer digit
  u: '#c9b48f', // dust shade
  m: '#e8dbbd', // dust
  M: '#fffaf0', // dust highlight
  k: '#f3ead2',
  G: '#2c7a2c',
  g: '#5fbf41',
  l: '#a9e86c',
  v: '#3f8f2c',
  p: '#d4904a',
  q: '#efb46c',
  P: '#94592a',
};

const layer = (): Layer => new Array(N * N).fill(null);
const set = (L: Layer, x: number, y: number, c: string) => {
  if (x >= 0 && y >= 0 && x < N && y < N) L[y * N + x] = c;
};
const get = (L: Layer, x: number, y: number) => (x >= 0 && y >= 0 && x < N && y < N ? L[y * N + x] : null);

function outline(L: Layer, col = C.o): Layer {
  const out = L.slice();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (L[y * N + x]) continue;
      if (get(L, x - 1, y) || get(L, x + 1, y) || get(L, x, y - 1) || get(L, x, y + 1)) out[y * N + x] = col;
    }
  return out;
}

function over(base: Layer, top: Layer): Layer {
  return base.map((c, i) => top[i] ?? c);
}

function stamp(L: Layer, rows: readonly string[], ox: number, oy: number, pal: Record<string, string>): void {
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') set(L, ox + x, oy + y, pal[ch] ?? C.o); }));
}

// Dirt block with optional grass cap; `hole(x,y)` carves a dark channel.
function dirt(x0: number, y0: number, x1: number, y1: number, grass: boolean, hole?: (x: number, y: number) => boolean): Layer {
  const L = layer();
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (hole?.(x, y)) { set(L, x, y, (x + y) % 3 === 0 ? C.holeL : C.hole); continue; }
      const r = hash2(x, y, 3);
      let c = r < 0.18 ? C.dirtD : r > 0.9 ? C.dirtS : C.dirt;
      if (grass && y === y0) c = C.grassL;
      else if (grass && y === y0 + 1) c = r > 0.5 ? C.grass : C.dirtD;
      set(L, x, y, c);
    }
  return L;
}

function arrowRight(L: Layer, x0: number, x1: number, cy: number): void {
  for (let x = x0; x <= x1 - 3; x++) { set(L, x, cy - 1, C.a); set(L, x, cy, C.a); set(L, x, cy + 1, C.A); }
  for (let i = 0; i < 4; i++)
    for (let dy = -(3 - i); dy <= 3 - i; dy++) set(L, x1 - 3 + i, cy + dy, dy > 0 ? C.A : C.a);
}

function arrowDown(L: Layer, cx: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1 - 3; y++) { set(L, cx - 1, y, C.a); set(L, cx, y, C.a); set(L, cx + 1, y, C.A); }
  for (let i = 0; i < 4; i++)
    for (let dx = -(3 - i); dx <= 3 - i; dx++) set(L, cx + dx, y1 - 3 + i, dx > 0 ? C.A : C.a);
}

function arrowUp(L: Layer, cx: number, y0: number, y1: number): void {
  for (let y = y0 + 3; y <= y1; y++) { set(L, cx - 1, y, C.a); set(L, cx, y, C.a); set(L, cx + 1, y, C.A); }
  for (let i = 0; i < 4; i++)
    for (let dx = -i; dx <= i; dx++) set(L, cx + dx, y0 + i, dx > 0 ? C.A : C.a);
}

function arrowDiag(L: Layer, xs: number, ys: number, xe: number, ye: number): void {
  for (let s = 0; xs + s <= xe - 2; s++) {
    set(L, xs + s, ys + s, C.a);
    set(L, xs + s + 1, ys + s, C.a);
    set(L, xs + s, ys + s + 1, C.A);
  }
  for (let y = ye - 4; y <= ye; y++)
    for (let x = xe - 4; x <= xe; x++) if (x - (xe - 4) + (y - (ye - 4)) >= 4) set(L, x, y, y === ye || x === xe ? C.A : C.a);
}

const ICON_PAL: Record<string, string> = { ...C };

function build(skill: SkillId): Layer {
  switch (skill) {
    case 'climber': {
      const wall = outline(dirt(11, 0, 15, 15, false));
      for (const [x, y] of [[13, 1], [13, 2], [14, 2], [14, 3], [12, 2], [12, 3]]) set(wall, x, y, C.hole);
      const paw = layer();
      stamp(paw, [
        '...bbbkk',
        '..bBbbbkk',
        '.bBbbbbkk',
        '.bbbbbb.',
        'bbbbbBb.',
        'bbbbbb..',
        'bbbbb...',
        'bbbb....',
        'bbb.....',
        'bb......',
      ], 2, 5, ICON_PAL);
      set(paw, 1, 15, C.b); set(paw, 0, 15, C.b); set(paw, 1, 14, C.b);
      const up = layer();
      arrowUp(up, 4, 0, 6);
      return over(over(wall, outline(paw)), outline(up));
    }
    case 'glider': {
      const L = layer();
      stamp(L, [
        '.....GGGGG.....',
        '...GGgllggGG...',
        '..GgllllggggG..',
        '.Gglllggvggggg.',
        'Gglllgggvgggggg',
        'Gglggvggvggvggg',
        'Gggggvvgvgvvggg',
        'GgggggvvvvvgggG',
        '.GG.GGGGvGGG.G.',
        '........v......',
        '........v......',
        '.......vv......',
      ], 0, 1, ICON_PAL);
      // breeze lines
      const wind = layer();
      for (const [x, y, len] of [[1, 12, 4], [3, 14, 5], [10, 13, 4]]) for (let i = 0; i < len; i++) set(wind, x + i, y, '#d8f0ff');
      return over(outline(L), wind);
    }
    case 'sentry': {
      const L = layer();
      stamp(L, [
        '.....oooooo.....',
        '....oDbbBBDo....',
        '...obibbbbibo...',
        '...orebbbbero...',
        '...obbtnntbbo...',
        '....obtwwtbo....',
        '....obtcctbo....',
        '...obbFttFbbo...',
        '...obbkttkbbo...',
        '..obbbtcttbbbo..',
        '..obbbttttbbbo..',
        '..obhbttTtbhbo..',
        '...oFFooooFFo...',
      ], 0, 1, GHP);
      // ground line
      const g = layer();
      for (let x = 1; x < 15; x++) set(g, x, 14, C.grass);
      return over(g, L);
    }
    case 'planker': {
      const L = layer();
      for (let i = 0; i < 4; i++) {
        const x = i * 3, y = 12 - i * 3;
        for (let k = 0; k < 6; k++) {
          set(L, x + k, y, k === 2 ? C.P : C.q);
          set(L, x + k, y + 1, k === 4 ? C.P : C.p);
        }
      }
      const ground = layer();
      for (let x = 0; x < N; x++) set(ground, x, 15, C.grass);
      return over(ground, outline(L));
    }
    case 'tunneler': {
      const block = outline(dirt(0, 2, 15, 15, true, (x, y) => y >= 6 && y <= 11 && x <= 11));
      const ar = layer();
      arrowRight(ar, 1, 14, 9);
      return over(block, outline(ar));
    }
    case 'burrower': {
      const block = outline(dirt(0, 5, 15, 15, true, (x, y) => x >= 5 && x <= 10 && y >= 5 && y <= 12));
      const ar = layer();
      arrowDown(ar, 8, 0, 14);
      return over(block, outline(ar));
    }
    case 'scraper': {
      const block = outline(dirt(0, 4, 15, 15, true, (x, y) => Math.abs((x - y) - 0) <= 2 && y >= 4 && x <= 12));
      const ar = layer();
      arrowDiag(ar, 1, 1, 14, 14);
      return over(block, outline(ar));
    }
    case 'popper': {
      // billowing dust puff, pop rays, flung clods + the in-game "3" timer bubble
      const cloud = layer();
      const blobs: [number, number, number][] = [[3, 13, 1.9], [5, 10, 2.4], [9, 9, 2.6], [12, 12, 2.1], [7, 13, 2.4], [10, 13.5, 1.8]];
      for (const [cx, cy, r] of blobs)
        for (let y = 0; y < N; y++)
          for (let x = 0; x < N; x++) {
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy > r * r + r * 0.5) continue;
            set(cloud, x, y, dx + dy <= -r * 0.7 ? C.M : dy >= r * 0.5 || dx + dy >= r * 1.1 ? C.u : C.m);
          }
      const fx = layer();
      for (const [x, y] of [[1, 6], [2, 7], [0, 9], [1, 9], [4, 4], [4, 5], [7, 3], [7, 4]]) set(fx, x, y, C.a);
      for (const [x, y, c] of [[0, 12, C.dirtD], [14, 8, C.dirtD], [15, 10, C.dirt], [2, 4, C.dirt]] as [number, number, string][]) set(fx, x, y, c);
      const bubble = layer();
      stamp(bubble, [
        '.ooooo.',
        'oyrrryo',
        'oyyyryo',
        'oyrrryo',
        'oyyyryo',
        'oyrrryo',
        '.ooooo.',
        '.o.....',
      ], 9, 0, ICON_PAL);
      return over(over(outline(cloud), fx), bubble);
    }
    case 'bouncer': {
      // springy pad + up-and-over arc arrow
      const ground = layer();
      for (let x = 0; x < N; x++) set(ground, x, 15, C.grass);
      const pad = layer();
      stamp(pad, [
        '...ooooo...',
        '.ooHSMMMoo.',
        'oHHMMMMSMmo',
        'oMSMMMMMMmo',
        '.oouuuuuoo.',
        '...osszo...',
      ], 0, 9, PAD_PAL);
      const arc = layer();
      for (let s = 0; s <= 40; s++) {
        const x = Math.round(5 + s * 0.2);
        const y = Math.round(1.5 + (x - 9.5) ** 2 * 0.3);
        if (x > 13) break;
        set(arc, x, y, C.a);
        set(arc, x, y + 1, C.A);
      }
      for (const [x, y] of [[12, 8], [13, 8], [14, 8], [15, 8], [13, 9], [14, 9], [15, 9], [14, 10]]) set(arc, x, y, y > 8 ? C.A : C.a);
      return over(over(ground, pad), outline(arc));
    }
    case 'napper': {
      // curled-up sleeper on a mound + z
      const L = layer();
      stamp(L, [
        '...ooooo...',
        '..obbBBBo..',
        '.obbbbbBDo.',
        'obhbbbbbbbo',
        'obbbbbbbobo',
        'obbdbbbrttn',
        'oDDDDDhhhto',
        '.ooooooooo.',
      ], 1, 7, GHP);
      const ground = layer();
      for (let x = 0; x < N; x++) set(ground, x, 15, x % 3 ? C.dirt : C.dirtD);
      const z = layer();
      stamp(z, ['zzzz', '..z.', '.z..', 'zzzz'], 11, 1, { z: '#eef4ff' });
      stamp(z, ['zzz', '..z', '.z.', 'zzz'], 8, 2, { z: '#eef4ff' });
      return over(over(ground, L), outline(z, '#2a2440'));
    }
  }
}

const iconCache = new Map<SkillId, HTMLCanvasElement>();

export function skillIcon(skill: SkillId): HTMLCanvasElement {
  let c = iconCache.get(skill);
  if (c) return c;
  c = makeCanvas(N, N);
  const ctx = ctx2d(c);
  const L = build(skill);
  for (let i = 0; i < L.length; i++) {
    const col = L[i];
    if (!col) continue;
    ctx.fillStyle = col;
    ctx.fillRect(i % N, (i / N) | 0, 1, 1);
  }
  iconCache.set(skill, c);
  return c;
}

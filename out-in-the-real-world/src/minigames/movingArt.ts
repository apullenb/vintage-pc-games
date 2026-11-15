// Moving Day pixel art: furniture and boxes at any cell size, the rental truck, the street.
import { bevel, cached, disc, dither, dot, grad, hash, INK, line, outlineRect, rect, shade, stipple, text, type Ctx } from '../art/px.ts';
import { COLS, ROWS, type ItemDef, type Weight } from './movingLogic.ts';

export const WEIGHT_COLOR: Record<Weight, string> = { heavy: '#4a4a6a', medium: '#b08a5a', light: '#5ab0e0', fragile: '#e0503c' };

function box(x: Ctx, w: number, h: number, label: string | null, s: number): void {
  bevel(x, 1, 1, w - 2, h - 2, '#c8955a');
  if (s >= 8) {
    rect(x, Math.floor(w / 2) - 1, 1, 3, h - 2, '#e6d4a4'); // tape
    rect(x, 1, Math.floor(h / 2), w - 2, 1, shade('#c8955a', 0.88));
    if (label && w >= label.length * 4 + 3) {
      rect(x, Math.round((w - label.length * 4) / 2), h - 8, label.length * 4 + 1, 7, '#f4ead0');
      text(x, label, Math.round((w - label.length * 4) / 2) + 1, h - 7, '#3a2a1a');
    }
  } else rect(x, Math.floor(w / 2), 1, 1, h - 2, '#e6d4a4');
}

// Paints an item in its natural orientation into a w x h pixel box at the origin.
function paint(x: Ctx, id: string, w: number, h: number, s: number): void {
  const big = s >= 8;
  switch (id) {
    case 'dresser': {
      bevel(x, 1, 1, w - 2, h - 2, '#8a5a34');
      rect(x, 1, 1, w - 2, 2, '#a8744a');
      const n = big ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const y = 3 + Math.floor(((h - 5) * i) / n);
        const dh = Math.floor((h - 5) / n) - 1;
        rect(x, 2, y, w - 4, dh, '#7a4e2c');
        rect(x, 2, y, w - 4, 1, '#9a6a40');
        if (big) {
          dot(x, Math.floor(w / 3), y + Math.floor(dh / 2), '#f2c84a');
          dot(x, Math.floor((2 * w) / 3), y + Math.floor(dh / 2), '#f2c84a');
        }
      }
      break;
    }
    case 'fridge': {
      bevel(x, 1, 1, w - 2, h - 2, '#e4ecf0');
      rect(x, 2, Math.floor(h * 0.38), w - 4, 1, '#a8b4bc');
      rect(x, w - 4, 3, 1, Math.floor(h * 0.3) - 2, '#5a6a78');
      rect(x, w - 4, Math.floor(h * 0.38) + 2, 1, Math.floor(h * 0.3), '#5a6a78');
      if (big) {
        dot(x, 3, h - 4, '#e0503c');
        rect(x, 3, 3, 3, 1, '#c8d4dc');
      }
      break;
    }
    case 'books':
    case 'books2':
      box(x, w, h, 'BOOKS', s);
      break;
    case 'pans':
      box(x, w, h, 'PANS', s);
      if (big) {
        rect(x, w - 7, -0, 5, 2, '#3a3a44'); // pan handle peeking out
      }
      break;
    case 'dishes': {
      box(x, w, h, null, s);
      // plates peeking out + FRAGILE stamp
      if (big) {
        // a crate of plates standing on edge
        rect(x, 2, 2, w - 4, h - 5, '#8a5a34');
        for (let i = 4; i < w - 4; i += 3) {
          rect(x, i, 1, 2, h - 5, '#f4f4f8');
          dot(x, i, 1, '#c8d8e8');
        }
        rect(x, 2, h - 4, w - 4, 2, '#e0503c');
      } else rect(x, 1, 2, w - 2, 1, '#e0503c');
      break;
    }
    case 'mattress': {
      rect(x, 1, 0, w - 2, h, '#e8eef8');
      rect(x, 0, 1, w, h - 2, '#e8eef8');
      rect(x, 0, h - 2, w, 1, '#b8c4d8');
      if (big) for (let i = 4; i < w - 2; i += 6) dot(x, i, Math.floor(h / 2) - 1, '#7a9ac8'), dot(x, i + 3, Math.floor(h / 2) + 1, '#7a9ac8');
      else for (let i = 2; i < w - 1; i += 4) dot(x, i, 1, '#7a9ac8');
      outlineRect(x, 0, 0, w, h, INK);
      for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) x.clearRect(cx, cy, 1, 1);
      break;
    }
    case 'chair': {
      const c = '#2a3a6a';
      rect(x, 2, 1, 3, Math.floor(h * 0.6), c); // backrest
      rect(x, 2, Math.floor(h * 0.45), w - 4, Math.max(2, Math.floor(h * 0.15)), shade(c, 1.2)); // seat
      rect(x, Math.floor(w / 2), Math.floor(h * 0.6), 2, Math.floor(h * 0.25), '#5a5a6a'); // column
      rect(x, 2, h - 3, w - 4, 1, '#3a3a44'); // base
      dot(x, 2, h - 2, '#1a1a22');
      dot(x, w - 3, h - 2, '#1a1a22');
      dot(x, Math.floor(w / 2), h - 2, '#1a1a22');
      outlineRect(x, 1, 0, 5, Math.floor(h * 0.6) + 1, INK);
      break;
    }
    case 'nightstand': {
      bevel(x, 1, 1, w - 2, h - 2, '#9a6a3e');
      rect(x, 2, 3, w - 4, Math.floor(h / 3), '#86592f');
      if (big) dot(x, Math.floor(w / 2), 3 + Math.floor(h / 6), '#f2c84a');
      break;
    }
    case 'clothes': {
      rect(x, 1, 2, w - 2, h - 3, '#7a4aa8');
      rect(x, 0, 3, w, h - 5, '#7a4aa8');
      rect(x, 2, 3, w - 4, 1, '#9a6ac8');
      if (big) {
        line(x, 3, 3, w - 4, 3, '#d8c8f0');
        rect(x, Math.floor(w / 2) - 3, 0, 1, 3, '#3a2a5a');
        rect(x, Math.floor(w / 2) + 2, 0, 1, 3, '#3a2a5a');
        rect(x, Math.floor(w / 2) - 3, 0, 6, 1, '#3a2a5a');
      }
      outlineRect(x, 0, 2, w, h - 2, INK);
      break;
    }
    case 'pillows': {
      rect(x, 1, 1, w - 2, h - 2, '#f4eef4');
      rect(x, 1, Math.floor(h / 2), w - 2, 1, '#ef7fae');
      outlineRect(x, 0, 0, w, h, INK);
      break;
    }
    case 'beanbag': {
      disc(x, w / 2, h / 2 + 1, Math.floor(Math.min(w, h) / 2) - 1, '#e07a3c');
      rect(x, 2, Math.floor(h * 0.6), w - 4, Math.floor(h * 0.4) - 1, '#e07a3c');
      dot(x, Math.floor(w / 3), Math.floor(h / 3), '#f2a06a');
      break;
    }
    case 'tv': {
      bevel(x, 1, 1, w - 2, h - 3, '#2a2a33');
      grad(x, 3, 3, w - 6, h - 7, ['#1c2c5c', '#2a4a8a', '#1c2c5c']);
      if (big) line(x, 5, h - 6, Math.floor(w * 0.5), 4, 'rgba(220,240,255,0.5)');
      rect(x, Math.floor(w / 2) - 3, h - 2, 6, 2, '#3a3a44');
      break;
    }
    case 'lamp': {
      const sh = Math.floor(h * 0.4);
      for (let j = 0; j < sh; j++) {
        const inset = Math.max(0, Math.floor(((sh - j) * (w * 0.25)) / sh));
        rect(x, inset, j, w - inset * 2, 1, j === 0 ? '#f8e4a8' : '#f2d48a');
      }
      rect(x, Math.floor(w / 2) - 0, sh, 1, h - sh - 2, '#5a5a6a');
      rect(x, Math.floor(w / 4), h - 2, Math.max(2, Math.ceil(w / 2)), 2, '#3a3a44');
      break;
    }
    case 'mirror': {
      rect(x, 0, 0, w, h, '#c89a3a');
      grad(x, 1, 1, w - 2, h - 2, ['#bfe4f4', '#8ac8e8']);
      if (big) line(x, 4, h - 2, 8, 1, '#ffffff');
      outlineRect(x, 0, 0, w, h, INK);
      break;
    }
    case 'guitar': {
      // lying down: body on the left, neck to the right
      const cy = Math.floor(h / 2);
      disc(x, Math.floor(h * 0.45), cy, Math.max(1, Math.floor(h / 2) - 1), '#c8742a');
      disc(x, Math.floor(h * 1.05), cy, Math.max(1, Math.floor(h / 2) - 2), '#c8742a');
      dot(x, Math.floor(h * 0.8), cy, '#3a2a1a');
      rect(x, Math.floor(h * 1.3), cy - (big ? 1 : 0), w - Math.floor(h * 1.3) - 2, big ? 2 : 1, '#5a3a22');
      rect(x, w - 3, cy - 1, 3, 3, '#3a2a1a');
      break;
    }
    case 'plant': {
      rect(x, Math.floor(w * 0.2), Math.floor(h * 0.55), Math.ceil(w * 0.6), Math.ceil(h * 0.45), '#c0603a');
      rect(x, Math.floor(w * 0.15), Math.floor(h * 0.55), Math.ceil(w * 0.7), 1, '#d8784a');
      disc(x, w / 2, h * 0.32, Math.max(1, Math.floor(w * 0.35)), '#3a9a5a');
      dot(x, Math.floor(w / 2) - 1, Math.floor(h * 0.2), '#6ac87a');
      break;
    }
    default:
      box(x, w, h, null, s);
  }
}

function weightBadge(x: Ctx, wt: Weight, s: number): void {
  if (wt === 'medium') return;
  const c = WEIGHT_COLOR[wt];
  if (s < 8) {
    rect(x, 0, 0, 2, 2, c);
    return;
  }
  rect(x, 0, 0, 7, 7, INK);
  rect(x, 0, 0, 6, 6, c);
  if (wt === 'heavy') {
    // kettlebell
    rect(x, 1, 3, 4, 2, '#e8e8f0');
    rect(x, 2, 1, 2, 1, '#e8e8f0');
    dot(x, 1, 2, '#e8e8f0');
    dot(x, 4, 2, '#e8e8f0');
  } else if (wt === 'fragile') {
    // wine glass
    rect(x, 1, 1, 4, 2, '#ffffff');
    dot(x, 2, 3, '#ffffff');
    dot(x, 3, 3, '#ffffff');
    rect(x, 2, 4, 2, 1, '#ffffff');
  } else {
    // feather
    line(x, 1, 4, 4, 1, '#ffffff');
    dot(x, 3, 3, '#ffffff');
    dot(x, 2, 2, '#ffffff');
  }
}

function cracks(x: Ctx, w: number, h: number, seed: number): void {
  x.fillStyle = 'rgba(20,10,20,0.35)';
  x.fillRect(0, 0, w, h);
  for (let k = 0; k < 2; k++) {
    let px = Math.floor(hash(seed + k) * w);
    let py = 0;
    while (py < h) {
      dot(x, px, py, '#1c1424');
      dot(x, px + 1, py, '#f4f4f8');
      py++;
      if (hash(seed * 7 + py + k * 13) < 0.5) px += hash(py + seed) < 0.5 ? -1 : 1;
    }
  }
}

// Cached sprite for an item at cell size s, optionally rotated 90 degrees (and/or broken).
export function itemSprite(d: ItemDef, s: number, rot: boolean, broken = false): HTMLCanvasElement {
  const W0 = d.w * s;
  const H0 = d.h * s;
  const base = cached(`mv-${d.id}-${s}${broken ? '-x' : ''}`, W0, H0, (x) => {
    paint(x, d.id, W0, H0, s);
    if (broken) cracks(x, W0, H0, d.id.length * 31 + s);
  });
  if (!rot) return withBadge(base, d, s, false, broken);
  const r = cached(`mv-${d.id}-${s}-r${broken ? '-x' : ''}`, H0, W0, (x) => {
    x.translate(H0, 0);
    x.rotate(Math.PI / 2);
    x.drawImage(base, 0, 0);
  });
  return withBadge(r, d, s, true, broken);
}

function withBadge(src: HTMLCanvasElement, d: ItemDef, s: number, rot: boolean, broken: boolean): HTMLCanvasElement {
  return cached(`mv-${d.id}-${s}-${rot ? 'r' : 'n'}-${broken ? 'x' : 'o'}-b`, src.width, src.height, (x) => {
    x.drawImage(src, 0, 0);
    weightBadge(x, d.weight, s);
  });
}

// ---------- the packing scene ----------
export const CELL = 10;
export const CX = 50; // cargo interior origin (left)
export const CY = 30; // cargo interior top
export const FLOOR = CY + ROWS * CELL;
export const PW = 192;
export const PH = 128;

export function packBackground(): HTMLCanvasElement {
  return cached('mv-pack-bg', PW, PH, (x) => {
    // morning sky + far skyline
    grad(x, 0, 0, PW, 70, ['#7ab8e8', '#a8d4f0', '#f2dcb8']);
    disc(x, 176, 14, 7, '#fff4c8');
    disc(x, 176, 14, 5, '#ffffff');
    for (let i = 0; i < 12; i++) {
      const bx = i * 17 - 4;
      const bh = 18 + Math.floor(hash(i * 3) * 22);
      rect(x, bx, 72 - bh, 15, bh, '#9ab0c8');
      for (let wy = 74 - bh; wy < 70; wy += 4) for (let wx = bx + 2; wx < bx + 13; wx += 3) dot(x, wx, wy, '#c8d8e8');
    }
    // trees
    for (const tx of [60, 112, 150]) {
      rect(x, tx, 60, 2, 12, '#6a4a2a');
      disc(x, tx + 1, 56, 7, '#4a9a5a');
      disc(x, tx - 1, 54, 4, '#6aba6a');
    }
    // old apartment (left)
    rect(x, 0, 22, 40, 78, '#b0604a');
    for (let y = 24; y < 100; y += 3) rect(x, 0, y, 40, 1, '#a0543e');
    for (const [wx, wy] of [[4, 28], [22, 28], [4, 48], [22, 48]]) {
      rect(x, wx, wy, 12, 12, '#f4ead0');
      rect(x, wx + 1, wy + 1, 10, 10, '#5a8ab0');
      rect(x, wx + 6, wy + 1, 1, 10, '#f4ead0');
    }
    rect(x, 12, 70, 16, 30, '#5a3a2a');
    rect(x, 14, 72, 12, 28, '#3a2418');
    rect(x, 10, 68, 20, 2, '#e8dcc0');
    dot(x, 24, 86, '#f2c84a');
    // street + curb + sidewalk
    rect(x, 0, 100, PW, 12, '#4a4a58');
    for (let i = 0; i < PW; i += 14) rect(x, i, 105, 7, 1, '#d8c84a');
    rect(x, 0, 111, PW, 2, '#b8b4a8');
    rect(x, 0, 113, PW, 15, '#d4cfc0');
    for (let i = 0; i < PW; i += 16) rect(x, i, 113, 1, 15, '#bcb6a6');
    stipple(x, 0, 120, PW, 8, '#c4bfb0', 0.3);
  });
}

// Truck with the side wall cut away so you can see the cargo bay.
export function drawTruck(x: Ctx, ox: number, oy: number, t: number, bounce = 0): void {
  const y0 = oy + bounce;
  const BW = COLS * CELL;
  const BH = ROWS * CELL;
  // cargo bay interior
  rect(x, ox + CX - 4, y0 + CY - 4, BW + 8, 4, '#e8e8ee'); // roof
  rect(x, ox + CX - 4, y0 + CY - 4, BW + 8, 1, '#ffffff');
  rect(x, ox + CX - 4, y0 + CY, 4, BH, '#c8c8d4'); // back frame
  rect(x, ox + CX - 3, y0 + CY, 1, BH, '#e8e8ee');
  rect(x, ox + CX + BW, y0 + CY, 4, BH, '#c8c8d4'); // front wall
  grad(x, ox + CX, y0 + CY, BW, BH, ['#5a5068', '#4a4258']);
  for (let i = 1; i < COLS; i++) rect(x, ox + CX + i * CELL, y0 + CY, 1, BH, 'rgba(255,255,255,0.06)');
  for (let j = 1; j < ROWS; j++) rect(x, ox + CX, y0 + CY + j * CELL, BW, 1, 'rgba(255,255,255,0.06)');
  // tie-down rails
  rect(x, ox + CX, y0 + CY + 20, BW, 1, 'rgba(0,0,0,0.25)');
  rect(x, ox + CX, y0 + CY + 40, BW, 1, 'rgba(0,0,0,0.25)');
  // floor + chassis + loading ramp
  rect(x, ox + CX - 4, y0 + FLOOR, BW + 40, 4, '#8a8a98');
  rect(x, ox + CX - 4, y0 + FLOOR, BW + 40, 1, '#b8b8c4');
  rect(x, ox + CX - 2, y0 + FLOOR + 4, BW + 36, 3, '#2a2a33');
  line(x, ox + CX - 4, y0 + FLOOR + 1, ox + CX - 14, y0 + FLOOR + 21, '#9a9aa8');
  line(x, ox + CX - 3, y0 + FLOOR + 1, ox + CX - 13, y0 + FLOOR + 21, '#6a6a78');
  rect(x, ox + CX - 4, y0 + CY - 4, BW + 8, 1, '#f2b632');
  rect(x, ox + CX - 4, y0 + CY - 1, BW + 8, 1, '#b8b8c4');
  // cab: hood, windshield, door
  const cx0 = ox + CX + BW + 4;
  rect(x, cx0, y0 + 50, 22, 40, '#e0503c');
  rect(x, cx0 + 22, y0 + 64, 10, 26, '#e0503c');
  rect(x, cx0, y0 + 50, 22, 1, '#f27a64');
  rect(x, cx0 + 22, y0 + 64, 10, 1, '#f27a64');
  rect(x, cx0 + 3, y0 + 54, 13, 11, '#9ad0f0');
  rect(x, cx0 + 3, y0 + 54, 13, 1, '#ffffff');
  line(x, cx0 + 4, y0 + 63, cx0 + 9, y0 + 56, '#d4ecf8');
  for (let j = 0; j < 13; j++) dot(x, cx0 + 17 + Math.floor(j / 3), y0 + 52 + j, '#9ad0f0');
  rect(x, cx0 + 2, y0 + 68, 1, 18, '#a83a2a');
  rect(x, cx0 + 13, y0 + 70, 3, 1, '#3a3a44');
  text(x, 'RENT', cx0 + 3, y0 + 76, '#ffe8e0');
  rect(x, cx0 + 29, y0 + 70, 3, 4, '#fff4c8');
  rect(x, cx0 + 24, y0 + 84, 9, 4, '#3a3a44');
  rect(x, cx0 + 8, y0 + 50, 8, 2, '#f2b632'); // roof light
  outlineRect(x, cx0 - 1, y0 + 49, 24, 42, INK);
  // wheels (don't bounce)
  for (const wx of [ox + CX + 14, ox + CX + BW + 18]) {
    disc(x, wx, oy + FLOOR + 10, 6, '#1c1c24');
    disc(x, wx, oy + FLOOR + 10, 3, '#8a8a98');
    const a = t * 8;
    dot(x, wx + Math.round(Math.cos(a) * 2), oy + FLOOR + 10 + Math.round(Math.sin(a) * 2), '#c8c8d4');
  }
}

// ---------- the drive scene ----------
export const DW = 192;
export const DH = 128;

export function driveSky(): HTMLCanvasElement {
  return cached('mv-drive-sky', DW, 80, (x) => {
    grad(x, 0, 0, DW, 80, ['#7ab8e8', '#a8d4f0', '#f2dcb8']);
    disc(x, 30, 16, 6, '#fff4c8');
    for (const [cx, cy, r] of [[70, 14, 5], [80, 12, 6], [90, 15, 4], [140, 26, 4], [148, 24, 5], [156, 27, 3]]) disc(x, cx, cy, r, '#f4f8fc');
  });
}

// Parallax layer: distant buildings (scroll slowly), drawn with wraparound.
export function drawCity(x: Ctx, scroll: number): void {
  for (let i = -1; i < 14; i++) {
    const n = Math.floor(scroll / 18) + i;
    const bx = i * 18 - (scroll % 18);
    const bh = 14 + Math.floor(hash(n * 5) * 24);
    rect(x, bx, 74 - bh, 16, bh, '#9ab0c8');
    for (let wy = 76 - bh; wy < 72; wy += 4) for (let wx = 2; wx < 14; wx += 3) dot(x, bx + wx, wy, '#c8d8e8');
  }
}

export function drawStreetside(x: Ctx, scroll: number): void {
  // houses and trees along the sidewalk
  for (let i = -1; i < 6; i++) {
    const n = Math.floor(scroll / 48) + i;
    const bx = i * 48 - (scroll % 48);
    const k = hash(n * 11);
    if (k < 0.55) {
      const c = ['#e8a87a', '#8ac0a8', '#c8a8d8', '#f2d48a'][Math.floor(hash(n * 3) * 4)];
      rect(x, bx + 4, 62, 34, 26, c);
      for (let j = 0; j < 10; j++) rect(x, bx + 4 + j * 1.7, 62 - j, 34 - j * 3.4, 1, '#8a4a3a');
      rect(x, bx + 10, 68, 7, 7, '#5a8ab0');
      rect(x, bx + 24, 72, 7, 16, '#6a4a3a');
    } else {
      rect(x, bx + 20, 68, 3, 20, '#6a4a2a');
      disc(x, bx + 21, 62, 9, '#4a9a5a');
      disc(x, bx + 18, 59, 5, '#6aba6a');
    }
  }
  rect(x, 0, 88, DW, 4, '#d4cfc0');
  rect(x, 0, 92, DW, 2, '#b8b4a8');
}

export function drawRoad(x: Ctx, scroll: number): void {
  rect(x, 0, 94, DW, 22, '#4a4a58');
  dither(x, 0, 94, DW, 1, '#3a3a48', '#4a4a58');
  for (let i = -1; i < 12; i++) rect(x, i * 20 - (scroll % 20), 108, 10, 1, '#d8c84a');
  rect(x, 0, 116, DW, 12, '#3a5a3a');
  stipple(x, 0, 116, DW, 12, '#4a7a4a', 0.4);
}

export type BumpKind = 'bump' | 'pothole' | 'tracks';
export function drawBump(x: Ctx, kind: BumpKind, bx: number): void {
  bx = Math.round(bx);
  // warning sign on the sidewalk a little before the hazard
  const sx = bx - 22;
  rect(x, sx, 80, 1, 12, '#8a8a98');
  if (kind === 'tracks') {
    line(x, sx - 4, 74, sx + 4, 82, '#ffffff');
    line(x, sx + 4, 74, sx - 4, 82, '#ffffff');
    line(x, sx - 4, 75, sx + 3, 82, '#e0503c');
    line(x, sx + 4, 75, sx - 3, 82, '#e0503c');
  } else {
    for (let j = 0; j < 5; j++) rect(x, sx - j, 74 + j, 1 + j * 2, 1, '#f2c84a'), rect(x, sx - j, 82 - j, 1 + j * 2, 1, '#f2c84a');
    rect(x, sx - 4, 78, 9, 1, '#f2c84a');
    rect(x, sx, 76, 1, 3, INK);
    dot(x, sx, 80, INK);
    rect(x, sx - 5, 78, 1, 1, INK);
    rect(x, sx + 5, 78, 1, 1, INK);
  }
  if (kind === 'bump') {
    rect(x, bx - 8, 101, 16, 3, '#2a2a33');
    rect(x, bx - 7, 99, 14, 3, '#f2c84a');
    rect(x, bx - 6, 98, 12, 1, '#f2c84a');
    for (let i = -6; i < 7; i += 4) rect(x, bx + i, 99, 2, 3, '#2a2a33');
  } else if (kind === 'pothole') {
    rect(x, bx - 9, 101, 18, 4, '#2a2a33');
    rect(x, bx - 7, 100, 14, 1, '#6a6a78');
    rect(x, bx - 7, 102, 14, 3, '#141418');
    dot(x, bx - 10, 101, '#6a6a78');
    dot(x, bx + 9, 102, '#6a6a78');
  } else {
    rect(x, bx - 10, 103, 22, 3, '#6a4a34'); // ties
    for (const off of [-6, 4]) {
      rect(x, bx + off, 98, 3, 6, '#9a9aa8');
      rect(x, bx + off, 98, 3, 1, '#d8d8e4');
    }
  }
}

export function drawNewPlace(x: Ctx, bx: number): void {
  bx = Math.round(bx);
  rect(x, bx, 30, 60, 58, '#6a8ab8');
  for (let y = 32; y < 88; y += 3) rect(x, bx, y, 60, 1, '#5e7eac');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) rect(x, bx + 5 + c * 14, 36 + r * 14, 9, 9, (r + c) % 3 ? '#f4ead0' : '#f2d48a');
  rect(x, bx + 24, 72, 12, 16, '#3a2418');
  rect(x, bx + 20, 70, 20, 2, '#e8dcc0');
  text(x, 'HOME', bx + 22, 64, '#ffffff');
}

// Small truck for the drive: half-scale cargo bay so you can watch the load ride.
export const DCELL = 5;
export const SMALL_BAY_W = COLS * DCELL;
export function drawSmallTruck(x: Ctx, ox: number, oy: number, t: number, bounce: number): { cx: number; cy: number } {
  const y0 = Math.round(oy + bounce);
  const bay = { cx: ox + 3, cy: y0 + 3 };
  const BW = SMALL_BAY_W;
  // body
  rect(x, ox, y0, BW + 6, 3, '#e8e8ee');
  rect(x, ox, y0, BW + 6, 1, '#ffffff');
  rect(x, ox, y0 + 3, 3, 30, '#c8c8d4');
  rect(x, ox + BW + 3, y0 + 3, 3, 30, '#c8c8d4');
  grad(x, ox + 3, y0 + 3, BW, 30, ['#5a5068', '#4a4258']);
  rect(x, ox, y0 + 33, BW + 27, 3, '#8a8a98');
  rect(x, ox + 2, y0 + 36, BW + 21, 2, '#2a2a33');
  // cab
  const cx0 = ox + BW + 6;
  rect(x, cx0, y0 + 14, 18, 19, '#e0503c');
  rect(x, cx0 + 10, y0 + 18, 8, 15, '#e0503c');
  rect(x, cx0 + 2, y0 + 17, 9, 7, '#9ad0f0');
  line(x, cx0 + 11, y0 + 14, cx0 + 18, y0 + 21, INK);
  rect(x, cx0 + 16, y0 + 26, 2, 2, '#fff4c8');
  for (const wx of [ox + 10, ox + BW + 15]) {
    disc(x, wx, oy + 40, 4, '#1c1c24');
    disc(x, wx, oy + 40, 2, '#8a8a98');
    dot(x, wx + Math.round(Math.cos(t * 12)), oy + 40 + Math.round(Math.sin(t * 12)), '#c8c8d4');
  }
  return bay;
}

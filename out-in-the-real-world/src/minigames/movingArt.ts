// Moving Day art: furniture and boxes at any cell size, the rental truck, the street.
import { bevel, cached, disc, dot, grad, hash, INK, line, outlineRect, rect, shade, text, type Ctx } from '../art/px.ts';
import { COLS, ROWS, type ItemDef, type Weight } from './movingLogic.ts';
import { ball, cyl, drawSprite, ell, glare, haze, hfill, layer, lin, pool, ptext, rad, rr, sbox, shadow, smoothSprite, tint, vfill } from './hd2Kit.tsx';

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

// Draws an item sprite smoothed (Scale2x twice) and form-shaded, at its natural logical size.
const SMOOTH = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
export function drawItem(x: Ctx, src: HTMLCanvasElement, px: number, py: number, alpha = 1): void {
  let c = SMOOTH.get(src);
  if (!c) {
    c = smoothSprite(`mv|${SMOOTH_N++}`, src.width, src.height, (g) => g.drawImage(src, 0, 0), { shade: 'box', pad: 0 });
    SMOOTH.set(src, c);
  }
  shadow(x, px + src.width / 2, py + src.height, src.width * 0.55, 1.4, 0.3 * alpha);
  drawSprite(x, c, px, py, 0, alpha);
}
let SMOOTH_N = 0;

// ---------- the packing scene ----------
export const CELL = 10;
export const CX = 50; // cargo interior origin (left)
export const CY = 30; // cargo interior top
export const FLOOR = CY + ROWS * CELL;
export const PW = 192;
export const PH = 128;

function skyline(x: Ctx, base: number, seed: number, step: number, c: string): void {
  for (let i = 0; i < 14; i++) {
    const bx = i * step - 4;
    const bh = 18 + Math.floor(hash(i * 3 + seed) * 22);
    hfill(x, bx, base - bh, step - 2, bh, [tint(c, 1.12), c, tint(c, 0.85)]);
    x.fillStyle = 'rgba(230,240,255,0.5)';
    for (let wy = base + 2 - bh; wy < base - 2; wy += 4) for (let wx = bx + 2; wx < bx + step - 4; wx += 3) x.fillRect(wx, wy, 1, 1.4);
  }
}
function tree(x: Ctx, tx: number, ty: number, r: number): void {
  shadow(x, tx + 1, ty + r + 9, r * 0.9, 1.6, 0.3);
  cyl(x, tx, ty + r - 2, 2, 12, '#6a4a2a', { spec: 0.2 });
  for (const [dx, dy, k] of [[-r * 0.5, 0, 0.8], [r * 0.5, 0.5, 0.75], [0, -r * 0.45, 1]] as const) ball(x, tx + 1 + dx, ty + dy, r * 0.75, k > 0.9 ? '#5aaa6a' : '#3e8a4e', r * 0.7, 0.25);
}

export function packBackground(): HTMLCanvasElement {
  return layer('mv-pack-bg-hd', PW, PH, (x) => {
    // late-morning sky with a warm horizon
    vfill(x, 0, 0, PW, 74, ['#5aa0e0', '#9acff0', '#f6e0bc']);
    pool(x, 176, 14, 60, 50, '#fff0c0', 0.45);
    ell(x, 176, 14, 7, 7);
    x.fillStyle = rad(x, 176, 14, 0, 7, ['#ffffff', '#fffbe8', '#fff0c0']);
    x.fill();
    pool(x, 176, 14, 14, 14, '#ffffff', 0.7);
    // far skyline, hazed by distance
    skyline(x, 72, 0, 17, '#9ab0c8');
    haze(x, 0, 40, PW, 74, '#e8eef6', 0.15, 0.55);
    // across the street: a low garden wall and hedges behind the truck
    vfill(x, 0, 72, PW, 28, ['#c8d0d8', '#a8b0b8']);
    for (let i = 0; i < PW; i += 9) ball(x, i + 4, 82, 6, i % 18 ? '#4a8a52' : '#5a9a5e', 5, 0.15);
    vfill(x, 0, 86, PW, 14, ['#b88a6a', '#9a6a4e', '#7a4e38']);
    x.fillStyle = 'rgba(60,30,20,0.3)';
    for (let y = 89; y < 100; y += 3) x.fillRect(0, y, PW, 0.5);
    sbox(x, -1, 85, PW + 2, 2, '#d8ccb8', { r: 0.5, gloss: 0.5, outline: null });
    haze(x, 0, 72, PW, 100, '#e8eef6', 0.35, 0.1);
    // trees
    for (const tx of [60, 112, 150]) tree(x, tx, 56, 8);
    // old apartment (left): shaded brick with recessed windows
    hfill(x, 0, 22, 40, 78, ['#c8705a', '#b0604a', '#8a4636']);
    x.fillStyle = 'rgba(90,30,20,0.25)';
    for (let y = 24; y < 100; y += 3) x.fillRect(0, y, 40, 0.5);
    vfill(x, 0, 22, 40, 2, ['#e8dcc0', '#a89878']);
    for (const [wx, wy] of [[4, 28], [22, 28], [4, 48], [22, 48]]) {
      sbox(x, wx, wy, 12, 12, '#f4ead0', { r: 0.6, gloss: 0.3 });
      vfill(x, wx + 1, wy + 1, 10, 10, ['#9ad0f0', '#5a8ab0', '#3a6a90']);
      glare(x, wx + 1, wy + 1, 10, 10, 0.4);
      x.fillStyle = '#f4ead0';
      x.fillRect(wx + 5.8, wy + 1, 0.6, 10);
      vfill(x, wx + 1, wy + 1, 10, 2, ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']);
    }
    sbox(x, 12, 70, 16, 30, '#5a3a2a', { r: 0.6, gloss: 0.2 });
    vfill(x, 14, 72, 12, 28, ['#2a1810', '#4a3020']);
    sbox(x, 10, 68, 20, 2.4, '#e8dcc0', { r: 0.6, gloss: 0.5 });
    ball(x, 24, 86, 0.8, '#f2c84a', 0.8, 0.8);
    hfill(x, 38, 22, 4, 78, ['rgba(20,10,20,0.35)', 'rgba(20,10,20,0)']);
    // street + curb + sidewalk
    vfill(x, 0, 100, PW, 12, ['#3a3a48', '#55556a', '#4a4a58']);
    x.fillStyle = '#e8d84a';
    for (let i = 0; i < PW; i += 14) x.fillRect(i, 105, 7, 0.9);
    vfill(x, 0, 111, PW, 2, ['#e0dcd0', '#9a968a']);
    vfill(x, 0, 113, PW, 15, ['#e4dfd0', '#d0cab8', '#bcb6a6']);
    x.fillStyle = 'rgba(120,110,95,0.4)';
    for (let i = 0; i < PW; i += 16) x.fillRect(i, 113, 0.5, 15);
  });
}

// Truck with the side wall cut away so you can see the cargo bay.
export function drawTruck(x: Ctx, ox: number, oy: number, t: number, bounce = 0): void {
  const y0 = oy + bounce;
  const BW = COLS * CELL;
  const BH = ROWS * CELL;
  shadow(x, ox + CX + BW / 2 + 14, oy + FLOOR + 15, BW * 0.75, 3.5, 0.5);
  // cargo bay interior: deep, darker toward the back wall and corners
  vfill(x, ox + CX, y0 + CY, BW, BH, ['#3a3248', '#5a5068', '#4a4258']);
  hfill(x, ox + CX, y0 + CY, BW, BH, ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']);
  x.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 1; i < COLS; i++) x.fillRect(ox + CX + i * CELL, y0 + CY, 0.5, BH);
  for (let j = 1; j < ROWS; j++) x.fillRect(ox + CX, y0 + CY + j * CELL, BW, 0.5);
  // tie-down rails
  for (const ry of [20, 40]) vfill(x, ox + CX, y0 + CY + ry - 0.5, BW, 1.4, ['rgba(160,160,180,0.35)', 'rgba(0,0,0,0.35)']);
  // roof + frames
  sbox(x, ox + CX - 4, y0 + CY - 4, BW + 8, 4, '#e8e8ee', { r: 1, gloss: 0.6 });
  x.fillStyle = '#f2b632';
  x.fillRect(ox + CX - 4, y0 + CY - 4, BW + 8, 0.7);
  cyl(x, ox + CX - 4, y0 + CY, 4, BH, '#c8c8d4', { spec: 0.5 });
  cyl(x, ox + CX + BW, y0 + CY, 4, BH, '#b8b8c8', { spec: 0.4 });
  vfill(x, ox + CX, y0 + CY, BW, 4, ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']);
  // floor + chassis + loading ramp
  sbox(x, ox + CX - 4, y0 + FLOOR, BW + 40, 4, '#8a8a98', { r: 0.6, gloss: 0.5 });
  vfill(x, ox + CX - 2, y0 + FLOOR + 4, BW + 36, 3, ['#2a2a33', '#16161c']);
  x.save();
  x.lineCap = 'round';
  x.lineWidth = 1.8;
  x.strokeStyle = '#6a6a78';
  x.beginPath();
  x.moveTo(ox + CX - 3.5, y0 + FLOOR + 1);
  x.lineTo(ox + CX - 13.5, y0 + FLOOR + 21);
  x.stroke();
  x.lineWidth = 0.6;
  x.strokeStyle = '#d8d8e4';
  x.stroke();
  x.restore();
  // cab: glossy red with a sky-reflecting windshield
  const cx0 = ox + CX + BW + 4;
  x.beginPath();
  x.moveTo(cx0, y0 + 90);
  x.lineTo(cx0, y0 + 52);
  x.quadraticCurveTo(cx0, y0 + 50, cx0 + 2, y0 + 50);
  x.lineTo(cx0 + 18, y0 + 50);
  x.quadraticCurveTo(cx0 + 21, y0 + 51, cx0 + 22, y0 + 64);
  x.lineTo(cx0 + 30, y0 + 64);
  x.quadraticCurveTo(cx0 + 32, y0 + 64.5, cx0 + 32, y0 + 67);
  x.lineTo(cx0 + 32, y0 + 90);
  x.closePath();
  x.fillStyle = lin(x, cx0, y0 + 50, cx0 + 32, y0 + 90, ['#ff8a70', '#e0503c', '#a02a1c']);
  x.fill();
  x.lineWidth = 0.6;
  x.strokeStyle = 'rgba(28,20,36,0.85)';
  x.stroke();
  x.beginPath();
  x.moveTo(cx0 + 3, y0 + 65);
  x.lineTo(cx0 + 3, y0 + 54);
  x.lineTo(cx0 + 16, y0 + 54);
  x.quadraticCurveTo(cx0 + 19, y0 + 56, cx0 + 20, y0 + 65);
  x.closePath();
  x.fillStyle = lin(x, 0, y0 + 54, 0, y0 + 65, ['#e8f8ff', '#9ad0f0', '#5a90b8']);
  x.fill();
  glare(x, cx0 + 3, y0 + 54, 17, 11, 0.45);
  x.fillStyle = 'rgba(120,20,10,0.6)';
  x.fillRect(cx0 + 2, y0 + 68, 0.6, 18);
  sbox(x, cx0 + 12.5, y0 + 70, 3.4, 1.2, '#c8ccd4', { r: 0.5, gloss: 0.6, outline: null });
  ptext(x, 'RENT', cx0 + 3, y0 + 76, '#ffe8e0', 6, 900);
  ball(x, cx0 + 30.5, y0 + 72, 1.6, '#fff4c8', 2, 0.9);
  pool(x, cx0 + 31, y0 + 72, 5, 4, '#fff4c8', 0.4);
  sbox(x, cx0 + 24, y0 + 84, 9, 4, '#3a3a44', { r: 1, gloss: 0.4 });
  sbox(x, cx0 + 8, y0 + 49.5, 8, 2.2, '#f2b632', { r: 1, gloss: 0.6 });
  // wheels (don't bounce)
  for (const wx of [ox + CX + 14, ox + CX + BW + 18]) wheel(x, wx, oy + FLOOR + 10, 6, t * 8);
}

function wheel(x: Ctx, wx: number, wy: number, r: number, a: number): void {
  ell(x, wx, wy, r, r);
  x.fillStyle = rad(x, wx - r * 0.3, wy - r * 0.3, 0, r * 1.2, ['#3a3a44', '#1c1c24', '#0a0a10']);
  x.fill();
  ell(x, wx, wy, r * 0.5, r * 0.5);
  x.fillStyle = rad(x, wx - 1, wy - 1, 0, r * 0.6, ['#e0e0ea', '#8a8a98', '#5a5a68']);
  x.fill();
  ball(x, wx + Math.cos(a) * r * 0.32, wy + Math.sin(a) * r * 0.32, r * 0.12, '#c8c8d4', r * 0.12, 0.5);
}

// ---------- the drive scene ----------
export const DW = 192;
export const DH = 128;

export function driveSky(): HTMLCanvasElement {
  return layer('mv-drive-sky-hd', DW, 80, (x) => {
    vfill(x, 0, 0, DW, 80, ['#5aa0e0', '#9acff0', '#f6e0bc']);
    pool(x, 30, 16, 50, 40, '#fff0c0', 0.45);
    ell(x, 30, 16, 6, 6);
    x.fillStyle = rad(x, 30, 16, 0, 6, ['#ffffff', '#fffbe8', '#fff0c0']);
    x.fill();
    pool(x, 30, 16, 12, 12, '#ffffff', 0.6);
    for (const [cx, cy, r] of [[70, 14, 5], [80, 12, 6], [90, 15, 4], [140, 26, 4], [148, 24, 5], [156, 27, 3]]) {
      ell(x, cx, cy, r, r * 0.8);
      x.fillStyle = rad(x, cx - r * 0.3, cy - r * 0.4, 0, r * 1.1, ['#ffffff', '#f4f8fc', 'rgba(200,215,235,0.9)']);
      x.fill();
    }
  });
}

// Parallax layer: distant buildings (scroll slowly), drawn with wraparound and distance haze.
export function drawCity(x: Ctx, scroll: number): void {
  for (let i = -1; i < 14; i++) {
    const n = Math.floor(scroll / 18) + i;
    const bx = i * 18 - (scroll % 18);
    const bh = 14 + Math.floor(hash(n * 5) * 24);
    x.fillStyle = lin(x, bx, 0, bx + 16, 0, ['#aabed4', '#9ab0c8', '#8098b0']);
    x.fillRect(bx, 74 - bh, 16, bh);
    x.fillStyle = 'rgba(230,240,255,0.5)';
    for (let wy = 76 - bh; wy < 72; wy += 4) for (let wx = 2; wx < 14; wx += 3) x.fillRect(bx + wx, wy, 1, 1.4);
  }
  haze(x, 0, 44, DW, 76, '#eef2f8', 0.1, 0.55);
}

export function drawStreetside(x: Ctx, scroll: number): void {
  // front lawns behind the sidewalk, then houses and trees
  vfill(x, 0, 72, DW, 16, ['#a8c890', '#7aa868', '#5a8a4a']);
  for (let i = -1; i < 6; i++) {
    const n = Math.floor(scroll / 48) + i;
    const bx = i * 48 - (scroll % 48);
    const k = hash(n * 11);
    if (k < 0.55) {
      const c = ['#e8a87a', '#8ac0a8', '#c8a8d8', '#f2d48a'][Math.floor(hash(n * 3) * 4)];
      shadow(x, bx + 21, 88, 20, 2, 0.3);
      hfill(x, bx + 4, 62, 34, 26, [tint(c, 1.15), c, tint(c, 0.75)]);
      x.beginPath();
      x.moveTo(bx + 2, 63);
      x.lineTo(bx + 21, 52);
      x.lineTo(bx + 40, 63);
      x.closePath();
      x.fillStyle = lin(x, bx + 4, 52, bx + 38, 63, ['#b0604a', '#8a4a3a', '#5a2a20']);
      x.fill();
      sbox(x, bx + 10, 68, 7, 7, '#5a8ab0', { r: 0.5, gloss: 0.5 });
      sbox(x, bx + 24, 72, 7, 16, '#6a4a3a', { r: 0.5, gloss: 0.3 });
    } else tree(x, bx + 20, 62, 9);
  }
  vfill(x, 0, 88, DW, 4, ['#e4dfd0', '#c8c2b2']);
  vfill(x, 0, 92, DW, 2, ['#c8c4b8', '#8a867a']);
}

export function drawRoad(x: Ctx, scroll: number): void {
  vfill(x, 0, 94, DW, 22, ['#2e2e3a', '#4a4a58', '#56566a']);
  x.fillStyle = '#e8d84a';
  for (let i = -1; i < 12; i++) x.fillRect(i * 20 - (scroll % 20), 108, 10, 0.9);
  vfill(x, 0, 116, DW, 12, ['#4a7a4a', '#3a5a3a', '#2e4a2e']);
  x.fillStyle = 'rgba(120,180,110,0.35)';
  for (let i = 0; i < DW; i += 3) x.fillRect(i - (scroll % 3), 116.5 + ((i * 7) % 5), 0.5, 1.6);
}

export type BumpKind = 'bump' | 'pothole' | 'tracks';
export function drawBump(x: Ctx, kind: BumpKind, bx: number): void {
  // warning sign on the sidewalk a little before the hazard
  const sx = bx - 22;
  cyl(x, sx - 0.5, 80, 1.2, 12, '#8a8a98', { spec: 0.4 });
  if (kind === 'tracks') {
    x.save();
    x.lineCap = 'round';
    x.lineWidth = 2;
    x.strokeStyle = '#ffffff';
    x.beginPath();
    x.moveTo(sx - 4, 74);
    x.lineTo(sx + 4, 82);
    x.moveTo(sx + 4, 74);
    x.lineTo(sx - 4, 82);
    x.stroke();
    x.lineWidth = 1;
    x.strokeStyle = '#e0503c';
    x.stroke();
    x.restore();
  } else {
    x.beginPath();
    x.moveTo(sx, 73.5);
    x.lineTo(sx + 5, 78.5);
    x.lineTo(sx, 83.5);
    x.lineTo(sx - 5, 78.5);
    x.closePath();
    x.fillStyle = lin(x, sx - 5, 74, sx + 5, 83, ['#ffe070', '#f2c84a', '#c89a20']);
    x.fill();
    x.lineWidth = 0.5;
    x.strokeStyle = INK;
    x.stroke();
    x.fillStyle = INK;
    x.fillRect(sx - 0.4, 76, 0.8, 3);
    x.fillRect(sx - 0.4, 80, 0.8, 0.8);
  }
  if (kind === 'bump') {
    shadow(x, bx, 103, 10, 1.6, 0.5);
    x.beginPath();
    x.moveTo(bx - 8, 103);
    x.quadraticCurveTo(bx, 95, bx + 8, 103);
    x.closePath();
    x.fillStyle = lin(x, 0, 98, 0, 103, ['#ffe070', '#c89a20']);
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = '#2a2a33';
    for (let i = -6; i < 7; i += 4) x.fillRect(bx + i, 96, 2, 7);
    x.restore();
  } else if (kind === 'pothole') {
    ell(x, bx, 102.5, 9, 2.6);
    x.fillStyle = '#6a6a78';
    x.fill();
    ell(x, bx, 103, 7.5, 2);
    x.fillStyle = rad(x, bx, 102, 0, 8, ['#0a0a0e', '#1a1a22', '#2a2a33']);
    x.fill();
  } else {
    sbox(x, bx - 10, 103, 22, 3, '#6a4a34', { r: 0.6, gloss: 0.2 });
    for (const off of [-6, 4]) cyl(x, bx + off, 98, 3, 6, '#9a9aa8', { spec: 0.7, cap: '#e8e8f4' });
  }
}

export function drawNewPlace(x: Ctx, bx: number): void {
  shadow(x, bx + 30, 88, 34, 2.4, 0.35);
  hfill(x, bx, 30, 60, 58, ['#88a8d8', '#6a8ab8', '#4a6a98']);
  x.fillStyle = 'rgba(30,50,90,0.3)';
  for (let y = 32; y < 88; y += 3) x.fillRect(bx, y, 60, 0.5);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      const lit = (r + c) % 3 === 0;
      sbox(x, bx + 5 + c * 14, 36 + r * 14, 9, 9, lit ? '#f2d48a' : '#c8e0f0', { r: 0.6, gloss: 0.5 });
      if (lit) pool(x, bx + 9.5 + c * 14, 40.5 + r * 14, 7, 7, '#ffe0a0', 0.3);
    }
  sbox(x, bx + 24, 72, 12, 16, '#3a2418', { r: 0.6, gloss: 0.3 });
  sbox(x, bx + 20, 70, 20, 2.4, '#e8dcc0', { r: 0.6, gloss: 0.5 });
  ptext(x, 'HOME', bx + 21.5, 63.5, '#ffffff', 6, 900);
}

// Small truck for the drive: half-scale cargo bay so you can watch the load ride.
export const DCELL = 5;
export const SMALL_BAY_W = COLS * DCELL;
export function drawSmallTruck(x: Ctx, ox: number, oy: number, t: number, bounce: number): { cx: number; cy: number } {
  const y0 = Math.round(oy + bounce);
  const bay = { cx: ox + 3, cy: y0 + 3 };
  const BW = SMALL_BAY_W;
  shadow(x, ox + BW / 2 + 12, oy + 44, BW * 0.7, 2.6, 0.5);
  // body
  vfill(x, ox + 3, y0 + 3, BW, 30, ['#3a3248', '#5a5068', '#4a4258']);
  vfill(x, ox + 3, y0 + 3, BW, 3, ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']);
  sbox(x, ox, y0, BW + 6, 3, '#e8e8ee', { r: 0.8, gloss: 0.6, outline: null });
  cyl(x, ox, y0 + 3, 3, 30, '#c8c8d4', { spec: 0.5 });
  cyl(x, ox + BW + 3, y0 + 3, 3, 30, '#b8b8c8', { spec: 0.4 });
  sbox(x, ox, y0 + 33, BW + 27, 3, '#8a8a98', { r: 0.6, gloss: 0.5, outline: null });
  vfill(x, ox + 2, y0 + 36, BW + 21, 2, ['#2a2a33', '#16161c']);
  // cab
  const cx0 = ox + BW + 6;
  x.beginPath();
  x.moveTo(cx0, y0 + 33);
  x.lineTo(cx0, y0 + 15);
  x.quadraticCurveTo(cx0, y0 + 14, cx0 + 1, y0 + 14);
  x.lineTo(cx0 + 10, y0 + 14);
  x.lineTo(cx0 + 18, y0 + 21);
  x.lineTo(cx0 + 18, y0 + 33);
  x.closePath();
  x.fillStyle = lin(x, cx0, y0 + 14, cx0 + 18, y0 + 33, ['#ff8a70', '#e0503c', '#a02a1c']);
  x.fill();
  x.lineWidth = 0.5;
  x.strokeStyle = 'rgba(28,20,36,0.85)';
  x.stroke();
  rr(x, cx0 + 2, y0 + 17, 9, 7, 0.8);
  x.fillStyle = lin(x, 0, y0 + 17, 0, y0 + 24, ['#e8f8ff', '#9ad0f0', '#5a90b8']);
  x.fill();
  ball(x, cx0 + 17, y0 + 27, 1.1, '#fff4c8', 1.1, 0.9);
  for (const wx of [ox + 10, ox + BW + 15]) wheel(x, wx, oy + 40, 4, t * 12);
  return bay;
}

import type { Hazard } from '../types.ts';
import { ctx2d, css, hash2, hexToRgb, makeCanvas, mix, shade, type RGB } from './pixel.ts';

type Plot = (x: number, y: number, c: RGB | string) => void;

function plotter(ctx: CanvasRenderingContext2D): Plot {
  return (x, y, c) => {
    ctx.fillStyle = typeof c === 'string' ? c : css(c);
    ctx.fillRect(x, y, 1, 1);
  };
}

// ================= entrance: hollow log with swinging bark lid =================
const ENT_W = 36;
const ENT_H = 48;
const ENT_OX = 18; // canvas x of drop point
const ENT_OY = 38; // canvas y of drop point
const LID_STEPS = 12;
const entCache: HTMLCanvasElement[] = [];

const BARK: RGB = hexToRgb('#6e4728');
const BARK_DK: RGB = hexToRgb('#3d2513');
const BARK_LT: RGB = hexToRgb('#9a6a3e');
const WOOD: RGB = hexToRgb('#d9ad6e');
const WOOD_RING: RGB = hexToRgb('#b98a4f');
const OUTL = '#24150b';
const MOSS: RGB = hexToRgb('#6aa83a');
const MOSS_LT: RGB = hexToRgb('#9fd25a');

function buildEntrance(step: number): HTMLCanvasElement {
  const c = makeCanvas(ENT_W, ENT_H);
  const ctx = ctx2d(c);
  const p = plotter(ctx);
  const cx = ENT_OX;
  const mouthY = ENT_OY - 11; // centre row of the mouth ellipse
  const halfW = 9;
  const topY = 2;

  // log body with cylindrical shading
  for (let x = -halfW; x <= halfW; x++) {
    const jag = Math.floor(hash2(x, 3, 11) * 4) + (Math.abs(x) > 5 ? 2 : 0);
    const u = x / halfW;
    const light = 1.05 - 0.45 * Math.abs(u + 0.35);
    for (let y = topY + jag; y <= mouthY; y++) {
      const X = cx + x;
      if (Math.abs(x) === halfW || y === topY + jag) { p(X, y, OUTL); continue; }
      let col = shade(BARK, light);
      const fissure = (x + 9) % 3 === 0 && hash2(x, y >> 2, 5) > 0.25;
      if (fissure) col = shade(BARK_DK, light + 0.1);
      else if (hash2(x, y, 6) > 0.86) col = shade(BARK_LT, light);
      // moss on the shaded top-left
      if (x < -1 && y < topY + jag + 6 + hash2(x, 0, 4) * 4) col = hash2(x, y, 9) > 0.6 ? MOSS_LT : MOSS;
      p(X, y, col);
    }
  }
  // broken top: pale inner wood showing
  for (let x = -halfW + 2; x <= halfW - 2; x++) {
    const jag = Math.floor(hash2(x, 3, 11) * 4) + (Math.abs(x) > 5 ? 2 : 0);
    p(cx + x, topY + jag + 1, mix(WOOD, BARK, 0.4));
  }
  // knot hole
  const kx = cx + 3, ky = mouthY - 10;
  p(kx, ky - 1, BARK_LT); p(kx + 1, ky - 1, BARK_LT);
  p(kx - 1, ky, BARK_LT); p(kx, ky, '#1a0f08'); p(kx + 1, ky, '#1a0f08'); p(kx + 2, ky, BARK_DK);
  p(kx, ky + 1, BARK_DK); p(kx + 1, ky + 1, BARK_DK);
  // side branch stub with a leaf
  for (let i = 0; i < 4; i++) {
    p(cx + halfW + 1 + i, mouthY - 15 - (i >> 1), BARK_DK);
    p(cx + halfW + 1 + i, mouthY - 14 - (i >> 1), BARK);
  }
  p(cx + halfW + 4, mouthY - 18, MOSS);
  p(cx + halfW + 5, mouthY - 18, MOSS_LT);
  p(cx + halfW + 5, mouthY - 19, MOSS);
  p(cx + halfW + 6, mouthY - 19, MOSS);
  // little toadstool
  const mx = cx - halfW - 1, my = mouthY - 6;
  p(mx - 2, my, '#c23b2b'); p(mx - 1, my, '#e5533f'); p(mx, my, '#c23b2b');
  p(mx - 3, my + 1, '#a32e22'); p(mx - 2, my + 1, '#f1efe6'); p(mx - 1, my + 1, '#e5533f'); p(mx, my + 1, '#a32e22');
  p(mx - 1, my + 2, '#efe3c6'); p(mx - 1, my + 3, '#efe3c6');

  // mouth: cut end ring around a dark hollow
  const rx = halfW, ry = 3;
  for (let y = -ry - 1; y <= ry + 1; y++) {
    for (let x = -rx - 1; x <= rx + 1; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d > 1.15) continue;
      const X = cx + x, Y = mouthY + y;
      if (d > 0.85) p(X, Y, OUTL);
      else if (d > 0.45) p(X, Y, (Math.round(Math.sqrt(d) * 6) & 1) ? WOOD_RING : WOOD);
      else p(X, Y, y < 0 ? '#0e0805' : '#22150c');
    }
  }

  // lid: disc hinged at the mouth's left rim, swinging down
  const theta = (step / LID_STEPS) * (Math.PI * 0.5);
  const lrx = 8.5, lry = 2.6 + 3.4 * Math.sin(theta); // tilts toward viewer as it opens
  const hx = cx - rx + 0.5, hy = mouthY;
  const lcx = hx + Math.cos(theta) * lrx;
  const lcy = hy + Math.sin(theta) * lrx;
  const co = Math.cos(theta), si = Math.sin(theta);
  for (let y = Math.floor(lcy - 9); y <= Math.ceil(lcy + 9); y++) {
    for (let x = Math.floor(lcx - 9); x <= Math.ceil(lcx + 9); x++) {
      const dx = x + 0.5 - lcx - 0.5, dy = y + 0.5 - lcy - 0.5;
      const u = dx * co + dy * si;
      const v = -dx * si + dy * co;
      const d = (u * u) / ((lrx + 0.5) ** 2) + (v * v) / ((lry + 0.5) ** 2);
      if (d > 1) continue;
      let col: RGB | string;
      if (d > 0.74) col = OUTL;
      else if (d > 0.45) col = v > 0 ? BARK_DK : BARK;
      else col = (Math.round(Math.sqrt(d) * 6) & 1) ? WOOD_RING : WOOD;
      p(x, y, col);
    }
  }
  // hinge pin
  p(Math.round(hx) - 1, hy, '#8a8f99');
  p(Math.round(hx) - 1, hy - 1, '#4a4e57');
  return c;
}

const VINE: RGB = hexToRgb('#3f6b26');
const VINE_LT: RGB = hexToRgb('#6aa83a');

// Twin vines from the ceiling (or sky) down to the log top, so it visibly hangs.
function drawVines(ctx: CanvasRenderingContext2D, sx: number, sy: number, anchorY: number): void {
  const p = plotter(ctx);
  const bottom = sy - ENT_OY + 6;
  for (const dx of [-6, 6]) {
    const x0 = sx + dx;
    for (let y = Math.max(0, anchorY); y < bottom; y++) {
      const sway = (y >> 3) & 1 ? (dx < 0 ? -1 : 1) : 0;
      p(x0 + sway, y, (y & 3) === 0 ? VINE_LT : VINE);
      if (hash2(dx, y, 21) > 0.82) p(x0 + sway + (y & 1 ? 1 : -1), y, MOSS_LT);
    }
  }
}

export function drawEntrance(ctx: CanvasRenderingContext2D, sx: number, sy: number, open: number, _tick: number, anchorY = 0): void {
  sx = Math.round(sx); sy = Math.round(sy);
  if (anchorY < sy - ENT_OY + 6) drawVines(ctx, sx, sy, anchorY);
  const step = Math.round(Math.max(0, Math.min(1, open)) * LID_STEPS);
  let img = entCache[step];
  if (!img) img = entCache[step] = buildEntrance(step);
  ctx.drawImage(img, Math.round(sx) - ENT_OX, Math.round(sy) - ENT_OY);
}

// ================= exit: round burrow door in a grassy mound =================
const EX_W = 64;
const EX_H = 36;
const EX_OX = 32;
const EX_OY = 31; // canvas row of the feet point
const LANT_DX = -14; // lantern position relative to feet point
const LANT_DY = -24;
let exitImg: HTMLCanvasElement | null = null;

function buildExit(): HTMLCanvasElement {
  const c = makeCanvas(EX_W, EX_H);
  const ctx = ctx2d(c);
  const p = plotter(ctx);
  const cx = EX_OX, gy = EX_OY;
  const G1 = hexToRgb('#4f9a35'), G2 = hexToRgb('#3c7d2b'), G3 = hexToRgb('#7cc24a'), GD = hexToRgb('#24501d');
  const SOIL = hexToRgb('#6b4527');

  // mound
  const rx = 27, ry = 25, my = gy + 3;
  for (let y = my - ry - 1; y <= gy + 3; y++) {
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const dx = (x - cx) / rx, dy = (y - my) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const lit = -dx * 0.55 - dy * 0.85;
      let col: RGB = lit > 0.62 ? G3 : lit > 0.2 ? G1 : G2;
      const r = hash2(x, y, 21);
      if (r > 0.92) col = mix(col, G3, 0.6);
      else if (r < 0.05) col = mix(col, GD, 0.5);
      if (y > gy) col = mix(SOIL, G2, 0.15);
      p(x, y, d > 0.9 ? GD : col);
    }
  }
  // grass tufts on the rim
  for (let x = cx - rx + 3; x <= cx + rx - 3; x += 2) {
    const dx = (x - cx) / rx;
    const top = Math.round(my - ry * Math.sqrt(Math.max(0, 1 - dx * dx)));
    if (hash2(x, 1, 2) > 0.5) { p(x, top - 1, GD); if (hash2(x, 2, 2) > 0.5) p(x, top - 2, G1); }
  }
  // stubby stone chimney
  const chx = cx + 12, chy = my - Math.round(ry * Math.sqrt(1 - (12 / rx) ** 2));
  for (let y = chy - 5; y <= chy + 1; y++)
    for (let x = chx - 2; x <= chx + 2; x++)
      p(x, y, x === chx - 2 || x === chx + 2 || y === chy - 5 ? '#4c4842' : (x + y) % 3 ? '#9a958c' : '#7c776f');
  // stone ring around a warm doorway
  const dcx = cx, dcy = gy - 8, dr = 9;
  for (let y = dcy - dr - 2; y <= gy; y++) {
    for (let x = dcx - dr - 2; x <= dcx + dr + 2; x++) {
      const d = Math.hypot(x - dcx, y - dcy);
      if (d > dr + 1.6) continue;
      if (d > dr - 0.6) {
        const a = Math.atan2(y - dcy, x - dcx);
        const seam = Math.abs(Math.sin(a * 5.5)) < 0.2;
        const stone = hash2(Math.round(a * 3.5), 0, 31) > 0.5 ? '#b0aca2' : '#959088';
        p(x, y, seam || d > dr + 1 ? '#4c4842' : stone);
      } else {
        const glow = 1 - d / dr;
        p(x, y, mix(hexToRgb('#6e3216'), hexToRgb('#ffd27a'), Math.min(1, glow * 1.5 + ((y - dcy) / dr) * 0.2)));
      }
    }
  }
  for (let x = dcx - 7; x <= dcx + 7; x++) p(x, gy, '#9a6232'); // floorboards inside
  // round door swung open, hinged on the right edge
  const hx = dcx + dr + 2;
  for (let y = dcy - dr + 1; y <= gy; y++) {
    const t = (y - dcy) / dr;
    const half = Math.round(3 * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let x = hx; x <= hx + half; x++) {
      const edge = x === hx + half || y === dcy - dr + 1;
      p(x, y, edge ? OUTL : (y - dcy + 30) % 4 === 0 ? '#7a4a24' : x === hx ? '#d08c4a' : '#b57638');
    }
  }
  p(hx + 1, dcy + 1, '#ffd96a'); // brass knob
  p(hx, dcy - 4, '#3a3a40'); p(hx, dcy + 5, '#3a3a40'); // hinges
  // doorstep
  for (let x = dcx - 6; x <= dcx + 6; x++) { p(x, gy + 1, '#a29d94'); p(x, gy + 2, '#5e5a53'); }
  // lantern post + arm
  const lx = cx + LANT_DX - 4;
  for (let y = gy + LANT_DY - 2; y <= gy; y++) { p(lx, y, '#5a3a1f'); p(lx + 1, y, '#7a5230'); }
  p(lx, gy + LANT_DY - 3, OUTL); p(lx + 1, gy + LANT_DY - 3, OUTL);
  for (let x = lx + 2; x <= lx + 4; x++) p(x, gy + LANT_DY - 2, '#5a3a1f');
  p(lx + 4, gy + LANT_DY - 1, '#2e2e33');
  // flowers
  const fl: [number, number, string][] = [[cx + 16, gy - 10, '#fff3b0'], [cx + 19, gy - 6, '#f6a3c0'], [cx - 20, gy - 4, '#fff3b0'], [cx + 14, gy - 15, '#c9b8ff'], [cx - 17, gy - 11, '#f6a3c0'], [cx + 22, gy - 2, '#c9b8ff']];
  for (const [x, y, col] of fl) { p(x, y, col); p(x, y + 1, G2); }
  return c;
}

export function drawExit(ctx: CanvasRenderingContext2D, sxf: number, syf: number, tick: number): void {
  if (!exitImg) exitImg = buildExit();
  const sx = Math.round(sxf), sy = Math.round(syf);
  ctx.drawImage(exitImg, sx - EX_OX, sy - EX_OY);
  // chimney smoke
  const chx = sx + 12, chy = sy + 3 - Math.round(25 * Math.sqrt(1 - (12 / 27) ** 2)) - 6;
  for (let i = 0; i < 3; i++) {
    const life = ((tick >> 1) + i * 8) % 24;
    const a = 0.55 * (1 - life / 24);
    ctx.fillStyle = `rgba(235,230,222,${a})`;
    const r = life > 12 ? 2 : 1;
    ctx.fillRect(chx + Math.round(Math.sin((life + i * 5) / 4) * 1.5) + (life >> 3), chy - (life >> 1), r, r);
  }
  // flickering lantern with a soft halo
  const lx = sx + LANT_DX, ly = sy + LANT_DY;
  const fl = 0.6 + 0.4 * hash2(tick >> 2, 0, 77);
  ctx.fillStyle = `rgba(255,214,120,${0.1 * fl})`;
  ctx.fillRect(lx - 5, ly - 3, 11, 11);
  ctx.fillStyle = `rgba(255,214,120,${0.16 * fl})`;
  ctx.fillRect(lx - 3, ly - 1, 7, 7);
  ctx.fillStyle = '#2e2e33';
  ctx.fillRect(lx - 1, ly, 3, 1);
  ctx.fillRect(lx - 1, ly + 4, 3, 1);
  ctx.fillRect(lx - 1, ly + 1, 1, 3);
  ctx.fillRect(lx + 1, ly + 1, 1, 3);
  ctx.fillStyle = fl > 0.75 ? '#fff2b0' : '#ffc95a';
  ctx.fillRect(lx, ly + 1, 1, 3);
  ctx.fillStyle = fl > 0.75 ? '#ffd76e' : '#f0a23c';
  ctx.fillRect(lx, ly + 2, 1, 1);
}

// ================= hazards =================
export function drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, camX: number, tick: number): void {
  const x0 = Math.round(h.x - camX);
  const y0 = Math.round(h.y);
  const vw = ctx.canvas.width;
  if (x0 > vw + 4 || x0 + h.w < -4) return;
  if (h.kind === 'water') drawWater(ctx, h, x0, y0, tick);
  else drawThorns(ctx, h, x0, y0, tick);
}

const W_TOP: RGB = hexToRgb('#8fdcff');
const W_HI = '#eefcff';
const W_DEEP: RGB = hexToRgb('#1d4f8f');
const W_MID: RGB = hexToRgb('#3696d6');

function drawWater(ctx: CanvasRenderingContext2D, h: Hazard, x0: number, y0: number, tick: number): void {
  const vw = ctx.canvas.width;
  const xa = Math.max(0, x0), xb = Math.min(vw, x0 + h.w);
  if (xb <= xa) return;
  // body gradient
  for (let y = 1; y < h.h; y++) {
    const t = Math.min(1, y / Math.max(8, h.h));
    ctx.fillStyle = css(mix(W_MID, W_DEEP, t), 0.9);
    ctx.fillRect(xa, y0 + y, xb - xa, 1);
  }
  ctx.fillStyle = css(W_TOP, 0.95);
  ctx.fillRect(xa, y0, xb - xa, 1);
  const ph = tick >> 2;
  for (let X = xa; X < xb; X++) {
    const wx = X - x0 + h.x; // world x keeps pattern stable while scrolling
    const k = (wx + ph) % 12;
    if (k === 0 || k === 1) { ctx.fillStyle = W_HI; ctx.fillRect(X, y0, 1, 1); }
    if (k === 6) { ctx.fillStyle = css(W_TOP, 0.9); ctx.fillRect(X, y0 - 1, 1, 1); }
    const k2 = (wx - (tick >> 3) + 1000) % 9;
    if (h.h > 3 && (k2 === 0 || k2 === 1)) { ctx.fillStyle = 'rgba(160,225,255,0.75)'; ctx.fillRect(X, y0 + 2, 1, 1); }
  }
  // sparkles
  const slot = tick >> 3;
  ctx.fillStyle = 'rgba(220,245,255,0.8)';
  for (let i = 0; i < Math.max(1, (h.w * h.h) / 160); i++) {
    const sx = Math.floor(hash2(i, slot, 41) * h.w);
    const sy = 3 + Math.floor(hash2(i, slot, 43) * Math.max(1, h.h - 4));
    const X = x0 + sx;
    if (X >= xa && X < xb && sy < h.h) ctx.fillRect(X, y0 + sy, 1, 1);
  }
}

const thornCache = new Map<string, HTMLCanvasElement>();
const TH_PAD = 4;

function buildThorns(h: Hazard): HTMLCanvasElement {
  const W = h.w + TH_PAD * 2, H = h.h + TH_PAD;
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const p = plotter(ctx);
  const seed = (h.x * 7 + h.y * 13) | 0;
  const LEAF_D = hexToRgb('#244630'), LEAF = hexToRgb('#356638'), LEAF_L = hexToRgb('#5a8e42');
  const VINE = hexToRgb('#4a2448'), VINE_L = hexToRgb('#7a3a72');
  const tops: number[] = [];
  // bush mass with lumpy top
  for (let x = 0; x < W; x++) {
    const lump = Math.sin((x + seed) * 0.55) * 1.5 + Math.sin((x + seed) * 0.23) * 1.5;
    const top = Math.max(0, Math.round(TH_PAD + 1 + lump + hash2(x, 0, seed) * 1.5));
    const edgeFade = Math.min(x, W - 1 - x);
    const t2 = top + (edgeFade < 3 ? 3 - edgeFade : 0);
    tops.push(t2);
    for (let y = t2; y < H; y++) {
      const r = hash2(x, y, seed + 1);
      let col = y === t2 ? LEAF_L : r > 0.75 ? LEAF : LEAF_D;
      if (r < 0.06) col = LEAF_L;
      p(x, y, col);
    }
  }
  // tangled purple vines
  for (let v = 0; v < Math.max(2, W / 10); v++) {
    let x = hash2(v, 1, seed) * W, y = H - 1;
    const dx = (hash2(v, 2, seed) - 0.5) * 1.6;
    for (let s = 0; s < H + 6; s++) {
      x += dx + Math.sin(s * 0.9 + v) * 0.6;
      y -= 0.8;
      if (y < TH_PAD - 1) break;
      const X = Math.round(x), Y = Math.round(y);
      p(X, Y, s % 3 === 0 ? VINE_L : VINE);
      if (hash2(X, Y, seed + 5) > 0.7) {
        const side = hash2(X, Y, seed + 6) > 0.5 ? 1 : -1;
        p(X + side, Y - 1, '#e7cfe0');
      }
    }
  }
  // thorn spikes: radiating from the top and sides
  for (let x = 1; x < W - 1; x++) {
    if (hash2(x, 3, seed) < 0.4) continue;
    const top = tops[x];
    const len = 2 + Math.floor(hash2(x, 4, seed) * 2.5);
    const lean = x < W * 0.3 ? -1 : x > W * 0.7 ? 1 : 0;
    for (let i = 1; i <= len; i++) {
      const X = x + (i > 1 && lean ? lean * ((i / 2) | 0) : 0);
      p(X, top - i, i === len ? '#f4e2ee' : i === len - 1 ? '#b0679f' : '#5e2756');
    }
  }
  // curling vine tendrils
  for (let v = 0; v < Math.max(1, W / 14); v++) {
    const x = 2 + Math.floor(hash2(v, 11, seed) * (W - 4));
    const top = tops[x];
    const dir = hash2(v, 12, seed) > 0.5 ? 1 : -1;
    for (const [dx, dy] of [[0, -1], [0, -2], [dir, -3], [2 * dir, -3], [2 * dir, -2]]) p(x + dx, top + dy, VINE_L);
  }
  // berries
  for (let i = 0; i < Math.max(1, W / 12); i++) {
    const bx = 2 + Math.floor(hash2(i, 7, seed) * (W - 4));
    const by = TH_PAD + 3 + Math.floor(hash2(i, 8, seed) * Math.max(1, H - TH_PAD - 4));
    p(bx, by, '#9b3fa0'); p(bx + 1, by, '#6e2a78'); p(bx, by - 1, '#d48ae0');
  }
  return c;
}

function drawThorns(ctx: CanvasRenderingContext2D, h: Hazard, x0: number, y0: number, tick: number): void {
  const key = `${h.x},${h.y},${h.w},${h.h}`;
  let img = thornCache.get(key);
  if (!img) { img = buildThorns(h); thornCache.set(key, img); }
  ctx.drawImage(img, x0 - TH_PAD, y0 - TH_PAD);
  // occasional glint on a thorn tip
  const k = (tick >> 3) % 5;
  const gx = x0 + Math.floor(hash2(tick >> 3, 1, h.x) * h.w);
  if (k === 0) { ctx.fillStyle = '#fff6fb'; ctx.fillRect(gx, y0 - 1, 1, 1); }
}

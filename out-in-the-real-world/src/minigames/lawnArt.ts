// Lawn Gig art: the house and porch (front, corner lot, backyard deck), hedges, sidewalk or fence,
// the driveway with the neighbor's car, flower beds, a kiddie pool with a rubber duck, gnomes,
// pop-up sprinklers, trees, the yard-waste bin; the grass itself (lush tall grass with swaying
// tufts, cut cells laid in light/dark stripes by mowing direction, with shadowed edges); the push
// mower and you walking behind it, the nervous dog, the neighbor on the porch, per-yard light, HUD.
import { drawPerson, drawSeated, HAIRS, SKINS, type Person } from '../art/people.ts';
import { bayer, cached, disc, hash, INK, line, outlineRect, rect, shade, text, textWidth, type Ctx } from '../art/px.ts';
import { drawVehicle } from './driveKit.tsx';
import { BAG_CAP, CELL, CUT, cutFrac, GH, GW, LH, LW, TALL, TRIM, type Dog, type LawnSim, type Mower, type Solid, type Sprinkler, type Yard } from './lawnYard.ts';
import { outlined } from './shiftKit.ts';
import { drawHd, glow, grain, rgba, rrect, softBlit, softShadow, sparkle, sphere, tone } from './hdFx.ts';

function u32(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
}
const ih = (n: number): number => {
  let t = n | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
};
// Soft-edged ellipse (shadows, puddles): a radial falloff instead of pixel rows.
function ellipse(x: Ctx, cx: number, cy: number, rx: number, ry: number, c: string): void {
  if (rx <= 0 || ry <= 0) return;
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, c);
  g.addColorStop(0.7, rgba(c, 0.85));
  g.addColorStop(1, rgba(c, 0));
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, rx, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

// ---------- neighbors ----------
export const NEIGHBOR_LOOK: Record<string, Person> = {
  'Mrs. Okafor': { skin: SKINS[4], hair: HAIRS[6], style: 2, shirt: '#e07ab0', pants: '#4a3a5a', coat: '#f2e0c0', glasses: true, necklace: '#f8f4f0', shoes: '#6a4a3a' },
  'Mr. Delgado': { skin: SKINS[2], hair: HAIRS[0], style: 4, shirt: '#3f7fd8', pants: '#3a3a44', mustache: true, hat: 'cap', hatColor: '#c0392b', wide: true },
  'Ms. Petrov': { skin: SKINS[0], hair: HAIRS[3], style: 5, shirt: '#2fb5b0', pants: '#34406a', earrings: '#f2d048', shoes: '#e8e8f0' },
  'Grandpa Joe': { skin: SKINS[1], hair: HAIRS[6], style: 20, shirt: '#c0392b', plaid: '#5a2a24', pants: '#5a4a3a', glasses: true, beard: true, short: 1 },
};

// ---------- grass palettes ----------
const TALLP = ['#2c6424', '#36742a', '#418432', '#4e963a'].map(u32);
const TIP = u32('#6cb84c');
const TIP2 = u32('#88cc5c');
const LIT = u32('#7cc458');
// stripe colors by mowing direction: up, down, left, right (two tones each for texture)
const STRIPE = [
  ['#93d46c', '#88ca62'],
  ['#5aa844', '#53a03f'],
  ['#8ccf66', '#84c75f'],
  ['#5ea646', '#579e41'],
].map((p) => p.map(u32));
const EDGE_SHADOW = u32('#3a7a2c');
const SPECK = u32('#a8e07c');
const TRIMC = [u32('#76b252'), u32('#6eaa4c')];

// The lawn layer: one ImageData we repaint cell by cell as the grid changes.
export class LawnLayer {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private buf: Uint32Array;
  private grid: Uint8Array | null = null;
  tufts: number[] = [];
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = LW;
    this.canvas.height = LH;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(LW, LH);
    this.buf = new Uint32Array(this.img.data.buffer);
  }
  reset(g: LawnSim): void {
    this.grid = g.grid;
    this.buf.fill(0);
    this.tufts = [];
    for (let k = 0; k < GW * GH; k++) {
      if (g.grid[k] === 0) continue;
      this.paint(g, k);
      if (ih(k * 7 + g.y.seed) % 5 === 0) this.tufts.push(k);
    }
    this.flush();
  }
  private paint(g: LawnSim, k: number): void {
    const c = g.grid[k];
    const i = k % GW;
    const j = (k - i) / GW;
    const x0 = i * CELL;
    const y0 = j * CELL;
    if (c === TRIM) {
      // corners the deck can't reach: already hand-trimmed, so they read as done
      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++) this.buf[(y0 + dy) * LW + x0 + dx] = bayer(x0 + dx, y0 + dy) > 0.5 ? TRIMC[0] : TRIMC[1];
    } else if (c === TALL) {
      const clump = ih(Math.floor(i / 3) * 31 + Math.floor(j / 3) * 977 + g.y.seed) % 3;
      const upCut = j > 0 && g.grid[k - GW] === CUT;
      const leftCut = i > 0 && g.grid[k - 1] === CUT;
      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++) {
          const px = x0 + dx;
          const py = y0 + dy;
          const h = ih(px * 92821 + py * 68917);
          let col = TALLP[Math.min(3, clump + ((h & 3) === 0 ? 1 : 0) + (bayer(px, py) > 0.8 ? 1 : 0))];
          if ((h & 15) === 1) col = TIP;
          if ((h & 63) === 2) col = TIP2;
          if ((h & 7) === 3) col = TALLP[0];
          // the lit side of a tall edge next to cut grass
          if ((upCut && dy === 0) || (leftCut && dx === 0)) col = LIT;
          this.buf[py * LW + px] = col;
        }
    } else if (c === CUT) {
      const d = g.dir[k];
      const pal = STRIPE[d];
      const upTall = j > 0 && g.grid[k - GW] === TALL;
      const leftTall = i > 0 && g.grid[k - 1] === TALL;
      for (let dy = 0; dy < CELL; dy++)
        for (let dx = 0; dx < CELL; dx++) {
          const px = x0 + dx;
          const py = y0 + dy;
          // short-grass texture: diagonal weave following the stripe direction
          const weave = d < 2 ? (px + (py >> 1)) & 1 : ((px >> 1) + py) & 1;
          let col = pal[weave];
          if ((ih(px * 7919 + py * 104729) & 127) === 5) col = SPECK;
          // tall grass casts a short shadow down/right onto the cut lawn
          if ((upTall && dy === 0) || (leftTall && dx === 0)) col = EDGE_SHADOW;
          this.buf[py * LW + px] = col;
        }
    }
  }
  update(g: LawnSim): void {
    if (this.grid !== g.grid) {
      this.reset(g);
      return;
    }
    if (!g.dirty.length) return;
    const seen = new Set<number>();
    for (const k of g.dirty) {
      for (const n of [k, k + 1, k + GW]) {
        if (n < 0 || n >= GW * GH || seen.has(n)) continue;
        seen.add(n);
        if (g.grid[n] !== 0) this.paint(g, n);
      }
    }
    g.dirty.length = 0;
    this.flush();
  }
  private flush(): void {
    this.ctx.putImageData(this.img, 0, 0);
  }
}

// Swaying blade tips over the tall grass (cheap: a sparse set of tufts).
function drawTufts(x: Ctx, g: LawnSim, layer: LawnLayer, t: number): void {
  for (const k of layer.tufts) {
    if (g.grid[k] !== TALL) continue;
    const i = k % GW;
    const j = (k - i) / GW;
    const px = i * CELL;
    const py = j * CELL;
    const w = Math.sin(t * 1.8 + px * 0.06 + py * 0.035);
    // a little fan of curved blades, swaying smoothly
    x.lineWidth = 0.45;
    x.lineCap = 'round';
    for (let b = -1; b <= 1; b++) {
      x.strokeStyle = (k + b) & 1 ? '#8ad060' : '#62ae44';
      x.beginPath();
      x.moveTo(px + 1 + b * 0.8, py + 2);
      x.quadraticCurveTo(px + 1 + b * 1.1 + w * 0.6, py, px + 1 + b * 1.5 + w * 1.3, py - 1.8 + Math.abs(b) * 0.6);
      x.stroke();
    }
    x.lineCap = 'butt';
  }
}

// ---------- the static backdrop for a yard ----------
function backdrop(y: Yard): HTMLCanvasElement {
  return cached(`lawn-bg|${y.seed}|${y.tier}`, LW, LH, (x) => {
    // the neighbors' (already short) grass everywhere
    for (let py = 0; py < LH; py++)
      for (let px = 0; px < LW; px++) {
        const h = ih(px * 31 + py * 1009 + 7);
        x.fillStyle = (h & 7) === 0 ? '#5e9446' : bayer(px, py) > 0.5 ? '#6a9e4c' : '#649848';
        x.fillRect(px, py, 1, 1);
      }
    // edging around the job lawn (a crisp soil line)
    for (const L of y.lawn) outlineRect(x, L.x - 1, L.y - 1, L.w + 2, L.h + 2, '#6a5034');
    // sides: hedges (front) or a board fence (backyard)
    if (y.fence) {
      for (const sx of [0, LW - 5]) {
        rect(x, sx, y.houseH, 5, LH - y.houseH, '#a8784a');
        for (let py = y.houseH; py < LH; py += 6) rect(x, sx, py, 5, 1, '#7a5432');
        rect(x, sx + (sx ? 0 : 4), y.houseH, 1, LH - y.houseH, '#5a3c22');
      }
      rect(x, 0, LH - 6, LW, 6, '#a8784a');
      for (let px = 0; px < LW; px += 6) rect(x, px, LH - 6, 1, 6, '#7a5432');
      rect(x, 0, LH - 6, LW, 1, '#d0a070');
      rect(x, 0, LH - 7, LW, 1, '#5a3c22');
    } else {
      for (const sx of [0, LW - 6])
        for (let py = y.houseH + 4; py < LH - 12; py += 5) {
          disc(x, sx + 3, py, 4, '#1e4a22');
          disc(x, sx + 3 - (sx ? 0 : 1), py - 1, 3, '#2e6a2e');
          rect(x, sx + 2, py - 2, 1, 1, '#4a8a3a');
        }
      // sidewalk + curb + street
      rect(x, 0, LH - 12, LW, 8, '#c8c4bc');
      for (let px = 0; px < LW; px += 14) rect(x, px, LH - 12, 1, 8, '#a8a49c');
      rect(x, 0, LH - 12, LW, 1, '#e0dcd4');
      rect(x, 0, LH - 4, LW, 1, '#d8d4cc');
      rect(x, 0, LH - 3, LW, 3, '#5a5a66');
      // mailbox
      const mx = y.drive ? (y.drive.x > LW / 2 ? y.drive.x - 8 : y.drive.x + y.drive.w + 3) : 20;
      rect(x, mx + 2, LH - 16, 1, 6, '#5a4030');
      rect(x, mx - 1, LH - 20, 7, 5, INK);
      rect(x, mx, LH - 19, 5, 3, '#3a4a8a');
      rect(x, mx + 5, LH - 21, 1, 2, '#e0503c');
    }
    // driveway with the neighbor's car
    if (y.drive) {
      const D = y.drive;
      rect(x, D.x, D.y, D.w, D.h, '#bab6ae');
      for (let py = D.y; py < D.y + D.h; py++) for (let px = D.x; px < D.x + D.w; px++) if ((ih(px * 13 + py * 71) & 15) === 0) rect(x, px, py, 1, 1, '#a8a49c');
      for (let py = D.y + 20; py < D.y + D.h; py += 24) rect(x, D.x, py, D.w, 1, '#9a968e');
      rect(x, D.x + D.w / 2, D.y, 1, D.h, '#a6a29a');
      ellipse(x, D.x + D.w / 2 + 3, D.y + 106, 5, 3, '#8a867e');
      drawVehicle(x, { kind: 'hatch', body: ['#3f7fd8', '#c0392b', '#e8e8f0', '#3caa6a'][Math.abs(y.seed) % 4], heads: [] }, D.x + D.w / 2, D.y + 84, 0);
    }
    // walkways, patios, stepping stones
    for (const P of y.path) {
      const stone = P.w <= 10 && P.h <= 8;
      rect(x, P.x, P.y, P.w, P.h, stone ? '#8a8478' : '#c8b8a0');
      if (stone) {
        rect(x, P.x, P.y, P.w, 1, '#aaa496');
        rect(x, P.x, P.y + P.h - 1, P.w, 1, '#6a6458');
      } else {
        for (let py = P.y; py < P.y + P.h; py += 5) rect(x, P.x, py, P.w, 1, '#b0a088');
        for (let py = P.y; py < P.y + P.h; py += 5) for (let px = P.x + ((py / 5) % 2 ? 4 : 0); px < P.x + P.w; px += 8) rect(x, px, py, 1, 5, '#b0a088');
      }
    }
    drawHouse(x, y);
    // flower beds and fixed props (trunks, pool body, bath)
    for (const s of y.solids) {
      if (s.kind === 'bed') drawBed(x, s);
      if (s.kind === 'tree') {
        disc(x, s.x, s.y, s.r + 1, INK);
        disc(x, s.x, s.y, s.r, '#6a4428');
        disc(x, s.x - 1, s.y - 1, s.r - 2, '#8a5a34');
      }
      if (s.kind === 'bath') {
        disc(x, s.x, s.y, s.r + 1, INK);
        disc(x, s.x, s.y, s.r, '#a8a8b0');
        disc(x, s.x, s.y, s.r - 1.5, '#7ac0e0');
        rect(x, s.x - 1, s.y - 1, 1, 1, '#ffffff');
      }
    }
  });
}

function drawHouse(x: Ctx, y: Yard): void {
  const H = y.houseH;
  const wall = y.houseColor;
  // roof eave
  for (let py = 0; py < 11; py++) {
    rect(x, 0, py, LW, 1, py % 3 === 2 ? shade(y.roof, 0.75) : y.roof);
    if (py % 3 !== 2) for (let px = (py % 6 < 3 ? 0 : 4); px < LW; px += 8) rect(x, px, py, 1, 1, shade(y.roof, 0.8));
  }
  rect(x, 0, 11, LW, 2, y.trim);
  rect(x, 0, 13, LW, 1, shade(wall, 0.6));
  // siding
  for (let py = 14; py < H; py++) rect(x, 0, py, LW, 1, (py - 14) % 4 === 3 ? shade(wall, 0.84) : wall);
  rect(x, 0, H - 2, LW, 2, shade(wall, 0.55));
  // windows with shutters and flower boxes (skip the door and porch area)
  const porch = y.porch;
  for (let wx = 14; wx < LW - 20; wx += 34) {
    if (wx + 22 > porch.x - 4 && wx < porch.x + porch.w + 4) continue;
    rect(x, wx - 4, 17, 3, 14, shade(y.roof, 1.2));
    rect(x, wx + 19, 17, 3, 14, shade(y.roof, 1.2));
    rect(x, wx - 1, 16, 20, 16, y.trim);
    rect(x, wx, 17, 18, 14, '#3a5a7a');
    rect(x, wx, 17, 18, 3, '#7aa8c8');
    rect(x, wx + 8, 17, 2, 14, y.trim);
    rect(x, wx, 23, 18, 1, y.trim);
    rect(x, wx + 2, 18, 4, 1, '#c8e4f4');
    // flower box
    rect(x, wx - 1, 32, 20, 3, '#7a4a2a');
    for (let k = 0; k < 6; k++) rect(x, wx + k * 3, 30 + (k % 2), 2, 2, ['#f04a6a', '#f2c230', '#ffffff'][k % 3]);
  }
  // door
  const d = y.door;
  rect(x, d - 6, 17, 12, H - 17, y.trim);
  rect(x, d - 5, 18, 10, H - 18, shade(y.roof, 0.9));
  rect(x, d - 4, 19, 8, 6, shade(y.roof, 1.1));
  rect(x, d - 4, 27, 8, 8, shade(y.roof, 1.1));
  rect(x, d + 3, 29, 1, 1, '#f2d048');
  rect(x, d + 9, 20, 2, 3, '#fff1a0');
  // foundation shrubs
  for (let sx = 6; sx < LW - 4; sx += 9) {
    if (sx > porch.x - 6 && sx < porch.x + porch.w + 6) continue;
    disc(x, sx, H + 1, 4, '#1e4a22');
    disc(x, sx - 1, H, 3, '#2e6a2e');
    rect(x, sx - 2, H - 2, 1, 1, '#5a9a4a');
  }
  // porch / deck
  rect(x, porch.x - 1, porch.y - 1, porch.w + 2, porch.h + 2, INK);
  for (let py = porch.y; py < porch.y + porch.h; py++) rect(x, porch.x, py, porch.w, 1, py % 3 === 0 ? '#8a6038' : '#a87848');
  rect(x, porch.x, porch.y, porch.w, 1, '#c8986a');
  rect(x, porch.x, porch.y, 2, porch.h, '#f4f0e4');
  rect(x, porch.x + porch.w - 2, porch.y, 2, porch.h, '#f4f0e4');
  // steps down to the lawn
  rect(x, d - 7, porch.y + porch.h, 14, 3, '#9a9488');
  rect(x, d - 7, porch.y + porch.h, 14, 1, '#bab4a8');
  rect(x, d - 6, porch.y + porch.h - 2, 12, 1, '#c8986a');
  if (y.fence) {
    // backyard deck: a kettle grill and a little table with lemonade
    const gx = porch.x + porch.w - 9;
    disc(x, gx, porch.y + 5, 4, INK);
    disc(x, gx, porch.y + 5, 3, '#2a2a30');
    rect(x, gx - 2, porch.y + 3, 2, 1, '#8a8a96');
    rect(x, gx + 1, porch.y + 1, 1, 2, '#c8c8d0');
    const tx = porch.x + porch.w - 21;
    rect(x, tx - 1, porch.y + 2, 9, 7, INK);
    rect(x, tx, porch.y + 3, 7, 5, '#f4f0e4');
    rect(x, tx + 2, porch.y + 4, 2, 2, '#f2d048');
    rect(x, tx + 2, porch.y + 4, 1, 1, '#ffffff');
  } else {
    // welcome mat
    rect(x, d - 5, porch.y + 1, 10, 3, '#c04a3a');
    rect(x, d - 4, porch.y + 2, 8, 1, '#e08a5a');
  }
}

function drawBed(x: Ctx, s: Solid): void {
  rect(x, s.x - 1, s.y - 1, s.w + 2, s.h + 2, INK);
  for (let py = s.y; py < s.y + s.h; py++)
    for (let px = s.x; px < s.x + s.w; px++) {
      const edge = px === s.x || py === s.y || px === s.x + s.w - 1 || py === s.y + s.h - 1;
      const h = ih(px * 131 + py * 977 + s.seed);
      x.fillStyle = edge ? ((px + py) % 4 < 2 ? '#b8563c' : '#d0704e') : (h & 7) === 0 ? '#7a5234' : (h & 3) === 1 ? '#4a2e1a' : '#5e3c24';
      x.fillRect(px, py, 1, 1);
    }
}

// Flowers are drawn live so they sway and can be crushed.
function drawFlowers(x: Ctx, s: Solid, t: number): void {
  const fc = s.flowers ?? '#f04a6a';
  for (let py = s.y + 3; py < s.y + s.h - 2; py += 4)
    for (let px = s.x + 3 + ((py / 4) % 2 ? 2 : 0); px < s.x + s.w - 2; px += 5) {
      const crushed = s.crushed?.some((c) => Math.abs(c.x - px) < 5 && Math.abs(c.y - py) < 5);
      if (crushed) {
        rect(x, px - 1, py, 3, 1, '#4a5a2a');
        rect(x, px, py + 1, 1, 1, shade(fc, 0.6));
        continue;
      }
      const sw = Math.sin(t * 2 + px * 0.4) > 0.6 ? 1 : 0;
      rect(x, px - 1, py, 3, 2, '#2a6a2a');
      rect(x, px - 1 + sw, py - 2, 2, 2, fc);
      rect(x, px + sw, py - 2, 1, 1, shade(fc, 1.3));
      rect(x, px - 1 + sw, py - 1, 1, 1, '#f2d048');
    }
}

// ---------- props ----------
function drawGnome(x: Ctx, s: Solid, t: number, knockT: number): void {
  const cx = Math.round(s.x);
  const cy = Math.round(s.y);
  if (s.knocked) {
    const k = Math.min(1, knockT / 0.3);
    const dx = Math.round(Math.cos(s.seed) * 6 * k);
    x.globalAlpha = 0.3;
    ellipse(x, cx + dx + 1, cy + 3, 5, 2, '#0a1a08');
    x.globalAlpha = 1;
    // lying on its side
    rect(x, cx + dx - 5, cy - 1, 11, 5, INK);
    rect(x, cx + dx - 4, cy, 3, 3, '#3a6ad0');
    rect(x, cx + dx - 1, cy, 2, 3, '#f4f4f4');
    rect(x, cx + dx + 1, cy, 2, 3, '#f0c8a0');
    rect(x, cx + dx + 3, cy, 2, 3, '#d8342a');
    rect(x, cx + dx + 5, cy + 1, 1, 1, '#d8342a');
    return;
  }
  x.globalAlpha = 0.3;
  ellipse(x, cx + 1, cy + 3, 4, 2, '#0a1a08');
  x.globalAlpha = 1;
  const bob = Math.sin(t * 1.3 + s.seed) > 0.97 ? 1 : 0;
  rect(x, cx - 3, cy - 9 - bob, 7, 12, INK);
  rect(x, cx - 2, cy - 1, 5, 3, '#3a6ad0');
  rect(x, cx - 2, cy + 2, 2, 1, '#4a3020');
  rect(x, cx + 1, cy + 2, 2, 1, '#4a3020');
  rect(x, cx - 2, cy - 4, 5, 3, '#f4f4f4');
  rect(x, cx - 1, cy - 5, 3, 1, '#f0c8a0');
  rect(x, cx, cy - 4, 1, 1, '#e88a7a');
  rect(x, cx - 2, cy - 8 - bob, 5, 3, '#d8342a');
  rect(x, cx - 1, cy - 9 - bob, 3, 1, '#d8342a');
  rect(x, cx - 1, cy - 8 - bob, 1, 2, '#ff6a5a');
}

function drawPool(x: Ctx, s: Solid, t: number, splash: number): void {
  const cx = s.x;
  const cy = s.y;
  const r = s.r;
  x.globalAlpha = 0.3;
  ellipse(x, cx + 2, cy + 3, r + 1, r, '#0a1a08');
  x.globalAlpha = 1;
  // inflatable rim: twelve striped segments, a tube lit from the top-left
  x.fillStyle = 'rgba(16,10,24,0.85)';
  x.beginPath();
  x.arc(cx, cy, r + 0.6, 0, Math.PI * 2);
  x.fill();
  for (let k = 0; k < 12; k++) {
    x.fillStyle = k % 2 ? '#f4f4f8' : '#3a8ae0';
    x.beginPath();
    x.arc(cx, cy, r, (k / 12) * Math.PI * 2, ((k + 1) / 12) * Math.PI * 2);
    x.arc(cx, cy, r - 3, ((k + 1) / 12) * Math.PI * 2, (k / 12) * Math.PI * 2, true);
    x.closePath();
    x.fill();
  }
  const tube = x.createRadialGradient(cx, cy, r - 3, cx, cy, r);
  tube.addColorStop(0, 'rgba(10,20,50,0.35)');
  tube.addColorStop(0.45, 'rgba(255,255,255,0.15)');
  tube.addColorStop(1, 'rgba(10,20,50,0.4)');
  x.fillStyle = tube;
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.arc(cx, cy, r - 3, 0, Math.PI * 2, true);
  x.fill('evenodd');
  x.strokeStyle = 'rgba(255,255,255,0.75)';
  x.lineWidth = 0.6;
  x.lineCap = 'round';
  x.beginPath();
  x.arc(cx, cy, r - 1.3, -2.7, -1.8);
  x.stroke();
  x.lineCap = 'butt';
  // water: deep-to-shallow gradient, moving caustic highlights, glints
  const wr = r - 3;
  const wg = x.createRadialGradient(cx - wr * 0.3, cy - wr * 0.3, 0, cx, cy, wr);
  wg.addColorStop(0, '#b8ecff');
  wg.addColorStop(0.6, '#6ac4ec');
  wg.addColorStop(1, '#3a90c8');
  x.fillStyle = wg;
  x.beginPath();
  x.arc(cx, cy, wr, 0, Math.PI * 2);
  x.fill();
  x.save();
  x.clip();
  x.strokeStyle = 'rgba(230,250,255,0.55)';
  x.lineWidth = 0.5;
  for (let k = 0; k < 4; k++) {
    x.beginPath();
    for (let i = -wr; i <= wr; i += 1) {
      const yy = cy - wr + k * (wr * 0.6) + Math.sin(i * 0.7 + t * 3 + k) * 1.2;
      if (i === -wr) x.moveTo(cx + i, yy);
      else x.lineTo(cx + i, yy);
    }
    x.stroke();
  }
  x.restore();
  sparkle(x, cx - wr * 0.35, cy - wr * 0.4, 1.2 + Math.sin(t * 4) * 0.4, 0.8);
  // rubber duck
  const dx = cx + Math.cos(t * 0.7) * 4;
  const dy = cy + Math.sin(t * 0.9) * 3 - (splash > 0 ? 3 : 0);
  softShadow(x, dx + 0.6, dy + 1.2, 2.8, 1.4, 0.35, '10,40,70');
  sphere(x, dx - 0.2, dy, 2.1, '#f2d030', -0.4, -0.5, 0.35);
  sphere(x, dx + 1.4, dy - 1.4, 1.3, '#f2d030', -0.4, -0.5, 0.3);
  sphere(x, dx + 2.7, dy - 1.2, 0.6, '#ff8a2a', -0.4, -0.5, 0);
}

function drawBin(x: Ctx, s: Solid, open: number, full: boolean, t: number): void {
  const cx = Math.round(s.x);
  const cy = Math.round(s.y);
  x.globalAlpha = 0.3;
  rect(x, cx - 5, cy - 3, 12, 11, '#0a1a08');
  x.globalAlpha = 1;
  rect(x, cx - 7, cy - 6, 14, 13, INK);
  rect(x, cx - 6, cy - 5, 12, 11, '#2e7a3a');
  rect(x, cx - 6, cy - 5, 12, 1, '#4aa04e');
  rect(x, cx - 6, cy + 4, 12, 2, '#1e5a2a');
  if (open > 0) {
    rect(x, cx - 5, cy - 4, 10, 8, '#1a2a14');
    for (let k = 0; k < 5; k++) rect(x, cx - 4 + k * 2, cy - 2 + (k % 2), 2, 2, k % 2 ? '#6ab04a' : '#8ad060');
    rect(x, cx - 7, cy - 9, 14, 3, INK);
    rect(x, cx - 6, cy - 8, 12, 1, '#4aa04e');
  } else {
    for (let k = 0; k < 4; k++) rect(x, cx - 5 + k * 3, cy - 3, 1, 7, '#25683a');
    rect(x, cx - 3, cy - 1, 6, 3, '#e8e8e0');
    rect(x, cx - 2, cy, 1, 1, '#2e7a3a');
    rect(x, cx + 1, cy, 1, 1, '#2e7a3a');
  }
  // the "dump here" arrow when your bag is (nearly) full
  if (full) {
    const b = Math.round(Math.abs(Math.sin(t * 6)) * 3);
    const ay = cy - 18 - b;
    rect(x, cx - 2, ay - 3, 5, 5, INK);
    rect(x, cx - 1, ay - 2, 3, 4, '#ffe27a');
    for (let k = 0; k < 4; k++) rect(x, cx - 3 + k, ay + 2 + k, 7 - k * 2, 1, k === 3 ? INK : '#ffe27a');
    outlined(x, 'DUMP', cx - 7, ay - 10, '#ffe27a');
  }
}

function drawSprinkler(x: Ctx, sp: Sprinkler, t: number): void {
  const cx = Math.round(sp.x);
  const cy = Math.round(sp.y);
  if (sp.broken) {
    // a busted head: geyser!
    x.globalAlpha = 0.35;
    ellipse(x, cx, cy + 1, 9, 6, '#2a6a9a');
    x.globalAlpha = 1;
    rect(x, cx - 1, cy - 1, 3, 3, '#5a5a62');
    for (let k = 0; k < 26; k++) {
      const ph = (t * 1.5 + k / 26) % 1;
      const a = (k * 2.399) % 6.28;
      const r = ph * 9;
      const h = Math.sin(ph * Math.PI) * 16;
      rect(x, cx + Math.cos(a) * r, cy - h + Math.sin(a) * r * 0.5, 1, 1, k % 3 ? '#bfe8ff' : '#ffffff');
    }
    return;
  }
  if (sp.state === 'down') {
    rect(x, cx - 1, cy - 1, 3, 3, '#3a3a3a');
    rect(x, cx, cy, 1, 1, '#8a8a92');
    return;
  }
  const warn = sp.state === 'warn';
  const wig = warn ? Math.round(Math.sin(t * 40)) : 0;
  rect(x, cx - 2 + wig, cy - 4, 5, 6, INK);
  rect(x, cx - 1 + wig, cy - 3, 3, 4, '#c8ccd4');
  rect(x, cx - 1 + wig, cy - 3, 1, 4, '#ffffff');
  if (warn) {
    if (Math.floor(t * 8) % 2) rect(x, cx + 3, cy - 6, 1, 1, '#bfe8ff');
    return;
  }
  // rotating jet: droplets flying out along the spray direction
  x.globalAlpha = 0.25;
  ellipse(x, cx, cy, 20, 14, '#1a5a8a');
  x.globalAlpha = 1;
  for (const off of [0, Math.PI]) {
    for (let k = 0; k < 12; k++) {
      const r = ((t * 46 + k * 4) % 22) + 2;
      const a = sp.spray + off - k * 0.035;
      const h = Math.sin((r / 24) * Math.PI) * 5;
      rect(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7 - h - 3, 1, 1, k % 3 ? '#bfe8ff' : '#ffffff');
    }
  }
}

function drawCanopy(x: Ctx, s: Solid, t: number, under: boolean): void {
  const R = 15;
  const spr = cached(`lawn-canopy|${s.seed % 5}`, R * 2 + 4, R * 2 + 4, (c) => {
    const o = R + 2;
    for (let j = 0; j < R * 2 + 4; j++)
      for (let i = 0; i < R * 2 + 4; i++) {
        const dx = i - o + 0.5;
        const dy = j - o + 0.5;
        const a = Math.atan2(dy, dx);
        const wob = R * (0.9 + 0.06 * Math.sin(a * 5 + (s.seed % 5)) + 0.04 * Math.sin(a * 11));
        const d = Math.hypot(dx, dy);
        if (d > wob + 1) continue;
        let col = INK;
        if (d <= wob) {
          const lit = -(dx + dy) / (R * 1.4) + (bayer(i, j) - 0.5) * 0.4 + (hash(i * 7 + j * 13 + s.seed) - 0.5) * 0.25;
          col = lit > 0.45 ? '#9ad468' : lit > 0.1 ? '#6eb04a' : lit > -0.3 ? '#4a8c38' : '#336a2a';
        }
        c.fillStyle = col;
        c.fillRect(i, j, 1, 1);
      }
  });
  const sway = Math.sin(t * 0.8 + s.seed) * 0.6;
  if (under) x.globalAlpha = 0.5;
  drawHd(x, spr, Math.round(s.x - R - 2) + sway, Math.round(s.y - R - 2 - 6), false, CANOPY_LIT);
  x.globalAlpha = 1;
}
const CANOPY_LIT = { light: 0.3, shadow: 0.42, rim: '#e8ffb8' };
const BACK_LIT = { light: 0, shadow: 0 };

// ---------- the mower and you ----------
export interface MowerLook {
  p: Person;
  deck: string;
}
// HD mower: a glossy rounded deck lit from the top-left with a chrome engine cap, rubber wheels,
// a canvas bag that bulges as it fills, tubular handles, and you as rounded, lit shapes.
export function drawMowerHd(x: Ctx, m: Mower, L: MowerLook, t: number, wet: number): void {
  const fill = m.bag / BAG_CAP;
  const vib = Math.hypot(m.vx, m.vy) > 3 && Math.floor(t * 30) % 2 ? 0.25 : 0;
  const hx = Math.cos(m.ang);
  const hy = Math.sin(m.ang);
  const P = (f: number, q: number): [number, number] => [m.x + hx * f - hy * q, m.y + hy * f + hx * q];
  // soft shadow (screen-space, cast down-right)
  const [sx, sy] = P(-6, 0);
  softShadow(x, sx + 2, sy + 2.5, 15, 10, 0.4, '10,26,8');
  // feet
  const st = Math.sin(m.step * 2.2);
  for (const [q, ph] of [
    [-2.2, st],
    [2.2, -st],
  ] as const) {
    const [fx, fy] = P(-18 + ph * 3, q);
    sphere(x, fx, fy, 1.4, L.p.shoes ?? '#2a2a33', -0.4, -0.5, 0.2);
  }
  // everything else in the mower's local frame
  x.save();
  x.translate(m.x, m.y);
  x.rotate(m.ang);
  // bag: a capsule that swells as it fills
  const bw = 3 + fill * 2.5;
  rrect(x, -12.2, -bw, 7.2, bw * 2, bw * 0.9);
  const bgr = x.createLinearGradient(0, -bw, 0, bw);
  bgr.addColorStop(0, '#8a9a5a');
  bgr.addColorStop(0.45, '#6a7a42');
  bgr.addColorStop(1, '#3a4626');
  x.fillStyle = bgr;
  x.fill();
  x.strokeStyle = 'rgba(16,10,24,0.8)';
  x.lineWidth = 0.5;
  x.stroke();
  // handle bars (tubes)
  x.lineCap = 'round';
  for (const [a, b] of [
    [-3.6, -4.5],
    [3.6, 4.5],
  ]) {
    x.strokeStyle = 'rgba(16,10,24,0.85)';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(-5, a);
    x.lineTo(-14.5, b);
    x.stroke();
    x.strokeStyle = '#c8ccd6';
    x.lineWidth = 0.55;
    x.stroke();
  }
  x.strokeStyle = 'rgba(16,10,24,0.85)';
  x.lineWidth = 1.3;
  x.beginPath();
  x.moveTo(-14.5, -5);
  x.lineTo(-14.5, 5);
  x.stroke();
  x.strokeStyle = '#30303a';
  x.lineWidth = 0.8;
  x.stroke();
  x.lineCap = 'butt';
  // wheels
  for (const [f, q] of [
    [4.8, -5.8],
    [4.8, 5.8],
    [-3.8, -5.8],
    [-3.8, 5.8],
  ] as const) {
    rrect(x, f - 1.7, q - 1.1, 3.4, 2.2, 1);
    x.fillStyle = '#16141c';
    x.fill();
    x.fillStyle = '#6a6a76';
    x.fillRect(f - 0.5, q - 0.35, 1, 0.7);
  }
  // deck
  x.translate(vib, 0);
  rrect(x, -5, -5.3, 11, 10.6, 2.6);
  x.fillStyle = 'rgba(16,10,24,0.9)';
  x.fill();
  x.restore();
  // deck shading in screen space (light stays top-left whatever the heading)
  const [dx, dy] = P(0.5 + vib, 0);
  x.save();
  x.translate(m.x, m.y);
  x.rotate(m.ang);
  x.translate(vib, 0);
  rrect(x, -4.5, -4.8, 10, 9.6, 2.2);
  x.restore();
  const dg = x.createRadialGradient(dx - 3, dy - 3, 0.5, dx, dy, 8);
  dg.addColorStop(0, tone(L.deck, 0.45));
  dg.addColorStop(0.45, L.deck);
  dg.addColorStop(1, tone(L.deck, -0.5));
  x.fillStyle = dg;
  x.fill();
  // engine: chrome cap with a hot specular
  const [ex, ey] = P(0.5 + vib, 0);
  sphere(x, ex, ey, 2.7, '#3a3a46', -0.45, -0.55, 0.15);
  sphere(x, ex, ey, 1.5, '#c8ccd8', -0.45, -0.55, 0.85);
  // you: arms to the handlebar, shoulders, head
  for (const q of [-1, 1]) {
    const [shx, shy] = P(-17, q * 3.4);
    const [hx2, hy2] = P(-14.5, q * 4.2);
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(16,10,24,0.6)';
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(shx, shy);
    x.lineTo(hx2, hy2);
    x.stroke();
    x.strokeStyle = L.p.skin;
    x.lineWidth = 1.05;
    x.stroke();
    x.lineCap = 'butt';
  }
  const [bx, by] = P(-17.5, 0);
  x.save();
  x.translate(bx, by);
  x.rotate(m.ang);
  x.fillStyle = 'rgba(16,10,24,0.7)';
  x.beginPath();
  x.ellipse(0, 0, 2.8, 4.9, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
  const sg = x.createRadialGradient(bx - 1.5, by - 1.8, 0.3, bx, by, 5);
  sg.addColorStop(0, tone(L.p.shirt, 0.4));
  sg.addColorStop(0.5, L.p.shirt);
  sg.addColorStop(1, tone(L.p.shirt, -0.45));
  x.save();
  x.translate(bx, by);
  x.rotate(m.ang);
  x.beginPath();
  x.ellipse(0, 0, 2.3, 4.4, 0, 0, Math.PI * 2);
  x.restore();
  x.fillStyle = sg;
  x.fill();
  const [hdx, hdy] = P(-17.8, 0);
  x.fillStyle = 'rgba(16,10,24,0.65)';
  x.beginPath();
  x.arc(hdx, hdy, 2.9, 0, Math.PI * 2);
  x.fill();
  sphere(x, hdx, hdy, 2.4, L.p.hair, -0.45, -0.55, 0.3);
  if (wet > 0.3)
    for (let k = 0; k < 3; k++) sphere(x, hdx - 3 + k * 3, hdy - 4 - ((t * 20 + k * 3) % 4), 0.6, '#bfe8ff', -0.3, -0.3, 0.5);
}

// Paint a shape in the mower's local frame (forward f in [f0,f1], half-width qw) pixel by pixel.
function pixelShape(x: Ctx, m: Pick<Mower, 'x' | 'y' | 'ang'>, f0: number, f1: number, qw: number, col: (lf: number, lq: number, dx: number, dy: number) => string | null, jitter = 0): void {
  const hx = Math.cos(m.ang);
  const hy = Math.sin(m.ang);
  const R = Math.ceil(Math.max(Math.abs(f0), Math.abs(f1), qw) + 1.5);
  const cx = Math.round(m.x);
  const cy = Math.round(m.y);
  for (let j = -R; j <= R; j++)
    for (let i = -R; i <= R; i++) {
      const dx = cx + i + 0.5 - m.x;
      const dy = cy + j + 0.5 - m.y;
      const lf = dx * hx + dy * hy - jitter;
      const lq = -dx * hy + dy * hx;
      if (lf < f0 - 1 || lf > f1 + 1 || Math.abs(lq) > qw + 1) continue;
      if (lf < f0 || lf > f1 || Math.abs(lq) > qw) continue;
      const c = col(lf, lq, dx, dy);
      if (!c) continue;
      x.fillStyle = c;
      x.fillRect(cx + i, cy + j, 1, 1);
    }
}

// ---------- the nervous dog ----------
export function drawDog(x: Ctx, d: Dog, t: number): void {
  const moving = Math.hypot(d.vx, d.vy) > 6;
  const tremble = d.state === 'hide' && Math.hypot(d.vx, d.vy) < 4 ? Math.round(Math.sin(t * 50) * 0.6) : 0;
  const m = { x: d.x + tremble, y: d.y, ang: d.ang };
  const hx = Math.cos(d.ang);
  const hy = Math.sin(d.ang);
  const P = (f: number, q: number): [number, number] => [m.x + hx * f - hy * q, m.y + hy * f + hx * q];
  x.globalAlpha = 0.28;
  ellipse(x, d.x + 1, d.y + 2, 6, 4, '#0a1a08');
  x.globalAlpha = 1;
  // legs
  if (moving) {
    const ph = Math.sin(d.run * 6);
    for (const [f, q, s] of [
      [2.5, -2.6, ph],
      [2.5, 2.6, -ph],
      [-2.5, -2.6, -ph],
      [-2.5, 2.6, ph],
    ] as const) {
      const [lx, ly] = P(f + s * 1.5, q);
      rect(x, lx - 0.5, ly - 0.5, 1, 1, shade(d.coat, 0.6));
    }
  }
  // tail (wags; tucked when scared)
  const scared = d.state === 'hide' || d.state === 'flee';
  const wag = scared ? 0 : Math.sin(t * 16) * 2;
  const [t1x, t1y] = P(-4.5, 0);
  const [t2x, t2y] = P(scared ? -5 : -7.5, wag);
  line(x, t1x, t1y, t2x, t2y, shade(d.coat, 0.8));
  const len = d.state === 'sit' ? 3 : 4.6;
  pixelShape(x, m, -len, len, 2.6, (lf, lq) => {
    const e = (lf / len) ** 2 + (lq / 2.6) ** 2;
    if (e > 1) return null;
    if (e > 0.7) return INK;
    if (lq < -1 && lf > -1) return shade(d.coat, 1.15);
    return Math.sin(lf * 1.3 + lq) > 0.7 ? d.spot : d.coat;
  });
  // head, ears, nose
  const [hx2, hy2] = P(len + 1.6, 0);
  disc(x, hx2, hy2, 2.4, INK);
  disc(x, hx2, hy2, 1.6, d.coat);
  for (const q of [-1.8, 1.8]) {
    const [ex, ey] = P(len + 0.8, q);
    rect(x, ex - 0.5, ey - 0.5, 1, 1, shade(d.coat, 0.55));
  }
  const [nx, ny] = P(len + 3.6, 0);
  rect(x, nx - 0.5, ny - 0.5, 1, 1, INK);
}

// ---------- the neighbor on the porch ----------
export function drawNeighbor(x: Ctx, g: LawnSim, t: number): void {
  const y = g.y;
  const p = NEIGHBOR_LOOK[y.neighbor.name];
  const left = y.porch.x + 2 < LW / 2;
  const chairX = left ? y.porch.x + 2 : y.porch.x + y.porch.w - 16;
  const seatY = y.houseH + 3;
  const mad = g.say.t > 0 && g.say.mood === 'mad';
  const talking = g.say.t > 0 && Math.floor(t * 8) % 2 === 0;
  const face: -1 | 1 = g.m.x < chairX + 7 ? -1 : 1;
  if (mad) {
    // up out of the chair, shaking a fist
    drawPerson(x, p, chairX, y.houseH - 24, Math.floor(t * 6), talking, { face, shadow: false });
    const fy = y.houseH - 14 - (Math.floor(t * 10) % 2);
    rect(x, chairX + (face > 0 ? 13 : -2), fy, 3, 3, INK);
    rect(x, chairX + (face > 0 ? 14 : -1), fy + 1, 1, 1, p.skin);
    return;
  }
  // rocking chair (rocks gently)
  const rock = Math.round(Math.sin(t * 1.6) * 0.8);
  rect(x, chairX - 1 + rock, seatY - 10, 3, 12, '#6a3a1a');
  rect(x, chairX - 1 + rock, seatY - 1, 15, 3, '#6a3a1a');
  rect(x, chairX - 2, seatY + 6, 18, 1, '#4a2a12');
  drawSeated(x, p, chairX + rock, seatY, 0, face, Math.floor(t * 0.6) % 7 === 0);
  if (g.say.t > 0 && g.say.mood === 'happy') {
    // thumbs up
    const tx = chairX + rock + (face > 0 ? 12 : 0);
    rect(x, tx, seatY - 12, 3, 4, INK);
    rect(x, tx + 1, seatY - 11, 1, 2, p.skin);
    rect(x, tx + 1, seatY - 13, 1, 2, p.skin);
  }
}

export function drawSpeech(x: Ctx, g: LawnSim, t: number): void {
  if (g.say.t <= 0) return;
  const y = g.y;
  const left = y.porch.x + 2 < LW / 2;
  const ax = (left ? y.porch.x + 9 : y.porch.x + y.porch.w - 9) + 0;
  const words = g.say.text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 20) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  const w = Math.max(...lines.map(textWidth)) + 8;
  const h = lines.length * 7 + 5;
  const bx = Math.max(2, Math.min(LW - w - 2, Math.round(ax + (left ? 10 : -w - 10))));
  const by = 16;
  const mood = g.say.mood;
  const bg = mood === 'mad' ? '#ffe2dc' : mood === 'happy' ? '#e2f6e4' : '#fffaf0';
  rect(x, bx - 1, by, w + 2, h, INK);
  rect(x, bx, by - 1, w, h + 2, INK);
  rect(x, bx, by, w, h, bg);
  // tail toward the speaker
  const tx = left ? bx - 3 : bx + w + 1;
  rect(x, tx, by + h - 6, 3, 3, INK);
  rect(x, tx + (left ? 1 : 0), by + h - 5, 2, 1, bg);
  lines.forEach((s, i) => text(x, s, bx + Math.round((w - textWidth(s)) / 2), by + 3 + i * 7, mood === 'mad' && Math.floor(t * 6) % 2 ? '#c0302a' : '#2a1f3a'));
}

// ---------- per-yard light ----------
const LIGHT: { tint: string; glow: string; a: number }[] = [
  { tint: '#eef4ff', glow: '#bfd8ff', a: 0.1 }, // morning
  { tint: '#ffffff', glow: '#fff8e0', a: 0 }, // noon
  { tint: '#ffe6c8', glow: '#ffa860', a: 0.22 }, // late afternoon
];
function drawYardLight(x: Ctx, g: LawnSim): void {
  const L = LIGHT[g.ix] ?? LIGHT[1];
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = L.tint;
  x.fillRect(0, 0, LW, LH);
  if (L.a > 0) {
    x.globalCompositeOperation = 'soft-light';
    x.globalAlpha = L.a;
    x.fillStyle = L.glow;
    x.fillRect(0, 0, LW, LH);
    x.globalAlpha = 1;
  }
  x.globalCompositeOperation = 'source-over';
  // the house throws a soft shadow onto the top of the lawn (longer late in the day)
  const top = g.y.houseH + 2;
  const len = 8 + g.ix * 6;
  const sh = x.createLinearGradient(0, top, 0, top + len);
  sh.addColorStop(0, `rgba(10,20,32,${(0.3 + g.ix * 0.05).toFixed(3)})`);
  sh.addColorStop(1, 'rgba(10,20,32,0)');
  x.fillStyle = sh;
  x.fillRect(0, top, LW, len);
  // sunlight: a broad warm glow from the sun's side (low and orange late in the day)
  const sunX = [LW * 0.1, LW * 0.5, LW * 0.95][g.ix] ?? LW * 0.5;
  glow(x, sunX, -20, LH * 0.9, L.a > 0 ? L.glow : '#fff8e0', 0.14 + L.a * 0.5, 0.8);
}

// ---------- the whole yard ----------
export interface YardFx {
  knock: Map<Solid, number>;
  binOpen: number;
  poolSplash: number;
}
export function drawYard(x: Ctx, g: LawnSim, layer: LawnLayer, t: number, look: MowerLook, fx: YardFx): void {
  // HD: the backdrop is rounded off (Scale3x) once per yard; the lawn texture is filtered up
  // smoothly so the mowing stripes read as soft bands, with blade grain laid over it.
  drawHd(x, backdrop(g.y), 0, 0, false, BACK_LIT);
  layer.update(g);
  softBlit(x, layer.canvas, 0, 0, LW, LH);
  grain(x, 0, g.y.houseH, LW, LH - g.y.houseH, 0.42, 'blades', 0, 0, 18);
  drawTufts(x, g, layer, t);
  // when nearly done, the stragglers blink so you can find them
  if (g.phase === 'play' && cutFrac(g) >= 0.9 && Math.floor(t * 3) % 2 === 0) {
    x.fillStyle = 'rgba(255,240,120,0.55)';
    for (let k = 0; k < GW * GH; k++) if (g.grid[k] === TALL) x.fillRect((k % GW) * CELL, Math.floor(k / GW) * CELL, CELL, CELL);
  }
  // tree shadows on the grass
  for (const s of g.y.solids)
    if (s.kind === 'tree') {
      x.globalAlpha = 0.22;
      ellipse(x, s.x + 6, s.y + 4, 15, 11, '#0a1a08');
      x.globalAlpha = 1;
    }
  for (const s of g.y.solids) if (s.kind === 'bed') drawFlowers(x, s, t);
  for (const s of g.y.solids) if (s.kind === 'pool') drawPool(x, s, t, fx.poolSplash);
  for (const sp of g.y.sprinklers) drawSprinkler(x, sp, t);
  drawBin(x, g.y.bin, fx.binOpen, g.m.bag >= BAG_CAP * 0.85, t);
  drawNeighbor(x, g, t);
  // y-sorted: gnomes, dog, you
  const items: { y: number; draw: () => void }[] = [];
  for (const s of g.y.solids) if (s.kind === 'gnome') items.push({ y: s.y, draw: () => drawGnome(x, s, t, fx.knock.get(s) ?? 1) });
  const dog = g.y.dog;
  if (dog) items.push({ y: dog.y, draw: () => drawDog(x, dog, t) });
  items.push({ y: g.m.y, draw: () => drawMowerHd(x, g.m, look, t, g.wet) });
  items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
  // canopies over everything (see-through when you're underneath)
  for (const s of g.y.solids) if (s.kind === 'tree') drawCanopy(x, s, t, Math.hypot(g.m.x - s.x, g.m.y - s.y + 6) < 20);
  drawYardLight(x, g);
}

// ---------- HUD bar ----------
export function drawLawnHud(x: Ctx, g: LawnSim, t: number): void {
  x.globalAlpha = 0.8;
  rect(x, 0, 0, LW, 12, '#140c22');
  x.globalAlpha = 1;
  rect(x, 0, 12, LW, 1, INK);
  text(x, `YARD ${g.ix + 1}/3`, 3, 4, '#fff3c4');
  // cut meter
  const f = cutFrac(g);
  const m0 = 44;
  const m1 = 128;
  rect(x, m0 - 1, 3, m1 - m0 + 2, 7, INK);
  rect(x, m0, 4, m1 - m0, 5, '#2a4a22');
  const w = Math.round((m1 - m0) * Math.min(1, f));
  for (let i = 0; i < w; i++) rect(x, m0 + i, 4, 1, 5, Math.floor(i / 4) % 2 ? '#8ad060' : '#6ab04a');
  rect(x, m0 + Math.round((m1 - m0) * 0.9), 3, 1, 7, '#ffe27a');
  const pct = `${Math.floor(f * 100)}%`;
  outlined(x, pct, Math.round((m0 + m1) / 2 - textWidth(pct) / 2), 4, '#ffffff');
  // bag meter
  const bf = g.m.bag / BAG_CAP;
  text(x, 'BAG', 134, 4, bf >= 1 && Math.floor(t * 4) % 2 ? '#ff7a5a' : '#c8c0d8');
  rect(x, 147, 3, 24, 7, INK);
  rect(x, 148, 4, 22, 5, '#3a3448');
  rect(x, 148, 4, Math.round(22 * Math.min(1, bf)), 5, bf >= 0.85 ? '#ff9a4a' : '#c8b878');
  // clock
  const left = Math.max(0, Math.ceil(g.y.limit - g.gt));
  const clock = `0:${String(Math.min(59, left)).padStart(2, '0')}`;
  const lc = left >= 60 ? `1:${String(left - 60).padStart(2, '0')}` : clock;
  text(x, lc, LW - 3 - textWidth(lc), 4, left <= 8 && Math.floor(t * 4) % 2 ? '#ff7a5a' : '#ffe27a');
}


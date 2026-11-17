// Roach Patrol art: the midnight kitchen (checker floor, rag rug, counters, sink, stove with its
// green 12:00 clock, the fridge, a moonlit window), the table and trash can (depth-sorted), food
// that shows bite marks, cracks and caulk patches, cartoon roaches (scurrying, flipped, ghosts)
// and the goofy green splat decals.
import { cached, hash, INK, rect, text, type Ctx } from '../art/px.ts';
import { pline, VH, VW } from './tagFx.ts';
import { COUNTER_Y, TABLE, TRASH, type Crack, type Food, type Roach } from './tagRoach.ts';

// ---------- static room ----------
export function kitchenBg(): HTMLCanvasElement {
  return cached('tagkitchen', VW, VH, (x) => {
    // floor: checker linoleum with grime
    for (let ty = 44; ty < VH; ty += 8)
      for (let tx = 0; tx < VW; tx += 8) {
        const dark = ((tx + ty) / 8) % 2 === 0;
        rect(x, tx, ty, 8, 8, dark ? '#8c8496' : '#c8c2c0');
      }
    for (let j = 44; j < VH; j++)
      for (let i = 0; i < VW; i++) {
        const h = hash(i * 3571 + j * 9349);
        if (h < 0.06) rect(x, i, j, 1, 1, 'rgba(60,50,70,0.35)');
        else if (h > 0.985) rect(x, i, j, 1, 1, 'rgba(255,255,255,0.35)');
      }
    // rag rug in front of the sink
    const rx = 96;
    const ry = 104;
    const rcol = ['#c0504a', '#e8b860', '#4a8ac0', '#7ab060', '#c070a8'];
    for (let j = 0; j < 22; j++) {
      const hw = Math.round(34 * Math.sqrt(1 - ((j - 11) / 11.5) ** 2));
      rect(x, rx + 32 - hw, ry + j, hw * 2, 1, rcol[Math.floor(j / 2 + (j % 3)) % rcol.length]);
    }
    for (let j = 0; j < 22; j += 2) {
      const hw = Math.round(34 * Math.sqrt(1 - ((j - 11) / 11.5) ** 2));
      for (let i = rx + 32 - hw; i < rx + 32 + hw; i += 3) rect(x, i, ry + j, 1, 1, 'rgba(0,0,0,0.18)');
    }
    // back wall: wallpaper
    rect(x, 0, 0, VW, 18, '#4f6f7c');
    for (let i = 0; i < VW; i += 6) rect(x, i, 0, 2, 18, '#46636f');
    for (let i = 3; i < VW; i += 12) for (let j = 3; j < 16; j += 6) rect(x, i, j, 1, 1, '#6a8a94');
    // window with moonlight and blinds
    rect(x, 38, 1, 40, 16, INK);
    rect(x, 39, 2, 38, 14, '#1c2a52');
    rect(x, 39, 2, 38, 14, '#22356a');
    for (let j = 3; j < 15; j += 3) rect(x, 39, j, 38, 1, '#3a4e86');
    rect(x, 66, 4, 5, 5, '#f4f0d8'); // moon
    rect(x, 67, 4, 4, 1, '#ffffff');
    rect(x, 69, 6, 1, 1, '#d8d4bc');
    rect(x, 57, 2, 1, 14, INK);
    rect(x, 37, 15, 42, 2, '#e8e0d0'); // sill
    rect(x, 45, 13, 3, 3, '#7ab060'); // little plant
    rect(x, 46, 11, 1, 2, '#9ad070');
    rect(x, 44, 15, 5, 1, '#b05a3a');
    // upper cabinets
    for (let cx = 92; cx < 196; cx += 26) {
      rect(x, cx, 0, 25, 13, '#a87a50');
      rect(x, cx, 0, 25, 1, '#c89a70');
      rect(x, cx + 1, 1, 11, 11, '#9a6c44');
      rect(x, cx + 13, 1, 11, 11, '#9a6c44');
      rect(x, cx + 11, 7, 1, 2, '#e8d8a0');
      rect(x, cx + 14, 7, 1, 2, '#e8d8a0');
      rect(x, cx, 13, 25, 1, '#5a3a24');
    }
    // wall clock
    rect(x, 14, 3, 11, 11, INK);
    rect(x, 15, 4, 9, 9, '#f2ece0');
    rect(x, 19, 5, 1, 4, INK);
    rect(x, 19, 8, 1, 1, '#c0392b');
    // counter top
    rect(x, 2, 18, 198, 15, '#c8b694');
    for (let i = 2; i < 200; i++) for (let j = 18; j < 33; j++) if (hash(i * 71 + j * 13) < 0.08) rect(x, i, j, 1, 1, '#b4a07c');
    rect(x, 2, 18, 198, 1, '#8a7a5c'); // backsplash line
    rect(x, 2, 32, 198, 1, '#ece2c8'); // front edge highlight
    // sink
    rect(x, 50, 21, 30, 10, '#6a7280');
    rect(x, 51, 22, 28, 8, '#9aa2b0');
    rect(x, 52, 23, 26, 6, '#7a8290');
    rect(x, 64, 25, 2, 2, '#3a3e48');
    rect(x, 63, 18, 4, 3, '#b8c0cc');
    rect(x, 64, 21, 2, 2, '#d8dee8');
    // front face: cabinet doors
    rect(x, 2, 33, 198, 10, '#7a4e30');
    for (let cx = 4; cx < 146; cx += 18) {
      rect(x, cx, 34, 16, 8, '#8c5c3a');
      rect(x, cx, 34, 16, 1, '#a87250');
      rect(x, cx + 15, 34, 1, 8, '#5a3820');
      rect(x, cx + 7, 37, 2, 1, '#e8d8a0');
    }
    // stove: top with burners, front with oven window and clock
    rect(x, 148, 18, 52, 15, '#e8e4dc');
    rect(x, 148, 18, 52, 1, '#b8b4ac');
    for (const [bx, by] of [
      [154, 20],
      [168, 20],
      [154, 26],
      [186, 26],
    ]) {
      rect(x, bx, by, 9, 5, '#3a3a44');
      rect(x, bx + 1, by + 1, 7, 3, '#22222a');
      rect(x, bx + 3, by + 2, 3, 1, '#4a4a54');
    }
    rect(x, 148, 33, 52, 10, '#d8d4cc');
    rect(x, 152, 40, 44, 3, '#2a2a34');
    rect(x, 153, 40, 42, 1, '#4a4a58');
    for (const kx of [151, 156, 189, 194]) {
      rect(x, kx, 34, 3, 3, '#3a3a44');
      rect(x, kx + 1, 34, 1, 1, '#8a8a94');
    }
    rect(x, 163, 33, 23, 7, '#101418'); // clock panel
    rect(x, 163, 33, 23, 1, '#2a2e34');
    // toe kick (dark gap under the counter)
    rect(x, 2, 43, 198, 3, '#1c120e');
    rect(x, 2, 46, 198, 2, 'rgba(10,6,4,0.35)');
    // fridge
    rect(x, 202, 0, 46, 10, '#dfe6ea');
    rect(x, 202, 0, 46, 1, '#f4f8fa');
    rect(x, 202, 10, 46, 34, '#cfd8de');
    rect(x, 202, 10, 46, 1, '#f0f4f6');
    rect(x, 246, 10, 2, 34, '#a8b2ba');
    rect(x, 202, 20, 46, 1, '#9aa4ac'); // freezer line
    rect(x, 205, 12, 2, 7, '#8a949c');
    rect(x, 205, 23, 2, 14, '#8a949c');
    // magnets, a drawing, a takeout menu
    rect(x, 214, 24, 10, 12, '#f8f4e8');
    rect(x, 216, 27, 4, 4, '#e0503c');
    rect(x, 218, 29, 4, 4, '#3f7fd8');
    rect(x, 218, 23, 2, 2, '#f2b632');
    rect(x, 230, 13, 8, 5, '#f2e0a0');
    rect(x, 231, 14, 6, 1, '#c0a060');
    rect(x, 231, 16, 4, 1, '#c0a060');
    rect(x, 240, 26, 3, 3, '#3caa6a');
    rect(x, 202, 44, 46, 3, '#0e0a0c'); // the dark gap under the fridge
    rect(x, 202, 47, 46, 2, 'rgba(10,6,4,0.35)');
    // side walls and baseboards
    rect(x, 0, 18, 4, VH - 18, '#3e5862');
    rect(x, 4, 44, 3, VH - 44, '#e8e0d0');
    rect(x, 6, 44, 1, VH - 44, '#b8b0a0');
    rect(x, VW - 4, 0, 4, VH, '#3e5862');
    rect(x, VW - 7, 50, 3, VH - 50, '#e8e0d0');
    rect(x, VW - 7, 50, 1, VH - 50, '#b8b0a0');
    rect(x, 0, VH - 4, VW, 4, '#e8e0d0');
    rect(x, 0, VH - 4, VW, 1, '#b8b0a0');
    // outline the counter and fridge
    rect(x, 2, 43, 198, 1, INK);
    rect(x, 200, 18, 1, 26, INK);
    rect(x, 201, 0, 1, 47, INK);
  });
}

// The table (front-to-back depth: sorted at its front edge).
export function drawTable(x: Ctx): void {
  const t = TABLE;
  // shadow
  x.fillStyle = 'rgba(10,6,20,0.35)';
  x.fillRect(t.x - 1, t.y, t.w + 4, t.h + 3);
  // legs
  for (const lx of [t.x, t.x + t.w - 3]) {
    rect(x, lx, t.y + t.h - 6, 3, 8, '#6a4228');
    rect(x, lx, t.y + t.h - 6, 1, 8, '#8a5a38');
  }
  // top (seen from above, raised)
  const top = t.y - 12;
  rect(x, t.x - 3, top - 1, t.w + 6, t.h + 12, INK);
  rect(x, t.x - 2, top, t.w + 4, t.h + 8, '#b07a4a');
  for (let j = 0; j < t.h + 8; j += 3) rect(x, t.x - 2, top + j, t.w + 4, 1, '#a06c40');
  rect(x, t.x - 2, top, t.w + 4, 1, '#d09a68');
  rect(x, t.x - 2, top + t.h + 8, t.w + 4, 3, '#7a4c2c'); // front edge
  // a checked napkin, a mug, a cereal box
  rect(x, t.x + 4, top + 4, 12, 8, '#e8e0f0');
  for (let i = 0; i < 12; i += 2) for (let j = 0; j < 8; j += 2) rect(x, t.x + 4 + i + ((j / 2) % 2), top + 4 + j, 1, 1, '#c05a5a');
  rect(x, t.x + 26, top + 6, 6, 6, INK);
  rect(x, t.x + 27, top + 7, 4, 4, '#3f7fd8');
  rect(x, t.x + 28, top + 8, 2, 2, '#4a2a1a');
  rect(x, t.x + 32, top + 8, 2, 2, '#3f7fd8');
  rect(x, t.x + 36, top + 2, 6, 10, INK);
  rect(x, t.x + 37, top + 3, 4, 8, '#f2b632');
  rect(x, t.x + 37, top + 5, 4, 2, '#e0503c');
}

export function drawTrash(x: Ctx): void {
  const t = TRASH;
  x.fillStyle = 'rgba(10,6,20,0.35)';
  x.fillRect(t.x, t.y + t.h - 2, t.w + 3, 3);
  rect(x, t.x - 1, t.y - 9, t.w + 2, t.h + 9, INK);
  rect(x, t.x, t.y - 4, t.w, t.h + 3, '#5a7a6a');
  rect(x, t.x, t.y - 4, 2, t.h + 3, '#7a9a8a');
  rect(x, t.x + t.w - 2, t.y - 4, 2, t.h + 3, '#3e5a4c');
  for (let i = 3; i < t.w - 2; i += 3) rect(x, t.x + i, t.y - 2, 1, t.h - 1, '#4a6a5a');
  rect(x, t.x - 1, t.y - 8, t.w + 2, 4, '#6a8a7a');
  rect(x, t.x - 1, t.y - 8, t.w + 2, 1, '#9abaa8');
  rect(x, t.x + 4, t.y - 9, 6, 1, '#3e5a4c');
  // a banana peel flopping over the edge
  rect(x, t.x + 9, t.y - 5, 3, 2, '#f2d048');
  rect(x, t.x + 11, t.y - 3, 1, 3, '#e0b830');
}

// ---------- food on the counter ----------
export function drawFood(x: Ctx, f: Food, t: number): void {
  const cx = Math.round(f.x);
  const by = COUNTER_Y + 4; // bottom of the food
  const hp = f.hp;
  if (hp <= 0) {
    // crumbs
    for (let i = 0; i < 7; i++) rect(x, cx - 6 + Math.floor(hash(i + f.x) * 12), by - 1 - Math.floor(hash(i * 3 + f.x) * 3), 1, 1, f.kind === 'fruit' ? '#8a3a2a' : '#c89a50');
    return;
  }
  x.fillStyle = 'rgba(40,30,20,0.3)';
  x.fillRect(cx - 7, by, 15, 2);
  if (f.kind === 'bread') {
    rect(x, cx - 8, by - 7, 16, 8, INK);
    rect(x, cx - 7, by - 6, 14, 6, '#c8862e');
    rect(x, cx - 7, by - 6, 14, 2, '#e0a850');
    for (const sx of [-4, 0, 4]) rect(x, cx + sx, by - 6, 2, 1, '#f4d090');
  } else if (f.kind === 'fruit') {
    rect(x, cx - 8, by - 4, 16, 5, INK);
    rect(x, cx - 7, by - 3, 14, 3, '#5a8ac8');
    rect(x, cx - 7, by - 3, 14, 1, '#8ab0e0');
    rect(x, cx - 6, by - 8, 5, 5, '#d03a2a');
    rect(x, cx - 5, by - 8, 2, 1, '#ff8a7a');
    rect(x, cx - 1, by - 9, 6, 2, '#f2d048');
    rect(x, cx + 4, by - 8, 1, 2, '#f2d048');
    rect(x, cx + 1, by - 7, 2, 2, '#7a3a9a');
    rect(x, cx + 3, by - 6, 2, 2, '#9a4ab8');
    rect(x, cx - 3, by - 10, 1, 2, '#3a6a2a');
  } else {
    rect(x, cx - 8, by - 6, 16, 7, INK);
    rect(x, cx - 7, by - 5, 14, 5, '#d8a050');
    rect(x, cx - 7, by - 5, 14, 1, '#f0c070');
    for (let i = -6; i < 7; i += 3) rect(x, cx + i, by - 4, 1, 3, '#a05a28');
    rect(x, cx - 6, by - 3, 12, 1, '#a05a28');
    // steam (it's still warm)
    const s = Math.floor(t * 3) % 3;
    rect(x, cx - 2 + s, by - 9, 1, 2, 'rgba(255,255,255,0.5)');
    rect(x, cx + 2 - s, by - 11, 1, 2, 'rgba(255,255,255,0.35)');
  }
  // bite marks eaten out of the right side
  const bites = Math.ceil((100 - hp) / 17);
  for (let i = 0; i < bites; i++) {
    const bx = cx + 7 - (i % 3) * 3 - Math.floor(i / 3) * 2;
    const byy = by - 7 + ((i * 3) % 6);
    rect(x, bx - 1, byy, 3, 2, '#c8b694');
    rect(x, bx, byy + 2, 1, 1, '#c8b694');
  }
}

// ---------- cracks ----------
export function drawCrack(x: Ctx, c: Crack, t: number, sealT: number, wave: number): void {
  if (c.wave > wave) return;
  const cx = Math.round(c.x);
  const cy = Math.round(c.y);
  const vertical = c.side === 'left' || c.side === 'right';
  if (c.sealed) {
    // a fat white caulk patch with a shine
    if (vertical) {
      rect(x, cx - 2, cy - 6, 4, 12, '#f8f6f0');
      rect(x, cx - 1, cy - 5, 1, 10, '#ffffff');
      rect(x, cx - 2, cy + 5, 4, 1, '#c8c4bc');
    } else {
      rect(x, cx - 6, cy - 2, 12, 4, '#f8f6f0');
      rect(x, cx - 5, cy - 1, 10, 1, '#ffffff');
      rect(x, cx - 6, cy + 1, 12, 1, '#c8c4bc');
    }
    return;
  }
  // jagged dark crack
  const pts = vertical
    ? [
        [0, -6],
        [1, -3],
        [-1, 0],
        [1, 3],
        [0, 6],
      ]
    : [
        [-6, 0],
        [-3, 1],
        [0, -1],
        [3, 1],
        [6, 0],
      ];
  for (let i = 0; i < pts.length - 1; i++) {
    pline(x, cx + pts[i][0], cy + pts[i][1], cx + pts[i + 1][0], cy + pts[i + 1][1], '#1a0e0a', 2);
    pline(x, cx + pts[i][0] + 1, cy + pts[i][1] + 1, cx + pts[i + 1][0] + 1, cy + pts[i + 1][1] + 1, '#5a4a40');
  }
  // antennae poking out when one is about to come through
  if (c.peek > 0) {
    const w = Math.floor(t * 10) % 2;
    const dx = c.side === 'left' ? 1 : c.side === 'right' ? -1 : 0;
    const dy = c.side === 'top' ? 1 : c.side === 'bottom' ? -1 : 0;
    rect(x, cx + dx * 2 - dy * 1, cy + dy * 2 - dx * 1 + w, 1, 1, '#7a3a1e');
    rect(x, cx + dx * 3 - dy * 2, cy + dy * 3 - dx * 2 - w, 1, 1, '#7a3a1e');
    rect(x, cx + dx * 2 + dy * 1, cy + dy * 2 + dx * 1, 1, 1, '#7a3a1e');
    rect(x, cx + dx * 3 + dy * 2 + w, cy + dy * 3 + dx * 2, 1, 1, '#7a3a1e');
  }
  // caulk going in
  if (sealT > 0) {
    const n = Math.round(12 * sealT);
    if (vertical) rect(x, cx - 1, cy - 6, 3, n, '#f8f6f0');
    else rect(x, cx - 6, cy - 1, n, 3, '#f8f6f0');
  }
}

// ---------- roaches ----------
const SHELL = '#6e3014';
const SHELL_L = '#b0622e';
const SHELL_H = '#e09a5a';
const LEG = '#3a1a0c';

// Plots a point in the roach's frame (u = forward, v = right) to the screen.
function plotter(x: Ctx, r: Roach, s: number) {
  const c = Math.cos(r.ang);
  const sn = Math.sin(r.ang);
  return (u: number, v: number, col: string): void => {
    const px = r.x + (u * c - v * sn) * s;
    const py = r.y + (u * sn + v * c) * s * 0.85;
    rect(x, Math.round(px), Math.round(py), 1, 1, col);
  };
}

export function drawRoach(x: Ctx, r: Roach, t: number): void {
  const s = r.size;
  const P = plotter(x, r, s);
  const flipped = r.st === 'down';
  // shadow
  x.fillStyle = 'rgba(10,4,4,0.35)';
  x.fillRect(Math.round(r.x - 2 * s), Math.round(r.y + 2), Math.round(5 * s), 1);
  const ph = Math.floor(r.legPh) % 2;
  const wig = flipped ? Math.floor(t * 30) % 2 : 0;
  // legs
  for (const [u, side] of [
    [-2, 1],
    [0, 1],
    [1, 1],
    [-2, -1],
    [0, -1],
    [1, -1],
  ] as [number, number][]) {
    const alt = (u + (side > 0 ? 1 : 0)) % 2 === 0 ? ph : 1 - ph;
    const du = flipped ? wig * side : alt ? 1 : -1;
    P(u, side * 2, LEG);
    P(u + du, side * 3, LEG);
  }
  if (flipped) {
    // belly up, X eyes
    for (let u = -3; u <= 1; u++) for (let v = -1; v <= 1; v++) P(u, v, v === 0 ? '#f0c890' : '#d8a070');
    P(2, 0, '#5a2a14');
    P(2, -1, '#ffffff');
    P(2, 1, '#ffffff');
    P(3, -1, INK);
    P(3, 1, INK);
    return;
  }
  // shell
  for (let u = -3; u <= 1; u++)
    for (let v = -1; v <= 1; v++) {
      if ((u === -3 && v !== 0) || (u === 1 && v !== 0 && s < 0.8)) continue;
      P(u, v, v === 0 ? SHELL_L : SHELL);
    }
  if (s >= 0.8) {
    P(-2, -2, SHELL);
    P(-1, -2, SHELL);
    P(-2, 2, SHELL);
    P(-1, 2, SHELL);
    P(-1, 0, SHELL_H);
  }
  // head with googly eyes
  P(2, 0, '#3a1a0c');
  if (s >= 0.8) {
    P(2, -1, '#ffffff');
    P(2, 1, '#ffffff');
  }
  // antennae
  const a = Math.sin(t * 14 + r.id) > 0 ? 1 : 0;
  P(3, -1, LEG);
  P(4, -2 - a, '#7a3a1e');
  P(3, 1, LEG);
  P(4, 2 + (1 - a), '#7a3a1e');
}

// Glinting eyes of roaches hiding in the dark gaps (drawn on the glow layer).
export function drawEyes(x: Ctx, r: Roach, t: number): void {
  if (Math.sin(t * 2 + r.id * 1.7) > 0.85) return; // blink
  rect(x, Math.round(r.x) - 1, Math.round(r.y), 1, 1, '#fff8c0');
  rect(x, Math.round(r.x) + 1, Math.round(r.y), 1, 1, '#fff8c0');
}

// A little roach ghost with a halo, floating up after a splat (glow layer).
export function drawGhost(x: Ctx, gx: number, gy: number, a: number): void {
  x.globalAlpha = Math.max(0, Math.min(1, a)) * 0.85;
  const px = Math.round(gx);
  const py = Math.round(gy);
  rect(x, px - 2, py, 5, 3, '#e8f4ff');
  rect(x, px - 1, py - 1, 3, 1, '#e8f4ff');
  rect(x, px - 2, py + 3, 1, 1, '#e8f4ff');
  rect(x, px + 2, py + 3, 1, 1, '#e8f4ff');
  rect(x, px, py + 3, 1, 1, '#e8f4ff');
  rect(x, px - 1, py + 1, 1, 1, INK);
  rect(x, px + 1, py + 1, 1, 1, INK);
  rect(x, px - 2, py - 3, 5, 1, '#ffe27a');
  x.globalAlpha = 1;
}

// Cartoon splat: a lime goo star with a highlight (not gross: bright and goofy).
export function drawSplat(x: Ctx, sx: number, sy: number, a: number, seed: number): void {
  x.globalAlpha = Math.max(0, Math.min(1, a)) * 0.9;
  const px = Math.round(sx);
  const py = Math.round(sy);
  const goo = '#9ad83a';
  const dark = '#4a8a1e';
  rect(x, px - 3, py - 2, 7, 5, dark);
  rect(x, px - 2, py - 1, 5, 3, goo);
  for (let i = 0; i < 6; i++) {
    const an = (i / 6) * Math.PI * 2 + seed;
    const len = 4 + Math.floor(hash(seed * 100 + i) * 3);
    const ex = Math.round(px + Math.cos(an) * len);
    const ey = Math.round(py + Math.sin(an) * len * 0.7);
    rect(x, ex - 1, ey - 1, 2, 2, dark);
    rect(x, ex - 1, ey - 1, 1, 1, goo);
  }
  rect(x, px - 1, py - 1, 1, 1, '#e8ffb0');
  x.globalAlpha = 1;
}

// The stove's green 12:00 (glow layer). Blinks, like it's been since the power flickered.
export function drawClock(x: Ctx, t: number): void {
  if (Math.floor(t * 1.5) % 2 === 0) text(x, '12:00', 165, 34, '#5aff8a');
  else text(x, '12 00', 165, 34, '#3acf6a');
}

// A pulsing ring that says "seal me" when you're close enough.
export function drawSealRing(x: Ctx, c: Crack, t: number): void {
  const r = 7 + (Math.floor(t * 6) % 2);
  for (let k = 0; k < 16; k++) {
    if ((k + Math.floor(t * 8)) % 4 === 0) continue;
    const an = (k / 16) * Math.PI * 2;
    rect(x, Math.round(c.x + Math.cos(an) * r), Math.round(c.y + Math.sin(an) * r * 0.8), 1, 1, '#ffe27a');
  }
}

// Mist cone fill (faint, dithered) so you can read the spray's reach.
export function drawMistCone(x: Ctx, nx: number, ny: number, ang: number, len: number, half: number, t: number): void {
  x.fillStyle = 'rgba(220,255,240,0.22)';
  const steps = Math.ceil(len);
  for (let d = 3; d < steps; d += 1) {
    const w = Math.tan(half) * d;
    for (let k = -w; k <= w; k += 2) {
      if (((d + Math.floor(k) + Math.floor(t * 30)) & 3) !== 0) continue;
      const px = nx + Math.cos(ang) * d - Math.sin(ang) * k;
      const py = ny + Math.sin(ang) * d + Math.cos(ang) * k;
      x.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }
}

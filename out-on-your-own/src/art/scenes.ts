// Location backdrops at 192x108, painted in code. t = time in seconds (for small animations).
import type { ArtId } from '../engine/types.ts';
import { CAST, drawPerson, type Person } from './people.ts';
import { bands, dither, dot, hash, H, outlineRect, rect, text, textWidth, W, type Ctx } from './px.ts';

export interface SceneDef {
  paint: (x: Ctx, t: number) => void;
  player: number; // x position of player
  npc: number; // x position of speaker
  floor: number; // y of feet line
  extras?: (x: Ctx, t: number) => void; // drawn after people (foreground)
}

const INK = '#1c1424';

// ---------- shared pieces ----------
function wall(x: Ctx, c1: string, c2: string, floorY: number): void {
  rect(x, 0, 0, W, floorY, c1);
  for (let i = 0; i < W; i += 12) rect(x, i, 0, 1, floorY, c2);
  rect(x, 0, floorY - 4, W, 4, c2);
  rect(x, 0, floorY - 5, W, 1, INK);
}
function floorBoards(x: Ctx, y: number, c1: string, c2: string): void {
  rect(x, 0, y, W, H - y, c1);
  for (let j = y + 4; j < H; j += 5) rect(x, 0, j, W, 1, c2);
  for (let j = y; j < H; j += 5) for (let i = (j * 7) % 23; i < W; i += 23) rect(x, i, j, 1, 5, c2);
}
function tiles(x: Ctx, y: number, c1: string, c2: string): void {
  rect(x, 0, y, W, H - y, c1);
  for (let j = y; j < H; j += 6) for (let i = ((j - y) / 6) % 2 ? 0 : 6; i < W; i += 12) rect(x, i, j, 6, 6, c2);
}
function windowFrame(x: Ctx, px: number, py: number, w: number, h: number, sky: string[], t: number, night = false): void {
  rect(x, px - 2, py - 2, w + 4, h + 4, '#e8e0d0');
  outlineRect(x, px - 2, py - 2, w + 4, h + 4, INK);
  bands(x, px, py, w, h, sky);
  if (!night) {
    const cx = px + ((t * 2) % (w + 20)) - 10;
    rect(x, cx, py + 4, 8, 2, '#ffffff');
    rect(x, cx + 2, py + 3, 4, 1, '#ffffff');
  } else {
    for (let i = 0; i < 6; i++) if ((Math.floor(t * 2) + i) % 3) dot(x, px + hash(i * 3) * w, py + hash(i * 7) * h * 0.7, '#fff8c0');
  }
  rect(x, px + w / 2 - 1, py, 2, h, '#e8e0d0');
  rect(x, px, py + h / 2 - 1, w, 2, '#e8e0d0');
}
function poster(x: Ctx, px: number, py: number, w: number, h: number, bg: string, fg: string): void {
  rect(x, px, py, w, h, bg);
  outlineRect(x, px, py, w, h, INK);
  rect(x, px + 2, py + 2, w - 4, 2, fg);
  rect(x, px + 2, py + 6, w - 6, 1, fg);
  rect(x, px + 2, py + 8, w - 5, 1, fg);
}
function plant(x: Ctx, px: number, py: number): void {
  rect(x, px, py + 8, 8, 7, '#b5643a');
  outlineRect(x, px, py + 8, 8, 7, INK);
  rect(x, px + 3, py, 2, 8, '#2f8a4a');
  rect(x, px, py + 2, 4, 3, '#3caa6a');
  rect(x, px + 4, py + 4, 4, 3, '#3caa6a');
  rect(x, px + 2, py - 2, 4, 3, '#55c47e');
}
function desk(x: Ctx, px: number, py: number, w: number, top: string, front: string): void {
  rect(x, px, py, w, 3, top);
  rect(x, px, py + 3, w, 12, front);
  outlineRect(x, px, py, w, 15, INK);
  rect(x, px + 2, py + 6, w - 4, 1, INK);
}
function counter(x: Ctx, py: number, top: string, front: string): void {
  rect(x, 0, py, W, 3, top);
  rect(x, 0, py + 3, W, H - py - 3, front);
  rect(x, 0, py + 3, W, 1, INK);
  for (let i = 8; i < W; i += 24) rect(x, i, py + 6, 16, H - py - 9, '#00000018');
}
function lamp(x: Ctx, px: number, py: number, t: number): void {
  rect(x, px, py, 1, 6, INK);
  rect(x, px - 4, py + 6, 9, 3, '#f2d48a');
  outlineRect(x, px - 4, py + 6, 9, 3, INK);
  if (Math.floor(t * 3) % 17 !== 0) dither(x, px - 3, py + 9, 7, 3, '#f2d48a33', '#00000000');
}
function car(x: Ctx, px: number, py: number, body: string, flip = false): void {
  const b = body;
  rect(x, px + 6, py, 22, 7, b);
  rect(x, px, py + 6, 36, 8, b);
  rect(x, px + 9, py + 2, 7, 4, '#9fd8f0');
  rect(x, px + 18, py + 2, 7, 4, '#9fd8f0');
  outlineRect(x, px, py + 6, 36, 8, INK);
  outlineRect(x, px + 6, py, 22, 7, INK);
  rect(x, px + 5, py + 12, 7, 6, INK);
  rect(x, px + 24, py + 12, 7, 6, INK);
  rect(x, px + 7, py + 14, 3, 2, '#8a8a9a');
  rect(x, px + 26, py + 14, 3, 2, '#8a8a9a');
  rect(x, flip ? px : px + 33, py + 8, 3, 2, '#fff27a');
  rect(x, flip ? px + 33 : px, py + 8, 3, 2, '#e0503c');
}
function sign(x: Ctx, label: string, px: number, py: number, bg: string, fg: string): void {
  const w = textWidth(label) + 6;
  rect(x, px, py, w, 9, bg);
  outlineRect(x, px, py, w, 9, INK);
  text(x, label, px + 3, py + 2, fg);
}
function skyline(x: Ctx, y: number, c: string, seed: number): void {
  let px = 0;
  let i = 0;
  while (px < W) {
    const w = 12 + Math.floor(hash(seed + i) * 16);
    const h = 14 + Math.floor(hash(seed + i * 13) * 26);
    rect(x, px, y - h, w, h, c);
    for (let wy = y - h + 3; wy < y - 2; wy += 5) for (let wx = px + 2; wx < px + w - 2; wx += 4) if (hash(wx * 31 + wy) > 0.45) rect(x, wx, wy, 2, 2, '#ffe9a0');
    px += w + 1;
    i++;
  }
}
function crowd(x: Ctx, people: Person[], xs: number[], y: number, t: number): void {
  people.forEach((p, i) => drawPerson(x, p, xs[i], y, Math.floor(t * 1.5 + i) % 2));
}
const P = (skin: number, hair: number, style: number, shirt: string): Person => ({
  skin: ['#f7d7bd', '#eab38c', '#c98c62', '#a26a46', '#714a32', '#4b3022'][skin],
  hair: ['#2a1b12', '#5b3a22', '#a7652b', '#e3c26b', '#c2412f', '#14131d', '#a3a3b4'][hair],
  style,
  shirt,
  pants: '#3a3a52',
});

// ---------- scenes ----------
export const SCENES: Record<ArtId, SceneDef> = {
  bedroom: {
    player: 60,
    npc: 120,
    floor: 96,
    paint: (x, t) => {
      wall(x, '#7fb0d8', '#6a9ac2', 74);
      windowFrame(x, 128, 14, 34, 26, ['#8fd0ff', '#b8e4ff', '#e0f4ff'], t);
      poster(x, 22, 12, 18, 24, '#e0503c', '#f2b632');
      poster(x, 46, 18, 14, 18, '#2a2a5a', '#7fd0d8');
      // bed
      rect(x, 4, 66, 44, 16, '#f2efe6');
      rect(x, 4, 62, 12, 8, '#ffffff');
      rect(x, 18, 66, 30, 10, '#e0503c');
      outlineRect(x, 4, 62, 44, 20, INK);
      floorBoards(x, 82, '#b07a4a', '#8e5f36');
      // dresser
      desk(x, 166, 60, 22, '#c08a5a', '#a06a3a');
      lamp(x, 176, 40, t);
      // pennant
      rect(x, 70, 10, 20, 7, '#3caa6a');
      text(x, 'GRAD', 72, 11, '#ffffff');
    },
  },
  dorm: {
    player: 70,
    npc: 130,
    floor: 96,
    paint: (x, t) => {
      wall(x, '#d8cfc0', '#c4baa8', 74);
      for (let i = 0; i < W; i += 8) rect(x, i, 0, 1, 70, '#c9bfae');
      windowFrame(x, 80, 10, 32, 24, ['#8fd0ff', '#b8e4ff'], t);
      // bunk
      rect(x, 4, 30, 40, 4, '#8a8a9a');
      rect(x, 4, 60, 40, 4, '#8a8a9a');
      rect(x, 4, 26, 40, 4, '#3f7fd8');
      rect(x, 4, 56, 40, 4, '#e0503c');
      rect(x, 4, 26, 2, 52, '#5a5a6a');
      rect(x, 42, 26, 2, 52, '#5a5a6a');
      poster(x, 52, 14, 16, 20, '#9a5ad0', '#f2efe6');
      tiles(x, 82, '#9a8a7a', '#8a7a6a');
      desk(x, 150, 58, 36, '#7a5a3a', '#6a4a2a');
      rect(x, 158, 48, 14, 10, '#2a2a33');
      rect(x, 159, 49, 12, 7, Math.floor(t * 2) % 2 ? '#3f7fd8' : '#4a8ae8');
      lamp(x, 180, 30, t);
    },
  },
  apartment: {
    player: 64,
    npc: 128,
    floor: 96,
    paint: (x, t) => {
      wall(x, '#e6c89a', '#d2b484', 74);
      windowFrame(x, 14, 12, 40, 28, ['#ffb070', '#ffd090', '#ffe8b8'], t);
      // couch
      rect(x, 86, 56, 52, 18, '#3caa6a');
      rect(x, 86, 50, 52, 8, '#2f8a55');
      rect(x, 84, 56, 6, 18, '#2f8a55');
      rect(x, 134, 56, 6, 18, '#2f8a55');
      outlineRect(x, 84, 50, 56, 24, INK);
      poster(x, 100, 18, 26, 18, '#f2efe6', '#e0503c');
      floorBoards(x, 80, '#9a6a44', '#7e5434');
      // rug
      rect(x, 70, 88, 80, 10, '#c0392b');
      dither(x, 72, 90, 76, 6, '#c0392b', '#a03024');
      // boxes
      rect(x, 160, 62, 20, 14, '#c9a36a');
      rect(x, 164, 50, 16, 12, '#d8b27a');
      outlineRect(x, 160, 62, 20, 14, INK);
      outlineRect(x, 164, 50, 16, 12, INK);
      plant(x, 4, 62);
    },
  },
  dmv: {
    player: 50,
    npc: 140,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#c7d1c0', '#b3bdac', 70);
      rect(x, 0, 0, W, 6, '#e8efe0');
      for (let i = 4; i < W; i += 32) rect(x, i, 0, 20, 4, Math.floor(t * 4 + i) % 23 === 0 ? '#c7d1c0' : '#fffef0');
      // now serving board
      rect(x, 66, 10, 60, 20, '#1c1c24');
      outlineRect(x, 66, 10, 60, 20, INK);
      text(x, 'NOW SERVING', 70, 13, '#ff6a4a');
      text(x, Math.floor(t / 4) % 2 ? 'A-041' : 'A-042', 86, 21, '#ffd23a');
      sign(x, 'DMV', 14, 12, '#2b3f7a', '#ffffff');
      poster(x, 150, 14, 18, 22, '#f2efe6', '#2b3f7a');
      tiles(x, 76, '#a8a89a', '#98988a');
      // chairs row
      for (let i = 0; i < 4; i++) {
        rect(x, 8 + i * 16, 74, 12, 3, '#ff8a1e');
        rect(x, 8 + i * 16, 66, 3, 8, '#ff8a1e');
      }
    },
    extras: (x, t) => {
      counter(x, 92, '#d8d0c0', '#8a7a6a');
      crowd(x, [P(0, 1, 1, '#9a5ad0'), P(4, 0, 4, '#e0503c')], [88, 104], 62, t);
    },
  },
  bank: {
    player: 56,
    npc: 132,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#e9e1cf', '#d9cfb8', 72);
      for (const px of [20, 76, 160]) {
        rect(x, px, 6, 10, 66, '#f6f0e0');
        rect(x, px - 2, 6, 14, 3, '#d9cfb8');
        rect(x, px - 2, 66, 14, 4, '#d9cfb8');
        outlineRect(x, px, 6, 10, 66, '#b9ae98');
      }
      sign(x, 'BANK', 102, 10, '#2e3f6e', '#f2d48a');
      rect(x, 98, 26, 40, 18, '#2e3f6e');
      text(x, 'SAVINGS', 104, 29, '#f2d48a');
      text(x, `${(4.0 + Math.sin(t) * 0.05).toFixed(2)}%`, 106, 36, '#7fe08a');
      tiles(x, 78, '#c8b898', '#b8a888');
      plant(x, 4, 62);
    },
    extras: (x) => {
      counter(x, 92, '#7a5a3a', '#5a3e28');
    },
  },
  dentist: {
    player: 56,
    npc: 124,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#cfeef0', '#b8dee2', 72);
      windowFrame(x, 150, 12, 30, 24, ['#8fd0ff', '#b8e4ff'], t);
      poster(x, 14, 12, 20, 26, '#ffffff', '#2fb5b0');
      // giant tooth sign
      rect(x, 52, 10, 14, 12, '#ffffff');
      rect(x, 52, 22, 5, 6, '#ffffff');
      rect(x, 61, 22, 5, 6, '#ffffff');
      outlineRect(x, 52, 10, 14, 12, INK);
      // chair
      rect(x, 84, 64, 40, 8, '#2fb5b0');
      rect(x, 120, 50, 8, 22, '#2fb5b0');
      rect(x, 98, 72, 6, 12, '#8a9aa8');
      outlineRect(x, 84, 64, 40, 8, INK);
      // light
      rect(x, 92, 6, 2, 24, '#8a9aa8');
      rect(x, 86, 30, 14, 5, '#f2f2f2');
      if (Math.floor(t * 2) % 2) dither(x, 88, 35, 10, 8, '#fff8c033', '#00000000');
      tiles(x, 80, '#e8f4f4', '#d0e4e4');
    },
  },
  clinic: {
    player: 56,
    npc: 128,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#dfe9f2', '#cbd8e4', 72);
      rect(x, 0, 40, W, 6, '#3caa6a');
      sign(x, 'URGENT CARE', 60, 10, '#e0503c', '#ffffff');
      rect(x, 20, 10, 14, 14, '#ffffff');
      rect(x, 25, 12, 4, 10, '#e0503c');
      rect(x, 22, 15, 10, 4, '#e0503c');
      outlineRect(x, 20, 10, 14, 14, INK);
      // monitor
      rect(x, 150, 16, 26, 18, '#1c1c24');
      for (let i = 0; i < 24; i++) {
        const yy = 25 + (i % 8 === Math.floor(t * 8) % 8 ? -5 : 0);
        dot(x, 151 + i, yy, '#3cff7a');
      }
      // bed
      rect(x, 84, 66, 48, 6, '#f2f2f2');
      rect(x, 84, 72, 48, 3, '#8a9aa8');
      outlineRect(x, 84, 66, 48, 6, INK);
      tiles(x, 80, '#e8eef4', '#d4dce6');
    },
  },
  grocery: {
    player: 50,
    npc: 130,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#f2efe6', '#e2dfd6', 70);
      sign(x, 'FRESH FIELDS', 60, 6, '#3caa6a', '#ffffff');
      for (let s = 0; s < 3; s++) {
        const sx = 10 + s * 62;
        rect(x, sx, 20, 50, 48, '#c9b49a');
        for (let r = 0; r < 4; r++) {
          rect(x, sx, 30 + r * 10, 50, 2, '#8a7a6a');
          for (let k = 0; k < 10; k++) rect(x, sx + 2 + k * 5, 22 + r * 10, 4, 8, ['#e0503c', '#f2b632', '#3caa6a', '#3f7fd8', '#ef7fae'][(k + r + s) % 5]);
        }
        outlineRect(x, sx, 20, 50, 48, INK);
      }
      tiles(x, 76, '#e8e4d8', '#dcd6c8');
      if (Math.floor(t) % 6 === 0) rect(x, 0, 0, W, 2, '#fffef0');
    },
    extras: (x, t) => {
      rect(x, 150, 84, 40, 6, '#5a5a6a');
      rect(x, 150, 90, 40, 18, '#3a3a4a');
      rect(x, 160, 78, 12, 6, '#1c1c24');
      text(x, Math.floor(t) % 2 ? '$4.99' : '$12.47', 152, 79, '#7fe08a');
    },
  },
  warehouse: {
    player: 54,
    npc: 128,
    floor: 98,
    paint: (x, t) => {
      rect(x, 0, 0, W, 76, '#6a7380');
      for (let i = 0; i < W; i += 16) rect(x, i, 0, 2, 76, '#5a636e');
      rect(x, 0, 0, W, 8, '#4a525c');
      for (let i = 10; i < W; i += 40) {
        rect(x, i, 8, 20, 3, '#f2f2d8');
        if (Math.floor(t * 3 + i) % 29) dither(x, i + 2, 11, 16, 6, '#f2f2d822', '#00000000');
      }
      // racks
      for (let r = 0; r < 3; r++) {
        const rx = 6 + r * 66;
        rect(x, rx, 20, 2, 56, '#ff8a1e');
        rect(x, rx + 52, 20, 2, 56, '#ff8a1e');
        for (let s = 0; s < 3; s++) {
          rect(x, rx, 34 + s * 16, 54, 2, '#3f7fd8');
          for (let b = 0; b < 3; b++) {
            rect(x, rx + 4 + b * 16, 24 + s * 16, 12, 10, '#c9a36a');
            outlineRect(x, rx + 4 + b * 16, 24 + s * 16, 12, 10, '#8a6a3a');
          }
        }
      }
      rect(x, 0, 76, W, 32, '#8a8a90');
      rect(x, 0, 84, W, 2, '#f2c230');
      sign(x, 'PARCELPOINT', 66, 1, '#2b2b38', '#ff8a1e');
    },
  },
  jobsite: {
    player: 56,
    npc: 126,
    floor: 98,
    paint: (x, t) => {
      bands(x, 0, 0, W, 60, ['#7fc4f0', '#9ad2f4', '#b8e0f8', '#d4ecfa']);
      // framed house
      rect(x, 30, 26, 130, 4, '#d8b27a');
      for (let i = 30; i <= 158; i += 10) rect(x, i, 30, 3, 46, '#d8b27a');
      rect(x, 30, 52, 130, 3, '#c9a36a');
      for (let i = 0; i < 65; i++) {
        dot(x, 30 + i, 26 - Math.floor(i / 2.6), '#c9a36a');
        dot(x, 160 - i, 26 - Math.floor(i / 2.6), '#c9a36a');
      }
      // wires
      x.strokeStyle = '#e0503c';
      rect(x, 63, 32, 1, 20, '#e0503c');
      rect(x, 63, 40, 30, 1, '#3f7fd8');
      rect(x, 120, 36, 6, 8, '#8a8a9a');
      outlineRect(x, 120, 36, 6, 8, INK);
      rect(x, 0, 76, W, 32, '#9a7a54');
      dither(x, 0, 76, W, 4, '#9a7a54', '#7a5a3a');
      // cone
      rect(x, 176, 80, 8, 12, '#ff8a1e');
      rect(x, 174, 92, 12, 2, '#ff8a1e');
      rect(x, 177, 84, 6, 2, '#ffffff');
      if (Math.floor(t * 4) % 9 === 0) rect(x, 92, 39, 3, 3, '#fff27a');
    },
  },
  campus: {
    player: 60,
    npc: 128,
    floor: 98,
    paint: (x, t) => {
      bands(x, 0, 0, W, 56, ['#7fc4f0', '#a4d6f6', '#cce8fa']);
      rect(x, 40, 14, 112, 52, '#b55a3a');
      for (let i = 0; i < 6; i++) rect(x, 48 + i * 18, 24, 8, 12, '#f2efe6');
      for (let i = 0; i < 6; i++) rect(x, 48 + i * 18, 44, 8, 12, '#f2efe6');
      rect(x, 86, 8, 20, 10, '#9a4a2e');
      rect(x, 92, 2, 8, 8, '#9a4a2e');
      rect(x, 93, 4, 6, 4, '#f2efe6');
      dot(x, 96, 5, INK);
      dot(x, 96 + (Math.floor(t) % 2), 6, INK);
      outlineRect(x, 40, 14, 112, 52, INK);
      rect(x, 0, 66, W, 42, '#5aa04a');
      dither(x, 0, 66, W, 6, '#5aa04a', '#4a8a3a');
      rect(x, 80, 66, 32, 42, '#d8c8a8');
      for (const tx of [12, 166]) {
        rect(x, tx + 4, 44, 4, 24, '#6a4a2a');
        rect(x, tx - 4, 28, 20, 18, '#3c8a3a');
        rect(x, tx - 2, 24, 16, 6, '#4aa04a');
      }
    },
  },
  carlot: {
    player: 52,
    npc: 120,
    floor: 98,
    paint: (x, t) => {
      bands(x, 0, 0, W, 50, ['#7fc4f0', '#a4d6f6', '#cce8fa']);
      skyline(x, 50, '#9ab0c8', 7);
      // bunting
      for (let i = 0; i < W; i += 8) {
        const c = ['#e0503c', '#f2b632', '#3f7fd8', '#3caa6a'][(i / 8) % 4];
        rect(x, i + 2, 14 + (i % 16 ? 1 : 0), 4, 3, c);
        dot(x, i + 3, 17 + (i % 16 ? 1 : 0), c);
      }
      rect(x, 0, 13, W, 1, INK);
      sign(x, 'USED CARS', 4, 24, '#f2b632', '#1c1424');
      rect(x, 0, 50, W, 58, '#7a7a84');
      for (let i = 0; i < W; i += 40) rect(x, i + 18, 60, 2, 48, '#f2f2e0');
      car(x, 140, 56, '#3f7fd8');
      car(x, 4, 56, '#c0392b', true);
      // price tag sway
      const sway = Math.floor(t * 2) % 2;
      rect(x, 150 + sway, 50, 14, 6, '#ffffff');
      text(x, '$$$', 151 + sway, 51, '#c0392b');
      // inflatable guy
      const lean = Math.sin(t * 4) * 3;
      rect(x, 90 + lean, 20, 6, 30, '#ff8a1e');
      rect(x, 86 + lean * 1.4, 24, 14, 3, '#ff8a1e');
      rect(x, 91 + lean, 22, 1, 1, INK);
      rect(x, 94 + lean, 22, 1, 1, INK);
    },
  },
  street: {
    player: 60,
    npc: 126,
    floor: 98,
    paint: (x, t) => {
      bands(x, 0, 0, W, 60, ['#7fc4f0', '#a4d6f6', '#cce8fa']);
      skyline(x, 70, '#b0a090', 3);
      rect(x, 0, 70, W, 10, '#c8c0b0');
      rect(x, 0, 80, W, 28, '#5a5a64');
      for (let i = 0; i < W; i += 24) rect(x, i + ((t * 20) % 24), 93, 12, 2, '#f2e27a');
      // bus stop
      rect(x, 160, 40, 2, 32, '#3a3a4a');
      rect(x, 154, 34, 14, 8, '#3f7fd8');
      text(x, 'BUS', 155, 36, '#ffffff');
    },
  },
  office: {
    player: 54,
    npc: 130,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#b8c2cc', '#a6b0ba', 72);
      windowFrame(x, 12, 10, 44, 30, ['#8fd0ff', '#b8e4ff', '#e0f4ff'], t);
      poster(x, 70, 14, 22, 16, '#f2efe6', '#3f7fd8');
      rect(x, 100, 12, 30, 22, '#f2f2f2');
      outlineRect(x, 100, 12, 30, 22, INK);
      for (let i = 0; i < 4; i++) rect(x, 104, 16 + i * 4, 10 + ((i * 7) % 12), 1, '#3a3a4a');
      // clock
      rect(x, 150, 12, 12, 12, '#ffffff');
      outlineRect(x, 150, 12, 12, 12, INK);
      const a = t * 0.5;
      dot(x, 156 + Math.round(Math.cos(a) * 3), 18 + Math.round(Math.sin(a) * 3), INK);
      dot(x, 156, 18, INK);
      floorBoards(x, 78, '#7a6a5a', '#6a5a4a');
      plant(x, 172, 60);
    },
    extras: (x) => {
      desk(x, 96, 82, 70, '#8a6a4a', '#6a4a2e');
      rect(x, 140, 72, 14, 10, '#2a2a33');
      rect(x, 141, 73, 12, 7, '#3f7fd8');
    },
  },
  library: {
    player: 56,
    npc: 128,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#8a5a3a', '#7a4a2a', 74);
      for (let s = 0; s < 4; s++) {
        const sx = 4 + s * 48;
        rect(x, sx, 6, 42, 64, '#5a3820');
        for (let r = 0; r < 5; r++) {
          rect(x, sx, 18 + r * 12, 42, 2, '#3a2412');
          for (let k = 0; k < 9; k++) {
            const hgt = 8 + Math.floor(hash(s * 100 + r * 10 + k) * 3);
            rect(x, sx + 2 + k * 4 + (k > 4 ? 1 : 0), 18 + r * 12 - hgt, 3, hgt, ['#c0392b', '#2e3f6e', '#3caa6a', '#f2b632', '#9a5ad0', '#e8e0d0'][(k + r + s) % 6]);
          }
        }
        outlineRect(x, sx, 6, 42, 64, INK);
      }
      floorBoards(x, 80, '#6a4a2e', '#5a3a20');
      lamp(x, 96, 0, t);
    },
    extras: (x) => {
      desk(x, 70, 84, 60, '#7a5a3a', '#5a3e28');
      rect(x, 80, 80, 10, 4, '#f2efe6');
      rect(x, 84, 79, 10, 4, '#e8e0d0');
    },
  },
  party: {
    player: 62,
    npc: 118,
    floor: 98,
    paint: (x, t) => {
      wall(x, '#3a2a5a', '#2e2048', 76);
      for (let i = 0; i < 14; i++) {
        const c = ['#ff6ab0', '#6ae0ff', '#ffe96a', '#8aff6a'][(i + Math.floor(t * 3)) % 4];
        rect(x, 6 + i * 13, 8 + (i % 2) * 3, 3, 3, c);
      }
      rect(x, 0, 9, W, 1, '#1c1424');
      // disco shimmer
      for (let i = 0; i < 20; i++) if (hash(i + Math.floor(t * 4) * 31) > 0.6) dot(x, hash(i * 7) * W, 14 + hash(i * 3) * 50, '#ffffff');
      floorBoards(x, 82, '#5a3a5a', '#4a2a4a');
      // table + pizza
      desk(x, 150, 70, 36, '#c08a5a', '#a06a3a');
      rect(x, 156, 66, 24, 4, '#f2b632');
      rect(x, 160, 66, 3, 2, '#c0392b');
      rect(x, 170, 67, 3, 2, '#c0392b');
    },
    extras: (x, t) => {
      crowd(x, [P(2, 3, 0, '#3caa6a'), P(5, 0, 3, '#e0503c')], [10, 168], 64, t);
    },
  },
  road: {
    player: 60,
    npc: 126,
    floor: 98,
    paint: (x, t) => {
      bands(x, 0, 0, W, 50, ['#ffb070', '#ffc890', '#ffe0b0', '#fff0d0']);
      rect(x, 0, 40, W, 12, '#7a9a6a');
      for (let i = 0; i < 6; i++) {
        const hx = ((i * 41 - t * 6) % (W + 40)) - 20 + (i * 41 - t * 6 < 0 ? W + 40 : 0);
        rect(x, hx, 32, 16, 10, '#5a8a4a');
        rect(x, hx + 4, 28, 8, 4, '#6a9a5a');
      }
      rect(x, 52, 52, W, 2, '#c8c0b0');
      rect(x, 0, 54, W, 54, '#4a4a54');
      for (let i = -24; i < W; i += 24) rect(x, i + ((t * 30) % 24), 78, 12, 2, '#f2e27a');
      car(x, 140, 60, '#c0392b');
    },
  },
  night: {
    player: 60,
    npc: 126,
    floor: 98,
    paint: (x, t) => {
      bands(x, 0, 0, W, 60, ['#0e0e2a', '#16163a', '#1e1e4a']);
      for (let i = 0; i < 30; i++) if ((i + Math.floor(t * 2)) % 7) dot(x, hash(i) * W, hash(i * 9) * 40, '#fff8c0');
      skyline(x, 70, '#22223a', 11);
      rect(x, 0, 70, W, 38, '#2a2a34');
      const flash = Math.floor(t * 4) % 2;
      car(x, 130, 66, '#eeeae0');
      rect(x, 140, 63, 6, 3, flash ? '#3f7fd8' : '#e0503c');
      rect(x, 146, 63, 6, 3, flash ? '#e0503c' : '#3f7fd8');
      dither(x, 0, 60, W, 48, '#00000000', flash ? '#3f7fd822' : '#e0503c22');
    },
  },
  beach: {
    player: 64,
    npc: 118,
    floor: 100,
    paint: (x, t) => {
      bands(x, 0, 0, W, 48, ['#ff9a70', '#ffb880', '#ffd8a0', '#ffe8c0']);
      rect(x, 140, 30, 18, 18, '#ffe27a');
      rect(x, 0, 48, W, 22, '#3a8ad0');
      for (let i = 0; i < W; i += 10) rect(x, i + Math.round(Math.sin(t * 2 + i) * 2), 52 + ((i / 10) % 3) * 6, 6, 1, '#9ad8ff');
      rect(x, 0, 70, W, 38, '#f2d8a0');
      dither(x, 0, 70, W, 3, '#f2d8a0', '#ffffff');
      // umbrella
      rect(x, 30, 52, 2, 30, '#5a3a2a');
      rect(x, 16, 50, 30, 4, '#e0503c');
      rect(x, 20, 48, 22, 2, '#f2efe6');
    },
  },
  stage: {
    player: 70,
    npc: 120,
    floor: 98,
    paint: (x, t) => {
      rect(x, 0, 0, W, H, '#2a1a3a');
      for (let i = 0; i < 3; i++) {
        const cx = 40 + i * 56 + Math.sin(t + i) * 10;
        dither(x, cx - 16, 0, 32, 90, '#ffffff10', '#00000000');
        rect(x, cx - 2, 0, 4, 4, '#ffe27a');
      }
      rect(x, 0, 0, 20, H, '#a02040');
      rect(x, W - 20, 0, 20, H, '#a02040');
      for (let i = 2; i < 20; i += 5) {
        rect(x, i, 0, 2, H, '#801830');
        rect(x, W - 20 + i, 0, 2, H, '#801830');
      }
      rect(x, 0, 84, W, 24, '#6a4a2a');
      rect(x, 0, 84, W, 2, '#8a6a4a');
      for (let i = 0; i < 16; i++) if (hash(i + Math.floor(t * 3) * 17) > 0.5) dot(x, 24 + hash(i * 5) * 144, 10 + hash(i * 11) * 60, ['#ffe27a', '#ff6ab0', '#6ae0ff'][i % 3]);
    },
  },
};

export function sceneDef(id: ArtId): SceneDef {
  return SCENES[id] ?? SCENES.street;
}

export { CAST };

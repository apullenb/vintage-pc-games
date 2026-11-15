// Bus Dash art: a parallax morning street, the city bus, and the sidewalk obstacles.
import { drawPerson, HAIRS, SHIRTS, SKINS, type Person } from '../art/people.ts';
import { bands, bevel, cached, disc, dither, grad, hash, INK, line, outlineRect, rect, shade, stipple, text, type Ctx } from '../art/px.ts';
import { pick } from './shiftKit.ts';

export const GROUND = 99; // runner's feet line (front lane)
export const BACK = 88; // pedestrians' feet line (back lane)
export const STREET = 74; // bus wheels sit here

export function passerby(): Person {
  return {
    skin: pick(SKINS),
    hair: pick(HAIRS),
    style: Math.floor(Math.random() * 9),
    shirt: pick(SHIRTS),
    pants: pick(['#3a3a4a', '#34406a', '#5a4a3a', '#2a2a33']),
    glasses: Math.random() < 0.25,
    hat: Math.random() < 0.2 ? 'beanie' : undefined,
    hatColor: pick(['#e07a3c', '#3f7fd8', '#c0392b']),
  };
}

// ---------- backdrop layers (tiled horizontally) ----------
const FAR_W = 256;
const NEAR_W = 384;

const sky = (): HTMLCanvasElement =>
  cached('bus-sky', 192, 60, (x) => {
    bands(x, 0, 0, 192, 52, ['#f6c8a0', '#f8d8a8', '#f8e4b8', '#e8ecd0', '#c8e4ec', '#a8d4ec'].reverse());
    disc(x, 150, 18, 7, '#fff4c8');
    disc(x, 150, 18, 5, '#ffffff');
    // clouds
    for (const [cx, cy, w] of [[30, 12, 22], [96, 8, 16], [176, 26, 18]] as const) {
      rect(x, cx, cy, w, 3, '#fff8ec');
      rect(x, cx + 3, cy - 2, w - 8, 2, '#fff8ec');
      rect(x, cx + 2, cy + 3, w - 2, 1, '#f0d8c8');
    }
  });

const far = (): HTMLCanvasElement =>
  cached('bus-far', FAR_W, 60, (x) => {
    let bx = 0;
    let k = 0;
    while (bx < FAR_W) {
      const w = 18 + Math.floor(hash(k) * 22);
      const h = 18 + Math.floor(hash(k + 9) * 26);
      const c = ['#9aa0c0', '#a8a0b8', '#8a96b4', '#b0a8c0'][k % 4];
      rect(x, bx, 58 - h, w, h, c);
      rect(x, bx, 58 - h, 1, h, shade(c, 1.08));
      for (let wy = 58 - h + 3; wy < 54; wy += 5) for (let wx = bx + 3; wx < bx + w - 3; wx += 4) rect(x, wx, wy, 2, 2, hash(wx * 7 + wy) > 0.7 ? '#fff0c0' : shade(c, 0.85));
      bx += w + 1;
      k++;
    }
  });

const near = (): HTMLCanvasElement =>
  cached('bus-near', NEAR_W, 64, (x) => {
    // storefronts and houses with trees between
    let bx = 0;
    let k = 3;
    while (bx < NEAR_W) {
      const w = 40 + Math.floor(hash(k) * 30);
      const h = 26 + Math.floor(hash(k + 5) * 14);
      const c = ['#d87a5a', '#e8c890', '#7ab0a0', '#c8a0c8', '#e0a050'][k % 5];
      const top = 60 - h;
      rect(x, bx, top, w, h, c);
      dither(x, bx, top, w, 2, shade(c, 0.8), c);
      rect(x, bx, top - 2, w, 2, shade(c, 0.6));
      // windows / awning
      if (k % 2) {
        rect(x, bx + 4, top + 8, w - 8, 12, '#4a6a8a');
        rect(x, bx + 4, top + 8, w - 8, 2, '#8ab8d8');
        for (let s = 0; s < w - 8; s += 4) rect(x, bx + 4 + s, top + 4, 2, 4, s % 8 ? '#f4f0e4' : shade(c, 0.7));
        rect(x, bx + w - 12, 48, 7, 12, '#5a3a2a');
      } else {
        for (let wx = bx + 5; wx < bx + w - 8; wx += 12) {
          rect(x, wx, top + 6, 7, 8, '#4a6a8a');
          rect(x, wx, top + 6, 7, 1, '#8ab8d8');
          outlineRect(x, wx - 1, top + 5, 9, 10, shade(c, 0.6));
        }
        rect(x, bx + 6, 46, 8, 14, '#6a4a3a');
      }
      bx += w;
      // a tree
      if (hash(k * 3) > 0.35) {
        rect(x, bx + 6, 40, 3, 20, '#6a4a2a');
        disc(x, bx + 7, 34, 9, '#4a9a4a');
        disc(x, bx + 4, 31, 5, '#5ab05a');
        stipple(x, bx - 2, 26, 18, 18, '#3a7a3a', 0.15);
        bx += 16;
      }
      k++;
    }
  });

const ground = (): HTMLCanvasElement =>
  cached('bus-ground', 192, 48, (x) => {
    // street (y 60..74 in screen space -> 0..14 here, drawn at y 60)
    grad(x, 0, 0, 192, 15, ['#5a5a66', '#4a4a56']);
    stipple(x, 0, 0, 192, 15, '#62626e', 0.15);
    // curb
    rect(x, 0, 15, 192, 2, '#c8c8d0');
    rect(x, 0, 17, 192, 1, '#8a8a96');
    // sidewalk
    grad(x, 0, 18, 192, 22, ['#d8d0c4', '#ccc4b8', '#c4bcae']);
    // lawn strip
    grad(x, 0, 40, 192, 8, ['#5aa04a', '#4a8a3a']);
    dither(x, 0, 40, 192, 1, '#5aa04a', '#3a7a2a');
  });

export function drawBackdrop(x: Ctx, cam: number, t: number): void {
  x.drawImage(sky(), 0, 0);
  const tile = (img: HTMLCanvasElement, w: number, f: number, y: number) => {
    const off = -(((cam * f) % w) + w) % w;
    for (let ox = off; ox < 192; ox += w) x.drawImage(img, Math.round(ox), y);
  };
  tile(far(), FAR_W, 0.15, 2);
  tile(near(), NEAR_W, 0.45, 0);
  x.drawImage(ground(), 0, 60);
  // road dashes and sidewalk seams scroll with the camera
  const d = -((cam % 24) + 24) % 24;
  for (let i = d; i < 192; i += 24) rect(x, Math.round(i), 66, 10, 1, '#e8d890');
  const s = -((cam % 20) + 20) % 20;
  for (let i = s; i < 192; i += 20) {
    rect(x, Math.round(i), 78, 1, 21, '#b0a89a');
  }
  // grass blades flicker a touch
  const g = -((cam % 6) + 6) % 6;
  for (let i = g; i < 192; i += 6) rect(x, Math.round(i), 100 + (Math.floor(i + t * 2) & 1), 1, 2, '#6ab85a');
}

// ---------- the bus ----------
export const BUS_W = 70;
// (fx, by): front x and wheel line. door 0..1 = closed..open
export function drawBus(x: Ctx, fx: number, by: number, door: number, sign: string, t: number): void {
  const x0 = Math.round(fx - BUS_W);
  const y0 = by - 26;
  rect(x, x0 - 1, y0 - 1, BUS_W + 2, 24, INK);
  bevel(x, x0, y0, BUS_W, 22, '#f2ece0', false);
  rect(x, x0, y0 + 14, BUS_W, 3, '#e8781e');
  rect(x, x0, y0 + 17, BUS_W, 1, '#2e7a8a');
  // windows
  for (let i = 0; i < 5; i++) {
    rect(x, x0 + 4 + i * 10, y0 + 4, 8, 8, '#3a5a72');
    rect(x, x0 + 4 + i * 10, y0 + 4, 8, 2, '#8ab8d8');
  }
  // windshield + route sign
  rect(x, x0 + BUS_W - 9, y0 + 4, 8, 10, '#3a5a72');
  rect(x, x0 + BUS_W - 9, y0 + 4, 8, 2, '#a8d8f0');
  rect(x, x0 + 4, y0 + 1, 40, 2, '#1c1424');
  rect(x, x0 + 30, y0 - 7, 40, 7, '#1c1424');
  text(x, sign, x0 + 32, y0 - 6, Math.floor(t * 4) % 2 || !sign.includes(':') ? '#ffb030' : '#ff7a20');
  // door (front, right side)
  const dx = x0 + BUS_W - 20;
  rect(x, dx, y0 + 4, 9, 16, '#1c1424');
  const open = Math.round(4 * door);
  rect(x, dx + 1 - 0, y0 + 5, 4 - open, 14, '#5a8aa0');
  rect(x, dx + 4 + open, y0 + 5, 4 - open, 14, '#5a8aa0');
  // wheels
  for (const wx of [x0 + 12, x0 + BUS_W - 12]) {
    disc(x, wx, by - 3, 4, INK);
    disc(x, wx, by - 3, 2, '#8a8a96');
  }
  // headlight
  rect(x, x0 + BUS_W - 2, y0 + 15, 2, 2, '#fff4a0');
}

// ---------- obstacles ----------
export type ObKind = 'dog' | 'stroller' | 'puddle' | 'ladder' | 'sprinkler' | 'sign' | 'hydrant' | 'branch' | 'pigeons' | 'coffee';

export function drawDog(x: Ctx, sx: number, t: number, owner: Person): void {
  const leg = Math.floor(t * 10) % 2;
  // owner in the back lane, holding the leash
  drawPerson(x, owner, sx + 16, BACK - 30, Math.floor(t * 4) % 2, false, { face: 1 });
  line(x, sx + 11, GROUND - 7, sx + 28, BACK - 10, '#c0392b');
  const y = GROUND - 9;
  rect(x, sx - 1, y + 1, 12, 6, INK);
  rect(x, sx, y + 2, 10, 4, '#c8945a');
  rect(x, sx + 8, y - 1, 6, 5, INK);
  rect(x, sx + 9, y, 4, 3, '#c8945a');
  rect(x, sx + 12, y + 1, 2, 1, '#1c1424');
  rect(x, sx + 9, y - 1, 1, 2, '#8a5a32'); // ear
  rect(x, sx + 10, y + 1, 1, 1, INK); // eye
  rect(x, sx - 2, y + 1 - leg, 2, 1, '#c8945a'); // tail wag
  rect(x, sx + 1 + leg, y + 6, 1, 3, '#8a5a32');
  rect(x, sx + 7 - leg, y + 6, 1, 3, '#8a5a32');
  rect(x, sx + 9, y + 3, 2, 1, '#c0392b'); // collar
}

export function drawStroller(x: Ctx, sx: number, t: number, parent: Person): void {
  drawPerson(x, parent, sx + 14, BACK - 30, Math.floor(t * 4) % 2, false, { face: 1 });
  line(x, sx + 12, GROUND - 13, sx + 17, BACK - 11, INK);
  const y = GROUND - 14;
  rect(x, sx - 1, y - 1, 14, 10, INK);
  rect(x, sx, y, 12, 8, '#3f7fd8');
  rect(x, sx, y, 6, 5, '#2e5aa8'); // canopy
  rect(x, sx + 7, y + 2, 3, 3, '#f7d7bd'); // baby
  rect(x, sx + 1, y + 7, 10, 1, '#2e5aa8');
  const r = Math.floor(t * 8) % 2;
  disc(x, sx + 2, GROUND - 2, 2, INK);
  disc(x, sx + 10, GROUND - 2, 2, INK);
  rect(x, sx + 2 + r, GROUND - 2, 1, 1, '#8a8a96');
  rect(x, sx + 10 - r, GROUND - 2, 1, 1, '#8a8a96');
}

export function drawPuddle(x: Ctx, sx: number, w: number, t: number): void {
  rect(x, sx + 2, GROUND - 2, w - 4, 4, '#5a7aa8');
  rect(x, sx, GROUND - 1, w, 2, '#5a7aa8');
  rect(x, sx + 4, GROUND - 2, w - 10, 1, '#a8c8f0');
  const shine = Math.floor(t * 3) % 3;
  rect(x, sx + 6 + shine * 3, GROUND, 3, 1, '#d8ecff');
}

export function drawLadder(x: Ctx, sx: number, t: number, worker: Person): void {
  // the ladder sticks out in front of the worker, right at head height
  drawPerson(x, worker, sx + 30, BACK - 30, Math.floor(t * 4) % 2, false, { face: -1 });
  const y = GROUND - 26;
  rect(x, sx - 1, y - 1, 46, 7, INK);
  rect(x, sx, y, 44, 1, '#d8d8e0');
  rect(x, sx, y + 4, 44, 1, '#b8b8c8');
  for (let i = 0; i < 44; i += 5) rect(x, sx + i, y + 1, 1, 3, '#9a9aa8');
  rect(x, sx, y, 1, 5, '#e0503c');
}

export function drawSprinkler(x: Ctx, sx: number, t: number): void {
  // head on the lawn, arcing a spray back over the sidewalk at head height
  rect(x, sx + 20, GROUND + 1, 3, 3, '#3a3a44');
  rect(x, sx + 21, GROUND - 1, 1, 2, '#8a8a96');
  for (let i = 0; i < 18; i++) {
    const u = ((i / 18 + t * 1.6) % 1);
    const px = sx + 21 - u * 30;
    const py = GROUND - 1 - Math.sin(u * Math.PI) * 30 * 0.9 - u * 0;
    rect(x, px, py, 1 + (i % 2), 1, i % 3 ? '#a8d8ff' : '#ffffff');
  }
  for (let i = 0; i < 4; i++) rect(x, sx + 4 + i * 4 + ((Math.floor(t * 8) + i) % 3), GROUND - 1, 1, 1, '#d8ecff');
}

export function drawSign(x: Ctx, sx: number): void {
  const y = GROUND - 15;
  line(x, sx, GROUND, sx + 5, y, INK);
  line(x, sx + 10, GROUND, sx + 5, y, INK);
  rect(x, sx, y + 1, 11, 11, INK);
  rect(x, sx + 1, y + 2, 9, 9, '#2a2a34');
  text(x, 'OPEN', sx + 2, y + 3, '#ffe27a');
  rect(x, sx + 2, y + 8, 7, 1, '#e0503c');
}

export function drawHydrant(x: Ctx, sx: number): void {
  const y = GROUND - 11;
  rect(x, sx - 1, y - 1, 9, 13, INK);
  rect(x, sx + 1, y, 5, 11, '#d0302a');
  rect(x, sx, y + 4, 7, 2, '#d0302a');
  rect(x, sx + 2, y - 1, 3, 1, '#d0302a');
  rect(x, sx + 1, y, 1, 11, '#f05a3c');
}

export function drawBranch(x: Ctx, sx: number): void {
  // a tree on the lawn whose low branch hangs over the sidewalk
  rect(x, sx + 30, GROUND - 40, 4, 44, '#6a4a2a');
  line(x, sx + 30, GROUND - 26, sx, GROUND - 22, '#6a4a2a');
  line(x, sx + 30, GROUND - 25, sx, GROUND - 21, '#5a3a1a');
  for (let i = 0; i < 30; i += 5) disc(x, sx + i, GROUND - 24 + (i % 3), 3, i % 2 ? '#4a9a4a' : '#5ab05a');
  disc(x, sx + 32, GROUND - 44, 10, '#4a9a4a');
  disc(x, sx + 28, GROUND - 48, 6, '#5ab05a');
}

export function drawPigeon(x: Ctx, px: number, py: number, flap: number): void {
  rect(x, px, py, 4, 3, '#8a8aa0');
  rect(x, px + 3, py - 1, 2, 2, '#6a6a80');
  rect(x, px + 5, py, 1, 1, '#e8a040');
  if (flap) rect(x, px, py - 2, 3, 2, '#aab0c8');
  else rect(x, px + 1, py + 1, 2, 1, '#6a6a80');
}

export function drawCoffee(x: Ctx, cx: number, cy: number, t: number): void {
  const b = Math.round(Math.sin(t * 5) * 1.5);
  cy += b;
  rect(x, cx - 4, cy - 5, 9, 11, INK);
  rect(x, cx - 3, cy - 3, 7, 8, '#f4f0e4');
  rect(x, cx - 3, cy - 4, 7, 1, '#6a4a2a');
  rect(x, cx - 3, cy, 7, 3, '#3caa6a');
  rect(x, cx - 1, cy + 1, 3, 1, '#f4f0e4');
  // steam
  const s = Math.floor(t * 4) % 2;
  rect(x, cx - 1 + s, cy - 8, 1, 2, '#ffffff');
  rect(x, cx + 1 - s, cy - 10, 1, 2, '#ffffff');
}

// the bus stop: a pole with a sign and a little shelter
export function drawStop(x: Ctx, sx: number): void {
  rect(x, sx, BACK - 30, 2, 30, '#6a6a7a');
  rect(x, sx - 5, BACK - 36, 12, 8, '#2e7a8a');
  outlineRect(x, sx - 6, BACK - 37, 14, 10, INK);
  text(x, 'BUS', sx - 4, BACK - 35, '#ffffff');
  rect(x, sx + 6, BACK - 22, 24, 1, '#8a8a96');
  rect(x, sx + 6, BACK - 22, 1, 22, '#8a8a96');
  rect(x, sx + 29, BACK - 22, 1, 22, '#8a8a96');
  rect(x, sx + 8, BACK - 9, 20, 2, '#8a5a32');
}

// Bus Dash art: a parallax morning street, the city bus, and the sidewalk obstacles.
import { drawPerson, HAIRS, SHIRTS, SKINS, type Person } from '../art/people.ts';
import { cached, disc, dither, hash, INK, line, outlineRect, rect, shade, stipple, text, type Ctx } from '../art/px.ts';
import { pick } from './shiftKit.ts';
import { drawHd, glow, grain, hdLayer, hdSprite, idOf, rrect, softBlit, softShadow, sphere, spriteOf, vband } from './hdFx.ts';

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

// ---------- HD backdrop ----------
// Same layers, rebuilt as smooth art: a gradient morning sky with a blooming sun and soft clouds;
// the far skyline filtered soft and pushed back into blue morning haze; the near street rounded off
// and lit; a real asphalt/curb/sidewalk/lawn ground with grain. Each layer is baked once at 3x.
const HD_S = 3;
let HD_SKY: HTMLCanvasElement | null = null;
let HD_FAR: HTMLCanvasElement | null = null;
let HD_NEAR: HTMLCanvasElement | null = null;
let HD_GROUND: HTMLCanvasElement | null = null;
function hdSky(): HTMLCanvasElement {
  if (HD_SKY) return HD_SKY;
  const { c, x } = hdLayer(192, 62, HD_S);
  vband(x, 0, 0, 192, 62, [
    [0, '#8cc4ec'],
    [0.45, '#c4e0ec'],
    [0.75, '#f6e2bc'],
    [1, '#f8cfa4'],
  ]);
  glow(x, 150, 18, 60, '#fff2c8', 0.55);
  glow(x, 150, 18, 16, '#ffffff', 0.7);
  sphere(x, 150, 18, 5.5, '#fffbe8', 0, 0, 0);
  for (const [cx, cy, w] of [
    [40, 12, 26],
    [104, 8, 18],
    [182, 27, 22],
  ] as const) {
    for (let k = 0; k < 4; k++) {
      const px = cx - w / 2 + (k + 0.5) * (w / 4);
      const r = 3 + Math.sin(k * 1.7 + cx) * 1 + (k === 1 || k === 2 ? 1.5 : 0);
      const g = x.createRadialGradient(px - 1, cy - r * 0.5, 0.5, px, cy, r * 1.4);
      g.addColorStop(0, 'rgba(255,252,244,0.95)');
      g.addColorStop(0.7, 'rgba(250,236,226,0.75)');
      g.addColorStop(1, 'rgba(250,236,226,0)');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(px, cy, r * 1.4, r, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  HD_SKY = c;
  return c;
}
function hdFar(): HTMLCanvasElement {
  if (HD_FAR) return HD_FAR;
  const { c, x } = hdLayer(FAR_W, 60, HD_S);
  softBlit(x, far(), 0, 0, FAR_W, 60);
  // atmospheric perspective: distant towers fade into the morning haze, more at their feet
  x.globalCompositeOperation = 'source-atop';
  vband(x, 0, 0, FAR_W, 60, [
    [0, 'rgba(196,222,240,0.35)'],
    [1, 'rgba(240,226,206,0.62)'],
  ]);
  x.globalCompositeOperation = 'source-over';
  HD_FAR = c;
  return c;
}
function hdNear(): HTMLCanvasElement {
  if (HD_NEAR) return HD_NEAR;
  const { c, x } = hdLayer(NEAR_W, 64, HD_S);
  x.imageSmoothingEnabled = true;
  x.drawImage(hdSprite(near(), { light: 0.12, shadow: 0.18, lx: 0.8, ly: 0.1 }), 0, 0, NEAR_W, 64);
  // a light layer of haze + sun from the upper right
  x.globalCompositeOperation = 'source-atop';
  vband(x, 0, 0, NEAR_W, 64, [
    [0, 'rgba(255,236,200,0.1)'],
    [0.6, 'rgba(255,236,200,0.04)'],
    [1, 'rgba(40,30,60,0.12)'],
  ]);
  x.globalCompositeOperation = 'source-over';
  HD_NEAR = c;
  return c;
}
function hdGround(): HTMLCanvasElement {
  if (HD_GROUND) return HD_GROUND;
  const { c, x } = hdLayer(192, 48, HD_S);
  // street: dark asphalt, a soft sky reflection band
  vband(x, 0, 0, 192, 15, [
    [0, '#62626f'],
    [0.5, '#4c4c58'],
    [1, '#40404c'],
  ]);
  vband(x, 0, 3, 192, 4, [
    [0, 'rgba(200,220,240,0)'],
    [0.5, 'rgba(200,220,240,0.1)'],
    [1, 'rgba(200,220,240,0)'],
  ]);
  // curb: a rounded concrete lip with a highlight and a shadow under it
  vband(x, 0, 15, 192, 3, [
    [0, '#f0f0f4'],
    [0.45, '#c8c8d0'],
    [1, '#7a7a86'],
  ]);
  // sidewalk: lit from above, darker toward the lawn
  vband(x, 0, 18, 192, 22, [
    [0, '#c2baae'],
    [0.12, '#e0d8cc'],
    [1, '#c0b8aa'],
  ]);
  // lawn
  vband(x, 0, 40, 192, 8, [
    [0, '#3e7c32'],
    [0.25, '#5aa04a'],
    [1, '#468a3a'],
  ]);
  grain(x, 0, 0, 192, 18, 0.5, 'fine', 0, 0, 24);
  grain(x, 0, 18, 192, 22, 0.3, 'fine', 0, 0, 40);
  grain(x, 0, 40, 192, 8, 0.6, 'blades', 0, 0, 16);
  HD_GROUND = c;
  return c;
}

export function drawBackdropHd(x: Ctx, cam: number, t: number): void {
  x.drawImage(hdSky(), 0, 0, 192, 62);
  const tile = (img: HTMLCanvasElement, w: number, h: number, f: number, y: number) => {
    const off = -(((cam * f) % w) + w) % w;
    for (let ox = off; ox < 192; ox += w) x.drawImage(img, ox, y, w + 0.02, h);
  };
  tile(hdFar(), FAR_W, 60, 0.15, 2);
  tile(hdNear(), NEAR_W, 64, 0.45, 0);
  // where the street meets the buildings: a band of shade
  vband(x, 0, 54, 192, 7, [
    [0, 'rgba(30,20,50,0)'],
    [1, 'rgba(30,20,50,0.25)'],
  ]);
  const gnd = hdGround();
  const gs = -((cam % 192) + 192) % 192;
  void gs;
  x.drawImage(gnd, 0, 60, 192, 48);
  // road dashes and sidewalk seams scroll with the camera (smooth, sub-pixel)
  const d = -((cam % 24) + 24) % 24;
  x.fillStyle = '#ece0a0';
  for (let i = d; i < 192; i += 24) {
    rrect(x, i, 65.6, 10, 1.1, 0.5);
    x.fill();
  }
  const s = -((cam % 20) + 20) % 20;
  for (let i = s; i < 192; i += 20) {
    x.fillStyle = 'rgba(120,110,96,0.55)';
    x.fillRect(i, 78, 0.6, 21);
    x.fillStyle = 'rgba(255,250,240,0.5)';
    x.fillRect(i + 0.6, 78, 0.4, 21);
  }
  // grass blades sway a touch
  const g = -((cam % 6) + 6) % 6;
  x.strokeStyle = '#78c466';
  x.lineWidth = 0.5;
  x.beginPath();
  for (let i = g; i < 192; i += 3) {
    const sw = Math.sin(t * 2 + i * 0.7) * 0.6;
    x.moveTo(i, 103);
    x.lineTo(i + sw, 100 + (Math.floor(i) % 2));
  }
  x.stroke();
}

// ---------- the bus ----------
export const BUS_W = 70;
// HD bus: a lacquered cream body with a glossy orange band, tinted glass with sky reflections, real
// tyres with hubcaps, a glowing destination sign and headlight.
export function drawBusHd(x: Ctx, fx: number, by: number, door: number, sign: string, t: number): void {
  const x0 = fx - BUS_W;
  const y0 = by - 26;
  // shadow on the street
  softShadow(x, x0 + BUS_W / 2, by + 0.5, BUS_W * 0.56, 2.6, 0.5);
  // body
  rrect(x, x0, y0, BUS_W, 22, 3);
  const bg = x.createLinearGradient(0, y0, 0, y0 + 22);
  bg.addColorStop(0, '#fffaf0');
  bg.addColorStop(0.35, '#f2ece0');
  bg.addColorStop(0.8, '#d8d0c0');
  bg.addColorStop(1, '#a8a090');
  x.fillStyle = bg;
  x.fill();
  x.strokeStyle = 'rgba(20,12,30,0.85)';
  x.lineWidth = 0.6;
  x.stroke();
  // orange band + teal pinstripe, with a gloss line
  const ob = x.createLinearGradient(0, y0 + 14, 0, y0 + 17);
  ob.addColorStop(0, '#ffa850');
  ob.addColorStop(0.5, '#e8781e');
  ob.addColorStop(1, '#b85a10');
  x.fillStyle = ob;
  x.fillRect(x0 + 0.3, y0 + 14, BUS_W - 0.6, 3);
  x.fillStyle = '#2e7a8a';
  x.fillRect(x0 + 0.3, y0 + 17, BUS_W - 0.6, 0.8);
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.fillRect(x0 + 1, y0 + 14.2, BUS_W - 2, 0.4);
  // roof highlight
  x.fillStyle = 'rgba(255,255,255,0.7)';
  rrect(x, x0 + 3, y0 + 0.5, BUS_W - 8, 0.8, 0.4);
  x.fill();
  const glass = (gx: number, gy: number, gw: number, gh: number) => {
    rrect(x, gx, gy, gw, gh, 0.8);
    const gg = x.createLinearGradient(gx, gy, gx + gw * 0.6, gy + gh);
    gg.addColorStop(0, '#a8d4f0');
    gg.addColorStop(0.35, '#4a7090');
    gg.addColorStop(1, '#1e3046');
    x.fillStyle = gg;
    x.fill();
    x.save();
    x.clip();
    x.strokeStyle = 'rgba(240,250,255,0.5)';
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(gx + gw * 0.2, gy + gh + 1);
    x.lineTo(gx + gw * 0.7, gy - 1);
    x.stroke();
    x.restore();
  };
  for (let i = 0; i < 5; i++) glass(x0 + 4 + i * 10, y0 + 4, 8, 8);
  glass(x0 + BUS_W - 9, y0 + 4, 8, 10);
  // destination sign (glows)
  rrect(x, x0 + 30, y0 - 7, 40, 7, 1);
  x.fillStyle = '#1c1424';
  x.fill();
  const lit = Math.floor(t * 4) % 2 || !sign.includes(':') ? '#ffb030' : '#ff7a20';
  text(x, sign, x0 + 32, y0 - 6, lit);
  glow(x, x0 + 50, y0 - 3.5, 16, '#ffa030', 0.25, 0.35);
  // door
  const dx = x0 + BUS_W - 20;
  rrect(x, dx, y0 + 4, 9, 16, 0.6);
  x.fillStyle = '#1c1424';
  x.fill();
  const open = 4 * door;
  for (const [px, w] of [
    [dx + 1, 4 - open],
    [dx + 4 + open, 4 - open],
  ] as const) {
    if (w <= 0.05) continue;
    const dg = x.createLinearGradient(px, 0, px + w, 0);
    dg.addColorStop(0, '#8ab8cc');
    dg.addColorStop(1, '#3e6a80');
    x.fillStyle = dg;
    x.fillRect(px, y0 + 5, w, 14);
  }
  // wheels: tyre, shaded hubcap, a glint
  for (const wx of [x0 + 12, x0 + BUS_W - 12]) {
    x.fillStyle = 'rgba(20,12,30,0.9)';
    x.beginPath();
    x.arc(wx, by - 6, 5.6, Math.PI, 0);
    x.fill();
    sphere(x, wx, by - 3, 4.2, '#2a2630', -0.3, -0.6, 0.15);
    sphere(x, wx, by - 3, 2.1, '#b8b8c8', -0.4, -0.5, 0.5);
  }
  // headlight
  sphere(x, x0 + BUS_W - 1, y0 + 16, 1.3, '#fff4b0', -0.3, -0.3, 0.6);
  glow(x, x0 + BUS_W + 1, y0 + 16, 9, '#fff0a0', 0.45);
}

// HD people: the pixel poses, cached and rounded off with a soft light (see hdSprite).
const PERSON_LIT = { light: 0.22, shadow: 0.3, rim: '#fff0c8', lx: 0.75, ly: 0.15 };
export function personHd(x: Ctx, p: Person, px: number, py: number, frame: number, face: -1 | 1): void {
  const spr = spriteOf(`bp|${idOf(p)}|${frame}|${face}`, 26, 42, (c) => drawPerson(c, p, 5, 8, frame, false, { face, shadow: false }));
  softShadow(x, px + 7, py + 30, 8, 1.8, 0.4);
  drawHd(x, spr, Math.round(px) - 5, Math.round(py) - 8, false, PERSON_LIT);
}

// ---------- obstacles ----------
export type ObKind = 'dog' | 'stroller' | 'puddle' | 'ladder' | 'sprinkler' | 'sign' | 'hydrant' | 'branch' | 'pigeons' | 'coffee';

export function drawDog(x: Ctx, sx: number, t: number, owner: Person): void {
  const leg = Math.floor(t * 10) % 2;
  // owner in the back lane, holding the leash
  personHd(x, owner, sx + 16, BACK - 30, Math.floor(t * 4) % 2, 1);
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
  personHd(x, parent, sx + 14, BACK - 30, Math.floor(t * 4) % 2, 1);
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
  personHd(x, worker, sx + 30, BACK - 30, Math.floor(t * 4) % 2, -1);
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

// HD places only scenes visit: a car dealership showroom, a house (an open house,
// later your own living room), a mortgage office, an exam hall, an interview room,
// and the nicer apartment the next phase moves you into.
import type { RGB } from '../../px.ts';
import {
  baseboardHD,
  block,
  box,
  box3,
  carpetHD,
  cloudHD,
  coneHD,
  ell,
  fillRR,
  frameArt,
  glowHD,
  H,
  hash,
  hgrad,
  lgrad,
  lightPool,
  litH,
  litV,
  plantHD,
  poly,
  rgba,
  rgrad,
  roomAO,
  screenHD,
  seg,
  shade,
  signText,
  skyHD,
  softShadow,
  strokeRR,
  tileFloorHD,
  treeHD,
  vgrad,
  wainscotHD,
  wallHD,
  windowHD,
  woodFloorHD,
  W,
  type Ctx,
} from '../kit.ts';
import { drawPersonHD } from '../person.ts';
import { extra } from './civic.ts';
import { bookRowHD, carHD, clockHD, deskHD, fixture, shelfHD, view } from './common.ts';
import { skylineHD } from './town.ts';
import type { HDSpec } from './types.ts';

const MOON: RGB = [0.7, 0.78, 1.05];
const WARM: RGB = [1.16, 0.98, 0.74];

// Clouds drifting across a band of sky, clipped to it.
function driftClouds(x: Ctx, t: number, px: number, py: number, w: number, h: number, seed: number, n = 3): void {
  x.save();
  x.beginPath();
  x.rect(px, py, w, h);
  x.clip();
  for (let k = 0; k < n; k++) {
    const cw = 12 + hash(seed + k) * 12;
    const cx = px - cw + ((t * (0.9 + k * 0.4) + hash(seed * 3 + k) * (w + cw * 2)) % (w + cw * 2));
    cloudHD(x, cx, py + 4 + hash(seed + k * 5) * (h * 0.5), cw);
  }
  x.restore();
}

// A little house seen from the street (window views, the model on the loan desk).
function houseIcon(x: Ctx, cx: number, base: number, w: number, wall: string, roof: string): void {
  const h = w * 0.55;
  softShadow(x, cx, base, w * 0.6, w * 0.08, 0.3);
  block(x, cx - w / 2, base - h, w, h, wall, 0.3, { edge: false });
  poly(x, [cx - w * 0.62, base - h + 0.2, cx, base - h - w * 0.42, cx + w * 0.62, base - h + 0.2], lgrad(x, cx - w * 0.6, 0, cx + w * 0.6, 0, [[0, shade(roof, 1.25)], [0.5, roof], [1, shade(roof, 0.7)]]));
  box(x, cx - w * 0.1, base - h * 0.62, w * 0.2, h * 0.62, shade(wall, 0.55));
  for (const wx of [-0.32, 0.22]) box(x, cx + wx * w, base - h * 0.75, w * 0.12, w * 0.12, '#ffe9a8');
}

// ---------- car dealership showroom ----------
function showroom(): HDSpec {
  const GLASS_X1 = 146;
  return {
    player: 46,
    npc: 140,
    floor: 98,
    horizon: 66,
    fog: 0.03,
    fogColor: '#e8eef6',
    bloom: 0.8,
    windows: [[44, 12, 40, 50]],
    bg: (x) => {
      // outside the glass: sky, a tree line, the lot in rows
      skyHD(x, 10, 66, ['#5a9ae8', '#8ac0f4', '#d8ecfa']);
      for (let i = 0; i < 16; i++) treeHD(x, 4 + i * 10 + hash(i) * 4, 50, 10 + hash(i * 3) * 5, 0, i % 2 ? '#4a8a4a' : '#3c7a40', 0);
      x.fillStyle = vgrad(x, 30, 50, ['rgba(216,236,250,0)', 'rgba(216,236,250,0.5)']);
      x.fillRect(0, 30, W, 20);
      x.fillStyle = vgrad(x, 49, 66, ['#9a9aa4', '#b4b4bc']);
      x.fillRect(0, 49, W, 17);
      const cols = ['#eeeae0', '#3f7fd8', '#2a2a33', '#c8ccd4', '#3caa6a', '#e0503c', '#6a5a8a'];
      for (let i = 0; i < 9; i++) carHD(x, -4 + i * 17, 50.5, cols[i % cols.length], i % 2 === 0, 14);
      for (let i = 0; i < 8; i++) carHD(x, 4 + i * 19, 55, cols[(i + 3) % cols.length], i % 3 === 0, 17);
      for (const fx of [20, 100]) {
        seg(x, fx, 22, fx, 50, '#b8bcc4', 0.5);
        poly(x, [fx, 22, fx + 8, 23, fx + 8, 28, fx, 27], lgrad(x, fx, 0, fx + 8, 0, [[0, '#3f7fd8'], [1, '#2a5aa8']]));
      }
      // ceiling with track lights
      x.fillStyle = vgrad(x, 0, 10, ['#3a3f4c', '#5a606e']);
      x.fillRect(0, 0, W, 10);
      box(x, 0, 9.4, W, 0.6, '#2a2e38');
      seg(x, 10, 5, 182, 5, '#1e222c', 0.8);
      // the solid accent wall on the right
      x.fillStyle = hgrad(x, GLASS_X1, W, ['#1f3266', '#2b4486', '#1c2c5c']);
      x.fillRect(GLASS_X1, 10, W - GLASS_X1, 56);
      x.fillStyle = vgrad(x, 10, 66, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']);
      x.fillRect(GLASS_X1, 10, W - GLASS_X1, 56);
      // brand mark: a swoosh and the name
      x.beginPath();
      x.moveTo(156, 26);
      x.quadraticCurveTo(169, 15, 184, 21);
      x.quadraticCurveTo(170, 18.6, 158, 26.4);
      x.closePath();
      x.fillStyle = lgrad(x, 156, 0, 184, 0, [[0, '#9ad0ff'], [1, '#ffffff']]);
      x.fill();
      signText(x, 'AURORA', 169, 31, 6.2, '#ffffff');
      signText(x, 'MOTORS', 169, 37, 3.2, '#bcd4ff');
      glowHD(x, 169, 30, 18, '#9ad0ff', 0.14, 10);
      // glossy floor
      tileFloorHD(x, 66, '#eef0f4', '#d8dce4', 18, { sheen: 0.45, horizon: 36 });
      // window reflections running down the polished floor
      x.save();
      x.globalCompositeOperation = 'screen';
      for (let px = 0; px < GLASS_X1; px += 36) {
        poly(x, [px + 3, 66, px + 31, 66, px + 36, 96, px - 2, 96], vgrad(x, 66, 96, ['rgba(200,228,255,0.32)', 'rgba(200,228,255,0)']));
      }
      x.restore();
      x.fillStyle = vgrad(x, 66, 72, ['rgba(14,8,26,0.28)', 'rgba(14,8,26,0)']);
      x.fillRect(0, 66, W, 6);
    },
    anim: (x, t) => driftClouds(x, t, 0, 10, GLASS_X1, 22, 81),
    mid: (x) => {
      // curtain-wall mullions and glass sheen
      for (let px = 0; px <= GLASS_X1; px += 36) fillRR(x, px - 1, 10, 2.2, 56, 0.4, litH(x, px - 1, px + 1.2, '#4a505c'));
      fillRR(x, 0, 64.6, GLASS_X1, 1.8, 0.3, litV(x, 64.6, 66.4, '#4a505c'));
      x.save();
      x.globalCompositeOperation = 'screen';
      for (let px = 0; px < GLASS_X1; px += 36) {
        poly(x, [px + 6, 66, px + 13, 66, px + 26, 10, px + 19, 10], 'rgba(255,255,255,0.1)');
        poly(x, [px + 16, 66, px + 18, 66, px + 31, 10, px + 29, 10], 'rgba(255,255,255,0.07)');
      }
      x.restore();
      // price stand
      softShadow(x, 20, 80, 7, 1.4, 0.4);
      fillRR(x, 19.2, 62, 1.6, 18, 0.5, litH(x, 19.2, 20.8, '#8a909c'));
      ell(x, 20, 80, 5, 1, '#5a606e');
      fillRR(x, 9, 47, 22, 16, 1, vgrad(x, 47, 63, ['#ffffff', '#eef0f4']));
      strokeRR(x, 9, 47, 22, 16, 1, '#c8ccd4', 0.4);
      fillRR(x, 9, 47, 22, 4.4, 1, '#2b4486');
      signText(x, '2026 AURORA', 20, 49.3, 2.6, '#ffffff');
      signText(x, '$27,400', 20, 55, 4.6, '#1c1424');
      signText(x, 'from 5.9% APR*', 20, 60, 2.4, '#c0392b');
      // the hero car on a turntable, reflected in the floor
      ell(x, 98, 82, 42, 6, rgrad(x, 98, 80, 44, [[0, '#f4f6fa'], [0.8, '#c8ccd6'], [1, '#8a909c']]));
      ell(x, 98, 82.6, 42, 6, 'rgba(14,8,26,0.08)');
      ell(x, 98, 81.4, 40, 5, rgrad(x, 92, 80, 40, [[0, '#ffffff'], [1, '#dde1e8']]));
      x.save();
      x.beginPath();
      x.rect(50, 81, 100, 14);
      x.clip();
      x.translate(0, 162);
      x.scale(1, -1);
      x.globalAlpha = 0.16;
      carHD(x, 66, 54.5, '#c0392b', false, 64);
      x.restore();
      x.fillStyle = vgrad(x, 81, 95, ['rgba(238,240,244,0)', 'rgba(238,240,244,0.85)']);
      x.fillRect(50, 81, 100, 14);
      carHD(x, 66, 54.5, '#c0392b', false, 64);
      // sales desk against the accent wall
      deskHD(x, 152, 70, 38, '#f2f2f4', '#c8ccd4', 14, false);
      screenHD(x, 170, 59, 12, 8, '#3f7fd8');
      fillRR(x, 175, 67, 2, 3, 0.3, '#3a3a44');
      for (let k = 0; k < 4; k++) fillRR(x, 156 + k * 2.2, 66.6 - k * 0.6, 7, 0.9, 0.3, k % 2 ? '#e8e8ec' : '#ffffff');
      plantHD(x, 182, 50);
    },
    anim2: (x, t) => {
      // spotlights on the car and a slow glint along its body
      coneHD(x, 80, 5, 58, 2.4, 20, '#fff6e0', 0.16);
      coneHD(x, 116, 5, 58, 2.4, 20, '#fff6e0', 0.16);
      for (const sx of [80, 116]) {
        ell(x, sx, 6.2, 1.6, 1, '#fffef4');
        glowHD(x, sx, 6.5, 6, '#fff8e0', 0.45, 3);
      }
      const g = (t * 0.25) % 1.6;
      if (g < 1) {
        const gx = 70 + g * 58;
        glowHD(x, gx, 63.6 - Math.sin(g * Math.PI) * 4.5, 6, '#ffffff', 0.5 * Math.sin(g * Math.PI), 2.4);
      }
      glowHD(x, 176, 63, 10, '#6aa0ff', 0.12);
    },
  };
}

// ---------- a house: the open house, then your own living room ----------
function house({ night }: { night: boolean }): HDSpec {
  return {
    player: 54,
    npc: 126,
    floor: 98,
    horizon: 78,
    fog: 0.04,
    fogColor: night ? '#4a4a80' : '#f2e8d6',
    bloom: night ? 1.1 : 0.7,
    windows: [[18, 14, 46, 36]],
    bg: (x) => {
      wallHD(x, '#d6d4bc', 80, (c) => {
        for (let i = 0; i < W; i += 3) box(c, i, 0, 0.3, 80, rgba('#c4c2a8', 0.25));
      });
      // crown molding and a picture rail
      x.fillStyle = vgrad(x, 0, 4, ['#ffffff', '#ece8dc', '#c8c2b0']);
      x.fillRect(0, 0, W, 4);
      box(x, 0, 4, W, 0.6, rgba('#8a8470', 0.5));
      wainscotHD(x, 56, 76, '#f2f0e8', 16);
      baseboardHD(x, 80, '#e8e4d8', 4.4);
      woodFloorHD(x, 80, '#b07a4a', { sheen: 0.24 });
      // a doorway into the kitchen
      fillRR(x, -2, 12, 14, 68, 0.6, '#f4f2ea');
      x.fillStyle = vgrad(x, 15, 80, night ? ['#3a3048', '#2a2236'] : ['#f6ead0', '#d8c4a0']);
      x.fillRect(0, 15, 9.6, 65);
      box(x, 0, 52, 9.6, 2, night ? '#4a3a40' : '#a87a4a');
      fillRR(x, 0, 54, 9.6, 26, 0.4, litV(x, 54, 80, night ? '#3a2e34' : '#c8a070'));
      seg(x, 4, 15, 4, 26, '#3a3a44', 0.35);
      ell(x, 4, 27.4, 2.6, 1.6, night ? '#ffd890' : '#f2e2b8');
      roomAO(x, 80, 0.2);
      windowHD(x, 18, 14, 46, 36, '#ffffff');
      // fireplace with a mantel and art above it
      softShadow(x, 152, 80, 26, 2.4, 0.4);
      fillRR(x, 128, 42, 48, 38, 0.6, vgrad(x, 42, 80, ['#f4f2ec', '#e2ded2', '#cfcabb']));
      for (let j = 46; j < 78; j += 4) for (let i = 128 + ((j / 4) % 2) * 3; i < 176; i += 6) strokeRR(x, i, j, 6, 4, 0.2, rgba('#b8b2a2', 0.6), 0.25);
      fillRR(x, 124, 39.6, 56, 3.4, 0.6, litV(x, 39.6, 43, '#8a5a34'));
      shadowUnder(x, 124, 43, 56);
      fillRR(x, 140, 56, 24, 22, 2, vgrad(x, 56, 78, ['#2a1c18', '#1a100c']));
      fillRR(x, 138, 77, 28, 3, 0.6, litV(x, 77, 80, '#5a5a62'));
      frameArt(x, 136, 12, 32, 22, '#c9a032', (c) => {
        c.fillStyle = vgrad(c, 12, 34, ['#f2c88a', '#e89a6a', '#8a6aa0']);
        c.fillRect(136, 12, 32, 22);
        ell(c, 152, 27, 6, 6, '#fff0b8');
        poly(c, [136, 34, 146, 26, 152, 29, 160, 24, 168, 34], '#5a4a7a');
      });
      // mantel things: candles, a vase, a clock
      for (const [cx, h] of [
        [130, 5],
        [133, 3.6],
      ] as const)
        fillRR(x, cx, 39.6 - h, 1.8, h, 0.6, litH(x, cx, cx + 1.8, '#f4ecd8'));
      fillRR(x, 168, 33, 5, 6.6, 2, rgrad(x, 169.5, 35, 5, [[0, '#7ac0d0'], [1, '#2a7a8a']]));
      for (let k = 0; k < 3; k++) seg(x, 170.5, 33, 168 + k * 2.5, 28 - k, '#3c8a4a', 0.4);
      // armchair and side table with a lamp
      softShadow(x, 92, 82, 14, 2, 0.4);
      fillRR(x, 82, 58, 20, 14, 4, vgrad(x, 58, 72, ['#d88a5a', '#b8643a']));
      fillRR(x, 80, 66, 24, 12, 3, vgrad(x, 66, 78, ['#e8986a', '#c06a40', '#9a4a2a']));
      for (const ax of [79, 99]) fillRR(x, ax, 64, 6, 13, 2.6, litH(x, ax, ax + 6, '#c06a40'));
      for (const fx of [82, 100]) fillRR(x, fx, 77, 2, 3, 0.4, '#4a3020');
      softShadow(x, 112, 82, 6, 1.2, 0.4);
      fillRR(x, 106, 66, 12, 2.4, 0.6, litV(x, 66, 68.4, '#8a5a34'));
      for (const lx of [107, 116]) fillRR(x, lx, 68, 1.4, 13, 0.4, '#6a4426');
      fillRR(x, 110.6, 56, 2.6, 10, 1, rgrad(x, 111.5, 58, 4, [[0, '#f2e2c0'], [1, '#c8b080']]));
      poly(x, [107, 48, 116, 48, 118, 56, 105, 56], lgrad(x, 105, 0, 118, 0, [[0, '#fff2d0'], [0.5, night ? '#ffe8b0' : '#f4e4c0'], [1, '#c8b48a']]));
      // area rug
      poly(x, [40, 84, 160, 84, 178, 100, 22, 100], rgba('#3a4a6a', 0.85));
      poly(x, [44, 85.4, 156, 85.4, 172, 98.6, 28, 98.6], rgba('#d8c8a0', 0.25));
      poly(x, [48, 86.6, 152, 86.6, 166, 97.4, 34, 97.4], rgba('#3a4a6a', 0.9));
      // staircase going up on the right
      fillRR(x, 178, 8, 14, 72, 0, vgrad(x, 8, 80, ['#e8e4d8', '#d4cfc0']));
      for (let k = 0; k < 9; k++) {
        const sy = 76 - k * 7.6;
        box(x, 178 + (k * 1.2), sy, W - 178, 1.2, '#9a6a44');
        box(x, 178 + (k * 1.2), sy + 1.2, W - 178, 0.6, rgba('#000000', 0.15));
      }
      seg(x, 176, 64, 192, 8, '#6a4426', 1.1);
      for (let k = 0; k < 8; k++) seg(x, 177.5 + k * 2, 64 - k * 7, 177.5 + k * 2, 76 - k * 7.6, '#f4f2ea', 0.5);
    },
    anim: (x, t) => {
      view(x, t, 18, 14, 46, 36, night, {
        seed: 27,
        moon: [56, 20],
        scenery: (c) => {
          c.fillStyle = vgrad(c, 38, 50, night ? ['#1e2a3a', '#16202c'] : ['#7ac06a', '#4a9a4a']);
          c.fillRect(18, 38, 46, 12);
          for (let i = 18; i < 64; i += 3) box(c, i, 36, 1.6, 6, night ? '#3a3a4a' : '#f4f2ea');
          box(c, 18, 37.4, 46, 0.8, night ? '#3a3a4a' : '#f4f2ea');
          treeHD(c, 30, 40, 18, t, night ? '#1e3a2a' : '#3c8a3a', 0.4);
          treeHD(c, 54, 40, 12, t + 1, night ? '#1a3226' : '#4caa4a', 0.4);
        },
      });
      if (night) {
        // fire: flickering flames and a warm wash
        const f = Math.sin(t * 9) * 0.5 + Math.sin(t * 13.7) * 0.5;
        for (let k = 0; k < 5; k++) {
          const fx = 144 + k * 4;
          const fh = 7 + Math.sin(t * (6 + k) + k * 2) * 2.4;
          poly(x, [fx - 2.2, 74, fx + Math.sin(t * 5 + k) * 0.8, 74 - fh, fx + 2.2, 74], lgrad(x, 0, 74 - fh, 0, 74, [[0, 'rgba(255,220,120,0.2)'], [0.4, '#ffb040'], [1, '#e0502a']]));
        }
        fillRR(x, 143, 73, 18, 2.4, 1, '#5a3420');
        glowHD(x, 152, 70, 26 + f * 2, '#ffa050', 0.32, 14);
        lightPool(x, 152, 88, 34, 6, '#ffb060', 0.3);
        coneHD(x, 111.5, 56, 80, 12, 30, '#ffe0a0', 0.12);
      } else {
        fillRR(x, 143, 72, 18, 2.4, 1, litV(x, 72, 74.4, '#7a5030'));
        fillRR(x, 145, 69.6, 14, 2.4, 1, litV(x, 69.6, 72, '#8a5a34'));
      }
    },
    lights: night
      ? (t) => [
          { x: 152, y: 68, r: 64 + Math.sin(t * 9) * 2, ry: 44, c: [1.28, 0.9, 0.62] },
          { x: 111, y: 54, r: 36, ry: 32, c: [1.04, 0.92, 0.74] },
          { x: 40, y: 30, r: 28, c: MOON },
          { x: 5, y: 30, r: 18, c: [1.05, 0.95, 0.8] },
        ]
      : undefined,
  };
}

function shadowUnder(x: Ctx, px: number, py: number, w: number): void {
  x.fillStyle = vgrad(x, py, py + 3, ['rgba(14,8,26,0.3)', 'rgba(14,8,26,0)']);
  x.fillRect(px, py, w, 3);
}

// ---------- mortgage / loan office ----------
function mortgage(): HDSpec {
  return {
    player: 52,
    npc: 134,
    floor: 98,
    horizon: 80,
    fog: 0.04,
    fogColor: '#e8dcc8',
    bloom: 0.7,
    windows: [[12, 12, 38, 32]],
    bg: (x) => {
      wallHD(x, '#d8ccb4', 80, (c) => {
        for (let i = 0; i < W; i += 6) box(c, i, 0, 2.4, 52, rgba('#cbbfa4', 0.4));
      });
      wainscotHD(x, 52, 76, '#7a4a2a', 12);
      baseboardHD(x, 80, '#4a2a18');
      carpetHD(x, 80, '#3a4a6a', '#34425e');
      windowHD(x, 12, 12, 38, 32, '#f2ece0', false);
      // diplomas and a license
      for (const [fx, w] of [
        [60, 16],
        [80, 14],
      ] as const)
        frameArt(x, fx, 14, w, 12, '#2a2a33', (c) => {
          c.fillStyle = '#fbf7ec';
          c.fillRect(fx, 14, w, 12);
          for (let k = 0; k < 3; k++) box(c, fx + 3, 17.6 + k * 2.2, w - 6 - (k % 2) * 3, 0.6, rgba('#5a4a3a', 0.6));
          ell(c, fx + w - 3.6, 23, 1.4, 1.4, '#c9a032');
        });
      // brass plaque
      fillRR(x, 60, 30, 34, 7, 0.8, lgrad(x, 60, 30, 94, 37, [[0, '#f2d888'], [0.5, '#c9a032'], [1, '#8a6a1a']]));
      signText(x, 'HOME LOANS', 77, 33.6, 3.6, '#3a2a10');
      // rate board
      fillRR(x, 99.5, 11.5, 34, 25, 1, litV(x, 11.5, 36.5, '#3a3a44'));
      fillRR(x, 101, 13, 31, 22, 0.6, vgrad(x, 13, 35, ['#1e2a4a', '#141c34']));
      signText(x, 'TODAY’S RATES', 116.5, 16.4, 2.8, '#9ad0ff');
      signText(x, '30-yr fixed', 103, 22, 2.6, '#e8eef8', 'left', 400);
      signText(x, '6.00%', 130, 22, 3, '#7fe08a', 'right');
      signText(x, '15-yr fixed', 103, 27, 2.6, '#e8eef8', 'left', 400);
      signText(x, '5.25%', 130, 27, 3, '#7fe08a', 'right');
      signText(x, 'FHA 3.5% down', 103, 32, 2.4, '#c8d4e8', 'left', 400);
      // bookcase with binders
      softShadow(x, 172, 80, 18, 2, 0.4);
      fillRR(x, 154, 14, 36, 66, 0.8, litH(x, 154, 190, '#5a3018'));
      fillRR(x, 156, 16, 32, 62, 0.4, '#2a160c');
      for (let k = 0; k < 4; k++) {
        const sy = 30 + k * 15;
        if (k < 3) bookRowHD(x, 157, sy, 30, 40 + k * 9, 12);
        else for (let b = 0; b < 6; b++) fillRR(x, 157.5 + b * 5, sy - 11, 4.4, 11, 0.4, litH(x, 157.5 + b * 5, 162 + b * 5, ['#2b4486', '#c0392b', '#2b4486', '#3c8a4a', '#2b4486', '#d8a030'][b]));
        shelfHD(x, 156, sy, 32, '#6a3a1e');
      }
      // guest chair
      softShadow(x, 26, 82, 10, 1.8, 0.4);
      fillRR(x, 18, 56, 16, 14, 2, vgrad(x, 56, 70, ['#7a3a2a', '#5a2418']));
      fillRR(x, 16, 68, 20, 6, 2, vgrad(x, 68, 74, ['#8a4432', '#5a2418']));
      for (const lx of [18, 32]) fillRR(x, lx, 73, 1.6, 8, 0.4, '#2a160c');
      for (let k = 0; k < 5; k++) ell(x, 19.6 + k * 3.2, 57.6, 0.4, 0.4, '#c9a032');
    },
    anim: (x, t) => {
      view(x, t, 12, 12, 38, 32, false, {
        seed: 19,
        scenery: (c) => {
          c.fillStyle = vgrad(c, 34, 44, ['#8ac07a', '#5a9a5a']);
          c.fillRect(12, 34, 38, 10);
          houseIcon(c, 20, 38, 9, '#f2e8d0', '#7a4a3a');
          houseIcon(c, 33, 37, 8, '#cfe0f0', '#4a5a7a');
          houseIcon(c, 45, 38, 9, '#f4d8b0', '#8a3a2a');
        },
      });
      // half-open blinds
      for (let k = 0; k < 6; k++) fillRR(x, 11.5, 11.5 + k * 1.7, 39, 1.4, 0.5, vgrad(x, 11.5 + k * 1.7, 12.9 + k * 1.7, ['#ffffff', '#d8d0c0']));
      seg(x, 48, 12, 48, 26, '#c8c0b0', 0.3);
      if (Math.floor(t * 0.7) % 4 !== 0) ell(x, 129, 22, 0.5, 0.5, '#7fe08a');
    },
    fg: (x) => {
      deskHD(x, 96, 86, 84, '#7a4a2a', '#5a3018', 22, false);
      // leather blotter, papers, pen
      fillRR(x, 112, 83.4, 30, 2.4, 0.4, '#2a3a2a');
      fillRR(x, 116, 83, 14, 2.2, 0.2, vgrad(x, 83, 85.2, ['#ffffff', '#e8e0cc']));
      seg(x, 132, 84.6, 139, 83.2, '#1c1424', 0.5);
      // model house
      houseIcon(x, 104, 85.6, 10, '#f4ecd8', '#c0392b');
      // banker's lamp
      fillRR(x, 162.5, 77, 1.4, 7, 0.4, '#c9a032');
      ell(x, 163.2, 84.6, 4, 0.9, litH(x, 159, 167, '#c9a032'));
      fillRR(x, 156, 73.6, 15, 4.4, 2, vgrad(x, 73.6, 78, ['#4aaa6a', '#1f6a3a', '#124a26']));
      ell(x, 163.5, 78, 6.6, 0.7, '#fff6d0');
      // name plate
      fillRR(x, 146, 81.4, 11, 3, 0.4, lgrad(x, 146, 0, 157, 0, [[0, '#3a2a1a'], [1, '#1c140c']]));
      signText(x, 'LOANS', 151.5, 83, 1.9, '#f2d888');
      // calculator
      fillRR(x, 172, 82.6, 6, 3, 0.5, '#3a3a44');
      box(x, 172.6, 83, 4.8, 0.9, '#9ad08a');
    },
    fgAnim: (x) => {
      glowHD(x, 163.5, 79, 10, '#fff0c0', 0.25, 5);
      lightPool(x, 163.5, 86, 14, 2.4, '#fff0c0', 0.3);
    },
  };
}

// ---------- exam hall (a tiered lecture hall, seen from the front) ----------
const STUDENTS = [
  extra(0, 1, 1, '#3f7fd8'),
  extra(3, 0, 3, '#e0503c'),
  extra(1, 3, 5, '#3caa6a'),
  extra(4, 5, 6, '#f2b632'),
  extra(2, 4, 8, '#9a5ad0'),
  extra(5, 0, 4, '#2fb5b0'),
  extra(1, 2, 2, '#ef7fae'),
  extra(2, 1, 0, '#6a7a90'),
];
function lecture(): HDSpec {
  return {
    player: 46,
    npc: 136,
    floor: 98,
    horizon: 70,
    fog: 0.05,
    fogColor: '#e2d8c4',
    bloom: 0.6,
    windows: [
      [6, 6, 22, 18],
      [164, 6, 22, 18],
    ],
    bg: (x) => {
      // back wall with acoustic slats
      x.fillStyle = vgrad(x, 0, 40, ['#9a7a5a', '#b8946a']);
      x.fillRect(0, 0, W, 40);
      for (let i = 0; i < W; i += 2.4) box(x, i, 0, 1.2, 40, rgba(i % 4.8 < 2.4 ? '#ffffff' : '#000000', 0.06));
      for (const wx of [6, 164]) windowHD(x, wx, 6, 22, 18, '#e8e0d0');
      // EXIT sign
      fillRR(x, 140, 4, 14, 5, 0.6, '#1e2a22');
      signText(x, 'EXIT', 147, 6.6, 3.4, '#5aff8a');
      glowHD(x, 147, 6.5, 8, '#5aff8a', 0.18, 4);
      // three tiers of long desks, each row a step higher, seated students between them
      const rows = [
        { y: 40, s: 0.62, seats: [16, 40, 64, 112, 136, 160], riser: '#5a5a6e' },
        { y: 56, s: 0.72, seats: [26, 58, 90, 122, 154], riser: '#4e4e62' },
        { y: 72, s: 0.84, seats: [12, 44, 74, 106], riser: '#424256' },
      ];
      rows.forEach((r, ri) => {
        // the riser floor this row sits on
        x.fillStyle = vgrad(x, r.y - 16, r.y + 10, [shade(r.riser, 1.1), r.riser]);
        x.fillRect(0, r.y - 2, W, 12);
        // a row of upholstered seat backs, then the students in them
        for (let sx = 6; sx < W; sx += 16 * r.s + 4) {
          fillRR(x, sx - 5 * r.s, r.y - 13 * r.s, 10 * r.s, 12 * r.s, 2 * r.s, vgrad(x, r.y - 13 * r.s, r.y, ['#3a5aa8', '#22397a']));
          box(x, sx - 4 * r.s, r.y - 12.4 * r.s, 8 * r.s, 0.6 * r.s, rgba('#ffffff', 0.16));
        }
        r.seats.forEach((sx, k) => {
          const p = STUDENTS[(ri * 3 + k) % STUDENTS.length];
          drawPersonHD(x, p, sx, r.y + 2.5 * r.s, { t: k * 1.7, seated: true, shadow: false, scale: r.s, face: k % 2 ? 1 : -1 });
        });
        // desk: a long lit top and a modesty panel
        poly(x, [0, r.y - 1.6, W, r.y - 1.6, W, r.y, 0, r.y], lgrad(x, 0, r.y - 1.6, 0, r.y, [[0, '#e8d0a8'], [1, '#c8a878']]));
        x.fillStyle = vgrad(x, r.y, r.y + 9, ['#a8845a', '#7a5a3a']);
        x.fillRect(0, r.y, W, 9);
        for (let i = 8; i < W; i += 32) box(x, i, r.y, 0.5, 9, rgba('#4a3420', 0.5));
        box(x, 0, r.y + 9, W, 1.2, rgba('#14080a', 0.3));
        // exam papers and pencils in front of each student
        r.seats.forEach((sx, k) => {
          poly(x, [sx - 3.4 * r.s, r.y - 0.4, sx + 3.4 * r.s, r.y - 0.4, sx + 3 * r.s, r.y - 1.5, sx - 3 * r.s, r.y - 1.5], '#fbf7ec');
          seg(x, sx + (k % 2 ? 2 : -2) * r.s, r.y - 1, sx + (k % 2 ? 4.4 : -4.4) * r.s, r.y - 3, '#f2c230', 0.5 * r.s);
        });
      });
      // the front well: polished floor
      x.fillStyle = vgrad(x, 79, H, ['#b89a74', '#d0b48a', '#dcc29a']);
      x.fillRect(0, 79, W, H - 79);
      woodFloorHD(x, 80, '#c8a478', { sheen: 0.22 });
      // proctor's table
      softShadow(x, 166, 84, 22, 2, 0.4);
      deskHD(x, 146, 72, 42, '#e8e4dc', '#9aa0aa', 12, true);
      for (let k = 0; k < 4; k++) fillRR(x, 150 + k * 0.4, 69.6 - k * 0.7, 12, 0.8, 0.2, k % 2 ? '#e8e2d0' : '#ffffff');
      fillRR(x, 176, 66, 7, 4.6, 0.8, litV(x, 66, 70.6, '#3a3a44'));
    },
    anim: (x, t) => {
      for (const wx of [6, 164]) view(x, t, wx, 6, 22, 18, false, { seed: wx });
      clockHD(x, 96, 13, 6.4, t * 6, '#3a3a44');
      // proctor's timer
      const left = 89 - Math.floor(t / 4);
      signText(x, `${Math.max(1, left)}:00`, 179.5, 68.4, 2.4, '#ff6a5a');
      // a few pencils scribbling
      for (const [px, py, s] of [
        [40, 39.4, 0.62],
        [90, 55.4, 0.72],
        [106, 71.4, 0.84],
      ] as const) {
        const w = Math.sin(t * 14 + px) * 0.8 * s;
        seg(x, px + w, py, px + 2.4 * s + w, py - 2 * s, '#f2c230', 0.55 * s);
      }
    },
    fg: (x) => {
      fixtureRow(x);
    },
  };
}
function fixtureRow(x: Ctx): void {
  // pendant light bars hanging into the frame
  for (const cx of [48, 144]) {
    seg(x, cx - 10, 0, cx - 10, 3, '#3a3a44', 0.3);
    seg(x, cx + 10, 0, cx + 10, 3, '#3a3a44', 0.3);
    fixture(x, cx, 4, 26);
  }
}

// ---------- interview room ----------
function interview(): HDSpec {
  return {
    player: 46,
    npc: 132,
    floor: 98,
    horizon: 80,
    fog: 0.04,
    fogColor: '#dfe6ee',
    bloom: 0.7,
    windows: [[150, 10, 36, 40]],
    bg: (x) => {
      // the open office beyond a glass wall
      x.fillStyle = vgrad(x, 0, 80, ['#cfd8e2', '#e8edf2', '#c8d0da']);
      x.fillRect(0, 0, 124, 80);
      for (let i = 0; i < 6; i++) {
        fillRR(x, 4 + i * 22, 3, 14, 1.6, 0.6, '#ffffff');
        glowHD(x, 11 + i * 22, 4, 10, '#fffbe8', 0.14, 4);
      }
      for (let i = 0; i < 5; i++) {
        const dx = 6 + i * 25;
        fillRR(x, dx, 52, 20, 2, 0.4, '#f2f0ea');
        fillRR(x, dx + 2, 54, 1.4, 10, 0.4, '#9aa0aa');
        fillRR(x, dx + 16.6, 54, 1.4, 10, 0.4, '#9aa0aa');
        screenHD(x, dx + 6, 43, 9, 6, '#5ab0e0', '#2a2a33');
        if (i % 2 === 0) {
          fillRR(x, dx, 50, 8, 9, 1.6, vgrad(x, 50, 59, ['#4a505e', '#2a2e38']));
          drawPersonHD(x, extra(i % 6, (i * 3) % 7, i % 9, ['#e0503c', '#3caa6a', '#f2b632'][i % 3]), dx + 4, 66, { seated: true, shadow: false, scale: 0.72, face: 1 });
          seg(x, dx + 4, 59, dx + 4, 66, '#3a3a44', 0.6);
        }
      }
      x.fillStyle = 'rgba(214,224,236,0.32)';
      x.fillRect(0, 0, 124, 80);
      // glass mullions, frosted band with the company name
      for (const gx of [0, 41, 82, 123]) fillRR(x, gx - 0.8, 0, 1.8, 80, 0.3, litH(x, gx - 0.8, gx + 1, '#8a929e'));
      x.fillStyle = 'rgba(250,252,255,0.78)';
      x.fillRect(0, 38, 124, 6);
      signText(x, 'BRIGHTPATH', 62, 41, 3.6, '#5a6a80');
      // the solid wall: warm wood slats, a window, a big screen
      x.fillStyle = hgrad(x, 124, W, ['#8a5a34', '#a8744a', '#7a4a2a']);
      x.fillRect(124, 0, W - 124, 80);
      for (let i = 125; i < W; i += 2.2) box(x, i, 0, 1, 80, rgba(i % 4.4 < 2.2 ? '#ffffff' : '#000000', 0.08));
      roomAO(x, 80, 0.18);
      windowHD(x, 150, 10, 36, 40, '#3a3a44', false);
      fillRR(x, 128, 16, 18, 12, 0.8, litV(x, 16, 28, '#2a2a33'));
      fillRR(x, 129, 17, 16, 10, 0.4, vgrad(x, 17, 27, ['#2b4486', '#1c2c5c']));
      signText(x, 'Welcome!', 137, 21, 2.6, '#ffffff');
      seg(x, 132, 24.6, 142, 24.6, rgba('#9ad0ff', 0.7), 0.5);
      baseboardHD(x, 80, '#5a606e', 3);
      carpetHD(x, 80, '#6a707e', '#62687a');
      // chairs behind the table
      for (const cx of [110, 150]) {
        fillRR(x, cx - 7, 58, 14, 18, 3, vgrad(x, 58, 76, ['#3a3f4c', '#22262e']));
        ell(x, cx, 59.4, 5, 1, rgba('#ffffff', 0.12));
      }
      plantHD(x, 2, 54, true);
    },
    anim: (x, t) => {
      view(x, t, 150, 10, 36, 40, false, {
        seed: 52,
        scenery: (c) => skylineHD(c, 50, '#9aaac8', 23, '#e8f2ff', 0.75, true),
      });
      // someone strolls past behind the glass
      const span = 150;
      const px = ((t * 9) % span) - 12;
      if (px < 118) {
        x.save();
        x.beginPath();
        x.rect(0, 0, 123, 80);
        x.clip();
        x.globalAlpha = 0.55;
        drawPersonHD(x, extra(2, 0, 1, '#3f7fd8'), px, 74, { t, walk: t * 1.6, face: 1, shadow: false, scale: 0.78 });
        x.restore();
      }
    },
    fg: (x) => {
      // the table: a glossy white top with a soft reflection
      softShadow(x, 140, 99, 56, 3, 0.4);
      poly(x, [78, 84, W + 4, 84, W + 4, 88, 74, 88], lgrad(x, 0, 84, 0, 88, [[0, '#ffffff'], [1, '#e2e6ec']]));
      fillRR(x, 74, 88, W - 70, 2.2, 0.4, litV(x, 88, 90.2, '#c8ccd4'));
      fillRR(x, 82, 90, 3, 18, 0.4, litH(x, 82, 85, '#8a909c'));
      // resume, glasses of water, a laptop
      poly(x, [96, 86.4, 106, 86.4, 107, 84.4, 97.4, 84.4], '#fbf9f2');
      for (let k = 0; k < 3; k++) seg(x, 98.4, 85 + k * 0.5, 104 - k, 85 + k * 0.5, rgba('#5a5a6a', 0.6), 0.2);
      for (const gx of [114, 168]) {
        fillRR(x, gx, 80.6, 3, 5, 0.6, lgrad(x, gx, 0, gx + 3, 0, [[0, 'rgba(220,240,255,0.7)'], [1, 'rgba(160,200,230,0.8)']]));
        box(x, gx + 0.3, 82.4, 2.4, 0.4, rgba('#ffffff', 0.7));
      }
      poly(x, [142, 85.8, 162, 85.8, 160, 84, 144, 84], '#3a3f4c');
      poly(x, [144.4, 84, 159.6, 84, 158, 75, 146, 75], vgrad(x, 75, 84, ['#4a5060', '#2a2e38']));
      ell(x, 152, 79.4, 1.2, 1.2, rgba('#ffffff', 0.5));
    },
  };
}

// ---------- the next phase's apartment: exposed brick, big steel windows ----------
function loft({ night }: { night: boolean }): HDSpec {
  return {
    player: 60,
    npc: 128,
    floor: 98,
    horizon: 78,
    fog: 0.05,
    fogColor: night ? '#3a3a6a' : '#ecdcc8',
    bloom: night ? 1.1 : 0.7,
    windows: [[60, 8, 74, 50]],
    bg: (x) => {
      // brick wall
      x.fillStyle = vgrad(x, 0, 80, ['#9a4a34', '#b05a3e', '#8a3e2c']);
      x.fillRect(0, 0, W, 80);
      for (let j = 0; j < 80; j += 3) {
        box(x, 0, j, W, 0.45, rgba('#e8d8c4', 0.45));
        for (let i = (j / 3) % 2 ? 0 : 3.5; i < W; i += 7) {
          box(x, i, j + 0.45, 0.45, 2.55, rgba('#e8d8c4', 0.4));
          box(x, i + 0.6, j + 0.6, 6, 2.3, rgba(hash(i * 7 + j * 3) > 0.5 ? '#ffffff' : '#000000', 0.03 + hash(i + j * 11) * 0.06));
        }
      }
      x.fillStyle = rgrad(x, 96, 30, 130, [[0, 'rgba(255,240,220,0.12)'], [1, 'rgba(20,10,30,0.3)']]);
      x.fillRect(0, 0, W, 80);
      roomAO(x, 80, 0.25);
      // steel-framed window
      fillRR(x, 58, 6, 78, 54, 0.4, '#1e2026');
      // kitchen: open shelves, a counter, an island
      fillRR(x, 0, 52, 44, 28, 0.6, vgrad(x, 52, 80, ['#2a3a4a', '#1e2a36']));
      for (let k = 0; k < 3; k++) fillRR(x, 2 + k * 14, 56, 12, 22, 0.6, litH(x, 2 + k * 14, 14 + k * 14, '#34485c'));
      for (let k = 0; k < 3; k++) fillRR(x, 6.4 + k * 14, 63, 3.2, 0.8, 0.4, '#c9a032');
      fillRR(x, -1, 49.6, 46, 2.8, 0.4, litV(x, 49.6, 52.4, '#e8e4dc'));
      for (const sy of [22, 36]) {
        shelfHD(x, 2, sy, 38, '#6a4426');
        for (let k = 0; k < 5; k++) {
          const cx = 6 + k * 7;
          if (k % 2) fillRR(x, cx - 2, sy - 5, 4, 5, 0.8, litH(x, cx - 2, cx + 2, ['#f2efe6', '#3f7fd8', '#e0503c'][k % 3]));
          else ell(x, cx, sy - 1.8, 2.6, 1.8, litH(x, cx - 2.6, cx + 2.6, ['#f2efe6', '#2fb5b0', '#f2b632'][k % 3]));
        }
      }
      // a moving box or two (you just moved in)
      box3(x, 140, 70, 14, 10, 1.6, '#c9a36a', 0.5);
      box(x, 140, 72.4, 14, 1.4, rgba('#f0e2b8', 0.75));
      signText(x, 'BOOKS', 147, 76.4, 2.6, '#6a4a2a');
      woodFloorHD(x, 80, '#7a4e30', { sheen: 0.26 });
      // a patterned rug in perspective
      poly(x, [70, 85, 176, 85, 188, 101, 58, 101], vgrad(x, 85, 101, ['#8a3a3a', '#a84a40']));
      poly(x, [74, 86.4, 172, 86.4, 182, 99.6, 64, 99.6], rgba('#e8c890', 0.5));
      poly(x, [77, 87.4, 169, 87.4, 178, 98.6, 68, 98.6], vgrad(x, 87, 99, ['#7a2e34', '#983c3c']));
      for (let k = 0; k < 5; k++) {
        const u = 0.18 + k * 0.16;
        const cx = 77 + (169 - 77) * u + (u - 0.5) * 10;
        poly(x, [cx, 88.6, cx + 4, 93, cx, 97.4, cx - 4, 93], rgba('#e8c890', 0.55));
      }
    },
    anim: (x, t) => {
      view(x, t, 60, 8, 74, 50, night, {
        sky: ['#5a9ae8', '#9ac8f4', '#e4f0fa'],
        seed: 88,
        moon: [124, 16],
        scenery: (c) => skylineHD(c, 58, night ? '#262a4a' : '#8aa0c0', 61, night ? '#ffe090' : '#dce8f8', night ? 0.45 : 0.8, true, night),
      });
    },
    mid: (x) => {
      // window grid
      for (let k = 0; k <= 4; k++) fillRR(x, 59 + k * 18.5 - 0.8, 7, 1.6, 52, 0.3, '#2a2c34');
      for (let k = 0; k <= 3; k++) fillRR(x, 59, 7 + k * 17 - 0.6, 76, 1.3, 0.3, '#2a2c34');
      fillRR(x, 56, 59, 82, 2.4, 0.4, litV(x, 59, 61.4, '#4a4c54'));
      // kitchen island with stools
      softShadow(x, 24, 86, 26, 2.4, 0.45);
      box3(x, 2, 68, 44, 16, 2.4, '#e8e4dc', 0.6);
      fillRR(x, 2, 70.4, 44, 13.6, 0.4, vgrad(x, 70.4, 84, ['#3a5068', '#24364a']));
      for (const sx of [12, 30]) {
        fillRR(x, sx - 3.4, 74, 6.8, 1.8, 0.8, litV(x, 74, 75.8, '#c9a032'));
        seg(x, sx - 2, 76, sx - 2.6, 86, '#2a2a33', 0.5);
        seg(x, sx + 2, 76, sx + 2.6, 86, '#2a2a33', 0.5);
      }
      fillRR(x, 18, 63.6, 7, 3, 1.2, rgrad(x, 21, 64, 5, [[0, '#f2efe6'], [1, '#c8c2b0']]));
      for (let k = 0; k < 3; k++) ell(x, 20 + k * 1.6, 63.6, 1, 0.8, ['#e0503c', '#f2b632', '#3caa6a'][k]);
      // deep blue sofa with cushions
      softShadow(x, 170, 84, 26, 3, 0.5);
      fillRR(x, 150, 58, 44, 14, 3, vgrad(x, 58, 72, ['#3a5aa8', '#2a4486', '#1e3266']));
      for (let k = 0; k < 2; k++) fillRR(x, 152 + k * 20, 60, 19, 11, 2.4, rgrad(x, 158 + k * 20, 62, 12, [[0, '#4a6ac0'], [1, '#22397a']]));
      fillRR(x, 149, 70, 46, 9, 2.4, vgrad(x, 70, 79, ['#4a6ac0', '#2a4486', '#1a2a5a']));
      fillRR(x, 146, 62, 7, 18, 3, litH(x, 146, 153, '#2a4486'));
      for (const fx of [151, 190]) fillRR(x, fx, 79, 2, 3, 0.5, '#c9a032');
      x.save();
      x.translate(160, 64);
      x.rotate(-0.15);
      fillRR(x, -4, -3.6, 8, 7.2, 2, rgrad(x, -1, -1, 6, [[0, '#f2c26a'], [1, '#c8901e']]));
      x.restore();
      // arc floor lamp and a tall plant
      seg(x, 144, 86, 144, 50, '#2a2a33', 0.8);
      x.beginPath();
      x.moveTo(144, 50);
      x.quadraticCurveTo(144, 34, 158, 36);
      x.strokeStyle = '#2a2a33';
      x.lineWidth = 0.8;
      x.stroke();
      ell(x, 144, 86, 4, 0.9, '#2a2a33');
      poly(x, [154, 36, 162, 36, 164, 41, 152, 41], lgrad(x, 152, 0, 164, 0, [[0, '#f4f2ea'], [1, '#b8b2a2']]));
      plantHD(x, 124, 60, true);
    },
    anim2: (x) => {
      // pendants over the island
      for (const px of [12, 32]) {
        seg(x, px, 0, px, 30, '#2a2a33', 0.35);
        poly(x, [px - 3, 34, px + 3, 34, px + 1.4, 30, px - 1.4, 30], lgrad(x, px - 3, 0, px + 3, 0, [[0, '#d8a030'], [0.5, '#f2c862'], [1, '#a8781e']]));
        ell(x, px, 34, 3, 0.6, night ? '#fff4d0' : '#e8dcc0');
        if (night) {
          coneHD(x, px, 34, 70, 6, 22, '#ffe0a0', 0.14);
          glowHD(x, px, 34, 8, '#ffe0a0', 0.4, 4);
        }
      }
      if (night) {
        lightPool(x, 158, 88, 26, 5, '#ffd890', 0.25);
        glowHD(x, 158, 41, 10, '#ffe8b0', 0.4, 5);
      }
    },
    lights: night
      ? () => [
          { x: 22, y: 40, r: 50, ry: 46, c: WARM },
          { x: 158, y: 44, r: 52, ry: 44, c: [1.12, 0.98, 0.78] },
          { x: 97, y: 30, r: 46, ry: 34, c: MOON },
        ]
      : undefined,
  };
}

export const PLACE_SCENES = { showroom, house, mortgage, lecture, interview, loft };

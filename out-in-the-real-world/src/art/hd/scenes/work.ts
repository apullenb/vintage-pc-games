// HD workplace scenes: grocery, warehouse, jobsite, library.
import {
  baseboardHD,
  block,
  box,
  box3,
  cloudHD,
  concreteHD,
  coneHD,
  ell,
  fillRR,
  glowHD,
  H,
  hash,
  hgrad,
  lgrad,
  lightPool,
  litH,
  litV,
  poly,
  rgba,
  rgrad,
  seg,
  shade,
  signText,
  skyHD,
  softShadow,
  strokeRR,
  tileFloorHD,
  vgrad,
  wallHD,
  woodFloorHD,
  W,
  type Ctx,
} from '../kit.ts';
import { drawSeatedHD } from '../person.ts';
import { extra } from './civic.ts';
import { bookRowHD, lightSign } from './common.ts';
import type { HDSpec } from './types.ts';

const PRODUCT = ['#e0503c', '#f2b632', '#3caa6a', '#3f7fd8', '#ef7fae', '#9a5ad0', '#ff8a1e'];

// ---------- grocery ----------
function gondola(x: Ctx, sx: number, w: number, s: number): void {
  softShadow(x, sx + w / 2, 80, w * 0.55, 2, 0.4);
  fillRR(x, sx, 21, w, 58, 1, vgrad(x, 21, 79, ['#d8c4a8', '#c8b49a', '#a89478']));
  x.fillStyle = hgrad(x, sx, sx + 4, ['rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']);
  x.fillRect(sx, 21, 4, 58);
  for (let r = 0; r < 4; r++) {
    const by = 33 + r * 12;
    // back shadow inside the shelf bay
    x.fillStyle = vgrad(x, by - 11, by, ['rgba(40,20,10,0.28)', 'rgba(40,20,10,0.05)']);
    x.fillRect(sx + 1, by - 11, w - 2, 11);
    for (let k = 0; k < 11; k++) {
      const px = sx + 2.2 + k * 4;
      const c = PRODUCT[(k * 3 + r * 5 + s * 2) % 7];
      if (r === 0) {
        // cereal boxes
        fillRR(x, px, by - 9, 3.4, 9, 0.3, litH(x, px, px + 3.4, c, 1.25, 0.7));
        box(x, px + 0.3, by - 6.5, 2.8, 2, rgba('#f8f4ea', 0.85));
      } else if (r === 1) {
        // stacked cans
        for (const yy of [by - 10, by - 5]) {
          fillRR(x, px, yy, 3.4, 5, 0.5, litH(x, px, px + 3.4, '#d8dce4', 1.2, 0.7));
          box(x, px, yy + 1.2, 3.4, 2.2, litH(x, px, px + 3.4, c, 1.2, 0.75));
          ell(x, px + 1.7, yy + 0.2, 1.7, 0.4, '#f4f6fa');
        }
      } else if (r === 2) {
        // bottles
        fillRR(x, px + 1.1, by - 9.5, 1.2, 2.6, 0.4, shade(c, 0.7));
        fillRR(x, px, by - 7.4, 3.4, 7.4, 1.2, litH(x, px, px + 3.4, c, 1.35, 0.68));
        box(x, px + 0.4, by - 4.6, 2.6, 1.6, rgba('#ffffff', 0.7));
      } else {
        fillRR(x, px - 0.2, by - 6, 3.8, 6, 1, litH(x, px, px + 3.8, shade(c, 0.9), 1.25, 0.7));
      }
    }
    fillRR(x, sx, by, w, 2.2, 0.4, litV(x, by, by + 2.2, '#8a7a6a'));
    box(x, sx, by + 2, w, 0.9, '#f8f8f0');
    for (let k = 3; k < w - 3; k += 9) fillRR(x, sx + k, by + 1.9, 3, 1.2, 0.2, '#e0503c');
  }
  block(x, sx, 72, w, 7, '#9a8670', 0.6);
}
function grocery(): HDSpec {
  return {
    player: 50,
    npc: 128,
    floor: 98,
    horizon: 80,
    fog: 0.07,
    fogColor: '#f2eee4',
    bg: (x) => {
      wallHD(x, '#f2efe6', 80);
      baseboardHD(x, 80, '#3caa6a');
      tileFloorHD(x, 80, '#f4eee2', '#ddd5c2', 14, { horizon: 46, sheen: 0.32 });
      x.fillStyle = vgrad(x, 0, 7, ['#c8c4b8', '#e2ded2']);
      x.fillRect(0, 0, W, 7);
      for (let s = 0; s < 3; s++) gondola(x, 4 + s * 50, 46, s);
      // lane light pole
      fillRR(x, 186, 26, 2, 54, 0.8, litH(x, 186, 188, '#6a6a7a'));
      // shopping cart
      softShadow(x, 15, 95, 14, 2, 0.45);
      x.save();
      x.strokeStyle = '#9aa8b8';
      x.lineWidth = 0.5;
      x.beginPath();
      x.moveTo(4, 80);
      x.lineTo(26, 80);
      x.lineTo(24, 90);
      x.lineTo(6, 90);
      x.closePath();
      x.stroke();
      for (let k = 7; k < 26; k += 3) seg(x, k, 80, k - 0.4, 90, rgba('#b8c4d0', 0.8), 0.3);
      for (let k = 83; k < 90; k += 3) seg(x, 4.5, k, 25.5, k, rgba('#b8c4d0', 0.8), 0.3);
      seg(x, 26, 80, 30, 74, '#8a9aa8', 0.7);
      seg(x, 6, 90.5, 24, 90.5, '#8a9aa8', 0.6);
      x.restore();
      for (const wx of [8, 22]) ell(x, wx, 94, 1.3, 1.3, '#1a1a22');
      fillRR(x, 8, 77, 6, 4, 0.6, litH(x, 8, 14, '#f2b632'));
      ell(x, 17, 78.5, 2.4, 2.6, rgrad(x, 16, 77.5, 3, [[0, '#6ad88a'], [1, '#2a8a4a']]));
      // FRESH FIELDS sign
      lightSign(x, 'FRESH FIELDS', 86, 13, 56, 9, '#2f8a4a', '#ffffff', 0.08);
      ell(x, 55.4, 13, 2.6, 2.6, rgrad(x, 54.6, 12.2, 3, [[0, '#7ae09a'], [1, '#2a8a4a']]));
    },
    anim: (x, t) => {
      for (let i = 0; i < 4; i++) {
        const cx = 6 + i * 48;
        const flick = i === 1 && Math.floor(t * 8) % 37 < 2;
        fillRR(x, cx, 1.6, 30, 3, 0.8, flick ? '#c8c4b8' : vgrad(x, 1.6, 4.6, ['#ffffff', '#fffde8']));
        if (!flick) glowHD(x, cx + 15, 4, 26, '#fffbe8', 0.14, 8);
      }
      for (const [cx, label] of [
        [27, 'AISLE 3'],
        [127, 'AISLE 5'],
      ] as const) {
        const sw = Math.sin(t * 1.4 + cx) * 0.06;
        x.save();
        x.translate(cx, 7);
        x.rotate(sw);
        seg(x, -6, 0, -6, 6.5, '#6a6a7a', 0.4);
        seg(x, 6, 0, 6, 6.5, '#6a6a7a', 0.4);
        softShadow(x, 1, 11, 16, 4, 0.2);
        fillRR(x, -15, 6, 30, 8, 1, vgrad(x, 6, 14, ['#4a80d0', '#2b5fa8', '#1e4a88']));
        signText(x, label, 0, 10.2, 4.6, '#ffffff');
        x.restore();
      }
      // lane light
      fillRR(x, 182, 18, 10, 9, 1.4, litV(x, 18, 27, '#3a3a48'));
      const on = Math.floor(t * 2) % 2 === 1;
      fillRR(x, 183, 19, 8, 7, 1, on ? rgrad(x, 186, 21, 5, [[0, '#fff8c0'], [1, '#ffd23a']]) : '#a88a20');
      signText(x, '3', 187, 22.6, 5, '#2a2a33');
      if (on) glowHD(x, 187, 22.5, 10, '#ffd23a', 0.3);
    },
    fg: (x) => {
      // checkout belt + counter
      softShadow(x, 170, 108, 26, 3, 0.4);
      block(x, 147.5, 87, 45, 21, '#5a6a5a', 0.4);
      for (let k = 152; k < W; k += 10) block(x, k, 90, 7, 15, '#4a5a4a', 0.6, { edge: false });
      fillRR(x, 147, 82.5, 46, 4.6, 1, vgrad(x, 82.5, 87, ['#5a5a66', '#2a2a34']));
      // register
      softShadow(x, 168, 82, 9, 1.2, 0.35);
      box3(x, 160, 70, 16, 12, 1.6, '#d8d8dc', 1);
      fillRR(x, 162, 71.8, 12, 5.2, 0.6, '#14141c');
      fillRR(x, 163, 78, 10, 2, 0.4, '#a8a8b4');
    },
    fgAnim: (x, t) => {
      x.save();
      x.beginPath();
      x.rect(147.5, 83, 45, 3.6);
      x.clip();
      const off = (t * 6) % 4;
      for (let k = 144 + off; k < W; k += 4) seg(x, k, 83, k, 86.6, rgba('#7a7a88', 0.6), 0.3);
      x.restore();
      for (let i = 0; i < 3; i++) {
        const ix = 148 + ((t * 6 + i * 16) % 40);
        const c = ['#e0503c', '#f2b632', '#3caa6a'][i];
        if (i === 2) ell(x, ix + 2, 81, 2.2, 2.2, rgrad(x, ix + 1.3, 80.2, 2.6, [[0, shade(c, 1.4)], [1, shade(c, 0.7)]]));
        else fillRR(x, ix, 79.6 - (i % 2), 4, 3.4 + (i % 2), 0.5, litH(x, ix, ix + 4, c));
      }
      signText(x, Math.floor(t) % 2 ? '$4.99' : '$12.40', 168, 74.4, 3.6, '#7fe08a');
      glowHD(x, 168, 74.4, 6, '#60e070', 0.15);
    },
  };
}

// ---------- warehouse ----------
function rack(x: Ctx, rx: number, rw: number): void {
  softShadow(x, rx + rw / 2, 80, rw * 0.55, 2, 0.4);
  for (const px of [rx, rx + rw - 3]) fillRR(x, px, 17.5, 3, 62.5, 0.6, litH(x, px, px + 3, '#ff8a1e', 1.25, 0.7));
  for (let s = 0; s < 3; s++) {
    const by = 32 + s * 16;
    for (let b = 0; b < Math.floor((rw - 8) / 20); b++) {
      const bx = rx + 5 + b * 20;
      const hgt = 8 + Math.floor(hash(rx + s * 7 + b) * 4);
      fillRR(x, bx, by - 2, 18, 2, 0.3, litV(x, by - 2, by, '#a07a4a'));
      const wrapped = hash(b + s * 3 + rx) > 0.5;
      box3(x, bx, by - 2 - hgt, 18, hgt, 1.6, '#c9a36a', 0.6);
      box(x, bx + 8, by - 2 - hgt, 2, hgt, rgba('#e8cc90', 0.7));
      if (wrapped) {
        x.fillStyle = lgrad(x, bx, by - 2 - hgt, bx + 18, by - 2, [[0, 'rgba(240,246,255,0.45)'], [0.5, 'rgba(240,246,255,0.1)'], [1, 'rgba(240,246,255,0.35)']]);
        x.fillRect(bx, by - 2 - hgt, 18, hgt);
      }
      fillRR(x, bx + 2, by - hgt + 0.5, 4, 2.6, 0.2, '#f4f0e4');
    }
    fillRR(x, rx + 3, by - 0.5, rw - 6, 3, 0.4, litV(x, by - 0.5, by + 2.5, '#2b5fa8', 1.3, 0.7));
  }
}
function warehouse(): HDSpec {
  return {
    player: 54,
    npc: 128,
    floor: 98,
    horizon: 80,
    fog: 0.12,
    fogColor: '#b8c0cc',
    bloom: 1.1,
    bg: (x) => {
      // corrugated wall
      x.fillStyle = vgrad(x, 14, 80, ['#5a6270', '#6a7380', '#5a626e']);
      x.fillRect(0, 14, W, 66);
      for (let i = 0; i < W; i += 4) {
        x.fillStyle = hgrad(x, i, i + 4, ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0)']);
        x.fillRect(i, 14, 4, 66);
      }
      skyHD(x, 0, 16, ['#1e222a', '#343a44', '#464e58']);
      // trusses
      x.strokeStyle = '#7a8290';
      x.lineWidth = 0.7;
      x.beginPath();
      for (let i = 0; i < W; i += 24) {
        x.moveTo(i, 14);
        x.lineTo(i + 12, 4);
        x.lineTo(i + 24, 14);
      }
      x.moveTo(0, 3.5);
      x.lineTo(W, 3.5);
      x.moveTo(0, 14);
      x.lineTo(W, 14);
      x.stroke();
      // dock door: daylight, trailer, roll-up door
      fillRR(x, 2.5, 23.5, 41, 57, 0.6, '#2a2a33');
      x.fillStyle = vgrad(x, 52, 80, ['#cfe4f0', '#f8f4e4']);
      x.fillRect(4, 52, 38, 28);
      box(x, 4, 66, 38, 14, vgrad(x, 66, 80, ['#9a9aa0', '#7a7a80']));
      fillRR(x, 8, 55.5, 30, 10.5, 0.6, litV(x, 55.5, 66, '#eeeef2'));
      for (let j = 25; j < 51; j += 2.6) fillRR(x, 4, j, 38, 2.4, 0.6, vgrad(x, j, j + 2.4, ['#b8c2cc', '#8a94a0']));
      for (let i = 0; i < 38; i += 6) {
        poly(x, [4 + i, 51, 7 + i, 51, 7 + i, 53, 4 + i, 53], '#f2c230');
        poly(x, [7 + i, 51, 10 + i, 51, 10 + i, 53, 7 + i, 53], '#1a1a22');
      }
      glowHD(x, 23, 66, 26, '#fff6e0', 0.22, 16);
      for (const [rx, rw] of [
        [50, 70],
        [124, 66],
      ] as const)
        rack(x, rx, rw);
      lightSign(x, 'PARCELPOINT', 96, 7.5, 50, 9, '#2b2b38', '#ff8a1e', 0.12);
      fillRR(x, 152, 4, 34, 10, 1, litV(x, 4, 14, '#f2efe6'));
      signText(x, 'SAFE:', 163, 9.2, 4, '#2a2a33');
      signText(x, '112', 178, 9.2, 4.6, '#2f8a4a');
      concreteHD(x, 80, '#8e9096', { horizon: 46 });
      // yellow safety lines in perspective
      for (const wx of [-62, 62]) {
        const vy = 80 - 46;
        const s0 = (80 - vy) / (H - vy);
        seg(x, W / 2 + wx * s0, 80, W / 2 + wx, H, '#f2c230', 0.9, 'butt');
      }
      for (const cx of [30, 96, 140]) coneHD(x, cx, 16, 80, 8, 44, '#f6f2d0', 0.12);
      for (const cx of [30, 96, 140]) lightPool(x, cx, 88, 26, 6, '#fff6d8', 0.18);
    },
    anim: (x, t) => {
      for (const cx of [30, 96, 140]) {
        const flick = cx === 140 && Math.floor(t * 8) % 29 < 2;
        if (cx !== 96) seg(x, cx, 4, cx, 12, '#3a3a44', 0.5);
        fillRR(x, cx - 5.5, 11.5, 11, 4, 1.2, litV(x, 11.5, 15.5, '#4a4a58'));
        fillRR(x, cx - 4.4, 13.6, 8.8, 1.8, 0.8, flick ? '#9a9a90' : '#fffef0');
        if (!flick) glowHD(x, cx, 15, 12, '#fff8d8', 0.35, 6);
      }
      // conveyor
      fillRR(x, 44, 62.5, W - 44, 7.5, 1, vgrad(x, 62.5, 70, ['#6a6a74', '#3a3a44', '#2a2a32']));
      x.save();
      x.beginPath();
      x.rect(45, 63.5, W - 45, 4);
      x.clip();
      const off = (t * 8) % 6;
      for (let k = 45 + off - 6; k < W; k += 6) seg(x, k, 63.5, k, 67.5, rgba('#20202a', 0.7), 0.5);
      x.restore();
      for (let k = 52; k < W; k += 30) fillRR(x, k, 70, 2, 10, 0.4, litH(x, k, k + 2, '#6a6a74'));
      for (let i = 0; i < 4; i++) {
        const span = W - 40;
        const bx = 44 + ((t * 9 + i * (span / 4)) % span);
        const bw = 9 + (i % 2) * 3;
        if (bx + bw > W) continue;
        softShadow(x, bx + bw / 2, 64, bw * 0.6, 1, 0.35);
        box3(x, bx, 57 + (i % 2), bw, 7 - (i % 2), 1.4, '#c9a36a', 0.5);
        fillRR(x, bx + 2, 59.5 + (i % 2), 3.4, 2.2, 0.2, '#f2efe6');
      }
    },
  };
}

// ---------- jobsite ----------
function jobsite(): HDSpec {
  return {
    player: 56,
    npc: 120,
    floor: 98,
    horizon: 64,
    fog: 0.12,
    fogColor: '#dcecf8',
    bg: (x) => {
      skyHD(x, 0, 66, ['#4a9ce4', '#7cbcf0', '#bfe0f8', '#e8f4fa']);
    },
    anim: (x, t) => {
      for (let k = 0; k < 4; k++) {
        const cw = 16 + hash(91 + k) * 14;
        const cx = ((t * (1.5 + k * 0.5) + hash(91 * 3 + k) * (W + 60)) % (W + 60)) - 30;
        cloudHD(x, cx, 8 + k * 6 + hash(k) * 5, cw);
      }
      // crane hook swinging
      const sw = Math.sin(t * 0.8) * 3;
      seg(x, 72, 8, 72 + sw, 30, '#3a3a44', 0.35);
      fillRR(x, 70 + sw, 29.6, 4, 3.4, 0.6, litH(x, 70 + sw, 74 + sw, '#f2c230'));
    },
    mid: (x) => {
      // distant tree line in haze
      for (let i = -4; i < W + 8; i += 7) {
        const h = 6 + hash(i + 3) * 7;
        ell(x, i + 3, 62 - h / 2, h * 0.7, h * 0.65, rgrad(x, i + 1, 58 - h, h * 1.2, [[0, '#9ac0b0'], [1, '#6a9a8a']]));
      }
      box(x, 0, 60, W, 6, '#6a9a8a');
      // crane lattice tower + jib
      x.strokeStyle = '#e0a020';
      x.lineWidth = 0.45;
      x.beginPath();
      for (let j = 6; j < 66; j += 4) {
        x.moveTo(10, j);
        x.lineTo(15, j + 4);
        x.moveTo(15, j);
        x.lineTo(10, j + 4);
      }
      for (let i = 4; i < 86; i += 4) {
        x.moveTo(i, 6);
        x.lineTo(i + 2, 8.6);
        x.lineTo(i + 4, 6);
      }
      x.stroke();
      fillRR(x, 9, 6, 1, 60, 0.3, '#c08010');
      fillRR(x, 15, 6, 1, 60, 0.3, '#c08010');
      fillRR(x, 4, 5.4, 82, 1.4, 0.4, litV(x, 5.4, 6.8, '#f0b030'));
      fillRR(x, 4, 8.4, 82, 0.8, 0.3, '#c08010');
      block(x, 1.5, 3.5, 9, 5, '#5a5a6a', 0.8);
      // the framed house: sill, studs, plates, rafters
      const wood = '#d8b27a';
      fillRR(x, 26, 75.5, 140, 3.5, 0.3, litV(x, 75.5, 79, '#b08a54'));
      for (let i = 26; i <= 162; i += 8) fillRR(x, i, 34, 3, 42, 0.2, litH(x, i, i + 3, wood, 1.15, 0.7));
      fillRR(x, 26, 31.8, 140, 3.2, 0.3, litV(x, 31.8, 35, '#d4b076'));
      fillRR(x, 26, 54, 140, 2, 0.2, litV(x, 54, 56, '#c9a36a'));
      for (const s of [-1, 1]) {
        x.save();
        x.translate(s < 0 ? 26 : 166, 33);
        x.rotate(s < 0 ? -0.315 : Math.PI + 0.315);
        fillRR(x, 0, -1.2, 74, 2.4, 0.4, lgrad(x, 0, -1.2, 0, 1.2, [[0, '#ecd09a'], [1, '#a8844e']]));
        x.restore();
      }
      for (let i = 34; i < 160; i += 12) {
        const hh = Math.max(0, 23 - Math.abs(i + 1 - 96) / 3.1);
        fillRR(x, i, 32 - hh, 2, hh, 0.2, litH(x, i, i + 2, wood));
      }
      // OSB sheathing on the left wall
      x.save();
      x.beginPath();
      x.rect(26, 34, 32, 42);
      x.clip();
      x.fillStyle = lgrad(x, 26, 34, 58, 76, [[0, '#dcb878'], [1, '#b08a50']]);
      x.fillRect(26, 34, 32, 42);
      for (let i = 0; i < 220; i++) ell(x, 26 + hash(i * 5) * 32, 34 + hash(i * 7) * 42, 0.9 + hash(i) * 1.2, 0.35, rgba(hash(i * 3) > 0.5 ? '#f0d090' : '#8a6a38', 0.45), hash(i * 11) * 3);
      seg(x, 42, 34, 42, 76, rgba('#8a6a38', 0.8), 0.4);
      seg(x, 26, 55, 58, 55, rgba('#8a6a38', 0.8), 0.4);
      x.restore();
      // window header on the right
      fillRR(x, 130, 44, 26, 3, 0.3, litV(x, 44, 47, '#b08a54'));
      fillRR(x, 130, 62, 26, 2, 0.3, litV(x, 62, 64, '#b08a54'));
      // electrical panel, boxes, wire runs
      block(x, 108, 40, 10, 16, '#a8b0b8', 0.6);
      for (let k = 0; k < 5; k++) fillRR(x, 110, 42 + k * 2.8, 6, 1.4, 0.3, '#3a3a44');
      for (const bx of [70, 86, 140]) block(x, bx, 60, 4, 6, '#3f7fd8', 0.6);
      x.lineWidth = 0.55;
      x.lineCap = 'round';
      for (const [c, pts] of [
        ['#c0392b', [72, 60, 72, 48.5, 108, 48.5]],
        ['#f2c230', [88, 60, 88, 50.5, 108, 50.5]],
        ['#2a2a33', [118, 52.5, 141.5, 52.5, 141.5, 60]],
      ] as const) {
        x.beginPath();
        x.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
        x.strokeStyle = c;
        x.stroke();
      }
      // ground: packed dirt with tracks and grass edge
      x.fillStyle = vgrad(x, 77, H, ['#7a6040', '#9a7a54', '#a8865e']);
      x.fillRect(0, 77, W, H - 77);
      for (let i = 0; i < 140; i++) ell(x, hash(i * 3) * W, 79 + hash(i * 7) * 29, 0.6 + hash(i) * 1.6, 0.3 + hash(i) * 0.4, rgba(hash(i * 11) > 0.5 ? '#c8a478' : '#6a5032', 0.5));
      for (let i = 0; i < 60; i++) {
        const gx = hash(i * 13) * W;
        seg(x, gx, 78.5, gx + (hash(i) - 0.5) * 1.5, 76.5 - hash(i * 5) * 1.6, '#6a8a4a', 0.4);
      }
      x.save();
      x.globalAlpha = 0.35;
      x.lineWidth = 2.2;
      x.strokeStyle = '#6a5034';
      for (const [a, b] of [
        [80, 0.6],
        [96, 0.9],
      ]) {
        x.beginPath();
        x.moveTo(a, 84);
        x.lineTo(a + (H - 84) * b, H);
        x.stroke();
      }
      x.restore();
      // lumber pile
      softShadow(x, 19, 90, 19, 2.4, 0.4);
      for (let k = 0; k < 3; k++) {
        fillRR(x, 2.5, 78.5 + k * 4, 33, 3.6, 0.4, litV(x, 78.5 + k * 4, 82 + k * 4, '#dcb67e'));
        for (let m = 0; m < 4; m++) ell(x, 4.5 + m * 8, 80.3 + k * 4, 0.9, 1.4, rgba('#a07a40', 0.7));
      }
      // electrician's van
      softShadow(x, 172, 79, 24, 2.6, 0.5);
      fillRR(x, 151.5, 49.5, 41, 23, 3, lgrad(x, 151, 49, 151, 72, [[0, '#ffffff'], [0.6, '#f0f0ec'], [1, '#c8c8c4']]));
      fillRR(x, 151.5, 66, 41, 6, 1.2, '#d0d0cc');
      signText(x, 'BRIGHTLINE', 168, 56.6, 4.2, '#2b5fa8');
      poly(x, [184, 52.5, 180.5, 58, 183, 58, 181, 63, 186, 56.6, 183.4, 56.6, 185.6, 52.5], '#f2c230');
      box(x, 152, 62.6, 40, 0.9, '#2b5fa8');
      for (const wx of [160.5, 184.5]) {
        ell(x, wx, 73.5, 4.4, 4.4, '#1a1a22');
        ell(x, wx, 73.5, 2.2, 2.2, rgrad(x, wx - 0.5, 73, 2.6, [[0, '#d8dce4'], [1, '#6a7280']]));
      }
      // traffic cone
      softShadow(x, 181, 97.5, 8, 1.6, 0.45);
      fillRR(x, 173.5, 94.5, 15, 3.6, 0.8, litV(x, 94.5, 98, '#e07010'));
      poly(x, [179.4, 85, 182.6, 85, 185, 95, 177, 95], lgrad(x, 177, 0, 185, 0, [[0, '#ffb060'], [0.5, '#ff8a1e'], [1, '#c05a08']]));
      poly(x, [178.6, 88.4, 183.4, 88.4, 183.9, 90.6, 178.1, 90.6], '#ffffff');
      // extension cord
      x.beginPath();
      for (let i = 30; i < 110; i += 2) x.lineTo(i, 92 + Math.sin(i / 7) * 2);
      x.strokeStyle = '#ff8a1e';
      x.lineWidth = 0.7;
      x.stroke();
    },
    anim2: (x, t) => {
      if (Math.floor(t * 8) % 19 < 2) {
        glowHD(x, 107, 38, 6, '#fff27a', 0.6);
        for (let k = 0; k < 5; k++) seg(x, 107, 39, 107 + Math.cos(k * 1.3) * 3, 39 + Math.sin(k * 1.3) * 3 - 1, '#fff6b0', 0.3);
      }
    },
  };
}

// ---------- library ----------
function library(): HDSpec {
  return {
    player: 56,
    npc: 134,
    floor: 98,
    horizon: 80,
    fog: 0.08,
    fogColor: '#b89878',
    bloom: 1.2,
    bg: (x) => {
      wallHD(x, '#7a4a2a', 80, (c) => {
        for (let i = 0; i < W; i += 16) {
          c.fillStyle = hgrad(c, i, i + 16, ['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.08)']);
          c.fillRect(i, 0, 16, 80);
        }
      });
      baseboardHD(x, 80, '#4a2a16');
      woodFloorHD(x, 80, '#6a4a2e');
      // runner rug in perspective
      {
        const vy = 80 - 44;
        const s0 = (82 - vy) / (H - vy);
        poly(x, [W / 2 - 22 * s0, 82, W / 2 + 22 * s0, 82, W / 2 + 22, H, W / 2 - 22, H], lgrad(x, 0, 82, 0, H, [[0, '#6a2020'], [1, '#a83a3a']]));
        for (const k of [-19, 19]) seg(x, W / 2 + k * s0, 82, W / 2 + k, H, rgba('#e0b050', 0.7), 0.5, 'butt');
      }
      // arched window
      x.save();
      x.beginPath();
      x.moveTo(63, 61);
      x.lineTo(63, 18);
      x.quadraticCurveTo(63, 5, 96, 5);
      x.quadraticCurveTo(129, 5, 129, 18);
      x.lineTo(129, 61);
      x.closePath();
      x.fillStyle = '#3a2010';
      x.fill();
      x.beginPath();
      x.moveTo(64.5, 60);
      x.lineTo(64.5, 18.5);
      x.quadraticCurveTo(64.5, 6.5, 96, 6.5);
      x.quadraticCurveTo(127.5, 6.5, 127.5, 18.5);
      x.lineTo(127.5, 60);
      x.closePath();
      x.fillStyle = vgrad(x, 7, 60, ['#9ad0f8', '#d8eefa', '#fff4d8']);
      x.fill();
      x.clip();
      for (let i = 0; i < 3; i++) cloudHD(x, 76 + i * 22, 20 + (i % 2) * 8, 12, '#ffffff', '#e0ecf8');
      for (let k = 0; k < 5; k++) ell(x, 70 + k * 12, 58, 9, 5, rgrad(x, 70 + k * 12, 56, 9, [[0, '#9ac08a'], [1, '#6a9a6a']]));
      x.restore();
      x.strokeStyle = '#5a3820';
      x.lineWidth = 1.4;
      x.beginPath();
      x.moveTo(96, 6);
      x.lineTo(96, 60);
      x.moveTo(64, 36.5);
      x.lineTo(128, 36.5);
      x.moveTo(79.5, 10);
      x.lineTo(79.5, 60);
      x.moveTo(112.5, 10);
      x.lineTo(112.5, 60);
      x.stroke();
      fillRR(x, 61.5, 59.5, 69, 3.4, 0.6, litV(x, 59.5, 63, '#6a4428'));
      glowHD(x, 96, 30, 42, '#fff2c8', 0.12, 30);
      // light beams
      x.save();
      x.globalCompositeOperation = 'screen';
      for (const [x0, w, a] of [
        [66, 58, 0.14],
        [76, 12, 0.12],
        [100, 12, 0.12],
      ] as const) {
        const g = x.createLinearGradient(0, 62, 0, 104);
        g.addColorStop(0, `rgba(255,242,192,${a})`);
        g.addColorStop(1, 'rgba(255,242,192,0)');
        poly(x, [x0, 62, x0 + w, 62, x0 + w + 29, 104, x0 + 29, 104], g);
      }
      x.restore();
      // tall shelves
      for (const [sx, sw] of [
        [2, 50],
        [142, 48],
      ] as const) {
        softShadow(x, sx + sw / 2, 81, sw * 0.55, 2, 0.45);
        fillRR(x, sx, 3.5, sw, 77, 0.8, litH(x, sx, sx + sw, '#4a2c16', 1.4, 0.7));
        fillRR(x, sx + 2, 5, sw - 4, 74, 0.4, '#2a160a');
        for (let r = 0; r < 6; r++) {
          const by = 16 + r * 12;
          x.fillStyle = vgrad(x, by - 11, by, ['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']);
          x.fillRect(sx + 2, by - 11, sw - 4, 11);
          bookRowHD(x, sx + 2.5, by, sw - 5, sx * 31 + r * 7, 9);
          fillRR(x, sx + 1, by, sw - 2, 2.2, 0.3, litV(x, by, by + 2.2, '#7a5030'));
        }
      }
      // rolling ladder
      seg(x, 38, 4, 46, 80, '#9a6a3a', 1);
      seg(x, 44, 4, 52, 80, '#9a6a3a', 1);
      for (let k = 0; k < 8; k++) seg(x, 39 + k + 0.5, 10 + k * 9, 45 + k + 0.5, 10 + k * 9, '#b8844e', 0.8);
      // study table with a banker's lamp
      softShadow(x, 96, 80, 28, 2, 0.4);
      fillRR(x, 69, 63.6, 54, 4, 0.6, litV(x, 63.6, 67.6, '#9a6a40'));
      for (const lx of [72, 118]) fillRR(x, lx, 67, 2, 13, 0.5, litH(x, lx, lx + 2, '#5a3a20'));
      ell(x, 100, 63.4, 3, 0.8, '#c9a032');
      seg(x, 100, 63, 100, 60.6, '#c9a032', 0.5);
      x.beginPath();
      x.ellipse(100, 60.4, 4.6, 2.2, 0, Math.PI, Math.PI * 2);
      x.fillStyle = lgrad(x, 95, 58, 105, 61, [[0, '#4ac078'], [1, '#1a6a3a']]);
      x.fill();
    },
    anim: (x, t) => {
      drawSeatedHD(x, extra(4, 5, 3, '#f2b632', { pants: '#2a3a5a', glasses: true }), 85, 66, { t, dir: 1, blink: t % 5.1 < 0.12, scale: 0.88 });
      const pg = Math.floor(t * 0.5) % 2;
      fillRR(x, 91.5, 61.6, 7, 1.8, 0.2, '#f2efe6');
      seg(x, 95, 61.6, 95 + (pg ? 2 : -2), 60.8, '#ffffff', 0.5);
      glowHD(x, 100, 62, 12, '#fff2a0', 0.4, 5);
      lightPool(x, 100, 63.6, 12, 1.4, '#fff2a0', 0.4);
      for (let i = 0; i < 9; i++) {
        const mx = 70 + hash(i * 3) * 60 + Math.sin(t * 0.5 + i) * 3 + ((t * 1.5) % 10);
        const my = 66 + ((hash(i * 7) * 30 + t * 2) % 30);
        ell(x, mx, my, 0.3, 0.3, `rgba(255,246,208,${(0.4 + 0.4 * Math.sin(t * 2 + i)).toFixed(2)})`);
      }
    },
    fg: (x) => {
      softShadow(x, 138, 108, 36, 3, 0.4);
      poly(x, [106, 87, 171, 87, 172, 90.6, 104.6, 90.6], lgrad(x, 0, 87, 0, 90.6, [[0, '#c08a54'], [1, '#8a5a34']]));
      block(x, 104.6, 90.6, 67.4, 17.4, '#5a3a20', 0.6);
      for (let k = 110; k < 168; k += 14) {
        block(x, k, 93, 10, 12, '#4a2c16', 0.6, { edge: false });
        strokeRR(x, k + 1, 94, 8, 10, 0.5, rgba('#7a5030', 0.7), 0.35);
      }
      signText(x, 'CHECKOUT', 137.6, 99, 4, '#d8b040');
      for (let k = 0; k < 4; k++) {
        const c = ['#c0392b', '#2e3f6e', '#3caa6a', '#d8a232'][k];
        fillRR(x, 108 + (k % 2), 84.6 - k * 2, 12, 2, 0.3, litV(x, 84.6 - k * 2, 86.6 - k * 2, c));
      }
      ell(x, 163, 87.2, 3, 0.7, '#a07a18');
      x.beginPath();
      x.ellipse(163, 87, 2.4, 2, 0, Math.PI, Math.PI * 2);
      x.fillStyle = rgrad(x, 162.2, 85.6, 2.6, [[0, '#fff0a0'], [1, '#b08a18']]);
      x.fill();
    },
  };
}

export const WORK_SCENES = { grocery, warehouse, jobsite, library };

// HD outdoor town scenes: main street, used-car lot, campus.
import {
  box,
  cloudHD,
  concreteHD,
  ell,
  fillRR,
  glowHD,
  H,
  hash,
  hgrad,
  lgrad,
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
  treeHD,
  vgrad,
  W,
  type Ctx,
} from '../kit.ts';
import { drawPersonHD } from '../person.ts';
import { extra } from './civic.ts';
import { carHD, clockHD, lightSign } from './common.ts';
import type { HDSpec } from './types.ts';

export const SKY = ['#4a9ce4', '#7cbcf0', '#bfe0f8', '#e4f2fa'];

export function cloudsHD(x: Ctx, t: number, y0: number, h: number, seed: number, n = 3, scale = 1): void {
  for (let k = 0; k < n; k++) {
    const cw = (14 + hash(seed + k) * 14) * scale;
    const cx = ((t * (1.2 + k * 0.5) + hash(seed * 3 + k) * (W + cw * 2)) % (W + cw * 2)) - cw;
    cloudHD(x, cx, y0 + 4 + hash(seed + k * 5) * h, cw);
  }
}

// Hazy city skyline; distant buildings fade into the sky color.
export function skylineHD(x: Ctx, y: number, c: string, seed: number, lit = '#ffe9a0', litP = 0.55, roof = true, glow = false): void {
  let px = -2;
  let i = 0;
  while (px < W) {
    const w = 12 + Math.floor(hash(seed + i) * 16);
    const h = 14 + Math.floor(hash(seed + i * 13) * 26);
    x.fillStyle = hgrad(x, px, px + w, [shade(c, 1.08), c, shade(c, 0.86)]);
    x.fillRect(px, y - h, w, h);
    box(x, px, y - h, w, 0.6, shade(c, 1.2));
    if (roof && hash(seed + i * 17) > 0.6) {
      box(x, px + 3, y - h - 3, 4, 3, shade(c, 0.95));
      seg(x, px + w - 4.5, y - h, px + w - 4.5, y - h - 6, shade(c, 0.85), 0.4);
    }
    for (let wy = y - h + 3; wy < y - 2; wy += 5)
      for (let wx = px + 2; wx < px + w - 3; wx += 4)
        if (hash(wx * 31 + wy + seed) > litP) {
          box(x, wx, wy, 2, 2, lit);
          if (glow) glowHD(x, wx + 1, wy + 1, 3, lit, 0.25);
        }
    px += w + 1;
    i++;
  }
}

export function miniCarHD(x: Ctx, px: number, py: number, body: string, dir: 1 | -1, lights = false): void {
  carHD(x, px, py - 1, body, dir < 0, 23);
  if (lights) glowHD(x, dir > 0 ? px + 23 : px, py + 4.6, 10, '#fff2b0', 0.4, 4);
}
export function trafficHD(x: Ctx, t: number, y: number, seed: number, n = 3, lights = false): void {
  const colors = ['#c0392b', '#3f7fd8', '#f2b632', '#eeeae0', '#3caa6a', '#6a5a8a'];
  for (let i = 0; i < n; i++) {
    const dir: 1 | -1 = i % 2 ? -1 : 1;
    const sp = 18 + hash(seed + i) * 14;
    const span = W + 70;
    const off = (hash(seed + i * 7) * span + t * sp) % span;
    const cx = dir > 0 ? off - 35 : W + 35 - off - 22;
    miniCarHD(x, cx, y + (dir > 0 ? 3 : 0), colors[Math.floor(hash(seed + i * 3) * colors.length)], dir, lights);
  }
}

// ---------- street ----------
function storefront(x: Ctx, fx: number, fw: number, c: string, label: string): void {
  fillRR(x, fx, 14, fw, 50, 0.4, hgrad(x, fx, fx + fw, [shade(c, 1.12), c, shade(c, 0.82)]));
  // brick / siding texture
  x.save();
  x.beginPath();
  x.rect(fx, 14, fw, 50);
  x.clip();
  for (let j = 16; j < 64; j += 2.4) box(x, fx, j, fw, 0.3, rgba(shade(c, 0.7), 0.35));
  x.restore();
  fillRR(x, fx - 0.5, 13, fw + 1, 2.4, 0.4, litV(x, 13, 15.4, shade(c, 1.3)));
  for (let wx = fx + 5; wx < fx + fw - 8; wx += 12) {
    fillRR(x, wx - 1, 18.5, 8, 11, 0.4, '#e8e0d0');
    x.fillStyle = vgrad(x, 20, 28, ['#c8e4f4', '#6a9ac0']);
    x.fillRect(wx, 19.6, 6, 8.4);
    poly(x, [wx, 19.6, wx + 2.6, 19.6, wx, 23], 'rgba(255,255,255,0.4)');
    box(x, wx - 1.2, 29.2, 8.4, 1.2, litV(x, 29.2, 30.4, shade(c, 0.7)));
  }
  // shop window and door
  fillRR(x, fx + 3, 41.5, fw - 6, 22.5, 0.6, '#2a2a33');
  x.fillStyle = vgrad(x, 43, 63, ['#7a9ab8', '#3a5a78']);
  x.fillRect(fx + 4, 43, fw - 18, 20);
  x.save();
  x.globalCompositeOperation = 'screen';
  poly(x, [fx + 6, 63, fx + 11, 63, fx + 20, 43, fx + 15, 43], 'rgba(255,255,255,0.18)');
  x.restore();
  fillRR(x, fx + fw - 13, 44.5, 9, 18.5, 0.4, litH(x, fx + fw - 13, fx + fw - 4, shade(c, 0.6)));
  ell(x, fx + fw - 11, 54, 0.6, 0.6, '#f2d048');
  lightSign(x, label, fx + fw / 2, 34.5, Math.max(22, label.length * 4 + 6), 6.5, '#f2efe6', shade(c, 0.55), 0);
}
function street(): HDSpec {
  return {
    player: 60,
    npc: 126,
    floor: 98,
    horizon: 64,
    fog: 0.12,
    fogColor: '#d8e6f4',
    bg: (x) => skyHD(x, 0, 40, SKY),
    anim: (x, t) => cloudsHD(x, t, 0, 8, 51, 3, 0.8),
    mid: (x) => {
      skylineHD(x, 30, '#b8c8d8', 3, '#d8e4ee', 0.75, false);
      x.fillStyle = vgrad(x, 4, 30, ['rgba(216,230,244,0)', 'rgba(216,230,244,0.5)']);
      x.fillRect(0, 4, W, 26);
      const fronts: [number, number, string, string][] = [
        [0, 62, '#b86a4a', 'CAFE'],
        [62, 60, '#6a8ab0', 'LAUNDRY'],
        [122, 70, '#c8a868', 'BOOKS'],
      ];
      for (const [fx, fw, c, label] of fronts) storefront(x, fx, fw, c, label);
      // cafe awning
      x.save();
      x.beginPath();
      x.moveTo(3, 41);
      x.lineTo(59, 41);
      x.lineTo(61, 47.5);
      x.lineTo(1, 47.5);
      x.closePath();
      x.clip();
      for (let k = 0; k < 60; k += 6) {
        box(x, k, 40, 3, 8, '#c0392b');
        box(x, k + 3, 40, 3, 8, '#f2efe6');
      }
      x.fillStyle = vgrad(x, 41, 47.5, ['rgba(255,255,255,0.25)', 'rgba(0,0,0,0.25)']);
      x.fillRect(0, 40, 62, 8);
      x.restore();
      for (let k = 0; k < 10; k++) ell(x, 4 + k * 6, 47.6, 1.5, 1.1, k % 2 ? '#f2efe6' : '#c0392b');
      x.fillStyle = vgrad(x, 48, 54, ['rgba(14,8,26,0.3)', 'rgba(14,8,26,0)']);
      x.fillRect(3, 48, 56, 6);
      // road
      x.fillStyle = vgrad(x, 64, 76, ['#3e3e48', '#54545e']);
      x.fillRect(0, 64, W, 12);
      for (let i = 0; i < 50; i++) ell(x, hash(i * 3) * W, 65 + hash(i * 7) * 10, 1 + hash(i) * 2, 0.3, rgba('#6a6a74', 0.5));
      for (let i = 0; i < W; i += 16) fillRR(x, i, 69.6, 8, 0.9, 0.4, '#f2e27a');
      // curb + sidewalk
      fillRR(x, 0, 75.6, W, 2.6, 0.4, litV(x, 75.6, 78.2, '#ece4d4'));
      concreteHD(x, 78.2, '#c8c0b0', { horizon: 30, joint: 30 });
    },
    anim2: (x, t) => {
      trafficHD(x, t, 63, 5, 3);
      const on = Math.floor(t * 8) % 17 > 1;
      fillRR(x, 79, 47, 21, 9, 1.4, '#1a1a22');
      signText(x, 'OPEN', 89.5, 51.6, 5.2, on ? '#ff6ab0' : '#6a2a4a');
      if (on) glowHD(x, 89.5, 51.5, 16, '#ff5aa0', 0.35, 7);
      for (let k = 0; k < 3; k++) {
        const s = (t * 3 + k * 1.3) % 4;
        ell(x, 50 + Math.sin(t * 2 + k) * 0.8, 50 - s * 1.4, 0.7 + s * 0.2, 0.7 + s * 0.2, `rgba(240,240,240,${(0.5 - s * 0.12).toFixed(2)})`);
      }
    },
    fg: (x) => {
      // street lamp
      softShadow(x, 48, 86.5, 6, 1.2, 0.45);
      fillRR(x, 44, 84, 8, 3, 0.8, litV(x, 84, 87, '#2a3a3a'));
      fillRR(x, 47, 44, 2, 41, 0.8, litH(x, 47, 49, '#3a4a4a'));
      fillRR(x, 44.5, 39.5, 9, 4.5, 1.4, litV(x, 39.5, 44, '#2a3a3a'));
      ell(x, 49, 44.3, 3.2, 0.8, '#f8f4d8');
      // bus stop sign + bench
      fillRR(x, 184, 50, 2, 36, 0.6, litH(x, 184, 186, '#4a4a5a'));
      fillRR(x, 178, 44, 14, 8, 1.2, vgrad(x, 44, 52, ['#4a80d0', '#2b5fa8', '#1e4a88']));
      signText(x, 'BUS', 185, 48.2, 4.4, '#ffffff');
      softShadow(x, 165, 86, 17, 1.6, 0.45);
      fillRR(x, 150, 73.6, 30, 2.4, 0.6, litV(x, 73.6, 76, '#9a6a40'));
      fillRR(x, 150, 77.6, 30, 3, 0.6, litV(x, 77.6, 80.6, '#9a6a40'));
      for (const lx of [152, 176]) fillRR(x, lx, 80.5, 2, 5.5, 0.4, '#3a3a4a');
      // hydrant
      softShadow(x, 144.5, 88.5, 5, 1.2, 0.45);
      fillRR(x, 141.8, 79.5, 5.4, 9, 1.4, litH(x, 141.8, 147.2, '#d04a3a'));
      ell(x, 144.5, 79.6, 2.6, 1.8, rgrad(x, 143.8, 78.8, 3, [[0, '#f07060'], [1, '#a02a20']]));
      fillRR(x, 140.6, 82, 7.8, 2, 0.8, litH(x, 140.6, 148.4, '#a02a20'));
      // trash can
      softShadow(x, 8, 90, 7, 1.4, 0.45);
      fillRR(x, 2.5, 76.5, 11, 13.5, 1.2, litH(x, 2.5, 13.5, '#3a6a4a'));
      for (let k = 4.5; k < 12; k += 2.6) seg(x, k, 78.5, k, 88.5, rgba('#1a3a2a', 0.6), 0.5);
      ell(x, 8, 76.6, 5.8, 1.3, litH(x, 2, 14, '#4a7a5a'));
    },
  };
}

// ---------- car lot ----------
function carlot(): HDSpec {
  return {
    player: 52,
    npc: 120,
    floor: 98,
    horizon: 60,
    fog: 0.14,
    fogColor: '#d8e8f6',
    bg: (x) => skyHD(x, 0, 64, SKY),
    anim: (x, t) => cloudsHD(x, t, 2, 12, 33, 3),
    mid: (x) => {
      skylineHD(x, 60, '#a8bccc', 7, '#c8d8e4', 0.7);
      x.fillStyle = vgrad(x, 24, 60, ['rgba(214,232,246,0)', 'rgba(214,232,246,0.55)']);
      x.fillRect(0, 24, W, 36);
      // asphalt with parking lines in perspective
      x.fillStyle = vgrad(x, 60, H, ['#6a6a74', '#808088', '#8a8a92']);
      x.fillRect(0, 60, W, H - 60);
      for (let i = 0; i < 160; i++) ell(x, hash(i * 3) * W, 60 + hash(i * 7) * 48, 0.6 + hash(i) * 1.6, 0.3, rgba(hash(i * 11) > 0.5 ? '#a0a0a8' : '#5a5a62', 0.45));
      const vy = 30;
      for (const wx of [-150, -75, 0, 75, 150]) {
        const s0 = (60 - vy) / (H - vy);
        seg(x, W / 2 + wx * s0, 60, W / 2 + wx, H, rgba('#f0f0e4', 0.85), 0.9, 'butt');
      }
      // oil stain
      ell(x, 40, 98, 10, 2, rgba('#2a2a32', 0.25));
      // sales office trailer
      softShadow(x, 170, 63, 24, 2, 0.4);
      fillRR(x, 147, 33, 46, 30, 0.8, hgrad(x, 147, 193, ['#ffffff', '#f2efe6', '#d8d4c8']));
      for (let j = 36; j < 62; j += 3) box(x, 148, j, 44, 0.5, rgba('#b8b4a8', 0.6));
      fillRR(x, 152, 40, 14, 10, 0.6, '#3a3a44');
      x.fillStyle = vgrad(x, 41, 49, ['#c8e8f8', '#6aa8d0']);
      x.fillRect(153, 41, 12, 8);
      fillRR(x, 174, 40, 10, 22, 0.6, litH(x, 174, 184, '#c0392b'));
      ell(x, 181.4, 52, 0.6, 0.6, '#f2d048');
      lightSign(x, 'OFFICE', 165, 28, 24, 6, '#2b3f7a', '#ffffff', 0);
      // big sign on a pole
      fillRR(x, 30, 32, 3, 30, 0.6, litH(x, 30, 33, '#6a6a7a'));
      softShadow(x, 33, 26, 32, 12, 0.25);
      fillRR(x, 3, 13, 58, 20, 2, vgrad(x, 13, 33, ['#ffd870', '#f2b632', '#c8901e']));
      signText(x, 'USED CARS', 32, 19.6, 6.4, '#1c1424');
      signText(x, 'EZ CREDIT!', 32, 27, 5.6, '#c0392b');
      fillRR(x, -1, 36, 2.4, 28, 0.6, '#6a6a7a');
      fillRR(x, 139.8, 32, 2.4, 32, 0.6, litH(x, 139.8, 142.2, '#6a6a7a'));
    },
    anim2: (x, t) => {
      const f = Math.floor(t * 6);
      for (let k = 0; k < 28; k++) {
        const pos = k < 14 ? [5 + k * 4, 13] : [5 + (k - 14) * 4, 33];
        const on = (k + f) % 3 === 0;
        ell(x, pos[0], pos[1], 0.75, 0.75, on ? '#ffffff' : '#c8902a');
        if (on) glowHD(x, pos[0], pos[1], 3, '#fff2b0', 0.4);
      }
      // bunting
      x.beginPath();
      for (let i = 2; i <= 140; i += 2) x.lineTo(i, 37 + Math.sin(((i - 2) / 138) * Math.PI) * 6);
      x.strokeStyle = '#2a2a33';
      x.lineWidth = 0.3;
      x.stroke();
      for (let i = 2; i < 140; i += 6) {
        const sag = Math.sin(((i - 2) / 138) * Math.PI) * 6;
        const c = ['#e0503c', '#f2b632', '#3f7fd8', '#3caa6a'][(i / 6) % 4 | 0];
        const fl = Math.sin(t * 6 + i) * 0.8;
        poly(x, [i + 0.5, 37.4 + sag, i + 4.5, 37.4 + sag, i + 2.5 + fl, 41.5 + sag], lgrad(x, i, 37 + sag, i + 4, 41 + sag, [[0, shade(c, 1.2)], [1, shade(c, 0.75)]]));
      }
      // inflatable tube guy
      const a = t * 4;
      fillRR(x, 89, 61.5, 14, 3.4, 1, litV(x, 61.5, 65, '#3a3a44'));
      let px = 96;
      let py = 62;
      const pts: [number, number][] = [[96, 62]];
      for (let s = 0; s < 7; s++) {
        const lean = Math.sin(a + s * 0.6) * (s * 0.6);
        px = 96 + lean;
        py = 62 - (s + 1) * 5;
        pts.push([px, py]);
      }
      x.lineCap = 'round';
      x.lineJoin = 'round';
      x.beginPath();
      pts.forEach(([qx, qy], i) => (i ? x.lineTo(qx, qy) : x.moveTo(qx, qy)));
      x.strokeStyle = '#c05a08';
      x.lineWidth = 6.6;
      x.stroke();
      x.strokeStyle = lgrad(x, 92, 0, 100, 0, [[0, '#ffb060'], [0.5, '#ff8a1e'], [1, '#e07010']]);
      x.lineWidth = 5.6;
      x.stroke();
      const arm = Math.sin(a * 1.3) * 5;
      for (const s of [-1, 1]) {
        x.beginPath();
        x.moveTo(px + s * 2.6, py + 7);
        x.quadraticCurveTo(px + s * 6, py + 5, px + s * 9, py + 3 + s * arm);
        x.strokeStyle = '#ff8a1e';
        x.lineWidth = 1.8;
        x.stroke();
      }
      ell(x, px - 1.2, py + 1.4, 0.7, 0.9, '#1c1424');
      ell(x, px + 1.4, py + 1.4, 0.7, 0.9, '#1c1424');
      x.beginPath();
      x.arc(px + 0.1, py + 3, 1.4, 0.2, Math.PI - 0.2);
      x.strokeStyle = '#1c1424';
      x.lineWidth = 0.4;
      x.stroke();
      // cars with a glint sweeping across
      carHD(x, 2, 69, '#c0392b', true, 36);
      carHD(x, 148, 69, '#3f7fd8', false, 36);
      for (const [cx, price] of [
        [12, '$4,995'],
        [158, '$7,450'],
      ] as const) {
        fillRR(x, cx - 1, 61.5, 22, 7, 0.6, '#ffffff');
        signText(x, price, cx + 10, 65.2, 4.2, '#c0392b');
      }
      const g = (t * 8) % 24;
      if (g < 6) {
        x.save();
        x.globalCompositeOperation = 'screen';
        for (const bx of [12, 158]) poly(x, [bx + g * 3, 76, bx + g * 3 + 2, 76, bx + g * 3 + 5, 69, bx + g * 3 + 3, 69], 'rgba(255,255,255,0.6)');
        x.restore();
      }
    },
  };
}

// ---------- campus ----------
function campus(): HDSpec {
  return {
    player: 60,
    npc: 128,
    floor: 98,
    horizon: 70,
    fog: 0.1,
    fogColor: '#dceaf6',
    bg: (x) => skyHD(x, 0, 72, SKY),
    anim: (x, t) => {
      cloudsHD(x, t, 0, 10, 17, 3);
      for (let i = 0; i < 2; i++) {
        const bx = ((t * 8 + i * 70) % (W + 20)) - 10;
        const fl = Math.sin(t * 9 + i) * 1;
        x.beginPath();
        x.moveTo(bx - 1.6, 30 + i * 6 - fl);
        x.quadraticCurveTo(bx - 0.6, 29.6 + i * 6, bx, 30 + i * 6);
        x.quadraticCurveTo(bx + 0.6, 29.6 + i * 6, bx + 1.6, 30 + i * 6 - fl);
        x.strokeStyle = '#2a2030';
        x.lineWidth = 0.45;
        x.stroke();
      }
    },
    mid: (x) => {
      // brick hall
      softShadow(x, 96, 70, 70, 3, 0.3);
      x.fillStyle = hgrad(x, 31, 161, ['#c06a48', '#b55a3a', '#a04a30']);
      x.fillRect(31, 15, 130, 56);
      x.save();
      x.beginPath();
      x.rect(31, 15, 130, 56);
      x.clip();
      for (let j = 16; j < 71; j += 3) {
        box(x, 31, j + 2.3, 130, 0.6, rgba('#d8b098', 0.7));
        for (let i = 31 + ((j / 3) % 2) * 3; i < 161; i += 6) {
          box(x, i, j, 0.5, 2.4, rgba('#d8b098', 0.6));
          if (hash(i * 7 + j * 13) > 0.8) box(x, i + 0.5, j, 5.5, 2.3, rgba('#8a3a20', 0.3));
        }
      }
      x.restore();
      fillRR(x, 30, 13.6, 132, 4, 0.4, litV(x, 13.6, 17.6, '#f0e8d8'));
      fillRR(x, 32, 42, 128, 2, 0.3, litV(x, 42, 44, '#e8e0d0'));
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 6; i++) {
          if (i === 2 || i === 3) continue;
          const wx = 38 + i * 20;
          const wy = 22 + r * 24;
          fillRR(x, wx - 0.6, wy - 0.6, 9.2, 14.2, 0.4, '#efe8d8');
          x.fillStyle = vgrad(x, wy + 1, wy + 12, ['#b8dcf4', '#4a7aa8']);
          x.fillRect(wx + 1, wy + 1, 6.6, 11);
          box(x, wx + 3.9, wy + 1, 0.8, 11, '#efe8d8');
          box(x, wx + 1, wy + 6, 6.6, 0.8, '#efe8d8');
          poly(x, [wx + 1, wy + 1, wx + 3, wy + 1, wx + 1, wy + 4], 'rgba(255,255,255,0.5)');
        }
      // portico with pediment and columns
      poly(x, [75, 14.5, 96, 0.5, 117, 14.5], lgrad(x, 0, 0, 0, 14.5, [[0, '#ffffff'], [1, '#e2dac8']]));
      x.strokeStyle = rgba('#8a8070', 0.6);
      x.lineWidth = 0.4;
      x.beginPath();
      x.moveTo(75, 14.5);
      x.lineTo(96, 0.5);
      x.lineTo(117, 14.5);
      x.stroke();
      fillRR(x, 76, 14, 40, 8, 0.3, litV(x, 14, 22, '#ece4d4'));
      signText(x, 'STATE U', 96, 18.2, 4.6, '#6a5a3a');
      x.fillStyle = vgrad(x, 22, 66, ['#2a1e1e', '#4a3a3a']);
      x.fillRect(79, 22, 34, 44);
      fillRR(x, 88, 34, 16, 32, 0.6, litH(x, 88, 104, '#7a5432'));
      seg(x, 96, 34, 96, 66, '#4a321c', 0.4);
      for (const cx of [79, 89, 101, 110]) {
        x.fillStyle = hgrad(x, cx, cx + 4, ['#ffffff', '#f6f0e0', '#d8d0c0', '#b8b0a0']);
        x.fillRect(cx, 22, 4, 44);
      }
      for (let k = 0; k < 3; k++) fillRR(x, 74 - k * 3, 65.6 + k * 2, 44 + k * 6, 2.2, 0.3, litV(x, 65.6 + k * 2, 67.8 + k * 2, k % 2 ? '#d8d0c0' : '#ece4d4'));
      // lawn
      x.fillStyle = vgrad(x, 70, H, ['#4a8a3a', '#5aa04a', '#6ab85a']);
      x.fillRect(0, 70, W, H - 70);
      for (let i = 0; i < 420; i++) {
        const gx = hash(i * 3) * W;
        const gy = 71 + hash(i * 7) ** 0.8 * 37;
        const s = 0.4 + (gy - 70) / 40;
        seg(x, gx, gy, gx + (hash(i) - 0.5) * s, gy - s * 1.6, rgba(hash(i * 5) > 0.5 ? '#8ad070' : '#3a7a2a', 0.6), 0.25 + s * 0.15);
      }
      // path widening toward the viewer
      poly(x, [82, 72, 110, 72, 136, H, 56, H], lgrad(x, 0, 72, 0, H, [[0, '#c8b898'], [1, '#e0d0b0']]));
      for (let k = 0; k < 7; k++) {
        const yy = 74 + k * k * 0.7 + k * 2;
        const f = (yy - 72) / (H - 72);
        seg(x, 96 - 14 - f * 26, yy, 96 + 14 + f * 26, yy, rgba('#a89878', 0.6), 0.3, 'butt');
      }
      fillRR(x, 0, 73.4, W, 2, 0.3, rgba('#ccbc9c', 0.9));
      for (const lx of [44, 148]) {
        softShadow(x, lx + 1, 74, 4, 1, 0.4);
        fillRR(x, lx, 40, 2, 34, 0.6, litH(x, lx, lx + 2, '#3a3a44'));
        fillRR(x, lx - 2.4, 36.4, 6.8, 4.6, 1.2, rgrad(x, lx, 37.5, 5, [[0, '#ffffff'], [1, '#d8d4c8']]));
      }
    },
    anim2: (x, t) => {
      clockHD(x, 96, 8, 3, t, '#c9a032');
      for (const lx of [44, 148]) {
        const fl = Math.sin(t * 5 + lx) * 0.8;
        poly(x, [lx + 2, 44, lx + 8 + fl, 44.5, lx + 8 + fl * 1.3, 54.5, lx + 2, 54], lgrad(x, lx + 2, 0, lx + 8, 0, [[0, '#3a70c0'], [1, '#1e4a88']]));
        poly(x, [lx + 2, 50, lx + 8 + fl, 50.3, lx + 8 + fl, 52.3, lx + 2, 52], '#f2c230');
      }
      treeHD(x, 14, 76, 44, t);
      treeHD(x, 178, 76, 46, t + 1);
      for (let i = 0; i < 3; i++) {
        const dir = i % 2 ? -1 : 1;
        const pos = (t * (6 + i * 2) + i * 60) % (W + 20);
        const sx = dir > 0 ? pos - 10 : W + 10 - pos;
        drawPersonHD(x, extra([1, 4, 2][i], i, i * 3, ['#e0503c', '#3f7fd8', '#f2b632'][i], { pants: '#2a3a5a' }), sx, 75.5, { t, walk: t * 1.6 + i, face: dir, scale: 0.36, shadow: true });
      }
    },
  };
}

export const TOWN_SCENES = { street, carlot, campus };

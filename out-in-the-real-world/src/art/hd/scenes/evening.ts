// HD evening & event scenes: house party, open road at sunset, night street,
// beach at golden hour, graduation stage.
import type { Person } from '../../people.ts';
import {
  box,
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
  mix,
  poly,
  rgba,
  rgrad,
  seg,
  shade,
  signText,
  skyHD,
  softShadow,
  vgrad,
  wallHD,
  baseboardHD,
  woodFloorHD,
  W,
  type Ctx,
} from '../kit.ts';
import { drawPersonHD } from '../person.ts';
import { extra } from './civic.ts';
import { carHD, deskHD, moonHD, posterHD, stars, view } from './common.ts';
import { skylineHD, trafficHD } from './town.ts';
import type { HDSpec } from './types.ts';

const dimP = (p: Person, f: number, tint = '#3a2a6a'): Person => ({
  ...p,
  skin: mix(shade(p.skin, f), tint, 0.25),
  hair: mix(shade(p.hair, f), tint, 0.25),
  shirt: mix(shade(p.shirt, f), tint, 0.25),
  pants: mix(shade(p.pants, f), tint, 0.25),
  shoes: mix(shade(p.shoes ?? '#2a2a33', f), tint, 0.25),
});

// ---------- party ----------
function speaker(x: Ctx, sx: number): void {
  softShadow(x, sx + 7, 82, 9, 1.6, 0.45);
  fillRR(x, sx, 56, 14, 26, 1.4, litH(x, sx, sx + 14, '#2a2a36', 1.3, 0.7));
  ell(x, sx + 7, 63, 3, 3, rgrad(x, sx + 6, 62, 4, [[0, '#5a5a6a'], [1, '#1a1a22']]));
}
function party(): HDSpec {
  return {
    player: 62,
    npc: 118,
    floor: 98,
    horizon: 82,
    fog: 0.1,
    fogColor: '#5a3a8a',
    bloom: 1.3,
    ambient: [0.78, 0.7, 0.98],
    lights: (t) => [
      { x: 96, y: 30, r: 90, ry: 60, c: [1.05, 0.95, 1.05] },
      { x: 96 + Math.sin(t) * 40, y: 88, r: 50, ry: 20, c: [1.1, 0.9, 1.1] },
    ],
    windows: [[71, 15, 34, 24]],
    bg: (x) => {
      wallHD(x, '#3a2a5a', 82, (c) => {
        for (let i = 0; i < W; i += 10) box(c, i, 0, 0.6, 82, rgba('#2a1a46', 0.6));
      });
      skyHD(x, 0, 12, ['#1c1430', 'rgba(58,42,90,0)']);
      baseboardHD(x, 82, '#2a1a40');
      woodFloorHD(x, 82, '#5a3a5a', { sheen: 0.3 });
      fillRR(x, 69.5, 13.5, 37, 27, 0.8, '#1a1228');
      posterHD(x, 12, 14, 16, 22, '#e0503c', '#ffe27a', 'bolt');
      posterHD(x, 120, 16, 20, 14, '#2a8a8a', '#ffe27a', 'star');
      for (const sx of [32, 146]) speaker(x, sx);
      // snack table
      deskHD(x, 158, 66, 32, '#c08a5a', '#a06a3a', 14);
      x.beginPath();
      x.ellipse(170, 64.6, 8, 2.6, 0, 0, Math.PI * 2);
      x.fillStyle = rgrad(x, 168, 63.6, 8, [[0, '#ffd060'], [1, '#c88a18']]);
      x.fill();
      for (let k = 0; k < 6; k++) ell(x, 165 + k * 2, 63.6 + (k % 2) * 0.8, 0.9, 0.6, '#c0392b');
      for (const cx of [180, 184.5]) {
        fillRR(x, cx, 60.6, 3.2, 5, 0.8, litH(x, cx, cx + 3.2, '#e0303c'));
        ell(x, cx + 1.6, 60.7, 1.6, 0.5, '#ffffff');
      }
    },
    anim: (x, t) => {
      view(x, t, 71, 15, 34, 24, true, { seed: 77, moon: [98, 21] });
      // string lights
      const ly = (i: number): number => 4 + Math.sin((i / 15) * Math.PI) * 4;
      x.beginPath();
      for (let i = 0; i < 16; i++) x.lineTo(5 + i * 12, ly(i));
      x.strokeStyle = '#1c1430';
      x.lineWidth = 0.4;
      x.stroke();
      for (let i = 0; i < 16; i++) {
        const c = ['#ff6ab0', '#6ae0ff', '#ffe96a', '#8aff6a'][(i + Math.floor(t * 3)) % 4];
        ell(x, 5 + i * 12, ly(i) + 1, 1, 1.3, rgrad(x, 4.7 + i * 12, ly(i) + 0.6, 1.5, [[0, '#ffffff'], [1, c]]));
        glowHD(x, 5 + i * 12, ly(i) + 1, 7, c, 0.4);
      }
      // disco ball + sparkles
      seg(x, 96, 0, 96, 6, '#8a8a9a', 0.4);
      ell(x, 96, 9, 3.4, 3.4, rgrad(x, 95, 8, 4, [[0, '#ffffff'], [0.5, '#c8c8d8'], [1, '#6a6a7a']]));
      glowHD(x, 95 + Math.sin(t * 4) * 1.5, 8.2, 4, '#ffffff', 0.7);
      for (let i = 0; i < 18; i++) {
        const a = t * 0.8 + i * 0.9;
        const sx = 96 + Math.cos(a) * (40 + hash(i) * 50);
        const sy = 30 + Math.sin(a * 1.3 + i) * 18 + hash(i * 3) * 20;
        const c = ['#ff6ab0', '#6ae0ff', '#ffe96a', '#ffffff'][i % 4];
        if (sy < 80) {
          ell(x, sx, sy, 0.9, 0.5, c);
          glowHD(x, sx, sy, 3, c, 0.35);
        }
      }
      const beat = Math.abs(Math.sin(t * Math.PI * 2));
      for (const sx of [32, 146]) {
        ell(x, sx + 7, 74, 4 + beat * 0.8, 4 + beat * 0.8, rgrad(x, sx + 6, 73, 5, [[0, '#6a6a7a'], [0.7, '#3a3a48'], [1, '#1a1a22']]));
        ell(x, sx + 7, 74, 1, 1, '#0a0a10');
      }
      const d = [extra(1, 4, 1, '#3caa6a'), extra(3, 0, 6, '#f2b632'), extra(0, 3, 8, '#2fb5b0')];
      [17, 91, 139].forEach((dx, i) =>
        drawPersonHD(x, dimP(d[i], 0.62), dx, 84 - Math.abs(Math.sin(t * Math.PI * 2 + i)) * 1.2, { t: t + i, face: dx < 96 ? 1 : -1, gesture: Math.floor(t * 2 + i) % 3 === 0 ? 1 : 0, scale: 0.86 }),
      );
    },
    fgAnim: (x, t) => {
      [
        [12, dimP(extra(2, 3, 0, '#3caa6a'), 0.85)],
        [178, dimP(extra(5, 0, 7, '#e0503c'), 0.85)],
      ].forEach(([cx, p], i) => drawPersonHD(x, p as Person, cx as number, 110 - Math.abs(Math.sin(t * 4 + i)) * 1, { t: t + i * 2, face: (cx as number) < 96 ? 1 : -1, scale: 1.05, shadow: false }));
      // colored wash from the lights
      x.save();
      x.globalCompositeOperation = 'screen';
      const hue = ['#ff3a9a', '#3ac8ff', '#ffd23a'][Math.floor(t * 0.7) % 3];
      lightPool(x, 96 + Math.sin(t) * 40, 92, 50, 10, hue, 0.18);
      x.restore();
    },
  };
}

// ---------- road ----------
function road(): HDSpec {
  return {
    player: 60,
    npc: 122,
    floor: 98,
    horizon: 56,
    fog: 0.16,
    fogColor: '#ffb890',
    bloom: 1.2,
    bg: (x) => {
      skyHD(x, 0, 58, ['#5a4aa0', '#a85a9a', '#e07a8a', '#ffb070', '#ffe0a0']);
      glowHD(x, 150, 44, 40, '#ffd890', 0.5, 26);
      ell(x, 150, 44, 9, 9, rgrad(x, 150, 44, 9, [[0, '#ffffe8'], [0.7, '#fff0b0'], [1, '#ffd070']]));
    },
    anim: (x, t) => {
      for (let k = 0; k < 3; k++) {
        const cw = 16 + hash(9 + k) * 12;
        const cx = ((t * 0.5 * (1.2 + k * 0.5) + hash(27 + k) * (W + cw * 2)) % (W + cw * 2)) - cw;
        cloudHD(x, cx, 10 + k * 7, cw, '#ffd0b8', '#d87a8a');
      }
    },
    mid: (x) => {
      // two ranges of hills, the far one hazier
      for (const [base, amp, f1, f2, c, hz] of [
        [52, 14, 17, 7, '#9a7aaa', 0.35],
        [52, 8, 11, 5, '#6a5a7a', 0.15],
      ] as const) {
        x.beginPath();
        x.moveTo(0, base);
        for (let i = 0; i <= W; i += 2) x.lineTo(i, base - (amp + Math.sin(i / f1 + (amp > 10 ? 0 : 2)) * (amp * 0.45) + Math.sin(i / f2) * 1.5));
        x.lineTo(W, base);
        x.closePath();
        x.fillStyle = vgrad(x, base - amp * 1.5, base, [mix(c, '#ffb890', hz), c]);
        x.fill();
      }
      x.fillStyle = vgrad(x, 50, 60, ['#9a9a5a', '#7a8a4a']);
      x.fillRect(0, 50, W, 10);
      // fence
      for (let i = 0; i < W; i += 9) fillRR(x, i, 51.5, 1, 6.5, 0.3, '#5a4a3a');
      seg(x, 0, 54, W, 54, '#5a4a3a', 0.5);
      // telephone poles + sagging wires
      for (const px of [24, 104, 184]) {
        fillRR(x, px, 16, 2, 42, 0.6, litH(x, px, px + 2, '#5a4030'));
        fillRR(x, px - 5, 19, 12, 1.6, 0.4, '#4a3424');
      }
      x.strokeStyle = '#2a1a1a';
      x.lineWidth = 0.3;
      for (const [a, b] of [
        [24, 104],
        [104, 184],
      ]) {
        x.beginPath();
        x.moveTo(a, 20);
        x.quadraticCurveTo((a + b) / 2, 32, b, 20);
        x.stroke();
      }
      // road
      fillRR(x, 0, 57.6, W, 2.4, 0.3, '#c8c0b0');
      x.fillStyle = vgrad(x, 60, 76, ['#3e3e48', '#54545e']);
      x.fillRect(0, 60, W, 16);
      for (let i = 0; i < W; i += 20) fillRR(x, i, 66.8, 10, 1, 0.4, '#f2e27a');
      box(x, 0, 76, W, 1, '#e8e0d0');
      // gravel shoulder
      x.fillStyle = vgrad(x, 77, H, ['#7a6a58', '#8a7a64', '#9a8a70']);
      x.fillRect(0, 77, W, H - 77);
      for (let i = 0; i < 180; i++) ell(x, hash(i * 3) * W, 78 + hash(i * 7) * 30, 0.4 + hash(i) * 0.8, 0.3, rgba(hash(i * 5) > 0.5 ? '#b8a888' : '#5a4a3a', 0.6));
      for (let i = 0; i < 60; i++) {
        const gx = hash(i * 7 + 1) * W;
        seg(x, gx, 78, gx + (hash(i) - 0.5) * 1.4, 75 - hash(i * 3) * 2.4, '#7a8a4a', 0.4);
      }
      // warm sunset kicker across the ground
      x.save();
      x.globalCompositeOperation = 'screen';
      x.fillStyle = hgrad(x, 0, W, ['rgba(255,160,90,0)', 'rgba(255,170,100,0.18)']);
      x.fillRect(0, 50, W, H - 50);
      x.restore();
    },
    anim2: (x, t) => trafficHD(x, t, 59, 2, 2),
    fg: (x) => {
      fillRR(x, 14, 66, 1.2, 16, 0.4, '#8a8a9a');
      fillRR(x, 10, 60, 10, 7, 1, vgrad(x, 60, 67, ['#3caa6a', '#1f6a3a']));
      signText(x, '12', 15, 63.6, 4.4, '#ffffff');
      // broken-down car, hood up
      carHD(x, 150, 73, '#3caa6a', true, 36);
      poly(x, [148.5, 72.5, 156, 64.6, 162, 66.4, 156, 73], lgrad(x, 148, 64, 162, 73, [[0, '#6ad88a'], [1, '#1f7a40']]));
    },
    fgAnim: (x, t) => {
      const on = Math.floor(t * 3) % 2 === 0;
      for (const hx of [151, 184]) {
        ell(x, hx, 81.6, 1.4, 0.9, on ? '#ffb020' : '#7a5010');
        if (on) glowHD(x, hx, 81.6, 6, '#ffd060', 0.45);
      }
      for (let i = 0; i < 4; i++) {
        const s = (t * 4 + i * 4) % 15;
        ell(x, 155 + Math.sin(s + i) * 2, 70 - s, 1 + s * 0.2, 1 + s * 0.2, `rgba(200,192,192,${(0.6 - s * 0.035).toFixed(2)})`);
      }
    },
  };
}

// ---------- night street ----------
function night(): HDSpec {
  return {
    player: 60,
    npc: 126,
    floor: 98,
    horizon: 64,
    fog: 0.12,
    fogColor: '#2a2a5a',
    bloom: 1.2,
    ambient: [0.62, 0.64, 0.92],
    lights: (t) => {
      const flash = Math.floor(t * 4) % 2;
      return [
        { x: 29, y: 70, r: 58, ry: 44, c: [1.12, 1.02, 0.82] },
        { x: 156, y: 66, r: 56, ry: 40, c: flash ? [0.8, 0.9, 1.25] : [1.2, 0.8, 0.82] },
      ];
    },
    bg: (x) => {
      skyHD(x, 0, 66, ['#06061c', '#0e0e2e', '#1a1a46', '#2a2860']);
      moonHD(x, 160, 14, 5);
    },
    anim: (x, t) => stars(x, t, 0, 0, W, 40, 34, 5),
    mid: (x) => {
      skylineHD(x, 64, '#1a1a32', 11, '#ffe9a0', 0.7, true, true);
      x.fillStyle = vgrad(x, 64, 76, ['#1c1c26', '#2a2a34']);
      x.fillRect(0, 64, W, 12);
      for (let i = 0; i < W; i += 16) fillRR(x, i, 69.6, 8, 0.9, 0.4, '#6a6a3a');
      fillRR(x, 0, 75.6, W, 2.4, 0.3, '#4a4a54');
      concreteHD(x, 78, '#34343e', { horizon: 30, joint: 30 });
      // street lamp with its pool
      softShadow(x, 29, 86, 6, 1.2, 0.5);
      fillRR(x, 28, 30, 2, 56, 0.6, litH(x, 28, 30, '#2a2a33'));
      fillRR(x, 23.6, 25.6, 10.8, 5, 1.6, litV(x, 25.6, 30.6, '#22222c'));
      ell(x, 29, 30.4, 4.2, 0.9, '#fff2c0');
      coneHD(x, 29, 31, 94, 7, 50, '#ffe9a0', 0.24);
      lightPool(x, 29, 92, 30, 7, '#ffe0a0', 0.45);
      glowHD(x, 29, 30, 14, '#ffe9a0', 0.5);
      fillRR(x, 25, 84, 8, 3, 0.8, '#1a1a22');
    },
    anim2: (x, t) => {
      for (let i = 0; i < 4; i++) {
        const on = (Math.floor(t / 2) + i * 3) % 5 < 3;
        const wx = 20 + i * 44 + (i % 2) * 6;
        const wy = 40 + (i % 3) * 5;
        box(x, wx, wy, 2, 2, on ? '#ffe9a0' : '#1a1a32');
        if (on) glowHD(x, wx + 1, wy + 1, 4, '#ffd880', 0.4);
      }
      for (let i = 0; i < 3; i++) {
        const mx = 29 + Math.cos(t * 3 + i * 2) * 4;
        const my = 34 + Math.sin(t * 4 + i) * 3;
        ell(x, mx, my, 0.4, 0.3, '#f8f0d8');
      }
      // police cruiser with flashing light bar
      const flash = Math.floor(t * 4) % 2;
      carHD(x, 140, 57, '#eeeae0', false, 36);
      box(x, 147, 63.6, 22, 2, '#1c1c24');
      fillRR(x, 149.5, 54.4, 13, 3.6, 1, '#1a1a22');
      fillRR(x, 150.2, 55, 5.6, 2.4, 0.8, flash ? '#6aa8ff' : '#2a2a4a');
      fillRR(x, 156.2, 55, 5.6, 2.4, 0.8, flash ? '#4a1a1a' : '#ff4a4a');
      glowHD(x, flash ? 153 : 159, 56, 12, flash ? '#4a8aff' : '#ff3a3a', 0.6);
    },
    fgAnim: (x, t) => {
      const flash = Math.floor(t * 4) % 2;
      x.save();
      x.globalCompositeOperation = 'screen';
      x.translate(156, 84);
      x.scale(1, 0.4);
      x.fillStyle = rgrad(x, 0, 0, 60, [[0, rgba(flash ? '#4a8aff' : '#ff3a3a', 0.3)], [1, rgba(flash ? '#4a8aff' : '#ff3a3a', 0)]]);
      x.fillRect(-60, -60, 120, 120);
      x.restore();
    },
  };
}

// ---------- beach ----------
function beach(): HDSpec {
  return {
    player: 64,
    npc: 118,
    floor: 100,
    horizon: 50,
    fog: 0.14,
    fogColor: '#ffc8a0',
    bloom: 1.3,
    bg: (x) => {
      skyHD(x, 0, 50, ['#6a4aa8', '#c86aa0', '#ff9a78', '#ffd890']);
      glowHD(x, 140, 46, 46, '#ffd890', 0.55, 24);
      x.save();
      x.beginPath();
      x.rect(0, 0, W, 48.5);
      x.clip();
      ell(x, 140, 48, 14, 14, rgrad(x, 140, 44, 14, [[0, '#fffbe0'], [0.6, '#ffe890'], [1, '#ffc050']]));
      for (let k = 0; k < 3; k++) box(x, 120, 43 + k * 2.2, 40, 0.8, rgba('#ff9a78', 0.7));
      x.restore();
    },
    anim: (x, t) => {
      for (let k = 0; k < 2; k++) {
        const cw = 16 + hash(3 + k) * 12;
        const cx = ((t * 0.4 * (1.2 + k * 0.5) + hash(9 + k) * (W + cw * 2)) % (W + cw * 2)) - cw;
        cloudHD(x, cx, 10 + k * 8, cw, '#ffd0c0', '#d8869a');
      }
      // sailboat on the horizon
      const bx = ((t * 1.5) % (W + 30)) - 15;
      poly(x, [bx, 44.4, bx + 9, 44.4, bx + 7.6, 46.4, bx + 1.2, 46.4], '#3a2a4a');
      poly(x, [bx + 4.4, 36.6, bx + 4.4, 44, bx + 8.6, 44], lgrad(x, bx + 4, 37, bx + 9, 44, [[0, '#ffffff'], [1, '#e8d0c0']]));
      for (let i = 0; i < 2; i++) {
        const gx = ((t * (6 + i * 3) + i * 90) % (W + 20)) - 10;
        const gy = 16 + i * 8 + Math.sin(t * 2 + i) * 2;
        const fl = Math.sin(t * 8 + i * 2) * 1.2;
        x.beginPath();
        x.moveTo(gx - 2.4, gy - fl);
        x.quadraticCurveTo(gx - 1, gy - 0.8, gx, gy);
        x.quadraticCurveTo(gx + 1, gy - 0.8, gx + 2.4, gy - fl);
        x.strokeStyle = '#2a1e30';
        x.lineWidth = 0.45;
        x.stroke();
      }
    },
    mid: (x) => {
      x.fillStyle = vgrad(x, 48, 72, ['#4a6ab0', '#3a8ad0', '#5ab0e4']);
      x.fillRect(0, 48, W, 24);
      // sand
      x.fillStyle = vgrad(x, 72, H, ['#e0c088', '#f0d4a0', '#f8e0b0']);
      x.fillRect(0, 72, W, H - 72);
      for (let i = 0; i < 260; i++) ell(x, hash(i * 3) * W, 73 + hash(i * 7) * 35, 0.3 + hash(i) * 0.5, 0.2, rgba(hash(i * 5) > 0.5 ? '#fff4d8' : '#c8a070', 0.6));
      ell(x, 32, 87, 26, 4, rgba('#b89060', 0.35));
      // umbrella
      softShadow(x, 38, 89, 20, 3, 0.35);
      fillRR(x, 30.2, 49, 1.6, 39, 0.5, litH(x, 30, 32, '#6a4a3a'));
      x.save();
      x.beginPath();
      x.moveTo(31, 46);
      x.quadraticCurveTo(14, 47, 9.5, 55.6);
      x.lineTo(52.5, 55.6);
      x.quadraticCurveTo(48, 47, 31, 46);
      x.closePath();
      x.clip();
      for (let k = -6; k < 7; k++) poly(x, [31, 46, 31 + k * 4, 56, 31 + (k + 1) * 4, 56], k % 2 ? '#f2efe6' : '#e0503c');
      x.fillStyle = vgrad(x, 46, 56, ['rgba(255,255,255,0.25)', 'rgba(0,0,0,0.25)']);
      x.fillRect(9, 46, 44, 10);
      x.restore();
      // towel + cooler
      x.save();
      x.beginPath();
      x.moveTo(9, 91.5);
      x.lineTo(43, 91.5);
      x.lineTo(44.5, 99.5);
      x.lineTo(7.5, 99.5);
      x.closePath();
      x.clip();
      for (let k = 0; k < 40; k += 6) {
        box(x, 6 + k, 91, 3, 9, '#3f7fd8');
        box(x, 9 + k, 91, 3, 9, '#f2efe6');
      }
      x.restore();
      softShadow(x, 50, 95.5, 8, 1.4, 0.4);
      fillRR(x, 44, 86, 12, 9, 1.2, litH(x, 44, 56, '#2fb5b0'));
      fillRR(x, 43.6, 85.4, 12.8, 2.6, 1, litV(x, 85.4, 88, '#f2efe6'));
      // sandcastle
      softShadow(x, 171, 92.5, 10, 1.4, 0.35);
      for (let k = 0; k < 3; k++) fillRR(x, 162 + k * 2, 88 - k * 4, 18 - k * 4, 4.4, 0.6, litH(x, 162 + k * 2, 180 - k * 2, k % 2 ? '#d8b878' : '#e8c890'));
      seg(x, 169.5, 78, 169.5, 74, '#5a3a2a', 0.4);
      poly(x, [169.6, 74, 173, 75, 169.6, 76], '#e0503c');
    },
    anim2: (x, t) => {
      // sun glitter on the water
      for (let j = 50; j < 72; j += 1.6) {
        const w = 18 - (j - 50) * 0.5;
        const off = Math.sin(t * 3 + j) * 2;
        if ((Math.floor(t * 4) + Math.floor(j)) % 3) fillRR(x, 140 - w / 2 + off, j, w * (0.4 + hash(Math.floor(j)) * 0.6), 0.5, 0.25, rgba('#ffe8a0', 0.75));
      }
      for (let i = 0; i < W; i += 12) fillRR(x, i + Math.sin(t * 1.5 + i) * 3, 54 + ((i / 12) % 4) * 4, 7, 0.6, 0.3, rgba('#b8e0f8', 0.7));
      // surf line
      const tide = Math.sin(t * 0.8) * 2;
      x.beginPath();
      x.moveTo(0, H);
      for (let i = 0; i <= W; i += 3) x.lineTo(i, 72 + tide + Math.sin(i / 9 + t) * 1);
      x.lineTo(W, 66);
      x.lineTo(0, 66);
      x.closePath();
      x.save();
      x.clip();
      x.fillStyle = vgrad(x, 68, 75, ['rgba(90,176,228,0)', 'rgba(200,236,250,0.7)']);
      x.fillRect(0, 66, W, 10);
      x.restore();
      x.beginPath();
      for (let i = 0; i <= W; i += 3) x.lineTo(i, 72 + tide + Math.sin(i / 9 + t) * 1);
      x.strokeStyle = 'rgba(255,255,255,0.9)';
      x.lineWidth = 0.7;
      x.stroke();
      // wet sand sheen
      x.fillStyle = vgrad(x, 72 + tide, 77 + tide, ['rgba(160,130,90,0.35)', 'rgba(160,130,90,0)']);
      x.fillRect(0, 72 + tide, W, 5);
    },
  };
}

// ---------- graduation stage ----------
function stage(): HDSpec {
  return {
    player: 70,
    npc: 120,
    floor: 98,
    horizon: 84,
    fog: 0.12,
    fogColor: '#3a2448',
    bloom: 1.3,
    bg: (x) => {
      skyHD(x, 0, 84, ['#140c22', '#2a1a3a', '#3a2448']);
      // back curtain folds
      const g = x.createLinearGradient(20, 0, W - 20, 0);
      for (let k = 0; k <= 24; k++) g.addColorStop(k / 24, k % 2 ? '#4a2a5a' : '#22122e');
      x.fillStyle = g;
      x.fillRect(20, 10, W - 40, 74);
      x.fillStyle = vgrad(x, 10, 84, ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']);
      x.fillRect(20, 10, W - 40, 74);
      // banner
      softShadow(x, 97, 24, 42, 8, 0.35);
      fillRR(x, 55, 16, 82, 13, 1, vgrad(x, 16, 29, ['#ffe27a', '#f2c230', '#c99a18']));
      signText(x, 'CONGRATS!', 96, 22.8, 7.4, '#5a1a2a');
      for (const sx of [62, 130]) {
        poly(x, [sx, 20, sx + 1, 22.4, sx + 3.4, 22.6, sx + 1.6, 24, sx + 2.2, 26.4, sx, 25, sx - 2.2, 26.4, sx - 1.6, 24, sx - 3.4, 22.6, sx - 1, 22.4], '#c0392b');
      }
      // side curtains
      for (const [cx, dir] of [
        [0, 1],
        [W - 24, -1],
      ] as const) {
        const cg = x.createLinearGradient(cx, 0, cx + 24, 0);
        for (let k = 0; k <= 10; k++) cg.addColorStop(k / 10, (k + (dir > 0 ? 0 : 1)) % 2 ? '#c02848' : '#6a1028');
        x.fillStyle = cg;
        x.fillRect(cx, 0, 24, H);
      }
      // valance with gold fringe
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(W, 0);
      for (let i = W; i >= 0; i -= 2) x.lineTo(i, 8 + Math.abs(Math.sin((i / W) * Math.PI * 4)) * 4);
      x.closePath();
      x.fillStyle = vgrad(x, 0, 12, ['#7a1028', '#a02040']);
      x.fill();
      x.beginPath();
      for (let i = 0; i <= W; i += 2) x.lineTo(i, 8.5 + Math.abs(Math.sin((i / W) * Math.PI * 4)) * 4);
      x.strokeStyle = '#f2c230';
      x.lineWidth = 0.8;
      x.stroke();
      woodFloorHD(x, 84, '#8a5a32', { horizon: 30, sheen: 0.35 });
      fillRR(x, 0, 99.6, W, 2.4, 0.3, litV(x, 99.6, 102, '#5a3a20'));
      x.fillStyle = vgrad(x, 102, H, ['#1a0e1e', '#0a0610']);
      x.fillRect(0, 102, W, 6);
    },
    anim: (x, t) => {
      for (let i = 0; i < 3; i++) {
        const cx = 50 + i * 46 + Math.sin(t * 0.7 + i * 2) * 14;
        coneHD(x, cx, 9, 100, 4, 40, '#fff6d0', 0.18);
        lightPool(x, cx, 96, 20, 3.4, '#fff6d0', 0.4);
        fillRR(x, cx - 2.2, 7.6, 4.4, 3.4, 1, '#3a3a44');
        glowHD(x, cx, 10.4, 5, '#fff2c0', 0.6);
      }
    },
    fgAnim: (x, t) => {
      for (let i = 0; i < 30; i++) {
        const cx = 24 + hash(i * 5) * 144 + Math.sin(t * 2 + i) * 3;
        const cy = ((hash(i * 11) * 110 + t * (10 + hash(i) * 8)) % 110) - 4;
        if (cy > 100) continue;
        const rot = t * 4 + i;
        ell(x, cx, cy, 1, 0.5 * Math.abs(Math.cos(rot)) + 0.15, ['#ffe27a', '#ff6ab0', '#6ae0ff', '#8aff6a'][i % 4], rot * 0.3);
      }
      // audience silhouettes with soft rim light
      for (let i = 0; i < 12; i++) {
        const hx = 6 + i * 16 + (i % 2) * 4;
        const bob = Math.abs(Math.sin(t * 3 + i)) * 1;
        ell(x, hx, 112 - bob, 9, 8, '#0a0610');
        ell(x, hx, 104.5 - bob, 4.6, 5, '#0a0610');
        x.beginPath();
        x.ellipse(hx, 104.5 - bob, 4.6, 5, 0, Math.PI * 1.1, Math.PI * 1.9);
        x.strokeStyle = 'rgba(255,220,160,0.35)';
        x.lineWidth = 0.4;
        x.stroke();
        if (i % 3 === 0) {
          const wave = Math.sin(t * 6 + i) * 0.4;
          x.save();
          x.translate(hx - 6, 104 - bob);
          x.rotate(-0.4 + wave);
          fillRR(x, -1, -8, 2.2, 9, 1, '#0a0610');
          x.restore();
        }
      }
    },
  };
}

export const EVENING_SCENES = { party, road, night, beach, stage };

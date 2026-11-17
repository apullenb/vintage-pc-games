// HD home scenes (with night variants): childhood bedroom, dorm, first apartment.
// Same layouts as the pixel paintings, repainted with smooth shading and light.
import type { RGB } from '../../px.ts';
import {
  baseboardHD,
  block,
  box,
  box3,
  coneHD,
  curtainsHD,
  ell,
  fillRR,
  frameArt,
  glowHD,
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
  rr,
  screenHD,
  seg,
  shade,
  signText,
  softShadow,
  tileFloorHD,
  vgrad,
  wainscotHD,
  wallHD,
  windowHD,
  woodFloorHD,
  W,
  type Ctx,
} from '../kit.ts';
import { bookRowHD, deskHD, lampHD, posterHD, shelfHD, view } from './common.ts';
import type { HDSpec } from './types.ts';

const MOON: RGB = [0.7, 0.78, 1.05];
const frameOf = (t: number, fps: number): number => Math.floor(t * fps);

function rugHD(x: Ctx, cx: number, cy: number, rx: number, ry: number, c: string, trim: string): void {
  softShadow(x, cx, cy + 0.8, rx + 2, ry + 1, 0.2);
  ell(x, cx, cy, rx, ry, trim);
  ell(x, cx, cy, rx - 1.6, ry - 1.1, rgrad(x, cx - rx * 0.3, cy - ry * 0.4, rx, [[0, shade(c, 1.15)], [1, shade(c, 0.85)]]));
  x.beginPath();
  x.ellipse(cx, cy, rx - 4.5, ry - 3, 0, 0, Math.PI * 2);
  x.strokeStyle = rgba('#f0b0b0', 0.55);
  x.lineWidth = 0.6;
  x.setLineDash([1.6, 1.2]);
  x.stroke();
  x.setLineDash([]);
}

// ---------- bedroom ----------
function bedroom({ night }: { night: boolean }): HDSpec {
  return {
    player: 60,
    npc: 120,
    floor: 96,
    horizon: 76,
    fog: 0.06,
    fogColor: night ? '#4a4a80' : '#dfe4f4',
    windows: [[124, 12, 34, 26]],
    bg: (x) => {
      wallHD(x, '#86b0d4', 76, (c) => {
        for (let j = 4; j < 72; j += 8)
          for (let i = (j / 8) % 2 ? 4 : 0; i < W; i += 8) ell(c, i, j, 0.7, 0.7, rgba('#6a94bc', 0.5));
      });
      baseboardHD(x, 76, '#ece4d4');
      woodFloorHD(x, 76, '#b07a4a');
      rugHD(x, 100, 93, 44, 7.4, '#c0485a', '#8a2a3a');
      windowHD(x, 124, 12, 34, 26);
      posterHD(x, 14, 12, 18, 24, '#2a2a5a', '#7fd0d8', 'mountain');
      posterHD(x, 36, 18, 12, 16, '#e0503c', '#f2b632', 'bolt');
      // GRAD pennant
      softShadow(x, 76, 16, 16, 5, 0.18);
      poly(x, [62, 10, 88, 10, 95, 14.5, 88, 19, 62, 19], lgrad(x, 62, 10, 62, 19, [[0, '#4cc27a'], [1, '#2a8a50']]));
      signText(x, 'GRAD', 75, 14.8, 5.4, '#ffffff');
      // corkboard with notes
      fillRR(x, 91, 21, 26, 18, 0.8, litV(x, 21, 39, '#8a5a34'));
      fillRR(x, 92.5, 22.5, 23, 15, 0.4, rgrad(x, 98, 26, 20, [[0, '#d8aa74'], [1, '#b0844e']]));
      for (let i = 0; i < 40; i++) ell(x, 93 + hash(i) * 21, 23 + hash(i * 3) * 13, 0.25, 0.25, 'rgba(110,70,30,0.4)');
      const note = (nx: number, ny: number, w: number, h: number, c: string, r: number): void => {
        x.save();
        x.translate(nx + w / 2, ny + h / 2);
        x.rotate(r);
        softShadow(x, 0.6, 0.8, w * 0.6, h * 0.6, 0.25);
        fillRR(x, -w / 2, -h / 2, w, h, 0.2, c);
        x.restore();
      };
      note(95, 25, 7, 5, '#f2efe6', -0.06);
      fillRR(x, 96, 26, 5, 3, 0.2, '#6ab0e0');
      note(104, 24, 6, 7, '#f2efe6', 0.08);
      note(98, 31, 9, 5, '#f8f4a0', 0.03);
      for (const [a, b] of [[98, 25], [107, 24], [102, 31]]) ell(x, a, b, 0.6, 0.6, '#e0503c');
      // shelf with books and a trophy
      shelfHD(x, 7, 40, 40);
      bookRowHD(x, 10, 40, 18, 5, 8);
      fillRR(x, 34.4, 38, 4, 2, 0.4, litH(x, 34, 38.5, '#c99a18'));
      x.beginPath();
      x.moveTo(33.4, 33);
      x.lineTo(39.6, 33);
      x.quadraticCurveTo(39.4, 37.6, 36.5, 38);
      x.quadraticCurveTo(33.6, 37.6, 33.4, 33);
      x.fillStyle = lgrad(x, 33, 0, 40, 0, [[0, '#fff0a0'], [0.4, '#f2c230'], [1, '#a87a10']]);
      x.fill();
      // bed
      softShadow(x, 28, 84, 30, 3.5, 0.45);
      fillRR(x, 2, 46, 6, 39, 1.2, litH(x, 2, 8, '#8a5a34'));
      ell(x, 5, 46.5, 3, 1.2, '#a8744a');
      block(x, 3, 76.5, 50, 6.5, '#8a5a34', 0.8);
      fillRR(x, 4, 82, 3, 3, 0.5, '#5a3a20');
      fillRR(x, 49, 82, 3, 3, 0.5, '#5a3a20');
      fillRR(x, 3, 60, 50, 17, 2.2, vgrad(x, 60, 77, ['#ffffff', '#f2efe6', '#d0c8b8']));
      // pillow
      x.beginPath();
      x.moveTo(8.5, 59.5);
      x.quadraticCurveTo(15, 54.5, 21.5, 59.5);
      x.quadraticCurveTo(22.5, 62.6, 21, 63);
      x.lineTo(9, 63);
      x.quadraticCurveTo(7.5, 62.6, 8.5, 59.5);
      x.fillStyle = rgrad(x, 13, 57, 9, [[0, '#ffffff'], [1, '#c8c8d8']]);
      x.fill();
      // blanket with soft folds
      x.beginPath();
      x.moveTo(20, 61.5);
      x.quadraticCurveTo(36, 59.8, 53.5, 61);
      x.lineTo(53.5, 78);
      x.quadraticCurveTo(36, 79.5, 19.5, 78);
      x.closePath();
      x.fillStyle = lgrad(x, 20, 60, 30, 79, [[0, '#7aa8f4'], [0.35, '#4a80dc'], [1, '#2a4e9a']]);
      x.fill();
      x.save();
      x.clip();
      for (let k = 0; k < 6; k++) {
        x.fillStyle = hgrad(x, 22 + k * 6, 25 + k * 6, ['rgba(255,255,255,0)', 'rgba(255,255,255,0.14)', 'rgba(0,0,0,0)']);
        x.fillRect(22 + k * 6, 60, 3, 20);
      }
      x.restore();
      seg(x, 20, 61.6, 53.5, 61.1, '#a8c8ff', 0.6);
      // dresser + lamp + clock
      softShadow(x, 176, 78, 16, 2.6, 0.45);
      box3(x, 164, 56, 24, 21, 2.2, '#c08a5a', 0.8);
      for (const yy of [63.5, 69.5]) seg(x, 165.5, yy, 186.5, yy, rgba('#5a3018', 0.6), 0.5, 'butt');
      for (const yy of [60, 66, 72.5]) ell(x, 176, yy, 1.2, 0.6, lgrad(x, 175, yy - 0.6, 177, yy + 0.6, [[0, '#ffe8a0'], [1, '#b08a30']]));
      lampHD(x, 166, 42, night ? '#ffe8a0' : '#f2d48a', night);
      fillRR(x, 177, 50, 10, 6, 1, litV(x, 50, 56, '#3a3a48'));
      fillRR(x, 178, 51, 8, 4, 0.6, '#14141c');
    },
    anim: (x, t) => {
      view(x, t, 124, 12, 34, 26, night, {
        seed: 11,
        moon: [150, 18],
        scenery: (c) => {
          c.fillStyle = vgrad(c, 32, 38, night ? ['#1a1a34', '#101024'] : ['#6a9a6a', '#4a7a4a']);
          c.fillRect(124, 32, 34, 6);
          // neighbor's house
          box(c, 130, 28, 12, 6, night ? '#1c1c34' : '#d8c8b0');
          poly(c, [128, 28.4, 136, 23.5, 144, 28.4], night ? '#22223c' : '#b05040');
          if (night) {
            box(c, 134.5, 29.5, 2.2, 2.2, '#ffe9a0');
            glowHD(c, 135.6, 30.6, 3, '#ffd880', 0.4);
          } else box(c, 134.5, 29.5, 2.2, 2.2, '#8ab0d8');
        },
      });
      curtainsHD(x, 124, 12, 34, 26, '#d8563c');
      // alarm clock digits
      const blink = frameOf(t, 2) % 2 === 0;
      signText(x, night ? '11:42' : '7:02', 182, 53.2, 3.4, '#ff5a3a', 'center', 700);
      if (blink) glowHD(x, 182, 53, 6, '#ff4a2a', 0.18);
      // cat on the bed: breathing, tail swish, slow blinks
      const br = Math.sin(t * 2.4) * 0.35;
      const sw = Math.sin(t * 2.2) * 2;
      x.beginPath();
      x.moveTo(34, 59.5);
      x.quadraticCurveTo(31, 59 + sw * 0.5, 29.5, 57.5 + sw);
      x.strokeStyle = '#d8843a';
      x.lineWidth = 1.3;
      x.lineCap = 'round';
      x.stroke();
      ell(x, 39, 58.2 - br * 0.5, 6.2, 3.4 + br, rgrad(x, 37, 56, 7, [[0, '#ffc080'], [0.6, '#e8954a'], [1, '#a85a20']]));
      ell(x, 44, 56.2, 2.8, 2.4, rgrad(x, 43.2, 55.4, 3.2, [[0, '#ffc080'], [1, '#c8743a']]));
      poly(x, [42, 55, 42.6, 52.6, 43.8, 54.4], '#d8843a');
      poly(x, [44.4, 54.4, 45.6, 52.6, 46.2, 55], '#d8843a');
      if (frameOf(t, 8) % 29 < 2) seg(x, 43, 56.3, 44, 56.3, '#2a1a10', 0.3);
      else {
        ell(x, 43.2, 56.1, 0.32, 0.42, '#2a1a10');
        ell(x, 45.0, 56.1, 0.32, 0.42, '#2a1a10');
      }
      if (night) coneHD(x, 170, 47, 76, 7, 26, '#ffe0a0', 0.18);
    },
    lights: night
      ? (t) => [
          { x: 170, y: 50, r: 70, ry: 54, c: [1.12, 0.96, 0.74] },
          { x: 141, y: 28, r: 26, c: MOON },
          { x: 182, y: 53, r: 8 + (frameOf(t, 2) % 2), c: [1.0, 0.5, 0.5] },
        ]
      : undefined,
  };
}

// ---------- dorm ----------
function dorm({ night }: { night: boolean }): HDSpec {
  const lightsX = [54, 70, 86, 102, 118, 134, 150, 166, 182];
  const ly = (i: number): number => 5 + Math.sin((i / (lightsX.length - 1)) * Math.PI) * 3;
  return {
    player: 70,
    npc: 130,
    floor: 96,
    horizon: 78,
    fog: 0.06,
    fogColor: night ? '#4a4a80' : '#e4e0d8',
    windows: [[82, 10, 30, 24]],
    bg: (x) => {
      wallHD(x, '#dcd3c2', 78, (c) => {
        // painted cinderblock with soft mortar lines
        for (let j = 0; j < 78; j += 7) {
          box(c, 0, j + 6.2, W, 0.6, rgba('#a89c86', 0.55));
          box(c, 0, j, W, 0.5, rgba('#ffffff', 0.25));
          const off = (j / 7) % 2 ? 8 : 0;
          for (let i = off; i < W; i += 16) box(c, i + 15.4, j, 0.6, 6.4, rgba('#a89c86', 0.5));
        }
      });
      baseboardHD(x, 78, '#6a6a7a');
      tileFloorHD(x, 78, '#b8aa94', '#a29480', 12);
      windowHD(x, 82, 10, 30, 24, '#e8e8ec');
      posterHD(x, 54, 12, 16, 22, '#9a5ad0', '#f2efe6', 'star');
      // STATE pennant
      poly(x, [120, 11, 150, 11, 158, 16.5, 150, 22, 120, 22], lgrad(x, 0, 11, 0, 22, [[0, '#e04a3a'], [1, '#9a2418']]));
      signText(x, 'STATE', 135, 16.8, 5.6, '#f2efe6');
      // bunk bed
      softShadow(x, 25, 81, 26, 3.4, 0.45);
      for (const px of [4, 44]) fillRR(x, px - 0.5, 18, 3, 63, 1, litH(x, px - 0.5, px + 2.5, '#9a9aaa'));
      for (const [by, c] of [
        [30, '#3f7fd8'],
        [62, '#e0503c'],
      ] as const) {
        fillRR(x, 3.5, by + 0.5, 43, 3, 0.6, litV(x, by + 0.5, by + 3.5, '#7a7a8a'));
        fillRR(x, 5.5, by - 5, 39, 6, 1.8, vgrad(x, by - 5, by + 1, [shade(c, 1.25), c, shade(c, 0.7)]));
        x.beginPath();
        x.moveTo(8, by - 4.4);
        x.quadraticCurveTo(13, by - 9, 18, by - 4.4);
        x.lineTo(18, by - 2);
        x.lineTo(8, by - 2);
        x.closePath();
        x.fillStyle = rgrad(x, 11.5, by - 6, 6, [[0, '#ffffff'], [1, '#c8c8d8']]);
        x.fill();
      }
      fillRR(x, 29, 23.6, 7, 2.4, 0.3, litV(x, 23.6, 26, '#e8e0c0')); // book on top bunk
      // ladder
      for (let k = 0; k < 5; k++) fillRR(x, 43.5, 35.6 + k * 9, 9, 1.2, 0.5, litV(x, 35.6 + k * 9, 36.8 + k * 9, '#9a9aaa'));
      fillRR(x, 50, 29.5, 2.4, 51, 1, litH(x, 50, 52.4, '#9a9aaa'));
      // laundry basket
      softShadow(x, 28, 82, 9, 1.8, 0.4);
      x.beginPath();
      x.moveTo(20, 70);
      x.lineTo(36, 70);
      x.lineTo(35, 82);
      x.lineTo(21, 82);
      x.closePath();
      x.fillStyle = litH(x, 20, 36, '#f2efe6');
      x.fill();
      for (let k = 0; k < 5; k++) seg(x, 22.5 + k * 3, 72, 22.7 + k * 2.9, 81, rgba('#a8a8b4', 0.6), 0.5);
      ell(x, 25, 69.5, 3.6, 2.2, rgrad(x, 24, 68.5, 4, [[0, '#5ad8d0'], [1, '#1a8a84']]));
      ell(x, 31, 68.8, 3.2, 2.6, rgrad(x, 30, 68, 4, [[0, '#ff8a70'], [1, '#b03020']]));
      // mini fridge + microwave
      softShadow(x, 129, 80.5, 12, 2.2, 0.45);
      box3(x, 120, 62, 18, 18, 1.6, '#e8e8ec', 1.2);
      seg(x, 121, 69, 137, 69, rgba('#8a8a98', 0.7), 0.4);
      fillRR(x, 134.6, 63.5, 1.2, 4.5, 0.5, litH(x, 134.6, 135.8, '#a8a8b8'));
      fillRR(x, 123.5, 71.5, 4, 3.4, 0.6, '#f2b632');
      fillRR(x, 129, 72.5, 3.5, 2.5, 0.6, '#3caa6a');
      block(x, 120, 51.5, 18, 9.5, '#5a5a6a', 1);
      fillRR(x, 121.6, 53, 11, 6.5, 0.6, '#1a1a22');
      // desk + chair + laptop
      deskHD(x, 146, 60, 44, '#a8865e', '#7a5a3a', 20);
      lampHD(x, 180, 46, night ? '#ffe8a0' : '#f2d48a', night);
      // mug + notebook
      fillRR(x, 174, 54, 6, 5.6, 0.4, litH(x, 174, 180, '#f2efe6'));
      seg(x, 174.4, 55.5, 179.4, 55.5, rgba('#3f7fd8', 0.5), 0.3);
      ell(x, 140.5, 60, 0.1, 0.1, '#000');
      // laptop base
      poly(x, [150, 58.4, 172, 58.4, 174, 60, 148, 60], lgrad(x, 0, 58.4, 0, 60, [[0, '#9a9aaa'], [1, '#5a5a6a']]));
    },
    anim: (x, t) => {
      view(x, t, 82, 10, 30, 24, night, {
        seed: 23,
        moon: [104, 16],
        scenery: (c) => {
          c.fillStyle = night ? '#151530' : '#8a7a6a';
          c.fillRect(82, 27, 30, 7);
          for (let k = 0; k < 4; k++) {
            const lit = night ? k % 2 === 1 : false;
            box(c, 85 + k * 7, 29.5, 4, 2.4, night ? (lit ? '#ffe9a0' : '#202040') : '#c8d8e8');
            if (lit) glowHD(c, 87 + k * 7, 30.7, 4, '#ffd880', 0.35);
          }
        },
      });
      // blinds pulled a third down
      for (let k = 0; k < 5; k++) fillRR(x, 81.5, 9.5 + k * 1.7, 31, 1.5, 0.6, vgrad(x, 9.5 + k * 1.7, 11 + k * 1.7, ['#ffffff', '#c8c8d0']));
      // laptop screen
      const sc = night ? '#2a52a8' : '#3f7fd8';
      screenHD(x, 152.5, 47, 17, 11, sc, '#3a3a48');
      x.save();
      x.beginPath();
      x.rect(152.5, 47, 17, 11);
      x.clip();
      const scroll = (t * 3) % 8;
      for (let k = 0; k < 6; k++) fillRR(x, 154.5, 48 + ((k * 2 + 12 - scroll) % 12), 5 + ((k * 5) % 8), 0.9, 0.4, rgba('#e0ecff', 0.8));
      x.restore();
      glowHD(x, 161, 53, 14, '#8ab8ff', night ? 0.3 : 0.12);
      // microwave clock
      if (frameOf(t, 2) % 2) {
        signText(x, '12:00', 127, 56.2, 2.8, '#7fe08a');
        glowHD(x, 127, 56, 5, '#60ff80', 0.15);
      }
      // string lights
      x.beginPath();
      x.moveTo(lightsX[0], ly(0) - 1);
      for (let i = 1; i < lightsX.length; i++) x.quadraticCurveTo((lightsX[i - 1] + lightsX[i]) / 2, Math.max(ly(i - 1), ly(i)) + 0.8, lightsX[i], ly(i) - 1);
      x.strokeStyle = '#3a4a3a';
      x.lineWidth = 0.35;
      x.stroke();
      for (let i = 0; i < lightsX.length; i++) {
        const on = (i + frameOf(t, 1.5)) % 4 !== 0;
        const c = ['#ffe27a', '#ff8ab0', '#8ae0ff'][i % 3];
        ell(x, lightsX[i], ly(i) + 0.6, 1.0, 1.3, on ? rgrad(x, lightsX[i] - 0.3, ly(i), 1.5, [[0, '#ffffff'], [1, c]]) : '#6a6a5a');
        if (on) glowHD(x, lightsX[i], ly(i) + 0.6, night ? 7 : 4, c, night ? 0.4 : 0.22);
      }
      if (night) coneHD(x, 184, 51, 80, 7, 24, '#ffe0a0', 0.16);
    },
    lights: night
      ? (t) => [
          { x: 184, y: 48, r: 54, ry: 44, c: [1.12, 0.96, 0.76] },
          { x: 161, y: 52, r: 22, c: [0.7, 0.85, 1.2] },
          { x: 97, y: 22, r: 22, c: MOON },
          { x: 118, y: 6, r: 40, ry: 14, c: [0.95, 0.85, 0.85 + (frameOf(t, 1.5) % 2) * 0.1] },
        ]
      : undefined,
  };
}

// ---------- apartment ----------
function apartment({ night }: { night: boolean }): HDSpec {
  return {
    player: 64,
    npc: 128,
    floor: 96,
    horizon: 78,
    fog: 0.06,
    fogColor: night ? '#4a4a80' : '#efe2cc',
    windows: [[14, 10, 40, 30]],
    bg: (x) => {
      wallHD(x, '#e2c49a', 78, (c) => {
        for (let i = 0; i < W; i += 12) {
          box(c, i, 0, 0.6, 52, rgba('#c8a878', 0.45));
          for (let j = 2; j < 52; j += 4) ell(c, i + 6, j, 0.35, 0.35, rgba('#c8a878', 0.5));
        }
      });
      wainscotHD(x, 52, 74, '#b88a5a');
      baseboardHD(x, 78, '#8a5a34');
      woodFloorHD(x, 78, '#9a6a44');
      // ceiling crack
      x.beginPath();
      x.moveTo(120, 2);
      x.lineTo(127, 2.6);
      x.lineTo(134, 2.2);
      x.lineTo(135, 6.5);
      x.strokeStyle = rgba('#a08060', 0.6);
      x.lineWidth = 0.35;
      x.stroke();
      windowHD(x, 14, 10, 40, 30);
      // radiator
      softShadow(x, 35, 78, 20, 2, 0.4);
      fillRR(x, 17, 59.5, 36, 18.5, 1, '#9a9aa4');
      for (let k = 0; k < 12; k++) fillRR(x, 17.6 + k * 3, 60.5, 2.4, 16.5, 1.2, litH(x, 17.6 + k * 3, 20 + k * 3, '#e8e8ec', 1.2, 0.72));
      seg(x, 17, 76.8, 53, 76.8, '#7a7a84', 0.6);
      // couch
      softShadow(x, 113, 78, 34, 3.4, 0.5);
      fillRR(x, 85, 46, 56, 16, 3, vgrad(x, 46, 62, ['#5ac486', '#3a9a62', '#2f8050']));
      for (let k = 0; k < 3; k++) {
        const cx = 87 + k * 17.6;
        fillRR(x, cx, 47.6, 16.4, 13, 2.4, rgrad(x, cx + 5, 50, 12, [[0, '#6cd096'], [0.6, '#44aa6c'], [1, '#2f8050']]));
      }
      fillRR(x, 85.5, 60, 55, 9.5, 2.4, vgrad(x, 60, 69.5, ['#7ad09a', '#4ab474', '#2f8a55']));
      for (const sx of [104, 122]) seg(x, sx, 61, sx, 69, rgba('#1f6a40', 0.6), 0.5);
      fillRR(x, 86, 68.5, 54, 8, 1.6, vgrad(x, 68.5, 76.5, ['#3a9a62', '#24704a']));
      for (const ax of [82.5, 135.5]) {
        fillRR(x, ax, 51, 8, 25, 3, litH(x, ax, ax + 8, '#3a9a62'));
        ell(x, ax + 4, 52.4, 3.6, 1.8, rgba('#a8f0c4', 0.3));
      }
      for (const fx of [86, 137]) fillRR(x, fx, 76, 3, 2.4, 0.6, '#4a3020');
      // throw pillow
      x.save();
      x.translate(95, 57);
      x.rotate(-0.12);
      fillRR(x, -4.5, -4, 9, 8, 2.2, rgrad(x, -1.5, -1.5, 7, [[0, '#ffd870'], [1, '#c8901e']]));
      x.restore();
      // framed picture
      frameArt(x, 100, 18, 26, 18, '#6a4a2a', (c) => {
        c.fillStyle = vgrad(c, 19, 34, ['#8ac8f4', '#d8eefc']);
        c.fillRect(100, 18, 26, 18);
        poly(c, [101, 34, 109, 25, 114, 29, 119, 23, 125, 34], lgrad(c, 0, 23, 0, 34, [[0, '#8a9ab8'], [1, '#5a6a88']]));
        c.fillStyle = vgrad(c, 29, 35, ['#6aaa5a', '#3a7a3a']);
        c.fillRect(100, 30, 26, 6);
      });
      // floor lamp
      softShadow(x, 148, 77, 7, 1.4, 0.4);
      ell(x, 148, 76.8, 5, 1.2, litH(x, 143, 153, '#3a3a4a'));
      fillRR(x, 147.2, 31, 1.6, 46, 0.8, litH(x, 147.2, 148.8, '#4a4a5a'));
      poly(x, [141.5, 22, 154.5, 22, 156.5, 32, 139.5, 32], lgrad(x, 139.5, 0, 156.5, 0, [[0, '#fff2cc'], [0.5, night ? '#ffe8b0' : '#f2dca8'], [1, '#c8b080']]));
      // moving box + TV
      softShadow(x, 174, 78, 16, 2.4, 0.45);
      box3(x, 160, 62, 28, 16, 2.4, '#c9a36a', 0.6);
      box(x, 160, 65.4, 28, 2, rgba('#f0e2b8', 0.75));
      signText(x, 'TV', 174, 71.8, 4.2, '#6a4a2a');
      block(x, 161, 43, 26, 19, '#5a5a6a', 1.6);
      seg(x, 168, 43, 164, 36.5, '#2a2a33', 0.4);
      seg(x, 176, 43, 181, 36.5, '#2a2a33', 0.4);
      ell(x, 179.5, 59.6, 0.7, 0.7, '#3caa6a');
      // boxes + plant
      box3(x, 4, 66, 10, 12, 1.4, '#d8b27a', 0.5);
      plantHD(x, 2, 40);
    },
    anim: (x, t) => {
      view(x, t, 14, 10, 40, 30, night, {
        sky: ['#ff9a68', '#ffc488', '#ffe4b4'],
        seed: 41,
        moon: [44, 16],
        scenery: (c) => {
          let k = 0;
          let px = 14;
          while (px < 54) {
            const w = 5 + Math.floor(hash(k + 70) * 7);
            const h = 4 + Math.floor(hash(k * 3 + 71) * 8);
            c.fillStyle = vgrad(c, 40 - h, 40, night ? ['#22224a', '#141430'] : ['#b07878', '#8a5a6a']);
            c.fillRect(px, 40 - h, w, h);
            for (let wy = 40 - h + 1.5; wy < 39; wy += 2.5)
              for (let wx = px + 1; wx < px + w - 1; wx += 2)
                if (hash(wx * 7 + wy * 3) > (night ? 0.5 : 0.8)) {
                  box(c, wx, wy, 1, 1.2, '#ffe9a0');
                  if (night) glowHD(c, wx + 0.5, wy + 0.6, 1.8, '#ffd880', 0.3);
                }
            px += w + 1;
            k++;
          }
        },
      });
      // TV picture
      const f = frameOf(t, 4);
      const tvC = ['#5a8ad8', '#6aa0e8', '#4a7ac8', '#e8a060'][Math.floor(f / 6) % 4];
      screenHD(x, 163.5, 45.5, 21, 14, tvC, '#2a2a33');
      x.save();
      rr(x, 163.5, 45.5, 21, 14, 0.4);
      x.clip();
      ell(x, 169, 55, 4, 5, rgba(shade(tvC, 0.6), 0.8));
      ell(x, 178, 54, 4.6, 6, rgba(shade(tvC, 0.75), 0.8));
      box(x, 163.5, 45.5 + (f % 14), 21, 0.6, rgba('#ffffff', 0.15));
      x.restore();
      glowHD(x, 174, 52, 18, tvC, night ? 0.32 : 0.12);
      if (night) {
        coneHD(x, 148, 31, 78, 15, 52, '#ffe0a0', 0.16);
        lightPool(x, 148, 86, 34, 7, '#ffd890', 0.25);
      }
    },
    lights: night
      ? (t) => [
          { x: 148, y: 32, r: 72, ry: 58, c: [1.14, 0.98, 0.76] },
          { x: 174, y: 52, r: 28 + (frameOf(t, 4) % 3), ry: 22, c: [0.75, 0.85, 1.2] },
          { x: 34, y: 25, r: 26, c: MOON },
        ]
      : undefined,
  };
}

export const HOME_SCENES = { bedroom, dorm, apartment };

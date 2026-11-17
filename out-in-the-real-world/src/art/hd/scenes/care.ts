// HD care scenes: dentist office and urgent-care clinic.
import {
  baseboardHD,
  box,
  box3,
  coneHD,
  ell,
  fillRR,
  glowHD,
  lgrad,
  litH,
  litV,
  poly,
  rgba,
  rgrad,
  seg,
  shade,
  signText,
  softShadow,
  tileFloorHD,
  vgrad,
  wallHD,
  windowHD,
  W,
} from '../kit.ts';
import { lightSign, view } from './common.ts';
import type { HDSpec } from './types.ts';

function dentist(): HDSpec {
  return {
    player: 56,
    npc: 124,
    floor: 98,
    horizon: 80,
    fog: 0.06,
    fogColor: '#e4f4f4',
    bloom: 0.5,
    windows: [[152, 10, 30, 24]],
    bg: (x) => {
      wallHD(x, '#cfeef0', 80);
      // tiled wainscot
      x.fillStyle = vgrad(x, 52, 76, ['#b4e2e6', '#9ad4d8']);
      x.fillRect(0, 52, W, 24);
      for (let j = 52; j < 76; j += 6) {
        box(x, 0, j, W, 0.4, rgba('#7ab8bc', 0.8));
        box(x, 0, j + 0.4, W, 0.4, rgba('#ffffff', 0.4));
        for (let i = (j / 6) % 2 ? 0 : 3; i < W; i += 6) box(x, i, j, 0.4, 6, rgba('#7ab8bc', 0.7));
      }
      fillRR(x, 0, 50.6, W, 1.6, 0.4, litV(x, 50.6, 52.2, '#e8f8f8'));
      baseboardHD(x, 80, '#5a9aa0');
      tileFloorHD(x, 80, '#f2fafa', '#d4e6e6', 12, { sheen: 0.35 });
      windowHD(x, 152, 10, 30, 24, '#f4f8f8');
      // x-ray lightbox frame
      fillRR(x, 10.5, 10.5, 31, 23, 1, litV(x, 10.5, 33.5, '#c8d0d8'));
      // cabinet + aquarium
      softShadow(x, 24, 80, 22, 2.2, 0.4);
      box3(x, 4, 60, 40, 20, 2, '#f4f4f0', 1);
      seg(x, 23.5, 61, 23.5, 79, rgba('#a8a8a4', 0.8), 0.4);
      for (const hx of [19.5, 27.5]) fillRR(x, hx - 1.6, 67.6, 3.2, 1, 0.4, '#8a9aa8');
      fillRR(x, 4.5, 40.5, 39, 20, 1, '#3a4a58');
      // SMILE poster with a tooth
      softShadow(x, 72, 17, 20, 9, 0.2);
      fillRR(x, 54, 6.5, 40, 16, 1, vgrad(x, 6.5, 22.5, ['#ffffff', '#e8f6f6']));
      x.beginPath();
      x.moveTo(57, 9);
      x.quadraticCurveTo(64, 6.5, 71, 9);
      x.quadraticCurveTo(72, 16, 70, 21);
      x.quadraticCurveTo(68.5, 22, 67.4, 18.5);
      x.quadraticCurveTo(64, 16, 60.6, 18.5);
      x.quadraticCurveTo(59.5, 22, 58, 21);
      x.quadraticCurveTo(56, 16, 57, 9);
      x.fillStyle = rgrad(x, 61, 10, 9, [[0, '#ffffff'], [1, '#c8e0e8']]);
      x.fill();
      ell(x, 61, 10.5, 1.6, 1, 'rgba(255,255,255,0.9)');
      signText(x, 'SMILE', 83, 14.6, 5, '#2fb5b0');
      // dentist chair
      softShadow(x, 104, 80, 30, 3, 0.45);
      fillRR(x, 96.5, 70, 7, 10.5, 1, litH(x, 96.5, 103.5, '#9aaab8'));
      ell(x, 100, 80, 10, 1.6, litH(x, 90, 110, '#6a7a88'));
      fillRR(x, 79, 61, 46, 9.4, 4, vgrad(x, 61, 70.4, ['#6ad8d0', '#2fb5b0', '#1f8a84']));
      x.save();
      x.translate(121, 61.5);
      x.rotate(-1.2);
      fillRR(x, 0, -4, 21, 8.5, 4, lgrad(x, 0, -4, 0, 4.5, [[0, '#6ad8d0'], [0.5, '#2fb5b0'], [1, '#1f8a84']]));
      x.restore();
      fillRR(x, 122, 39.6, 9, 5.4, 2.4, rgrad(x, 125, 41, 6, [[0, '#4ac8c0'], [1, '#1a7a74']]));
      // instrument tray on an arm
      fillRR(x, 70, 53, 2, 11, 0.5, litH(x, 70, 72, '#9aa8b8'));
      fillRR(x, 64, 51, 16, 3.4, 0.8, litV(x, 51, 54.4, '#e0e8f0'));
      for (const tx of [67, 71, 75]) seg(x, tx, 51.2, tx + 1.2, 49.4, '#8a9aa8', 0.45);
      // lamp arm from the ceiling
      fillRR(x, 100, 0, 2, 21, 0.6, litH(x, 100, 102, '#9aa8b8'));
      fillRR(x, 100, 19.6, 15, 2, 0.6, litV(x, 19.6, 21.6, '#9aa8b8'));
      fillRR(x, 112.6, 20.6, 2, 2.6, 0.4, '#8a9aa8');
    },
    anim: (x, t) => {
      // x-ray glow
      const flick = Math.floor(t * 8) % 31 === 0;
      fillRR(x, 12, 12, 28, 20, 0.6, vgrad(x, 12, 32, flick ? ['#3a5a6a', '#2a4a5a'] : ['#3a6a80', '#24485a']));
      for (let k = 0; k < 6; k++) {
        const edge = k === 0 || k === 5 ? 2 : 0;
        fillRR(x, 14 + k * 4, 15 + edge, 3, 5.6, 1.2, rgrad(x, 15 + k * 4, 16 + edge, 3.5, [[0, '#ffffff'], [1, '#a8d0e0']]));
        fillRR(x, 14 + k * 4, 23.4 - edge, 3, 5.6, 1.2, rgrad(x, 15 + k * 4, 26 - edge, 3.5, [[0, '#ffffff'], [1, '#a8d0e0']]));
      }
      if (!flick) glowHD(x, 26, 22, 22, '#c8f0ff', 0.18, 14);
      // aquarium
      x.save();
      x.beginPath();
      x.rect(6, 42, 36, 17);
      x.clip();
      x.fillStyle = vgrad(x, 42, 59, ['#7ad0f0', '#3a9ad0', '#1a6aa0']);
      x.fillRect(6, 42, 36, 17);
      x.fillStyle = vgrad(x, 55, 59, ['#e8d8a0', '#c8b070']);
      x.fillRect(6, 55.6, 36, 3.4);
      for (const [px, h] of [
        [10, 9],
        [14, 6],
        [36, 8],
      ] as const) {
        x.beginPath();
        x.moveTo(px, 56);
        x.quadraticCurveTo(px + Math.sin(t * 2 + px) * 1.6, 56 - h / 2, px + Math.sin(t * 2.4 + px) * 1.2, 56 - h);
        x.strokeStyle = '#3caa6a';
        x.lineWidth = 0.9;
        x.lineCap = 'round';
        x.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const span = 30;
        const pos = (t * (5 + i * 2) + i * 11) % (span * 2);
        const dir = pos < span ? 1 : -1;
        const fx = 9 + (pos < span ? pos : span * 2 - pos);
        const fy = 46.5 + i * 3 + Math.sin(t * 2 + i);
        const c = ['#ff8a1e', '#f2c230', '#ef7fae'][i];
        poly(x, [fx - dir * 1.8, fy, fx - dir * 3.2, fy - 1.2 + Math.sin(t * 9 + i) * 0.4, fx - dir * 3.2, fy + 1.2 + Math.sin(t * 9 + i) * 0.4], shade(c, 0.85));
        ell(x, fx, fy, 2, 1.2, rgrad(x, fx - 0.5, fy - 0.5, 2.2, [[0, shade(c, 1.3)], [1, c]]));
        ell(x, fx + dir * 1, fy - 0.2, 0.3, 0.3, '#1c1424');
      }
      for (let i = 0; i < 4; i++) ell(x, 30 + i * 2, 55 - ((t * 6 + i * 5) % 12), 0.45, 0.45, 'rgba(230,248,255,0.8)');
      x.globalCompositeOperation = 'screen';
      poly(x, [8, 42, 14, 42, 6, 59, 6, 50], 'rgba(255,255,255,0.18)');
      x.restore();
      glowHD(x, 24, 50, 20, '#6ad0ff', 0.12, 10);
      view(x, t, 152, 10, 30, 24, false, { seed: 7 });
      // operating lamp
      const on = Math.floor(t * 8) % 53 !== 0;
      fillRR(x, 107.6, 21.6, 13, 5.6, 2.6, litV(x, 21.6, 27.2, '#e8eef4'));
      ell(x, 114, 26.6, 5.4, 1.1, on ? '#fffef0' : '#c8c8c0');
      if (on) {
        coneHD(x, 114, 27, 62, 10, 28, '#fff8c0', 0.22);
        glowHD(x, 114, 27, 10, '#fff8d0', 0.4, 4);
      }
    },
  };
}

function clinic(): HDSpec {
  return {
    player: 56,
    npc: 124,
    floor: 98,
    horizon: 80,
    fog: 0.06,
    fogColor: '#e6eef6',
    bloom: 0.5,
    bg: (x) => {
      wallHD(x, '#e2ecf4', 80);
      x.fillStyle = vgrad(x, 48, 76, ['#d4e0ec', '#bccad8']);
      x.fillRect(0, 48, W, 28);
      fillRR(x, 0, 45.6, W, 3.2, 0.4, litV(x, 45.6, 48.8, '#4ab474'));
      baseboardHD(x, 80, '#5a6a7a');
      tileFloorHD(x, 80, '#eef4f8', '#d4dce6', 12, { sheen: 0.3 });
      lightSign(x, 'URGENT CARE', 96, 11.5, 50, 9, '#e0503c', '#ffffff', 0.06);
      // hand-washing poster
      softShadow(x, 59, 33, 8, 11, 0.2);
      fillRR(x, 52, 22, 13, 21, 0.6, vgrad(x, 22, 43, ['#ffffff', '#eef4f8']));
      ell(x, 58.5, 26.6, 2.4, 2.4, rgrad(x, 58, 26, 3, [[0, '#7ad0f0'], [1, '#2a8ac0']]));
      for (let k = 0; k < 4; k++) fillRR(x, 54.4 + k * 0.5, 31 + k * 2.8, 8 - k, 1, 0.4, rgba('#3a5a7a', 0.7));
      // heart monitor on an arm
      fillRR(x, 22, 34, 2, 10, 0.6, litH(x, 22, 24, '#9aa8b8'));
      fillRR(x, 12.5, 14.5, 31, 22, 1.4, litV(x, 14.5, 36.5, '#4a5a68'));
      fillRR(x, 14, 16, 28, 19, 0.6, '#0a1814');
      // counter with sink, soap, gloves
      softShadow(x, 20, 80, 21, 2.2, 0.4);
      box3(x, 2, 60, 36, 20, 1.6, '#e8e8f0', 1);
      seg(x, 19.5, 61, 19.5, 79, rgba('#a8a8b4', 0.8), 0.4);
      fillRR(x, 1, 57, 38, 3.6, 0.6, litV(x, 57, 60.6, '#d0d0d8'));
      ell(x, 18, 58.6, 7, 1.1, '#9aa4b0');
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(14.6, 58);
      x.lineTo(14.6, 51.6);
      x.quadraticCurveTo(14.6, 50.6, 16, 50.6);
      x.lineTo(19.6, 50.6);
      x.strokeStyle = '#b8c0c8';
      x.lineWidth = 1.2;
      x.stroke();
      fillRR(x, 28, 50, 6, 7, 1.4, litH(x, 28, 34, '#7fd0d8'));
      fillRR(x, 4, 52, 8, 5, 0.8, litH(x, 4, 12, '#3f7fd8'));
      // exam table
      softShadow(x, 101, 80, 30, 2.6, 0.45);
      fillRR(x, 76, 60.5, 50, 8, 2.4, vgrad(x, 60.5, 68.5, ['#8aaac8', '#6a8aa8', '#4a6a88']));
      fillRR(x, 84, 60.4, 34, 3, 1, vgrad(x, 60.4, 63.4, ['#ffffff', '#e8ecf0']));
      box3(x, 80, 69, 42, 10.5, 1.2, '#e8e8f0', 0.8);
      for (let k = 0; k < 3; k++) {
        fillRR(x, 82 + k * 14, 71, 11, 6.4, 0.6, litV(x, 71, 77.4, '#dcdce6'));
        fillRR(x, 86 + k * 14, 73, 3, 0.9, 0.4, '#8a9aa8');
      }
      fillRR(x, 118, 54, 8, 7, 2, rgrad(x, 121, 56, 6, [[0, '#9ac0e0'], [1, '#4a6a88']]));
      // IV pole + bag
      softShadow(x, 136.5, 80, 4, 0.8, 0.4);
      fillRR(x, 135.6, 18, 1.6, 62, 0.6, litH(x, 135.6, 137.2, '#9aa8b8'));
      ell(x, 136.4, 79.6, 4, 0.8, '#7a8a98');
      fillRR(x, 133.6, 18.6, 5.4, 8, 1.6, lgrad(x, 133.6, 0, 139, 0, [[0, 'rgba(230,244,255,0.95)'], [1, 'rgba(160,200,230,0.95)']]));
      seg(x, 136.4, 26.6, 136.4, 40, rgba('#c8e0f0', 0.8), 0.3);
      // curtain rod
      fillRR(x, 140, 3.6, 52, 1.6, 0.6, litV(x, 3.6, 5.2, '#9aa8b8'));
    },
    anim: (x, t) => {
      // heartbeat trace
      const sc = t * 8;
      x.save();
      x.beginPath();
      x.rect(14, 16, 28, 19);
      x.clip();
      x.beginPath();
      for (let i = 0; i <= 52; i++) {
        const xx = 15 + i * 0.5;
        const ph = (i / 2 + sc) % 13;
        const yy = ph > 4 && ph < 5 ? -2 : ph > 5 && ph < 5.6 ? -6 : ph > 5.6 && ph < 6.4 ? 3 : 0;
        x.lineTo(xx, 27 + yy);
      }
      x.strokeStyle = '#3cff7a';
      x.lineWidth = 0.45;
      x.lineJoin = 'round';
      x.stroke();
      x.restore();
      glowHD(x, 28, 26, 16, '#3cff7a', 0.12, 9);
      signText(x, String(70 + (Math.floor(t / 3) % 5)), 19.6, 19.6, 4.4, '#3cff7a');
      if (Math.floor(sc) % 13 === 5) ell(x, 39, 18.5, 0.9, 0.9, '#ff4a4a');
      // privacy curtain with soft folds, gently swaying
      const sw = Math.sin(t * 0.9) * 1;
      x.beginPath();
      x.moveTo(151, 5.6);
      x.lineTo(W, 5.6);
      x.lineTo(W, 76);
      x.lineTo(172 + sw, 76);
      x.quadraticCurveTo(160 + sw * 0.6, 77, 151, 76);
      x.closePath();
      const g = x.createLinearGradient(151, 0, W, 0);
      for (let k = 0; k <= 8; k++) g.addColorStop(k / 8, k % 2 ? '#c8e0f4' : '#8ab0d0');
      x.fillStyle = g;
      x.fill();
      x.fillStyle = vgrad(x, 50, 76, ['rgba(20,30,60,0)', 'rgba(20,30,60,0.2)']);
      x.fillRect(151, 50, 41, 27);
      for (let k = 152; k < W; k += 5) ell(x, k + 1, 5.2, 1, 1, '#6a7a88');
    },
  };
}

export const CARE_SCENES = { dentist, clinic };

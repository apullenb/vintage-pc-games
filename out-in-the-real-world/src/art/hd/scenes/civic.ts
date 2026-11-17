// HD civic & office scenes: DMV, bank, office.
import type { Person } from '../../people.ts';
import {
  baseboardHD,
  block,
  box,
  box3,
  carpetHD,
  ell,
  fillRR,
  glowHD,
  hash,
  hgrad,
  lgrad,
  litH,
  litV,
  plantHD,
  poly,
  rgba,
  rgrad,
  screenHD,
  seg,
  shade,
  signText,
  softShadow,
  strokeRR,
  tileFloorHD,
  vgrad,
  wainscotHD,
  wallHD,
  windowHD,
  W,
  type Ctx,
} from '../kit.ts';
import { drawPersonHD, drawSeatedHD } from '../person.ts';
import { clockHD, deskHD, posterHD, view } from './common.ts';
import type { HDSpec } from './types.ts';

const SKIN = ['#f7d7bd', '#eab38c', '#c98c62', '#a26a46', '#714a32', '#4b3022'];
const HAIR = ['#2a1b12', '#5b3a22', '#a7652b', '#e3c26b', '#c2412f', '#14131d', '#a3a3b4'];
export const extra = (skin: number, hair: number, style: number, shirt: string, more: Partial<Person> = {}): Person => ({
  skin: SKIN[skin],
  hair: HAIR[hair],
  style,
  shirt,
  pants: '#3a3a52',
  shoes: '#2a2a33',
  ...more,
});

// Drop ceiling with fluorescent panels.
export function dropCeiling(x: Ctx, h = 8, c = '#e8ece2'): void {
  x.fillStyle = vgrad(x, 0, h, [shade(c, 0.95), c]);
  x.fillRect(0, 0, W, h);
  for (let i = 0; i < W; i += 16) box(x, i, 0, 0.5, h, rgba(shade(c, 0.75), 0.7));
  box(x, 0, h - 0.6, W, 0.6, rgba(shade(c, 0.6), 0.8));
  x.fillStyle = vgrad(x, h, h + 6, ['rgba(14,8,26,0.18)', 'rgba(14,8,26,0)']);
  x.fillRect(0, h, W, 6);
}
function tube(x: Ctx, cx: number, y: number, w: number, on: boolean): void {
  fillRR(x, cx, y, w, 4, 0.6, on ? vgrad(x, y, y + 4, ['#ffffff', '#fffef0', '#e8ecd8']) : '#c8ccc4');
  if (on) glowHD(x, cx + w / 2, y + 3, w * 0.9, '#fffbe8', 0.2, 7);
}

// A glass partition's sheen streaks.
function glassStreaks(x: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  x.save();
  x.globalCompositeOperation = 'screen';
  poly(x, [x0 + 4, y1, x0 + 14, y1, x0 + 30, y0, x0 + 20, y0], 'rgba(255,255,255,0.10)');
  poly(x, [x0 + 18, y1, x0 + 21, y1, x0 + 37, y0, x0 + 34, y0], 'rgba(255,255,255,0.07)');
  poly(x, [x1 - 18, y1, x1 - 14, y1, x1 - 2, y0 + 6, x1 - 6, y0 + 6], 'rgba(255,255,255,0.08)');
  x.restore();
}

// ---------- DMV ----------
function dmv(): HDSpec {
  return {
    player: 50,
    npc: 146,
    floor: 98,
    horizon: 78,
    fog: 0.06,
    fogColor: '#e2e6dc',
    bg: (x) => {
      wallHD(x, '#d4dccb', 78);
      wainscotHD(x, 48, 74, '#8faa98', 16);
      baseboardHD(x, 78, '#6a7a70');
      tileFloorHD(x, 78, '#c4c0b0', '#a6a294', 16);
      dropCeiling(x);
      // state seal
      softShadow(x, 23, 24, 12, 12, 0.25);
      ell(x, 22, 22, 10, 10, rgrad(x, 19, 19, 12, [[0, '#4a62a8'], [1, '#1a2a5a']]));
      ell(x, 22, 22, 7.6, 7.6, rgrad(x, 20, 20, 8, [[0, '#fff0b0'], [1, '#d8b060']]));
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        ell(x, 22 + Math.cos(a) * 8.8, 22 + Math.sin(a) * 8.8, 0.35, 0.35, '#f2d48a');
      }
      signText(x, 'DMV', 22, 22.4, 4.4, '#2b3f7a');
      // now-serving board
      softShadow(x, 85, 27, 34, 14, 0.25);
      fillRR(x, 52, 13, 64, 24, 1.2, litV(x, 13, 37, '#3a3a48'));
      fillRR(x, 53.5, 14.5, 61, 21, 0.8, vgrad(x, 14.5, 35.5, ['#1a1a24', '#0e0e16']));
      signText(x, 'NOW SERVING', 84, 18.6, 4, '#ff6a4a');
      box(x, 55, 22.6, 58, 0.5, '#2a2a34');
      // posters
      posterHD(x, 40, 40, 14, 18, '#f2efe6', '#c0392b', 'lines');
      signText(x, 'ID', 47, 52, 4, '#2b3f7a');
      // chairs row
      softShadow(x, 22, 80, 22, 2, 0.35);
      seg(x, 2, 74.5, 42, 74.5, '#5a5a6a', 0.8);
      for (let i = 0; i < 3; i++) {
        const cx = 4 + i * 13;
        fillRR(x, cx, 63.5, 10, 8, 2, rgrad(x, cx + 3, 65, 8, [[0, '#ffb060'], [1, '#d86a0a']]));
        fillRR(x, cx - 0.4, 71, 10.8, 3, 1.2, vgrad(x, 71, 74, ['#ff9a3a', '#c05a08']));
        for (const lx of [cx + 1.2, cx + 8.4]) seg(x, lx, 74, lx, 80, '#6a6a7a', 0.6);
      }
      // ticket dispenser
      softShadow(x, 70, 80, 6, 1.4, 0.4);
      fillRR(x, 69.2, 59, 1.6, 21, 0.6, litH(x, 69, 71, '#6a6a7a'));
      block(x, 65, 50, 10, 10, '#c0392b', 1.6);
      fillRR(x, 67, 56.6, 6, 1.8, 0.3, '#f2efe6');
      // back office behind the counter
      block(x, 104, 40, 70, 14, '#e8e0cc', 0.8);
      signText(x, 'WINDOW 3', 139, 47, 5, '#2b3f7a');
      for (const px of [104.5, 172.5]) seg(x, px, 30, px, 40, '#5a5a6a', 0.6);
      box3(x, 178, 52, 12, 26, 1.5, '#8a8a9a', 0.6);
      for (const yy of [60, 68]) seg(x, 179.5, yy, 188.5, yy, rgba('#3a3a48', 0.7), 0.4);
    },
    anim: (x, t) => {
      for (let i = 0; i < 4; i++) {
        const flick = i === 2 && (Math.floor(t * 8) % 23 < 3 || Math.floor(t * 8) % 23 === 5);
        tube(x, 8 + i * 48, 1.6, 28, !flick);
      }
      const n = 41 + (Math.floor(t / 5) % 9);
      const flash = t % 5 < 1 && Math.floor(t * 4) % 2 === 0;
      if (!flash) {
        signText(x, `A-0${n}`, 84, 29, 7.2, '#ffd23a');
        glowHD(x, 84, 29, 16, '#ffc020', 0.2, 6);
      }
      drawSeatedHD(x, extra(1, 3, 1, '#9a5ad0', { pants: '#2f3a5c' }), 9, 71, { t, dir: 1, blink: t % 4.1 < 0.12, scale: 0.92 });
      drawPersonHD(x, extra(4, 0, 4, '#c0392b', { holds: 'phone', pants: '#3a3a4a' }), 35, 80, { t: t + 2, face: -1, blink: (t + 1) % 3.9 < 0.12, scale: 0.86 });
    },
    fg: (x) => {
      // glass partition and the counter in front of the clerk
      x.fillStyle = 'rgba(190,220,235,0.12)';
      x.fillRect(105, 31, 86, 56);
      glassStreaks(x, 105, 31, 191, 87);
      for (const px of [104, 190]) fillRR(x, px, 30, 2, 58, 0.6, litH(x, px, px + 2, '#9aaab8'));
      fillRR(x, 104, 29.5, 88, 2, 0.6, litV(x, 29.5, 31.5, '#9aaab8'));
      softShadow(x, 147, 108, 50, 3, 0.4);
      poly(x, [103, 87.5, W, 87.5, W, 91, 101.5, 91], lgrad(x, 0, 87.5, 0, 91, [[0, '#f4eee2'], [1, '#d8cfbe']]));
      block(x, 101.5, 91, 92, 18, '#8a7a6a', 0.4);
      for (let k = 106; k < W; k += 14) block(x, k, 93.5, 10, 11.5, '#7a6a5a', 0.6, { edge: false });
      // monitor on the counter
      fillRR(x, 173, 85.5, 4, 2.4, 0.4, '#4a4a58');
      screenHD(x, 167.5, 76, 15, 9.5, '#3a6aa8', '#3a3a48');
      glowHD(x, 175, 81, 10, '#6aa0ff', 0.12);
      // forms
      x.save();
      x.translate(118, 86.4);
      x.rotate(-0.05);
      fillRR(x, -6, -1.2, 12, 2.4, 0.2, vgrad(x, -1.2, 1.2, ['#ffffff', '#e2dccb']));
      x.restore();
    },
  };
}

// ---------- bank ----------
function column(x: Ctx, px: number): void {
  softShadow(x, px + 5, 75, 10, 1.6, 0.3);
  fillRR(x, px - 3.5, 67, 17, 7.5, 0.8, litV(x, 67, 74.5, '#e0d6c0'));
  fillRR(x, px - 3.5, 3, 17, 5.5, 0.8, litV(x, 3, 8.5, '#e8dfc8'));
  x.fillStyle = hgrad(x, px, px + 10, ['#f4eee0', '#ece4d2', '#d8cdb4', '#b4a88c']);
  x.fillRect(px, 8.5, 10, 58.5);
  for (let k = 0; k < 4; k++) {
    const fx = px + 1.4 + k * 2.4;
    x.fillStyle = hgrad(x, fx, fx + 1.6, ['rgba(120,100,70,0.22)', 'rgba(255,255,255,0.25)', 'rgba(120,100,70,0)']);
    x.fillRect(fx, 8.5, 1.6, 58.5);
  }
  x.fillStyle = vgrad(x, 8.5, 14, ['rgba(60,40,20,0.25)', 'rgba(60,40,20,0)']);
  x.fillRect(px, 8.5, 10, 5.5);
}
function bank(): HDSpec {
  return {
    player: 56,
    npc: 146,
    floor: 98,
    horizon: 78,
    fog: 0.06,
    fogColor: '#efe6d4',
    bg: (x) => {
      wallHD(x, '#ece4d2', 78, (c) => {
        // stone blocks
        for (let j = 0; j < 52; j += 9) {
          box(c, 0, j, W, 0.5, rgba('#c8bea4', 0.7));
          for (let i = (j / 9) % 2 ? 0 : 12; i < W; i += 24) box(c, i, j, 0.5, 9, rgba('#c8bea4', 0.6));
        }
      });
      wainscotHD(x, 52, 74, '#7a4e30', 12);
      baseboardHD(x, 78, '#5a3a20');
      tileFloorHD(x, 78, '#ece2cc', '#a8987c', 16, { sheen: 0.35 });
      for (const px of [62, 92]) column(x, px);
      // vault door
      softShadow(x, 26, 41, 21, 21, 0.3);
      ell(x, 24, 38, 19, 19, rgrad(x, 18, 32, 24, [[0, '#d8dee6'], [0.7, '#9aa0a8'], [1, '#5a6068']]));
      ell(x, 24, 38, 15, 15, rgrad(x, 28, 42, 16, [[0, '#c8ced6'], [1, '#a4aab2']]));
      x.beginPath();
      x.arc(24, 38, 13, 0, Math.PI * 2);
      x.strokeStyle = rgba('#6a7078', 0.6);
      x.lineWidth = 0.6;
      x.stroke();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        ell(x, 24 + Math.cos(a) * 16.8, 38 + Math.sin(a) * 16.8, 1.1, 1.1, rgrad(x, 24 + Math.cos(a) * 16.8 - 0.4, 38 + Math.sin(a) * 16.8 - 0.4, 1.4, [[0, '#e8ecf0'], [1, '#5a6068']]));
      }
      ell(x, 24, 38, 4.4, 4.4, rgrad(x, 22.6, 36.6, 5, [[0, '#a8b0b8'], [1, '#4a5058']]));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.4;
        seg(x, 24, 38, 24 + Math.cos(a) * 8, 38 + Math.sin(a) * 8, '#5a6068', 1.1);
        ell(x, 24 + Math.cos(a) * 8, 38 + Math.sin(a) * 8, 1, 1, '#8a9098');
      }
      // rate board
      softShadow(x, 136, 26, 32, 15, 0.25);
      fillRR(x, 104, 10, 60, 28, 1.2, litV(x, 10, 38, '#3a2a1a'));
      fillRR(x, 105.4, 11.4, 57.2, 25.2, 0.6, vgrad(x, 11, 37, ['#2e3e6e', '#1a2448']));
      signText(x, 'SAVINGS APY', 134, 15.6, 4.2, '#f2d48a');
      fillRR(x, 107, 29, 54, 7, 0.4, '#121a34');
      // teller sign
      block(x, 110, 40, 80, 8, '#5a3a20', 0.6);
      signText(x, 'TELLER', 150, 44.2, 5.2, '#f2d48a');
      plantHD(x, 40, 64, true);
      // stanchions
      for (const sx of [73, 97]) {
        softShadow(x, sx, 98, 4, 1, 0.4);
        ell(x, sx, 97.6, 3, 0.9, litH(x, sx - 3, sx + 3, '#a07a18'));
        fillRR(x, sx - 0.8, 84, 1.6, 14, 0.6, litH(x, sx - 0.8, sx + 0.8, '#d8b040'));
        ell(x, sx, 83.6, 1.6, 1.2, rgrad(x, sx - 0.5, 83.2, 2, [[0, '#fff0a0'], [1, '#b08a18']]));
      }
      x.beginPath();
      x.moveTo(73, 86);
      x.quadraticCurveTo(85, 92, 97, 86);
      x.strokeStyle = '#a02040';
      x.lineWidth = 1.1;
      x.stroke();
    },
    anim: (x, t) => {
      signText(x, `${(4.0 + Math.round(Math.sin(t * 0.5) * 2) / 100).toFixed(2)}%`, 134, 23.2, 7, '#7fe08a');
      glowHD(x, 134, 23, 14, '#60e070', 0.14, 5);
      x.save();
      x.beginPath();
      x.rect(107, 29, 54, 7);
      x.clip();
      const msg = 'CD 4.50%   AUTO LOAN 6.9%   CHECKING 0.01%   ';
      x.font = '700 4.4px "Trebuchet MS", Verdana, sans-serif';
      const mw = x.measureText(msg).width;
      const off = (t * 10) % mw;
      x.fillStyle = '#ffd23a';
      x.textBaseline = 'middle';
      x.fillText(msg + msg, 107 - off, 32.6);
      x.restore();
      clockHD(x, 182, 18, 6, t);
      // vault glint
      const g = (t * 8) % 40;
      if (g < 8) {
        x.save();
        x.beginPath();
        x.arc(24, 38, 18, 0, Math.PI * 2);
        x.clip();
        x.globalCompositeOperation = 'screen';
        poly(x, [6 + g * 4, 60, 12 + g * 4, 60, 30 + g * 4, 16, 24 + g * 4, 16], 'rgba(255,255,255,0.35)');
        x.restore();
      }
    },
    fg: (x) => {
      // brass cage with an opening at the teller window
      for (const px of [110, 188]) fillRR(x, px, 48, 2, 39, 0.6, litH(x, px, px + 2, '#d8b040'));
      for (let k = 114; k < 130; k += 3) seg(x, k, 48, k, 87, lgrad(x, k - 0.5, 0, k + 0.5, 0, [[0, '#ffe080'], [1, '#a07a10']]), 0.6, 'butt');
      for (let k = 166; k < 186; k += 3) seg(x, k, 48, k, 87, lgrad(x, k - 0.5, 0, k + 0.5, 0, [[0, '#ffe080'], [1, '#a07a10']]), 0.6, 'butt');
      fillRR(x, 110, 47.5, 80, 1.4, 0.6, litV(x, 47.5, 49, '#f2d060'));
      softShadow(x, 148, 108, 50, 3, 0.4);
      poly(x, [106, 87.5, W, 87.5, W, 91, 104.5, 91], lgrad(x, 0, 87.5, 0, 91, [[0, '#c08a5a'], [1, '#8a5a34']]));
      box(x, 104.5, 90.6, 88, 0.8, '#e0b840');
      block(x, 104.5, 91.4, 88, 17, '#5a3a20', 0.4);
      for (let k = 110; k < W; k += 20) {
        block(x, k, 94, 15, 12, '#4a2e18', 0.8, { edge: false });
        strokeRR(x, k + 1.5, 95.5, 12, 9, 0.6, rgba('#8a5a34', 0.6), 0.4);
      }
      fillRR(x, 170, 84, 8, 4, 0.8, litH(x, 170, 178, '#3a3a4a'));
      seg(x, 176, 84, 177.6, 78.6, '#2a2a33', 0.5);
      fillRR(x, 118, 85.6, 10, 2.4, 0.2, vgrad(x, 85.6, 88, ['#ffffff', '#e2dccb']));
    },
  };
}

// ---------- office ----------
function office(): HDSpec {
  return {
    player: 54,
    npc: 130,
    floor: 98,
    horizon: 80,
    fog: 0.025,
    fogColor: '#dfe4ec',
    bloom: 0.5,
    windows: [[10, 8, 56, 34]],
    bg: (x) => {
      // warm greige walls with a teal accent stripe; a darker carpet grounds the room
      wallHD(x, '#d2cabc', 80);
      fillRR(x, 0, 44, W, 3, 0.3, litV(x, 44, 47, '#2f8a8a'));
      baseboardHD(x, 80, '#4a4440');
      carpetHD(x, 80, '#4e5a70', '#465266');
      windowHD(x, 10, 8, 56, 34, '#e8ecf0', false);
      // whiteboard
      softShadow(x, 101, 24, 22, 13, 0.25);
      fillRR(x, 79, 9, 42, 26, 1, litV(x, 9, 35, '#c8ccd4'));
      fillRR(x, 80.4, 10.4, 39.2, 23.2, 0.4, lgrad(x, 80, 10, 120, 34, [[0, '#ffffff'], [1, '#e8ecf0']]));
      x.beginPath();
      x.moveTo(84, 28);
      x.lineTo(92, 22);
      x.lineTo(98, 25);
      x.lineTo(108, 15);
      x.strokeStyle = '#3f7fd8';
      x.lineWidth = 0.7;
      x.lineJoin = 'round';
      x.stroke();
      seg(x, 110, 16.4, 116, 16.4, '#e0503c', 0.6);
      seg(x, 110, 19.4, 115, 19.4, '#e0503c', 0.6);
      fillRR(x, 84, 33.6, 30, 1.2, 0.4, '#8a9aa8');
      // water cooler
      softShadow(x, 165, 80, 9, 1.8, 0.4);
      fillRR(x, 159, 59.5, 12, 20.5, 1.2, litH(x, 159, 171, '#e8ecf0'));
      fillRR(x, 162.6, 65.5, 4.8, 2.4, 0.5, '#3f7fd8');
      plantHD(x, 176, 52, true);
      // printer
      softShadow(x, 17, 80, 13, 1.8, 0.4);
      box3(x, 6, 66, 22, 13, 2, '#d8d8dc', 1.2);
      fillRR(x, 9, 62, 16, 2.4, 0.3, vgrad(x, 62, 64.4, ['#ffffff', '#e2e2e8']));
    },
    anim: (x, t) => {
      view(x, t, 10, 8, 56, 34, false, {
        seed: 61,
        scenery: (c) => {
          for (let i = 0, px = 10; px < 66; i++) {
            const w = 5 + Math.floor(hash(i + 300) * 8);
            const h = 6 + Math.floor(hash(i * 7 + 301) * 12);
            c.fillStyle = hgrad(c, px, px + w, i % 2 ? ['#9aaac8', '#7a8aa8'] : ['#8a9ab8', '#6a7a98']);
            c.fillRect(px, 42 - h, w, h);
            for (let wy = 44 - h; wy < 41; wy += 2.6) for (let wx = px + 1; wx < px + w - 1; wx += 2) if (hash(wx * 5 + wy * 9) > 0.55) box(c, wx, wy, 1, 1.2, '#d8e8f8');
            px += w + 1;
          }
        },
      });
      for (let k = 0; k < 6; k++) fillRR(x, 9.5, 7.5 + k * 1.8, 57, 1.6, 0.6, vgrad(x, 7.5 + k * 1.8, 9.1 + k * 1.8, ['#ffffff', '#c8ccd4']));
      clockHD(x, 136, 18, 6.5, t, '#5a6470');
      // water jug with rising bubbles
      fillRR(x, 160.5, 42, 9, 17.5, 2.6, lgrad(x, 160, 0, 170, 0, [[0, 'rgba(200,236,255,0.95)'], [0.4, 'rgba(120,190,240,0.9)'], [1, 'rgba(70,140,210,0.95)']]));
      for (let k = 0; k < 3; k++) {
        const b = (t * 5 + k * 5) % 15;
        ell(x, 164.5 + Math.sin(t * 3 + k) * 1.2, 57 - b, 0.5, 0.5, 'rgba(240,250,255,0.85)');
      }
      // coworker typing behind the cubicle wall: seated, shoulders and arms above the partition
      drawPersonHD(x, extra(2, 3, 0, '#e0503c'), 90, 51 + Math.sin(t * 4) * 0.2, { t, face: 1, blink: t % 4.7 < 0.12, shadow: false, scale: 0.9, seated: true });
      ell(x, 24, 70, 0.6, 0.6, Math.floor(t * 2) % 2 ? '#7fe08a' : '#2a5a3a');
    },
    mid: (x) => {
      // cubicle wall
      softShadow(x, 113, 80, 42, 2.4, 0.35);
      fillRR(x, 72, 51, 82, 29, 1, vgrad(x, 51, 80, ['#a8b4c4', '#8a98ac', '#6a788c']));
      x.save();
      x.globalAlpha = 0.18;
      for (let i = 0; i < 160; i++) ell(x, 73 + hash(i) * 80, 54 + hash(i * 3) * 25, 0.3, 0.3, '#3a4a5a');
      x.restore();
      fillRR(x, 72, 50, 82, 2.6, 1, litV(x, 50, 52.6, '#c8d0dc'));
      seg(x, 112, 52, 112, 80, rgba('#4a5a70', 0.7), 0.6);
      // monitor over the partition
      screenHD(x, 100.5, 43.5, 11, 7.5, '#5ab0e0', '#2a2a33');
      fillRR(x, 104, 51, 4, 1.2, 0.3, '#3a3a44');
    },
    anim2: (x, t) => {
      glowHD(x, 106, 47, 8, '#6ac0f0', 0.1 + (Math.floor(t) % 2) * 0.05);
    },
    fg: (x) => {
      deskHD(x, 100, 88, 72, '#9a7a5a', '#6a4a2e', 20, false);
      // monitor
      fillRR(x, 154, 84, 4, 4, 0.5, '#3a3a44');
      ell(x, 156, 88, 5, 0.8, '#3a3a44');
      screenHD(x, 147.5, 74.5, 17, 11, '#3f7fd8', '#2a2a33');
      // papers & coffee
      fillRR(x, 106, 85.4, 12, 2.6, 0.2, vgrad(x, 85.4, 88, ['#ffffff', '#e2dccb']));
      fillRR(x, 167.5, 82.8, 3.6, 5, 0.6, litH(x, 167.5, 171, '#e0503c'));
    },
    fgAnim: (x, t) => {
      x.save();
      x.beginPath();
      x.rect(147.5, 74.5, 17, 11);
      x.clip();
      for (let k = 0; k < 3; k++) fillRR(x, 149.5, 76.5 + k * 3, 4 + ((k * 5 + Math.floor(t)) % 9), 0.9, 0.4, 'rgba(220,234,255,0.85)');
      x.restore();
      glowHD(x, 156, 80, 12, '#6aa0ff', 0.12);
      for (let k = 0; k < 2; k++) {
        const s = (t * 3 + k * 1.5) % 4;
        ell(x, 169.3 + Math.sin(t * 2 + k) * 0.6, 81.5 - s, 0.6 + s * 0.15, 0.6 + s * 0.15, `rgba(240,240,250,${(0.5 - s * 0.12).toFixed(2)})`);
      }
    },
  };
}

export const CIVIC_SCENES = { dmv, bank, office };

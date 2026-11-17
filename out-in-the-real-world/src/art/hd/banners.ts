// Painted HD headers for menu screens (the job board's cork board, the grades
// chalkboard) and the report-card medal, in the same smooth-shaded style as the
// scenes. Static: each is painted once and cached.
import { box, cachedHD, ell, fillRR, glowHD, hash, lgrad, litV, poly, rgba, rgrad, seg, shade, signText, softShadow, vgrad, type Ctx } from './kit.ts';

export const BANNER_W = 192;
export const BANNER_H = 34;
export type BannerKind = 'jobs' | 'grades';

function pin(x: Ctx, cx: number, cy: number, c: string): void {
  softShadow(x, cx + 0.9, cy + 1.2, 1.6, 0.9, 0.45);
  ell(x, cx, cy, 1.3, 1.3, rgrad(x, cx - 0.4, cy - 0.5, 1.6, [[0, shade(c, 1.6)], [0.5, c], [1, shade(c, 0.6)]]));
  ell(x, cx - 0.4, cy - 0.45, 0.35, 0.3, 'rgba(255,255,255,0.8)');
}

// A pinned paper, tilted a little, with a drop shadow; draw() adds its contents in local coords.
function paper(x: Ctx, cx: number, cy: number, w: number, h: number, rot: number, c: string, draw: (x: Ctx) => void, pinC = '#e0503c'): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  softShadow(x, 1.2, 1.6, w * 0.55, h * 0.55, 0.32);
  fillRR(x, -w / 2, -h / 2, w, h, 0.3, lgrad(x, -w / 2, -h / 2, w / 2, h / 2, [[0, shade(c, 1.06)], [0.7, c], [1, shade(c, 0.9)]]));
  draw(x);
  // a curled corner catching light
  poly(x, [w / 2 - 2.4, h / 2, w / 2, h / 2 - 2.4, w / 2, h / 2], rgba(shade(c, 0.78), 0.9));
  pin(x, 0, -h / 2 + 1.6, pinC);
  x.restore();
}
const lines = (x: Ctx, x0: number, y0: number, w: number, n: number, gap = 1.6, c = '#6a6070'): void => {
  for (let k = 0; k < n; k++) box(x, x0, y0 + k * gap, w * (0.6 + hash(k * 7 + x0) * 0.4), 0.45, rgba(c, 0.6));
};

function corkBoard(x: Ctx): void {
  const W = BANNER_W;
  const H = BANNER_H;
  x.fillStyle = vgrad(x, 0, H, ['#c8955a', '#b8844a', '#a8743e']);
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) ell(x, hash(i * 3) * W, hash(i * 7 + 1) * H, 0.2 + hash(i) * 0.35, 0.2 + hash(i * 5) * 0.3, rgba(hash(i * 11) > 0.5 ? '#e8c088' : '#6a4420', 0.5));
  // a warm light from above-left, darker toward the frame
  x.fillStyle = rgrad(x, 50, 0, 150, [[0, 'rgba(255,230,180,0.22)'], [1, 'rgba(40,20,10,0.28)']]);
  x.fillRect(0, 0, W, H);
  // papers
  paper(x, 20, 17, 26, 22, -0.06, '#fffdf4', (c) => {
    fillRR(c, -11, -8.4, 22, 4.6, 0.3, '#e0503c');
    signText(c, 'NOW HIRING', 0, -6, 3, '#ffffff');
    lines(c, -10, -1.4, 20, 5, 1.8);
  });
  paper(x, 50, 15, 22, 18, 0.08, '#fff2a8', (c) => {
    signText(c, '$18/hr', 0, -3.4, 4.2, '#2a5aa8');
    lines(c, -9, 1.6, 18, 3, 1.8, '#7a6a40');
  }, '#3f7fd8');
  paper(x, 82, 18, 28, 24, -0.03, '#f4f8ff', (c) => {
    signText(c, 'Line Cook', -12, -6.6, 3, '#1c1424', 'left');
    lines(c, -12, -3, 24, 3, 1.8);
    // tear-off tabs along the bottom
    for (let k = 0; k < 7; k++) {
      const tx = -12.6 + k * 3.6;
      box(c, tx, 4.4, 0.25, 7.6, rgba('#8a8aa0', 0.6));
      if (k !== 2 && k !== 5) seg(c, tx + 1.8, 5.4, tx + 1.8, 11, rgba('#5a5a70', 0.55), 0.3);
    }
    poly(c, [-5.4, 4.6, -1.8, 4.6, -1.8, 12, -5.4, 12], '#b8844a');
  }, '#3caa6a');
  paper(x, 114, 14, 20, 16, 0.12, '#d8f0e0', (c) => {
    signText(c, 'Tutor', 0, -3.6, 3.2, '#1f6a3a');
    lines(c, -8, 0.6, 16, 3, 1.8, '#3a6a4a');
  }, '#f2b632');
  paper(x, 140, 19, 26, 24, -0.07, '#fffdf4', (c) => {
    fillRR(c, -11, -9.4, 22, 5, 0.3, '#2b4486');
    signText(c, 'WAREHOUSE', 0, -6.9, 2.8, '#ffffff');
    lines(c, -10, -2.4, 20, 4, 1.8);
    fillRR(c, -10, 6, 9, 3, 0.4, '#3caa6a');
    signText(c, '401(k)', -5.5, 7.6, 2, '#ffffff');
  });
  paper(x, 172, 15, 24, 20, 0.05, '#ffe2d8', (c) => {
    signText(c, 'Barista', 0, -5, 3.4, '#a83a2a');
    ell(c, 6, 3.4, 3, 2.6, 'rgba(120,70,40,0.18)');
    lines(c, -9, -0.6, 14, 4, 1.8, '#7a4a40');
  }, '#9a5ad0');
  // wooden frame top and bottom
  fillRR(x, 0, 0, W, 2.4, 0, litV(x, 0, 2.4, '#7a4a2a'));
  fillRR(x, 0, H - 2.4, W, 2.4, 0, litV(x, H - 2.4, H, '#6a3e22'));
  x.fillStyle = vgrad(x, 2.4, 6, ['rgba(20,10,4,0.35)', 'rgba(20,10,4,0)']);
  x.fillRect(0, 2.4, W, 4);
}

function chalkboard(x: Ctx): void {
  const W = BANNER_W;
  const H = BANNER_H;
  x.fillStyle = vgrad(x, 0, H, ['#2e5a46', '#264e3c', '#1e4232']);
  x.fillRect(0, 0, W, H);
  // old eraser smudges
  for (let i = 0; i < 14; i++) ell(x, hash(i * 9) * W, 4 + hash(i * 4) * 22, 10 + hash(i) * 16, 3 + hash(i * 3) * 4, 'rgba(220,240,230,0.05)', hash(i * 2) - 0.5);
  x.fillStyle = rgrad(x, 70, 6, 130, [[0, 'rgba(255,250,230,0.1)'], [1, 'rgba(0,10,6,0.3)']]);
  x.fillRect(0, 0, W, H);
  const chalk = 'rgba(244,244,232,0.9)';
  signText(x, 'Fall semester', 8, 9, 5, chalk, 'left', 700);
  seg(x, 8, 12.6, 54, 12.6, 'rgba(244,244,232,0.6)', 0.4);
  signText(x, 'GPA = grade points ÷ credits', 8, 18.5, 3.2, 'rgba(244,244,232,0.8)', 'left', 400);
  signText(x, 'Final: 35%   Mid: 25%   HW: 30%', 8, 24, 2.8, 'rgba(230,236,220,0.7)', 'left', 400);
  // a bell curve with the grade bands
  x.beginPath();
  for (let i = 0; i <= 50; i++) {
    const u = (i - 25) / 9;
    x.lineTo(96 + i * 1.1, 26 - Math.exp(-u * u / 2) * 17);
  }
  x.strokeStyle = chalk;
  x.lineWidth = 0.5;
  x.stroke();
  seg(x, 94, 26.2, 154, 26.2, 'rgba(244,244,232,0.7)', 0.4);
  for (const [gx, l] of [
    [103, 'C'],
    [114, 'B'],
    [128, 'A'],
  ] as const) {
    seg(x, gx + 4, 25.6, gx + 4, 13 + (l === 'B' ? -2 : 3), 'rgba(244,244,232,0.35)', 0.3);
    signText(x, l, gx, 28.7, 2.6, 'rgba(244,244,232,0.75)', 'left');
  }
  // a circled A+ in yellow chalk
  signText(x, 'A+', 170, 13, 6.4, 'rgba(255,224,120,0.95)');
  x.beginPath();
  x.ellipse(170.4, 13, 8, 5.4, -0.12, 0.3, Math.PI * 2.05);
  x.strokeStyle = 'rgba(255,224,120,0.8)';
  x.lineWidth = 0.5;
  x.stroke();
  // frame and tray with chalk, eraser, an apple
  fillRR(x, 0, 0, W, 2, 0, litV(x, 0, 2, '#8a5a34'));
  fillRR(x, 0, H - 3.4, W, 3.4, 0, litV(x, H - 3.4, H, '#9a6a40'));
  for (const [cx, c] of [
    [40, '#f4f4ea'],
    [46, '#ffe08a'],
    [51, '#f4f4ea'],
  ] as const)
    fillRR(x, cx, H - 4.4, 4, 1.2, 0.5, litV(x, H - 4.4, H - 3.2, c));
  fillRR(x, 64, H - 5.6, 10, 2.6, 0.5, litV(x, H - 5.6, H - 3, '#3a3a4a'));
  box(x, 64.6, H - 3.6, 8.8, 0.8, '#c8c0b0');
  ell(x, 184, H - 6.4, 3.4, 3.2, rgrad(x, 183, H - 7.4, 4, [[0, '#ff7a6a'], [0.6, '#d0302a'], [1, '#8a1a1a']]));
  seg(x, 184, H - 9.4, 184.6, H - 11, '#5a3a20', 0.45);
  ell(x, 185.6, H - 10.6, 1.4, 0.6, '#4caa4a', -0.4);
  ell(x, 182.8, H - 7.6, 0.7, 0.5, 'rgba(255,255,255,0.7)');
}

export function bannerCanvas(kind: BannerKind): HTMLCanvasElement {
  return cachedHD(`banner:${kind}`, kind === 'jobs' ? corkBoard : chalkboard, BANNER_W, BANNER_H);
}

// ---------- the report card medal ----------
export const MEDAL_W = 30;
export const MEDAL_H = 34;
const METAL: Record<string, [string, string]> = {
  A: ['#ffe27a', '#b8801e'],
  B: ['#e8eef8', '#8a98b0'],
  C: ['#f0b880', '#9a5a2a'],
  D: ['#c8c0c8', '#6a6070'],
  F: ['#c8a8a8', '#7a4a4a'],
};
export function medalCanvas(grade: string): HTMLCanvasElement {
  const [hi, lo] = METAL[grade.charAt(0)] ?? METAL.D;
  return cachedHD(
    `medal:${grade}`,
    (x) => {
      const cx = 15;
      const cy = 13;
      // ribbon tails
      for (const [dx, c] of [
        [-1, '#2b4486'],
        [1, '#c0392b'],
      ] as const) {
        poly(x, [cx + dx * 2, cy + 6, cx + dx * 9, cy + 6, cx + dx * 10.5, cy + 20, cx + dx * 7, cy + 17.4, cx + dx * 4.4, cy + 20.6], lgrad(x, cx, cy, cx + dx * 10, cy + 20, [[0, shade(c, 1.25)], [1, shade(c, 0.75)]]));
      }
      // pleated rosette
      x.beginPath();
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        const r = 12.4 + (k % 2 ? -1 : 0.4);
        x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      x.fillStyle = rgrad(x, cx - 3, cy - 4, 15, [[0, shade(lo, 1.5)], [1, shade(lo, 0.8)]]);
      x.fill();
      // the coin
      ell(x, cx, cy, 10, 10, rgrad(x, cx - 3.4, cy - 3.8, 13, [[0, '#ffffff'], [0.25, hi], [0.8, lo], [1, shade(lo, 0.7)]]));
      ell(x, cx, cy, 8, 8, rgrad(x, cx + 3, cy + 3.4, 11, [[0, shade(hi, 1.1)], [0.7, hi], [1, shade(lo, 0.9)]]));
      x.beginPath();
      x.arc(cx, cy, 8, 0, Math.PI * 2);
      x.strokeStyle = rgba(shade(lo, 0.6), 0.6);
      x.lineWidth = 0.4;
      x.stroke();
      // the letter, stamped
      const size = grade.length > 1 ? 8.6 : 10.4;
      signText(x, grade, cx + 0.3, cy + 0.9, size, rgba(shade(lo, 0.55), 0.7));
      signText(x, grade, cx, cy + 0.5, size, shade(lo, 0.45));
      glowHD(x, cx - 3.6, cy - 4.4, 5, '#ffffff', 0.5, 3);
    },
    MEDAL_W,
    MEDAL_H,
  );
}

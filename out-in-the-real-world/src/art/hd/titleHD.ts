// HD title scene: the town at golden hour from the hill above it, parallax layers
// drifting at different speeds, the player and Rae on the overlook. Painted at
// 576x324 with smooth gradients, hazy depth and soft light; returns post-fx params.
import type { Look } from '../../engine/types.ts';
import { CAST, playerPerson } from '../people.ts';
import { cachedHD, cloudHD, ell, fillRR, glowHD, H, hash, lgrad, litH, litV, mix, poly, rgba, rgrad, S, seg, shade, softShadow, vgrad, W, type Ctx } from './kit.ts';
import { drawPersonHD } from './person.ts';
import { fxFor, type FxParams } from './postfx.ts';

const LW = W * 2; // wide layers wrap for scrolling

function sky(x: Ctx): void {
  x.fillStyle = vgrad(x, 0, 72, ['#24195a', '#4a2c78', '#9a4480', '#e0705c', '#f8ac60', '#ffe08a']);
  x.fillRect(0, 0, W, 72);
  glowHD(x, 132, 58, 70, '#ffc070', 0.55, 46);
  glowHD(x, 132, 58, 30, '#fff0b0', 0.6, 22);
  ell(x, 132, 58, 9, 9, rgrad(x, 131, 57, 9, [[0, '#fffff0'], [0.7, '#fff2c0'], [1, '#ffd890']]));
  for (let i = 0; i < 22; i++) {
    const sx = hash(i * 7 + 3) * W;
    const sy = hash(i * 13 + 1) * 18;
    ell(x, sx, sy, 0.35, 0.35, `rgba(255,240,255,${(0.4 + hash(i) * 0.5).toFixed(2)})`);
  }
}

function hills(x: Ctx): void {
  for (const [base, amp, c, top] of [
    [60, 10, '#a86a94', '#d8909a'],
    [66, 6, '#7a4878', '#a86a8a'],
  ] as const) {
    x.beginPath();
    x.moveTo(0, H);
    for (let i = 0; i <= LW; i += 2) x.lineTo(i, base - (amp + Math.sin((i / 23) * (amp > 8 ? 1 : 1.35) + (amp > 8 ? 0 : 2)) * amp * 0.4 + Math.sin(i / 9 + 1) * 1.4));
    x.lineTo(LW, H);
    x.closePath();
    x.fillStyle = vgrad(x, base - amp * 1.6, base + 10, [top, c]);
    x.fill();
  }
}

function skyline(x: Ctx): void {
  let i = 0;
  let k = 0;
  while (i < LW) {
    const w = 8 + Math.floor(hash(k * 3 + 1) * 12);
    const h = 10 + Math.floor(hash(k * 5 + 2) * 22) + (k % 7 === 3 ? 14 : 0);
    const top = 72 - h;
    const base = k % 3 === 0 ? '#4a2c5a' : k % 3 === 1 ? '#3e2850' : '#553262';
    x.fillStyle = lgrad(x, i, 0, i + w, 0, [[0, mix(base, '#ff9a70', 0.35)], [0.25, base], [1, shade(base, 0.8)]]);
    x.fillRect(i, top, w, h + 40);
    x.fillStyle = rgba('#ffb070', 0.5);
    x.fillRect(i, top, w, 0.6);
    if (k % 7 === 3) {
      seg(x, i + w / 2, top, i + w / 2, top - 6, base, 0.5);
      glowHD(x, i + w / 2, top - 6.5, 2.5, '#ff5a4a', 0.7);
    }
    if (k % 5 === 1) fillRR(x, i + 2, top - 5, 5, 4, 1.4, '#5a3a5a');
    for (let wy = top + 3; wy < 70; wy += 4)
      for (let wx = i + 2; wx < i + w - 2; wx += 3)
        if (hash(wx * 31 + wy * 7) < 0.42) {
          const c = hash(wx + wy) < 0.5 ? '#ffd88a' : '#ffb85a';
          fillRR(x, wx, wy, 1, 2, 0.2, c);
          glowHD(x, wx + 0.5, wy + 1, 2.4, c, 0.18);
        }
    i += w + (hash(k * 11) < 0.3 ? 2 : 0);
    k++;
  }
  // haze in front of the skyline
  x.fillStyle = vgrad(x, 50, 74, ['rgba(255,170,120,0)', 'rgba(255,170,120,0.35)']);
  x.fillRect(0, 50, LW, 24);
}

function town(x: Ctx): void {
  x.fillStyle = vgrad(x, 82, H, ['#5a7a40', '#3a5a32']);
  x.fillRect(0, 84, LW, H - 84);
  for (let i = 0; i < LW; i += 26) {
    const s = Math.floor(i / 26);
    const hx = i + hash(s * 3) * 6;
    const roof = s % 3 === 0 ? '#9a4040' : s % 3 === 1 ? '#5a4a6a' : '#8a6040';
    const wall = s % 2 ? '#d89a78' : '#c8b09a';
    softShadow(x, hx + 9, 86, 11, 1.4, 0.35);
    x.fillStyle = lgrad(x, hx, 0, hx + 16, 0, [[0, mix(wall, '#ffd0a0', 0.4)], [0.3, wall], [1, shade(wall, 0.75)]]);
    x.fillRect(hx, 76, 16, 10);
    poly(x, [hx - 1.5, 76.4, hx + 8, 70, hx + 17.5, 76.4], lgrad(x, hx, 70, hx + 16, 76, [[0, mix(roof, '#ffb070', 0.4)], [1, shade(roof, 0.75)]]));
    for (const [wx, lit] of [
      [hx + 3.5, true],
      [hx + 9.5, hash(s) < 0.5],
    ] as const) {
      fillRR(x, wx, 79, 3, 3, 0.3, lit ? '#ffd88a' : '#5a4a6a');
      if (lit) glowHD(x, wx + 1.5, 80.5, 4, '#ffc870', 0.35);
    }
    const tx = hx + 21;
    fillRR(x, tx + 1.4, 77, 1.2, 7, 0.4, '#4a3020');
    ell(x, tx + 2, 75, 4.4, 4.2, rgrad(x, tx + 3.4, 73.4, 6, [[0, '#a8c060'], [0.5, '#4a7a3a'], [1, '#2a4a2a']]));
  }
}

function hill(x: Ctx): void {
  const topAt = (i: number): number => 88 + Math.sin(i / 30) * 2.5 - (i > 100 ? (i - 100) * 0.04 : 0);
  x.beginPath();
  x.moveTo(0, H);
  for (let i = 0; i <= W; i += 2) x.lineTo(i, topAt(i));
  x.lineTo(W, H);
  x.closePath();
  x.fillStyle = lgrad(x, 0, 84, 40, H, [[0, '#9ac050'], [0.35, '#6a9a3a'], [1, '#2e5a2a']]);
  x.fill();
  // golden rim along the crest
  x.beginPath();
  for (let i = 0; i <= W; i += 2) x.lineTo(i, topAt(i) + 0.3);
  x.strokeStyle = 'rgba(240,240,140,0.85)';
  x.lineWidth = 0.7;
  x.stroke();
  // picket fence
  for (let fx = 4; fx < 46; fx += 5) {
    poly(x, [fx, 80.5, fx + 1, 79, fx + 2, 80.5, fx + 2, 90, fx, 90], lgrad(x, fx, 0, fx + 2, 0, [[0, '#fff8e8'], [1, '#c8b8a0']]));
  }
  for (const yy of [83, 87]) fillRR(x, 2, yy, 46, 1, 0.3, '#d8c8b0');
  // the bench
  softShadow(x, 163, 93, 15, 1.6, 0.45);
  fillRR(x, 150, 81.6, 26, 2.4, 0.6, litV(x, 81.6, 84, '#9a6a40'));
  fillRR(x, 150, 85.6, 26, 2.4, 0.6, litV(x, 85.6, 88, '#9a6a40'));
  for (const lx of [152, 172]) fillRR(x, lx, 88, 2, 5, 0.4, litH(x, lx, lx + 2, '#5a3a20'));
}

function clouds(x: Ctx, t: number): void {
  for (let i = 0; i < 5; i++) {
    const w = 18 + hash(i * 7) * 22;
    const sp = 1.2 + hash(i * 3) * 1.4;
    const span = W + w * 2 + 20;
    const cx = -w + ((hash(i) * span + t * sp) % span);
    const cy = 12 + hash(i * 5) * 26;
    const c = cy < 24 ? '#e08aa0' : '#ffb890';
    cloudHD(x, cx, cy, w * 0.7, mix(c, '#fff0d8', 0.45), shade(c, 0.78));
  }
}

function grass(x: Ctx, t: number): void {
  x.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    const gx = hash(i * 17) * W;
    const gy = 92 + hash(i * 5) * 15;
    const sway = Math.sin(t * 2 + gx * 0.2) * 0.8;
    x.beginPath();
    x.moveTo(gx, gy);
    x.quadraticCurveTo(gx + sway * 0.4, gy - 1.4, gx + sway, gy - 2.8);
    x.strokeStyle = i % 3 ? '#b8d860' : '#7aa84a';
    x.lineWidth = 0.4;
    x.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const px = (hash(i * 9) * W + t * (3 + hash(i) * 4) + Math.sin(t + i) * 6) % W;
    const py = 50 + hash(i * 4) * 50 + Math.sin(t * 1.3 + i * 2) * 4;
    const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    ell(x, px, py, 0.4, 0.4, `rgba(255,248,200,${a.toFixed(2)})`);
    glowHD(x, px, py, 2.4, '#fff2b0', 0.3 * a);
  }
}

function birds(x: Ctx, t: number): void {
  for (let k = 0; k < 4; k++) {
    const period = 16 + k * 3;
    const ph = ((t + k * 4.3) % period) / period;
    const bx = W + 6 - ph * (W + 20);
    const by = 22 + k * 5 + Math.sin(t * 1.5 + k) * 2;
    const fl = Math.sin(t * 8 + k) * 1;
    x.beginPath();
    x.moveTo(bx - 1.8, by - fl);
    x.quadraticCurveTo(bx - 0.8, by - 0.5, bx, by);
    x.quadraticCurveTo(bx + 0.8, by - 0.5, bx + 1.8, by - fl);
    x.strokeStyle = '#3a2440';
    x.lineWidth = 0.45;
    x.stroke();
  }
}

// Paints one frame into an HD (576x324) context and returns the post-fx params.
export function paintTitleHD(x: CanvasRenderingContext2D, t: number, look: Look, still = false): FxParams {
  const tt = still ? 0 : t;
  x.setTransform(S, 0, 0, S, 0, 0);
  x.imageSmoothingEnabled = true;
  x.drawImage(cachedHD('title:sky', sky), 0, 0, W, H);
  clouds(x, tt);
  const layer = (name: string, f: (c: Ctx) => void, speed: number): void => {
    const c = cachedHD(`title:${name}`, f, LW, H);
    const off = (tt * speed) % LW;
    x.drawImage(c, -off, 0, LW, H);
    x.drawImage(c, LW - off, 0, LW, H);
  };
  layer('hills', hills, 0.6);
  layer('skyline', skyline, 1.6);
  layer('town', town, 3.2);
  x.save();
  x.globalCompositeOperation = 'screen';
  x.fillStyle = vgrad(x, 56, 92, ['rgba(255,170,110,0)', 'rgba(255,170,110,0.2)', 'rgba(255,170,110,0)']);
  x.fillRect(0, 56, W, 36);
  x.restore();
  x.drawImage(cachedHD('title:hill', hill), 0, 0, W, H);
  birds(x, tt);
  // long shadows stretching away from the sun
  for (const px of [77, 103]) {
    x.save();
    x.translate(px, 98);
    x.transform(1, 0, -1.6, 0.18, 0, 0);
    x.fillStyle = rgrad(x, 0, -14, 16, [[0, 'rgba(40,30,60,0.35)'], [1, 'rgba(40,30,60,0)']]);
    x.fillRect(-10, -30, 20, 30);
    x.restore();
  }
  drawPersonHD(x, playerPerson(look), 77, 98, { t: tt, face: 1, blink: tt % 4.1 < 0.12, shadow: true, scale: 1.05 });
  const wave = Math.floor(tt / 2.5) % 3 === 1;
  drawPersonHD(x, CAST.rae.p, 103, 98, {
    t: tt + 1.1,
    face: -1,
    blink: (tt + 1.3) % 4.7 < 0.12,
    talk: wave && Math.floor(tt * 5) % 2 === 0,
    gesture: wave ? (Math.floor(tt * 3) % 2 ? 1 : 2) : 0,
    scale: 1.05,
  });
  // warm rim light over everything from the sun side
  x.save();
  x.globalCompositeOperation = 'screen';
  const g = x.createLinearGradient(W, 0, 0, H);
  g.addColorStop(0, 'rgba(255,190,110,0.22)');
  g.addColorStop(1, 'rgba(255,190,110,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.restore();
  grass(x, tt);
  x.setTransform(1, 0, 0, 1, 0, 0);
  return fxFor('golden', { fog: 0.02, fogColor: '#ffb890', horizon: 0.6, bloom: 1.1 });
}

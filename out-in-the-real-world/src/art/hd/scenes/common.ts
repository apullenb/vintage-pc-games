// Shared HD scene props: window views, shelves, desks, lamps, posters, clocks, cars.
import {
  block,
  box,
  cloudHD,
  ell,
  fillRR,
  glassHD,
  glowHD,
  hash,
  hgrad,
  lgrad,
  litH,
  litV,
  mix,
  poly,
  rgba,
  rgrad,
  rr,
  seg,
  shade,
  signText,
  softShadow,
  vgrad,
  type Ctx,
} from '../kit.ts';

export const DAY_SKY = ['#5a9ae8', '#8ac0f4', '#cfe6fa'];
export const NIGHT_SKY = ['#0a0a24', '#1a1a46', '#2e2a5e'];

export function stars(x: Ctx, t: number, px: number, py: number, w: number, h: number, n: number, seed = 0): void {
  for (let i = 0; i < n; i++) {
    const sx = px + hash(seed + i * 7) * w;
    const sy = py + hash(seed + i * 13) * h;
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.8 + hash(i) * 1.5) + i));
    ell(x, sx, sy, 0.3, 0.3, `rgba(255,250,235,${tw.toFixed(2)})`);
    if (i % 5 === 0) glowHD(x, sx, sy, 1.4, '#fff8e0', 0.35 * tw);
  }
}
export function moonHD(x: Ctx, cx: number, cy: number, r = 4): void {
  glowHD(x, cx, cy, r * 4, '#c8d4ff', 0.35);
  ell(x, cx, cy, r, r, rgrad(x, cx - r * 0.4, cy - r * 0.4, r * 1.3, [[0, '#ffffff'], [0.7, '#eef0f8'], [1, '#c8cce0']]));
  ell(x, cx + r * 0.3, cy + r * 0.2, r * 0.25, r * 0.2, 'rgba(160,165,190,0.35)');
  ell(x, cx - r * 0.35, cy + r * 0.35, r * 0.15, r * 0.15, 'rgba(160,165,190,0.3)');
}
export function sunHD(x: Ctx, cx: number, cy: number, r = 5): void {
  glowHD(x, cx, cy, r * 5, '#fff0b0', 0.45);
  ell(x, cx, cy, r, r, rgrad(x, cx, cy, r, [[0, '#fffbe8'], [1, '#ffe08a']]));
}

// A window's view (drawn per frame): sky, drifting clouds or stars, scenery.
export function view(
  x: Ctx,
  t: number,
  px: number,
  py: number,
  w: number,
  h: number,
  night: boolean,
  o: { sky?: string[]; scenery?: (x: Ctx) => void; seed?: number; moon?: [number, number] } = {},
): void {
  glassHD(x, px, py, w, h, night ? NIGHT_SKY : (o.sky ?? DAY_SKY), (c) => {
    if (night) {
      stars(c, t, px, py, w, h * 0.7, Math.ceil((w * h) / 80), o.seed ?? 0);
      if (o.moon) moonHD(c, o.moon[0], o.moon[1], Math.min(w, h) * 0.13);
    } else {
      for (let k = 0; k < 2; k++) {
        const cw = 10 + hash((o.seed ?? 0) + k) * 8;
        const cx = px - cw + ((t * (1.2 + k * 0.6) + hash((o.seed ?? 0) * 3 + k) * (w + cw * 2)) % (w + cw * 2));
        cloudHD(c, cx, py + 4 + k * 6 + hash(k + (o.seed ?? 0)) * 4, cw, '#ffffff', '#cfe0f2');
      }
    }
    o.scenery?.(c);
  });
}

export function bookRowHD(x: Ctx, sx: number, sy: number, w: number, seed: number, maxH = 8): void {
  const cols = ['#c0392b', '#2e6e9e', '#3c8a4a', '#d8a030', '#7a4a9a', '#e0e0d8', '#2a3a5a', '#a0522d'];
  let i = 0;
  let cx = sx;
  while (cx < sx + w - 1.5) {
    const bw = 1.6 + hash(seed + i * 3) * 1.6;
    const bh = maxH * (0.62 + hash(seed + i * 7) * 0.38);
    const c = cols[Math.floor(hash(seed * 5 + i) * cols.length)];
    const lean = hash(seed + i * 11) > 0.9 && cx + bw + 2 < sx + w;
    if (lean) {
      x.save();
      x.translate(cx, sy);
      x.rotate(0.22);
      fillRR(x, 0, -bh, bw, bh, 0.2, litH(x, 0, bw, c));
      x.restore();
      cx += bw + 1.4;
    } else {
      fillRR(x, cx, sy - bh, bw, bh, 0.2, litH(x, cx, cx + bw, c));
      box(x, cx, sy - bh + bh * 0.2, bw, 0.4, rgba('#f2d070', 0.6));
      box(x, cx, sy - bh + bh * 0.75, bw, 0.3, rgba('#000000', 0.25));
      cx += bw + 0.15;
    }
    i++;
  }
}

// Shelf plank with a soft shadow underneath.
export function shelfHD(x: Ctx, px: number, py: number, w: number, c = '#8a5a34'): void {
  fillRR(x, px, py, w, 2, 0.4, litV(x, py, py + 2, c));
  x.fillStyle = vgrad(x, py + 2, py + 6, ['rgba(14,8,26,0.3)', 'rgba(14,8,26,0)']);
  x.fillRect(px, py + 2, w, 4);
}

// A desk/table: top surface in light perspective, front panel, legs.
export function deskHD(x: Ctx, px: number, py: number, w: number, top: string, front: string, h = 15, legs = true): void {
  softShadow(x, px + w / 2, py + h + 0.5, w * 0.6, 2.4, 0.4);
  if (legs) {
    for (const lx of [px + 1, px + w - 3]) fillRR(x, lx, py + 2, 2, h - 1.5, 0.4, litH(x, lx, lx + 2, shade(front, 0.8)));
  }
  poly(x, [px + 1.2, py - 2.2, px + w - 1.2, py - 2.2, px + w, py, px, py], lgrad(x, 0, py - 2.2, 0, py, [[0, shade(top, 1.15)], [1, shade(top, 1.02)]]));
  fillRR(x, px, py, w, 2.2, 0.4, litV(x, py, py + 2.2, top));
  if (!legs) block(x, px + 0.5, py + 2.2, w - 1, h - 2.2, front, 0.5);
  else block(x, px + 1, py + 2.2, w - 2, Math.min(5, h * 0.35), front, 0.5);
}

export function lampHD(x: Ctx, px: number, py: number, shadeC = '#f2d48a', on = false): void {
  // base, stem, conical shade; (px, py) = top-left of the shade
  softShadow(x, px + 4, py + 12.4, 4.4, 1, 0.35);
  ell(x, px + 4, py + 12, 3.2, 0.9, litH(x, px + 0.8, px + 7.2, '#4a4a58'));
  seg(x, px + 4, py + 12, px + 4, py + 5, '#5a5a68', 0.7);
  poly(x, [px + 1.6, py, px + 6.4, py, px + 8, py + 5.2, px, py + 5.2], lgrad(x, px, 0, px + 8, 0, [[0, shade(shadeC, 1.15)], [0.5, shadeC], [1, shade(shadeC, 0.75)]]));
  if (on) {
    ell(x, px + 4, py + 5.2, 4, 0.8, '#fff6d8');
    glowHD(x, px + 4, py + 3, 12, '#ffe0a0', 0.35);
  }
}

export function posterHD(x: Ctx, px: number, py: number, w: number, h: number, bg: string, fg: string, art: 'lines' | 'mountain' | 'bolt' | 'star' | 'chart' = 'lines'): void {
  softShadow(x, px + w / 2 + 1.4, py + h / 2 + 1.8, w * 0.62, h * 0.6, 0.22);
  fillRR(x, px, py, w, h, 0.4, vgrad(x, py, py + h, [shade(bg, 1.2), bg, shade(bg, 0.8)]));
  x.save();
  rr(x, px + 1.5, py + 1.5, w - 3, h - 3, 0.3);
  x.clip();
  const cx = px + w / 2;
  if (art === 'mountain') {
    x.fillStyle = vgrad(x, py, py + h, [shade(bg, 1.5), bg]);
    x.fillRect(px, py, w, h);
    ell(x, cx + w * 0.2, py + h * 0.28, w * 0.1, w * 0.1, '#ffe8a0');
    poly(x, [px, py + h, px + w * 0.45, py + h * 0.4, px + w * 0.75, py + h * 0.7, px + w, py + h * 0.5, px + w, py + h], lgrad(x, px, py + h * 0.4, px + w, py + h, [[0, fg], [1, shade(fg, 0.5)]]));
    poly(x, [px + w * 0.37, py + h * 0.5, px + w * 0.45, py + h * 0.4, px + w * 0.53, py + h * 0.5], '#ffffff');
  } else if (art === 'bolt') {
    poly(x, [cx + 1, py + h * 0.15, cx - 3, py + h * 0.55, cx, py + h * 0.55, cx - 1.5, py + h * 0.88, cx + 3.5, py + h * 0.42, cx + 0.5, py + h * 0.42, cx + 2.5, py + h * 0.15], lgrad(x, cx - 3, 0, cx + 3, 0, [[0, shade(fg, 1.2)], [1, shade(fg, 0.8)]]));
  } else if (art === 'star') {
    x.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 ? w * 0.16 : w * 0.38;
      x.lineTo(cx + Math.cos(a) * r, py + h * 0.45 + Math.sin(a) * r);
    }
    x.closePath();
    x.fillStyle = rgrad(x, cx - 1, py + h * 0.4, w * 0.4, [[0, '#ffffff'], [1, fg]]);
    x.fill();
    box(x, px + 2.5, py + h - 5, w - 5, 1, rgba(fg, 0.7));
  } else if (art === 'chart') {
    x.beginPath();
    x.moveTo(px + 2, py + h - 3);
    for (let k = 0; k < 5; k++) x.lineTo(px + 2 + (k * (w - 4)) / 4, py + h - 3 - (k + hash(k) * 2) * ((h - 6) / 7));
    x.strokeStyle = fg;
    x.lineWidth = 0.7;
    x.stroke();
  } else {
    for (let k = 0; k < 4; k++) box(x, px + 2.5, py + 3 + k * (h / 5), w - 5 - (k % 2) * 3, 1, rgba(fg, 0.8));
  }
  x.fillStyle = lgrad(x, px, py, px + w, py + h, [[0, 'rgba(255,255,255,0.18)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.1)']]);
  x.fillRect(px, py, w, h);
  x.restore();
  // pins
  ell(x, px + 1.5, py + 1.5, 0.5, 0.5, '#e0503c');
  ell(x, px + w - 1.5, py + 1.5, 0.5, 0.5, '#e0503c');
}

export function clockHD(x: Ctx, cx: number, cy: number, r: number, t: number, rim = '#c9a032'): void {
  softShadow(x, cx + 1, cy + 1.5, r * 1.1, r * 1.1, 0.25);
  ell(x, cx, cy, r, r, rgrad(x, cx - r * 0.4, cy - r * 0.4, r * 1.4, [[0, shade(rim, 1.4)], [1, shade(rim, 0.7)]]));
  ell(x, cx, cy, r * 0.8, r * 0.8, rgrad(x, cx - r * 0.2, cy - r * 0.3, r, [[0, '#ffffff'], [1, '#e8e4d8']]));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ell(x, cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65, 0.18, 0.18, '#3a3a4a');
  }
  const ha = t * 0.02 - Math.PI / 2 + 1.2;
  const ma = t * 0.25 - Math.PI / 2;
  seg(x, cx, cy, cx + Math.cos(ha) * r * 0.4, cy + Math.sin(ha) * r * 0.4, '#2a2a33', 0.45);
  seg(x, cx, cy, cx + Math.cos(ma) * r * 0.6, cy + Math.sin(ma) * r * 0.6, '#2a2a33', 0.3);
  ell(x, cx, cy, 0.35, 0.35, '#c0392b');
}

// Car seen from the side. (px, py) = top-left of the body box (old sprite coords, ~34x14).
export function carHD(x: Ctx, px: number, py: number, body: string, flip = false, w = 34): void {
  const s = w / 34;
  x.save();
  x.translate(px + (flip ? w : 0), py);
  x.scale(flip ? -s : s, s);
  softShadow(x, 17, 14.5, 19, 2.2, 0.45);
  // body
  x.beginPath();
  x.moveTo(1, 12);
  x.lineTo(0.5, 7.5);
  x.quadraticCurveTo(1, 5.5, 4, 5.2);
  x.lineTo(9, 4.8);
  x.quadraticCurveTo(11.5, 0.4, 15, 0.2);
  x.lineTo(23, 0.2);
  x.quadraticCurveTo(26, 0.6, 28, 4.8);
  x.lineTo(31.5, 5.6);
  x.quadraticCurveTo(33.6, 6.4, 33.6, 9);
  x.lineTo(33.4, 12);
  x.closePath();
  x.fillStyle = lgrad(x, 0, 0, 0, 12, [[0, shade(body, 1.3)], [0.45, body], [0.5, shade(body, 0.85)], [1, shade(body, 0.62)]]);
  x.fill();
  x.strokeStyle = rgba(shade(body, 0.35), 0.7);
  x.lineWidth = 0.35;
  x.stroke();
  // windows
  poly(x, [11, 4.8, 13.6, 1.4, 18.6, 1.3, 18.6, 4.8], vgrad(x, 1, 5, ['#cfe8ff', '#5a7aa8']));
  poly(x, [19.6, 4.8, 19.6, 1.3, 23, 1.4, 26.2, 4.8], vgrad(x, 1, 5, ['#cfe8ff', '#5a7aa8']));
  // door line, handle, lights
  seg(x, 19.1, 5, 19.1, 11.5, rgba(shade(body, 0.4), 0.6), 0.25);
  box(x, 21, 6.6, 1.6, 0.5, rgba('#ffffff', 0.6));
  ell(x, 32.6, 7.2, 0.9, 0.7, '#fff2b0');
  ell(x, 1.0, 7.4, 0.7, 0.8, '#e04030');
  // highlight streak along the shoulder line
  seg(x, 3, 5.9, 31, 6.1, rgba('#ffffff', 0.35), 0.35);
  // wheels
  for (const wx of [7.5, 26.5]) {
    ell(x, wx, 12, 3.2, 3.2, '#1a1a22');
    ell(x, wx, 12, 1.7, 1.7, rgrad(x, wx - 0.5, 11.5, 2, [[0, '#e8ecf0'], [1, '#7a8290']]));
    ell(x, wx, 12, 0.5, 0.5, '#4a4a58');
  }
  x.restore();
}

// Rounded neon/light-box shop sign.
export function lightSign(x: Ctx, label: string, cx: number, cy: number, w: number, h: number, bg: string, fg: string, glow = 0.18): void {
  softShadow(x, cx + 1, cy + 2, w * 0.55, h * 0.8, 0.25);
  fillRR(x, cx - w / 2, cy - h / 2, w, h, 1.2, vgrad(x, cy - h / 2, cy + h / 2, [shade(bg, 1.3), bg, shade(bg, 0.7)]));
  x.save();
  rr(x, cx - w / 2, cy - h / 2, w, h, 1.2);
  x.strokeStyle = rgba(mix(bg, '#ffffff', 0.5), 0.5);
  x.lineWidth = 0.35;
  x.stroke();
  x.restore();
  signText(x, label, cx, cy + h * 0.04, h * 0.58, fg);
  if (glow > 0) glowHD(x, cx, cy, w * 0.7, fg, glow, h * 1.6);
}

// Fluorescent ceiling fixture with its glow.
export function fixture(x: Ctx, cx: number, cy: number, w = 14, on = true): void {
  fillRR(x, cx - w / 2, cy - 1, w, 2.2, 0.8, litV(x, cy - 1, cy + 1.2, '#d8dce4'));
  fillRR(x, cx - w / 2 + 0.8, cy + 0.6, w - 1.6, 1, 0.5, on ? '#fffef4' : '#c8ccd4');
  if (on) glowHD(x, cx, cy + 1, w * 1.1, '#fff8e8', 0.22, w * 0.5);
}

export function railing(x: Ctx, x0: number, x1: number, y: number, h: number, c = '#8a8a9a', step = 5): void {
  seg(x, x0, y - h, x1, y - h, c, 0.8);
  for (let px = x0; px <= x1; px += step) seg(x, px, y - h, px, y, shade(c, 0.85), 0.5);
}

export function hgradBox(x: Ctx, px: number, py: number, w: number, h: number, stops: string[]): void {
  x.fillStyle = hgrad(x, px, px + w, stops);
  x.fillRect(px, py, w, h);
}

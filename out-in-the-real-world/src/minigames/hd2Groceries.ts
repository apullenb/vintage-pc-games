// HD grocery models for Checkout Rush: smooth-shaded, rounded, with specular highlights.
// (cx, by) = bottom-center in logical px, matching the old pixel sprites' footprint.
import type { Ctx } from '../art/px.ts';
import { ball, cyl, ell, lin, rad, rr, sbox, shadow, tint } from './hd2Kit.tsx';

const INK = 'rgba(28,20,36,0.8)';

function stroke(x: Ctx, w = 0.45, c = INK): void {
  x.lineWidth = w;
  x.strokeStyle = c;
  x.stroke();
}

export function hdGrocery(x: Ctx, k: string, cx: number, by: number, withShadow = true): void {
  if (withShadow) shadow(x, cx, by, 7, 1.6, 0.4);
  switch (k) {
    case 'can': {
      cyl(x, cx - 3.5, by - 9, 7, 9, '#c8ccd4', { spec: 0.7 });
      x.fillStyle = lin(x, cx - 3.5, 0, cx + 3.5, 0, [[0, '#7a1a16'], [0.3, '#f0504a'], [0.6, '#d0302a'], [1, '#6a1410']]);
      x.fillRect(cx - 3.5, by - 7.2, 7, 5);
      x.fillStyle = 'rgba(255,244,228,0.9)';
      x.fillRect(cx - 3.5, by - 5.2, 7, 0.9);
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.fillRect(cx - 1.9, by - 9, 0.6, 9);
      ell(x, cx, by - 9, 3.5, 1);
      x.fillStyle = lin(x, cx - 3, by - 10, cx + 3, by - 8, ['#ffffff', '#9aa0aa']);
      x.fill();
      stroke(x, 0.3);
      break;
    }
    case 'milk': {
      // gable-top carton
      sbox(x, cx - 4.5, by - 9, 9, 9, '#f4f6f8', { r: 0.8, gloss: 0.25 });
      x.beginPath();
      x.moveTo(cx - 4.5, by - 9);
      x.lineTo(cx - 2.5, by - 12);
      x.lineTo(cx + 2.5, by - 12);
      x.lineTo(cx + 4.5, by - 9);
      x.closePath();
      x.fillStyle = lin(x, cx - 4, by - 12, cx + 4, by - 9, ['#ffffff', '#c8ccd8']);
      x.fill();
      stroke(x, 0.35);
      x.fillStyle = '#3f7fd8';
      x.fillRect(cx - 2.2, by - 12.8, 4.4, 0.9);
      sbox(x, cx - 3.5, by - 6, 6, 3.5, '#3f7fd8', { r: 0.8, outline: null, gloss: 0.3 });
      break;
    }
    case 'melon': {
      ball(x, cx, by - 4.6, 6.4, '#3c8a4a', 4.6, 0.55);
      x.save();
      ell(x, cx, by - 4.6, 6.4, 4.6);
      x.clip();
      x.strokeStyle = 'rgba(160,230,120,0.55)';
      x.lineWidth = 0.6;
      for (let i = -2; i <= 2; i++) {
        x.beginPath();
        x.ellipse(cx + i * 2.6, by - 4.6, 1.2 + Math.abs(i) * 0.3, 4.6, 0, 0, Math.PI * 2);
        x.stroke();
      }
      x.restore();
      ell(x, cx, by - 4.6, 6.4, 4.6);
      stroke(x, 0.4);
      break;
    }
    case 'soap': {
      rr(x, cx - 4, by - 9.5, 8, 9.5, 2);
      x.fillStyle = lin(x, cx - 4, 0, cx + 4, 0, [[0, '#a84c08'], [0.25, '#ffb060'], [0.45, '#ff8a1e'], [1, '#9a4a08']]);
      x.fill();
      stroke(x, 0.4);
      sbox(x, cx - 1.5, by - 11.5, 3, 2.4, '#3f7fd8', { r: 0.6, gloss: 0.4 });
      sbox(x, cx - 3, by - 6.5, 6, 3, '#f4f0e4', { r: 0.6, outline: null, gloss: 0 });
      x.fillStyle = 'rgba(255,255,255,0.6)';
      x.fillRect(cx - 2.6, by - 9, 0.7, 7.5);
      break;
    }
    case 'spuds': {
      // mesh sack of potatoes
      rr(x, cx - 5.5, by - 9, 11, 9, 3.2);
      x.fillStyle = rad(x, cx - 2, by - 7, 0, 10, ['#d8a870', '#a8784a', '#5e3e22']);
      x.fill();
      stroke(x, 0.4);
      for (const [dx, dy] of [[-2.5, -3], [1.5, -2.5], [-0.5, -6], [3, -6]] as const) ball(x, cx + dx, by + dy, 1.9, '#c8985a', 1.6, 0.35);
      x.strokeStyle = 'rgba(80,50,20,0.35)';
      x.lineWidth = 0.3;
      for (let i = -4; i <= 4; i += 1.6) {
        x.beginPath();
        x.moveTo(cx + i, by - 9);
        x.lineTo(cx + i + 2, by);
        x.stroke();
      }
      x.fillStyle = '#6a4a2a';
      rr(x, cx - 1.5, by - 10.2, 3, 1.6, 0.6);
      x.fill();
      break;
    }
    case 'juice': {
      sbox(x, cx - 3.5, by - 9.5, 7, 9.5, '#f2b632', { r: 0.8, gloss: 0.35 });
      sbox(x, cx - 2.5, by - 11.5, 5, 2.2, '#f4f0e4', { r: 0.5, gloss: 0.2 });
      ball(x, cx, by - 4.5, 2.2, '#ff8a1e', 2.2, 0.6);
      break;
    }
    case 'eggs': {
      sbox(x, cx - 6, by - 5.5, 12, 5.5, '#c8b89a', { r: 1, gloss: 0.2 });
      x.fillStyle = 'rgba(90,70,40,0.3)';
      x.fillRect(cx - 6, by - 3, 12, 0.6);
      for (let i = -4; i <= 4; i += 2.7) ball(x, cx + i, by - 6.2, 1.5, '#f8eedc', 1.8, 0.7);
      break;
    }
    case 'bread': {
      rr(x, cx - 6, by - 7, 12, 7, 3);
      x.fillStyle = rad(x, cx - 2, by - 7, 0, 11, [[0, '#f0c080'], [0.5, '#c88a48'], [1, '#7a4a20']]);
      x.fill();
      stroke(x, 0.4);
      x.strokeStyle = 'rgba(255,230,180,0.6)';
      x.lineWidth = 0.5;
      for (let i = -3; i <= 3; i += 3) {
        x.beginPath();
        x.moveTo(cx + i - 1, by - 6);
        x.quadraticCurveTo(cx + i, by - 6.8, cx + i + 1.2, by - 5.6);
        x.stroke();
      }
      sbox(x, cx - 3, by - 3.4, 6, 2, '#f4e8c8', { r: 0.6, outline: null, gloss: 0 });
      break;
    }
    case 'chips': {
      // a puffy pillow bag
      x.beginPath();
      x.moveTo(cx - 4.5, by - 11);
      x.quadraticCurveTo(cx, by - 10.2, cx + 4.5, by - 11);
      x.quadraticCurveTo(cx + 5.6, by - 5.5, cx + 4.5, by);
      x.quadraticCurveTo(cx, by + 0.6, cx - 4.5, by);
      x.quadraticCurveTo(cx - 5.6, by - 5.5, cx - 4.5, by - 11);
      x.closePath();
      x.fillStyle = rad(x, cx - 1.5, by - 7, 0, 9, ['#ff8a70', '#e0503c', '#8a2418']);
      x.fill();
      stroke(x, 0.4);
      ball(x, cx, by - 5.2, 2.6, '#f2c230', 2.1, 0.5);
      x.fillStyle = 'rgba(255,255,255,0.7)';
      x.fillRect(cx - 4.4, by - 11, 8.8, 0.8);
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(cx - 3.2, by - 9.5, 0.7, 7.5);
      break;
    }
    case 'tomato': {
      ball(x, cx - 2.8, by - 2.6, 2.6, '#e0402c');
      ball(x, cx + 2.6, by - 2.6, 2.6, '#d0302a');
      ball(x, cx, by - 5.2, 2.7, '#f05a3c');
      x.fillStyle = '#3caa6a';
      ell(x, cx, by - 7.6, 1.1, 0.5);
      x.fill();
      break;
    }
    case 'banana': {
      x.beginPath();
      x.moveTo(cx - 6, by - 4.5);
      x.quadraticCurveTo(cx, by + 1.6, cx + 5.8, by - 5.6);
      x.quadraticCurveTo(cx + 1, by - 2.4, cx - 5.4, by - 6.4);
      x.closePath();
      x.fillStyle = lin(x, 0, by - 6, 0, by, ['#fff0a0', '#f2d048', '#b8901a']);
      x.fill();
      stroke(x, 0.4);
      x.fillStyle = '#5a3a1a';
      ell(x, cx + 5.8, by - 5.8, 0.7, 0.6);
      x.fill();
      break;
    }
    case 'cupcake': {
      // clear clamshell of two cupcakes
      for (const dx of [-2.6, 2.6]) {
        x.beginPath();
        x.moveTo(cx + dx - 2.2, by - 3.4);
        x.lineTo(cx + dx + 2.2, by - 3.4);
        x.lineTo(cx + dx + 1.6, by - 0.6);
        x.lineTo(cx + dx - 1.6, by - 0.6);
        x.closePath();
        x.fillStyle = lin(x, cx + dx - 2, 0, cx + dx + 2, 0, ['#9a6a3a', '#d8a868', '#8a5a2a']);
        x.fill();
        ball(x, cx + dx, by - 4.6, 2.4, '#ef7fae', 1.8, 0.7);
      }
      rr(x, cx - 5.5, by - 8, 11, 8, 1.4);
      x.fillStyle = 'rgba(216,238,248,0.22)';
      x.fill();
      stroke(x, 0.35, 'rgba(160,200,220,0.9)');
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.fillRect(cx - 4.6, by - 7.4, 0.6, 6);
      break;
    }
    case 'coupon': {
      sbox(x, cx - 6.5, by - 6, 13, 6, '#f8f4e8', { r: 0.6, gloss: 0.15 });
      x.fillStyle = '#3caa6a';
      x.fillRect(cx - 6.5, by - 6, 13, 0.9);
      x.fillRect(cx - 6.5, by - 0.9, 13, 0.9);
      x.save();
      x.font = `900 4.6px sans-serif`;
      x.fillStyle = '#2e8a52';
      x.textBaseline = 'middle';
      x.fillText('%', cx - 5.4, by - 3.1);
      x.restore();
      x.fillStyle = '#8a8a9a';
      x.fillRect(cx, by - 4, 5, 0.6);
      x.fillRect(cx, by - 2.4, 4, 0.6);
      break;
    }
    default: {
      sbox(x, cx - 4, by - 8, 8, 8, '#9a5ad0');
    }
  }
}

// A row of small shaded product facings for back shelves (cached into the background).
export function shelfProducts(x: Ctx, x0: number, x1: number, baseY: number, seed: number, palette: string[], fog = 0): void {
  let i = x0;
  let n = seed;
  const rnd = (): number => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
  while (i < x1) {
    const w = 2.4 + rnd() * 2.6;
    const h = 4 + rnd() * 6;
    const col = tint(palette[Math.floor(rnd() * palette.length)], 0.85 + fog * 0.3);
    const kind = rnd();
    if (kind < 0.35) cyl(x, i, baseY - h, w, h, col, { spec: 0.35, cap: tint(col, 1.2) });
    else if (kind < 0.5) ball(x, i + w / 2, baseY - w / 2, w / 2, col, w / 2, 0.4);
    else sbox(x, i, baseY - h, w, h, col, { r: 0.5, outline: 'rgba(30,20,40,0.35)', lw: 0.3, gloss: 0.3 });
    i += w + 0.4 + rnd() * 0.6;
  }
}

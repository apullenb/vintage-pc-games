// HD people: rounded, chunky, smooth-shaded figures with volume, driven by the same
// Person data as the pixel sprites (player look + outfit, every NPC and path boss).
// Feet sit at (cx, feetY) in logical scene units; the figure is ~32 units tall.
import type { Person } from '../people.ts';
import { drawHairBack, drawHead, type Expr } from './head.ts';
import { ell, fillRR, lgrad, poly, rgba, rgrad, rr, seg, shade, softShadow, type Ctx } from './kit.ts';

export interface HDOpts {
  t?: number; // seconds, drives breathing and idle sway
  talk?: boolean; // mouth open this frame
  blink?: boolean;
  face?: number; // -1 looks left, 1 looks right
  walk?: number; // walk phase in cycles (omit when standing)
  gesture?: number; // 1 = hand out, 2 = hand on chest
  shadow?: boolean;
  scale?: number;
  expr?: Expr;
  seated?: boolean; // sitting: hips at feetY - 9, legs forward
  dir?: -1 | 1; // seated facing
}

const edge = (c: string): string => rgba(shade(c, 0.36), 0.8);

// A limb as a soft capsule polyline with a lit side.
function limb(x: Ctx, pts: number[], w: number, c: string, outline = true): void {
  const xs = pts.filter((_, i) => i % 2 === 0);
  const x0 = Math.min(...xs) - w / 2;
  const x1 = Math.max(...xs) + w / 2;
  const path = (): void => {
    x.beginPath();
    x.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  };
  x.lineCap = 'round';
  x.lineJoin = 'round';
  if (outline) {
    path();
    x.strokeStyle = edge(c);
    x.lineWidth = w + 0.6;
    x.stroke();
  }
  path();
  x.strokeStyle = lgrad(x, x0, 0, x1, 0, [
    [0, shade(c, 1.16)],
    [0.45, c],
    [1, shade(c, 0.7)],
  ]);
  x.lineWidth = w;
  x.stroke();
}

function hand(x: Ctx, hx: number, hy: number, skin: string, r = 1.35): void {
  ell(x, hx, hy, r + 0.3, r + 0.3, edge(skin));
  ell(x, hx, hy, r, r, rgrad(x, hx - r * 0.4, hy - r * 0.4, r * 1.6, [[0, shade(skin, 1.1)], [1, shade(skin, 0.75)]]));
}

function torsoPath(x: Ctx, sw: number, sy: number, ww: number, wy: number): void {
  x.beginPath();
  x.moveTo(-sw, sy + 2.2);
  x.quadraticCurveTo(-sw, sy, -sw + 2.4, sy - 0.2);
  x.lineTo(sw - 2.4, sy - 0.2);
  x.quadraticCurveTo(sw, sy, sw, sy + 2.2);
  x.quadraticCurveTo(sw + 0.1, (sy + wy) / 2, ww, wy);
  x.quadraticCurveTo(ww, wy + 1.3, ww - 1, wy + 1.3);
  x.lineTo(-ww + 1, wy + 1.3);
  x.quadraticCurveTo(-ww, wy + 1.3, -ww, wy);
  x.quadraticCurveTo(-sw - 0.1, (sy + wy) / 2, -sw, sy + 2.2);
  x.closePath();
}

function heldItem(x: Ctx, p: Person, hx: number, hy: number): void {
  switch (p.holds) {
    case 'clipboard':
      fillRR(x, hx - 2.4, hy - 6.4, 5, 6.6, 0.5, lgrad(x, hx - 2.4, 0, hx + 2.6, 0, [[0, '#b07a44'], [1, '#7a4e26']]));
      fillRR(x, hx - 1.8, hy - 5.6, 3.8, 5.0, 0.2, '#f6f2e6');
      for (let k = 0; k < 4; k++) seg(x, hx - 1.3, hy - 4.6 + k * 1.1, hx + 1.4, hy - 4.6 + k * 1.1, 'rgba(80,90,120,0.45)', 0.22);
      fillRR(x, hx - 0.8, hy - 7.0, 1.8, 1.2, 0.3, '#9aa0ac');
      break;
    case 'book':
      fillRR(x, hx - 2.6, hy - 6.6, 4.4, 7, 0.4, lgrad(x, hx - 2.6, 0, hx + 1.8, 0, [[0, '#e05040'], [1, '#8a2418']]));
      fillRR(x, hx + 1.4, hy - 6.2, 0.9, 6.3, 0.2, '#f2efe6');
      seg(x, hx - 2.4, hy - 4.6, hx + 1.6, hy - 4.6, '#f2b632', 0.45, 'butt');
      break;
    case 'folder':
      fillRR(x, hx - 2.4, hy - 6, 4.4, 6, 0.4, lgrad(x, hx - 2.4, 0, hx + 2, 0, [[0, '#f8cc5a'], [1, '#c8901e']]));
      seg(x, hx - 2.2, hy - 5.5, hx + 1.8, hy - 5.5, 'rgba(255,255,255,0.5)', 0.3);
      break;
    case 'mug':
      fillRR(x, hx + 0.2, hy - 3.6, 2.8, 3.2, 0.5, lgrad(x, hx, 0, hx + 3, 0, [[0, '#f07060'], [1, '#a82a20']]));
      x.beginPath();
      x.arc(hx + 3.1, hy - 2.0, 0.9, -Math.PI / 2, Math.PI / 2);
      x.strokeStyle = '#c0392b';
      x.lineWidth = 0.45;
      x.stroke();
      ell(x, hx + 1.6, hy - 3.6, 1.3, 0.35, '#5a3020');
      break;
    case 'wrench':
      seg(x, hx + 0.3, hy + 0.6, hx + 0.6, hy - 5.8, lgrad(x, hx - 0.5, 0, hx + 1.5, 0, [[0, '#d8e0ea'], [1, '#6a7480']]), 0.9);
      x.beginPath();
      x.arc(hx + 0.6, hy - 6.4, 1.2, Math.PI * 0.2, Math.PI * 1.8);
      x.strokeStyle = '#a8b0bc';
      x.lineWidth = 0.7;
      x.stroke();
      break;
    case 'tablet':
      fillRR(x, hx - 2.4, hy - 6.2, 5, 6.4, 0.6, '#22222c');
      fillRR(x, hx - 1.9, hy - 5.7, 4, 5.2, 0.3, lgrad(x, hx - 2, hy - 6, hx + 2, hy, [[0, '#9ae0ff'], [1, '#3a80d0']]));
      break;
    case 'phone':
      fillRR(x, hx - 0.4, hy - 3.8, 1.9, 3.2, 0.4, '#22222c');
      fillRR(x, hx - 0.15, hy - 3.5, 1.4, 2.5, 0.2, '#6ac0f0');
      break;
    case 'keys':
      x.beginPath();
      x.arc(hx + 0.3, hy + 1.6, 0.8, 0, Math.PI * 2);
      x.strokeStyle = '#d8c060';
      x.lineWidth = 0.35;
      x.stroke();
      fillRR(x, hx - 0.2, hy + 2.2, 0.7, 2, 0.2, '#f2c230');
      fillRR(x, hx + 0.6, hy + 2.0, 0.6, 1.6, 0.2, '#c8ccd4');
      break;
    case 'scanner':
      fillRR(x, hx - 1.0, hy - 3.8, 3.2, 2.6, 0.7, lgrad(x, hx - 1, 0, hx + 2.2, 0, [[0, '#ffd84a'], [1, '#c89a10']]));
      fillRR(x, hx - 0.2, hy - 1.6, 1.3, 2.6, 0.4, '#2a2a33');
      ell(x, hx + 1.7, hy - 2.5, 0.35, 0.35, '#ff4a3a');
      break;
    case 'mirror':
      seg(x, hx + 0.4, hy + 0.4, hx + 0.6, hy - 4.6, '#b0b8c4', 0.45);
      ell(x, hx + 0.6, hy - 5.4, 1.2, 1.0, rgrad(x, hx + 0.2, hy - 5.8, 1.6, [[0, '#ffffff'], [1, '#9aa8b8']]));
      break;
    case 'calculator':
      fillRR(x, hx - 2.2, hy - 5.0, 4, 5, 0.5, '#3a3a4a');
      fillRR(x, hx - 1.6, hy - 4.5, 2.8, 1.2, 0.2, '#a8e0a0');
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ell(x, hx - 1.1 + i * 0.95, hy - 2.6 + j * 1.0, 0.3, 0.3, '#c8c8d4');
      break;
  }
}

// Draws one person. Feet at (cx, feetY). Everything inside is in figure units.
export function drawPersonHD(x: Ctx, p: Person, cx: number, feetY: number, o: HDOpts = {}): void {
  const t = o.t ?? 0;
  const sc = o.scale ?? 1;
  const walking = o.walk !== undefined;
  const ph = (o.walk ?? 0) * Math.PI * 2;
  const breath = walking ? Math.abs(Math.sin(ph)) * 0.55 : Math.sin(t * 2.2 + cx) * 0.22;
  const u = Math.max(0, Math.min(2, p.short ?? 0)) * 0.9;
  const wd = p.wide ? 1.5 : 0;
  x.save();
  x.translate(cx, feetY);
  x.scale(sc, sc);
  if (o.shadow !== false) softShadow(x, 0, 0.2, 8.5 + wd, 2.1, 0.42);

  const seated = !!o.seated;
  const lift = seated ? 9 : 0; // sitting lowers the upper body onto a seat
  const by = -breath + lift; // upper-body offset
  const sy = -17.4 + u + by; // shoulder line
  const wy = -8.6 + u * 0.4 + by * 0.4 + lift * 0.6; // waist
  const sw = 4.9 + wd;
  const ww = 4.3 + wd;
  const top = p.hood ?? p.shirt;
  const shoes = p.shoes ?? '#2a2a33';
  const dir = o.dir ?? 1;

  const hy = -25.0 + u + by; // head center

  // ---------- legs ----------
  if (seated) {
    // thighs forward, shins down to the floor
    const kx = dir * 6.5;
    limb(x, [-1.8 * dir, wy + 1.2, kx - 1.2 * dir, wy + 1.6, kx - 1.2 * dir, -1.6], 3.3, p.pants);
    limb(x, [1.8 * dir, wy + 1.2, kx + 1.6 * dir, wy + 1.6, kx + 1.6 * dir, -1.6], 3.3, shade(p.pants, 0.9));
    for (const k of [-1.2, 1.6]) {
      ell(x, kx + k * dir + dir * 0.6, -0.9, 2.3, 1.2, edge(shoes));
      ell(x, kx + k * dir + dir * 0.6, -1.0, 2.0, 1.0, lgrad(x, 0, -2, 0, 0, [[0, shade(shoes, 1.5)], [1, shoes]]));
    }
  } else {
    const st = walking ? Math.sin(ph) * 2.2 : 0;
    const lUp = walking ? Math.max(0, Math.sin(ph)) * 1.2 : 0;
    const rUp = walking ? Math.max(0, -Math.sin(ph)) * 1.2 : 0;
    const legs: [number, number, number, string][] = [
      [-2.0, st * 0.5, lUp, p.pants],
      [2.0, -st * 0.5, rUp, shade(p.pants, 0.86)],
    ];
    for (const [lx, dx, up, c] of legs) {
      limb(x, [lx * 0.95, wy + 0.8, lx + dx, -1.6 - up], 3.2, c);
      // shoes
      const fx = lx + dx + (lx < 0 ? -0.3 : 0.3);
      ell(x, fx, -1.0 - up, 2.55, 1.45, edge(shoes));
      ell(x, fx, -1.1 - up, 2.25, 1.2, lgrad(x, 0, -2.3 - up, 0, -0.1 - up, [[0, shade(shoes, 1.7)], [0.5, shoes], [1, shade(shoes, 0.7)]]));
      ell(x, fx - 0.7, -1.7 - up, 0.8, 0.3, 'rgba(255,255,255,0.28)');
    }
  }

  // hair that falls behind the shoulders is painted before the body
  const tilt = walking ? 0 : Math.sin(t * 0.9 + cx * 0.3) * 0.025;
  const head = (back: boolean): void => {
    x.save();
    x.translate(0, hy);
    x.rotate(tilt);
    if (back) drawHairBack(x, p, t);
    else drawHead(x, p, { blink: o.blink, look: o.face ?? 0, mouth: o.talk ? 1.2 : 0, expr: o.expr, noBack: true }, t);
    x.restore();
  };
  head(true);

  // neck
  fillRR(x, -1.35, hy + 4, 2.7, sy - hy - 3.2, 0.6, lgrad(x, -1.4, 0, 1.4, 0, [[0, shade(p.skin, 0.85)], [1, shade(p.skin, 0.62)]]));


  // ---------- torso ----------
  const coatLen = p.coat ? 3.2 : 0;
  // pants/hips under the shirt hem
  fillRR(x, -ww, wy - 0.6, ww * 2, 2.6, 0.9, lgrad(x, -ww, 0, ww, 0, [[0, shade(p.pants, 1.1)], [1, shade(p.pants, 0.72)]]));
  torsoPath(x, sw, sy, ww, wy);
  x.fillStyle = lgrad(x, -sw, sy, sw, wy, [
    [0, shade(top, 1.2)],
    [0.4, top],
    [1, shade(top, 0.66)],
  ]);
  x.fill();
  x.strokeStyle = edge(top);
  x.lineWidth = 0.35;
  x.stroke();
  x.save();
  torsoPath(x, sw, sy, ww, wy);
  x.clip();
  // vertical occlusion: darker toward the waist, plus a soft fold under the chest
  x.fillStyle = lgrad(x, 0, sy, 0, wy + 1.3, [[0, 'rgba(255,255,255,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,0,30,0.2)']]);
  x.fillRect(-sw - 1, sy - 1, sw * 2 + 2, wy - sy + 3);
  if (p.plaid) {
    x.globalAlpha = 0.5;
    for (let k = -3; k <= 3; k++) x.fillRect(k * 2.6 - 0.45, sy - 1, 0.9, wy - sy + 3);
    for (let k = 0; k < 4; k++) x.fillRect(-sw - 1, sy + 1.5 + k * 2.6, sw * 2 + 2, 0.8);
    x.fillStyle = p.plaid;
    x.globalAlpha = 0.55;
    for (let k = -3; k <= 3; k++) x.fillRect(k * 2.6 - 0.45, sy - 1, 0.9, wy - sy + 3);
    for (let k = 0; k < 4; k++) x.fillRect(-sw - 1, sy + 1.5 + k * 2.6, sw * 2 + 2, 0.8);
    x.globalAlpha = 1;
  }
  // cloth folds
  x.strokeStyle = rgba(shade(top, 0.55), 0.35);
  x.lineWidth = 0.35;
  x.beginPath();
  x.moveTo(-2.8, wy - 2.4);
  x.quadraticCurveTo(-1.2, wy - 1.6, 0.4, wy - 2.2);
  x.moveTo(1.6, wy - 3.6);
  x.quadraticCurveTo(2.6, wy - 2.4, 3.6, wy - 2.8);
  x.stroke();
  if (p.hood) {
    fillRR(x, -3.2, wy - 4.2, 6.4, 3.4, 1.2, lgrad(x, 0, wy - 4.2, 0, wy - 0.8, [[0, shade(p.hood, 0.95)], [1, shade(p.hood, 0.78)]]));
    seg(x, -3.0, wy - 4.1, 3.0, wy - 4.1, rgba(shade(p.hood, 0.5), 0.5), 0.3);
  }
  // belt line
  x.fillStyle = rgba(shade(p.pants, 0.6), 0.9);
  x.fillRect(-ww - 1, wy + 0.4, ww * 2 + 2, 0.9);
  x.restore();

  // apron
  if (p.apron) {
    const a = p.apron;
    seg(x, -2.2, sy + 3, -1.6, sy - 0.2, a, 0.6);
    seg(x, 2.2, sy + 3, 1.6, sy - 0.2, a, 0.6);
    rr(x, -3.3, sy + 2.8, 6.6, wy - sy + 1.8, 1.0);
    x.fillStyle = lgrad(x, -3.3, 0, 3.3, 0, [[0, shade(a, 1.18)], [0.5, a], [1, shade(a, 0.72)]]);
    x.fill();
    x.strokeStyle = edge(a);
    x.lineWidth = 0.3;
    x.stroke();
    fillRR(x, -2.0, sy + 6.4, 4.0, 1.8, 0.4, rgba(shade(a, 0.75), 0.9));
  }
  // vest with reflective bands
  if (p.vest) {
    const v = p.vest;
    for (const s of [-1, 1]) {
      x.save();
      torsoPath(x, sw + 0.15, sy - 0.1, ww + 0.15, wy + 0.3);
      x.clip();
      const x0 = s < 0 ? -sw - 1 : 1.5;
      const x1 = s < 0 ? -1.5 : sw + 1;
      x.fillStyle = lgrad(x, x0, 0, x1, 0, [[0, shade(v, s < 0 ? 1.15 : 1.0)], [1, shade(v, s < 0 ? 0.95 : 0.75)]]);
      x.fillRect(x0, sy - 1, x1 - x0, wy - sy + 3);
      for (const yy of [sy + 4.6, sy + 7.0]) {
        x.fillStyle = lgrad(x, 0, yy, 0, yy + 1, [[0, '#ffffff'], [1, '#b8c0cc']]);
        x.fillRect(x0, yy, x1 - x0, 0.9);
      }
      x.restore();
    }
  }
  // coat / blazer / cardigan / lab coat
  if (p.coat) {
    const c = p.coat;
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(s * 0.8, sy + 0.2);
      x.lineTo(s * (sw - 1.6), sy - 0.3);
      x.quadraticCurveTo(s * (sw + 0.4), sy, s * (sw + 0.4), sy + 2.4);
      x.lineTo(s * (ww + 0.9), wy + coatLen);
      x.lineTo(s * 1.4, wy + coatLen);
      x.lineTo(s * 1.1, sy + 5.5);
      x.closePath();
      x.fillStyle = lgrad(x, -sw, sy, sw, wy, [[0, shade(c, 1.18)], [0.45, c], [1, shade(c, 0.68)]]);
      x.fill();
      x.strokeStyle = edge(c);
      x.lineWidth = 0.32;
      x.stroke();
      // lapel
      poly(x, [s * 0.8, sy + 0.2, s * 2.6, sy + 0.4, s * 1.1, sy + 5.5], shade(c, s < 0 ? 1.12 : 0.86));
    }
  }
  // neckwear
  if (p.tie) {
    poly(x, [-0.7, sy + 0.4, 0.7, sy + 0.4, 0.45, sy + 1.6, -0.45, sy + 1.6], shade(p.tie, 0.8));
    poly(x, [-0.45, sy + 1.5, 0.45, sy + 1.5, 0.95, wy - 1.4, 0, wy - 0.4, -0.95, wy - 1.4], lgrad(x, -1, 0, 1, 0, [[0, shade(p.tie, 1.2)], [1, shade(p.tie, 0.75)]]));
  }
  if (p.bowtie) {
    poly(x, [0, sy + 0.9, -2.0, sy - 0.1, -2.0, sy + 1.9], p.bowtie);
    poly(x, [0, sy + 0.9, 2.0, sy - 0.1, 2.0, sy + 1.9], shade(p.bowtie, 0.75));
    ell(x, 0, sy + 0.9, 0.55, 0.55, shade(p.bowtie, 0.65));
  }
  if (p.scarf) {
    fillRR(x, -3.6, sy - 1.2, 7.2, 2.6, 1.2, lgrad(x, -3.6, 0, 3.6, 0, [[0, shade(p.scarf, 1.15)], [1, shade(p.scarf, 0.7)]]));
    fillRR(x, 1.2, sy + 0.8, 2.0, 5, 0.8, shade(p.scarf, 0.85));
  }
  if (p.necklace) {
    x.beginPath();
    x.ellipse(0, sy - 0.3, 2.5, 2.4, 0, Math.PI * 0.1, Math.PI * 0.9);
    x.strokeStyle = p.necklace;
    x.lineWidth = 0.35;
    x.stroke();
    ell(x, 0, sy + 2.1, 0.5, 0.5, p.necklace);
  }
  if (p.lanyard) {
    seg(x, -1.6, sy, -0.4, sy + 4.4, p.lanyard, 0.5);
    seg(x, 1.6, sy, 0.4, sy + 4.4, p.lanyard, 0.5);
    fillRR(x, -1.2, sy + 4.2, 2.4, 3.0, 0.3, '#f6f2e8');
    x.fillStyle = p.lanyard;
    x.fillRect(-1.2, sy + 4.2, 2.4, 0.8);
  }
  if (p.badge) {
    const bx = p.coat ? -3.4 : 2.0;
    fillRR(x, bx, sy + 2.6, 2.2, 1.3, 0.3, p.hat === 'police' ? lgrad(x, bx, 0, bx + 2.2, 0, [[0, '#fff0a0'], [1, '#c8961a']]) : '#f8f4ea');
    if (p.hat !== 'police') seg(x, bx + 0.4, sy + 3.25, bx + 1.8, sy + 3.25, 'rgba(60,80,140,0.6)', 0.25, 'butt');
  }
  if (p.stethoscope) {
    x.beginPath();
    x.moveTo(-2.2, sy - 0.2);
    x.quadraticCurveTo(-2.6, sy + 4, -0.4, sy + 5.4);
    x.moveTo(2.2, sy - 0.2);
    x.quadraticCurveTo(2.4, sy + 3, 1.4, sy + 6.4);
    x.strokeStyle = '#4a5460';
    x.lineWidth = 0.45;
    x.stroke();
    ell(x, 1.4, sy + 7, 0.8, 0.8, rgrad(x, 1.1, sy + 6.7, 1.1, [[0, '#ffffff'], [1, '#8a96a4']]));
  }
  if (p.headphones) {
    x.beginPath();
    x.ellipse(0, sy - 0.5, 3.6, 1.6, 0, 0, Math.PI);
    x.strokeStyle = '#2a2a33';
    x.lineWidth = 0.5;
    x.stroke();
    for (const s of [-1, 1]) ell(x, s * 3.4, sy - 0.2, 1.3, 1.6, rgrad(x, s * 3.4 - 0.4, sy - 0.7, 2, [[0, shade(p.headphones, 1.3)], [1, shade(p.headphones, 0.6)]]));
  }
  if (p.hood) {
    // hood bunched behind the neck
    x.beginPath();
    x.ellipse(0, sy + 0.2, 4.2, 1.8, 0, Math.PI, Math.PI * 2);
    x.fillStyle = lgrad(x, 0, sy - 1.6, 0, sy + 0.4, [[0, shade(p.hood, 1.1)], [1, shade(p.hood, 0.75)]]);
    x.fill();
    seg(x, -1.0, sy + 0.8, -1.2, sy + 4.8, '#f2efe6', 0.3);
    seg(x, 1.0, sy + 0.8, 1.2, sy + 4.4, '#f2efe6', 0.3);
  }
  if (p.toolbelt) {
    fillRR(x, -ww - 0.4, wy - 0.2, ww * 2 + 0.8, 1.6, 0.4, lgrad(x, 0, wy, 0, wy + 1.6, [[0, '#9a6a3a'], [1, '#5a3a20']]));
    for (const s of [-1, 1]) fillRR(x, s * (ww - 0.6) - 1.4, wy + 0.6, 2.8, 3.2, 0.6, lgrad(x, s * ww - 1.4, 0, s * ww + 1.4, 0, [[0, '#7a5232'], [1, '#4a2e18']]));
    seg(x, ww - 0.6, wy + 0.6, ww - 0.2, wy - 1.6, '#9aa4b0', 0.4);
    ell(x, 0, wy + 0.6, 0.7, 0.6, '#c8a040');
  }

  // ---------- arms ----------
  const sleeve = p.coat ?? p.hood ?? p.shirt;
  const bare = !!p.shortSleeves && !p.coat && !p.hood;
  const swing = walking ? Math.sin(ph) * 1.6 : Math.sin(t * 2.2 + cx) * 0.15;
  const ges = o.gesture ?? 0;
  const armW = 2.6 + (p.wide ? 0.4 : 0);
  const arm = (side: -1 | 1, pts: number[], hx: number, hyy: number): void => {
    if (bare) {
      const mx = (pts[0] + pts[2]) / 2;
      const my = (pts[1] + pts[3]) / 2;
      limb(x, [mx, my, ...pts.slice(2)], armW * 0.85, side < 0 ? p.skin : shade(p.skin, 0.9));
      limb(x, [pts[0], pts[1], mx, my], armW + 0.3, side < 0 ? sleeve : shade(sleeve, 0.9));
    } else limb(x, pts, armW, side < 0 ? sleeve : shade(sleeve, 0.88));
    hand(x, hx, hyy, p.skin);
  };
  // viewer-left arm (can gesture)
  const lsx = -sw + 0.6;
  if (ges === 1) {
    arm(-1, [lsx, sy + 1.2, lsx - 2.6, sy + 5.6, lsx - 5.2, sy + 4.0], lsx - 5.6, sy + 3.6);
  } else if (ges === 2) {
    arm(-1, [lsx, sy + 1.2, lsx - 0.8, sy + 6.6, -1.4, sy + 4.6], -1.2, sy + 4.4);
  } else {
    arm(-1, [lsx, sy + 1.2, lsx - 1.0 + swing * 0.3, sy + 5.0, lsx - 0.6 + swing, wy + 0.2], lsx - 0.6 + swing, wy + 0.6);
  }
  // viewer-right arm (holds things)
  const rsx = sw - 0.6;
  const holdsUp = p.holds && ['clipboard', 'book', 'folder', 'tablet', 'calculator'].includes(p.holds);
  let rhx = rsx + 0.6 - swing;
  let rhy = wy + 0.6;
  if (holdsUp && !walking) {
    rhx = rsx - 0.4;
    rhy = wy - 1.8;
    if (!seated) heldItem(x, p, rhx + 0.4, rhy + 0.6);
    arm(1, [rsx, sy + 1.2, rsx + 1.2, sy + 5.4, rhx, rhy], rhx, rhy);
  } else {
    if (p.holds && (p.holds === 'mug' || p.holds === 'phone')) {
      rhx = rsx + 0.8;
      rhy = wy - 1.6;
      arm(1, [rsx, sy + 1.2, rsx + 1.5, sy + 5.8, rhx, rhy], rhx, rhy);
    } else arm(1, [rsx, sy + 1.2, rsx + 1.0 - swing * 0.3, sy + 5.0, rhx, rhy], rhx, rhy);
    if (p.holds && !(holdsUp && !walking)) heldItem(x, p, rhx, rhy);
  }

  // ---------- head ----------
  head(false);
  x.restore();
}

// Seated helper (hips on a seat whose top is at seatY).
export function drawSeatedHD(x: Ctx, p: Person, cx: number, seatY: number, o: HDOpts = {}): void {
  drawPersonHD(x, p, cx, seatY + 9, { ...o, seated: true, shadow: false });
}

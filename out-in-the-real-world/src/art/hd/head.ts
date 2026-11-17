// HD heads: a smooth-shaded head, face, hair, hats and glasses built from the same
// Person data as the pixel sprites. Drawn in head-local units (head radius ~5.6),
// so the same code paints the little in-scene figures and the big dialogue busts.
import { HAIRS, type Person } from '../people.ts';
import { ell, lgrad, mix, poly, rgba, rgrad, rr, seg, shade, type Ctx } from './kit.ts';

export type Expr = 'neutral' | 'happy' | 'worried' | 'annoyed' | 'surprised';
export interface FaceOpts {
  expr?: Expr;
  mouth?: number; // 0 closed .. 2 wide open
  blink?: boolean;
  look?: number; // -1 .. 1 gaze / head turn
  detail?: boolean; // portrait-size extras (lashes, lip line, iris)
  noBack?: boolean; // back hair already drawn by the caller (behind the body)
}

const RECEDING = 20;
const SLICK = 21;
const INK = '#1c1424';
export const HR = 5.6; // head half-width
export const HRY = 6.1;

const grey = (p: Person): boolean => p.hair === HAIRS[6];
export function hairHi(h: string): string {
  return mix(h, '#fff4e8', 0.32);
}
export function hairFill(x: Ctx, h: string, cx = -2, cy = -5, r = 10): CanvasGradient {
  return rgrad(x, cx, cy, r, [
    [0, mix(h, '#fff0e0', 0.22)],
    [0.42, h],
    [1, shade(h, 0.55)],
  ]);
}
const edge = (c: string): string => rgba(shade(c, 0.38), 0.75);

function headPath(x: Ctx): void {
  x.beginPath();
  x.ellipse(0, -0.4, HR, HRY - 0.4, 0, Math.PI, Math.PI * 2);
  // jaw: rounded, a touch narrower toward the chin
  x.bezierCurveTo(HR, 2.6, 3.8, HRY - 0.2, 0, HRY);
  x.bezierCurveTo(-3.8, HRY - 0.2, -HR, 2.6, -HR, -0.4);
  x.closePath();
}

function hasBackHair(p: Person): boolean {
  if (p.style === 6) return true;
  if (p.hat === 'police' || p.hat === 'hard') return false;
  return [1, 2, 5, 7, 8].includes(p.style);
}

// Hair that sits behind the head and shoulders (long, bob, afro, ponytail, braids).
export function drawHairBack(x: Ctx, p: Person, t = 0): void {
  const h = p.hair;
  if (!hasBackHair(p)) return;
  x.save();
  switch (p.style) {
    case 1: {
      // long: falls past the shoulders
      x.beginPath();
      x.moveTo(-6.4, -2);
      x.bezierCurveTo(-7.4, 4, -7.2, 9, -6.2, 12.5);
      x.quadraticCurveTo(0, 14.2, 6.2, 12.5);
      x.bezierCurveTo(7.2, 9, 7.4, 4, 6.4, -2);
      x.closePath();
      x.fillStyle = lgrad(x, -7, 0, 7, 0, [
        [0, shade(h, 0.85)],
        [0.5, shade(h, 0.62)],
        [1, shade(h, 0.5)],
      ]);
      x.fill();
      x.strokeStyle = edge(h);
      x.lineWidth = 0.35;
      x.stroke();
      break;
    }
    case 8: {
      // bob: ends at the jaw
      x.beginPath();
      x.moveTo(-6.6, -2);
      x.bezierCurveTo(-7.2, 2, -7.2, 5.2, -6.0, 6.0);
      x.quadraticCurveTo(0, 6.8, 6.0, 6.0);
      x.bezierCurveTo(7.2, 5.2, 7.2, 2, 6.6, -2);
      x.closePath();
      x.fillStyle = lgrad(x, -7, 0, 7, 0, [
        [0, shade(h, 0.9)],
        [1, shade(h, 0.5)],
      ]);
      x.fill();
      break;
    }
    case 6: {
      // afro: a big soft cloud
      const g = rgrad(x, -3, -6, 13, [
        [0, mix(h, '#fff0e0', 0.18)],
        [0.5, h],
        [1, shade(h, 0.55)],
      ]);
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (0.92 + (i / 10) * 1.16);
        ell(x, Math.cos(a) * 6.6, -2.6 + Math.sin(a) * 6.4, 2.9, 2.7, g);
      }
      ell(x, 0, -3, 7.8, 7.2, g);
      break;
    }
    case 5: {
      // ponytail swinging behind
      const sw = Math.sin(t * 2.1) * 0.5;
      x.beginPath();
      x.moveTo(3.5, -4.5);
      x.bezierCurveTo(8.5 + sw, -4.5, 8.2 + sw, 2, 7.0 + sw * 1.4, 8);
      x.quadraticCurveTo(5.6 + sw, 8.4, 5.6 + sw, 6.6);
      x.bezierCurveTo(6.2, 2.5, 6.0, -1, 3.2, -2.2);
      x.closePath();
      x.fillStyle = lgrad(x, 3, -4, 8, 8, [
        [0, h],
        [1, shade(h, 0.6)],
      ]);
      x.fill();
      x.strokeStyle = edge(h);
      x.lineWidth = 0.3;
      x.stroke();
      ell(x, 5.0, -3.2, 1.0, 0.8, '#e0503c');
      break;
    }
    case 7: {
      // braids: hang in front later; here just the back mass
      ell(x, 0, -1.5, 6.4, 6.2, shade(h, 0.6));
      break;
    }
    case 2: {
      // bun on top (drawn behind so the cap blends into it)
      ell(x, 0, -7.6, 2.8, 2.5, hairFill(x, h, -1, -9, 4));
      break;
    }
  }
  x.restore();
}

function eye(x: Ctx, ex: number, ey: number, f: FaceOpts, lid: string): void {
  const expr = f.expr ?? 'neutral';
  const lk = f.look ?? 0;
  if (f.blink) {
    x.beginPath();
    x.moveTo(ex - 0.8, ey + 0.1);
    x.quadraticCurveTo(ex, ey + 0.6, ex + 0.8, ey + 0.1);
    x.strokeStyle = INK;
    x.lineWidth = 0.32;
    x.lineCap = 'round';
    x.stroke();
    return;
  }
  if (expr === 'happy') {
    // smiling eyes: closed upward arcs
    x.beginPath();
    x.moveTo(ex - 0.85, ey + 0.35);
    x.quadraticCurveTo(ex, ey - 0.75, ex + 0.85, ey + 0.35);
    x.strokeStyle = INK;
    x.lineWidth = 0.42;
    x.lineCap = 'round';
    x.stroke();
    return;
  }
  const big = expr === 'surprised' ? 1.2 : 1;
  if (f.detail || expr === 'surprised') {
    // whites with a soft upper-lid shadow
    ell(x, ex, ey, 0.95 * big, 1.15 * big, '#fbf8f4');
    ell(x, ex, ey - 0.5 * big, 0.9 * big, 0.55 * big, 'rgba(120,90,110,0.18)');
  }
  const px = ex + lk * 0.28;
  const pr = f.detail ? 0.66 : 0.62;
  ell(x, px, ey + 0.08, pr * big, (f.detail ? 0.9 : 0.92) * big, INK);
  if (f.detail) ell(x, px, ey + 0.25, pr * 0.62 * big, 0.55 * big, 'rgba(90,70,110,0.9)');
  ell(x, px - 0.22, ey - 0.3, 0.22 * big, 0.24 * big, '#ffffff');
  if (f.detail) ell(x, px + 0.25, ey + 0.4, 0.1, 0.1, 'rgba(255,255,255,0.7)');
  if (expr === 'annoyed') {
    // heavy upper lid
    x.save();
    x.beginPath();
    x.rect(ex - 1.4, ey - 1.7, 2.8, 1.5);
    x.clip();
    ell(x, ex, ey - 0.1, 1.2, 1.35, lid);
    x.restore();
    seg(x, ex - 1.0, ey - 0.2, ex + 1.0, ey - 0.2, INK, 0.3);
  }
}

function brow(x: Ctx, bx: number, by: number, side: -1 | 1, f: FaceOpts, c: string, w: number): void {
  const expr = f.expr ?? 'neutral';
  // inner end is toward the center (x * -side)
  let inner = 0;
  let lift = 0;
  if (expr === 'worried') inner = -0.55;
  else if (expr === 'annoyed') inner = 0.6;
  else if (expr === 'surprised') lift = -0.6;
  else if (expr === 'happy') lift = -0.2;
  const xi = bx - side * 0.9;
  const xo = bx + side * 0.9;
  x.beginPath();
  x.moveTo(xo, by + lift + (expr === 'worried' ? 0.25 : 0));
  x.quadraticCurveTo(bx, by + lift - 0.35, xi, by + lift + inner);
  x.strokeStyle = c;
  x.lineWidth = w;
  x.lineCap = 'round';
  x.stroke();
}

function mouthShape(x: Ctx, mx: number, my: number, f: FaceOpts, p: Person): void {
  const expr = f.expr ?? 'neutral';
  const m = f.mouth ?? 0;
  const lip = mix(shade(p.skin, 0.62), '#b04a4a', 0.45);
  if (m > 0 || expr === 'surprised') {
    const open = expr === 'surprised' ? Math.max(1.4, m) : m;
    const w = expr === 'surprised' ? 0.75 : expr === 'happy' ? 1.35 : 1.05;
    const h = 0.35 + open * 0.38;
    x.beginPath();
    if (expr === 'happy') {
      x.moveTo(mx - w, my - 0.15);
      x.quadraticCurveTo(mx, my - 0.05, mx + w, my - 0.15);
      x.quadraticCurveTo(mx + w * 0.7, my + h * 1.4, mx, my + h * 1.4);
      x.quadraticCurveTo(mx - w * 0.7, my + h * 1.4, mx - w, my - 0.15);
    } else x.ellipse(mx, my + h * 0.45, w, h, 0, 0, Math.PI * 2);
    x.fillStyle = '#5a1a26';
    x.fill();
    x.save();
    x.clip();
    ell(x, mx, my + h * 1.2, w * 0.7, h * 0.6, '#e06a7a'); // tongue
    if (expr === 'happy' || open > 1) poly(x, [mx - w, my - 0.4, mx + w, my - 0.4, mx + w, my + 0.05, mx - w, my + 0.05], '#fbf6f0'); // teeth
    x.restore();
    return;
  }
  x.beginPath();
  x.lineCap = 'round';
  x.strokeStyle = lip;
  x.lineWidth = 0.34;
  if (expr === 'happy') {
    x.moveTo(mx - 1.4, my - 0.2);
    x.quadraticCurveTo(mx, my + 1.1, mx + 1.4, my - 0.2);
  } else if (expr === 'worried') {
    x.moveTo(mx - 0.95, my + 0.35);
    x.quadraticCurveTo(mx, my - 0.35, mx + 0.95, my + 0.35);
  } else if (expr === 'annoyed') {
    x.moveTo(mx - 0.9, my + 0.1);
    x.lineTo(mx + 0.9, my - 0.05);
  } else {
    x.moveTo(mx - 0.9, my);
    x.quadraticCurveTo(mx, my + 0.45, mx + 0.9, my);
  }
  x.stroke();
}

// The head with face, centered at (0,0) in head-local units; caller translates/scales.
export function drawHead(x: Ctx, p: Person, f: FaceOpts = {}, t = 0): void {
  const lk = Math.max(-1, Math.min(1, f.look ?? 0));
  const fx = lk * 0.9; // features shift toward the gaze
  const h = p.hair;
  if (!f.noBack) drawHairBack(x, p, t);
  // ears
  for (const s of [-1, 1] as const) {
    const ex = s * (HR - 0.15) - lk * 0.35;
    ell(x, ex, 0.9, 1.05, 1.5, rgrad(x, ex - 0.3, 0.4, 1.8, [[0, shade(p.skin, 1.02)], [1, shade(p.skin, 0.72)]]));
    ell(x, ex + s * 0.1, 1.0, 0.45, 0.8, rgba(shade(p.skin, 0.6), 0.45));
  }
  // head
  headPath(x);
  x.fillStyle = rgrad(x, -1.9 + fx * 0.4, -2.4, 9.6, [
    [0, shade(p.skin, 1.1)],
    [0.45, p.skin],
    [0.85, shade(p.skin, 0.84)],
    [1, shade(p.skin, 0.74)],
  ]);
  x.fill();
  x.strokeStyle = edge(p.skin);
  x.lineWidth = 0.3;
  x.stroke();
  // under-jaw occlusion and cheeks
  x.save();
  headPath(x);
  x.clip();
  ell(x, 0, HRY + 1.4, 5.2, 2.6, rgba(shade(p.skin, 0.45), 0.25));
  for (const s of [-1, 1]) ell(x, s * 3.4 + fx, 2.4, 1.5, 0.95, 'rgba(240,110,120,0.22)');
  x.restore();
  // nose
  ell(x, fx * 1.2 + 0.35, 2.15, 0.75, 0.5, rgba(shade(p.skin, 0.55), 0.28));
  ell(x, fx * 1.2 - 0.2, 1.6, 0.35, 0.3, rgba('#ffffff', 0.18));
  // eyes and brows
  const ey = 0.55;
  const eyeX = 2.15;
  const browC = grey(p) ? '#9a9aa8' : shade(h, p.brows ? 0.8 : 0.9);
  for (const s of [-1, 1] as const) {
    eye(x, s * eyeX + fx, ey, f, shade(p.skin, 0.95));
    brow(x, s * eyeX + fx, ey - 1.85, s, f, browC, p.brows ? 0.6 : 0.38);
  }
  if (f.detail && !f.blink && f.expr !== 'happy') {
    // lash line
    for (const s of [-1, 1]) {
      x.beginPath();
      x.ellipse(s * eyeX + fx, ey + 0.05, 1.0, 1.1, 0, Math.PI * 1.08, Math.PI * 1.92);
      x.strokeStyle = rgba(INK, 0.8);
      x.lineWidth = 0.22;
      x.stroke();
    }
  }
  // facial hair
  const fh = grey(p) ? '#cfcfd8' : mix(h, '#000000', 0.05);
  if (p.beard) {
    x.save();
    headPath(x);
    x.clip();
    x.beginPath();
    x.moveTo(-HR - 1, 0.4);
    x.quadraticCurveTo(-3.4, 2.4 + 0.4, -1.4 + fx, 3.0);
    x.quadraticCurveTo(fx, 2.5, 1.4 + fx, 3.0);
    x.quadraticCurveTo(3.4, 2.4 + 0.4, HR + 1, 0.4);
    x.lineTo(HR + 1, HRY + 2);
    x.lineTo(-HR - 1, HRY + 2);
    x.closePath();
    x.fillStyle = hairFill(x, fh, -1, 1, 8);
    x.fill();
    x.restore();
  }
  if (p.mustache || p.beard) {
    x.beginPath();
    x.moveTo(fx - 0.2, 2.65);
    x.quadraticCurveTo(fx - 1.6, 2.3, fx - 2.0, 3.35);
    x.quadraticCurveTo(fx - 1.0, 3.0, fx, 3.15);
    x.quadraticCurveTo(fx + 1.0, 3.0, fx + 2.0, 3.35);
    x.quadraticCurveTo(fx + 1.6, 2.3, fx + 0.2, 2.65);
    x.closePath();
    x.fillStyle = hairFill(x, fh, fx - 1, 2, 3);
    x.fill();
  }
  // mouth
  if (p.beard && !(f.mouth ?? 0) && f.expr !== 'surprised') {
    seg(x, fx - 0.7, 3.75, fx + 0.7, 3.75, '#3a1a1a', 0.3);
  } else mouthShape(x, fx, p.beard ? 3.8 : 3.65, f, p);
  // front hair
  drawHairFront(x, p, fx);
  if (p.earrings) {
    for (const s of [-1, 1]) {
      ell(x, s * (HR - 0.1) - lk * 0.35, 2.75, 0.45, 0.45, p.earrings);
      ell(x, s * (HR - 0.1) - lk * 0.35 - 0.15, 2.6, 0.15, 0.15, 'rgba(255,255,255,0.8)');
    }
  }
  if (p.glasses) drawGlasses(x, fx, ey, f.blink);
  drawHat(x, p, fx);
  if (p.headset) {
    x.beginPath();
    x.ellipse(0, -1, HR + 0.6, HRY + 0.4, 0, Math.PI * 1.05, Math.PI * 1.95);
    x.strokeStyle = '#2a2a33';
    x.lineWidth = 0.55;
    x.stroke();
    ell(x, -HR - 0.3, 0.8, 1.1, 1.5, lgrad(x, -HR - 1.3, 0, -HR + 0.7, 0, [[0, '#4a4a58'], [1, '#1a1a22']]));
    x.beginPath();
    x.moveTo(-HR - 0.3, 2);
    x.quadraticCurveTo(-HR + 0.5, 4.2, fx - 1.6, 3.9);
    x.strokeStyle = '#2a2a33';
    x.lineWidth = 0.3;
    x.stroke();
    ell(x, fx - 1.6, 3.9, 0.45, 0.4, '#3a3a48');
  }
}

function capPath(x: Ctx, sideY: number, fringe: 'bangs' | 'part' | 'straight' | 'swept'): void {
  x.beginPath();
  x.moveTo(-HR - 0.5, sideY);
  x.bezierCurveTo(-HR - 0.9, -4.5, -4.2, -7.6, 0, -7.5);
  x.bezierCurveTo(4.2, -7.6, HR + 0.9, -4.5, HR + 0.5, sideY);
  if (fringe === 'straight') {
    x.lineTo(HR - 0.4, sideY);
    x.lineTo(HR - 0.6, -2.2);
    x.lineTo(-HR + 0.6, -2.2);
    x.lineTo(-HR + 0.4, sideY);
  } else if (fringe === 'part') {
    x.quadraticCurveTo(HR - 0.6, -2.4, 3.5, -3.6);
    x.quadraticCurveTo(1.0, -3.0, -1.2, -4.6);
    x.quadraticCurveTo(-3.5, -2.8, -HR + 0.5, sideY);
  } else if (fringe === 'swept') {
    x.quadraticCurveTo(HR - 0.5, -2.0, 3.0, -2.6);
    x.quadraticCurveTo(0, -2.2, -2.4, -3.2);
    x.quadraticCurveTo(-4.4, -2.9, -HR + 0.5, sideY);
  } else {
    x.quadraticCurveTo(HR - 0.6, -2.3, 3.6, -2.0);
    x.quadraticCurveTo(2.6, -3.2, 1.4, -2.2);
    x.quadraticCurveTo(0.2, -3.3, -1.2, -2.1);
    x.quadraticCurveTo(-2.4, -3.3, -3.7, -2.2);
    x.quadraticCurveTo(-HR + 0.4, -2.6, -HR + 0.5, sideY);
  }
  x.closePath();
}

function sheen(x: Ctx, h: string, cy = -4.6, rx = 3.8, a = 0.4): void {
  x.beginPath();
  x.ellipse(-0.4, cy + 2.2, rx, 3.2, 0, Math.PI * 1.15, Math.PI * 1.6);
  x.strokeStyle = rgba(hairHi(h), a);
  x.lineWidth = 0.7;
  x.lineCap = 'round';
  x.stroke();
}

export function drawHairFront(x: Ctx, p: Person, fx = 0): void {
  const h = p.hair;
  if (p.hat === 'police' || p.hat === 'hard' || p.hat === 'beanie') {
    // only the bits that peek out under the hat
    if (p.style !== 4 && p.style !== RECEDING) {
      for (const s of [-1, 1]) ell(x, s * (HR - 0.2), -1.2, 0.9, 1.8, hairFill(x, h));
    }
    if (p.style === 1 || p.style === 7 || p.style === 8) drawSideLocks(x, p);
    return;
  }
  const fill = hairFill(x, h);
  const outline = (): void => {
    x.strokeStyle = edge(h);
    x.lineWidth = 0.3;
    x.stroke();
  };
  switch (p.style) {
    case 4: // buzz: a close-cropped shadow over the scalp
      x.save();
      x.beginPath();
      x.moveTo(-HR - 0.15, -0.8);
      x.bezierCurveTo(-HR - 0.4, -4.6, -4, -7.0, 0, -6.95);
      x.bezierCurveTo(4, -7.0, HR + 0.4, -4.6, HR + 0.15, -0.8);
      x.quadraticCurveTo(HR - 0.6, -2.8, 3, -3.6);
      x.quadraticCurveTo(0, -4.0, -3, -3.6);
      x.quadraticCurveTo(-HR + 0.6, -2.8, -HR - 0.15, -0.8);
      x.closePath();
      x.fillStyle = fill;
      x.globalAlpha = 0.92;
      x.fill();
      x.restore();
      return;
    case RECEDING:
      for (const s of [-1, 1]) {
        x.beginPath();
        x.moveTo(s * (HR + 0.3), 0.6);
        x.quadraticCurveTo(s * (HR + 0.7), -3.5, s * 3.2, -5.4);
        x.quadraticCurveTo(s * 4.4, -3.2, s * (HR - 0.6), 0.6);
        x.closePath();
        x.fillStyle = fill;
        x.fill();
      }
      ell(x, -1.2, -5.2, 1.8, 0.7, 'rgba(255,255,255,0.25)'); // scalp shine
      return;
    case SLICK:
      capPath(x, -0.4, 'part');
      x.fillStyle = fill;
      x.fill();
      outline();
      sheen(x, h, -4.4, 4.2, 0.6);
      return;
    case 3: {
      // curly: a bumpy crown of curls over a full cap
      const g = hairFill(x, h, -2, -6, 11);
      capPath(x, 0.8, 'bangs');
      x.fillStyle = g;
      x.fill();
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.0 + i / 8);
        ell(x, Math.cos(a) * 5.6, -1.8 + Math.sin(a) * 5.4, 2.0, 1.9, g);
      }
      for (const s of [-1, 1]) {
        ell(x, s * 5.6, 0.6, 1.5, 1.9, g);
        ell(x, s * 5.4, 2.6, 1.2, 1.4, g);
      }
      for (let i = 0; i < 5; i++) ell(x, -3.4 + i * 1.7, -3.3 + (i % 2) * 0.4, 1.3, 1.1, g);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (1.1 + i / 8);
        x.beginPath();
        x.arc(Math.cos(a) * 5.0, -2.2 + Math.sin(a) * 4.8, 0.8, Math.PI, Math.PI * 1.7);
        x.strokeStyle = rgba(hairHi(h), 0.45);
        x.lineWidth = 0.3;
        x.stroke();
      }
      return;
    }
    case 6: // afro: hairline only, the volume is at the back
      capPath(x, -1.2, 'swept');
      x.fillStyle = fill;
      x.fill();
      return;
    case 8:
      capPath(x, 3.8, 'straight');
      x.fillStyle = fill;
      x.fill();
      outline();
      sheen(x, h, -4.6, 4.0, 0.45);
      return;
    case 1:
      capPath(x, 2.4, 'part');
      x.fillStyle = fill;
      x.fill();
      outline();
      drawSideLocks(x, p);
      sheen(x, h);
      return;
    case 7:
      capPath(x, 0.4, 'part');
      x.fillStyle = fill;
      x.fill();
      outline();
      // cornrow lines
      for (let i = -2; i <= 2; i++) {
        x.beginPath();
        x.moveTo(i * 1.5, -7.0);
        x.quadraticCurveTo(i * 2.2, -4.5, i * 2.6, -2.6);
        x.strokeStyle = rgba(shade(h, 0.5), 0.6);
        x.lineWidth = 0.25;
        x.stroke();
      }
      drawSideLocks(x, p);
      return;
    case 2:
      capPath(x, 0.0, 'swept');
      x.fillStyle = fill;
      x.fill();
      outline();
      sheen(x, h);
      return;
    case 5:
      capPath(x, 0.4, 'swept');
      x.fillStyle = fill;
      x.fill();
      outline();
      sheen(x, h);
      return;
    default:
      capPath(x, 0.6, 'bangs');
      x.fillStyle = fill;
      x.fill();
      outline();
      sheen(x, h);
  }
  void fx;
}

// Long hair / braids framing the face.
function drawSideLocks(x: Ctx, p: Person): void {
  const h = p.hair;
  if (p.style === 7) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const bx = s * (HR + 0.2) - s * k * 0.06;
        const by = 0.5 + k * 1.7;
        ell(x, bx, by, 0.95, 1.0, hairFill(x, h, bx - 0.4, by - 0.4, 1.6));
      }
      ell(x, s * (HR - 0.2), 10.8, 0.65, 0.65, '#f2b632');
    }
    return;
  }
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(s * (HR + 0.6), -2.5);
    x.bezierCurveTo(s * (HR + 1.0), 2.5, s * (HR + 0.9), 7, s * (HR - 0.2), 10.5);
    x.lineTo(s * (HR - 1.6), 9.5);
    x.bezierCurveTo(s * (HR - 0.6), 5, s * (HR - 0.7), 1, s * (HR - 1.4), -2.5);
    x.closePath();
    x.fillStyle = lgrad(x, s * (HR - 1.6), -2, s * (HR + 1), 8, [
      [0, h],
      [1, shade(h, 0.65)],
    ]);
    x.fill();
  }
}

function drawGlasses(x: Ctx, fx: number, ey: number, blink?: boolean): void {
  for (const s of [-1, 1]) {
    rr(x, s * 2.15 + fx - 1.45, ey - 1.15, 2.9, 2.3, 0.8);
    x.fillStyle = 'rgba(200,230,255,0.16)';
    x.fill();
    x.strokeStyle = '#2e2e3e';
    x.lineWidth = 0.38;
    x.stroke();
    if (!blink) seg(x, s * 2.15 + fx - 0.8, ey - 0.6, s * 2.15 + fx - 0.2, ey - 0.9, 'rgba(255,255,255,0.75)', 0.25);
  }
  seg(x, fx - 0.75, ey - 0.3, fx + 0.75, ey - 0.3, '#2e2e3e', 0.32);
  seg(x, -HR + 0.2, ey - 0.6, fx - 3.6, ey - 0.4, '#2e2e3e', 0.3);
  seg(x, HR - 0.2, ey - 0.6, fx + 3.6, ey - 0.4, '#2e2e3e', 0.3);
}

function drawHat(x: Ctx, p: Person, fx: number): void {
  const hc = p.hatColor;
  if (p.hat === 'cap') {
    const c = hc ?? '#c0392b';
    x.save();
    x.beginPath();
    x.ellipse(0, -2.6, HR + 0.7, 5.6, 0, Math.PI, Math.PI * 2);
    x.closePath();
    x.fillStyle = rgrad(x, -2, -6, 9, [[0, shade(c, 1.3)], [0.5, c], [1, shade(c, 0.6)]]);
    x.fill();
    x.restore();
    seg(x, 0, -8.1, 0, -2.6, rgba(shade(c, 0.6), 0.6), 0.25);
    ell(x, 0, -8.1, 0.6, 0.4, shade(c, 0.8));
    // brim toward the viewer
    x.beginPath();
    x.ellipse(fx * 0.8, -2.4, HR + 1.4, 1.5, 0, 0, Math.PI * 2);
    x.fillStyle = lgrad(x, 0, -3.9, 0, -0.9, [[0, shade(c, 1.1)], [1, shade(c, 0.55)]]);
    x.fill();
    return;
  }
  if (p.hat === 'police') {
    poly(x, [-HR - 1.6, -8.4, HR + 1.6, -8.4, HR + 0.4, -2.6, -HR - 0.4, -2.6], lgrad(x, -HR, -8, HR, -3, [[0, '#3a4a8a'], [1, '#141a3a']]));
    ell(x, 0, -8.4, HR + 1.6, 1.0, '#2a3a72');
    poly(x, [-HR - 0.4, -4.0, HR + 0.4, -4.0, HR + 0.4, -2.6, -HR - 0.4, -2.6], '#0e1228');
    x.beginPath();
    x.ellipse(fx * 0.6, -2.4, HR + 0.6, 1.3, 0, 0, Math.PI);
    x.fillStyle = lgrad(x, 0, -2.4, 0, -1.1, [[0, '#3a3a48'], [1, '#08080e']]);
    x.fill();
    ell(x, fx * 0.4, -5.7, 1.1, 1.2, rgrad(x, fx * 0.4 - 0.4, -6.1, 1.6, [[0, '#fff2a8'], [1, '#c89a18']]));
    return;
  }
  if (p.hat === 'hard') {
    const c = hc ?? '#f2c230';
    x.beginPath();
    x.ellipse(0, -2.4, HR + 1.0, 6.2, 0, Math.PI, Math.PI * 2);
    x.closePath();
    x.fillStyle = rgrad(x, -2.4, -6.5, 10, [[0, shade(c, 1.35)], [0.45, c], [1, shade(c, 0.62)]]);
    x.fill();
    x.fillStyle = lgrad(x, -0.8, 0, 0.8, 0, [[0, shade(c, 1.15)], [1, shade(c, 0.75)]]);
    x.fillRect(-0.8, -8.5, 1.6, 6.1);
    x.beginPath();
    x.ellipse(fx * 0.5, -2.3, HR + 2.2, 1.3, 0, 0, Math.PI * 2);
    x.fillStyle = lgrad(x, 0, -3.6, 0, -1.0, [[0, shade(c, 1.2)], [1, shade(c, 0.6)]]);
    x.fill();
    return;
  }
  if (p.hat === 'beanie') {
    const c = hc ?? '#3f7fd8';
    x.beginPath();
    x.ellipse(0, -2.6, HR + 0.7, 6.0, 0, Math.PI, Math.PI * 2);
    x.closePath();
    x.fillStyle = rgrad(x, -2, -6, 9, [[0, shade(c, 1.3)], [0.5, c], [1, shade(c, 0.6)]]);
    x.fill();
    rr(x, -HR - 0.9, -4.0, (HR + 0.9) * 2, 2.6, 1.0);
    x.fillStyle = lgrad(x, 0, -4, 0, -1.4, [[0, shade(c, 1.05)], [1, shade(c, 0.7)]]);
    x.fill();
    for (let i = -5; i <= 5; i++) seg(x, i * 1.1, -3.7, i * 1.1, -1.7, rgba(shade(c, 0.55), 0.45), 0.25);
    ell(x, 0, -8.9, 1.8, 1.7, rgrad(x, -0.6, -9.5, 2.4, [[0, '#ffffff'], [1, '#c8c4bc']]));
  }
}

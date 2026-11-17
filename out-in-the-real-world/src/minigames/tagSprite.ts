// Chibi top-down (3/4 view) characters for Laser Tag and Roach Patrol, built from the same Person
// palette as the rest of the game (the player's own look, Rae, Theo...). Three facings (front, back,
// side; left is the side view mirrored), a four-frame run cycle, idle breathing, an ink outline,
// and cached tinted variants (tagged = dimmed, hit = white flash).
import { cached, INK, mix, rect, shade, type Ctx } from '../art/px.ts';
import type { Person } from '../art/people.ts';
import { pline } from './tagFx.ts';
import { hdSprite, softShadow } from './hdFx.ts';

export type Facing = 'down' | 'up' | 'side';
export type Pose = 'run' | 'idle';
export type Variant = 'n' | 'dim' | 'white';

const SW = 16;
const SH = 25;
const OX = 2; // grid origin inside the sprite canvas
const OY = 3;

// The sprite's feet sit at (cx, fy); grid (gx, gy) maps to screen (cx - 6 + gx, fy - 19 + gy).
export const gridX = (cx: number, gx: number): number => cx - 6 + gx;
export const gridY = (fy: number, gy: number): number => fy - 19 + gy;

export const bobOf = (pose: Pose, frame: number): number => (frame % 2 === 1 ? 1 : 0) * (pose === 'run' || pose === 'idle' ? 1 : 0);

function paint(g: Ctx, p: Person, dir: Facing, frame: number, pose: Pose, vest: boolean): void {
  const R = (gx: number, gy: number, w: number, h: number, c: string): void => rect(g, OX + gx, OY + gy, w, h, c);
  const b = bobOf(pose, frame);
  const U = (gx: number, gy: number, w: number, h: number, c: string): void => R(gx, gy + b, w, h, c); // upper body bobs
  const skin = p.skin;
  const skinD = shade(skin, 0.8);
  const hair = p.hair;
  const hairD = shade(hair, 0.72);
  const hairL = mix(hair, '#ffffff', 0.28);
  const shirt = p.shirt;
  const shirtD = shade(shirt, 0.74);
  const shirtL = mix(shirt, '#ffffff', 0.2);
  const pants = p.pants;
  const pantsD = shade(pants, 0.72);
  const shoes = p.shoes ?? '#2a2a33';
  const shoesD = shade(shoes, 0.7);
  const vestC = '#2c2a3e';
  const vestL = '#4a4762';
  const vestD = '#1c1a2a';
  const blush = mix(skin, '#ff6a6a', 0.35);
  const run = pose === 'run';
  const f = run ? frame % 4 : 0;

  // ---------- legs ----------
  if (dir === 'side') {
    const near = pants;
    const far = pantsD;
    if (f === 0 || f === 2) {
      R(4, 14, 4, 1, pantsD);
      R(4, 15, 2, 4, far);
      R(6, 15, 2, 4, near);
      R(4, 19, 5, 1, shoes);
      R(8, 19, 1, 1, shoesD);
    } else {
      const fwd = f === 1 ? near : far;
      const back = f === 1 ? far : near;
      R(4, 14, 4, 1, pantsD);
      // back leg (raised behind)
      R(4, 15, 2, 1, back);
      R(3, 16, 2, 1, back);
      R(2, 17, 2, 1, back);
      R(1, 18, 3, 1, shoes);
      // front leg (stepping forward)
      R(6, 15, 2, 1, fwd);
      R(7, 16, 2, 1, fwd);
      R(8, 17, 2, 2, fwd);
      R(8, 19, 3, 1, shoes);
    }
  } else {
    R(3, 14, 6, 1, pantsD); // hips
    const lUp = f === 1 ? 1 : 0;
    const rUp = f === 3 ? 1 : 0;
    R(3, 15, 2, 4 - lUp, pants);
    R(7, 15, 2, 4 - rUp, pantsD);
    if (dir === 'down') {
      R(2, 19 - lUp, 3, 1, shoes);
      R(7, 19 - rUp, 3, 1, shoesD);
    } else {
      R(3, 19 - lUp, 2, 1, shoesD);
      R(7, 19 - rUp, 2, 1, shoesD);
    }
  }

  // ---------- torso + arms ----------
  if (dir === 'side') {
    U(4, 9, 5, 5, shirt);
    U(4, 13, 5, 1, shirtD);
    if (vest) {
      U(4, 10, 5, 4, vestC);
      U(4, 10, 5, 1, vestL);
      U(8, 11, 1, 2, vestD);
    }
    // near arm swings
    const hx = f === 1 ? 8 : f === 3 ? 3 : 6;
    U(5, 9, 2, 2, shirtL);
    U(Math.min(5, hx), 11, Math.abs(hx - 5) + 1, 1, shirt);
    U(hx, 12, 1, 1, skin);
  } else {
    U(3, 9, 6, 5, shirt);
    U(3, 9, 1, 5, shirtL);
    U(8, 9, 1, 5, shirtD);
    U(3, 13, 6, 1, shirtD);
    if (vest) {
      U(3, 10, 6, 4, vestC);
      U(3, 9, 2, 2, vestL);
      U(7, 9, 2, 2, vestL);
      U(3, 13, 6, 1, vestD);
      if (dir === 'down') U(5, 11, 2, 2, vestD);
      else U(4, 11, 4, 2, vestD);
    } else if (dir === 'down') {
      U(5, 9, 2, 1, shade(shirt, 1.15)); // collar
    }
    // arms (1px wide, swinging)
    const ls = f === 1 ? 1 : f === 3 ? -1 : 0;
    U(2, 9, 1, 3 + ls, shirt);
    U(2, 12 + ls, 1, 1, skin);
    U(9, 9, 1, 3 - ls, shirtD);
    U(9, 12 - ls, 1, 1, skinD);
  }

  // ---------- head ----------
  const st = p.style;
  if (dir === 'side') {
    U(4, 0, 5, 1, skin);
    U(3, 1, 7, 1, skin);
    U(2, 2, 9, 6, skin);
    U(3, 8, 7, 1, skinD);
    U(11, 6, 1, 1, skin); // nose
    U(10, 4, 1, 4, skinD);
    U(8, 5, 1, 2, INK); // eye
    U(9, 7, 1, 1, shade(skin, 0.65)); // mouth
    U(7, 7, 1, 1, blush);
    // hair: back of head + top
    const short = st === 4 || st === 20;
    if (short) {
      U(3, 0, 6, 2, mix(hair, skin, st === 4 ? 0.35 : 0));
      U(2, 2, 3, 3, mix(hair, skin, st === 4 ? 0.35 : 0));
    } else {
      U(4, 0, 5, 1, hair);
      U(3, 1, 7, 2, hair);
      U(2, 2, 4, 6, hair);
      U(2, 3, 9, 1, hair);
      U(5, 2, 4, 1, hairL);
      U(2, 6, 2, 2, hairD);
      U(6, 5, 1, 2, skinD); // ear
      if (st === 1 || st === 7) U(1, 4, 3, st === 7 ? 9 : 7, st === 7 ? hairD : hair);
      if (st === 5) {
        U(0, 3, 2, 6, hair);
        U(1, 3, 1, 1, '#e0503c');
      }
      if (st === 2) U(0, 0, 3, 3, hair);
      if (st === 8) U(2, 3, 4, 6, hair);
      if (st === 6) {
        U(1, -3, 8, 3, hair);
        U(0, -1, 7, 8, hair);
        U(2, -3, 4, 1, hairL);
      }
      if (st === 3) {
        U(2, -1, 1, 1, hair);
        U(5, -1, 1, 1, hair);
        U(8, -1, 1, 1, hair);
        U(1, 2, 1, 4, hair);
      }
    }
    if (p.hat === 'beanie') {
      U(3, -1, 7, 4, p.hatColor ?? '#e07a3c');
      U(3, 2, 8, 1, shade(p.hatColor ?? '#e07a3c', 0.78));
      U(5, -2, 2, 1, mix(p.hatColor ?? '#e07a3c', '#ffffff', 0.4));
    } else if (p.hat === 'cap') {
      U(3, 0, 7, 3, p.hatColor ?? '#c0392b');
      U(9, 3, 3, 1, shade(p.hatColor ?? '#c0392b', 0.75));
    }
    if (p.glasses) {
      U(7, 5, 3, 1, '#2a2a33');
      U(8, 5, 1, 1, '#9ad0ff');
    }
    if (p.headphones) {
      U(4, 9, 4, 1, p.headphones);
      U(7, 8, 2, 2, shade(p.headphones, 0.8));
    }
    if (p.beard) U(7, 7, 4, 2, hair);
    else if (p.mustache) U(9, 6, 2, 1, hair);
    if (p.earrings) U(6, 8, 1, 1, p.earrings);
    return;
  }

  // front / back head silhouette
  U(3, 0, 6, 1, skin);
  U(2, 1, 8, 1, skin);
  U(1, 2, 10, 6, skin);
  U(2, 8, 8, 1, skinD);
  if (dir === 'down') {
    U(10, 3, 1, 5, skinD);
    U(4, 5, 1, 2, INK);
    U(7, 5, 1, 2, INK);
    U(4, 5, 1, 1, '#3a2a4a');
    U(7, 5, 1, 1, '#3a2a4a');
    U(2, 7, 1, 1, blush);
    U(9, 7, 1, 1, blush);
    U(5, 7, 2, 1, shade(skin, 0.68));
  }
  const back = dir === 'up';
  const hairBase = (): void => {
    U(3, 0, 6, 1, hair);
    U(2, 1, 8, 1, hair);
    U(1, 2, 10, 1, hair);
    if (back) {
      U(1, 3, 10, 5, hair);
      U(2, 8, 8, 1, hairD);
      U(10, 3, 1, 5, hairD);
    } else {
      U(1, 3, 4, 1, hair);
      U(8, 3, 3, 1, hair);
      U(1, 4, 1, 2, hair);
      U(10, 4, 1, 2, hairD);
    }
    U(3, 1, 3, 1, hairL);
    U(9, 2, 2, 1, hairD);
  };
  switch (st) {
    case 4: {
      // buzz
      const bz = mix(hair, skin, 0.35);
      U(3, 0, 6, 1, bz);
      U(2, 1, 8, 2, bz);
      if (back) U(1, 3, 10, 4, bz);
      break;
    }
    case 20: // receding
      U(2, 1, 2, 2, hair);
      U(8, 1, 2, 2, hair);
      U(1, 3, 1, 3, hair);
      U(10, 3, 1, 3, hairD);
      if (back) U(1, 3, 10, 5, hair);
      break;
    case 21: // slick
      hairBase();
      U(3, 1, 5, 1, mix(hair, '#ffffff', 0.45));
      if (!back) U(5, 3, 3, 1, skin);
      break;
    case 6: // afro
      U(3, -3, 6, 1, hair);
      U(1, -2, 10, 1, hair);
      U(0, -1, 12, 3, hair);
      U(-1, 0, 2, 6, hair);
      U(11, 0, 2, 6, hairD);
      U(1, 2, 10, 1, hair);
      U(3, -2, 4, 1, hairL);
      U(1, 0, 1, 1, hairL);
      if (back) U(0, 2, 12, 6, hair);
      else {
        U(1, 3, 2, 1, hair);
        U(9, 3, 2, 1, hair);
      }
      break;
    default:
      hairBase();
  }
  if (st === 1) {
    // long
    U(0, 3, 2, 9, hair);
    U(10, 3, 2, 9, hairD);
    if (back) U(1, 8, 10, 4, hair);
  } else if (st === 2) {
    U(4, -2, 4, 2, hair);
    U(5, -2, 2, 1, hairL);
  } else if (st === 3) {
    for (const cx of [2, 4, 6, 8]) U(cx, -1, 1, 1, hair);
    U(0, 2, 1, 4, hair);
    U(11, 2, 1, 4, hairD);
    U(3, 2, 1, 1, hairD);
    U(7, 1, 1, 1, hairD);
  } else if (st === 5) {
    if (back) {
      U(5, 6, 2, 6, hair);
      U(5, 6, 2, 1, '#e0503c');
    } else U(11, 3, 1, 6, hairD);
  } else if (st === 7) {
    for (let i = 0; i < 7; i++) {
      U(0, 5 + i, 1, 1, i % 2 ? hairD : hair);
      U(11, 5 + i, 1, 1, i % 2 ? hair : hairD);
    }
  } else if (st === 8) {
    U(0, 3, 2, 6, hair);
    U(10, 3, 2, 6, hairD);
    U(0, 8, 2, 1, hairD);
    if (!back) U(1, 3, 10, 1, hair);
    else U(1, 3, 10, 6, hair);
  }
  if (p.hat === 'beanie') {
    const hc = p.hatColor ?? '#e07a3c';
    U(1, -1, 10, 4, hc);
    U(1, 2, 10, 1, shade(hc, 0.75));
    U(2, -1, 3, 1, mix(hc, '#ffffff', 0.3));
    U(5, -2, 2, 1, mix(hc, '#ffffff', 0.45));
  } else if (p.hat === 'cap') {
    const hc = p.hatColor ?? '#c0392b';
    U(1, 0, 10, 3, hc);
    if (!back) U(2, 3, 8, 1, shade(hc, 0.72));
  }
  if (!back) {
    if (p.glasses) {
      U(3, 4, 3, 1, '#2a2a33');
      U(6, 4, 3, 1, '#2a2a33');
    }
    if (p.beard) U(2, 7, 8, 2, hair);
    else if (p.mustache) U(4, 7, 4, 1, hair);
    if (p.earrings) {
      U(1, 8, 1, 1, p.earrings);
      U(10, 8, 1, 1, p.earrings);
    }
  }
  if (p.headphones) {
    U(2, 9, 8, 1, p.headphones);
    U(2, 8, 1, 2, shade(p.headphones, 0.8));
    U(9, 8, 1, 2, shade(p.headphones, 0.8));
  }
}

function tinted(src: HTMLCanvasElement, c: string, mode: GlobalCompositeOperation): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext('2d');
  if (!g) return src;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = mode;
  g.fillStyle = c;
  g.fillRect(0, 0, cv.width, cv.height);
  if (mode !== 'source-in') {
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0);
  }
  return cv;
}

// Sprites are cached per look, so a new save (or a friend's swapped hair) never reuses a stale one.
const LOOKS = new WeakMap<Person, string>();
const lookKey = (p: Person): string => {
  let k = LOOKS.get(p);
  if (!k) {
    k = JSON.stringify(p);
    LOOKS.set(p, k);
  }
  return k;
};

export function chibi(p: Person, key: string, dir: Facing, frame: number, pose: Pose, vest: boolean, v: Variant = 'n'): HTMLCanvasElement {
  const k = `tagchibi|${key}|${lookKey(p)}|${dir}|${frame}|${pose}|${vest ? 1 : 0}`;
  const base = cached(k, SW, SH, (g) => paint(g, p, dir, frame, pose, vest));
  const outl = cached(`${k}|o`, SW, SH, (g) => {
    const sil = tinted(base, INK, 'source-in');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.drawImage(sil, dx, dy);
    g.drawImage(base, 0, 0);
  });
  if (v === 'n') return outl;
  if (v === 'white') return cached(`${k}|w`, SW, SH, (g) => g.drawImage(tinted(outl, '#ffffff', 'source-in'), 0, 0));
  return cached(`${k}|d`, SW, SH, (g) => g.drawImage(tinted(outl, '#55507a', 'multiply'), 0, 0));
}

export function drawChibi(x: Ctx, p: Person, key: string, cx: number, fy: number, dir: Facing, flip: boolean, frame: number, pose: Pose, vest: boolean, v: Variant = 'n'): void {
  const img = chibi(p, key, dir, frame, pose, vest, v);
  const px = Math.round(cx) - 8;
  const py = Math.round(fy) - 22;
  // HD: the pixel chibi is rounded off (Scale3x) and given a soft key light + violet rim
  const hd = hdSprite(img, CHIBI_LIT);
  if (flip) {
    x.save();
    x.translate(px + SW, py);
    x.scale(-1, 1);
    x.drawImage(hd, 0, 0, img.width, img.height);
    x.restore();
  } else x.drawImage(hd, px, py, img.width, img.height);
}
const CHIBI_LIT = { light: 0.24, shadow: 0.34, rim: '#c8a8ff' };

// A soft oval shadow under the feet.
export function footShadow(x: Ctx, cx: number, fy: number, w = 12): void {
  softShadow(x, cx, fy + 0.8, w * 0.6, 2.2, 0.6, '6,2,14');
}

// Where the vest lights sit for a pose (screen coords), so they can glow after the light pass.
export function vestLights(cx: number, fy: number, dir: Facing, flip: boolean, b: number): [number, number][] {
  const P = (gx: number, gy: number): [number, number] => [Math.round(cx) + (flip ? 5 - gx : gx - 6), Math.round(fy) - 19 + gy + b];
  if (dir === 'down') return [P(3, 9), P(8, 9), P(5, 11), P(6, 11), P(5, 12), P(6, 12)];
  if (dir === 'up') return [P(3, 9), P(8, 9), P(4, 11), P(5, 11), P(6, 11), P(7, 11)];
  return [P(5, 9), P(8, 11), P(8, 12)];
}

// Facing from an aim angle: mostly-vertical aims face front/back, otherwise the side view.
export function facingOf(ang: number): { dir: Facing; flip: boolean } {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  if (Math.abs(s) > Math.abs(c) * 1.25) return { dir: s > 0 ? 'down' : 'up', flip: c < 0 };
  return { dir: 'side', flip: c < 0 };
}

// The laser blaster held out toward the aim (drawn in front of or behind the body).
// Returns the muzzle position.
export function drawBlaster(x: Ctx, cx: number, fy: number, ang: number, glowC: string, recoil: number, b: number, sleeve: string, skin: string): [number, number] {
  const hx = cx + Math.cos(ang) * (3 - recoil);
  const hy = fy - 9 + b + Math.sin(ang) * (2 - recoil);
  const ex = hx + Math.cos(ang) * 6;
  const ey = hy + Math.sin(ang) * 6;
  // arm from the shoulder
  const sx = cx + Math.cos(ang) * 1 - Math.sin(ang) * 2;
  const sy = fy - 10 + b;
  pline(x, sx, sy, hx, hy, sleeve);
  pline(x, hx, hy + 1, ex, ey + 1, INK, 1);
  pline(x, hx, hy, ex, ey, '#3a3850', 2);
  pline(x, hx + Math.cos(ang) * 2, hy - 1 + Math.sin(ang) * 2, ex, ey - 1, '#8a88a8');
  rect(x, hx, hy, 1, 1, skin);
  rect(x, ex, ey, 1, 1, glowC);
  return [ex, ey];
}

// The bug spray can, held out toward the aim. Returns the nozzle position.
export function drawSprayCan(x: Ctx, cx: number, fy: number, ang: number, b: number, sleeve: string, skin: string, shake: number): [number, number] {
  const hx = cx + Math.cos(ang) * 3 + shake;
  const hy = fy - 9 + b + Math.sin(ang) * 2;
  const sx = cx - Math.sin(ang) * 2;
  const sy = fy - 10 + b;
  pline(x, sx, sy, hx, hy, sleeve);
  const ex = hx + Math.cos(ang) * 5;
  const ey = hy + Math.sin(ang) * 5;
  pline(x, hx - 1, hy + 1, ex - 1, ey + 1, INK, 3);
  pline(x, hx, hy, ex, ey, '#e8d020', 3);
  pline(x, hx, hy, ex, ey, '#fff08a', 1);
  pline(x, hx + Math.cos(ang) * 2, hy + Math.sin(ang) * 2, hx + Math.cos(ang) * 3, hy + Math.sin(ang) * 3, '#3caa6a', 3);
  rect(x, ex, ey, 2, 2, '#e0503c');
  rect(x, hx, hy, 1, 1, skin);
  return [ex + Math.cos(ang) * 2, ey + Math.sin(ang) * 2];
}

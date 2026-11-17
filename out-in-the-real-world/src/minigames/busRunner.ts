// The player's own sprite with animated legs: drawPerson draws the upper body (clipped at the
// hips) and this adds a walk/run cycle, a jump tuck and a duck squat. Used by Bus Dash and Shift Rush.
import { drawPerson, type Person } from '../art/people.ts';
import { INK, rect, shade, type Ctx } from '../art/px.ts';
import { drawHd, idOf, softShadow, spriteOf } from './hdFx.ts';

export type Pose = 'stand' | 'walk' | 'run' | 'jump' | 'duck';

// Run cycle foot offsets (x) and lifts for one leg; the other leg is half a cycle behind.
const FX = [3, 1, -3, -1];
const LIFT = [0, 2, 0, 0];

interface Seg {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

// (x, y) is the sprite's top-left like drawPerson: feet rest at y + 30.
export function drawRunner(ctx: Ctx, p: Person, x: number, y: number, pose: Pose, phase: number, face: -1 | 0 | 1 = 1, blink = false): void {
  x = Math.round(x);
  y = Math.round(y);
  const shoes = p.shoes ?? '#2a2a33';
  const pd = shade(p.pants, 0.78);
  const segs: Seg[] = [];
  const S = (sx: number, sy: number, w: number, h: number, c: string): void => {
    segs.push({ x: x + sx, y: y + sy, w, h, c });
  };
  const dir = face < 0 ? -1 : 1;
  const f = ((Math.floor(phase) % 4) + 4) % 4;
  const leg = (baseX: number, dx: number, lift: number, c: string, sc: string): void => {
    const d = dx * dir;
    S(baseX + Math.round(d / 2), 21, 3, 3, c); // thigh
    S(baseX + d, 24 - lift, 3, 4 - Math.min(1, lift), c); // shin
    S(baseX + d + (dir > 0 ? 0 : -1), 27 - lift, 4, 2, sc); // shoe
  };
  let bodyY = 0;
  if (pose === 'duck') {
    bodyY = 8;
    S(2, 28, 4, 2, shade(shoes, 0.85));
    S(8, 28, 4, 2, shoes);
    S(4, 26, 7, 2, p.pants);
  } else if (pose === 'jump') {
    leg(4, -2, 2, pd, shade(shoes, 0.85));
    leg(7, 2, 3, p.pants, shoes);
  } else if (pose === 'run' || pose === 'walk') {
    const k = pose === 'walk' ? 0.6 : 1;
    leg(4, Math.round(FX[(f + 2) % 4] * k), LIFT[(f + 2) % 4], pd, shade(shoes, 0.85));
    leg(7, Math.round(FX[f] * k), LIFT[f], p.pants, shoes);
    if (pose === 'run' && (f === 1 || f === 3)) bodyY = -1;
  } else {
    S(4, 21, 3, 6, pd);
    S(7, 21, 3, 6, p.pants);
    S(3, 27, 4, 2, shade(shoes, 0.85));
    S(7, 27, 4, 2, shoes);
  }
  for (const s of segs) rect(ctx, s.x - 1, s.y - 1, s.w + 2, s.h + 2, INK);
  for (const s of segs) rect(ctx, s.x, s.y, s.w, s.h, s.c);
  drawPerson(ctx, p, x, y + bodyY, 0, false, { clipY: 21, face, blink });
}

// A soft ground shadow that shrinks as the sprite rises.
export function shadow(ctx: Ctx, cx: number, groundY: number, height = 0): void {
  const w = Math.max(6, 16 - Math.round(height / 4));
  ctx.fillStyle = 'rgba(16,8,28,0.3)';
  ctx.fillRect(Math.round(cx - w / 2), Math.round(groundY - 1), w, 2);
}
// HD version: a blurred contact shadow that shrinks and fades as the sprite rises.
export function shadowHd(ctx: Ctx, cx: number, groundY: number, height = 0): void {
  const w = Math.max(6, 16 - height / 4);
  softShadow(ctx, cx, groundY, w * 0.62, 2.2, Math.max(0.18, 0.5 - height / 120), '16,8,28');
}

// HD runner: the same pixel poses, cached per pose/frame, rounded off and lit (see hdSprite).
const RUN_LIT = { light: 0.24, shadow: 0.34, rim: '#fff0c8', lx: 0.75, ly: 0.15 };
export function drawRunnerHd(ctx: Ctx, p: Person, x: number, y: number, pose: Pose, phase: number, face: -1 | 0 | 1 = 1, blink = false): void {
  const f = ((Math.floor(phase) % 4) + 4) % 4;
  const spr = spriteOf(`run|${idOf(p)}|${pose}|${f}|${face}|${blink}`, 26, 42, (c) => drawRunner(c, p, 5, 8, pose, f, face, blink));
  drawHd(ctx, spr, Math.round(x) - 5, Math.round(y) - 8, false, RUN_LIT);
}

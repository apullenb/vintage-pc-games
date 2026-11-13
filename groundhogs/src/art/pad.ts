// Bouncer's springy mushroom pad. Anchored at (sx, sy) = ground contact row, centred.
import { rowsToCanvas } from './pixel.ts';

export const PAD_PAL = {
  o: '#3d1530', // outline
  M: '#e2569f', // cap
  H: '#ffa3d2', // cap highlight
  m: '#a8306f', // cap shade
  S: '#fff2f8', // spots
  u: '#f7d9a8', // gill rim
  s: '#f4e6c8', // stem
  z: '#c9b28a', // stem shade
} as const;

const POSES = {
  rest: [
    '...ooooo...',
    '.ooHSMMMoo.',
    'oHHMMMMSMmo',
    'oMSMMMMMMmo',
    '.oouuuuuoo.',
    '...osszo...',
  ],
  breathe: [
    '..ooooooo..',
    '.oHHSMMMmo.',
    'oHMMMMMSMmo',
    'oMSMMMMMMmo',
    '.oouuuuuoo.',
    '...osszo...',
  ],
  squash: [
    '...ooooooo...',
    '.ooHSMMMMSmo.',
    'oHMMSMMMMMMmo',
    '.oouuuuuuuoo.',
    '....osszo....',
  ],
  flat: [
    '..ooooooooo..',
    '.oHHSMMMMSmo.',
    'oMMMMMSMMMmmo',
    '.ouuuuuuuuuo.',
  ],
  stretch: [
    '..ooooo..',
    '.oHSMMMo.',
    'oHMMMSMmo',
    'oMSMMMMmo',
    '.ouuuuuo.',
    '..osszo..',
    '..osszo..',
    '..osszo..',
  ],
  tall: [
    '...ooooo...',
    '.ooHSMMMoo.',
    'oHHMMMMSMmo',
    'oMSMMMMMMmo',
    '.oouuuuuoo.',
    '...osszo...',
    '...osszo...',
  ],
} as const;
type Pose = keyof typeof POSES;

const cache = new Map<Pose, HTMLCanvasElement>();
function img(p: Pose): HTMLCanvasElement {
  let c = cache.get(p);
  if (!c) cache.set(p, (c = rowsToCanvas(POSES[p], PAD_PAL)));
  return c;
}

// Squash (~3 ticks) -> overshoot stretch (~4) -> settle; idle breathes now and then.
const BOUNCE: Pose[] = ['flat', 'flat', 'squash', 'stretch', 'stretch', 'tall', 'tall', 'squash', 'breathe'];

export function drawBouncePad(ctx: CanvasRenderingContext2D, sxf: number, syf: number, tick: number, ticksSinceBounce: number): void {
  const sx = Math.round(sxf), sy = Math.round(syf);
  const bouncing = ticksSinceBounce >= 0 && ticksSinceBounce < BOUNCE.length;
  const phase = (tick + Math.abs(sx) * 7) % 40;
  const pose: Pose = bouncing ? BOUNCE[ticksSinceBounce] : phase < 3 ? 'breathe' : 'rest';
  const c = img(pose);
  const top = sy - c.height + 1;
  ctx.drawImage(c, sx - (c.width >> 1), top);
  if (bouncing && ticksSinceBounce >= 3 && ticksSinceBounce < 7) {
    // spring lines
    const k = ticksSinceBounce - 3;
    ctx.fillStyle = '#fff2f8';
    ctx.fillRect(sx - 7, top + 1 + k, 1, 2);
    ctx.fillRect(sx + 7, top + 1 + k, 1, 2);
    ctx.fillRect(sx - 9, top + 3 + k, 1, 1);
    ctx.fillRect(sx + 9, top + 3 + k, 1, 1);
  } else if (!bouncing && phase >= 20 && phase < 24) {
    // glint on the cap
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 2, top + 1, 1, 1);
  }
}

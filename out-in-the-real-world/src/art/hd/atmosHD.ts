// HD atmosphere: the same time-of-day light and weather as atmos.ts, but with smooth
// gradients, soft light shafts, anti-aliased rain streaks and round snowflakes.
// Drawn on a context scaled to logical 192x108 units.
import type { ArtId } from '../../engine/types.ts';
import { isOutdoor, windowsOf, type AtmosOpts, type TimeOfDay } from '../atmos.ts';
import { ell, H, hash, rgba, rgrad, vgrad, W, type Ctx } from './kit.ts';

interface Tint {
  top: string;
  bottom: string;
  glow?: string;
}
const TINTS: Record<TimeOfDay, Tint | null> = {
  day: null,
  morning: { top: '#f4e4ff', bottom: '#fff2e2', glow: 'rgba(255,214,150,0.06)' },
  golden: { top: '#ffc48c', bottom: '#ffe2bc', glow: 'rgba(255,170,80,0.08)' },
  evening: { top: '#e2909a', bottom: '#d6a2c0', glow: 'rgba(255,130,90,0.06)' },
  night: { top: '#5656a0', bottom: '#7a70b4' },
};
const OVERCAST: Tint = { top: '#a2acc8', bottom: '#c6cadc' };
const SNOWY: Tint = { top: '#d6def4', bottom: '#eef0fa' };

function tint(x: Ctx, t: Tint, strength: number): void {
  x.save();
  x.globalAlpha = strength;
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = vgrad(x, 0, H, [t.top, t.bottom]);
  x.fillRect(0, 0, W, H);
  x.restore();
  if (t.glow) {
    x.save();
    x.globalCompositeOperation = 'screen';
    x.fillStyle = t.glow;
    x.fillRect(0, 0, W, H);
    x.restore();
  }
}

// A soft slanted shaft of low sun from a window down to the floor, with drifting motes.
function sunbeam(x: Ctx, t: number, win: [number, number, number, number], floor: number, warm: string, slope: number): void {
  const [wx, wy, ww] = win;
  const by = Math.min(H, floor + 8);
  const d = by - wy;
  x.save();
  x.globalCompositeOperation = 'screen';
  const g = x.createLinearGradient(0, wy, 0, by);
  g.addColorStop(0, rgba(warm, 0.26));
  g.addColorStop(0.55, rgba(warm, 0.12));
  g.addColorStop(1, rgba(warm, 0));
  for (const [k, w] of [
    [0, 1.15],
    [0.18, 0.6],
  ] as const) {
    x.beginPath();
    x.moveTo(wx + ww * k, wy);
    x.lineTo(wx + ww * (k + w * 0.85), wy);
    x.lineTo(wx + d * slope + ww * (k + w), by);
    x.lineTo(wx + d * slope + ww * k, by);
    x.closePath();
    x.fillStyle = g;
    x.fill();
  }
  // the pool where it lands
  x.translate(wx + d * slope * 0.92 + ww * 0.55, floor + 4);
  x.scale(1, 0.25);
  x.fillStyle = rgrad(x, 0, 0, ww * 0.9, [[0, rgba(warm, 0.3)], [1, rgba(warm, 0)]]);
  x.fillRect(-ww, -ww, ww * 2, ww * 2);
  x.restore();
  for (let n = 0; n < 9; n++) {
    const ph = t * 0.12 + hash(n * 13) * 10;
    const dd = (ph * 20) % (floor - wy);
    const mx = wx + dd * slope + hash(n * 7) * ww + Math.sin(t * 0.8 + n) * 2;
    ell(x, mx, wy + dd, 0.35, 0.35, 'rgba(255,244,210,0.7)');
  }
}

function rain(x: Ctx, t: number, x0: number, y0: number, w: number, h: number, n: number, seed: number, floor: number | null): void {
  x.save();
  x.beginPath();
  x.rect(x0, y0, w, h);
  x.clip();
  x.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const sp = 110 + hash(seed + k * 3) * 60;
    const near = hash(seed + k * 11) < 0.3;
    const len = near ? 7 : 4;
    const span = h + len + 6;
    const yy = y0 - len + ((hash(seed + k) * span + t * sp) % span);
    const xx = x0 + ((hash(seed + k * 5) * (w + 12) - (yy - y0) * 0.25 + 400) % (w + 12)) - 6;
    x.beginPath();
    x.moveTo(xx, yy);
    x.lineTo(xx - len * 0.25, yy + len);
    x.strokeStyle = near ? 'rgba(225,236,255,0.6)' : 'rgba(190,206,240,0.4)';
    x.lineWidth = near ? 0.4 : 0.28;
    x.stroke();
  }
  if (floor !== null) {
    for (let k = 0; k < 14; k++) {
      const cyc = t * 2.2 + hash(seed + k * 17) * 3;
      const ph = cyc - Math.floor(cyc);
      const id = Math.floor(cyc);
      const sx = x0 + hash(seed + k * 23 + id * 101) * w;
      const sy = floor - 2 + hash(seed + k * 29 + id * 37) * (H - floor + 4);
      x.beginPath();
      x.ellipse(sx, sy, 0.6 + ph * 2.4, (0.6 + ph * 2.4) * 0.3, 0, 0, Math.PI * 2);
      x.strokeStyle = `rgba(220,232,255,${(0.7 * (1 - ph)).toFixed(3)})`;
      x.lineWidth = 0.25;
      x.stroke();
    }
  }
  x.restore();
}

function droplets(x: Ctx, t: number, win: [number, number, number, number], seed: number): void {
  const [wx, wy, ww, wh] = win;
  x.fillStyle = 'rgba(70,84,130,0.36)';
  x.fillRect(wx, wy, ww, wh);
  rain(x, t, wx, wy, ww, wh, Math.ceil((ww * wh) / 50), seed, null);
  for (let k = 0; k < Math.ceil(ww / 5); k++) {
    const sp = 1.5 + hash(seed + k) * 3;
    const yy = wy + ((hash(seed + k * 3) * wh + t * sp) % wh);
    const xx = wx + 1 + hash(seed + k * 7) * (ww - 2);
    x.fillStyle = vgrad(x, yy - 3, yy, ['rgba(200,215,245,0)', 'rgba(220,232,255,0.5)']);
    x.fillRect(xx - 0.2, yy - 3, 0.4, 3);
    ell(x, xx, yy, 0.45, 0.55, 'rgba(235,244,255,0.85)');
  }
}

function snow(x: Ctx, t: number, x0: number, y0: number, w: number, h: number, n: number, seed: number): void {
  x.save();
  x.beginPath();
  x.rect(x0, y0, w, h);
  x.clip();
  for (let k = 0; k < n; k++) {
    const near = hash(seed + k * 11) < 0.25;
    const sp = near ? 16 + hash(seed + k) * 8 : 7 + hash(seed + k) * 6;
    const span = h + 4;
    const yy = y0 - 2 + ((hash(seed + k * 3) * span + t * sp) % span);
    const xx = x0 + ((hash(seed + k * 5) * w + Math.sin(t * (0.8 + hash(k) * 0.6) + k) * (near ? 3 : 1.5) + w) % w);
    const r = near ? 0.85 : 0.45;
    if (near) ell(x, xx, yy, r * 2, r * 2, 'rgba(255,255,255,0.18)');
    ell(x, xx, yy, r, r, near ? 'rgba(255,255,255,0.95)' : 'rgba(240,244,255,0.75)');
  }
  x.restore();
}

function leaves(x: Ctx, t: number, n: number, seed: number): void {
  const cols = ['#e07a2c', '#c0482a', '#f2b632', '#a8582a'];
  for (let k = 0; k < n; k++) {
    const sp = 9 + hash(seed + k) * 7;
    const span = H + 8;
    const yy = -4 + ((hash(seed + k * 3) * span + t * sp) % span);
    const xx = (hash(seed + k * 5) * W + t * (6 + hash(k) * 6) + Math.sin(t * 2 + k) * 4) % W;
    const rot = t * (2 + hash(k * 9) * 2) + k;
    ell(x, xx, yy, 1.3, 0.6 * Math.abs(Math.cos(rot)) + 0.2, cols[k % cols.length], rot * 0.5);
  }
}

function birds(x: Ctx, t: number, seed: number): void {
  x.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const period = 18 + k * 5;
    const ph = ((t + hash(seed + k) * period) % period) / period;
    if (ph > 0.6) continue;
    const bx = -6 + (ph / 0.6) * (W + 12);
    const by = 10 + hash(seed + k * 9) * 18 + Math.sin(t * 1.3 + k) * 2;
    const fl = Math.sin(t * 9 + k * 2) * 1.1;
    x.beginPath();
    x.moveTo(bx - 1.8, by - fl);
    x.quadraticCurveTo(bx - 0.8, by - 0.5 - fl * 0.3, bx, by);
    x.quadraticCurveTo(bx + 0.8, by - 0.5 - fl * 0.3, bx + 1.8, by - fl);
    x.strokeStyle = 'rgba(40,30,50,0.75)';
    x.lineWidth = 0.45;
    x.stroke();
  }
}

export interface AtmosHDOpts extends AtmosOpts {
  windows?: [number, number, number, number][];
}

export function atmosGroundHD(x: Ctx, o: AtmosHDOpts): void {
  if (!isOutdoor(o.art)) return;
  if (o.weather === 'snow') {
    x.fillStyle = vgrad(x, o.floor - 11, H, ['rgba(244,246,255,0)', 'rgba(244,246,255,0.55)', 'rgba(250,252,255,0.85)']);
    x.fillRect(0, o.floor - 11, W, H - o.floor + 11);
    for (let i = 0; i < 26; i++) ell(x, hash(i * 7) * W, o.floor - 2 + hash(i * 3) * (H - o.floor), 4 + hash(i) * 6, 0.8, 'rgba(255,255,255,0.4)');
  } else if (o.weather === 'rain') {
    x.save();
    x.globalCompositeOperation = 'screen';
    x.fillStyle = vgrad(x, o.floor - 8, H, ['rgba(120,140,190,0)', 'rgba(120,140,190,0.2)', 'rgba(150,170,220,0.12)']);
    x.fillRect(0, o.floor - 8, W, H - o.floor + 8);
    x.restore();
  }
}

export function atmosAirHD(x: Ctx, t: number, o: AtmosHDOpts): void {
  const out = isOutdoor(o.art);
  const wins = o.windows ?? windowsOf(o.art as ArtId);
  const tod = o.night ? 'day' : o.tod;
  if (o.weather === 'rain' && out) tint(x, OVERCAST, 0.5);
  else if (o.weather === 'snow' && out) tint(x, SNOWY, 0.45);
  const td = TINTS[tod];
  if (td) tint(x, td, out ? 0.5 : 0.38);
  if (!o.night && !o.weather && (tod === 'morning' || tod === 'golden' || tod === 'evening'))
    for (const w of wins) sunbeam(x, t, w, o.floor, tod === 'morning' ? '#ffecbe' : '#ffaa6e', tod === 'morning' ? 0.55 : 0.9);
  if (o.weather === 'rain') {
    if (out) rain(x, t, 0, 0, W, H, 80, 5, o.floor);
    else wins.forEach((w, k) => droplets(x, t, w, 40 + k));
  } else if (o.weather === 'snow') {
    if (out) snow(x, t, 0, 0, W, H, 70, 9);
    else
      wins.forEach((w, k) => {
        x.fillStyle = 'rgba(200,210,240,0.22)';
        x.fillRect(w[0], w[1], w[2], w[3]);
        snow(x, t, w[0], w[1], w[2], w[3], Math.ceil((w[2] * w[3]) / 40), 60 + k);
        x.fillStyle = vgrad(x, w[1] + w[3] - 2.5, w[1] + w[3], ['#ffffff', '#dfe6f6']);
        x.fillRect(w[0], w[1] + w[3] - 2.5, w[2], 2.5);
      });
  } else if (o.weather === 'leaves' && out) leaves(x, t, 11, 3);
  if (out && !o.weather && (tod === 'day' || tod === 'morning' || tod === 'golden') && o.art !== 'night') birds(x, t, o.art.length);
}

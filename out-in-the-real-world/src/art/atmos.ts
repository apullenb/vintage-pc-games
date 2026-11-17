// Atmosphere over any scene: time-of-day light, weather, and a little ambient life.
// Drawn in two passes around the people: `ground` (snow cover, wet sheen) before them,
// `air` (tint, sun shafts, rain, snow, leaves, birds, vignette) after them.
import type { ArtId } from '../engine/types.ts';
import { cached, H, hash, rect, stipple, W, type Ctx } from './px.ts';

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night' | 'golden';
export type Weather = 'rain' | 'snow' | 'leaves' | null;
export type Season = 'summer' | 'fall' | 'winter' | 'spring';

const OUTDOOR = new Set<ArtId>(['jobsite', 'campus', 'carlot', 'street', 'road', 'night', 'beach']);
// Windows that show the sky (x, y, w, h) for indoor weather and sunbeams.
const WINDOWS: Partial<Record<ArtId, [number, number, number, number][]>> = {
  bedroom: [[124, 12, 34, 26]],
  dorm: [[82, 10, 30, 24]],
  apartment: [[14, 10, 40, 30]],
  dentist: [[152, 10, 30, 24]],
  office: [[10, 8, 56, 34]],
  party: [[71, 15, 34, 24]],
};
const HOMES = new Set<ArtId>(['bedroom', 'dorm', 'apartment']);

export const isOutdoor = (a: ArtId): boolean => OUTDOOR.has(a);
export const isHome = (a: ArtId): boolean => HOMES.has(a);

export function seasonOf(week: number): Season {
  if (week >= 13 && week <= 18) return 'fall';
  if (week >= 19 && week <= 26) return 'winter';
  if (week >= 27 && week <= 30) return 'spring';
  return 'summer';
}

// Deterministic weather per week: snow most winter weeks, rain now and then.
export function weatherFor(week: number): Weather {
  const r = hash(week * 7919 + 13);
  switch (seasonOf(week)) {
    case 'winter':
      return r < 0.7 ? 'snow' : null;
    case 'fall':
      return r < 0.3 ? 'rain' : r < 0.75 ? 'leaves' : null;
    case 'spring':
      return r < 0.4 ? 'rain' : null;
    default:
      return r < 0.12 ? 'rain' : null;
  }
}

// ---------- tints ----------
interface Tint {
  top: string;
  bottom: string;
  glow?: string; // screen-blended warm light
}
const TINTS: Record<TimeOfDay, Tint | null> = {
  day: null,
  morning: { top: '#f6e6ff', bottom: '#fff4e4', glow: 'rgba(255,214,150,0.10)' },
  golden: { top: '#ffc890', bottom: '#ffe6c0', glow: 'rgba(255,170,80,0.16)' },
  evening: { top: '#e89a8a', bottom: '#d8a8b8', glow: 'rgba(255,140,80,0.10)' },
  night: { top: '#5a5aa0', bottom: '#7a70b0' },
};
const OVERCAST: Tint = { top: '#a8b0c8', bottom: '#c8ccd8' };
const SNOWY: Tint = { top: '#d8e0f4', bottom: '#eef0fa' };

function tint(x: Ctx, t: Tint, strength: number): void {
  x.save();
  x.globalAlpha = strength;
  x.globalCompositeOperation = 'multiply';
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t.top);
  g.addColorStop(1, t.bottom);
  x.fillStyle = g;
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

// Low sun through a window: a slanted dithered beam down to the floor, with dust motes.
function sunbeam(x: Ctx, t: number, win: [number, number, number, number], floor: number, warm: string, slope: number): void {
  const [wx, wy, ww, wh] = win;
  x.save();
  x.globalCompositeOperation = 'screen';
  // two hard-edged bands (a soft halo and a brighter core), fading in steps toward the floor
  for (let j = wy + wh; j < Math.min(H, floor + 8); j++) {
    const d = j - wy;
    const x0 = Math.round(wx + d * slope);
    const w = Math.round(ww * (0.9 + Math.min(1, d / wh) * 0.25));
    const fade = Math.max(0, 1 - (j - wy - wh) / (floor - wy - wh + 18));
    const step = Math.ceil(fade * 3) / 3;
    x.globalAlpha = step;
    x.fillStyle = warm;
    x.fillRect(x0, j, w, 1);
    x.fillRect(x0 + Math.round(w * 0.2), j, Math.round(w * 0.55), 1);
  }
  x.globalAlpha = 1;
  // dust motes drifting in the light
  x.fillStyle = 'rgba(255,240,200,0.7)';
  for (let n = 0; n < 7; n++) {
    const ph = t * 0.12 + hash(n * 13) * 10;
    const d = ((ph * 20) % (floor - wy)) | 0;
    const mx = wx + d * slope + hash(n * 7) * ww + Math.sin(t * 0.8 + n) * 2;
    x.fillRect(Math.round(mx), Math.round(wy + d), 1, 1);
  }
  x.restore();
}

// ---------- weather ----------
function rain(x: Ctx, t: number, x0: number, y0: number, w: number, h: number, n: number, seed: number, floor: number | null): void {
  x.save();
  x.beginPath();
  x.rect(x0, y0, w, h);
  x.clip();
  for (let k = 0; k < n; k++) {
    const sp = 90 + hash(seed + k * 3) * 50;
    const near = hash(seed + k * 11) < 0.3;
    const len = near ? 5 : 3;
    const span = h + len + 6;
    const yy = y0 - len + ((hash(seed + k) * span + t * sp) % span);
    const xx = x0 + ((hash(seed + k * 5) * (w + 12) - (yy - y0) * 0.25 + 400) % (w + 12)) - 6;
    x.fillStyle = near ? 'rgba(220,232,255,0.75)' : 'rgba(190,206,240,0.5)';
    for (let q = 0; q < len; q++) x.fillRect(Math.round(xx - q * 0.25), Math.round(yy + q), 1, 1);
  }
  if (floor !== null) {
    // splashes on the ground
    x.fillStyle = 'rgba(220,232,255,0.8)';
    for (let k = 0; k < 10; k++) {
      const ph = Math.floor(t * 6 + hash(seed + k * 17) * 6);
      if (ph % 3 === 2) continue;
      const sx = x0 + Math.floor(hash(seed + k * 23 + Math.floor(ph / 3) * 101) * w);
      const sy = floor - 2 + Math.floor(hash(seed + k * 29 + Math.floor(ph / 3) * 37) * (H - floor + 4));
      if (ph % 3 === 0) x.fillRect(sx, sy, 1, 1);
      else {
        x.fillRect(sx - 1, sy - 1, 1, 1);
        x.fillRect(sx + 1, sy - 1, 1, 1);
      }
    }
  }
  x.restore();
}

function droplets(x: Ctx, t: number, win: [number, number, number, number], seed: number): void {
  const [wx, wy, ww, wh] = win;
  x.fillStyle = 'rgba(80,90,130,0.38)';
  x.fillRect(wx, wy, ww, wh);
  rain(x, t, wx, wy, ww, wh, Math.ceil((ww * wh) / 60), seed, null);
  // beads sliding down the glass
  for (let k = 0; k < Math.ceil(ww / 6); k++) {
    const sp = 1.5 + hash(seed + k) * 3;
    const yy = wy + ((hash(seed + k * 3) * wh + t * sp) % wh);
    const xx = wx + 1 + Math.floor(hash(seed + k * 7) * (ww - 2));
    x.fillStyle = 'rgba(230,240,255,0.85)';
    x.fillRect(xx, Math.round(yy), 1, 1);
    x.fillStyle = 'rgba(200,215,245,0.4)';
    x.fillRect(xx, Math.round(yy) - 2, 1, 2);
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
    x.fillStyle = near ? '#ffffff' : 'rgba(240,244,255,0.8)';
    x.fillRect(Math.round(xx), Math.round(yy), near ? 2 : 1, near ? 2 : 1);
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
    const flip = Math.floor(t * 4 + k) % 2;
    x.fillStyle = cols[k % cols.length];
    x.fillRect(Math.round(xx), Math.round(yy), flip ? 2 : 1, flip ? 1 : 2);
  }
}

function birds(x: Ctx, t: number, seed: number): void {
  for (let k = 0; k < 3; k++) {
    const period = 18 + k * 5;
    const ph = ((t + hash(seed + k) * period) % period) / period;
    if (ph > 0.6) continue;
    const bx = -6 + ph / 0.6 * (W + 12);
    const by = 10 + hash(seed + k * 9) * 18 + Math.sin(t * 1.3 + k) * 2;
    const up = Math.floor(t * 6 + k) % 2 === 0;
    x.fillStyle = 'rgba(40,30,50,0.75)';
    x.fillRect(Math.round(bx), Math.round(by), 1, 1);
    x.fillRect(Math.round(bx) - 1, Math.round(by) + (up ? -1 : 0), 1, 1);
    x.fillRect(Math.round(bx) + 1, Math.round(by) + (up ? -1 : 0), 1, 1);
  }
}

// Stepped vignette: darkens the corners a touch in two hard bands, framing the view.
function vignette(x: Ctx, strength: number): void {
  x.drawImage(
    cached(`vignette:${strength}`, W, H, (c) => {
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const dx = (i - W / 2) / (W / 2);
          const dy = (j - H / 2) / (H / 2);
          const d = Math.max(0, Math.hypot(dx * 0.85, dy * 0.95) - 0.8) * strength;
          if (d <= 0.04) continue;
          c.fillStyle = d > 0.32 ? 'rgba(16,8,28,0.26)' : d > 0.16 ? 'rgba(16,8,28,0.16)' : 'rgba(16,8,28,0.08)';
          c.fillRect(i, j, 1, 1);
        }
    }),
    0,
    0,
  );
}

export interface AtmosOpts {
  art: ArtId;
  tod: TimeOfDay;
  weather: Weather;
  floor: number;
  night?: boolean; // the scene is already painted as night (home night variants)
}

// Before people: ground cover.
export function atmosGround(x: Ctx, o: AtmosOpts): void {
  if (!isOutdoor(o.art)) return;
  if (o.weather === 'snow') {
    // snow drifts on the ground plane, thicker toward the front
    for (let j = o.floor - 10; j < H; j++) {
      const f = Math.min(0.75, ((j - (o.floor - 10)) / 18) * 0.75);
      stipple(x, 0, j, W, 1, '#f4f6ff', f);
    }
    rect(x, 0, o.floor - 11, W, 1, 'rgba(255,255,255,0.35)');
  } else if (o.weather === 'rain') {
    // wet ground: a cool sheen
    x.save();
    x.globalCompositeOperation = 'screen';
    for (let j = o.floor - 8; j < H; j++) if (j % 2 === 0) rect(x, 0, j, W, 1, 'rgba(120,140,190,0.12)');
    x.restore();
  }
}

// After people: light and air.
export function atmosAir(x: Ctx, t: number, o: AtmosOpts): void {
  const out = isOutdoor(o.art);
  const wins = WINDOWS[o.art] ?? [];
  const tod = o.night ? 'day' : o.tod; // night variants are already lit
  // light first, so the weather sits on top
  if (o.weather === 'rain' && out) tint(x, OVERCAST, 0.55);
  else if (o.weather === 'snow' && out) tint(x, SNOWY, 0.5);
  const td = TINTS[tod];
  if (td) tint(x, td, out ? 0.55 : 0.42);
  if (!o.night && !o.weather && (tod === 'morning' || tod === 'golden' || tod === 'evening'))
    for (const w of wins) sunbeam(x, t, w, o.floor, tod === 'morning' ? 'rgba(255,236,190,0.30)' : 'rgba(255,170,110,0.28)', tod === 'morning' ? 0.55 : 0.9);
  // weather
  if (o.weather === 'rain') {
    if (out) rain(x, t, 0, 0, W, H, 70, 5, o.floor);
    else wins.forEach((w, k) => droplets(x, t, w, 40 + k));
  } else if (o.weather === 'snow') {
    if (out) snow(x, t, 0, 0, W, H, 60, 9);
    else
      wins.forEach((w, k) => {
        x.fillStyle = 'rgba(200,210,240,0.25)';
        x.fillRect(w[0], w[1], w[2], w[3]);
        snow(x, t, w[0], w[1], w[2], w[3], Math.ceil((w[2] * w[3]) / 50), 60 + k);
        rect(x, w[0], w[1] + w[3] - 2, w[2], 2, '#f4f6ff'); // snow on the sill
      });
  } else if (o.weather === 'leaves' && out) leaves(x, t, 9, 3);
  if (out && !o.weather && (tod === 'day' || tod === 'morning' || tod === 'golden') && o.art !== 'night') birds(x, t, o.art.length);
  vignette(x, 1.4);
}

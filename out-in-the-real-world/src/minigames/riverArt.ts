// River Run art: a per-pixel water shader (depth, flowing streaks, foam lapping at the banks, shore
// reflections, sparkles, rapids, ocean swell), shaded banks for each stretch (forest, canyon, meadow,
// sunset beach), parallax tree canopies, the obstacles, two tubers drawn at any angle, time-of-day
// light, the in-canvas HUD and the road-trip sunset postcard.
import { drawPerson, type Person } from '../art/people.ts';
import { bayer, cached, disc, hash, INK, line, rect, shade, text, textWidth, type Ctx } from '../art/px.ts';
import { banks, baseSpeed, finishLine, LEN, MAX_WIPES, PY, RH, RW, airHeight, zoneAt, zoneWeight, type ItemKind, type RiverSim, type Tube, type Zone } from './riverSim.ts';
import { outlined } from './shiftKit.ts';

// ---------- color + noise helpers ----------
function u32(hex: string): number {
  const n = parseInt(hex.slice(1, 7), 16);
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
}
const U = (a: string[]): number[] => a.map(u32);

const NT = 64;
const NOISE = (() => {
  const a = new Float32Array(NT * NT);
  const lat = (s: number, i: number, j: number): number => hash(((i % (NT / s)) + 97 * (j % (NT / s))) * 7 + s * 1013);
  for (const [s, amp] of [
    [16, 0.55],
    [8, 0.3],
    [4, 0.15],
  ] as const) {
    for (let y = 0; y < NT; y++)
      for (let x = 0; x < NT; x++) {
        const gx = x / s;
        const gy = y / s;
        const i = Math.floor(gx);
        const j = Math.floor(gy);
        const fx = gx - i;
        const fy = gy - j;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const v00 = lat(s, i, j);
        const v10 = lat(s, i + 1, j);
        const v01 = lat(s, i, j + 1);
        const v11 = lat(s, i + 1, j + 1);
        a[y * NT + x] += amp * (v00 + (v10 - v00) * sx + (v01 - v00) * sy + (v00 - v10 - v01 + v11) * sx * sy);
      }
  }
  return a;
})();
function nz(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const x0 = xi & (NT - 1);
  const y0 = yi & (NT - 1);
  const x1 = (x0 + 1) & (NT - 1);
  const y1 = (y0 + 1) & (NT - 1);
  const a = NOISE[y0 * NT + x0];
  const b = NOISE[y0 * NT + x1];
  const c = NOISE[y1 * NT + x0];
  const d = NOISE[y1 * NT + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const ih = (n: number): number => {
  let t = n | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
};

// ---------- palettes ----------
interface ZonePal {
  water: number[]; // deep .. shallow (6)
  hi: number;
  foam: number[];
}
const WATER: Record<Zone | 'ocean', ZonePal> = {
  forest: { water: U(['#103848', '#164c5a', '#1d636c', '#277d80', '#379994', '#55b5a6']), hi: u32('#a8e8d4'), foam: U(['#d8f2ea', '#f4fffb']) },
  canyon: { water: U(['#0e3046', '#14445a', '#1b5c6e', '#257685', '#38929c', '#58b0b2']), hi: u32('#a6e2e0'), foam: U(['#d4eef0', '#f6ffff']) },
  rapids: { water: U(['#0f3448', '#15485c', '#1d6072', '#2a7a88', '#4296a0', '#6ab4b6']), hi: u32('#bdeeec'), foam: U(['#dcf4f4', '#ffffff']) },
  meadow: { water: U(['#164a56', '#1c5e66', '#257878', '#33928a', '#4cae9c', '#74c8ae']), hi: u32('#d8fff0'), foam: U(['#dcf4e8', '#f8fff8']) },
  sunset: { water: U(['#34366a', '#46467a', '#62568a', '#946a8c', '#ca8684', '#f2aa80']), hi: u32('#f4c494'), foam: U(['#f8e0d8', '#fff6e8']) },
  ocean: { water: U(['#283a70', '#304c84', '#3e6296', '#587aa4', '#a88aa0', '#f0a87c']), hi: u32('#ffd8a0'), foam: U(['#ffe8dc', '#fffaf4']) },
};
const SPARK = u32('#ffffff');
const B = {
  wetSand: u32('#6a5a40'),
  sand: U(['#c9b183', '#b39a6c', '#d8c294']),
  grass: U(['#2c5a2c', '#386c32', '#4a843a']),
  grassM: U(['#467a32', '#55903e', '#68a64a']),
  wetRock: u32('#4a2e28'),
  talus: U(['#9a6048', '#86503c', '#ae7056']),
  wall: U(['#6e3a2e', '#844434', '#9c523a', '#b46244', '#c87650', '#da8e60', '#e6a676']),
  rim: U(['#c8a070', '#b48c60']),
  mud: u32('#5a4a32'),
  mud2: u32('#7a6a42'),
  flower: U(['#f4a0c8', '#fff1a0', '#ffffff', '#c8a0f0']),
  pebble: U(['#8a8478', '#a8a294']),
  beach: U(['#e4cc9c', '#d4b886', '#ecd8ac']),
};

// ---------- the water + banks shader ----------
let IMG: ImageData | null = null;
export function paintRiver(x: Ctx, g: RiverSim, t: number): void {
  if (!IMG || IMG.width !== RW) IMG = x.createImageData(RW, RH);
  const buf = new Uint32Array(IMG.data.buffer);
  const c = g.c;
  const fp = t * 46;
  const sparkBase = 1;
  for (let y = 0; y < RH; y++) {
    const d = g.camD + (PY - y);
    const [L, R] = banks(c, d);
    const mid = (L + R) / 2;
    const hw = (R - L) / 2;
    const z = zoneAt(d);
    const wr = zoneWeight(d, 'rapids');
    const ws = zoneWeight(d, 'sunset');
    const wo = c.trip ? Math.max(0, Math.min(1, (d - (LEN - 230)) / 170)) : 0;
    const lapL = 1.3 + 1.2 * (0.5 + 0.5 * Math.sin(d * 0.19 + t * 2.4));
    const lapR = 1.3 + 1.2 * (0.5 + 0.5 * Math.sin(d * 0.17 + t * 2.1 + 2));
    const reflL = 7 + 3 * Math.sin(d * 0.045) + Math.sin(y * 0.9 + t * 3) * 0.8;
    const reflR = 7 + 3 * Math.sin(d * 0.05 + 1.7) + Math.sin(y * 0.9 + t * 3 + 1) * 0.8;
    const dRow = Math.floor(d);
    const fall = c.falls.find((f) => d > f.d - 3 && d < f.d + 18);
    const row = y * RW;
    for (let px = 0; px < RW; px++) {
      const th = bayer(px, dRow);
      const zone: Zone = z.w > th ? z.b : z.a;
      const edgeL = px - L;
      const edgeR = R - px;
      const edge = Math.min(edgeL, edgeR);
      let col: number;
      if (edge >= 0) {
        // ---- water ----
        const pal = wo > th ? WATER.ocean : WATER[zone];
        const u = (px - mid) / hw;
        const depth = 1 - u * u;
        const n1 = nz(px * 0.12, (d - fp) * 0.028);
        const n2 = nz(px * 0.31 + 17, (d - fp * 1.25) * 0.16);
        let v = 0.1 + 0.66 * (1 - depth) + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.22;
        // out at sea: deeper (darker) toward the horizon, shallower near the beach
        if (wo > th) v = 0.62 - 0.5 * Math.min(1, Math.max(0, (d - LEN + 140) / 260)) + (n1 - 0.5) * 0.45 + (n2 - 0.5) * 0.2;
        const refl = edgeL < edgeR ? reflL : reflR;
        if (edge < refl && wo < th) v -= 0.32;
        let idx = Math.floor(v * 5 + th);
        idx = idx < 0 ? 0 : idx > 5 ? 5 : idx;
        col = pal.water[idx];
        // caustic net: thin contour lines of a fine ripple field, brightest where the streaks are
        const n3 = nz(px * 0.85 + 5, (d - fp * 1.5) * 0.42 + t * 0.6);
        if (Math.abs(n3 - 0.5) < 0.02) col = n1 > 0.68 && ws < th ? pal.hi : pal.water[Math.min(5, idx + 1)];
        // rapids: white streaks churn through
        if (wr > 0 && n1 + n2 * 0.3 > 0.95 - 0.38 * wr) col = pal.foam[n2 > 0.55 ? 1 : 0];
        else if (wr > 0 && n1 + n2 * 0.3 > 0.88 - 0.38 * wr) col = pal.water[5];
        // foam lapping at the banks
        const lap = edgeL < edgeR ? lapL : lapR;
        if (edge < lap + (n2 - 0.5) * 2) col = pal.foam[edge < lap * 0.5 ? 1 : 0];
        else if (edge < lap + 1.5 && th > 0.5) col = pal.water[5];
        // ocean swell: crests rolling in toward the beach
        if (wo > th) {
          const cr = (d + t * 14 + Math.sin(px * 0.06 + d * 0.013) * 7 + (n1 - 0.5) * 14) / 34;
          const fr = cr - Math.floor(cr);
          if (fr < 0.045 && n2 > 0.38) col = pal.foam[n2 > 0.6 ? 1 : 0];
          else if (fr < 0.12 && th > 0.45) col = pal.water[Math.min(5, idx + 1)];
        }
        // the waterfall: glassy lip, crest, churning hole below
        if (fall) {
          const dd = d - fall.d;
          const inTongue = Math.abs(px - fall.tx) < fall.tw / 2 - dd * 0.35;
          if (dd < 2.5) {
            if (!inTongue) {
              const fh = ih(px * 31 + dRow * 977 + Math.floor(t * 12));
              col = (fh & 7) === 0 ? pal.water[2] : (fh & 3) === 1 ? pal.foam[0] : pal.foam[1];
            }
          } else if (inTongue) col = dd < 7 ? pal.water[1] : n1 > 0.5 ? pal.foam[0] : pal.water[3];
          else col = n1 + Math.sin(px * 0.6 + t * 9) * 0.15 > 0.42 ? pal.foam[(ih(px + dRow * 7) & 1) as 0 | 1] : pal.water[3];
        }
        // sparkles on the sunlit surface (a whole glitter path where the sea opens up)
        const sp = ih((px * 73856093) ^ (dRow * 19349663) ^ Math.floor(t * 6 + hash(px * 13 + dRow) * 6));
        const path = wo > 0 ? Math.max(0, 1 - Math.abs(px - RW / 2 + Math.sin(d * 0.05) * 6) / 26) * wo : 0;
        if ((sp & 1023) < sparkBase + ws * 4 + path * 90 && (n2 > 0.55 || path > 0.3) && edge > 3) col = path > 0.3 && (sp & 2048) ? pal.hi : SPARK;
      } else {
        // ---- banks ----
        const dist = -edge;
        const n = nz(px * 0.4 + 41, d * 0.4);
        const h = ih(px * 92821 + dRow * 68917);
        col = bankColor(zone, dist, n, h, wo > th, d, c.trip);
      }
      buf[row + px] = col;
    }
  }
  x.putImageData(IMG, 0, 0);
}

function bankColor(zone: Zone, dist: number, n: number, h: number, beach: boolean, d: number, trip: boolean): number {
  if (beach || (trip && d > LEN - 160)) {
    if (dist < 2) return B.wetSand;
    return B.beach[n > 0.62 ? 2 : n > 0.45 ? 0 : 1];
  }
  switch (zone) {
    case 'forest': {
      if (dist < 1.5) return B.wetSand;
      if (dist < 6 + n * 3) return (h & 31) === 0 ? B.pebble[h & 1] : B.sand[n > 0.55 ? 2 : n > 0.4 ? 0 : 1];
      const k = n > 0.6 ? 2 : n > 0.42 ? 1 : 0;
      return (h & 63) === 1 ? B.grass[2] : B.grass[k];
    }
    case 'canyon':
    case 'rapids': {
      if (dist < 1.5) return B.wetRock;
      if (dist < 5 + n * 3) return B.talus[n > 0.55 ? 2 : (h & 3) === 0 ? 1 : 0];
      const band = Math.floor((dist - 5 + n * 5) / 4.2);
      if (band > 6) return B.rim[n > 0.5 ? 0 : 1];
      const crack = (h & 15) === 0 && n > 0.5;
      return crack ? B.wall[Math.max(0, band - 2)] : B.wall[Math.min(6, band)];
    }
    case 'meadow': {
      if (dist < 1.5) return B.mud;
      if (dist < 3.5) return B.mud2;
      if ((h & 255) < 3) return B.flower[(h >> 8) & 3];
      return B.grassM[n > 0.6 ? 2 : n > 0.42 ? 1 : 0];
    }
    case 'sunset': {
      if (dist < 2) return B.wetSand;
      if (dist < 12 + n * 6) return B.beach[n > 0.6 ? 2 : n > 0.45 ? 0 : 1];
      return B.grassM[n > 0.55 ? 1 : 0];
    }
  }
}

// ---------- screen mapping ----------
export const sy = (g: RiverSim, d: number, par = 1): number => PY - (d - g.camD) * par;
const onScreen = (y: number, m = 30): boolean => y > -m && y < RH + m;

// ---------- small shaded shapes ----------
function ball(x: Ctx, cx: number, cy: number, r: number, c: string, outline = true): void {
  if (outline) disc(x, cx, cy, r + 1, INK);
  disc(x, cx, cy, r, shade(c, 0.78));
  disc(x, cx - 0.5, cy - 0.5, Math.max(0, r - 1), c);
  if (r >= 2) disc(x, cx - r * 0.35, cy - r * 0.35, Math.max(0, Math.floor(r * 0.35)), shade(c, 1.2));
}
function ellipse(x: Ctx, cx: number, cy: number, rx: number, ry: number, c: string): void {
  x.fillStyle = c;
  for (let j = -Math.floor(ry); j <= ry; j++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.3)) ** 2)));
    if (w > 0) x.fillRect(Math.round(cx - w), Math.round(cy + j), w * 2, 1);
  }
}
function ringDots(x: Ctx, cx: number, cy: number, r: number, c: string, step = 0.5, ry = r): void {
  x.fillStyle = c;
  for (let a = 0; a < Math.PI * 2; a += step / Math.max(2, r) * 2) x.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * ry), 1, 1);
}

// ---------- the tube (cached, rotation invariant: light from the top left) ----------
function tubeRing(color: string, R: number, under = false): HTMLCanvasElement {
  const size = R * 2 + 3;
  return cached(`rr-ring|${color}|${R}|${under}`, size, size, (x) => {
    const c = R + 1;
    const inner = R * 0.46;
    const ramp = under ? [shade(color, 0.35), shade(color, 0.48), shade(color, 0.6), shade(color, 0.7)] : [shade(color, 0.55), shade(color, 0.78), color, shade(color, 1.22)];
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const dx = i - c + 0.5;
        const dy = j - c + 0.5;
        const r = Math.hypot(dx, dy);
        if (r > R + 1 || r < inner - 1) continue;
        if (r > R || r < inner) {
          x.fillStyle = INK;
          x.fillRect(i, j, 1, 1);
          continue;
        }
        // torus cross-section normal, lit from the top-left
        const k = (r - inner) / (R - inner);
        const a = (k - 0.5) * Math.PI;
        const nx = (dx / r) * Math.sin(a);
        const ny = (dy / r) * Math.sin(a);
        const nzv = Math.cos(a);
        const lam = -0.55 * nx - 0.6 * ny + 0.58 * nzv;
        const q = lam + (bayer(i, j) - 0.5) * 0.18;
        let col = q > 0.62 ? ramp[3] : q > 0.25 ? ramp[2] : q > -0.15 ? ramp[1] : ramp[0];
        if (!under && lam > 0.86) col = '#ffffff';
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    if (!under) {
      // valve stem
      x.fillStyle = INK;
      x.fillRect(c + Math.round(R * 0.62), c - Math.round(R * 0.62), 2, 2);
    }
  });
}

export interface TuberLook {
  p: Person;
  tube: string;
  shades: string; // sunglasses color
  suit: string; // swimsuit / shorts
}

// Draws someone sitting in an inner tube, facing `ang` (0 = up the screen, downstream), any angle,
// at pixel-crisp positions: legs over the front rim, arms paddling, head at the back.
export function drawTuber(x: Ctx, L: TuberLook, cx: number, cy: number, tb: Tube, t: number, opts: { scale?: number; held?: ItemKind | null } = {}): void {
  const s = opts.scale ?? 1;
  const R = Math.round(7 * s);
  const ang = tb.ang;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  // local (f forward, q sideways) -> screen
  const P = (f: number, q: number): [number, number] => [cx + (q * ca + f * sa) * s, cy + (-f * ca + q * sa) * s];
  const bob = Math.sin(t * 3 + cx * 0.1) * 0.4;
  cy += bob;
  const ring = tubeRing(L.tube, R);
  x.drawImage(ring, Math.round(cx - R - 1), Math.round(cy - R - 1));
  const lean = tb.lean * 1.2;
  const skin = L.p.skin;
  const skinD = shade(skin, 0.8);
  // legs over the front rim (splayed and dragging when braking)
  const splay = tb.brake ? 1.8 : 0;
  for (const q of [-1, 1]) {
    const [hx, hy] = P(1.5, q * 1.6 + lean * 0.3);
    const [kx, ky] = P(6, q * (2.2 + splay * 0.6));
    const [fx, fy] = P(9.2 + (tb.brake ? -0.5 : 0), q * (2.6 + splay));
    thick(x, hx, hy, kx, ky, L.suit, s);
    thick(x, kx, ky, fx, fy, skin, s);
    disc(x, fx, fy, Math.max(1, Math.round(s)), skinD);
  }
  // torso
  const [tx, ty] = P(-0.6, lean);
  disc(x, tx, ty, Math.round(3.6 * s), INK);
  disc(x, tx, ty, Math.round(2.8 * s), shade(L.p.shirt, 0.82));
  disc(x, tx - 0.5, ty - 0.5, Math.round(2.2 * s), L.p.shirt);
  // arms: one paddles (reach forward, sweep back), the other rests on the rim
  for (const q of [-1, 1]) {
    const active = tb.stroke > 0 && q === tb.strokeSide;
    const ph = active ? 1 - tb.stroke : 0;
    const reach = active ? Math.sin(ph * Math.PI) * 4 - ph * 4 + 2 : -1.2 + Math.sin(t * 2 + q) * 0.3;
    const out = active ? 8.4 : 6.8;
    const [sx0, sy0] = P(-1.8, q * 2.8 + lean);
    const [hx, hy] = P(reach, q * out + lean * 0.5);
    thick(x, sx0, sy0, hx, hy, skin, s);
    disc(x, hx, hy, Math.max(1, Math.round(1.1 * s)), skinD);
  }
  // held snack in the left hand
  if (opts.held) {
    const [hx, hy] = P(-0.6, -7.4);
    drawItem(x, opts.held, hx - 2, hy - 3, t, true);
  }
  // head: hair from above, a bit of face toward the front, sunglasses
  const [hx, hy] = P(-4.2, lean * 1.1);
  disc(x, hx, hy, Math.round(3.2 * s), INK);
  disc(x, hx, hy, Math.round(2.6 * s), L.p.hair);
  const [fx, fy] = P(-2.7, lean * 1.1);
  disc(x, fx, fy, Math.max(1, Math.round(1.3 * s)), skin);
  const [g1x, g1y] = P(-2.4, lean * 1.1 - 1.3);
  const [g2x, g2y] = P(-2.4, lean * 1.1 + 1.3);
  rect(x, g1x, g1y, 1, 1, L.shades);
  rect(x, g2x, g2y, 1, 1, L.shades);
  const [hlx, hly] = P(-5, lean * 1.1 - 1);
  rect(x, hlx - 0.5, hly - 0.5, 1, 1, shade(L.p.hair, 1.35));
}
function thick(x: Ctx, x0: number, y0: number, x1: number, y1: number, c: string, s: number): void {
  line(x, x0, y0, x1, y1, c);
  if (s >= 1) line(x, x0 + 0.6, y0 + 0.6, x1 + 0.6, y1 + 0.6, c);
}

// The water around a floating tube: shadow, ripple rings, a wake when moving through the water.
export function drawWaterAround(x: Ctx, cx: number, cy: number, R: number, t: number, rel: number, ang: number, seed: number): void {
  x.globalAlpha = 0.28;
  ellipse(x, cx + 1.5, cy + 2, R + 1, R, '#06202a');
  x.globalAlpha = 1;
  for (let k = 0; k < 2; k++) {
    const ph = (t * 0.8 + k * 0.5 + seed) % 1;
    x.globalAlpha = 0.55 * (1 - ph);
    ringDots(x, cx, cy + 1, R + 2 + ph * 6, '#d8f4ee', 1.4, R + 1 + ph * 5);
    x.globalAlpha = 1;
  }
  if (rel > 14) {
    // V wake trailing behind (down the screen when facing up)
    const n = Math.min(10, Math.floor(rel / 6));
    for (let i = 2; i < n + 2; i++) {
      const spread = i * 1.6;
      const yy = cy + R + i * 1.6;
      if ((i + Math.floor(t * 12)) % 3 === 0) continue;
      rect(x, cx - R * 0.6 - spread + Math.sin(ang) * i, yy, 1, 1, '#e6fbf6');
      rect(x, cx + R * 0.6 + spread + Math.sin(ang) * i, yy, 1, 1, '#e6fbf6');
    }
  }
}

// ---------- pickups ----------
export function drawItem(x: Ctx, k: ItemKind, px: number, py: number, t: number, small = false): void {
  px = Math.round(px);
  py = Math.round(py);
  switch (k) {
    case 'chips':
      rect(x, px - 1, py, 7, 9, INK);
      rect(x, px, py + 1, 5, 7, '#f2c230');
      rect(x, px, py + 3, 5, 2, '#e0503c');
      rect(x, px, py + 1, 1, 7, '#fff1a0');
      rect(x, px, py, 5, 1, '#c8c8d0');
      rect(x, px, py + 8, 5, 1, '#c8c8d0');
      break;
    case 'soda':
      rect(x, px, py, 5, 9, INK);
      rect(x, px + 1, py + 1, 3, 7, '#d23a30');
      rect(x, px + 1, py + 1, 1, 7, '#ff8a7a');
      rect(x, px + 1, py + 1, 3, 1, '#d8dce4');
      rect(x, px + 1, py + 7, 3, 1, '#a8acb8');
      rect(x, px + 2, py + 3, 1, 3, '#ffffff');
      break;
    case 'melon':
      rect(x, px, py + 1, 8, 5, INK);
      rect(x, px + 1, py + 1, 6, 3, '#f0505a');
      rect(x, px + 1, py + 4, 6, 1, '#f4f0c8');
      rect(x, px + 1, py + 5, 6, 1, '#3caa4a');
      rect(x, px + 2, py, 4, 1, INK);
      rect(x, px + 2, py + 2, 1, 1, INK);
      rect(x, px + 5, py + 2, 1, 1, INK);
      rect(x, px + 3, py + 1, 1, 1, '#ff9aa0');
      break;
    case 'sandal':
      rect(x, px, py, 5, 10, INK);
      rect(x, px + 1, py + 1, 3, 8, '#ef7fae');
      rect(x, px + 1, py + 1, 3, 1, '#ffb4d0');
      rect(x, px + 2, py + 3, 1, 3, '#ffffff');
      rect(x, px + 1, py + 4, 1, 1, '#ffffff');
      rect(x, px + 3, py + 4, 1, 1, '#ffffff');
      break;
    case 'cooler': {
      const bob = small ? 0 : Math.round(Math.sin(t * 2.4) * 0.6);
      rect(x, px - 1, py - 1 + bob, 14, 11, INK);
      rect(x, px, py + bob, 12, 9, '#2f7fd8');
      rect(x, px, py + bob, 12, 3, '#f4f6f8');
      rect(x, px, py + 3 + bob, 12, 1, '#c8ccd4');
      rect(x, px + 1, py + 4 + bob, 1, 4, '#5aa0f0');
      rect(x, px + 4, py + 1 + bob, 4, 1, INK);
      rect(x, px + 10, py + 7 + bob, 1, 1, '#1a4a8a');
      break;
    }
  }
}
const ITEM_SIZE: Record<ItemKind, [number, number]> = { chips: [5, 9], soda: [5, 9], melon: [8, 6], sandal: [5, 10], cooler: [12, 9] };

// ---------- obstacles ----------
function rockSprite(seed: number, r: number): HTMLCanvasElement {
  const S = Math.ceil(r * 2 + 6);
  return cached(`rr-rock|${seed}|${r.toFixed(1)}`, S, S, (x) => {
    const c = S / 2;
    const blobs: [number, number, number][] = [[0, 0, r]];
    for (let k = 0; k < 3; k++) {
      const a = hash(seed + k) * 6.28;
      blobs.push([Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.4, r * (0.55 + hash(seed + k + 9) * 0.25)]);
    }
    const inside = (i: number, j: number, grow: number): number => {
      let best = -Infinity;
      for (const [bx, by, br] of blobs) {
        const v = br + grow - Math.hypot(i - c - bx + 0.5, j - c - by + 0.5);
        if (v > best) best = v;
      }
      return best;
    };
    const base = ['#5e5a62', '#76727a', '#8e8a90', '#aaa6aa', '#c8c4c4'];
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const v = inside(i, j, 0);
        if (v < -1) continue;
        if (v < 0) {
          x.fillStyle = INK;
          x.fillRect(i, j, 1, 1);
          continue;
        }
        // light from the top-left: compare against a shifted copy of the shape
        const lit = inside(i - 1.6, j - 1.6, 0) < 0 ? 0 : inside(i + 1.6, j + 1.6, 0) < 0 ? 1 : 2;
        const hgt = Math.min(1, v / (r * 0.7));
        let k = Math.round(1 + hgt * 1.6 + (lit === 1 ? -1 : 0) + (lit === 0 ? -0.2 : 0) + (bayer(i, j) - 0.5) * 0.8 - (j - c) / r * 0.7);
        k = Math.max(0, Math.min(4, k));
        let col = base[k];
        if (k >= 3 && hash(seed * 7 + i * 31 + j) > 0.82) col = '#5c8a46'; // moss on top
        if (j > c + r * 0.45 && inside(i, j + 2, 0) < 0) col = '#3e3a44'; // wet waterline
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    x.fillStyle = '#ffffff';
    x.fillRect(Math.round(c - r * 0.4), Math.round(c - r * 0.5), 2, 1);
  });
}

export function drawRock(x: Ctx, cx: number, cy: number, r: number, seed: number, t: number): void {
  // pillow of foam on the upstream face (below), V wake + eddy shadow downstream (above)
  x.globalAlpha = 0.35;
  ellipse(x, cx, cy - r * 1.6, r * 0.7, r * 1.2, '#082430');
  x.globalAlpha = 1;
  for (let i = 0; i < 10; i++) {
    const k = (i + t * 7) % 10;
    const yy = cy - r - k * 1.8;
    const spread = r * 0.8 + k * 0.9;
    if ((i + Math.floor(t * 9)) % 4 === 0) continue;
    rect(x, cx - spread, yy, 1, 1, '#dff6f0');
    rect(x, cx + spread - 1, yy, 1, 1, '#dff6f0');
  }
  for (let i = -r - 1; i <= r + 1; i++) {
    const yy = cy + Math.sqrt(Math.max(0, (r + 1.5) ** 2 - i * i)) * 0.8;
    const f = Math.sin(i * 1.3 + t * 9);
    rect(x, cx + i, yy + (f > 0.3 ? 1 : 0), 1, 1, f > -0.4 ? '#f4fffb' : '#bfe6de');
  }
  const spr = rockSprite(seed, r);
  x.drawImage(spr, Math.round(cx - spr.width / 2), Math.round(cy - spr.height / 2));
}

export function drawLog(x: Ctx, cx: number, cy: number, len: number, ang: number, fixed: boolean, t: number): void {
  const ca = Math.cos(ang);
  const sa = -Math.sin(ang); // world d up = screen y down
  const ext = Math.ceil(len + 6);
  // foam where the current piles against it
  for (let a = -len; a <= len; a += 1) {
    const px = cx + ca * a;
    const py = cy + sa * a;
    if ((Math.floor(a) + Math.floor(t * 10)) % 3) rect(x, px, py + 4.5, 1, 1, '#f4fffb');
  }
  for (let j = -ext; j <= ext; j++)
    for (let i = -ext; i <= ext; i++) {
      const al = i * ca + j * sa; // along
      const ac = -i * sa + j * ca; // across
      if (Math.abs(al) > len + 1 || Math.abs(ac) > 4.5) continue;
      let col: string;
      if (Math.abs(ac) > 3.5 || Math.abs(al) > len) col = INK;
      else if (Math.abs(al) > len - 1.5) {
        const rr = Math.hypot(Math.abs(al) - len + 1.5, ac);
        col = rr < 1 ? '#8a5a2a' : (Math.floor(Math.abs(ac) * 1.6) & 1) ? '#c89a5a' : '#e0b87a';
      } else {
        const band = ac < -1.8 ? 2 : ac < 1.2 ? 1 : 0;
        col = ['#4a2c16', '#7a4e26', '#a8743c'][band];
        if ((Math.floor(al * 0.7 + (band === 1 ? 2 : 0)) % 5 === 0) && Math.abs(ac) < 3) col = '#5a361a';
        if (band === 2 && hash(Math.floor(al) * 3) > 0.7) col = '#c8905a';
      }
      x.fillStyle = col;
      x.fillRect(Math.round(cx + i), Math.round(cy + j), 1, 1);
    }
  if (!fixed) {
    // a stubby branch with a few leaves still on
    const bx = cx + ca * len * 0.3;
    const by = cy + sa * len * 0.3;
    line(x, bx, by, bx - sa * 6, by + ca * 6, '#5a361a');
    disc(x, bx - sa * 7, by + ca * 7, 1, '#4a8a3a');
  }
}

export function drawWhirl(x: Ctx, cx: number, cy: number, r: number, t: number): void {
  for (let k = 3; k >= 0; k--) {
    x.globalAlpha = 0.22;
    ellipse(x, cx, cy, r * (0.3 + k * 0.22), r * (0.3 + k * 0.22) * 0.85, '#05182a');
  }
  x.globalAlpha = 1;
  for (let arm = 0; arm < 4; arm++) {
    for (let i = 0; i < 26; i++) {
      const rr = r * 1.15 - i * (r / 26);
      const a = arm * (Math.PI / 2) + t * 3.2 + i * 0.26;
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.85;
      rect(x, px, py, 1, 1, i < 8 ? '#bfe6e2' : i < 18 ? '#e8fffb' : '#ffffff');
    }
  }
  disc(x, cx, cy, 2, '#041018');
}

export function drawWave(x: Ctx, cx: number, cy: number, w: number, t: number): void {
  const hw = w / 2;
  for (let i = -hw; i <= hw; i++) {
    const f = Math.abs(i) / hw;
    const yy = cy + f * f * 4;
    const sh = Math.sin(i * 0.5 + t * 8);
    x.globalAlpha = 0.4;
    rect(x, cx + i, yy + 2, 1, 2, '#082a3a');
    x.globalAlpha = 1;
    rect(x, cx + i, yy - (sh > 0.2 ? 1 : 0), 1, 1, sh > -0.5 ? '#ffffff' : '#cdeee8');
    if (sh > 0.7) rect(x, cx + i, yy - 2, 1, 1, '#ffffff');
  }
}

function drawFallSpray(x: Ctx, g: RiverSim, t: number): void {
  for (const f of g.c.falls) {
    const y = sy(g, f.d);
    if (!onScreen(y, 40)) continue;
    const [L, R] = banks(g.c, f.d);
    // ledge rocks poking out of the crest, and mist drifting downstream
    for (let px = Math.ceil(L) + 2; px < R - 2; px += 5) {
      if (Math.abs(px - f.tx) < f.tw / 2 + 2) continue;
      const hgt = hash(px * 7 + 3);
      rect(x, px, y - 1 + (hgt > 0.5 ? 1 : 0), 3, 2, '#3e3a44');
      rect(x, px, y - 1 + (hgt > 0.5 ? 1 : 0), 2, 1, '#6e6a72');
    }
    for (let i = 0; i < 40; i++) {
      const ph = (t * 0.7 + hash(i) ) % 1;
      const px = L + hash(i * 3 + 1) * (R - L);
      if (Math.abs(px - f.tx) < f.tw / 2) continue;
      x.globalAlpha = 0.5 * (1 - ph);
      rect(x, px + Math.sin(t + i) * 2, y - 4 - ph * 22, 2, 1, '#ffffff');
    }
    x.globalAlpha = 1;
    // chevrons in the tongue pointing the way
    for (let k = 0; k < 3; k++) {
      const yy = y + 10 + k * 7 - ((t * 20) % 7);
      for (let i = -4; i <= 4; i++) rect(x, f.tx + i, yy + Math.abs(i) * 0.6, 1, 1, '#9ae8d8');
    }
  }
}

function drawEddy(x: Ctx, g: RiverSim, t: number): void {
  for (const e of g.c.eddies) {
    const y0 = sy(g, e.d);
    const y1 = sy(g, e.d + e.len);
    if (y0 < -20 || y1 > RH + 20) continue;
    const dm = e.d + e.len / 2;
    const [L, R] = banks(g.c, dm);
    const cx = e.side < 0 ? L + 13 : R - 13;
    const cy = sy(g, dm);
    for (let k = 0; k < 3; k++) {
      const rr = 5 + k * 4;
      for (let a = 0; a < 5.2; a += 0.35) {
        const aa = a - t * 1.6 * e.side + k;
        rect(x, cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr * 1.6, 1, 1, a > 4 ? '#cfeee6' : '#7fc6bc');
      }
    }
  }
}

// ---------- shores: ground props (1x) and canopies (parallax 1.2x) ----------
type Prop = 'pine' | 'bush' | 'boulder' | 'fern' | 'juniper' | 'willow' | 'reeds' | 'drift' | 'grass' | 'umbrella' | 'none';
function propAt(z: Zone, h: number): Prop {
  switch (z) {
    case 'forest':
      return h < 0.5 ? 'pine' : h < 0.62 ? 'bush' : h < 0.72 ? 'boulder' : h < 0.86 ? 'fern' : 'none';
    case 'canyon':
    case 'rapids':
      return h < 0.35 ? 'juniper' : h < 0.5 ? 'boulder' : 'none';
    case 'meadow':
      return h < 0.3 ? 'willow' : h < 0.68 ? 'reeds' : h < 0.78 ? 'bush' : 'none';
    case 'sunset':
      return h < 0.22 ? 'pine' : h < 0.42 ? 'grass' : h < 0.52 ? 'drift' : h < 0.56 ? 'umbrella' : 'none';
  }
}
const CHUNK = 15;
function propsInView(g: RiverSim, par: number, fn: (p: Prop, px: number, py: number, h: number, side: number, d: number) => void): void {
  const span = RH / par;
  const top = g.camD + (PY / par) + 30;
  const bot = g.camD - (RH - PY) / par - 30;
  for (let k = Math.floor(bot / CHUNK); k <= Math.ceil(top / CHUNK); k++) {
    for (const side of [-1, 1]) {
      const h = hash(k * 2 + (side > 0 ? 1 : 0) + g.c.seed * 101);
      const d = k * CHUNK + hash(k * 5 + side) * CHUNK * 0.8;
      const py = sy(g, d, par);
      if (py < -40 || py > RH + 40) continue;
      const dg = g.camD + (PY - py); // ground under that screen row
      const z = zoneAt(dg);
      const zone = z.w > hash(k + 77) ? z.b : z.a;
      if (g.c.trip && dg > LEN - 160) continue;
      const p = propAt(zone, h);
      if (p === 'none') continue;
      const [L, R] = banks(g.c, dg);
      const off = hash(k * 11 + side * 3);
      const dist = p === 'reeds' ? 1 + off * 3 : p === 'juniper' ? 26 + off * 14 : p === 'willow' ? 6 + off * 6 : p === 'pine' ? 8 + off * 16 : 4 + off * 12;
      const px = side < 0 ? L - dist : R + dist;
      if (px < -24 || px > RW + 24) continue;
      fn(p, px, py, hash(k * 13 + side), side, dg);
    }
  }
  void span;
}

function pineSprite(r: number, v: number): HTMLCanvasElement {
  const S = r * 2 + 4;
  return cached(`rr-pine|${r}|${v}`, S, S, (x) => {
    const c = S / 2;
    const layers = [
      [r, '#16361e'],
      [r * 0.78, '#1e4a28'],
      [r * 0.55, '#2a6232'],
      [r * 0.32, '#3c7e3c'],
    ] as const;
    for (const [lr, col] of [[r + 1, INK] as const, ...layers]) {
      x.fillStyle = col;
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const dx = i - c + 0.5;
          const dy = j - c + 0.5;
          const a = Math.atan2(dy, dx);
          const star = lr * (0.78 + 0.22 * Math.cos(a * 8 + v)) - (col === INK ? 0 : 0);
          // light from the top-left: layers shift toward it
          const sh = col === INK ? 0 : (lr / r) * 0;
          if (Math.hypot(dx + sh, dy + sh) < star) x.fillRect(i, j, 1, 1);
        }
    }
    // needles catching light
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 6.28 + v;
      const rr = r * (0.4 + hash(k + v * 9) * 0.5);
      x.fillStyle = k % 3 ? '#4e9448' : '#6aae58';
      x.fillRect(Math.round(c + Math.cos(a) * rr - 1.5), Math.round(c + Math.sin(a) * rr - 1.5), 1, 1);
    }
    x.fillStyle = '#7cc068';
    x.fillRect(Math.round(c - 2), Math.round(c - 2), 1, 1);
  });
}
function willowSprite(r: number, v: number): HTMLCanvasElement {
  const S = r * 2 + 4;
  return cached(`rr-willow|${r}|${v}`, S, S, (x) => {
    const c = S / 2;
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const dx = i - c + 0.5;
        const dy = j - c + 0.5;
        const d = Math.hypot(dx, dy);
        const wob = r * (0.85 + 0.15 * Math.sin(Math.atan2(dy, dx) * 6 + v));
        if (d > wob + 1) continue;
        let col = INK;
        if (d <= wob) {
          const lit = -(dx + dy) / (r * 1.4) + (bayer(i, j) - 0.5) * 0.5;
          col = lit > 0.35 ? '#9ac85a' : lit > -0.05 ? '#74a848' : lit > -0.45 ? '#558a3a' : '#3c6a2e';
          if ((i + (j >> 1)) % 4 === 0 && lit < 0.4) col = '#3c6a2e'; // drooping strands
        }
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
  });
}

function drawGroundProps(x: Ctx, g: RiverSim, t: number): void {
  // canopy shadows first (they fall on the ground at 1x), then low props
  propsInView(g, 1, (p, px, py, h, side) => {
    switch (p) {
      case 'pine':
      case 'willow':
      case 'juniper': {
        const r = p === 'juniper' ? 5 : 8 + Math.floor(h * 5);
        x.globalAlpha = 0.3;
        ellipse(x, px + 3, py + 4, r, r * 0.8, '#0a1a10');
        x.globalAlpha = 1;
        break;
      }
      case 'bush':
        x.globalAlpha = 0.3;
        ellipse(x, px + 1, py + 2, 5, 3, '#0a1a10');
        x.globalAlpha = 1;
        ball(x, px, py, 4, h > 0.5 ? '#3e7a36' : '#4a8a3c');
        if (h > 0.7) (rect(x, px - 1, py - 1, 1, 1, '#f04a5a'), rect(x, px + 2, py + 1, 1, 1, '#f04a5a'));
        break;
      case 'boulder':
        drawRockShore(x, px, py, 3 + h * 3, Math.floor(h * 1000));
        break;
      case 'fern':
        for (let k = 0; k < 5; k++) {
          const a = k * 1.25 + h;
          line(x, px, py, px + Math.cos(a) * 5, py + Math.sin(a) * 4, k % 2 ? '#3e8a3a' : '#5aa44a');
        }
        break;
      case 'reeds':
        for (let k = 0; k < 4; k++) {
          const bx = px + (k - 1.5) * 2 * -side;
          const sw = Math.round(Math.sin(t * 2 + bx * 0.3) * 1);
          line(x, bx, py + 2, bx + sw, py - 6 - k, '#6a8a3a');
          if (k % 2 === 0) rect(x, bx + sw, py - 8 - k, 1, 3, '#6a4428');
        }
        break;
      case 'grass':
        for (let k = 0; k < 4; k++) line(x, px + k * 2 - 3, py + 1, px + k * 2 - 3 + Math.round(Math.sin(t * 1.5 + k) * 1.2), py - 4, k % 2 ? '#a8a060' : '#8a8a4a');
        break;
      case 'drift':
        rect(x, px - 6, py - 1, 12, 3, INK);
        rect(x, px - 5, py - 1, 10, 2, '#b8a890');
        rect(x, px - 5, py - 1, 10, 1, '#d8ccb8');
        break;
      case 'umbrella': {
        x.globalAlpha = 0.3;
        ellipse(x, px + 3, py + 3, 8, 6, '#2a1a10');
        x.globalAlpha = 1;
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * 6.28;
          x.fillStyle = k % 2 ? '#f4f0e0' : '#e0503c';
          for (let rr = 1; rr < 8; rr++) for (let da = 0; da < 0.78; da += 0.12) x.fillRect(Math.round(px + Math.cos(a0 + da) * rr), Math.round(py + Math.sin(a0 + da) * rr), 1, 1);
        }
        rect(x, px, py, 1, 1, INK);
        // a towel
        rect(x, px + (side < 0 ? 4 : -12), py + 6, 8, 4, '#3f7fd8');
        rect(x, px + (side < 0 ? 4 : -12), py + 7, 8, 1, '#f2b632');
        break;
      }
      default:
        break;
    }
  });
  // the take-out dock and sign (summer)
  if (!g.c.trip) {
    const d = LEN + 16;
    const y = sy(g, d);
    if (onScreen(y, 40)) {
      const [, R] = banks(g.c, d);
      rect(x, R - 22, y - 6, 34, 12, INK);
      for (let k = 0; k < 8; k++) rect(x, R - 21 + k * 4, y - 5, 3, 10, k % 2 ? '#a07848' : '#b8885a');
      rect(x, R - 21, y - 5, 32, 1, '#d8a870');
      rect(x, R + 6, y - 22, 2, 14, '#6a4428');
      rect(x, R - 6, y - 30, 26, 10, INK);
      rect(x, R - 5, y - 29, 24, 8, '#3a7a3a');
      text(x, 'TAKE', R - 4, y - 28, '#f4f0e0');
      text(x, 'OUT', R + 2, y - 28 + 0, '#f4f0e0');
    }
  }
}
function drawRockShore(x: Ctx, cx: number, cy: number, r: number, seed: number): void {
  const spr = rockSprite(seed, Math.round(r));
  x.drawImage(spr, Math.round(cx - spr.width / 2), Math.round(cy - spr.height / 2));
}

function drawCanopies(x: Ctx, g: RiverSim, t: number): void {
  propsInView(g, 1.22, (p, px, py, h) => {
    const sway = Math.round(Math.sin(t * 0.9 + px * 0.05) * 0.6);
    if (p === 'pine') {
      const r = 8 + Math.floor(h * 5);
      const s = pineSprite(r, Math.floor(h * 6));
      x.drawImage(s, Math.round(px - s.width / 2) + sway, Math.round(py - s.height / 2));
    } else if (p === 'willow') {
      const r = 10 + Math.floor(h * 4);
      const s = willowSprite(r, Math.floor(h * 6));
      x.drawImage(s, Math.round(px - s.width / 2) + sway, Math.round(py - s.height / 2));
    } else if (p === 'juniper') {
      ball(x, px + sway, py, 4 + Math.floor(h * 2), '#4a6a3a');
      rect(x, px - 1 + sway, py - 2, 1, 1, '#8aa070');
    }
  });
}

function drawBranches(x: Ctx, g: RiverSim, t: number): void {
  for (const b of g.c.branches) {
    const y = sy(g, b.d, 1);
    if (!onScreen(y, 30)) continue;
    const [L, R] = banks(g.c, b.d);
    const root = b.side < 0 ? L - 16 : R + 16;
    const tip = b.reach;
    const sway = Math.sin(t * 1.3 + b.d) * 1.2;
    // shadow on the water
    x.globalAlpha = 0.28;
    for (let px = Math.min(root, tip); px < Math.max(root, tip); px++) rect(x, px + 3, y + 5, 1, 3, '#04121a');
    ellipse(x, tip + 3, y + 6, 9, 5, '#04121a');
    x.globalAlpha = 1;
    // limb
    line(x, root, y + 1, tip, y + sway + 1, INK);
    line(x, root, y - 1, tip, y + sway - 1, INK);
    line(x, root, y, tip, y + sway, '#7a4e26');
    line(x, root, y - 0.6, tip, y + sway - 0.6, '#a07040');
    // leaf clusters along the end
    for (let k = 0; k < 5; k++) {
      const u = 0.45 + k * 0.13;
      const lx = root + (tip - root) * u;
      const ly = y + sway * u + (k % 2 ? -3 : 3);
      ball(x, lx, ly, 3 + (k % 2), k % 2 ? '#3e8a3a' : '#5aa44a');
    }
    if (b.hit) for (let k = 0; k < 3; k++) rect(x, tip + k * 3 - 4, y + 7 + k, 1, 1, '#5aa44a');
  }
}

function drawRope(x: Ctx, g: RiverSim, t: number, tuber?: { L: TuberLook; tb: Tube }): void {
  for (const rp of g.c.ropes) {
    const y = sy(g, rp.d);
    if (!onScreen(y, 60)) continue;
    const [L, R] = banks(g.c, rp.d);
    const side = rp.x < (L + R) / 2 ? -1 : 1;
    const trunkX = side < 0 ? L - 12 : R + 12;
    // the big limb the rope hangs from
    const limbY = y - 4;
    line(x, trunkX, limbY + 1, rp.x + side * -2, limbY + 1, INK);
    line(x, trunkX, limbY - 1, rp.x + side * -2, limbY - 1, INK);
    line(x, trunkX, limbY, rp.x + side * -2, limbY, '#8a5a2e');
    if (!rp.used) {
      const sw = Math.sin(t * 1.7) * 2;
      const kx = rp.x + sw;
      const ky = y + 2;
      // shadow + target ring on the water
      x.globalAlpha = 0.3;
      ellipse(x, kx + 4, ky + 5, 3, 2, '#04121a');
      x.globalAlpha = 1;
      const pulse = (t * 1.5) % 1;
      x.globalAlpha = 0.9 - pulse * 0.7;
      ringDots(x, kx + 2, ky + 4, 5 + pulse * 5, '#ffe27a', 1, 3 + pulse * 3);
      x.globalAlpha = 1;
      line(x, rp.x, limbY, kx, ky, '#e8d8a8');
      ball(x, kx, ky, 1, '#d8b878');
      rect(x, kx - 2, ky + 1, 5, 1, '#e8d8a8');
    } else if (tuber && tuber.tb.air > 0 && tuber.tb.airPeak > 15) {
      // swinging: the rope runs to your hands
      const u = 1 - tuber.tb.air / tuber.tb.airMax;
      if (u < 0.55) line(x, rp.x, limbY, RW / 2 + (tuber.tb.x - RW / 2), PY - airHeight(tuber.tb) - 4, '#e8d8a8');
    }
    // the tree itself (canopy drawn big)
    const s = willowSprite(15, 2);
    x.drawImage(s, Math.round(trunkX - s.width / 2), Math.round(y - 14 - s.height / 2));
  }
}

// ---------- particles that live in world space ----------
export interface Splash {
  x: number;
  d: number;
  h: number; // height above water
  vx: number;
  vd: number;
  vh: number;
  life: number;
  max: number;
  c: string;
}
export interface Ripple {
  x: number;
  d: number;
  r: number;
  max: number;
  life: number;
}

// ---------- the whole scene ----------
export interface RiverLooks {
  me: TuberLook;
  rae: TuberLook;
}
export interface SceneFx {
  splashes: Splash[];
  ripples: Ripple[];
  cooler: { x: number; d: number; vx: number; vd: number };
}

export function drawRiverScene(x: Ctx, g: RiverSim, t: number, looks: RiverLooks, fx: SceneFx): void {
  paintRiver(x, g, t);
  drawGroundProps(x, g, t);
  drawEddy(x, g, t);
  // ripples
  for (const r of fx.ripples) {
    const y = sy(g, r.d);
    const u = 1 - r.life / r.max;
    x.globalAlpha = Math.max(0, 0.8 * (1 - u));
    ringDots(x, r.x, y, r.r * (0.3 + u), '#e8fffb', 1.2, r.r * (0.3 + u) * 0.7);
  }
  x.globalAlpha = 1;
  for (const w of g.c.whirls) {
    const y = sy(g, w.d);
    if (onScreen(y, 40)) drawWhirl(x, w.x, y, w.r, t);
  }
  for (const w of g.c.waves) {
    const y = sy(g, w.d);
    if (onScreen(y, 10)) drawWave(x, w.x, y, w.w, t);
  }
  drawFallSpray(x, g, t);
  for (const k of g.c.rocks) {
    const y = sy(g, k.d);
    if (onScreen(y, 30)) drawRock(x, k.x, y, k.r, k.seed, t);
  }
  for (const l of g.c.logs) {
    const y = sy(g, l.d);
    if (onScreen(y, 40)) drawLog(x, l.x, y, l.len, l.ang, l.fixed, t);
  }
  // pickups
  for (const i of g.c.items) {
    if (i.got) continue;
    const y = sy(g, i.d);
    if (!onScreen(y, 20)) continue;
    const [w, h] = ITEM_SIZE[i.kind];
    const bob = Math.sin(t * 3 + i.bob) * 0.8;
    x.globalAlpha = 0.5;
    ringDots(x, i.x, y + 2, w * 0.7 + 2 + Math.sin(t * 3 + i.bob), '#dff8f2', 1.6, 3);
    x.globalAlpha = 1;
    if (i.lost && Math.floor(t * 6) % 2) continue;
    drawItem(x, i.kind, i.x - w / 2, y - h / 2 + bob, t);
    if ((t * 0.7 + i.bob) % 2 < 0.12) {
      rect(x, i.x + w / 2 - 1, y - h / 2 - 2, 1, 3, '#ffffff');
      rect(x, i.x + w / 2 - 2, y - h / 2 - 1, 3, 1, '#ffffff');
    }
  }
  // the towed cooler trails behind you on a rope
  if (g.towing) {
    const py = sy(g, g.p.d) - airHeight(g.p);
    const cy = sy(g, fx.cooler.d);
    line(x, g.p.x, py + 6, fx.cooler.x, cy - 3, '#e8d8a8');
    drawItem(x, 'cooler', fx.cooler.x - 6, cy - 4, t);
  }
  // tubers, back to front
  const order = [
    { L: looks.rae, tb: g.rae, me: false },
    { L: looks.me, tb: g.p, me: true },
  ].sort((a, b) => b.tb.d - a.tb.d);
  for (const o of order) drawOneTuber(x, g, o.L, o.tb, t, o.me ? g.held[g.held.length - 1] ?? null : null, o.me, fx);
  // splashes (world particles with height)
  for (const s of fx.splashes) {
    const y = sy(g, s.d) - s.h;
    if (s.life < s.max * 0.25 && Math.floor(s.life * 30) % 2) continue;
    rect(x, s.x, y, 1, 1, s.c);
  }
  drawBranches(x, g, t);
  drawRope(x, g, t, { L: looks.me, tb: g.p });
  drawCanopies(x, g, t);
}

function drawOneTuber(x: Ctx, g: RiverSim, L: TuberLook, tb: Tube, t: number, held: ItemKind | null, me: boolean, fx: SceneFx): void {
  const y = sy(g, tb.d);
  if (!onScreen(y, 30)) return;
  const h = airHeight(tb);
  const f = baseSpeed(tb.d);
  const rel = Math.hypot(tb.vx, tb.vd - f);
  if (h < 2) drawWaterAround(x, tb.x, y, 7, t, rel, tb.ang, me ? 0 : 0.37);
  else {
    // shadow on the water, smaller as you rise
    x.globalAlpha = 0.3;
    ellipse(x, tb.x + h * 0.25, y + 2, Math.max(3, 8 - h * 0.15), Math.max(2, 6 - h * 0.12), '#04121a');
    x.globalAlpha = 1;
  }
  if (me && tb.flip > 0) {
    drawWipeout(x, L, tb, tb.x, y, t);
    return;
  }
  if (me && tb.inv > 0 && Math.floor(t * 14) % 2 === 0) return;
  const scale = 1 + h / 22;
  drawTuber(x, L, tb.x, y - h, tb, t, { scale, held });
  if (tb.brake) {
    // feet dragging: little white wakes off the toes
    for (const q of [-1, 1]) {
      const fx0 = tb.x + q * 4 + Math.sin(tb.ang) * -9;
      const fy0 = y - Math.cos(tb.ang) * 9;
      rect(x, fx0 - 1, fy0 + 2 + (Math.floor(t * 12) % 2), 3, 1, '#f4fffb');
    }
  }
  void fx;
}

function drawWipeout(x: Ctx, L: TuberLook, tb: Tube, cx: number, cy: number, t: number): void {
  const u = 1 - tb.flip / 1.3;
  if (u < 0.22) {
    // the tube flips over: squash it like a coin
    const k = Math.cos((u / 0.22) * Math.PI);
    const ring = tubeRing(L.tube, 7, k < 0);
    const w = Math.max(2, Math.round(ring.width * Math.abs(k)));
    x.drawImage(ring, Math.round(cx - w / 2), Math.round(cy - ring.height / 2), w, ring.height);
    rect(x, cx - 2, cy - 12 - u * 20, 4, 4, L.p.hair);
    return;
  }
  // upside-down tube, you underwater: a dark shape and bubbles, then a hand grabs back on
  x.globalAlpha = 0.45;
  ellipse(x, cx + 3, cy + 6, 5, 7, '#04121a');
  x.globalAlpha = 1;
  const ring = tubeRing(L.tube, 7, true);
  x.drawImage(ring, Math.round(cx - 8), Math.round(cy - 8));
  for (let i = 0; i < 4; i++) {
    const ph = (t * 1.6 + i * 0.27) % 1;
    ringDots(x, cx + 3 + Math.sin(i * 2 + t * 5) * 2, cy + 6 - ph * 6, 1 + (i % 2), '#e8fffb', 2);
  }
  if (u > 0.72) {
    const k = (u - 0.72) / 0.28;
    rect(x, cx + 7, cy - 1 - k * 2, 2, 3, L.p.skin);
    if (k > 0.5) {
      disc(x, cx + 3, cy + 7 - k * 6, 3, INK);
      disc(x, cx + 3, cy + 7 - k * 6, 2, L.p.hair);
    }
  }
}

// ---------- light ----------
// Time of day follows the course: bright midday in the forest, gold in the meadow, sunset at the end.
const SKY: [number, string, string, number][] = [
  // [course fraction, multiply tint, glow color, glow strength]
  [0, '#ffffff', '#fff8e0', 0],
  [0.3, '#fdfaf2', '#fff0d0', 0.03],
  [0.55, '#fff4e4', '#ffd8a0', 0.06],
  [0.75, '#ffead2', '#ffb070', 0.1],
  [0.9, '#fae0d0', '#ff9058', 0.14],
  [1.05, '#f4d2c4', '#ff7a4a', 0.18],
];
function mixHex(a: string, b: string, k: number): string {
  const A = parseInt(a.slice(1), 16);
  const Bn = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) + (((Bn >> s) & 255) - ((A >> s) & 255)) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
export function lightAt(f: number): { tint: string; glow: string; strength: number } {
  let i = 0;
  while (i < SKY.length - 2 && f > SKY[i + 1][0]) i++;
  const a = SKY[i];
  const b = SKY[i + 1];
  const k = Math.max(0, Math.min(1, (f - a[0]) / (b[0] - a[0])));
  return { tint: mixHex(a[1], b[1], k), glow: mixHex(a[2], b[2], k), strength: a[3] + (b[3] - a[3]) * k };
}
export function drawLight(x: Ctx, g: RiverSim, t: number): void {
  const f = g.p.d / LEN;
  const L = lightAt(f);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = L.tint;
  x.fillRect(0, 0, RW, RH);
  // golden hour: push warm color into the midtones
  if (L.strength > 0.02) {
    x.globalCompositeOperation = 'soft-light';
    x.globalAlpha = Math.min(0.55, L.strength * 3);
    x.fillStyle = L.glow;
    x.fillRect(0, 0, RW, RH);
    x.globalAlpha = 1;
  }
  x.globalCompositeOperation = 'source-over';
  if (L.strength > 0) {
    // low sun glow from the top of the screen, stepped bands
    x.globalCompositeOperation = 'lighter';
    x.fillStyle = L.glow;
    for (let k = 0; k < 12; k++) {
      x.globalAlpha = L.strength * 0.09;
      x.fillRect(0, 0, RW, 8 + k * 8);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }
  // dappled light under the forest canopy
  const wf = zoneWeight(g.camD, 'forest');
  if (wf > 0.3) {
    x.globalAlpha = 0.08 * wf;
    for (let k = 0; k < 8; k++) {
      const px = (hash(k * 7) * RW + Math.sin(t * 0.4 + k) * 4) | 0;
      const py = (((hash(k * 3) * RH * 2 + g.camD) % (RH + 40)) - 20) | 0;
      ellipse(x, px, py, 6 + k % 3 * 3, 4 + k % 2 * 2, '#fff8d0');
    }
    x.globalAlpha = 1;
  }
  void t;
}

// ---------- canvas HUD ----------
export function drawHud(x: Ctx, g: RiverSim, t: number, looks: RiverLooks): void {
  // top bar
  x.globalAlpha = 0.78;
  rect(x, 0, 0, RW, 13, '#140c22');
  x.globalAlpha = 1;
  rect(x, 0, 13, RW, 1, INK);
  // lives: little tubes
  for (let i = 0; i < MAX_WIPES; i++) {
    const alive = i < MAX_WIPES - g.wipes;
    const ring = tubeRing(alive ? looks.me.tube : '#5a5068', 3, !alive);
    x.drawImage(ring, 3 + i * 10, 2);
  }
  // river map: you, Rae, the take-out
  const m0 = 36;
  const m1 = RW - 66;
  const fin = finishLine(g.c);
  rect(x, m0, 6, m1 - m0, 2, '#2a5a6a');
  rect(x, m0, 6, Math.round((m1 - m0) * Math.min(1, g.p.d / fin)), 2, '#58c0b0');
  for (const [d, label] of [
    [1210, 'R'],
    [2470, 'W'],
  ] as const) {
    const mx = m0 + Math.round(((m1 - m0) * d) / fin);
    rect(x, mx, 4, 1, 6, '#c8a8ff');
    void label;
  }
  const raeX = m0 + Math.round((m1 - m0) * Math.min(1, g.rae.d / fin));
  rect(x, raeX - 1, 3, 3, 3, looks.rae.tube);
  const meX = m0 + Math.round((m1 - m0) * Math.min(1, g.p.d / fin));
  rect(x, meX - 1, 7, 3, 4, looks.me.tube);
  rect(x, meX, 8, 1, 2, '#ffffff');
  rect(x, m1 + 1, 2, 1, 9, '#f4f0e0');
  rect(x, m1 + 2, 2, 4, 3, g.c.trip ? '#3f8fd8' : '#e0503c');
  // held snacks
  const shown = g.held.slice(-4);
  let ix = RW - 4;
  if (g.towing) {
    ix -= 8;
    rect(x, ix, 3, 7, 7, INK);
    rect(x, ix + 1, 4, 5, 5, '#2f7fd8');
    rect(x, ix + 1, 4, 5, 2, '#f4f6f8');
  }
  for (let i = shown.length - 1; i >= 0; i--) {
    ix -= 6;
    const k = shown[i];
    const c = k === 'chips' ? '#f2c230' : k === 'soda' ? '#d23a30' : '#f0505a';
    rect(x, ix, 3, 5, 7, INK);
    rect(x, ix + 1, 4, 3, 5, c);
    rect(x, ix + 1, 4, 1, 5, shade(c, 1.3));
  }
  if (g.held.length > 4) text(x, `+${g.held.length - 4}`, ix - 9, 4, '#fff3c4');
  void t;
}

// Rae's speech bubble, pinned near her (clamped to the screen).
export function drawBubble(x: Ctx, g: RiverSim, t: number): void {
  if (g.say.t <= 0) return;
  const words = g.say.text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 18) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  const w = Math.max(...lines.map(textWidth)) + 8;
  const h = lines.length * 7 + 5;
  const rx = g.rae.x;
  const ry = sy(g, g.rae.d) - airHeight(g.rae);
  let bx = Math.round(rx - w / 2);
  bx = Math.max(2, Math.min(RW - w - 2, bx));
  let by = Math.round(ry - 14 - h);
  const below = by < 16;
  if (below) by = Math.round(ry + 13);
  by = Math.max(16, Math.min(RH - h - 2, by));
  const pop = Math.min(1, (2.6 - g.say.t) * 10);
  if (pop < 0.3) return;
  rect(x, bx - 1, by, w + 2, h, INK);
  rect(x, bx, by - 1, w, h + 2, INK);
  rect(x, bx, by, w, h, '#fffaf0');
  rect(x, bx, by + h - 1, w, 1, '#e8dcc0');
  const tx = Math.max(bx + 3, Math.min(bx + w - 4, Math.round(rx)));
  if (below) {
    rect(x, tx - 1, by - 3, 3, 3, INK);
    rect(x, tx, by - 2, 1, 2, '#fffaf0');
  } else {
    rect(x, tx - 1, by + h, 3, 3, INK);
    rect(x, tx, by + h, 1, 2, '#fffaf0');
  }
  const urgent = /!/.test(g.say.text) && /ROCK|LOG|BRANCH|WATERFALL|WHIRL|RAPIDS/.test(g.say.text);
  lines.forEach((s, i) => text(x, s, bx + Math.round((w - textWidth(s)) / 2), by + 3 + i * 7, urgent && Math.floor(t * 6) % 2 ? '#d0302a' : '#2a1f3a'));
  // name tag
  outlined(x, 'RAE', Math.round(rx - 5), Math.round(ry + 9), '#ffb4d0');
}

// ---------- the road-trip ending: a sunset postcard ----------
let SCRATCH: HTMLCanvasElement | null = null;
function scratch(w: number, h: number): HTMLCanvasElement {
  if (!SCRATCH) SCRATCH = document.createElement('canvas');
  if (SCRATCH.width !== w || SCRATCH.height !== h) {
    SCRATCH.width = w;
    SCRATCH.height = h;
  }
  return SCRATCH;
}
export function drawPostcard(x: Ctx, k: number, t: number, me: Person, rae: Person): void {
  const W = RW;
  const H = RH;
  const hz = 128; // horizon
  const sky = ['#2a1e4a', '#47285a', '#6e3460', '#9a4260', '#c85a58', '#e8784e', '#f49a50', '#fcc068'];
  for (let i = 0; i < sky.length; i++) {
    const y0 = Math.floor((hz * i) / sky.length);
    const y1 = Math.floor((hz * (i + 1)) / sky.length);
    rect(x, 0, y0, W, y1 - y0, sky[i]);
    if (i > 0) for (let px = 0; px < W; px += 2) rect(x, px + (i & 1), y0, 1, 1, sky[i - 1]);
  }
  // stars appearing up top
  for (let i = 0; i < 18; i++) if (hash(i * 9) * 1 < 0.8 && (t * 2 + i) % 5 > 0.4) rect(x, hash(i) * W, hash(i + 40) * 40, 1, 1, '#fff4d8');
  // sun sinking into the sea
  const sunY = hz + 4 - Math.min(1, k) * 6;
  disc(x, W / 2, sunY, 17, '#ffd890');
  disc(x, W / 2, sunY, 14, '#fff0b8');
  disc(x, W / 2, sunY, 11, '#fffbe4');
  // clouds catching the light
  for (const [cx, cy, w] of [[30, 60, 40], [150, 44, 50], [96, 86, 34]] as const) {
    rect(x, cx - w / 2, cy, w, 3, '#f0889a');
    rect(x, cx - w / 2 + 6, cy - 2, w - 14, 2, '#f8a8a8');
    rect(x, cx - w / 2 + 3, cy + 3, w - 6, 1, '#b85a7a');
  }
  // the sea
  const sea = ['#5a2e5a', '#4a2a58', '#3a2652', '#2c2248', '#221c3e'];
  for (let y = hz; y < 196; y++) {
    const i = Math.min(sea.length - 1, Math.floor((y - hz) / 14));
    rect(x, 0, y, W, 1, sea[i]);
    // shimmer lines
    const off = Math.sin(y * 0.7 + t * 2) * 6;
    for (let px = (y * 13) % 17; px < W; px += 17) rect(x, px + off, y, 5, 1, sea[Math.max(0, i - 1)]);
    // the sun's path on the water
    const pw = 4 + (y - hz) * 0.35;
    for (let px = -pw; px < pw; px += 2) if ((Math.floor(px + y * 3 + t * 8) & 3) === 0) rect(x, W / 2 + px + Math.sin(y + t * 3) * 2, y, 2, 1, (y + Math.floor(t * 5)) % 3 ? '#ffd890' : '#fff4c8');
  }
  // gentle waves rolling in
  for (let k2 = 0; k2 < 3; k2++) {
    const wy = 176 + k2 * 6 + Math.sin(t * 1.5 + k2) * 1.5;
    for (let px = 0; px < W; px++) if (Math.sin(px * 0.2 + t * 2 + k2 * 2) > 0.2) rect(x, px, wy, 1, 1, '#f0b8c0');
  }
  // the beach
  for (let y = 196; y < H; y++) rect(x, 0, y, W, 1, y < 200 ? '#c88a78' : y < 214 ? '#a8705e' : '#8a5a4e');
  for (let i = 0; i < 40; i++) rect(x, hash(i * 3) * W, 200 + hash(i * 5) * 40, 1, 1, '#c89480');
  // the two of you sitting on your tubes, watching it go down (backlit)
  // backlit: draw them on a scratch layer, then darken toward the sun's color, with a rim light
  const layer = scratch(W, 60);
  const lx = layer.getContext('2d')!;
  lx.imageSmoothingEnabled = false;
  lx.clearRect(0, 0, W, 60);
  const sit = (p: Person, px: number, tubeC: string) => {
    ellipse(lx, px + 7, 36, 13, 5, INK);
    ellipse(lx, px + 7, 35, 12, 4, shade(tubeC, 0.6));
    drawPerson(lx, { ...p, holds: undefined }, px, 10, 0, false, { shadow: false, clipY: 24 });
    // the front of the tube hides the legs
    for (let j = 0; j <= 5; j++) {
      const w = Math.round(13 * Math.sqrt(Math.max(0, 1 - (j / 5.3) ** 2)));
      rect(lx, px + 7 - w, 36 + j, w * 2, 1, j === 5 ? INK : shade(tubeC, j < 2 ? 0.95 : 0.7));
    }
    rect(lx, px - 5, 36, 24, 1, shade(tubeC, 1.15));
  };
  sit(me, 70, '#e0503c');
  sit(rae, 110, '#ef7fae');
  lx.globalCompositeOperation = 'source-atop';
  lx.fillStyle = 'rgba(70,30,60,0.45)';
  lx.fillRect(0, 0, W, 60);
  lx.globalCompositeOperation = 'source-over';
  x.drawImage(layer, 0, 186);
  rect(x, 74, 196, 6, 1, '#ffd890');
  rect(x, 114, 196, 6, 1, '#ffd890');
  // a tiny wave, every so often
  if (Math.floor(t * 0.5) % 3 === 1) rect(x, 136, 200 + Math.round(Math.sin(t * 8)), 1, 3, '#f4c0b0');
}


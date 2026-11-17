// HD painting kit: smooth, anti-aliased vector shapes with Gouraud-style gradient
// shading. Everything is drawn in the same 192x108 "logical" coordinates as the
// pixel scenes, on a context that is pre-scaled by S, so layouts carry over 1:1
// while edges, gradients and lights come out smooth at the higher resolution.
import { H, hash, hexOf, mix, rgbOf, shade, W, type Ctx, type RGB } from '../px.ts';

export const S = 3; // HD scale
export const HW = W * S; // 576
export const HH = H * S; // 324
export { H, W, hash, hexOf, mix, shade, rgbOf };
export type { Ctx, RGB };

export const rgba = (hex: string, a: number): string => {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
};
export const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------- canvases & caching ----------
export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
export function ctx2d(c: HTMLCanvasElement): Ctx {
  const x = c.getContext('2d');
  if (!x) throw new Error('2d context unavailable');
  return x;
}

const CACHE = new Map<string, HTMLCanvasElement>();
// A static layer at HD resolution, painted in logical coordinates.
export function cachedHD(key: string, draw: (x: Ctx) => void, w = W, h = H): HTMLCanvasElement {
  let c = CACHE.get(key);
  if (!c) {
    c = canvas(Math.round(w * S), Math.round(h * S));
    const x = c.getContext('2d');
    if (x) {
      x.setTransform(S, 0, 0, S, 0, 0);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      try {
        draw(x);
      } catch (e) {
        console.error(e);
      }
    }
    if (CACHE.size > 160) CACHE.clear();
    CACHE.set(key, c);
  }
  return c;
}
// Blit a cached HD layer onto a (scaled) context at logical position.
export function blit(x: Ctx, c: HTMLCanvasElement, lx = 0, ly = 0): void {
  x.drawImage(c, lx, ly, c.width / S, c.height / S);
}

// ---------- gradients ----------
export function vgrad(x: Ctx, y0: number, y1: number, stops: string[]): CanvasGradient {
  const g = x.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s));
  return g;
}
export function hgrad(x: Ctx, x0: number, x1: number, stops: string[]): CanvasGradient {
  const g = x.createLinearGradient(x0, 0, x1, 0);
  stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s));
  return g;
}
export function lgrad(x: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function rgrad(x: Ctx, cx: number, cy: number, r: number, stops: [number, string][], fx = cx, fy = cy, r0 = 0): CanvasGradient {
  const g = x.createRadialGradient(fx, fy, r0, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
// Classic lit-from-upper-left ramp across a shape.
export function litH(x: Ctx, x0: number, x1: number, base: string, hi = 1.16, lo = 0.7): CanvasGradient {
  return hgrad(x, x0, x1, [shade(base, hi), base, base, shade(base, lo)]);
}
export function litV(x: Ctx, y0: number, y1: number, base: string, hi = 1.14, lo = 0.72): CanvasGradient {
  return vgrad(x, y0, y1, [shade(base, hi), base, shade(base, lo)]);
}

// ---------- shapes ----------
export function rr(x: Ctx, px: number, py: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  x.beginPath();
  x.moveTo(px + k, py);
  x.arcTo(px + w, py, px + w, py + h, k);
  x.arcTo(px + w, py + h, px, py + h, k);
  x.arcTo(px, py + h, px, py, k);
  x.arcTo(px, py, px + w, py, k);
  x.closePath();
}
export function fillRR(x: Ctx, px: number, py: number, w: number, h: number, r: number, fill: string | CanvasGradient): void {
  rr(x, px, py, w, h, r);
  x.fillStyle = fill;
  x.fill();
}
export function box(x: Ctx, px: number, py: number, w: number, h: number, fill: string | CanvasGradient): void {
  x.fillStyle = fill;
  x.fillRect(px, py, w, h);
}
export function ell(x: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0): void {
  x.beginPath();
  x.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  x.fillStyle = fill;
  x.fill();
}
export function poly(x: Ctx, pts: number[], fill: string | CanvasGradient): void {
  x.beginPath();
  x.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  x.closePath();
  x.fillStyle = fill;
  x.fill();
}
export function seg(x: Ctx, x0: number, y0: number, x1: number, y1: number, c: string | CanvasGradient, w = 0.5, cap: CanvasLineCap = 'round'): void {
  x.beginPath();
  x.moveTo(x0, y0);
  x.lineTo(x1, y1);
  x.strokeStyle = c;
  x.lineWidth = w;
  x.lineCap = cap;
  x.stroke();
}
export function strokeRR(x: Ctx, px: number, py: number, w: number, h: number, r: number, c: string, lw = 0.5): void {
  rr(x, px, py, w, h, r);
  x.strokeStyle = c;
  x.lineWidth = lw;
  x.stroke();
}

// A rounded, shaded block: Gouraud-ish ramps on the face, a lit top bevel and a soft
// dark edge. The basic building block for furniture, crates, counters.
export function block(x: Ctx, px: number, py: number, w: number, h: number, c: string, r = 1, opts: { edge?: boolean; top?: number } = {}): void {
  fillRR(x, px, py, w, h, r, lgrad(x, px, py, px + w * 0.35, py + h, [[0, shade(c, 1.14)], [0.55, c], [1, shade(c, 0.78)]]));
  // top bevel highlight
  x.save();
  rr(x, px, py, w, h, r);
  x.clip();
  box(x, px, py, w, Math.min(1.2, h * 0.2), rgba('#ffffff', 0.22));
  box(x, px, py + h - Math.min(1, h * 0.15), w, Math.min(1, h * 0.15), rgba('#000000', 0.16));
  x.restore();
  if (opts.edge !== false) strokeRR(x, px, py, w, h, r, rgba(shade(c, 0.4), 0.55), 0.35);
}
// A box seen slightly from above: a lit top face and a front face.
export function box3(x: Ctx, px: number, py: number, w: number, h: number, depth: number, c: string, r = 0.6): void {
  // top face
  poly(x, [px + depth * 0.5, py - depth, px + w - depth * 0.2, py - depth, px + w, py, px, py], lgrad(x, 0, py - depth, 0, py, [[0, shade(c, 1.28)], [1, shade(c, 1.1)]]));
  block(x, px, py, w, h, c, r);
}

// ---------- light, shadow, glow ----------
// Soft contact / furniture shadow on the floor.
export function softShadow(x: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.4): void {
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  x.fillStyle = rgrad(x, 0, 0, rx, [[0, `rgba(14,8,26,${a})`], [0.55, `rgba(14,8,26,${a * 0.55})`], [1, 'rgba(14,8,26,0)']]);
  x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
}
// A shadow band along the foot of a wall or object.
export function shadowBand(x: Ctx, px: number, py: number, w: number, h: number, a = 0.35, down = true): void {
  x.fillStyle = vgrad(x, py, py + h, down ? [`rgba(14,8,26,${a})`, 'rgba(14,8,26,0)'] : ['rgba(14,8,26,0)', `rgba(14,8,26,${a})`]);
  x.fillRect(px, py, w, h);
}
// Additive glow (lamps, screens, signs).
export function glowHD(x: Ctx, cx: number, cy: number, r: number, c: string, a = 0.5, ry = r): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.translate(cx, cy);
  x.scale(1, ry / r);
  x.fillStyle = rgrad(x, 0, 0, r, [[0, rgba(c, a)], [0.35, rgba(c, a * 0.45)], [1, rgba(c, 0)]]);
  x.fillRect(-r, -r, r * 2, r * 2);
  x.restore();
}
// Light pool on the floor (screen-blended ellipse).
export function lightPool(x: Ctx, cx: number, cy: number, rx: number, ry: number, c: string, a = 0.35): void {
  x.save();
  x.globalCompositeOperation = 'screen';
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  x.fillStyle = rgrad(x, 0, 0, rx, [[0, rgba(c, a)], [0.6, rgba(c, a * 0.4)], [1, rgba(c, 0)]]);
  x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
}
// Downward light cone (lamps, fixtures), soft-edged.
export function coneHD(x: Ctx, cx: number, top: number, bottom: number, w0: number, w1: number, c: string, a = 0.3): void {
  x.save();
  x.globalCompositeOperation = 'screen';
  const g = x.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(1, rgba(c, 0));
  x.beginPath();
  x.moveTo(cx - w0 / 2, top);
  x.lineTo(cx + w0 / 2, top);
  x.lineTo(cx + w1 / 2, bottom);
  x.lineTo(cx - w1 / 2, bottom);
  x.closePath();
  x.fillStyle = g;
  x.fill();
  // brighter core
  x.beginPath();
  x.moveTo(cx - w0 / 4, top);
  x.lineTo(cx + w0 / 4, top);
  x.lineTo(cx + w1 / 4, bottom);
  x.lineTo(cx - w1 / 4, bottom);
  x.closePath();
  x.fillStyle = g;
  x.fill();
  x.restore();
}
// Ambient occlusion in the corners of a room.
export function roomAO(x: Ctx, floorY: number, a = 0.28): void {
  shadowBand(x, 0, 0, W, 10, a, true);
  x.fillStyle = hgrad(x, 0, 14, [`rgba(14,8,26,${a})`, 'rgba(14,8,26,0)']);
  x.fillRect(0, 0, 14, floorY);
  x.fillStyle = hgrad(x, W - 14, W, ['rgba(14,8,26,0)', `rgba(14,8,26,${a})`]);
  x.fillRect(W - 14, 0, 14, floorY);
}
// Depth fog: a horizontal haze band that fades in toward a line (horizon / back wall).
export function fogBand(x: Ctx, y0: number, y1: number, c: string, a = 0.35): void {
  x.fillStyle = vgrad(x, y0, y1, [rgba(c, 0), rgba(c, a), rgba(c, 0)]);
  x.fillRect(0, y0, W, y1 - y0);
}
// Rim light along the top edge of a rounded rect (warm or cool kicker).
export function rimTop(x: Ctx, px: number, py: number, w: number, c: string, a = 0.5): void {
  x.fillStyle = hgrad(x, px, px + w, [rgba(c, 0), rgba(c, a), rgba(c, a), rgba(c, 0)]);
  x.fillRect(px, py, w, 0.6);
}

// ---------- rooms ----------
// A wall with a soft vertical gradient (lighter near the ceiling light, darker low),
// optional pattern, and ambient occlusion where it meets ceiling and corners.
export function wallHD(x: Ctx, base: string, floorY: number, pattern?: (x: Ctx) => void): void {
  x.fillStyle = vgrad(x, 0, floorY, [shade(base, 0.92), shade(base, 1.06), base, shade(base, 0.86)]);
  x.fillRect(0, 0, W, floorY);
  if (pattern) {
    x.save();
    x.beginPath();
    x.rect(0, 0, W, floorY);
    x.clip();
    pattern(x);
    x.restore();
  }
  // big soft light falloff from the center of the room
  x.fillStyle = rgrad(x, W / 2, floorY * 0.35, W * 0.7, [[0, 'rgba(255,250,235,0.10)'], [1, 'rgba(20,10,40,0.16)']]);
  x.fillRect(0, 0, W, floorY);
  roomAO(x, floorY, 0.22);
}
export function baseboardHD(x: Ctx, floorY: number, c: string, h = 4): void {
  x.fillStyle = vgrad(x, floorY - h, floorY, [shade(c, 1.2), c, shade(c, 0.72)]);
  x.fillRect(0, floorY - h, W, h);
  box(x, 0, floorY - h - 0.5, W, 0.5, rgba(shade(c, 0.4), 0.6));
}
export function wainscotHD(x: Ctx, y0: number, y1: number, c: string, groove = 10): void {
  x.fillStyle = vgrad(x, y0, y1, [shade(c, 1.08), c, shade(c, 0.82)]);
  x.fillRect(0, y0, W, y1 - y0);
  for (let i = 4; i < W; i += groove) {
    box(x, i, y0 + 3, 0.6, y1 - y0 - 3, rgba(shade(c, 0.6), 0.5));
    box(x, i + 0.6, y0 + 3, 0.5, y1 - y0 - 3, rgba(shade(c, 1.3), 0.35));
  }
  x.fillStyle = vgrad(x, y0, y0 + 3, [shade(c, 1.3), shade(c, 0.85)]);
  x.fillRect(0, y0, W, 3);
}

// Perspective floor. Planks/tiles are drawn as converging lines from a vanishing point
// above the floor, then shaded darker toward the back and lit toward the camera.
export interface FloorOpts {
  horizon?: number; // vanishing point distance above y0
  sheen?: number;
}
const vpOf = (y0: number, horizon: number): [number, number] => [W / 2, y0 - horizon];
// x on the floor line y for a world column wx at depth s (s=1 at the bottom edge)
export function floorShade(x: Ctx, y0: number, base: string, sheen = 0.18): void {
  x.fillStyle = vgrad(x, y0, H, [shade(base, 0.7), shade(base, 0.92), base, shade(base, 1.04)]);
  x.fillRect(0, y0, W, H - y0);
  if (sheen > 0) {
    x.save();
    x.globalCompositeOperation = 'screen';
    x.translate(W / 2, y0 + (H - y0) * 0.55);
    x.scale(1, 0.22);
    x.fillStyle = rgrad(x, 0, 0, 70, [[0, `rgba(255,248,230,${sheen})`], [1, 'rgba(255,248,230,0)']]);
    x.fillRect(-70, -70, 140, 140);
    x.restore();
  }
}
export function woodFloorHD(x: Ctx, y0: number, base: string, o: FloorOpts = {}): void {
  const horizon = o.horizon ?? 44;
  const [vx, vy] = vpOf(y0, horizon);
  floorShade(x, y0, base, o.sheen ?? 0.2);
  // plank colour variation: thin quads between converging seams
  const n = 26;
  const span = 10;
  for (let k = -n; k <= n; k++) {
    const wx0 = k * span;
    const wx1 = (k + 1) * span;
    const s0 = (y0 - vy) / (H - vy);
    const xa = vx + wx0 * s0;
    const xb = vx + wx1 * s0;
    const xc = vx + wx1;
    const xd = vx + wx0;
    if (Math.max(xb, xc) < -4 || Math.min(xa, xd) > W + 4) continue;
    const v = hash(k * 7 + 3);
    poly(x, [xa, y0, xb, y0, xc, H, xd, H], rgba(v > 0.5 ? '#ffffff' : '#000000', 0.04 + Math.abs(v - 0.5) * 0.08));
    // seam
    seg(x, xa, y0, xd, H, rgba(shade(base, 0.45), 0.55), 0.35, 'butt');
    // board ends at staggered depths
    for (let e = 0; e < 4; e++) {
      const z = 0.08 + ((hash(k * 13 + e * 5) + e) / 4) * 0.92;
      const yy = y0 + (H - y0) * z;
      const s = (yy - vy) / (H - vy);
      seg(x, vx + wx0 * s, yy, vx + wx1 * s, yy, rgba(shade(base, 0.45), 0.45), 0.3, 'butt');
    }
  }
  // grain streaks
  x.save();
  x.globalAlpha = 0.07;
  for (let i = 0; i < 70; i++) {
    const wx = (hash(i * 17) - 0.5) * 260;
    const z0 = hash(i * 29);
    const yy = y0 + (H - y0) * z0;
    const s = (yy - vy) / (H - vy);
    const len = 3 + hash(i * 3) * 8;
    seg(x, vx + wx * s, yy, vx + wx * (s + len / 200), Math.min(H, yy + len * 0.6), shade(base, 0.5), 0.25);
  }
  x.restore();
  shadowBand(x, 0, y0, W, 5, 0.3);
}
export function tileFloorHD(x: Ctx, y0: number, a: string, b: string, size = 14, o: FloorOpts = {}): void {
  const horizon = o.horizon ?? 44;
  const [vx, vy] = vpOf(y0, horizon);
  floorShade(x, y0, mix(a, b, 0.5), o.sheen ?? 0.25);
  // checker quads
  const rowsZ: number[] = [];
  for (let r = 0; r < 40; r++) {
    // depth rows: world z spacing so rows shrink toward the back
    const s = 1 / (1 + r * (1 / 2.2));
    const yy = vy + (H - vy) * s;
    if (yy < y0 - 0.01) {
      rowsZ.push(y0);
      break;
    }
    rowsZ.push(yy);
  }
  for (let r = 0; r < rowsZ.length - 1; r++) {
    const yb = rowsZ[r];
    const yt = rowsZ[r + 1];
    const sb = (yb - vy) / (H - vy);
    const st = (yt - vy) / (H - vy);
    for (let k = -30; k <= 30; k++) {
      const wx0 = k * size;
      const wx1 = (k + 1) * size;
      if (vx + wx1 * sb < -2 || vx + wx0 * sb > W + 2) continue;
      if (((k + r) & 1) === 0) continue;
      poly(x, [vx + wx0 * st, yt, vx + wx1 * st, yt, vx + wx1 * sb, yb, vx + wx0 * sb, yb], rgba(b === a ? '#000000' : shade(b, 0.9), b === a ? 0.06 : 0.55));
    }
    seg(x, 0, yt, W, yt, rgba(shade(b, 0.6), 0.5), 0.25, 'butt');
  }
  for (let k = -30; k <= 30; k++) {
    const wx = k * size;
    const s0 = (y0 - vy) / (H - vy);
    if (vx + wx < -60 || vx + wx > W + 60) continue;
    seg(x, vx + wx * s0, y0, vx + wx, H, rgba(shade(b, 0.6), 0.5), 0.25, 'butt');
  }
  // reflections: glossy tiles
  x.save();
  x.globalCompositeOperation = 'screen';
  x.fillStyle = vgrad(x, y0, H, ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']);
  x.fillRect(0, y0, W, H - y0);
  x.restore();
  shadowBand(x, 0, y0, W, 5, 0.28);
}
export function concreteHD(x: Ctx, y0: number, a: string, o: FloorOpts & { joint?: number } = {}): void {
  const horizon = o.horizon ?? 44;
  const [vx, vy] = vpOf(y0, horizon);
  floorShade(x, y0, a, o.sheen ?? 0.12);
  // mottling
  x.save();
  for (let i = 0; i < 60; i++) {
    const cx = hash(i * 11) * W;
    const cy = y0 + hash(i * 23) * (H - y0);
    const r = 3 + hash(i * 5) * 9;
    ell(x, cx, cy, r, r * 0.3, rgba(hash(i) > 0.5 ? '#ffffff' : '#000000', 0.035));
  }
  x.restore();
  const j = o.joint ?? 40;
  for (let k = -8; k <= 8; k++) {
    const s0 = (y0 - vy) / (H - vy);
    seg(x, vx + k * j * s0, y0, vx + k * j, H, rgba(shade(a, 0.55), 0.5), 0.3, 'butt');
  }
  for (let r = 1; r < 6; r++) {
    const s = 1 / (1 + r * 0.7);
    const yy = vy + (H - vy) * s;
    if (yy > y0) seg(x, 0, yy, W, yy, rgba(shade(a, 0.55), 0.45), 0.3, 'butt');
  }
  shadowBand(x, 0, y0, W, 4, 0.25);
}
export function carpetHD(x: Ctx, y0: number, a: string, b: string): void {
  floorShade(x, y0, a, 0.08);
  x.save();
  x.globalAlpha = 0.25;
  const [vx, vy] = vpOf(y0, 44);
  for (let k = -20; k <= 20; k += 2) {
    const s0 = (y0 - vy) / (H - vy);
    poly(x, [vx + k * 8 * s0, y0, vx + (k + 1) * 8 * s0, y0, vx + (k + 1) * 8, H, vx + k * 8, H], b);
  }
  x.restore();
  shadowBand(x, 0, y0, W, 4, 0.25);
}

// ---------- outdoor ----------
export function skyHD(x: Ctx, y0: number, y1: number, stops: string[]): void {
  x.fillStyle = vgrad(x, y0, y1, stops);
  x.fillRect(0, y0, W, y1 - y0);
}
export function cloudHD(x: Ctx, cx: number, cy: number, w: number, c = '#ffffff', sh = '#c8d8ec'): void {
  const puffs = [
    [-0.32, 0.1, 0.24],
    [-0.1, -0.12, 0.3],
    [0.16, -0.05, 0.26],
    [0.36, 0.12, 0.18],
    [0.0, 0.16, 0.3],
  ];
  for (const [dx, dy, r] of puffs) ell(x, cx + dx * w, cy + dy * w * 0.6 + w * 0.06, r * w, r * w * 0.7, rgba(sh, 0.9));
  for (const [dx, dy, r] of puffs) ell(x, cx + dx * w, cy + dy * w * 0.6, r * w * 0.95, r * w * 0.66, rgrad(x, cx + dx * w - r * w * 0.3, cy + dy * w * 0.6 - r * w * 0.3, r * w * 1.3, [[0, c], [0.7, c], [1, sh]]));
}
export function treeHD(x: Ctx, cx: number, base: number, h: number, t = 0, leaf = '#3c8a3a', sway = 0.6): void {
  softShadow(x, cx, base, h * 0.45, h * 0.08, 0.35);
  fillRR(x, cx - h * 0.06, base - h * 0.55, h * 0.12, h * 0.55, h * 0.03, litH(x, cx - h * 0.06, cx + h * 0.06, '#6a4a2e'));
  const s = Math.sin(t * 1.3 + cx) * sway;
  const blobs = [
    [0, -0.78, 0.34],
    [-0.22, -0.62, 0.26],
    [0.22, -0.6, 0.27],
    [-0.1, -0.95, 0.24],
    [0.14, -0.9, 0.22],
  ];
  for (const [dx, dy, r] of blobs) {
    const bx = cx + dx * h + s * (1 + dy);
    const by = base + dy * h;
    ell(x, bx, by, r * h, r * h * 0.92, rgrad(x, bx - r * h * 0.4, by - r * h * 0.45, r * h * 1.5, [[0, shade(leaf, 1.35)], [0.45, leaf], [1, shade(leaf, 0.55)]]));
  }
}

// ---------- props ----------
export function windowHD(x: Ctx, px: number, py: number, w: number, h: number, frame = '#ece4d4', mullion = true): void {
  // frame with depth
  fillRR(x, px - 2, py - 2, w + 4, h + 4, 0.8, litV(x, py - 2, py + h + 2, frame));
  box(x, px - 0.6, py - 0.6, w + 1.2, h + 1.2, rgba(shade(frame, 0.5), 0.6));
  if (mullion) {
    box(x, px + w / 2 - 0.8, py, 1.6, h, litH(x, px + w / 2 - 0.8, px + w / 2 + 0.8, frame));
    box(x, px, py + h / 2 - 0.8, w, 1.6, litV(x, py + h / 2 - 0.8, py + h / 2 + 0.8, frame));
  }
  // sill
  fillRR(x, px - 4, py + h + 1.5, w + 8, 2.4, 0.6, litV(x, py + h + 1.5, py + h + 3.9, frame));
  shadowBand(x, px - 4, py + h + 3.9, w + 8, 3, 0.25);
}
// The glass of a window: sky, scenery, a reflection streak. Drawn per frame.
export function glassHD(x: Ctx, px: number, py: number, w: number, h: number, sky: string[], scenery?: (x: Ctx) => void): void {
  x.save();
  x.beginPath();
  x.rect(px, py, w, h);
  x.clip();
  x.fillStyle = vgrad(x, py, py + h, sky);
  x.fillRect(px, py, w, h);
  scenery?.(x);
  // glass reflection
  x.globalCompositeOperation = 'screen';
  poly(x, [px + w * 0.15, py, px + w * 0.32, py, px + w * 0.05, py + h, px - w * 0.12, py + h], 'rgba(255,255,255,0.12)');
  poly(x, [px + w * 0.4, py, px + w * 0.46, py, px + w * 0.19, py + h, px + w * 0.13, py + h], 'rgba(255,255,255,0.08)');
  x.restore();
}
export function curtainsHD(x: Ctx, px: number, py: number, w: number, h: number, c: string): void {
  for (const side of [0, 1]) {
    const cx = side ? px + w + 1 : px - 6;
    const cw = 7;
    x.fillStyle = hgrad(x, cx, cx + cw, [shade(c, 0.7), shade(c, 1.15), c, shade(c, 0.6), shade(c, 1.05), shade(c, 0.75)]);
    x.beginPath();
    x.moveTo(cx, py - 3);
    x.lineTo(cx + cw, py - 3);
    x.quadraticCurveTo(cx + cw - (side ? -1 : 2), py + h * 0.6, cx + cw + (side ? -2 : 1), py + h + 6);
    x.lineTo(cx + (side ? 1 : -1), py + h + 6);
    x.closePath();
    x.fill();
  }
  fillRR(x, px - 8, py - 4.5, w + 16, 1.6, 0.8, litV(x, py - 4.5, py - 2.9, '#8a6a4a'));
}
export function frameArt(x: Ctx, px: number, py: number, w: number, h: number, frame: string, art: (x: Ctx) => void): void {
  softShadow(x, px + w / 2 + 1.5, py + h / 2 + 2, w * 0.6, h * 0.6, 0.25);
  fillRR(x, px, py, w, h, 0.6, lgrad(x, px, py, px + w, py + h, [[0, shade(frame, 1.25)], [1, shade(frame, 0.7)]]));
  x.save();
  x.beginPath();
  x.rect(px + 1.5, py + 1.5, w - 3, h - 3);
  x.clip();
  art(x);
  x.fillStyle = lgrad(x, px, py, px + w, py + h, [[0, 'rgba(255,255,255,0.18)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,0.12)']]);
  x.fillRect(px, py, w, h);
  x.restore();
}
export function plantHD(x: Ctx, px: number, py: number, big = false, t = 0): void {
  const s = big ? 1.4 : 1;
  const cx = px + 6 * s;
  const base = py + 26 * s;
  softShadow(x, cx, base, 7 * s, 1.6 * s, 0.35);
  // pot
  x.beginPath();
  x.moveTo(cx - 5 * s, base - 9 * s);
  x.lineTo(cx + 5 * s, base - 9 * s);
  x.lineTo(cx + 3.8 * s, base);
  x.lineTo(cx - 3.8 * s, base);
  x.closePath();
  x.fillStyle = litH(x, cx - 5 * s, cx + 5 * s, '#c0623a');
  x.fill();
  fillRR(x, cx - 5.6 * s, base - 10 * s, 11.2 * s, 2 * s, 0.6, litV(x, base - 10 * s, base - 8 * s, '#d8784a'));
  // leaves
  const n = big ? 9 : 7;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.3 + Math.sin(t * 0.9 + i) * 0.04;
    const len = (9 + hash(i * 7) * 7) * s;
    const ex = cx + Math.cos(a) * len;
    const ey = base - 10 * s + Math.sin(a) * len;
    x.beginPath();
    x.moveTo(cx, base - 10 * s);
    x.quadraticCurveTo(cx + Math.cos(a - 0.5) * len * 0.6, base - 10 * s + Math.sin(a - 0.5) * len * 0.6, ex, ey);
    x.quadraticCurveTo(cx + Math.cos(a + 0.5) * len * 0.6, base - 10 * s + Math.sin(a + 0.5) * len * 0.6, cx, base - 10 * s);
    x.fillStyle = lgrad(x, cx, base - 10 * s, ex, ey, [[0, '#2a6a32'], [0.6, i % 2 ? '#4caa4a' : '#3c9440'], [1, '#7ad06a']]);
    x.fill();
  }
}
// Simple glossy screen (monitor, TV, laptop) with a glow.
export function screenHD(x: Ctx, px: number, py: number, w: number, h: number, c: string, bezel = '#2a2a33'): void {
  fillRR(x, px - 1, py - 1, w + 2, h + 2, 0.8, litV(x, py - 1, py + h + 1, bezel, 1.3, 0.7));
  fillRR(x, px, py, w, h, 0.4, vgrad(x, py, py + h, [shade(c, 1.15), c, shade(c, 0.8)]));
  x.save();
  rr(x, px, py, w, h, 0.4);
  x.clip();
  poly(x, [px, py, px + w * 0.5, py, px + w * 0.2, py + h, px, py + h], 'rgba(255,255,255,0.08)');
  x.restore();
}

// Sign text: a clean rounded font, centered or left aligned, with a soft emboss.
export function signText(x: Ctx, s: string, cx: number, cy: number, size: number, c: string, align: CanvasTextAlign = 'center', weight = 700): void {
  x.save();
  x.font = `${weight} ${size}px "Trebuchet MS", "Segoe UI", Verdana, sans-serif`;
  x.textAlign = align;
  x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillText(s, cx + size * 0.05, cy + size * 0.07);
  x.fillStyle = c;
  x.fillText(s, cx, cy);
  x.restore();
}
export function signHD(x: Ctx, label: string, cx: number, cy: number, w: number, h: number, bg: string, fg: string, glow = false): void {
  softShadow(x, cx + 1, cy + 2, w * 0.55, h * 0.7, 0.25);
  fillRR(x, cx - w / 2, cy - h / 2, w, h, Math.min(1.5, h / 3), litV(x, cy - h / 2, cy + h / 2, bg, 1.25, 0.75));
  strokeRR(x, cx - w / 2 + 0.6, cy - h / 2 + 0.6, w - 1.2, h - 1.2, Math.min(1.2, h / 3), rgba(shade(bg, 1.6), 0.4), 0.3);
  signText(x, label, cx, cy + h * 0.04, h * 0.62, fg);
  if (glow) glowHD(x, cx, cy, w * 0.6, fg, 0.18, h * 1.4);
}

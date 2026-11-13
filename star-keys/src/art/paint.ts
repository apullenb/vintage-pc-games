// Buffer painting primitives shared by backgrounds and icons.
import { bayer, Buf, dramp, fbm, hash2, hex, mix, ramp, shade, type RGB } from './px.ts';

// Banded, ordered-dithered vertical gradient over rows y0..y1.
export function skyGrad(b: Buf, stops: readonly RGB[], bands: number, y0 = 0, y1 = b.h): void {
  for (let y = 0; y < b.h; y++) {
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    for (let x = 0; x < b.w; x++) {
      const k = Math.min(bands, Math.max(0, Math.floor(t * bands + bayer(x, y))));
      b.set(x, y, ramp(stops, k / bands));
    }
  }
}

// Starfield: mostly 1px, some crosses; fades below yFade.
export function stars(b: Buf, rnd: () => number, n: number, yMax = b.h, tint: readonly RGB[] = [hex('#ffffff'), hex('#cfe0ff'), hex('#ffe9c8')]): void {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * b.w), y = Math.floor(rnd() * yMax);
    const fade = Math.max(0.15, 1 - (y / yMax) * 0.8);
    const r = rnd();
    const c = tint[Math.floor(rnd() * tint.length)];
    if (r < 0.04) {
      b.blend(x, y, c, fade);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.blend(x + dx, y + dy, c, fade * 0.55);
      if (r < 0.012) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) b.blend(x + dx, y + dy, c, fade * 0.25);
    } else if (r < 0.25) b.blend(x, y, c, fade * 0.85);
    else b.blend(x, y, c, fade * (0.25 + rnd() * 0.35));
  }
}

// Rolling ridge: top y per column.
export function ridge(w: number, base: number, amp: number, rnd: () => number, freq = 1): number[] {
  const waves = [0, 1, 2].map((i) => ({ f: (0.004 + rnd() * 0.006) * (i + 1) * freq, p: rnd() * 100, a: amp / (i + 1) }));
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    let y = base;
    for (const v of waves) y -= Math.sin(x * v.f + v.p) * v.a;
    out.push(Math.round(y));
  }
  return out;
}

// Jagged peaks: max of random triangles over a base line.
export function peaks(w: number, base: number, rnd: () => number, spacing: number, hMin: number, hMax: number, steep = 1): number[] {
  const out = new Array<number>(w).fill(base);
  for (let x0 = -spacing; x0 < w + spacing; x0 += spacing * (0.5 + rnd())) {
    const h = hMin + rnd() * (hMax - hMin);
    const half = (h / steep) * (0.7 + rnd() * 0.6);
    const skew = 0.6 + rnd() * 0.8;
    for (let x = Math.floor(x0 - half * skew); x <= x0 + half; x++) {
      if (x < 0 || x >= w) continue;
      const d = x < x0 ? (x0 - x) / (half * skew) : (x - x0) / half;
      const y = base - h * (1 - d) + (hash2(x, 3, x0 | 0) - 0.5) * 2;
      if (y < out[x]) out[x] = Math.round(y);
    }
  }
  // ruggedise
  const sd = Math.floor(rnd() * 1000);
  for (let x = 0; x < w; x++) if (out[x] < base) out[x] = Math.min(base, Math.round(out[x] + (fbm(x, 0, 14, sd, 3) - 0.5) * 12 * steep));
  return out;
}

// fbm mountain range profile.
export function mountains(w: number, base: number, h: number, seed: number, scale = 90): number[] {
  const out: number[] = [];
  for (let x = 0; x < w; x++) {
    const n = fbm(x, 0, scale, seed, 5);
    const ridged = 1 - Math.abs(fbm(x, 5, scale * 0.6, seed + 3, 4) - 0.5) * 2;
    out.push(Math.round(base - h * Math.max(0, n * 0.7 + ridged * 0.5 - 0.35) * 1.6));
  }
  return out;
}

// Terrain fill with light from the left (-1) or right (+1): lit faces, shadow faces, rim line.
export function terrain(b: Buf, tops: number[], cols: { lit: RGB; body: RGB; dark: RGB; rim: RGB }, light: number, seed: number, tex = 0.05, bottom = b.h): void {
  for (let x = 0; x < b.w; x++) {
    const sl = (tops[Math.min(b.w - 1, x + 2)] - tops[Math.max(0, x - 2)]) * light;
    for (let y = Math.max(0, tops[x]); y < bottom; y++) {
      const dy = y - tops[x];
      let c = dy === 0 ? cols.rim : sl > 1.2 ? cols.lit : sl < -1.2 ? cols.dark : cols.body;
      if (dy > 0 && dy < 3 && sl > 0.6) c = mix(c, cols.lit, 0.5);
      if (dy > 0 && hash2(x, y, seed) < tex) c = shade(c, 0.88);
      b.set(x, y, c);
    }
  }
}

// Sphere: fn gets unit normal (nx, ny, nz) and pixel coords; return null to skip.
export function sphere(b: Buf, cx: number, cy: number, r: number, fn: (nx: number, ny: number, nz: number, x: number, y: number) => RGB | null): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const c = fn(nx, ny, Math.sqrt(1 - d), x, y);
      if (c) b.set(x, y, c);
    }
}

// Lambert light step through a dark->light ramp, dithered.
export function lambert(nx: number, ny: number, nz: number, L: [number, number, number], pal: readonly RGB[], x: number, y: number, amb = 0.08): RGB {
  const l = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  return dramp(pal, Math.min(1, amb + l * (1 - amb)), x, y);
}

// Irregular shaded rock with craters; pal dark->light; light dir (lx, ly).
export function rock(b: Buf, cx: number, cy: number, r: number, rnd: () => number, pal: readonly RGB[], lx: number, ly: number, outline?: RGB): void {
  const k = [rnd() * 6, rnd() * 6, rnd() * 6];
  const rad = (a: number) => r * (0.78 + 0.13 * Math.sin(a * 2 + k[0]) + 0.08 * Math.sin(a * 3 + k[1]) + 0.05 * Math.sin(a * 5 + k[2]));
  const cr: [number, number, number][] = [];
  const nc = r > 6 ? 1 + Math.floor(rnd() * 3) : 0;
  for (let i = 0; i < nc; i++) cr.push([cx + (rnd() - 0.5) * r, cy + (rnd() - 0.5) * r, 1 + rnd() * r * 0.25]);
  const R = Math.ceil(r) + 1;
  const inside = (x: number, y: number) => {
    const dx = x - cx, dy = y - cy;
    return Math.hypot(dx, dy) <= rad(Math.atan2(dy, dx));
  };
  for (let y = Math.floor(cy - R); y <= cy + R; y++)
    for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const nx = (x - cx) / r, ny = (y - cy) / r;
      let l = 0.5 + (nx * lx + ny * ly) * 0.75 + (fbm(x, y, 5, 7) - 0.5) * 0.3;
      for (const [qx, qy, qr] of cr) {
        const d = Math.hypot(x - qx, y - qy);
        if (d < qr) l = 0.5 - ((x - qx) * lx + (y - qy) * ly) / qr * 0.45;
        else if (d < qr + 1) l += 0.15;
      }
      b.set(x, y, dramp(pal, l, x, y));
    }
  if (outline)
    for (let y = Math.floor(cy - R - 1); y <= cy + R + 1; y++)
      for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
        if (inside(x + 0.5, y + 0.5)) continue;
        if (inside(x + 1.5, y + 0.5) || inside(x - 0.5, y + 0.5) || inside(x + 0.5, y + 1.5) || inside(x + 0.5, y - 0.5)) b.set(x, y, outline);
      }
}

// fbm cloud field dithered into alpha; colour by density ramp.
export function nebula(b: Buf, cols: readonly RGB[], seed: number, scale: number, thresh: number, maxA: number, mask?: (x: number, y: number) => number): void {
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      let n = fbm(x, y, scale, seed, 4);
      if (mask) n *= mask(x, y);
      const d = (n - thresh) / (1 - thresh);
      if (d <= 0) continue;
      const a = Math.min(1, d * 2.2) * maxA;
      if (bayer(x, y) > a * 1.6) continue;
      b.blend(x, y, ramp(cols, Math.min(1, d * 1.6)), Math.min(1, a + 0.25));
    }
}

// Horizontal dithered haze band (alpha peaks at yc).
export function haze(b: Buf, c: RGB, yc: number, half: number, a: number): void {
  for (let y = Math.max(0, Math.floor(yc - half)); y < Math.min(b.h, yc + half); y++) {
    const k = (1 - Math.abs(y - yc) / half) * a;
    for (let x = 0; x < b.w; x++) if (bayer(x, y) < k) b.blend(x, y, c, 0.5);
  }
}

// Vertical fade to colour toward the bottom (alpha 0 at y0, a at y1).
export function fadeDown(b: Buf, c: RGB, y0: number, y1: number, a: number): void {
  for (let y = Math.max(0, y0); y < b.h; y++) {
    const k = Math.min(1, (y - y0) / (y1 - y0)) * a;
    for (let x = 0; x < b.w; x++) if (b.alpha(x, y) && bayer(x, y) < k) b.tint(x, y, c, 0.5);
  }
}

// Soft circular glow + disc for suns.
export function sun(b: Buf, cx: number, cy: number, r: number, core: RGB, edge: RGB, glow: RGB, glowR: number): void {
  b.glow(cx, cy, glowR, glow, 0.9);
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d <= r) b.set(cx + x, cy + y, d > r - 1.2 ? edge : mix(core, edge, Math.max(0, (d - r * 0.5) / (r * 0.5)) * 0.6));
    }
}

// Lattice tower (gantry) with cross-bracing.
export function truss(b: Buf, x: number, top: number, w: number, bottom: number, c: RGB, hi: RGB): void {
  for (let y = top; y < bottom; y++) {
    b.set(x, y, c);
    b.set(x + w - 1, y, hi);
  }
  const step = w;
  for (let y = top; y + step <= bottom; y += step) {
    for (let i = 0; i < w; i++) b.set(x + i, y, c);
    for (let i = 0; i < step; i++) {
      b.set(x + Math.round((i * (w - 1)) / step), y + i, c);
      b.set(x + w - 1 - Math.round((i * (w - 1)) / step), y + i, c);
    }
  }
}

// Ice/crystal spire: faceted triangle, lit side vs shade side.
export function spire(b: Buf, x: number, base: number, h: number, w: number, lit: RGB, mid: RGB, dark: RGB, edge: RGB, lean = 0): void {
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const half = Math.max(0, Math.round((w / 2) * t));
    const cx = Math.round(x + lean * (1 - t) * h * 0.3);
    const py = base - h + y;
    for (let dx = -half; dx <= half; dx++) {
      const c = dx === -half || dx === half ? edge : dx < 0 ? lit : dx < Math.ceil(half * 0.4) ? mid : dark;
      b.set(cx + dx, py, c);
    }
  }
}

export const H = hex;
export { shade, mix };

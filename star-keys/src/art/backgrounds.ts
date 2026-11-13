// Parallax world backgrounds: sky (factor 0) + 3 scrolling layers per theme.
import { VIEW_H, VIEW_W, type ParallaxLayer, type Theme } from '../types.ts';
import { bayer, Buf, dramp, fbm, hex, hexes, mix, mulberry32, ramp, shade, strSeed, valueNoise, type RGB } from './px.ts';
import { haze, lambert, mountains, nebula, peaks, ridge, rock, skyGrad, sphere, spire, stars, sun, terrain, truss } from './paint.ts';

type R = () => number;
interface Ctx { ww: number; seed: number }
type Painter = (b: Buf, rnd: R, s: number) => void;
interface ThemeDef { sky: Painter; layers: [number, Painter][] }

const F1 = 0.12, F2 = 0.32, F3 = 0.6;

// ---------- shared bits ----------
function windowsGlow(b: Buf, x: number, y: number, w: number, h: number, rnd: R, lit: RGB, p: number): void {
  for (let j = y + 2; j < y + h - 1; j += 3)
    for (let i = x + 1; i < x + w - 1; i += 2) if (rnd() < p) b.set(i, j, lit);
}

function lightCone(b: Buf, x: number, y: number, len: number, spread: number, c: RGB, a: number): void {
  for (let d = 0; d < len; d++) {
    const half = d * spread;
    for (let i = -half; i <= half; i++) {
      const k = (1 - d / len) * a * (1 - Math.abs(i) / (half + 1));
      if (bayer(x + i, y + d) < k) b.blend(x + i, y + d, c, 0.35);
    }
  }
}

function crater(b: Buf, cx: number, cy: number, rx: number, ry: number, rim: RGB, bowl: RGB, shadow: RGB): void {
  for (let y = -ry - 1; y <= ry; y++)
    for (let x = -rx - 1; x <= rx + 1; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d > 1.25 || b.alpha(cx + x, cy + y) === 0) continue;
      if (d > 1) { if (y < 0) b.set(cx + x, cy + y, rim); continue; }
      b.set(cx + x, cy + y, x < -rx * 0.2 && y < ry * 0.3 ? shadow : bowl);
    }
}

// Aurora curtains: bright lower hem, rays fading upward.
function aurora(b: Buf, seed: number, cols: readonly RGB[], y0: number, y1: number): void {
  for (let c = 0; c < 2; c++) {
    for (let x = 0; x < b.w; x++) {
      const hem = y0 + c * 30 + Math.sin(x * 0.012 + c * 2 + seed) * 22 + (fbm(x, c * 9, 60, seed + c, 2) - 0.5) * 40;
      const str = Math.max(0, fbm(x, 3 + c, 70, seed + 5 + c, 2) - 0.38) * 2.4;
      if (str <= 0) continue;
      const ray = 0.55 + 0.45 * fbm(x, 0, 3, seed + 9 + c, 2);
      const len = (y1 - y0) * 0.5 * (0.6 + str);
      for (let y = Math.floor(hem - len); y <= hem + 2 && y < b.h; y++) {
        if (y < 0) continue;
        const t = (hem - y) / len; // 0 at hem, 1 at top
        const a = str * ray * (y > hem ? 0.5 : t < 0.08 ? 1 : (1 - t) ** 1.6) * 0.8;
        if (bayer(x, y) < a) b.blend(x, y, ramp(cols, Math.max(0, t)), y > hem - 2 ? 0.8 : 0.5);
      }
    }
  }
}

// ---------- themes ----------
const DEFS: Record<Theme, ThemeDef> = {
  launchpad: {
    sky(b, rnd) {
      skyGrad(b, hexes('#16173f', '#2e2464', '#5e3279', '#a74a7d', '#e66d6f', '#fb9f6a', '#ffd38a'), 14, 0, 225);
      stars(b, rnd, 140, 110);
      sun(b, 352, 222, 20, hex('#fffbe6'), hex('#ffd780'), hex('#ffcf8a'), 70);
      // thin lit cloud streaks
      for (let i = 0; i < 9; i++) {
        const y = 120 + rnd() * 80, x = rnd() * b.w, len = 40 + rnd() * 120;
        for (let k = 0; k < len; k++) {
          const th = 1 + (k > len * 0.2 && k < len * 0.8 ? 1 : 0);
          for (let j = 0; j < th; j++) b.blend(x + k, y + j, j ? hex('#c45a7a') : hex('#ffb38a'), 0.7);
        }
      }
      for (let x = 0; x < b.w; x++) for (let y = 226; y < b.h; y++) b.set(x, y, mix(hex('#3a2350'), hex('#1d1430'), (y - 226) / 44));
    },
    layers: [
      [F1, (b, rnd) => {
        // distant hills + city skyline
        const hills = ridge(b.w, 222, 6, rnd);
        terrain(b, hills, { lit: hex('#7d4677'), body: hex('#6c3c6a'), dark: hex('#5c3360'), rim: hex('#9a5680') }, 1, 1, 0);
        let x = 0;
        while (x < b.w) {
          const w = 6 + Math.floor(rnd() * 14), h = 8 + Math.floor(rnd() * (rnd() < 0.15 ? 46 : 22));
          if (rnd() < 0.25) { x += w; continue; }
          const top = 224 - h;
          for (let j = top; j < b.h; j++) for (let i = x; i < x + w; i++) b.set(i, j, j === top ? hex('#6a3d6e') : hex('#4b2c5a'));
          windowsGlow(b, x, top, w, h, rnd, hex('#ffcf7a'), 0.22);
          if (h > 34) { b.set(x + (w >> 1), top - 1, hex('#4b2c5a')); b.set(x + (w >> 1), top - 2, hex('#ff5a5a')); }
          x += w + Math.floor(rnd() * 3);
        }
        haze(b, hex('#f08a7a'), 222, 10, 0.35);
      }],
      [F2, (b, rnd) => {
        const G = hex('#2b1c3f'), Gh = hex('#d7697a');
        for (let y = 236; y < b.h; y++) for (let x = 0; x < b.w; x++) b.set(x, y, y === 236 ? hex('#4a2c55') : G);
        for (let x = 30 + rnd() * 60; x < b.w; x += 110 + rnd() * 140) {
          const h = 80 + rnd() * 80, w = 8 + Math.floor(rnd() * 3) * 2, top = Math.round(236 - h);
          truss(b, Math.round(x), top, w, 236, G, Gh);
          // service arms + beacon
          for (let k = 0; k < 3; k++) {
            const ay = top + 14 + k * 26;
            if (ay > 226) break;
            for (let i = 0; i < 12; i++) { b.set(x + w + i, ay, G); if (i % 3 === 0) b.set(x + w + i, ay + 1, G); }
          }
          for (let i = -2; i < w + 2; i++) b.set(x + i, top, G);
          b.set(x + w / 2, top - 1, G); b.set(x + w / 2, top - 2, G);
          b.set(x + w / 2, top - 3, hex('#ff4a4a')); b.glow(x + w / 2, top - 3, 4, hex('#ff6a5a'), 0.6);
        }
        // a far rocket on its pad
        const rx = Math.round(b.w * 0.55);
        for (let y = 0; y < 44; y++) {
          const half = y < 10 ? Math.round(y * 0.45) : 5;
          for (let i = -half; i <= half; i++) b.set(rx + i, 192 + y, i > 2 ? Gh : G);
        }
        for (let i = -9; i <= 9; i++) b.set(rx + i, 236 - (Math.abs(i) > 6 ? 0 : 8 - Math.abs(i)) + 0, G);
        // water tower
        const wx = Math.round(b.w * 0.25);
        for (let y = 200; y < 236; y++) { b.set(wx - 6, y, G); b.set(wx + 6, y, G); }
        for (let y = 186; y < 202; y++) for (let i = -8; i <= 8; i++) b.set(wx + i, y, i > 5 ? Gh : G);
      }],
      [F3, (b, rnd) => {
        const D = hex('#170f24'), Dh = hex('#7a3a5e');
        for (let y = 252; y < b.h; y++) for (let x = 0; x < b.w; x++) b.set(x, y, y === 252 ? hex('#3a2244') : D);
        for (let x = rnd() * 80; x < b.w; x += 150 + rnd() * 200) {
          const kind = rnd();
          if (kind < 0.4) {
            // spherical fuel tank on legs
            const cx = Math.round(x), cy = 222, r = 16;
            for (let y = cy; y < 252; y++) { b.set(cx - 10, y, D); b.set(cx + 10, y, D); }
            sphereFlat(b, cx, cy, r, D, Dh);
            b.set(cx - 3, cy - 10, hex('#ffd38a'));
          } else if (kind < 0.75) {
            // floodlight pole + cone
            const px = Math.round(x);
            for (let y = 150; y < 252; y++) b.set(px, y, D);
            for (let i = -5; i <= 5; i++) { b.set(px + i, 150, D); b.set(px + i, 151, D); }
            for (let i = -4; i <= 4; i += 2) b.set(px + i, 152, hex('#fff2c0'));
            lightCone(b, px, 153, 98, 0.32, hex('#fff0c0'), 0.28);
          } else {
            // chain-link fence run
            const len = 60 + rnd() * 90;
            for (let i = 0; i < len; i++) {
              const fx = Math.round(x + i);
              if (i % 14 === 0) for (let y = 232; y < 252; y++) b.set(fx, y, D);
              b.set(fx, 233, D);
              for (let y = 234; y < 252; y++) if ((fx + y) % 4 === 0 || (fx - y) % 4 === 0) b.blend(fx, y, D, 0.6);
            }
          }
        }
      }],
    ],
  },

  moon: {
    sky(b, rnd) {
      skyGrad(b, hexes('#030409', '#080a16', '#0e1122'), 6);
      stars(b, rnd, 420, b.h);
      // Earth, lit from the right
      const L: [number, number, number] = [0.75, -0.25, 0.6];
      sphere(b, 112, 62, 26, (nx, ny, nz, x, y) => {
        const l = nx * L[0] + ny * L[1] + nz * L[2];
        const u = Math.atan2(nx, nz) * 30 + 40, v = ny * 30;
        const land = fbm(u, v, 9, 21, 3) > 0.55;
        const cloud = fbm(u * 1.4 + 9, v * 2.2, 7, 22, 3) > 0.58;
        let c = cloud ? hex('#f4f8ff') : land ? hex('#5aa35a') : hex('#2f6fd0');
        if (!cloud && land && fbm(u, v, 4, 23) > 0.6) c = hex('#c9b27a');
        if (l < 0.02) return bayer(x, y) < (l + 0.18) * 3 ? shade(c, 0.35) : hex('#0b1530');
        return l < 0.25 ? shade(c, 0.7) : c;
      });
      for (let a = 0; a < Math.PI * 2; a += 0.01) {
        const x = 112 + Math.cos(a) * 27, y = 62 + Math.sin(a) * 27;
        if (Math.cos(a) * 0.75 - Math.sin(a) * 0.25 > -0.2) b.blend(x, y, hex('#8fd0ff'), 0.6);
      }
    },
    layers: [
      [F1, (b, rnd) => {
        const t = mountains(b.w, 214, 70, Math.floor(rnd() * 999));
        terrain(b, t, { lit: hex('#8c8e9e'), body: hex('#5f6172'), dark: hex('#3c3d4b'), rim: hex('#b5b7c6') }, 1, 2, 0.04);
      }],
      [F2, (b, rnd) => {
        const t = ridge(b.w, 226, 9, rnd, 1.5);
        terrain(b, t, { lit: hex('#b4b4bf'), body: hex('#8f8f9c'), dark: hex('#6a6a78'), rim: hex('#d5d5de') }, 1, 3, 0.07);
        for (let i = 0; i < b.w / 30; i++) {
          const x = Math.floor(rnd() * b.w), y = t[x] + 6 + Math.floor(rnd() * 30);
          const rx = 3 + Math.floor(rnd() * 9);
          crater(b, x, y, rx, Math.max(1, Math.round(rx * 0.35)), hex('#dcdce4'), hex('#77778a'), hex('#55556a'));
        }
      }],
      [F3, (b, rnd) => {
        const t = ridge(b.w, 254, 5, rnd, 2.4);
        terrain(b, t, { lit: hex('#7a7a88'), body: hex('#5a5a68'), dark: hex('#44444f'), rim: hex('#a4a4b2') }, 1, 4, 0.08);
        for (let i = 0; i < b.w / 40; i++) {
          const x = Math.floor(rnd() * b.w);
          rock(b, x, t[Math.min(b.w - 1, x)] - 1, 3 + rnd() * 6, rnd, hexes('#2e2e38', '#555562', '#82828f', '#b9b9c6'), 0.7, -0.6);
        }
        // old lander
        const lx = Math.round(b.w * 0.42), ly = t[lx] - 1;
        const M = hex('#4a4a58'), G = hex('#d8b450');
        for (let i = -9; i <= 9; i += 18) for (let k = 0; k < 9; k++) b.set(lx + i * (1 - k / 18), ly - k, M);
        for (let y = ly - 17; y < ly - 8; y++) for (let i = -7; i <= 7; i++) b.set(lx + i, y, i > 3 ? hex('#f0d878') : G);
        for (let y = ly - 23; y < ly - 17; y++) for (let i = -4; i <= 4; i++) b.set(lx + i, y, i > 1 ? hex('#c8c8d4') : hex('#8c8c9a'));
        b.set(lx + 2, ly - 21, hex('#3a4a8a'));
      }],
    ],
  },

  asteroids: {
    sky(b, rnd, s) {
      skyGrad(b, hexes('#060716', '#0d0c24', '#151231'), 6);
      nebula(b, hexes('#2a1e5a', '#4a2a7a', '#2f6a8a', '#7fd0d0'), s, 90, 0.5, 0.55, (x, y) => 1 - Math.abs(y - 150 + x * 0.15) / 220);
      stars(b, rnd, 380, b.h);
      sun(b, 420, 40, 5, hex('#ffffff'), hex('#fff0c8'), hex('#ffe6b0'), 34);
    },
    layers: [
      [0.08, (b, rnd) => {
        for (let i = 0; i < b.w / 9; i++) rock(b, rnd() * b.w, 20 + rnd() * 230, 1 + rnd() * 2.5, rnd, hexes('#2a2638', '#4a4458', '#6e667e'), 0.7, -0.6);
      }],
      [F2, (b, rnd) => {
        for (let i = 0; i < b.w / 38; i++)
          rock(b, rnd() * b.w, 20 + rnd() * 230, 4 + rnd() * 9, rnd, hexes('#231f30', '#3f3848', '#6a5e6a', '#9a8a88', '#c9b6a2'), 0.7, -0.6, hex('#120f1c'));
      }],
      [F3, (b, rnd) => {
        for (let i = 0; i < b.w / 110; i++) {
          const top = rnd() < 0.5;
          rock(b, rnd() * b.w, top ? -6 + rnd() * 20 : 256 + rnd() * 20, 14 + rnd() * 16, rnd, hexes('#120f1a', '#252030', '#3c3442', '#5e5058', '#8c7468'), 0.7, -0.6, hex('#07060c'));
        }
      }],
    ],
  },

  mars: {
    sky(b, rnd) {
      skyGrad(b, hexes('#5e2630', '#923c38', '#c4603f', '#e08c5c', '#f2b882'), 12, 0, 230);
      stars(b, rnd, 40, 60);
      sun(b, 390, 78, 6, hex('#fffaf0'), hex('#fff0d0'), hex('#ffe0b0'), 30);
      // twin moons
      rock(b, 92, 46, 7, rnd, hexes('#3a2420', '#6a4a40', '#9a7a68', '#c8aa90'), 0.8, -0.3, hex('#2a1418'));
      rock(b, 250, 28, 3, rnd, hexes('#4a3028', '#8a6a58', '#c8aa90'), 0.8, -0.3, hex('#2a1418'));
      haze(b, hex('#f6c08e'), 200, 30, 0.35);
    },
    layers: [
      [F1, (b, rnd) => {
        // mesas: plateau, cliff, talus apron
        const tops = new Array<number>(b.w).fill(232);
        for (let x = rnd() * 40; x < b.w; x += 80 + rnd() * 140) {
          const w = 40 + rnd() * 80, h = 16 + rnd() * 34, talus = 10 + rnd() * 8;
          for (let i = 0; i < w; i++) {
            const e = Math.min(i, w - i);
            const k = e < talus ? (e / talus) * 0.4 : e < talus + 3 ? 0.4 + ((e - talus) / 3) * 0.6 : 1;
            const y = 232 - h * k + (fbm(x + i, 0, 4, 5) - 0.5) * 3;
            const xx = Math.round(x + i);
            if (xx < b.w && y < tops[xx]) tops[xx] = Math.round(y);
          }
        }
        terrain(b, tops, { lit: hex('#b8603e'), body: hex('#8e4232'), dark: hex('#6e3228'), rim: hex('#e08a5e') }, 1, 5, 0.03);
        for (let x = 0; x < b.w; x++) for (let y = tops[x] + 3; y < 232; y += 4) if (fbm(x, y, 8, 6) < 0.5) b.set(x, y, hex('#7a382c'));
        haze(b, hex('#f2b47e'), 224, 16, 0.45);
      }],
      [F2, (b, rnd) => {
        const t = ridge(b.w, 236, 12, rnd, 1.3);
        terrain(b, t, { lit: hex('#e08850'), body: hex('#c0603a'), dark: hex('#8c3c28'), rim: hex('#f4a868') }, 1, 6, 0.02);
        // dune ripples
        for (let x = 0; x < b.w; x++)
          for (let y = t[x] + 3; y < b.h; y++) if (Math.sin(x * 0.18 + y * 0.9 + valueNoise(x, y, 20, 7) * 6) > 0.92) b.set(x, y, hex('#a44a30'));
      }],
      [F3, (b, rnd) => {
        const t = ridge(b.w, 258, 4, rnd, 2);
        terrain(b, t, { lit: hex('#8a3a26'), body: hex('#6e2c1e'), dark: hex('#561f16'), rim: hex('#b0503a') }, 1, 7, 0.08);
        for (let i = 0; i < b.w / 45; i++) {
          const x = Math.floor(rnd() * b.w);
          rock(b, x, t[x] - 2, 3 + rnd() * 8, rnd, hexes('#3a1410', '#5e2218', '#8a3826', '#c0603e'), 0.8, -0.5, hex('#2a0c0a'));
        }
        haze(b, hex('#f0a070'), 250, 18, 0.25);
      }],
    ],
  },

  icemoon: {
    sky(b, rnd, s) {
      skyGrad(b, hexes('#04061a', '#0a1232', '#132050', '#1d3266'), 10, 0, 240);
      stars(b, rnd, 300, 200);
      aurora(b, s, hexes('#9affc8', '#4fe3c8', '#3fa0e0', '#b06aff'), 105, 250);
      // ringed planet low in the sky
      const L: [number, number, number] = [-0.6, -0.4, 0.7];
      sphere(b, 390, 70, 16, (nx, ny, nz, x, y) => lambert(nx, ny, nz, L, hexes('#141c3a', '#3a4a7a', '#7a8ab8', '#c8d0f0'), x, y, 0.05));
      for (let a = 0; a < Math.PI * 2; a += 0.004) {
        const x = 390 + Math.cos(a) * 30, y = 70 + Math.sin(a) * 6 + Math.cos(a) * -3;
        if (Math.sin(a) < 0 && Math.hypot(x - 390, y - 70) < 16) continue;
        b.set(x, y, hex('#a8b4e0'));
      }
    },
    layers: [
      [F1, (b, rnd) => {
        for (let x = rnd() * 20; x < b.w; x += 8 + rnd() * 22) {
          const h = 30 + rnd() * 70;
          spire(b, Math.round(x), 232, Math.round(h), 8 + Math.round(rnd() * 10), hex('#9ab8dc'), hex('#6c8cbc'), hex('#4c6a9e'), hex('#3a5288'), rnd() - 0.5);
        }
        for (let y = 232; y < b.h; y++) for (let x = 0; x < b.w; x++) b.set(x, y, hex('#3a5288'));
        haze(b, hex('#9ab8ff'), 226, 14, 0.35);
      }],
      [F2, (b, rnd) => {
        for (let x = rnd() * 40; x < b.w; x += 30 + rnd() * 70) {
          const n = 1 + Math.floor(rnd() * 3);
          for (let k = 0; k < n; k++) {
            const h = 40 + rnd() * 90;
            spire(b, Math.round(x + k * 9), 246, Math.round(h), 10 + Math.round(rnd() * 12), hex('#e6f4ff'), hex('#a8cdf0'), hex('#6c98cc'), hex('#2c4a80'), rnd() - 0.5);
          }
        }
        for (let y = 246; y < b.h; y++) for (let x = 0; x < b.w; x++) b.set(x, y, y < 249 ? hex('#cfe6ff') : hex('#7aa0d0'));
      }],
      [F3, (b, rnd) => {
        // dark ocean with aurora glints + floes
        for (let y = 256; y < b.h; y++)
          for (let x = 0; x < b.w; x++) {
            let c = mix(hex('#0a1838'), hex('#040a1c'), (y - 256) / 14);
            if (Math.sin(x * 0.3 + y * 2.1 + valueNoise(x, y, 14, 9) * 8) > 0.9) c = y % 2 ? hex('#4fe3c8') : hex('#2a5a8a');
            b.set(x, y, c);
          }
        for (let x = rnd() * 60; x < b.w; x += 70 + rnd() * 110) {
          const w = 14 + rnd() * 30;
          for (let i = 0; i < w; i++) {
            const e = Math.min(i, w - i);
            const h = Math.min(4, e * 0.7);
            for (let j = 0; j < h; j++) b.set(x + i, 256 - j, j === Math.floor(h - 0.01) ? hex('#ffffff') : hex('#bcd8f4'));
            b.set(x + i, 257, hex('#5a7cae'));
          }
        }
      }],
    ],
  },

  jungle: {
    sky(b, rnd, s) {
      skyGrad(b, hexes('#140b30', '#2c1858', '#4a2a7a', '#3c5a8e', '#3a9a9a', '#7ae0b8'), 12, 0, 240);
      sun(b, 120, 70, 22, hex('#ffe8f4'), hex('#ffb0d8'), hex('#ff9ad0'), 50);
      sphere(b, 160, 52, 8, (nx, ny, nz, x, y) => lambert(nx, ny, nz, [-0.7, -0.2, 0.6], hexes('#3a1e5a', '#7a4aa0', '#c08ae0'), x, y));
      stars(b, rnd, 120, 120);
      nebula(b, hexes('#5a3aa0', '#8a5ad0'), s, 60, 0.6, 0.35, (_x, y) => (y < 140 ? 1 : 0.5));
    },
    layers: [
      [F1, (b, rnd) => {
        const D = hex('#2a1c56'), E = hex('#4a3a8a'), G = hex('#7affd8');
        for (let y = 230; y < b.h; y++) for (let x = 0; x < b.w; x++) b.set(x, y, D);
        for (let x = rnd() * 30; x < b.w; x += 30 + rnd() * 60) {
          // giant mushroom tree
          const h = 50 + rnd() * 90, cw = 14 + rnd() * 22, top = 230 - h;
          for (let y = top; y < 230; y++) for (let i = -2; i <= 2; i++) b.set(x + i + Math.sin(y * 0.05) * 3, y, D);
          for (let y = -cw * 0.45; y <= 2; y++)
            for (let i = -cw; i <= cw; i++) if ((i * i) / (cw * cw) + (y * y) / ((cw * 0.45) ** 2) <= 1) b.set(x + i, top + y, y > -1 ? E : D);
          for (let i = -cw; i <= cw; i += 3) b.set(x + i, top + 2, G);
        }
        haze(b, hex('#5ad0c0'), 228, 14, 0.3);
      }],
      [F2, (b, rnd) => {
        const T = hex('#1a5a62'), Th = hex('#2fb39a'), P = hex('#5a2a8a'), Pod = hex('#ff7ad9');
        const t = ridge(b.w, 244, 7, rnd, 1.6);
        terrain(b, t, { lit: hex('#24806e'), body: hex('#1a5a62'), dark: hex('#144850'), rim: hex('#3ad0a8') }, -1, 8, 0.05);
        for (let x = rnd() * 20; x < b.w; x += 14 + rnd() * 40) {
          const base = t[Math.min(b.w - 1, Math.round(x))];
          const kind = rnd();
          if (kind < 0.5) {
            // frond fan
            const n = 4 + Math.floor(rnd() * 4), len = 18 + rnd() * 30;
            for (let k = 0; k < n; k++) {
              const ang = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.2;
              for (let d = 0; d < len; d++) {
                const bend = d * d * 0.004;
                const px = x + Math.cos(ang) * d, py = base + Math.sin(ang) * d + bend * 6;
                b.set(px, py, d > len * 0.6 ? Th : T);
                if (d % 3 === 0 && d > 4) b.set(px + 1, py + 1, T);
              }
            }
          } else {
            // bulb plant with glowing pod
            const h = 16 + rnd() * 36;
            for (let y = 0; y < h; y++) b.set(x + Math.sin(y * 0.2) * 2, base - y, P);
            const cy = base - h, r = 3 + rnd() * 3;
            b.glow(x, cy, r * 3, Pod, 0.5);
            b.disc(x, cy, r, Pod);
            b.disc(x - 1, cy - 1, r * 0.4, hex('#ffd0f2'));
          }
        }
      }],
      [F3, (b, rnd) => {
        const D = hex('#120a24'), Dl = hex('#2a1a48');
        // hanging vines
        for (let x = rnd() * 30; x < b.w; x += 20 + rnd() * 70) {
          const len = 20 + rnd() * 70;
          let vx = x;
          for (let y = 0; y < len; y++) {
            vx += Math.sin(y * 0.15 + x) * 0.4;
            b.set(vx, y, D); b.set(vx + 1, y, D);
            if (y % 7 === 3) { b.set(vx + 2, y, Dl); b.set(vx + 3, y + 1, Dl); b.set(vx - 1, y + 2, Dl); }
          }
        }
        for (let x = 0; x < b.w; x++) for (let y = 0; y < 6 + valueNoise(x, 0, 12, 3) * 8; y++) b.set(x, y, D);
        // big leaves at the floor
        const t = ridge(b.w, 262, 4, rnd, 2);
        terrain(b, t, { lit: Dl, body: D, dark: D, rim: Dl }, 1, 9, 0);
        for (let x = rnd() * 40; x < b.w; x += 40 + rnd() * 80) {
          const w = 10 + rnd() * 14, h = 14 + rnd() * 20;
          for (let y = 0; y < h; y++) {
            const half = Math.sin((y / h) * Math.PI) * w * 0.5;
            for (let i = -half; i <= half; i++) b.set(x + i + y * 0.3, 262 - y, Math.abs(i) < 1 ? Dl : D);
          }
        }
        // glowing spores
        const SP = hexes('#9fffe0', '#ff9ae6', '#d0b0ff');
        for (let i = 0; i < b.w / 14; i++) {
          const x = rnd() * b.w, y = 20 + rnd() * 240, c = SP[Math.floor(rnd() * 3)];
          b.glow(x, y, 3, c, 0.6);
          b.set(x, y, c);
        }
      }],
    ],
  },

  station: {
    sky(b, rnd) {
      skyGrad(b, hexes('#02030a', '#060a1a', '#0a1028'), 6);
      stars(b, rnd, 360, b.h);
      // big planet below
      sphere(b, 240, 430, 300, (nx, ny, nz, x, y) => {
        const l = nx * -0.3 + ny * -0.7 + nz * 0.6;
        const u = nx * 400, v = ny * 400;
        const c = fbm(u, v * 1.5, 30, 41, 3) > 0.52 ? hex('#e8f0ff') : fbm(u, v, 40, 42, 3) > 0.55 ? hex('#4a9a6a') : hex('#2a60c0');
        return dramp([shade(c, 0.25), shade(c, 0.55), c], 0.2 + l, x, y);
      });
      for (let x = 0; x < b.w; x++) {
        const y = 430 - Math.sqrt(Math.max(0, 300 * 300 - (x - 240) ** 2));
        for (let k = 1; k < 6; k++) b.blend(x, y - k, hex('#7ac0ff'), 0.5 - k * 0.09);
      }
    },
    layers: [
      [0.45, (b, rnd) => {
        // hull wall with big round windows (transparent)
        const P = hex('#3a4258'), Pl = hex('#4a5472'), Ps = hex('#262c3e'), Fr = hex('#1a1e2c'), Fh = hex('#7a86a8');
        for (let y = 0; y < b.h; y++)
          for (let x = 0; x < b.w; x++) {
            const px = x % 48, py = y % 36;
            let c = P;
            if (px === 0 || py === 0) c = Ps;
            else if (px === 1 || py === 1) c = Pl;
            if ((px === 4 || px === 44) && (py === 4 || py === 32)) c = Fh;
            b.set(x, y, c);
          }
        for (let x = 70; x < b.w; x += 150 + Math.floor(rnd() * 3) * 20) {
          const cx = x, cy = 110, rx = 40, ry = 48;
          for (let y = -ry - 6; y <= ry + 6; y++)
            for (let i = -rx - 6; i <= rx + 6; i++) {
              const d = (i * i) / (rx * rx) + (y * y) / (ry * ry);
              const dO = (i * i) / ((rx + 6) ** 2) + (y * y) / ((ry + 6) ** 2);
              if (d <= 1) b.set(cx + i, cy + y, [0, 0, 0], 0);
              else if (dO <= 1) b.set(cx + i, cy + y, y < -ry * 0.3 && i < 0 ? Fh : dO > 0.9 ? Fr : hex('#5a6482'));
            }
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            b.set(cx + Math.cos(a) * (rx + 3), cy + Math.sin(a) * (ry + 3), hex('#a8b4d0'));
          }
        }
        // teal guide stripe + signage
        for (let x = 0; x < b.w; x++) for (let y = 196; y < 200; y++) b.set(x, y, y === 196 ? hex('#7af0e0') : hex('#2aa8a0'));
        for (let x = 30; x < b.w; x += 96) for (let k = 0; k < 10; k++) b.set(x + k, 204, k % 3 === 2 ? Ps : hex('#d8e0f0'));
      }],
      [0.7, (b, rnd) => {
        // pipes along the ceiling + floor, junction boxes, status lights
        const pipe = (y: number, r: number, c: RGB) => {
          for (let x = 0; x < b.w; x++)
            for (let k = -r; k <= r; k++) {
              const t = (k + r) / (2 * r);
              b.set(x, y + k, t < 0.3 ? mix(c, hex('#ffffff'), 0.35) : t > 0.75 ? shade(c, 0.55) : c);
            }
          for (let x = rnd() * 60; x < b.w; x += 40 + rnd() * 60) for (let k = -r - 1; k <= r + 1; k++) { b.set(x, y + k, shade(c, 0.45)); b.set(x + 1, y + k, mix(c, hex('#ffffff'), 0.2)); }
        };
        pipe(8, 4, hex('#5b6f8a'));
        pipe(18, 2, hex('#8a5a3a'));
        pipe(256, 5, hex('#4a5a72'));
        for (let x = 20 + rnd() * 40; x < b.w; x += 90 + rnd() * 80) {
          const y = 24, w = 14, h = 12;
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(x + i, y + j, j === 0 || i === 0 ? hex('#6a7a96') : hex('#3a4660'));
          for (let k = 0; k < 3; k++) b.set(x + 3 + k * 4, y + 5, [hex('#ff4a5a'), hex('#5aff8a'), hex('#ffd04a')][k]);
          // cable sag
          for (let i = 0; i < 30; i++) b.set(x + w + i, y + 4 + Math.sin((i / 30) * Math.PI) * 8, hex('#1a1e2c'));
        }
        // floor grating
        for (let y = 262; y < b.h; y++) for (let x = 0; x < b.w; x++) b.set(x, y, (x % 4 === 0 || y === 262) ? hex('#2a3044') : hex('#161a26'));
      }],
      [0.92, (b, rnd) => {
        // foreground support columns, dark
        for (let x = rnd() * 200; x < b.w; x += 260 + rnd() * 200) {
          for (let y = 0; y < b.h; y++) for (let i = 0; i < 12; i++) b.set(x + i, y, i === 1 ? hex('#2a3044') : hex('#0c0e16'));
          for (let y = 30; y < b.h; y += 50) for (let i = -2; i < 14; i++) { b.set(x + i, y, hex('#0c0e16')); b.set(x + i, y + 1, hex('#0c0e16')); }
          b.set(x + 6, 120, hex('#ff4a5a'));
          b.glow(x + 6, 120, 4, hex('#ff4a5a'), 0.6);
        }
      }],
    ],
  },

  gasgiant: {
    sky(b, rnd, s) {
      skyGrad(b, hexes('#0a0820', '#1e1442', '#3a1e58', '#5a2a62'), 10);
      stars(b, rnd, 260, 120);
      const cx = 240, cy = 360, r = 300;
      const BANDS = hexes('#f4e2c0', '#e0b07a', '#c27a4a', '#9a5238', '#e8c896', '#f8ecd4', '#d0905a', '#b06842');
      sphere(b, cx, cy, r, (nx, ny, nz, x, y) => {
        const lat = ny * 14 + (fbm(x, y, 40, s, 3) - 0.5) * 2.4 + Math.sin(nx * 6 + ny * 30) * 0.25;
        const i = Math.floor(lat) & 7, f = lat - Math.floor(lat);
        let c = f < 0.85 ? BANDS[i] : mix(BANDS[i], BANDS[(i + 1) & 7], 0.5);
        const sx = (x - 150) / 26, sy = (y - 130) / 12;
        const sd = sx * sx + sy * sy;
        if (sd < 1) c = sd < 0.35 ? hex('#e86a4a') : sd < 0.7 ? hex('#c8503a') : hex('#f0d0a8');
        const l = nx * 0.5 + ny * -0.55 + nz * 0.67;
        return dramp([shade(c, 0.3), shade(c, 0.6), shade(c, 0.85), c], 0.15 + l * 1.05, x, y);
      });
      for (let a = Math.PI; a < Math.PI * 2; a += 0.002) {
        const x = cx + Math.cos(a) * (r + 1), y = cy + Math.sin(a) * (r + 1);
        b.blend(x, y, hex('#ffd8b0'), 0.6);
        b.blend(x, y - 1, hex('#ff9ad0'), 0.3);
      }
      // thin rings crossing in front
      for (let x = 0; x < b.w; x++) {
        const y = 108 + (x - 240) * 0.18;
        for (let k = 0; k < 4; k++) b.blend(x, y + k * 2, k % 2 ? hex('#c0a090') : hex('#f0dcc8'), 0.55);
      }
    },
    layers: [
      [F1, (b, rnd, s) => cloudDeck(b, rnd, s, 216, hexes('#f8d8c8', '#e0a8b0', '#a87098', '#704a80'), 10)],
      [F2, (b, rnd, s) => cloudDeck(b, rnd, s + 1, 238, hexes('#ffe6d0', '#f0b8a0', '#c07890', '#7a4a7a'), 16)],
      [F3, (b, rnd, s) => cloudDeck(b, rnd, s + 2, 260, hexes('#8a5a90', '#5e3a72', '#3e2658', '#2a1a44'), 22)],
    ],
  },

  factory: {
    sky(b, rnd) {
      skyGrad(b, hexes('#05040c', '#0c0a1a', '#141024'), 6);
      stars(b, rnd, 200, b.h);
      sphere(b, 360, 420, 260, (nx, ny, nz, x, y) => lambert(nx, ny, nz, [0.4, -0.7, 0.6], hexes('#1a0c08', '#5a2a14', '#a8542a', '#e8904a', '#ffd090'), x, y, 0.05));
      // far orbital rings / docks
      for (let i = 0; i < 3; i++) {
        const x = 60 + i * 140 + rnd() * 30, y = 50 + rnd() * 60;
        for (let a = 0; a < Math.PI * 2; a += 0.02) b.set(x + Math.cos(a) * 14, y + Math.sin(a) * 4, hex('#3a3448'));
        for (let k = -18; k <= 18; k++) b.set(x + k, y, hex('#2a2638'));
        b.set(x + 14, y, hex('#ff9a3a'));
      }
    },
    layers: [
      [F2, (b, rnd) => {
        const G = hex('#221e2c'), Gh = hex('#3c3648');
        // vertical I-beams + diagonal bracing
        for (let x = rnd() * 40; x < b.w; x += 70 + rnd() * 60) {
          for (let y = 0; y < b.h; y++) for (let i = 0; i < 8; i++) b.set(x + i, y, i === 0 || i === 7 ? Gh : G);
          for (let y = 20; y < b.h; y += 60) for (let k = 0; k < 50; k++) { b.set(x + 8 + k, y + k * 0.8, G); b.set(x + 8 + k, y + k * 0.8 + 1, G); }
          b.set(x + 3, 40 + rnd() * 150, hex('#ff9a3a'));
        }
        // machinery tanks
        for (let x = rnd() * 100; x < b.w; x += 180 + rnd() * 160) {
          const w = 30 + rnd() * 20, h = 50 + rnd() * 40, top = 270 - h;
          for (let y = top; y < b.h; y++)
            for (let i = 0; i < w; i++) {
              const t = i / w;
              b.set(x + i, y, t < 0.2 ? hex('#4a4258') : t > 0.8 ? hex('#18141e') : hex('#2e2838'));
            }
          for (let i = 0; i < w; i++) b.set(x + i, top, hex('#5a5068'));
          for (let y = top + 8; y < b.h; y += 14) for (let i = 0; i < w; i++) b.set(x + i, y, hex('#1c1824'));
        }
      }],
      [0.55, (b, rnd) => {
        // conveyors at a few heights with crates, hazard stripes
        const levels = [214];
        for (const ly of levels) {
          for (let x = 0; x < b.w; x++) {
            if (((x / 230) | 0) % 3 === 2) continue;
            for (let k = 0; k < 6; k++) b.set(x, ly + k, k === 0 ? hex('#6a6478') : k < 3 ? hex('#3a3444') : hex('#24202c'));
            if (x % 10 < 2) b.set(x, ly + 4, hex('#8a8498'));
            const stripe = ((x + ly) >> 3) & 1;
            b.set(x, ly + 6, stripe ? hex('#8a6a2a') : hex('#1a1620'));
            b.set(x, ly + 7, stripe ? hex('#6a5020') : hex('#1a1620'));
          }
          for (let x = rnd() * 30; x < b.w; x += 26 + rnd() * 50) {
            if (((x / 230) | 0) % 3 === 2) continue;
            const w = 8 + Math.floor(rnd() * 8), h = 6 + Math.floor(rnd() * 6);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b.set(x + i, ly - h + j, j === 0 ? hex('#d8a060') : i === w - 1 ? hex('#7a4a22') : hex('#b07a3a'));
            for (let i = 1; i < w - 1; i++) b.set(x + i, ly - h + (h >> 1), hex('#8a5a2a'));
          }
          // support legs
          for (let x = 12; x < b.w; x += 64) for (let y = ly + 8; y < b.h; y++) { b.set(x, y, hex('#2a2634')); b.set(x + 1, y, hex('#3a3444')); }
        }
        // robotic arms
        for (let x = 60 + rnd() * 80; x < b.w; x += 220 + rnd() * 140) {
          const A = hex('#d88a2a'), Ad = hex('#8a4a14');
          for (let y = 0; y < 30; y++) { b.set(x, y, A); b.set(x + 1, y, Ad); }
          for (let k = 0; k < 24; k++) { b.set(x + k * 0.6, 30 + k, A); b.set(x + k * 0.6 + 1, 30 + k, Ad); }
          b.disc(x, 30, 2.5, hex('#5a5068'));
          b.set(x + 14, 55, hex('#ffe08a')); b.set(x + 16, 55, hex('#ffe08a'));
        }
      }],
      [0.85, (b, rnd) => {
        // hanging chains + hooks
        for (let x = rnd() * 120; x < b.w; x += 120 + rnd() * 160) {
          const len = 30 + rnd() * 60;
          for (let y = 0; y < len; y++) b.set(x + ((y >> 1) & 1), y, y % 4 < 2 ? hex('#2a2632') : hex('#4a4456'));
          for (let k = 0; k < 6; k++) b.set(x + 3 - Math.abs(k - 3) * 0.3 + (k > 3 ? 1 : 0), len + k, hex('#5a5468'));
          b.set(x - 1, len + 3, hex('#5a5468'));
        }
        // floor with warning edge
        for (let y = 258; y < b.h; y++)
          for (let x = 0; x < b.w; x++) b.set(x, y, y < 261 ? ((((x + y) >> 2) & 1) ? hex('#ffc93a') : hex('#14121a')) : hex('#0e0c14'));
      }],
    ],
  },

  comet: {
    sky(b, rnd) {
      skyGrad(b, hexes('#020410', '#06102a', '#0c1838'), 8);
      stars(b, rnd, 300, b.h);
      // ion + dust tails streaming away from the sun (top right)
      for (let y = 0; y < b.h; y++)
        for (let x = 0; x < b.w; x++) {
          const u = (b.w - x) / b.w;
          const ion = Math.exp(-(((y - 70 - u * 40) / (10 + u * 30)) ** 2)) * (0.3 + u * 0.4) * (0.75 + fbm(x * 0.2, y * 3, 20, 3) * 0.5);
          const dust = Math.exp(-(((y - 100 - u * u * 120) / (14 + u * 50)) ** 2)) * (0.25 + u * 0.4);
          if (ion > 0.08) b.blend(x, y, hex('#6ab8ff'), Math.min(0.5, ion * 0.55) * (bayer(x, y) < 0.5 ? 1 : 0.6));
          if (dust > 0.08) b.blend(x, y, hex('#fff0d0'), Math.min(0.45, dust * 0.5) * (bayer(x + 2, y) < 0.5 ? 1 : 0.6));
        }
      sun(b, 450, 36, 7, hex('#ffffff'), hex('#fff8e0'), hex('#fff0c8'), 44);
      for (let k = 8; k < 40; k++) { b.blend(450 - k, 36, hex('#ffffff'), 0.5 - k / 90); b.blend(450, 36 + k, hex('#ffffff'), 0.5 - k / 90); b.blend(450, 36 - k, hex('#ffffff'), 0.5 - k / 90); }
    },
    layers: [
      [F1, (b, rnd) => {
        const t = ridge(b.w, 214, 10, rnd, 1.2);
        terrain(b, t, { lit: hex('#5a6a8a'), body: hex('#2e3650'), dark: hex('#1e2438'), rim: hex('#cfe6ff') }, 1, 10, 0.06);
        for (let x = 0; x < b.w; x++) for (let y = t[x] + 2; y < b.h; y++) if (fbm(x, y * 2, 12, 11) > 0.64) b.set(x, y, hex('#7a94c0'));
      }],
      [F2, (b, rnd) => {
        const t = peaks(b.w, 244, rnd, 40, 10, 48, 1.4);
        terrain(b, t, { lit: hex('#e8f6ff'), body: hex('#9cc4ea'), dark: hex('#4a6a9a'), rim: hex('#ffffff') }, 1, 12, 0.04);
        for (let x = 0; x < b.w; x++) for (let y = t[x] + 6; y < b.h; y++) if (fbm(x, y * 2, 14, 13) > 0.66) b.set(x, y, hex('#6a86b0'));
        // gas jets
        for (let x = rnd() * 80; x < b.w; x += 120 + rnd() * 160) {
          const base = t[Math.min(b.w - 1, Math.round(x))], h = 60 + rnd() * 80;
          for (let y = 0; y < h; y++) {
            const half = 1 + y * 0.18;
            for (let i = -half; i <= half; i++) {
              const a = (1 - y / h) * (1 - Math.abs(i) / (half + 1)) * 0.9;
              if (bayer(x + i, base - y) < a) b.blend(x + i, base - y, hex('#e8f6ff'), 0.6);
            }
          }
        }
      }],
      [F3, (b, rnd) => {
        for (let i = 0; i < b.w / 50; i++) {
          const x = rnd() * b.w;
          rock(b, x, 262 + rnd() * 10, 6 + rnd() * 12, rnd, hexes('#141a2c', '#2a3450', '#5a7aa8', '#bfe0ff'), 0.7, -0.6, hex('#0a0e1a'));
        }
        for (let i = 0; i < b.w / 70; i++) rock(b, rnd() * b.w, rnd() * 200, 2 + rnd() * 3, rnd, hexes('#2a3450', '#8ab0d8', '#e8f6ff'), 0.7, -0.6);
      }],
    ],
  },

  blackhole: {
    sky(b, rnd) {
      skyGrad(b, hexes('#020206', '#070414', '#0e0820'), 6);
      const cx = 300, cy = 108, R = 24;
      // lensed starfield: stars pushed outward near the hole
      for (let i = 0; i < 420; i++) {
        let x = rnd() * b.w, y = rnd() * b.h;
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d < R * 3.2) {
          const nd = R * 1.6 + d * 0.6, a = Math.atan2(dy, dx);
          for (let k = -3; k <= 3; k++) b.blend(cx + Math.cos(a + k * 0.03) * nd, cy + Math.sin(a + k * 0.03) * nd, hex('#e8e0ff'), 0.7 - Math.abs(k) * 0.18);
          continue;
        }
        x |= 0; y |= 0;
        b.blend(x, y, hex('#d8d0ff'), 0.3 + rnd() * 0.6);
      }
      nebula(b, hexes('#1a0a3a', '#3a1458', '#6a1a5a'), 77, 80, 0.55, 0.45);
      const disk = (front: boolean) => {
        for (let y = cy - 70; y < cy + 50; y++)
          for (let x = cx - 160; x < cx + 160; x++) {
            const dx = (x - cx) / 150, dy = (y - cy - (x - cx) * 0.06) / 20;
            const d = Math.hypot(dx, dy);
            if (d > 1 || d < 0.2) continue;
            if (front !== (dy > 0)) continue;
            const heat = 1 - (d - 0.2) / 0.8;
            const streak = fbm(Math.atan2(dy, dx) * 60, d * 40, 6, 31, 2);
            const c = ramp(hexes('#3a0a3a', '#a02a3a', '#f06a2a', '#ffc860', '#fff6e0'), heat * 0.8 + streak * 0.35);
            if (bayer(x, y) < heat * 1.6 + 0.1) b.set(x, y, c);
          }
      };
      disk(false);
      // lensed far side arching over the top
      for (let y = cy - 50; y < cy + 2; y++)
        for (let x = cx - 60; x < cx + 60; x++) {
          const d = Math.hypot((x - cx) / 1.15, y - cy);
          if (d < R + 1 || d > R + 14) continue;
          const t = (d - R - 1) / 13;
          if (bayer(x, y) < 1 - t) b.set(x, y, ramp(hexes('#fff6e0', '#ffc860', '#f06a2a', '#7a1a3a'), t));
        }
      b.disc(cx, cy, R, hex('#000000'));
      for (let a = 0; a < Math.PI * 2; a += 0.01) b.set(cx + Math.cos(a) * (R + 0.5), cy + Math.sin(a) * (R + 0.5), hex('#fff0d0'));
      disk(true);
    },
    layers: [
      [0.08, (b, rnd) => {
        // faint spiral debris streams
        for (let k = 0; k < b.w / 6; k++) {
          const x = rnd() * b.w, y = rnd() * b.h;
          const len = 4 + rnd() * 10;
          for (let i = 0; i < len; i++) b.blend(x + i, y + i * 0.25, hex('#8a5aa0'), 0.35 * (1 - i / len));
        }
      }],
      [F2, (b, rnd) => {
        for (let i = 0; i < b.w / 45; i++)
          rock(b, rnd() * b.w, 30 + rnd() * 220, 4 + rnd() * 9, rnd, hexes('#0a0810', '#1e1824', '#3a2a34', '#c0602a', '#ffb060'), 0.9, -0.2, hex('#050408'));
      }],
      [F3, (b, rnd) => {
        for (let i = 0; i < b.w / 100; i++) {
          const top = rnd() < 0.5;
          rock(b, rnd() * b.w, top ? rnd() * 16 : 258 + rnd() * 16, 14 + rnd() * 16, rnd, hexes('#050408', '#120e18', '#241a26', '#8a3a1a'), 0.9, -0.2);
        }
      }],
    ],
  },

  nova: {
    sky(b, rnd, s) {
      skyGrad(b, hexes('#1a0620', '#3a0c3a', '#6a1a4a', '#a83a50', '#e06a50'), 12);
      nebula(b, hexes('#c04a8a', '#ff6aa0', '#ffb07a'), s, 80, 0.52, 0.7);
      nebula(b, hexes('#4a1050', '#7a2a7a'), s + 9, 50, 0.55, 0.6);
      stars(b, rnd, 160, b.h, hexes('#ffffff', '#ffe0f0'));
      const cx = 350, cy = 96;
      b.glow(cx, cy, 120, hex('#ffb070'), 0.9);
      b.glow(cx, cy, 80, hex('#ffe0a0'), 0.9);
      sphere(b, cx, cy, 46, (_nx, _ny, nz, x, y) => {
        const g = fbm(x, y, 6, 51, 3);
        return dramp(hexes('#ff8a3a', '#ffc860', '#fff2c0', '#ffffff'), nz * 0.9 + (g - 0.5) * 0.5, x, y);
      });
      // prominences: thick looping arcs on the limb
      for (let k = 0; k < 5; k++) {
        const a = rnd() * Math.PI * 2, h = 5 + rnd() * 7;
        for (let i = 0; i < 40; i++) {
          const t = i / 39, aa = a + (t - 0.5) * 0.18;
          const rr = 45 + Math.sin(t * Math.PI) * h;
          for (let w = 0; w < 2; w++) b.blend(cx + Math.cos(aa) * (rr + w), cy + Math.sin(aa) * (rr + w), w ? hex('#ff7a3a') : hex('#ffd890'), 0.85);
        }
      }
    },
    layers: [
      [0.08, (b, _rnd, s) => nebula(b, hexes('#ff8ab8', '#ffd0e0'), s + 3, 40, 0.68, 0.45)],
      [F2, (b, rnd) => {
        for (let i = 0; i < b.w / 50; i++)
          rock(b, rnd() * b.w, 40 + rnd() * 200, 4 + rnd() * 10, rnd, hexes('#14060e', '#2a0c18', '#4a1420', '#ff8a4a', '#ffd890'), 0.95, -0.25, hex('#0a0308'));
      }],
      [F3, (b, rnd) => {
        const t = ridge(b.w, 260, 6, rnd, 2);
        terrain(b, t, { lit: hex('#5a1a20'), body: hex('#1e0812'), dark: hex('#14050c'), rim: hex('#ff9a5a') }, 1, 14, 0.04);
        for (let x = 0; x < b.w; x++) for (let y = t[x] + 2; y < b.h; y++) if (fbm(x, y, 6, 15) > 0.66) b.set(x, y, hex('#ff5a2a'));
        for (let i = 0; i < b.w / 12; i++) {
          const x = rnd() * b.w, y = rnd() * 250;
          b.set(x, y, hex('#ffd08a'));
          if (rnd() < 0.4) b.set(x - 1, y + 1, hex('#ff7a3a'));
        }
      }],
    ],
  },
};

// Flat-shaded disc with a rim highlight on the right.
function sphereFlat(b: Buf, cx: number, cy: number, r: number, c: RGB, hi: RGB): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y);
      if (d > r) continue;
      b.set(cx + x, cy + y, d > r - 1.5 && x > r * 0.3 && y < r * 0.3 ? hi : c);
    }
}

// Billowing cloud tops along yBase.
function cloudDeck(b: Buf, rnd: R, seed: number, yBase: number, cols: readonly RGB[], amp: number): void {
  const tops: number[] = [];
  for (let x = 0; x < b.w; x++) {
    let y = yBase;
    y -= Math.abs(Math.sin(x * 0.035 + seed)) * amp;
    y -= Math.abs(Math.sin(x * 0.09 + seed * 2)) * amp * 0.45;
    y -= (fbm(x, 0, 30, seed, 2) - 0.5) * amp;
    tops.push(Math.round(y));
  }
  for (let x = 0; x < b.w; x++) {
    const sl = tops[Math.min(b.w - 1, x + 2)] - tops[Math.max(0, x - 2)];
    for (let y = Math.max(0, tops[x]); y < b.h; y++) {
      const dy = y - tops[x];
      const lit = 0.75 - dy / 26 + (sl < 0 ? 0.15 : -0.15) + (fbm(x, y, 8, seed + 4, 2) - 0.5) * 0.4;
      b.set(x, y, dramp([cols[3], cols[2], cols[1], cols[0]], lit, x, y));
    }
  }
  // a few towering anvils
  for (let i = 0; i < b.w / 260; i++) {
    const x = rnd() * b.w, h = 20 + rnd() * 40;
    for (let k = 0; k < 4; k++) {
      const cx = x + (rnd() - 0.5) * 20, cy = yBase - amp - k * (h / 4), r = 8 + rnd() * 8;
      for (let y = -r; y <= r; y++)
        for (let xx = -r; xx <= r; xx++) {
          if (Math.hypot(xx, y) > r) continue;
          const lit = 0.9 - (y + r) / (2 * r) * 0.6 + (xx < 0 ? 0.1 : -0.1);
          b.set(cx + xx, cy + y, dramp([cols[3], cols[2], cols[1], cols[0]], lit, cx + xx, cy + y));
        }
    }
  }
}

const cache = new Map<string, ParallaxLayer[]>();

export function renderBackground(theme: Theme, worldWidth: number): ParallaxLayer[] {
  const ww = Math.max(VIEW_W, Math.ceil(worldWidth));
  const key = `${theme}|${ww}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = DEFS[theme] ?? DEFS.launchpad;
  const seed = strSeed(theme);
  const ctx: Ctx = { ww, seed };
  const out: ParallaxLayer[] = [];
  const sky = new Buf(VIEW_W, VIEW_H);
  def.sky(sky, mulberry32(seed), seed);
  out.push({ canvas: sky.canvas(), factor: 0 });
  def.layers.forEach(([f, paint], i) => {
    const b = new Buf(Math.ceil(ctx.ww * f + VIEW_W), VIEW_H);
    paint(b, mulberry32(seed + 101 * (i + 1)), seed + i * 7);
    out.push({ canvas: b.canvas(), factor: f });
  });
  cache.set(key, out);
  return out;
}


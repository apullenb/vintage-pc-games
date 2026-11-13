import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { GH_HEIGHT, SAFE_FALL, SKILLS, VIEW_H } from './types';
import type { Hazard, LevelDef, Shape } from './types';

// Local rasterizer mirroring the Shape contract: paint in order, mat defaults to dirt, erase clears.
// 0 empty, 1 dirt, 2 rock. Pixel (px,py) is covered when its center (px+.5, py+.5) is inside.
function rasterize(level: LevelDef): Uint8Array {
  const W = level.width;
  const H = VIEW_H;
  const mask = new Uint8Array(W * H);
  const put = (x: number, y: number, v: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = v;
  };
  for (const s of level.shapes) {
    const v = shapeValue(s);
    if (s.kind === 'rect') {
      for (let y = Math.max(0, s.y); y < Math.min(H, s.y + s.h); y++)
        for (let x = Math.max(0, s.x); x < Math.min(W, s.x + s.w); x++) put(x, y, v);
    } else if (s.kind === 'ellipse') {
      for (let y = Math.floor(s.cy - s.ry); y <= Math.ceil(s.cy + s.ry); y++)
        for (let x = Math.floor(s.cx - s.rx); x <= Math.ceil(s.cx + s.rx); x++) {
          const dx = (x + 0.5 - s.cx) / s.rx;
          const dy = (y + 0.5 - s.cy) / s.ry;
          if (dx * dx + dy * dy <= 1) put(x, y, v);
        }
    } else {
      const pts = s.points;
      const ys = pts.map((p) => p[1]);
      for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(H - 1, Math.ceil(Math.max(...ys))); y++) {
        const cy = y + 0.5;
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[(i + 1) % pts.length];
          if (y1 <= cy !== y2 <= cy) xs.push(x1 + ((cy - y1) / (y2 - y1)) * (x2 - x1));
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let x = Math.ceil(xs[k] - 0.5); x + 0.5 <= xs[k + 1]; x++) put(x, y, v);
      }
    }
  }
  return mask;
}

function shapeValue(s: Shape): number {
  if (s.erase) return 0;
  return s.mat === 'rock' ? 2 : 1;
}

const solidAt = (m: Uint8Array, w: number, x: number, y: number) =>
  x >= 0 && x < w && y >= 0 && y < VIEW_H && m[y * w + x] !== 0;

const inHazard = (hs: Hazard[], x: number, y: number) =>
  hs.some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);

describe('LEVELS', () => {
  it('has at least 20 levels with unique ids and names', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(LEVELS.length);
  });

  for (const level of LEVELS) {
    describe(level.id, () => {
      const mask = rasterize(level);
      const W = level.width;

      it('has sane numbers', () => {
        expect(W).toBeGreaterThanOrEqual(480);
        expect(W).toBeLessThanOrEqual(1600);
        expect(level.count).toBeGreaterThanOrEqual(1);
        expect(level.count).toBeLessThanOrEqual(100);
        expect(level.required).toBeGreaterThanOrEqual(1);
        expect(level.required).toBeLessThanOrEqual(level.count);
        expect(level.releaseRate).toBeGreaterThanOrEqual(1);
        expect(level.releaseRate).toBeLessThanOrEqual(99);
        expect(level.timeLimit).toBeGreaterThanOrEqual(60);
        expect(level.timeLimit).toBeLessThanOrEqual(600);
        expect(level.entrances.length).toBeGreaterThan(0);
        expect(level.exits.length).toBeGreaterThan(0);
        expect(level.startX, 'startX set deliberately').toBeDefined();
        expect(level.startX!).toBeGreaterThanOrEqual(0);
        expect(level.startX!).toBeLessThanOrEqual(W - 480);
      });

      it('has valid skills', () => {
        for (const [k, n] of Object.entries(level.skills)) {
          expect(SKILLS).toContain(k);
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(99);
        }
      });

      it('keeps hazards inside the world', () => {
        for (const h of level.hazards) {
          expect(h.x).toBeGreaterThanOrEqual(0);
          expect(h.y).toBeGreaterThanOrEqual(0);
          expect(h.x + h.w).toBeLessThanOrEqual(W);
          expect(h.y + h.h).toBeLessThanOrEqual(VIEW_H);
        }
      });

      it('has grounded exits with headroom', () => {
        for (const e of level.exits) {
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.x).toBeLessThan(W);
          expect(e.y).toBeGreaterThanOrEqual(GH_HEIGHT + 10);
          expect(e.y).toBeLessThan(VIEW_H - 1);
          expect(solidAt(mask, W, e.x, e.y + 1), `ground under exit ${e.x},${e.y}`).toBe(true);
          for (let y = e.y; y > e.y - GH_HEIGHT - 2; y--)
            expect(solidAt(mask, W, e.x, y), `headroom at exit ${e.x},${y}`).toBe(false);
          expect(inHazard(level.hazards, e.x, e.y)).toBe(false);
        }
      });

      it('shows every entrance from the starting camera, and says so when there are two', () => {
        for (const en of level.entrances) {
          expect(en.x).toBeGreaterThanOrEqual(level.startX ?? 0);
          expect(en.x).toBeLessThan((level.startX ?? 0) + 480);
        }
        if (level.entrances.length > 1) expect(level.hint ?? '').toMatch(/both|two/i);
      });

      it('drops groundhogs safely from each entrance', () => {
        for (const en of level.entrances) {
          expect(en.x).toBeGreaterThanOrEqual(0);
          expect(en.x).toBeLessThan(W);
          // room for the ~20px entrance art above the drop point
          for (let y = en.y; y >= Math.max(0, en.y - 20); y--)
            expect(solidAt(mask, W, en.x, y), `entrance space ${en.x},${y}`).toBe(false);
          let y = en.y;
          while (y < VIEW_H - 1 && !solidAt(mask, W, en.x, y + 1)) y++;
          expect(y, 'entrance lands on ground').toBeLessThan(VIEW_H - 1);
          const fall = y - en.y;
          expect(fall).toBeGreaterThanOrEqual(15);
          expect(fall).toBeLessThanOrEqual(45);
          expect(fall).toBeLessThan(SAFE_FALL);
          expect(inHazard(level.hazards, en.x, y)).toBe(false);
        }
      });
    });
  }
});

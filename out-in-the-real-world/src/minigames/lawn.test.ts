import { describe, expect, it } from 'vitest';
import { BAG_CAP, botInput, buildGrid, buildYard, CELL, CUT, GW, lawnScore, MOWER_R, mulberry, newLawn, newMower, solidHit, stepLawn, TALL, yardScore, type LawnSim } from './lawnYard.ts';

const idle = { ix: 0, iy: 0 };
function play(g: LawnSim): void {
  while (g.phase === 'count') stepLawn(g, idle, 1 / 60, mulberry(1));
}
function drive(g: LawnSim, ix: number, iy: number, secs: number): void {
  const rnd = mulberry(2);
  for (let i = 0; i < secs * 60; i++) stepLawn(g, { ix, iy }, 1 / 60, rnd);
}

describe('lawn yards', () => {
  it('builds three growing yards per gig, each with its own house and neighbor', () => {
    for (const seed of [1, 5, 9, 13]) {
      const ys = [0, 1, 2].map((t) => buildYard(t, seed * 7 + t * 101, seed));
      const areas = ys.map((y) => buildGrid(y).mowable);
      expect(areas[0]).toBeLessThan(areas[1]);
      expect(areas[1]).toBeLessThan(areas[2]);
      expect(new Set(ys.map((y) => y.neighbor.name)).size).toBe(3);
      for (const y of ys) {
        const m = newMower(y);
        expect(solidHit(y, m.x, m.y, MOWER_R)).toBeNull();
        expect(y.solids.some((s) => s.kind === 'bed')).toBe(true);
      }
      expect(ys[0].dog).toBeNull();
      expect(ys[2].dog).not.toBeNull();
      expect(ys[2].sprinklers.length).toBeGreaterThan(ys[0].sprinklers.length);
    }
  });
});

describe('mowing', () => {
  it('cuts stripes by direction, fills the bag, and the bin empties it', () => {
    const g = newLawn(3);
    play(g);
    drive(g, 0, -1, 0.9);
    expect(g.cut).toBeGreaterThan(40);
    const upCells: number[] = [];
    for (let k = 0; k < g.grid.length; k++) if (g.grid[k] === CUT) upCells.push(k);
    expect(upCells.every((k) => g.dir[k] === 0)).toBe(true);
    drive(g, 0, 1, 0.6);
    expect(upCells.some((k) => g.dir[k] === 1)).toBe(true);
    // a full bag stops the blades
    g.m.bag = BAG_CAP;
    const before = g.cut;
    drive(g, 1, 0, 0.5);
    expect(g.cut).toBe(before);
    // park at the bin: it empties
    g.m.x = g.y.bin.x;
    g.m.y = g.y.bin.y + g.y.bin.r + MOWER_R + 2;
    g.m.vx = g.m.vy = g.m.speed = 0;
    drive(g, 0, 0, 1.2);
    expect(g.m.bag).toBe(0);
  });

  it('driving into a flower bed costs you; brushing past does not', () => {
    const g = newLawn(4);
    play(g);
    const bed = g.y.solids.find((s) => s.kind === 'bed' && s.y > g.y.houseH + 12)!;
    // brush along the bottom edge
    g.m.x = bed.x - 8;
    g.m.y = bed.y + bed.h + MOWER_R + 0.5;
    g.m.ang = 0;
    g.m.vx = g.m.vy = g.m.speed = 0;
    drive(g, 1, -0.12, 0.5);
    expect(g.oops).toBe(0);
    // ram it
    g.m.x = bed.x + bed.w / 2;
    g.m.y = bed.y + bed.h + 24;
    g.m.ang = -Math.PI / 2;
    g.m.vx = g.m.vy = g.m.speed = 0;
    drive(g, 0, -1, 1);
    expect(g.oops).toBeGreaterThan(0);
    expect(bed.crushed?.length).toBeGreaterThan(0);
  });

  it('runs a whole gig: three yards, then done, with a score that rewards cutting', () => {
    const g = newLawn(6);
    const rnd = mulberry(6);
    for (let i = 0; i < 60 * 200 && g.phase !== 'done'; i++) stepLawn(g, botInput(g, 1), 1 / 60, rnd);
    expect(g.phase).toBe('done');
    expect(g.results.length).toBe(3);
    const avg = g.results.reduce((a, r) => a + r.cut, 0) / 3;
    expect(avg).toBeGreaterThan(0.7);
    expect(lawnScore(g)).toBeGreaterThan(0.3);
    // a lazy gig (stand still) pays almost nothing
    const lazy = newLawn(6);
    for (let i = 0; i < 60 * 200 && lazy.phase !== 'done'; i++) stepLawn(lazy, idle, 1 / 60, rnd);
    expect(lawnScore(lazy)).toBeLessThan(0.05);
  });

  it('scores a perfect yard at 1 and an untouched one at 0', () => {
    expect(yardScore({ cut: 1, done: true, oops: 0, time: 20 })).toBeCloseTo(1);
    expect(yardScore({ cut: 0.2, done: false, oops: 0, time: 30 })).toBe(0);
    expect(yardScore({ cut: 0.88, done: false, oops: 0, time: 30 })).toBeGreaterThan(0.7);
  });

  it('only counts grass the deck can actually reach', () => {
    const y = buildYard(2, 77, 3);
    const { grid, mowable } = buildGrid(y);
    let tall = 0;
    for (let k = 0; k < grid.length; k++) if (grid[k] === TALL) tall++;
    expect(tall).toBe(mowable);
    // every mowable cell is within reach of a legal deck position
    for (let k = 0; k < grid.length; k += 37) {
      if (grid[k] !== TALL) continue;
      const cx = (k % GW) * CELL + 1;
      const cy = Math.floor(k / GW) * CELL + 1;
      let ok = false;
      for (let a = 0; a < 6.3 && !ok; a += 0.4) for (let r = 0; r <= 7 && !ok; r += 1) if (!solidHit(y, cx + Math.cos(a) * r, cy + Math.sin(a) * r, MOWER_R)) ok = true;
      expect(ok).toBe(true);
    }
  });
});

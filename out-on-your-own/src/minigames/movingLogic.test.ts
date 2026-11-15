import { describe, expect, it } from 'vitest';
import { rng } from './cardsFx.ts';
import { assess, CATALOG, COLS, dims, heights, jolt, landRow, movingScore, pickItems, preview, ROWS, type ItemDef, type Placed } from './movingLogic.ts';

// A sensible packer: heavy first, then medium, light, fragile; lowest safe spot with the fewest gaps.
function pack(items: ItemDef[]): Placed[] {
  const order = { heavy: 0, medium: 1, light: 2, fragile: 3 };
  const placed: Placed[] = [];
  for (const d of [...items].sort((a, b) => order[a.weight] - order[b.weight] || b.w * b.h - a.w * a.h)) {
    let best: { col: number; w: number; h: number; cost: number } | null = null;
    const hs = heights(placed);
    for (const rot of [false, true]) {
      const [w, h] = dims(d, rot);
      for (let c = 0; c + w <= COLS; c++) {
        const pv = preview(placed, d, c, w, h);
        if (!pv.ok) continue;
        const row = landRow(placed, c, w);
        let holes = 0;
        for (let k = c; k < c + w; k++) holes += row - hs[k];
        const cost = pv.crush.length * 100 + (pv.wobbly ? 50 : 0) + holes * 3 + row + h;
        if (!best || cost < best.cost) best = { col: c, w, h, cost };
      }
    }
    if (best) placed.push({ def: d, col: best.col, row: landRow(placed, best.col, best.w), w: best.w, h: best.h });
  }
  return placed;
}

describe('Moving Day packing rules', () => {
  it('gravity stacks items on the tallest column under them', () => {
    const placed: Placed[] = [{ def: CATALOG.dresser, col: 0, row: 0, w: 3, h: 2 }];
    expect(landRow(placed, 2, 2)).toBe(2);
    expect(landRow(placed, 3, 2)).toBe(0);
  });

  it('flags fragile items under heavy/medium loads and heavy items on soft footing', () => {
    const tv: Placed = { def: CATALOG.tv, col: 0, row: 0, w: 2, h: 2 };
    const books: Placed = { def: CATALOG.books, col: 0, row: 2, w: 2, h: 1 };
    const pillow: Placed = { def: CATALOG.pillows, col: 3, row: 0, w: 1, h: 1 };
    const plant: Placed = { def: CATALOG.plant, col: 3, row: 1, w: 1, h: 1 };
    const r = assess([tv, books, pillow, plant]);
    expect(r.crushed).toEqual([tv]);
    expect(r.wobbly).toEqual([books]);
  });

  it('every random truckload can be packed completely with nothing at risk', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const items = pickItems(rng(seed));
      const placed = pack(items);
      expect(placed.length, `seed ${seed}`).toBe(items.length);
      const r = assess(placed);
      expect(r.crushed.length + r.wobbly.length, `seed ${seed}`).toBe(0);
      expect(Math.max(...heights(placed))).toBeLessThanOrEqual(ROWS);
    }
  });

  it('slow bumps spare medium-loaded fragile items but a heavy load or a hard jolt breaks them', () => {
    const lamp: Placed = { def: CATALOG.lamp, col: 0, row: 0, w: 1, h: 2 };
    const pans: Placed = { def: CATALOG.pans, col: 0, row: 2, w: 2, h: 1 };
    const prop: Placed = { def: CATALOG.nightstand, col: 1, row: 0, w: 1, h: 2 };
    const load = [lamp, prop, pans];
    for (let i = 0; i < 5; i++) jolt(load, false);
    expect(lamp.broken).toBeFalsy();
    expect(jolt(load, true)).toEqual([lamp]);

    const tv: Placed = { def: CATALOG.tv, col: 0, row: 0, w: 2, h: 2 };
    const fridge: Placed = { def: CATALOG.fridge, col: 0, row: 2, w: 2, h: 2 };
    for (let i = 0; i < 4; i++) jolt([tv, fridge], false);
    expect(tv.broken).toBe(true);
  });

  it('scores: perfect = 1, attentive ≈ 0.6–0.8, careless ≈ 0.2–0.4', () => {
    expect(movingScore({ fit: 1, broken: 0, hardJolts: 0, timeLeft: 0.5 })).toBeCloseTo(1);
    const attentive = movingScore({ fit: 1, broken: 1, hardJolts: 2, timeLeft: 0.2 });
    expect(attentive).toBeGreaterThanOrEqual(0.6);
    expect(attentive).toBeLessThanOrEqual(0.8);
    const careless = movingScore({ fit: 0.9, broken: 2, hardJolts: 4, timeLeft: 0.1 });
    expect(careless).toBeGreaterThanOrEqual(0.2);
    expect(careless).toBeLessThanOrEqual(0.4);
  });
});

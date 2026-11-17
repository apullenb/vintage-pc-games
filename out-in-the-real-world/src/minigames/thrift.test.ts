import { describe, expect, it } from 'vitest';
import { buildGrid, findPath, FLOOR_Y, GOALS, hideSpots, makeMap, priceFor, scoreHunt, type Haul, type ItemDef, type Theme } from './thriftData.ts';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const byId = (goal: 'furniture' | 'clothes', id: string): ItemDef => GOALS[goal].items.find((i) => i.id === id)!;
const haul = (goal: 'furniture' | 'clothes', ...ids: string[]): Haul[] => ids.map((id) => ({ def: byId(goal, id), price: byId(goal, id).price }));

describe('thrift catalog', () => {
  it('every need has at least two options and the cheapest full set fits the budget and the haul', () => {
    for (const g of Object.values(GOALS)) {
      let cost = 0;
      let lbs = 0;
      for (const n of g.needs) {
        const opts = g.items.filter((i) => i.need === n.need);
        expect(opts.length).toBeGreaterThanOrEqual(2);
        cost += Math.min(...opts.map((o) => o.price));
        lbs += Math.min(...opts.map((o) => o.lbs));
      }
      expect(cost).toBeLessThan(g.baseBudget * 0.7);
      expect(lbs).toBeLessThan(g.carry);
      expect(g.items.filter((i) => i.kind === 'junk').every((i) => i.retail === 0 && i.flag)).toBe(true);
    }
  });
  it('the priciest full set of furniture is too heavy to haul, so you have to choose', () => {
    const g = GOALS.furniture;
    const heavy = g.needs.reduce((s, n) => s + Math.max(...g.items.filter((i) => i.need === n.need).map((o) => o.lbs)), 0);
    expect(heavy).toBeGreaterThan(g.carry);
  });
  it('prices scale with the budget you were given', () => {
    const oak = byId('furniture', 'oak');
    expect(priceFor(oak, GOALS.furniture, 150)).toBe(oak.price);
    expect(priceFor(oak, GOALS.furniture, 300)).toBe(oak.price * 2);
  });
});

describe('thrift scoring', () => {
  it('rewards needs met, value and avoiding junk', () => {
    const perfect = scoreHunt(haul('furniture', 'futon', 'oak', 'armchair'), GOALS.furniture);
    expect(perfect.score).toBeGreaterThan(0.95);
    expect(perfect.got).toBe(3);
    expect(perfect.saved).toBeGreaterThan(500);
    const firstTimer = scoreHunt(haul('furniture', 'futon', 'kitchen', 'jlamp'), GOALS.furniture);
    expect(firstTimer.score).toBeGreaterThan(0.45);
    expect(firstTimer.score).toBeLessThan(0.8);
    const fullWithOneJunk = scoreHunt(haul('furniture', 'futon', 'kitchen', 'chairs', 'jmattress'), GOALS.furniture);
    expect(fullWithOneJunk.score).toBeGreaterThan(0.7);
    expect(fullWithOneJunk.score).toBeLessThan(perfect.score);
    const careless = scoreHunt(haul('furniture', 'jmattress', 'jcouch', 'kitchen', 'jchair'), GOALS.furniture);
    expect(careless.score).toBeLessThan(0.3);
    expect(careless.junk).toBe(3);
    expect(scoreHunt([], GOALS.furniture).score).toBe(0);
  });
  it('works for the clothes run too', () => {
    const r = scoreHunt(haul('clothes', 'wool', 'blazer', 'slacks'), GOALS.clothes);
    expect(r.score).toBeGreaterThan(0.95);
    expect(r.spent).toBe(55);
    const bad = scoreHunt(haul('clothes', 'jcoat', 'jshirt', 'khakis'), GOALS.clothes);
    expect(bad.score).toBeLessThan(0.3);
  });
});

describe('thrift maps', () => {
  it('every generated map is connected: you can reach every hiding spot from the door', () => {
    for (let seed = 1; seed < 120; seed++) {
      for (const th of ['thrift', 'flea', 'yard'] as Theme[]) {
        const m = makeMap(rng(seed), th);
        const grid = buildGrid(m.props);
        const hides = hideSpots(grid, m.props);
        expect(hides.length).toBeGreaterThanOrEqual(2);
        for (const [hx, hy] of hides) {
          expect(hy).toBeGreaterThan(FLOOR_Y);
          expect(findPath(grid, m.start[0], m.start[1], hx, hy).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { groceryBill } from '../content/minigames/grocery.ts';
import { BACK_SECTIONS, makeList, scoreTrip, tripTotals, type ListItem, type TripResult } from './groceryData.ts';

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
const cheap = (l: ListItem): 0 | 1 => (l.opts[0].price <= l.opts[1].price ? 0 : 1);
const pricey = (l: ListItem): 0 | 1 => (1 - cheap(l)) as 0 | 1;

describe('grocery list', () => {
  it('draws a sensible list every time', () => {
    for (let seed = 1; seed < 300; seed++) {
      const list = makeList(rng(seed));
      expect(list.length).toBeGreaterThanOrEqual(5);
      expect(list.length).toBeLessThanOrEqual(7);
      const low = list.reduce((s, l) => s + Math.min(l.opts[0].price, l.opts[1].price), 0);
      expect(low).toBeGreaterThan(45);
      expect(low).toBeLessThan(63);
      const aisles = new Set(list.filter((l) => !BACK_SECTIONS.includes(l.def.sec)).map((l) => l.def.sec));
      expect(aisles.size).toBeLessThanOrEqual(4);
      for (const l of list) {
        expect(list.filter((m) => m.def.sec === l.def.sec).length).toBeLessThanOrEqual(2);
        expect(l.opts[0].price).toBeGreaterThan(0);
        expect(l.opts[0].price).not.toBe(l.opts[1].price);
      }
    }
  });
});

describe('grocery scoring', () => {
  const trip = (seed: number, pick: (l: ListItem, i: number) => -1 | 0 | 1, extra: Partial<TripResult> = {}): TripResult => {
    const list = makeList(rng(seed));
    list.forEach((l, i) => (l.got = pick(l, i)));
    return { list, impulses: [], coupons: [1.5, 1], couponsTotal: 2, bumps: 0, ...extra };
  };
  it('a perfect trip scores 1', () => {
    for (let seed = 1; seed < 40; seed++) expect(scoreTrip(trip(seed, cheap))).toBe(1);
  });
  it('an attentive first trip lands around 0.6-0.8', () => {
    for (let seed = 1; seed < 40; seed++) {
      const t = trip(seed, (l, i) => (i === 0 ? pricey(l) : cheap(l)), { coupons: [1.5], impulses: [{ name: 'CHIPS', price: 4.79 }], bumps: 3 });
      const s = scoreTrip(t);
      expect(s).toBeGreaterThanOrEqual(0.6);
      expect(s).toBeLessThanOrEqual(0.82);
    }
  });
  it('a careless trip lands around 0.2-0.4', () => {
    for (let seed = 1; seed < 40; seed++) {
      const t = trip(seed, (l, i) => (i === 0 ? -1 : i % 2 ? pricey(l) : cheap(l)), {
        coupons: [],
        impulses: [
          { name: 'CHIPS', price: 4.79 },
          { name: 'SODA', price: 7.99 },
          { name: 'CANDY', price: 3.49 },
        ],
        bumps: 4,
      });
      const s = scoreTrip(t);
      expect(s).toBeGreaterThanOrEqual(0.15);
      expect(s).toBeLessThanOrEqual(0.42);
    }
  });
  it('the weekly bill matches the register and stays realistic', () => {
    for (let seed = 1; seed < 40; seed++) {
      const good = tripTotals(trip(seed, cheap));
      const bad = tripTotals(
        trip(seed, (l, i) => (i < 2 ? -1 : pricey(l)), {
          coupons: [],
          impulses: [
            { name: 'SODA', price: 7.99 },
            { name: 'CHIPS', price: 4.79 },
          ],
        }),
      );
      const gb = groceryBill(1, { total: good.total, missingCost: good.missingCost });
      const bb = groceryBill(0.2, { total: bad.total, missingCost: bad.missingCost });
      expect(gb).toBeGreaterThanOrEqual(50);
      expect(gb).toBeLessThanOrEqual(62);
      expect(bb).toBeGreaterThan(gb + 15);
      expect(bb).toBeLessThanOrEqual(120);
    }
    expect(groceryBill(0.4)).toBe(Math.round(85 * (1.3 - 0.2)));
  });
});

import { describe, expect, it } from 'vitest';
import { activeOrders, avgStars, blockedAt, focusOrder, MAX_EARN, newTown, reviewFor, routeDist, starsFor, stepTown, targetSlot, type TownControls, type TownSim } from './driveTown.ts';

// A decent driver: follows the GPS line, stops for hand-it-to-me drops, slows in the 15 zone.
function bot(g: TownSim): TownControls {
  const o = focusOrder(g);
  const c: TownControls = { ix: 0, iy: 0, throttle: 1, slow: false, boost: false };
  if (!o || g.route.length < 4) return c;
  const s = targetSlot(g, o);
  const near = Math.hypot(g.p.x - s.px, g.p.y - s.py);
  if (o.state === 'carry' && o.req === 'hand' && near < 9) return { ...c, slow: true };
  const k = Math.min(g.route.length / 2 - 1, 3);
  const tx = g.route[k * 2] - g.p.x;
  const ty = g.route[k * 2 + 1] - g.p.y;
  const l = Math.hypot(tx, ty) || 1;
  const tr = g.town.trap;
  const inTrap = g.p.x > tr.x - 12 && g.p.x < tr.x + tr.w + 12 && g.p.y > tr.y - 4 && g.p.y < tr.y + tr.h + 4;
  const ix = tx / l;
  const iy = ty / l;
  // brake for a car right in front
  const ahead = g.ai.some((a) => {
    const fx = (a.x - g.p.x) * ix + (a.y - g.p.y) * iy;
    const lat = Math.abs((a.x - g.p.x) * iy - (a.y - g.p.y) * ix);
    return fx > 0 && fx < 20 && lat < 9;
  });
  return { ix, iy, throttle: ahead ? 0.15 : near < 16 ? 0.6 : 1, slow: inTrap || ahead, boost: !inTrap && !ahead && g.routeLen > 120 };
}

function run(bike: boolean, seed: number, drive: (g: TownSim) => TownControls): TownSim {
  const g = newTown(bike, seed);
  for (let i = 0; i < 60 * 70 && !(g.phase === 'end' && g.endT > 1); i++) stepTown(g, drive(g), 1 / 60);
  return g;
}

describe('Delivery Rush town', () => {
  it('lays out a different, fully connected town every shift', () => {
    const a = newTown(false, 1);
    const b = newTown(false, 2);
    expect(JSON.stringify(a.town.district)).not.toEqual(JSON.stringify(b.town.district) + JSON.stringify(b.town.oneway));
    for (const g of [a, b, newTown(true, 3)]) {
      expect(blockedAt(g, g.p.x, g.p.y)).toBe(false);
      // every door and restaurant can be reached by road (respecting the one-way)
      for (const s of g.town.slots) expect(routeDist(g, g.p.x, g.p.y, s.i)).toBeLessThan(900);
      expect(g.town.rests).toHaveLength(4);
    }
  });

  it('rates drops from speed, heat and care', () => {
    expect(starsFor({ t: 20, T: 30, heat: 1, care: 1 })).toBe(5);
    expect(starsFor({ t: 2, T: 30, heat: 0.4, care: 0.3 })).toBeLessThanOrEqual(2);
    expect(starsFor({ t: -1, T: 30, heat: 1, care: 1 })).toBeLessThanOrEqual(2);
  });

  it('a GPS-following driver has a good shift in a car and on a bike', () => {
    for (const bike of [false, true]) {
      const scores: number[] = [];
      for (const seed of [11, 22, 33, 44, 55, 66]) {
        const g = run(bike, seed, bot);
        expect(g.phase).toBe('end');
        expect(g.delivered).toBeGreaterThanOrEqual(2);
        expect(g.earned).toBeLessThanOrEqual(bike ? MAX_EARN.bike : MAX_EARN.car);
        expect(avgStars(g)).toBeGreaterThanOrEqual(3);
        expect(reviewFor(g).length).toBeGreaterThan(5);
        scores.push(g.score);
      }
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      expect(mean).toBeGreaterThan(0.6);
      expect(mean).toBeLessThanOrEqual(1);
    }
  });

  it('an idle driver earns nothing and orders get reassigned', () => {
    const g = run(false, 5, () => ({ ix: 0, iy: 0, throttle: 1, slow: false, boost: false }));
    expect(g.delivered).toBe(0);
    expect(g.score).toBe(0);
    expect(g.missed).toBeGreaterThan(0);
    expect(activeOrders(g).length).toBeLessThanOrEqual(4);
  });
});

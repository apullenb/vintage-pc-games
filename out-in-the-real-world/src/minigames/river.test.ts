import { describe, expect, it } from 'vitest';
import { banks, botInput, buildCourse, LEN, newRiver, stepRiver, type RiverSim } from './riverSim.ts';

function float(seed: number, skill: number, trip = false): RiverSim {
  const g = newRiver(seed, trip);
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 150 && g.phase !== 'end'; i++) stepRiver(g, botInput(g, skill), dt);
  return g;
}

describe('river course', () => {
  it('builds the same river from the same seed, with every set piece in the water', () => {
    const a = buildCourse(7, false);
    const b = buildCourse(7, false);
    expect(a.rocks.length).toBe(b.rocks.length);
    expect(a.rocks.length).toBeGreaterThan(20);
    expect(a.falls.length).toBe(1);
    expect(a.ropes.length).toBe(1);
    expect(a.items.some((i) => i.kind === 'cooler')).toBe(true);
    expect(a.items.some((i) => i.kind === 'sandal')).toBe(true);
    for (const k of a.rocks) {
      const [L, R] = banks(a, k.d);
      expect(k.x).toBeGreaterThan(L);
      expect(k.x).toBeLessThan(R);
    }
  });
  it('keeps the river on screen and opens to the sea on the road trip', () => {
    const c = buildCourse(3, false);
    for (let d = 0; d < LEN; d += 25) {
      const [L, R] = banks(c, d);
      expect(L).toBeGreaterThan(4);
      expect(R).toBeLessThan(196);
      expect(R - L).toBeGreaterThan(90);
    }
    const t = buildCourse(3, true);
    const [L, R] = banks(t, LEN + 40);
    expect(R - L).toBeGreaterThan(200);
  });
});

describe('river run', () => {
  it('a careful floater finishes in about a minute and scores high', () => {
    const scores: number[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = float(seed, 1);
      expect(g.out).toBe(false);
      expect(g.gt).toBeGreaterThan(45);
      expect(g.gt).toBeLessThan(75);
      scores.push(g.score);
    }
    const avg = scores.reduce((a, b) => a + b) / scores.length;
    expect(avg).toBeGreaterThan(0.7);
  });
  it('an average floater lands in the middle', () => {
    const scores = [11, 12, 13, 14, 15].map((s) => float(s, 0.55).score);
    const avg = scores.reduce((a, b) => a + b) / scores.length;
    expect(avg).toBeGreaterThan(0.45);
    expect(avg).toBeLessThan(0.9);
  });
  it('drifting blindly ends badly', () => {
    const scores = [21, 22, 23, 24].map((s) => float(s, 0).score);
    const avg = scores.reduce((a, b) => a + b) / scores.length;
    expect(avg).toBeLessThan(0.35);
  });
  it('a head-on rock flips you and the river takes what you were holding', () => {
    const g = newRiver(5, false);
    while (g.phase === 'count') stepRiver(g, { steer: 0, paddle: false, brake: false }, 1 / 60);
    const k = g.c.rocks.find((r) => r.d > 300)!;
    g.held.push('chips');
    g.p.x = k.x;
    g.p.d = k.d - k.r - 12;
    g.p.vx = 0;
    g.p.vd = 60;
    g.p.inv = 0;
    for (let i = 0; i < 30 && g.wipes === 0; i++) stepRiver(g, { steer: 0, paddle: false, brake: false }, 1 / 60);
    expect(g.wipes).toBe(1);
    expect(g.held.length).toBe(0);
    expect(g.c.items.some((i) => i.lost && i.kind === 'chips')).toBe(true);
    // brief grace period after climbing back on, then you're vulnerable again
    for (let i = 0; i < 60 * 4; i++) stepRiver(g, { steer: 0, paddle: false, brake: false }, 1 / 60);
    expect(g.p.flip).toBe(0);
    expect(g.p.inv).toBe(0);
  });
  it('the road trip ends at the sea', () => {
    const g = float(9, 1, true);
    expect(g.phase).toBe('end');
    expect(g.p.d).toBeGreaterThan(LEN);
  });
});

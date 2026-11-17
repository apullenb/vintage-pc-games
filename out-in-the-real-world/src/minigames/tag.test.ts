import { describe, expect, it } from 'vitest';
import type { Person } from '../art/people.ts';
import { ARENAS, DIM_TIME, fire, FIELD, freeSpot, los, LIVES, newMatch, standings, stepMatch, tagScore, type Crew, type Mode } from './tagArena.ts';
import { angDiff, pushOut, seeded, segHitsBox } from './tagMath.ts';
import { alive, CAP, CRACKS, foodLeft, inMist, nearestCrack, newKitchen, roachScore, SEAL_TIME, sealedCount, stepKitchen, TIME, waveOf, type Kitchen } from './tagRoach.ts';

const P: Person = { skin: '#c98c62', hair: '#2a1b12', style: 0, shirt: '#3f7fd8', pants: '#34406a' };
const crew = (): Crew[] => [
  { name: 'Rae', p: P, color: '#ff4fd8', skill: 0.72, bold: 0.55, rival: 1 },
  { name: 'Theo', p: P, color: '#4fd8ff', skill: 0.48, bold: 0.35 },
  { name: 'Sam', p: P, color: '#ffb84f', skill: 0.42, bold: 0.9 },
  { name: 'Nico', p: P, color: '#b48cff', skill: 0.56, bold: 0.2 },
];
const me = { name: 'You', p: P, color: '#7cf08a' };

describe('tag geometry', () => {
  it('segment/box and push-out', () => {
    const b = { x: 10, y: 10, w: 10, h: 10 };
    expect(segHitsBox(0, 15, 30, 15, b)).toBe(true);
    expect(segHitsBox(0, 0, 30, 0, b)).toBe(false);
    expect(segHitsBox(0, 0, 5, 5, b)).toBe(false);
    const [x, y] = pushOut(15, 9, 4, b);
    expect(y).toBeCloseTo(6);
    expect(x).toBe(15);
    expect(Math.abs(angDiff(3, -3))).toBeLessThan(0.3);
  });
});

describe('laser tag arenas', () => {
  it('every spawn, flag spot and the centre of the nav grid is open floor', () => {
    for (const a of ARENAS) {
      for (const [x, y] of a.spawns) expect(freeSpot(a, x, y), `${a.name} spawn ${x},${y}`).toBe(true);
      for (const [x, y] of a.flagSpots) expect(freeSpot(a, x, y, 8), `${a.name} flag ${x},${y}`).toBe(true);
      for (const o of a.obs) {
        expect(o.x).toBeGreaterThanOrEqual(FIELD.x0);
        expect(o.x + o.w).toBeLessThanOrEqual(FIELD.x1);
      }
    }
  });
  it('cover blocks line of sight', () => {
    const m = newMatch(ARENAS[0], 'ffa', me, crew(), seeded(1));
    const wall = ARENAS[0].obs.find((o) => o.kind === 'wall')!;
    const cx = wall.x + wall.w / 2;
    expect(los(m, cx, wall.y - 10, cx, wall.y + wall.h + 10)).toBe(false);
    expect(los(m, 20, 34, 236, 34)).toBe(true);
  });
});

describe('laser tag rules', () => {
  it('a bolt tags, dims the vest, and a shield blocks one hit', () => {
    const m = newMatch(ARENAS[0], 'ffa', me, crew(), seeded(2));
    const [a, b] = m.agents;
    a.x = 20;
    a.y = 128;
    b.x = 60;
    b.y = 128;
    for (const o of m.agents.slice(2)) o.x = 236;
    fire(m, a, 0);
    for (let i = 0; i < 30; i++) stepMatch(m, 1 / 60, null);
    expect(a.tags).toBe(1);
    expect(b.tagged).toBe(1);
    expect(b.dim).toBeGreaterThan(DIM_TIME - 0.6);
    // dimmed vests can't be tagged again
    fire(m, a, 0);
    for (let i = 0; i < 30; i++) stepMatch(m, 1 / 60, null);
    expect(b.tagged).toBe(1);
    // shield
    b.dim = 0;
    b.prot = 0;
    b.shield = 5;
    b.x = 60;
    b.y = 128;
    fire(m, a, Math.atan2(b.y - 1 - (a.y - 1), b.x - a.x));
    for (let i = 0; i < 30; i++) stepMatch(m, 1 / 60, null);
    expect(b.tagged).toBe(1);
    expect(b.shield).toBe(0);
    expect(m.ev.some((e) => e.k === 'block')).toBe(true);
  });

  it('holding the trigger overheats the blaster', () => {
    const m = newMatch(ARENAS[1], 'ffa', me, crew(), seeded(3));
    let heated = false;
    for (let i = 0; i < 240 && !heated; i++) {
      stepMatch(m, 1 / 60, { mx: 0, my: 0, aim: -Math.PI / 2, fire: true });
      heated = m.agents[0].hot > 0;
    }
    expect(heated).toBe(true);
  });

  it.each(['ffa', 'flag', 'lms'] as Mode[])('friends play a whole %s round on their own', (mode) => {
    for (let seed = 1; seed <= 3; seed++) {
      const m = newMatch(ARENAS[seed % ARENAS.length], mode, me, crew(), seeded(seed * 17));
      m.agents[0].x = 128;
      m.agents[0].y = 132;
      let steps = 0;
      while (!m.over && steps < 60 * 80) {
        stepMatch(m, 1 / 60, { mx: 0, my: 0, aim: 0, fire: false });
        m.ev.length = 0;
        steps++;
      }
      expect(m.over).toBe(true);
      const ai = m.agents.slice(1);
      const tags = ai.reduce((s, a) => s + a.tags, 0);
      expect(tags).toBeGreaterThan(mode === 'lms' ? 4 : 10);
      // nobody ends up inside cover or outside the arena
      for (const a of m.agents) {
        expect(freeSpot(m.arena, a.x, a.y, 2)).toBe(true);
      }
      if (mode === 'lms') expect(m.agents.filter((a) => !a.out).length >= 1 && m.agents.every((a) => a.lives <= LIVES)).toBe(true);
      const st = standings(m);
      expect(st).toHaveLength(5);
    }
  });

  it('score: rank and tag ratio', () => {
    expect(tagScore(1, 5, 20, 4)).toBe(1);
    const mid = tagScore(2, 5, 12, 10);
    expect(mid).toBeGreaterThan(0.6);
    expect(mid).toBeLessThan(0.85);
    const careless = tagScore(5, 5, 3, 14);
    expect(careless).toBeGreaterThan(0.15);
    expect(careless).toBeLessThan(0.35);
    expect(tagScore(3, 5, 9, 9)).toBeGreaterThan(tagScore(4, 5, 9, 9));
  });
});

// A tidy exterminator: seals what's open nearby, otherwise walks to the nearest roach and sprays it.
function tidy(k: Kitchen): { mx: number; my: number; aim: number; spray: boolean; seal: boolean } {
  const c = nearestCrack(k, k.px, k.py);
  if (c >= 0) return { mx: 0, my: 0, aim: k.aim, spray: false, seal: true };
  const open = k.cracks.filter((cr) => !cr.sealed && cr.wave <= k.wave);
  const vis = k.roaches.filter((r) => r.st !== 'down' && r.st !== 'hide');
  const near = (a: { x: number; y: number }) => Math.hypot(a.x - k.px, a.y - k.py);
  vis.sort((a, b) => near(a) - near(b));
  open.sort((a, b) => near(a) - near(b));
  let tx = k.px;
  let ty = k.py;
  if (open.length && (!vis.length || near(vis[0]) > 30)) [tx, ty] = [open[0].x, open[0].y];
  else if (vis.length) [tx, ty] = [vis[0].x, vis[0].y + 12];
  else if (k.roaches.length) [tx, ty] = [k.roaches[0].x, k.roaches[0].y + 16];
  const d = Math.hypot(tx - k.px, ty - k.py) || 1;
  const target = vis[0] ?? k.roaches[0];
  const aim = target ? Math.atan2(target.y - (k.py - 9), target.x - k.px) : k.aim;
  return { mx: (tx - k.px) / d, my: (ty - k.py) / d, aim, spray: !!target && near(target) < 50, seal: false };
}

describe('roach patrol', () => {
  it('cracks open in waves and spawn roaches until sealed', () => {
    const k = newKitchen(seeded(5));
    expect(CRACKS.filter((c) => c.wave === 1).length).toBeGreaterThan(0);
    expect(waveOf(0)).toBe(1);
    expect(waveOf(TIME - 1)).toBe(3);
    const start = k.roaches.length;
    for (let i = 0; i < 60 * 12; i++) stepKitchen(k, 1 / 60, null);
    expect(k.born).toBeGreaterThan(0);
    expect(k.roaches.length).toBeGreaterThan(start);
    // a crack that hasn't opened yet can't be sealed
    const late = k.cracks.findIndex((c) => c.wave === 3);
    k.px = k.cracks[late].x + 4;
    k.py = 124;
    expect(nearestCrack(k, k.cracks[late].x, k.cracks[late].y)).toBe(-1);
  });

  it('standing on a crack and pressing seal closes it', () => {
    const k = newKitchen(seeded(6));
    const c = k.cracks.findIndex((cr) => cr.wave === 1);
    k.px = Math.max(10, k.cracks[c].x + 6);
    k.py = Math.min(136, Math.max(52, k.cracks[c].y));
    stepKitchen(k, 1 / 60, { mx: 0, my: 0, aim: 0, spray: false, seal: true });
    expect(k.seal).not.toBeNull();
    for (let i = 0; i < Math.ceil(SEAL_TIME * 60) + 2; i++) stepKitchen(k, 1 / 60, { mx: 0, my: 0, aim: 0, spray: false, seal: false });
    expect(k.cracks[c].sealed).toBe(true);
    expect(sealedCount(k)).toBe(1);
  });

  it('the mist splats roaches, scares the rest, and the tank runs dry', () => {
    const k = newKitchen(seeded(7));
    k.roaches = [];
    k.px = 100;
    k.py = 100;
    const victim = { ...newKitchen(seeded(8)).roaches[0], x: 125, y: 91, st: 'pause' as const, t: 5 };
    k.roaches.push(victim);
    const aim = Math.atan2(victim.y - 91, victim.x - 100);
    k.aim = aim;
    expect(inMist(k, victim.x, victim.y)).toBe(true);
    for (let i = 0; i < 20; i++) stepKitchen(k, 1 / 60, { mx: 0, my: 0, aim, spray: true, seal: false });
    expect(k.killed).toBe(1);
    expect(k.ev.some((e) => e.k === 'splat')).toBe(true);
    for (let i = 0; i < 60 * 4; i++) stepKitchen(k, 1 / 60, { mx: 0, my: 0, aim, spray: true, seal: false });
    expect(k.ev.some((e) => e.k === 'empty')).toBe(true);
  });

  it('left alone they multiply (up to a cap) and eat the food', () => {
    const k = newKitchen(seeded(9));
    for (let i = 0; i < 60 * TIME + 5; i++) stepKitchen(k, 1 / 60, null);
    expect(k.over).toBe(true);
    expect(alive(k)).toBeGreaterThan(20);
    expect(k.roaches.length).toBeLessThanOrEqual(CAP);
    expect(foodLeft(k)).toBeLessThan(0.8);
    const s = roachScore(sealedCount(k), k.cracks.length, alive(k), foodLeft(k), k.won);
    expect(s).toBeLessThan(0.35);
  });

  it('a tidy player clears the kitchen', () => {
    let wins = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const k = newKitchen(seeded(seed * 31));
      while (!k.over) stepKitchen(k, 1 / 60, tidy(k));
      const s = roachScore(sealedCount(k), k.cracks.length, alive(k), foodLeft(k), k.won);
      expect(sealedCount(k)).toBe(k.cracks.length);
      expect(s).toBeGreaterThan(0.6);
      if (k.won) wins++;
    }
    expect(wins).toBeGreaterThan(0);
  });

  it('score: perfect is 1, sloppy is low', () => {
    expect(roachScore(5, 5, 0, 1, true)).toBeCloseTo(1);
    expect(roachScore(0, 5, 30, 0, false)).toBeLessThan(0.2);
    const ok = roachScore(4, 5, 5, 0.7, false);
    expect(ok).toBeGreaterThan(0.55);
    expect(ok).toBeLessThan(0.8);
  });
});

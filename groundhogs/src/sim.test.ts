import { describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { Terrain } from './terrain.ts';
import { InvariantChecker } from './invariants.ts';
import { DIRT, EMPTY, MOUND, PAD_REACH, PLANK, PLANK_COUNT, PLANK_W, PLANT_TICKS, NAP_TICKS, ROCK, VIEW_H } from './types.ts';
import type { GameEvent, Groundhog, LevelDef, Shape } from './types.ts';

const FLOOR = 200; // ground top row; standing feet at FLOOR - 1
const FEET = FLOOR - 1;

function level(over: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 't', name: 'test', width: 480, theme: 'meadow', shapes: [floor()], entrances: [], exits: [],
    hazards: [], count: 0, required: 0, releaseRate: 50, timeLimit: 600, skills: {}, ...over,
  };
}

function floor(y = FLOOR): Shape {
  return { kind: 'rect', x: 0, y, w: 480, h: VIEW_H - y };
}

function run(game: Game, ticks: number, until?: () => boolean): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    game.tick();
    ev.push(...game.drainEvents());
    if (until?.()) break;
  }
  return ev;
}

function walker(game: Game, x: number, y = FEET, dir: 1 | -1 = 1): Groundhog {
  return game.addGroundhog(x, y, dir, 'walking');
}

describe('terrain', () => {
  it('paints shapes in order with erase and rock', () => {
    const t = new Terrain(level({
      shapes: [
        { kind: 'rect', x: 10, y: 10, w: 20, h: 20 },
        { kind: 'rect', x: 15, y: 15, w: 5, h: 5, erase: true },
        { kind: 'ellipse', cx: 100, cy: 100, rx: 10, ry: 5, mat: 'rock' },
        { kind: 'poly', points: [[200, 50], [240, 90], [160, 90]] },
      ],
    }));
    expect(t.get(10, 10)).toBe(DIRT);
    expect(t.get(29, 29)).toBe(DIRT);
    expect(t.get(30, 30)).toBe(EMPTY);
    expect(t.get(16, 16)).toBe(EMPTY);
    expect(t.get(100, 100)).toBe(ROCK);
    expect(t.get(110, 100)).toBe(ROCK);
    expect(t.get(100, 106)).toBe(EMPTY);
    expect(t.get(200, 50)).toBe(DIRT); // apex
    expect(t.get(200, 70)).toBe(DIRT);
    expect(t.get(160, 90)).toBe(DIRT); // edge inclusive
    expect(t.get(170, 60)).toBe(EMPTY);
    expect(t.get(-1, 5)).toBe(EMPTY);
    expect(t.takeDirty()).toEqual([]);
  });

  it('erasers keep rock and mark dirty; planks fill only empty', () => {
    const t = new Terrain(level({ shapes: [{ kind: 'rect', x: 0, y: 0, w: 20, h: 20 }, { kind: 'rect', x: 5, y: 5, w: 2, h: 2, mat: 'rock' }] }));
    expect(t.eraseRect(0, 0, 4, 4).hitRock).toBe(false);
    expect(t.get(3, 3)).toBe(EMPTY);
    expect(t.eraseCircle(6, 6, 3).hitRock).toBe(true);
    expect(t.get(5, 5)).toBe(ROCK);
    expect(t.get(8, 6)).toBe(EMPTY);
    t.fillPlank(15, 25, 10);
    expect(t.get(15, 25)).toBe(PLANK);
    expect(t.takeDirty().length).toBe(3);
    expect(t.takeDirty().length).toBe(0);
  });
});

describe('walking', () => {
  it('crosses flat ground and turns at a wall', () => {
    const g = new Game(level({ shapes: [floor(), { kind: 'rect', x: 300, y: 150, w: 10, h: 50 }] }));
    const w = walker(g, 50);
    let maxX = 0;
    run(g, 400, () => { maxX = Math.max(maxX, w.x); return false; });
    expect(maxX).toBe(299);
    expect(w.y).toBe(FEET);
    expect(w.dir).toBe(-1);
    expect(w.x).toBeLessThan(200);
    expect(w.state).toBe('walking');
  });

  it('steps up 6px but turns at 7px', () => {
    const g = new Game(level({ shapes: [floor(), { kind: 'rect', x: 100, y: FLOOR - 6, w: 30, h: 6 }, { kind: 'rect', x: 200, y: FLOOR - 7, w: 30, h: 7 }] }));
    const w = walker(g, 80);
    let topY = 999, maxX = 0;
    run(g, 300, () => { topY = Math.min(topY, w.y); maxX = Math.max(maxX, w.x); return false; });
    expect(topY).toBe(FEET - 6);
    expect(maxX).toBe(199);
    expect(w.dir).toBe(-1);
  });

  it('steps down small drops without falling', () => {
    const g = new Game(level({ shapes: [floor(), { kind: 'rect', x: 0, y: FLOOR - 3, w: 100, h: 3 }] }));
    const w = walker(g, 80, FEET - 3);
    const states = new Set<string>();
    run(g, 40, () => { states.add(w.state); return false; });
    expect(states.has('falling')).toBe(false);
    expect(w.y).toBe(FEET);
  });

  it('turns at the world edge', () => {
    const g = new Game(level());
    const w = walker(g, 470);
    run(g, 30);
    expect(w.dir).toBe(-1);
    expect(w.x).toBeLessThanOrEqual(476);
  });
});

describe('falling', () => {
  it('long fall splats', () => {
    const g = new Game(level());
    const w = g.addGroundhog(100, 100);
    const ev = run(g, 100);
    expect(ev).toContainEqual({ type: 'splat', id: w.id });
    expect(w.state).toBe('dead');
    expect(g.dead).toBe(1);
  });

  it('short fall lands safely', () => {
    const g = new Game(level());
    const w = g.addGroundhog(100, FEET - 60);
    run(g, 40);
    expect(w.state).toBe('walking');
  });

  it('glider survives a long fall', () => {
    const g = new Game(level({ skills: { glider: 1 } }));
    const w = g.addGroundhog(100, 10);
    expect(g.assignSkill(w, 'glider')).toBe(true);
    const states = new Set<string>();
    run(g, 400, () => { states.add(w.state); return w.state === 'walking'; });
    expect(states.has('gliding')).toBe(true);
    expect(w.state).toBe('walking');
    expect(w.y).toBe(FEET);
    expect(g.assignSkill(w, 'glider')).toBe(false);
  });

  it('falling off the bottom kills', () => {
    const g = new Game(level({ shapes: [] }));
    const w = g.addGroundhog(100, 200);
    run(g, 30);
    expect(w.state).toBe('dead');
  });
});

describe('climbing', () => {
  it('climber scales a wall and walks on top', () => {
    const g = new Game(level({ skills: { climber: 1 }, shapes: [floor(), { kind: 'rect', x: 150, y: 150, w: 40, h: 50 }] }));
    const w = walker(g, 120);
    g.assignSkill(w, 'climber');
    const states = new Set<string>();
    run(g, 200, () => { states.add(w.state); return w.x > 160; });
    expect(states.has('climbing')).toBe(true);
    expect(states.has('hoisting')).toBe(true);
    expect(w.y).toBe(149);
    expect(w.state).toBe('walking');
  });
});

describe('digging', () => {
  it('burrower digs through a dirt slab and falls out the bottom', () => {
    const g = new Game(level({ skills: { burrower: 1 }, shapes: [floor(), { kind: 'rect', x: 60, y: 140, w: 100, h: 20 }] }));
    const w = walker(g, 100, 139);
    expect(g.assignSkill(w, 'burrower')).toBe(true);
    const states = new Set<string>();
    run(g, 200, () => { states.add(w.state); return false; });
    expect(states.has('falling')).toBe(true);
    expect(w.state).toBe('walking');
    expect(w.y).toBe(FEET);
    expect(g.terrain.get(100, 150)).toBe(EMPTY);
    expect(g.terrain.get(96, 150)).toBe(EMPTY);
    expect(g.terrain.get(94, 150)).toBe(DIRT);
  });

  it('burrower stops on rock', () => {
    const g = new Game(level({
      skills: { burrower: 1 },
      shapes: [floor(), { kind: 'rect', x: 60, y: 140, w: 100, h: 10 }, { kind: 'rect', x: 60, y: 150, w: 100, h: 10, mat: 'rock' }],
    }));
    const w = walker(g, 100, 139);
    g.assignSkill(w, 'burrower');
    run(g, 100);
    expect(w.y).toBe(149);
    expect(w.state).toBe('walking');
    expect(g.terrain.get(100, 150)).toBe(ROCK);
  });

  it('tunneler passes through a dirt wall', () => {
    const g = new Game(level({ skills: { tunneler: 1 }, shapes: [floor(), { kind: 'rect', x: 200, y: 150, w: 30, h: 50 }] }));
    const w = walker(g, 195);
    expect(g.assignSkill(w, 'tunneler')).toBe(true);
    run(g, 200, () => w.x > 260);
    expect(w.x).toBeGreaterThan(260);
    expect(w.y).toBe(FEET);
    expect(w.state).toBe('walking');
    expect(g.terrain.get(215, 192)).toBe(EMPTY);
    expect(g.terrain.get(215, 185)).toBe(DIRT);
  });

  it('tunneler turns around at rock', () => {
    const g = new Game(level({ skills: { tunneler: 1 }, shapes: [floor(), { kind: 'rect', x: 200, y: 150, w: 10, h: 50 }, { kind: 'rect', x: 210, y: 150, w: 10, h: 50, mat: 'rock' }] }));
    const w = walker(g, 195);
    g.assignSkill(w, 'tunneler');
    run(g, 60);
    expect(w.state).toBe('walking');
    expect(w.dir).toBe(-1);
    expect(g.terrain.get(210, 195)).toBe(ROCK);
  });

  it('scraper digs diagonally down', () => {
    const g = new Game(level({ skills: { scraper: 1 } }));
    const w = walker(g, 100);
    g.assignSkill(w, 'scraper');
    const states = new Set<string>();
    run(g, 60, () => { states.add(w.state); return false; });
    expect(states.has('falling')).toBe(false);
    expect(w.state).toBe('scraping');
    expect(w.x).toBeGreaterThanOrEqual(118);
    expect(w.y).toBeGreaterThanOrEqual(FEET + 9);
    expect(g.terrain.isSolid(w.x, w.y + 1)).toBe(true);
  });
});

describe('planker', () => {
  it('builds 12 planks and a walker can walk up them', () => {
    const g = new Game(level({ skills: { planker: 1 } }));
    const p = walker(g, 100);
    expect(g.assignSkill(p, 'planker')).toBe(true);
    const ev = run(g, PLANK_COUNT * 8 + 4);
    expect(ev).toContainEqual({ type: 'plank-low', id: p.id });
    let planks = 0;
    for (const v of g.terrain.mask) if (v === PLANK) planks++;
    expect(planks).toBe(PLANK_COUNT * PLANK_W);
    expect(p.state).toBe('shrugging');
    expect(p.y).toBe(FEET - PLANK_COUNT * 2);

    const w = walker(g, 60);
    let topY = 999;
    run(g, 80, () => { topY = Math.min(topY, w.y); return false; });
    const topPlankRow = FEET - 1 - (PLANK_COUNT - 1) * 2;
    expect(topY).toBe(topPlankRow - 1);
  });

  it('planker stands on each plank it lays (no hover), both directions', () => {
    for (const dir of [1, -1] as const) {
      const g = new Game(level({ skills: { planker: 1 } }));
      const p = walker(g, 240, FEET, dir);
      g.assignSkill(p, 'planker');
      for (let i = 0; i < PLANK_COUNT * 8; i++) {
        g.tick();
        expect(g.terrain.isSolid(p.x, p.y + 1)).toBe(true);
      }
      expect(p.state).toBe('shrugging');
    }
  });

  it('refills when re-assigned and turns when its head would hit terrain', () => {
    const g = new Game(level({ skills: { planker: 2 }, shapes: [floor(), { kind: 'rect', x: 100, y: 0, w: 300, h: 180 }] }));
    const p = walker(g, 80);
    g.assignSkill(p, 'planker');
    run(g, 20);
    expect(g.assignSkill(p, 'planker')).toBe(true);
    expect(p.work).toBe(PLANK_COUNT);
    run(g, 100);
    expect(p.state).toBe('walking');
    expect(p.dir).toBe(-1);
  });
});

describe('sentry', () => {
  it('turns walkers from both sides', () => {
    const g = new Game(level({ skills: { sentry: 1 } }));
    const s = walker(g, 200);
    expect(g.assignSkill(s, 'sentry')).toBe(true);
    const a = walker(g, 150, FEET, 1);
    const b = walker(g, 250, FEET, -1);
    let aMax = 0, bMin = 999;
    run(g, 300, () => { aMax = Math.max(aMax, a.x); bMin = Math.min(bMin, b.x); return false; });
    expect(aMax).toBeLessThan(200);
    expect(bMin).toBeGreaterThan(200);
    expect(s.state).toBe('sentry');
  });

  it('falls when ground is removed', () => {
    const g = new Game(level({ skills: { sentry: 1 } }));
    const s = walker(g, 200);
    g.assignSkill(s, 'sentry');
    g.terrain.eraseRect(190, FLOOR, 20, 10);
    run(g, 1);
    expect(s.state).toBe('falling');
  });
});

describe('exits, hazards and status', () => {
  it('exit saves and level is won', () => {
    const g = new Game(level({ exits: [{ x: 150, y: FEET }], required: 1 }));
    const w = walker(g, 100);
    const ev = run(g, 200);
    expect(ev).toContainEqual({ type: 'saved', id: w.id });
    expect(w.state).toBe('saved');
    expect(g.saved).toBe(1);
    expect(g.status).toBe('won');
    expect(ev).toContainEqual({ type: 'end', won: true });
  });

  it('lost when not enough saved', () => {
    const g = new Game(level({ exits: [{ x: 150, y: FEET }], required: 2 }));
    walker(g, 100);
    run(g, 200);
    expect(g.status).toBe('lost');
  });

  it('lost when time runs out', () => {
    const g = new Game(level({ timeLimit: 1, required: 1 }));
    walker(g, 100);
    const ev = run(g, 30);
    expect(g.status).toBe('lost');
    expect(ev).toContainEqual({ type: 'end', won: false });
    const t = g.ticks;
    g.tick();
    expect(g.ticks).toBe(t);
  });

  it('hazard drowns', () => {
    const g = new Game(level({ hazards: [{ kind: 'water', x: 150, y: 190, w: 30, h: 10 }] }));
    const w = walker(g, 120);
    const ev = run(g, 100);
    expect(ev).toContainEqual({ type: 'drown', id: w.id });
    expect(w.state).toBe('dead');
  });
});

describe('spawning and alarm', () => {
  it('opens hatch then releases count groundhogs alternating entrances', () => {
    const g = new Game(level({ entrances: [{ x: 100, y: 150 }, { x: 300, y: 150 }], count: 3, releaseRate: 99 }));
    const xs: number[] = [];
    const ev = run(g, 200, () => {
      for (const h of g.groundhogs) if (xs.length < h.id) xs.push(h.x);
      return false;
    });
    expect(ev.filter((e) => e.type === 'hatch-open').length).toBe(1);
    expect(ev.filter((e) => e.type === 'spawn').length).toBe(3);
    expect(g.hatchOpen).toBe(1);
    expect(g.spawned).toBe(3);
    expect(xs).toEqual([100, 300, 100]);
    expect(g.groundhogs[0].dir).toBe(1);
  });

  it('release rate clamps to level minimum', () => {
    const g = new Game(level({ releaseRate: 40 }));
    g.setReleaseRate(10);
    expect(g.releaseRate).toBe(40);
    g.setReleaseRate(200);
    expect(g.releaseRate).toBe(99);
  });

  it('alarm poofs everyone and ends the level', () => {
    const g = new Game(level({ entrances: [{ x: 100, y: 150 }], count: 10, releaseRate: 99, required: 1 }));
    run(g, 70);
    const n = g.spawned;
    expect(n).toBeGreaterThan(0);
    g.alarm();
    expect(g.groundhogs.every((h) => h.alarmTicks === 72)).toBe(true);
    run(g, 120);
    expect(g.spawned).toBe(n);
    expect(g.dead).toBe(n);
    expect(g.status).toBe('lost');
  });
});

describe('assign & pick', () => {
  it('requires charges and valid state', () => {
    const g = new Game(level({ skills: { sentry: 1, burrower: 1 } }));
    const f = g.addGroundhog(100, 50);
    expect(g.assignSkill(f, 'sentry')).toBe(false);
    expect(g.assignSkill(f, 'climber')).toBe(false); // no charges
    const w = walker(g, 200);
    expect(g.assignSkill(w, 'sentry')).toBe(true);
    expect(g.skillsLeft.sentry).toBe(0);
    expect(g.assignSkill(w, 'burrower')).toBe(false);
    const ev = g.drainEvents();
    expect(ev.filter((e) => e.type === 'assign-fail').length).toBe(3);
  });

  it('pickAt prefers applicable groundhogs', () => {
    const g = new Game(level({ skills: { burrower: 5 } }));
    const a = walker(g, 100);
    const b = walker(g, 103);
    g.assignSkill(a, 'burrower');
    expect(g.pickAt(101, FEET - 5, 'burrower')).toBe(b);
    expect(g.pickAt(101, FEET - 5, null)).toBe(a);
    expect(g.pickAt(150, FEET - 5, null)).toBe(null);
  });
});

const rect = (x: number, y: number, w: number, h: number, mat?: 'rock'): Shape =>
  mat ? { kind: 'rect', x, y, w, h, mat } : { kind: 'rect', x, y, w, h };

describe('popper', () => {
  it('popping a sentry releases the walkers it held', () => {
    const g = new Game(level({ skills: { sentry: 1, popper: 1 } }));
    const s = walker(g, 200);
    g.assignSkill(s, 'sentry');
    const w = walker(g, 150);
    run(g, 100);
    expect(w.x).toBeLessThan(200);
    expect(g.assignSkill(s, 'popper')).toBe(true);
    expect(s.alarmTicks).toBe(72);
    expect(g.assignSkill(s, 'popper')).toBe(false); // already counting down
    run(g, 60);
    expect(s.state).toBe('sentry'); // still holding during the countdown
    run(g, 600, () => w.x > 220);
    expect(s.state).toBe('dead');
    expect(w.x).toBeGreaterThan(220);
  });

  it('crater clears dirt but never rock', () => {
    const g = new Game(level({ skills: { popper: 1 }, shapes: [floor(), rect(0, FLOOR + 2, 480, 10, 'rock')] }));
    const p = walker(g, 200);
    p.dir = 1;
    g.assignSkill(p, 'popper');
    run(g, 72);
    expect(p.state).toBe('poofing');
    expect(g.terrain.get(p.x, FLOOR)).toBe(EMPTY);
    expect(g.terrain.get(p.x, FLOOR + 2)).toBe(ROCK);
    run(g, 30);
    expect(p.state).toBe('dead');
  });

  it('works on a faller, which pops in mid-air', () => {
    const g = new Game(level({ skills: { popper: 1, glider: 1 } }));
    const f = g.addGroundhog(100, 20);
    g.assignSkill(f, 'glider');
    expect(g.assignSkill(f, 'popper')).toBe(true);
    run(g, 72);
    expect(f.state).toBe('poofing');
    expect(f.y).toBeLessThan(FEET);
    run(g, 30);
    expect(g.dead).toBe(1);
  });

  it('alarm keeps a running popper countdown', () => {
    const g = new Game(level({ skills: { popper: 1 } }));
    const p = walker(g, 100);
    g.assignSkill(p, 'popper');
    run(g, 30);
    g.alarm();
    expect(p.alarmTicks).toBe(42);
  });
});

describe('physics regressions', () => {
  it('hoisting groundhog already stands on the ledge top', () => {
    const g = new Game(level({ skills: { climber: 1 }, shapes: [floor(), rect(150, 170, 40, 30)] }));
    const w = walker(g, 140);
    g.assignSkill(w, 'climber');
    run(g, 100, () => w.state === 'hoisting');
    expect(w.state).toBe('hoisting');
    expect(w.x).toBe(150);
    expect(w.y).toBe(169);
    expect(g.terrain.isSolid(w.x, w.y + 1)).toBe(true);
  });

  it('climber does not climb out of the top of the world', () => {
    const g = new Game(level({ skills: { climber: 1 }, shapes: [floor(), rect(150, 0, 40, 200)] }));
    const w = walker(g, 140);
    g.assignSkill(w, 'climber');
    let minY = 999;
    run(g, 300, () => { minY = Math.min(minY, w.y); return false; });
    expect(minY).toBeGreaterThanOrEqual(9);
    expect(w.dir).toBe(-1);
  });

  it('walkers turn at a gap too low for their body', () => {
    const g = new Game(level({ shapes: [floor(), rect(200, 0, 40, FLOOR - 6)] }));
    const w = walker(g, 180);
    let maxX = 0;
    run(g, 60, () => { maxX = Math.max(maxX, w.x); return false; });
    expect(maxX).toBe(199);
    expect(w.dir).toBe(-1);
  });

  it('walkers duck under a knee-high plank they have no room to climb onto', () => {
    const g = new Game(level({ shapes: [floor(), rect(150, 0, 60, FLOOR - 11)] }));
    g.terrain.fillPlank(170, FEET - 1, 6);
    const w = walker(g, 160);
    run(g, 40);
    expect(w.x).toBeGreaterThan(185);
    expect(w.y).toBe(FEET);
  });

  it('a plank laid across feet in a low tunnel is walked through, not a trap', () => {
    const g = new Game(level({ shapes: [floor(), rect(0, 0, 480, FLOOR - 10)] }));
    const w = walker(g, 100);
    g.terrain.fillPlank(97, FEET, 12);
    run(g, 20);
    expect(w.x).toBeGreaterThan(112);
    expect(w.y).toBe(FEET);
  });

  it('a walker whose ground vanishes spends that tick dropping', () => {
    const g = new Game(level());
    const w = walker(g, 100);
    g.terrain.eraseRect(90, FLOOR, 20, 3);
    run(g, 1);
    expect(w.x).toBe(100);
    expect(w.y).toBe(FEET + 3);
  });

  it('burrower falls as soon as nothing is under it', () => {
    const g = new Game(level({ skills: { burrower: 1 }, shapes: [floor(), rect(60, 140, 100, 3)] }));
    const w = walker(g, 100, 139);
    g.assignSkill(w, 'burrower');
    let fellAt = -1;
    run(g, 20, () => { if (w.state === 'falling') fellAt = w.y; return fellAt >= 0; });
    expect(fellAt).toBe(142);
  });

  it('scraper clears its own headroom under a low ceiling', () => {
    const g = new Game(level({ skills: { scraper: 1 }, shapes: [floor(), rect(0, 0, 480, FLOOR - 10)] }));
    const w = walker(g, 100);
    g.assignSkill(w, 'scraper');
    for (let i = 0; i < 60; i++) {
      g.tick();
      for (let y = w.y - 9; y <= w.y; y++) expect(g.terrain.isSolid(w.x, y)).toBe(false);
    }
    expect(w.state).toBe('scraping');
  });
});

// Keeps the game alive (count > spawned) and checks physics invariants every tick.
function live(over: Partial<LevelDef> = {}): { g: Game; run: (n: number, until?: () => boolean) => GameEvent[] } {
  const g = new Game(level({ count: 99, ...over }));
  const ck = new InvariantChecker(g);
  return {
    g,
    run(n, until) {
      const ev: GameEvent[] = [];
      for (let i = 0; i < n; i++) {
        g.tick();
        ck.check();
        ev.push(...g.drainEvents());
        if (until?.()) break;
      }
      return ev;
    },
  };
}

/** Plants a pad at x with a throwaway bouncer; returns once it is planted. */
function plant(g: Game, run: (n: number) => unknown, x: number, y = FEET): void {
  const b = g.addGroundhog(x, y, 1, 'walking');
  g.skillsLeft.bouncer++;
  expect(g.assignSkill(b, 'bouncer')).toBe(true);
  run(PLANT_TICKS + 1);
  expect(g.pads.some((p) => p.x === x && p.y === y)).toBe(true);
}

describe('popper blasts', () => {
  it('blasts through a 6px dirt floor; neighbours fall through', () => {
    const { g, run } = live({ skills: { popper: 1 }, shapes: [floor(), rect(0, 100, 480, 6)] });
    const p = g.addGroundhog(140, 99, 1, 'sentry');
    const n = g.addGroundhog(136, 99, 1, 'sentry');
    g.assignSkill(p, 'popper');
    run(72);
    expect(g.terrain.get(140, 105)).toBe(EMPTY);
    run(30);
    expect(n.y).toBeGreaterThan(110);
    const w = walker(g, 120, 99);
    run(200, () => w.y === FEET);
    expect(w.y).toBe(FEET);
  });

  it('a popper waits pressed against a wall and blasts a 6px dirt wall open', () => {
    const { g, run } = live({ skills: { popper: 1 }, shapes: [floor(), rect(150, 150, 6, 50)] });
    const p = walker(g, 120);
    g.assignSkill(p, 'popper');
    run(60);
    expect(p.x).toBe(149); // waiting at the wall, not pacing
    run(20);
    const w = walker(g, 120);
    run(100, () => w.x > 170);
    expect(w.x).toBeGreaterThan(170);
  });

  it('never removes rock', () => {
    const { g, run } = live({ skills: { popper: 1 }, shapes: [floor(), rect(0, FLOOR + 3, 480, 37, 'rock')] });
    const p = walker(g, 200);
    g.assignSkill(p, 'popper');
    run(72);
    for (let y = FLOOR + 3; y <= FEET + 8; y++) expect(g.terrain.get(p.x, y)).toBe(ROCK);
    expect(g.terrain.get(p.x, FLOOR + 2)).toBe(EMPTY);
  });
});

describe('bouncer', () => {
  it('plants a pad and is not launched by it', () => {
    const { g, run } = live({ skills: { bouncer: 1 } });
    const b = walker(g, 100);
    expect(g.assignSkill(b, 'bouncer')).toBe(true);
    run(PLANT_TICKS - 1);
    expect(b.state).toBe('planting');
    expect(b.x).toBe(100);
    const ev = run(20);
    expect(g.pads).toEqual([{ id: 1, x: 100, y: FEET, lastBounce: -1 }]);
    expect(ev.some((e) => e.type === 'bounce')).toBe(false);
    expect(b.state).toBe('walking');
    expect(b.x).toBeGreaterThan(100 + PAD_REACH);
  });

  it('launches walkers in an arc ~48px up and ~67px across on flat ground', () => {
    const { g, run } = live();
    plant(g, run, 100);
    const w = walker(g, 80);
    let x0 = -1, top = 999;
    const ev = run(200, () => {
      if (w.state === 'launched') {
        if (x0 < 0) x0 = w.x;
        top = Math.min(top, w.y);
      }
      return x0 >= 0 && w.state !== 'launched';
    });
    expect(ev).toContainEqual({ type: 'bounce', id: w.id });
    expect(x0).toBe(100 - PAD_REACH);
    expect(FEET - top).toBeGreaterThan(47);
    expect(FEET - top).toBeLessThan(50);
    expect(w.state).toBe('walking');
    expect(w.x - x0).toBeGreaterThanOrEqual(66);
    expect(w.x - x0).toBeLessThanOrEqual(68);
    expect(w.y).toBe(FEET);
    expect(g.pads[0].lastBounce).toBeGreaterThan(0);
  });

  it('carries walkers over a wall too tall to step', () => {
    const { g, run } = live({ shapes: [floor(), rect(125, FLOOR - 40, 8, 40)] });
    plant(g, run, 100);
    const w = walker(g, 80);
    run(200, () => w.x > 140 && w.state === 'walking');
    expect(w.x).toBeGreaterThan(140);
    expect(w.y).toBe(FEET);
  });

  it('a mid-air wall hit stops the flight and the walker slides down it', () => {
    const { g, run } = live({ shapes: [floor(), rect(125, FLOOR - 120, 8, 120)] });
    plant(g, run, 100);
    const w = walker(g, 80);
    run(200, () => w.state === 'launched');
    run(200, () => w.state !== 'launched');
    expect(w.state).toBe('walking');
    expect(w.x).toBe(124);
    expect(w.y).toBe(FEET);
  });

  it('a long drop after a launch splats unless gliding', () => {
    for (const glider of [false, true]) {
      const { g, run } = live({ shapes: [floor(), rect(0, 150, 110, 50)] });
      plant(g, run, 100, 149);
      const w = walker(g, 80, 149);
      w.isGlider = glider;
      run(400, () => w.state === 'walking' && w.y === FEET || w.state === 'dead');
      expect(w.state).toBe(glider ? 'walking' : 'dead');
    }
  });

  it('pads vanish when the ground under them is dug away', () => {
    const { g, run } = live();
    plant(g, run, 100);
    g.terrain.eraseRect(95, FLOOR, 10, 5);
    run(1);
    expect(g.pads).toEqual([]);
  });
});

describe('napper', () => {
  it('becomes a walkable mound and counts as dead', () => {
    const { g, run } = live({ skills: { napper: 1 } });
    const n = walker(g, 100);
    expect(g.assignSkill(n, 'napper')).toBe(true);
    const ev = run(NAP_TICKS + 1);
    expect(ev).toContainEqual({ type: 'nap', id: n.id });
    expect(n.state).toBe('dead');
    expect(g.terrain.get(100, FEET - 5)).toBe(MOUND);
    expect(g.terrain.get(100, FEET - 6)).toBe(EMPTY);
    const w = walker(g, 60);
    let top = 999;
    run(120, () => { top = Math.min(top, w.y); return w.x > 130; });
    expect(top).toBe(FEET - 6);
    expect(w.x).toBeGreaterThan(130);
  });

  it('plugs a 10px ditch', () => {
    const { g, run } = live({ skills: { napper: 1 }, shapes: [floor(), { kind: 'rect', x: 150, y: FLOOR, w: 10, h: 10, erase: true }] });
    const n = walker(g, 154, FEET + 10);
    g.assignSkill(n, 'napper');
    run(NAP_TICKS + 1);
    const w = walker(g, 120);
    let low = 0;
    run(80, () => { low = Math.max(low, w.y); return w.x > 180; });
    expect(w.x).toBeGreaterThan(180);
    expect(low).toBeLessThanOrEqual(FEET + 5); // 6px mound in a 10px ditch: a shallow dip
  });

  it('a napper on the shore bridges a 7px water channel', () => {
    const { g, run } = live({
      skills: { napper: 1 },
      shapes: [rect(0, 180, 200, 60), rect(207, 180, 273, 60)],
      hazards: [{ kind: 'water', x: 200, y: 182, w: 7, h: 58 }],
    });
    const n = walker(g, 199, 179);
    g.assignSkill(n, 'napper');
    run(NAP_TICKS + 1);
    const w = walker(g, 150, 179);
    run(150, () => w.x > 240);
    expect(w.state).toBe('walking');
    expect(w.x).toBeGreaterThan(240);
  });

  it('heaves a groundhog standing in it up onto the mound', () => {
    const { g, run } = live({ skills: { napper: 1, sentry: 1 } });
    const s = walker(g, 104);
    g.assignSkill(s, 'sentry');
    const n = walker(g, 100);
    g.assignSkill(n, 'napper');
    run(NAP_TICKS + 1);
    expect(s.state).toBe('sentry');
    expect(g.terrain.get(104, s.y + 1)).toBe(MOUND);
    expect(s.y).toBeLessThan(FEET);
  });
});

import { describe, expect, it } from 'vitest';
import { Run, WIN_CHEER_TIME, minWinningWpm, pickPrompts, simulateTypist } from './engine.ts';
import { measurePath, pointAt, segmentAt } from './path.ts';
import {
  CONTACT_GAP,
  CONTACT_INTERVAL,
  HURT_TIME,
  MOVE_SPEED,
  NEAR_GAP,
  TICK_RATE,
  type LevelDef,
  type RunEvent,
} from './types.ts';

const DT = 1 / TICK_RATE;

function mk(over: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 't',
    name: 'Test',
    theme: 'launchpad',
    threat: 'fuel-fire',
    story: '',
    lesson: { newKeys: 'fj', tip: '' },
    keys: 'fj ',
    words: ['ff', 'jj', 'fj', 'jf', 'f j'],
    steps: 4,
    path: [
      { x: 20, y: 200, move: 'run', platform: 'metal' },
      { x: 60, y: 200, move: 'run', platform: 'metal' },
      { x: 100, y: 200, move: 'jump', platform: 'metal' },
      { x: 140, y: 200, move: 'run', platform: 'metal' },
      { x: 180, y: 200, move: 'jet', platform: 'metal' },
    ],
    width: 480,
    escape: 'rocket',
    hp: 3,
    threatSpeed: 30,
    threatAccel: 0,
    threatStart: 80,
    graceSeconds: 1,
    targetWpm: 20,
    ...over,
  };
}

function typeWord(run: Run): void {
  const w = run.prompts[run.index];
  for (const c of w.slice(run.typed)) run.input(c);
}

function tickFor(run: Run, seconds: number, onTick?: (t: number) => void): void {
  const n = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < n; i++) {
    run.tick(DT);
    onTick?.((i + 1) * DT);
  }
}

const types = (evs: RunEvent[]) => evs.map((e) => e.type);

describe('path helpers', () => {
  const lvl = mk();
  const m = measurePath(lvl.path);
  it('measures segments and waypoint distances', () => {
    expect(m.seg).toEqual([40, 40, 40, 40]);
    expect(m.cum).toEqual([0, 40, 80, 120, 160]);
    expect(m.total).toBe(160);
    expect(segmentAt(m, 45)).toBe(1);
    expect(segmentAt(m, 80)).toBe(2);
    expect(segmentAt(m, 999)).toBe(3);
  });
  it('points along, before and beyond the path', () => {
    expect(pointAt(lvl.path, m, 50)).toEqual({ x: 70, y: 200 });
    expect(pointAt(lvl.path, m, -30)).toEqual({ x: -10, y: 200 });
    expect(pointAt(lvl.path, m, 500)).toEqual({ x: 180, y: 200 });
  });
});

describe('prompt selection', () => {
  it('is deterministic per seed and uses only pool words', () => {
    const words = ['a', 'b', 'c', 'd', 'e', 'f'];
    const a = pickPrompts(words, 20, 7);
    expect(pickPrompts(words, 20, 7)).toEqual(a);
    expect(pickPrompts(words, 20, 8)).not.toEqual(a);
    expect(a).toHaveLength(20);
    for (const w of a) expect(words).toContain(w);
  });
  it('avoids repeats until the pool is exhausted and never repeats back-to-back', () => {
    const words = ['a', 'b', 'c', 'd', 'e'];
    for (let seed = 0; seed < 50; seed++) {
      const p = pickPrompts(words, 23, seed);
      expect(new Set(p.slice(0, 5)).size).toBe(5);
      expect(new Set(p.slice(5, 10)).size).toBe(5);
      for (let i = 1; i < p.length; i++) expect(p[i]).not.toBe(p[i - 1]);
    }
  });
  it('run prompts have length steps and match seed', () => {
    const r1 = new Run(mk(), 42);
    const r2 = new Run(mk(), 42);
    expect(r1.prompts).toHaveLength(4);
    expect(r1.prompts).toEqual(r2.prompts);
  });
  it('rejects a path that does not match steps', () => {
    expect(() => new Run(mk({ steps: 3 }), 1)).toThrow();
  });
});

describe('input handling', () => {
  it('stays ready until first key; first key starts play', () => {
    const run = new Run(mk(), 1);
    tickFor(run, 5);
    expect(run.status).toBe('ready');
    expect(run.threatS).toBe(-80);
    expect(run.stats.elapsed).toBe(0);
    run.input(run.nextChar()!);
    expect(run.status).toBe('playing');
    expect(types(run.drainEvents())).toEqual(['start', 'correct']);
  });

  it('a wrong first key also starts play', () => {
    const run = new Run(mk({ words: ['ff'] }), 1);
    run.input('j');
    expect(run.status).toBe('playing');
    expect(types(run.drainEvents())).toEqual(['start', 'wrong', 'hurt']);
  });

  it('advances typed/index and emits word', () => {
    const run = new Run(mk({ words: ['fj'], steps: 1, path: mk().path.slice(0, 2) }), 1);
    run.input('f');
    expect(run.typed).toBe(1);
    expect(run.nextChar()).toBe('j');
    run.input('j');
    expect(run.index).toBe(1);
    expect(run.typed).toBe(0);
    expect(run.nextChar()).toBeNull();
    const evs = run.drainEvents();
    expect(evs).toContainEqual({ type: 'word', word: 'fj', index: 0 });
  });

  it('is case-sensitive and handles spaces', () => {
    const run = new Run(mk({ words: ['F j'], keys: 'Fj ', hp: 10 }), 1);
    run.input('f');
    expect(run.typed).toBe(0);
    expect(run.stats.missed).toEqual({ F: 1 });
    run.input('F');
    run.input('j');
    expect(run.stats.missed).toEqual({ F: 1, ' ': 1 });
    run.input(' ');
    run.input('j');
    expect(run.index).toBe(1);
  });

  it('typo costs hp, records the miss and shows hurt pose for HURT_TIME', () => {
    const run = new Run(mk({ words: ['ff'] }), 1);
    run.input('j');
    expect(run.hp).toBe(2);
    expect(run.stats.wrong).toBe(1);
    expect(run.stats.missed).toEqual({ f: 1 });
    expect(run.heroPose).toBe('hurt');
    expect(run.drainEvents()).toContainEqual({ type: 'hurt', cause: 'typo' });
    tickFor(run, HURT_TIME + 0.05);
    expect(run.heroPose).toBe('idle');
    expect(run.heroPoseTime).toBeLessThan(0.1);
  });

  it('ignores multi-char strings and input after all prompts are typed', () => {
    const run = new Run(mk(), 1);
    run.input('ff');
    expect(run.status).toBe('ready');
    for (let i = 0; i < 4; i++) typeWord(run);
    run.drainEvents();
    run.input('f');
    run.input('x');
    expect(run.drainEvents()).toEqual([]);
    expect(run.hp).toBe(3);
  });
});

describe('hero movement', () => {
  it('moves one segment at MOVE_SPEED and arrives', () => {
    const run = new Run(mk(), 1);
    typeWord(run);
    run.drainEvents();
    run.tick(DT);
    expect(run.moving).toBe(true);
    expect(run.heroPose).toBe('run');
    expect(run.heroX).toBeCloseTo(20 + MOVE_SPEED * DT, 6);
    expect(run.drainEvents()).toContainEqual({ type: 'move', from: 0, to: 1, move: 'run' });
    tickFor(run, 40 / MOVE_SPEED);
    expect(run.heroAt).toBe(1);
    expect(run.heroX).toBe(60);
    expect(run.heroPose).toBe('idle');
    expect(run.drainEvents()).toContainEqual({ type: 'arrive', index: 1 });
  });

  it('queues moves when typing fast and visits waypoints in order', () => {
    const run = new Run(mk({ hp: 99 }), 1);
    for (let i = 0; i < 4; i++) typeWord(run);
    expect(run.index).toBe(4);
    const arrivals: number[] = [];
    const poses = new Set<string>();
    let maxY = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < 3 * TICK_RATE && run.status === 'playing'; i++) {
      run.tick(DT);
      poses.add(run.heroPose);
      maxY = Math.max(maxY, run.heroY);
      minY = Math.min(minY, run.heroY);
      for (const e of run.drainEvents()) if (e.type === 'arrive') arrivals.push(e.index);
    }
    expect(arrivals).toEqual([1, 2, 3, 4]);
    expect(poses.has('jump')).toBe(true);
    expect(poses.has('jet')).toBe(true);
    expect(maxY).toBe(200); // arcs never dip below the segment
    expect(minY).toBeLessThan(190);
    expect(run.status).toBe('won');
    // chained moves keep the full speed: 160px total
    expect(run.stats.elapsed).toBeCloseTo(160 / MOVE_SPEED, 1);
  });

  it('heroDir follows segment x direction', () => {
    const path = mk().path.map((w) => ({ ...w }));
    path[1].x = 0;
    const run = new Run(mk({ path }), 1);
    typeWord(run);
    run.tick(DT);
    expect(run.heroDir).toBe(-1);
  });
});

describe('threat', () => {
  it('waits for grace, then chases at threatSpeed', () => {
    const run = new Run(mk({ words: ['ffff'] }), 1);
    run.input('f');
    tickFor(run, 0.9);
    expect(run.threatS).toBe(-80);
    expect(run.threatX).toBe(-60);
    tickFor(run, 1.1);
    expect(run.threatS).toBeCloseTo(-80 + 30, 5);
  });

  it('accelerates with threatAccel', () => {
    const run = new Run(mk({ words: ['ffff'], threatAccel: 10, threatStart: 200 }), 1);
    run.input('f');
    tickFor(run, 3);
    // 2s after grace: 30*2 + 0.5*10*4
    expect(run.threatS).toBeCloseTo(-200 + 80, 5);
  });

  it('danger toggles at NEAR_GAP and contact hurts every CONTACT_INTERVAL, clamped at hero', () => {
    const run = new Run(mk({ words: ['ffff'], hp: 10 }), 1);
    run.input('f');
    run.drainEvents();
    const hits: number[] = [];
    let dangerOn = -1;
    tickFor(run, 6, (t) => {
      expect(run.threatS).toBeLessThanOrEqual(run.heroS);
      for (const e of run.drainEvents()) {
        if (e.type === 'hurt' && e.cause === 'threat') hits.push(t);
        if (e.type === 'danger' && e.on) dangerOn = t;
      }
    });
    expect(dangerOn).toBeCloseTo(1 + (80 - NEAR_GAP) / 30, 1);
    const firstHit = 1 + (80 - CONTACT_GAP) / 30;
    expect(hits[0]).toBeCloseTo(firstHit, 1);
    expect(hits.length).toBe(1 + Math.floor((6 - firstHit) / CONTACT_INTERVAL + 1e-6));
    for (let i = 1; i < hits.length; i++) expect(hits[i] - hits[i - 1]).toBeCloseTo(CONTACT_INTERVAL, 1);
    expect(run.threatS).toBe(run.heroS);
    expect(run.hp).toBe(10 - hits.length);
  });

  it('danger switches off when the hero escapes ahead and pose shows scared', () => {
    const run = new Run(mk({ words: ['ff'], threatStart: 40, threatSpeed: 10, graceSeconds: 0, hp: 9 }), 1);
    run.input('f');
    run.tick(DT);
    expect(run.danger).toBe(true);
    tickFor(run, 0.3);
    expect(run.heroPose).toBe('scared');
    run.input('f');
    tickFor(run, 0.3);
    const evs = run.drainEvents().filter((e) => e.type === 'danger');
    expect(evs[0]).toEqual({ type: 'danger', on: true });
    expect(evs).toContainEqual({ type: 'danger', on: false });
  });
});

describe('end states', () => {
  it('loses at hp 0 from typos: faint pose, lost event, input ignored', () => {
    const run = new Run(mk({ words: ['ff'], hp: 2 }), 1);
    run.input('j');
    run.input('j');
    expect(run.status).toBe('lost');
    expect(run.hp).toBe(0);
    expect(run.heroPose).toBe('faint');
    expect(types(run.drainEvents())).toContain('lost');
    run.input('f');
    expect(run.drainEvents()).toEqual([]);
    expect(run.nextChar()).toBeNull();
    expect(run.stars()).toBe(0);
  });

  it('loses to the threat when idle', () => {
    const run = new Run(mk({ words: ['ffff'] }), 1);
    run.input('f');
    tickFor(run, 10);
    expect(run.status).toBe('lost');
    const t = run.stats.elapsed;
    expect(t).toBeCloseTo(1 + 74 / 30 + 2 * CONTACT_INTERVAL, 1);
    const threatS = run.threatS;
    tickFor(run, 1);
    expect(run.threatS).toBe(threatS);
    expect(run.stats.elapsed).toBe(t);
  });

  it('wins on reaching the escape; threat and clock stop; cheer then board', () => {
    const run = new Run(mk(), 1);
    for (let i = 0; i < 4; i++) typeWord(run);
    tickFor(run, 2);
    expect(run.status).toBe('won');
    expect(run.heroX).toBe(180);
    expect(types(run.drainEvents())).toContain('won');
    const t = run.stats.elapsed;
    const ts = run.threatS;
    expect(run.heroPose).toBe('board');
    tickFor(run, 1);
    expect(run.stats.elapsed).toBe(t);
    expect(run.threatS).toBe(ts);
    expect(WIN_CHEER_TIME).toBeLessThan(2);
  });
});

describe('stats and stars', () => {
  it('wpm uses a 1s time floor, then (correct/5)/minutes; accuracy 1 with no keys', () => {
    const run = new Run(mk({ words: ['ffff'] }), 1);
    expect(run.stats.accuracy).toBe(1);
    run.input('f');
    run.input('f');
    expect(run.stats.wpm).toBeCloseTo(2 / 5 / (1 / 60), 6);
    tickFor(run, 0.5);
    expect(run.stats.wpm).toBeCloseTo(2 / 5 / (1 / 60), 6);
    tickFor(run, 1.5);
    expect(run.stats.elapsed).toBeCloseTo(2, 6);
    expect(run.stats.wpm).toBeCloseTo(2 / 5 / (2 / 60), 6);
    run.input('j');
    expect(run.stats.accuracy).toBeCloseTo(2 / 3, 6);
  });

  function finish(level: LevelDef, typos: number): Run {
    const run = new Run(level, 1);
    for (let i = 0; i < typos; i++) run.input('#');
    for (let i = 0; i < level.steps; i++) typeWord(run);
    tickFor(run, 3);
    expect(run.status).toBe('won');
    return run;
  }

  it('3 stars: accurate and fast', () => {
    expect(finish(mk({ targetWpm: 20 }), 0).stars()).toBe(3);
  });
  it('2 stars: accurate but slower than target', () => {
    expect(finish(mk({ targetWpm: 1000 }), 0).stars()).toBe(2);
  });
  it('1 star: accuracy under 90%', () => {
    expect(finish(mk({ hp: 10 }), 3).stars()).toBe(1);
  });
});

describe('simulateTypist', () => {
  const lvl = mk({ steps: 8, path: Array.from({ length: 9 }, (_, i) => ({ x: 20 + i * 50, y: 200, move: 'run' as const, platform: 'rock' as const })), width: 480 });

  it('a fast accurate typist wins with 3 stars', () => {
    const r = simulateTypist(lvl, 1, 60, 1, 1);
    expect(r.status).toBe('won');
    expect(r.stars).toBe(3);
    expect(r.hpLeft).toBe(3);
  });
  it('a 0-wpm typist loses', () => {
    const r = simulateTypist(lvl, 1, 0, 1, 1);
    expect(r.status).toBe('lost');
  });
  it('a very sloppy typist loses on hp', () => {
    const r = simulateTypist(mk({ threatSpeed: 1 }), 1, 60, 0.3, 1);
    expect(r.status).toBe('lost');
    expect(r.time).toBeLessThan(5);
  });
  it('is deterministic', () => {
    expect(simulateTypist(lvl, 3, 25, 0.9, 5)).toEqual(simulateTypist(lvl, 3, 25, 0.9, 5));
  });
  it('minWinningWpm finds a threshold', () => {
    const w = minWinningWpm(lvl, 1);
    expect(w).not.toBeNull();
    expect(simulateTypist(lvl, 1, w!, 1, 1).status).toBe('won');
    expect(simulateTypist(lvl, 1, w! - 1, 1, 1).status).toBe('lost');
  });
});

describe('clean prompts heal', () => {
  it('restores a heart after a prompt typed without typos, capped at level.hp', () => {
    const run = new Run(mk({ hp: 3 }), 1);
    run.input('#');
    expect(run.hp).toBe(2);
    typeWord(run); // finishes the prompt that had the typo: no heal
    expect(run.hp).toBe(2);
    typeWord(run);
    expect(run.hp).toBe(3);
    expect(run.drainEvents().some((e) => e.type === 'heal')).toBe(true);
    typeWord(run);
    expect(run.hp).toBe(3);
  });
});

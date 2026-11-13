import { describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { InvariantChecker } from './invariants.ts';
import { LEVELS } from './levels.ts';
import { SKILLS, TICK_RATE } from './types.ts';
import type { SkillId } from './types.ts';

const SEEDS = 30;

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

/** Random player: clicks random live groundhogs with random skills that still have charges. */
function fuzz(levelIdx: number, seed: number): Game {
  const rand = rng(seed * 7919 + levelIdx);
  const lv = LEVELS[levelIdx];
  // extra charges so craters, pads and mounds get fuzzed on every level
  const extra = (s: SkillId, n: number) => ({ [s]: (lv.skills[s] ?? 0) + n });
  const skills =
    seed % 3 === 0 ? { ...lv.skills, ...extra('popper', 6) }
    : seed % 3 === 1 ? { ...lv.skills, ...extra('bouncer', 6), ...extra('napper', 4) }
    : lv.skills;
  const game = new Game({ ...lv, skills });
  const checker = new InvariantChecker(game);
  const fast = seed % 5 === 0;
  const alarmAt = seed % 7 === 3 ? Math.floor(rand() * 90 * TICK_RATE) : -1;
  const actEvery = 8 + Math.floor(rand() * 40); // mean ticks between clicks
  if (fast) game.setReleaseRate(99);
  for (let n = 0; game.status === 'playing' && n < 700 * TICK_RATE; n++) {
    if (n === alarmAt) game.alarm();
    if (rand() < 1 / actEvery) {
      const skills = SKILLS.filter((s) => game.skillsLeft[s] > 0);
      const live = game.groundhogs.filter((g) => g.state !== 'saved' && g.state !== 'dead');
      if (skills.length && live.length) {
        const skill: SkillId = skills[Math.floor(rand() * skills.length)];
        const target = live[Math.floor(rand() * live.length)];
        const g = game.pickAt(target.x, target.y - 5, skill);
        if (g) game.assignSkill(g, skill);
      }
    }
    game.tick();
    game.drainEvents();
    checker.check();
  }
  return game;
}

// Small chunks that yield, so the vitest worker can answer runner RPCs on slow CI.
const CHUNK = 5;

describe('invariant fuzz', () => {
  LEVELS.forEach((lv, i) => {
    for (let first = 1; first <= SEEDS; first += CHUNK) {
      const last = Math.min(SEEDS, first + CHUNK - 1);
      it(`${lv.id}: seeds ${first}-${last} keep physics invariants`, async () => {
        await new Promise((r) => setTimeout(r, 0)); // let the worker answer runner RPCs
        for (let seed = first; seed <= last; seed++) {
          let game: Game;
          try {
            game = fuzz(i, seed);
          } catch (e) {
            throw new Error(`seed ${seed}: ${(e as Error).message}`);
          }
          expect(game.status, `seed ${seed}`).not.toBe('playing');
        }
      }, 60_000);
    }
  });
});

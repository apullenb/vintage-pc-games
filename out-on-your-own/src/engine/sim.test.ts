import { describe, expect, it } from 'vitest';
import { playGame } from './bot.ts';
import { finalScore } from './score.ts';
import type { PathId } from './types.ts';
import { activitiesFor } from '../content/activities.ts';
import { newState } from '../content/paths.ts';
import { begin, choose, defaultPlan, foodOptions, payBills, proceed, retryChapter, sceneChoices, startWeek } from './engine.ts';
import { SLOTS, type GameState, type PayMethod } from './types.ts';

const PATHS: PathId[] = ['home', 'college', 'trade', 'work'];

describe('full playthroughs', () => {
  for (const path of PATHS) {
    it(`${path}: a sensible player finishes the year`, () => {
      const results = [];
      for (let seed = 1; seed <= 12; seed++) results.push(playGame(path, seed * 7919, 'wise'));
      const wins = results.filter((r) => r.outcome === 'won');
      const scores = wins.map((r) => finalScore(r.s).total);
      const avg = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
      console.log(path, 'wise wins', wins.length, '/', results.length, 'avg', Math.round(avg), 'min', Math.min(...scores), results.filter((r) => r.outcome === 'lost').map((r) => r.reason));
      expect(wins.length).toBe(results.length);
      expect(avg).toBeGreaterThan(650);
    });
    it(`${path}: reckless choices cost you`, () => {
      const wise = [];
      const reckless = [];
      for (let seed = 1; seed <= 8; seed++) {
        wise.push(playGame(path, seed * 104729, 'wise'));
        reckless.push(playGame(path, seed * 104729, 'reckless'));
      }
      const score = (r: ReturnType<typeof playGame>) => (r.outcome === 'won' ? finalScore(r.s).total : 0);
      const w = wise.reduce((a, r) => a + score(r), 0) / wise.length;
      const k = reckless.reduce((a, r) => a + score(r), 0) / reckless.length;
      console.log(path, 'wise', Math.round(w), 'reckless', Math.round(k), 'reckless losses', reckless.filter((r) => r.outcome === 'lost').length);
      expect(w - k).toBeGreaterThan(200);
    });
  }
});


// A chaotic player: random plans, random choices, random bill skipping. The game must never get stuck.
function chaos(path: PathId, seed: number): { s: GameState; retries: number } {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let s = begin(newState('Chaos', { skin: 0, hair: 0, hairStyle: 0, shirt: 0 }, path, seed));
  let retries = 0;
  for (let i = 0; i < 8000; i++) {
    const h = s.queue[0];
    if (!h) {
      const plan = defaultPlan(s);
      for (const slot of SLOTS) {
        const opts = activitiesFor(s, slot).filter((x) => x.ok === true);
        if (opts.length && rnd() < 0.6) plan.slots[slot] = opts[Math.floor(rnd() * opts.length)].a.id;
      }
      const foods = foodOptions(s);
      plan.food = foods[Math.floor(rnd() * foods.length)];
      s = startWeek(s, plan);
      continue;
    }
    if (h.t === 'scene') {
      if (h.result) { s = proceed(s); continue; }
      const cs = sceneChoices(s, h).filter((c) => !c.locked);
      const c = cs[Math.floor(rnd() * cs.length)];
      const ms = c.methods.filter((m) => m.ok).map((m) => m.method);
      const m: PayMethod | undefined = ms.length ? ms[Math.floor(rnd() * ms.length)] : undefined;
      const next = choose(s, c.i, m);
      if (next === s) throw new Error(`no-op choice in ${h.id}:${h.step}`);
      s = next;
      continue;
    }
    if (h.t === 'billsDue') {
      const out: Record<string, { amount: number; method: PayMethod } | null> = {};
      for (const b of h.bills) out[b.id] = rnd() < 0.15 ? null : { amount: b.amount, method: s.stats.savings >= b.amount && rnd() < 0.3 ? 'savings' : 'checking' };
      s = payBills(s, out);
      continue;
    }
    if (h.t === 'gameOver') {
      const back = retryChapter(s);
      if (!back || retries > 6) return { s, retries };
      retries++;
      s = back;
      continue;
    }
    if (h.t === 'ending') return { s, retries };
    s = proceed(s);
  }
  throw new Error(`chaos player stuck at week ${s.week}: ${JSON.stringify(s.queue[0]).slice(0, 200)}`);
}

describe('robustness', () => {
  it('random players never get stuck or crash', () => {
    let endings = 0;
    for (const path of PATHS) {
      for (let seed = 1; seed <= 25; seed++) {
        const { s } = chaos(path, seed * 31337);
        if (s.queue[0]?.t === 'ending') endings++;
        expect(Number.isFinite(s.stats.cash)).toBe(true);
        expect(s.stats.energy).toBeGreaterThanOrEqual(0);
      }
    }
    console.log('chaos endings reached', endings, '/ 100');
  });
});

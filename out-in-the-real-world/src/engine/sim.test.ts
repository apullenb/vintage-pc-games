import { describe, expect, it } from 'vitest';
import { playFrom, playGame } from './bot.ts';
import { finalScore } from './score.ts';
import { netWorth } from './core.ts';
import { canStartPhase2, grossMonthly } from '../content/phase2.ts';
import type { PathId } from './types.ts';
import { activitiesFor } from '../content/activities.ts';
import { newState } from '../content/paths.ts';
import { begin, choose, defaultPlan, finishMinigame, foodOptions, nextPhase, payBills, proceed, retryChapter, sceneChoices, startWeek } from './engine.ts';
import { SLOTS, type GameState, type PayMethod } from './types.ts';

const PATHS: PathId[] = ['home', 'college', 'trade', 'work'];

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// Year one on its own (bots stop at the year-one report card).
const yearOne = (path: PathId, seed: number, style: 'wise' | 'reckless') => playGame(path, seed, style, undefined, undefined, 1);

describe('year one playthroughs', () => {
  for (const path of PATHS) {
    it(`${path}: a sensible player finishes the year, with money tight but manageable`, () => {
      const results = [];
      for (let seed = 1; seed <= 16; seed++) results.push(yearOne(path, seed * 7919, 'wise'));
      const wins = results.filter((r) => r.outcome === 'won');
      const scores = wins.map((r) => finalScore(r.s).total);
      const avg = mean(scores);
      const saved = mean(wins.map((r) => r.s.stats.savings));
      console.log(path, 'wise wins', wins.length, '/', results.length, 'avg', Math.round(avg), 'min', Math.min(...scores), 'saved', Math.round(saved), results.filter((r) => r.outcome === 'lost').map((r) => r.reason));
      expect(wins.length).toBe(results.length);
      // A good year, not a perfect one: around $1,500–$3,500 saved (a bit more living at home) and a B+/A score.
      expect(avg).toBeGreaterThan(780);
      expect(avg).toBeLessThan(path === 'home' ? 935 : 900);
      expect(saved).toBeGreaterThan(1500);
      // Living at home plus a promotion from extra shifts lets you save a lot more.
      expect(saved).toBeLessThan(path === 'home' ? 6500 : 3800);
    });
    it(`${path}: reckless choices cost you`, () => {
      const wise = [];
      const reckless = [];
      for (let seed = 1; seed <= 20; seed++) {
        wise.push(yearOne(path, seed * 104729, 'wise'));
        reckless.push(yearOne(path, seed * 104729, 'reckless'));
      }
      const score = (r: ReturnType<typeof playGame>) => (r.outcome === 'won' ? finalScore(r.s).total : 0);
      const w = mean(wise.map(score));
      const k = mean(reckless.map(score));
      const losses = reckless.filter((r) => r.outcome === 'lost').length;
      console.log(path, 'wise', Math.round(w), 'reckless', Math.round(k), 'reckless losses', losses, '/', reckless.length);
      expect(w - k).toBeGreaterThan(250);
      // Takeout, two nights out a week, and card minimums: some careless players lose their housing
      // (or their classes), but not most of them.
      if (path !== 'home') expect(losses).toBeGreaterThan(0);
      expect(losses).toBeLessThan(reckless.length * 0.6);
    });
  }
});

// Both phases: year one, the time skip, then the bigger paycheck, the car, and the house.
describe('next-phase playthroughs', () => {
  for (const path of PATHS) {
    it(`${path}: a sensible player makes it through the next phase`, () => {
      const runs = [];
      for (let seed = 1; seed <= 12; seed++) runs.push(playGame(path, seed * 7919, 'wise'));
      const scores = runs.map((r) => finalScore(r.s).total);
      const avg = mean(scores);
      const buyers = runs.filter((r) => r.s.flags.homeDecided === 'buy');
      const cars = runs.filter((r) => r.s.flags.carDecided && r.s.flags.carDecided !== 'keep' && r.s.flags.carDecided !== 'default');
      console.log(path, 'next phase wise avg', Math.round(avg), 'min', Math.min(...scores), 'homes', buyers.length, 'cars', cars.length, 'nw', Math.round(mean(runs.map((r) => netWorth(r.s)))), runs.filter((r) => r.outcome === 'lost').map((r) => r.reason));
      for (const r of runs) {
        expect(r.outcome).toBe('won');
        expect(r.s.phase2).toBeTruthy();
        expect(r.s.chapterStars.length).toBe(9);
      }
      // A good result, not a perfect one.
      expect(avg).toBeGreaterThan(760);
      expect(avg).toBeLessThan(940);
      // Sensible buyers keep the payment affordable and a cushion in the bank.
      for (const r of buyers) {
        const m = r.s.loans.find((l) => l.kind === 'mortgage')!;
        expect((m.payment + r.s.housing.rent) / grossMonthly(r.s)).toBeLessThan(0.4);
        expect(r.s.stats.savings + r.s.stats.cash).toBeGreaterThan(1500);
      }
      // A reasonable car: never the loaded SUV, never the add-on package, payment under ~12% of gross.
      for (const r of cars) {
        expect(r.s.flags.carDecided).not.toBe('suv');
        expect(r.s.flags.carAddons).toBeFalsy();
        const l = r.s.loans.find((x) => x.kind === 'car');
        if (l) expect(l.payment / grossMonthly(r.s)).toBeLessThan(0.12);
      }
    });

    it(`${path}: reckless spending catches up with you`, () => {
      const wise = [];
      const reckless = [];
      for (let seed = 1; seed <= 12; seed++) {
        wise.push(playGame(path, seed * 104729, 'wise'));
        reckless.push(playGame(path, seed * 104729, 'reckless'));
      }
      const score = (r: ReturnType<typeof playGame>) => (r.outcome === 'won' ? finalScore(r.s).total : 0);
      const w = mean(wise.map(score));
      const k = mean(reckless.map(score));
      const reached = reckless.filter((r) => r.s.phase2);
      console.log(path, 'next phase wise', Math.round(w), 'reckless', Math.round(k), 'reached', reached.length, 'finished', reckless.filter((r) => r.outcome === 'won').length, 'lost', reckless.filter((r) => r.outcome === 'lost').map((r) => r.reason));
      expect(w - k).toBeGreaterThan(400);
      // The ones who make it to the next phase splurge: a pricey car, add-ons, or a lavish budget.
      for (const r of reached.filter((x) => x.s.week > 48)) expect(r.s.flags.carDecided === 'suv' || r.s.flags.carAddons || r.s.flags.lifestyle === 'lavish' || r.s.flags.carDecided === 'new').toBe(true);
    });
  }

  it('missing the year-one milestone means a lower start and a real second chance', () => {
    for (const path of PATHS) {
      const y1 = yearOne(path, 7919, 'wise').s;
      expect(canStartPhase2(y1)).toBe(true);
      const top = nextPhase(y1);
      y1.flags.careerDone = false;
      const low = nextPhase(y1);
      expect(low.phase2!.tier).not.toBe('top');
      expect(low.job!.wage).toBeLessThan(top.job!.wage);
      expect(low.phase2!.next!.wage).toBeGreaterThan(low.job!.wage);
      const r = playFrom(low, 'wise');
      expect(r.outcome).toBe('won');
      expect(r.s.flags.p2Up).toBe(true);
      expect(r.s.job!.wage).toBeGreaterThanOrEqual(low.phase2!.next!.wage);
    }
  });
});


// A chaotic player: random plans, random choices, random bill skipping. The game must never get stuck.
function chaos(path: PathId, seed: number): { s: GameState; retries: number } {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let s = begin(newState('Chaos', { skin: 0, hair: 0, hairStyle: 0, shirt: 0 }, path, seed));
  let retries = 0;
  for (let i = 0; i < 16000; i++) {
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
    if (h.t === 'minigame') {
      s = h.result ? proceed(s) : finishMinigame(s, { score: rnd(), played: rnd() < 0.7 });
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
    if (h.t === 'ending') {
      if (!canStartPhase2(s)) return { s, retries };
      s = nextPhase(s);
      continue;
    }
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
        if (s.queue[0]?.t === 'ending' && s.phase2) endings++;
        expect(Number.isFinite(s.stats.cash)).toBe(true);
        expect(s.stats.energy).toBeGreaterThanOrEqual(0);
      }
    }
    console.log('chaos endings reached', endings, '/ 100');
  }, 60_000);
});

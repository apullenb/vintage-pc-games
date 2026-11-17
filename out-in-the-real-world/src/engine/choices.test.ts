// Choices that come back: the consequences and perks wired into later systems.
import { describe, expect, it } from 'vitest';
import { newState } from '../content/paths.ts';
import { ACTIVITIES } from '../content/activities.ts';
import { TASKS } from '../content/chapters.ts';
import { EVENTS } from '../content/events.ts';
import { LEAK_DAMAGE, fluRisk } from '../content/scenes/events.ts';
import { hasCar } from '../content/jobs.ts';
import { tradeIn } from '../content/scenes/phase2.ts';
import { playGame } from './bot.ts';
import { LICENSE_REINSTATE, creditScore, depositMonths, insuranceFactor, rentDeposit } from './core.ts';
import { FOOD, LIFE_COSTS, begin, billsFor, choose, defaultPlan, finishMinigame, mealPerk, nextPhase, payBills, sceneChoices, startWeek } from './engine.ts';
import type { GameState, Step } from './types.ts';

const look = { skin: 0, hair: 0, hairStyle: 0, shirt: 0 };
const fresh = (path: GameState['path'] = 'work'): GameState => {
  const s = begin(newState('T', look, path, 7));
  s.queue = [];
  return s;
};
const at = (s: GameState, id: string, step = 'start', data?: Record<string, number | string>): GameState => {
  s.queue = [{ t: 'scene', id, step, data }];
  return s;
};
function pick(s: GameState, re: RegExp): GameState {
  const h = s.queue[0] as Extract<Step, { t: 'scene' }>;
  const cs = sceneChoices(s, h);
  const c = cs.find((x) => re.test(x.label) && !x.locked);
  if (!c) throw new Error(`no choice ${re} in ${h.id}: ${cs.map((x) => `${x.label}${x.locked ? ` [${x.locked}]` : ''}`).join(' / ')}`);
  return choose(s, c.i);
}
const weightOf = (id: string, s: GameState): number => {
  const e = EVENTS.find((x) => x.id === id)!;
  return typeof e.weight === 'function' ? e.weight(s) : e.weight;
};
const withCar = (s: GameState, condition = 70): GameState => {
  s.car = { name: 'Old Hatchback', condition, value: 2000, insurance: 160 };
  s.transport = 'car';
  s.flags.license = true;
  return s;
};
// A long, spotless credit file (an excellent score) or a thin, damaged one.
const goodCredit = (s: GameState): GameState => {
  s.week = 40;
  s.credit = { firstWeek: 1, onTime: 20, late: 0, inquiries: [], collections: 0 };
  return s;
};
const poorCredit = (s: GameState): GameState => {
  s.week = 10;
  s.credit = { firstWeek: 1, onTime: 0, late: 1, inquiries: [], collections: 0 };
  return s;
};

describe('jury duty', () => {
  it('is its own court date: the court pays $15, no traffic fine', () => {
    let s = fresh();
    s.week = 12;
    s = pick(at(s, 'ev-jury'), /^Serve/);
    expect(s.appointments.find((a) => a.label === 'Jury duty')?.kind).toBe('jury');
    const cash = s.stats.cash;
    s = pick(at(s, 'appt-jury'), /\$15/);
    expect(s.stats.cash).toBe(cash + 15);
    expect(s.flags.ticketPoints).toBeUndefined();
  });
  it('a postponed summons comes back, and you only get one postponement', () => {
    let s = fresh();
    s.week = 12;
    s = pick(at(s, 'ev-jury'), /postponement/);
    expect(weightOf('ev-jury', s)).toBe(0);
    s.week = 24;
    expect(weightOf('ev-jury', s)).toBeGreaterThan(5);
    expect(() => pick(at(s, 'ev-jury'), /postponement/)).toThrow();
  });
});

describe('an ignored ticket suspends your license', () => {
  it('parks the car, keeps you out of the DMV line, and costs bus fares until you pay', () => {
    let s = withCar(fresh());
    s.week = 14;
    s = pick(at(s, 'ev-ticketlate'), /Ignore it again/);
    expect(s.flags.licenseSuspended).toBe(14);
    expect(s.flags.license).toBe(false);
    expect(s.credit.collections).toBe(1);
    // It's a driver's license problem, not an academic one.
    expect(s.flags.suspended).toBeUndefined();
    expect(hasCar(s)).toBe(false);
    expect(ACTIVITIES.dmv.hide!(s)).toBe(true);
    expect(ACTIVITIES.gig.name).toBeTypeOf('function');
    s.queue = [];
    s = startWeek(s, defaultPlan(s));
    expect(s.log.some((l) => /License suspended/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /^Gas:/.test(l.text))).toBe(false);
  });
  it('getting it back costs the ticket plus a reinstatement fee, and points', () => {
    let s = withCar(fresh());
    s.flags.licenseSuspended = 10;
    s.flags.license = false;
    s.week = 13;
    s.stats.cash = 1000;
    expect(weightOf('ev-reinstate', s)).toBeGreaterThan(0);
    s = pick(at(s, 'ev-reinstate'), /Pay it all/);
    expect(s.stats.cash).toBe(1000 - LICENSE_REINSTATE);
    expect(s.flags.license).toBe(true);
    expect(s.flags.licenseSuspended).toBe(0);
    expect(s.car!.insurance).toBe(185);
  });
  it('the time skip makes you pay to reinstate it', () => {
    const y1 = playGame('work', 7919, 'wise', undefined, undefined, 1).s;
    const a = nextPhase(y1);
    y1.flags.licenseSuspended = 30;
    const b = nextPhase(y1);
    expect(a.stats.savings - b.stats.savings).toBe(LICENSE_REINSTATE);
    expect(b.flags.licenseSuspended).toBe(0);
  });
});

describe('driving record and insurance', () => {
  it('a speeding ticket on a car delivery shift puts points on your license', () => {
    let s = withCar(fresh());
    s.queue = [{ t: 'minigame', id: 'delivery', data: { vehicle: 'car' } }];
    s = finishMinigame(s, { score: 0.5, played: true, stats: { earned: 60, ticket: 1 } });
    expect(s.flags.ticketPoints).toBe(1);
    expect(s.car!.insurance).toBe(185);
  });
  it('a bike citation is just a fine', () => {
    let s = fresh();
    s.queue = [{ t: 'minigame', id: 'delivery', data: { vehicle: 'bike' } }];
    s = finishMinigame(s, { score: 0.5, played: true, stats: { earned: 40, ticket: 1 } });
    expect(s.flags.ticketPoints).toBeUndefined();
  });
  it('getting pulled over uninsured is a second ticket, and a lapse raises your rate', () => {
    let s = withCar(fresh());
    s.stats.cash = 1000;
    s.flags.uninsuredCar = true;
    s = pick(at(s, 'ev-ticket'), /Pay the fine/);
    expect(s.stats.cash).toBe(1000 - 175 - 300);

    let t = withCar(fresh());
    t.stats.cash = 5000;
    const bills = billsFor(t);
    t.queue = [{ t: 'billsDue', bills }];
    const pay: Record<string, { amount: number; method: 'checking' } | null> = {};
    for (const b of bills) pay[b.id] = b.kind === 'insurance' ? null : { amount: b.amount, method: 'checking' };
    t = payBills(t, pay);
    expect(t.flags.uninsuredCar).toBe(true);
    expect(t.car!.insurance).toBe(180);
  });
  it('your credit score is priced into car insurance', () => {
    expect(insuranceFactor(goodCredit(fresh()))).toBeLessThan(1);
    expect(insuranceFactor(poorCredit(fresh()))).toBeGreaterThan(1);
    expect(insuranceFactor(fresh())).toBe(1);
    let s = goodCredit(fresh());
    s.flags.license = true;
    s.stats.cash = 5000;
    s = pick(at(s, 'task-transport', 'inspectGood'), /^Buy it/);
    expect(s.car!.insurance).toBe(144);
  });
  it('a worn-out car is worth less as a trade-in', () => {
    const good = withCar(fresh(), 80);
    const worn = withCar(fresh(), 20);
    expect(tradeIn(worn)).toBeLessThan(tradeIn(good) * 0.7);
  });
});

describe('credit and rent history follow you to the next lease', () => {
  it('deposits: no history doubles it, excellent credit halves it, poor credit adds half', () => {
    expect(rentDeposit(fresh(), 1000)).toBe(2000);
    const good = goodCredit(fresh());
    expect(creditScore(good)).toBeGreaterThanOrEqual(740);
    expect(rentDeposit(good, 1000)).toBe(500);
    const poor = poorCredit(fresh());
    expect(creditScore(poor)).toBeLessThan(580);
    expect(rentDeposit(poor, 1000)).toBe(1500);
  });
  it('missing rent in the curveball chapter marks you as a late payer (+1 month deposit)', () => {
    const s = goodCredit(fresh());
    const t = TASKS.find((x) => x.id === 't-survive')!;
    s.flags.rentMissedCh5 = 0;
    s.flags.rentMissed = 1;
    t.onFail!(s);
    expect(s.flags.latePayer).toBe(true);
    expect(depositMonths(s)).toBe(1.5);
    // Paid every month (only the curveball scene was skipped): no mark.
    const ok = fresh();
    t.onFail!(ok);
    expect(ok.flags.latePayer).toBeUndefined();
  });
  it('the college lease you signed (or didn’t) shows up after the time skip', () => {
    const y1 = playGame('college', 7919, 'wise', undefined, undefined, 1).s;
    const loans = (s: GameState) => s.loans.filter((l) => l.kind === 'student').reduce((a, l) => a + l.balance, 0);
    y1.flags.nextYear = 'house';
    y1.flags.leaseDeposit = 550;
    y1.flags.badLease = false;
    const house = nextPhase(y1);
    y1.flags.nextYear = 'far';
    y1.flags.leaseDeposit = 420;
    const far = nextPhase(y1);
    y1.flags.nextYear = '';
    y1.flags.leaseDeposit = 0;
    y1.flags.badLease = true;
    const late = nextPhase(y1);
    expect(house.stats.cash - late.stats.cash).toBe(550);
    expect(far.stats.cash - late.stats.cash).toBe(420);
    expect(Math.round(loans(late) - loans(house))).toBe(2400);
    expect(Math.round(loans(house) - loans(far))).toBe(1300);
  });
});

describe('medical bills', () => {
  it('a hospital payment plan is a real balance that gets paid off, not a bill forever', () => {
    let s = fresh();
    s.health = 'none';
    s = pick(at(s, 'ev-injury'), /payment plan/);
    const plan = s.loans.find((l) => l.name === 'Hospital payment plan')!;
    expect(plan.balance).toBe(3200);
    expect(plan.payment).toBe(150);
    expect(s.subs.some((x) => x.id === 'medplan')).toBe(false);
    expect(billsFor(s).some((b) => b.id === 'loan:Hospital payment plan' && b.amount === 150)).toBe(true);
  });
});

describe('health habits', () => {
  it('the gym, real food, and a winter coat mean fewer winter colds', () => {
    const s = fresh();
    s.week = 20;
    s.stats.energy = 50;
    s.plan.food = 'ramen';
    const base = fluRisk(s);
    s.flags.gym = true;
    expect(fluRisk(s)).toBeLessThan(base * 0.5);
    s.flags.gym = false;
    s.plan.food = 'cook';
    expect(fluRisk(s)).toBeLessThan(base);
    s.plan.food = 'ramen';
    s.flags.noCoat = true;
    expect(fluRisk(s)).toBeGreaterThan(base);
    expect(weightOf('ev-flu', s)).toBeGreaterThan(0);
    s.week = 8;
    expect(weightOf('ev-flu', s)).toBe(0);
  });
  it('skipping the coat saves the coat bill (that is the tradeoff)', () => {
    const s = fresh();
    const coat = LIFE_COSTS.find((c) => c.id === 'coat')!;
    expect(coat.when!(s)).toBe(true);
    s.flags.noCoat = true;
    expect(coat.when!(s)).toBe(false);
  });
  it('meal prep gives more energy than takeout', () => {
    expect(FOOD.cook.energy).toBeGreaterThan(FOOD.takeout.energy);
    expect(FOOD.cook.cost).toBeLessThan(FOOD.takeout.cost);
  });
});

describe('job perks and reliability', () => {
  it('a free meal every shift cuts the food bill', () => {
    let s = fresh();
    s.job!.id = 'crew';
    s.plan.food = 'ramen';
    expect(mealPerk(s)).toBe(20);
    s = startWeek(s, { ...defaultPlan(s), food: 'ramen' });
    expect(s.log.some((l) => /Free meals/.test(l.text))).toBe(true);
  });
  it('the retail employee discount applies to the winter coat', () => {
    let s = fresh();
    s.job!.id = 'retail';
    s.week = 16;
    s = startWeek(s, defaultPlan(s));
    expect(s.log.some((l) => /employee discount/.test(l.text))).toBe(true);
  });
  it('bosses don’t promote people who blow off shifts', () => {
    const s = fresh();
    s.flags.tenure = 12;
    s.flags.extraShifts = 5;
    s.stats.rep = 72;
    expect(weightOf('ev-promo1', s)).toBeGreaterThan(0);
    s.flags.skippedWork = 3;
    expect(weightOf('ev-promo1', s)).toBe(0);
    // A new job is a clean slate.
    s.flags.skippedAtHire = 3;
    expect(weightOf('ev-promo1', s)).toBeGreaterThan(0);
  });
  it('skipping a work day for something else counts against you', () => {
    let s = fresh();
    s = startWeek(s, { ...defaultPlan(s), slots: { ...defaultPlan(s).slots, weekday: 'rest' } });
    expect(s.flags.skippedWork).toBe(1);
  });
});

describe('the people around you', () => {
  it('a cut-off phone means missed shift changes', () => {
    const s = fresh();
    expect(weightOf('ev-missedtext', s)).toBe(0);
    s.flags.phoneCut = true;
    expect(weightOf('ev-missedtext', s)).toBeGreaterThan(0);
    const after = pick(at(s, 'ev-missedtext'), /phone bill/);
    expect(after.flags.phoneCut).toBe(false);
  });
  it('arguing with Mom twice gets you adult rent', () => {
    let s = fresh('home');
    const rent = s.housing.rent;
    s = pick(at(s, 'ev-curfew'), /Argue/);
    expect(s.housing.rent).toBe(rent);
    s = pick(at(s, 'ev-curfew'), /Argue/);
    expect(s.housing.rent).toBe(rent + 50);
  });
  it('calling home every so often brings a care package', () => {
    const s = fresh();
    for (let i = 0; i < 3; i++) ACTIVITIES.callhome.run(s, 'evening');
    expect(s.flags.carePackage).toBe(true);
  });
  it('talking to your roommate gets your $10 back', () => {
    let s = fresh();
    const cash = s.stats.cash;
    s = pick(at(s, 'ev-roomfood'), /Talk/);
    expect(s.stats.cash).toBe(cash + 10);
  });
});

describe('renters insurance pays off', () => {
  it('a burst pipe costs the deductible instead of everything', () => {
    let a = fresh();
    a.stats.cash = 2000;
    a.flags.rentersIns = true;
    a = pick(at(a, 'ev-leak'), /claim/);
    expect(a.stats.cash).toBe(1750);
    let b = fresh();
    b.stats.cash = 2000;
    b = pick(at(b, 'ev-leak'), /Replace/);
    expect(b.stats.cash).toBe(2000 - LEAK_DAMAGE);
  });
  it('a used tool kit’s dead multimeter has to be dealt with', () => {
    const s = fresh('trade');
    s.week = 8;
    expect(weightOf('ev-multimeter', s)).toBe(0);
    s.flags.toolsBroken = true;
    expect(weightOf('ev-multimeter', s)).toBeGreaterThan(0);
    const fixed = pick(at(s, 'ev-multimeter'), /Buy a new one/);
    expect(fixed.flags.toolsBroken).toBe(false);
  });
});

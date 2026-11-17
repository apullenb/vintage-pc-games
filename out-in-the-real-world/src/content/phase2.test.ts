import { describe, expect, it } from 'vitest';
import { newState } from './paths.ts';
import { MAJORS } from './college.ts';
import {
  CAR_TIERS,
  DTI_MAX,
  MORTGAGE_TIERS,
  amortized,
  canStartPhase2,
  carApr,
  debtPayments,
  dti,
  grossMonthly,
  homeCost,
  maxPrice,
  minDown,
  mortgagePayment,
  mortgageTier,
  pmiMonthly,
  salary,
  trackFor,
} from './phase2.ts';
import { billsFor, nextPhase, payBills, startWeek, defaultPlan } from '../engine/engine.ts';
import { finalScore } from '../engine/score.ts';
import { creditScore, netWorth } from '../engine/core.ts';
import type { GameState, PathId, School } from '../engine/types.ts';

const look = { skin: 0, hair: 0, hairStyle: 0, shirt: 0 };
const close = (a: number, b: number, tol = 1): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

// A save sitting on the year-one report card (the same shape old saves have).
function yearOneDone(path: PathId, f: (s: GameState) => void = () => {}): GameState {
  const s = newState('T', look, path, 1234);
  s.chapter = 6;
  s.week = 37;
  s.won = true;
  s.over = true;
  s.queue = [{ t: 'ending' }];
  s.chapterStars = [3, 3, 2, 3, 2, 3];
  s.stats.savings = 2000;
  s.credit = { firstWeek: 5, onTime: 10, late: 0, inquiries: [], collections: 0 };
  s.card = { name: 'Starter Card', kind: 'secured', limit: 500, apr: 0.27, balance: 0, deposit: 500, openedWeek: 5 };
  f(s);
  return s;
}

function school(major: School['major'], pct: number, extra: Partial<School> = {}): School {
  const term = (name: string) => ({ name, gpa: 0, grades: [{ id: 'eng', pct, letter: 'X', credits: 15 }], attempted: 15, earned: 15 });
  return { major, term: 1, courses: [], done: [term('Fall'), term('Spring')], prepAt: 0, examAt: 0, extraPrep: 0, skipsSeen: 0, probation: false, failed: 0, ...extra };
}

describe('mortgage math', () => {
  it('uses the standard amortization formula', () => {
    // $200,000 at 6% for 30 years is the textbook $1,199.10.
    close(mortgagePayment(200000, 0.06), 1199.1, 0.01);
    close(mortgagePayment(300000, 0.0725), 2046.53, 0.01);
    // 15 years costs more per month, much less in total.
    expect(mortgagePayment(200000, 0.06, 15)).toBeGreaterThan(mortgagePayment(200000, 0.06));
    expect(amortized(12000, 0, 12)).toBe(1000);
  });

  it('adds tax, insurance, HOA and PMI, and closing costs come on top of the down payment', () => {
    const t = mortgageTier(720)!;
    const c = homeCost(200000, 0.05, t, 150, 100);
    expect(c.down).toBe(10000);
    expect(c.loan).toBe(190000);
    expect(c.closing).toBe(6000);
    expect(c.tax).toBe(Math.round((200000 * 0.011) / 12));
    expect(c.total).toBe(c.pi + c.tax + c.insurance + c.hoa + c.pmi);
    expect(c.cash).toBe(c.down + c.closing + 450);
  });

  it('charges PMI under 20% down only (FHA insurance stays)', () => {
    const good = mortgageTier(780)!;
    expect(pmiMonthly(190000, 0.05, good)).toBeGreaterThan(0);
    expect(pmiMonthly(160000, 0.2, good)).toBe(0);
    expect(homeCost(200000, 0.2, good).pmi).toBe(0);
    const fha = mortgageTier(600)!;
    expect(fha.fha).toBe(true);
    expect(pmiMonthly(160000, 0.2, fha)).toBeGreaterThan(0);
    // Riskier borrowers pay more for PMI.
    expect(pmiMonthly(190000, 0.05, mortgageTier(630)!)).toBeGreaterThan(pmiMonthly(190000, 0.05, good));
  });

  it('sets rate tiers by credit score, with FHA under 620 and no loan under 580', () => {
    expect(mortgageTier(null)).toBeNull();
    expect(mortgageTier(560)).toBeNull();
    expect(mortgageTier(590)?.fha).toBe(true);
    expect(minDown(mortgageTier(590)!)).toBe(0.035);
    expect(minDown(mortgageTier(700)!)).toBe(0.03);
    const conventional = MORTGAGE_TIERS.filter((t) => !t.fha);
    for (let i = 1; i < conventional.length; i++) expect(conventional[i].apr).toBeGreaterThan(conventional[i - 1].apr);
    expect(mortgageTier(800)!.apr).toBe(0.06);
  });

  it('measures debt-to-income the way lenders do', () => {
    const s = newState('T', look, 'work', 1);
    s.job = { ...s.job!, wage: 30, hours: 40 };
    expect(grossMonthly(s)).toBe(5200);
    expect(debtPayments(s)).toBe(0);
    s.card = { name: 'C', kind: 'rewards', limit: 3000, apr: 0.24, balance: 1000, deposit: 0, openedWeek: 1 };
    s.loans.push({ name: 'Auto loan', balance: 15000, apr: 0.07, payment: 400, kind: 'car' });
    // Deferred student loans count at 0.5% of the balance.
    s.loans.push({ name: 'Student loans', balance: 20000, apr: 0.0639, payment: 226, kind: 'student', deferred: true });
    expect(debtPayments(s)).toBe(30 + 400 + 100);
    close(dti(s, 1500), (1500 + 530) / 5200, 0.001);
    // A car payment shrinks the house you can buy.
    const t = mortgageTier(740)!;
    const withCar = maxPrice(s, t, 0.05);
    s.loans = s.loans.filter((l) => l.kind !== 'car');
    expect(maxPrice(s, t, 0.05)).toBeGreaterThan(withCar);
    // The approved max actually fits under the DTI cap.
    const max = maxPrice(s, t, 0.05);
    expect(dti(s, homeCost(max, 0.05, t).total)).toBeLessThanOrEqual(DTI_MAX + 0.005);
    // Better credit and a bigger down payment both raise the ceiling.
    expect(maxPrice(s, mortgageTier(780)!, 0.05)).toBeGreaterThanOrEqual(maxPrice(s, mortgageTier(630)!, 0.05));
    expect(maxPrice(s, t, 0.2)).toBeGreaterThan(max);
    s.job = null;
    expect(maxPrice(s, t, 0.2)).toBe(0);
  });
});

describe('car loan APR by credit tier', () => {
  it('prices the loan by score, and used cars cost more to finance', () => {
    expect(carApr(760, true)).toBe(0.059);
    expect(carApr(760, false)).toBe(0.074);
    expect(carApr(690, true)).toBe(0.079);
    expect(carApr(620, false)).toBe(0.149);
    expect(carApr(null, true)).toBe(0.159);
    expect(carApr(540, false)).toBe(0.199);
    for (const t of CAR_TIERS) expect(t.usedApr).toBeGreaterThan(t.newApr);
    // Bad credit on a $25,000, 60-month loan costs thousands more.
    const good = amortized(25000, carApr(760, true), 60) * 60;
    const bad = amortized(25000, carApr(null, true), 60) * 60;
    expect(bad - good).toBeGreaterThan(4000);
  });
});

describe('salary by achievement', () => {
  it('hitting the year-one milestone starts you a rung higher on every path', () => {
    for (const path of ['home', 'trade', 'work'] as PathId[]) {
      const top = trackFor(yearOneDone(path, (s) => (s.flags.careerDone = true)));
      const low = trackFor(yearOneDone(path));
      expect(top.tier).toBe('top');
      expect(low.tier).not.toBe('top');
      expect(top.wage).toBeGreaterThan(low.wage);
      expect(low.next!.wage).toBeGreaterThan(low.wage);
      expect(low.levelUp).toBeTruthy();
      expect(top.next).toBeNull();
    }
    // Realistic 2026 pay: journeyman ~ $66k, supervisor ~ $60k, certified pharmacy tech ~ $50k.
    expect(salary(trackFor(yearOneDone('trade', (s) => (s.flags.careerDone = true))).wage)).toBe(66560);
    expect(salary(trackFor(yearOneDone('work', (s) => (s.flags.careerDone = true))).wage)).toBe(60010);
    expect(salary(trackFor(yearOneDone('home', (s) => (s.flags.careerDone = true))).wage)).toBe(49920);
    // Home: the certificate coursework is worth something even without the job.
    expect(trackFor(yearOneDone('home', (s) => (s.flags.certEnrolled = true))).wage).toBeGreaterThan(trackFor(yearOneDone('home')).wage);
  });

  it('promotions and skills from year one raise the pay', () => {
    const base = trackFor(yearOneDone('work', (s) => (s.flags.careerDone = true))).wage;
    const promoted = trackFor(yearOneDone('work', (s) => Object.assign(s.flags, { careerDone: true, promo1: true, promo2: true }))).wage;
    expect(promoted).toBeCloseTo(base + 1.5, 2);
    const skilled = trackFor(yearOneDone('work', (s) => Object.assign(s, { skills: ['forklift', 'excel', 'spanish'] }, { flags: { ...s.flags, careerDone: true } }))).wage;
    expect(skilled).toBeGreaterThan(base);
  });

  it('college: major, GPA, honors and internship set the first salary; poor standing graduates later', () => {
    const grad = (major: School['major'], pct: number, extra: Partial<School> = {}, careerDone = true) =>
      trackFor(
        yearOneDone('college', (s) => {
          s.school = school(major, pct, extra);
          s.flags.careerDone = careerDone;
        }),
      );
    const cs = grad('cs', 95, { honors: true, internship: 'summer software internship' });
    expect(cs.title).toBe('Junior Software Developer');
    expect(salary(cs.wage)).toBeGreaterThan(MAJORS.cs.pay * 1.1);
    expect(grad('cs', 85).wage).toBeLessThan(cs.wage);
    expect(grad('education', 95).wage).toBeLessThan(grad('nursing', 95).wage);
    // Under a 3.0: you still graduate, a bit lower, with a second chance at a raise.
    const mid = grad('business', 78, {}, false);
    expect(mid.tier).toBe('mid');
    expect(mid.wage).toBeLessThan(grad('business', 85).wage);
    // Off track (suspended, under a 2.0): graduation slips and you start in a non-degree job.
    const low = grad('nursing', 60, { probation: true }, false);
    expect(low.tier).toBe('low');
    expect(low.years).toBe(3.5);
    expect(low.next!.title).toBe('Registered Nurse');
    expect(low.wage).toBeLessThan(low.next!.wage);
  });
});

describe('the transition', () => {
  it('year one ends on its report card; Continue starts the next phase (old saves too)', () => {
    const s = yearOneDone('work', (x) => (x.flags.careerDone = true));
    expect(canStartPhase2(s)).toBe(true);
    const y1 = finalScore(s);
    const n = nextPhase(s);
    expect(n).not.toBe(s);
    expect(n.over).toBe(false);
    expect(n.won).toBe(false);
    expect(n.chapter).toBe(6);
    expect(n.week).toBe(37);
    expect(n.phase2?.y1.total).toBe(y1.total);
    expect(n.phase2?.y1.grade).toBe(y1.grade);
    expect(n.queue[0]).toMatchObject({ t: 'scene', id: 'p2-skip' });
    expect(n.job?.title).toBe('Operations Supervisor');
    expect(n.checkpoint).toBeTruthy();
    // Only once.
    expect(canStartPhase2(n)).toBe(false);
    expect(nextPhase(n)).toBe(n);
    // Not from the middle of year one.
    const mid = newState('T', look, 'work', 1);
    expect(nextPhase(mid)).toBe(mid);
  });

  it('three years of habits: savers save, card-carriers sink, students borrow', () => {
    const saver = nextPhase(yearOneDone('trade', (s) => (s.stats.savings = 3000)));
    expect(saver.stats.savings).toBeGreaterThan(9000);
    expect(saver.card!.limit).toBeGreaterThan(500);
    expect(saver.card!.deposit).toBe(0); // the secured card graduated
    const carrier = nextPhase(
      yearOneDone('trade', (s) => {
        s.card!.balance = 400;
        s.flags.cardCarry = true;
      }),
    );
    expect(carrier.card!.balance).toBeGreaterThan(400);
    expect(creditScore(carrier)!).toBeLessThan(creditScore(saver)!);
    const student = nextPhase(
      yearOneDone('college', (s) => {
        s.school = school('business', 90);
        s.flags.careerDone = true;
      }),
    );
    const loans = student.loans.find((l) => l.kind === 'student')!;
    expect(loans.balance).toBeGreaterThan(10000);
    expect(loans.deferred).toBe(true);
    expect(student.flags.enrolled).toBe(false);
    expect(student.achievements).toContain('graduate');
    expect(Number.isFinite(netWorth(student))).toBe(true);
  });
});

describe('owning a home', () => {
  function owner(): GameState {
    const s = nextPhase(yearOneDone('work', (x) => (x.flags.careerDone = true)));
    s.queue = [];
    s.housing = { kind: 'owned', name: 'Test house', rent: 420, utilities: 240, missed: 0, roommate: false, art: 'street' };
    s.loans.push({ name: 'Mortgage', balance: 190000, apr: 0.0625, payment: 1170, kind: 'mortgage' });
    s.phase2!.home = { name: 'Test house', kind: 'house', price: 200000, value: 200000, down: 10000, tax: 183, insurance: 150, hoa: 0, pmi: 87, boughtWeek: 37 };
    s.stats.cash = 0;
    s.stats.savings = 0;
    return s;
  }
  it('the mortgage replaces rent on bills day, and the home counts toward net worth', () => {
    const s = owner();
    const bills = billsFor(s);
    expect(bills.find((b) => b.id === 'loan:Mortgage')?.amount).toBe(1170);
    expect(bills.find((b) => b.id === 'rent')?.label).toMatch(/escrow/i);
    // Equity = value − mortgage.
    const before = netWorth(s);
    s.phase2!.home!.value += 10000;
    expect(netWorth(s)).toBe(before + 10000);
  });
  it('two missed mortgage payments means foreclosure', () => {
    let s = owner();
    s.week = 40;
    for (let i = 0; i < 2; i++) {
      s.queue = [{ t: 'billsDue', bills: billsFor(s) }];
      s = payBills(s, {});
    }
    expect(s.queue.some((q) => q.t === 'gameOver' && q.reason === 'foreclosed')).toBe(true);
  });
  it('a homeowner week runs without errors', () => {
    const s = owner();
    s.stats.cash = 5000;
    const n = startWeek(s, defaultPlan(s));
    expect(Number.isFinite(n.stats.cash)).toBe(true);
  });
});

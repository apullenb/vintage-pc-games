// The next phase of life: what year one turns into (the time skip and the new job), the money math
// for the big purchases (car loans, mortgages, debt-to-income), and the three chapters that follow.
// Scenes live in scenes/phase2.ts. Nothing here imports the engine loop, so there are no import cycles.
import { achieve, charge, creditScore, energy, inc, log, minigame, money, netWorth, num, round2, scene, setFlag, unlock } from '../engine/core.ts';
import type { ArtId, GameState, Step, Tier, YearOne } from '../engine/types.ts';
import { MAJORS, gpa, gpaText, major, onTime, onTrackToGraduate, startingPay } from './college.ts';
import type { Activity, Chapter, GameEvent, Task } from './types.ts';
import { LISTING_BY_ID, jobFrom } from './jobs.ts';
import { addSkill, hasSkill } from './skills.ts';

export const YEAR1_CHAPTERS = 6;
export const YEAR1_WEEKS = 36;
export const P2_FIRST_WEEK = YEAR1_WEEKS + 1;

export const inPhase2 = (s: GameState): boolean => !!s.phase2;
// Year one is over and the next phase hasn't started yet (also true for saves from before the next phase existed).
export const canStartPhase2 = (s: GameState): boolean => !s.phase2 && s.won && s.queue[0]?.t === 'ending' && s.chapter >= YEAR1_CHAPTERS;
// Still a student (college path, year one). After graduation you're a regular employee.
export const student = (s: GameState): boolean => s.path === 'college' && !s.phase2;
// Week numbers as the player sees them: the next phase counts from 1 again.
export const shownWeek = (s: GameState, w = s.week): number => (s.phase2 ? w - YEAR1_WEEKS : w);

// ---------- income ----------
export const grossMonthly = (s: GameState): number => (s.job ? Math.round((s.job.wage * s.job.hours * 52) / 12) : 0);
export const salary = (wage: number): number => Math.round((wage * 2080) / 10) * 10;

// Same 2026 withholding as the engine's pay stub (biweekly, single filer).
function fedTax(perCheck: number): number {
  const annual = perCheck * 26 - 8600;
  const br: [number, number][] = [
    [7500, 0.1],
    [19900, 0.12],
    [57900, 0.22],
  ];
  let tax = 0;
  for (let i = 0; i < br.length; i++) {
    const [lo, rate] = br[i];
    const hi = br[i + 1]?.[0] ?? Infinity;
    if (annual > lo) tax += (Math.min(annual, hi) - lo) * rate;
  }
  return tax / 26;
}

// Take-home per paycheck at base hours (taxes, premiums and 401(k) out).
export function netPaycheck(s: GameState, retirePct = s.retirePct): number {
  if (!s.job) return 0;
  const gross = s.job.wage * s.job.hours * 2;
  const health = s.health === 'employer' ? s.job.premium : 0;
  const dental = s.dental ? s.job.dentalPremium : 0;
  const retire = gross * retirePct;
  const taxable = Math.max(0, gross - retire - health - dental);
  const fica = student(s) ? 0 : (gross - health - dental) * 0.0765;
  return Math.round(gross - fedTax(taxable) - fica - taxable * 0.035 - health - dental - retire);
}
export const netMonthly = (s: GameState): number => Math.round((netPaycheck(s) * 26) / 12);

// ---------- loans ----------
export function amortized(principal: number, apr: number, months: number): number {
  if (principal <= 0) return 0;
  const r = apr / 12;
  if (r === 0) return round2(principal / months);
  return round2((principal * r) / (1 - Math.pow(1 + r, -months)));
}
export const mortgagePayment = (principal: number, apr: number, years = 30): number => amortized(principal, apr, years * 12);
export const totalInterest = (principal: number, apr: number, months: number): number => Math.round(amortized(principal, apr, months) * months - principal);

// Monthly debt payments the way a lender counts them (deferred student loans count at 0.5% of the balance).
export function debtPayments(s: GameState): number {
  let d = s.card && s.card.balance > 0 ? Math.max(25, s.card.balance * 0.03) : 0;
  for (const l of s.loans) {
    if (l.balance <= 0 || l.kind === 'mortgage') continue;
    d += l.deferred ? l.balance * 0.005 : l.payment;
  }
  return Math.round(d);
}
// Debt-to-income: housing plus debts, over gross monthly pay.
export function dti(s: GameState, housing: number, extraDebt = 0): number {
  const g = grossMonthly(s);
  return g > 0 ? (housing + debtPayments(s) + extraDebt) / g : 9;
}
export const DTI_MAX = 0.43; // the classic qualified-mortgage line
export const CAR_DTI_MAX = 0.5; // auto lenders are looser

// Car loan APRs by credit score, 2026-ish. New cars get maker promo rates; used cars cost more to finance.
export const CAR_TIERS = [
  { min: 720, label: '720+', newApr: 0.059, usedApr: 0.074 },
  { min: 660, label: '660–719', newApr: 0.079, usedApr: 0.105 },
  { min: 600, label: '600–659', newApr: 0.119, usedApr: 0.149 },
  { min: 0, label: 'Under 600 / none', newApr: 0.159, usedApr: 0.199 },
];
export function carTier(score: number | null): (typeof CAR_TIERS)[number] {
  return CAR_TIERS.find((t) => (score ?? 0) >= t.min) ?? CAR_TIERS[CAR_TIERS.length - 1];
}
export const carApr = (score: number | null, isNew: boolean): number => (isNew ? carTier(score).newApr : carTier(score).usedApr);

// Mortgage rates by credit score. Under 620 only an FHA loan works; under 580, nobody lends.
export interface RateTier {
  min: number;
  label: string;
  apr: number;
  fha?: boolean;
  pmi: number; // yearly mortgage insurance, share of the loan, under 20% down
}
export const MORTGAGE_TIERS: RateTier[] = [
  { min: 760, label: '760+', apr: 0.06, pmi: 0.0045 },
  { min: 700, label: '700–759', apr: 0.0625, pmi: 0.0065 },
  { min: 660, label: '660–699', apr: 0.0675, pmi: 0.009 },
  { min: 620, label: '620–659', apr: 0.0725, pmi: 0.0115 },
  { min: 580, label: '580–619 (FHA)', apr: 0.07, fha: true, pmi: 0.0055 },
];
export function mortgageTier(score: number | null): RateTier | null {
  if (score === null) return null;
  return MORTGAGE_TIERS.find((t) => score >= t.min) ?? null;
}
export const minDown = (t: RateTier): number => (t.fha ? 0.035 : 0.03);
export const PROPERTY_TAX = 0.011; // a year, share of the price
export const CLOSING = 0.03; // closing costs, share of the price
export const INSPECTION = 450;

export function pmiMonthly(loan: number, downPct: number, t: RateTier): number {
  // FHA mortgage insurance stays; conventional PMI drops off at 20% equity.
  if (downPct >= 0.2 && !t.fha) return 0;
  return Math.round((loan * t.pmi) / 12);
}

export interface HomeCost {
  down: number;
  loan: number;
  pi: number; // principal & interest
  tax: number;
  insurance: number;
  hoa: number;
  pmi: number;
  total: number; // all-in monthly
  closing: number;
  cash: number; // down + closing + inspection
}
export function homeCost(price: number, downPct: number, t: RateTier, insurance = 150, hoa = 0): HomeCost {
  const down = Math.round(price * downPct);
  const loan = price - down;
  const pi = Math.round(mortgagePayment(loan, t.apr));
  const tax = Math.round((price * PROPERTY_TAX) / 12);
  const pmi = pmiMonthly(loan, downPct, t);
  const closing = Math.round(price * CLOSING);
  return { down, loan, pi, tax, insurance, hoa, pmi, total: pi + tax + insurance + hoa + pmi, closing, cash: down + closing + INSPECTION };
}

// The most house a lender approves at a given down payment (typical insurance, no HOA).
export function maxPrice(s: GameState, t: RateTier, downPct: number): number {
  const room = DTI_MAX * grossMonthly(s) - debtPayments(s) - 150;
  if (room <= 0) return 0;
  const perDollar = (1 - downPct) * (mortgagePayment(1e6, t.apr) / 1e6 + (downPct >= 0.2 && !t.fha ? 0 : t.pmi / 12)) + PROPERTY_TAX / 12;
  return Math.max(0, Math.floor(room / perDollar / 5000) * 5000);
}

export const cashOnHand = (s: GameState): number => Math.max(0, s.stats.cash) + Math.max(0, s.stats.savings);
// Big purchases come out of savings first, then checking.
export function drawCash(s: GameState, amount: number): void {
  const fromSav = Math.min(Math.max(0, s.stats.savings), amount);
  s.stats.savings = round2(s.stats.savings - fromSav);
  s.stats.cash = round2(s.stats.cash - (amount - fromSav));
}

// ---------- the time skip ----------
interface Track {
  tier: Tier;
  years: number;
  title: string;
  place: string;
  wage: number;
  art: ArtId;
  next: { title: string; wage: number; place?: string } | null;
  levelUp: string | null;
  need: { xp: number; rep: number };
  story: string;
  listing?: string; // the job-board listing this job is (so the board knows it's yours)
}

// Degree jobs come straight off the job board's next-phase listings.
const MAJOR_LISTING: Record<string, string> = { nursing: 'p2-rn', cs: 'p2-dev', business: 'p2-analyst', education: 'p2-teacher', undeclared: 'p2-comms' };
const majorJob = (m: string): { title: string; place: string; art: ArtId; listing: string } => {
  const l = LISTING_BY_ID[MAJOR_LISTING[m] ?? 'p2-comms'];
  return { title: l.title, place: l.place, art: l.art, listing: l.id };
};

// What you did in year one, priced as a raise: promotions you earned, and any skills on your résumé.
export function promoBonus(s: GameState): number {
  return (s.flags.promo1 === true ? 0.75 : 0) + (s.flags.promo2 === true ? 0.75 : 0);
}
export function skillCount(s: GameState): number {
  const sk = (s as GameState & { skills?: unknown }).skills;
  return Array.isArray(sk) ? sk.filter((x) => typeof x === 'string').length : 0;
}
export const skillBoost = (s: GameState): number => 1 + 0.015 * Math.min(4, skillCount(s));
const cents = (v: number): number => Math.round(v * 100) / 100;
const hourly = (annual: number): number => cents(annual / 2080);

export function trackFor(s: GameState): Track {
  const boost = skillBoost(s);
  const bonus = promoBonus(s);
  const top = !!s.flags.careerDone;
  const NEED = { xp: 60, rep: 60 };
  switch (s.path) {
    case 'college': {
      const m = major(s) ?? 'undeclared';
      const job = majorJob(m);
      const sc = s.school;
      const g = gpaText(gpa(s));
      if (!onTrackToGraduate(s)) {
        // Off track: grades, suspension, never declaring, or dropping out pushes graduation back.
        const pay = Math.round((startingPay(s) || MAJORS.undeclared.pay) * 0.92);
        return {
          tier: 'low',
          years: 3.5,
          title: 'Customer Support Specialist',
          place: 'Brightwave Software',
          wage: cents(21 * boost),
          art: 'office',
          next: { title: job.title, place: job.place, wage: hourly(pay * boost) },
          levelUp: 'Finish your last two classes and graduate',
          need: { xp: 55, rep: 50 },
          story: `College took the long way. A rough year one (${g} GPA) meant retakes, a semester off, and a part-time job that turned full-time. You’re two classes short of a ${MAJORS[m].name} degree.`,
        };
      }
      // Plenty of employers screen at a 3.0 GPA, so missing it costs you a little at the start.
      const pay = Math.round(startingPay(s) * boost * (top ? 1 : 0.95));
      const late = !onTime(s);
      const honors = !!sc?.honors;
      return {
        tier: top ? 'top' : 'mid',
        years: late ? 3.5 : 3,
        title: job.title,
        place: job.place,
        wage: hourly(pay),
        art: job.art,
        listing: job.listing,
        next: top ? null : { title: `${job.title} II`, wage: hourly(pay * 1.08) },
        levelUp: top ? null : 'Earn a raise at your six-month review',
        need: NEED,
        story: `${late ? 'Three and a half years (one extra semester)' : 'Three more years'} of classes, finals and dining-hall casseroles. You walk across the stage with a ${MAJORS[m].name} degree${honors ? ', cum laude' : ''}.${sc?.internship ? ` Your ${sc.internship} turned into a job offer.` : ''}`,
      };
    }
    case 'trade':
      return top
        ? {
            tier: 'top',
            years: 3,
            title: 'Journeyman Electrician',
            place: 'Brightline Electric',
            wage: cents((32 + bonus) * boost),
            art: 'jobsite',
            next: null,
            levelUp: null,
            need: NEED,
            story: 'Three more years of conduit, code books and 6 AM starts. 8,000 hours logged, one licensing exam passed. You’re a licensed journeyman electrician, and Dee finally stopped calling you “kid.”',
          }
        : {
            tier: 'low',
            years: 3,
            title: 'Year 4 Apprentice',
            place: 'Brightline Electric',
            wage: cents((26 + bonus) * boost),
            art: 'jobsite',
            next: { title: 'Journeyman Electrician', wage: cents((32 + bonus) * boost) },
            levelUp: 'Pass the journeyman licensing exam',
            need: { xp: 65, rep: 55 },
            story: 'Repeating Year 1 cost you a step, so the crew you started with got licensed first. You’re a Year 4 apprentice now. One exam stands between you and a journeyman card.',
          };
    case 'work':
      return top
        ? {
            tier: 'top',
            years: 3,
            title: 'Operations Supervisor',
            // Promoted wherever you ended year one (ParcelPoint, or the warehouse that hired you away).
            place: s.job?.art === 'warehouse' ? s.job.place : 'ParcelPoint',
            wage: cents((28.85 + bonus) * boost),
            art: 'warehouse',
            next: null,
            levelUp: null,
            need: NEED,
            story: 'Team Lead turned into running a whole shift, then the whole night side. Now you’re Operations Supervisor: salaried, a parking spot with your name on it, and a radio that never stops.',
          }
        : {
            tier: 'low',
            years: 3,
            title: 'Team Lead',
            place: 'ParcelPoint',
            wage: cents((22.5 + bonus) * boost),
            art: 'warehouse',
            next: { title: 'Operations Supervisor', wage: cents((28.85 + bonus) * boost) },
            levelUp: 'Earn the Operations Supervisor job',
            need: { xp: 60, rep: 65 },
            story: 'You got Team Lead the second time around, and you’ve been good at it for a while now. The supervisor job just opened up. This time you want it.',
          };
    default:
      // Home: the pharmacy tech certificate is the ticket.
      if (top)
        return {
          tier: 'top',
          years: 3,
          title: 'Certified Pharmacy Technician',
          place: 'Riverside General Hospital',
          wage: cents((24 + bonus) * boost),
          art: 'clinic',
          listing: 'p2-cpht',
          next: null,
          levelUp: null,
          need: NEED,
          story: 'You passed the PTCB exam, got certified, and the hospital pharmacy hired you away from Fresh Fields. Real benefits, a 401(k) match, and scrubs with pockets.',
        };
      if (hasSkill(s, 'cpht'))
        return {
          tier: 'mid',
          years: 3,
          title: 'Pharmacy Technician',
          place: 'CareRx Pharmacy',
          wage: cents((20 + bonus) * boost),
          art: 'clinic',
          listing: 'pharmtech',
          next: { title: 'Certified Pharmacy Technician', place: 'Riverside General Hospital', wage: cents((23.5 + bonus) * boost) },
          levelUp: 'Land the hospital pharmacy job',
          need: { xp: 50, rep: 55 },
          story: 'You got certified and landed a retail pharmacy job. Steady, but the hospital pharmacy pays more and has the better 401(k). They’re hiring.',
        };
      if (s.flags.certEnrolled || s.flags.course === 'cpht')
        return {
          tier: 'mid',
          years: 3,
          title: 'Pharmacy Tech Trainee',
          place: 'Fresh Fields Pharmacy',
          wage: cents((19 + bonus) * boost),
          art: 'grocery',
          next: { title: 'Certified Pharmacy Technician', place: 'Riverside General Hospital', wage: cents((23 + bonus) * boost) },
          levelUp: 'Pass the pharmacy tech certification exam',
          need: { xp: 55, rep: 55 },
          story: 'You finished the coursework, moved behind the pharmacy counter, and counted a lot of pills by fives. The certification exam is the last step.',
        };
      return {
        tier: 'low',
        years: 3,
        title: 'Front-End Supervisor',
        place: 'Fresh Fields Market',
        wage: cents((17.5 + bonus) * boost),
        art: 'grocery',
        next: { title: 'Certified Pharmacy Technician', place: 'Riverside General Hospital', wage: cents((22.5 + bonus) * boost) },
        levelUp: 'Earn your pharmacy tech certification',
        need: { xp: 65, rep: 55 },
        story: 'You worked your way up to running the registers at Fresh Fields. It’s steady, but the pharmacy techs in the back make $5 an hour more, and the hospital is hiring.',
      };
  }
}

// Student loans for the rest of college: more if the scholarship got cut.
export function moreStudentDebt(s: GameState, years: number): number {
  if (s.path !== 'college') return 0;
  return Math.round(((s.flags.careerDone ? 4800 : 8500) * years) / 100) * 100;
}

const yearsText = (y: number): string => (y === 3.5 ? 'Three and a half years' : y === 4 ? 'Four years' : 'Three years');
export const skipLabel = (s: GameState): string => `${yearsText(s.phase2?.years ?? 3)} later…`;

// Apply the time skip: new job, three years of your habits, and what that did to your money.
export function beginPhase2(s: GameState, y1: YearOne): void {
  const t = trackFor(s);
  const recap: string[] = [];
  const years = t.years;
  // Your habits keep going. People who saved in year one kept saving (with bigger paychecks);
  // college money mostly goes to college.
  const y1save = Math.max(0, s.stats.savings);
  const habit = s.path === 'college' ? 0.4 : 1.1;
  const added = Math.round((y1save * habit * years) / 50) * 50;
  if (added > 0) {
    s.stats.savings = round2(s.stats.savings + added);
    recap.push(`Savings: you kept the habit. +${money(added)}, now ${money(s.stats.savings)}.`);
  } else recap.push(`Savings: ${s.stats.savings > 0 ? `still ${money(s.stats.savings)}. The habit never really stuck.` : 'still basically zero.'}`);

  // Credit cards: careful users get limit increases; balance-carriers dig deeper.
  if (s.card) {
    const c = s.card;
    const good = s.credit.late === 0 && !s.flags.cardCarry;
    s.credit.onTime += good ? 30 : 18;
    if (good) {
      const old = c.limit;
      c.limit = Math.max(2000, Math.round((c.limit * 3) / 500) * 500);
      c.balance = 0;
      if (c.kind === 'secured' && c.deposit > 0) {
        s.stats.savings = round2(s.stats.savings + c.deposit);
        recap.push(`Credit card: paid in full every month. Your secured card “graduated”: ${money(c.deposit)} deposit back, limit up from ${money(old)} to ${money(c.limit)}.`);
        c.deposit = 0;
        c.kind = 'rewards';
      } else recap.push(`Credit card: paid in full every month. Limit up from ${money(old)} to ${money(c.limit)}.`);
    } else {
      const before = c.balance;
      c.balance = round2(Math.min(c.limit * 0.92, c.balance * 2 + 300));
      s.flags.cardCarry = true;
      recap.push(`Credit card: you kept carrying a balance. It grew from ${money(before)} to ${money(c.balance)}, at ${Math.round(c.apr * 100)}% APR.`);
    }
  } else recap.push('Credit: you never opened a card or loan, so lenders still can’t see you. No history, no score.');

  // Loans you were paying keep getting paid down.
  for (const l of s.loans) {
    if (l.kind === 'student' || l.balance <= 0 || l.payment <= 0) continue;
    let b = l.balance;
    for (let m = 0; m < years * 12 && b > 0; m++) b = b * (1 + l.apr / 12) - l.payment;
    l.balance = round2(Math.max(0, b));
    s.credit.onTime += 12;
    recap.push(l.balance > 0 ? `${l.name}: ${money(l.balance)} left.` : `${l.name}: paid off!`);
  }
  s.loans = s.loans.filter((l) => l.balance > 0.5);

  // The rest of college, on loans.
  const more = moreStudentDebt(s, years);
  if (s.path === 'college') {
    const owed = s.loans.filter((l) => l.kind === 'student').reduce((a, l) => a + l.balance, 0) + more;
    s.loans = s.loans.filter((l) => l.kind !== 'student');
    if (owed > 0) {
      s.loans.push({ name: 'Student loans', balance: round2(owed), apr: 0.0639, payment: amortized(owed, 0.0639, 120), kind: 'student', deferred: true });
      recap.push(`Student loans: ${money(owed)} at 6.39%. Payments start after a six-month grace period.`);
    }
    s.flags.enrolled = false;
    if (t.tier !== 'low') {
      setFlag(s, 'graduated');
      achieve(s, 'graduate');
    }
  }

  // Your car got older (and so did you: insurance is cheaper at 22 than 18).
  if (s.car) {
    s.car.condition = Math.max(8, s.car.condition - 25);
    s.car.value = Math.round(s.car.value * 0.6);
    s.car.insurance = Math.round(s.car.insurance * 0.75);
    recap.push(`Your ${s.car.name}: worth ${money(s.car.value)} now, condition ${Math.round(s.car.condition)}%. Insurance dropped to ${money(s.car.insurance)}/mo (you’re not a teen driver anymore).`);
  }

  // Retirement: contributions plus a few years of growth.
  const r0 = s.retire;
  s.retire = Math.round(s.retirePct > 0 ? r0 * (1.2 + years) + 600 * years : r0 * 1.2);
  if (s.retire > 0) recap.push(`401(k): ${money(s.retire)}${s.retirePct > 0 ? ', thanks to contributions and the match' : ', just from growth'}.`);

  // The new job.
  const listing = t.listing ? LISTING_BY_ID[t.listing] : undefined;
  s.job = listing ? { ...jobFrom(listing, t.wage), hours: 40 } : { title: t.title, place: t.place, wage: t.wage, hours: 40, healthOffered: true, premium: 70, dentalPremium: 8, match: 0.04, art: t.art };
  // Three years on the job count as experience; seniority only counts if you stayed put.
  s.flags.expWeeks = num(s, 'expWeeks') + Math.round(years * 52);
  s.flags.tenure = s.flags.tenurePlace === t.place ? num(s, 'tenure') + Math.round(years * 52) : 0;
  s.flags.tenurePlace = t.place;
  s.flags.clawback = 0;
  s.flags.clawbackUntil = 0;
  s.flags.certMigrated = true;
  for (const k of ['interviewFor', 'offerFor', 'newJobId', 'newJobAt', 'applyTo', 'referral']) delete s.flags[k];
  if (s.path === 'home' && t.tier === 'top') addSkill(s, 'cpht', 'Certified pharmacy technician.');
  if (s.path === 'trade' && t.tier === 'top') addSkill(s, 'osha10', 'Every journeyman has their OSHA card.');
  if (s.health === 'school') s.health = 'employer';
  s.hoursThisPeriod = 0;
  s.appointments = [];
  s.stats.xp = 20;
  s.stats.rep = t.tier === 'top' ? 62 : 56;
  s.stats.energy = Math.max(s.stats.energy, 72);
  // Things that ended with year one.
  s.subs = s.subs.filter((x) => !['schoolbal', 'tuitionplan', 'nightclass', 'rides', 'carshare'].includes(x.id));
  if (s.transport === 'borrow' || s.transport === 'carpool') {
    s.transport = s.car ? 'car' : 'bus';
    if (!s.car && !s.subs.some((x) => x.id === 'buspass')) s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
  }
  if (!s.subs.some((x) => x.id === 'phone')) s.subs.push({ id: 'phone', label: 'Phone plan', cost: 45 });
  s.flags.familyPhone = false;
  // Year-one errands are long behind you (three years is a while).
  for (const k of ['license', 'docs', 'transportSet', 'budget', 'taxesFiled']) s.flags[k] = true;
  if (s.path === 'college') s.flags.fafsa = true;
  if (s.path === 'trade') s.flags.tools = true;
  for (const id of ['ev-promo1', 'ev-promo2', 'ev-raise', 'ev-bonus', 'ev-hourscut', 'ev-laptop', 'ev-accesscode', 'ev-heat']) s.flags[`seen:${id}`] = true;
  // About half of credit reports have a mistake on them somewhere. Yours does.
  if (s.credit.firstWeek !== null && (s.seed >>> 3) % 2 === 0) {
    s.credit.collections += 1;
    setFlag(s, 'creditError');
  }
  if (s.path === 'college' && t.tier !== 'low') {
    s.stats.cash = round2(s.stats.cash + 400);
    recap.push('Graduation cards from family: +$400. Grandma’s had a $50 bill in it, as always.');
  }

  // Baselines for the next-phase scorecard.
  s.flags.rentMissed0 = num(s, 'rentMissed');
  s.flags.late0 = s.credit.late;
  s.flags.overdrafts0 = num(s, 'overdrafts');
  const nw = netWorth(s);
  s.phase2 = {
    years,
    tier: t.tier,
    story: t.story,
    recap,
    job: `${t.title} at ${t.place}`,
    next: t.next ? { place: t.place, ...t.next } : null,
    levelUp: t.levelUp,
    need: t.need,
    y1,
    nw0: Math.round(nw),
    efundGoal: 0,
  };
  unlock(s, 'lifestyle-creep');
}

// Three months of the basics: housing, bills, food, getting around.
export function essentials(s: GameState): number {
  let m = s.housing.rent + s.housing.utilities;
  for (const x of s.subs) m += x.cost;
  if (s.car) m += s.car.insurance;
  for (const l of s.loans) if (!l.deferred) m += l.payment;
  m += s.housing.kind === 'parents' ? 110 : 370; // groceries
  m += s.car ? 150 : 0; // gas
  return Math.round(m);
}
export function setEfundGoal(s: GameState): void {
  if (s.phase2) s.phase2.efundGoal = Math.max(3000, Math.round((essentials(s) * 3) / 500) * 500);
}
export const efundGoal = (s: GameState): number => s.phase2?.efundGoal || Math.max(3000, Math.round((essentials(s) * 3) / 500) * 500);

// The second-chance goal, if you still have one.
export const hasLevelUp = (s: GameState): boolean => !!s.phase2?.next && !s.flags.p2Up;
export const levelReady = (s: GameState): boolean => !!s.phase2 && s.stats.xp >= s.phase2.need.xp && s.stats.rep >= s.phase2.need.rep;

export function levelUp(s: GameState): void {
  const p = s.phase2;
  if (!p?.next || !s.job) return;
  s.job = { ...s.job, title: p.next.title, wage: p.next.wage, place: p.next.place ?? s.job.place, art: p.next.place?.includes('Hospital') ? 'clinic' : s.path === 'college' ? majorJob(major(s) ?? 'undeclared').art : s.job.art, id: undefined };
  setFlag(s, 'p2Up');
  s.flags.tenurePlace = s.job.place; // a promotion, not a new job: seniority stays
  if (s.path === 'home') addSkill(s, 'cpht', 'Certified pharmacy technician.');
  if (s.path === 'college') setFlag(s, 'graduated');
  achieve(s, 'secondwind');
}

// ---------- chapters ----------
export const PHASE2_CHAPTERS: Chapter[] = [
  {
    title: 'A Bigger Paycheck',
    subtitle: 'The next phase · Weeks 1–6',
    weeks: 6,
    art: 'office',
    intro: (s) =>
      `First real paycheck at the new job: ${money(netPaycheck(s))} take-home, every two weeks. Your brain is already spending it. Coworkers are leasing SUVs. Decide where the raise goes before it decides for you.`,
  },
  {
    title: 'Nice Wheels',
    subtitle: 'The next phase · Weeks 7–12',
    weeks: 6,
    art: 'carlot',
    intro: (s) =>
      `${s.car ? `Your ${s.car.name} is ${s.car.condition < 35 ? 'making a noise that sounds expensive' : 'still running, mostly'}.` : 'You’ve been getting around without a car for years.'} Dealers can smell a new paycheck from three blocks away. New, certified pre-owned, or keep what you’ve got? Your credit score sets the price of the money.${hasLevelUp(s) ? ` And this is your shot: ${s.phase2?.levelUp?.toLowerCase()}.` : ''}`,
  },
  {
    title: 'Home Base',
    subtitle: 'The next phase · Weeks 13–18',
    weeks: 6,
    art: 'street',
    intro: (s) =>
      s.housing.kind === 'parents'
        ? 'Your mom left a printout of a starter home on your pillow. Subtle. Buy a place, or stay put and keep stacking cash? Run the real numbers: down payment, closing costs, and a monthly payment you can live with.'
        : `Lease renewal letter: your rent goes up 6% next month (to ${money(Math.round(s.housing.rent * 1.06))}). A coworker says renting is “throwing money away.” Is it? Buy a home or renew, and run the real numbers first.`,
  },
];

// ---------- missions ----------
const P2 = 6;
export const PHASE2_TASKS: Task[] = [
  // ----- A Bigger Paycheck -----
  {
    id: 'p2-budget',
    chapter: P2,
    title: 'Make a grown-up budget',
    desc: 'New pay, new bills. Decide how much of the raise you keep before lifestyle creep takes it.',
    how: 'Rebuild your budget (evening or Sunday)',
    done: (s) => !!s.flags.budget2,
    failText: 'No plan. The raise quietly disappears into takeout and upgrades.',
    onFail: (s) => {
      setFlag(s, 'lifestyle', 'lavish');
    },
  },
  {
    id: 'p2-match',
    chapter: P2,
    title: 'Get the full 401(k) match',
    desc: 'Your employer adds 4% of your pay, but only if you put in 4%. It’s a 100% return.',
    how: 'Update your 401(k) (evening)',
    done: (s) => !!s.job && s.job.match > 0 && s.retirePct >= s.job.match,
    progress: (s) => `Contributing ${Math.round(s.retirePct * 100)}% · match ${Math.round((s.job?.match ?? 0) * 100)}%`,
    failText: 'You left the match on the table. That’s a raise you turned down.',
  },
  {
    id: 'p2-report',
    chapter: P2,
    title: 'Check your credit report',
    desc: 'Free at annualcreditreport.com. Lenders will read it before you buy a car or a house. You should read it first.',
    how: 'Pull your credit report (evening)',
    done: (s) => !!s.flags.reportChecked,
    failText: 'You never looked. If there’s a mistake on it, lenders will find it first.',
  },
  {
    id: 'p2-fund-bonus',
    chapter: P2,
    optional: true,
    title: 'Bonus: 3 months of costs saved',
    desc: 'A real emergency fund: three months of rent, bills and food.',
    how: 'Save on payday',
    done: (s) => s.stats.savings >= efundGoal(s),
    progress: (s) => `${money(s.stats.savings)} / ${money(efundGoal(s))}`,
  },
  // ----- Nice Wheels -----
  {
    id: 'p2-car',
    chapter: P2 + 1,
    title: 'Decide on your next car',
    desc: 'New, certified pre-owned, or keep what you have. Watch the APR, the add-ons and the insurance.',
    how: 'Shop for a car (Saturday)',
    done: (s) => !!s.flags.carDecided,
    failText: (s) => (s.car ? `You keep the ${s.car.name}, by default. It isn’t getting younger.` : 'You stick with what you’ve got, by default.'),
    onFail: (s) => {
      setFlag(s, 'carDecided', 'default');
    },
    noCarry: true,
  },
  {
    id: 'p2-levelup',
    chapter: P2 + 1,
    title: (s) => `Second chance: ${s.phase2?.levelUp ?? 'level up'}`,
    desc: (s) => `Needs career progress ${s.phase2?.need.xp ?? 60}+ and boss rating ${s.phase2?.need.rep ?? 60}+. Then take your shot. Pays ${money(salary(s.phase2?.next?.wage ?? 0))}/yr.`,
    how: 'Study to build progress, then go for it (evening or Saturday)',
    hide: (s) => !s.phase2?.next,
    // Leveling up counts, and so does landing a job that pays as much somewhere else.
    done: (s) => !!s.flags.p2Up || (!!s.phase2?.next && (s.job?.wage ?? 0) >= s.phase2.next.wage),
    progress: (s) => `Progress ${s.stats.xp}/${s.phase2?.need.xp ?? 60} · Boss ${s.stats.rep}/${s.phase2?.need.rep ?? 60}`,
    failText: 'Not yet. You can still go for it next chapter.',
  },
  {
    id: 'p2-efund',
    chapter: P2 + 1,
    title: 'Save 3 months of costs',
    desc: 'Before a big purchase, have a cushion that survives a big surprise.',
    how: 'Save on payday, or move cash to savings',
    done: (s) => s.stats.savings >= efundGoal(s),
    progress: (s) => `${money(s.stats.savings)} / ${money(efundGoal(s))}`,
    failText: 'Thin cushion. One surprise and you’re back on the credit card.',
  },
  {
    id: 'p2-raise',
    chapter: P2 + 1,
    optional: true,
    title: 'Bonus: Negotiate a raise',
    desc: 'Make your case to the boss. The worst answer is “not yet.”',
    how: 'Ask for a raise (evening)',
    done: (s) => !!s.flags.p2RaiseAsked && (s.job?.wage ?? 0) > num(s, 'p2WageBefore'),
  },
  // ----- Home Base -----
  {
    id: 'p2-home',
    chapter: P2 + 2,
    noCarry: true,
    title: 'Buy a home, or renew your lease',
    desc: 'Get pre-approved, run the numbers, and decide. Renting is a fine answer. So is buying, if it truly fits.',
    how: 'Rent vs. buy (evening), then house hunt (weekends)',
    done: (s) => !!s.flags.homeDecided,
    progress: (s) => (s.flags.homeDecided ? 'Decided' : s.flags.hunting ? `Pre-approved up to ${money(s.phase2?.approval?.maxPrice ?? 0)}` : 'Not started'),
    failText: (s) => (s.housing.kind === 'parents' ? 'You stay home by default. Mom stops leaving printouts.' : 'No decision, so the lease rolls to month-to-month: +15% rent.'),
    onFail: (s) => {
      setFlag(s, 'homeDecided', 'default');
      if (s.housing.kind !== 'parents' && s.housing.kind !== 'owned') s.housing.rent = Math.round(s.housing.rent * 1.15);
    },
  },
  {
    id: 'p2-ontime',
    chapter: P2 + 2,
    noCarry: true,
    title: 'Pay every bill on time',
    desc: 'Rent or mortgage, loans and cards: no late marks this chapter.',
    how: 'Pay on bills day',
    done: (s) => num(s, 'rentMissed') === num(s, 'rentMissedP2') && s.credit.late === num(s, 'lateP2'),
    failText: 'A late payment on your record right when lenders are looking.',
  },
  {
    id: 'p2-networth',
    chapter: P2 + 2,
    optional: true,
    title: 'Bonus: Grow your net worth by $10,000',
    desc: 'Since day one of the new job: savings, retirement and equity, minus debts.',
    how: 'Save, invest, avoid new debt',
    done: (s) => netWorth(s) - (s.phase2?.nw0 ?? 0) >= 10000,
    progress: (s) => `${money(netWorth(s) - (s.phase2?.nw0 ?? 0))} / $10,000`,
  },
];

// ---------- activities ----------
const p2 = (s: GameState): boolean => !!s.phase2;
export const PHASE2_ACTIVITIES: Activity[] = [
  {
    id: 'p2budget',
    name: 'Rebuild your budget',
    icon: 'chart',
    slots: ['evening', 'sunday'],
    task: 'p2-budget',
    desc: 'New paycheck, new numbers. Decide what the raise is for.',
    hint: () => 'Mission · Sets your savings rate',
    hide: (s) => !p2(s) || !!s.flags.budget2,
    run: (s) => scene(s, 'p2-budget'),
  },
  {
    id: 'p2401k',
    name: 'Update your 401(k)',
    icon: 'chart',
    slots: ['evening'],
    task: 'p2-match',
    desc: 'Change how much of each paycheck goes into retirement.',
    hint: (s) => `Now ${Math.round(s.retirePct * 100)}% · Match is ${Math.round((s.job?.match ?? 0) * 100)}%`,
    hide: (s) => !p2(s) || !s.job,
    run: (s) => scene(s, 'p2-401k'),
  },
  {
    id: 'p2report',
    name: 'Pull your credit report',
    icon: 'card',
    slots: ['evening'],
    task: 'p2-report',
    desc: 'All three bureaus, free. Read every line.',
    hint: () => 'Mission · Free · Catch mistakes before a lender does',
    hide: (s) => !p2(s) || !!s.flags.reportChecked,
    run: (s) => scene(s, 'p2-report'),
  },
  {
    id: 'p2carshop',
    name: 'Shop for a car',
    icon: 'car',
    slots: ['saturday'],
    task: 'p2-car',
    desc: 'Dealer row on Route 9. Bring your credit score and a poker face.',
    hint: () => 'Mission · New vs. certified pre-owned vs. keep yours',
    hide: (s) => !p2(s) || s.chapter < P2 + 1 || !!s.flags.carDecided,
    run: (s) => scene(s, 'p2-car'),
  },
  {
    id: 'p2levelup',
    name: (s) => (s.path === 'trade' ? 'Book the journeyman exam' : s.path === 'home' ? 'Book the certification exam' : s.path === 'college' && s.phase2?.tier === 'low' ? 'Register for your last classes' : 'Ask about the promotion'),
    icon: 'star',
    slots: ['evening', 'saturday'],
    task: 'p2-levelup',
    desc: (s) => s.phase2?.levelUp ?? '',
    hint: (s) => `Mission · Needs progress ${s.phase2?.need.xp ?? 60} and boss ${s.phase2?.need.rep ?? 60}`,
    hide: (s) => !p2(s) || s.chapter < P2 + 1 || !hasLevelUp(s) || !!s.flags.p2Booked,
    run: (s) => scene(s, 'p2-career'),
  },
  {
    id: 'p2raise',
    name: 'Ask for a raise',
    icon: 'money',
    slots: ['evening'],
    task: 'p2-raise',
    desc: 'Bring numbers: what you’ve done and what the job pays elsewhere.',
    hint: () => 'Bonus · Mini-game · Up to +$1.50/hr',
    hide: (s) => !p2(s) || s.chapter < P2 + 1 || !!s.flags.p2RaiseAsked || !s.job,
    run: (s) => {
      setFlag(s, 'p2RaiseAsked');
      s.flags.p2WageBefore = s.job?.wage ?? 0;
      minigame(s, 'haggle', { item: 'raise' });
    },
  },
  {
    id: 'p2homeplan',
    name: 'Rent vs. buy: run the numbers',
    icon: 'home',
    slots: ['evening'],
    task: 'p2-home',
    desc: 'Talk to a lender, get pre-approved, and compare buying with renting.',
    hint: () => 'Mission · Pre-approval is a hard credit check',
    hide: (s) => !p2(s) || s.chapter < P2 + 2 || !!s.flags.homeDecided || !!s.flags.hunting,
    run: (s) => scene(s, 'p2-rentbuy'),
  },
  {
    id: 'p2house',
    name: 'Go to open houses',
    icon: 'home',
    slots: ['saturday', 'sunday'],
    task: 'p2-home',
    desc: 'Five listings in your price range. Bring your pre-approval letter.',
    hint: () => 'Mission · Pick a place, inspect it, make an offer',
    hide: (s) => !p2(s) || !s.flags.hunting || !!s.flags.homeDecided,
    run: (s) => scene(s, 'p2-house'),
  },
];

// ---------- weekly upkeep in the new phase ----------
const P2_COSTS: { weeks: number[]; amount: number; label: string; text: string; when?: (s: GameState) => boolean }[] = [
  { weeks: [38], amount: 220, label: 'Work clothes', text: 'New job, new wardrobe. Two pairs of real pants and shoes that aren’t sneakers: $220.' },
  { weeks: [41, 47, 53], amount: 35, label: 'Haircut', text: 'Haircut plus tip: $35. Grown-up prices.' },
  { weeks: [45], amount: 110, label: 'Car registration', text: 'Annual registration and inspection sticker: $110.', when: (s) => !!s.car },
  { weeks: [51], amount: 240, label: 'Holiday gifts', text: 'Holiday gifts: $240. Bigger paycheck, bigger expectations.' },
];

export function phase2Week(s: GameState): Step[] {
  const p = s.phase2;
  const out: Step[] = [];
  if (!p) return out;
  const w = s.week;
  for (const c of P2_COSTS) {
    if (!c.weeks.includes(w) || (c.when && !c.when(s))) continue;
    charge(s, c.amount, c.label);
    log(s, c.text, 'bad');
    inc(s, 'lifeCosts', c.amount);
  }
  if (s.flags.lifestyle === 'lavish') {
    charge(s, 60, 'Little upgrades');
    energy(s, 2);
    log(s, 'Brunch, rideshares, a “treat yourself” or two: $60 this week.', 'info');
  }
  if (s.flags.longCommute && s.transport === 'car') {
    charge(s, 25, 'Long commute gas');
    energy(s, -3);
    log(s, '45 minutes each way: $25 more gas, and a little less of you.', 'info');
  }
  // Monthly: cars lose value, homes (usually) gain it, and houses always need something.
  if (w % 4 === 0) {
    if (s.car) s.car.value = Math.round(s.car.value * 0.985);
    if (p.home) {
      p.home.value = Math.round(p.home.value * 1.003);
      charge(s, 120, 'Home upkeep');
      log(s, 'Homeowner upkeep: furnace filters, a leaky faucet, lawn stuff. $120 this month.', 'info');
    }
  }
  // A disputed credit-report error comes off.
  if (num(s, 'disputeAt') && w >= num(s, 'disputeAt')) {
    s.flags.disputeAt = 0;
    s.credit.collections = Math.max(0, s.credit.collections - 1);
    s.flags.creditError = false;
    log(s, 'The credit bureau removed the collection that wasn’t yours. Your score jumps.', 'good');
  }
  // Homeowner surprise.
  if (num(s, 'surpriseAt') && w >= num(s, 'surpriseAt')) {
    s.flags.surpriseAt = 0;
    out.push({ t: 'scene', id: 'p2-surprise', step: 'start', data: { kind: String(s.flags.surprise ?? 'waterheater') } });
  }
  // Grace period on student loans ends six months after graduation.
  if (w === P2_FIRST_WEEK + 6 && s.loans.some((l) => l.kind === 'student' && l.deferred && l.balance > 0) && !s.flags['seen:p2-grace']) {
    s.flags['seen:p2-grace'] = true;
    out.push({ t: 'scene', id: 'p2-grace', step: 'start' });
  }
  // Snapshot for the "pay every bill on time" mission.
  if (w === P2_FIRST_WEEK + 12) {
    s.flags.rentMissedP2 = num(s, 'rentMissed');
    s.flags.lateP2 = s.credit.late;
  }
  return out;
}

// ---------- random events in the new phase ----------
export const PHASE2_EVENTS: GameEvent[] = [
  { id: 'p2-ev-phone', weight: (s) => (p2(s) ? 2.5 : 0), once: true },
  { id: 'p2-ev-trip', weight: (s) => (p2(s) && s.week >= P2_FIRST_WEEK + 3 ? 2 : 0), once: true },
  { id: 'p2-ev-wedding', weight: (s) => (p2(s) && s.week >= P2_FIRST_WEEK + 5 ? 1.5 : 0), once: true },
  { id: 'p2-ev-bonus', weight: (s) => (p2(s) && s.week >= P2_FIRST_WEEK + 8 && s.stats.rep >= 60 ? 2 : 0), once: true },
  { id: 'p2-ev-roth', weight: (s) => (p2(s) && s.stats.savings >= 3000 ? 1.5 : 0), once: true },
  { id: 'p2-ev-coin', weight: (s) => (p2(s) ? 1.2 : 0), once: true },
];

// ---------- the year-one report card ----------
export function yearOneOf(s: GameState, f: { total: number; grade: string; title: string; lines: YearOne['lines'] }): YearOne {
  return {
    total: f.total,
    grade: f.grade,
    title: f.title,
    lines: f.lines.map((l) => ({ ...l })),
    savings: Math.round(s.stats.savings),
    netWorth: Math.round(netWorth(s)),
    credit: creditScore(s),
    careerDone: !!s.flags.careerDone,
    stars: s.chapterStars.slice(0, YEAR1_CHAPTERS).reduce((a, b) => a + (b ?? 0), 0),
  };
}

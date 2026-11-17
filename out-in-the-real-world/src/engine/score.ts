// Final scoring and the ending you earned. Year one has its own report card; once you move on to the
// next phase, the final score covers both: year one (frozen at the transition) plus everything after.
import { CHAPTERS } from '../content/chapters.ts';
import { collegeEpilogue } from '../content/college.ts';
import { YEAR1_CHAPTERS, grossMonthly, salary } from '../content/phase2.ts';
import { badDebt, creditScore, netWorth, num } from './core.ts';
import type { GameState } from './types.ts';

export interface ScoreLine {
  label: string;
  value: string;
  points: number;
  max: number;
}

export interface FinalScore {
  total: number;
  grade: string;
  title: string;
  lines: ScoreLine[];
  epilogue: string[];
}

const pts = (v: number, max: number): number => Math.max(0, Math.min(max, Math.round(v)));
const usd = (v: number): string => `${v < 0 ? '-' : ''}$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;

// A full emergency fund is 3–6 months of real expenses; for someone on their own that's ~$6,000.
// Few people get there in year one, so points rise fastest for the first dollars saved
// (going from $0 to $1,000 matters most).
export const FUND_GOAL = 6000;
// Next-phase net worth: growth since the first day of the new job, and where you ended up.
export const NW_GROWTH_GOAL = 10000;
export const NW_LEVEL_GOAL = 30000;

const gradeOf = (total: number): string => (total >= 920 ? 'A+' : total >= 840 ? 'A' : total >= 740 ? 'B' : total >= 620 ? 'C' : total >= 480 ? 'D' : 'F');
const titleOf = (total: number): string =>
  total >= 880 ? 'Thriving Adult' : total >= 760 ? 'Doing Great' : total >= 620 ? 'Holding It Together' : total >= 480 ? 'Scraping By' : 'Still Figuring It Out';

export function finalScore(s: GameState): FinalScore {
  return s.phase2 ? phaseTwoScore(s) : yearOneScore(s);
}

// ---------- year one ----------
export function yearOneScore(s: GameState): FinalScore {
  const sc = creditScore(s);
  const stars = s.chapterStars.slice(0, YEAR1_CHAPTERS).reduce((a, b) => a + (b ?? 0), 0);
  const misses = num(s, 'rentMissed') + s.credit.late;
  const saved = Math.max(0, s.stats.savings);
  const lines: ScoreLine[] = [
    { label: 'Mission stars', value: `${stars} / ${YEAR1_CHAPTERS * 3}`, points: pts((stars / (YEAR1_CHAPTERS * 3)) * 250, 250), max: 250 },
    { label: 'Emergency fund', value: `${usd(saved)} / ${usd(FUND_GOAL)}`, points: pts(Math.sqrt(Math.min(1, saved / FUND_GOAL)) * 260, 260), max: 260 },
    { label: 'Debt (cards & loans)', value: usd(badDebt(s)), points: pts(100 - (s.card?.balance ?? 0) / 6 - (badDebt(s) - (s.card?.balance ?? 0)) / 50, 100), max: 100 },
    { label: 'Credit score', value: sc === null ? 'None' : String(sc), points: sc === null ? 0 : pts(((sc - 600) / 200) * 100, 100), max: 100 },
    { label: 'Retirement savings', value: usd(s.retire), points: pts((s.retire / 4000) * 40, 40), max: 40 },
    { label: 'Bills paid on time', value: misses ? `${misses} missed` : 'All of them', points: pts(100 - misses * 25 - num(s, 'overdrafts') * 5, 100), max: 100 },
    { label: 'Career milestone', value: s.flags.careerDone ? 'Achieved' : 'Not yet', points: s.flags.careerDone ? 100 : 0, max: 100 },
    { label: 'Well-being', value: num(s, 'burnouts') ? `${num(s, 'burnouts')} burnout${num(s, 'burnouts') > 1 ? 's' : ''}` : 'No burnouts', points: pts(50 - num(s, 'burnouts') * 25, 50), max: 50 },
  ];
  const total = lines.reduce((a, l) => a + l.points, 0);
  return { total, grade: gradeOf(total), title: titleOf(total), lines, epilogue: yearOneEpilogue(s) };
}

function yearOneEpilogue(s: GameState): string[] {
  const out: string[] = [];
  const career = !!s.flags.careerDone;
  switch (s.path) {
    case 'home':
      out.push(career ? 'You work as a pharmacy technician now, with benefits and a schedule that makes sense.' : 'You’re still at the register, but you know exactly what you want next.');
      out.push(s.housing.kind === 'parents' ? 'You still live at home, and you’ve saved more than almost anyone you know.' : 'You moved out and learned how much toilet paper actually costs.');
      break;
    case 'college': {
      out.push(...collegeEpilogue(s));
      const owed = s.loans.filter((l) => l.kind === 'student').reduce((a, l) => a + l.balance, 0);
      out.push(owed > 0 ? `You owe ${usd(owed)} in student loans, and you know exactly what that means now.` : 'You have no student loans. Rare!');
      break;
    }
    case 'trade':
      out.push(career ? 'You’re a Year 2 apprentice, on track to be a licensed electrician in three more years.' : 'You’re repeating Year 1, but you know the code book better than ever.');
      out.push('Dee still calls you “kid,” but now it sounds like respect.');
      break;
    case 'work':
      out.push(career ? 'You’re Team Lead at ParcelPoint. You train new hires, and you tell them to take the 401(k) match.' : 'Still on the warehouse floor, but your boss knows your name now.');
      out.push(s.flags.roommate === 'priya' ? 'You and Priya renewed the lease. The roommate agreement is laminated.' : 'Your apartment finally feels like home.');
      break;
  }
  out.push(s.stats.savings >= 1000 ? 'You have a real emergency fund. Surprises are annoying, not terrifying.' : 'Your savings are thin. Year two goal: build that cushion.');
  if ((s.card?.balance ?? 0) > 500) out.push('That credit card balance is following you into year two. Interest never sleeps.');
  out.push(s.flags.roadTrip ? 'You and Rae still talk about the coast trip. You’re already planning the next one.' : 'Rae’s already planning the next road trip. You’re going this time.');
  out.push(`Net worth after one year: ${usd(netWorth(s))}.`);
  return out;
}

// ---------- both phases ----------
const mortgageOf = (s: GameState) => s.loans.find((l) => l.kind === 'mortgage' && l.balance > 0);
const carLoanOf = (s: GameState) => s.loans.find((l) => l.kind === 'car' && l.balance > 0);

export function careerPoints(s: GameState): number {
  const p = s.phase2;
  if (!p) return 0;
  if (p.tier === 'top') return 150;
  if (s.flags.p2Up) return 125;
  return p.tier === 'mid' ? 90 : 50;
}

// Housing: owning is great if the payment fits; renting is fine if it's affordable.
export function homePoints(s: GameState): number {
  const g = Math.max(1, grossMonthly(s));
  const m = mortgageOf(s);
  if (s.housing.kind === 'owned' && m) {
    const r = (m.payment + s.housing.rent) / g;
    return r <= 0.33 ? 120 : r <= DTI_LINE ? 90 : 45;
  }
  if (s.housing.kind === 'parents') return 80;
  const r = (s.housing.rent + s.housing.utilities) / g;
  return r <= 0.3 ? 80 : r <= 0.4 ? 55 : 30;
}
const DTI_LINE = 0.43;

export function carPoints(s: GameState): number {
  const l = carLoanOf(s);
  let p = 60;
  if (l) {
    const r = l.payment / Math.max(1, grossMonthly(s));
    p = r <= 0.1 ? 55 : r <= 0.15 ? 35 : 10;
  }
  if (s.flags.carAddons) p -= 10;
  return Math.max(0, p);
}

export function phaseTwoScore(s: GameState): FinalScore {
  const p = s.phase2!;
  const sc = creditScore(s);
  const stars = s.chapterStars.slice(YEAR1_CHAPTERS).reduce((a, b) => a + (b ?? 0), 0);
  const max2 = (CHAPTERS.length - YEAR1_CHAPTERS) * 3;
  const nw = netWorth(s);
  const growth = nw - p.nw0;
  const misses = num(s, 'rentMissed') - num(s, 'rentMissed0') + s.credit.late - num(s, 'late0');
  const ods = num(s, 'overdrafts') - num(s, 'overdrafts0');
  const owned = s.housing.kind === 'owned';
  const carLoan = carLoanOf(s);
  const lines: ScoreLine[] = [
    { label: 'Year one', value: `${p.y1.grade} · ${p.y1.total}/1000`, points: pts(p.y1.total * 0.3, 300), max: 300 },
    { label: 'Next-phase missions', value: `${stars} / ${max2} stars`, points: pts((stars / max2) * 150, 150), max: 150 },
    { label: 'Career', value: `${s.job?.title ?? 'Unemployed'} · ${usd(salary(s.job?.wage ?? 0))}/yr`, points: careerPoints(s), max: 150 },
    { label: 'Home', value: owned ? 'Homeowner' : s.housing.kind === 'parents' ? 'Living at home' : 'Renting', points: homePoints(s), max: 120 },
    { label: 'Car', value: carLoan ? `${usd(carLoan.payment)}/mo loan` : s.car ? 'Paid off' : 'No car, no payment', points: carPoints(s), max: 60 },
    {
      label: 'Net worth',
      value: `${usd(nw)} (${growth >= 0 ? '+' : ''}${usd(growth)})`,
      points: pts(Math.max(0, growth / NW_GROWTH_GOAL) * 50, 50) + pts(Math.max(0, nw / NW_LEVEL_GOAL) * 50, 50),
      max: 100,
    },
    { label: 'Credit score', value: sc === null ? 'None' : String(sc), points: sc === null ? 0 : pts(((sc - 600) / 200) * 70, 70), max: 70 },
    { label: 'Bills paid on time', value: misses > 0 ? `${misses} missed` : 'All of them', points: pts(50 - misses * 20 - ods * 5, 50), max: 50 },
  ];
  const total = lines.reduce((a, l) => a + l.points, 0);
  return { total, grade: gradeOf(total), title: titleOf(total), lines, epilogue: phaseTwoEpilogue(s) };
}

function phaseTwoEpilogue(s: GameState): string[] {
  const p = s.phase2!;
  const out: string[] = [];
  const job = s.job;
  const pay = usd(salary(job?.wage ?? 0));
  if (job) {
    if (p.tier === 'top') out.push(`You’re a ${job.title} at ${job.place}, making ${pay} a year. Year-one you would not believe it.`);
    else if (s.flags.p2Up) out.push(`Second chance, taken: you’re a ${job.title} now, at ${pay} a year. The hard way still counts.`);
    else out.push(`You’re still a ${job.title} (${pay} a year). ${p.levelUp ? `Next goal: ${p.levelUp.toLowerCase()}.` : ''}`);
  } else out.push('You’re between jobs, and your emergency fund is earning its name.');
  const m = mortgageOf(s);
  if (s.housing.kind === 'owned' && p.home && m) {
    out.push(`You own ${p.home.name}. ${usd(m.payment + s.housing.rent)} a month, and it’s worth ${usd(p.home.value)}. You know your water heater’s age now. Everyone does, eventually.`);
  } else if (s.housing.kind === 'parents') out.push(`You still live at home, and your down-payment fund is ${usd(s.stats.savings)}. Your mom has stopped leaving printouts. Mostly.`);
  else out.push(`You rent ${s.housing.name}. No roof to fix, no lawn to mow, and ${usd(s.stats.savings)} in savings.`);
  const cl = carLoanOf(s);
  if (s.flags.carDecided === 'suv') out.push(`The SUV is gorgeous. The ${cl ? `${usd(cl.payment)}/mo payment` : 'price tag'} is less gorgeous.`);
  else if (cl && s.car) out.push(`You drive a ${s.car.name}: ${usd(cl.payment)}/mo until it’s paid off.`);
  else if (s.car) out.push(`You drive the ${s.car.name}, no payment. The best kind of car.`);
  else out.push('Still car-free. Your legs and your budget both look great.');
  const nw = netWorth(s);
  out.push(`Net worth: ${usd(nw)} (${nw - p.nw0 >= 0 ? 'up' : 'down'} ${usd(Math.abs(nw - p.nw0))} since the new job started).`);
  const sc = creditScore(s);
  out.push(sc === null ? 'Credit score: still none. Lenders can’t see you yet.' : `Credit score: ${sc}. ${sc >= 740 ? 'Lenders send you fancy envelopes now.' : sc >= 670 ? 'Solid. Better rates are close.' : 'It’s costing you on every loan.'}`);
  if ((s.card?.balance ?? 0) > 1000) out.push(`That ${usd(s.card!.balance)} card balance followed you all the way here.`);
  const student = s.loans.filter((l) => l.kind === 'student').reduce((a, l) => a + l.balance, 0);
  if (student > 0) out.push(`Student loans: ${usd(student)} to go.`);
  if (s.retire > 0) out.push(`401(k): ${usd(s.retire)}. Left alone at 7% a year, that’s about ${usd(s.retire * Math.pow(1.07, 43))} at 65.`);
  out.push(`Year one: ${p.y1.grade}, “${p.y1.title}.” ${p.y1.careerDone ? 'You hit your milestone, and it paid off.' : 'You missed your milestone, and you still found a way up.'}`);
  out.push('Rae texts a photo of the coast: “same time next year?” You’re going.');
  return out;
}

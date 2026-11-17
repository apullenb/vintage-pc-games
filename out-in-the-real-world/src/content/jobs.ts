// The local job market: listings, what they require, and how they compare to the job you have.
import { num } from '../engine/core.ts';
import type { ArtId, GameState, Job, PathId } from '../engine/types.ts';
import { hasSkill, skillName, type SkillId } from './skills.ts';

export type Schedule = NonNullable<Job['schedule']>;

export interface Needs {
  skills?: SkillId[];
  license?: boolean; // driver's license
  clean?: boolean; // no tickets on your record
  exp?: number; // weeks of work experience (any job)
  ref?: number; // a reference: your boss rating must be at least this
}

export interface Listing {
  id: string;
  title: string;
  place: string;
  wage: number;
  hours: number;
  health: boolean;
  premium: number;
  dental: number;
  match: number;
  art: ArtId; // also picks the extra-shift mini-game
  schedule: Schedule;
  commute: number; // minutes each way
  bus: boolean; // false = you need a car to get there
  needs: Needs;
  prefer?: SkillId; // nice to have: helps the interview
  bilingual?: number; // extra $/hr if you speak Spanish
  tuition?: number; // weeks on the job before tuition help kicks in
  perk?: string;
  blurb: string;
  career?: PathId[]; // landing this job counts as the chapter 6 career milestone
  scam?: { fee: number; pitch: string; flags: string[] };
}

export const LISTINGS: Listing[] = [
  // ---------- no skills needed ----------
  {
    id: 'stocker',
    title: 'Overnight Stocker',
    place: 'BigValue Mart',
    wage: 16.5,
    hours: 32,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'warehouse',
    schedule: 'nights',
    commute: 20,
    bus: true,
    needs: {},
    blurb: 'Stock shelves 10 p.m. to 6 a.m. Quiet, steady, and weird for your sleep.',
  },
  {
    id: 'barista',
    title: 'Barista',
    place: 'Daily Grind Coffee',
    wage: 15.5,
    hours: 20,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'grocery',
    schedule: 'early',
    commute: 10,
    bus: true,
    needs: {},
    perk: 'Tips included in the hourly estimate. Free coffee, obviously.',
    blurb: 'Opens at 5:30 a.m. You will learn 40 ways to say “oat milk.”',
  },
  {
    id: 'crew',
    title: 'Crew Member',
    place: 'Burger Barn',
    wage: 15,
    hours: 30,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'grocery',
    schedule: 'weekends',
    commute: 10,
    bus: true,
    needs: {},
    perk: 'Free meal every shift.',
    blurb: 'Hiring on the spot! Fries, drive-thru headset, weekends required.',
  },
  {
    id: 'retail',
    title: 'Sales Associate',
    place: 'Threadline Outfitters',
    wage: 15.5,
    hours: 20,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'grocery',
    schedule: 'weekends',
    commute: 25,
    bus: true,
    needs: {},
    perk: '30% employee discount (dangerous).',
    blurb: 'Fold, greet, fold again. Part-time with weekend shifts.',
  },
  {
    id: 'handler',
    title: 'Part-Time Package Handler',
    place: 'SwiftShip Hub',
    wage: 18.5,
    hours: 20,
    health: true,
    premium: 30,
    dental: 4,
    match: 0.03,
    art: 'warehouse',
    schedule: 'early',
    commute: 30,
    bus: true,
    needs: {},
    tuition: 4,
    perk: 'Benefits even part-time. Tuition help after 4 weeks.',
    blurb: '4 a.m. to 8 a.m. sort. Brutal alarm, real benefits, and the rest of your day free.',
  },
  {
    id: 'fulfill',
    title: 'Fulfillment Associate',
    place: 'ShipRight Fulfillment',
    wage: 17,
    hours: 40,
    health: true,
    premium: 55,
    dental: 6,
    match: 0.03,
    art: 'warehouse',
    schedule: 'days',
    commute: 35,
    bus: false,
    needs: { exp: 4 },
    blurb: 'Full-time with benefits, barely any experience needed. Out by the airport, no bus line.',
  },
  // ---------- skilled ----------
  {
    id: 'supervisor',
    title: 'Front-End Supervisor',
    place: 'GreenBasket Grocery',
    wage: 18.5,
    hours: 36,
    health: true,
    premium: 50,
    dental: 6,
    match: 0.03,
    art: 'grocery',
    schedule: 'weekends',
    commute: 20,
    bus: true,
    needs: { skills: ['service', 'leadership'], exp: 12 },
    blurb: 'Run the registers, handle refunds, calm the coupon guy. Some weekends.',
  },
  {
    id: 'pharmtech',
    title: 'Pharmacy Technician',
    place: 'CareRx Pharmacy',
    wage: 19.5,
    hours: 36,
    health: true,
    premium: 50,
    dental: 6,
    match: 0.03,
    art: 'clinic',
    schedule: 'days',
    commute: 15,
    bus: true,
    needs: { skills: ['cpht'] },
    prefer: 'service',
    bilingual: 1,
    career: ['home'],
    blurb: 'Count, label, and double-check prescriptions. Certification required.',
  },
  {
    id: 'forklift',
    title: 'Forklift Operator',
    place: 'Northgate Distribution',
    wage: 20.5,
    hours: 40,
    health: true,
    premium: 52,
    dental: 6,
    match: 0.04,
    art: 'warehouse',
    schedule: 'days',
    commute: 30,
    bus: false,
    needs: { skills: ['forklift'], exp: 8 },
    prefer: 'osha10',
    tuition: 12,
    blurb: 'Load trucks and move pallets. Certification and some experience required.',
  },
  {
    id: 'helpdesk',
    title: 'IT Help Desk Tech',
    place: 'Valley Schools',
    wage: 20,
    hours: 40,
    health: true,
    premium: 45,
    dental: 5,
    match: 0.05,
    art: 'office',
    schedule: 'days',
    commute: 25,
    bus: true,
    needs: { skills: ['itsupport', 'service'] },
    prefer: 'excel',
    tuition: 12,
    blurb: 'Reset passwords, fix printers, explain the Wi-Fi password 30 times a day.',
  },
  {
    id: 'bookkeeper',
    title: 'Bookkeeping Clerk',
    place: 'Patel & Sons Accounting',
    wage: 19.5,
    hours: 36,
    health: true,
    premium: 48,
    dental: 5,
    match: 0.03,
    art: 'office',
    schedule: 'days',
    commute: 20,
    bus: true,
    needs: { skills: ['bookkeeping', 'excel'] },
    blurb: 'Enter invoices, match receipts, keep a small business out of trouble.',
  },
  {
    id: 'driver',
    title: 'Delivery Driver (van)',
    place: 'QuickFleet Logistics',
    wage: 19,
    hours: 40,
    health: true,
    premium: 55,
    dental: 6,
    match: 0,
    art: 'road',
    schedule: 'long',
    commute: 15,
    bus: true,
    needs: { license: true, clean: true, exp: 6 },
    blurb: 'Company van, 120 stops a day. Valid license and a clean record required.',
  },
  {
    id: 'teller',
    title: 'Bank Teller',
    place: 'First Community Bank',
    wage: 17.5,
    hours: 40,
    health: true,
    premium: 40,
    dental: 4,
    match: 0.05,
    art: 'bank',
    schedule: 'days',
    commute: 20,
    bus: true,
    needs: { skills: ['service', 'excel'], ref: 60 },
    bilingual: 1,
    tuition: 12,
    blurb: 'Weekdays only, great benefits. They’ll call your boss for a reference.',
  },
  {
    id: 'cook',
    title: 'Line Cook',
    place: 'Ember Kitchen',
    wage: 17.5,
    hours: 36,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'grocery',
    schedule: 'nights',
    commute: 20,
    bus: true,
    needs: { skills: ['servsafe'] },
    perk: 'Family meal every shift.',
    blurb: 'Hot, loud, fast. Food handler card required. Nights and weekends.',
  },
  {
    id: 'ehelper',
    title: 'Electrician’s Helper',
    place: 'Volt Bros Electric',
    wage: 18,
    hours: 40,
    health: true,
    premium: 52,
    dental: 6,
    match: 0,
    art: 'jobsite',
    schedule: 'early',
    commute: 30,
    bus: false,
    needs: { skills: ['osha10'], license: true },
    blurb: 'Haul wire, dig trenches, learn the trade. Job sites change daily: bring a car.',
  },
  {
    id: 'whsup',
    title: 'Warehouse Shift Supervisor',
    place: 'Northgate Distribution',
    wage: 22,
    hours: 40,
    health: true,
    premium: 52,
    dental: 6,
    match: 0.04,
    art: 'warehouse',
    schedule: 'nights',
    commute: 30,
    bus: false,
    needs: { skills: ['warehouse', 'leadership'], exp: 16, ref: 65 },
    prefer: 'forklift',
    career: ['work'],
    blurb: 'Run the night crew. Warehouse experience and leadership required.',
  },
  {
    id: 'cdltrainee',
    title: 'CDL Trainee Driver',
    place: 'RoadStar Freight',
    wage: 20,
    hours: 45,
    health: true,
    premium: 60,
    dental: 6,
    match: 0.02,
    art: 'road',
    schedule: 'long',
    commute: 25,
    bus: true,
    needs: { skills: ['cdl'], license: true, clean: true },
    perk: 'They pay for CDL school while you ride along.',
    blurb: 'Learn to drive big rigs on their dime. Long days, longer highways.',
  },
  {
    id: 'reception',
    title: 'Front Desk Receptionist',
    place: 'Lakeside Family Clinic',
    wage: 17,
    hours: 36,
    health: true,
    premium: 45,
    dental: 5,
    match: 0.03,
    art: 'clinic',
    schedule: 'days',
    commute: 15,
    bus: true,
    needs: { skills: ['service'] },
    prefer: 'spanish',
    bilingual: 1.5,
    blurb: 'Check patients in, answer phones, keep the waiting room calm. Bilingual a big plus.',
  },
  {
    id: 'dispatcher',
    title: 'Dispatcher',
    place: 'QuickFleet Logistics',
    wage: 19,
    hours: 40,
    health: true,
    premium: 55,
    dental: 6,
    match: 0,
    art: 'office',
    schedule: 'days',
    commute: 15,
    bus: true,
    needs: { skills: ['excel', 'warehouse'] },
    blurb: 'Plan routes and keep 30 drivers on schedule from a desk with four monitors.',
  },
  // ---------- too good to be true ----------
  {
    id: 'scam-reship',
    title: 'Remote Package Reshipper',
    place: 'GlobalParcel Partners',
    wage: 28,
    hours: 20,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'apartment',
    schedule: 'days',
    commute: 0,
    bus: true,
    needs: {},
    scam: {
      fee: 50,
      pitch: 'Hired! Just pay the $50 starter kit fee and we’ll send labels. Repackage items at home and ship them overseas.',
      flags: ['Hired without an interview', 'You pay them to start', 'Reshipping is how thieves move stolen goods'],
    },
    blurb: '$28/HR FROM HOME!!! No experience! Start TODAY! Small starter kit fee.',
  },
  {
    id: 'scam-shopper',
    title: 'Mystery Shopper',
    place: 'SecretEval Services',
    wage: 35,
    hours: 10,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'street',
    schedule: 'weekends',
    commute: 0,
    bus: true,
    needs: {},
    scam: {
      fee: 0,
      pitch: 'Congrats! We’re mailing a $1,900 check. Deposit it, keep $300, and buy $1,600 in gift cards for your first “evaluation.”',
      flags: ['A check bigger than your pay', 'Gift cards', 'The check bounces after you spend the money'],
    },
    blurb: 'Get PAID to shop! $35/hr, set your own schedule!',
  },
  {
    id: 'scam-data',
    title: 'Data Entry Specialist (Remote)',
    place: 'Apex Data Solutions',
    wage: 32,
    hours: 25,
    health: false,
    premium: 0,
    dental: 0,
    match: 0,
    art: 'apartment',
    schedule: 'days',
    commute: 0,
    bus: true,
    needs: {},
    scam: {
      fee: 120,
      pitch: 'Interview over a chat app: you’re hired! Buy the required software from our vendor ($120, reimbursed on your first paycheck).',
      flags: ['Interview only by text chat', 'You buy equipment from “their vendor”', 'Pay way above normal for the work'],
    },
    blurb: 'Easy typing from home, $32/hr, flexible hours. Apply in 2 minutes!',
  },
];

export const LISTING_BY_ID: Record<string, Listing> = Object.fromEntries(LISTINGS.map((l) => [l.id, l]));

// ---------- the board ----------
export const BOARD_WEEKS = 4; // listings refresh every 4 weeks

export function boardPeriod(week: number): number {
  return Math.floor((week - 1) / BOARD_WEEKS);
}
export function boardCloses(week: number): number {
  return (boardPeriod(week) + 1) * BOARD_WEEKS;
}

function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The current listings (10–12). Stable for a 4-week period, then a new batch. Jobs you're in the
// middle of (an interview, an offer, a referral) stay visible until that's settled.
export function boardFor(s: GameState): Listing[] {
  const p = boardPeriod(s.week);
  const r = mulberry((num(s, 'boardSalt') || 7) * 31 + p * 2654435761);
  const shuffle = <T,>(xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const open = LISTINGS.filter((l) => !s.job || l.place !== s.job.place || l.title !== s.job.title);
  const basic = shuffle(open.filter((l) => !l.scam && !l.needs.skills));
  const skilled = shuffle(open.filter((l) => !l.scam && !!l.needs.skills));
  const scams = shuffle(open.filter((l) => l.scam));
  const out: Listing[] = [...basic.slice(0, 4), ...skilled.slice(0, 7)];
  // Every other batch has a scam mixed in. Learn to spot them.
  if (p % 2 === 1 || r() < 0.3) out.push(scams[0]);
  // The job your path is aiming for shows up most months.
  for (const l of open) if (l.career?.includes(s.path) && !out.includes(l) && (p % 3 !== 2 || r() < 0.5)) out.push(l);
  for (const k of ['interviewFor', 'offerFor', 'referral']) {
    const id = s.flags[k];
    if (typeof id === 'string' && LISTING_BY_ID[id] && !out.includes(LISTING_BY_ID[id])) out.push(LISTING_BY_ID[id]);
  }
  return out.sort((a, b) => (a.scam ? 0 : 1) - (b.scam ? 0 : 1) || a.wage - b.wage);
}

// ---------- your record ----------
// Weeks you've been working (any job), and at the current one.
export function experience(s: GameState): number {
  if (s.flags.tenurePlace === undefined) return s.job ? s.week - 1 : 0;
  return num(s, 'expWeeks');
}
export function tenure(s: GameState): number {
  if (!s.job) return 0;
  return s.flags.tenurePlace === undefined ? s.week - 1 : num(s, 'tenure');
}

// Who will vouch for you: your current boss (once they know you a bit), or the last one if you left on good terms.
export function reference(s: GameState): number {
  const now = s.job && s.path !== 'college' && tenure(s) >= 4 ? s.stats.rep : 0;
  return Math.max(now, num(s, 'refRep'));
}

export interface Fit {
  hard: string[]; // can't do the job without these
  soft: string[]; // a referral can get you past these
  ok: boolean;
}

export function fitFor(s: GameState, l: Listing): Fit {
  const hard: string[] = [];
  const soft: string[] = [];
  if (l.scam) return { hard, soft, ok: true };
  if (s.path === 'trade') hard.push('Finish your apprenticeship year first');
  if (s.path === 'college' && s.flags.enrolled !== false && l.hours > 20) hard.push('Fits around classes (20 hrs/week max)');
  for (const k of l.needs.skills ?? []) if (!hasSkill(s, k)) hard.push(skillName(k));
  if (l.needs.license && !s.flags.license) hard.push('Driver’s license');
  if (l.needs.clean && num(s, 'ticketPoints') > 0) hard.push('Clean driving record');
  if (!l.bus && !hasCar(s)) hard.push('A car (no bus goes there)');
  if (l.needs.exp && experience(s) < l.needs.exp) soft.push(`${l.needs.exp} weeks of work experience`);
  if (l.needs.ref && reference(s) < l.needs.ref) soft.push(`A strong reference (boss rating ${l.needs.ref}+)`);
  const referred = s.flags.referral === l.id;
  return { hard, soft, ok: hard.length === 0 && (soft.length === 0 || referred) };
}

export function hasCar(s: GameState): boolean {
  return !!s.car || s.transport === 'borrow';
}

// What they'd pay you (bilingual bonus included).
export function offerWage(s: GameState, l: Listing): number {
  return Math.round((l.wage + (l.bilingual && hasSkill(s, 'spanish') ? l.bilingual : 0)) * 100) / 100;
}

export function jobFrom(l: Listing, wage: number): Job {
  return {
    title: l.title,
    place: l.place,
    wage,
    hours: l.hours,
    healthOffered: l.health,
    premium: l.premium,
    dentalPremium: l.dental,
    match: l.match,
    art: l.art,
    id: l.id,
    schedule: l.schedule,
    commute: l.commute,
  };
}

// Rough weekly value of a job: pay, plus what benefits are worth to you, minus the grind.
export function jobValue(j: { wage: number; hours: number; healthOffered: boolean; match: number; schedule?: Schedule; commute?: number }): number {
  const pay = j.wage * j.hours;
  const benefits = (j.healthOffered ? 60 : 0) + pay * j.match;
  const grind = (j.schedule === 'nights' || j.schedule === 'long' ? 25 : j.schedule === 'early' || j.schedule === 'weekends' ? 10 : 0) + ((j.commute ?? 0) >= 30 ? 10 : 0);
  return Math.round(pay + benefits - grind);
}

export function listingValue(s: GameState, l: Listing): number {
  return jobValue({ wage: offerWage(s, l), hours: l.hours, healthOffered: l.health, match: l.match, schedule: l.schedule, commute: l.commute });
}

export const SCHEDULE_LABEL: Record<Schedule, string> = {
  days: 'Weekdays',
  nights: 'Nights',
  early: 'Early mornings',
  weekends: 'Weekends required',
  long: 'Long days',
};

// Extra weekly energy a schedule costs on top of normal work.
export const SCHEDULE_DRAIN: Record<Schedule, number> = { days: 0, nights: 4, early: 2, weekends: 2, long: 4 };

// Employer tuition help (weeks on the job before it applies), for jobs not from the board.
export function tuitionAfter(s: GameState): number | null {
  if (!s.job) return null;
  if (s.job.id) return LISTING_BY_ID[s.job.id]?.tuition ?? null;
  return s.job.place === 'ParcelPoint' ? 12 : null;
}

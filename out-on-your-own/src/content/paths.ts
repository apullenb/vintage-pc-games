// The four ways to start life after graduation.
import type { GameState, Job, Housing, Look, PathId } from '../engine/types.ts';
import type { StartPath } from './types.ts';

export const PATHS: StartPath[] = [
  {
    id: 'home',
    name: 'Stay Home & Work',
    tagline: 'Live with your parents, work part-time at the grocery store, and stack cash.',
    perks: ['Cheap rent ($200/mo to your parents)', 'Home-cooked meals', 'Stay on your parents’ health plan'],
    risks: ['Part-time pay, no benefits', 'House rules and a curfew', 'You have to borrow the family car', 'Slowest career growth'],
    art: 'bedroom',
    difficulty: 1,
  },
  {
    id: 'college',
    name: 'College Bound',
    tagline: 'Move into the dorms at State U. Work at the library. Study hard.',
    perks: ['Biggest payoff at the end', 'Free bus with student ID', 'Meal plan included'],
    risks: ['Tiny paycheck (12 hrs/week)', 'Must file the FAFSA or pay tuition yourself', 'Student loans grow with interest', 'Skipping class hurts your grades'],
    art: 'dorm',
    difficulty: 2,
  },
  {
    id: 'trade',
    name: 'Trade Apprentice',
    tagline: 'Get paid to learn as an electrician’s apprentice. Rent a room across town.',
    perks: ['Good pay while you train ($19/hr)', 'Health insurance offered', 'Clear path to a licensed career'],
    risks: ['Job sites need a ride (or a car)', 'Physically draining work', 'Night class tuition every month', 'You pay for your own tools'],
    art: 'jobsite',
    difficulty: 2,
  },
  {
    id: 'work',
    name: 'Full-Time & Own Place',
    tagline: 'Full-time warehouse job and an apartment with a roommate. Total freedom.',
    perks: ['Full-time pay ($18/hr)', 'Health plan and 401(k) match', 'Nobody tells you what to do'],
    risks: ['Highest rent and bills', 'Your roommate is… a roommate', 'No safety net if things go wrong', 'Bus commute until you get a car'],
    art: 'warehouse',
    difficulty: 3,
  },
];

const JOBS: Record<PathId, Job> = {
  home: { title: 'Cashier', place: 'Fresh Fields Market', wage: 15, hours: 28, healthOffered: false, premium: 0, dentalPremium: 0, match: 0, art: 'grocery' },
  college: { title: 'Library Assistant', place: 'State U Library', wage: 15, hours: 12, healthOffered: false, premium: 0, dentalPremium: 0, match: 0, art: 'library' },
  trade: { title: 'Electrician Apprentice', place: 'Brightline Electric', wage: 19, hours: 40, healthOffered: true, premium: 48, dentalPremium: 6, match: 0, art: 'jobsite' },
  work: { title: 'Warehouse Associate', place: 'ParcelPoint', wage: 18, hours: 40, healthOffered: true, premium: 52, dentalPremium: 6, match: 0.04, art: 'warehouse' },
};

const HOUSING: Record<PathId, Housing> = {
  home: { kind: 'parents', name: 'Your childhood bedroom', rent: 200, utilities: 0, missed: 0, roommate: false, art: 'bedroom' },
  college: { kind: 'dorm', name: 'Hollis Hall, room 214', rent: 0, utilities: 0, missed: 0, roommate: true, art: 'dorm' },
  trade: { kind: 'room', name: 'Rented room on Alder St.', rent: 650, utilities: 0, missed: 0, roommate: false, art: 'apartment' },
  work: { kind: 'shared', name: '2-bedroom on Pine Ave (with Theo)', rent: 725, utilities: 60, missed: 0, roommate: true, art: 'apartment' },
};

export function pathName(id: PathId): string {
  return PATHS.find((p) => p.id === id)?.name ?? id;
}

export function newState(name: string, look: Look, path: PathId, seed: number): GameState {
  const cash = { home: 650, college: 900, trade: 700, work: 800 }[path];
  const s: GameState = {
    v: 1,
    seed: seed | 0,
    name: name.trim() || 'Alex',
    look,
    path,
    week: 1,
    chapter: 0,
    stats: { cash, savings: 0, energy: 75, rep: 50, xp: 0 },
    retire: 0,
    card: null,
    loans: [],
    car: null,
    transport: { home: 'borrow', college: 'bus', trade: 'carpool', work: 'bus' }[path] as GameState['transport'],
    job: { ...JOBS[path] },
    housing: { ...HOUSING[path] },
    health: 'none',
    dental: false,
    retirePct: 0,
    bank: 'teen',
    overdraftOptIn: true,
    credit: { firstWeek: null, onTime: 0, late: 0, inquiries: [], collections: 0 },
    appointments: [],
    subs: [],
    flags: {},
    tasksDone: {},
    tasksFailed: {},
    plan: { slots: { weekday: 'work', evening: 'rest', saturday: 'rest', sunday: 'rest' }, food: 'ramen' },
    queue: [],
    log: [],
    hoursThisPeriod: 0,
    autoSave: 0,
    chapterStars: [],
    handbook: [],
    achievements: [],
    history: [],
    checkpoint: null,
    weekSnap: null,
    over: false,
    won: false,
  };
  if (path === 'home') {
    s.plan.food = 'parents';
    s.flags.familyPhone = true;
  }
  if (path === 'college') {
    s.plan.food = 'mealplan';
    s.plan.slots.weekday = 'class';
    s.flags.familyPhone = true;
  }
  if (path === 'trade' || path === 'work') s.subs.push({ id: 'phone', label: 'Phone plan', cost: 45 });
  if (path === 'work') s.subs.push({ id: 'buspass', label: 'Monthly bus pass', cost: 65 });
  if (path === 'trade') s.subs.push({ id: 'nightclass', label: 'Apprentice night class', cost: 125 });
  return s;
}

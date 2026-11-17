// The week loop. Pure functions: every call clones the state and returns a new one.
import { ACTIVITIES, activityFor } from '../content/activities.ts';
import { CHAPTERS, TASKS, chapterOf, chapterStartWeek, tasksFor } from '../content/chapters.ts';
import { EVENTS, OFFERS, storyBeats } from '../content/events.ts';
import { SCENES } from '../content/scenes.ts';
import { MINIGAMES } from '../content/minigames/index.ts';
import type { Choice, Data, Scene } from '../content/types.ts';
import { checkAchievements } from '../content/achievements.ts';
import { collegeWeek } from '../content/college.ts';
import {
  canPay,
  cardRoom,
  chance,
  charge,
  clamp,
  creditScore,
  diff,
  energy,
  inc,
  log,
  missWork,
  money,
  num,
  pay,
  rand,
  rep,
  round2,
  save,
  snap,
  unlock,
  xp,
  type Snap,
} from './core.ts';
import type { Bill, GameState, MiniResult, PayMethod, PayStub, Plan, SlotId, Step } from './types.ts';
import { SLOTS } from './types.ts';

export const TOTAL_WEEKS = CHAPTERS.reduce((a, c) => a + c.weeks, 0);

export type Input =
  | { t: 'choice'; i: number; method?: PayMethod }
  | { t: 'continue' }
  | { t: 'bills'; pay: Record<string, { amount: number; method: PayMethod } | null> };

const clone = (s: GameState): GameState => structuredClone(s);

// ---------- text helpers ----------
export function txt(t: string | ((s: GameState, d: Data) => string) | undefined, s: GameState, d: Data = {}): string {
  if (t === undefined) return '';
  return typeof t === 'function' ? t(s, d) : t;
}

export function sceneOf(id: string): Scene {
  const sc = SCENES[id];
  if (!sc) throw new Error(`unknown scene ${id}`);
  return sc;
}

// ---------- start ----------
export function begin(s0: GameState): GameState {
  const s = clone(s0);
  s.queue = [{ t: 'scene', id: `intro-${s.path}`, step: 'start' }, { t: 'scene', id: 'firstday', step: 'start' }];
  s.weekSnap = snap(s) as unknown as Record<string, number>;
  s.checkpoint = null;
  s.checkpoint = JSON.stringify(s);
  return advance(s);
}

// ---------- planning ----------
export function defaultPlan(s: GameState): Plan {
  const p = s.plan;
  const slots = { ...p.slots };
  for (const slot of SLOTS) {
    const a = ACTIVITIES[slots[slot]];
    if (!a || !a.slots.includes(slot) || a.task || (a.avail && a.avail(s, slot) !== true) || (a.hide && a.hide(s))) {
      slots[slot] = slot === 'weekday' ? weekdayDefault(s) : 'rest';
    }
  }
  let food = p.food;
  if (!foodOptions(s).includes(food)) food = foodOptions(s)[0];
  if (food === 'cook' && slots.sunday !== 'mealprep') food = foodOptions(s).find((f) => f !== 'cook') ?? 'ramen';
  return { slots, food };
}

export function weekdayDefault(s: GameState): string {
  if (s.path === 'college' && s.flags.enrolled !== false) return 'class';
  return s.job ? 'work' : 'jobhunt';
}

export function foodOptions(s: GameState): Plan['food'][] {
  if (s.housing.kind === 'parents') return ['parents', 'takeout'];
  if (s.housing.kind === 'dorm') return ['mealplan', 'takeout'];
  return ['ramen', 'cook', 'takeout'];
}

// Weekly food costs, 2026 prices for one young adult. Groceries track the USDA "thrifty" plan
// (~$80–85/week buying for one); a week of mostly takeout and delivery apps runs ~$25/day.
export const FOOD: Record<Plan['food'], { name: string; cost: number; energy: number; desc: string }> = {
  ramen: { name: 'Ramen & cereal', cost: 45, energy: -5, desc: 'Cheap. You feel it by Thursday.' },
  cook: { name: 'Groceries & cooking', cost: 85, energy: 4, desc: 'Needs a Sunday meal-prep slot.' },
  takeout: { name: 'Takeout & delivery', cost: 185, energy: 4, desc: 'Fast and tasty. Delivery fees and tips add up fast.' },
  parents: { name: 'Family dinners', cost: 25, energy: 4, desc: 'Dinner is free. Lunches at work and snacks are on you.' },
  mealplan: { name: 'Dining hall', cost: 0, energy: 2, desc: 'Prepaid meal plan. Mystery casserole.' },
};

// Toiletries, laundry, cleaning supplies, toilet paper: the stuff nobody budgets for.
export function personalCost(s: GameState): number {
  return s.housing.kind === 'parents' || s.housing.kind === 'dorm' ? 25 : 45;
}

export function appointmentSlots(s: GameState): Partial<Record<SlotId, string>> {
  const out: Partial<Record<SlotId, string>> = {};
  for (const a of s.appointments) if (a.week === s.week) out[a.slot] = a.label;
  return out;
}

export function startWeek(s0: GameState, plan: Plan): GameState {
  const s = clone(s0);
  if (s.queue.length || s.over) return s;
  s.plan = { slots: { ...plan.slots }, food: plan.food };
  if (s.plan.food === 'cook' && s.plan.slots.sunday !== 'mealprep') s.plan.food = foodOptions(s).find((f) => f !== 'cook') ?? 'ramen';
  s.log = [];
  s.weekSnap = snap(s) as unknown as Record<string, number>;
  const q: Step[] = SLOTS.map((slot) => ({ t: 'slot', slot }) as Step);
  q.push({ t: 'food' }, { t: 'upkeep' }, { t: 'events' });
  if (s.week % 2 === 0) q.push({ t: 'payday' });
  if (s.week % 4 === 0) q.push({ t: 'bills' });
  q.push({ t: 'summary' });
  if (s.week === chapterEndWeek(s.chapter)) q.push({ t: 'chapterEnd' });
  s.queue = q;
  return advance(s);
}

export function chapterEndWeek(ch: number): number {
  return chapterStartWeek(ch) + CHAPTERS[ch].weeks - 1;
}

// ---------- the queue ----------
function interactive(st: Step): boolean {
  return st.t === 'scene' || st.t === 'minigame' || st.t === 'paycheck' || st.t === 'billsDue' || st.t === 'summary' || st.t === 'chapterEnd' || st.t === 'gameOver' || st.t === 'ending';
}

export function advance(s: GameState): GameState {
  let guard = 0;
  while (s.queue.length && !interactive(s.queue[0])) {
    if (++guard > 200) throw new Error('queue runaway');
    const st = s.queue.shift()!;
    runAuto(s, st);
  }
  // Skip scenes whose every choice is hidden (defensive).
  return s;
}

function runAuto(s: GameState, st: Step): void {
  switch (st.t) {
    case 'slot':
      runSlot(s, st.slot);
      break;
    case 'food':
      runFood(s);
      break;
    case 'upkeep':
      runUpkeep(s);
      break;
    case 'events':
      runEvents(s);
      break;
    case 'payday':
      runPayday(s);
      break;
    case 'bills':
      runBills(s);
      break;
    default:
      break;
  }
}

// ---------- slots ----------
function runSlot(s: GameState, slot: SlotId): void {
  const appt = s.appointments.find((a) => a.week === s.week && a.slot === slot);
  if (appt) {
    s.appointments = s.appointments.filter((a) => a !== appt);
    if (slot === 'weekday') missWork(s, appt.label);
    const id = `appt-${appt.kind}`;
    if (SCENES[id]) s.queue.unshift({ t: 'scene', id, step: 'start' });
    return;
  }
  const id = s.plan.slots[slot];
  const a = activityFor(id);
  if (slot === 'weekday' && id !== 'work' && id !== 'class') {
    if (s.path === 'college' && s.flags.enrolled !== false) {
      xp(s, -3);
      inc(s, 'skips');
      log(s, `You skipped class for ${txt(a.name, s).toLowerCase()}. Your notes have a gap.`, 'bad');
    } else if (s.job) missWork(s, txt(a.name, s));
  }
  a.run(s, slot);
}

// ---------- food ----------
// Everyday spending can go on the card, depending on how you chose to use it.
export function spend(s: GameState, amount: number, label: string, kind: 'small' | 'all'): void {
  const use = s.flags.cardUse;
  if (s.card && (use === 'all' || (use === 'small' && kind === 'small')) && cardRoom(s) >= amount) {
    pay(s, amount, 'card', label);
    return;
  }
  charge(s, amount, label);
}

function runFood(s: GameState): void {
  const f = FOOD[s.plan.food];
  // The grocery run mini-game sets this week's actual grocery bill.
  const bill = s.plan.food === 'cook' && num(s, 'groceryBill') > 0 ? num(s, 'groceryBill') : f.cost;
  s.flags.groceryBill = 0;
  if (bill > 0) spend(s, bill, 'Food', 'all');
  const misc = personalCost(s);
  spend(s, misc, 'Personal stuff', 'small');
  log(s, `Toiletries, laundry, and life stuff: ${money(misc)}.`);
  energy(s, f.energy);
  log(s, `Food: ${f.name.toLowerCase()}${bill ? ` (${money(bill)})` : ''}.`, f.energy < 0 ? 'bad' : undefined);
  if (s.plan.food === 'takeout') inc(s, 'takeoutWeeks');
  if (s.plan.food === 'cook') inc(s, 'cookWeeks');
}

// ---------- upkeep ----------
function runUpkeep(s: GameState): void {
  // The job itself.
  if (s.job) {
    // Construction slows down in the dead of winter: apprentices get cut hours, not paid time off.
    const slow = s.path === 'trade' && s.week >= 19 && s.week <= 24 && s.job.hours > 32;
    s.hoursThisPeriod += slow ? 32 : s.job.hours;
    if (slow) log(s, `Winter slowdown: only 32 hours on the schedule this week (−${money(8 * s.job.wage)} before taxes).`, 'bad');
    const drain = Math.round(s.job.hours * 0.42) + (s.path === 'trade' ? 4 : 0);
    energy(s, -drain);
  }
  if (s.path === 'college' && s.flags.enrolled !== false) energy(s, -6);
  // Commute.
  switch (s.transport) {
    case 'bus':
      energy(s, -3);
      // No monthly pass (or ride arrangement) means paying per trip, which costs more.
      if (s.path !== 'college' && !s.subs.some((x) => x.id === 'buspass' || x.id === 'rides')) {
        const fare = s.path === 'trade' ? 60 : 25;
        spend(s, fare, s.path === 'trade' ? 'Rides to job sites' : 'Bus fares', 'small');
        log(s, s.path === 'trade' ? `No ride arrangement: paying coworkers per ride (${money(fare)}).` : `Bus fares without a monthly pass: ${money(fare)}.`);
      }
      break;
    case 'bike':
      energy(s, -1);
      break;
    case 'car':
    case 'borrow':
      spend(s, s.transport === 'car' ? 35 : 25, 'Gas', 'small');
      log(s, `Gas: ${money(s.transport === 'car' ? 35 : 25)}.`);
      break;
    case 'carpool':
      charge(s, 25, 'Carpool gas money');
      log(s, `Gas money for your carpool: ${money(25)}.`);
      break;
  }
  if (s.car) s.car.condition = clamp(s.car.condition - 1.5, 0, 100);
  if (s.flags.gym) energy(s, 3);
  if (s.flags.headaches) energy(s, -2);
  if (s.flags.airMattress) energy(s, -2);
  if (s.flags.noLaptop) energy(s, -3);
  if (s.flags.badHeal) energy(s, -1);
  if (s.subs.some((x) => x.id === 'streamflix')) energy(s, 1);
  if (s.flags.roommate === 'jordan') energy(s, -3);
  if (s.path === 'trade' && s.subs.some((x) => x.id === 'nightclass') && !num(s, 'classOwed')) xp(s, 2);

  // Sick / burnout pressure.
  if (s.stats.energy <= 0) {
    s.queue.splice(s.queue.findIndex((q) => q.t === 'events'), 0, { t: 'scene', id: 'ev-burnout', step: 'start' });
  } else if (s.stats.energy < 22 && chance(s, 0.45)) {
    setSick(s);
  }
  // Rep floor: lose the job.
  if (s.job && s.stats.rep < 12 && s.path !== 'college') {
    s.queue.splice(s.queue.findIndex((q) => q.t === 'events'), 0, { t: 'scene', id: 'ev-fired', step: 'start' });
  }
  // Savings interest monthly.
  if (s.week % 4 === 0 && s.stats.savings > 0) {
    const r = s.bank === 'online' ? 0.04 : s.bank === 'creditunion' ? 0.015 : 0.001;
    const i = round2((s.stats.savings * r) / 12);
    if (i >= 0.01) {
      s.stats.savings = round2(s.stats.savings + i);
      log(s, `Savings interest: +${money(i, true)}.`, 'good');
    }
  }
  runLifeCosts(s);
}

// ---------- irregular costs ----------
// Real costs that don't show up as a monthly bill but always show up. They're on a fixed
// calendar (not random), so a player who keeps a cushion is never blindsided by them.
interface LifeCost {
  id: string;
  weeks: number[];
  amount: number;
  label: string;
  text: string;
  when?: (s: GameState) => boolean;
}

const ownPlace = (s: GameState): boolean => s.housing.kind !== 'parents' && s.housing.kind !== 'dorm';

export const LIFE_COSTS: LifeCost[] = [
  { id: 'haircut', weeks: [5, 11, 17, 23, 29, 35], amount: 28, label: 'Haircut', text: 'Haircut plus tip: $28. Every six weeks, that’s about $240 a year.' },
  { id: 'uniform', weeks: [3], amount: 45, label: 'Work clothes', text: 'Fresh Fields requires black pants and non-slip shoes: $45.', when: (s) => s.path === 'home' && !!s.job },
  { id: 'codebook', weeks: [4], amount: 135, label: 'Code book', text: 'Night class requires the current electrical code book: $135, even used.', when: (s) => s.path === 'trade' },
  { id: 'clothes', weeks: [9], amount: 60, label: 'Clothes', text: 'Your jeans ripped and your shoes gave out. Discount-store replacements: $60.' },
  { id: 'bday', weeks: [7, 13, 27, 33], amount: 35, label: 'Birthday', text: 'Another birthday (family or a friend): dinner out and a small gift, $35.' },
  { id: 'coat', weeks: [16], amount: 95, label: 'Winter coat', text: 'It got cold fast. A winter coat and gloves: $95.' },
  { id: 'workshoes', weeks: [24], amount: 70, label: 'Work shoes', text: 'On your feet all day, your work shoes wore through: $70.', when: (s) => (s.path === 'trade' || s.path === 'work') && !!s.job },
  { id: 'holidays', weeks: [20], amount: 140, label: 'Holiday gifts', text: 'Holiday gifts for family and friends: $140, even shopping carefully.' },
  { id: 'books2', weeks: [21], amount: 210, label: 'Spring textbooks', text: 'New semester, new syllabus. Used and rental textbooks: $210.', when: (s) => s.path === 'college' && s.flags.enrolled !== false },
  { id: 'carreg', weeks: [26], amount: 95, label: 'Car registration', text: 'Annual car registration renewal: $95. The DMV doesn’t send a reminder twice.', when: (s) => !!s.car },
];

function lifeCost(s: GameState, amount: number, label: string, text: string): void {
  spend(s, amount, label, 'small');
  log(s, text, 'bad');
  inc(s, 'lifeCosts', amount);
  unlock(s, 'irregular-costs');
}

function runLifeCosts(s: GameState): void {
  for (const c of LIFE_COSTS) {
    if (!c.weeks.includes(s.week) || (c.when && !c.when(s))) continue;
    lifeCost(s, c.amount, c.label, c.text);
  }
  // First place of your own: sheets, towels, pots, a shower curtain, a trash can… and, in an
  // unfurnished apartment, something to sleep on.
  if (ownPlace(s) && !s.flags.movedInBasics) {
    s.flags.movedInBasics = true;
    if (s.housing.kind === 'room') lifeCost(s, 150, 'Move-in basics', 'Move-in basics: sheets, towels, a pot, a shower curtain, a trash can… $150 at the discount store.');
    else lifeCost(s, 300, 'Move-in basics', 'Move-in basics for an empty apartment: a used mattress, sheets, towels, a pot, a shower curtain… $300, even secondhand.');
  }
  // A new car comes with sales tax, title, and plates.
  if (s.car && !s.flags.carTitled) {
    s.flags.carTitled = true;
    const fees = Math.round(s.car.value * 0.06) + 95;
    const loan = s.loans.find((l) => l.kind === 'car' && l.balance > 0);
    if (loan) {
      loan.balance = round2(loan.balance + fees);
      log(s, `Sales tax, title, and plates for your car: ${money(fees)}, rolled into your car loan.`, 'bad');
      unlock(s, 'irregular-costs');
    } else lifeCost(s, fees, 'Car tax & title', `Sales tax, title, and plates for your car: ${money(fees)}. The sticker price is never the whole price.`);
  }
  // Borrowing the family car isn't free: your parents' insurance went up when you were added.
  if (s.transport !== 'borrow' && s.subs.some((x) => x.id === 'carshare')) {
    s.subs = s.subs.filter((x) => x.id !== 'carshare');
    log(s, 'You’re no longer on Mom’s car, so no more insurance share.', 'info');
  }
}

function setSick(s: GameState): void {
  const i = s.queue.findIndex((q) => q.t === 'events');
  s.queue.splice(i < 0 ? 0 : i, 0, { t: 'scene', id: 'ev-sick', step: 'start' });
}

// ---------- events ----------
function eligible(s: GameState, e: { id: string; when?: (s: GameState) => boolean; once?: boolean; cooldown?: number; minWeek?: number }): boolean {
  if (e.minWeek && s.week < e.minWeek) return false;
  if (e.once && s.flags[`seen:${e.id}`]) return false;
  const last = num(s, `last:${e.id}`);
  if (e.cooldown && last && s.week - last < e.cooldown) return false;
  if (!SCENES[e.id]) return false;
  return !e.when || e.when(s);
}

function weightOf(s: GameState, w: number | ((s: GameState) => number)): number {
  return typeof w === 'function' ? w(s) : w;
}

function rollFrom<T extends { id: string; weight: number | ((s: GameState) => number); when?: (s: GameState) => boolean; once?: boolean; cooldown?: number; minWeek?: number }>(
  s: GameState,
  pool: T[],
): T | null {
  const ok = pool.filter((e) => eligible(s, e)).map((e) => ({ e, w: Math.max(0, weightOf(s, e.weight)) })).filter((x) => x.w > 0);
  const total = ok.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  let r = rand(s) * total;
  for (const x of ok) {
    r -= x.w;
    if (r <= 0) return x.e;
  }
  return ok[ok.length - 1].e;
}

function markSeen(s: GameState, id: string): void {
  s.flags[`seen:${id}`] = true;
  s.flags[`last:${id}`] = s.week;
}

function runEvents(s: GameState): void {
  const add: Step[] = [];
  // College: attendance, fees, and whatever is due this week (assignments, exams, report cards).
  const school = collegeWeek(s);
  // Story beats for this week (chapter openers, mission prompts).
  for (const id of storyBeats(s)) {
    markSeen(s, id);
    add.push({ t: 'scene', id, step: 'start' });
  }
  // One random life event most weeks (skipped if a story beat already happened).
  if (add.length === 0 && !school.quiet && chance(s, 0.72)) {
    const e = rollFrom(s, EVENTS);
    if (e) {
      markSeen(s, e.id);
      add.push({ t: 'scene', id: e.id, step: 'start' });
    }
  }
  s.queue.unshift(...school.steps, ...add);
}

// ---------- payday ----------
// 2026 federal withholding for a biweekly paycheck: IRS percentage method, single filer, standard W-4.
// The paycheck is annualized, so someone who only works part of the year gets most of it back at tax time.
function fedWithholding(taxablePerCheck: number): number {
  const annual = taxablePerCheck * 26 - 8600;
  const brackets: [number, number][] = [
    [7500, 0.1],
    [19900, 0.12],
    [57900, 0.22],
  ];
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [lo, rate] = brackets[i];
    const hi = brackets[i + 1]?.[0] ?? Infinity;
    if (annual > lo) tax += (Math.min(annual, hi) - lo) * rate;
  }
  return round2(tax / 26);
}

export function makeStub(s: GameState): PayStub {
  const job = s.job;
  const hours = job ? Math.max(0, s.hoursThisPeriod) : 0;
  const wage = job ? job.wage : 0;
  const gross = round2(hours * wage);
  const health = job && s.health === 'employer' ? job.premium : 0;
  const dental = job && s.dental && job.dentalPremium ? job.dentalPremium : 0;
  const retire = round2(gross * s.retirePct);
  const match = job && s.retirePct > 0 ? round2(gross * Math.min(s.retirePct, job.match)) : 0;
  const taxable = Math.max(0, gross - retire - health - dental);
  const federal = s.flags.w4exempt ? 0 : fedWithholding(taxable);
  // Health/dental premiums are pre-tax for FICA too; 401(k) money is not. On-campus student jobs are FICA-exempt.
  const fica = s.path === 'college' ? 0 : round2((gross - health - dental) * 0.0765);
  const state = round2(taxable * 0.035);
  const net = round2(gross - federal - fica - state - health - dental - retire);
  return { hours, wage, gross, federal, fica, state, health, dental, retire, match, net, autoSaved: 0, overdraftCleared: 0 };
}

function runPayday(s: GameState): void {
  const stub = makeStub(s);
  s.hoursThisPeriod = 0;
  if (stub.gross <= 0) {
    log(s, 'Payday… but no paycheck this time.', 'bad');
    return;
  }
  const before = s.stats.cash;
  s.stats.cash = round2(s.stats.cash + stub.net);
  if (before < 0) stub.overdraftCleared = Math.min(-before, stub.net);
  s.retire = round2(s.retire + stub.retire + stub.match);
  if (s.autoSave > 0 && s.stats.cash > 0) stub.autoSaved = save(s, Math.min(s.autoSave, s.stats.cash));
  inc(s, 'paychecks');
  inc(s, 'wagesYear', stub.gross);
  inc(s, 'fedWithheld', stub.federal);
  inc(s, 'stateWithheld', stub.state);
  unlock(s, 'paystub');
  log(s, `Payday! ${money(stub.net, true)} deposited.`, 'good');
  const offer = rollFrom(s, OFFERS);
  if (offer) markSeen(s, offer.id);
  s.queue.unshift({ t: 'paycheck', stub, offer: offer ? offer.id : null });
}

// ---------- bills ----------
export function billsFor(s: GameState): Bill[] {
  const b: Bill[] = [];
  const h = s.housing;
  if (h.rent > 0) b.push({ id: 'rent', label: h.kind === 'parents' ? 'Rent to your parents' : 'Rent', amount: h.rent, kind: 'housing' });
  if (h.utilities > 0) {
    // Heating season (weeks 17–28) pushes the power bill up about 30%.
    const winter = s.week >= 17 && s.week <= 28;
    b.push({ id: 'utilities', label: winter ? 'Utilities (power, internet) · winter heating' : 'Utilities (power, internet)', amount: winter ? Math.round(h.utilities * 1.3) : h.utilities, kind: 'utilities' });
  }
  for (const sub of s.subs) b.push({ id: `sub:${sub.id}`, label: sub.label, amount: sub.cost, kind: sub.id === 'phone' ? 'phone' : sub.id === 'nightclass' || sub.id === 'tuitionplan' || sub.id === 'schoolbal' ? 'tuition' : sub.id === 'gym' ? 'gym' : 'sub' });
  if (s.car) b.push({ id: 'carins', label: `Car insurance`, amount: s.car.insurance, kind: 'insurance' });
  for (const l of s.loans) if (!l.deferred && l.balance > 0) b.push({ id: `loan:${l.name}`, label: `${l.name} payment`, amount: Math.min(l.payment, round2(l.balance)), kind: 'carloan' });
  if (s.card && s.card.balance > 0.5) {
    const min = round2(Math.min(s.card.balance, Math.max(25, s.card.balance * 0.03)));
    b.push({ id: 'card', label: `${s.card.name} statement`, amount: round2(s.card.balance), minimum: min, kind: 'card' });
  }
  return b;
}

function runBills(s: GameState): void {
  // Interest first: card (if last statement was carried) and loans.
  const promo = num(s, 'promoUntil') > s.week && s.card?.name === 'ToolTown Card';
  if (s.card && s.card.balance > 0 && s.flags.cardCarry && !promo) {
    const i = round2((s.card.balance * s.card.apr) / 12);
    s.card.balance = round2(s.card.balance + i);
    inc(s, 'interestPaid', i);
    log(s, `Credit card interest: ${money(i, true)}. That's the cost of carrying a balance.`, 'bad');
  }
  for (const l of s.loans) {
    if (l.balance <= 0) continue;
    const i = round2((l.balance * l.apr) / 12);
    l.balance = round2(l.balance + i);
    if (l.kind !== 'student') inc(s, 'interestPaid', i);
  }
  // Monthly bank fee.
  if (s.bank === 'bigbank' && s.stats.cash + s.stats.savings < 1500) {
    charge(s, 12, 'Monthly account fee');
    log(s, 'Big Bank charged its $12 monthly fee (balance under $1,500).', 'bad');
    inc(s, 'bankFees', 12);
  }
  if (s.bank === 'teen' && s.week >= 8) {
    charge(s, 15, 'Monthly account fee');
    log(s, 'Your old teen account is now an adult account with a $15 monthly fee.', 'bad');
    inc(s, 'bankFees', 15);
  }
  const bills = billsFor(s);
  if (bills.length) s.queue.unshift({ t: 'billsDue', bills });
}

export function payBills(s0: GameState, choices: Record<string, { amount: number; method: PayMethod } | null>): GameState {
  const s = clone(s0);
  const head = s.queue[0];
  if (!head || head.t !== 'billsDue') return s;
  for (const b of head.bills) {
    const c = choices[b.id];
    const amount = c ? round2(Math.min(c.amount, b.amount)) : 0;
    const paid = c && amount > 0 && pay(s, amount, c.method, b.label) ? amount : 0;
    if (b.kind === 'card' && s.card) {
      if (paid > 0) s.card.balance = round2(s.card.balance - paid);
      const min = b.minimum ?? 0;
      if (paid + 0.01 >= min) {
        s.credit.onTime++;
        inc(s, 'cardOnTime');
        if (paid + 0.01 >= b.amount) {
          s.flags.cardCarry = false;
          inc(s, 'cardPaidFull');
          log(s, 'Paid your card in full: no interest, and an on-time payment for your credit.', 'good');
        } else {
          s.flags.cardCarry = true;
          log(s, `Paid ${money(paid)} on your card. The rest (${money(s.card.balance)}) will collect interest.`, 'info');
          unlock(s, 'minimum-payment');
        }
      } else {
        s.flags.cardCarry = true;
        s.credit.late++;
        s.card.balance = round2(s.card.balance + 30);
        log(s, 'Missed your credit card payment: $30 late fee and a late mark on your credit report.', 'bad');
        unlock(s, 'late-payment');
      }
      continue;
    }
    if (b.kind === 'carloan') {
      const loan = s.loans.find((l) => `loan:${l.name}` === b.id);
      if (loan && paid >= b.amount - 0.01) {
        loan.balance = round2(Math.max(0, loan.balance - paid));
        s.credit.onTime++;
        inc(s, 'loanMissed', -num(s, 'loanMissed'));
      } else if (loan) {
        s.credit.late++;
        loan.balance = round2(loan.balance + 25);
        const m = inc(s, 'loanMissed');
        log(s, `Missed the ${loan.name} payment: $25 late fee, credit hit.`, 'bad');
        if (m >= 2 && loan.kind === 'car') s.queue.splice(1, 0, { t: 'scene', id: 'ev-repo', step: 'start' });
      }
      continue;
    }
    if (paid >= b.amount - 0.01) continue;
    // Skipped (or partial) bill.
    switch (b.kind) {
      case 'housing': {
        s.housing.missed++;
        inc(s, 'rentMissed');
        charge(s, s.housing.kind === 'parents' ? 0 : 75, 'Late rent fee');
        if (s.housing.missed >= 2) {
          s.queue.splice(1, 0, { t: 'gameOver', reason: s.housing.kind === 'parents' ? 'parents' : 'evicted' });
        } else {
          s.queue.splice(1, 0, { t: 'scene', id: 'ev-rentlate', step: 'start' });
        }
        break;
      }
      case 'tuition': {
        const m = inc(s, 'tuitionMissed');
        log(s, `Missed the ${b.label.toLowerCase()} payment.`, 'bad');
        if (m >= 2 && s.path === 'college') s.queue.splice(1, 0, { t: 'gameOver', reason: 'dropped' });
        else if (s.path === 'trade') {
          rep(s, -6);
          xp(s, -5);
          log(s, 'Your program coordinator noticed. You can’t take the exam with an unpaid balance.', 'bad');
          s.flags.classOwed = num(s, 'classOwed') + b.amount;
        }
        break;
      }
      case 'insurance':
        s.flags.uninsuredCar = true;
        log(s, 'Your car insurance lapsed. Driving uninsured is illegal and risky.', 'bad');
        unlock(s, 'car-insurance');
        break;
      case 'phone':
        s.flags.phoneCut = true;
        charge(s, 10, 'Phone late fee');
        log(s, 'Phone bill unpaid: service suspended until you pay (+$10 late fee).', 'bad');
        break;
      case 'gym':
      case 'sub':
        s.subs = s.subs.filter((x) => `sub:${x.id}` !== b.id);
        if (b.kind === 'gym') s.flags.gym = false;
        log(s, `${b.label} canceled for nonpayment.`, 'info');
        break;
      default:
        charge(s, 15, 'Late fee');
        break;
    }
  }
  // Paid-up phone/insurance clear flags.
  for (const b of head.bills) {
    const c = choices[b.id];
    if (c && c.amount >= b.amount - 0.01) {
      if (b.kind === 'housing') s.housing.missed = 0;
      if (b.kind === 'phone') s.flags.phoneCut = false;
      if (b.kind === 'insurance') s.flags.uninsuredCar = false;
      if (b.kind === 'tuition') s.flags.tuitionMissed = 0;
    }
  }
  inc(s, 'billsDays');
  s.queue.shift();
  return advance(s);
}

// ---------- scenes ----------
export interface ViewChoice {
  i: number;
  label: string;
  hint: string;
  pay: number;
  locked: string | null;
  methods: { method: PayMethod; ok: boolean; note: string }[];
}

export function sceneChoices(s: GameState, st: Extract<Step, { t: 'scene' }>): ViewChoice[] {
  const sc = sceneOf(st.id);
  const step = sc.steps[st.step];
  const d = st.data ?? {};
  const out: ViewChoice[] = [];
  step.choices.forEach((c, i) => {
    if (c.hide && c.hide(s, d)) return;
    const req = c.req ? c.req(s, d) : true;
    const amount = c.pay === undefined ? 0 : round2(typeof c.pay === 'function' ? c.pay(s, d) : c.pay);
    const methods = amount > 0 ? (c.methods ?? (['checking', 'savings', 'card'] as PayMethod[])).map((m) => ({ method: m, ...canPay(s, amount, m) })) : [];
    let locked = req === true ? null : req;
    if (!locked && amount > 0 && !methods.some((m) => m.ok)) locked = `Can't afford ${money(amount)}`;
    out.push({ i, label: txt(c.label, s, d), hint: txt(c.hint, s, d), pay: amount, locked, methods });
  });
  // Never leave the player stuck: if nothing is possible, offer a way out.
  if (!out.some((c) => !c.locked)) out.push({ i: -1, label: 'I can\u2019t do this right now', hint: '', pay: 0, locked: null, methods: [] });
  return out;
}

export function choose(s0: GameState, i: number, method?: PayMethod): GameState {
  const s = clone(s0);
  const head = s.queue[0];
  if (!head || head.t !== 'scene' || head.result) return s;
  const sc = sceneOf(head.id);
  const step = sc.steps[head.step];
  if (i === -1) {
    if (sceneChoices(s, head).some((x) => x.i >= 0 && !x.locked)) return s;
    s.queue.shift();
    log(s, `${txt(sc.title, s, head.data ?? {})}: couldn't manage it this time.`, 'bad');
    return advance(s);
  }
  const c: Choice | undefined = step.choices[i];
  if (!c) return s;
  const d = head.data ?? (head.data = {});
  if (c.hide && c.hide(s, d)) return s;
  if (c.req && c.req(s, d) !== true) return s;
  const before = snap(s);
  const amount = c.pay === undefined ? 0 : round2(typeof c.pay === 'function' ? c.pay(s, d) : c.pay);
  let m: PayMethod | undefined = method;
  if (amount > 0) {
    const allowed = c.methods ?? ['checking', 'savings', 'card'];
    if (!m || !allowed.includes(m)) m = allowed.find((x) => canPay(s, amount, x).ok);
    if (!m || !pay(s, amount, m, txt(sc.title, s, d))) return s0;
    if (m === 'card') inc(s, 'cardUses');
    if (m === 'savings') inc(s, 'savingsUses');
  }
  // Take this scene off the queue so anything it queues runs right after it.
  s.queue.shift();
  c.do?.(s, d, m);
  const next = typeof c.next === 'function' ? c.next(s, d) : (c.next ?? null);
  const result = txt(c.result, s, d);
  const deltas = diff(before, snap(s));
  if (result && sc.kind !== 'story') {
    const first = result.split('\n')[0];
    const short = first.length > 110 ? `${first.slice(0, 107)}\u2026` : first;
    log(s, `${txt(sc.title, s, d)}: ${short}`, deltas.cash && deltas.cash > 0 ? 'good' : undefined);
  }
  if (result || c.tip) {
    s.queue.unshift({ ...head, data: d, result: { text: result, tip: c.tip, deltas }, resultNext: next });
  } else if (next) {
    s.queue.unshift({ ...head, data: d, step: next, result: undefined, resultNext: undefined });
  }
  if (c.tip) unlockTipFor(s, c.tip);
  return advance(s);
}

function unlockTipFor(_s: GameState, _tip: string): void {
  // Tips are shown inline; handbook entries are unlocked explicitly by content.
}

export function proceed(s0: GameState): GameState {
  const s = clone(s0);
  const head = s.queue[0];
  if (!head) return s;
  switch (head.t) {
    case 'scene': {
      if (!head.result) return s;
      s.queue.shift();
      if (head.resultNext) s.queue.unshift({ t: 'scene', id: head.id, step: head.resultNext, data: head.data });
      break;
    }
    case 'minigame': {
      if (!head.result) return s;
      s.queue.shift();
      break;
    }
    case 'paycheck': {
      s.queue.shift();
      if (head.offer) s.queue.unshift({ t: 'scene', id: head.offer, step: 'start' });
      break;
    }
    case 'summary': {
      s.queue.shift();
      endWeek(s);
      break;
    }
    case 'chapterEnd': {
      s.queue.shift();
      endChapter(s);
      break;
    }
    default:
      return s;
  }
  return advance(s);
}

// ---------- week / chapter end ----------
function endWeek(s: GameState): void {
  checkAchievements(s);
  const sc = creditScore(s);
  s.history.push({ week: s.week, net: Math.round(s.stats.cash + s.stats.savings - (s.card?.balance ?? 0)), energy: s.stats.energy, score: sc });
  if (s.queue.some((q) => q.t === 'chapterEnd' || q.t === 'gameOver')) return;
  s.week++;
}

export interface TaskStatus {
  id: string;
  title: string;
  desc: string;
  how: string;
  done: boolean;
  optional: boolean;
  progress: string;
}

export function taskStatus(s: GameState, ch = s.chapter): TaskStatus[] {
  return tasksFor(s, ch).map((t) => ({
    id: t.id,
    title: txt(t.title, s),
    desc: txt(t.desc, s),
    how: txt(t.how, s),
    done: !!s.tasksDone[t.id] || t.done(s),
    optional: !!t.optional,
    progress: t.progress ? t.progress(s) : '',
  }));
}

export interface ChapterReport {
  stars: number;
  done: string[];
  missed: { title: string; consequence: string }[];
  bonus: string[];
}

// Computes (and applies, when apply=true) the end-of-chapter result.
export function chapterReport(s: GameState, apply: boolean): ChapterReport {
  const ts = tasksFor(s, s.chapter);
  const done: string[] = [];
  const missed: { title: string; consequence: string }[] = [];
  const bonus: string[] = [];
  let req = 0;
  let reqDone = 0;
  for (const t of ts) {
    const ok = !!s.tasksDone[t.id] || t.done(s);
    if (!t.optional) req++;
    if (ok) {
      if (t.optional) bonus.push(txt(t.title, s));
      else {
        reqDone++;
        done.push(txt(t.title, s));
      }
      if (apply) s.tasksDone[t.id] = true;
    } else if (!t.optional) {
      const consequence = txt(t.failText, s);
      if (apply) {
        s.tasksFailed[t.id] = true;
        t.onFail?.(s);
      }
      missed.push({ title: txt(t.title, s), consequence });
    }
  }
  let stars = req === 0 ? 3 : reqDone === req ? 2 : reqDone > 0 ? 1 : 0;
  if (stars === 2 && bonus.length > 0) stars = 3;
  return { stars, done, missed, bonus };
}

function endChapter(s: GameState): void {
  // The report was already shown; apply consequences now.
  const r = chapterReport(s, true);
  s.chapterStars[s.chapter] = r.stars;
  checkAchievements(s);
  s.chapter++;
  s.week++;
  if (s.chapter >= CHAPTERS.length) {
    s.won = true;
    s.over = true;
    s.queue = [{ t: 'ending' }];
    return;
  }
  s.queue = [{ t: 'scene', id: 'chapter-intro', step: 'start' }];
  s.weekSnap = snap(s) as unknown as Record<string, number>;
  s.checkpoint = null;
  s.checkpoint = JSON.stringify(s);
}

// Restart the current chapter from its checkpoint.
export function retryChapter(s: GameState): GameState | null {
  if (!s.checkpoint) return null;
  try {
    const c = JSON.parse(s.checkpoint) as GameState;
    c.checkpoint = s.checkpoint;
    c.seed = (c.seed ^ Math.floor(Math.random() * 1e9)) | 0;
    return c;
  } catch {
    return null;
  }
}

export function setAutoSave(s0: GameState, amount: number): GameState {
  const s = clone(s0);
  s.autoSave = Math.max(0, Math.round(amount / 25) * 25);
  return s;
}

export function moveMoney(s0: GameState, amount: number, to: 'savings' | 'checking' | 'card'): GameState {
  const s = clone(s0);
  amount = round2(amount);
  if (amount <= 0) return s;
  if (to === 'savings') save(s, amount);
  else if (to === 'checking') {
    const a = Math.min(amount, s.stats.savings);
    s.stats.savings = round2(s.stats.savings - a);
    s.stats.cash = round2(s.stats.cash + a);
  } else if (s.card) {
    const a = Math.min(amount, s.card.balance, Math.max(0, s.stats.cash));
    s.stats.cash = round2(s.stats.cash - a);
    s.card.balance = round2(s.card.balance - a);
  }
  return s;
}

export function head(s: GameState): Step | null {
  return s.queue[0] ?? null;
}

export function weeksLeftInChapter(s: GameState): number {
  return chapterEndWeek(s.chapter) - s.week + 1;
}

export function chapterInfo(s: GameState) {
  return { ...CHAPTERS[Math.min(s.chapter, CHAPTERS.length - 1)], index: s.chapter, endWeek: chapterEndWeek(Math.min(s.chapter, CHAPTERS.length - 1)) };
}

export { TASKS, chapterOf, missWork };
export type { Snap };

// ---------- mini-games ----------
export const SKIP_SCORE = 0.4; // auto-play result when a player skips: playing pays off

export function finishMinigame(s0: GameState, r: MiniResult): GameState {
  const s = clone(s0);
  const head = s.queue[0];
  if (!head || head.t !== 'minigame' || head.result) return s;
  const def = MINIGAMES[head.id];
  if (!def) throw new Error(`unknown minigame ${head.id}`);
  const score = Math.max(0, Math.min(1, Number.isFinite(r.score) ? r.score : 0));
  const before = snap(s);
  const d = head.data ?? {};
  s.queue.shift();
  const out = def.apply(s, { ...r, score }, d);
  const deltas = diff(before, snap(s));
  inc(s, 'minigamesPlayed', r.played ? 1 : 0);
  const title = txt(def.title, s, d);
  log(s, `${title}: ${out.text.split('\n')[0].slice(0, 110)}`, score >= 0.6 ? 'good' : score < 0.35 ? 'bad' : undefined);
  s.queue.unshift({ ...head, data: d, result: { text: out.text, tip: out.tip, deltas } });
  return advance(s);
}

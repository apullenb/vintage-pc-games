// The next phase: the time skip, the new job, a bigger budget, a nicer car, and maybe a house.
import { achieve, chance, creditLabel, creditScore, depositNote, energy, insuranceFactor, log, minigame, money, num, openCredit, rentDeposit, rep, round2, schedule, setFlag, unlock, xp } from '../../engine/core.ts';
import type { GameState, Housing } from '../../engine/types.ts';
import { gpa, gpaText, majorName } from '../college.ts';
import {
  CAR_DTI_MAX,
  CAR_TIERS,
  DTI_MAX,
  INSPECTION,
  MORTGAGE_TIERS,
  amortized,
  carApr,
  carTier,
  cashOnHand,
  drawCash,
  dti,
  efundGoal,
  essentials,
  grossMonthly,
  homeCost,
  levelReady,
  levelUp,
  maxPrice,
  minDown,
  mortgageTier,
  netMonthly,
  netPaycheck,
  promoBonus,
  salary,
  setEfundGoal,
  skillCount,
  skipLabel,
  totalInterest,
} from '../phase2.ts';
import type { Choice, Data, Scene } from '../types.ts';

const pct = (v: number, d = 1): string => `${(v * 100).toFixed(d).replace(/\.0$/, '')}%`;
const yr = (wage: number): string => `${money(salary(wage))}/yr`;
const round25 = (v: number): number => Math.max(0, Math.round(v / 25) * 25);

// ---------- where you live ----------
interface Place {
  id: string;
  label: (s: GameState) => string;
  rent: (s: GameState) => number;
  util: number;
  kind: Housing['kind'];
  name: (s: GameState) => string;
  roommate: boolean;
  hint: string;
  bot: (s: GameState) => number;
  hide?: (s: GameState) => boolean;
}
const PLACES: Place[] = [
  {
    id: 'lux',
    label: () => 'Luxury 1-bed at The Monarch: $1,595 + $140 utilities',
    rent: () => 1595,
    util: 140,
    kind: 'studio',
    name: () => 'The Monarch, unit 1104',
    roommate: false,
    hint: '✓ Rooftop pool, gym, a doorman named Phil · ✗ Rent eats the raise',
    bot: () => -3,
  },
  {
    id: 'one',
    label: () => '1-bedroom on Maple St: $1,150 + $130 utilities',
    rent: () => 1150,
    util: 130,
    kind: 'studio',
    name: () => '1-bedroom on Maple St',
    roommate: false,
    hint: '✓ Your own space · ✓ Short commute · ✗ Every bill is yours',
    bot: () => 0,
  },
  {
    id: 'rae',
    label: () => 'Split a 2-bedroom with Rae: $725 + $85 utilities',
    rent: () => 725,
    util: 85,
    kind: 'shared',
    name: () => '2-bedroom on Cedar Ave (with Rae)',
    roommate: true,
    hint: '✓ Half the rent · ✓ Your best friend · ✗ Rae’s drum kit',
    bot: (s) => (s.path === 'home' ? 1 : 2),
  },
  {
    id: 'stay',
    label: (s) => `Stay where you are: ${money(Math.round(s.housing.rent * 1.12))}/mo now`,
    rent: (s) => Math.round(s.housing.rent * 1.12),
    util: -1,
    kind: 'shared',
    name: (s) => s.housing.name,
    roommate: false,
    hint: '✓ No moving, no deposit · ✗ Three years of rent increases (+12%)',
    bot: () => 1.5,
    hide: (s) => s.housing.kind === 'parents' || s.housing.kind === 'dorm',
  },
  {
    id: 'home',
    label: (s) => (s.housing.kind === 'parents' ? 'Stay home: Mom says rent is $400 now' : 'Move back home: $400/mo to your parents'),
    rent: () => 400,
    util: 0,
    kind: 'parents',
    name: () => 'Your childhood bedroom (again)',
    roommate: false,
    hint: '✓ Save fast for a down payment · ✗ “Where are you going?” · ✗ The curfew talk, again',
    bot: (s) => (s.path === 'home' ? 3 : 0.5),
  },
];

function placeChoice(p: Place): Choice {
  const moving = (s: GameState): boolean => p.id !== 'stay' && !(p.id === 'home' && s.housing.kind === 'parents');
  const deposit = (s: GameState): number => (p.kind === 'parents' || !moving(s) ? 0 : rentDeposit(s, p.rent(s)));
  return {
    label: (s) => p.label(s),
    hint: (s) => (deposit(s) ? `${p.hint} · Deposit ${money(deposit(s))}${depositNote(s) ? ` (${depositNote(s)})` : ''}` : p.hint),
    hide: p.hide ? (s) => p.hide!(s) : undefined,
    pay: (s) => deposit(s),
    req: (s) => (p.kind !== 'parents' && p.rent(s) * 3 > grossMonthly(s) ? `Landlord wants ${money(p.rent(s) * 3)}/mo income` : true),
    bot: (s) => p.bot(s),
    do: (s) => {
      const old = s.housing;
      const move = moving(s);
      // Your old landlord sends back your security deposit.
      if (move && (old.kind === 'shared' || old.kind === 'studio' || old.kind === 'room')) {
        s.stats.cash = round2(s.stats.cash + old.rent);
        log(s, `Your old landlord returned your ${money(old.rent)} security deposit.`, 'good');
      }
      s.housing = {
        kind: p.id === 'stay' ? old.kind : p.kind,
        name: p.name(s),
        rent: p.rent(s),
        utilities: p.util < 0 ? old.utilities : p.util,
        missed: 0,
        roommate: p.roommate || (p.id === 'stay' && old.roommate),
        art: p.kind === 'parents' ? 'bedroom' : 'apartment',
      };
      if (p.id === 'rae') setFlag(s, 'roommate', 'rae');
      if (p.kind === 'parents') s.plan.food = 'parents';
      else if (s.plan.food === 'parents' || s.plan.food === 'mealplan') s.plan.food = 'ramen';
      if (move) {
        setFlag(s, 'movedInBasics');
        minigame(s, 'moving');
      }
      setEfundGoal(s);
    },
    result: (s) =>
      p.id === 'home'
        ? 'Your mom already made up the bed. “Dinner’s at six. Some things never change.”'
        : p.id === 'stay'
          ? 'You re-sign. The landlord bumps the rent and says “market rate” like it’s a spell.'
          : p.id === 'rae'
            ? 'Rae: “ROOMMATES!!! I already labeled the shelves in the fridge.”'
            : `New keys! ${money(p.rent(s))} a month, all yours.`,
  };
}

// ---------- the car lot ----------
export interface CarPick {
  id: string;
  name: string;
  short: string;
  price: number;
  isNew: boolean;
  insurance: number; // monthly, full coverage at 22
  drive: number; // share of the price it's worth once you drive it off
  hint: string;
}
export const CARS: CarPick[] = [
  { id: 'suv', name: '2026 Summit Trail SUV (new, loaded)', short: '2026 Summit Trail SUV', price: 38900, isNew: true, insurance: 265, drive: 0.86, hint: '✓ Heated seats, giant screen · ✗ Loses ~$5,400 the moment you drive off · ✗ Priciest to insure' },
  { id: 'new', name: '2026 Aurora SE sedan (new)', short: '2026 Aurora SE', price: 27400, isNew: true, insurance: 215, drive: 0.88, hint: '✓ Full warranty · ✓ Promo rates with good credit · ✗ Steep first-year depreciation' },
  { id: 'cpo', name: '2023 Aurora LX (certified pre-owned, 31k miles)', short: '2023 Aurora LX', price: 21800, isNew: false, insurance: 185, drive: 0.95, hint: '✓ Someone else ate the depreciation · ✓ Inspected, with a warranty · ✗ Higher APR than new' },
];
const ADDONS = 4189; // warranty $2,495 + paint/fabric $899 + dealer GAP $795
const TAX = 0.06;
const FEES = 350;

// Dealers knock a car with a check-engine light and worn parts way down on trade-in.
export const tradeIn = (s: GameState): number => (s.car ? Math.round(s.car.value * 0.85 * (s.car.condition < 35 ? 0.6 : s.car.condition < 60 ? 0.85 : 1)) : 0);
// Full-coverage quote for you: your driving record and a credit-based insurance score.
const quote = (s: GameState, c: CarPick): number => Math.round(c.insurance * insuranceFactor(s)) + (s.flags.ticketPoints ? 25 : 0);
const oldCarLoan = (s: GameState): number => s.loans.filter((l) => l.kind === 'car').reduce((a, l) => a + l.balance, 0);
function outTheDoor(s: GameState, d: Data): number {
  return Math.round(Number(d.price) * (1 + TAX) + FEES + Number(d.addons ?? 0) - tradeIn(s) + oldCarLoan(s));
}
interface Deal {
  otd: number;
  down: number;
  loan: number;
  apr: number;
  payment: number;
  interest: number;
}
function deal(s: GameState, d: Data, downPct: number, months: number): Deal {
  const car = CARS[Number(d.car)];
  const otd = outTheDoor(s, d);
  const down = Math.max(0, Math.round(otd * downPct));
  const loan = Math.max(0, otd - down);
  const apr = carApr(creditScore(s), car.isNew);
  const payment = months ? Math.round(amortized(loan, apr, months)) : 0;
  return { otd, down, loan, apr, payment, interest: months ? totalInterest(loan, apr, months) : 0 };
}
// Can a lender say yes to this car at all (zero down, 72 months)?
function carLoanOk(s: GameState, c: CarPick): boolean {
  const otd = c.price * (1 + TAX) + FEES - tradeIn(s) + oldCarLoan(s);
  return dti(s, s.housing.rent, amortized(otd, carApr(creditScore(s), c.isNew), 72)) <= CAR_DTI_MAX;
}
// A sensible buyer: 20% down still leaves most of the cushion, and the payment is under 10% of gross pay.
function carFits(s: GameState, c: CarPick): boolean {
  const otd = c.price * (1 + TAX) + FEES - tradeIn(s) + oldCarLoan(s);
  const pay = amortized(otd * 0.8, carApr(creditScore(s), c.isNew), 48);
  return cashOnHand(s) - otd * 0.2 >= efundGoal(s) * 0.6 && pay <= grossMonthly(s) * 0.1;
}

function buyCar(s: GameState, d: Data, downPct: number, months: number): void {
  const car = CARS[Number(d.car)];
  const t = deal(s, d, downPct, months);
  drawCash(s, t.down);
  s.loans = s.loans.filter((l) => l.kind !== 'car');
  if (t.loan > 0 && months > 0) {
    s.loans.push({ name: 'Auto loan', balance: t.loan, apr: t.apr, payment: t.payment, kind: 'car' });
    openCredit(s);
    unlock(s, 'car-loan');
  }
  s.car = { name: car.short, condition: car.isNew ? 100 : 92, value: Math.round(Number(d.price) * car.drive), insurance: quote(s, car) };
  s.transport = 'car';
  s.subs = s.subs.filter((x) => x.id !== 'buspass' && x.id !== 'rides');
  s.flags.tireBad = 0;
  s.flags.weakBattery = false;
  setFlag(s, 'carDecided', car.id);
  if (Number(d.addons)) setFlag(s, 'carAddons');
  unlock(s, 'depreciation');
  unlock(s, 'car-insurance');
  achieve(s, 'newwheels');
}

function financeChoice(downPct: number, months: number, label: string, bot: number | ((s: GameState, d: Data) => number), extra = ''): Choice {
  return {
    label: (s, d) => {
      const t = deal(s, d, downPct, months);
      return months ? `${label}: ${money(t.payment)}/mo` : `${label}: ${money(t.otd)}`;
    },
    hint: (s, d) => {
      const t = deal(s, d, downPct, months);
      return months ? `${money(t.down)} down · ${pct(t.apr)} APR · ${money(t.interest)} in interest${extra}` : '✓ No loan, no interest · ✗ Drains your savings';
    },
    req: (s, d) => {
      const t = deal(s, d, downPct, months);
      if (t.down > cashOnHand(s)) return `Need ${money(t.down)} cash`;
      if (months && dti(s, s.housing.rent, t.payment) > CAR_DTI_MAX) return 'Lender says no: too much debt for your income';
      return true;
    },
    bot,
    do: (s, d) => buyCar(s, d, downPct, months),
    result: (s, d) => {
      const car = CARS[Number(d.car)];
      return `You drive the ${car.short} off the lot. It smells like plastic and ambition. Insurance: ${money(s.car?.insurance ?? 0)}/month. It’s worth ${money(s.car?.value ?? 0)} now, not the ${money(Number(d.price))} you paid.`;
    },
    tip: 'A new car loses 10–20% of its value in year one. Keep the car payment under about 10% of your gross pay, and never shop by the monthly payment alone.',
  };
}

// ---------- homes ----------
export interface Listing {
  id: string;
  name: string;
  price: number;
  kind: 'condo' | 'house';
  ins: number;
  hoa: number;
  util: number;
  commute?: boolean;
  hint: string;
  issue: string;
  cost: number; // what the inspection finds
  surprise: string;
}
export const LISTINGS: Listing[] = [
  { id: 'condo', name: '2-bed condo at Riverside Lofts', price: 159000, kind: 'condo', ins: 45, hoa: 285, util: 150, hint: '✓ No yard work · ✓ A pool · ✗ $285/mo HOA, and it can go up', issue: 'The inspector reads the HOA budget: reserves are thin. A roof special assessment is coming, about $3,000 per unit.', cost: 3000, surprise: 'assessment' },
  { id: 'fixer', name: '2-bed bungalow on Elm St (fixer-upper)', price: 172000, kind: 'house', ins: 140, hoa: 0, util: 230, hint: '✓ Great block · ✓ Room to add value · ✗ Needs work', issue: 'The furnace is 27 years old and the electrical panel is a known fire risk. About $7,500 to fix.', cost: 7500, surprise: 'furnace' },
  { id: 'far', name: '3-bed new build in Willow Creek', price: 209000, kind: 'house', ins: 135, hoa: 45, util: 210, commute: true, hint: '✓ Brand new, builder warranty · ✗ 45-minute commute each way (gas and energy)', issue: 'Brand new. A few punch-list items the builder fixes for free.', cost: 0, surprise: 'lawn' },
  { id: 'starter', name: '3-bed ranch on Birch Ln', price: 225000, kind: 'house', ins: 150, hoa: 0, util: 240, hint: '✓ Move-in ready · ✓ 20-minute commute · ✗ Nothing is new', issue: 'Solid house. But the water heater is 14 years old, and they last about 12. Budget about $1,800 soon.', cost: 1800, surprise: 'waterheater' },
  { id: 'dream', name: '4-bed colonial on Summit Ave', price: 389000, kind: 'house', ins: 210, hoa: 0, util: 320, hint: '✓ Gorgeous, with a big yard · ✗ “Stretch” money', issue: 'A crack in the foundation, and the roof has maybe two years left. $14,000, minimum.', cost: 14000, surprise: 'roof' },
];

const approval = (s: GameState) => s.phase2?.approval;
const tierOf = (s: GameState) => mortgageTier(approval(s)?.score ?? creditScore(s));
const listingOf = (d: Data): Listing => LISTINGS[Number(d.home ?? 0)] ?? LISTINGS[0];
const priceOf = (d: Data): number => Number(d.price ?? listingOf(d).price);
function costAt(s: GameState, d: Data, downPct: number) {
  const t = tierOf(s)!;
  const L = listingOf(d);
  return homeCost(priceOf(d), downPct, t, L.ins, L.hoa);
}
const housingNow = (s: GameState): number => (s.housing.kind === 'parents' ? 0 : s.housing.rent);
// Truly ready: 5% down and closing costs still leave a full emergency fund (plus something for the
// first repair), and the payment leaves room in the budget.
function fits(s: GameState, L: Listing): boolean {
  const t = tierOf(s);
  if (!t || L.id === 'dream') return false;
  const c = homeCost(L.price, Math.max(0.05, minDown(t)), t, L.ins, L.hoa);
  return cashOnHand(s) - c.cash - L.cost * 0.3 >= cushionAfter(s, c.total + L.util) && dti(s, c.total) <= 0.4;
}
// Three months of costs once the house payment replaces rent.
function cushionAfter(s: GameState, housing: number): number {
  const now = s.housing.rent + s.housing.utilities;
  return Math.max(efundGoal(s), Math.round(essentials(s) - now + housing) * 3);
}
const anyFit = (s: GameState): boolean => LISTINGS.some((L) => fits(s, L));

function renew(s: GameState): void {
  if (s.housing.kind !== 'parents' && s.housing.kind !== 'owned') s.housing.rent = Math.round(s.housing.rent * 1.06);
  setFlag(s, 'homeDecided', 'rent');
  s.flags.hunting = false;
  unlock(s, 'rent-vs-buy');
}
const renewResult = (s: GameState): string =>
  s.housing.kind === 'parents'
    ? 'You stay home another year. Your savings account sends a thank-you note.'
    : `You sign the renewal: ${money(s.housing.rent)} a month. No roof to replace, no lawn to mow, and your savings stay liquid.`;
const RENT_TIP = 'Renting isn’t “throwing money away.” You’re paying for flexibility and zero repair bills. Buying wins when you’ll stay 5+ years and still have an emergency fund after closing.';

function closeHome(s: GameState, d: Data): void {
  const L = listingOf(d);
  const t = tierOf(s)!;
  const p = Number(d.pct);
  const c = costAt(s, d, p);
  const credit = Number(d.credit ?? 0);
  drawCash(s, c.down + c.closing - credit);
  const old = s.housing;
  if (old.kind === 'shared' || old.kind === 'studio' || old.kind === 'room') {
    s.stats.cash = round2(s.stats.cash + old.rent);
    log(s, `Your landlord returned your ${money(old.rent)} security deposit.`, 'good');
  }
  s.loans.push({ name: 'Mortgage', balance: c.loan, apr: t.apr, payment: c.pi, kind: 'mortgage' });
  s.housing = { kind: 'owned', name: L.name, rent: c.tax + c.insurance + c.hoa + c.pmi, utilities: L.util, missed: 0, roommate: false, art: L.kind === 'condo' ? 'apartment' : 'street' };
  if (s.plan.food === 'parents') s.plan.food = 'ramen';
  if (s.phase2) s.phase2.home = { name: L.name, kind: L.kind, price: priceOf(d), value: priceOf(d), down: c.down, tax: c.tax, insurance: c.insurance, hoa: c.hoa, pmi: c.pmi, boughtWeek: s.week };
  setFlag(s, 'homeDecided', 'buy');
  s.flags.hunting = false;
  s.flags.roommate = false;
  setFlag(s, 'rentersIns'); // homeowners insurance (in escrow) covers your stuff now
  if (L.commute) setFlag(s, 'longCommute');
  // What the inspection found (or would have) shows up soon after you move in.
  setFlag(s, 'surprise', L.surprise);
  s.flags.surpriseCost = L.cost ? Math.round(L.cost * (d.waived ? 1.3 : 1)) : 450;
  s.flags.surpriseAt = s.week + 2;
  achieve(s, 'homeowner');
  for (const h of ['mortgage', 'escrow', 'closing-costs']) unlock(s, h);
  if (c.pmi) unlock(s, 'pmi');
  minigame(s, 'moving');
}

const SURPRISE: Record<string, { title: string; text: string }> = {
  waterheater: { title: 'Cold shower', text: 'The water heater died at 6 AM, and it took the laundry room floor with it. New heater and cleanup: ' },
  furnace: { title: 'No heat', text: 'First cold night, the furnace clanks once and quits. The HVAC tech says “oof.” New furnace and panel: ' },
  assessment: { title: 'HOA letter', text: 'The HOA voted: the building needs a new roof, and the reserves can’t cover it. Your special assessment: ' },
  roof: { title: 'Water stain', text: 'A brown stain spreads across the bedroom ceiling. The roof is done, and the foundation guy wants a word. Total: ' },
  lawn: { title: 'You own a lawn now', text: 'Nobody told you houses come with chores. Mower, hose, rakes, a ladder, a drill: ' },
};

// ---------- small helpers ----------
const SC = (s: GameState): string => {
  const sc = creditScore(s);
  return sc === null ? 'no score' : `${sc} (${creditLabel(sc)})`;
};
function payWhy(s: GameState): string {
  const p = s.phase2;
  if (!p) return '';
  const bits: string[] = [];
  if (s.path === 'college') {
    const sc = s.school;
    bits.push(`${majorName(s)} degree · GPA ${gpaText(gpa(s))}`);
    if (sc?.honors) bits.push('Honors ✓');
    bits.push(sc?.internship ? 'Internship ✓ (+5%)' : 'No internship');
  } else {
    bits.push(s.flags.careerDone ? 'Year-one milestone ✓' : 'Year-one milestone ✗');
    const b = promoBonus(s);
    if (b) bits.push(`Promotions: +${money(b, true)}/hr`);
  }
  const k = skillCount(s);
  if (k) bits.push(`${k} skill${k > 1 ? 's' : ''} on your résumé (+${Math.round(Math.min(4, k) * 1.5)}%)`);
  return bits.join(' · ');
}

function retireChoice(p: number, label: string, hint: string, bot: number): Choice {
  return {
    label: (s) => `${label} (${money(Math.round((s.job?.wage ?? 0) * (s.job?.hours ?? 40) * 2 * p))}/paycheck)`,
    hint,
    hide: (s) => s.retirePct === p && !!s.flags.p2Benefits,
    bot,
    do: (s) => {
      s.retirePct = p;
      setFlag(s, 'p2Benefits');
      unlock(s, '401k');
      if (p > 0) achieve(s, 'investor');
    },
    result: (s) =>
      p === 0
        ? `No 401(k). That’s ${money(Math.round((s.job?.wage ?? 0) * 2080 * (s.job?.match ?? 0)))} a year of free match money you’re turning down.`
        : `Done: ${Math.round(p * 100)}% of every paycheck goes in, and your employer adds ${Math.round(Math.min(p, s.job?.match ?? 0) * 100)}% more. Take-home: ${money(netPaycheck(s))} per paycheck.`,
    tip: 'Always grab the full match: it’s an instant 100% return. Money in a 401(k) also lowers your taxable pay now.',
  };
}

function budgetChoice(id: 'lean' | 'balanced' | 'lavish', rate: number, label: string, hint: string, bot: number): Choice {
  const per = (s: GameState): number => round25(netPaycheck(s) * rate);
  return {
    label: (s) => `${label} (auto-save ${money(per(s))}/paycheck)`,
    hint,
    bot: (s) => (id === 'lean' && s.housing.kind === 'parents' ? 4 : bot),
    req: (s) => (id === 'lean' && per(s) * 2.17 > netMonthly(s) - essentials(s) - 250 ? 'Your bills don’t leave room for that' : true),
    do: (s) => {
      s.autoSave = per(s);
      setFlag(s, 'budget2');
      setFlag(s, 'lifestyle', id);
      unlock(s, 'budget');
      unlock(s, 'pay-yourself-first');
      if (id === 'lavish') {
        s.subs.push({ id: 'streaming', label: 'Streaming bundle (4 services)', cost: 48 });
        s.subs.push({ id: 'mealkit', label: 'Meal-kit subscription', cost: 160 });
        achieve(s, 'budgeter');
      } else achieve(s, 'budgeter');
    },
    result: (s) =>
      id === 'lavish'
        ? `Treat-yourself mode: four streaming services, a meal kit, brunch on Sundays. You’re saving ${money(per(s))} a paycheck. It feels amazing. That’s the problem.`
        : `Auto-save is set: ${money(per(s))} moves to savings every payday, before you can miss it.`,
    tip: 'Lifestyle creep: every raise quietly becomes the new normal. Decide where a raise goes before your spending does.',
  };
}

export const PHASE2_SCENES: Scene[] = [
  // ================= THE TIME SKIP =================
  {
    id: 'p2-skip',
    title: (s) => skipLabel(s),
    art: (s) => (s.path === 'college' ? 'stage' : (s.job?.art ?? 'office')),
    kind: 'story',
    steps: {
      start: {
        text: (s) => `${s.phase2?.story ?? ''}\n\nYour new job: ${s.job?.title} at ${s.job?.place}.\n${yr(s.job?.wage ?? 0)} (${money(s.job?.wage ?? 0, true)}/hr), with health insurance and a 4% 401(k) match.`,
        choices: [{ label: 'What happened to my money?', next: 'money' }],
      },
      money: {
        text: (s) => `${s.phase2?.years === 3.5 ? 'Three and a half years' : 'Three years'} of your habits, in a few lines:\n\n• ${(s.phase2?.recap ?? []).join('\n• ')}\n\nCredit score: ${SC(s)}.`,
        choices: [{ label: 'And how did they set my pay?', next: 'pay' }],
      },
      pay: {
        text: (s) => {
          const p = s.phase2!;
          const up = p.next ? `\n\nSecond chance: ${p.levelUp}. That job pays ${yr(p.next.wage)}.` : '\n\nYou hit your year-one milestone, so you start a rung higher.';
          return `What set your pay: ${payWhy(s)}.\n\nYear one’s report card: ${p.y1.grade} (“${p.y1.title}”).${up}`;
        },
        choices: [{ label: 'Let’s go', result: 'Big paycheck, big decisions. First: where do you live now?' }],
      },
    },
  },
  {
    id: 'p2-move',
    title: 'Where do you live now?',
    art: 'apartment',
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          `${s.housing.kind === 'dorm' ? 'Graduation means moving out of student housing.' : 'New job, new options.'} Landlords want your monthly income to be 3× the rent. Yours: ${money(grossMonthly(s))}/mo before taxes, about ${money(netMonthly(s))} take-home.`,
        speaker: 'landlord',
        choices: PLACES.map(placeChoice),
      },
    },
  },
  {
    id: 'p2-benefits',
    title: 'Benefits, round two',
    art: 'office',
    kind: 'task',
    steps: {
      start: {
        text: (s) =>
          `HR again, but these benefits are real. Health plan: ${money(s.job?.premium ?? 0)}/paycheck, dental ${money(s.job?.dentalPremium ?? 0)}.${s.health === 'parents' ? '\n\nYou’re 22, so you can stay on your parents’ plan until 26.' : ''}`,
        speaker: 'hr',
        choices: [
          {
            label: 'Enroll in the company health and dental plans',
            hint: '✓ Your own coverage · ✗ Smaller paychecks',
            bot: 2,
            do: (s) => {
              s.health = 'employer';
              s.dental = true;
            },
            next: 'retire',
          },
          {
            label: 'Stay on my parents’ plan',
            hint: '✓ Free for now · ✗ Ends at 26',
            hide: (s) => s.health !== 'parents',
            bot: 1,
            next: 'retire',
          },
          {
            label: 'Skip health insurance',
            hint: '✓ Bigger paychecks · ✗ One ER visit could cost thousands',
            hide: (s) => s.health === 'parents',
            bot: -2,
            do: (s) => {
              s.health = 'none';
            },
            next: 'retire',
          },
        ],
      },
      retire: {
        text: (s) => `401(k): you put in a share of each paycheck, and ${s.job?.place} matches up to ${Math.round((s.job?.match ?? 0) * 100)}%. That match is free money, but only if you put yours in.`,
        speaker: 'hr',
        choices: [
          retireChoice(0.04, 'Put in 4% (the full match)', '✓ Doubles your money instantly · ✓ Lowers your taxes', 3),
          retireChoice(0.1, 'Put in 10%', '✓ Future you retires early · ✗ Less cash now for a car or house', 1),
          retireChoice(0, 'Put in 0%', '✓ Biggest paychecks · ✗ Turns down the match', -2),
        ],
      },
    },
  },
  {
    id: 'p2-401k',
    title: 'Your 401(k)',
    art: 'office',
    kind: 'task',
    steps: {
      start: {
        text: (s) => `You put in ${Math.round(s.retirePct * 100)}% now. ${s.job?.place} matches up to ${Math.round((s.job?.match ?? 0) * 100)}%. Your balance: ${money(s.retire)}.`,
        speaker: 'hr',
        choices: [
          retireChoice(0.04, 'Change to 4% (the full match)', '✓ Free money · ✓ Lowers your taxes', 3),
          retireChoice(0.1, 'Change to 10%', '✓ Serious retirement savings · ✗ Less cash now', 1),
          retireChoice(0, 'Stop contributing', '✓ Bigger paychecks · ✗ Turns down the match', -2),
          { label: 'Leave it', bot: 0 },
        ],
      },
    },
  },
  // ================= A BIGGER PAYCHECK =================
  {
    id: 'p2-budget',
    title: 'The grown-up budget',
    art: (s) => s.housing.art,
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const net = netMonthly(s);
          const ess = essentials(s);
          return `Take-home: about ${money(net)}/month (${money(netPaycheck(s))} a paycheck).\nRent, bills, food and getting around: about ${money(ess)}.\nLeft over: ${money(net - ess)}.\n\nThat “left over” is where lifestyle creep lives.`;
        },
        choices: [
          budgetChoice('balanced', 0.2, '50/30/20: save 20%', '✓ Real progress · ✓ Still a life', 3),
          budgetChoice('lean', 0.3, 'Live like a student: save 30%', '✓ Down payment, fast · ✗ Ramen energy', 2),
          budgetChoice('lavish', 0.05, 'You earned it: nicer everything', '✓ Feels great · ✗ The raise vanishes', -3),
        ],
      },
    },
  },
  {
    id: 'p2-report',
    title: 'Your credit report',
    art: 'bank',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          if (s.credit.firstWeek === null) return 'You pull your reports from all three bureaus. They’re… empty. No accounts, no history, no score. Lenders call it “credit invisible,” and they charge invisible people more.';
          const c = s.card;
          const util = c && c.limit ? `${Math.round((c.balance / c.limit) * 100)}% of your card limit used` : 'no card';
          const base = `Score: ${SC(s)}.\n${s.credit.onTime} on-time payments · ${s.credit.late} late · ${util}.`;
          return s.flags.creditError
            ? `${base}\n\nOne line is wrong: COLLECTIONS, Lakeside Urgent Care, $640. You’ve never been to Lakeside. That one line is costing you about 90 points.`
            : `${base}\n\nEvery account is yours, every number checks out.`;
        },
        speaker: 'banker',
        choices: [
          {
            label: 'Dispute the error with the bureaus (free)',
            hint: '✓ Free · ✓ They have 30 days to fix it',
            hide: (s) => !s.flags.creditError,
            bot: 3,
            do: (s) => {
              setFlag(s, 'reportChecked');
              s.flags.disputeAt = s.week + 3;
              unlock(s, 'credit-report');
            },
            result: 'Dispute filed online, with a note that you’ve never been to Lakeside. The bureaus have 30 days to check.',
            tip: 'Check your reports at least once a year (free at annualcreditreport.com). Dispute mistakes in writing with each bureau. It costs nothing.',
          },
          {
            label: 'Pay it so it goes away ($640)',
            pay: 640,
            hint: '✗ It isn’t yours · ✗ A paid collection still shows up',
            hide: (s) => !s.flags.creditError,
            bot: -1,
            do: (s) => {
              setFlag(s, 'reportChecked');
              unlock(s, 'credit-report');
            },
            result: 'They happily take your $640. The collection stays on your report, now marked “paid.” Your score barely moves.',
          },
          {
            label: 'Ignore it. Probably fine.',
            hide: (s) => !s.flags.creditError,
            bot: -3,
            do: (s) => {
              setFlag(s, 'reportChecked');
              unlock(s, 'credit-report');
            },
            result: 'You close the tab. The $640 collection that isn’t yours stays right where it is.',
          },
          {
            label: 'Freeze your credit while you’re at it (free)',
            hint: '✓ Blocks identity thieves · ✓ Unfreeze anytime',
            hide: (s) => !!s.flags.creditError,
            bot: 2,
            do: (s) => {
              setFlag(s, 'reportChecked');
              setFlag(s, 'creditFrozen');
              unlock(s, 'credit-report');
              unlock(s, 'credit-freeze');
            },
            result: (s) => (s.credit.firstWeek === null ? 'Frozen, and empty. Next step: a starter card or credit-builder loan, paid in full every month.' : 'Frozen. Nobody can open an account in your name now. (You’ll unfreeze it for a minute when you apply for a loan.)'),
            tip: 'Freezing your credit is free at all three bureaus and is the best protection against identity theft.',
          },
          {
            label: 'Looks good',
            hide: (s) => !!s.flags.creditError,
            bot: 1,
            do: (s) => {
              setFlag(s, 'reportChecked');
              unlock(s, 'credit-report');
            },
            result: 'Report checked. You know exactly what a lender will see.',
          },
        ],
      },
    },
  },
  {
    id: 'p2-grace',
    title: 'Grace period’s over',
    art: 'bank',
    kind: 'story',
    steps: {
      start: {
        text: (s) => {
          const l = s.loans.find((x) => x.kind === 'student' && x.deferred);
          const b = l?.balance ?? 0;
          return `Six months since graduation: your student loan servicer emails. Balance: ${money(b)} at ${pct(l?.apr ?? 0.0639, 2)}.\n\nStandard (10 years): ${money(amortized(b, l?.apr ?? 0.0639, 120))}/mo.\nExtended (20 years): ${money(amortized(b, l?.apr ?? 0.0639, 240))}/mo.`;
        },
        speaker: 'banker',
        choices: [
          {
            label: 'Standard 10-year plan',
            hint: (s) => {
              const l = s.loans.find((x) => x.kind === 'student' && x.deferred);
              return `✓ Paid off at 32 · ✓ ${money(totalInterest(l?.balance ?? 0, l?.apr ?? 0.0639, 120))} total interest`;
            },
            bot: 2,
            do: (s) => {
              for (const l of s.loans) if (l.kind === 'student' && l.deferred) Object.assign(l, { deferred: false, payment: amortized(l.balance, l.apr, 120) });
              unlock(s, 'grace-period');
            },
            result: 'Autopay set (and that knocks 0.25% off your rate at most servicers). Payments start this month.',
          },
          {
            label: 'Extended 20-year plan',
            hint: (s) => {
              const l = s.loans.find((x) => x.kind === 'student' && x.deferred);
              return `✓ Lower payment now · ✗ ${money(totalInterest(l?.balance ?? 0, l?.apr ?? 0.0639, 240))} total interest`;
            },
            bot: -1,
            do: (s) => {
              for (const l of s.loans) if (l.kind === 'student' && l.deferred) Object.assign(l, { deferred: false, payment: amortized(l.balance, l.apr, 240) });
              unlock(s, 'grace-period');
            },
            result: 'Smaller payments, for twice as long. You’ll be making these at 42.',
          },
        ],
      },
    },
  },
  // ================= SECOND CHANCE =================
  {
    id: 'p2-career',
    title: 'Your second shot',
    art: (s) => s.job?.art ?? 'office',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const p = s.phase2!;
          return `${p.levelUp}.\nPays ${yr(p.next?.wage ?? 0)}, up from ${yr(s.job?.wage ?? 0)}.\n\nCareer progress: ${s.stats.xp}/${p.need.xp}\nBoss rating: ${s.stats.rep}/${p.need.rep}\n\n${levelReady(s) ? 'You’re ready. Go get it.' : 'Not quite ready. Study (evenings and weekends) and keep showing up.'}`;
        },
        speaker: 'boss',
        choices: [
          {
            label: (s) => (s.path === 'trade' ? 'Book the exam (next Saturday)' : s.path === 'home' ? 'Book the exam (next weekday)' : s.path === 'college' && s.phase2?.tier === 'low' ? 'Enroll in the classes ($1,900, added to your loans)' : 'Schedule the interview (next weekday)'),
            req: (s) => (s.week >= 53 ? 'No time left' : levelReady(s) ? true : 'Not ready yet'),
            bot: 3,
            do: (s) => {
              setFlag(s, 'p2Booked');
              if (s.path === 'college' && s.phase2?.tier === 'low') {
                const l = s.loans.find((x) => x.kind === 'student');
                if (l) l.balance = round2(l.balance + 1900);
                else s.loans.push({ name: 'Student loans', balance: 1900, apr: 0.0639, payment: amortized(1900, 0.0639, 120), kind: 'student', deferred: true });
              }
              if (s.path === 'trade') schedule(s, { week: s.week + 1, slot: 'saturday', kind: 'p2shot', label: 'Journeyman exam' });
              else schedule(s, { week: s.week + 1, slot: 'weekday', kind: 'p2shot', label: s.path === 'home' ? 'Certification exam' : s.path === 'college' && s.phase2?.tier === 'low' ? 'Final exams' : 'Interview' });
            },
            result: 'It’s on the calendar. Sleep the night before. Seriously.',
          },
          {
            label: 'Ask for pointers',
            bot: 0,
            do: (s) => xp(s, 3),
            result: 'You get a few good tips and a list of what trips people up. +3 progress.',
          },
        ],
      },
    },
  },
  {
    id: 'appt-p2shot',
    title: (s) => (s.path === 'trade' ? 'Journeyman exam' : s.path === 'home' ? 'Certification exam' : 'The big moment'),
    art: (s) => (s.path === 'trade' || s.path === 'home' ? 'library' : 'office'),
    kind: 'appt',
    steps: {
      start: {
        text: (s) =>
          s.path === 'trade'
            ? 'Four hours, 80 questions, and a code book with your sticky notes in it. The proctor’s watch ticks very loudly.'
            : s.path === 'home'
              ? '90 questions on drug names, dosages and pharmacy law. You know your sig codes cold.'
              : s.path === 'college' && s.phase2?.tier === 'low'
                ? 'Two finals in one week, after a full day of work each. Coffee is a food group now.'
                : '“So, tell us why you’re ready for more.” Three managers and one very serious notepad.',
        speaker: (s: GameState) => (s.path === 'trade' || s.path === 'home' ? 'advisor' : 'boss'),
        choices: [
          {
            label: 'Bring everything you’ve got',
            bot: 3,
            do: (s, d) => {
              d.pass = levelReady(s) && s.stats.energy >= 15 ? 1 : 0;
              if (d.pass) {
                levelUp(s);
                if (s.path === 'college') achieve(s, 'graduate');
                rep(s, 4);
              } else s.flags.p2Booked = false;
            },
            result: (s, d) =>
              d.pass
                ? `YOU DID IT. ${s.job?.title}: ${yr(s.job?.wage ?? 0)}, starting next paycheck. Rae sends a voice memo that’s just screaming.`
                : 'Too tired to bring your best. Not this time, but you can book another try.',
          },
          {
            label: 'Wing it',
            bot: -3,
            do: (s) => {
              s.flags.p2Booked = false;
              energy(s, 3);
            },
            result: 'It goes about how winging it usually goes. You can try again.',
          },
        ],
      },
    },
  },
  // ================= NICE WHEELS =================
  {
    id: 'p2-car',
    title: 'Dealer row',
    art: 'carlot',
    speaker: 'dealer',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const sc = creditScore(s);
          const mine = carTier(sc);
          const table = CAR_TIERS.map((t) => `${t.label}: new ${pct(t.newApr)} · used ${pct(t.usedApr)}${t === mine ? '  ◀ you' : ''}`).join('\n');
          const trade = s.car ? `\n\nTrade-in offer for your ${s.car.name}: ${money(tradeIn(s))}${s.car.condition < 60 ? ` (knocked down: it’s in ${s.car.condition < 35 ? 'rough' : 'worn'} shape)` : ''}${oldCarLoan(s) > 0 ? ` (you still owe ${money(oldCarLoan(s))} on it)` : ''}.` : '';
          return `Your credit: ${SC(s)}. Today’s car loan rates:\n${table}${trade}`;
        },
        choices: [
          ...CARS.map(
            (c, i): Choice => ({
              label: `${c.name}: ${money(c.price)}`,
              hint: (s) => `${c.hint} · Insurance ~${money(quote(s, c))}/mo`,
              req: (s) => (carLoanOk(s, c) || cashOnHand(s) >= c.price * 1.07 ? true : 'Lender says no: too much debt for your income'),
              // Sensible: a certified used car if it fits the budget (but someone at home saving for a house rides the bus).
              bot: (s) => (c.id === 'suv' ? -3 : carFits(s, c) ? (c.id === 'cpo' ? (s.housing.kind === 'parents' && !s.car ? 1 : 2) : 1) : -2),
              do: (_s, d) => {
                d.car = i;
                d.price = c.price;
                d.addons = 0;
              },
              next: 'deal',
            }),
          ),
          {
            label: (s) => (s.car ? `Keep the ${s.car.name}` : `Skip it: keep ${s.transport === 'bike' ? 'biking' : 'riding the bus'}`),
            hint: (s) => (s.car ? (s.car.condition < 35 ? `✓ No payment · ✗ Condition ${Math.round(s.car.condition)}%: repairs are coming` : `✓ No payment · ✓ Cheap insurance · Condition ${Math.round(s.car.condition)}%`) : '✓ No payment, no insurance · ✗ On someone else’s schedule'),
            bot: (s) => (s.car ? (s.car.condition >= 35 ? 3 : -1) : 1.5),
            do: (s) => {
              setFlag(s, 'carDecided', 'keep');
              unlock(s, 'transport-cost');
            },
            result: (s) => (s.car ? 'You pat the dashboard. “Just a few more years, buddy.” No payment is the best payment.' : 'You walk out past a lot of very disappointed salespeople. Your savings account cheers.'),
            tip: 'The cheapest car is usually the one you already own, as long as repairs cost less than a car payment.',
          },
        ],
      },
      deal: {
        text: (s, d) => {
          const c = CARS[Number(d.car)];
          return `“Great choice!” The ${c.short}: ${money(c.price)}, plus ${pct(TAX, 0)} sales tax and ${money(FEES)} in title and doc fees. Insurance quote: ${money(quote(s, c))}/mo${insuranceFactor(s) < 1 ? ' (good-credit discount)' : insuranceFactor(s) > 1 ? ' (higher: your credit score)' : ''}${s.car ? ` (you pay ${money(s.car.insurance)} now)` : ''}.\n\nDealers expect you to negotiate.`;
        },
        choices: [
          {
            label: 'Haggle on the price',
            hint: '✓ Could save a lot · Mini-game',
            bot: 3,
            do: (s, d) => minigame(s, 'haggle', { item: 'car', price: Number(d.price), car: Number(d.car), addons: 0, back: 'p2-car', backStep: 'addons' }),
          },
          { label: 'Pay the sticker price', hint: '✗ Leaves money on the table', bot: -2, next: 'addons' },
          { label: 'Walk away', bot: 0, next: 'start' },
        ],
      },
      addons: {
        text: (s, d) =>
          `The finance manager slides a glossy menu across the desk:\n\n• Extended warranty: $2,495\n• Paint & fabric protection: $899\n• GAP insurance: $795\n\n“All three for just ${money(Math.round(amortized(ADDONS, carApr(creditScore(s), CARS[Number(d.car)].isNew), 72)))} more a month!”`,
        choices: [
          {
            label: 'No thanks, to all of it',
            hint: '✓ Saves $4,189 · GAP is cheaper through your insurer (~$8/mo)',
            bot: 3,
            do: (s, d) => {
              d.addons = 0;
              unlock(s, 'dealer-addons');
            },
            next: 'finance',
          },
          {
            label: 'Sure, roll it into the loan',
            hint: '✗ +$4,189, plus interest on it',
            bot: -3,
            do: (s, d) => {
              d.addons = ADDONS;
              unlock(s, 'dealer-addons');
            },
            next: 'finance',
          },
        ],
      },
      finance: {
        text: (s, d) => {
          const c = CARS[Number(d.car)];
          const tin = tradeIn(s);
          const owe = oldCarLoan(s);
          return `Price: ${money(Number(d.price))}${Number(d.price) < c.price ? ` (down from ${money(c.price)})` : ''}\nTax and fees: ${money(Math.round(Number(d.price) * TAX + FEES))}${Number(d.addons) ? `\nAdd-ons: ${money(Number(d.addons))}` : ''}${tin ? `\nTrade-in: −${money(tin)}` : ''}${owe ? `\nOld loan payoff: +${money(owe)}` : ''}\nOut the door: ${money(outTheDoor(s, d))}\n\nYour rate: ${pct(carApr(creditScore(s), c.isNew))} APR, with a credit score of ${SC(s)}.`;
        },
        choices: [
          financeChoice(0.2, 48, '20% down, 48 months', (s, d) => (deal(s, d, 0.2, 48).payment <= grossMonthly(s) * 0.12 ? 3 : 1)),
          financeChoice(0.1, 60, '10% down, 60 months', 1),
          financeChoice(0, 72, '$0 down, 72 months', -3, ' · ✗ You’ll owe more than it’s worth for years'),
          financeChoice(1, 0, 'Pay cash', (s, d) => (cashOnHand(s) - deal(s, d, 1, 0).otd >= efundGoal(s) ? 2 : -1)),
          { label: 'Walk away', bot: 0, next: 'start', result: 'You thank them and leave. They call twice before you reach your car.' },
        ],
      },
    },
  },
  // ================= HOME BASE =================
  {
    id: 'p2-rentbuy',
    title: 'Rent vs. buy',
    art: 'bank',
    speaker: 'banker',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const t = mortgageTier(creditScore(s)) ?? MORTGAGE_TIERS[2];
          const c = homeCost(225000, 0.05, t);
          const rent = housingNow(s);
          return `${rent ? `Renting: ${money(rent)} now, ${money(Math.round(rent * 1.06))} if you renew. No repairs, easy to leave, no down payment.` : 'Living at home: $400 a month, and a lot of saving.'}\n\nBuying a $225,000 starter home with 5% down at about ${pct(t.apr, 2)}: roughly ${money(c.total)}/mo all-in (mortgage, tax, insurance, PMI), plus ~$120/mo upkeep. Up front: ${money(c.down + c.closing)} (down payment + ~3% closing costs).\n\nA lender checks two things: your credit score and your debt-to-income.`;
        },
        choices: [
          {
            label: 'Get pre-approved (hard credit check)',
            hint: '✓ Know your real budget · ✗ Small, temporary score dip',
            bot: 2,
            do: (s, d) => {
              const sc = creditScore(s);
              const t = mortgageTier(sc);
              s.credit.inquiries.push(s.week);
              unlock(s, 'dti');
              unlock(s, 'preapproval');
              if (!t) {
                d.why = sc === null ? 'none' : 'score';
                return;
              }
              const max = maxPrice(s, t, minDown(t));
              if (max < 150000) {
                d.why = 'dti';
                return;
              }
              if (s.phase2) s.phase2.approval = { week: s.week, score: sc, apr: t.apr, maxPrice: max, fha: !!t.fha };
              d.max20 = maxPrice(s, t, 0.2);
            },
            next: (_s, d) => (d.why ? 'denied' : 'approved'),
          },
          {
            label: (s) => (s.housing.kind === 'parents' ? 'Stay home another year' : 'Just renew the lease (+6%)'),
            bot: 1,
            do: (s) => renew(s),
            result: renewResult,
            tip: RENT_TIP,
          },
        ],
      },
      approved: {
        text: (s, d) => {
          const a = approval(s)!;
          const t = mortgageTier(a.score)!;
          const table = MORTGAGE_TIERS.map((x) => `${x.label}: ${pct(x.apr, 2)}${x === t ? '  ◀ you' : ''}`).join('\n');
          return `PRE-APPROVED. Up to ${money(a.maxPrice)} with ${pct(minDown(t))} down, or ${money(Number(d.max20))} with 20% down.\n\nRates by credit score:\n${table}\nUnder 580: no loan.\n\nCash you have: ${money(cashOnHand(s))}. Lenders (and sane people) want three months of your NEW costs still in the bank after closing.`;
        },
        choices: [
          {
            label: 'Start house hunting',
            hint: (s) => (anyFit(s) ? '✓ You can afford a real cushion after closing' : '✗ Closing would wipe out your cushion'),
            bot: (s) => (anyFit(s) ? 3 : -2),
            do: (s) => setFlag(s, 'hunting'),
            result: 'Open houses this weekend. Your realtor, Gloria, has already sent 14 texts.',
          },
          {
            label: (s) => (s.housing.kind === 'parents' ? 'Stay home and keep saving' : 'Renew the lease instead (+6%)'),
            bot: (s) => (anyFit(s) ? 1 : 2),
            do: (s) => renew(s),
            result: renewResult,
            tip: RENT_TIP,
          },
        ],
      },
      denied: {
        text: (s, d) =>
          d.why === 'none'
            ? 'The lender can’t pull a score: no credit history at all. “Come back after a year of on-time payments on a card or loan.”'
            : d.why === 'score'
              ? `Your score (${SC(s)}) is under 580, the floor for even an FHA loan. Late payments and high card balances are the usual suspects.`
              : `Your debts already eat too much of your income (debt-to-income ${pct(dti(s, 0), 0)} before any house). Lenders cap the total at ${pct(DTI_MAX, 0)}.`,
        choices: [
          {
            label: (s) => (s.housing.kind === 'parents' ? 'Stay home and fix it first' : 'Renew the lease and fix it first (+6%)'),
            bot: 2,
            do: (s) => renew(s),
            result: renewResult,
            tip: 'Fix credit with on-time payments and low card balances (under 30% of the limit, under 10% is better). Pay down debt to lower your debt-to-income.',
          },
        ],
      },
    },
  },
  {
    id: 'p2-house',
    title: 'Open houses',
    art: 'street',
    kind: 'task',
    steps: {
      start: {
        text: (s) => {
          const a = approval(s);
          return `Gloria, your realtor, hands you five listings. Pre-approved up to ${money(a?.maxPrice ?? 0)} (more with a bigger down payment). Cash on hand: ${money(cashOnHand(s))}.`;
        },
        choices: [
          ...LISTINGS.map(
            (L, i): Choice => ({
              label: `${L.name}: ${money(L.price)}`,
              hint: (s) => {
                const t = tierOf(s);
                if (!t) return L.hint;
                const c = homeCost(L.price, 0.1, t, L.ins, L.hoa);
                return `${L.hint} · ~${money(c.total)}/mo at 10% down`;
              },
              req: (s) => {
                const t = tierOf(s);
                if (!t) return 'No pre-approval';
                if (L.price > maxPrice(s, t, 0.2)) return 'Over your pre-approval';
                const c = homeCost(L.price, minDown(t), t, L.ins, L.hoa);
                return cashOnHand(s) >= c.cash ? true : `Need ${money(c.cash)} cash`;
              },
              bot: (s) => (L.id === 'dream' ? -5 : fits(s, L) ? ({ starter: 3, fixer: 2.4, condo: 2.2, far: 2 } as Record<string, number>)[L.id] : -2),
              do: (_s, d) => {
                d.home = i;
                d.price = L.price;
                d.credit = 0;
                d.waived = 0;
              },
              next: 'offer',
            }),
          ),
          { label: 'Keep looking (next weekend)', bot: 0, result: 'Nothing felt like home. Gloria says “the right one is out there,” which she says to everyone.' },
          {
            label: (s) => (s.housing.kind === 'parents' ? 'Stop looking: stay home and save' : 'Stop looking: renew the lease (+6%)'),
            bot: 1,
            do: (s) => renew(s),
            result: renewResult,
            tip: RENT_TIP,
          },
        ],
      },
      offer: {
        text: (_s, d) => `${listingOf(d).name}. Listed at ${money(listingOf(d).price)}. It’s been on the market three weeks. What do you offer?`,
        choices: [
          { label: (_s, d) => `Full asking price: ${money(listingOf(d).price)}`, bot: 1, next: 'inspect', result: 'Accepted within the hour. Gloria sends a GIF of confetti.' },
          {
            label: (_s, d) => `3% under asking: ${money(Math.round((listingOf(d).price * 0.97) / 1000) * 1000)}`,
            bot: 2,
            do: (s, d) => {
              const L = listingOf(d);
              d.price = chance(s, 0.55) ? Math.round((L.price * 0.97) / 1000) * 1000 : Math.round((L.price * 0.99) / 1000) * 1000;
            },
            next: 'inspect',
            result: (_s, d) => (priceOf(d) < listingOf(d).price * 0.98 ? `Accepted! ${money(priceOf(d))}.` : `They counter at ${money(priceOf(d))}. You take it.`),
          },
        ],
      },
      inspect: {
        text: 'Under contract! Next up: a home inspection. The inspector checks the roof, furnace, plumbing, wiring and foundation.',
        speaker: 'mechanic',
        choices: [
          {
            label: `Hire an inspector: ${money(INSPECTION)}`,
            pay: INSPECTION,
            hint: '✓ Find problems while you can still negotiate',
            bot: 3,
            do: (s) => unlock(s, 'home-inspection'),
            next: 'found',
          },
          {
            label: 'Waive the inspection to make the deal “stronger”',
            hint: '✓ Save $450 · ✗ Whatever’s wrong is your problem now',
            bot: -3,
            do: (s, d) => {
              d.waived = 1;
              unlock(s, 'home-inspection');
            },
            next: 'down',
          },
        ],
      },
      found: {
        text: (_s, d) => `The inspector’s report: ${listingOf(d).issue}`,
        speaker: 'mechanic',
        choices: [
          {
            label: (_s, d) => `Ask the seller for a ${money(listingOf(d).cost)} repair credit`,
            hide: (_s, d) => listingOf(d).cost === 0,
            bot: (_s, d) => (listingOf(d).id === 'dream' ? 1 : 3),
            do: (_s, d) => {
              d.credit = Math.round((listingOf(d).cost * 0.8) / 100) * 100;
            },
            next: 'down',
            result: (_s, d) => `The seller agrees to ${money(Number(d.credit))} off at closing. That inspection just paid for itself many times over.`,
          },
          {
            label: 'Walk away from this one',
            hide: (_s, d) => listingOf(d).cost === 0,
            bot: (_s, d) => (listingOf(d).id === 'dream' ? 2 : -1),
            next: 'start',
            result: 'You back out (the inspection contingency lets you). $450 well spent.',
          },
          {
            label: (_s, d) => (listingOf(d).cost === 0 ? 'Great. On to the paperwork' : 'Buy it as-is'),
            bot: (_s, d) => (listingOf(d).cost === 0 ? 3 : -1),
            next: 'down',
          },
        ],
      },
      down: {
        text: (s, d) => {
          const t = tierOf(s)!;
          return `Price: ${money(priceOf(d))}${Number(d.credit) ? ` (seller credit ${money(Number(d.credit))})` : ''}. Your rate: ${pct(t.apr, 2)}${t.fha ? ' (FHA)' : ''}. Under 20% down you pay mortgage insurance (PMI).\n\nHow much do you put down? Cash on hand: ${money(cashOnHand(s))}.`;
        },
        choices: [0, 0.1, 0.2].map(
          (k): Choice => ({
            label: (s, d) => {
              const p = k || minDown(tierOf(s)!);
              const c = costAt(s, d, p);
              return `${pct(p)} down (${money(c.down)}): ${money(c.total)}/mo all-in`;
            },
            hint: (s, d) => {
              const p = k || minDown(tierOf(s)!);
              const c = costAt(s, d, p);
              const cash = c.down + c.closing - Number(d.credit ?? 0);
              return `Due at closing ${money(cash)} · PMI ${money(c.pmi)}/mo · Leaves ${money(cashOnHand(s) - cash)}`;
            },
            req: (s, d) => {
              const p = k || minDown(tierOf(s)!);
              const c = costAt(s, d, p);
              const cash = c.down + c.closing - Number(d.credit ?? 0);
              if (cash > cashOnHand(s)) return `Need ${money(cash)} cash`;
              if (dti(s, c.total) > DTI_MAX) return `Debt-to-income ${pct(dti(s, c.total), 0)}: over ${pct(DTI_MAX, 0)}`;
              return true;
            },
            bot: (s, d) => {
              const p = k || minDown(tierOf(s)!);
              const c = costAt(s, d, p);
              const left = cashOnHand(s) - (c.down + c.closing - Number(d.credit ?? 0));
              // Keep a full cushion for the new costs, plus the repair the inspector warned you about.
              return left >= cushionAfter(s, c.total + listingOf(d).util) + listingOf(d).cost * 0.5 ? 3 + p * 10 : -1 + p * 10;
            },
            do: (s, d) => {
              d.pct = k || minDown(tierOf(s)!);
            },
            next: 'close',
          }),
        ),
      },
      close: {
        text: (s, d) => {
          const t = tierOf(s)!;
          const c = costAt(s, d, Number(d.pct));
          const credit = Number(d.credit ?? 0);
          return `Closing day. You sign your name 64 times.\n\nCashier’s check: ${money(c.down + c.closing - credit)} (down ${money(c.down)} + closing costs ${money(c.closing)}${credit ? ` − seller credit ${money(credit)}` : ''}).\n\nMortgage: ${money(c.loan)} at ${pct(t.apr, 2)} for 30 years.\nMonthly: ${money(c.pi)} principal & interest + ${money(c.tax)} property tax + ${money(c.insurance)} insurance${c.hoa ? ` + ${money(c.hoa)} HOA` : ''}${c.pmi ? ` + ${money(c.pmi)} PMI` : ''} = ${money(c.total)}.`;
        },
        speaker: 'banker',
        choices: [
          {
            label: 'Sign and get the keys',
            bot: 3,
            do: (s, d) => closeHome(s, d),
            result: (s) => `The keys are yours. So is the leaky faucet. Your mortgage replaces rent: ${money((s.loans.find((l) => l.kind === 'mortgage')?.payment ?? 0) + s.housing.rent)}/month, every month, for 30 years.`,
            tip: 'Closing costs (about 2–5%) are on top of the down payment. Keep 1% of the home’s price a year for repairs: houses always need something.',
          },
          { label: 'Get cold feet: back out', bot: -1, next: 'start', result: 'You back out before signing. Gloria takes a very deep breath.' },
        ],
      },
    },
  },
  {
    id: 'p2-surprise',
    title: (_s, d) => SURPRISE[String(d.kind)]?.title ?? 'Homeowner surprise',
    art: (s) => s.housing.art,
    kind: 'event',
    steps: {
      start: {
        text: (s, d) => `${SURPRISE[String(d.kind)]?.text ?? 'Something in the house broke: '}${money(num(s, 'surpriseCost'))}.\n\nNo landlord to call. You ARE the landlord.`,
        speaker: 'mechanic',
        choices: [
          {
            label: (s) => `Pay it from savings: ${money(num(s, 'surpriseCost'))}`,
            pay: (s) => num(s, 'surpriseCost'),
            methods: ['savings', 'checking'],
            hint: '✓ This is what the emergency fund is for',
            bot: 3,
            result: 'Fixed. Painful, but you had the cushion. Homeowner level-up.',
          },
          {
            label: (s) => `Put it on the credit card: ${money(num(s, 'surpriseCost'))}`,
            pay: (s) => num(s, 'surpriseCost'),
            methods: ['card'],
            hint: '✗ 25%+ interest if you can’t pay it off',
            bot: -2,
            result: 'Fixed, on plastic. The interest clock is ticking.',
          },
          {
            label: 'Finance the repair (12 months, 9.9% APR)',
            hint: (s) => `✗ ${money(Math.round(amortized(num(s, 'surpriseCost'), 0.099, 12)))}/mo for a year`,
            bot: 0,
            do: (s) => {
              const c = num(s, 'surpriseCost');
              s.loans.push({ name: 'Repair loan', balance: c, apr: 0.099, payment: amortized(c, 0.099, 12), kind: 'personal' });
              openCredit(s);
            },
            result: 'The contractor’s financing company approves you in four minutes. That should worry you a little.',
          },
        ],
      },
    },
  },
  // ================= LIFESTYLE CREEP =================
  {
    id: 'p2-ev-phone',
    title: 'Shiny new phone',
    art: 'street',
    kind: 'event',
    steps: {
      start: {
        text: 'The new Pear 17 Pro just dropped: $1,199. Your carrier offers it for “$0 down, just $33/month!” for 36 months. Your current phone works fine. It’s just… not new.',
        choices: [
          { label: 'Keep your phone. It works.', hint: '✓ $0', bot: 3, result: 'Your phone gets an update and feels new-ish. Close enough.' },
          {
            label: 'Take the $33/month deal',
            hint: '✗ $1,188 over three years · ✗ Locked into your carrier',
            bot: -2,
            do: (s) => {
              s.subs.push({ id: 'phonepay', label: 'Phone installment plan', cost: 33 });
              energy(s, 4);
              unlock(s, 'lifestyle-creep');
            },
            result: 'New phone! It does everything your old phone did, but shinier. $33 a month, for three years.',
          },
          { label: 'Buy it outright: $1,199', pay: 1199, hint: '✓ No payments · ✗ $1,199', bot: -1, do: (s) => energy(s, 4), result: 'New phone. Your bank app shows a slightly smaller number now.' },
        ],
      },
    },
  },
  {
    id: 'p2-ev-trip',
    title: 'Cancún?',
    art: 'beach',
    kind: 'event',
    steps: {
      start: {
        text: 'The group chat is planning a week in Cancún. All-in: $1,650. “You make real money now, you HAVE to come.”',
        speaker: 'rae',
        choices: [
          { label: 'Book it!', pay: 1650, hint: '✓ Unforgettable · ✗ $1,650', bot: -2, do: (s) => energy(s, 25), result: 'Sun, tacos, a sunburn shaped like a tank top. Worth it? Your savings account has thoughts.' },
          { label: 'Pitch a lake cabin weekend instead ($280 each)', pay: 280, hint: '✓ Still a trip · ✓ 1/6 of the price', bot: 2, do: (s) => energy(s, 18), result: 'Six of you, one cabin, a lake, and a very competitive game of cards. Honestly? Better.' },
          { label: 'Sit this one out', bot: 1, do: (s) => energy(s, -3), result: 'You watch the stories from your couch. FOMO is real, and so is your down-payment fund.' },
        ],
      },
    },
  },
  {
    id: 'p2-ev-wedding',
    title: 'Wedding party',
    art: 'party',
    kind: 'event',
    steps: {
      start: {
        text: 'Your friend Jordan is getting married and wants you in the wedding party. The suit or dress, the shower, the bachelor(ette) weekend, a gift: about $900.',
        choices: [
          { label: 'Do all of it: $900', pay: 900, hint: '✓ Best friend energy · ✗ $900', bot: 0, do: (s) => energy(s, 12), result: 'You give a toast that makes Jordan’s grandma cry (the good kind).' },
          { label: 'Be there, skip the trip: $350', pay: 350, hint: '✓ Still there for the big day', bot: 2, do: (s) => energy(s, 8), result: 'You skip Vegas, nail the toast, and dance until they turn the lights on.' },
        ],
      },
    },
  },
  {
    id: 'p2-ev-bonus',
    title: 'Bonus!',
    art: 'office',
    kind: 'event',
    steps: {
      start: {
        text: 'Your boss hands you an envelope: a $2,000 performance bonus. After taxes (bonuses get withheld at 22% federal, plus everything else), it’s $1,400.',
        speaker: 'boss',
        choices: [
          {
            label: 'Straight to savings',
            bot: 3,
            do: (s) => {
              s.stats.savings = round2(s.stats.savings + 1400);
            },
            result: 'Into savings it goes. Future-you does a little dance.',
          },
          {
            label: 'Put it in a Roth IRA',
            hint: '✓ Grows tax-free for 40 years · ✗ Not for a down payment',
            bot: (s) => (s.flags.homeDecided ? 3 : 1),
            do: (s) => {
              s.retire = round2(s.retire + 1400);
              unlock(s, 'roth-ira');
              achieve(s, 'investor');
            },
            result: 'Invested. At 7% a year, that $1,400 could be about $21,000 when you retire.',
          },
          {
            label: 'Treat yourself: new couch and a big TV',
            bot: -2,
            do: (s) => {
              s.stats.cash = round2(s.stats.cash + 1400);
              s.stats.cash = round2(s.stats.cash - 1350);
              energy(s, 8);
              unlock(s, 'lifestyle-creep');
            },
            result: 'The couch is incredible. The TV is enormous. The bonus is gone.',
          },
        ],
      },
    },
  },
  {
    id: 'p2-ev-roth',
    title: 'Invest the extra?',
    art: 'bank',
    kind: 'event',
    steps: {
      start: {
        text: 'A coworker swears by her Roth IRA: you put in money you already paid tax on, and it grows tax-free forever. You have some savings sitting there.',
        speaker: 'banker',
        choices: [
          {
            label: 'Move $1,500 from savings into a Roth IRA',
            pay: 1500,
            methods: ['savings'],
            hint: '✓ Compound growth · ✗ Not for a down payment or an emergency',
            bot: (s) => (s.stats.savings - 1500 >= efundGoal(s) && s.flags.homeDecided ? 2 : 0),
            do: (s) => {
              s.retire = round2(s.retire + 1500);
              unlock(s, 'roth-ira');
              achieve(s, 'investor');
            },
            result: 'Invested in a low-cost index fund. Boring. Perfect.',
          },
          { label: 'Not yet: emergency fund and down payment first', bot: 1, result: 'Fair. Liquid savings first, then long-term investing.' },
        ],
      },
    },
  },
  {
    id: 'p2-ev-coin',
    title: 'A sure thing',
    art: 'party',
    kind: 'event',
    steps: {
      start: {
        text: 'Your friend Devon, three drinks in: “Put a grand in $ZOOM coin. It’s going to the moon. Trust me.” Devon also said that about his food truck.',
        choices: [
          {
            label: 'Put in $1,000',
            pay: 1000,
            methods: ['checking', 'savings'],
            hint: '✗ It’s gambling with extra steps',
            bot: -3,
            do: (s, d) => {
              d.win = chance(s, 0.3) ? 1 : 0;
              s.stats.cash = round2(s.stats.cash + (d.win ? 1600 : 150));
            },
            result: (_s, d) => (d.win ? 'It actually went up! You cash out at $1,600 and never tell Devon he was right.' : '$ZOOM went to the moon and then into the sun. You get $150 back.'),
            tip: 'If you can’t explain how an investment makes money, it’s a bet. Index funds are boring on purpose.',
          },
          { label: 'Pass', bot: 2, result: 'Devon calls you “a boomer.” Your money stays put.' },
        ],
      },
    },
  },
];

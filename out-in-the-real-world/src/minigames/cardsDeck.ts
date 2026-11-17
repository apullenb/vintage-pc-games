// Flashcard Cram deck: short card labels and one-line clues for every Adulting Handbook entry,
// plus path-flavored study cards (college intro classes, electrical trade, warehouse, pharmacy tech).
import { HANDBOOK } from '../content/handbook.ts';
import type { GameState, PathId } from '../engine/types.ts';
import { shuffle } from './cardsFx.ts';
import { COURSE_BY_ID } from '../content/courses.ts';

export interface Card {
  id: string;
  label: string; // what's printed on the falling card (short)
  clue: string; // the meaning shown in the clue banner (one short line)
  kind: 'handbook' | 'path';
  fresh?: boolean; // a handbook term the player hasn't unlocked yet
}

// Handbook id -> [card label, short clue]. Clues never contain the label word itself.
export const HANDBOOK_CARDS: Record<string, [string, string]> = {
  paystub: ['Pay stub', 'Shows what you earned, what taxes took, and your take-home pay.'],
  w4: ['W-4', 'Form that tells your employer how much tax to hold back.'],
  'direct-deposit': ['Direct deposit', 'Your paycheck lands straight in your bank account.'],
  'health-insurance': ['Health insurance', 'Pay monthly so one big medical bill can’t wipe you out.'],
  premium: ['Premium', 'What you pay for insurance every month, used or not.'],
  copay: ['Copay', 'Flat fee for a doctor visit or prescription, like $35.'],
  deductible: ['Deductible', 'What you pay yourself before insurance starts paying.'],
  '401k': ['401(k) match', 'Retirement account where work adds free money if you put some in.'],
  overdraft: ['Overdraft', 'Spending more than your checking account holds. Often a $35 fee.'],
  'credit-union': ['Credit union', 'A nonprofit bank owned by its members. Usually lower fees.'],
  hysa: ['High-yield savings', 'Savings account paying about 4% instead of 0.1%.'],
  license: ['Driver’s license', 'Needs a birth certificate, Social Security card, and proof of address.'],
  fafsa: ['FAFSA', 'Free federal aid form for grants, work-study, and loans. File early!'],
  'student-loan': ['Student loans', 'Borrowed school money you repay with interest. Borrow only what you need.'],
  'deferred-interest': ['Deferred interest', '“0% for 6 months” deal that charges ALL the interest if you don’t finish paying.'],
  'car-insurance': ['Car insurance', 'Required by law to drive. Young drivers pay the most.'],
  'insurance-points': ['License points', 'Marks from moving tickets that raise your rates for years.'],
  'car-loan': ['Car loan APR', 'Yearly interest on a car loan. Compare the TOTAL you’ll pay.'],
  inspection: ['Inspection', 'Paying a mechanic about $100 to check a used car before you buy.'],
  'transport-cost': ['True car cost', 'Price + insurance + gas + repairs + parking, every month.'],
  maintenance: ['Maintenance', 'Oil changes, tire rotations, brakes: cheap now, pricey if skipped.'],
  'preventive-care': ['Preventive care', 'Checkups that catch problems early. Often free with insurance.'],
  'security-deposit': ['Security deposit', 'Money paid when you sign a lease, returned at move-out minus damage.'],
  lease: ['Lease', 'Legal rental contract: how long, penalties, who fixes what.'],
  'roommate-agreement': ['Roommate agreement', 'Written plan for rent splits, chores, guests, and quiet hours.'],
  'renters-insurance': ['Renters insurance', 'Covers YOUR stuff from theft or fire, about $15 a month.'],
  budget: ['50/30/20 budget', 'Needs 50%, wants 30%, savings and debt payoff 20%.'],
  'irregular-costs': ['Sinking fund', 'Saving a little each month for yearly costs like gifts or car tags.'],
  'pay-yourself-first': ['Pay yourself first', 'Move money to savings on payday, before you can spend it.'],
  'emergency-fund': ['Emergency fund', 'Savings for surprises. Start with $500 to $1,000.'],
  'credit-score': ['Credit score', 'A 300 to 850 number that tells lenders how risky you are.'],
  apr: ['Card APR', 'Credit card interest, often 20–30% a year. Pay in full to skip it.'],
  utilization: ['Utilization', 'How much of your credit limit you use. Keep it under 30%.'],
  'secured-card': ['Secured card', 'Starter credit card backed by your own deposit.'],
  'minimum-payment': ['Minimum payment', 'Smallest payment that avoids a late fee. The rest grows interest.'],
  'late-payment': ['Late payment', 'Brings a fee and a mark on your credit report for up to 7 years.'],
  collections: ['Collections', 'An unpaid bill sold to an agency. Your score drops a lot.'],
  repossession: ['Repossession', 'The lender takes your car after missed payments.'],
  taxes: ['Filing taxes', 'Reporting last year’s income to the IRS every spring.'],
  refund: ['Tax refund', 'Extra withholding sent back to you. Your money, not a bonus.'],
  pests: ['Pest repairs', 'Usually the landlord\u2019s job to fix. Ask in writing.'],
  scams: ['Scam', 'A fake text about a prize or package that wants your info.'],
  'jury-duty': ['Jury duty', 'Civic duty to serve at a trial. Ignoring the summons risks a fine.'],
  raise: ['Raise', 'More pay for the same job. Ask with proof of what you’ve done.'],
  unemployment: ['Unemployment', 'Benefits that may help after you lose your job.'],
  'payment-plan': ['Payment plan', 'Paying a hospital bill over time, often with zero interest.'],
  'charity-care': ['Charity care', 'Nonprofit hospital help that can cut a bill in half or more.'],
  burnout: ['Burnout', 'Working nonstop until you get sick and start making mistakes.'],
  'compound-interest': ['Compound interest', 'Earning interest on your interest. Starting early wins.'],
  'invest-in-yourself': ['Invest in yourself', 'Classes and certifications that raise your earning power.'],
  'payday-loan': ['Payday loan', '$15 per $100 for two weeks: almost 400% APR.'],
  bnpl: ['Pay in 4', 'Splitting a purchase into installments. Watch for late fees.'],
  'at-fault-claim': ['At-fault claim', 'You caused the crash, so your premium may rise for 3–5 years.'],
  registration: ['Registration', 'Renewing your car’s tags every year or two.'],
  'itemized-bill': ['Itemized bill', 'A line-by-line medical bill. Check it for mistakes.'],
  'pay-errors': ['Payroll error', 'Shorted on your check? Keep your own hours log and report it.'],
  'credit-freeze': ['Credit freeze', 'A free lock that stops anyone opening credit in your name.'],
  'hours-cut': ['Hours cut', 'Business slows, your shifts shrink, and so does your check.'],
  'self-employment-tax': ['1099 gig income', 'Nothing is withheld. Set aside about 25% for taxes.'],
  'irs-notice': ['IRS notice', 'A real one comes by mail first, never by text.'],
  'deposit-return': ['Deposit return', 'Move-in and move-out photos help you get this back.'],
  'extended-warranty': ['Extended warranty', 'Pricey repair coverage full of exclusions.'],
  'insurance-shopping': ['Insurance quotes', 'Same coverage can cost hundreds more elsewhere. Compare yearly.'],
  'cancel-trap': ['Cancel trap', 'A gym that makes quitting hard. Read the rules first.'],
  'job-interview': ['STAR answer', 'Problem, what you did, and how it turned out.'],
  'two-weeks-notice': ['Two weeks’ notice', 'Telling your boss you’re leaving, so you keep the reference.'],
  'job-scam': ['Job scam', 'A “job” that asks YOU to pay a fee to start.'],
  'networking': ['Referral', 'A friend vouches for you so your resume gets read.'],
  'tuition-help': ['Tuition assistance', 'Your employer pays for classes, often with strings attached.'],
};

const P = (id: string, label: string, clue: string): Card => ({ id, label, clue, kind: 'path' });

// Path study cards: what each path's "Study" activity is actually cramming.
export const PATH_CARDS: Record<PathId, Card[]> = {
  college: [
    P('c-syllabus', 'Syllabus', 'The class roadmap: due dates, grading, and the rules.'),
    P('c-office', 'Office hours', 'Free weekly time when the professor answers your questions.'),
    P('c-prereq', 'Prerequisite', 'A class you must pass before you can take another one.'),
    P('c-oppcost', 'Opportunity cost', 'Econ 101: what you give up when you choose something else.'),
    P('c-hypo', 'Hypothesis', 'A testable guess you check with an experiment.'),
    P('c-gpa', 'GPA', 'Your grade point average, on a 0.0 to 4.0 scale.'),
  ],
  trade: [
    P('t-ohm', 'Ohms', 'Unit of resistance: how much a material fights current.'),
    P('t-volt', 'Volts', 'Electrical “pressure” that pushes current. US outlets: 120.'),
    P('t-amp', 'Amps', 'Unit of current: how much electricity is flowing.'),
    P('t-gfci', 'GFCI', 'Outlet that cuts power fast if current leaks. Required near water.'),
    P('t-ground', 'Ground wire', 'Bare or green wire giving stray current a safe path to earth.'),
    P('t-law', 'Ohm’s law', 'Volts = amps × ohms (V = I × R).'),
  ],
  work: [
    P('w-lift', 'Safe lifting', 'Bend your knees, keep the load close, don’t twist.'),
    P('w-fork', 'Forklift cert', 'Training you need before you drive a forklift.'),
    P('w-pallet', 'Pallet', 'Flat base that goods are stacked on for moving.'),
    P('w-fifo', 'FIFO', 'First in, first out: ship the oldest stock first.'),
    P('w-ppe', 'PPE', 'Safety gear: vest, steel-toe boots, gloves, glasses.'),
    P('w-sku', 'SKU', 'A product’s stock code for tracking inventory.'),
  ],
  home: [
    P('h-generic', 'Generic drug', 'Same active ingredient as the brand name, usually way cheaper.'),
    P('h-rx', 'Rx', 'Short for prescription: a doctor’s order for a medicine.'),
    P('h-hipaa', 'HIPAA', 'Federal law that keeps patients’ health info private.'),
    P('h-otc', 'OTC', 'Over the counter: medicine you can buy without a prescription.'),
    P('h-refill', 'Refill', 'More of the same prescription without a new doctor visit.'),
    P('h-ptcb', 'PTCB exam', 'National exam to become a certified pharmacy technician.'),
  ],
};

export function handbookCard(id: string, fresh = false): Card | null {
  const e = HANDBOOK_CARDS[id];
  return e ? { id, label: e[0], clue: e[1], kind: 'handbook', fresh } : null;
}

export interface Round {
  answer: Card;
  options: Card[]; // 3 cards, one of them the answer, in lane order
}

export const ROUNDS = 14;

// Build a fresh set of rounds: mostly terms the player has unlocked, a few brand-new ones, and path cards.
// An online course's own cards (term, clue), used instead of the path's study cards.
export function courseCards(id: string): Card[] | null {
  const c = COURSE_BY_ID[id];
  return c ? c.cards.map(([label, clue], i) => P(`k-${c.id}-${i}`, label, clue)) : null;
}

export function buildRounds(s: GameState, r: () => number, n = ROUNDS, course = ''): Round[] {
  const known = new Set(s.handbook);
  const unlocked = shuffle(HANDBOOK.filter((e) => known.has(e.id)).map((e) => handbookCard(e.id)!), r);
  const fresh = shuffle(HANDBOOK.filter((e) => !known.has(e.id) && HANDBOOK_CARDS[e.id]).map((e) => handbookCard(e.id, true)!), r);
  const path = shuffle([...(courseCards(course) ?? PATH_CARDS[s.path] ?? PATH_CARDS.home)], r);

  const nPath = Math.min(path.length, courseCards(course) ? 6 : 4);
  const nFresh = Math.min(fresh.length, unlocked.length >= 6 ? 3 : n - nPath - unlocked.length);
  const answers: Card[] = [...path.slice(0, nPath), ...fresh.slice(0, Math.max(0, nFresh))];
  for (const c of unlocked) if (answers.length < n) answers.push(c);
  for (const c of fresh.slice(Math.max(0, nFresh))) if (answers.length < n) answers.push(c);
  shuffle(answers, r);

  // Decoys come from the same family (path cards vs handbook terms) so they're plausible.
  const allHb = [...unlocked, ...fresh];
  const rounds: Round[] = [];
  for (const a of answers.slice(0, n)) {
    const family = a.kind === 'path' ? path : allHb;
    const pool = shuffle(family.filter((c) => c.id !== a.id), r);
    const decoys = pool.slice(0, 2);
    while (decoys.length < 2) decoys.push(allHb.find((c) => c.id !== a.id && !decoys.includes(c))!);
    rounds.push({ answer: a, options: shuffle([a, ...decoys], r) });
  }
  return rounds;
}

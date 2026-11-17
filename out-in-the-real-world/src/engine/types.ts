// Core game types. The engine is pure: state in, state out, no DOM.

export type PathId = 'home' | 'college' | 'trade' | 'work';
export type SlotId = 'weekday' | 'evening' | 'saturday' | 'sunday';
export const SLOTS: readonly SlotId[] = ['weekday', 'evening', 'saturday', 'sunday'];

export type PayMethod = 'checking' | 'savings' | 'card';
export type FoodPlan = 'ramen' | 'cook' | 'takeout' | 'parents' | 'mealplan';
export type HealthPlan = 'none' | 'employer' | 'parents' | 'school';
export type BankKind = 'teen' | 'bigbank' | 'creditunion' | 'online';
export type Transport = 'borrow' | 'bus' | 'bike' | 'car' | 'carpool';

export type ArtId =
  | 'bedroom'
  | 'dorm'
  | 'apartment'
  | 'dmv'
  | 'bank'
  | 'dentist'
  | 'clinic'
  | 'grocery'
  | 'warehouse'
  | 'jobsite'
  | 'campus'
  | 'carlot'
  | 'street'
  | 'office'
  | 'library'
  | 'party'
  | 'road'
  | 'night'
  | 'beach'
  | 'stage';

export type NpcId =
  | 'mom'
  | 'rae'
  | 'clerk'
  | 'banker'
  | 'boss'
  | 'dentist'
  | 'doctor'
  | 'landlord'
  | 'roommate'
  | 'dealer'
  | 'cop'
  | 'advisor'
  | 'mechanic'
  | 'grandma'
  | 'taxpro'
  | 'hr';

export interface Card {
  name: string;
  kind: 'secured' | 'store' | 'student' | 'rewards';
  limit: number;
  apr: number; // e.g. 0.27
  balance: number;
  deposit: number; // secured deposit held by bank
  openedWeek: number;
}

export interface Loan {
  name: string;
  balance: number;
  apr: number;
  payment: number; // monthly
  kind: 'car' | 'student' | 'personal' | 'mortgage';
  deferred?: boolean; // student loans: no payments while in school
}

export interface Car {
  name: string;
  condition: number; // 0..100
  value: number;
  insurance: number; // monthly
}

export interface Job {
  title: string;
  place: string;
  wage: number; // hourly
  hours: number; // weekly base hours
  healthOffered: boolean;
  premium: number; // per paycheck if enrolled
  dentalPremium: number; // per paycheck if enrolled
  match: number; // 401k match fraction (0 = none)
  art: ArtId;
}

export interface Housing {
  kind: 'parents' | 'dorm' | 'shared' | 'studio' | 'room' | 'owned';
  name: string;
  rent: number; // monthly
  utilities: number; // monthly
  missed: number; // consecutive missed housing payments
  roommate: boolean;
  art: ArtId;
}

export interface Appointment {
  week: number;
  slot: SlotId;
  kind: string; // runs scene appt-<kind>
  label: string;
}

export interface Stats {
  cash: number; // checking
  savings: number;
  energy: number; // 0..100
  rep: number; // boss / teacher opinion 0..100
  xp: number; // career progress 0..100+
}

export interface CreditFile {
  firstWeek: number | null; // week the first account opened
  onTime: number;
  late: number;
  inquiries: number[]; // weeks
  collections: number;
}

// One line in the week journal.
export interface LogLine {
  text: string;
  tone?: 'good' | 'bad' | 'info' | 'tip';
}

export interface Deltas {
  cash?: number;
  savings?: number;
  card?: number;
  debt?: number;
  energy?: number;
  rep?: number;
  xp?: number;
  retire?: number;
}

// A result panel shown after a choice.
export interface ResultView {
  text: string;
  tip?: string;
  deltas: Deltas;
}

// Things the player must deal with, one at a time.
export type Step =
  | { t: 'slot'; slot: SlotId }
  | { t: 'food' }
  | { t: 'upkeep' }
  | { t: 'events' }
  | { t: 'payday' }
  | { t: 'bills' }
  | { t: 'summary' }
  | { t: 'chapterEnd' }
  | { t: 'scene'; id: string; step: string; data?: Record<string, number | string>; result?: ResultView; resultNext?: string | null }
  | { t: 'paycheck'; stub: PayStub; offer: string | null; resolved?: ResultView }
  | { t: 'billsDue'; bills: Bill[] }
  | { t: 'minigame'; id: string; data?: Record<string, number | string>; result?: ResultView }
  | { t: 'gameOver'; reason: string }
  | { t: 'ending' };

export interface PayStub {
  hours: number;
  wage: number;
  gross: number;
  federal: number;
  fica: number;
  state: number;
  health: number;
  dental: number;
  retire: number;
  match: number;
  net: number;
  autoSaved: number;
  overdraftCleared: number;
}

export interface Bill {
  id: string;
  label: string;
  amount: number;
  kind: 'housing' | 'phone' | 'utilities' | 'insurance' | 'carloan' | 'card' | 'sub' | 'tuition' | 'fee' | 'gym' | 'other';
  minimum?: number; // card statements
  paid?: number;
  status?: 'paid' | 'min' | 'skipped';
}

export interface Plan {
  slots: Record<SlotId, string>; // activity ids
  food: FoodPlan;
}

export interface GameState {
  v: 1;
  seed: number;
  name: string;
  look: Look;
  path: PathId;
  week: number; // 1-based
  chapter: number; // 0-based
  stats: Stats;
  retire: number; // 401k balance
  card: Card | null;
  loans: Loan[];
  car: Car | null;
  transport: Transport;
  job: Job | null;
  housing: Housing;
  health: HealthPlan;
  dental: boolean;
  retirePct: number; // 0 or 0.04
  bank: BankKind;
  overdraftOptIn: boolean;
  credit: CreditFile;
  appointments: Appointment[];
  subs: { id: string; label: string; cost: number }[];
  flags: Record<string, number | string | boolean>;
  tasksDone: Record<string, boolean>;
  tasksFailed: Record<string, boolean>;
  plan: Plan;
  queue: Step[];
  log: LogLine[]; // this week's journal
  hoursThisPeriod: number; // hours worked since last paycheck
  autoSave: number; // per paycheck
  chapterStars: number[];
  handbook: string[]; // unlocked handbook entries
  achievements: string[];
  history: { week: number; net: number; energy: number; score: number | null }[];
  checkpoint: string | null; // JSON of state at chapter start
  weekSnap: Record<string, number> | null; // stats when the week started
  over: boolean;
  won: boolean;
  school?: School; // college path only (older saves may not have it)
  phase2?: Phase2; // the next phase of life, after year one (older saves may not have it)
}

// ---------- college ----------
export type MajorId = 'nursing' | 'cs' | 'business' | 'education' | 'undeclared';

// One class this semester and everything graded in it so far.
export interface CourseRec {
  id: string;
  held: number; // class weeks so far
  missed: number; // weeks skipped
  hw: number[]; // assignment scores 0..100
  mid: number | null;
  fin: number | null;
  bonus: number; // office-hours points
}

export interface TermGrade {
  id: string;
  pct: number;
  letter: string;
  credits: number;
}

export interface TermRec {
  name: string;
  gpa: number;
  grades: TermGrade[];
  attempted: number; // credits taken
  earned: number; // credits passed (D- or better)
}

export interface School {
  major: MajorId;
  term: number; // 0 = fall, 1 = spring
  courses: CourseRec[];
  done: TermRec[]; // finished semesters
  prepAt: number; // study sessions count at the last assignment
  examAt: number; // study sessions count at the last exam
  extraPrep: number; // office hours / cramming since the last exam
  skipsSeen: number; // the engine's skip counter, last time we looked
  probation: boolean;
  failed: number; // classes failed (each one is retaken)
  lateDeclare?: boolean; // declared after starting undeclared
  aiCaught?: number;
  extraCredits?: number; // summer / online classes beyond the regular load
  honors?: boolean; // invited to the honors program
  internship?: string; // summer internship lined up

}

// ---------- the next phase (after year one) ----------
export type Tier = 'top' | 'mid' | 'low';

// Year one, frozen at the moment you moved on: the report card you earned.
export interface YearOne {
  total: number;
  grade: string;
  title: string;
  lines: { label: string; value: string; points: number; max: number }[];
  savings: number;
  netWorth: number;
  credit: number | null;
  careerDone: boolean;
  stars: number;
}

export interface Home {
  name: string;
  kind: 'condo' | 'house';
  price: number; // what you paid
  value: number; // what it's worth now
  down: number; // down payment
  tax: number; // monthly property tax
  insurance: number; // monthly homeowners insurance
  hoa: number; // monthly HOA dues
  pmi: number; // monthly mortgage insurance (0 at 20% down)
  boughtWeek: number;
}

export interface Phase2 {
  years: number; // how long the time skip was
  tier: Tier; // top = hit your year-one milestone
  story: string; // what happened in those years
  recap: string[]; // what those years did to your money
  job: string; // the job you started the phase with
  next: { title: string; wage: number; place?: string } | null; // the second-chance level-up, if any
  levelUp: string | null; // that goal, in words
  need: { xp: number; rep: number }; // to take your shot at it
  y1: YearOne;
  nw0: number; // net worth on day one of the new phase
  efundGoal: number; // three months of costs
  home?: Home;
  approval?: { week: number; score: number | null; apr: number; maxPrice: number; fha: boolean };
}

export interface Look {
  skin: number;
  hair: number;
  hairStyle: number;
  shirt: number;
}

// Outcome of an action mini-game. score: 0 (disaster) .. 1 (perfect).
export interface MiniResult {
  score: number;
  played: boolean; // false = skipped (auto-played)
  stats?: Record<string, number>; // game-specific numbers (tips, items broken, tickets...)
}

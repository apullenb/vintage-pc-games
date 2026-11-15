// Small mutating helpers used by the engine and by content scripts.
import type { Appointment, Deltas, GameState, LogLine, PayMethod, SlotId, Step } from './types.ts';

// ---------- random (seeded, stored in state) ----------
export function rand(s: GameState): number {
  let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const chance = (s: GameState, p: number): boolean => rand(s) < p;
export function pick<T>(s: GameState, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length) % arr.length];
}
export function between(s: GameState, lo: number, hi: number): number {
  return Math.round(lo + rand(s) * (hi - lo));
}

// ---------- numbers ----------
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const round2 = (v: number): number => Math.round(v * 100) / 100;
export function money(v: number, cents = false): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const str = cents ? a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(a).toLocaleString('en-US');
  return `${neg ? '-' : ''}$${str}`;
}

// ---------- stats ----------
export function energy(s: GameState, n: number): void {
  s.stats.energy = clamp(Math.round(s.stats.energy + n), 0, 100);
}
export function rep(s: GameState, n: number): void {
  s.stats.rep = clamp(Math.round(s.stats.rep + n), 0, 100);
}
export function xp(s: GameState, n: number): void {
  s.stats.xp = clamp(Math.round(s.stats.xp + n), 0, 200);
}
export function earn(s: GameState, n: number): void {
  s.stats.cash = round2(s.stats.cash + n);
}

export function log(s: GameState, text: string, tone?: LogLine['tone']): void {
  s.log.push({ text, tone });
}

export function flag(s: GameState, k: string): number | string | boolean | undefined {
  return s.flags[k];
}
export function num(s: GameState, k: string): number {
  const v = s.flags[k];
  return typeof v === 'number' ? v : v ? 1 : 0;
}
export function setFlag(s: GameState, k: string, v: number | string | boolean = true): void {
  s.flags[k] = v;
}
export function inc(s: GameState, k: string, by = 1): number {
  const v = num(s, k) + by;
  s.flags[k] = v;
  return v;
}

export function unlock(s: GameState, entry: string): void {
  if (!s.handbook.includes(entry)) s.handbook.push(entry);
}
export function achieve(s: GameState, id: string): void {
  if (!s.achievements.includes(id)) {
    s.achievements.push(id);
    inc(s, `_newAch`);
  }
}

// Push a scene to the front of the queue (it runs next).
export function scene(s: GameState, id: string, data?: Record<string, number | string>): void {
  s.queue.unshift({ t: 'scene', id, step: 'start', data });
}
// Queue a scene after everything currently queued for this week (before the summary).
export function sceneLater(s: GameState, id: string, data?: Record<string, number | string>): void {
  const i = s.queue.findIndex((q) => q.t === 'summary');
  const st: Step = { t: 'scene', id, step: 'start', data };
  if (i < 0) s.queue.push(st);
  else s.queue.splice(i, 0, st);
}

export function schedule(s: GameState, a: Appointment): void {
  s.appointments.push(a);
  s.appointments.sort((x, y) => x.week - y.week);
}
export function appointmentAt(s: GameState, week: number, slot: SlotId): Appointment | undefined {
  return s.appointments.find((a) => a.week === week && a.slot === slot);
}

// ---------- money ----------
export const OVERDRAFT_FEE = 35;

export function cardRoom(s: GameState): number {
  return s.card ? Math.max(0, s.card.limit - s.card.balance) : 0;
}

export interface PayCheck {
  ok: boolean;
  note: string;
}

// Can `amount` be paid with `method`? (UI shows the note.)
export function canPay(s: GameState, amount: number, method: PayMethod): PayCheck {
  if (method === 'checking') {
    if (s.stats.cash >= amount) return { ok: true, note: `Leaves ${money(s.stats.cash - amount)}` };
    if (s.overdraftOptIn) return { ok: true, note: `Overdraft! ${money(OVERDRAFT_FEE)} fee` };
    return { ok: false, note: 'Card would be declined' };
  }
  if (method === 'savings') {
    if (s.stats.savings >= amount) return { ok: true, note: `Leaves ${money(s.stats.savings - amount)} saved` };
    return { ok: false, note: 'Not enough saved' };
  }
  if (!s.card) return { ok: false, note: 'No credit card' };
  if (cardRoom(s) >= amount) {
    const util = (s.card.balance + amount) / s.card.limit;
    return { ok: true, note: `${Math.round(s.card.apr * 100)}% APR · uses ${Math.round(util * 100)}% of limit` };
  }
  return { ok: false, note: 'Over your credit limit' };
}

// Pays if possible; returns false if declined.
export function pay(s: GameState, amount: number, method: PayMethod, label: string): boolean {
  amount = round2(amount);
  if (amount <= 0) return true;
  if (!canPay(s, amount, method).ok) return false;
  if (method === 'checking') {
    s.stats.cash = round2(s.stats.cash - amount);
    if (s.stats.cash < 0) {
      s.stats.cash = round2(s.stats.cash - OVERDRAFT_FEE);
      inc(s, 'overdrafts');
      unlock(s, 'overdraft');
      log(s, `Overdraft fee: ${money(OVERDRAFT_FEE)} for ${label.toLowerCase()}.`, 'bad');
    }
  } else if (method === 'savings') {
    s.stats.savings = round2(s.stats.savings - amount);
  } else if (s.card) {
    s.card.balance = round2(s.card.balance + amount);
    unlock(s, 'apr');
  }
  return true;
}

// Unavoidable costs (fines, fees): checking, then savings, then card, then overdraft.
export function charge(s: GameState, amount: number, label: string): PayMethod | 'overdraft' {
  amount = round2(amount);
  if (amount <= 0) return 'checking';
  if (s.stats.cash >= amount) {
    pay(s, amount, 'checking', label);
    return 'checking';
  }
  if (s.stats.savings >= amount) {
    pay(s, amount, 'savings', label);
    log(s, `${label}: ${money(amount)} came out of savings.`, 'info');
    return 'savings';
  }
  if (s.card && cardRoom(s) >= amount) {
    pay(s, amount, 'card', label);
    log(s, `${label}: ${money(amount)} went on your credit card.`, 'info');
    return 'card';
  }
  s.stats.cash = round2(s.stats.cash - amount - OVERDRAFT_FEE);
  inc(s, 'overdrafts');
  unlock(s, 'overdraft');
  log(s, `${label} overdrew your account (+${money(OVERDRAFT_FEE)} fee).`, 'bad');
  return 'overdraft';
}

export function save(s: GameState, amount: number): number {
  const a = Math.max(0, Math.min(round2(amount), s.stats.cash));
  s.stats.cash = round2(s.stats.cash - a);
  s.stats.savings = round2(s.stats.savings + a);
  return a;
}

export function debt(s: GameState): number {
  let d = s.card ? s.card.balance : 0;
  for (const l of s.loans) d += l.balance;
  if (s.stats.cash < 0) d += -s.stats.cash;
  return round2(d);
}
export function badDebt(s: GameState): number {
  let d = s.card ? s.card.balance : 0;
  for (const l of s.loans) if (l.kind !== 'student') d += l.balance;
  return round2(d);
}
export function netWorth(s: GameState): number {
  const car = s.car ? s.car.value : 0;
  const owed = (s.card ? s.card.balance : 0) + s.loans.reduce((a, l) => a + l.balance, 0);
  return round2(s.stats.cash + s.stats.savings + s.retire + car + (s.card?.deposit ?? 0) - owed);
}

// ---------- credit ----------
export const CREDIT_WAIT = 6; // weeks of history before a score exists

export function creditAge(s: GameState): number {
  return s.credit.firstWeek === null ? 0 : s.week - s.credit.firstWeek;
}

export function creditScore(s: GameState): number | null {
  const c = s.credit;
  if (c.firstWeek === null || creditAge(s) < CREDIT_WAIT) return null;
  let sc = 600;
  sc += Math.min(130, c.onTime * 14);
  sc -= c.late * 55;
  sc += Math.min(50, creditAge(s) * 1.5);
  if (s.card && s.card.limit > 0) {
    const u = s.card.balance / s.card.limit;
    if (u > 0.3) sc -= Math.round((u - 0.3) * 220);
    else if (u <= 0.1) sc += 15;
  }
  const recent = c.inquiries.filter((w) => s.week - w < 26).length;
  sc -= recent * 7;
  if (s.loans.some((l) => l.kind === 'car' && l.balance > 0)) sc += 15;
  sc -= c.collections * 90;
  return clamp(Math.round(sc), 300, 850);
}

export function openCredit(s: GameState): void {
  if (s.credit.firstWeek === null) s.credit.firstWeek = s.week;
  s.credit.inquiries.push(s.week);
  unlock(s, 'credit-score');
}

export function creditLabel(sc: number | null): string {
  if (sc === null) return 'No score yet';
  if (sc >= 740) return 'Excellent';
  if (sc >= 670) return 'Good';
  if (sc >= 580) return 'Fair';
  return 'Poor';
}

// ---------- deltas ----------
export interface Snap {
  cash: number;
  savings: number;
  card: number;
  debt: number;
  energy: number;
  rep: number;
  xp: number;
  retire: number;
}
export function snap(s: GameState): Snap {
  const loans = s.loans.reduce((a, l) => a + l.balance, 0);
  return {
    cash: s.stats.cash,
    savings: s.stats.savings,
    card: s.card?.balance ?? 0,
    debt: loans,
    energy: s.stats.energy,
    rep: s.stats.rep,
    xp: s.stats.xp,
    retire: s.retire,
  };
}
export function diff(a: Snap, b: Snap): Deltas {
  const d: Deltas = {};
  const k: (keyof Snap)[] = ['cash', 'savings', 'card', 'debt', 'energy', 'rep', 'xp', 'retire'];
  for (const key of k) {
    const v = round2(b[key] - a[key]);
    if (Math.abs(v) >= 0.5) d[key] = v;
  }
  return d;
}

// Hours of take-home pay a cost represents (used in hints).
export function hoursOf(s: GameState, amount: number): number {
  const w = s.job ? s.job.wage * 0.8 : 12;
  return Math.max(1, Math.round(amount / w));
}

// Taking a weekday off: unpaid hours and a small hit with the boss (or a missed class).
export function missWork(s: GameState, why: string): void {
  if (s.path === 'college') {
    if (s.flags.enrolled !== false) {
      xp(s, -3);
      inc(s, 'skips');
    }
    return;
  }
  if (!s.job) return;
  s.hoursThisPeriod -= 8;
  rep(s, -2);
  inc(s, 'daysOff');
  log(s, `Missed a day of work (${why.toLowerCase()}): 8 unpaid hours.`, 'info');
}

// Queue an action mini-game to run next.
export function minigame(s: GameState, id: string, data?: Record<string, number | string>): void {
  s.queue.unshift({ t: 'minigame', id, data });
}

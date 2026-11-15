// Scripted players used by tests (and handy for balancing).
import { activitiesFor } from '../content/activities.ts';
import { CAREER_NEED } from '../content/chapters.ts';
import { SCENES } from '../content/scenes.ts';
import { newState } from '../content/paths.ts';
import { canPay, round2 } from './core.ts';
import { begin, choose, defaultPlan, foodOptions, moveMoney, payBills, proceed, sceneChoices, startWeek, taskStatus } from './engine.ts';
import { monthlyBills } from '../content/scenes/tasks.ts';
import type { GameState, PathId, PayMethod, Plan, SlotId } from './types.ts';
import { SLOTS } from './types.ts';

export type Style = 'wise' | 'reckless';

function botScore(s: GameState, id: string, step: string, i: number, data: Record<string, number | string>): number {
  const c = SCENES[id].steps[step].choices[i];
  if (c.bot === undefined) return 0;
  return typeof c.bot === 'function' ? c.bot(s, data) : c.bot;
}

function pickMethod(s: GameState, amount: number, methods: { method: PayMethod; ok: boolean }[], style: Style): PayMethod | undefined {
  const ok = methods.filter((m) => m.ok).map((m) => m.method);
  if (style === 'reckless') return ok.includes('card') ? 'card' : ok[0];
  if (ok.includes('checking') && s.stats.cash - amount >= 150) return 'checking';
  if (ok.includes('savings') && s.stats.savings >= amount) return 'savings';
  if (ok.includes('checking') && s.stats.cash >= amount) return 'checking';
  if (ok.includes('card')) return 'card';
  return ok[0];
}

export function botPlan(s: GameState, style: Style): Plan {
  const plan = defaultPlan(s);
  const used = new Set<string>();
  const taken = new Set<SlotId>(s.appointments.filter((a) => a.week === s.week).map((a) => a.slot));
  const set = (slot: SlotId, id: string): void => {
    plan.slots[slot] = id;
    taken.add(slot);
    used.add(id);
  };
  const free = (slot: SlotId): boolean => !taken.has(slot);

  for (const slot of SLOTS) plan.slots[slot] = slot === 'weekday' ? plan.slots.weekday : 'rest';
  if (!s.job) plan.slots.weekday = 'jobhunt';

  if (style === 'reckless') {
    plan.slots.evening = 'friends';
    plan.slots.saturday = 'friends';
    plan.slots.sunday = 'rest';
    plan.food = foodOptions(s).includes('takeout') ? 'takeout' : plan.food;
    // Reckless players still eventually do some missions, late.
    const left = s.chapter >= 0 ? 6 - ((s.week - 1) % 6) : 6;
    if (left <= 2) taskPass(s, plan, used, free, set);
    return plan;
  }

  taskPass(s, plan, used, free, set);
  const need = CAREER_NEED[s.path];
  for (const slot of ['evening', 'saturday', 'sunday'] as SlotId[]) {
    if (!free(slot)) continue;
    const ids = activitiesFor(s, slot).filter((x) => x.ok === true).map((x) => x.a.id);
    if (slot === 'sunday' && ids.includes('mealprep') && s.stats.energy > 30) {
      set(slot, 'mealprep');
      continue;
    }
    if (s.stats.energy < 45) continue;
    const behind = s.stats.xp < (need.xp + 8) * Math.min(1, s.week / 32);
    if (ids.includes('study') && ((behind && s.stats.energy > 40) || (s.stats.xp < need.xp + 8 && s.stats.energy > 60 && !used.has('study')))) {
      set(slot, 'study');
      continue;
    }
    if (s.stats.energy > 70 && ids.includes('shift') && !used.has('shift')) {
      set(slot, 'shift');
      continue;
    }
    if (s.stats.energy < 55 && ids.includes('friends') && s.stats.savings > 400 && !used.has('friends') && slot !== 'sunday') {
      set(slot, 'friends');
    }
  }
  const foods = foodOptions(s);
  plan.food = plan.slots.sunday === 'mealprep' && foods.includes('cook') ? 'cook' : foods.includes('ramen') ? (s.stats.energy < 40 ? 'takeout' : 'ramen') : foods[0];
  return plan;
}

function taskPass(
  s: GameState,
  _plan: Plan,
  used: Set<string>,
  free: (slot: SlotId) => boolean,
  set: (slot: SlotId, id: string) => void,
): void {
  const open = taskStatus(s).filter((t) => !t.done).map((t) => t.id);
  for (const slot of ['evening', 'saturday', 'sunday', 'weekday'] as SlotId[]) {
    if (!free(slot)) continue;
    const opts = activitiesFor(s, slot).filter((x) => x.ok === true && x.a.task && open.includes(x.a.task) && !used.has(x.a.id));
    // Prefer booking the DMV over walking in.
    opts.sort((a, b) => (a.a.id === 'dmv' ? 1 : 0) - (b.a.id === 'dmv' ? 1 : 0));
    if (slot === 'weekday' && opts.some((o) => o.a.id === 'dmv') && s.appointments.some((a) => a.kind === 'dmv')) continue;
    if (opts.length) set(slot, opts[0].a.id);
  }
  // Card early helps credit later.
  if (s.chapter >= 1 && !s.card && free('evening') && activitiesFor(s, 'evening').some((x) => x.a.id === 'cardapply')) set('evening', 'cardapply');
}

export function botBills(s: GameState, style: Style): Record<string, { amount: number; method: PayMethod } | null> {
  const head = s.queue[0];
  if (!head || head.t !== 'billsDue') return {};
  const out: Record<string, { amount: number; method: PayMethod } | null> = {};
  let cash = s.stats.cash;
  let sav = s.stats.savings;
  const order = [...head.bills].sort((a, b) => (a.kind === 'housing' ? -1 : b.kind === 'housing' ? 1 : 0));
  for (const b of order) {
    let amount = b.amount;
    if (b.kind === 'card') amount = style === 'reckless' ? (b.minimum ?? b.amount) : b.amount;
    if (cash >= amount) {
      out[b.id] = { amount, method: 'checking' };
      cash = round2(cash - amount);
    } else if (sav >= amount) {
      out[b.id] = { amount, method: 'savings' };
      sav = round2(sav - amount);
    } else if (b.kind === 'card' && b.minimum && cash >= b.minimum) {
      out[b.id] = { amount: b.minimum, method: 'checking' };
      cash = round2(cash - b.minimum);
    } else if (cash + sav >= amount && cash > 0) {
      out[b.id] = { amount: cash, method: 'checking' };
      cash = 0;
    } else {
      out[b.id] = null;
    }
  }
  return out;
}

export interface BotRun {
  s: GameState;
  steps: number;
  outcome: 'won' | 'lost';
  reason?: string;
}

export function playGame(path: PathId, seed: number, style: Style, maxSteps = 6000): BotRun {
  let s = begin(newState('Bot', { skin: 0, hair: 0, hairStyle: 0, shirt: 0 }, path, seed));
  let steps = 0;
  const visits = new Map<string, number>();
  while (steps++ < maxSteps) {
    const h = s.queue[0];
    if (!h) {
      if (style === 'wise') {
        const buffer = monthlyBills(s) + 350;
        if (s.stats.cash > buffer) s = moveMoney(s, s.stats.cash - buffer, 'savings');
        if (s.card && s.card.balance > 0 && s.stats.cash > s.card.balance + 200 && s.card.balance / s.card.limit > 0.3) s = moveMoney(s, s.card.balance, 'card');
      }
      s = startWeek(s, botPlan(s, style));
      continue;
    }
    switch (h.t) {
      case 'scene': {
        if (h.result) {
          s = proceed(s);
          break;
        }
        const cs = sceneChoices(s, h).filter((c) => !c.locked);
        if (!cs.length) throw new Error(`stuck in ${h.id}:${h.step}`);
        const data = h.data ?? {};
        cs.sort((a, b) => botScore(s, h.id, h.step, b.i, data) - botScore(s, h.id, h.step, a.i, data));
        const key = `${s.week}:${h.id}:${h.step}`;
        const n = (visits.get(key) ?? 0) + 1;
        visits.set(key, n);
        // On repeat visits (a "go back" loop), walk down the list instead of retrying the same pick.
        const c = n > 2 ? cs[(n - 3) % cs.length] : style === 'wise' ? cs[0] : cs[cs.length - 1];
        const m = c.pay > 0 ? pickMethod(s, c.pay, c.methods, style) : undefined;
        const before = s;
        s = choose(s, c.i, m);
        if (s === before) throw new Error(`choice had no effect in ${h.id}:${h.step}`);
        break;
      }
      case 'billsDue':
        s = payBills(s, botBills(s, style));
        break;
      case 'paycheck':
      case 'summary':
      case 'chapterEnd':
        s = proceed(s);
        break;
      case 'gameOver':
        return { s, steps, outcome: 'lost', reason: h.reason };
      case 'ending':
        return { s, steps, outcome: 'won' };
      default:
        throw new Error(`unexpected step ${h.t}`);
    }
  }
  throw new Error(`bot ran out of steps at week ${s.week}: ${JSON.stringify(s.queue[0]).slice(0, 300)}`);
}

export { canPay };

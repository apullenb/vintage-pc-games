// The interaction panel: planner, scenes, paychecks, bills, summaries, chapter ends.
import { useEffect, useMemo, useState } from 'react';
import { activitiesFor, activityFor } from '../content/activities.ts';
import { CHAPTERS } from '../content/chapters.ts';
import { canPay, creditScore, money, round2, snap } from '../engine/core.ts';
import {
  FOOD,
  appointmentSlots,
  chapterEndWeek,
  chapterReport,
  defaultPlan,
  foodOptions,
  sceneChoices,
  sceneOf,
  txt,
  type ViewChoice,
} from '../engine/engine.ts';
import type { Bill, GameState, PayMethod, PayStub, Plan, SlotId, Step } from '../engine/types.ts';
import { SLOTS } from '../engine/types.ts';
import { sfx } from './audio.ts';
import { DeltaChips, Hint, Icon, Paras, useTypewriter } from './common.tsx';

const SLOT_LABEL: Record<SlotId, string> = { weekday: 'Weekday', evening: 'Evening', saturday: 'Saturday', sunday: 'Sunday' };
const SLOT_SUB: Record<SlotId, string> = { weekday: 'Mon–Fri daytime', evening: 'After work', saturday: 'Weekend', sunday: 'Weekend' };
const METHOD_LABEL: Record<PayMethod, string> = { checking: 'Checking', savings: 'Savings', card: 'Credit card' };

// ================= PLANNER =================
export function Planner({ s, onStart }: { s: GameState; onStart: (p: Plan) => void }) {
  const [plan, setPlan] = useState<Plan>(() => defaultPlan(s));
  const [picking, setPicking] = useState<SlotId | null>(null);
  useEffect(() => {
    setPlan(defaultPlan(s));
    setPicking(null);
  }, [s.week, s.chapter]);
  const appts = appointmentSlots(s);
  const foods = foodOptions(s);
  const payday = s.week % 2 === 0;
  const bills = s.week % 4 === 0;
  const left = chapterEndWeek(s.chapter) - s.week + 1;

  const setSlot = (slot: SlotId, id: string): void => {
    const next = { ...plan, slots: { ...plan.slots, [slot]: id } };
    if (id === 'mealprep' && foods.includes('cook')) next.food = 'cook';
    if (slot === 'sunday' && id !== 'mealprep' && next.food === 'cook') next.food = foods.find((f) => f !== 'cook') ?? 'ramen';
    setPlan(next);
    setPicking(null);
    sfx('select');
  };

  if (picking) {
    const opts = activitiesFor(s, picking).sort((a, b) => (b.a.task ? 1 : 0) - (a.a.task ? 1 : 0));
    const usedTasks = new Set(SLOTS.filter((x) => x !== picking).map((x) => plan.slots[x]).filter((id) => activityFor(id).task));
    return (
      <div className="panel-inner picker">
        <div className="panel-head">
          <h3>
            {SLOT_LABEL[picking]} <small>{SLOT_SUB[picking]}</small>
          </h3>
          <button className="btn ghost small" onClick={() => setPicking(null)}>
            Back
          </button>
        </div>
        <div className="choice-list">
          {opts.map(({ a, ok }) => {
            const dup = usedTasks.has(a.id);
            const locked = ok !== true ? ok : dup ? 'Already planned this week' : null;
            const isTask = !!a.task;
            return (
              <button key={a.id} className={`choice ${plan.slots[picking] === a.id ? 'selected' : ''} ${isTask ? 'task' : ''}`} disabled={!!locked} onClick={() => setSlot(picking, a.id)}>
                <span className="choice-icon">
                  <Icon name={a.icon} />
                </span>
                <span className="choice-main">
                  <span className="choice-label">
                    {isTask && <span className="star">★</span>}
                    {txt(a.name, s)}
                  </span>
                  <span className="choice-desc">{txt(a.desc, s)}</span>
                  <Hint text={locked ? `✗ ${locked}` : a.hint(s, picking)} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="panel-inner planner">
      <div className="panel-head">
        <h3>Plan week {s.week}</h3>
        <div className="tags">
          {payday && <span className="tag good">Payday</span>}
          {bills && <span className="tag warn">Bills due</span>}
          <span className={`tag ${left <= 2 ? 'warn' : ''}`}>{left === 1 ? 'Chapter deadline!' : `${left} weeks left in chapter`}</span>
        </div>
      </div>
      {s.stats.energy < 30 && <div className="warn-box">Your energy is low. Tired people get sick. Schedule some rest.</div>}
      <p className="muted small order-note">Your week happens in order, left to right. Tap a slot to change it.</p>
      <div className="slots">
        {SLOTS.map((slot) => {
          const appt = appts[slot];
          const a = activityFor(plan.slots[slot]);
          return (
            <button key={slot} className={`slot ${appt ? 'locked' : ''} ${a.task && !appt ? 'task' : ''}`} disabled={!!appt} onClick={() => setPicking(slot)}>
              <span className="slot-when">{SLOT_LABEL[slot]}</span>
              <span className="slot-what">
                <Icon name={appt ? 'calendar' : a.icon} />
                {appt ?? txt(a.name, s)}
              </span>
              <span className={`slot-hint ${slot === 'weekday' && !appt && plan.slots.weekday !== 'work' && plan.slots.weekday !== 'class' && (s.job || s.path === 'college') ? 'daycost' : ''}`}>
                {slot === 'weekday' && plan.slots.weekday !== 'work' && plan.slots.weekday !== 'class' && (s.job || s.path === 'college')
                  ? s.path === 'college'
                    ? 'Skips a day of class'
                    : `Costs a day off: −${money(8 * (s.job?.wage ?? 0))} pay`
                  : appt
                    ? slot === 'weekday' && s.path !== 'college' && s.job
                      ? `Scheduled · −${money(8 * s.job.wage)} pay`
                      : 'Scheduled'
                    : a.hint(s, slot).split(' · ')[0]}
              </span>
            </button>
          );
        })}
      </div>
      {foods.length > 1 && (
        <div className="food">
          <span className="food-label">Food this week:</span>
          {foods.map((f) => {
            const needsPrep = f === 'cook' && plan.slots.sunday !== 'mealprep';
            return (
              <button
                key={f}
                className={`pill ${plan.food === f ? 'on' : ''}`}
                disabled={needsPrep}
                title={needsPrep ? 'Schedule "Grocery shop & meal prep" on Sunday first' : FOOD[f].desc}
                onClick={() => {
                  setPlan({ ...plan, food: f });
                  sfx('click');
                }}
              >
                {FOOD[f].name} {FOOD[f].cost ? money(FOOD[f].cost) : 'free'}
                <small>{FOOD[f].energy > 0 ? `+${FOOD[f].energy}` : FOOD[f].energy} energy</small>
              </button>
            );
          })}
        </div>
      )}
      <button
        className="btn primary big"
        onClick={() => {
          sfx('week');
          onStart(plan);
        }}
      >
        Live this week ▶
      </button>
    </div>
  );
}

// ================= SCENE =================
export function ScenePanel({ s, head, fast, onChoose, onContinue }: { s: GameState; head: Extract<Step, { t: 'scene' }>; fast: boolean; onChoose: (i: number, m?: PayMethod) => void; onContinue: () => void }) {
  const sc = sceneOf(head.id);
  const step = sc.steps[head.step];
  const data = head.data ?? {};
  const title = txt(sc.title, s, data);
  const body = head.result ? head.result.text : txt(step.text, s, data);
  const tw = useTypewriter(body, fast);
  const choices = useMemo(() => (head.result ? [] : sceneChoices(s, head)), [s, head]);
  const [paying, setPaying] = useState<number | null>(null);
  useEffect(() => setPaying(null), [head]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!tw.done && (e.key === ' ' || e.key === 'Enter')) {
        tw.finish();
        e.preventDefault();
        return;
      }
      if (head.result && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        onContinue();
        return;
      }
      const n = parseInt(e.key, 10);
      if (!head.result && tw.done && n >= 1 && n <= choices.length) {
        const c = choices[n - 1];
        if (!c.locked) pick(c);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const pick = (c: ViewChoice): void => {
    if (c.locked) return;
    if (c.pay > 0) {
      setPaying(c.i);
      sfx('click');
      return;
    }
    sfx('select');
    onChoose(c.i);
  };

  return (
    <div className="panel-inner scene" onClick={() => !tw.done && tw.finish()}>
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      <div className={`story ${head.result ? 'result' : ''}`}>
        <Paras text={tw.shown} />
        {!tw.done && <span className="caret">▌</span>}
      </div>
      {head.result && tw.done && (
        <>
          <DeltaChips d={head.result.deltas} />
          {head.result.tip && (
            <div className="tip">
              <Icon name="book" /> <span>{head.result.tip}</span>
            </div>
          )}
          <button className="btn primary" onClick={onContinue} autoFocus>
            Continue
          </button>
        </>
      )}
      {!head.result && tw.done && (
        <div className="choice-list">
          {choices.map((c, idx) => (
            <div key={c.i} className="choice-wrap">
              <button className={`choice ${paying === c.i ? 'selected' : ''}`} disabled={!!c.locked} onClick={() => pick(c)}>
                <span className="key">{idx + 1}</span>
                <span className="choice-main">
                  <span className="choice-label">{c.label}</span>
                  <Hint text={c.locked ? `✗ ${c.locked}` : c.hint} />
                </span>
                {c.pay > 0 && <span className="cost">{money(c.pay)}</span>}
              </button>
              {paying === c.i && (
                <div className="pay-methods">
                  <span className="pay-q">Pay {money(c.pay)} with:</span>
                  {c.methods.map((m) => (
                    <button
                      key={m.method}
                      className={`pay ${m.method}`}
                      disabled={!m.ok}
                      onClick={() => {
                        sfx(m.method === 'card' ? 'click' : 'spend');
                        onChoose(c.i, m.method);
                      }}
                    >
                      <strong>{METHOD_LABEL[m.method]}</strong>
                      <small>{m.note}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================= PAYCHECK =================
export function PaycheckPanel({ s, stub, onContinue }: { s: GameState; stub: PayStub; onContinue: () => void }) {
  useEffect(() => sfx('coin'), []);
  const row = (label: string, v: number, cls = '') => (
    <div className={`stub-row ${cls}`}>
      <span>{label}</span>
      <span>{v < 0 ? `−${money(-v, true)}` : money(v, true)}</span>
    </div>
  );
  return (
    <div className="panel-inner paycheck">
      <div className="panel-head">
        <h3>Payday!</h3>
      </div>
      <div className="stub">
        <div className="stub-title">
          {s.job?.place ?? 'Employer'} · Pay stub
        </div>
        {row(`Gross pay (${stub.hours} hrs × ${money(stub.wage, true)})`, stub.gross, 'gross')}
        {stub.federal > 0 && row('Federal income tax', -stub.federal)}
        {stub.fica > 0 && row('Social Security & Medicare (FICA)', -stub.fica)}
        {row('State income tax', -stub.state)}
        {stub.health > 0 && row('Health insurance', -stub.health)}
        {stub.dental > 0 && row('Dental insurance', -stub.dental)}
        {stub.retire > 0 && row('401(k) contribution', -stub.retire)}
        {row('Take-home pay', stub.net, 'net')}
        {stub.match > 0 && <div className="stub-note">+ Employer 401(k) match: {money(stub.match, true)} (free money!)</div>}
        {stub.overdraftCleared > 0 && <div className="stub-note bad">{money(stub.overdraftCleared, true)} went to cover your overdrawn balance.</div>}
        {stub.autoSaved > 0 && <div className="stub-note good">Auto-saved {money(stub.autoSaved)} to savings.</div>}
      </div>
      <p className="muted small">
        You kept {Math.round((stub.net / Math.max(1, stub.gross)) * 100)}% of what you earned. Checking is now {money(s.stats.cash)}.
      </p>
      <button className="btn primary" onClick={onContinue} autoFocus>
        Continue
      </button>
    </div>
  );
}

// ================= BILLS =================
type BillPick = { mode: 'full' | 'min' | 'skip'; method: PayMethod };

function consequence(b: Bill, s: GameState): string {
  switch (b.kind) {
    case 'housing':
      return s.housing.missed >= 1 ? 'LAST WARNING: missing again means losing your home.' : s.housing.kind === 'parents' ? 'Your parents will NOT be happy.' : '$75 late fee. Miss twice = eviction.';
    case 'card':
      return 'Late fee + a late mark on your credit report.';
    case 'carloan':
      return 'Late fee + credit damage. Miss twice = repossession.';
    case 'insurance':
      return 'Your coverage lapses. Driving uninsured is illegal.';
    case 'phone':
      return 'Service gets cut off + late fee.';
    case 'tuition':
      return s.path === 'college' ? 'Miss twice and you get dropped from classes.' : 'You can’t take your exam with a balance.';
    case 'gym':
    case 'sub':
      return 'It gets canceled.';
    default:
      return 'Late fee.';
  }
}

export function BillsPanel({ s, bills, onPay }: { s: GameState; bills: Bill[]; onPay: (p: Record<string, { amount: number; method: PayMethod } | null>) => void }) {
  const init = (): Record<string, BillPick> => {
    const out: Record<string, BillPick> = {};
    let cash = s.stats.cash;
    for (const b of bills) {
      const method: PayMethod = cash >= b.amount ? 'checking' : s.stats.savings >= b.amount ? 'savings' : 'checking';
      out[b.id] = { mode: 'full', method };
      if (method === 'checking') cash -= b.amount;
    }
    return out;
  };
  const [picks, setPicks] = useState<Record<string, BillPick>>(init);
  const amountOf = (b: Bill, p: BillPick): number => (p.mode === 'skip' ? 0 : p.mode === 'min' ? (b.minimum ?? b.amount) : b.amount);
  const totals = { checking: 0, savings: 0 };
  for (const b of bills) {
    const p = picks[b.id];
    if (p.method === 'checking' || p.method === 'savings') totals[p.method] += amountOf(b, p);
  }
  const cashAfter = round2(s.stats.cash - totals.checking);
  const savAfter = round2(s.stats.savings - totals.savings);
  const blocked = savAfter < 0 || (cashAfter < 0 && !s.overdraftOptIn);
  const set = (id: string, p: Partial<BillPick>) => setPicks({ ...picks, [id]: { ...picks[id], ...p } });

  return (
    <div className="panel-inner bills">
      <div className="panel-head">
        <h3>Bills are due</h3>
      </div>
      <p className="muted small">Pay what you can. Skipping a bill has consequences.</p>
      <div className="bill-list">
        {bills.map((b) => {
          const p = picks[b.id];
          return (
            <div key={b.id} className={`bill ${p.mode === 'skip' ? 'skipped' : ''}`}>
              <div className="bill-top">
                <span className="bill-name">{b.label}</span>
                <span className="bill-amt">{money(amountOf(b, p), true)}</span>
              </div>
              <div className="bill-ctrl">
                <button className={`pill ${p.mode === 'full' ? 'on' : ''}`} onClick={() => set(b.id, { mode: 'full' })}>
                  {b.kind === 'card' ? `Full ${money(b.amount)}` : 'Pay'}
                </button>
                {b.kind === 'card' && (
                  <button className={`pill ${p.mode === 'min' ? 'on' : ''}`} onClick={() => set(b.id, { mode: 'min' })}>
                    Minimum {money(b.minimum ?? 0)}
                  </button>
                )}
                <button className={`pill danger ${p.mode === 'skip' ? 'on' : ''}`} onClick={() => set(b.id, { mode: 'skip' })}>
                  Skip
                </button>
                {p.mode !== 'skip' && (
                  <span className="from">
                    from
                    <button className={`pill ${p.method === 'checking' ? 'on' : ''}`} onClick={() => set(b.id, { method: 'checking' })}>
                      Checking
                    </button>
                    <button className={`pill ${p.method === 'savings' ? 'on' : ''}`} onClick={() => set(b.id, { method: 'savings' })}>
                      Savings
                    </button>
                  </span>
                )}
              </div>
              {p.mode === 'skip' && <div className="bill-warn">{consequence(b, s)}</div>}
              {b.kind === 'card' && p.mode === 'min' && <div className="bill-warn">The other {money(b.amount - (b.minimum ?? 0))} will collect {Math.round((s.card?.apr ?? 0) * 100)}% interest.</div>}
            </div>
          );
        })}
      </div>
      <div className="bill-totals">
        <span>
          Checking after: <strong className={cashAfter < 0 ? 'neg' : ''}>{money(cashAfter)}</strong>
        </span>
        <span>
          Savings after: <strong className={savAfter < 0 ? 'neg' : ''}>{money(savAfter)}</strong>
        </span>
      </div>
      {cashAfter < 0 && s.overdraftOptIn && <div className="warn-box">This will overdraw your checking account ($35 fee per transaction).</div>}
      {blocked && <div className="warn-box">Not enough money for that. Pay from somewhere else, or skip something.</div>}
      <button
        className="btn primary"
        disabled={blocked}
        onClick={() => {
          const out: Record<string, { amount: number; method: PayMethod } | null> = {};
          for (const b of bills) {
            const p = picks[b.id];
            out[b.id] = p.mode === 'skip' ? null : { amount: amountOf(b, p), method: p.method };
          }
          sfx('spend');
          onPay(out);
        }}
      >
        Pay bills
      </button>
    </div>
  );
}

// ================= WEEK SUMMARY =================
export function SummaryPanel({ s, onContinue }: { s: GameState; onContinue: () => void }) {
  const before = s.weekSnap;
  const now = snap(s);
  const d = before
    ? {
        cash: round2(now.cash - before.cash),
        savings: round2(now.savings - before.savings),
        card: round2(now.card - before.card),
        energy: now.energy - before.energy,
        rep: now.rep - before.rep,
        xp: now.xp - before.xp,
      }
    : {};
  const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => Math.abs(v as number) >= 0.5));
  return (
    <div className="panel-inner summary">
      <div className="panel-head">
        <h3>Week {s.week} recap</h3>
      </div>
      <ul className="journal">
        {s.log.map((l, i) => (
          <li key={i} className={l.tone ?? ''}>
            {l.text}
          </li>
        ))}
        {!s.log.length && <li>A quiet week.</li>}
      </ul>
      <DeltaChips d={clean} />
      <button className="btn primary" onClick={onContinue} autoFocus>
        {s.week === chapterEndWeek(s.chapter) ? 'Chapter results ▶' : 'Next week ▶'}
      </button>
    </div>
  );
}

// ================= CHAPTER END =================
export function ChapterEndPanel({ s, onContinue }: { s: GameState; onContinue: () => void }) {
  const r = chapterReport(s, false);
  useEffect(() => sfx(r.stars >= 2 ? 'star' : 'bad'), [r.stars]);
  return (
    <div className="panel-inner chapter-end">
      <div className="panel-head">
        <h3>
          Chapter {s.chapter + 1} complete: {CHAPTERS[s.chapter].title}
        </h3>
      </div>
      <div className="stars" aria-label={`${r.stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i < r.stars ? 'on' : ''}>
            ★
          </span>
        ))}
      </div>
      {r.done.map((t) => (
        <div key={t} className="report good">
          <Icon name="check" /> {t}
        </div>
      ))}
      {r.bonus.map((t) => (
        <div key={t} className="report bonus">
          <Icon name="star" /> {t}
        </div>
      ))}
      {r.missed.map((m) => (
        <div key={m.title} className="report bad">
          <Icon name="close" /> <span>
            <strong>{m.title}</strong>
            <br />
            {m.consequence}
          </span>
        </div>
      ))}
      <p className="muted small">
        Savings {money(s.stats.savings)} · Credit {creditScore(s) ?? 'none yet'} · Energy {s.stats.energy}
      </p>
      <button className="btn primary" onClick={onContinue} autoFocus>
        {s.chapter + 1 < CHAPTERS.length ? 'Next chapter ▶' : 'See how your year turned out ▶'}
      </button>
    </div>
  );
}

export { canPay };

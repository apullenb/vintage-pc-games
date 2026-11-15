// The in-game screen: HUD, scene, interaction panel, missions sidebar, modals.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CAST } from '../art/people.ts';
import { ACHIEVEMENTS } from '../content/achievements.ts';
import { CHAPTERS } from '../content/chapters.ts';
import { HANDBOOK, HANDBOOK_BY_ID } from '../content/handbook.ts';
import { pathName } from '../content/paths.ts';
import { monthlyBills, monthlyNet } from '../content/scenes/tasks.ts';
import { CREDIT_WAIT, creditAge, creditLabel, creditScore, money } from '../engine/core.ts';
import {
  TOTAL_WEEKS,
  billsFor,
  chapterEndWeek,
  choose,
  moveMoney,
  payBills,
  proceed,
  retryChapter,
  sceneOf,
  setAutoSave,
  startWeek,
  taskStatus,
} from '../engine/engine.ts';
import { finalScore } from '../engine/score.ts';
import type { ArtId, GameState, NpcId, PayMethod, Plan } from '../engine/types.ts';
import { reducedMotion } from './a11y.ts';
import { sfx } from './audio.ts';
import { HistoryCharts } from './Charts.tsx';
import { Bar, Icon, Modal, SceneCanvas } from './common.tsx';
import { BillsPanel, ChapterEndPanel, PaycheckPanel, Planner, ScenePanel, SummaryPanel } from './Panels.tsx';
import type { Meta } from './save.ts';
import { Tutorial } from './Tutorial.tsx';

type ModalId = 'money' | 'handbook' | 'awards' | 'missions' | 'menu' | null;

function artFor(s: GameState): { art: ArtId; speaker: NpcId | null; hidePlayer?: boolean } {
  const h = s.queue[0];
  if (!h) return { art: s.housing.art, speaker: null };
  switch (h.t) {
    case 'scene': {
      const sc = sceneOf(h.id);
      const step = sc.steps[h.step];
      const art = step.art ?? (typeof sc.art === 'function' ? sc.art(s) : sc.art);
      const sp = step.speaker ?? sc.speaker ?? null;
      return { art, speaker: typeof sp === 'function' ? sp(s) : sp };
    }
    case 'paycheck':
      return { art: 'bank', speaker: null };
    case 'billsDue':
      return { art: s.housing.art, speaker: null };
    case 'summary':
      return { art: s.housing.art, speaker: null };
    case 'chapterEnd':
      return { art: 'stage', speaker: null };
    case 'gameOver':
      return { art: 'night', speaker: null };
    default:
      return { art: 'beach', speaker: 'rae' };
  }
}

export function Game({ g, setG, meta, setMeta, onQuit }: { g: GameState; setG: (g: GameState) => void; meta: Meta; setMeta: (m: Meta) => void; onQuit: () => void }) {
  const [modal, setModal] = useState<ModalId>(null);
  const [toasts, setToasts] = useState<{ id: number; kind: 'ach' | 'hb'; text: string }[]>([]);
  const h = g.queue[0] ?? null;

  // Sound feedback for money moving.
  const commit = useCallback(
    (next: GameState) => {
      const dc = next.stats.cash + next.stats.savings - (g.stats.cash + g.stats.savings);
      if (next.achievements.length > g.achievements.length) sfx('fanfare');
      else if (dc > 1) sfx('coin');
      else if (dc < -1) sfx('spend');
      const fresh: { id: number; kind: 'ach' | 'hb'; text: string }[] = [];
      for (const a of next.achievements.slice(g.achievements.length)) {
        const def = ACHIEVEMENTS.find((x) => x.id === a);
        if (def) fresh.push({ id: Math.random(), kind: 'ach', text: def.name });
      }
      for (const e of next.handbook.slice(g.handbook.length)) {
        const def = HANDBOOK_BY_ID[e];
        if (def) fresh.push({ id: Math.random(), kind: 'hb', text: def.term });
      }
      if (fresh.length) {
        setToasts((t) => [...t, ...fresh].slice(-4));
        for (const f of fresh) window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), 3800);
      }
      setG(next);
    },
    [g, setG],
  );

  const { art, speaker, hidePlayer } = artFor(g);
  const talking = h?.t === 'scene' && !h.result;
  const chapter = CHAPTERS[Math.min(g.chapter, CHAPTERS.length - 1)];
  const showTutorial = !h && !meta.tutorialDone && !modal;

  let panel: React.ReactNode = null;
  if (!h) panel = <Planner s={g} onStart={(p: Plan) => commit(startWeek(g, p))} />;
  else if (h.t === 'scene') panel = <ScenePanel key={`${h.id}:${h.step}:${h.result ? 'r' : 'q'}:${g.week}`} s={g} head={h} fast={meta.fast || reducedMotion()} onChoose={(i: number, m?: PayMethod) => commit(choose(g, i, m))} onContinue={() => commit(proceed(g))} />;
  else if (h.t === 'paycheck') panel = <PaycheckPanel s={g} stub={h.stub} onContinue={() => commit(proceed(g))} />;
  else if (h.t === 'billsDue') panel = <BillsPanel key={`bills-${g.week}`} s={g} bills={h.bills} onPay={(p) => commit(payBills(g, p))} />;
  else if (h.t === 'summary') panel = <SummaryPanel s={g} onContinue={() => commit(proceed(g))} />;
  else if (h.t === 'chapterEnd') panel = <ChapterEndPanel s={g} onContinue={() => commit(proceed(g))} />;
  else if (h.t === 'gameOver') panel = <GameOverPanel s={g} onRetry={() => { const r = retryChapter(g); if (r) setG(r); }} onQuit={onQuit} />;
  else if (h.t === 'ending') panel = <EndingPanel s={g} meta={meta} setMeta={setMeta} onQuit={onQuit} />;

  return (
    <div className={`game ${h?.t === 'ending' ? 'is-ending' : ''}`}>
      <Hud g={g} onOpen={setModal} muted={meta.muted} onMute={() => setMeta({ ...meta, muted: !meta.muted })} />
      <div className="stage">
        <section className="main-col">
          <div className="scene-frame">
            <SceneCanvas art={art} look={g.look} speaker={speaker} talking={talking} hidePlayer={hidePlayer} />
            <div className="scene-tag">
              {speaker && CAST[speaker] ? <span className="speaker">{CAST[speaker].name}</span> : <span className="where">{g.housing.name}</span>}
            </div>
          </div>
          <div className="panel">{panel}</div>
          {h?.t !== 'ending' && <MissionStrip g={g} onOpen={() => setModal('missions')} />}
        </section>
        {h?.t !== 'ending' && (
          <aside className="side-col">
            <Missions g={g} />
          </aside>
        )}
      </div>
      <div className="toasts" aria-live="polite" hidden={showTutorial || !!modal}>
        {toasts.map((t) => (
          <button key={t.id} className={`toast ${t.kind}`} onClick={() => setModal(t.kind === 'hb' ? 'handbook' : 'awards')} aria-label={`${t.kind === 'hb' ? 'New handbook page' : 'Achievement unlocked'}: ${t.text}. Open.`}>
            <Icon name={t.kind === 'hb' ? 'book' : 'trophy'} />
            <span>
              <small>{t.kind === 'hb' ? 'New handbook page' : 'Achievement unlocked!'}</small>
              {t.text}
            </span>
          </button>
        ))}
      </div>
      {showTutorial && <Tutorial g={g} onDone={() => setMeta({ ...meta, tutorialDone: true })} />}
      {modal === 'money' && <MoneyModal g={g} setG={setG} onClose={() => setModal(null)} />}
      {modal === 'missions' && (
        <Modal title={`Chapter ${g.chapter + 1}: ${chapter.title}`} onClose={() => setModal(null)}>
          <Missions g={g} />
        </Modal>
      )}
      {modal === 'handbook' && <HandbookModal unlocked={[...new Set([...meta.handbook, ...g.handbook])]} fresh={g.handbook} onClose={() => setModal(null)} />}
      {modal === 'awards' && <AwardsModal unlocked={[...new Set([...meta.achievements, ...g.achievements])]} onClose={() => setModal(null)} />}
      {modal === 'menu' && (
        <Modal title="Menu" onClose={() => setModal(null)}>
          <div className="menu-list">
            <button className="btn" onClick={() => setMeta({ ...meta, fast: !meta.fast })}>
              Text speed: {meta.fast ? 'Instant' : 'Typewriter'}
            </button>
            <button className="btn" aria-pressed={meta.bigText} onClick={() => setMeta({ ...meta, bigText: !meta.bigText })}>
              Text size: {meta.bigText ? 'Large' : 'Normal'}
            </button>
            <button className="btn" onClick={() => setMeta({ ...meta, muted: !meta.muted })}>
              Sound: {meta.muted ? 'Off' : 'On'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setMeta({ ...meta, tutorialDone: false });
                setModal(null);
              }}
            >
              Replay tutorial
              {h && <small>Shows next time you plan a week</small>}
            </button>
            {g.checkpoint && (
              <button
                className="btn"
                onClick={() => {
                  const r = retryChapter(g);
                  if (r && confirm('Restart this chapter from the beginning?')) {
                    setG(r);
                    setModal(null);
                  }
                }}
              >
                Restart chapter
              </button>
            )}
            <button className="btn" onClick={onQuit}>
              Save &amp; quit to title
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ================= HUD =================
type TipId = 'week' | 'cash' | 'savings' | 'card' | 'credit' | 'energy' | 'rep' | 'xp';

// Plain-language explanations for every number and bar in the HUD.
function hudTip(id: TipId, g: GameState): { title: string; text: string; money?: boolean } {
  const sc = creditScore(g);
  const ch = Math.min(g.chapter, CHAPTERS.length - 1);
  switch (id) {
    case 'week':
      return {
        title: `Week ${Math.min(g.week, TOTAL_WEEKS)} of ${TOTAL_WEEKS}`,
        text: `Your first year on your own is ${TOTAL_WEEKS} weeks, split into ${CHAPTERS.length} chapters. You’re in chapter ${ch + 1}, “${CHAPTERS[ch].title}”. Each chapter has missions to finish before it ends.`,
      };
    case 'cash':
      return {
        title: `Checking: ${money(g.stats.cash, true)}`,
        text: 'Your everyday spending money. Paychecks land here, and bills and purchases come out of it. If it drops below $0, the bank charges fees or declines your payments.',
        money: true,
      };
    case 'savings':
      return {
        title: `Savings: ${money(g.stats.savings, true)}`,
        text: 'Your safety net for emergencies and big goals. It earns a little interest. Move money here on the Money screen, or turn on auto-save.',
        money: true,
      };
    case 'card':
      return {
        title: `Card owed: ${money(g.card?.balance ?? 0, true)}`,
        text: g.card
          ? `What you owe the credit card company (your limit is ${money(g.card.limit)}). Pay the full amount when the bill comes, or you pay ${Math.round(g.card.apr * 100)}% interest. Using more than 30% of your limit lowers your credit score.`
          : 'You don’t have a credit card.',
        money: true,
      };
    case 'credit':
      return sc === null
        ? {
            title: 'Credit score: none yet',
            text: 'A credit score (300 to 850) shows lenders how well you pay back money. You get one a few weeks after you open your first credit card or loan.',
            money: true,
          }
        : {
            title: `Credit score: ${sc} (${creditLabel(sc)})`,
            text: 'Shows lenders how well you pay back money, from 300 to 850. A higher score means cheaper apartments, cars, and loans. Paying every bill on time raises it. Late payments drop it fast.',
            money: true,
          };
    case 'energy':
      return {
        title: `Energy: ${g.stats.energy} / 100`,
        text: `Work, class, and errands use energy. Rest and good food fill it back up. When it gets low you can get sick and lose days.${g.stats.energy < 30 ? ' You’re running low: plan some rest!' : ''}`,
      };
    case 'rep':
      return g.path === 'college'
        ? { title: `Professors’ opinion: ${g.stats.rep} / 100`, text: 'How your professors think you’re doing. Going to class and studying raise it. Skipping class lowers it.' }
        : {
            title: `Boss rating: ${g.stats.rep} / 100`,
            text: g.job
              ? 'How your boss feels about your work. Showing up and working hard raise it. Skipping work lowers it. If it gets too low, you could get fired.'
              : 'You don’t have a boss yet. Once you get a job, this shows how your boss feels about your work.',
          };
    case 'xp':
      return {
        title: `Career progress: ${g.stats.xp}`,
        text: 'Skills and experience from work, training, and classes. More progress leads to better jobs and raises, and a better final score.',
      };
  }
}

function Hud({ g, onOpen, muted, onMute }: { g: GameState; onOpen: (m: ModalId) => void; muted: boolean; onMute: () => void }) {
  const sc = creditScore(g);
  const [tip, setTip] = useState<{ id: TipId; x: number; y: number } | null>(null);
  const pointer = useRef<string>('mouse');
  const downAt = useRef(0);
  const ref = useRef<HTMLElement>(null);

  // Publish the HUD height so phone toasts can sit just below it.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close the tip on an outside tap, Escape, or scroll.
  useEffect(() => {
    if (!tip) return;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Element | null;
      if (t?.closest?.('.hud-stat, .hud-tip')) return;
      setTip(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setTip(null);
    };
    const onScroll = (): void => setTip(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
    };
  }, [tip]);

  const show = (id: TipId, el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    setTip({ id, x: r.left + r.width / 2, y: r.bottom });
  };
  const hide = (id: TipId): void => setTip((t) => (t?.id === id ? null : t));
  // Mouse: hover shows the tip, click opens Money. Touch: tap toggles the tip. Keyboard: focus shows it.
  const stat = (id: TipId, opensMoney: boolean) => ({
    'aria-expanded': tip?.id === id,
    'aria-describedby': tip?.id === id ? 'hud-tip' : undefined,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      pointer.current = e.pointerType;
      downAt.current = Date.now();
    },
    onPointerEnter: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse') show(id, e.currentTarget);
    },
    onPointerLeave: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse') hide(id);
    },
    onFocus: (e: React.FocusEvent<HTMLButtonElement>) => {
      if (e.currentTarget.matches(':focus-visible')) show(id, e.currentTarget);
    },
    onBlur: () => {
      if (Date.now() - downAt.current > 400) hide(id);
    },
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      const touch = e.detail !== 0 && pointer.current !== 'mouse';
      if (opensMoney && !touch) {
        setTip(null);
        onOpen('money');
        return;
      }
      sfx('click');
      if (tip?.id === id) setTip(null);
      else show(id, e.currentTarget);
    },
  });

  const info = tip ? hudTip(tip.id, g) : null;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const tipW = Math.min(300, vw - 16);
  const tipLeft = tip ? Math.max(8, Math.min(tip.x - tipW / 2, vw - tipW - 8)) : 0;
  const repLabel = g.path === 'college' ? 'Professors' : 'Boss';

  return (
    <header className="hud" ref={ref}>
      <button className="hud-when hud-stat" {...stat('week', false)} aria-label={`Week ${Math.min(g.week, TOTAL_WEEKS)} of ${TOTAL_WEEKS}. What does this mean?`}>
        <span className="hud-week">
          Week {Math.min(g.week, TOTAL_WEEKS)}
          <small>/{TOTAL_WEEKS}</small>
        </span>
        <span className="hud-ch">
          Ch.{Math.min(g.chapter + 1, CHAPTERS.length)} {CHAPTERS[Math.min(g.chapter, CHAPTERS.length - 1)].title}
        </span>
      </button>
      <div className="hud-money" data-coach="money">
        <button className={`hud-stat m ${g.stats.cash < 0 ? 'neg' : ''}`} {...stat('cash', true)} aria-label={`Checking ${money(g.stats.cash)}`}>
          <small>Checking</small>
          {money(g.stats.cash)}
        </button>
        <button className="hud-stat m" {...stat('savings', true)} aria-label={`Savings ${money(g.stats.savings)}`}>
          <small>Savings</small>
          {money(g.stats.savings)}
        </button>
        {g.card && (
          <button className={`hud-stat m ${g.card.balance / g.card.limit > 0.3 ? 'neg' : ''}`} {...stat('card', true)} aria-label={`Credit card owed ${money(g.card.balance)}`}>
            <small>Card owed</small>
            {money(g.card.balance)}
          </button>
        )}
        <button className="hud-stat m" {...stat('credit', true)} aria-label={`Credit score ${sc ?? 'none yet'}`}>
          <small>Credit</small>
          {sc ?? '—'}
        </button>
      </div>
      <div className="hud-bars">
        <button className="hud-stat b" data-coach="energy" {...stat('energy', false)} aria-label={`Energy ${g.stats.energy} out of 100`}>
          <small>Energy</small>
          <span>
            <Icon name="energy" size={12} /> <Bar value={g.stats.energy} tone="energy" />
          </span>
        </button>
        <button className="hud-stat b" {...stat('rep', false)} aria-label={`${g.path === 'college' ? 'Professors’ opinion' : 'Boss rating'} ${g.stats.rep} out of 100`}>
          <small>{repLabel}</small>
          <span>
            <Icon name="boss" size={12} /> <Bar value={g.stats.rep} tone="rep" />
          </span>
        </button>
        <button className="hud-stat b" {...stat('xp', false)} aria-label={`Career progress ${g.stats.xp}`}>
          <small>Career</small>
          <span>
            <Icon name="star" size={12} /> <Bar value={g.stats.xp} max={120} tone="xp" />
          </span>
        </button>
      </div>
      <nav className="hud-btns" aria-label="Game menus">
        <button className="icon-btn missions-btn" onClick={() => onOpen('missions')} aria-label="Missions" title="Missions">
          <Icon name="calendar" />
        </button>
        <button className="icon-btn" onClick={() => onOpen('money')} aria-label="Money" title="Money">
          <Icon name="wallet" />
        </button>
        <button className="icon-btn" onClick={() => onOpen('handbook')} aria-label={`Adulting Handbook, ${g.handbook.length} pages`} title="Adulting Handbook">
          <Icon name="book" />
          {g.handbook.length > 0 && <span className="badge" aria-hidden="true">{g.handbook.length}</span>}
        </button>
        <button className="icon-btn" onClick={() => onOpen('awards')} aria-label="Achievements" title="Achievements">
          <Icon name="trophy" />
        </button>
        <button className="icon-btn" onClick={onMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          <Icon name={muted ? 'mute' : 'sound'} />
        </button>
        <button className="icon-btn" onClick={() => onOpen('menu')} aria-label="Menu" title="Menu">
          <Icon name="menu" />
        </button>
      </nav>
      {tip && info && (
        <div id="hud-tip" className="hud-tip" role="tooltip" style={{ top: tip.y + 10, left: tipLeft, width: tipW }}>
          <span className="hud-tip-arrow" style={{ left: Math.max(10, Math.min(tipW - 22, tip.x - tipLeft - 6)) }} />
          <strong>{info.title}</strong>
          <span>{info.text}</span>
          {info.money && (
            <button
              className="btn small"
              onClick={() => {
                setTip(null);
                onOpen('money');
              }}
            >
              Open Money ▶
            </button>
          )}
        </div>
      )}
    </header>
  );
}

// Phones hide the missions sidebar, so show a tappable one-line summary under the panel instead.
function MissionStrip({ g, onOpen }: { g: GameState; onOpen: () => void }) {
  const ch = Math.min(g.chapter, CHAPTERS.length - 1);
  const tasks = taskStatus(g, ch).filter((t) => !t.optional);
  const done = tasks.filter((t) => t.done).length;
  const next = tasks.find((t) => !t.done);
  const left = chapterEndWeek(ch) - g.week + 1;
  return (
    <button className="mobile-missions" onClick={onOpen} aria-label={`Missions: ${done} of ${tasks.length} done, ${left} weeks left. Show all missions.`}>
      <span className="mm-top">
        <span className="mm-title">
          <Icon name="calendar" size={14} /> Missions {done}/{tasks.length}
        </span>
        <span className={`deadline ${left <= 2 ? 'urgent' : ''}`}>{left > 0 ? `${left} week${left === 1 ? '' : 's'} left` : 'Deadline!'}</span>
      </span>
      <span className="mm-next">{next ? <>Next: {next.title}</> : 'All missions done! Nice.'}</span>
      <span className="mm-more">See all ▶</span>
    </button>
  );
}

// ================= MISSIONS =================
function Missions({ g }: { g: GameState }) {
  const ch = Math.min(g.chapter, CHAPTERS.length - 1);
  const tasks = taskStatus(g, ch);
  const left = chapterEndWeek(ch) - g.week + 1;
  const upcoming = g.appointments.filter((a) => a.week >= g.week).slice(0, 4);
  return (
    <div className="missions">
      <div className="mission-head">
        <h3>{CHAPTERS[ch].title}</h3>
        <span className={`deadline ${left <= 2 ? 'urgent' : ''}`}>{left > 0 ? `${left} week${left === 1 ? '' : 's'} left` : 'Deadline!'}</span>
      </div>
      <ul className="task-list">
        {tasks.map((t) => (
          <li key={t.id} className={`${t.done ? 'done' : ''} ${t.optional ? 'optional' : ''}`}>
            <span className="box">{t.done ? <Icon name="check" size={12} /> : null}</span>
            <div>
              <strong>{t.title}</strong>
              {!t.done && <span className="how">{t.how}</span>}
              {t.progress && <span className="prog">{t.progress}</span>}
              {t.optional && t.done && <span className="prog">On track</span>}
            </div>
          </li>
        ))}
      </ul>
      {upcoming.length > 0 && (
        <div className="appts">
          <h4>
            <Icon name="calendar" size={12} /> Calendar
          </h4>
          {upcoming.map((a, i) => (
            <div key={i} className="appt">
              Week {a.week}, {a.slot}: {a.label}
            </div>
          ))}
        </div>
      )}
      <div className="life">
        <h4>Your life</h4>
        <div>
          {g.job ? `${g.job.title}, ${g.job.place} · ${money(g.job.wage, true)}/hr` : 'Unemployed'}
        </div>
        <div>{g.housing.name}</div>
        <div>{g.car ? `${g.car.name} (condition ${Math.round(g.car.condition)}%)` : `Getting around: ${g.transport === 'borrow' ? 'borrowing Mom’s car' : g.transport}`}</div>
        <div>Health insurance: {g.health === 'none' ? 'NONE' : g.health === 'employer' ? 'employer plan' : g.health === 'parents' ? 'parents’ plan' : 'school plan'}</div>
      </div>
    </div>
  );
}

// ================= MONEY =================
function MoneyModal({ g, setG, onClose }: { g: GameState; setG: (g: GameState) => void; onClose: () => void }) {
  const [amt, setAmt] = useState(100);
  const sc = creditScore(g);
  const busy = g.queue.length > 0 && g.queue[0].t !== 'scene';
  const net = monthlyNet(g);
  const bills = monthlyBills(g);
  return (
    <Modal title="Money" onClose={onClose} wide>
      <div className="money-grid">
        <div className="acct">
          <small>Checking</small>
          <strong className={g.stats.cash < 0 ? 'neg' : ''}>{money(g.stats.cash, true)}</strong>
          <span className="muted small">For spending and bills. Overdraft protection: {g.overdraftOptIn ? 'ON ($35 fees)' : 'OFF (declines)'}</span>
        </div>
        <div className="acct">
          <small>Savings</small>
          <strong>{money(g.stats.savings, true)}</strong>
          <span className="muted small">{g.bank === 'online' ? '4% interest' : g.bank === 'creditunion' ? '1.5% interest' : '0.1% interest'} · Emergency fund</span>
        </div>
        {g.card && (
          <div className="acct">
            <small>{g.card.name}</small>
            <strong className={g.card.balance / g.card.limit > 0.3 ? 'neg' : ''}>{money(g.card.balance, true)} owed</strong>
            <span className="muted small">
              Limit {money(g.card.limit)} · {Math.round((g.card.apr) * 100)}% APR · using {Math.round((g.card.balance / g.card.limit) * 100)}%
            </span>
          </div>
        )}
        <div className="acct">
          <small>Retirement (401k/IRA)</small>
          <strong>{money(g.retire, true)}</strong>
        </div>
      </div>
      <div className="transfer">
        <span>Move money:</span>
        {[50, 100, 250, 500].map((v) => (
          <button key={v} className={`pill ${amt === v ? 'on' : ''}`} aria-pressed={amt === v} onClick={() => setAmt(v)}>
            {money(v)}
          </button>
        ))}
        <div className="transfer-btns">
          <button className="btn small" disabled={busy || g.stats.cash < amt} onClick={() => { sfx('coin'); setG(moveMoney(g, amt, 'savings')); }}>
            Checking → Savings
          </button>
          <button className="btn small" disabled={busy || g.stats.savings < 1} onClick={() => { sfx('click'); setG(moveMoney(g, amt, 'checking')); }}>
            Savings → Checking
          </button>
          {g.card && (
            <button className="btn small" disabled={busy || g.card.balance < 1 || g.stats.cash < 1} onClick={() => { sfx('spend'); setG(moveMoney(g, amt, 'card')); }}>
              Pay card now
            </button>
          )}
        </div>
        {busy && <p className="muted small">Finish what you’re doing to move money.</p>}
      </div>
      <div className="autosave">
        <span>Auto-save each payday:</span>
        {[0, 50, 100, 150, 250].map((v) => (
          <button key={v} className={`pill ${g.autoSave === v ? 'on' : ''}`} aria-pressed={g.autoSave === v} onClick={() => setG(setAutoSave(g, v))}>
            {v ? money(v) : 'Off'}
          </button>
        ))}
      </div>
      <h4 className="money-h">Your progress, week by week</h4>
      <HistoryCharts history={g.history} />
      <div className="money-cols">
        <div>
          <h4>Monthly picture</h4>
          <div className="kv">
            <span>Take-home pay (approx.)</span>
            <span>{money(net)}</span>
          </div>
          <div className="kv">
            <span>Fixed bills</span>
            <span>−{money(bills)}</span>
          </div>
          {billsFor(g)
            .filter((b) => b.kind !== 'card')
            .map((b) => (
              <div key={b.id} className="kv sub">
                <span>{b.label}</span>
                <span>{money(b.amount)}</span>
              </div>
            ))}
          {g.loans.map((l) => (
            <div key={l.name} className="kv sub">
              <span>
                {l.name} ({(l.apr * 100).toFixed(1)}%{l.deferred ? ', deferred' : ''})
              </span>
              <span>{money(l.balance)} owed</span>
            </div>
          ))}
        </div>
        <div>
          <h4>Credit score</h4>
          <div className="score-big">
            {sc ?? '???'} <small>{creditLabel(sc)}</small>
          </div>
          {sc === null && (
            <p className="muted small">
              {g.credit.firstWeek === null ? 'No credit history yet. Open a card or loan to start one.' : `History is building. Score appears in ${Math.max(0, CREDIT_WAIT - creditAge(g))} week(s).`}
            </p>
          )}
          <div className="kv sub">
            <span>On-time payments</span>
            <span>{g.credit.onTime}</span>
          </div>
          <div className="kv sub">
            <span>Late payments</span>
            <span className={g.credit.late ? 'neg' : ''}>{g.credit.late}</span>
          </div>
          <div className="kv sub">
            <span>Card utilization</span>
            <span>{g.card ? `${Math.round((g.card.balance / g.card.limit) * 100)}%` : '—'}</span>
          </div>
          <div className="kv sub">
            <span>Collections</span>
            <span className={g.credit.collections ? 'neg' : ''}>{g.credit.collections}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ================= HANDBOOK & AWARDS =================
function HandbookModal({ unlocked, fresh, onClose }: { unlocked: string[]; fresh: string[]; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(fresh[fresh.length - 1] ?? null);
  return (
    <Modal title={`Adulting Handbook (${unlocked.length}/${HANDBOOK.length})`} onClose={onClose} wide>
      <p className="muted small">Real-life terms you’ve run into. Keep playing to unlock more.</p>
      <div className="handbook">
        {HANDBOOK.map((e) => {
          const ok = unlocked.includes(e.id);
          return (
            <div key={e.id} className={`hb ${ok ? '' : 'locked'} ${open === e.id ? 'open' : ''}`}>
              <button disabled={!ok} onClick={() => setOpen(open === e.id ? null : e.id)}>
                {ok ? e.term : '???'}
              </button>
              {ok && open === e.id && <p>{HANDBOOK_BY_ID[e.id].text}</p>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function AwardsModal({ unlocked, onClose }: { unlocked: string[]; onClose: () => void }) {
  return (
    <Modal title={`Achievements (${unlocked.length}/${ACHIEVEMENTS.length})`} onClose={onClose} wide>
      <div className="awards">
        {ACHIEVEMENTS.map((a) => {
          const ok = unlocked.includes(a.id);
          return (
            <div key={a.id} className={`award ${ok ? 'on' : ''}`}>
              <Icon name={ok ? a.icon : 'lock'} size={20} />
              <div>
                <strong>{ok ? a.name : '???'}</strong>
                <span>{a.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ================= GAME OVER / ENDING =================
function GameOverPanel({ s, onRetry, onQuit }: { s: GameState; onRetry: () => void; onQuit: () => void }) {
  const h = s.queue[0];
  const reason = h && h.t === 'gameOver' ? h.reason : '';
  useEffect(() => sfx('bad'), []);
  const text: Record<string, string> = {
    evicted: 'You missed rent twice. The eviction notice gives you 10 days. You pack your stuff into trash bags and move back into your childhood bedroom. Your mom doesn’t say “I told you so.” She doesn’t have to.',
    parents: 'You skipped your share of rent twice. Your parents sit you down: “If you can’t keep our deal, you’re not ready to be on your own.” The car keys go back on the hook.',
    dropped: 'You missed two tuition payments. The registrar drops you from your classes. You’ll have to sit out a semester.',
  };
  return (
    <div className="panel-inner game-over">
      <div className="panel-head">
        <h3>Back to square one</h3>
      </div>
      <div className="story">
        <p>{text[reason] ?? 'Things fell apart.'}</p>
        <p className="tip">
          <Icon name="book" /> <span>Housing comes first. When money is tight, pay rent before anything else, and talk to your landlord BEFORE you’re late.</span>
        </p>
      </div>
      <div className="row">
        {s.checkpoint && (
          <button className="btn primary" onClick={onRetry}>
            Retry chapter {s.chapter + 1}
          </button>
        )}
        <button className="btn" onClick={onQuit}>
          Title screen
        </button>
      </div>
    </div>
  );
}

function EndingPanel({ s, meta, setMeta, onQuit }: { s: GameState; meta: Meta; setMeta: (m: Meta) => void; onQuit: () => void }) {
  const f = finalScore(s);
  const prev = meta.best[s.path];
  const isBest = !prev || f.total > prev.score;
  useEffect(() => {
    sfx('fanfare');
    if (isBest) setMeta({ ...meta, best: { ...meta.best, [s.path]: { score: f.total, grade: f.grade } }, runs: meta.runs + 1 });
    else setMeta({ ...meta, runs: meta.runs + 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="panel-inner ending">
      <div className="panel-head">
        <h3>One year on your own</h3>
      </div>
      <div className="grade-row">
        <span className="grade">{f.grade}</span>
        <div>
          <strong className="end-title">{f.title}</strong>
          <span className="muted">
            {pathName(s.path)} · {f.total} / 1000 {isBest ? '· NEW BEST!' : prev ? `· Best: ${prev.score}` : ''}
          </span>
        </div>
      </div>
      <div className="score-lines">
        {f.lines.map((l) => (
          <div key={l.label} className="score-line">
            <span>{l.label}</span>
            <span className="muted">{l.value}</span>
            <span className="pts">
              {l.points}/{l.max}
            </span>
          </div>
        ))}
      </div>
      <h4>Where are you now?</h4>
      <ul className="epilogue">
        {f.epilogue.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      <p className="muted small">Try another path: every start has different tradeoffs.</p>
      <button className="btn primary" onClick={onQuit}>
        Play again
      </button>
    </div>
  );
}

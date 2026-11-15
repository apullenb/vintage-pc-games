// First-week coach marks: spotlight one part of the screen at a time with a short callout.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAPTERS } from '../content/chapters.ts';
import { money } from '../engine/core.ts';
import { chapterEndWeek } from '../engine/engine.ts';
import type { GameState } from '../engine/types.ts';
import { reducedMotion } from './a11y.ts';
import { sfx } from './audio.ts';

interface CoachStep {
  // First selector that matches a visible element is highlighted.
  targets: string[];
  title: string | ((g: GameState) => string);
  text: (g: GameState) => string;
}

const STEPS: CoachStep[] = [
  {
    targets: ['.planner .slots'],
    title: 'Plan your week',
    text: () => 'Every week has 4 time slots. They happen in order: Weekday, then Evening, then Saturday, then Sunday. Tap a slot to choose what you do in it.',
  },
  {
    targets: ['.planner .slot'],
    title: (g) => (g.path === 'college' ? 'Weekdays are for class' : g.job ? 'Weekdays are for work' : 'Weekdays: find a job'),
    text: (g) =>
      g.path === 'college'
        ? 'Monday to Friday daytime is for class. If you plan something else here, you skip class, and your professors notice.'
        : g.job
          ? `Monday to Friday daytime is your job. If you plan something else here, you skip work and lose a day of pay (${money(8 * g.job.wage)}). The red text warns you.`
          : 'Monday to Friday daytime is when you would work. You don’t have a job yet, so use weekdays to look for one.',
  },
  {
    targets: ['[data-coach="energy"]'],
    title: 'Watch your energy',
    text: () => 'This bar is your energy. Work and errands use it up. Rest and good food fill it back up. If it gets too low, you get sick, so plan some rest.',
  },
  {
    targets: ['.side-col .missions', '.mobile-missions'],
    title: 'Your missions',
    text: (g) => {
      const left = chapterEndWeek(g.chapter) - g.week + 1;
      return `This chapter, “${CHAPTERS[g.chapter].title}”, has missions to finish in ${left} week${left === 1 ? '' : 's'}. In the slot menu, activities with a ★ help with a mission. Finish them before the deadline to earn stars.`;
    },
  },
  {
    targets: ['[data-coach="week-info"]'],
    title: 'Payday and bills',
    text: () => 'You get paid every 2 weeks. Bills like rent and your phone are due every 4 weeks. Keep enough money in checking so you can pay them.',
  },
  {
    targets: ['[data-coach="money"]'],
    title: 'Your money',
    text: () => 'Checking is your spending money. Savings is for emergencies. The wallet button opens your Money screen: move money, check your credit score, and set up auto-save. Tap any number or bar up here to learn what it means.',
  },
  {
    targets: ['[data-coach="live"]'],
    title: 'Ready? Go!',
    text: () => 'When your plan looks good, press “Live this week” and see what happens. Stuck on a word? The book button opens your Adulting Handbook.',
  },
];

type Box = { top: number; left: number; width: number; height: number };

function findTarget(sels: string[]): HTMLElement | null {
  for (const sel of sels) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

export function Tutorial({ g, onDone }: { g: GameState; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(220);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Scroll the target into view, then keep the spotlight glued to it.
  useLayoutEffect(() => {
    const el = findTarget(step.targets);
    if (!el) {
      setBox(null);
      return;
    }
    const inHud = !!el.closest('.hud');
    if (!inHud) el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    let raf = 0;
    let key = '';
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      const k = `${r.top}|${r.left}|${r.width}|${r.height}`;
      if (k === key) return;
      key = k;
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const loop = (): void => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    nextRef.current?.focus({ preventScroll: true });
  }, [i]);

  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const go = (d: number): void => {
    if (d > 0 && last) {
      sfx('select');
      onDone();
      return;
    }
    sfx('click');
    setI(Math.max(0, Math.min(STEPS.length - 1, i + d)));
  };

  // Place the callout below the target if it fits, else above, else pinned to the bottom.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 6;
  const cardW = Math.min(400, vw - 24);
  let cardStyle: React.CSSProperties;
  if (!box) {
    cardStyle = { left: (vw - cardW) / 2, top: Math.max(12, (vh - cardH) / 2), width: cardW };
  } else {
    const left = Math.max(12, Math.min(box.left, vw - cardW - 12));
    const below = box.top + box.height + pad + 12;
    const above = box.top - pad - 12 - cardH;
    const top = Math.max(8, Math.min(box.top, vh - cardH - 8));
    if (below + cardH <= vh - 8) cardStyle = { left, top: below, width: cardW };
    else if (above >= 8) cardStyle = { left, top: above, width: cardW };
    else if (box.left - pad - 16 >= cardW) cardStyle = { left: box.left - pad - 16 - cardW, top, width: cardW };
    else if (vw - (box.left + box.width + pad + 16) >= cardW) cardStyle = { left: box.left + box.width + pad + 16, top, width: cardW };
    else cardStyle = { left: (vw - cardW) / 2, bottom: 12, width: cardW };
  }

  return (
    <div className="coach" role="dialog" aria-modal="true" aria-labelledby="coach-title" aria-describedby="coach-text">
      {box ? (
        <div className="coach-spot" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
      ) : (
        <div className="coach-dim" />
      )}
      <div className="coach-card" ref={cardRef} style={cardStyle}>
        <div className="coach-top">
          <span className="coach-count">
            Tip {i + 1} of {STEPS.length}
          </span>
          <button className="coach-skip" onClick={onDone}>
            Skip tutorial
          </button>
        </div>
        <h3 id="coach-title">{typeof step.title === 'function' ? step.title(g) : step.title}</h3>
        <p id="coach-text" aria-live="polite">
          {step.text(g)}
        </p>
        <div className="coach-dots" aria-hidden="true">
          {STEPS.map((_, j) => (
            <span key={j} className={j === i ? 'on' : j < i ? 'seen' : ''} />
          ))}
        </div>
        <div className="coach-btns">
          {i > 0 && (
            <button className="btn small" onClick={() => go(-1)}>
              ◀ Back
            </button>
          )}
          <button ref={nextRef} className="btn primary small" onClick={() => go(1)}>
            {last ? 'Let’s go!' : 'Next ▶'}
          </button>
        </div>
      </div>
    </div>
  );
}

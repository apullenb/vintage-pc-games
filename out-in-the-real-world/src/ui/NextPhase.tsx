// The bridge between year one and the next phase: the year-one report card (with a peek at where
// you're headed), and a compact copy of it on the final results screen.
import { useEffect } from 'react';
import { pathName } from '../content/paths.ts';
import { salary, trackFor } from '../content/phase2.ts';
import { money } from '../engine/core.ts';
import { finalScore } from '../engine/score.ts';
import type { GameState, YearOne } from '../engine/types.ts';
import { sfx } from './audio.ts';
import './phase2.css';

export function YearOneReport({ s, onNext, onQuit, onNewGame }: { s: GameState; onNext: () => void; onQuit: () => void; onNewGame: () => void }) {
  const f = finalScore(s);
  const t = trackFor(s);
  useEffect(() => sfx('fanfare'), []);
  const years = t.years === 3.5 ? 'Three and a half years' : 'Three years';
  return (
    <div className="panel-inner ending">
      <div className="panel-head">
        <h3>Year one: report card</h3>
      </div>
      <div className="grade-row">
        <span className="grade">{f.grade}</span>
        <div>
          <strong className="end-title">{f.title}</strong>
          <span className="muted">
            {pathName(s.path)} · {f.total} / 1000
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
      <div className={`y1-next ${t.tier}`}>
        <span className="y1-next-k">Up next · {years} later</span>
        <strong>
          {t.title}, {t.place}
        </strong>
        <span>
          {money(salary(t.wage))}/yr · {money(t.wage, true)}/hr
        </span>
        <span className="muted small">
          {t.tier === 'top'
            ? 'You hit your year-one milestone, so you start a rung higher.'
            : `You missed your year-one milestone. Second chance: ${t.levelUp?.toLowerCase()}${t.next ? ` (${money(salary(t.next.wage))}/yr)` : ''}.`}{' '}
          Then: a bigger budget, a nicer car, maybe a house.
        </span>
      </div>
      <div className="row">
        <button className="btn primary" onClick={onNext} autoFocus>
          Continue to the next phase ▶
        </button>
        <button className="btn" onClick={onNewGame}>
          New life
        </button>
        <button className="btn" onClick={onQuit}>
          Title screen
        </button>
      </div>
    </div>
  );
}

export function YearOneDetails({ y1 }: { y1: YearOne }) {
  return (
    <details className="y1-card">
      <summary>
        Year-one report card: <b>{y1.grade}</b> · {y1.total}/1000 · “{y1.title}”
      </summary>
      <div className="score-lines">
        {y1.lines.map((l) => (
          <div key={l.label} className="score-line">
            <span>{l.label}</span>
            <span className="muted">{l.value}</span>
            <span className="pts">
              {l.points}/{l.max}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

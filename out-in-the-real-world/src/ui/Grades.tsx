// College grades: a compact sidebar card and the full Grades screen.
import { gpaText, gradesView, letterOf, type GradesView } from '../content/college.ts';
import type { GameState } from '../engine/types.ts';
import { Icon } from './common.tsx';
import './grades.css';

const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v)}%`);
const tone = (letter: string): string => (letter.startsWith('A') ? 'a' : letter.startsWith('B') ? 'b' : letter.startsWith('C') ? 'c' : letter === '—' ? '' : 'f');

// Sidebar: GPA, the next thing due, and a button to the full view.
export function GradesMini({ g, onOpen }: { g: GameState; onOpen: () => void }) {
  const v = gradesView(g);
  if (!v) return null;
  const next = v.upcoming[0];
  return (
    <div className="grades-mini">
      <h4>
        <Icon name="class" size={12} /> {v.major} · GPA <strong className={`gpa-num ${tone(v.live === null ? '—' : gpaLetter(v.live))}`}>{gpaText(v.live)}</strong>
      </h4>
      {v.probation && <div className="gm-warn">Academic probation</div>}
      {next && (
        <div className="gm-next">
          Next: {next.label} <span className="muted">(wk {next.week})</span>
        </div>
      )}
      <button className="btn small" onClick={onOpen}>
        Grades ▶
      </button>
    </div>
  );
}

// GPA back to a letter-ish tone for coloring.
function gpaLetter(gpa: number): string {
  return gpa >= 3.5 ? 'A' : gpa >= 2.7 ? 'B' : gpa >= 2.0 ? 'C' : 'F';
}

export function GradesPanel({ g }: { g: GameState }) {
  const v: GradesView | null = gradesView(g);
  if (!v) return <p>You’re not in college.</p>;
  return (
    <div className="grades">
      <div className="grades-top">
        <div>
          <small>Major</small>
          <strong>{v.major}</strong>
          <span className="muted">{v.level} classes</span>
        </div>
        <div>
          <small>{v.termGpa !== null ? 'Semester GPA' : 'Year GPA'}</small>
          <strong className="gpa-num">{gpaText(v.termGpa ?? v.cum)}</strong>
          <span className="muted">Overall {gpaText(v.live)}</span>
        </div>
        <div>
          <small>Credits</small>
          <strong>{v.credits}</strong>
          <span className="muted">of 120</span>
        </div>
      </div>
      <p className={`grades-note ${v.probation || (v.live ?? 4) < 3 ? 'warn' : ''}`}>
        {v.probation ? 'Academic probation: only 1 free skip per class. ' : ''}
        {v.scholarship}.
      </p>
      {v.courses.length > 0 && (
        <>
          <h4>{v.term}</h4>
          <ul className="course-list">
            {v.courses.map((c) => (
              <li key={c.name}>
                <span className={`grade-letter ${tone(c.letter)}`}>{c.letter}</span>
                <div>
                  <strong>
                    {c.name} <span className="muted">· {c.credits} cr · {c.diff}</span>
                  </strong>
                  <span className="course-parts">
                    <span>Attend {pct(c.att)}</span> · <span>HW {c.hwCount ? pct(c.hw) : '—'}</span> · <span>Mid {pct(c.mid)}</span> · <span>Final {pct(c.fin)}</span>
                    {c.bonus > 0 && (
                      <>
                        {' '}
                        · <span>+{c.bonus} office hrs</span>
                      </>
                    )}
                  </span>
                </div>
                <span className="course-pct">{pct(c.pct)}</span>
              </li>
            ))}
          </ul>
          <div className="grades-prep">
            <span>
              Exam prep: <strong>{v.prep}</strong> of {v.need} study sessions
            </span>
            <span>
              Skipped: <strong>{v.missed}</strong> ({v.free} free)
            </span>
          </div>
          <p className="muted small">Grades: attendance 10%, assignments 30%, midterm 25%, final 35%. Office hours add a few points.</p>
        </>
      )}
      {v.upcoming.length > 0 && (
        <>
          <h4>
            <Icon name="calendar" size={12} /> Coming up
          </h4>
          <ul className="due-list">
            {v.upcoming.map((u) => (
              <li key={u.week + u.label} className={u.week === g.week ? 'now' : ''}>
                <span>Week {u.week}</span> {u.label}
              </li>
            ))}
          </ul>
        </>
      )}
      {v.past.length > 0 && (
        <>
          <h4>Report cards</h4>
          {v.past.map((t) => (
            <div key={t.name} className="past-term">
              <strong>
                {t.name}: GPA {gpaText(t.gpa)}
              </strong>{' '}
              <span className="muted">
                {t.grades.map((x) => `${letterOf(x.pct)}`).join(' · ')} · {t.earned}/{t.attempted} credits
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

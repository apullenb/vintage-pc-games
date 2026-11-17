// Runs an action mini-game like an arcade cabinet: a title card (name, 3-icon controls cheat sheet,
// what's at stake) -> the game -> a graded run (letter + stars, "Play again?") -> the outcome.
// Replays happen here, before onFinish: the engine applies the accepted run exactly once.
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { MINIGAMES } from '../content/minigames/index.ts';
import { SKIP_SCORE, txt } from '../engine/engine.ts';
import type { GameState, MiniResult, Step } from '../engine/types.ts';
import { MINIGAME_UI, preloadMinigame } from '../minigames/index.ts';
import { reducedMotion } from './a11y.ts';
import { sfx } from './audio.ts';
import { DeltaChips, Icon, Paras, SceneCanvas } from './common.tsx';

// ---------- controls cheat sheets ----------
interface Ctl {
  key: string; // keyboard cap(s)
  touch: string; // what to do on a phone
  does: string;
}
type Ctls = [Ctl, Ctl, Ctl];

const SHIFT_CTLS: Record<string, Ctls> = {
  home: [
    { key: 'SPACE', touch: 'SCAN', does: 'Scan at the red laser' },
    { key: '↓ ↑', touch: 'BOTTOM / TOP', does: 'Heavy down, squishy up' },
    { key: '←', touch: 'FIX $', does: 'Fix a wrong sale price' },
  ],
  college: [
    { key: '← →', touch: 'Tap a cart', does: 'Steer the book' },
    { key: '↓', touch: 'DROP', does: 'Drop it fast' },
    { key: 'A–Z', touch: 'HOLD slip', does: 'Match the first letter' },
  ],
  trade: [
    { key: '← → SPACE', touch: 'Drag', does: 'Wire onto its screw' },
    { key: '↑', touch: 'Tap breaker', does: 'Kill sparking power' },
    { key: '🎨', touch: '🎨', does: 'Black/red hot, white neutral, green ground' },
  ],
  work: [
    { key: '← →', touch: 'Drag', does: 'Walk under parcels' },
    { key: '×3', touch: '×3', does: 'Carry up to three' },
    { key: 'ZONE', touch: 'ZONE', does: 'Stop at the matching chute' },
  ],
};

function controlsFor(id: string, g: GameState, data: Record<string, number | string>): Ctls | null {
  switch (id) {
    case 'roadtest':
      return [
        { key: '↑ ↓', touch: 'GAS / BRAKE', does: 'Speed (watch the limit)' },
        { key: '← →', touch: '◀ ▶', does: 'Steer, change lanes' },
        { key: 'SPACE', touch: 'SIGNAL', does: 'Signal before you turn' },
      ];
    case 'delivery':
      return [
        { key: 'ARROWS', touch: 'D-pad / hold map', does: 'Drive, follow the GPS dots' },
        { key: 'SPACE', touch: 'SLOW', does: 'Slow zone, hand-off stops' },
        { key: 'SHIFT', touch: data.vehicle === 'bike' ? 'SPRINT' : 'BOOST', does: data.vehicle === 'bike' ? 'Sprint (tires you)' : 'Speed burst ×3' },
      ];
    case 'shift':
      return SHIFT_CTLS[g.path] ?? SHIFT_CTLS.work;
    case 'busdash':
      return [
        { key: '↑ SPACE', touch: 'Tap / JUMP', does: 'Jump low stuff (hold = higher)' },
        { key: '↓', touch: 'DUCK', does: 'Duck under high stuff' },
        { key: '☕', touch: '☕', does: 'Grab coffee for speed' },
      ];
    case 'grocery':
      return [
        { key: 'ARROWS', touch: 'D-pad / tap', does: 'Push the cart' },
        { key: 'SPACE', touch: 'GRAB', does: 'Grab list items' },
        { key: '← →', touch: 'Tap a tag', does: 'Pick the cheaper price' },
      ];
    case 'haggle':
      return [
        { key: '← →', touch: 'Tap a card', does: 'Pick the move that answers them' },
        { key: 'SPACE', touch: 'Deliver it!', does: 'Stop the meter in the green' },
        { key: '♥', touch: '♥', does: 'Don’t run out their patience' },
      ];
    case 'flashcards':
      return [
        { key: '← →', touch: '◀ ▶', does: 'Move the highlighter' },
        { key: 'SPACE', touch: 'Tap a card', does: 'Zap the matching term' },
        { key: '🔥', touch: '🔥', does: 'First-try hits build a combo' },
      ];
    case 'moving':
      return [
        { key: '← → ↑', touch: 'Drag', does: 'Move and rotate the item' },
        { key: 'SPACE', touch: 'Let go', does: 'Drop it in the truck' },
        { key: '↓', touch: 'BRAKE', does: 'Brake for every bump' },
      ];
    default:
      return null;
  }
}

// ---------- grading ----------
export function gradeOf(score: number): { letter: string; stars: number; line: string; cls: string } {
  if (score >= 0.95) return { letter: 'S', stars: 3, line: 'Legendary run!', cls: 's' };
  if (score >= 0.8) return { letter: 'A', stars: 3, line: 'Great run!', cls: 'a' };
  if (score >= 0.6) return { letter: 'B', stars: 2, line: 'Solid work.', cls: 'b' };
  if (score >= 0.4) return { letter: 'C', stars: 1, line: 'Not bad. You can do better.', cls: 'c' };
  return { letter: 'D', stars: 0, line: 'Rough one. Want another go?', cls: 'd' };
}

// Game-specific verdicts that matter more than the letter (did you pass? make the bus?).
function verdictOf(id: string, score: number, stats?: Record<string, number>): string | null {
  if (id === 'roadtest') return score >= 0.6 ? 'PASSED!' : 'NOT A PASS';
  if (id === 'busdash') return stats?.made ? 'MADE THE BUS!' : 'MISSED THE BUS';
  if (id === 'delivery' && stats?.earned !== undefined) return `$${stats.earned} EARNED`;
  return null;
}

function isTouch(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
}

function Loading() {
  return (
    <div className="mg-loading" role="status">
      <span>LOADING</span>
      <i />
      <i />
      <i />
    </div>
  );
}

// If a game's chunk can't load (flaky connection), don't take the whole app down with it.
class LoadGuard extends Component<{ children: ReactNode; onSkip: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mg-loading" role="alert">
        <span>Couldn’t load this mini-game.</span>
        <button className="btn" onClick={this.props.onSkip}>
          Skip (auto-play, −$10)
        </button>
      </div>
    );
  }
}

function Stars({ n }: { n: number }) {
  return (
    <span className="mg-stars" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <b key={i} className={i < n ? 'on' : ''} style={{ animationDelay: `${0.35 + i * 0.18}s` }}>
          ★
        </b>
      ))}
    </span>
  );
}

interface Run {
  score: number;
  stats?: Record<string, number>;
}

export function MiniGameHost({ g, head, onFinish, onContinue }: { g: GameState; head: Extract<Step, { t: 'minigame' }>; onFinish: (r: MiniResult) => void; onContinue: () => void }) {
  const def = MINIGAMES[head.id];
  const Game = MINIGAME_UI[head.id];
  const data = head.data ?? {};
  const [phase, setPhase] = useState<'intro' | 'play' | 'graded'>('intro');
  const [runKey, setRunKey] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [tries, setTries] = useState(0);
  const [touch, setTouch] = useState(isTouch);
  useEffect(() => {
    setPhase('intro');
    setRun(null);
    setTries(0);
  }, [head.id, g.week]);
  useEffect(() => preloadMinigame(head.id), [head.id]);

  const title = txt(def.title, g, data);
  const art = typeof def.art === 'function' ? def.art(g) : def.art;
  const ctls = controlsFor(head.id, g, data);
  const grade = run ? gradeOf(run.score) : null;

  const start = (): void => {
    sfx('select');
    setTries((n) => n + 1);
    setRunKey((k) => k + 1);
    setPhase('play');
  };

  if (head.result) {
    return (
      <>
        <div className="scene-frame">
          <SceneCanvas art={art} look={g.look} path={g.path} />
          <div className="scene-tag">
            <span className="speaker">{title}</span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-inner scene">
            <div className="panel-head">
              <h3>{title}: results</h3>
              {grade && <span className={`mg-chip ${grade.cls}`}>{grade.letter}</span>}
            </div>
            <div className="story result">
              <Paras text={head.result.text} />
            </div>
            <DeltaChips d={head.result.deltas} />
            {head.result.tip && (
              <div className="tip">
                <Icon name="book" /> <span>{head.result.tip}</span>
              </div>
            )}
            <button className="btn primary" onClick={onContinue} autoFocus>
              Continue
            </button>
          </div>
        </div>
      </>
    );
  }

  if (phase === 'play') {
    return (
      <div className="mini-stage" role="application" aria-label={title}>
        <LoadGuard onSkip={() => onFinish({ score: SKIP_SCORE, played: false })}>
          <Suspense fallback={<Loading />}>
            <Game
              key={runKey}
              s={g}
              data={data}
              reducedMotion={reducedMotion()}
              onDone={(r) => {
                const gr = gradeOf(r.score);
                sfx(gr.stars >= 3 ? 'star' : gr.stars >= 2 ? 'good' : 'bad');
                setRun({ score: r.score, stats: r.stats });
                setPhase('graded');
              }}
            />
          </Suspense>
        </LoadGuard>
        <div className="mini-actions">
          <button className="btn small ghost" onClick={() => setRunKey((k) => k + 1)}>
            Restart
          </button>
          <button className="btn small ghost" onClick={() => onFinish({ score: SKIP_SCORE, played: false })}>
            Give up (auto-play, −$10)
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'graded' && run && grade) {
    const verdict = verdictOf(head.id, run.score, run.stats);
    return (
      <div className="mini-stage mg-graded" role="dialog" aria-label={`${title} results`}>
        <p className="mg-kicker">{title}</p>
        <div className={`mg-grade ${grade.cls}`}>
          <span className="mg-letter" aria-label={`Grade ${grade.letter}`}>
            {grade.letter}
          </span>
          <div>
            <Stars n={grade.stars} />
            {verdict && <p className="mg-verdict">{verdict}</p>}
            <p className="mg-line">{grade.line}</p>
            <p className="mg-score">Score {Math.round(run.score * 100)}%{tries > 1 ? ` · try #${tries}` : ''}</p>
          </div>
        </div>
        <div className="mg-btns">
          <button className="btn primary big" autoFocus onClick={() => onFinish({ score: run.score, stats: run.stats, played: true })}>
            Keep this run ▶
          </button>
          <button className="btn big" onClick={start}>
            ↻ Play again?
          </button>
        </div>
        <p className="muted small mg-note">Only the run you keep counts. Playing again replaces this one.</p>
      </div>
    );
  }

  return (
    <>
      <div className="scene-frame mg-titlecard">
        <SceneCanvas art={art} look={g.look} path={g.path} />
        <div className="mg-title" aria-hidden="true">
          <small>MINI-GAME</small>
          <b>{title}</b>
        </div>
      </div>
      <div className="panel">
        <div className="panel-inner mini-intro">
          <div className="panel-head">
            <h3>{title}</h3>
            <span className="tag good">Action!</span>
          </div>
          {ctls && (
            <div className="mg-ctl">
              <div className="mg-ctl-tabs" role="tablist" aria-label="Controls for">
                <button role="tab" aria-selected={!touch} className={!touch ? 'on' : ''} onClick={() => setTouch(false)}>
                  ⌨ Keys
                </button>
                <button role="tab" aria-selected={touch} className={touch ? 'on' : ''} onClick={() => setTouch(true)}>
                  👆 Touch
                </button>
              </div>
              <ul>
                {ctls.map((c, i) => (
                  <li key={i}>
                    <kbd className={touch ? 'tch' : ''}>{touch ? c.touch : c.key}</kbd>
                    <span>{c.does}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="stakes">
            <strong>What’s at stake:</strong> {txt(def.stakes, g, data)}
          </p>
          <details className="mg-rules" open={!ctls}>
            <summary>Full how-to</summary>
            <p>{txt(def.how, g, data)}</p>
          </details>
          <div className="row">
            <button className="btn primary big" autoFocus onClick={start}>
              Play ▶
            </button>
            <button className="btn" onClick={() => onFinish({ score: SKIP_SCORE, played: false })} title="Skip and take an average-ish result">
              Skip (auto-play, −$10)
            </button>
          </div>
          <p className="muted small">Skipping costs $10 and gives a so-so result. Playing well beats it, and you can retry before you keep a run.</p>
        </div>
      </div>
    </>
  );
}

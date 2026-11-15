// Runs an action mini-game: intro card (how to play, what's at stake) -> the game -> the result.
import { useEffect, useState } from 'react';
import { MINIGAMES } from '../content/minigames/index.ts';
import { SKIP_SCORE, txt } from '../engine/engine.ts';
import type { GameState, MiniResult, Step } from '../engine/types.ts';
import { MINIGAME_UI } from '../minigames/index.ts';
import { reducedMotion } from './a11y.ts';
import { sfx } from './audio.ts';
import { DeltaChips, Icon, Paras, SceneCanvas } from './common.tsx';

export function MiniGameHost({ g, head, onFinish, onContinue }: { g: GameState; head: Extract<Step, { t: 'minigame' }>; onFinish: (r: MiniResult) => void; onContinue: () => void }) {
  const def = MINIGAMES[head.id];
  const Game = MINIGAME_UI[head.id];
  const data = head.data ?? {};
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');
  const [runKey, setRunKey] = useState(0);
  useEffect(() => setPhase('intro'), [head.id, g.week]);

  const title = txt(def.title, g, data);

  if (head.result) {
    return (
      <>
        <div className="scene-frame">
          <SceneCanvas art={def.art} look={g.look} path={g.path} />
          <div className="scene-tag">
            <span className="speaker">{title}</span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-inner scene">
            <div className="panel-head">
              <h3>{title}: results</h3>
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
        <Game
          key={runKey}
          s={g}
          data={data}
          reducedMotion={reducedMotion()}
          onDone={(r) => {
            sfx(r.score >= 0.6 ? 'good' : 'bad');
            onFinish({ score: r.score, stats: r.stats, played: true });
          }}
        />
        <div className="mini-actions">
          <button className="btn small ghost" onClick={() => setRunKey((k) => k + 1)}>
            Restart
          </button>
          <button className="btn small ghost" onClick={() => onFinish({ score: SKIP_SCORE, played: false })}>
            Give up (auto-play)
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="scene-frame">
        <SceneCanvas art={def.art} look={g.look} path={g.path} />
        <div className="scene-tag">
          <span className="speaker">Mini-game</span>
        </div>
      </div>
      <div className="panel">
        <div className="panel-inner mini-intro">
          <div className="panel-head">
            <h3>{title}</h3>
            <span className="tag good">Action!</span>
          </div>
          <p>
            <strong>How to play:</strong> {txt(def.how, g, data)}
          </p>
          <p className="stakes">
            <strong>What’s at stake:</strong> {txt(def.stakes, g, data)}
          </p>
          <div className="row">
            <button
              className="btn primary big"
              autoFocus
              onClick={() => {
                sfx('select');
                setPhase('play');
              }}
            >
              Play ▶
            </button>
            <button className="btn" onClick={() => onFinish({ score: SKIP_SCORE, played: false })} title="Skip and take an average-ish result">
              Skip (auto-play)
            </button>
          </div>
          <p className="muted small">Skipping gives a so-so result. Playing well beats it.</p>
        </div>
      </div>
    </>
  );
}

// Top level: title screen, character creation, and the game.
import { useEffect, useState } from 'react';
import { HAIR_STYLES, HAIRS, SHIRTS, SKINS, playerPerson } from '../art/people.ts';
import { PATHS, newState } from '../content/paths.ts';
import { begin } from '../engine/engine.ts';
import type { GameState, Look, PathId } from '../engine/types.ts';
import { applyBigText } from './a11y.ts';
import { setMuted, sfx } from './audio.ts';
import { Icon, PersonCanvas, SceneCanvas } from './common.tsx';
import { Game } from './Game.tsx';
import { loadGame, loadMeta, mergeMeta, saveGame, saveMeta, type Meta } from './save.ts';

type Screen = 'title' | 'create' | 'game';

export function App() {
  const [meta, setMetaRaw] = useState<Meta>(loadMeta);
  const [g, setGRaw] = useState<GameState | null>(loadGame);
  const [screen, setScreen] = useState<Screen>('title');

  useEffect(() => setMuted(meta.muted), [meta.muted]);
  useEffect(() => applyBigText(meta.bigText), [meta.bigText]);

  const setMeta = (m: Meta): void => {
    setMetaRaw(m);
    saveMeta(m);
  };
  const setG = (next: GameState | null): void => {
    setGRaw(next);
    saveGame(next);
    if (next) {
      const m = mergeMeta(meta, next);
      if (m !== meta) setMeta(m);
    }
  };

  if (screen === 'game' && g) return <Game g={g} setG={setG} meta={meta} setMeta={setMeta} onQuit={() => setScreen('title')} />;
  if (screen === 'create')
    return (
      <Create
        onBack={() => setScreen('title')}
        onStart={(name, look, path) => {
          setG(begin(newState(name, look, path, (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0)));
          setScreen('game');
        }}
      />
    );
  return (
    <Title
      meta={meta}
      canContinue={!!g && !(g.over && g.queue[0]?.t !== 'ending')}
      g={g}
      onContinue={() => setScreen('game')}
      onNew={() => {
        if (g && !g.over && !confirm('Start a new life? Your current game will be replaced.')) return;
        setScreen('create');
      }}
      onMute={() => setMeta({ ...meta, muted: !meta.muted })}
    />
  );
}

function Title({ meta, canContinue, g, onContinue, onNew, onMute }: { meta: Meta; canContinue: boolean; g: GameState | null; onContinue: () => void; onNew: () => void; onMute: () => void }) {
  const look: Look = g?.look ?? { skin: 1, hair: 0, hairStyle: 3, shirt: 1 };
  return (
    <div className="title-screen">
      <div className="title-art">
        <SceneCanvas art="street" look={look} speaker="rae" />
      </div>
      <div className="title-card">
        <h1>
          <span>Out in the</span> <span>Real World</span>
        </h1>
        <p className="tagline">You just graduated. Now the bills have your name on them.</p>
        <div className="title-btns">
          {canContinue && g && (
            <button className="btn primary big" onClick={() => { sfx('select'); onContinue(); }}>
              Continue <small>Week {g.week} · {g.name}</small>
            </button>
          )}
          <button className={`btn big ${canContinue ? '' : 'primary'}`} onClick={() => { sfx('select'); onNew(); }}>
            New life
          </button>
        </div>
        {Object.keys(meta.best).length > 0 && (
          <div className="bests">
            {PATHS.map((p) => {
              const b = meta.best[p.id];
              return (
                <span key={p.id} className="best">
                  {p.name}: {b ? `${b.grade} (${b.score})` : '—'}
                </span>
              );
            })}
          </div>
        )}
        <p className="muted small">
          Unlocked: {meta.handbook.length} handbook pages · {meta.achievements.length} achievements
        </p>
        <button className="icon-btn corner" onClick={onMute} aria-label={meta.muted ? 'Unmute' : 'Mute'}>
          <Icon name={meta.muted ? 'mute' : 'sound'} />
        </button>
      </div>
    </div>
  );
}

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: number; onPick: (i: number) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      <span className="sw-label">{label}</span>
      {colors.map((c, i) => (
        <button key={c} role="radio" aria-checked={value === i} aria-label={`${label} ${i + 1}`} className={`sw ${value === i ? 'on' : ''}`} style={{ background: c }} onClick={() => { sfx('click'); onPick(i); }} />
      ))}
    </div>
  );
}

function Create({ onBack, onStart }: { onBack: () => void; onStart: (name: string, look: Look, path: PathId) => void }) {
  const [name, setName] = useState('');
  const [look, setLook] = useState<Look>({ skin: Math.floor(Math.random() * 6), hair: Math.floor(Math.random() * 6), hairStyle: Math.floor(Math.random() * HAIR_STYLES.length), shirt: Math.floor(Math.random() * 8) });
  const [path, setPath] = useState<PathId | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const person = playerPerson(look);

  if (step === 1)
    return (
      <div className="create">
        <h2>Who are you?</h2>
        <div className="create-body">
          <div className="avatar">
            <PersonCanvas person={person} scale={6} />
          </div>
          <div className="create-form">
            <label className="field">
              <span>Your name</span>
              <input value={name} maxLength={14} placeholder="Alex" onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <Swatches label="Skin" colors={SKINS} value={look.skin} onPick={(i) => setLook({ ...look, skin: i })} />
            <Swatches label="Hair" colors={HAIRS} value={look.hair} onPick={(i) => setLook({ ...look, hair: i })} />
            <div className="swatches">
              <span className="sw-label">Style</span>
              {HAIR_STYLES.map((h, i) => (
                <button key={h} className={`pill ${look.hairStyle === i ? 'on' : ''}`} onClick={() => { sfx('click'); setLook({ ...look, hairStyle: i }); }}>
                  {h}
                </button>
              ))}
            </div>
            <Swatches label="Shirt" colors={SHIRTS} value={look.shirt} onPick={(i) => setLook({ ...look, shirt: i })} />
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={onBack}>
            Back
          </button>
          <button className="btn primary" onClick={() => { sfx('select'); setStep(2); }}>
            Next: choose your start ▶
          </button>
        </div>
      </div>
    );

  return (
    <div className="create">
      <h2>Graduation day. What’s next?</h2>
      <p className="muted">Every start has real tradeoffs. There’s no wrong answer, just different problems.</p>
      <div className="paths">
        {PATHS.map((p) => (
          <button key={p.id} className={`path ${path === p.id ? 'on' : ''}`} onClick={() => { sfx('select'); setPath(p.id); }}>
            <div className="path-art">
              <SceneCanvas art={p.art} look={look} />
            </div>
            <div className="path-body">
              <h3>{p.name}</h3>
              <span className="diff">{'●'.repeat(p.difficulty)}{'○'.repeat(3 - p.difficulty)} difficulty</span>
              <p>{p.tagline}</p>
              <ul>
                {p.perks.map((x) => (
                  <li key={x} className="perk">
                    ✓ {x}
                  </li>
                ))}
                {p.risks.map((x) => (
                  <li key={x} className="risk">
                    ✗ {x}
                  </li>
                ))}
              </ul>
            </div>
          </button>
        ))}
      </div>
      <div className="row sticky-row">
        <button className="btn" onClick={() => setStep(1)}>
          Back
        </button>
        <button className="btn primary big" disabled={!path} onClick={() => path && onStart(name, look, path)}>
          Start my life ▶
        </button>
      </div>
    </div>
  );
}

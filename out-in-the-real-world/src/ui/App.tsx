// Top level: title screen, character creation, and the game.
import { useEffect, useMemo, useState } from 'react';
import { BOSSES, HAIR_STYLES, HAIRS, SHIRTS, SKINS, playerPerson, type Outfit } from '../art/people.ts';
import { mix } from '../art/px.ts';
import { PATHS, newState } from '../content/paths.ts';
import { begin } from '../engine/engine.ts';
import { YEAR1_WEEKS, canStartPhase2 } from '../content/phase2.ts';
import type { GameState, Look, NpcId, PathId } from '../engine/types.ts';
import { applyBigText } from './a11y.ts';
import { setMuted, sfx } from './audio.ts';
import { reducedMotion } from './a11y.ts';
import { Icon, PersonCanvas, Portrait, SceneCanvas, TitleCanvas, type Expr } from './common.tsx';
import { Game } from './Game.tsx';
import { RESUME_KEY } from '../minigames/index.ts';
import { loadGame, loadMeta, mergeMeta, saveGame, saveMeta, type Meta } from './save.ts';

type Screen = 'title' | 'create' | 'game';

export function App() {
  const [meta, setMetaRaw] = useState<Meta>(loadMeta);
  const [g, setGRaw] = useState<GameState | null>(loadGame);
  const [screen, setScreen] = useState<Screen>(() => {
    // Coming back from an automatic reload (a new version was deployed mid-game): resume play.
    try {
      if (sessionStorage.getItem(RESUME_KEY) === '1') {
        sessionStorage.removeItem(RESUME_KEY);
        if (loadGame()) return 'game';
      }
    } catch {
      // storage unavailable
    }
    return 'title';
  });

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

  if (screen === 'game' && g)
    return (
      <Game
        g={g}
        setG={setG}
        meta={meta}
        setMeta={setMeta}
        onQuit={() => setScreen('title')}
        onNewGame={() => {
          // The finished year is already counted in best scores and unlocks; start fresh.
          setG(null);
          setScreen('create');
        }}
      />
    );
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
      canContinue={!!g && (!g.over || canStartPhase2(g))}
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
        <TitleCanvas look={look} />
        <h1 className="logo">
          <span className="logo-1">Out in the</span> <span className="logo-2">Real World</span>
          <i className="logo-gleam" aria-hidden="true" />
          <i className="logo-spark" aria-hidden="true" />
        </h1>
      </div>
      <div className="title-card pixel-frame">
        <p className="tagline">You just graduated. Now the bills have your name on them.</p>
        <div className="title-btns">
          {canContinue && g && (
            <button className="btn primary big" onClick={() => { sfx('select'); onContinue(); }}>
              Continue <small>{canStartPhase2(g) ? 'Year one done' : g.phase2 ? `Next phase, week ${g.week - YEAR1_WEEKS}` : `Week ${Math.min(g.week, YEAR1_WEEKS)}`} · {g.name}</small>
            </button>
          )}
          <button className={`btn big ${canContinue ? '' : 'primary'}`} onClick={() => { sfx('select'); onNew(); }}>
            New life
          </button>
          {g && g.over && !canStartPhase2(g) && (
            <button className="btn" onClick={() => { sfx('click'); onContinue(); }}>
              See {g.name}’s final results
            </button>
          )}
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
  const [wear, setWear] = useState<Outfit>('casual');
  const person = useMemo(() => playerPerson(look, wear), [look, wear]);
  const [mood, setMood] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => setMood((m) => (m + 1) % CREATOR_MOODS.length), 1800);
    return () => window.clearInterval(id);
  }, []);

  if (step === 1)
    return (
      <div className="create">
        <h2>Who are you?</h2>
        <div className="create-body">
          <div className="avatar">
            <Portrait person={person} expr={CREATOR_MOODS[mood]} talking={mood === 1} bg={mix(person.hood ?? person.shirt, '#2f4a7a', 0.6)} name={name.trim() || 'You'} className="creator-portrait" />
            <div className="avatar-body">
              <PersonCanvas person={person} scale={4} />
              <div className="wear" role="radiogroup" aria-label="Preview outfit">
                {(['casual', 'hoodie'] as Outfit[]).map((o) => (
                  <button key={o} role="radio" aria-checked={wear === o} className={`pill ${wear === o ? 'on' : ''}`} onClick={() => { sfx('click'); setWear(o); }}>
                    {o === 'casual' ? 'Out' : 'Home'}
                  </button>
                ))}
              </div>
            </div>
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
          <button key={p.id} className={`path ${path === p.id ? 'on' : ''}`} aria-pressed={path === p.id} onClick={() => { sfx('select'); setPath(p.id); }}>
            <div className="path-art">
              <SceneCanvas art={p.art} look={look} path={p.id} speaker={PATH_NPC[p.id]} outfit={p.art === 'jobsite' || p.art === 'warehouse' ? p.id : 'casual'} tod={PATH_TOD[p.id]} enter={false} />
              <Portrait person={BOSSES[p.id].p} bg={mix(BOSSES[p.id].p.coat ?? BOSSES[p.id].p.shirt, '#2a2a4a', 0.5)} className="path-boss" expr={path === p.id ? 'happy' : 'neutral'} />
            </div>
            <div className="path-body">
              <h3>{p.name}</h3>
              <span className="diff" aria-label={`Difficulty ${p.difficulty} of 3`}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={i < p.difficulty ? 'on' : 'off'}>
                    <Icon name="energy" size={12} />
                  </span>
                ))}
                <span className="diff-word">{['', 'Easy start', 'Some hustle', 'Hard mode'][p.difficulty]}</span>
              </span>
              <span className="path-boss-name">
                Boss: {BOSSES[p.id].name}
              </span>
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

const CREATOR_MOODS: Expr[] = ['neutral', 'happy', 'neutral', 'surprised', 'happy', 'worried'];
// Who's in each start's postcard, and the light it's painted in.
const PATH_NPC: Record<PathId, NpcId> = { home: 'mom', college: 'roommate', trade: 'boss', work: 'boss' };
const PATH_TOD = { home: 'morning', college: 'golden', trade: 'day', work: 'day' } as const;

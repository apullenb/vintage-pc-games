// Shared UI bits: pixel scene canvas, portraits, icons, tickers, delta chips, typewriter text.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isHome, type TimeOfDay, type Weather } from '../art/atmos.ts';
import { ICON_COLORS, ICON_GRID, iconPaths } from '../art/icons.ts';
import { CAST, type Outfit, type Person } from '../art/people.ts';
import { drawPersonHD } from '../art/hd/person.ts';
import { postFx } from '../art/hd/postfx.ts';
import { renderStage, STAGE_H, STAGE_W } from '../art/hd/stage.ts';
import { personKey, type Expr } from '../art/portraits.ts';
import { PHD, portraitHDBackdrop, portraitHDCanvas } from '../art/hd/portraitHD.ts';
import { hash } from '../art/px.ts';
import { paintTitleHD } from '../art/hd/titleHD.ts';
import { money } from '../engine/core.ts';
import type { ArtId, Deltas, Look, NpcId, PathId } from '../engine/types.ts';
import { reducedMotion } from './a11y.ts';
import { sfx } from './audio.ts';
import './chrome.css';

export type { TimeOfDay, Weather } from '../art/atmos.ts';
export type { Expr } from '../art/portraits.ts';

// ---------- scene canvas ----------
const SCENE_FPS = 12;
// path picks per-path NPC looks (the boss); night tints home scenes for evening.
// tod/weather add time-of-day light and weather; outfit dresses the player.
// When the location (or the speaker) changes, people walk in from the edges.
export function SceneCanvas({
  art,
  look,
  speaker,
  talking,
  hidePlayer,
  path,
  night,
  tod,
  weather,
  outfit,
  enter = true,
}: {
  art: ArtId;
  look: Look;
  speaker?: NpcId | null;
  talking?: boolean;
  hidePlayer?: boolean;
  path?: PathId | null;
  night?: boolean;
  tod?: TimeOfDay;
  weather?: Weather;
  outfit?: Outfit;
  enter?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ art, look, speaker, talking, hidePlayer, path, night, tod, weather, outfit, enter });
  props.current = { art, look, speaker, talking, hidePlayer, path, night, tod, weather, outfit, enter };
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d');
    if (!x) return;
    // The scene is composed off-screen, then run through the post pass onto the visible canvas.
    const work = document.createElement('canvas');
    work.width = STAGE_W;
    work.height = STAGE_H;
    const wx = work.getContext('2d');
    if (!wx) return;
    const still = reducedMotion();
    let raf = 0;
    let lastFrame = -1;
    let curArt: ArtId | null = null;
    let artT = 0;
    let curNpc: NpcId | null = null;
    let npcT = 0;
    let visible = true;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => (visible = es.some((e) => e.isIntersecting))) : null;
    io?.observe(c);
    const t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      const frame = Math.floor(t * SCENE_FPS);
      if (frame === lastFrame) return;
      if (!visible && lastFrame >= 0) return; // off-screen: skip work
      lastFrame = frame;
      const p = props.current;
      const sp = p.speaker && CAST[p.speaker] ? p.speaker : null;
      if (p.art !== curArt) {
        curArt = p.art;
        artT = t;
        curNpc = sp;
        npcT = t;
      } else if (sp !== curNpc) {
        curNpc = sp;
        npcT = t;
      }
      const walkIn = !still && p.enter !== false;
      const fx = renderStage(
        wx,
        {
          art: p.art,
          look: p.look,
          speaker: sp,
          talking: !!p.talking,
          hidePlayer: !!p.hidePlayer,
          path: p.path ?? null,
          night: !!p.night || (p.tod === 'night' && isHome(p.art)),
          tod: p.tod ?? 'day',
          weather: p.weather ?? null,
          outfit: p.outfit,
          kP: walkIn ? Math.min(1, (t - artT) / 0.9) : 1,
          kN: walkIn ? Math.min(1, (t - npcT) / 0.9) : 1,
          still,
        },
        t,
      );
      postFx(work, x, fx);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="scene-canvas hd" width={STAGE_W} height={STAGE_H} aria-hidden="true" />;
}

// A small standalone character render (character creator, portraits).
export function PersonCanvas({ person, scale = 4, talk = false }: { person: Person; scale?: number; talk?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Rendered at twice the display size so the smooth shapes stay crisp on dense screens.
  const k = scale * 2;
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const still = reducedMotion();
    let raf = 0;
    let last = -1;
    const t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      const f = Math.floor(t * 12);
      if (f === last) return;
      last = f;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, c.width, c.height);
      x.setTransform(k, 0, 0, k, 0, 0);
      drawPersonHD(x, person, 9, 35, {
        t: still ? 0 : t,
        talk: talk && Math.floor(t * 6) % 2 === 1,
        blink: !still && t % 3.4 < 0.12,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [person, talk, k]);
  return <canvas ref={ref} className="person-canvas hd" width={18 * k} height={36 * k} style={{ width: 18 * scale, height: 36 * scale }} aria-hidden="true" />;
}

// ---------- portraits ----------
// A smooth-shaded HD bust that blinks, breathes, and moves its mouth while talking.
export function Portrait({
  person,
  expr = 'neutral',
  talking = false,
  look = 0,
  bg,
  name,
  side = 'left',
  className = '',
}: {
  person: Person;
  expr?: Expr;
  talking?: boolean;
  look?: -1 | 0 | 1;
  bg?: string;
  name?: string;
  side?: 'left' | 'right';
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = useMemo(() => personKey(person), [person]);
  const props = useRef({ person, expr, talking, look, bg, key });
  props.current = { person, expr, talking, look, bg, key };
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    x.imageSmoothingEnabled = false;
    const still = reducedMotion();
    let raf = 0;
    let last = '';
    let nextBlink = 1.5 + Math.random() * 2;
    const t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      const p = props.current;
      if (t > nextBlink + 0.14) nextBlink = t + 2.2 + Math.random() * 3;
      const blink = t > nextBlink && t < nextBlink + 0.14;
      const tf = Math.floor(t * 9);
      const mouth = p.talking && !still ? ([1, 2, 1, 0, 2, 1, 0, 1][(tf + Math.floor(hash(Math.floor(t * 2)) * 3)) % 8] as 0 | 1 | 2) : 0;
      const bob = still ? 0 : Math.floor(t * 0.9) % 2;
      const sig = `${p.key}|${p.expr}|${mouth}|${blink}|${bob}|${p.look}|${p.bg}`;
      if (sig === last) return;
      last = sig;
      x.drawImage(portraitHDBackdrop(p.bg ?? '#8aa8d0', p.key.length), 0, 0);
      x.drawImage(portraitHDCanvas(p.person, { expr: p.expr, mouth, blink, look: p.look }, p.key), 0, bob * 2);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <figure className={`portrait ${side} ${talking ? 'is-talking' : ''} ${className}`}>
      <span className="portrait-frame">
        <canvas ref={ref} className="hd" width={PHD} height={PHD} aria-hidden="true" />
      </span>
      {name && <figcaption className="nameplate">{name}</figcaption>}
    </figure>
  );
}

// ---------- title scene ----------
export function TitleCanvas({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const work = document.createElement('canvas');
    work.width = STAGE_W;
    work.height = STAGE_H;
    const wx = work.getContext('2d');
    if (!wx) return;
    const still = reducedMotion();
    let raf = 0;
    let last = -1;
    const t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      const f = Math.floor(t * SCENE_FPS);
      if (f === last) return;
      last = f;
      postFx(work, x, paintTitleHD(wx, t, lookRef.current, still));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="scene-canvas title-canvas hd" width={STAGE_W} height={STAGE_H} aria-hidden="true" />;
}

// ---------- icons (crisp 12x12 pixel art) ----------
// The grid is drawn at a whole-number scale and centered in the requested box.
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const k = Math.max(1, Math.floor(size / ICON_GRID));
  const span = size / k;
  const off = -(span - ICON_GRID) / 2;
  return (
    <svg className="icon" width={size} height={size} viewBox={`${off} ${off} ${span} ${span}`} aria-hidden="true" shapeRendering="crispEdges">
      {iconPaths(name).map((p) => (
        <path key={p.color} d={p.d} fill={ICON_COLORS[p.color].fill} fillOpacity={ICON_COLORS[p.color].opacity} />
      ))}
    </svg>
  );
}

// ---------- tickers ----------
// Animates a number toward its new value (money counters that tick up and down).
export function useTicker(value: number, ms = 700): number {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  useEffect(() => {
    const a = cur.current;
    const b = value;
    if (a === b) return;
    if (reducedMotion() || Math.abs(b - a) < 0.5) {
      cur.current = b;
      setShown(b);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / ms);
      const v = k >= 1 ? b : a + (b - a) * (1 - (1 - k) ** 3);
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function TickMoney({ value, cents = false }: { value: number; cents?: boolean }) {
  const shown = useTicker(value);
  const prev = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (Math.abs(value - prev.current) < 0.5) return;
    setFlash(value > prev.current ? 'up' : 'down');
    prev.current = value;
    const id = window.setTimeout(() => setFlash(null), 1000);
    return () => window.clearTimeout(id);
  }, [value]);
  return <span className={`tick ${flash ?? ''}`}>{money(cents ? Math.round(shown * 100) / 100 : shown, cents)}</span>;
}

export function TickNumber({ value }: { value: number }) {
  return <>{Math.round(useTicker(value))}</>;
}

// ---------- chapter title card ----------
const VIGNETTES: { art: ArtId; tod: TimeOfDay; weather: Weather; outfit: Outfit }[] = [
  { art: 'bedroom', tod: 'morning', weather: null, outfit: 'casual' },
  { art: 'carlot', tod: 'day', weather: null, outfit: 'casual' },
  { art: 'apartment', tod: 'evening', weather: null, outfit: 'hoodie' },
  { art: 'street', tod: 'day', weather: 'snow', outfit: 'casual' },
  { art: 'road', tod: 'day', weather: 'rain', outfit: 'casual' },
  { art: 'beach', tod: 'golden', weather: null, outfit: 'casual' },
  // The next phase
  { art: 'office', tod: 'morning', weather: null, outfit: 'casual' },
  { art: 'carlot', tod: 'golden', weather: null, outfit: 'casual' },
  { art: 'street', tod: 'evening', weather: 'leaves', outfit: 'casual' },
];

export function ChapterCard({ n, title, subtitle, look, path, onDone, kicker }: { n: number; title: string; subtitle: string; look: Look; path: PathId; onDone: () => void; kicker?: string }) {
  const v = VIGNETTES[Math.min(n, VIGNETTES.length - 1)];
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const gone = useRef(false);
  const close = (): void => {
    if (gone.current) return;
    gone.current = true;
    setLeaving(true);
    window.setTimeout(() => done.current(), reducedMotion() ? 0 : 420);
  };
  useEffect(() => {
    sfx('week');
    // Capture phase, so keys meant for the card never reach the dialogue underneath.
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') return;
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
    {/* Blocks clicks to the game underneath while the card wipes in and out (clip-path lets clicks through). */}
    <div className="cc-block" aria-hidden="true" onClick={close} />
    <div className={`chapter-card ${leaving ? 'leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby="chapter-card-title" onClick={close}>
      <div className="cc-inner pixel-frame">
        {kicker && <span className="cc-kicker">{kicker}</span>}
        <span className="cc-num">Chapter {n + 1}</span>
        <div className="cc-vignette">
          <SceneCanvas art={v.art} look={look} path={path} tod={v.tod} weather={v.weather} outfit={v.outfit} />
        </div>
        <h2 id="chapter-card-title" className="cc-title">
          {title}
        </h2>
        <p className="cc-sub">{subtitle}</p>
        <button
          className="btn primary"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          Begin ▶
        </button>
      </div>
    </div>
    </>
  );
}

// ---------- chapter stars ----------
export function StarRow({ stars, max = 3 }: { stars: number; max?: number }) {
  return (
    <div className="star-row" role="img" aria-label={`${stars} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`big-star ${i < stars ? 'on' : 'off'}`} style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
          <Icon name="star" size={48} />
          {i < stars && (
            <>
              <i className="spark s1" />
              <i className="spark s2" />
              <i className="spark s3" />
            </>
          )}
        </span>
      ))}
    </div>
  );
}

// ---------- deltas ----------
export function DeltaChips({ d }: { d: Deltas }) {
  const items: { k: string; text: string; good: boolean }[] = [];
  const m = (v: number) => `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`;
  if (d.cash) items.push({ k: 'cash', text: `${m(d.cash)} checking`, good: d.cash > 0 });
  if (d.savings) items.push({ k: 'sav', text: `${m(d.savings)} savings`, good: d.savings > 0 });
  if (d.card) items.push({ k: 'card', text: `${m(d.card)} on card`, good: d.card < 0 });
  if (d.debt) items.push({ k: 'debt', text: `${m(d.debt)} loans`, good: d.debt < 0 });
  if (d.retire) items.push({ k: 'ret', text: `${m(d.retire)} retirement`, good: d.retire > 0 });
  if (d.energy) items.push({ k: 'en', text: `${d.energy > 0 ? '+' : '−'}${Math.abs(d.energy)} energy`, good: d.energy > 0 });
  if (d.rep) items.push({ k: 'rep', text: `${d.rep > 0 ? '+' : '−'}${Math.abs(d.rep)} boss rating`, good: d.rep > 0 });
  if (d.xp) items.push({ k: 'xp', text: `${d.xp > 0 ? '+' : '−'}${Math.abs(d.xp)} career`, good: d.xp > 0 });
  if (!items.length) return null;
  return (
    <div className="deltas">
      {items.map((i) => (
        <span key={i.k} className={`delta ${i.good ? 'good' : 'bad'}`}>
          {i.text}
        </span>
      ))}
    </div>
  );
}

// ---------- typewriter ----------
export function useTypewriter(full: string, fast: boolean): { shown: string; done: boolean; finish: () => void } {
  const [n, setN] = useState(fast ? full.length : 0);
  const key = useRef(full);
  if (key.current !== full) {
    key.current = full;
  }
  useEffect(() => {
    if (fast) {
      setN(full.length);
      return;
    }
    setN(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      if (i % 6 === 0) sfx('type');
      setN(Math.min(full.length, i));
      if (i >= full.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [full, fast]);
  return { shown: full.slice(0, n), done: n >= full.length, finish: () => setN(full.length) };
}

export function Paras({ text }: { text: string }) {
  return (
    <>
      {text.split('\n\n').map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

// Hint line: "✓ perk · ✗ risk" rendered as colored pieces.
export function Hint({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(' · ');
  return (
    <span className="hint">
      {parts.map((p, i) => {
        const cls = p.startsWith('✓') || p.startsWith('+') ? 'perk' : p.startsWith('✗') || p.startsWith('−') || p.startsWith('-') ? 'risk' : 'neutral';
        return (
          <span key={i} className={cls}>
            {p}
          </span>
        );
      })}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal pixel-frame ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" autoFocus>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// A segmented pixel bar. Losses leave a pale "ghost" that drains after a beat.
export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone: 'energy' | 'rep' | 'xp' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const [ghost, setGhost] = useState(pct);
  useEffect(() => {
    if (pct >= ghost) {
      setGhost(pct);
      return;
    }
    const id = window.setTimeout(() => setGhost(pct), 450);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);
  return (
    <span className={`bar ${tone} ${pct < 25 ? 'low' : ''}`}>
      <i className="bar-ghost" style={{ width: `${Math.max(pct, ghost)}%` }} />
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

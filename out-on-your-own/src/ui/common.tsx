// Shared UI bits: pixel scene canvas, icons, delta chips, typewriter text.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CAST, castFor, drawPerson, playerPerson, type Person } from '../art/people.ts';
import { H, W } from '../art/px.ts';
import { sceneDef } from '../art/scenes.ts';
import { money } from '../engine/core.ts';
import type { ArtId, Deltas, Look, NpcId, PathId } from '../engine/types.ts';
import { sfx } from './audio.ts';

// ---------- scene canvas ----------
// path picks per-path NPC looks (the boss); night tints home scenes for evening.
export function SceneCanvas({ art, look, speaker, talking, hidePlayer, path, night }: { art: ArtId; look: Look; speaker?: NpcId | null; talking?: boolean; hidePlayer?: boolean; path?: PathId | null; night?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ art, look, speaker, talking, hidePlayer, path, night });
  props.current = { art, look, speaker, talking, hidePlayer, path, night };
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d');
    if (!x) return;
    x.imageSmoothingEnabled = false;
    let raf = 0;
    let lastFrame = -1;
    const t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      const frame = Math.floor(t * 8);
      if (frame === lastFrame) return; // 8 fps, like the old days
      lastFrame = frame;
      const p = props.current;
      const def = sceneDef(p.art, { night: p.night, path: p.path });
      x.clearRect(0, 0, W, H);
      def.paint(x, t);
      const top = def.floor - 30;
      const npc = p.speaker && CAST[p.speaker] ? castFor(p.speaker, p.path).p : null;
      if (!p.hidePlayer) drawPerson(x, playerPerson(p.look), def.player - 7, top, Math.floor(t * 1.5) % 2, false, { blink: frame % 37 === 0, face: npc ? 1 : 0 });
      if (npc) {
        const talk = !!p.talking && Math.floor(t * 6) % 2 === 0;
        drawPerson(x, npc, def.npc - 7, top, Math.floor(t * 1.5 + 1) % 2, talk, { blink: frame % 43 === 20, face: -1 });
      }
      def.extras?.(x, t);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="scene-canvas" width={W} height={H} aria-hidden="true" />;
}

// A small standalone character render (character creator, portraits).
export function PersonCanvas({ person, scale = 4, talk = false }: { person: Person; scale?: number; talk?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    x.imageSmoothingEnabled = false;
    let raf = 0;
    let last = -1;
    const t0 = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const f = Math.floor(((now - t0) / 1000) * 1.5) % 2;
      const k = f * 2 + (talk && Math.floor((now - t0) / 160) % 2 ? 1 : 0);
      if (k === last) return;
      last = k;
      x.clearRect(0, 0, c.width, c.height);
      drawPerson(x, person, 2, 4, f, talk && k % 2 === 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [person, talk]);
  return <canvas ref={ref} className="person-canvas" width={18} height={36} style={{ width: 18 * scale, height: 36 * scale }} aria-hidden="true" />;
}

// ---------- icons (tiny pixel SVGs) ----------
const ICONS: Record<string, string> = {
  work: 'M3 6h10v8H3zM6 4h4v2H6z',
  class: 'M2 6l6-3 6 3-6 3zM4 8v3c2 2 6 2 8 0V8',
  rest: 'M3 10h10v3H3zM3 8h4v2H3zM11 3h3l-3 3h3',
  money: 'M3 4h10v8H3zM7 6h2v4H7z',
  friends: 'M3 7h4v6H3zM9 7h4v6H9zM4 3h2v3H4zM10 3h2v3h-2z',
  phone: 'M5 2h6v12H5zM7 12h2v1H7z',
  study: 'M3 3h5v10H3zM8 3h5v10H8z',
  food: 'M3 8h10v2H3zM4 10h8v3H4zM6 4h1v4H6zM9 4h1v4H9z',
  search: 'M3 3h7v7H3zM10 10l3 3',
  bank: 'M2 6l6-4 6 4zM3 7h2v5H3zM7 7h2v5H7zM11 7h2v5h-2zM2 13h12v1H2z',
  docs: 'M4 2h6l3 3v9H4zM6 7h5M6 9h5M6 11h3',
  car: 'M3 7l2-3h6l2 3h1v4H2V7zM4 11h2v2H4zM10 11h2v2h-2z',
  tools: 'M3 12l6-6M9 4l3 3M11 2l3 3-2 2-3-3z',
  tooth: 'M4 3h8v5l-1 6h-2l-1-3-1 3H5L4 8z',
  home: 'M2 8l6-5 6 5M4 7v6h8V7M7 10h2v3H7z',
  chart: 'M3 13V9M7 13V5M11 13V7M2 13h12',
  card: 'M2 4h12v8H2zM2 6h12v1H2zM4 9h3',
  star: 'M8 2l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z',
  heart: 'M8 13L3 8V5l2-2 3 2 3-2 2 2v3z',
  shield: 'M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4z',
  piggy: 'M3 6h9v6H3zM12 8h2v2h-2zM5 12h2v2H5zM9 12h2v2H9zM6 4h3v2H6z',
  energy: 'M9 1L3 9h4l-1 6 6-8H8z',
  boss: 'M4 6h8v8H4zM5 2h6v4H5z',
  calendar: 'M2 3h12v11H2zM2 6h12M5 1v3M11 1v3',
  book: 'M3 2h9v12H3zM5 2v12',
  trophy: 'M5 2h6v4c0 2-1 3-3 3S5 8 5 6zM3 3h2v3M11 3h2v3M7 9h2v3H7zM5 12h6v2H5z',
  sound: 'M2 6h3l4-3v10L5 10H2zM11 5c1 1 1 5 0 6',
  mute: 'M2 6h3l4-3v10L5 10H2zM11 6l3 4M14 6l-3 4',
  menu: 'M2 4h12M2 8h12M2 12h12',
  close: 'M3 3l10 10M13 3L3 13',
  check: 'M2 8l4 4 8-8',
  lock: 'M4 7h8v7H4zM5 7V4h6v3',
  wallet: 'M2 4h12v9H2zM10 7h4v3h-4z',
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const d = ICONS[name] ?? ICONS.star;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d={d} fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="miter" fillRule="evenodd" fillOpacity={0.35} />
    </svg>
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
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone: 'energy' | 'rep' | 'xp' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className={`bar ${tone} ${pct < 25 ? 'low' : ''}`}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

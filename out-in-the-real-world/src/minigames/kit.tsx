// Shared toolkit for action mini-games: input (keyboard + touch), a game loop, a pixel canvas, a HUD.
// Every mini-game is a React component taking MiniProps and calling onDone once with a 0..1 score.
import { useEffect, useRef, type ReactNode } from 'react';
import type { GameState } from '../engine/types.ts';

export interface MiniProps {
  s: GameState;
  data: Record<string, number | string>;
  onDone: (r: { score: number; stats?: Record<string, number> }) => void;
  reducedMotion: boolean;
}

// ---------- input ----------
// Normalized keys: 'left' | 'right' | 'up' | 'down' | 'action'. Pressed state + "just pressed" edges.
export type Key = 'left' | 'right' | 'up' | 'down' | 'action';
const MAP: Record<string, Key> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'action',
  Enter: 'action',
};

export interface Input {
  down: Set<Key>;
  pressed: Set<Key>; // keys that went down since the last frame (cleared by the loop)
  press: (k: Key) => void;
  release: (k: Key) => void;
}

export function useInput(): Input {
  const ref = useRef<Input | null>(null);
  if (!ref.current) {
    const down = new Set<Key>();
    const pressed = new Set<Key>();
    ref.current = {
      down,
      pressed,
      press: (k) => {
        if (!down.has(k)) pressed.add(k);
        down.add(k);
      },
      release: (k) => {
        down.delete(k);
      },
    };
  }
  useEffect(() => {
    const inp = ref.current!;
    const kd = (e: KeyboardEvent) => {
      const k = MAP[e.code];
      if (!k) return;
      e.preventDefault();
      inp.press(k);
    };
    const ku = (e: KeyboardEvent) => {
      const k = MAP[e.code];
      if (k) inp.release(k);
    };
    const blur = () => inp.down.clear();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return ref.current;
}

// ---------- loop ----------
// Calls step(dt seconds, t seconds) every animation frame while running. dt is clamped to 1/20 s.
export function useLoop(step: (dt: number, t: number) => void, running: boolean, input?: Input): void {
  const fn = useRef(step);
  fn.current = step;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      fn.current(dt, (now - t0) / 1000);
      input?.pressed.clear();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, input]);
}

// ---------- canvas ----------
// A crisp, pixel-scaled canvas. Draw into ref.current's 2D context at its logical size (default 192x108).
export function PixelCanvas({ canvasRef, width = 192, height = 108, onPointer }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; width?: number; height?: number; onPointer?: (x: number, y: number, kind: 'down' | 'move' | 'up') => void }) {
  const toLogical = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height];
  };
  return (
    <canvas
      ref={canvasRef}
      className="mini-canvas"
      width={width}
      height={height}
      style={{ aspectRatio: `${width} / ${height}` }}
      onPointerDown={onPointer ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); onPointer(...toLogical(e), 'down'); } : undefined}
      onPointerMove={onPointer ? (e) => onPointer(...toLogical(e), 'move') : undefined}
      onPointerUp={onPointer ? (e) => onPointer(...toLogical(e), 'up') : undefined}
    />
  );
}

export function ctxOf(c: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  const x = c?.getContext('2d') ?? null;
  if (x) x.imageSmoothingEnabled = false;
  return x;
}

// ---------- touch controls ----------
// On-screen buttons that feed the same Input as the keyboard. Shown on touch devices (and always usable).
export function TouchPad({ input, keys }: { input: Input; keys: { key: Key; label: string; wide?: boolean }[] }) {
  return (
    <div className="touchpad">
      {keys.map((k) => (
        <button
          key={k.key}
          className={`tp-btn ${k.wide ? 'wide' : ''}`}
          aria-label={k.key}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            input.press(k.key);
          }}
          onPointerUp={() => input.release(k.key)}
          onPointerCancel={() => input.release(k.key)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}

// ---------- HUD ----------
export function MiniHud({ items, children }: { items: { label: string; value: string | number; warn?: boolean }[]; children?: ReactNode }) {
  return (
    <div className="mini-hud">
      {items.map((i) => (
        <span key={i.label} className={i.warn ? 'warn' : ''}>
          <small>{i.label}</small>
          {i.value}
        </span>
      ))}
      {children}
    </div>
  );
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

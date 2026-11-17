// Shared toolkit for action mini-games: input (keyboard + touch), a game loop, a pixel canvas, a HUD.
// Every mini-game is a React component taking MiniProps and calling onDone once with a 0..1 score.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { GameState } from '../engine/types.ts';
import { cssGrade, glPresenter, webglAvailable, type PostOpts, type Presenter } from './hdPost.ts';
export type { PostOpts } from './hdPost.ts';

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
      presentAll();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, input]);
}

// ---------- canvas ----------
// A crisp, pixel-scaled canvas. Draw into ref.current's 2D context at its logical size (default 192x108).
//
// HD (opt-in via the `hd` prop): the game still draws in logical coordinates, but the backing store is
// `scale`x bigger (ctxOf applies the transform), so new art can use the extra detail: smooth gradients,
// sub-pixel shapes, soft shadows. With a post pass (the default for HD) each frame goes through a small
// WebGL stack on its way to the screen: soft upscale + edge smoothing, bloom on bright pixels, colour
// grade, vignette. Without WebGL it draws straight to the screen with a CSS grade. Without `hd`, nothing
// changes. Games opting in must draw through ctxOf (or hdScale) and avoid get/putImageData on the canvas.
export interface HdOpts {
  scale?: number; // internal resolution multiplier (default 3)
  post?: PostOpts | false; // post stack settings, or false for HD drawing with no post pass
  reducedMotion?: boolean; // halves bloom (bright flashes) for players who asked for calmer visuals
}
export type HdProp = boolean | number | HdOpts | undefined;

const SCALE = new WeakMap<HTMLCanvasElement, number>();
const LIVE = new Set<Presenter>();
let loopFrames = 0; // frames the game loop has presented (the idle presenter backs off while it runs)

// Internal pixels per logical pixel of a canvas (1 for classic canvases).
export function hdScale(c: HTMLCanvasElement | null | undefined): number {
  return (c && SCALE.get(c)) || 1;
}

// Called by useLoop right after each step, so the post pass shows the frame the game just drew.
function presentAll(): void {
  if (!LIVE.size) return;
  loopFrames++;
  for (const p of LIVE) p.present();
}

function normHd(hd: HdProp): { scale: number; post: PostOpts | false; rm: boolean } | null {
  if (!hd) return null;
  if (hd === true) return { scale: 3, post: {}, rm: false };
  if (typeof hd === 'number') return { scale: Math.max(1, Math.round(hd)), post: {}, rm: false };
  return { scale: Math.max(1, Math.round(hd.scale ?? 3)), post: hd.post === false ? false : (hd.post ?? {}), rm: !!hd.reducedMotion };
}

const prefersReduced = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export interface HdCanvasProps {
  key: string;
  ref: React.Ref<HTMLCanvasElement>;
  width?: number;
  height?: number;
  className: string;
  style?: React.CSSProperties;
}

// The plumbing behind PixelCanvas's `hd` prop, for games that render their own <canvas> element.
// Spread the result (minus key) on the canvas and pass `key` separately. canvasRef.current is always
// the canvas to draw into (an offscreen one while a post pass is active); pointer math should keep
// using the event's currentTarget, which is always the visible canvas.
export function useHdCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, width: number, height: number, hd: HdProp): HdCanvasProps {
  const cfg = normHd(hd);
  const post = cfg && cfg.post !== false ? cfg.post : null;
  const [mode, setMode] = useState<'gl' | '2d'>(() => (post && webglAvailable() ? 'gl' : '2d'));
  const off = useRef<HTMLCanvasElement | null>(null);
  const vis = useRef<HTMLCanvasElement | null>(null);
  const optsRef = useRef<PostOpts>({});
  if (post) {
    const o: PostOpts = { ...post };
    if (cfg!.rm || prefersReduced()) o.bloom = (o.bloom ?? 0.35) * 0.5;
    optsRef.current = o;
  }
  const scale = cfg?.scale ?? 1;
  if (post && mode === 'gl' && !off.current) {
    const c = document.createElement('canvas');
    // Anything that measures the drawing canvas gets the visible one's box.
    c.getBoundingClientRect = () => (vis.current ?? document.body).getBoundingClientRect();
    SCALE.set(c, scale);
    off.current = c;
  }
  if (off.current && (off.current.width !== width * scale || off.current.height !== height * scale)) {
    off.current.width = width * scale;
    off.current.height = height * scale;
    SCALE.set(off.current, scale);
  }

  useLayoutEffect(() => {
    if (!post || mode !== 'gl') return;
    const v = vis.current;
    const src = off.current;
    if (!v || !src) return;
    const p = glPresenter(v, src, optsRef.current, () => setMode('2d'));
    if (!p) {
      setMode('2d');
      return;
    }
    LIVE.add(p);
    p.present();
    let raf = 0;
    // Keep the screen fed while the game loop is paused (menus, end screens).
    let seen = -1;
    let quiet = 0;
    const idle = () => {
      raf = requestAnimationFrame(idle);
      quiet = loopFrames === seen ? quiet + 1 : 0;
      seen = loopFrames;
      if (quiet >= 2) p.present();
    };
    raf = requestAnimationFrame(idle);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => p.resize());
      ro.observe(v);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      LIVE.delete(p);
      p.destroy();
    };
  }, [mode, !!post]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return { key: 'px', ref: canvasRef, width, height, className: '' };
  if (!post || mode === '2d') {
    // Direct HD: the visible canvas is the drawing canvas. Without WebGL (or after a lost context) the
    // grade still applies as a cheap CSS filter; bloom and the shader vignette are skipped.
    return {
      key: post ? 'hd-2d' : 'hd',
      ref: (el: HTMLCanvasElement | null) => {
        canvasRef.current = el;
        if (el) SCALE.set(el, scale);
      },
      width: width * scale,
      height: height * scale,
      className: post ? 'hd hd-2d' : 'hd',
      style: post ? { filter: cssGrade(optsRef.current) } : undefined,
    };
  }
  return {
    key: 'hd-gl',
    ref: (el: HTMLCanvasElement | null) => {
      vis.current = el;
      canvasRef.current = el ? off.current : null;
    },
    className: 'hd hd-gl',
  };
}

export function PixelCanvas({ canvasRef, width = 192, height = 108, onPointer, hd }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; width?: number; height?: number; onPointer?: (x: number, y: number, kind: 'down' | 'move' | 'up') => void; hd?: HdProp }) {
  const toLogical = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height];
  };
  const { key, className, style, ...cv } = useHdCanvas(canvasRef, width, height, hd);
  return (
    <canvas
      key={key}
      {...cv}
      className={`mini-canvas ${className}`.trim()}
      style={{ aspectRatio: `${width} / ${height}`, ...style }}
      onPointerDown={onPointer ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); onPointer(...toLogical(e), 'down'); } : undefined}
      onPointerMove={onPointer ? (e) => onPointer(...toLogical(e), 'move') : undefined}
      onPointerUp={onPointer ? (e) => onPointer(...toLogical(e), 'up') : undefined}
    />
  );
}

// The canvas's 2D context, ready for logical-coordinate drawing (HD canvases get their scale transform).
export function ctxOf(c: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  const x = c?.getContext('2d') ?? null;
  if (x) {
    x.imageSmoothingEnabled = false;
    const s = SCALE.get(c!);
    if (s) x.setTransform(s, 0, 0, s, 0, 0);
  }
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

// ---------- shared lighting touches ----------
// A stepped pixel vignette: darker toward the edges and corners, so the middle of the scene pops.
export function vignette(x: CanvasRenderingContext2D, w: number, h: number, strength = 0.3, color = '20,12,32'): void {
  const steps = 6;
  for (let k = 0; k < steps; k++) {
    const a = strength * Math.pow(1 - k / steps, 2) * 0.55;
    x.fillStyle = `rgba(${color},${a.toFixed(3)})`;
    const b = k * 2;
    x.fillRect(b, b, w - b * 2, 2);
    x.fillRect(b, h - b - 2, w - b * 2, 2);
    x.fillRect(b, b + 2, 2, h - b * 2 - 4);
    x.fillRect(w - b - 2, b + 2, 2, h - b * 2 - 4);
  }
  // corners get a little extra
  const c = Math.round(Math.min(w, h) * 0.12);
  for (let k = 0; k < c; k++) {
    const a = strength * 0.35 * (1 - k / c);
    x.fillStyle = `rgba(${color},${a.toFixed(3)})`;
    const len = c - k;
    x.fillRect(0, k, len, 1);
    x.fillRect(w - len, k, len, 1);
    x.fillRect(0, h - 1 - k, len, 1);
    x.fillRect(w - len, h - 1 - k, len, 1);
  }
}

// Slow drifting specks (dust in a sunbeam, pollen, snow). Deterministic per index, no state.
export function motes(x: CanvasRenderingContext2D, t: number, box: { x: number; y: number; w: number; h: number }, n: number, color: string, drift = 4, rise = -3): void {
  x.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const r1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r2 = Math.abs(Math.sin(i * 78.233) * 12543.123) % 1;
    const sp = 0.5 + r2;
    const px = box.x + ((((r1 * box.w + t * drift * sp + Math.sin(t * 0.8 + i) * 3) % box.w) + box.w) % box.w);
    const py = box.y + ((((r2 * box.h + t * rise * sp) % box.h) + box.h) % box.h);
    const tw = (Math.sin(t * 2 + i * 1.7) + 1) / 2;
    x.globalAlpha = 0.25 + tw * 0.55;
    x.fillRect(Math.round(px), Math.round(py), 1, 1);
  }
  x.globalAlpha = 1;
}

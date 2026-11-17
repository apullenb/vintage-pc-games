// UI pieces shared by Laser Tag and Roach Patrol: the game canvas with pointer tracking, virtual
// thumb sticks for phones, the arcade HUD strip, and the end-of-round results card.
import { useRef, type ReactNode } from 'react';
import { VH, VW } from './tagFx.ts';
import { useHdCanvas, type HdProp } from './kit.tsx';
import './tag.css';

export interface Ptr {
  x: number;
  y: number;
  inside: boolean; // a mouse is hovering the canvas (or a finger is on it)
  down: boolean;
  touch: boolean;
  moved: number; // time of the last mouse move (performance.now)
}
export const newPtr = (): Ptr => ({ x: VW / 2, y: VH / 2, inside: false, down: false, touch: false, moved: 0 });

export interface StickState {
  x: number;
  y: number;
  active: boolean;
}
export const newStick = (): StickState => ({ x: 0, y: 0, active: false });

export function GameCanvas({ canvasRef, ptr, onDown, hd }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; ptr: Ptr; onDown?: () => void; hd?: HdProp }) {
  const at = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const r = e.currentTarget.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * VW;
    ptr.y = ((e.clientY - r.top) / r.height) * VH;
  };
  const { key, className, style, ...cv } = useHdCanvas(canvasRef, VW, VH, hd);
  return (
    <canvas
      key={key}
      {...cv}
      className={`mini-canvas tag-canvas ${className}`.trim()}
      style={{ aspectRatio: `${VW} / ${VH}`, ...style }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
        ptr.down = true;
        ptr.inside = true;
        ptr.touch = e.pointerType !== 'mouse';
        onDown?.();
      }}
      onPointerMove={(e) => {
        at(e);
        if (e.pointerType === 'mouse') {
          ptr.inside = true;
          ptr.touch = false;
          ptr.moved = performance.now();
        }
      }}
      onPointerUp={(e) => {
        ptr.down = false;
        if (e.pointerType !== 'mouse') ptr.inside = false;
      }}
      onPointerCancel={() => {
        ptr.down = false;
        ptr.inside = false;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && !ptr.down) ptr.inside = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// A virtual thumb stick. Reports a -1..1 vector while held.
export function Stick({ st, label, kind, onDown }: { st: StickState; label: string; kind: 'move' | 'aim'; onDown?: () => void }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const upd = (e: React.PointerEvent): void => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const R = r.width * 0.34;
    let dx = (e.clientX - (r.left + r.width / 2)) / R;
    let dy = (e.clientY - (r.top + r.height / 2)) / R;
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    st.x = dx;
    st.y = dy;
    st.active = true;
    if (knob.current) knob.current.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  const end = (): void => {
    pid.current = null;
    st.x = 0;
    st.y = 0;
    st.active = false;
    if (knob.current) knob.current.style.transform = '';
    base.current?.classList.remove('on');
  };
  return (
    <div
      ref={base}
      className={`tag-stick ${kind}`}
      role="slider"
      aria-label={label}
      aria-valuenow={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pid.current = e.pointerId;
        e.currentTarget.classList.add('on');
        onDown?.();
        upd(e);
      }}
      onPointerMove={(e) => {
        if (pid.current === e.pointerId) upd(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="tag-stick-ring" />
      <div ref={knob} className="tag-knob" />
      <span className="tag-stick-label">{label}</span>
    </div>
  );
}

export interface HudCell {
  label: string;
  value: ReactNode;
  warn?: boolean;
  meter?: number; // 0..1 shows a bar
  tone?: 'good' | 'hot' | 'cool';
  wide?: boolean;
}

export function TagHud({ cells, chips }: { cells: HudCell[]; chips?: { label: string; c: string; t: number }[] }) {
  return (
    <div className="tag-hud" aria-live="off">
      {cells.map((c) => (
        <div key={c.label} className={`tag-cell ${c.warn ? 'warn' : ''} ${c.tone ?? ''} ${c.wide ? 'wide' : ''}`}>
          <small>{c.label}</small>
          <b>{c.value}</b>
          {c.meter !== undefined && (
            <i className="tag-meter">
              <i style={{ width: `${Math.round(Math.max(0, Math.min(1, c.meter)) * 100)}%` }} />
            </i>
          )}
        </div>
      ))}
      {chips && chips.length > 0 && (
        <div className="tag-chips">
          {chips.map((c) => (
            <span key={c.label} className="tag-chip" style={{ borderColor: c.c, color: c.c }}>
              {c.label} {Math.ceil(c.t)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export interface BoardRow {
  key: string;
  name: string;
  color: string;
  me: boolean;
  cols: (string | number)[];
}

export function ResultCard({ title, sub, head, rows, foot, onContinue, ranked = true }: { title: string; sub: string; head: string[]; rows: BoardRow[]; foot?: ReactNode; onContinue: () => void; ranked?: boolean }) {
  return (
    <div className="tag-board" role="dialog" aria-label={title}>
      <div className="tag-board-inner">
        <h4>{title}</h4>
        <p className="tag-board-sub">{sub}</p>
        <table>
          <thead>
            <tr>
              {ranked && <th>#</th>}
              <th className="nm">{head[0]}</th>
              {head.slice(1).map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={r.me ? 'me' : ''}>
                {ranked && <td>{i + 1}</td>}
                <td className="nm">
                  <i className="sw" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }} />
                  {r.name}
                </td>
                {r.cols.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {foot}
        <button className="btn primary tag-continue" autoFocus onClick={onContinue}>
          Continue ▶
        </button>
      </div>
    </div>
  );
}

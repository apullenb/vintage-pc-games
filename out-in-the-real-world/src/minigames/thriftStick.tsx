// A virtual thumbstick for phones (analog, any direction) plus a big fire button.
// The stick writes into a shared ref the game loop reads every frame.
import { useRef, useState } from 'react';

export interface StickState {
  x: number; // -1..1
  y: number; // -1..1
  active: boolean;
}

export function ThriftStick({ stick, onFire, fireLabel, glow }: { stick: React.MutableRefObject<StickState>; onFire: () => void; fireLabel: string; glow?: boolean }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const pid = useRef<number | null>(null);

  const move = (cx: number, cy: number): void => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const R = r.width / 2;
    let dx = (cx - (r.left + R)) / R;
    let dy = (cy - (r.top + R)) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    // small dead zone, then full speed quickly so it feels snappy
    const mag = Math.min(1, Math.max(0, (Math.min(1, m) - 0.12) / 0.6));
    const k = m > 0 ? mag / Math.min(1, m) : 0;
    stick.current = { x: dx * k, y: dy * k, active: true };
    setKnob([dx, dy]);
  };
  const end = (): void => {
    pid.current = null;
    stick.current = { x: 0, y: 0, active: false };
    setKnob([0, 0]);
  };

  return (
    <div className="th-pad">
      <div
        ref={base}
        className="th-stick"
        aria-label="Move"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          pid.current = e.pointerId;
          move(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pid.current === e.pointerId) move(e.clientX, e.clientY);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="th-knob" style={{ transform: `translate(${knob[0] * 34}px, ${knob[1] * 34}px)` }} />
      </div>
      <p className="th-pad-hint">Drag to move · tap the screen to tag</p>
      <button
        type="button"
        className={`th-fire ${glow ? 'glow' : ''}`}
        aria-label="Fire"
        onPointerDown={(e) => {
          e.preventDefault();
          onFire();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {fireLabel}
      </button>
    </div>
  );
}

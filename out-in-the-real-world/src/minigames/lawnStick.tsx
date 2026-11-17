// A virtual thumbstick for Lawn Gig on touch screens: press anywhere on the pad and drag.
// Reports a vector with magnitude 0..1 (screen directions: +x right, +y down).
import { useRef, useState } from 'react';

export function LawnStick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const active = useRef<number | null>(null);
  const move = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const R = r.width / 2;
    let dx = (e.clientX - (r.left + R)) / (R * 0.75);
    let dy = (e.clientY - (r.top + R)) / (R * 0.75);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    setKnob([dx, dy]);
    onChange(dx, dy);
  };
  const end = (): void => {
    active.current = null;
    setKnob([0, 0]);
    onChange(0, 0);
  };
  return (
    <div
      ref={base}
      className={`lg-stick ${active.current !== null ? 'on' : ''}`}
      role="slider"
      aria-label="Steer the mower"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = e.pointerId;
        move(e);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) move(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="lg-stick-ring" />
      <div className="lg-stick-knob" style={{ transform: `translate(calc(-50% + ${knob[0] * 34}px), calc(-50% + ${knob[1] * 34}px))` }} />
    </div>
  );
}

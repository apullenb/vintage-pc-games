// A simple working stand-in: stop the needle in the green zone, three times. Real games replace this.
import { useRef, useState } from 'react';
import { INK, rect } from '../art/px.ts';
import { clamp01, ctxOf, MiniHud, PixelCanvas, TouchPad, useInput, useLoop, type MiniProps } from './kit.tsx';

export function Placeholder({ onDone, label }: MiniProps & { label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const st = useRef({ pos: 0, dir: 1, round: 0, total: 0, flash: 0 });
  const [round, setRound] = useState(0);
  useLoop((dt) => {
    const g = st.current;
    g.pos += g.dir * dt * (0.9 + g.round * 0.35);
    if (g.pos > 1) (g.pos = 1), (g.dir = -1);
    if (g.pos < 0) (g.pos = 0), (g.dir = 1);
    g.flash = Math.max(0, g.flash - dt);
    if (input.pressed.has('action') && g.round < 3) {
      g.total += clamp01(1 - Math.abs(g.pos - 0.5) / 0.5);
      g.round++;
      g.flash = 0.25;
      setRound(g.round);
      if (g.round >= 3) setTimeout(() => onDone({ score: clamp01(g.total / 3) }), 300);
    }
    const x = ctxOf(canvas.current);
    if (!x) return;
    rect(x, 0, 0, 192, 108, g.flash > 0 ? '#3a2a5a' : '#2a1f42');
    rect(x, 20, 50, 152, 10, '#e0503c');
    rect(x, 66, 50, 60, 10, '#f2b632');
    rect(x, 86, 50, 20, 10, '#3caa6a');
    rect(x, 19, 49, 154, 1, INK);
    rect(x, 20 + g.pos * 150, 42, 2, 26, '#ffffff');
  }, true, input);
  return (
    <div className="mini">
      <MiniHud items={[{ label: label, value: `Round ${Math.min(round + 1, 3)}/3` }]} />
      <PixelCanvas canvasRef={canvas} onPointer={(_x, _y, k) => k === 'down' && input.press('action')} />
      <TouchPad input={input} keys={[{ key: 'action', label: 'STOP!', wide: true }]} />
      <p className="mini-note">Prototype: press SPACE or tap when the needle is in the green.</p>
    </div>
  );
}

// Shift Rush: an extra shift as a fast sorting game, skinned per path.
//   home    -> Checkout Rush (scan on the laser, bag heavy low and fragile high, fix wrong prices)
//   college -> Book Return Rush (steer falling returns into the right call-number cart)
//   trade   -> Wire It Up (land each wire on its terminal; kill the breaker before touching live wires)
//   work    -> Package Sort (catch falling parcels, carry them to the matching zone chute)
// The host here runs the count-in, the clock, the HUD and the end beat; each mode owns its play.
import { useRef, useState } from 'react';
import { num } from '../engine/core.ts';
import type { PathId } from '../engine/types.ts';
import { sfx } from '../ui/audio.ts';
import { MiniHud, TouchPad, useInput, useLoop, type MiniProps } from './kit.tsx';
import { hdBanner, hdCount, Hd2Canvas, hdCtx, hdFx, motes2, vignette2 } from './hd2Kit.tsx';
import { checkoutMode } from './shiftCheckout.ts';
import { COUNT_STEP, COUNT_TIME, countLabel, Fx, type HudItem, type ModeEnv, type ShiftMode } from './shiftKit.ts';
import { libraryMode } from './shiftLibrary.ts';
import { warehouseMode } from './shiftWarehouse.ts';
import { wiresMode } from './shiftWires.ts';
import './shift.css';
import { shiftKind } from '../content/minigames/shift.ts';

const MODES: Record<PathId, (e: ModeEnv) => ShiftMode> = {
  home: checkoutMode,
  college: libraryMode,
  trade: wiresMode,
  work: warehouseMode,
};
const END_BEAT = 1.9;

interface Run {
  fx: Fx;
  mode: ShiftMode;
  left: number;
  phase: 'count' | 'play' | 'end';
  endT: number;
  lastLabel: string | null;
  lastSec: number;
  res: { score: number; stats: Record<string, number>; line: string } | null;
  sent: boolean;
}

const clock = (sec: number): string => `0:${String(Math.max(0, Math.ceil(sec))).padStart(2, '0')}`;

export function Shift({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const run = useRef<Run | null>(null);
  if (!run.current) {
    const fx = new Fx(reducedMotion);
    const level = Math.max(0, Math.min(4, num(s, 'extraShifts') - 1));
    const mode = (MODES[shiftKind(s)] ?? warehouseMode)({ fx, level, look: s.look, rm: reducedMotion });
    run.current = { fx, mode, left: mode.duration, phase: 'count', endT: 0, lastLabel: null, lastSec: 99, res: null, sent: false };
  }
  const r = run.current;
  const [hud, setHud] = useState<HudItem[]>(() => [{ label: 'Time', value: clock(r.mode.duration) }, ...r.mode.hud()]);
  const hudKey = useRef('');

  useLoop(
    (dt, t) => {
      const { fx, mode } = r;
      fx.update(dt);
      if (r.phase === 'count') {
        const lab = countLabel(t);
        if (lab !== r.lastLabel) {
          r.lastLabel = lab;
          if (lab) sfx(lab === 'GO!' ? 'select' : 'click');
        }
        if (t >= COUNT_TIME) r.phase = 'play';
        mode.step(dt, t, input, false);
      } else if (r.phase === 'play') {
        r.left -= dt;
        mode.step(dt, t, input, true);
        const sec = Math.ceil(r.left);
        if (sec !== r.lastSec) {
          r.lastSec = sec;
          if (sec <= 5 && sec > 0) sfx('type');
        }
        if (r.left <= 0 || mode.finished?.()) {
          r.phase = 'end';
          r.res = mode.result();
          sfx(r.res.score >= 0.6 ? 'star' : 'week');
        }
      } else {
        r.endT += dt;
        mode.step(dt, t, input, false);
        if (r.endT >= END_BEAT && !r.sent && r.res) {
          r.sent = true;
          onDone({ score: r.res.score, stats: r.res.stats });
        }
      }

      const items: HudItem[] = [{ label: 'Time', value: clock(Math.max(0, r.left)), warn: r.left < 8 }, ...mode.hud()];
      const key = items.map((i) => `${i.value}${i.warn ? '!' : ''}`).join('|');
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(items);
      }

      const x = hdCtx(canvas.current);
      if (!x) return;
      const [ox, oy] = fx.offset();
      x.fillStyle = '#140c22';
      x.fillRect(0, 0, 192, 108);
      x.save();
      x.translate(ox, oy);
      mode.draw(x, t);
      hdFx(x, fx);
      x.restore();
      if (!reducedMotion) motes2(x, t, { x: 0, y: 0, w: 192, h: 96 }, 14, '#fffbe0', 3, -2);
      vignette2(x, 192, 108, 0.5);
      const lab = countLabel(t);
      hdCount(x, lab, lab === 'GO!' ? t - COUNT_TIME : t % COUNT_STEP);
      if (r.phase === 'end' && r.res) {
        const good = r.res.score >= 0.6;
        hdBanner(x, r.left <= 0 ? 'SHIFT OVER!' : 'ALL DONE!', r.res.line, good, r.endT);
      }
    },
    true,
    input,
  );

  return (
    <div className="mini shift-rush">
      <MiniHud items={hud} />
      <Hd2Canvas canvasRef={canvas} onPointer={(px, py, k) => r.phase === 'play' && r.mode.pointer(px, py, k)} />
      <TouchPad input={input} keys={r.mode.keys} />
      <p className="mini-note sr-key-note">{r.mode.note}</p>
      <p className="mini-note sr-touch-note">{r.mode.touchNote}</p>
    </div>
  );
}

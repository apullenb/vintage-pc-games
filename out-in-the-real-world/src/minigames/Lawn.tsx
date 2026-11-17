// Lawn Gig: mow three neighbors' yards for cash. Drive the push mower with the arrows/WASD (or the
// thumbstick, or press-and-drag on the yard). Tall grass turns into neat stripes behind you; keep
// out of the flower beds, gnomes, the kiddie pool, the pop-up sprinklers and the nervous dog; dump
// the bag at the green bin when it's full. The neighbor watches from the porch.
import { useEffect, useRef, useState } from 'react';
import { playerPerson } from '../art/people.ts';
import { ctxOf, MiniHud, PixelCanvas, useInput, useLoop, type MiniProps } from './kit.tsx';
import { drawLawnHud, drawSpeech, drawYard, LawnLayer, type MowerLook, type YardFx } from './lawnArt.ts';
import { LawnStick } from './lawnStick.tsx';
import { BAG_CAP, COUNT, cutFrac, LH, LW, newLawn, payFor, stepLawn, type LawnSim } from './lawnYard.ts';
import { Chip, note } from './riverAudio.ts';
import { centered, drawBanner, drawCount, Fx, pick } from './shiftKit.ts';
import './lawn.css';

interface HudView {
  yard: number;
  left: number;
  cut: number;
  bag: number;
  pay: number;
}

const DECKS = ['#d8342a', '#2f6fd8', '#f08a1a', '#c8342a'];

export function Lawn({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const sim = useRef<LawnSim | null>(null);
  if (!sim.current) sim.current = newLawn((Date.now() ^ (Math.random() * 1e9)) | 0);
  const layer = useRef<LawnLayer | null>(null);
  const fx = useRef(new Fx(reducedMotion));
  const yfx = useRef<YardFx>({ knock: new Map(), binOpen: 0, poolSplash: 0 });
  const chip = useRef(new Chip());
  const engine = useRef<{ set: (hz: number, level: number) => void; stop: () => void } | null>(null);
  const look = useRef<MowerLook>({ p: playerPerson(s.look), deck: DECKS[Math.abs(s.seed) % DECKS.length] });
  const stick = useRef<[number, number]>([0, 0]);
  const pointer = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const done = useRef(false);
  const lastCount = useRef('');
  const [hud, setHud] = useState<HudView>({ yard: 1, left: 0, cut: 0, bag: 0, pay: 25 });
  const hudKey = useRef('');

  useEffect(() => {
    const c = chip.current;
    c.init();
    return () => c.stopAll();
  }, []);

  useLoop(
    (dt, t) => {
      const g = sim.current!;
      const f = fx.current;
      const ch = chip.current;
      const yf = yfx.current;
      if (!layer.current) layer.current = new LawnLayer();
      // ---- input: keys, then the stick, then press-and-drag on the yard ----
      let ix = (input.down.has('right') ? 1 : 0) - (input.down.has('left') ? 1 : 0);
      let iy = (input.down.has('down') ? 1 : 0) - (input.down.has('up') ? 1 : 0);
      if (ix === 0 && iy === 0) {
        [ix, iy] = stick.current;
        if (ix === 0 && iy === 0 && pointer.current.on) {
          const dx = pointer.current.x - g.m.x;
          const dy = pointer.current.y - g.m.y;
          const d = Math.hypot(dx, dy);
          if (d > 4) {
            const k = Math.min(1, d / 24) / d;
            ix = dx * k;
            iy = dy * k;
          }
        }
      }
      const prevYard = g.ix;
      stepLawn(g, { ix, iy }, dt);
      f.update(dt);
      if (g.ix !== prevYard) {
        yf.knock.clear();
        lastCount.current = '';
      }

      // ---- count-in beeps (every yard) ----
      if (g.phase === 'count') {
        const lab = String(3 - Math.floor(g.t / 0.55));
        if (lab !== lastCount.current && g.t < COUNT) {
          lastCount.current = lab;
          ch.beep(note(14), 0.08, 'square', 0.09);
        }
      }

      // ---- events -> juice ----
      const m = g.m;
      for (const e of g.events) {
        switch (e.e) {
          case 'go':
            ch.beep(note(21), 0.08, 'square', 0.1);
            ch.beep(note(28), 0.2, 'square', 0.1, note(28), 0.08);
            // pull-start: vrr... VRRRM
            ch.noise(0.15, 0.2, 400, 0, 1200, 'bandpass');
            ch.noise(0.2, 0.25, 500, 0.18, 2000, 'bandpass');
            if (!engine.current) engine.current = ch.engine();
            f.burst(m.x - Math.cos(m.ang) * 3, m.y - Math.sin(m.ang) * 3, ['#9a9aa4', '#c8c8d0'], 8, 20, -20, 0.6);
            break;
          case 'cut':
            if (Math.random() < 0.55) {
              const bx = m.x - Math.cos(m.ang) * 6;
              const by = m.y - Math.sin(m.ang) * 6;
              f.spray(bx, by, ['#8ad060', '#6ab04a', '#b4e48a', '#4e963a'], Math.min(3, 1 + (e.n ?? 1) / 4), -Math.cos(m.ang) * 18 - Math.sin(m.ang) * 14, -Math.sin(m.ang) * 18 + Math.cos(m.ang) * 14 - 10, 14, 60, 0.45);
            }
            break;
          case 'bump':
            if (ch.gate('bump', 0.25)) ch.noise(0.1, e.s === 'scrape' ? 0.1 : 0.25, 300);
            if (e.s !== 'scrape') f.kick(1.5);
            break;
          case 'bed':
            ch.noise(0.25, 0.3, 4000, 0, 900);
            ch.beep(note(7), 0.15, 'square', 0.07, note(0));
            f.burst(e.x, e.y, [e.s ?? '#f04a6a', '#2a6a2a', '#f2d048'], 16, 40, 60, 0.7);
            f.kick(2.5);
            f.blink('#ff4a3a', 0.15);
            f.pop(e.x, e.y - 12, 'OOPS!', '#ff9a7a');
            break;
          case 'gnome':
            ch.beep(320, 0.12, 'square', 0.1, 160);
            ch.noise(0.08, 0.3, 1800);
            yf.knock.set(g.y.solids.find((q) => q.kind === 'gnome' && q.knocked && Math.hypot(q.x - e.x, q.y - e.y) < 1)!, 0);
            f.burst(e.x, e.y - 4, ['#d8342a', '#f4f4f4', '#3a6ad0'], 10, 40, 80, 0.5);
            f.kick(2);
            f.pop(e.x, e.y - 14, 'CLONK!', '#ff9a7a');
            break;
          case 'pool':
            ch.noise(0.35, 0.25, 2600, 0, 600);
            yf.poolSplash = 0.5;
            f.burst(e.x, e.y, ['#bfe8ff', '#ffffff', '#6ac4ec'], 18, 45, 120, 0.6);
            f.pop(e.x, e.y - 12, 'SPLOOSH!', '#bfe8ff');
            break;
          case 'sprinklerBreak':
            ch.noise(0.9, 0.25, 6000, 0, 2500, 'highpass');
            ch.beep(note(19), 0.12, 'square', 0.08, note(7));
            f.burst(e.x, e.y - 4, ['#bfe8ff', '#ffffff'], 26, 60, 160, 0.9);
            f.kick(2);
            f.pop(e.x, e.y - 16, 'CRUNCH!', '#ff9a7a');
            break;
          case 'soaked':
            ch.noise(0.4, 0.15, 5000, 0, 1500, 'highpass');
            f.spray(e.x, e.y, ['#bfe8ff', '#ffffff'], 16, 0, -50, 30, 140, 0.6);
            f.pop(e.x, e.y - 14, 'SOAKED!', '#bfe8ff');
            break;
          case 'sprinklerUp':
            if (ch.gate('psst', 0.3)) ch.noise(0.3, 0.1, 5000, 0, 2000, 'highpass');
            break;
          case 'sprinklerWarn':
            if (ch.gate('tick', 0.2)) for (let k = 0; k < 3; k++) ch.beep(2200, 0.02, 'square', 0.03, 2200, k * 0.12);
            break;
          case 'dogHit':
            ch.beep(1400, 0.18, 'square', 0.08, 700);
            ch.beep(1200, 0.12, 'square', 0.06, 900, 0.2);
            f.kick(2);
            f.pop(e.x, e.y - 12, 'YIP!', '#ff9a7a');
            break;
          case 'bark':
            if (ch.gate('bark', 0.6)) {
              ch.beep(520, 0.06, 'square', 0.07, 380);
              ch.beep(560, 0.07, 'square', 0.07, 400, 0.12);
            }
            f.pop(e.x, e.y - 9, e.s === 'zoom' ? 'ZOOMIES!' : pick(['WOOF!', 'ARF!', 'YIP!']), '#fff3c4');
            break;
          case 'bagFull':
            ch.beep(note(16), 0.1, 'square', 0.08);
            ch.beep(note(16), 0.1, 'square', 0.08, note(16), 0.15);
            f.pop(m.x, m.y - 16, 'BAG FULL!', '#ffb46a');
            break;
          case 'empty':
            ch.noise(0.35, 0.3, 500, 0, 120);
            f.spray(e.x, e.y - 4, ['#8ad060', '#6ab04a', '#b4e48a'], 18, 0, -40, 25, 120, 0.6);
            break;
          case 'emptied':
            ch.arp([12, 16, 19], 0.05, 'square', 0.07, 0.08);
            f.pop(e.x, e.y - 14, 'EMPTY!', '#7cf08a');
            break;
          case 'milestone':
            ch.arp([19, 23, 26], 0.06, 'square', 0.07, 0.1);
            f.pop(m.x, m.y - 18, `${Math.round((e.n ?? 0) * 100)}%!`, '#7cf08a');
            break;
          case 'say':
            if (ch.gate('say', 0.5)) ch.babble(g.y.neighbor.name.startsWith('M') && !g.y.neighbor.name.startsWith('Mr') ? 26 : 18, 3);
            break;
          case 'tick':
            ch.beep(note(26), 0.05, 'square', 0.06);
            break;
          case 'yardDone':
            if (e.n) ch.arp([12, 16, 19, 24, 28], 0.08, 'square', 0.09, 0.16);
            else ch.arp([12, 9, 5], 0.12, 'triangle', 0.09, 0.18);
            if (e.n) f.burst(LW / 2, LH / 2, ['#7cf08a', '#ffe27a', '#ffffff'], 30, 70, 40, 1);
            break;
          case 'gigDone':
            engine.current?.stop();
            engine.current = null;
            ch.arp([12, 16, 19, 24, 19, 24, 28, 31], 0.09, 'square', 0.09, 0.16);
            break;
          default:
            break;
        }
      }
      for (const [k, v] of yf.knock) yf.knock.set(k, v + dt);
      yf.binOpen = Math.max(g.emptying ? 1 : 0, yf.binOpen - dt * 2);
      yf.poolSplash = Math.max(0, yf.poolSplash - dt);
      // engine note: revs with speed, bogs down in thick grass, whines with a full bag
      const sp = Math.hypot(m.vx, m.vy);
      if (engine.current) engine.current.set(46 + sp * 0.32 - m.load * 7 + (m.bag >= BAG_CAP ? 9 : 0), g.phase === 'play' ? 0.7 + sp / 140 : 0.4);

      // ---- draw ----
      const x = ctxOf(canvas.current);
      if (x) {
        const [ox, oy] = f.offset();
        x.save();
        x.translate(ox, oy);
        drawYard(x, g, layer.current, t, look.current, yf);
        f.draw(x, LW, LH);
        drawSpeech(x, g, t);
        x.restore();
        drawLawnHud(x, g, t);
        if (g.phase === 'count') {
          if (g.ix > 0 || g.t > 0.2) {
            x.globalAlpha = 0.75;
            x.fillStyle = '#140c22';
            x.fillRect(0, LH - 30, LW, 18);
            x.globalAlpha = 1;
            centered(x, `YARD ${g.ix + 1} OF 3 · ${g.y.name}`, LW / 2, LH - 26, '#ffe27a');
            centered(x, `${g.y.neighbor.name.toUpperCase()} · ${g.y.limit}S ON THE CLOCK`, LW / 2, LH - 19, '#f4eedd');
          }
          drawCount(x, g.t, LW, LH);
        }
        if (g.phase === 'yardEnd' && g.endT > 0.5) {
          const r = g.results[g.results.length - 1];
          const head = r.done ? (r.oops === 0 ? 'PERFECT!' : 'YARD DONE!') : "TIME'S UP!";
          drawBanner(x, head, `${Math.floor(r.cut * 100)}% CUT · ${r.oops === 0 ? 'NO DAMAGE' : `${Math.ceil(r.oops)} OOPS`}`, r.done || r.cut > 0.8, g.endT - 0.5, LW, LH);
        }
        if (g.phase === 'done') drawBanner(x, 'GIG DONE!', `THEY PAY YOU $${payFor(g.score)} CASH`, g.score >= 0.4, g.endT, LW, LH);
      }

      // ---- HUD (React) ----
      const h: HudView = {
        yard: g.ix + 1,
        left: Math.max(0, Math.ceil(g.y.limit - g.gt)),
        cut: Math.floor(cutFrac(g) * 100),
        bag: Math.round((m.bag / BAG_CAP) * 100),
        pay: payFor(g.score),
      };
      const key = `${h.yard}|${h.left}|${h.cut}|${h.bag}|${h.pay}`;
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(h);
      }

      if (g.phase === 'done' && g.endT > 2.8 && !done.current) {
        done.current = true;
        engine.current?.stop();
        const cutAvg = g.results.reduce((a, r) => a + r.cut, 0) / Math.max(1, g.results.length);
        onDone({
          score: g.score,
          stats: { yards: g.results.filter((r) => r.done).length, cut: Math.round(cutAvg * 100), oops: Math.ceil(g.totalOops), pay: payFor(g.score) },
        });
      }
    },
    true,
    input,
  );

  const mmss = (n: number): string => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return (
    <div className="mini lawn-gig">
      <MiniHud
        items={[
          { label: 'Yard', value: `${hud.yard}/3` },
          { label: 'Time', value: mmss(hud.left), warn: hud.left <= 8 },
          { label: 'Cut', value: `${hud.cut}%` },
          { label: 'Bag', value: `${hud.bag}%`, warn: hud.bag >= 90 },
          { label: 'Pay', value: `$${hud.pay}` },
        ]}
      />
      <div className="lg-canvas-wrap">
        <PixelCanvas
          canvasRef={canvas}
          width={LW}
          height={LH}
          onPointer={(px, py, k) => {
            pointer.current = { x: px, y: py, on: k !== 'up' };
          }}
        />
      </div>
      <div className="lg-pad">
        <LawnStick
          onChange={(sx, sy) => {
            stick.current = [sx, sy];
          }}
        />
        <p className="lg-pad-note">Drag the stick (or the yard) to push the mower. Dump the bag at the green bin.</p>
      </div>
      <p className="mini-note lg-key-note">Arrows / WASD push the mower · cut it all, dodge the flowers, gnomes, pool, sprinklers and the dog · dump the bag at the green bin</p>
    </div>
  );
}

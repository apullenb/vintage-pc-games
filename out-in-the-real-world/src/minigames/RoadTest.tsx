// Driving Test: the DMV road test. Stop sign, lane changes in traffic, a traffic light, a school zone
// with a crosswalk, and a parallel park at the end, with an instructor marking a clipboard.
import { useRef, useState } from 'react';
import { drawPerson, HAIRS, playerPerson, SKINS, type Person } from '../art/people.ts';
import { glow, INK, rect, shade, text, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { PASS } from '../content/minigames/roadtest.ts';
import { clamp, Fx, PadBtn, StartOverlay } from './driveKit.tsx';
import { BLUE_D, drawEnd, drawRoad, limitAt, MPH, newRoad, PK, scoreOf, SS, stepRoad, SZ0, SZ1, TL, totalPts, VH, VW, type RoadSim, type SayKind } from './driveRoad.ts';
import { ctxOf, MiniHud, PixelCanvas, useInput, useLoop, vignette, type MiniProps } from './kit.tsx';

export const INSTRUCTOR: { name: string; p: Person } = {
  name: 'Mr. Okafor',
  p: { skin: SKINS[4], hair: HAIRS[6], style: 4, shirt: '#e8e8f0', pants: '#3a3a52', coat: '#3f6a8a', glasses: true, mustache: true, lanyard: '#f2b632', badge: true, holds: 'clipboard' },
};

// The test route as a strip down the right edge: what's coming up and how far along you are.
const COURSE: { d: number; d1?: number; c: string; l: string }[] = [
  { d: SS, c: '#e0403a', l: 'STOP' },
  { d: (SS + TL) / 2, c: '#f2b632', l: 'LANE' },
  { d: TL, c: '#7ee08a', l: 'LIGHT' },
  { d: SZ0, d1: SZ1, c: '#f2d048', l: 'SCHOOL' },
  { d: PK, d1: BLUE_D, c: '#4a9aff', l: 'PARK' },
];
function drawCourse(x: Ctx, g: RoadSim): void {
  const top = 12;
  const bot = VH - 10;
  const sx = VW - 6;
  const yOf = (d: number): number => Math.round(bot - (Math.max(0, Math.min(BLUE_D, d)) / BLUE_D) * (bot - top));
  rect(x, sx - 2, top - 2, 5, bot - top + 4, 'rgba(28,20,36,0.7)');
  rect(x, sx, top, 1, bot - top, '#8a7a9a');
  const you = yOf(g.p.d);
  rect(x, sx, you, 1, bot - you, '#fff3c4');
  for (const m of COURSE) {
    const y0 = yOf(m.d1 ?? m.d);
    const y1 = yOf(m.d);
    rect(x, sx - 1, y0, 3, Math.max(2, y1 - y0), m.c);
    const passed = g.p.d > (m.d1 ?? m.d);
    const next = !passed && COURSE.find((q) => g.p.d <= (q.d1 ?? q.d)) === m;
    if (next) {
      const w = m.l.length * 4 + 1;
      rect(x, sx - 4 - w, y1 - 3, w + 1, 7, INK);
      text(x, m.l, sx - 3 - w, y1 - 2, m.c);
    }
  }
  // you: a little arrow
  rect(x, sx - 3, you - 1, 7, 3, INK);
  rect(x, sx - 2, you, 5, 1, '#ffffff');
  rect(x, sx, you - 2, 1, 1, '#ffffff');
}

interface Hud {
  mph: number;
  limit: number;
  pts: number;
  time: number;
  say: string;
  kind: SayKind;
  hint: string;
  marks: { label: string; pts: number; n: number }[];
  blink: number;
  phase: RoadSim['phase'];
  t: number;
  score: number;
  passed: boolean;
}

// Repeat offenses collapse into one line with a count (the shell shows the newest first).
function groupMarks(g: RoadSim): Hud['marks'] {
  const out: Hud['marks'] = [];
  for (const m of g.marks) {
    const hit = out.find((o) => o.label === m.label);
    if (hit) {
      hit.n++;
      hit.pts += Math.round(m.pts * 100);
      out.splice(out.indexOf(hit), 1);
      out.push(hit);
    } else out.push({ label: m.label, pts: Math.round(m.pts * 100), n: 1 });
  }
  return out;
}

function snapshot(g: RoadSim): Hud {
  const recent = g.t - g.say.t < 3.2;
  return {
    mph: Math.round(Math.abs(g.p.v) / MPH),
    limit: limitAt(g.p.d),
    pts: Math.round(totalPts(g) * 100),
    time: Math.floor(g.gt),
    say: recent || g.phase === 'end' ? g.say.text : g.cmd,
    kind: recent || g.phase === 'end' ? g.say.kind : 'cmd',
    hint: g.phase === 'park' ? g.hint : g.phase === 'drive' && g.gt < 6 ? g.hint : '',
    marks: groupMarks(g),
    blink: g.blink.dir,
    phase: g.phase,
    t: g.t < 5 ? Math.round(g.t * 10) / 10 : 5,
    score: Math.round(scoreOf(g) * 100),
    passed: g.passed,
  };
}

export function RoadTest({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const cab = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const sim = useRef<RoadSim | null>(null);
  if (!sim.current) sim.current = newRoad();
  const fx = useRef<Fx>(new Fx(reducedMotion));
  const done = useRef(false);
  const lastCount = useRef(-1);
  const me = useRef(playerPerson(s.look));
  const look = useRef({ kind: 'sedan' as const, body: '#f2efe6', heads: [me.current.hair, INSTRUCTOR.p.hair] });
  const [hud, setHud] = useState<Hud>(() => snapshot(sim.current!));
  const hudKey = useRef('');

  useLoop(
    (dt) => {
      const g = sim.current!;
      const f = fx.current;
      const ctl = {
        up: input.down.has('up'),
        down: input.down.has('down'),
        left: input.down.has('left'),
        right: input.down.has('right'),
        signal: input.pressed.has('action'),
      };
      stepRoad(g, ctl, dt);
      f.update(dt);

      // countdown blips
      if (g.phase === 'count') {
        const n = Math.floor(g.t);
        if (n !== lastCount.current && n < 3) {
          lastCount.current = n;
          sfx('click');
        }
      }
      // exhaust puffs
      const p = g.p;
      if (g.phase !== 'end' && Math.random() < (ctl.up ? 0.5 : 0.08)) f.puff(p.x - Math.sin(p.th) * 9 + 2, p.d - Math.cos(p.th) * 9, '#b8b4c0', 0, -4);

      for (const e of g.events) {
        if (e.e === 'go') sfx('select');
        else if (e.e === 'mark') {
          if (e.k !== 'crash') {
            sfx('bad');
            f.flash('#ff5040', 0.15);
            f.shake(1, 0.15);
          }
        } else if (e.e === 'crash') {
          f.shake(5, 0.5);
          f.flash('#ff2010', 0.3);
          f.burst(p.x, p.d + 8, 18, ['#ffe070', '#ff8a1e', '#ffffff', '#c8c0b0'], 50, 0.6);
        } else if (e.e === 'curb') {
          f.shake(2, 0.2);
          f.burst(p.x + 5, p.d, 6, ['#c8c0b0', '#e8e0d0'], 20, 0.4);
        } else if (e.e === 'good') sfx('week');
        else if (e.e === 'blink') sfx('click');
        else if (e.e === 'honk') f.shake(1, 0.1);
        else if (e.e === 'park') {
          f.burst(p.x, p.d, 20, ['#7ee08a', '#fff3c4', '#3f7fd8'], 40, 0.9);
        } else if (e.e === 'end') {
          if (g.passed) setTimeout(() => sfx('fanfare'), 500);
        }
      }
      g.events.length = 0;

      // draw
      const x = ctxOf(canvas.current);
      if (x) {
        const [ox, oy] = f.offset();
        x.save();
        x.translate(ox, oy);
        drawRoad(x, g, { reduced: reducedMotion, look: look.current, braking: ctl.down, fx: f });
        x.restore();
        // slow cloud shadows drifting over the course
        for (let k = 0; k < 2; k++) {
          const cy = ((g.t * 9 + k * 110) % (VH + 80)) - 40;
          const cx = 40 + k * 100 + Math.sin(g.t * 0.2 + k) * 20;
          glow(x, cx, cy, 46, 20, '#1c1424', 0.22);
        }
        f.drawFlash(x, VW, VH);
        vignette(x, VW, VH, 0.22);
        if (g.phase === 'drive' || g.phase === 'park') drawCourse(x, g);
        drawEnd(x, g, me.current, INSTRUCTOR.p);
      }
      const cx = ctxOf(cab.current);
      if (cx) drawCab(cx, g, me.current);

      // HUD (only re-render React when something visible changed)
      const h = snapshot(g);
      const key = JSON.stringify(h);
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(h);
      }

      if (g.phase === 'end' && g.endT > 3 && !done.current) {
        done.current = true;
        onDone({ score: clamp(g.score, 0, 1), stats: { infractions: g.marks.length, crashes: g.marks.filter((m) => m.k === 'crash').length, points: Math.round(g.score * 100) } });
      }
    },
    true,
    input,
  );

  const over = hud.phase === 'end';
  const lim = hud.limit;
  return (
    <div className="mini drive">
      <MiniHud
        items={[
          { label: 'Speed', value: `${hud.mph} mph`, warn: hud.mph > lim + 4 },
          { label: 'Limit', value: `${lim}` },
          { label: 'Score', value: `${Math.max(0, 100 - hud.pts)}`, warn: 100 - hud.pts < PASS * 100 },
          { label: 'Signal', value: hud.blink < 0 ? '◀ on' : hud.blink > 0 ? 'on ▶' : 'off' },
          { label: 'Time', value: `${hud.time}s` },
        ]}
      />
      <div className="drive-main rt">
        <div className="drive-talk">
          <canvas ref={cab} className="drive-cab" width={96} height={48} aria-hidden="true" />
          <div className={`drive-bubble ${hud.kind}`} aria-live="polite">
            <small>{INSTRUCTOR.name}, driving instructor</small>
            <span>“{hud.say}”</span>
            {hud.hint && <small className="hint">Tip: {hud.hint}</small>}
          </div>
        </div>
        <div className="drive-canvas-wrap">
          <PixelCanvas canvasRef={canvas} width={VW} height={VH} />
          <StartOverlay
            t={hud.t}
            title="Driving Test"
            lines={[
              <>Follow the instructor. Obey signs, lights and speed limits.</>,
              <>
                Signal (<b>SPACE</b>), check the <b>mirror</b>, then change lanes.
              </>,
              <>Finish with a parallel park. A crash fails the test.</>,
            ]}
          />
        </div>
        <aside className="drive-clip" aria-label="Instructor's clipboard">
          <h4>
            <span>Clipboard</span>
            <span>
              {Math.max(0, 100 - hud.pts)}/100 · pass {Math.round(PASS * 100)}
            </span>
          </h4>
          {hud.marks.length === 0 ? (
            <p className="none">No marks yet.</p>
          ) : (
            <ul>
              {[...hud.marks].reverse().slice(0, 7).map((m) => (
                <li key={m.label}>
                  <span>
                    ✗ {m.label}
                    {m.n > 1 ? ` ×${m.n}` : ''}
                  </span>{' '}
                  −{m.pts}
                </li>
              ))}
            </ul>
          )}
          {over && hud.t > 0 && <div className={`stamp ${hud.passed ? 'pass' : 'fail'}`}>{hud.passed ? 'PASSED' : 'NOT PASSED'}</div>}
        </aside>
      </div>
      <div className="drive-pad touch-only">
        <div className="grp">
          <PadBtn input={input} k="left" label="◀" aria="steer left" />
          <PadBtn input={input} k="right" label="▶" aria="steer right" />
        </div>
        <div className="grp">
          <PadBtn input={input} k="action" label={hud.blink ? 'SIG ✓' : 'SIGNAL'} cls={`sig ${hud.blink ? 'on' : ''}`} aria="turn signal" />
          <PadBtn input={input} k="down" label="BRAKE" cls="brake" aria="brake or reverse" />
          <PadBtn input={input} k="up" label="GAS" cls="gas" aria="gas" />
        </div>
      </div>
      <p className="drive-keys">←/→ steer · ↑ gas · ↓ brake (and reverse when parking) · SPACE turn signal</p>
    </div>
  );
}

// The view through the windshield: you behind the wheel, the instructor riding shotgun.
function drawCab(x: Ctx, g: RoadSim, me: Person): void {
  rect(x, 0, 0, 96, 48, '#2e2638');
  // rear window + back seat
  rect(x, 6, 2, 84, 10, '#7d9cc8');
  rect(x, 6, 8, 84, 4, '#a8c0e0');
  rect(x, 4, 12, 88, 22, '#3a3046');
  // headrests
  rect(x, 15, 9, 12, 10, '#4a4058');
  rect(x, 63, 9, 12, 10, '#4a4058');
  const talking = g.t - g.say.t < 1.4 && Math.floor(g.t * 8) % 2 === 0;
  const blinkEyes = Math.floor(g.t * 0.7) % 5 === 0 && g.t % 1.43 < 0.12;
  const look = g.p.delta > 0.15 ? 1 : g.p.delta < -0.15 ? -1 : 0;
  drawPerson(x, me, 14, 12, 0, false, { shadow: false, face: look as -1 | 0 | 1, blink: blinkEyes });
  drawPerson(x, INSTRUCTOR.p, 62, 12, 0, talking, { shadow: false, face: -1 });
  // dashboard
  rect(x, 0, 33, 96, 15, '#241e2c');
  rect(x, 0, 33, 96, 1, '#4a4058');
  // gauges
  rect(x, 40, 37, 16, 7, '#120e18');
  const sp = clamp(Math.abs(g.p.v) / 100, 0, 1);
  rect(x, 41, 42, Math.round(sp * 14), 1, Math.abs(g.p.v) / MPH > limitAt(g.p.d) + 4 ? '#ff5040' : '#7ee08a');
  // blinker arrows
  const on = g.blink.dir !== 0 && Math.floor(g.t * 3) % 2 === 0;
  const arrow = (ax: number, dir: number, lit: boolean): void => {
    const c = lit ? '#7ee08a' : '#3a4a3a';
    for (let i = 0; i < 3; i++) rect(x, ax + (dir < 0 ? i : 2 - i), 38 - i, 1, 1 + i * 2, c);
  };
  arrow(42, -1, on && g.blink.dir < 0);
  arrow(51, 1, on && g.blink.dir > 0);
  // steering wheel in front of you, turned with the wheels
  const cx = 21;
  const cy = 37;
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const px = cx + Math.cos(a) * 8;
    const py = cy + Math.sin(a) * 5;
    rect(x, px, py, 2, 1, '#14101a');
  }
  const r = g.p.delta * 2.2;
  for (let k = -1; k <= 1; k += 2) {
    for (let i = 0; i < 7; i++) rect(x, cx + Math.cos(r) * i * k, cy + Math.sin(r) * i * k * 0.6, 1, 1, '#2a2430');
  }
  rect(x, cx - 1, cy - 1, 3, 2, '#3a3046');
  // windshield frame + glare
  rect(x, 0, 0, 96, 2, INK);
  rect(x, 0, 0, 3, 34, INK);
  rect(x, 93, 0, 3, 34, INK);
  x.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 6; i++) x.fillRect(70 + i, 2 + i * 3, 2, 3);
  // little rear-view mirror
  rect(x, 41, 2, 14, 4, shade('#8aa0b8', 0.9));
  rect(x, 40, 1, 16, 1, INK);
}

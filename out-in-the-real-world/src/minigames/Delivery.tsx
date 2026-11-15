// Delivery Rush: a 60-second gig shift in a little top-down town (by car or by bike).
// Grab orders at restaurants, drop them at glowing doors before the timers run out.
import { useRef, useState } from 'react';
import { playerPerson } from '../art/people.ts';
import { sfx } from '../ui/audio.ts';
import { clamp, Fx, PadBtn, StartOverlay, type VehicleLook } from './driveKit.tsx';
import { activeOrders, camOf, colorName, drawTown, drawTownEnd, newTown, RESTS, SHIFT, stepTown, VH, VW, type SayKind, type TownSim } from './driveTown.ts';
import { ctxOf, MiniHud, PixelCanvas, useInput, useLoop, type MiniProps } from './kit.tsx';

interface OrderView {
  id: number;
  color: string;
  carry: boolean;
  label: string;
  t: number;
  frac: number;
}

interface Hud {
  left: number;
  earned: number;
  delivered: number;
  bag: number;
  cap: number;
  say: string;
  kind: SayKind;
  orders: OrderView[];
  t: number;
  ticket: boolean;
}

function snapshot(g: TownSim): Hud {
  return {
    left: Math.max(0, Math.ceil(SHIFT - g.gt)),
    earned: Math.round(g.earned),
    delivered: g.delivered,
    bag: g.orders.filter((o) => o.state === 'carry').length,
    cap: g.cap,
    say: g.say.text,
    kind: g.say.kind,
    orders: activeOrders(g).map((o) => ({
      id: o.id,
      color: o.color,
      carry: o.state === 'carry',
      label: o.state === 'carry' ? `Drop off at the ${colorName(o.color)} house` : `Pick up at ${RESTS[o.rest].icon} ${RESTS[o.rest].label}`,
      t: Math.ceil(o.t),
      frac: Math.round(clamp(o.t / o.T, 0, 1) * 20) / 20,
    })),
    t: g.t < 5 ? Math.round(g.t * 10) / 10 : 5,
    ticket: g.ticket,
  };
}

export function Delivery({ s, data, onDone, reducedMotion }: MiniProps) {
  const bike = data.vehicle === 'bike';
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const sim = useRef<TownSim | null>(null);
  if (!sim.current) sim.current = newTown(bike);
  const fx = useRef<Fx>(new Fx(reducedMotion));
  const done = useRef(false);
  const lastCount = useRef(-1);
  const pointer = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });
  const me = useRef(playerPerson(s.look));
  const look = useRef<VehicleLook>(bike ? { kind: 'bike', body: me.current.shirt, shirt: me.current.shirt, heads: [me.current.hair], bag: '#e0503c' } : { kind: 'taxi', body: me.current.shirt, heads: [me.current.hair], bag: '#e0503c' });
  const [hud, setHud] = useState<Hud>(() => snapshot(sim.current!));
  const hudKey = useRef('');

  useLoop(
    (dt) => {
      const g = sim.current!;
      const f = fx.current;
      // input: keys first, then press-and-hold on the map
      let ix = (input.down.has('right') ? 1 : 0) - (input.down.has('left') ? 1 : 0);
      let iy = (input.down.has('down') ? 1 : 0) - (input.down.has('up') ? 1 : 0);
      let throttle = 1;
      if (ix === 0 && iy === 0 && pointer.current.on) {
        const [cx, cy] = camOf(g);
        const dx = pointer.current.x - (g.p.x - cx);
        const dy = pointer.current.y - (g.p.y - cy);
        const d = Math.hypot(dx, dy);
        if (d > 3) {
          ix = dx / d;
          iy = dy / d;
          throttle = clamp(d / 30, 0.3, 1);
        }
      }
      stepTown(g, { ix, iy, throttle, slow: input.down.has('action') }, dt);
      f.update(dt);

      if (g.phase === 'count') {
        const n = Math.floor(g.t);
        if (n !== lastCount.current && n < 3) {
          lastCount.current = n;
          sfx('click');
        }
      }
      const sp = Math.hypot(g.p.vx, g.p.vy);
      if (!bike && g.phase === 'play' && Math.random() < sp / 140) f.puff(g.p.x - Math.sin(g.p.ang) * 8, g.p.y + Math.cos(g.p.ang) * 8, '#c8c4d0', 0, 0);

      for (const e of g.events) {
        const ex = e.x ?? g.p.x;
        const ey = e.y ?? g.p.y;
        if (e.e === 'go') sfx('select');
        else if (e.e === 'new') sfx('page');
        else if (e.e === 'pickup') {
          sfx('select');
          f.burst(ex, ey, 10, [e.c ?? '#ffffff', '#ffffff'], 30, 0.5);
          f.float(ex, ey - 8, 'GOT IT', e.c ?? '#ffffff');
        } else if (e.e === 'drop') {
          sfx('coin');
          f.burst(ex, ey, 16, [e.c ?? '#ffffff', '#ffe070', '#7ee08a'], 40, 0.7);
          f.float(ex, ey - 10, e.s ?? '+$', '#7ee08a');
        } else if (e.e === 'fail') {
          sfx('bad');
          f.float(ex, ey - 12, 'CANCELLED', '#ff7a6a');
        } else if (e.e === 'crash') {
          sfx('bad');
          f.shake(3, 0.3);
          f.flash('#ff4030', 0.12);
          f.burst(ex, ey, 12, ['#ffe070', '#ffffff', '#ff8a1e'], 40, 0.5);
          f.float(ex, ey - 12, 'BONK!', '#ffe070');
        } else if (e.e === 'hole') {
          f.shake(2, 0.2);
          f.burst(ex, ey, 8, ['#6a6a7a', '#3e3e4a', '#c8c0b0'], 25, 0.4);
          f.float(ex, ey - 10, 'THUNK', '#c8c0b0');
        } else if (e.e === 'ticket') {
          sfx('spend');
          f.flash('#ff2020', 0.25);
          f.shake(2, 0.25);
          f.float(ex, ey - 14, 'TICKET!', '#ff7a6a');
        } else if (e.e === 'end') setTimeout(() => sfx(g.score >= 0.6 ? 'fanfare' : 'week'), 300);
      }
      g.events.length = 0;

      const x = ctxOf(canvas.current);
      if (x) {
        const [ox, oy] = f.offset();
        x.save();
        x.translate(ox, oy);
        drawTown(x, g, { reduced: reducedMotion, look: look.current, fx: f });
        x.restore();
        f.drawFlash(x, VW, VH);
        drawTownEnd(x, g, me.current);
      }

      const h = snapshot(g);
      const key = JSON.stringify(h);
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(h);
      }

      if (g.phase === 'end' && g.endT > 3 && !done.current) {
        done.current = true;
        onDone({
          score: g.score,
          stats: { delivered: g.delivered, missed: g.missed, earned: Math.round(g.earned), ticket: g.ticket ? 1 : 0, crashes: g.crashes, potholes: g.bumps },
        });
      }
    },
    true,
    input,
  );

  return (
    <div className="mini drive">
      <MiniHud
        items={[
          { label: 'Shift left', value: `${hud.left}s`, warn: hud.left <= 10 },
          { label: 'Earned', value: `$${hud.earned}` },
          { label: 'Delivered', value: hud.delivered },
          { label: bike ? 'Bike bag' : 'Car bags', value: `${hud.bag}/${hud.cap}` },
          ...(hud.ticket ? [{ label: 'Ticket', value: 'YES', warn: true }] : []),
        ]}
      />
      <div className="drive-main">
        <div className="drive-canvas-wrap">
          <PixelCanvas
            canvasRef={canvas}
            width={VW}
            height={VH}
            onPointer={(px, py, k) => {
              pointer.current = { x: px, y: py, on: k !== 'up' };
            }}
          />
          <StartOverlay
            t={hud.t}
            title={bike ? 'Bike Delivery Rush' : 'Delivery Rush'}
            lines={[
              <>Pick up at the glowing restaurant, drop at the matching door.</>,
              <>Faster = bigger tips. Dodge traffic and potholes.</>,
              <>
                Hold <b>SLOW</b> (SPACE) through the cop’s 15 zone, or get a ticket.
              </>,
              ...(bike ? [<>Bikes can cut through the park!</>] : []),
            ]}
          />
        </div>
        <div className="drive-side">
          <div className={`drive-bubble ${hud.kind}`} aria-live="polite">
            <small>Dispatch app</small>
            <span>{hud.say}</span>
          </div>
          <div className="drive-orders" aria-label="Orders">
            {hud.orders.length === 0 && <p className="mini-note">{hud.left === 0 ? 'Shift complete.' : 'Waiting for orders…'}</p>}
            {hud.orders.map((o) => (
              <div key={o.id} className={`drive-order ${o.carry ? 'carry' : ''} ${o.t <= 6 ? 'hurry' : ''}`}>
                <i style={{ background: o.color }} />
                <span>{o.label}</span>
                <b>{o.t}s</b>
                <div className="bar">
                  <div style={{ width: `${o.frac * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="drive-pad touch-only">
        <div className="drive-dpad">
          <PadBtn input={input} k="up" label="▲" cls="u" aria="up" />
          <PadBtn input={input} k="left" label="◀" cls="l" aria="left" />
          <PadBtn input={input} k="down" label="▼" cls="d" aria="down" />
          <PadBtn input={input} k="right" label="▶" cls="r" aria="right" />
        </div>
        <div className="grp slow">
          <PadBtn input={input} k="action" label="SLOW" cls="brake" aria="drive slowly" />
        </div>
      </div>
      <p className="drive-keys">Arrows/WASD drive · hold SPACE to go slow · or press and hold on the map to steer</p>
    </div>
  );
}

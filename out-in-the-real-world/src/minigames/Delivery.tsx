// Delivery Rush: a 60-second gig shift in a top-down town that changes every time (by car or by bike).
// Follow the GPS line to the restaurant, then to the customer's door. Every drop gets a 1-5 star
// rating from speed, food heat and care; streaks of good drops add bonus tips.
import { useEffect, useRef, useState } from 'react';
import { playerPerson } from '../art/people.ts';
import { sfx } from '../ui/audio.ts';
import { beep, noise, note, sound, soundInit } from './cardsFx.ts';
import { clamp, Fx, PadBtn, StartOverlay, type VehicleLook } from './driveKit.tsx';
import { activeOrders, avgStars, bestDrop, BOOSTS, camOf, colorName, drawTown, drawTownEnd, focusOrder, newTown, RESTS, reviewFor, SHIFT, stepTown, tipMult, VH, VW, type SayKind, type TownSim } from './driveTown.ts';
import { ctxOf, MiniHud, PixelCanvas, useInput, useLoop, type MiniProps } from './kit.tsx';

interface OrderView {
  id: number;
  color: string;
  carry: boolean;
  icon: string;
  label: string;
  req: string;
  t: number;
  frac: number;
  heat: number;
  focus: boolean;
}

interface Hud {
  left: number;
  earned: number;
  delivered: number;
  rating: number;
  streak: number;
  bag: number;
  cap: number;
  boosts: number;
  stamina: number;
  say: string;
  kind: SayKind;
  orders: OrderView[];
  t: number;
  ticket: boolean;
  surge: number;
  end: boolean;
}

const REQ = { door: '🚪 leave at door', hand: '🤝 stop & hand it', apt: '🔔 buzz & wait' };

function snapshot(g: TownSim): Hud {
  const fo = focusOrder(g);
  return {
    left: Math.max(0, Math.ceil(SHIFT - g.gt)),
    earned: Math.round(g.earned),
    delivered: g.delivered,
    rating: Math.round(avgStars(g) * 10) / 10,
    streak: g.streak,
    bag: g.orders.filter((o) => o.state === 'carry').length,
    cap: g.cap,
    boosts: g.boosts,
    stamina: Math.round(g.stamina * 10) / 10,
    say: g.say.text,
    kind: g.say.kind,
    orders: (g.phase === 'end' ? [] : activeOrders(g)).map((o) => {
      const carry = o.state === 'carry';
      const kind = g.town.slots[o.slot].kind;
      return {
        id: o.id,
        color: o.color,
        carry,
        icon: RESTS[o.rest].icon,
        label: carry ? `${colorName(o.color)} door` : RESTS[o.rest].label,
        req: carry ? (kind === 'apt' ? REQ.apt : REQ[o.req]) : 'pick up',
        t: Math.ceil(o.t),
        frac: Math.round(clamp(o.t / o.T, 0, 1) * 20) / 20,
        heat: Math.round(o.heat * 10) / 10,
        focus: fo === o,
      };
    }),
    t: g.t < 5 ? Math.round(g.t * 10) / 10 : 5,
    ticket: g.ticket,
    surge: tipMult(g),
    end: g.phase === 'end' && g.endT > 1.1,
  };
}

const starStr = (n: number): string => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));

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
  const boost = useRef({ held: false, was: false });
  const me = useRef(playerPerson(s.look));
  const look = useRef<VehicleLook>(bike ? { kind: 'bike', body: me.current.shirt, shirt: me.current.shirt, heads: [me.current.hair], bag: '#e0503c' } : { kind: 'taxi', body: me.current.shirt, heads: [me.current.hair], bag: '#e0503c' });
  const [hud, setHud] = useState<Hud>(() => snapshot(sim.current!));
  const hudKey = useRef('');

  useEffect(() => {
    soundInit();
    const codes = ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyB'];
    const kd = (e: KeyboardEvent) => {
      if (codes.includes(e.code)) {
        e.preventDefault();
        boost.current.held = true;
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (codes.includes(e.code)) boost.current.held = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  const finish = (): void => {
    const g = sim.current!;
    if (done.current || g.phase !== 'end') return;
    done.current = true;
    onDone({
      score: g.score,
      stats: { delivered: g.delivered, missed: g.missed, earned: Math.round(g.earned), ticket: g.ticket ? 1 : 0, crashes: g.crashes, potholes: g.bumps, rating: Math.round(avgStars(g) * 10) / 10, bestStreak: g.bestStreak },
    });
  };

  useLoop(
    (dt) => {
      const g = sim.current!;
      const f = fx.current;
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
      const b = boost.current;
      const boostIn = bike ? b.held : b.held && !b.was;
      b.was = b.held;
      stepTown(g, { ix, iy, throttle, slow: input.down.has('action'), boost: boostIn }, dt);
      f.update(dt);

      if (g.phase === 'count') {
        const n = Math.floor(g.t);
        if (n !== lastCount.current && n < 3) {
          lastCount.current = n;
          sound.tick();
        }
      }
      const sp = Math.hypot(g.p.vx, g.p.vy);
      if (!bike && g.phase === 'play' && Math.random() < sp / 140) f.puff(g.p.x - Math.sin(g.p.ang) * 8, g.p.y + Math.cos(g.p.ang) * 8, '#c8c4d0', 0, 0);
      if (g.ev.on && g.ev.kind === 'rain' && sp > 20 && Math.random() < 0.3) f.puff(g.p.x, g.p.y + 3, '#9ac0e8', -g.p.vx * 0.2, -g.p.vy * 0.2);

      for (const e of g.events) {
        const ex = e.x ?? g.p.x;
        const ey = e.y ?? g.p.y;
        switch (e.e) {
          case 'go':
            sound.go();
            break;
          case 'new':
            beep(note(24), 0.05, 'square', 0.07);
            beep(note(28), 0.08, 'square', 0.07, note(28), 0.06);
            break;
          case 'pickup':
            sound.pick();
            f.burst(ex, ey, 12, [e.c ?? '#ffffff', '#ffffff'], 30, 0.5);
            f.float(ex, ey - 8, 'GOT IT!', e.c ?? '#ffffff');
            break;
          case 'drop': {
            // doorbell ding-dong, then the cash register
            beep(note(31), 0.22, 'triangle', 0.14);
            beep(note(27), 0.3, 'triangle', 0.14, note(27), 0.18);
            setTimeout(() => sfx(e.n && e.n >= 5 ? 'star' : 'coin'), 380);
            f.burst(ex, ey, e.n && e.n >= 5 ? 26 : 16, [e.c ?? '#ffffff', '#ffe070', '#7ee08a'], 45, 0.8);
            f.float(ex, ey - 10, e.s ?? '+$', '#7ee08a');
            if (e.n && e.n >= 5) f.flash('#fff3a0', 0.12);
            break;
          }
          case 'streak':
            sound.combo(e.n ?? 2);
            f.float(ex, ey - 8, `STREAK x${e.n} ${e.s}`, '#ffd23a');
            break;
          case 'fail':
          case 'refund':
            sfx('bad');
            f.float(ex, ey - 12, e.e === 'refund' ? 'REFUNDED' : 'REASSIGNED', '#ff7a6a');
            break;
          case 'late':
            sfx('bad');
            f.float(ex, ey - 12, 'LATE!', '#ff7a6a');
            break;
          case 'crash':
            sound.crash();
            f.shake(3, 0.3);
            f.flash('#ff4030', 0.12);
            f.burst(ex, ey, 14, ['#ffe070', '#ffffff', '#ff8a1e', '#7ac0ff'], 45, 0.5, 40);
            f.float(ex, ey - 12, e.s ?? 'BONK!', '#ffe070');
            break;
          case 'hole':
            sound.thud();
            f.shake(2, 0.2);
            f.burst(ex, ey, 8, ['#6a6a7a', '#3e3e4a', '#c8c0b0'], 25, 0.4);
            f.float(ex, ey - 10, 'SLOSH', '#c8c0b0');
            break;
          case 'ticket':
            sfx('spend');
            [0, 0.18, 0.36].forEach((d, i) => beep(i % 2 ? 660 : 880, 0.15, 'square', 0.08, i % 2 ? 660 : 880, d));
            f.flash('#ff2020', 0.25);
            f.shake(2, 0.25);
            f.float(ex, ey - 14, 'TICKET!', '#ff7a6a');
            break;
          case 'boost':
            noise(0.4, 0.18, 900);
            beep(note(12), 0.35, 'sawtooth', 0.06, note(24));
            f.shake(1, 0.2);
            f.float(ex, ey - 12, 'BOOST!', '#ffb020');
            break;
          case 'tired':
            beep(note(7), 0.2, 'triangle', 0.08, note(2));
            break;
          case 'skid':
            noise(0.18, 0.08, 5200);
            break;
          case 'wrong':
            sound.honk();
            f.flash('#ff4030', 0.1);
            f.float(ex, ey - 12, 'WRONG WAY!', '#ff7a6a');
            break;
          case 'hold':
            beep(note(19), 0.08, 'square', 0.08);
            break;
          case 'weather':
            if (e.s === 'rain') noise(1.2, 0.12, 700);
            else sound.fanfare();
            break;
          case 'end':
            setTimeout(() => (g.score >= 0.6 ? sound.fanfare() : sound.sad()), 300);
            break;
        }
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
      if (g.phase === 'end' && g.endT > 1.6 && input.pressed.has('action')) finish();
    },
    true,
    input,
  );

  const g = sim.current;
  const best = hud.end ? bestDrop(g) : null;
  return (
    <div className="mini drive dlv">
      <MiniHud
        items={[
          { label: 'Shift left', value: `${hud.left}s`, warn: hud.left <= 10 },
          { label: 'Earned', value: `$${hud.earned}` },
          { label: 'Rating', value: hud.delivered ? `★${hud.rating.toFixed(1)}` : '★ -' },
          { label: bike ? 'Bike bag' : 'Car bags', value: `${hud.bag}/${hud.cap}` },
          ...(hud.ticket ? [{ label: 'Ticket', value: 'YES', warn: true }] : []),
        ]}
      >
        <span className="dlv-boost" aria-label={bike ? 'Sprint stamina' : 'Boosts left'}>
          <small>{bike ? 'Sprint' : 'Boost'}</small>
          {bike ? (
            <i className="dlv-stam">
              <b style={{ width: `${hud.stamina * 100}%` }} />
            </i>
          ) : (
            <em>{'⚡'.repeat(hud.boosts) + '·'.repeat(BOOSTS - hud.boosts)}</em>
          )}
        </span>
      </MiniHud>
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
              <>Follow the dotted GPS line: restaurant first, then the matching door.</>,
              <>🤝 orders: STOP at the door until the ring fills.</>,
              <>Fast + hot + no spills = ★★★★★ and big tips.</>,
              bike ? <>Hold SPRINT (Shift/X) up the hill. Bikes cut through the park!</> : <>BOOST (Shift/X) gives a burst of speed. You have 3.</>,
            ]}
          />
          {hud.end && (
            <div className="dlv-end" role="dialog" aria-label="Shift summary">
              <h4>Shift over!</h4>
              <p className="dlv-stars" aria-label={`${hud.rating} stars`}>
                {g.drops.length ? starStr(hud.rating) : '☆☆☆☆☆'} <small>{g.drops.length ? `${hud.rating.toFixed(1)} avg` : 'no ratings'}</small>
              </p>
              <p>
                <b>{hud.delivered}</b> deliver{hud.delivered === 1 ? 'y' : 'ies'} · <b>${hud.earned}</b> pay + tips
                {g.bestStreak >= 2 ? ` · best streak x${g.bestStreak}` : ''}
              </p>
              {best && (
                <p className="muted">
                  Best drop: {RESTS[best.rest].icon} {RESTS[best.rest].label} run, {starStr(best.stars)} +${Math.round(best.pay)}
                </p>
              )}
              {g.ticket && <p className="warn">🚨 Speeding ticket in the 15 zone</p>}
              {g.missed > 0 && <p className="muted">{g.missed} order{g.missed === 1 ? '' : 's'} lost to slow driving</p>}
              <blockquote>{g.drops.length ? reviewFor(g) : '“Where is my food??” — everyone'}</blockquote>
              <button className="btn primary" autoFocus onClick={finish}>
                Clock out ▶
              </button>
            </div>
          )}
        </div>
        <div className="drive-side">
          <div className={`drive-bubble ${hud.kind}`} aria-live="polite">
            <small>Dispatch app</small>
            <span>{hud.say}</span>
          </div>
          <div className="drive-orders" aria-label="Orders (tap one to point the GPS at it)">
            {hud.orders.length === 0 && <p className="mini-note">{hud.left === 0 ? 'Shift complete.' : 'Waiting for orders…'}</p>}
            {hud.orders.map((o) => (
              <button
                type="button"
                key={o.id}
                className={`drive-order ${o.carry ? 'carry' : ''} ${o.t <= 6 ? 'hurry' : ''} ${o.focus ? 'focus' : ''}`}
                onClick={() => {
                  sim.current!.focus = o.id;
                  sim.current!.routeT = 0;
                }}
              >
                <i style={{ background: o.color }} />
                <span>
                  <em>{o.carry ? 'DROP OFF' : 'PICK UP'}</em>
                  {o.icon} {o.label}
                  {o.carry && <em>{o.req}</em>}
                </span>
                <b>{o.t > 0 ? `${o.t}s` : 'LATE'}</b>
                <div className="bar">
                  <div style={{ width: `${o.frac * 100}%` }} />
                </div>
                {o.carry && (
                  <div className="heat" title="Food temperature">
                    <div style={{ width: `${o.heat * 100}%` }} />
                  </div>
                )}
              </button>
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
          <button
            type="button"
            className="tp-btn drive-btn boost"
            aria-label={bike ? 'sprint' : 'boost'}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              boost.current.held = true;
            }}
            onPointerUp={() => (boost.current.held = false)}
            onPointerCancel={() => (boost.current.held = false)}
            onLostPointerCapture={() => (boost.current.held = false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {bike ? 'SPRINT' : 'BOOST'}
          </button>
        </div>
      </div>
      <p className="drive-keys">Arrows/WASD drive · hold SPACE to go slow · Shift or X to {bike ? 'sprint' : 'boost'} · tap an order to point the GPS at it</p>
    </div>
  );
}

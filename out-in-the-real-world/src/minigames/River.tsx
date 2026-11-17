// River Run: float the river in an inner tube with Rae. Steer with left/right, paddle (up) for a
// burst, drag your feet (down) to slow. Dodge rocks, logs, low branches and a whirlpool, hit the
// smooth V over the waterfall, ride the rapids, steer into the rope swing, grab snacks, Rae's lost
// sandal and the cooler. Three wipeouts and you're out. On the road trip it ends at the ocean.
import { useEffect, useRef, useState } from 'react';
import { castFor, playerPerson } from '../art/people.ts';
import { rect } from '../art/px.ts';
import { ctxOf, MiniHud, PixelCanvas, TouchPad, useInput, useLoop, type MiniProps } from './kit.tsx';
import { Chip, note } from './riverAudio.ts';
import { drawBubble, drawHud, drawLight, drawPostcard, drawRiverScene, sy, type RiverLooks, type SceneFx, type Splash } from './riverArt.ts';
import { baseSpeed, clamp, COUNT, finishLine, heldValue, newRiver, RH, RW, stepRiver, zoneWeight, type ItemKind, type RiverSim } from './riverSim.ts';
import { centered, drawBanner, drawCount, Fx, pick } from './shiftKit.ts';
import './river.css';

const ITEM_NAME: Record<ItemKind, string> = { chips: 'CHIPS!', soda: 'SODA!', melon: 'MELON!', sandal: 'SANDAL!', cooler: 'COOLER!' };

interface HudView {
  wipes: number;
  snacks: number;
  near: number;
  prog: number;
  say: string;
}

export function River({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const trip = !!s.flags.roadTrip || (!!s.flags.roadTripBooked && s.week >= 34);
  const sim = useRef<RiverSim | null>(null);
  if (!sim.current) sim.current = newRiver((Date.now() ^ (Math.random() * 1e9)) | 0, trip);
  const fx = useRef<Fx>(new Fx(reducedMotion));
  const scene = useRef<SceneFx>({ splashes: [], ripples: [], cooler: { x: 0, d: 0, vx: 0, vd: 0 } });
  const chip = useRef(new Chip());
  const water = useRef<{ set: (c: number, v: number) => void; stop: () => void } | null>(null);
  const looks = useRef<RiverLooks | null>(null);
  if (!looks.current) {
    const me = playerPerson(s.look);
    looks.current = {
      me: { p: me, tube: me.shirt === '#e0503c' ? '#f2b632' : '#e0503c', shades: '#1c1424', suit: '#2f5fb8' },
      rae: { p: castFor('rae').p, tube: '#ef7fae', shades: '#3a1a4a', suit: '#2f3a5c' },
    };
  }
  const pointer = useRef<{ x: number; on: boolean }>({ x: 0, on: false });
  const done = useRef(false);
  const lastCount = useRef('');
  const prevAir = useRef(0);
  const [hud, setHud] = useState<HudView>({ wipes: 0, snacks: 0, near: 100, prog: 0, say: '' });
  const hudKey = useRef('');

  useEffect(() => {
    const c = chip.current;
    c.init();
    water.current = c.noiseLoop(700, 0.05);
    return () => c.stopAll();
  }, []);

  const splash = (xw: number, d: number, n: number, speed: number, up: number, colors = ['#ffffff', '#d8f6f0', '#9adcd0']): void => {
    const sc = scene.current;
    const k = reducedMotion ? Math.ceil(n / 2) : n;
    for (let i = 0; i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.4 + Math.random() * 0.5;
      sc.splashes.push({ x: xw, d, h: 1, vx: Math.cos(a) * v, vd: Math.sin(a) * v * 0.7, vh: up * (0.5 + Math.random() * 0.8), life, max: life, c: colors[i % colors.length] });
    }
  };
  const ripple = (xw: number, d: number, r: number): void => {
    scene.current.ripples.push({ x: xw, d, r, max: 0.9, life: 0.9 });
  };

  useLoop(
    (dt, t) => {
      const g = sim.current!;
      const f = fx.current;
      const sc = scene.current;
      const ch = chip.current;
      // ---- input ----
      let steer = (input.down.has('right') ? 1 : 0) - (input.down.has('left') ? 1 : 0);
      if (steer === 0 && pointer.current.on) steer = clamp((pointer.current.x - g.p.x) / 14, -1, 1);
      stepRiver(g, { steer, paddle: input.down.has('up') || input.down.has('action'), brake: input.down.has('down') }, dt);
      f.update(dt);

      // ---- count-in beeps ----
      if (g.phase === 'count') {
        const lab = String(3 - Math.floor(g.t / 0.55));
        if (lab !== lastCount.current && g.t < COUNT) {
          lastCount.current = lab;
          ch.beep(note(14), 0.08, 'square', 0.09);
        }
      }

      // ---- events -> juice ----
      const p = g.p;
      for (const e of g.events) {
        const ey = sy(g, e.d);
        switch (e.e) {
          case 'go':
            ch.beep(note(21), 0.08, 'square', 0.1);
            ch.beep(note(28), 0.2, 'square', 0.1, note(28), 0.08);
            splash(p.x, p.d, 10, 30, 40);
            break;
          case 'stroke':
            if (ch.gate('stroke', 0.1)) ch.noise(0.09, 0.08, 1400, 0, 500);
            splash(e.x, e.d - 2, 5, 18, 28);
            ripple(e.x, e.d, 4);
            break;
          case 'bonk':
            ch.noise(0.12, 0.3, 300);
            ch.beep(160, 0.12, 'square', 0.07, 90);
            f.kick(2.5);
            f.pop(e.x, ey - 14, pick(['BONK!', 'OOF!', 'CLONK!']), '#ffe27a');
            splash(e.x, e.d, 8, 30, 30);
            break;
          case 'bank':
            if (ch.gate('bank', 0.4)) ch.noise(0.1, 0.12, 600);
            splash(e.x, e.d, 4, 18, 20, ['#c9b183', '#ffffff']);
            break;
          case 'wipe':
            ch.noise(0.6, 0.35, 3200, 0, 400);
            ch.beep(note(24), 0.35, 'square', 0.08, note(0));
            f.kick(4.5);
            f.blink('#e8fffb', 0.35);
            f.pop(e.x, ey - 18, e.s === 'SPUN OUT' ? 'SPUN OUT!' : e.s === 'OVER THE FALLS' ? 'OVER THE ROCKS!' : 'WIPEOUT!', '#ff9a7a');
            splash(e.x, e.d, 30, 50, 70);
            ripple(e.x, e.d, 14);
            break;
          case 'pick': {
            const v = e.k === 'cooler' ? 3 : 1;
            ch.arp(v > 1 ? [19, 23, 26, 31, 35] : [24, 28, 31], 0.06, 'square', 0.08, 0.1);
            f.burst(e.x, ey, ['#fff3c4', '#ffffff', '#7cf08a'], 12, 40, 30, 0.5);
            f.pop(e.x, ey - 12, `+${ITEM_NAME[e.k ?? 'chips']}`, '#7cf08a');
            ripple(e.x, e.d, 8);
            break;
          }
          case 'sandal':
            ch.arp([19, 23, 26, 31, 35, 38], 0.07, 'square', 0.09, 0.14);
            f.burst(e.x, ey, ['#ef7fae', '#ffffff', '#ffe27a'], 18, 50, 30, 0.7);
            f.pop(e.x, ey - 12, '+SANDAL HERO!', '#ffb4d0');
            break;
          case 'lose':
            ch.beep(note(19), 0.1, 'triangle', 0.09);
            ch.beep(note(12), 0.18, 'triangle', 0.09, note(12), 0.1);
            f.pop(e.x, ey + 14, 'LOST IT!', '#ff9a7a');
            break;
          case 'grab':
            ch.beep(300, 0.6, 'triangle', 0.1, 900);
            ch.babble(26, 4);
            f.pop(e.x, ey - 24, 'ROPE SWING!', '#ffe27a');
            break;
          case 'drop':
            if (e.s === 'clean') {
              ch.noise(0.5, 0.25, 600, 0, 3000, 'bandpass');
              ch.beep(400, 0.5, 'sine', 0.1, 1200);
              f.pop(e.x, ey - 20, 'WHEEEE!', '#7cf08a');
            } else {
              ch.noise(0.4, 0.3, 2400);
              f.kick(3);
            }
            break;
          case 'wave':
            ch.beep(note(26), 0.05, 'square', 0.05, note(31));
            splash(e.x, e.d, 6, 22, 35);
            break;
          case 'snag':
            ch.noise(0.18, 0.2, 5000, 0, 1500, 'highpass');
            ch.beep(note(12), 0.1, 'square', 0.06, note(5));
            f.burst(e.x, ey - 4, ['#3e8a3a', '#5aa44a', '#7cc068'], 14, 35, 40, 0.7);
            f.pop(e.x, ey - 16, 'THWAP!', '#ffe27a');
            break;
          case 'say':
            if (ch.gate('say', 0.5)) ch.babble(30, /!/.test(e.s ?? '') ? 4 : 3);
            break;
          case 'whirl':
            ch.beep(200, 0.8, 'sine', 0.06, 700);
            f.pop(e.x, ey - 20, 'SPINNING!', '#bfe8ff');
            break;
          case 'finish':
            ch.arp([12, 16, 19, 24, 28, 31, 36], 0.09, 'square', 0.09, 0.18);
            break;
          case 'out':
            ch.arp([12, 7, 4, 0], 0.16, 'triangle', 0.1, 0.22);
            break;
          default:
            break;
        }
      }
      // landing from the rope swing / falls: cannonball
      if (prevAir.current > 0 && p.air <= 0 && p.airPeak > 6) {
        const big = p.airPeak > 15;
        ch.noise(big ? 0.7 : 0.4, big ? 0.35 : 0.22, 2600, 0, 300);
        ch.noise(0.2, 0.3, 200);
        f.kick(big ? 4 : 2);
        splash(p.x, p.d, big ? 40 : 18, big ? 60 : 35, big ? 90 : 50);
        ripple(p.x, p.d, big ? 20 : 12);
        if (big) f.pop(p.x, sy(g, p.d) - 24, 'CANNONBALL! +BONUS', '#7cf08a');
        p.airPeak = 0;
      }
      prevAir.current = p.air;
      if (g.rae.air > 0 && g.rae.air - dt <= 0) splash(g.rae.x, g.rae.d, 14, 35, 50);

      // ---- world particles ----
      for (let i = sc.splashes.length - 1; i >= 0; i--) {
        const q: Splash = sc.splashes[i];
        q.life -= dt;
        q.x += q.vx * dt;
        q.d += q.vd * dt;
        q.h += q.vh * dt;
        q.vh -= 200 * dt;
        if (q.life <= 0 || q.h < 0) sc.splashes.splice(i, 1);
      }
      for (let i = sc.ripples.length - 1; i >= 0; i--) {
        sc.ripples[i].life -= dt;
        if (sc.ripples[i].life <= 0) sc.ripples.splice(i, 1);
      }
      // the cooler on its tow rope
      const cl = sc.cooler;
      if (!g.towing) {
        cl.x = p.x;
        cl.d = p.d - 14;
        cl.vx = cl.vd = 0;
      } else {
        const dx = p.x - cl.x;
        const dd = p.d - 15 - cl.d;
        cl.vx += (dx * 9 - cl.vx * 3) * dt;
        cl.vd += (dd * 9 - cl.vd * 3) * dt;
        cl.x += cl.vx * dt;
        cl.d += cl.vd * dt;
      }
      // ambient water: louder and brighter in the rapids, near the falls
      const nearFall = g.c.falls.some((fl) => fl.d - p.d > -30 && fl.d - p.d < 160);
      const wr = zoneWeight(p.d, 'rapids');
      water.current?.set(500 + baseSpeed(p.d) * 8 + wr * 900 + (nearFall ? 800 : 0), 0.035 + wr * 0.05 + (nearFall ? 0.05 : 0));

      // ---- draw ----
      const x = ctxOf(canvas.current);
      if (x) {
        const L = looks.current!;
        const post = trip && g.phase === 'end' && !g.out ? clamp((g.endT - 1.2) / 0.8, 0, 1) : 0;
        if (post < 1) {
          const [ox, oy] = f.offset();
          x.save();
          x.translate(ox, oy);
          drawRiverScene(x, g, t, L, sc);
          drawLight(x, g, t);
          drawBubble(x, g, t);
          f.draw(x, RW, RH);
          x.restore();
          drawHud(x, g, t, L);
        }
        if (post > 0) {
          x.globalAlpha = post;
          drawPostcard(x, post, t, L.me.p, L.rae.p);
          x.globalAlpha = 1;
        }
        drawCount(x, g.t, RW, RH);
        if (g.phase === 'play' && g.gt < 2.4) {
          x.globalAlpha = Math.min(1, (2.4 - g.gt) * 2);
          rect(x, 0, RH - 14, RW, 14, 'rgba(20,12,34,0.7)');
          centered(x, 'STEER  ·  PADDLE  ·  DRAG FEET', RW / 2, RH - 10, '#fff3c4');
          x.globalAlpha = 1;
        }
        if (g.phase === 'end') {
          const at = trip && !g.out ? 2.2 : 0.7;
          if (g.endT > at) {
            const sc0 = g.score;
            const head = g.out ? 'WASHED OUT!' : trip ? 'THE OCEAN!' : g.wipes === 0 ? 'RIVER LEGEND!' : sc0 >= 0.6 ? 'GREAT FLOAT!' : 'MADE IT!';
            const sub = g.out ? 'THREE WIPEOUTS. RAE TOWS YOU IN.' : `${g.wipes} WIPEOUT${g.wipes === 1 ? '' : 'S'} · ${heldValue(g)} SNACK PTS · ${Math.round((g.nearT / Math.max(1, g.gt)) * 100)}% WITH RAE`;
            drawBanner(x, head, sub, !g.out, g.endT - at, RW, trip && !g.out ? RH * 0.62 : RH);
          }
        }
      }

      // ---- HUD (React) ----
      const h: HudView = {
        wipes: g.wipes,
        snacks: g.held.length + (g.towing ? 1 : 0) + (g.sandal ? 1 : 0),
        near: Math.min(100, Math.round((g.nearT / Math.max(0.5, g.gt)) * 100)),
        prog: Math.round(clamp(p.d / finishLine(g.c), 0, 1) * 100),
        say: g.say.t > 0 ? g.say.text : '',
      };
      if (g.gt < 0.5) h.near = 100;
      const key = `${h.wipes}|${h.snacks}|${h.near}|${h.prog}|${h.say}`;
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(h);
      }

      // ---- the end ----
      const wait = g.out ? 3.2 : trip ? 5.4 : 3.4;
      if (g.phase === 'end' && g.endT > wait && !done.current) {
        done.current = true;
        water.current?.stop();
        onDone({
          score: g.score,
          stats: { wipeouts: g.wipes, bonks: g.bonks, snacks: g.held.length, cooler: g.towing ? 1 : 0, sandal: g.sandal ? 1 : 0, withRae: Math.round((g.nearT / Math.max(1, g.gt)) * 100), ropeSwing: g.rope ? 1 : 0, cleanDrop: g.fallClean ? 1 : 0, out: g.out ? 1 : 0, ocean: trip ? 1 : 0 },
        });
      }
    },
    true,
    input,
  );

  return (
    <div className="mini river-run">
      <MiniHud
        items={[
          { label: 'Wipeouts', value: `${hud.wipes}/3`, warn: hud.wipes >= 2 },
          { label: 'Snacks', value: hud.snacks },
          { label: 'With Rae', value: `${hud.near}%`, warn: hud.near < 50 },
          { label: trip ? 'To the sea' : 'River', value: `${hud.prog}%` },
        ]}
      />
      <div className="rr-main">
        <div className="rr-canvas-wrap">
          <PixelCanvas
            canvasRef={canvas}
            width={RW}
            height={RH}
            onPointer={(px, _py, k) => {
              pointer.current = { x: px, on: k !== 'up' };
            }}
          />
        </div>
        <aside className="rr-side" aria-live="polite">
          <div className={`rr-say ${hud.say ? 'on' : ''}`}>
            <small>Rae</small>
            <span>{hud.say || '…'}</span>
          </div>
          <ul className="rr-keys">
            <li>
              <b>← →</b> steer
            </li>
            <li>
              <b>↑</b> paddle (burst)
            </li>
            <li>
              <b>↓</b> drag feet (slow)
            </li>
          </ul>
          <ul className="rr-tips">
            <li>Hit rocks head-on and you flip. Glance off and you just bonk.</li>
            <li>Wipe out and you drop what you’re holding.</li>
            <li>Waterfall: aim for the smooth V. Rope swing: steer into the ring.</li>
          </ul>
        </aside>
      </div>
      <div className="rr-pad">
        <TouchPad
          input={input}
          keys={[
            { key: 'left', label: '◀' },
            { key: 'down', label: 'DRAG ▼' },
            { key: 'up', label: 'PADDLE ▲' },
            { key: 'right', label: '▶' },
          ]}
        />
      </div>
      <p className="mini-note rr-touch-note">Hold ◀ ▶ (or drag on the river) to steer · PADDLE for a burst · DRAG to slow</p>
    </div>
  );
}

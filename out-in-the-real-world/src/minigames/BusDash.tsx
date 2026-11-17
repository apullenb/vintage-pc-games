// Bus Dash: you overslept. The bus blows past you during the count-in; sprint down the sidewalk
// to the stop before it leaves. Jump (up/space/tap) over dogs, strollers, puddles, signs and
// hydrants; duck (down/DUCK button) under ladders, sprinklers and low branches.
// Grab coffee for a burst of speed. Each bump costs time; the clock on the bus doesn't wait.
import { useRef, useState } from 'react';
import { playerPerson, type Person } from '../art/people.ts';
import { INK, rect, text, textWidth } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import { drawBackdrop, drawBranch, drawBus, drawCoffee, drawDog, drawHydrant, drawLadder, drawPigeon, drawPuddle, drawSign, drawSprinkler, drawStop, drawStroller, GROUND, passerby, STREET, type ObKind } from './busArt.ts';
import { drawRunner, shadow } from './busRunner.ts';
import { ctxOf, MiniHud, motes, PixelCanvas, TouchPad, useInput, useLoop, vignette, type MiniProps } from './kit.tsx';
import { centered, COUNT_TIME, countLabel, drawBanner, drawCount, Fx, hit, outlined, pick, rnd, type HudItem } from './shiftKit.ts';
import './shift.css';

const RX = 46; // runner's screen x
const DEPART = 31; // seconds on the bus clock after GO
const COURSE = 2280; // px from start to the bus door
const JUMP_V = 178;
const GRAV = 560;
const STAND_H = 26;
const DUCK_H = 13;
const PX_PER_M = 8;

interface Ob {
  kind: ObKind;
  x: number; // world x (left edge)
  w: number; // hit width
  lo: number; // hit band, height above the ground
  hi: number;
  who?: Person;
  hit: boolean;
  passed: boolean;
  alt: number; // coffee: cup height above the ground
  birds?: { x: number; y: number; vx: number; vy: number }[];
}

const SAY: Partial<Record<ObKind, string[]>> = {
  dog: ['WOOF!', 'ARF!'],
  stroller: ['SORRY!', 'MY BAD!'],
  ladder: ['BONK!'],
  branch: ['BONK!', 'OW!'],
  sprinkler: ['SOAKED!'],
  sign: ['OOF!'],
  hydrant: ['OOF!', 'OUCH!'],
  puddle: ['SPLASH!'],
};

function makeOb(kind: ObKind, x: number, extra: Partial<Ob> = {}): Ob {
  const base = { kind, x, hit: false, passed: false, alt: 0 };
  switch (kind) {
    case 'dog':
      return { ...base, w: 14, lo: 0, hi: 9, who: passerby(), ...extra };
    case 'stroller':
      return { ...base, w: 12, lo: 0, hi: 13, who: passerby(), ...extra };
    case 'puddle':
      return { ...base, w: extra.w ?? 26, lo: 0, hi: 1, ...extra };
    case 'ladder':
      return { ...base, w: 44, lo: 16, hi: 30, who: { ...passerby(), hat: 'hard', hatColor: '#f2c230', vest: '#ff8a1e' }, ...extra };
    case 'sprinkler':
      return { ...base, w: 26, lo: 15, hi: 34, ...extra };
    case 'sign':
      return { ...base, w: 11, lo: 0, hi: 14, ...extra };
    case 'hydrant':
      return { ...base, w: 7, lo: 0, hi: 11, ...extra };
    case 'branch':
      return { ...base, w: 30, lo: 16, hi: 34, ...extra };
    case 'pigeons':
      return { ...base, w: 16, lo: -99, hi: -98, birds: [0, 1, 2, 3].map((i) => ({ x: i * 5 + rnd(0, 3), y: GROUND - 3, vx: 0, vy: 0 })), ...extra };
    case 'coffee':
      return { ...base, w: 8, lo: 0, hi: 0, alt: extra.alt ?? 8, ...extra };
  }
}

// Lay out the whole sidewalk: chunks of obstacles with gaps that tighten as you go.
function buildCourse(): { obs: Ob[]; coffees: number } {
  const obs: Ob[] = [];
  const coffeeAt = [0.24, 0.52, 0.78];
  let x = 170;
  let coffees = 0;
  const simple: ObKind[] = ['dog', 'stroller', 'puddle', 'ladder', 'sprinkler', 'sign', 'hydrant', 'branch'];
  let last: ObKind | null = null;
  while (x < COURSE - 110) {
    const prog = x / COURSE;
    if (coffeeAt.length && prog >= coffeeAt[0]) {
      coffeeAt.shift();
      coffees++;
      if (Math.random() < 0.5) {
        // a cup floating over a puddle: jump through it
        obs.push(makeOb('puddle', x, { w: 24 }));
        obs.push(makeOb('coffee', x + 12, { alt: 24 }));
        x += 24;
      } else {
        obs.push(makeOb('coffee', x, { alt: 7 }));
        x += 10;
      }
    } else if (prog > 0.35 && Math.random() < 0.3) {
      // combos: a jump then a duck (or two jumps) in quick succession
      const combo = pick([
        ['dog', 'ladder'],
        ['puddle', 'puddle'],
        ['sign', 'branch'],
        ['hydrant', 'sprinkler'],
        ['stroller', 'branch'],
      ] as [ObKind, ObKind][]);
      obs.push(makeOb(combo[0], x));
      x += obs[obs.length - 1].w + 66 + rnd(0, 14);
      obs.push(makeOb(combo[1], x));
      x += obs[obs.length - 1].w;
      last = combo[1];
    } else if (Math.random() < 0.1) {
      obs.push(makeOb('pigeons', x));
      x += 20;
    } else {
      let k = pick(simple);
      while (k === last) k = pick(simple);
      last = k;
      obs.push(makeOb(k, x));
      x += obs[obs.length - 1].w;
    }
    x += (132 - 52 * prog) * rnd(0.85, 1.2);
  }
  return { obs, coffees };
}

interface Run {
  fx: Fx;
  me: Person;
  obs: Ob[];
  coffees: number;
  phase: 'count' | 'run' | 'board' | 'missed' | 'done';
  pos: number;
  alt: number;
  vy: number;
  grounded: boolean;
  duck: boolean;
  jumpBuf: number;
  ptrJump: boolean;
  stun: number;
  invuln: number;
  boost: number;
  speed: number;
  runPh: number;
  left: number;
  bumps: number;
  coffee: number;
  busX: number; // bus front, world x
  busV: number;
  door: number;
  endT: number;
  dust: number;
  lastLabel: string | null;
  lastSec: number;
  score: number;
  sent: boolean;
  cleared: number;
  made: boolean | null;
  freeze: number; // hit-stop: the world pauses for a beat on a hard bump
}

export function BusDash({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const run = useRef<Run | null>(null);
  if (!run.current) {
    const { obs, coffees } = buildCourse();
    run.current = {
      fx: new Fx(reducedMotion),
      me: { ...playerPerson(s.look), shoes: '#e8e8f0' },
      obs,
      coffees,
      phase: 'count',
      pos: 0,
      alt: 0,
      vy: 0,
      grounded: true,
      duck: false,
      jumpBuf: 0,
      ptrJump: false,
      stun: 0,
      invuln: 0,
      boost: 0,
      speed: 0,
      runPh: 0,
      left: DEPART,
      bumps: 0,
      coffee: 0,
      busX: -60,
      busV: 0,
      door: 0,
      endT: 0,
      dust: 0,
      lastLabel: null,
      lastSec: 99,
      score: 0,
      sent: false,
      cleared: 0,
      made: null,
      freeze: 0,
    };
  }
  const r = run.current;
  const [hud, setHud] = useState<HudItem[]>([]);
  const hudKey = useRef('');

  const finish = (made: boolean): void => {
    r.made = made;
    const q = 0.6 * Math.max(0, 1 - r.bumps / 8) + 0.2 * (r.coffee / Math.max(1, r.coffees)) + 0.2 * Math.max(0, Math.min(1, r.left / 5));
    r.score = made ? Math.min(1, 0.5 + 0.5 * q) : 0.42 * Math.pow(Math.max(0, Math.min(1, r.pos / COURSE)), 1.5);
  };

  useLoop(
    (dt0, t) => {
      const { fx } = r;
      // hit-stop: freeze the sim (not the drawing) for a moment after a hard bump
      const dt = r.freeze > 0 ? 0 : dt0;
      r.freeze = Math.max(0, r.freeze - dt0);
      fx.update(dt);
      const stopX = COURSE + 22; // bus front when parked

      if (r.phase === 'count') {
        const lab = countLabel(t);
        if (lab !== r.lastLabel) {
          r.lastLabel = lab;
          if (lab) sfx(lab === 'GO!' ? 'select' : 'click');
        }
        // the bus roars past you during the count-in
        const u = t / (COUNT_TIME + 0.4);
        r.busX = r.pos - RX - 20 + u * 300;
        if (t >= COUNT_TIME) {
          r.phase = 'run';
          r.busX = stopX;
          r.door = 1;
        }
      } else if (r.phase === 'run') {
        r.left -= dt;
        const sec = Math.ceil(r.left);
        if (sec !== r.lastSec) {
          r.lastSec = sec;
          if (sec <= 5 && sec > 0) sfx('type');
        }
        // input
        if (hit(input, 'up') || hit(input, 'action')) r.jumpBuf = 0.13;
        r.jumpBuf = Math.max(0, r.jumpBuf - dt);
        const holdJump = input.down.has('up') || input.down.has('action') || r.ptrJump;
        r.duck = input.down.has('down') && r.stun <= 0;
        // speed
        const prog = Math.min(1, r.pos / COURSE);
        r.stun = Math.max(0, r.stun - dt);
        r.invuln = Math.max(0, r.invuln - dt);
        r.boost = Math.max(0, r.boost - dt);
        let want = 80 + 16 * prog + (r.boost > 0 ? 36 : 0);
        if (r.stun > 0) want *= 0.2;
        r.speed += (want - r.speed) * Math.min(1, dt * (r.stun > 0 ? 12 : 4));
        r.pos += r.speed * dt;
        r.runPh += r.speed * dt * 0.1;
        // vertical
        if (r.grounded && r.jumpBuf > 0 && r.stun <= 0) {
          r.vy = -JUMP_V;
          r.grounded = false;
          r.jumpBuf = 0;
          sfx('click');
          fx.spray(RX + 5, GROUND, ['#e8e0d0', '#c8c0b0'], 5, -30, -10, 12, 60, 0.3);
        }
        if (!r.grounded) {
          if (!holdJump && r.vy < -70) r.vy = -70;
          r.vy += GRAV * dt * (r.duck ? 2.4 : 1);
          r.alt -= r.vy * dt;
          if (r.alt <= 0) {
            r.alt = 0;
            r.vy = 0;
            r.grounded = true;
            fx.spray(RX + 7, GROUND, ['#e8e0d0', '#c8c0b0'], 6, 0, -14, 22, 60, 0.3);
          }
        }
        // running dust
        r.dust -= dt;
        if (r.grounded && r.dust <= 0 && r.speed > 40) {
          r.dust = 0.14;
          fx.spray(RX + 3, GROUND - 1, ['#d8d0c4'], 2, -40, -12, 8, 40, 0.3);
        }
        // collisions
        const h = r.duck ? DUCK_H : STAND_H;
        const ax0 = r.pos + 4;
        const ax1 = r.pos + 10;
        for (const o of r.obs) {
          if (o.passed) continue;
          if (o.x + o.w < r.pos - 2) {
            o.passed = true;
            if (!o.hit && o.kind !== 'pigeons' && o.kind !== 'coffee') {
              r.cleared++;
              if (r.cleared % 4 === 0) fx.pop(RX + 8, GROUND - 40, pick(['NICE!', 'SMOOTH!', 'PARKOUR!']), '#fff3c4');
            }
            continue;
          }
          if (o.x > ax1 + 30) break;
          if (o.kind === 'pigeons') {
            if (o.birds && o.birds[0].vy === 0 && o.x - r.pos < 26) {
              for (const b of o.birds) {
                b.vx = rnd(10, 50);
                b.vy = -rnd(40, 70);
              }
              sfx('type');
              fx.spray(o.x - r.pos + RX + 8, GROUND - 4, ['#aab0c8', '#ffffff'], 6, 10, -30, 20, 40, 0.4);
            }
            continue;
          }
          const overlapX = ax1 > o.x + 1 && ax0 < o.x + o.w - 1;
          if (!overlapX) continue;
          if (o.kind === 'coffee') {
            const cy = o.alt;
            if (!o.hit && r.alt < cy + 5 && r.alt + h > cy - 5) {
              o.hit = true;
              r.coffee++;
              r.boost = 2.4;
              sfx('coin');
              fx.burst(o.x - r.pos + RX + 4, GROUND - cy, ['#ffe27a', '#ffffff', '#3caa6a'], 12, 45);
              fx.pop(RX + 8, GROUND - 42, 'COFFEE! ZOOM!', '#7cf08a');
            }
            continue;
          }
          if (o.hit || r.invuln > 0) continue;
          const lo = o.lo;
          const hi = o.hi - 1;
          if (o.kind === 'puddle' ? r.alt < 1 : r.alt < hi && r.alt + h > lo) {
            o.hit = true;
            const soft = o.kind === 'puddle' || o.kind === 'sprinkler';
            r.bumps += soft ? 0.5 : 1;
            r.stun = soft ? 0.45 : 0.85;
            r.invuln = soft ? 0.5 : 1.2;
            sfx(soft ? 'spend' : 'bad');
            fx.kick(soft ? 1.5 : 3.5);
            const sx = RX + 7;
            if (soft) fx.spray(sx, GROUND - (o.kind === 'puddle' ? 2 : 20), ['#a8d8ff', '#ffffff', '#5a7aa8'], 14, 0, -50, 35, 160, 0.6);
            else {
              fx.burst(sx, GROUND - h, ['#ffe27a', '#ffffff'], 8, 40, 30, 0.5);
              fx.blink('#ff4a3a', 0.18);
              if (!reducedMotion) r.freeze = 0.08;
            }
            fx.pop(sx + 4, GROUND - 44, pick(SAY[o.kind] ?? ['OOF!']), soft ? '#bfe8ff' : '#ff9a7a');
            if (!r.grounded && !soft) r.vy = Math.max(r.vy, 0);
          }
        }
        // the race
        if (r.pos + 7 >= COURSE) {
          r.phase = 'board';
          r.endT = 0;
          finish(true);
          sfx('star');
          fx.burst(RX + 7, GROUND - 14, ['#7cf08a', '#ffe27a', '#ffffff'], 24, 70);
        } else if (r.left <= 0) {
          r.left = 0;
          r.phase = 'missed';
          r.endT = 0;
          finish(false);
          sfx('bad');
        }
      } else if (r.phase === 'board') {
        r.endT += dt;
        r.speed = Math.max(0, r.speed - dt * 200);
        r.pos = Math.min(COURSE + 4, r.pos + r.speed * dt);
        r.alt = Math.max(0, r.alt - dt * 40);
        if (r.endT > 0.5) r.door = Math.max(0, r.door - dt * 3);
        if (r.endT > 0.9) {
          r.busV += dt * 90;
          r.busX += r.busV * dt;
        }
      } else if (r.phase === 'missed') {
        r.endT += dt;
        r.door = Math.max(0, r.door - dt * 3);
        if (r.endT > 0.3) {
          r.busV += dt * 100;
          r.busX += r.busV * dt;
        }
        r.speed = Math.max(0, r.speed - dt * 60);
        r.pos += r.speed * dt;
        r.runPh += r.speed * dt * 0.1;
        r.alt = Math.max(0, r.alt - dt * 60);
      }
      if (r.made !== null && r.endT >= 2.3 && !r.sent) {
        r.sent = true;
        r.phase = 'done';
        onDone({ score: r.score, stats: { made: r.made ? 1 : 0, bumps: Math.ceil(r.bumps), coffee: r.coffee, secondsLeft: Math.round(r.left * 10) / 10 } });
      }
      // pigeons fly off
      for (const o of r.obs)
        if (o.birds)
          for (const b of o.birds)
            if (b.vy !== 0) {
              b.x += b.vx * dt;
              b.y += b.vy * dt;
              b.vy -= 10 * dt;
            }

      // HUD
      const toGo = Math.max(0, Math.ceil((COURSE - r.pos) / PX_PER_M));
      const items: HudItem[] = [
        { label: 'Bus leaves in', value: `0:${String(Math.ceil(r.left)).padStart(2, '0')}`, warn: r.left < 6 },
        { label: 'To the stop', value: `${toGo} m` },
        { label: 'Bumps', value: Math.ceil(r.bumps), warn: r.bumps > 0 },
        { label: 'Coffee', value: `${r.coffee}/${r.coffees}` },
      ];
      const key = items.map((i) => `${i.value}${i.warn ? '!' : ''}`).join('|');
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(items);
      }

      // ---------- draw ----------
      const x = ctxOf(canvas.current);
      if (!x) return;
      const cam = r.pos - RX;
      const [ox, oy] = fx.offset();
      x.save();
      x.translate(ox, oy);
      drawBackdrop(x, cam, t);
      // the stop and the bus
      drawStop(x, Math.round(COURSE + 30 - cam));
      const busScreen = r.busX - cam;
      if (busScreen > -10 && busScreen < 192 + 80) {
        const sign = r.phase === 'run' ? `0:${String(Math.ceil(r.left)).padStart(2, '0')}` : r.phase === 'count' ? ' 12' : r.phase === 'board' ? 'BYE!' : ' 12';
        drawBus(x, Math.round(busScreen), STREET, r.door, sign, t);
      }
      // obstacles, back to front
      for (const o of r.obs) {
        const sx = Math.round(o.x - cam);
        if (sx < -60 || sx > 200) continue;
        switch (o.kind) {
          case 'dog':
            drawDog(x, sx, t, o.who!);
            break;
          case 'stroller':
            drawStroller(x, sx, t, o.who!);
            break;
          case 'ladder':
            drawLadder(x, sx, t, o.who!);
            break;
          case 'branch':
            drawBranch(x, sx);
            break;
          default:
            break;
        }
      }
      for (const o of r.obs) {
        const sx = Math.round(o.x - cam);
        if (sx < -60 || sx > 200) continue;
        if (o.kind === 'puddle') drawPuddle(x, sx, o.w, t);
        else if (o.kind === 'sign') drawSign(x, sx);
        else if (o.kind === 'hydrant') drawHydrant(x, sx);
        else if (o.kind === 'pigeons' && o.birds) for (const b of o.birds) drawPigeon(x, sx + b.x, b.y, b.vy !== 0 ? Math.floor(t * 12) % 2 : 0);
      }
      // the first few obstacles get a JUMP / DUCK hint so you learn which is which
      const hints = r.obs.filter((q) => q.kind !== 'coffee' && q.kind !== 'pigeons').slice(0, 6);
      for (const o of hints) {
        if (o.kind === 'coffee' || o.kind === 'pigeons' || o.passed || o.hit) continue;
        const sx = Math.round(o.x - cam);
        if (sx > 200 || sx < RX + 12) continue;
        const duck = o.lo > 0;
        const cx = sx + Math.round(o.w / 2);
        const top = duck ? GROUND - o.lo + 4 : GROUND - o.hi - 13;
        const bob = reducedMotion ? 0 : Math.round(Math.sin(t * 8) * 1.5);
        const lab = duck ? 'DUCK' : 'JUMP';
        const c = duck ? '#ffb070' : '#7cf08a';
        const ay = top + bob;
        for (let k = 0; k < 3; k++) {
          const w = duck ? 5 - k * 2 : 1 + k * 2;
          rect(x, cx - Math.floor(w / 2) - 1, ay + k, w + 2, 1, INK);
          rect(x, cx - Math.floor(w / 2), ay + k, w, 1, c);
        }
        outlined(x, lab, cx - 7, duck ? ay + 5 : ay - 7, c);
      }
      // you
      const boardU = r.made ? Math.min(1, r.endT / 0.45) : 0;
      if (!(r.made && r.endT > 0.5)) {
        const lift = Math.round(r.alt + (GROUND - STREET) * boardU);
        if (!r.made) shadow(x, RX + 7, GROUND + 1, r.alt);
        const blink = r.invuln > 0 && Math.floor(t * 16) % 2 === 0;
        if (!blink) {
          let pose: 'run' | 'jump' | 'duck' | 'stand' = 'run';
          if (r.phase === 'count' || r.speed < 8) pose = 'stand';
          else if (!r.grounded) pose = 'jump';
          else if (r.duck) pose = 'duck';
          if (r.stun > 0 && r.grounded) pose = 'stand';
          if (r.made) pose = 'jump';
          drawRunner(x, r.me, RX, GROUND - 30 - lift, pose, r.runPh, 1, r.stun > 0);
          // backpack
          const by = GROUND - 30 - lift + (pose === 'duck' ? 8 : 0);
          rect(x, RX - 1, by + 12, 4, 8, INK);
          rect(x, RX, by + 13, 3, 6, '#3f6fd8');
        }
        if (r.boost > 0 && !reducedMotion) {
          for (let i = 0; i < 3; i++) {
            const ly = GROUND - 26 - lift + i * 8 + ((Math.floor(t * 20) + i) % 3);
            rect(x, RX - 14 - ((Math.floor(t * 40) + i * 5) % 8), ly, 8, 1, '#ffffff');
          }
        }
      }
      // sprinklers and coffee sit in front (spray arcs over you)
      for (const o of r.obs) {
        const sx = Math.round(o.x - cam);
        if (sx < -60 || sx > 200) continue;
        if (o.kind === 'sprinkler') drawSprinkler(x, sx, t);
        else if (o.kind === 'coffee' && !o.hit) drawCoffee(x, sx + 4, GROUND - o.alt, t);
      }
      fx.draw(x);
      x.restore();
      // morning air: drifting pollen in the sunlight, then a soft vignette
      if (!reducedMotion) motes(x, t, { x: 0, y: 20, w: 192, h: 70 }, 18, '#fff3c4', -14 - r.speed * 0.25, -2);
      vignette(x, 192, 108, 0.28, '40,20,30');

      // progress strip
      rect(x, 4, 3, 184, 9, 'rgba(28,20,36,0.72)');
      const p0 = 8;
      const p1 = 150;
      rect(x, p0, 7, p1 - p0, 1, '#8a7a9a');
      const prog = Math.max(0, Math.min(1, r.pos / COURSE));
      rect(x, p0, 7, Math.round((p1 - p0) * prog), 1, '#7cf08a');
      rect(x, p0 + Math.round((p1 - p0) * prog) - 1, 5, 3, 5, r.me.shirt);
      rect(x, p1 - 2, 4, 6, 6, '#f2ece0');
      rect(x, p1 - 2, 8, 6, 1, '#e8781e');
      const dep = `0:${String(Math.ceil(r.left)).padStart(2, '0')}`;
      text(x, dep, 186 - textWidth(dep), 5, r.left < 6 && Math.floor(t * 4) % 2 ? '#ff7a5a' : '#ffe27a');

      if (r.phase === 'count') {
        if (t > 0.35) outlined(x, "THAT'S YOUR BUS!", 70, 34, '#ffe27a');
        if (t > 0.9) outlined(x, 'HEY! WAIT!', 26, GROUND - 42, '#ffffff');
      }
      if (r.phase === 'run' && r.left > DEPART - 3) centered(x, 'JUMP LOW STUFF, DUCK HIGH STUFF', 96, 18, '#fff3c4');
      drawCount(x, t);
      if (r.made && r.endT > 0.7) drawBanner(x, 'MADE IT!', r.bumps === 0 ? 'NOT A SCRATCH!' : `${Math.ceil(r.bumps)} BUMP${Math.ceil(r.bumps) === 1 ? '' : 'S'}, ${r.left.toFixed(1)}S TO SPARE`, true, r.endT - 0.7);
      if (r.made === false && r.endT > 0.5) drawBanner(x, 'MISSED IT!', `${Math.ceil((COURSE - r.pos) / PX_PER_M)} M SHORT`, false, r.endT - 0.5);
    },
    true,
    input,
  );

  return (
    <div className="mini bus-dash">
      <MiniHud items={hud} />
      <PixelCanvas
        canvasRef={canvas}
        onPointer={(_px, _py, k) => {
          if (k === 'down') {
            r.jumpBuf = 0.13;
            r.ptrJump = true;
          } else if (k === 'up') r.ptrJump = false;
        }}
      />
      <TouchPad
        input={input}
        keys={[
          { key: 'down', label: 'DUCK ▼', wide: true },
          { key: 'up', label: 'JUMP ▲', wide: true },
        ]}
      />
      <p className="mini-note sr-key-note">↑ or SPACE jumps (hold for higher) · ↓ ducks · grab the coffee for speed</p>
      <p className="mini-note sr-touch-note">Tap the screen (or JUMP) to jump, hold for higher · hold DUCK to duck · grab the coffee</p>
    </div>
  );
}

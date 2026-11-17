// Moving Day: pack the rental truck before it's due back (heavy on the bottom, fragile on top),
// then drive it across town. Brake for the bumps: anything packed badly may break on the way.
import { useEffect, useMemo, useRef, useState } from 'react';
import { dot, INK, line, outlineRect, rect, type Ctx } from '../art/px.ts';
import { drawPerson, playerPerson } from '../art/people.ts';
import { bigText, burst, drawFloaters, drawParticles, once, outlined, rng, sound, soundInit, stepFloaters, stepParticles, type Floater, type Particle } from './cardsFx.ts';
import { clamp01, ctxOf, MiniHud, PixelCanvas, useInput, useLoop, vignette, type Key, type MiniProps } from './kit.tsx';
import { CELL, CX, CY, DCELL, drawBump, drawCity, drawNewPlace, drawRoad, drawSmallTruck, drawStreetside, drawTruck, driveSky, FLOOR, SMALL_BAY_W, itemSprite, packBackground, PH, PW, WEIGHT_COLOR, type BumpKind } from './movingArt.ts';
import { anyFit, assess, COLS, dims, fits, jolt, landRow, movingScore, pickItems, preview, ROWS, type ItemDef, type Placed } from './movingLogic.ts';
import './moving.css';

const CLOCK = 64; // seconds of rental clock for packing
const COUNTDOWN = 2.6;
const LOADED_BEAT = 1.7;
const ARRIVE_BEAT = 3.2;
const ROAD = 640; // drive length in world px
const CRUISE = 74;
const CRAWL = 22;
const HARD = 42; // faster than this over a bump = hard jolt
const TRUCK_X = 34; // small truck's left edge on screen during the drive
const CURB_Y = 126; // curb items sit on this line
const CURB_X0 = 34;
const WHEEL_FRONT = SMALL_BAY_W + 15; // front wheel, relative to the small truck's left edge

type Phase = 'count' | 'pack' | 'loaded' | 'drive' | 'arrive' | 'done';
interface Bump {
  at: number;
  kind: BumpKind;
  hit: boolean;
  rear: boolean;
}

const WEIGHT_LABEL = { heavy: 'HEAVY', medium: 'MEDIUM', light: 'LIGHT', fragile: 'FRAGILE' } as const;

export function Moving({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const person = useMemo(() => playerPerson(s.look), [s.look]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // The host passes a fresh onDone each render; this guard makes sure it fires exactly once per run.
  const finish = useMemo(() => once((r: Parameters<MiniProps['onDone']>[0]) => doneRef.current(r)), []);
  const all = useMemo(() => pickItems(rng((Date.now() ^ (s.seed * 131)) >>> 0)), [s]);
  const totalArea = useMemo(() => all.reduce((a, d) => a + d.w * d.h, 0), [all]);

  const g = useRef({
    phase: 'count' as Phase,
    t: 0,
    time: 0,
    curb: [...all],
    sel: 0,
    rot: false,
    col: 0,
    placed: [] as Placed[],
    falling: null as null | { p: Placed; y: number; vy: number },
    clock: CLOCK,
    clockAtEnd: 0,
    cycle: 0,
    drag: null as null | { x: number; y: number; moved: boolean; fromCurb: boolean },
    nofit: 0,
    heave: 0,
    ps: [] as Particle[],
    fl: [] as Floater[],
    shake: 0,
    banner: '',
    lastTick: 99,
    // drive
    dist: 0,
    speed: 0,
    bumps: [] as Bump[],
    hardJolts: 0,
    brokenIds: [] as string[],
    bounce: 0,
    bounceV: 0,
    hop: new Map<Placed, number>(),
    stopped: false,
  });

  const [ui, setUi] = useState({ phase: 'count' as Phase, clock: CLOCK, left: all.length, sel: all[0] as ItemDef | undefined, rot: false, speed: 0, bumpsLeft: 5, broken: 0, warn: '' });
  const syncUi = (): void => {
    const st = g.current;
    setUi({ phase: st.phase, clock: Math.ceil(st.clock), left: st.curb.length, sel: st.curb[st.sel], rot: st.rot, speed: Math.round(st.speed), bumpsLeft: st.bumps.filter((b) => !b.hit).length, broken: st.brokenIds.length, warn: st.banner });
  };

  useEffect(() => soundInit(), []);

  // Item picking needs one more key than the shared kit has: Q / E cycle the curb (Tab stays free for focus).
  useEffect(() => {
    const kd = (e: KeyboardEvent): void => {
      if (e.code === 'KeyQ' || e.code === 'KeyE') {
        e.preventDefault();
        g.current.cycle = e.code === 'KeyQ' ? -1 : 1;
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  const cur = (): ItemDef | undefined => g.current.curb[g.current.sel];
  const curDims = (): [number, number] => {
    const d = cur();
    return d ? dims(d, g.current.rot) : [1, 1];
  };
  const clampCol = (): void => {
    const [w] = curDims();
    g.current.col = Math.max(0, Math.min(COLS - w, g.current.col));
  };

  function select(i: number): void {
    const st = g.current;
    if (!st.curb.length) return;
    st.sel = ((i % st.curb.length) + st.curb.length) % st.curb.length;
    st.rot = false;
    clampCol();
    sound.pick();
    syncUi();
  }

  function tryDrop(): void {
    const st = g.current;
    const d = cur();
    if (!d || st.falling || st.phase !== 'pack') return;
    const [w, h] = curDims();
    if (!fits(st.placed, st.col, w, h)) {
      st.nofit = 0.6;
      sound.wrong();
      st.fl.push({ x: CX + (st.col + w / 2) * CELL, y: CY + 4, s: "WON'T FIT", c: '#ff7a6a', life: 0.9 });
      return;
    }
    const row = landRow(st.placed, st.col, w);
    const p: Placed = { def: d, col: st.col, row, w, h };
    st.falling = { p, y: CY - h * CELL - 6, vy: 40 };
    st.curb.splice(st.sel, 1);
    if (st.sel >= st.curb.length) st.sel = 0;
    st.rot = false;
    st.heave = 0.3;
    sound.rotate();
    clampCol();
    syncUi();
  }

  function land(): void {
    const st = g.current;
    const f = st.falling!;
    const before = assess(st.placed);
    st.placed.push(f.p);
    st.falling = null;
    const after = assess(st.placed);
    const px = CX + (f.p.col + f.p.w / 2) * CELL;
    const py = FLOOR - f.p.row * CELL;
    sound.thud();
    if (!reducedMotion) st.shake = f.p.def.weight === 'heavy' ? 0.2 : 0.1;
    burst(st.ps, px, py, reducedMotion ? 4 : 12, ['#d8d0c0', '#b8b0a0', '#ffffff'], 26, 40, 0.45);
    const newCrush = after.crushed.filter((q) => !before.crushed.includes(q));
    const newWobble = after.wobbly.filter((q) => !before.wobbly.includes(q));
    if (newCrush.length) {
      sound.wrong();
      for (const q of newCrush) st.fl.push({ x: CX + (q.col + q.w / 2) * CELL, y: FLOOR - (q.row + q.h) * CELL + 2, s: 'CRUSH RISK!', c: '#ff7a6a', life: 1.3 });
    } else if (newWobble.length) {
      sound.wrong();
      st.fl.push({ x: px, y: FLOOR - (f.p.row + f.p.h) * CELL - 2, s: 'WOBBLY!', c: '#ffb04a', life: 1.2 });
    } else if (f.p.def.weight === 'fragile' || (f.p.def.weight === 'heavy' && f.p.row === 0)) {
      sound.combo(3);
      st.fl.push({ x: px, y: FLOOR - (f.p.row + f.p.h) * CELL - 2, s: 'NICE!', c: '#7ff0c0', life: 0.9 });
    }
    if (!st.curb.length) endPacking('ALL PACKED!');
    else if (!st.curb.some((d) => anyFit(st.placed, d))) endPacking('OUT OF ROOM!');
    syncUi();
  }

  function endPacking(msg: string): void {
    const st = g.current;
    st.phase = 'loaded';
    st.t = 0;
    st.banner = msg;
    st.fl.length = 0; // clear pop-up labels so they don't pile on the banner
    st.clockAtEnd = Math.max(0, st.clock);
    st.drag = null;
    if (msg === 'ALL PACKED!') sound.fanfare();
    else sound.sad();
    syncUi();
  }

  function startDrive(): void {
    const st = g.current;
    st.phase = 'drive';
    st.t = 0;
    st.dist = 0;
    st.speed = 30;
    const kinds: BumpKind[] = ['bump', 'pothole', 'tracks', 'bump', 'pothole'];
    const r = rng(all.length * 977 + Math.floor(Math.random() * 1e6));
    // gaps shrink as you go: the last bumps come quicker
    const at = [150, 270, 370, 450, 515];
    st.bumps = at.map((a, i) => ({ at: a + Math.floor(r() * 16), kind: kinds[(i + Math.floor(r() * 3)) % kinds.length], hit: false, rear: false }));
    sound.honk();
    syncUi();
  }

  useLoop((dt) => {
    const st = g.current;
    st.t += dt;
    st.time += dt;
    st.shake = Math.max(0, st.shake - dt);
    st.nofit = Math.max(0, st.nofit - dt);
    st.heave = Math.max(0, st.heave - dt);

    if (st.phase === 'count') {
      const n = Math.ceil(COUNTDOWN - 0.6 - st.t);
      if (n !== st.lastTick && n >= 1 && n <= 3) (st.lastTick = n), sound.tick();
      if (st.t >= COUNTDOWN - 0.6 && st.lastTick !== 0) (st.lastTick = 0), sound.go();
      if (st.t >= COUNTDOWN) {
        st.phase = 'pack';
        st.t = 0;
        st.lastTick = 99;
        syncUi();
      }
    } else if (st.phase === 'pack') {
      const prevSec = Math.ceil(st.clock);
      st.clock -= dt;
      if (Math.ceil(st.clock) !== prevSec) {
        if (st.clock <= 10 && st.clock > 0) sound.tick();
        syncUi();
      }
      if (st.clock <= 0 && !st.falling) endPacking("TIME'S UP!");
      if (!st.falling) {
        const press = (k: Key): boolean => input.pressed.has(k);
        if (st.cycle) select(st.sel + st.cycle);
        if (press('left')) (st.col -= 1), clampCol(), sound.move();
        if (press('right')) (st.col += 1), clampCol(), sound.move();
        const d0 = cur();
        if (press('up') && d0 && d0.w !== d0.h) {
          st.rot = !st.rot;
          clampCol();
          sound.rotate();
          syncUi();
        }
        if (press('down') || press('action')) tryDrop();
      }
      st.cycle = 0;
      if (st.falling) {
        const f = st.falling;
        f.vy += 900 * dt;
        f.y += f.vy * dt;
        const target = FLOOR - (f.p.row + f.p.h) * CELL;
        if (f.y >= target) land();
      }
    } else if (st.phase === 'loaded') {
      if (st.t >= LOADED_BEAT) startDrive();
    } else if (st.phase === 'drive' || st.phase === 'arrive') {
      const braking = st.phase === 'drive' && (input.down.has('down') || input.down.has('action') || input.down.has('left') || (st.drag !== null));
      const end = ROAD;
      let target = braking ? CRAWL : CRUISE;
      if (st.dist > end - 90) target = Math.min(target, Math.max(0, (end - st.dist) * 0.9));
      const acc = st.speed > target ? (braking ? 150 : 90) : 55;
      st.speed += Math.sign(target - st.speed) * Math.min(Math.abs(target - st.speed), acc * dt);
      st.dist = Math.min(end, st.dist + st.speed * dt);
      // bumps: front wheel at world dist+FRONT, rear at dist+REAR
      const FRONT = WHEEL_FRONT;
      const REAR = 10;
      for (const b of st.bumps) {
        if (!b.hit && st.dist + FRONT >= b.at) {
          b.hit = true;
          const hard = st.speed > HARD;
          if (hard) st.hardJolts++;
          st.bounceV = hard ? -70 : -22;
          if (!reducedMotion && hard) st.shake = 0.25;
          const broke = jolt(st.placed, hard);
          for (const p of st.placed) st.hop.set(p, hard ? 3 + Math.random() * 2 : 1);
          sound.thud();
          st.fl.push({ x: TRUCK_X + WHEEL_FRONT, y: 70, s: hard ? 'TOO FAST!' : 'SMOOTH', c: hard ? '#ff7a6a' : '#7ff0c0', life: 1 });
          if (!hard) sound.combo(2);
          for (const p of broke) {
            st.brokenIds.push(p.def.id);
            const bx = TRUCK_X + 3 + (p.col + p.w / 2) * DCELL;
            const by = 64 + 3 + (ROWS - p.row - p.h / 2) * DCELL;
            sound.crash();
            burst(st.ps, bx, by, reducedMotion ? 6 : 22, p.def.weight === 'fragile' ? ['#bfe4f4', '#ffffff', '#e0503c', '#f2d48a'] : ['#8a5a34', '#c8955a', '#ffffff'], 50, 90, 0.8);
            st.fl.push({ x: 128, y: 8 + ((st.brokenIds.length - 1) % 5) * 8, s: `CRASH! ${p.def.name.toUpperCase()}`, c: '#ff7a6a', life: 1.8 });
          }
          syncUi();
        }
        if (!b.rear && st.dist + REAR >= b.at) {
          b.rear = true;
          st.bounceV = Math.min(st.bounceV, st.speed > HARD ? -40 : -12);
        }
      }
      // spring for the truck body
      st.bounceV += (-420 * st.bounce - 14 * st.bounceV) * dt;
      st.bounce += st.bounceV * dt;
      for (const [p, v] of st.hop) st.hop.set(p, Math.max(0, v - dt * 12));
      if (Math.floor(st.time * 4) !== Math.floor((st.time - dt) * 4)) syncUi();
      if (st.phase === 'drive' && st.dist >= end - 0.5 && st.speed < 1) {
        st.phase = 'arrive';
        st.t = 0;
        const sc = score();
        if (sc >= 0.6) sound.fanfare();
        else sound.sad();
        if (!reducedMotion && sc >= 0.6) for (let k = 0; k < 3; k++) burst(st.ps, 60 + k * 36, 30, 14, ['#fff36a', '#7ff0c0', '#ef7fae', '#9fd8ff'], 60, 50, 1.2);
        syncUi();
      }
      if (st.phase === 'arrive' && st.t >= ARRIVE_BEAT) {
        st.phase = 'done';
        const left = st.curb.length;
        const cost = st.placed.filter((p) => p.broken).reduce((a, p) => a + p.def.cost, 0) + (left > 0 ? 40 : 0);
        const stats: Record<string, number> = { broken: st.brokenIds.length, fit: Math.round(fitFrac() * 100) / 100, left, jolts: st.hardJolts, cost };
        for (const id of st.brokenIds) stats[`b_${id}`] = 1;
        finish({ score: score(), stats });
      }
    }

    stepParticles(st.ps, dt);
    stepFloaters(st.fl, dt);
    draw(st);
  }, true, input);

  const fitFrac = (): number => g.current.placed.reduce((a, p) => a + p.w * p.h, 0) / totalArea;
  const score = (): number => movingScore({ fit: fitFrac(), broken: g.current.brokenIds.length, hardJolts: g.current.hardJolts, timeLeft: g.current.clockAtEnd / CLOCK });

  // ---------- drawing ----------
  function draw(st: typeof g.current): void {
    const x = ctxOf(canvas.current);
    if (!x) return;
    x.save();
    if (st.shake > 0) x.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 3));
    if (st.phase === 'drive' || st.phase === 'arrive' || st.phase === 'done') drawDrive(x, st);
    else drawPack(x, st);
    drawParticles(x, st.ps);
    drawFloaters(x, st.fl);
    x.restore();
    vignette(x, PW, PH, 0.22);
  }

  function itemXY(p: Placed): [number, number] {
    return [CX + p.col * CELL, FLOOR - (p.row + p.h) * CELL];
  }

  function drawPack(x: Ctx, st: typeof g.current): void {
    x.drawImage(packBackground(), 0, 0);
    // late-morning sun: a few slow light rays fanning down from it
    if (!reducedMotion) {
      x.save();
      x.fillStyle = '#fff4c8';
      for (let k = 0; k < 4; k++) {
        const a = 2.2 + k * 0.2 + Math.sin(st.time * 0.5 + k) * 0.03;
        x.globalAlpha = 0.08 + 0.03 * Math.sin(st.time * 1.3 + k * 2);
        x.beginPath();
        x.moveTo(176, 14);
        x.lineTo(176 + Math.cos(a) * 260, 14 + Math.sin(a) * 260);
        x.lineTo(176 + Math.cos(a + 0.07) * 260, 14 + Math.sin(a + 0.07) * 260);
        x.closePath();
        x.fill();
      }
      x.restore();
    }
    drawTruck(x, 0, 0, 0);
    const risk = assess(st.placed);
    const blink = Math.floor(st.time * 5) % 2 === 0;
    for (const p of st.placed) {
      let [px, py] = itemXY(p);
      const wob = risk.wobbly.includes(p);
      if (wob && !reducedMotion) px += Math.round(Math.sin(st.time * 18));
      x.drawImage(itemSprite(p.def, CELL, p.w !== p.def.w), px, py);
      if (risk.crushed.includes(p) && blink) outlineRect(x, px - 1, py - 1, p.w * CELL + 2, p.h * CELL + 2, '#ff4a3a');
      if (wob && blink) outlineRect(x, px - 1, py - 1, p.w * CELL + 2, p.h * CELL + 2, '#ffb04a');
      if (risk.crushed.includes(p)) outlined(x, '!', px + p.w * CELL - 4, py + 1, '#ff4a3a');
    }
    // ghost + drop guide
    const d = cur();
    if (d && st.phase === 'pack' && !st.falling) {
      const [w, h] = curDims();
      const ok = fits(st.placed, st.col, w, h);
      const pv = preview(st.placed, d, st.col, w, h);
      const row = ok ? landRow(st.placed, st.col, w) : ROWS - h;
      const gx = CX + st.col * CELL;
      const gy = FLOOR - (row + h) * CELL;
      const col = !ok || st.nofit > 0 ? '#ff4a3a' : pv.crush.length ? '#ff8a3a' : pv.wobbly ? '#ffb04a' : '#ffffff';
      for (let yy = CY; yy < gy; yy += 3) {
        dot(x, gx, yy, 'rgba(255,255,255,0.35)');
        dot(x, gx + w * CELL - 1, yy, 'rgba(255,255,255,0.35)');
      }
      x.globalAlpha = 0.55 + 0.15 * Math.sin(st.time * 8);
      x.drawImage(itemSprite(d, CELL, st.rot), gx, gy);
      x.globalAlpha = 1;
      if (blink || ok) outlineRect(x, gx - 1, gy - 1, w * CELL + 2, h * CELL + 2, col);
      if (!ok) {
        line(x, gx, gy, gx + w * CELL - 1, gy + h * CELL - 1, '#ff4a3a');
        line(x, gx + w * CELL - 1, gy, gx, gy + h * CELL - 1, '#ff4a3a');
      }
      for (const q of pv.crush) {
        const [qx, qy] = itemXY(q);
        if (blink) outlineRect(x, qx - 1, qy - 1, q.w * CELL + 2, q.h * CELL + 2, '#ff4a3a');
      }
      // arrow over the drop columns
      const ay = CY - 13 + Math.round(Math.sin(st.time * 6));
      const ax = gx + Math.floor((w * CELL) / 2);
      for (let j = 0; j < 4; j++) rect(x, ax - 3 + j, ay + j, 7 - j * 2, 1, col === '#ffffff' ? '#fff36a' : col);
      rect(x, ax - 1, ay - 3, 3, 3, col === '#ffffff' ? '#fff36a' : col);
      // tag: name + weight
      const tag = `${d.name.toUpperCase()}`;
      const tw = tag.length * 4 + 3;
      const tx = Math.max(1, Math.min(PW - tw - 1, ax - tw / 2));
      rect(x, tx, 1, tw, 8, INK);
      rect(x, tx + 1, 2, tw - 2, 6, WEIGHT_COLOR[d.weight]);
      outlined(x, tag, tx + 2, 2, '#ffffff');
      if (pv.crush.length && blink) outlined(x, 'WILL CRUSH!', ax - 21, CY + 2, '#ff8a3a');
      else if (pv.wobbly && blink) outlined(x, 'TOP-HEAVY!', ax - 19, CY + 2, '#ffb04a');
    }
    if (st.falling) {
      const f = st.falling;
      x.drawImage(itemSprite(f.p.def, CELL, f.p.w !== f.p.def.w), CX + f.p.col * CELL, Math.round(f.y));
    }
    // curb
    drawCurb(x, st);
    // player at the old door, heaving when something gets loaded
    const fr = st.heave > 0 ? 1 : Math.floor(st.time * 2) % 2;
    drawPerson(x, person, 13, CURB_Y - 30 - (st.heave > 0.15 ? 2 : 0), fr, st.heave > 0, { face: 1 });
    // drag preview
    if (st.drag && st.drag.fromCurb && st.drag.y > FLOOR + 6 && d) {
      x.globalAlpha = 0.85;
      const [w, h] = curDims();
      x.drawImage(itemSprite(d, CELL, st.rot), Math.round(st.drag.x - (w * CELL) / 2), Math.round(st.drag.y - h * CELL));
      x.globalAlpha = 1;
    }
    // clock bar across the truck roof
    if (st.phase === 'pack' || st.phase === 'count') {
      const frac = clamp01(st.clock / CLOCK);
      rect(x, CX, CY - 4, 90, 2, '#3a3a44');
      rect(x, CX, CY - 4, Math.round(90 * frac), 2, frac > 0.35 ? '#3caa6a' : frac > 0.15 ? '#f2b632' : blink ? '#ff4a3a' : '#a83a2a');
    }
    if (st.phase === 'count') {
      x.fillStyle = 'rgba(18,14,31,0.45)';
      x.fillRect(0, 0, PW, PH);
      const left = COUNTDOWN - 0.6 - st.t;
      if (left > 0) bigText(x, String(Math.ceil(left)), PW / 2, 22, 5, '#fff36a');
      else bigText(x, 'GO!', PW / 2, 22, 5, '#7ff0c0');
      bigText(x, 'HEAVY ON THE BOTTOM', PW / 2, 66, 2, '#e8e8f0');
      bigText(x, 'FRAGILE ON TOP', PW / 2, 84, 2, '#ff9a8a');
    }
    if (st.phase === 'loaded') {
      bigText(x, st.banner, PW / 2, 6, 2, st.banner === 'ALL PACKED!' ? '#7ff0c0' : '#ff9a8a');
      if (st.curb.length) outlined(x, `${st.curb.length} LEFT BEHIND`, PW / 2 - (`${st.curb.length} LEFT BEHIND`.length * 4) / 2, 22, '#ffd0c8');
    }
  }

  function curbLayout(st: typeof g.current): { d: ItemDef; x: number; w: number; h: number; s: number }[] {
    const avail = PW - CURB_X0 - 2;
    const total = (s: number, gap: number): number => st.curb.reduce((a, d) => a + d.w * s + gap, -gap);
    const s = total(5, 3) <= avail ? 5 : 4;
    const gap = total(s, 3) <= avail ? 3 : 1;
    let cx = CURB_X0;
    return st.curb.map((d) => {
      const o = { d, x: cx, w: d.w * s, h: d.h * s, s };
      cx += d.w * s + gap;
      return o;
    });
  }

  function drawCurb(x: Ctx, st: typeof g.current): void {
    const lay = curbLayout(st);
    lay.forEach((o, i) => {
      const selected = i === st.sel && st.phase === 'pack';
      const lift = selected ? 2 + Math.round(Math.sin(st.time * 6)) : 0;
      x.fillStyle = 'rgba(40,30,40,0.25)';
      x.fillRect(o.x, CURB_Y - 1, o.w, 2);
      x.drawImage(itemSprite(o.d, o.s, false), o.x, CURB_Y - o.h - lift);
      if (selected) {
        const c = Math.floor(st.time * 4) % 2 ? '#fff36a' : '#f2b632';
        outlineRect(x, o.x - 2, CURB_Y - o.h - lift - 2, o.w + 4, o.h + 4, c);
      }
    });
  }

  function drawDrive(x: Ctx, st: typeof g.current): void {
    const scroll = st.dist;
    x.drawImage(driveSky(), 0, 0);
    drawCity(x, scroll * 0.2);
    drawStreetside(x, scroll * 0.6);
    drawRoad(x, scroll);
    const screenOf = (world: number): number => TRUCK_X + (world - scroll);
    drawNewPlace(x, screenOf(ROAD + 80));
    for (const b of st.bumps) {
      const bx = screenOf(b.at);
      if (bx > -20 && bx < PW + 20) drawBump(x, b.kind, bx);
    }
    // the truck, its cargo visible through the cutaway
    const oy = 64;
    const bay = drawSmallTruck(x, TRUCK_X, oy, st.time * (st.speed / 40), st.bounce);
    for (const p of st.placed) {
      const hop = st.hop.get(p) ?? 0;
      const px = bay.cx + p.col * DCELL;
      const py = bay.cy + (ROWS - p.row - p.h) * DCELL - Math.round(hop * Math.abs(Math.sin(st.time * 30)));
      x.drawImage(itemSprite(p.def, DCELL, p.w !== p.def.w, !!p.broken), px, py);
      if (p.broken) {
        const w = p.w * DCELL;
        const h = p.h * DCELL;
        line(x, px, py, px + w - 1, py + h - 1, '#ff4a3a');
        line(x, px + w - 1, py, px, py + h - 1, '#ff4a3a');
      }
    }
    // driver in the cab window
    const cabX = TRUCK_X + SMALL_BAY_W + 6;
    if (st.phase === 'drive') {
      x.save();
      x.beginPath();
      x.rect(cabX + 2, Math.round(oy + st.bounce) + 17, 9, 7);
      x.clip();
      drawPerson(x, person, cabX + 0, Math.round(oy + st.bounce) + 16, 0, false, { shadow: false, face: 1 });
      x.restore();
    }
    // speedometer
    const sp = Math.round(st.speed / 2.2);
    rect(x, 4, 113, 46, 13, INK);
    rect(x, 5, 114, 44, 11, '#2a2a3a');
    rect(x, 6, 121, Math.round(42 * clamp01(st.speed / CRUISE)), 3, st.speed > HARD ? '#ff6a4a' : '#7ff0c0');
    rect(x, 6 + Math.round(42 * (HARD / CRUISE)), 120, 1, 5, '#f6efdc');
    outlined(x, `${sp} MPH`, 7, 114, '#f6efdc');
    // upcoming bump warning
    const next = st.bumps.find((b) => !b.hit);
    if (next && st.phase === 'drive') {
      const dx = next.at - (st.dist + WHEEL_FRONT);
      if (dx < 80 && dx > -2) {
        const fast = st.speed > HARD;
        if (Math.floor(st.time * 6) % 2 === 0 || !fast) bigText(x, fast ? 'BRAKE!' : 'EASY...', PW / 2 + 30, 18, 2, fast ? '#ff7a6a' : '#7ff0c0');
      }
    }
    if (st.phase === 'drive' && st.t < 1.4) bigText(x, 'HOLD BRAKE FOR BUMPS', PW / 2, 44, 1, '#ffffff');
    if (st.phase === 'arrive' || st.phase === 'done') {
      // you hop out and admire the damage (or lack of it)
      drawPerson(x, person, TRUCK_X + SMALL_BAY_W + 31, 64 + 12, Math.floor(st.t * 3) % 2, true, { face: -1 });
      x.fillStyle = 'rgba(18,14,31,0.55)';
      x.fillRect(0, 0, PW, 46);
      bigText(x, 'MOVED IN!', PW / 2, 3, 3, '#fff36a');
      const packed = `PACKED ${st.placed.length}/${all.length}`;
      const brk = st.brokenIds.length ? `BROKE ${st.brokenIds.length}` : 'NOTHING BROKE';
      outlined(x, `${packed}  ${brk}`, PW / 2 - (`${packed}  ${brk}`.length * 4) / 2, 30, st.brokenIds.length ? '#ffd0c8' : '#c8f2d8');
      const cost = st.placed.filter((p) => p.broken).reduce((a, p) => a + p.def.cost, 0) + (st.curb.length ? 40 : 0);
      const l3 = cost ? `$${Math.min(220, cost)} TO FIX` : 'ZERO DOLLARS LOST';
      outlined(x, l3, PW / 2 - (l3.length * 4) / 2, 38, cost ? '#ffd0c8' : '#c8f2d8');
    }
  }

  // ---------- pointer: drag from the curb, tap/drag in the truck, hold to brake ----------
  const onPointer = (px: number, py: number, kind: 'down' | 'move' | 'up'): void => {
    const st = g.current;
    if (st.phase === 'drive') {
      if (kind === 'down') st.drag = { x: px, y: py, moved: false, fromCurb: false };
      if (kind === 'up') st.drag = null;
      return;
    }
    if (st.phase !== 'pack' || st.falling) return;
    const colAt = (x: number): number => {
      const [w] = curDims();
      return Math.max(0, Math.min(COLS - w, Math.round((x - CX) / CELL - w / 2)));
    };
    if (kind === 'down') {
      if (py >= FLOOR + 14) {
        // pick the nearest curb item
        const lay = curbLayout(st);
        let best = -1;
        let bd = 1e9;
        lay.forEach((o, i) => {
          const dd = Math.abs(o.x + o.w / 2 - px);
          if (dd < bd) (bd = dd), (best = i);
        });
        if (best >= 0 && best !== st.sel) select(best);
        st.drag = { x: px, y: py, moved: false, fromCurb: true };
      } else if (px > CX - 16 && px < CX + COLS * CELL + 10) {
        st.col = colAt(px);
        st.drag = { x: px, y: py, moved: false, fromCurb: false };
      }
    } else if (kind === 'move' && st.drag) {
      st.drag.x = px;
      st.drag.y = py;
      st.drag.moved = true;
      if (py < FLOOR + 10 || !st.drag.fromCurb) st.col = colAt(px);
    } else if (kind === 'up' && st.drag) {
      st.drag = null;
      if (py < FLOOR + 8 && px > CX - 16 && px < CX + COLS * CELL + 10) {
        st.col = colAt(px);
        tryDrop();
      }
    }
  };

  // ---------- on-screen buttons ----------
  const hold = (k: Key) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      input.press(k);
    },
    onPointerUp: () => input.release(k),
    onPointerCancel: () => input.release(k),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const driving = ui.phase === 'drive' || ui.phase === 'arrive' || ui.phase === 'done';
  const due = (() => {
    const mins = Math.round(((CLOCK - ui.clock) / CLOCK) * 120);
    const h = 10 + Math.floor(mins / 60);
    const m = mins % 60;
    return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}`;
  })();
  const sel = ui.sel;
  return (
    <div className="mini moving-game">
      {driving ? (
        <MiniHud
          items={[
            { label: 'Speed', value: `${Math.round(ui.speed / 2.2)} mph`, warn: ui.speed > HARD },
            { label: 'Bumps ahead', value: ui.bumpsLeft },
            { label: 'Broken', value: ui.broken, warn: ui.broken > 0 },
          ]}
        />
      ) : (
        <MiniHud
          items={[
            { label: 'Due 12:00', value: due, warn: ui.clock <= 15 },
            { label: 'Curb', value: ui.left },
          ]}
        >
          {sel && (
            <span className="mv-sel">
              <small>Holding</small>
              <b>
                {sel.name} <i className={`mv-w mv-${sel.weight}`}>{WEIGHT_LABEL[sel.weight]}</i>
              </b>
            </span>
          )}
        </MiniHud>
      )}
      <div className="mv-wrap">
        <PixelCanvas canvasRef={canvas} width={PW} height={PH} onPointer={onPointer} />
      </div>
      {driving ? (
        <div className="touchpad mv-pad">
          <button className="tp-btn wide mv-brake" aria-label="brake" {...hold('down')}>
            BRAKE (hold)
          </button>
        </div>
      ) : (
        <div className="touchpad mv-pad">
          <button className="tp-btn" aria-label="left" {...hold('left')}>
            ◀
          </button>
          <button className="tp-btn" aria-label="right" {...hold('right')}>
            ▶
          </button>
          <button className="tp-btn" aria-label="rotate" {...hold('up')}>
            ↻
          </button>
          <button className="tp-btn mv-drop" aria-label="drop" {...hold('action')}>
            DROP
          </button>
          <button
            className="tp-btn"
            aria-label="next item"
            onPointerDown={(e) => {
              e.preventDefault();
              g.current.cycle = 1;
            }}
          >
            NEXT
          </button>
        </div>
      )}
      <p className="mini-note mv-legend">
        {driving ? (
          <>Slow down for every bump: hold <span className="mv-keys">SPACE or ↓ or </span>BRAKE.</>
        ) : (
          <>
            <i className="mv-w mv-heavy">HEAVY</i> bottom · <i className="mv-w mv-fragile">FRAGILE</i> top · <span className="mv-keys">◀ ▶ move · ↑ rotate · SPACE drop · Q/E pick · </span>drag from the curb
          </>
        )}
      </p>
    </div>
  );
}

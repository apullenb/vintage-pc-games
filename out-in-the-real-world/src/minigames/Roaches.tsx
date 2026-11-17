// Roach Patrol: your kitchen at midnight, the light flickering. Move with WASD/arrows, spray toward
// the mouse (click/hold; the can runs dry and refills slowly), and stand on a crack and press SPACE
// to caulk it shut. Roaches scurry, scatter from the mist, hide under the fridge, the counter and the
// table, climb to the food on the counter, and multiply if you leave them alone. Waves ramp up.
// Seal every crack and clear the room before time runs out.
import { useEffect, useRef, useState } from 'react';
import { playerPerson } from '../art/people.ts';
import { INK, rect } from '../art/px.ts';
import { hdScale, useInput, useLoop, type MiniProps } from './kit.tsx';
import { audioInit, audioStop, centered, COUNT_TIME, countLabel, drawBanner, drawCount, Fx, Groove, hissLoop, LightMap, snd, VH, VW, type Lamp } from './tagFx.ts';
import { clamp } from './tagMath.ts';
import { drawClock, drawCrack, drawEyes, drawFood, drawGhost, drawMistCone, drawRoach, drawSealRing, drawSplat, drawTable, drawTrash, kitchenBg } from './tagKitchenArt.ts';
import { alive, foodLeft, KILL_DOSE, nearestCrack, newKitchen, nozzle, roachScore, sealedCount, SEAL_TIME, SPRAY_HALF, SPRAY_LEN, stepKitchen, TABLE, TRASH, TIME, type Kitchen } from './tagRoach.ts';
import { bobOf, drawChibi, drawSprayCan, facingOf, footShadow } from './tagSprite.ts';
import { GameCanvas, newPtr, newStick, ResultCard, Stick, TagHud, type BoardRow, type HudCell } from './tagUi.tsx';
import { drawHd } from './hdFx.ts';
import type { PostOpts } from './kit.tsx';

// HD: a moody midnight grade; the flashlight and the fridge glow bloom softly.
const TAG_POST: PostOpts = { bloom: 0.3, threshold: 0.84, saturation: 1.1, contrast: 1.04, warmth: -0.1, vignette: 0.45, smooth: 0.3, lift: [0.01, 0.012, 0.035] };
const FLAT = { light: 0, shadow: 0 };

const FOOD_NAMES = { bread: 'THE BREAD', fruit: 'THE FRUIT', pie: 'THE PIE' };
const COMBO = ['', 'SPLAT!', 'DOUBLE SPLAT!', 'TRIPLE SPLAT!', 'ROACH RAMPAGE!', 'EXTERMINATOR!'];

interface G {
  k: Kitchen;
  fx: Fx;
  light: LightMap;
  phase: 'count' | 'play' | 'end' | 'board';
  t: number;
  endT: number;
  label: string | null;
  aim: number;
  flick: number; // ceiling light level
  flickSeq: number;
  flickNext: number;
  brown: number;
  flickTog: number;
  ghosts: { x: number; y: number; life: number }[];
  sealBtn: boolean;
  skitT: number;
  babyT: number;
  nomT: number;
  lastSec: number;
  warned10: boolean;
  groove: Groove;
  emit: HTMLCanvasElement | null;
  result: { score: number } | null;
  firstSplat: boolean;
}

export function Roaches({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const ptr = useRef(newPtr()).current;
  const move = useRef(newStick()).current;
  const aimSt = useRef(newStick()).current;
  const me = useRef({ ...playerPerson(s.look), pants: '#6a7ac8', shoes: '#f0a8c0' }).current; // pajama pants, fuzzy slippers
  const gref = useRef<G | null>(null);
  if (!gref.current) {
    gref.current = {
      k: newKitchen(Math.random),
      fx: new Fx(reducedMotion),
      light: new LightMap(
        [0.32, 0.35, 0.6],
        [
          { x: 58, y: 12, r: 52, ry: 40, c: [0.85, 1.0, 1.45] },
          { x: 174, y: 36, r: 14, ry: 9, c: [0.8, 1.5, 0.95] },
          { x: 224, y: 46, r: 30, ry: 10, c: [0.5, 0.5, 0.7] },
        ],
        [{ x: 124, y: 76, r: 132, ry: 100, c: [1.5, 1.38, 1.08] }],
      ),
      phase: 'count',
      t: 0,
      endT: 0,
      label: null,
      aim: -Math.PI / 2,
      flick: 1,
      flickSeq: 0,
      flickNext: 4,
      brown: 0,
      flickTog: 0,
      ghosts: [],
      sealBtn: false,
      skitT: 0,
      babyT: 0,
      nomT: 0,
      lastSec: 99,
      warned10: false,
      groove: new Groove(104, [0, null, null, 0, null, null, 3, null, 0, null, null, 0, null, -2, null, null], 0.03),
      emit: null,
      result: null,
      firstSplat: false,
    };
  }
  const g = gref.current;
  const [hud, setHud] = useState<{ cells: HudCell[]; near: boolean }>({ cells: [], near: false });
  const hudKey = useRef('');
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    audioInit();
    return () => audioStop();
  }, []);

  const finish = (): void => {
    if (sent.current || !g.result) return;
    sent.current = true;
    const k = g.k;
    onDone({ score: g.result.score, stats: { sealed: sealedCount(k), cracks: k.cracks.length, splatted: k.killed, left: alive(k), food: Math.round(foodLeft(k) * 100), bestCombo: k.bestCombo, cleared: k.won ? 1 : 0 } });
  };

  const handleEvents = (): void => {
    const { k, fx } = g;
    for (const e of k.ev) {
      switch (e.k) {
        case 'splat': {
          snd.splat();
          fx.kick(e.combo >= 3 ? 2.5 : 1.4);
          fx.burst(e.x, e.y - 1, ['#b8f04a', '#e8ffb0', '#6ab82a'], 12, 55, { life: 0.4, drag: 4 });
          fx.burst(e.x, e.y - 3, ['#ffffff', '#ffe27a'], 5, 40, { glow: true, life: 0.5 });
          fx.ring(e.x, e.y, '#d8ff8a', 50, 0.3);
          const seed = Math.random() * 6;
          fx.decal({ x: e.x, y: e.y, life: 7, max: 7, draw: (cx, px, py, a) => drawSplat(cx, px, py, a, seed) });
          g.ghosts.push({ x: e.x, y: e.y - 4, life: 1.1 });
          if (e.combo >= 2) {
            fx.say(COMBO[Math.min(e.combo, 5)], e.combo >= 4 ? '#ff8a3c' : '#c8ff6a', `X${e.combo} COMBO`);
            snd.combo(e.combo);
          } else if (!g.firstSplat) {
            fx.pop(e.x, e.y - 12, 'SPLAT!', '#c8ff6a');
            g.firstSplat = true;
          } else fx.pop(e.x, e.y - 10, pickOf(['SPLAT!', 'POP!', 'GOTCHA!', 'BYE!']), '#c8ff6a');
          break;
        }
        case 'scatter':
          if (g.skitT <= 0) {
            snd.skitter();
            g.skitT = 0.08;
          }
          break;
        case 'baby':
          if (g.babyT > 0) break;
          g.babyT = 0.7;
          fx.pop(e.x, e.y - 8, '+1', '#ff9a7a');
          fx.burst(e.x, e.y, ['#ffd0a0'], 3, 20, { life: 0.3 });
          break;
        case 'spawn': {
          const c = k.cracks[e.c];
          fx.burst(c.x, c.y, ['#8a7a6a', '#c8b8a0'], 4, 25, { life: 0.3 });
          break;
        }
        case 'sealStart':
          snd.seal();
          break;
        case 'sealed': {
          const c = k.cracks[e.c];
          const n = k.cracks.length - sealedCount(k);
          fx.burst(c.x, c.y, ['#ffffff', '#ffe27a', '#f8f6f0'], 16, 60, { glow: true, life: 0.5 });
          fx.ring(c.x, c.y, '#ffe27a', 60, 0.4);
          fx.kick(1.5);
          if (n === 0) {
            fx.say('ALL CRACKS SEALED!', '#ffe27a', alive(k) ? 'NOW CLEAR THE ROOM' : '');
            snd.capture();
          } else {
            fx.say('CRACK SEALED!', '#ffe27a', `${n} TO GO`);
            snd.power();
          }
          break;
        }
        case 'eat':
          if (g.nomT <= 0) {
            snd.nibble();
            g.nomT = 0.4;
            fx.pop(k.foods[e.f].x, 14, 'NOM', '#ff7a6a');
          }
          break;
        case 'foodGone':
          fx.say(`${FOOD_NAMES[k.foods[e.f].kind]}!`, '#ff7a5a', 'THEY GOT IT');
          snd.sad();
          break;
        case 'wave':
          snd.alarm();
          fx.say(`WAVE ${e.n}!`, '#ff8a3c', e.n === 2 ? 'NEW CRACKS! AND THEY SMELL THE PIE' : 'LAST CRACK... AND THE FRIDGE!');
          if (e.n === 3) {
            fx.kick(3);
            g.brown = 0.9;
          }
          break;
        case 'crackOpen': {
          const c = k.cracks[e.c];
          fx.burst(c.x, c.y, ['#e8e0d0', '#8a7a6a', '#ffffff'], 14, 50, { life: 0.5, g: 60 });
          fx.pop(c.x, c.y - 10, 'CRACK!', '#ffb08a');
          fx.kick(2);
          snd.thud();
          break;
        }
        case 'empty':
          snd.empty();
          fx.pop(k.px, k.py - 30, 'EMPTY!', '#ff9a5a');
          break;
        case 'flush':
          fx.pop(k.px + Math.cos(k.aim) * 30, k.py - 20 + Math.sin(k.aim) * 20, 'FLUSHED OUT!', '#9ae8ff');
          snd.skitter();
          break;
        case 'noCrack':
          fx.pop(k.px, k.py - 30, 'NO CRACK HERE', '#d8ccf0');
          snd.nope();
          break;
        case 'clear':
          break;
      }
    }
    k.ev.length = 0;
  };

  useLoop(
    (dt) => {
      const { k, fx } = g;
      g.t += dt;
      g.skitT -= dt;
      g.babyT -= dt;
      g.nomT -= dt;
      fx.update(dt);
      for (const gh of g.ghosts) {
        gh.life -= dt;
        gh.y -= dt * 18;
        gh.x += Math.sin(gh.life * 9) * dt * 8;
      }
      g.ghosts = g.ghosts.filter((gh) => gh.life > 0);
      if (g.phase !== 'board') g.groove.update(g.phase === 'play' ? 1 : 0.3);

      // ----- flickering ceiling light -----
      if (g.phase === 'play' || g.phase === 'count') {
        g.flickNext -= dt;
        if (g.flickNext <= 0) {
          g.flickNext = 3 + Math.random() * 4;
          if (k.wave >= 2 && Math.random() < 0.35) g.brown = 1.1;
          else g.flickSeq = 0.55;
        }
      }
      if (g.brown > 0) {
        g.brown -= dt;
        g.flick = reducedMotion ? 0.5 : 0.08;
      } else if (g.flickSeq > 0) {
        g.flickSeq -= dt;
        g.flickTog -= dt;
        if (g.flickTog <= 0) {
          g.flickTog = 0.04 + Math.random() * 0.09;
          const on = g.flick < 0.6;
          g.flick = on ? 1 : reducedMotion ? 0.65 : 0.12;
          snd.flick();
        }
      } else g.flick = 0.97 + Math.sin(g.t * 50) * 0.03;

      // ----- input -----
      const kx = (input.down.has('right') ? 1 : 0) - (input.down.has('left') ? 1 : 0);
      const ky = (input.down.has('down') ? 1 : 0) - (input.down.has('up') ? 1 : 0);
      const mx = clamp(kx + move.x, -1, 1);
      const my = clamp(ky + move.y, -1, 1);
      if (aimSt.active && Math.hypot(aimSt.x, aimSt.y) > 0.2) g.aim = Math.atan2(aimSt.y, aimSt.x);
      else if (ptr.inside || ptr.down) g.aim = Math.atan2(ptr.y - (k.py - 9), ptr.x - k.px);
      else if (Math.hypot(mx, my) > 0.2) g.aim = Math.atan2(my, mx);
      const nearCrack = nearestCrack(k, k.px, k.py) >= 0;
      const sealPress = (input.pressed.has('action') && nearCrack) || g.sealBtn;
      if (g.sealBtn && !nearCrack && g.phase === 'play') k.ev.push({ k: 'noCrack' });
      g.sealBtn = false;
      const spray = ptr.down || (aimSt.active && Math.hypot(aimSt.x, aimSt.y) > 0.35) || (input.down.has('action') && !nearCrack && !k.seal);

      if (g.phase === 'count') {
        const lab = countLabel(g.t);
        if (lab !== g.label) {
          g.label = lab;
          if (lab === 'GO!') snd.go();
          else if (lab) snd.tick();
        }
        k.aim = g.aim;
        if (g.t >= COUNT_TIME) {
          g.phase = 'play';
          fx.say('SEAL THE CRACKS!', '#ffe27a', 'AND SPRAY EVERY LAST ONE');
        }
      } else if (g.phase === 'play') {
        stepKitchen(k, dt, { mx, my, aim: g.aim, spray, seal: sealPress && nearCrack });
        hissLoop(k.spraying);
        if (k.spraying) {
          const [nx, ny] = nozzle(k);
          fx.jet(nx, ny, k.aim, SPRAY_HALF * 0.8, ['#e8fff4', '#b8f0d8', '#ffffff'], reducedMotion ? 2 : 4, 120, { life: SPRAY_LEN / 120, drag: 1.5 });
        }
        handleEvents();
        const sec = Math.ceil(k.left);
        if (sec !== g.lastSec) {
          g.lastSec = sec;
          if (sec <= 5 && sec > 0) snd.tick();
        }
        if (!g.warned10 && k.left <= 10) {
          g.warned10 = true;
          snd.alarm();
          fx.say('10 SECONDS!', '#ff8a3c');
        }
        if (k.over) {
          hissLoop(false);
          g.phase = 'end';
          g.endT = 0;
          const score = roachScore(sealedCount(k), k.cracks.length, alive(k), foodLeft(k), k.won);
          g.result = { score };
          if (k.won) snd.fanfare();
          else if (score >= 0.6) snd.whistle();
          else snd.sad();
          g.flick = 1;
          g.brown = 0;
          g.flickSeq = 0;
        }
      } else if (g.phase === 'end') {
        g.endT += dt;
        stepKitchen(k, 0, null);
        k.vx *= 0.85;
        k.vy *= 0.85;
        if (g.endT > 2.4) {
          g.phase = 'board';
          showBoard();
        }
      } else {
        g.endT += dt;
        if (input.pressed.has('action') && g.endT > 3) finish();
        if (g.endT > 14) finish();
      }

      // ----- HUD -----
      const n = alive(k);
      const sealed = sealedCount(k);
      const food = foodLeft(k);
      const cells: HudCell[] = [
        { label: 'TIME', value: `0:${String(Math.ceil(k.left)).padStart(2, '0')}`, warn: g.phase === 'play' && k.left <= 10 },
        { label: k.dry ? 'SPRAY: EMPTY' : 'SPRAY', value: '', meter: k.tank, warn: k.dry || k.tank < 0.2, wide: true },
        { label: 'CRACKS', value: `${sealed}/${k.cracks.length}`, tone: sealed === k.cracks.length ? 'good' : undefined },
        { label: 'ROACHES', value: n, warn: n >= 20, tone: n === 0 ? 'good' : 'hot' },
        { label: 'FOOD', value: `${Math.round(food * 100)}%`, warn: food < 0.5, tone: 'good' },
      ];
      const key = cells.map((c) => `${c.value}${c.warn ? '!' : ''}${c.meter !== undefined ? Math.round(c.meter * 25) : ''}`).join('|') + nearCrack;
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud({ cells, near: nearCrack });
      }

      draw();
    },
    true,
    input,
  );

  const showBoard = (): void => {
    const k = g.k;
    const left = alive(k);
    const rows: BoardRow[] = [
      { key: 'c', name: 'Cracks sealed', color: '#f8f6f0', me: sealedCount(k) === k.cracks.length, cols: [`${sealedCount(k)}/${k.cracks.length}`] },
      { key: 's', name: 'Roaches splatted', color: '#9ad83a', me: false, cols: [k.killed] },
      { key: 'l', name: 'Roaches left', color: '#b0622e', me: left === 0, cols: [left] },
      { key: 'f', name: 'Food saved', color: '#e0a850', me: foodLeft(k) >= 0.95, cols: [`${Math.round(foodLeft(k) * 100)}%`] },
      { key: 'b', name: 'Best combo', color: '#ffe27a', me: false, cols: [`x${Math.max(1, k.bestCombo)}`] },
    ];
    setBoard(rows);
  };

  const draw = (): void => {
    const cv = canvas.current;
    if (!cv) return;
    const x = cv.getContext('2d');
    const S = hdScale(cv);
    if (!x) return;
    x.imageSmoothingEnabled = false;
    if (!g.emit) {
      g.emit = document.createElement('canvas');
      g.emit.width = VW * S;
      g.emit.height = VH * S;
    }
    const e = g.emit.getContext('2d');
    if (!e) return;
    const { k, fx, t } = { k: g.k, fx: g.fx, t: g.t };
    const [ox, oy] = fx.offset();
    x.setTransform(S, 0, 0, S, 0, 0);
    drawHd(x, kitchenBg(), 0, 0, false, FLAT);
    x.translate(ox, oy);
    for (const f of k.foods) drawFood(x, f, t);
    k.cracks.forEach((c, i) => drawCrack(x, c, t, k.seal && k.seal.c === i ? 1 - k.seal.t / SEAL_TIME : 0, k.wave));
    fx.drawDecals(x);

    // depth-sorted: roaches, table, trash can, you
    type D = { y: number; kind: 'r' | 'table' | 'trash' | 'me'; i?: number };
    const ds: D[] = [{ y: TABLE.y + TABLE.h, kind: 'table' }, { y: TRASH.y + TRASH.h, kind: 'trash' }, { y: k.py, kind: 'me' }];
    k.roaches.forEach((r, i) => {
      if (r.st !== 'hide') ds.push({ y: r.y, kind: 'r', i });
    });
    ds.sort((a, b) => a.y - b.y);
    const moving = Math.hypot(k.vx, k.vy) > 8;
    const pose = moving ? ('run' as const) : ('idle' as const);
    const frame = moving ? Math.floor(k.runPh) % 4 : Math.floor(t * 2) % 2;
    const { dir, flip } = facingOf(k.aim);
    const b = bobOf(pose, frame);
    for (const d of ds) {
      if (d.kind === 'table') drawTable(x);
      else if (d.kind === 'trash') drawTrash(x);
      else if (d.kind === 'r') {
        const r = k.roaches[d.i!];
        drawRoach(x, r, t);
        // a dosed roach shudders and goes pale
        if (r.dose > 0 && r.st !== 'down') {
          x.globalAlpha = Math.min(0.7, r.dose / KILL_DOSE);
          rect(x, Math.round(r.x) - 2, Math.round(r.y) - 1, 5, 3, '#e8fff0');
          x.globalAlpha = 1;
        }
      } else {
        footShadow(x, k.px, k.py);
        const shake = k.spraying ? (Math.floor(t * 30) % 2) - 0.5 : 0;
        const can = (): void => {
          if (!k.seal) drawSprayCan(x, k.px, k.py, k.aim, b, me.shirt, me.skin, shake);
        };
        if (dir === 'up') can();
        drawChibi(x, me, 'roachme', k.px, k.py + (k.seal ? 1 : 0), k.seal ? 'down' : dir, flip, k.seal ? 1 : frame, k.seal ? 'run' : pose, false);
        if (dir !== 'up') can();
        if (k.seal) {
          // caulk gun pointed at the crack
          const c = k.cracks[k.seal.c];
          const an = Math.atan2(c.y - (k.py - 8), c.x - k.px);
          const hx = k.px + Math.cos(an) * 4;
          const hy = k.py - 8 + Math.sin(an) * 4;
          rect(x, hx - 2, hy - 1, 5, 3, INK);
          rect(x, hx - 1, hy, 3, 1, '#e8e4dc');
          rect(x, hx + Math.cos(an) * 4, hy + Math.sin(an) * 4, 1, 1, '#ffffff');
        }
      }
    }
    if (k.spraying) {
      const [nx, ny] = nozzle(k);
      drawMistCone(x, nx, ny, k.aim, SPRAY_LEN, SPRAY_HALF, t);
    }
    fx.drawParts(x, false);

    // ----- light pass -----
    x.setTransform(S, 0, 0, S, 0, 0);
    const dyn: Lamp[] = [
      { x: k.px, y: k.py - 8, r: 22, c: [1.15, 1.12, 1.1] },
      // phone flashlight in your other hand: a real beam pointing where you aim, plus its hot spot
      { x: k.px + Math.cos(k.aim) * 3, y: k.py - 8 + Math.sin(k.aim) * 3, r: 78, c: [1.45, 1.42, 1.25], cone: { ang: k.aim, spread: 0.36 } },
      { x: k.px + Math.cos(k.aim) * 30, y: k.py - 6 + Math.sin(k.aim) * 24, r: 20, ry: 15, c: [1.2, 1.18, 1.08] },
    ];
    g.light.apply(x, dyn, g.flick);
    // the beam itself, visible in the dusty air (additive, fades with distance)
    {
      const bx = k.px + Math.cos(k.aim) * 4;
      const by = k.py - 9 + Math.sin(k.aim) * 4;
      x.save();
      x.translate(ox, oy);
      x.globalCompositeOperation = 'lighter';
      const bg = x.createRadialGradient(bx, by, 1, bx, by, 72);
      bg.addColorStop(0, 'rgba(255,250,225,0.22)');
      bg.addColorStop(0.5, 'rgba(255,248,220,0.07)');
      bg.addColorStop(1, 'rgba(255,248,220,0)');
      x.fillStyle = bg;
      x.beginPath();
      x.moveTo(bx, by);
      x.arc(bx, by, 72, k.aim - 0.3, k.aim + 0.3);
      x.closePath();
      x.fill();
      x.restore();
    }

    // ----- glow layer -----
    e.setTransform(S, 0, 0, S, 0, 0);
    e.clearRect(0, 0, VW, VH);
    e.translate(ox, oy);
    drawClock(e, t);
    const dark = g.flick < 0.5;
    for (const r of k.roaches) {
      if (r.st === 'hide' && r.zone !== 3) drawEyes(e, r, t);
      else if (dark && r.st !== 'down' && r.st !== 'hide') drawEyes(e, r, t);
    }
    const nc = nearestCrack(k, k.px, k.py);
    if (nc >= 0 && !k.seal && g.phase === 'play') drawSealRing(e, k.cracks[nc], t);
    for (const gh of g.ghosts) drawGhost(e, gh.x, gh.y, gh.life);
    e.setTransform(S, 0, 0, S, 0, 0);
    x.drawImage(g.emit, 0, 0, VW, VH);
    x.translate(ox, oy);
    fx.drawParts(x, true);
    fx.drawRings(x);
    // "SPACE" prompt over a crack you can seal
    if (nc >= 0 && !k.seal && g.phase === 'play') {
      const lab = ptr.touch || move.active ? 'SEAL!' : 'SPACE: SEAL';
      centered(x, lab, clamp(k.px, 24, VW - 24), clamp(k.py - 31, 4, VH - 12), Math.floor(t * 4) % 2 ? '#ffe27a' : '#ffffff');
    }
    if (k.seal) {
      const c = k.cracks[k.seal.c];
      const p = 1 - k.seal.t / SEAL_TIME;
      const bx = Math.round(clamp(c.x, 10, VW - 22)) - 6;
      const by = Math.round(clamp(c.y - 12, 6, VH - 10));
      rect(x, bx - 1, by - 1, 14, 4, INK);
      rect(x, bx, by, Math.round(12 * p), 2, '#ffe27a');
    }
    fx.drawPops(x);
    x.setTransform(S, 0, 0, S, 0, 0);

    // crosshair for the mouse
    if ((g.phase === 'play' || g.phase === 'count') && ptr.inside && !ptr.touch) {
      const px = Math.round(ptr.x);
      const py = Math.round(ptr.y);
      for (const [dx, dy] of [
        [-4, 0],
        [3, 0],
        [0, -4],
        [0, 3],
      ]) {
        rect(x, px + dx - (dx ? 0 : 0), py + dy, dx ? 2 : 1, dy ? 2 : 1, '#e8fff4');
      }
    }
    // spray tank gauge by your feet while it's low
    if (k.tank < 0.6 && g.phase === 'play') {
      const w = 12;
      const bx = Math.round(k.px - w / 2);
      const by = Math.round(k.py + 4);
      rect(x, bx - 1, by - 1, w + 2, 4, INK);
      rect(x, bx, by, Math.round(w * k.tank), 2, k.dry ? (Math.floor(t * 8) % 2 ? '#ff4a3a' : '#ffb04a') : '#9ad83a');
    }
    // low time: the edges pulse
    if (g.phase === 'play' && k.left <= 10 && !reducedMotion) {
      x.globalAlpha = 0.16 + 0.1 * Math.sin(t * 10);
      rect(x, 0, 0, VW, 2, '#ff3a3a');
      rect(x, 0, VH - 2, VW, 2, '#ff3a3a');
      rect(x, 0, 0, 2, VH, '#ff3a3a');
      rect(x, VW - 2, 0, 2, VH, '#ff3a3a');
      x.globalAlpha = 1;
    }
    fx.drawAnnounce(x, 58);
    fx.drawFlash(x);
    drawCount(x, g.t, '#ffe27a');
    if (g.phase === 'end' && g.result) {
      const n = alive(k);
      if (k.won) drawBanner(x, 'CLEAN SWEEP!', `${k.killed} SPLATTED  -  ${Math.round(k.left)}S TO SPARE`, true, g.endT);
      else drawBanner(x, 'TIME!', n ? `${n} ROACH${n === 1 ? '' : 'ES'} STILL OUT THERE` : `${k.cracks.length - sealedCount(k)} CRACK${k.cracks.length - sealedCount(k) === 1 ? '' : 'S'} STILL OPEN`, g.result.score >= 0.6, g.endT);
    }
  };

  const onDownAny = (): void => audioInit();
  return (
    <div className="mini tag-game kitchen">
      <TagHud cells={hud.cells} />
      <div className="tag-wrap">
        <GameCanvas canvasRef={canvas} ptr={ptr} onDown={onDownAny} hd={{ reducedMotion, post: TAG_POST }} />
        {board && (
          <ResultCard
            title={g.k.won ? 'CLEAN SWEEP!' : 'ROACH REPORT'}
            sub={g.k.won ? 'Every crack sealed, every roach gone.' : 'You hear skittering at 2 AM...'}
            head={['Result', '']}
            ranked={false}
            rows={board}
            onContinue={finish}
          />
        )}
      </div>
      <div className="tag-pad">
        <Stick st={move} label="MOVE" kind="move" onDown={onDownAny} />
        <div className="mid">
          <button
            className={`tag-btn ${hud.near ? 'ready' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              audioInit();
              g.sealBtn = true;
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            SEAL
          </button>
          <span className="tag-touch-note mini-note">Tap to spray there</span>
        </div>
        <Stick st={aimSt} label="AIM + SPRAY" kind="aim" onDown={onDownAny} />
      </div>
      <p className="tag-keys">
        <b>WASD</b>/<b>arrows</b> move · <b>mouse</b> aims · <b>click</b>/hold sprays (the can refills slowly) · on a crack, <b>SPACE</b> seals it · {TIME} seconds
      </p>
    </div>
  );
}

const pickOf = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

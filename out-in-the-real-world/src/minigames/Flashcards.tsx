// Flashcard Cram: a meaning appears, three term cards fall toward the DEADLINE.
// Slide between lanes and zap the matching term with your highlighter before it lands.
// First-try hits build a streak multiplier; later rounds fall faster and shuffle lanes mid-air.
import { useEffect, useMemo, useRef, useState } from 'react';
import { hash, INK, mix, type Ctx } from '../art/px.ts';
import { playerPerson } from '../art/people.ts';
import { ball, beam, blit, cyl, ell, glare, haze, Hd2Canvas, hdCtx, layer, lin, motes2, pool, rad, rgba, rr, sbox, shadow, tint, vfill, vignette2 } from './hd2Kit.tsx';
import { person as drawPerson } from './hd2Person.ts';
import { buildRounds, type Card, type Round } from './cardsDeck.ts';
import { bigText, burst, drawFloaters, drawParticles, once, outlined, rng, sound, soundInit, stepFloaters, stepParticles, type Floater, type Particle } from './cardsFx.ts';
import { clamp01, MiniHud, TouchPad, useInput, useLoop, type MiniProps } from './kit.tsx';
import './cards.css';

const W = 192;
const H = 120;
const CW = 56; // card size
const CH = 24;
const LANES = [32, 96, 160];
const DEADLINE = 84; // card bottoms that cross this line are missed
const START_Y = 1; // cards drop in fast from above, then fall at the round speed from here
const PLAYER_Y = 86; // drawPerson top; feet at 116
const COUNTDOWN = 2.8;
const REVEAL = 1.05;
const END_BEAT = 2.4;

type CardState = 'fall' | 'hit' | 'wrong' | 'poof' | 'missed';
interface Fall {
  card: Card;
  lane: number;
  x: number; // center x
  y: number; // top y
  fromX: number;
  swapT: number; // 0..1 progress of a lane swap (1 = settled)
  state: CardState;
  t: number; // time in current state
  shake: number;
}
interface Result {
  quality: number; // 1 first try, 0.2 after one wrong, 0 otherwise
  wrongs: number; // wrong zaps this round (button mashing costs a little)
  speed: number; // 0..1 how early (first-try hits only)
}

export function cardsScore(results: Result[], total: number): number {
  if (!total) return 0;
  const q = results.reduce((a, r) => a + r.quality, 0) / total;
  const sp = results.reduce((a, r) => a + r.speed, 0) / total;
  const mash = results.reduce((a, r) => a + r.wrongs, 0) * 0.008;
  return clamp01(0.85 * q + 0.15 * sp - mash);
}

const mult = (streak: number): number => Math.min(4, 1 + Math.floor(streak / 3));

export function Flashcards({ s, data, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const input = useInput();
  const rounds = useMemo<Round[]>(() => buildRounds(s, rng((Date.now() ^ (s.seed * 7919)) >>> 0), undefined, { exam: !!data?.exam }), [s, data?.exam]);
  const person = useMemo(() => playerPerson(s.look), [s.look]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // The host passes a fresh onDone each render; this guard makes sure it fires exactly once per run.
  const finish = useMemo(() => once((r: Parameters<MiniProps['onDone']>[0]) => doneRef.current(r)), []);

  const [clue, setClue] = useState<{ text: string; label?: string; status: 'ready' | 'ask' | 'right' | 'wrong'; fresh?: boolean }>({ text: 'Read the meaning up here, then zap the matching term card before it hits the deadline!', status: 'ready' });
  const [hud, setHud] = useState({ round: 0, streak: 0, points: 0, best: 0 });

  const g = useRef({
    phase: 'count' as 'count' | 'play' | 'reveal' | 'end',
    t: 0,
    time: 0,
    round: -1,
    cards: [] as Fall[],
    speed: 14,
    lane: 1,
    px: LANES[1],
    walk: 0,
    beam: { x: 0, top: 0, t: 0, ok: false },
    cooldown: 0,
    wrongs: 0,
    streak: 0,
    best: 0,
    points: 0,
    results: [] as Result[],
    swaps: [] as number[], // fall-progress points (0..1) where two cards trade lanes
    ps: [] as Particle[],
    fl: [] as Floater[],
    shake: 0,
    flash: 0,
    lastCount: 4,
    pointer: -1, // lane tapped on the canvas this frame
  });

  useEffect(() => soundInit(), []);

  const laneOf = (x: number): number => (x < 64 ? 0 : x < 128 ? 1 : 2);

  function startRound(i: number): void {
    const st = g.current;
    st.round = i;
    st.wrongs = 0;
    const r = rounds[i];
    const p = rounds.length > 1 ? i / (rounds.length - 1) : 0;
    st.speed = 10 + 11 * p;
    st.swaps = i >= 11 ? [0.22, 0.5] : i >= 6 ? [0.3 + Math.random() * 0.2] : [];
    st.cards = r.options.map((c, k) => ({ card: c, lane: k, x: LANES[k], fromX: LANES[k], swapT: 1, y: -CH - 2 - k * 5 - Math.random() * 6, state: 'fall', t: 0, shake: 0 }));
    st.phase = 'play';
    st.t = 0;
    labels.current.forEach((el, k) => {
      const sp = el?.firstElementChild as HTMLElement | null;
      const label = r.options[k]?.label ?? '';
      if (sp) sp.textContent = label;
      // long words shrink instead of breaking mid-word ("PREVENTI / VE")
      const longest = Math.max(0, ...label.split(/\s+/).map((w) => w.length));
      if (el) el.style.fontSize = longest > 11 ? '3.3cqw' : longest > 9 ? '3.9cqw' : longest > 7 ? '4.5cqw' : '';
    });
    setClue({ text: r.answer.clue, status: 'ask', fresh: r.answer.fresh });
    setHud({ round: i + 1, streak: st.streak, points: st.points, best: st.best });
  }

  function endRound(right: boolean): void {
    const st = g.current;
    st.phase = 'reveal';
    st.t = 0;
    const r = rounds[st.round];
    setClue({ text: r.answer.clue, label: r.answer.label, status: right ? 'right' : 'wrong', fresh: r.answer.fresh });
    setHud({ round: st.round + 1, streak: st.streak, points: st.points, best: st.best });
  }

  function fire(): void {
    const st = g.current;
    if (st.phase !== 'play' || st.cooldown > 0) return;
    st.cooldown = 0.22;
    const bx = LANES[st.lane];
    // nearest falling card under the beam
    let target: Fall | null = null;
    for (const c of st.cards) if (c.state === 'fall' && Math.abs(c.x - bx) < CW / 2 && c.y > -CH + 4 && (!target || c.y > target.y)) target = c;
    st.beam = { x: bx, top: target ? target.y + CH : -4, t: 0.18, ok: !!target && target.card.id === rounds[st.round].answer.id };
    if (!target) {
      sound.zap();
      return;
    }
    const answer = rounds[st.round].answer;
    if (target.card.id === answer.id) {
      const fallFrac = clamp01((target.y - START_Y) / (DEADLINE - CH - START_Y));
      const first = st.wrongs === 0;
      const speed = first ? clamp01((1 - fallFrac) / 0.6) : 0;
      st.results.push({ quality: first ? 1 : st.wrongs === 1 ? 0.2 : 0, speed, wrongs: st.wrongs });
      if (first) st.streak++;
      else st.streak = 0;
      st.best = Math.max(st.best, st.streak);
      const m = mult(st.streak);
      const pts = first ? 100 * m + Math.round(50 * speed) : 25;
      st.points += pts;
      target.state = 'hit';
      target.t = 0;
      for (const c of st.cards) if (c !== target && c.state === 'fall') (c.state = 'poof'), (c.t = 0);
      sound.combo(first ? st.streak : 1);
      st.flash = 0.12;
      const n = reducedMotion ? 8 : 26;
      burst(st.ps, target.x, target.y + CH / 2, n, ['#fff36a', '#ffe14a', '#ffffff', '#f2b632'], 55, 40, 0.7);
      st.fl.push({ x: target.x, y: target.y + 2, s: `+${pts}`, c: '#fff36a', life: 1 });
      if (first && st.streak >= 3 && st.streak % 3 === 0) st.fl.push({ x: W / 2, y: 40, s: `X${m} COMBO!`, c: '#7ff0c0', life: 1.2 });
      endRound(true);
    } else {
      st.wrongs++;
      st.streak = 0;
      target.state = 'wrong';
      target.t = 0;
      target.shake = 0.3;
      st.points = Math.max(0, st.points - 25);
      sound.wrong();
      if (!reducedMotion) st.shake = 0.18;
      st.fl.push({ x: target.x, y: target.y + 2, s: 'NOPE', c: '#ff7a6a', life: 0.8 });
      burst(st.ps, target.x, target.y + CH / 2, reducedMotion ? 4 : 10, ['#e0503c', '#8a2a2a'], 30, 80, 0.5);
      setHud({ round: st.round + 1, streak: 0, points: st.points, best: st.best });
    }
  }

  useLoop((dt) => {
    const st = g.current;
    st.t += dt;
    st.time += dt;
    st.cooldown = Math.max(0, st.cooldown - dt);
    st.shake = Math.max(0, st.shake - dt);
    st.flash = Math.max(0, st.flash - dt);
    st.beam.t = Math.max(0, st.beam.t - dt);

    // ---- input ----
    const canAct = st.phase === 'play' || st.phase === 'reveal' || st.phase === 'count';
    if (canAct) {
      if (input.pressed.has('left') && st.lane > 0) st.lane--, sound.move();
      if (input.pressed.has('right') && st.lane < 2) st.lane++, sound.move();
      if (st.pointer >= 0) {
        st.lane = st.pointer;
        st.pointer = -1;
        st.px = LANES[st.lane] + (st.px - LANES[st.lane]) * 0.3;
        fire();
      }
      if (input.pressed.has('action') || input.pressed.has('up')) fire();
    }
    st.pointer = -1;
    const tx = LANES[st.lane];
    const prevX = st.px;
    st.px += Math.sign(tx - st.px) * Math.min(Math.abs(tx - st.px), 520 * dt);
    if (Math.abs(st.px - prevX) > 0.01) st.walk += dt * 12;

    // ---- phases ----
    if (st.phase === 'count') {
      const n = Math.ceil(COUNTDOWN - 0.6 - st.t);
      if (n !== st.lastCount && n >= 1 && n <= 3) (st.lastCount = n), sound.tick();
      if (st.t >= COUNTDOWN - 0.6 && st.lastCount !== 0) (st.lastCount = 0), sound.go();
      if (st.t >= COUNTDOWN) startRound(0);
    } else if (st.phase === 'play') {
      const fallen = st.cards.find((c) => c.card.id === rounds[st.round].answer.id)!;
      const prog = clamp01((fallen.y - START_Y) / (DEADLINE - CH - START_Y));
      // lane shuffle: two still-falling cards trade places
      if (st.swaps.length && prog >= st.swaps[0]) {
        st.swaps.shift();
        const live = st.cards.filter((c) => c.state === 'fall');
        if (live.length >= 2) {
          const a = live[Math.floor(Math.random() * live.length)];
          const others = live.filter((c) => c !== a);
          const b = others[Math.floor(Math.random() * others.length)];
          [a.lane, b.lane] = [b.lane, a.lane];
          for (const c of [a, b]) (c.fromX = c.x), (c.swapT = 0);
          st.fl.push({ x: W / 2, y: 28, s: 'SHUFFLE!', c: '#9fd8ff', life: 0.8 });
          sound.rotate();
        }
      }
      for (const c of st.cards) {
        if (c.state === 'fall') {
          c.y = c.y < START_Y ? Math.min(START_Y, c.y + 150 * dt) : c.y + st.speed * dt;
          if (c.y + CH >= DEADLINE && c.card.id === rounds[st.round].answer.id) {
            c.y = DEADLINE - CH;
            c.state = 'missed';
            c.t = 0;
            st.streak = 0;
            st.results.push({ quality: 0, speed: 0, wrongs: st.wrongs });
            for (const o of st.cards) if (o !== c && o.state === 'fall') (o.state = 'poof'), (o.t = 0);
            sound.thud();
            sound.wrong();
            if (!reducedMotion) st.shake = 0.25;
            burst(st.ps, c.x, DEADLINE, reducedMotion ? 4 : 14, ['#c8b8a0', '#8a7a68'], 30, 90, 0.5);
            st.fl.push({ x: c.x, y: DEADLINE - CH - 6, s: 'MISSED', c: '#ff7a6a', life: 1 });
            endRound(false);
            break;
          }
        }
      }
    } else if (st.phase === 'reveal') {
      if (st.t >= REVEAL) {
        if (st.round + 1 < rounds.length) startRound(st.round + 1);
        else {
          st.phase = 'end';
          st.t = 0;
          const sc = cardsScore(st.results, rounds.length);
          if (sc >= 0.6) sound.fanfare();
          else sound.sad();
          const right = st.results.filter((r) => r.quality === 1).length;
          setClue({ text: `${right} of ${rounds.length} on the first try. Best streak: ${st.best}.`, label: 'Cram complete!', status: sc >= 0.6 ? 'right' : 'wrong' });
          if (!reducedMotion && sc >= 0.6) for (let k = 0; k < 4; k++) burst(st.ps, 30 + k * 44, 30, 16, ['#fff36a', '#7ff0c0', '#ef7fae', '#9fd8ff'], 60, 50, 1.2);
        }
      }
    } else if (st.phase === 'end') {
      if (st.t >= END_BEAT) {
        const right = st.results.filter((r) => r.quality === 1).length;
        finish({ score: cardsScore(st.results, rounds.length), stats: { correct: right, total: rounds.length, bestStreak: st.best } });
        st.t = -999; // stays in end, never fires again
      }
    }

    // ---- card animation ----
    for (const c of st.cards) {
      c.t += dt;
      c.shake = Math.max(0, c.shake - dt);
      if (c.swapT < 1) {
        c.swapT = Math.min(1, c.swapT + dt / 0.38);
        const e = c.swapT < 0.5 ? 2 * c.swapT * c.swapT : 1 - Math.pow(-2 * c.swapT + 2, 2) / 2;
        c.x = c.fromX + (LANES[c.lane] - c.fromX) * e;
      }
      if (c.state === 'wrong') c.y += (40 + c.t * 160) * dt;
    }
    stepParticles(st.ps, dt);
    stepFloaters(st.fl, dt);

    draw(st);
  }, true, input);

  function cardBox(c: Fall): { x: number; y: number; w: number; h: number; a: number } {
    let { x, y } = c;
    let w = CW;
    let h = CH;
    let a = 1;
    if (c.state === 'hit') {
      // pop, then fly into the player's binder
      const k = clamp01((c.t - 0.18) / 0.4);
      const sc = c.t < 0.18 ? 1 + Math.sin((c.t / 0.18) * Math.PI) * 0.12 : 1 - k * 0.8;
      x = x + (g.current.px - x) * k;
      y = y + (PLAYER_Y + 10 - y) * k * k;
      w = CW * sc;
      h = CH * sc;
      a = 1 - k * 0.6;
      if (k >= 1) a = 0;
    } else if (c.state === 'poof') {
      a = Math.max(0, 1 - c.t / 0.35);
    } else if (c.state === 'wrong') {
      a = Math.max(0, 1 - c.t / 0.7);
      if (c.shake > 0 && !reducedMotion) x += Math.sin(c.t * 70) * 2;
    } else if (c.state === 'missed') {
      a = 1;
    }
    return { x: x - w / 2, y: y + (CH - h) / 2, w, h, a };
  }

  function draw(st: typeof g.current): void {
    const x = hdCtx(canvas.current);
    if (!x) return;
    x.save();
    if (st.shake > 0) x.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3);
    blit(x, background(), 0, 0, W, H);

    // deadline
    const danger = st.phase === 'play' ? clamp01((Math.max(...st.cards.filter((c) => c.state === 'fall').map((c) => c.y), START_Y) - 20) / 40) : 0;
    const dl = mix('#7a4a6a', '#ff5a4a', danger * (0.6 + 0.4 * Math.sin(st.time * 14)));
    pool(x, W / 2, DEADLINE + 0.5, W * 0.6, 3 + danger * 3, dl, 0.25 + danger * 0.4);
    x.fillStyle = dl;
    for (let i = 0; i < W; i += 6) {
      rr(x, i, DEADLINE - 0.1, 4, 1.2, 0.6);
      x.fill();
    }
    outlined(x, 'DEADLINE', 48, DEADLINE + 3, mix('#b08aa8', '#ff8a7a', danger));

    // player + highlighter
    const fr = Math.floor(st.walk) % 2;
    const pX = st.px - 7;
    if (st.streak >= 3) pool(x, st.px, PLAYER_Y + 16, 16 + Math.sin(st.time * 8), 22, st.streak >= 6 ? '#7ff0c0' : '#fff36a', 0.45);
    drawPerson(x, person, pX, PLAYER_Y, fr, false, { face: st.lane === 0 ? -1 : st.lane === 2 ? 1 : 0 });
    // highlighter raised in the right hand
    const hx = pX + 12;
    const hy = PLAYER_Y + 9 + (st.beam.t > 0 ? -2 : 0);
    rr(x, hx + 0.6, hy - 2, 1.8, 2.4, 0.5);
    x.fillStyle = '#c8b81a';
    x.fill();
    cyl(x, hx, hy, 3, 8, '#f2e23a', { spec: 0.7 });
    cyl(x, hx, hy + 6, 3, 2, '#3a3a52', { spec: 0.4 });
    pool(x, hx + 1.5, hy - 2, 4, 4, '#fff36a', 0.35);

    // beam
    if (st.beam.t > 0) {
      const a = st.beam.t / 0.18;
      const top = Math.max(-2, st.beam.top);
      const bot = hy - 2;
      const col = st.beam.ok ? '#fff36a' : '#ffffff';
      x.save();
      x.globalCompositeOperation = 'lighter';
      x.fillStyle = lin(x, st.beam.x - 6, 0, st.beam.x + 6, 0, [rgba(col, 0), rgba(col, 0.55 * a), rgba(col, 0)]);
      x.fillRect(st.beam.x - 6, top, 12, bot - top);
      x.restore();
      x.fillStyle = rgba(col, 0.9 * a);
      x.fillRect(st.beam.x - 0.9, top, 1.8, bot - top);
      x.fillStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
      x.fillRect(st.beam.x - 0.3, top, 0.6, bot - top);
      pool(x, st.beam.x, top, 8, 6, col, 0.7 * a);
    }

    // cards
    const answerId = st.round >= 0 ? rounds[st.round].answer.id : '';
    st.cards.forEach((c, k) => {
      const b = cardBox(c);
      const el = labels.current[k];
      if (el) {
        el.style.left = `${((b.x + b.w / 2) / W) * 100}%`;
        el.style.top = `${((b.y + b.h / 2) / H) * 100}%`;
        el.style.transform = `translate(-50%, -50%) scale(${(b.w / CW).toFixed(3)})`;
        el.style.opacity = String(st.phase === 'count' || st.phase === 'end' ? 0 : b.a);
        el.dataset.state = c.state === 'fall' && st.phase === 'reveal' ? 'poof' : c.state;
      }
      if (b.a <= 0.02 || st.phase === 'count' || st.phase === 'end') return;
      drawCard(x, b.x, b.y, b.w, b.h, c, b.a, c.card.id === answerId && st.phase === 'reveal');
    });

    // first card only: if you hesitate, a bouncing arrow shows which card to zap
    if (st.round === 0 && st.phase === 'play' && st.t > 2.4) {
      const c = st.cards.find((q) => q.state === 'fall' && q.card.id === answerId);
      if (c) {
        const b = cardBox(c);
        const bob = reducedMotion ? 0 : Math.abs(Math.sin(st.time * 6)) * 3;
        const ax = b.x + b.w / 2;
        const ay = b.y + b.h + 3 + bob;
        pool(x, ax, ay + 2, 6, 5, '#fff36a', 0.4);
        x.beginPath();
        x.moveTo(ax, ay);
        x.lineTo(ax + 3.5, ay + 4);
        x.lineTo(ax - 3.5, ay + 4);
        x.closePath();
        x.lineJoin = 'round';
        x.lineWidth = 1;
        x.strokeStyle = INK;
        x.stroke();
        x.fillStyle = '#fff36a';
        x.fill();
        outlined(x, 'THIS ONE!', ax - 17, ay + 6, '#fff36a');
      }
    }

    drawParticles(x, st.ps);
    drawFloaters(x, st.fl);

    // dust in the lamplight + a soft vignette around the desk
    if (!reducedMotion) motes2(x, st.time, { x: 20, y: 6, w: 150, h: 70 }, 18, '#fff3c4', 2, -2);
    vignette2(x, W, H, 0.5);

    if (st.flash > 0) {
      x.fillStyle = `rgba(255,250,200,${(st.flash * 1.4).toFixed(3)})`;
      x.fillRect(0, 0, W, H);
    }

    // countdown
    if (st.phase === 'count') {
      const left = COUNTDOWN - 0.6 - st.t;
      if (left > 0) {
        const n = Math.ceil(left);
        const f = left - Math.floor(left);
        const sc = reducedMotion ? 4 : 4 + Math.round(f);
        bigText(x, String(n), W / 2, 34 - sc, sc, '#fff36a');
      } else bigText(x, 'GO!', W / 2, 30, 5, '#7ff0c0');
      outlined(x, 'ZAP THE TERM THAT MATCHES', W / 2 - 49, 66, '#f6efdc');
      outlined(x, 'THE MEANING ABOVE!', W / 2 - 35, 73, '#f6efdc');
    }
    if (st.phase === 'end') {
      const sc = cardsScore(st.results, rounds.length);
      const grade = sc >= 0.9 ? 'A' : sc >= 0.75 ? 'B' : sc >= 0.6 ? 'C' : sc >= 0.4 ? 'D' : 'F';
      x.fillStyle = 'rgba(18,14,31,0.72)';
      x.fillRect(0, 0, W, H);
      bigText(x, 'CRAM DONE!', W / 2, 14, 3, '#fff36a');
      bigText(x, grade, W / 2, 40, 5, grade <= 'B' ? '#7ff0c0' : grade === 'C' ? '#fff36a' : '#ff7a6a');
      const right = st.results.filter((r) => r.quality === 1).length;
      const l1 = `${right}/${rounds.length} FIRST TRY`;
      const l2 = `BEST STREAK ${st.best}  ${st.points} PTS`;
      outlined(x, l1, W / 2 - (l1.length * 4) / 2, 86, '#f6efdc');
      outlined(x, l2, W / 2 - (l2.length * 4) / 2, 94, '#c8c0d8');
    }
    x.restore();
  }

  function drawCard(x: Ctx, cx: number, cy: number, w: number, h: number, c: Fall, a: number, reveal: boolean): void {
    x.globalAlpha = a;
    const px = cx;
    const py = cy;
    // soft drop shadow (the card is floating above the desk)
    shadow(x, px + w / 2 + 2, py + h + 1.5, w * 0.6, 3, 0.45);
    let paper = '#fbf6e6';
    if (c.state === 'hit') paper = c.t < 0.1 ? '#ffffff' : '#fff36a';
    else if (c.state === 'wrong') paper = '#f2a49a';
    else if (c.state === 'missed') paper = '#f6d2c8';
    else if (reveal) paper = '#c8f2d8';
    if (reveal) pool(x, px + w / 2, py + h / 2, w * 0.7, h, '#7ff0c0', 0.35 * a);
    rr(x, px, py, w, h, 2);
    x.fillStyle = lin(x, px, py, px + w * 0.4, py + h, [tint(paper, 1.05), paper, tint(paper, 0.86)]);
    x.fill();
    if (w > 20) {
      x.save();
      rr(x, px, py, w, h, 2);
      x.clip();
      // index card rules
      x.fillStyle = c.state === 'hit' ? '#e0b030' : '#e0707a';
      x.fillRect(px + 1, py + 4, w - 2, 0.6);
      x.fillStyle = c.state === 'hit' ? '#f0d850' : '#c8d8ec';
      for (let ly = py + 9; ly < py + h - 2; ly += 5) x.fillRect(px + 1, ly, w - 2, 0.45);
      if (c.state === 'fall' && !reducedMotion) {
        // a glossy highlight sweeps across each card now and then
        const sw = ((g.current.time * 30 + cx * 0.7) % (w + 60)) - 10;
        x.fillStyle = lin(x, px + sw - 4, 0, px + sw + 4, 0, ['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']);
        x.beginPath();
        x.moveTo(px + sw - 3, py);
        x.lineTo(px + sw + 3, py);
        x.lineTo(px + sw + 3 - h * 0.6, py + h);
        x.lineTo(px + sw - 3 - h * 0.6, py + h);
        x.closePath();
        x.fill();
      }
      // paper sheen + curl shadow
      vfill(x, px, py, w, h, ['rgba(255,255,255,0.25)', 'rgba(255,255,255,0)', 'rgba(60,40,80,0.12)']);
      if (c.state === 'hit' && c.t < 0.2) {
        // highlighter swipe across
        const k = clamp01(c.t / 0.12);
        x.fillStyle = 'rgba(255,230,0,0.85)';
        rr(x, px, py + h / 2 - 4, w * k, 8, 2);
        x.fill();
      }
      x.restore();
    }
    // outline
    rr(x, px + 0.25, py + 0.25, w - 0.5, h - 0.5, 2);
    x.lineWidth = c.state === 'missed' ? 1 : 0.6;
    x.strokeStyle = c.state === 'missed' ? '#c0392b' : 'rgba(28,20,36,0.85)';
    x.stroke();
    if (c.state === 'wrong') {
      x.save();
      x.lineCap = 'round';
      x.lineWidth = 1.6;
      x.strokeStyle = '#c0392b';
      x.beginPath();
      x.moveTo(px + w / 2 - 5, py + h / 2 - 5);
      x.lineTo(px + w / 2 + 5, py + h / 2 + 5);
      x.moveTo(px + w / 2 + 5, py + h / 2 - 5);
      x.lineTo(px + w / 2 - 5, py + h / 2 + 5);
      x.stroke();
      x.restore();
    }
    x.globalAlpha = 1;
  }

  const onPointer = (px: number, _py: number, kind: 'down' | 'move' | 'up'): void => {
    if (kind === 'down') g.current.pointer = laneOf(px);
  };

  const fresh = clue.fresh && clue.status !== 'ready';
  return (
    <div className="mini cards-game">
      <MiniHud
        items={[
          { label: 'Card', value: `${Math.max(1, hud.round)}/${rounds.length}` },
          { label: 'Streak', value: hud.streak >= 3 ? `${hud.streak} ×${mult(hud.streak)}` : hud.streak },
          { label: 'Points', value: hud.points },
        ]}
      />
      <div className={`cards-clue ${clue.status}`} aria-live="polite">
        <span className="cards-clue-tag">{clue.status === 'right' || clue.status === 'wrong' ? (clue.label ?? '') : fresh ? 'New term! Means…' : 'Means…'}</span>
        <span className="cards-clue-text">{clue.text}</span>
      </div>
      <div className="cards-wrap">
        <Hd2Canvas canvasRef={canvas} width={W} height={H} onPointer={onPointer} />
        <div className="cards-labels" aria-hidden="true">
          {[0, 1, 2].map((k) => (
            <div key={k} className="cards-label" ref={(el) => void (labels.current[k] = el)} style={{ width: `${(CW / W) * 100}%`, height: `${(CH / H) * 100}%`, opacity: 0 }}>
              <span />
            </div>
          ))}
        </div>
      </div>
      <TouchPad
        input={input}
        keys={[
          { key: 'left', label: '◀' },
          { key: 'action', label: 'ZAP!', wide: true },
          { key: 'right', label: '▶' },
        ]}
      />
      <p className="mini-note">◀ ▶ move · SPACE zap · or tap a card</p>
    </div>
  );
}

// Late-night study nook: window, shelves, string lights, a warm desk lamp. Drawn once at HD.
function background(): HTMLCanvasElement {
  return layer('hd-cards-bg', W, H, (x) => {
    // wall with soft striped wallpaper, warmer where the lamp reaches
    vfill(x, 0, 0, W, 100, ['#120d26', '#1c1638', '#2a2050']);
    for (let i = 4; i < W; i += 8) {
      x.fillStyle = 'rgba(70,60,120,0.18)';
      x.fillRect(i, 0, 2, 100);
    }
    // window: city skyline at night, curtains, rod
    shadow(x, 96, 48, 34, 3, 0.4);
    sbox(x, 70, 8, 52, 38, '#4a3428', { r: 1, gloss: 0.3 });
    vfill(x, 72, 10, 48, 34, ['#070a20', '#16204a', '#2e2c62', '#5a3e70']);
    for (let i = 0; i < 18; i++) {
      const sx = 73 + ((i * 29) % 46);
      const sy = 11 + ((i * 13) % 18);
      pool(x, sx, sy, 1.4, 1.4, i % 4 ? '#9fb0e8' : '#fffbe8', 0.9);
    }
    pool(x, 110, 17, 9, 9, '#c8d0ff', 0.25);
    ball(x, 110, 17, 3, '#f6efdc', 3, 0.2);
    ell(x, 112, 16, 2.2, 2.2);
    x.fillStyle = '#16204a';
    x.fill();
    const sky = [[72, 30, 7], [79, 26, 6], [85, 33, 8], [93, 24, 5], [98, 29, 9], [107, 27, 6], [113, 32, 7]];
    for (const [bx, by, bw] of sky) {
      vfill(x, bx, by, bw, 44 - by, ['#1a1530', '#0a0818']);
      for (let wy = by + 2; wy < 42; wy += 3)
        for (let wx = bx + 1; wx < bx + bw - 1; wx += 2)
          if (hash(wx * 31 + wy * 7) < 0.35) {
            x.fillStyle = '#f2c84a';
            x.fillRect(wx, wy, 0.9, 1);
          }
    }
    haze(x, 72, 30, 48, 44, '#6a4a8a', 0, 0.35);
    glare(x, 72, 10, 48, 34, 0.14);
    x.fillStyle = '#3a2a22';
    x.fillRect(95.3, 10, 1.4, 34);
    x.fillRect(72, 26.3, 48, 1);
    sbox(x, 67, 45, 58, 3.4, '#7a563c', { r: 1, gloss: 0.5 });
    cyl(x, 62, 5.6, 68, 1.6, '#a8a8b8', { spec: 0.6 });
    // velvet curtains with soft folds
    for (const [cx0, dir] of [[62, 1], [120, -1]] as const) {
      x.beginPath();
      x.moveTo(cx0, 7);
      x.lineTo(cx0 + 10 * dir, 7);
      x.quadraticCurveTo(cx0 + 7 * dir, 30, cx0 + 9 * dir, 56);
      x.lineTo(cx0 - 0.5 * dir, 56);
      x.closePath();
      x.fillStyle = lin(x, cx0, 0, cx0 + 10 * dir, 0, ['#1e4a4e', '#3a8a88', '#2a6466', '#4a9a96', '#1e4a4e']);
      x.fill();
    }
    // string lights
    const bulbs = ['#ff8a8a', '#ffd27a', '#8affc8', '#8ac8ff', '#e0a0ff'];
    x.strokeStyle = '#3a3450';
    x.lineWidth = 0.5;
    x.beginPath();
    for (let bx = 22; bx <= 172; bx += 1) {
      const seg = (bx - 22) % 50;
      const by = 2 + Math.sin((seg / 50) * Math.PI) * 5;
      if (bx === 22) x.moveTo(bx, by);
      else x.lineTo(bx, by);
    }
    x.stroke();
    for (let bx = 26; bx < 172; bx += 10) {
      const seg = (bx - 22) % 50;
      const by = 2 + Math.sin((seg / 50) * Math.PI) * 5;
      const c = bulbs[(bx / 10) % bulbs.length | 0];
      pool(x, bx, by + 2, 7, 6, c, 0.4);
      ball(x, bx, by + 2, 1, c, 1.4, 0.8);
    }
    // poster: sunset mountains
    shadow(x, 41, 83, 15, 2, 0.4);
    sbox(x, 27, 52, 26, 30, '#e8dcc0', { r: 0.6, gloss: 0.15 });
    vfill(x, 29, 54, 22, 26, ['#ffc870', '#f08060', '#8a4a7a']);
    ball(x, 40, 62, 3, '#fff3a0', 3, 0);
    pool(x, 40, 62, 8, 8, '#fff0a0', 0.3);
    x.fillStyle = '#4a3a6a';
    x.beginPath();
    x.moveTo(29, 80);
    x.lineTo(36, 66);
    x.lineTo(42, 74);
    x.lineTo(46, 69);
    x.lineTo(51, 76);
    x.lineTo(51, 80);
    x.closePath();
    x.fill();
    glare(x, 29, 54, 22, 26, 0.2);
    // corkboard with notes and a photo
    shadow(x, 152, 75, 16, 2, 0.4);
    sbox(x, 138, 52, 28, 22, '#6a4a30', { r: 1, gloss: 0.2 });
    vfill(x, 139.5, 53.5, 25, 19, ['#b88a56', '#986e3e']);
    for (const [nx, ny, c, r] of [[141, 55, '#f2e46a', -0.08], [151, 54, '#8ad0f0', 0.06], [156, 63, '#f2a0c0', 0.1], [143, 64, '#a0e8a0', -0.05]] as const) {
      x.save();
      x.translate(nx + 3.5, ny + 3.5);
      x.rotate(r);
      shadow(x, 0.6, 3.8, 3.5, 0.8, 0.35);
      sbox(x, -3.5, -3.5, 7, 7, c, { r: 0.4, gloss: 0.3, outline: null });
      x.fillStyle = rgba(tint(c, 0.6), 0.8);
      x.fillRect(-2.5, -1.5, 5, 0.5);
      x.fillRect(-2.5, 0.5, 4, 0.5);
      x.restore();
      ball(x, nx + 3.5, ny + 0.2, 0.8, '#d0402b', 0.8, 0.7);
    }
    // bookshelves on both edges
    for (const sx of [0, W - 18]) {
      vfill(x, sx, 10, 18, 92, ['#2a1a14', '#3a2820']);
      for (let sy = 12; sy < 100; sy += 18) {
        vfill(x, sx, sy, 18, 14, ['#160c08', '#2e1e16']);
        let bx = sx + 1;
        for (let b = 0; bx < sx + 16; b++) {
          const k = hash(sx * 13 + sy * 7 + b);
          const c = ['#b04a4a', '#4a7ab8', '#4a9a6a', '#d0a84a', '#8a5ab8', '#d8d0c0'][Math.floor(k * 6)];
          const bw = k > 0.7 ? 3 : 2;
          const bh = 8 + Math.floor(k * 5);
          if (bx + bw > sx + 17) break;
          cyl(x, bx, sy + 14 - bh, bw, bh, tint(c, 0.75), { spec: 0.2 });
          bx += bw + (k < 0.15 ? 1 : 0);
        }
        sbox(x, sx, sy + 14, 18, 2, '#6a4a32', { r: 0.4, gloss: 0.4, outline: null });
      }
    }
    // plant on the left shelf top
    sbox(x, 4.5, 5, 7, 5.4, '#c0703a', { r: 1, gloss: 0.4 });
    for (const [lx, ly, r] of [[4, 4, -0.6], [7, 2, 0], [10, 3.6, 0.5], [12, 5, 0.9], [2.4, 5.5, -1]] as const) {
      x.save();
      x.translate(lx + 1, ly + 2);
      x.rotate(r);
      ell(x, 0, 0, 1.2, 2.6);
      x.fillStyle = lin(x, -1, 0, 1, 0, ['#2e7a40', '#6ac080', '#3a8a4c']);
      x.fill();
      x.restore();
    }
    // baseboard + floor
    vfill(x, 0, 100, W, 4, ['#5a4a60', '#3a2c3a']);
    vfill(x, 0, 104, W, 16, ['#4a2e1e', '#6a4430', '#5a3a28']);
    x.strokeStyle = 'rgba(30,16,10,0.5)';
    x.lineWidth = 0.35;
    for (let i = -200; i <= 400; i += 14) {
      x.beginPath();
      x.moveTo(96 + (i - 96) * 0.7, 104);
      x.lineTo(i, 120);
      x.stroke();
    }
    vfill(x, 0, 104, W, 3, ['rgba(10,4,20,0.6)', 'rgba(10,4,20,0)']);
    // rug
    rr(x, 52, 109, 88, 9, 2);
    x.fillStyle = rad(x, 96, 113, 4, 50, ['#8a4068', '#6a3050', '#4e2240']);
    x.fill();
    x.fillStyle = '#d0a84a';
    for (let i = 55; i < 140; i += 4) x.fillRect(i, 112.8, 1, 0.6);
    // floor clutter: beanbag left, book stack + mug right
    shadow(x, 32, 107, 10, 2, 0.45);
    x.beginPath();
    x.moveTo(23, 107);
    x.quadraticCurveTo(22, 97, 31, 96.5);
    x.quadraticCurveTo(41, 97, 41, 107);
    x.closePath();
    x.fillStyle = rad(x, 29, 99, 1, 12, ['#7ab0e0', '#3a6a9a', '#1e3a5a']);
    x.fill();
    shadow(x, 161, 101, 10, 1.6, 0.45);
    for (const [i, c] of [[0, '#b04a4a'], [1, '#4a9a6a'], [2, '#d0a84a']] as const) sbox(x, 154 - i, 100 - i * 3, 14, 3, c, { r: 0.6, gloss: 0.45 });
    cyl(x, 170, 96, 4, 5, '#e8e0d0', { spec: 0.6 });
    x.lineWidth = 0.6;
    x.strokeStyle = '#d8d0c0';
    x.beginPath();
    x.arc(174, 98.4, 1, -Math.PI / 2, Math.PI / 2);
    x.stroke();
    // a clamp lamp on the right shelf, and its warm pool over the study corner
    x.globalCompositeOperation = 'lighter';
    x.fillStyle = rad(x, 120, 100, 4, 100, ['rgba(255,200,120,0.3)', 'rgba(255,170,90,0.1)', 'rgba(255,170,90,0)']);
    x.fillRect(0, 0, W, H);
    beam(x, 176, 186, 10, 96, 196, 104, '#ffd8a0', 0.16);
    x.globalCompositeOperation = 'source-over';
    cyl(x, 182.5, 2, 1, 6, '#5a5a6a', { spec: 0.4 });
    x.beginPath();
    x.moveTo(176, 11);
    x.quadraticCurveTo(177, 5, 181.5, 5);
    x.quadraticCurveTo(186, 5, 187, 11);
    x.closePath();
    x.fillStyle = lin(x, 176, 5, 187, 11, ['#ff9a6a', '#c0503a', '#6a2418']);
    x.fill();
    ell(x, 181.5, 11, 5.5, 1);
    x.fillStyle = '#fff4d0';
    x.fill();
    pool(x, 181.5, 12, 10, 6, '#ffd890', 0.6);
  });
}

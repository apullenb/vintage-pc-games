// Flashcard Cram: a meaning appears, three term cards fall toward the DEADLINE.
// Slide between lanes and zap the matching term with your highlighter before it lands.
// First-try hits build a streak multiplier; later rounds fall faster and shuffle lanes mid-air.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cached, disc, dither, dot, glow, grad, hash, INK, mix, rect, shade, stipple, type Ctx } from '../art/px.ts';
import { drawPerson, playerPerson } from '../art/people.ts';
import { buildRounds, type Card, type Round } from './cardsDeck.ts';
import { bigText, burst, drawFloaters, drawParticles, once, outlined, rng, sound, soundInit, stepFloaters, stepParticles, type Floater, type Particle } from './cardsFx.ts';
import { clamp01, ctxOf, MiniHud, motes, PixelCanvas, TouchPad, useInput, useLoop, vignette, type MiniProps } from './kit.tsx';
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
  const rounds = useMemo<Round[]>(() => buildRounds(s, rng((Date.now() ^ (s.seed * 7919)) >>> 0), undefined, String(data.course ?? '')), [s, data.course]);
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
    const x = ctxOf(canvas.current);
    if (!x) return;
    x.save();
    if (st.shake > 0) x.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 3));
    x.drawImage(background(), 0, 0);

    // deadline
    const danger = st.phase === 'play' ? clamp01((Math.max(...st.cards.filter((c) => c.state === 'fall').map((c) => c.y), START_Y) - 20) / 40) : 0;
    const dl = mix('#7a4a6a', '#ff5a4a', danger * (0.6 + 0.4 * Math.sin(st.time * 14)));
    for (let i = 0; i < W; i += 6) rect(x, i, DEADLINE, 4, 1, dl);
    outlined(x, 'DEADLINE', 48, DEADLINE + 3, mix('#b08aa8', '#ff8a7a', danger));

    // player + highlighter
    const fr = Math.floor(st.walk) % 2;
    const pX = Math.round(st.px - 7);
    if (st.streak >= 3) glow(x, st.px, PLAYER_Y + 16, 12 + Math.sin(st.time * 8), 18, st.streak >= 6 ? '#7ff0c0' : '#fff36a', 0.7);
    drawPerson(x, person, pX, PLAYER_Y, fr, false, { face: st.lane === 0 ? -1 : st.lane === 2 ? 1 : 0 });
    // highlighter raised in the right hand
    const hx = pX + 12;
    const hy = PLAYER_Y + 9 + (st.beam.t > 0 ? -2 : 0);
    rect(x, hx, hy, 3, 8, '#f2e23a');
    rect(x, hx, hy, 1, 8, '#fff79a');
    rect(x, hx, hy + 6, 3, 2, '#3a3a52');
    rect(x, hx + 1, hy - 2, 1, 2, '#c8b81a');

    // beam
    if (st.beam.t > 0) {
      const a = st.beam.t / 0.18;
      const top = Math.max(-2, st.beam.top);
      const bot = hy - 2;
      const col = st.beam.ok ? '255,243,106' : '255,255,255';
      x.fillStyle = `rgba(${col},${(0.25 * a).toFixed(3)})`;
      x.fillRect(Math.round(st.beam.x - 4), Math.round(top), 9, Math.round(bot - top));
      x.fillStyle = `rgba(${col},${(0.85 * a).toFixed(3)})`;
      x.fillRect(Math.round(st.beam.x - 1), Math.round(top), 3, Math.round(bot - top));
      x.fillStyle = 'rgba(255,255,255,0.8)';
      x.fillRect(Math.round(st.beam.x), Math.round(top), 1, Math.round(bot - top));
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
        const bob = reducedMotion ? 0 : Math.round(Math.abs(Math.sin(st.time * 6)) * 3);
        const ax = Math.round(b.x + b.w / 2);
        const ay = Math.round(b.y + b.h + 3 + bob);
        for (let k = 0; k < 4; k++) {
          rect(x, ax - k - 1, ay + k, k * 2 + 3, 1, INK);
          rect(x, ax - k, ay + k, k * 2 + 1, 1, '#fff36a');
        }
        outlined(x, 'THIS ONE!', ax - 17, ay + 6, '#fff36a');
      }
    }

    drawParticles(x, st.ps);
    drawFloaters(x, st.fl);

    // dust in the lamplight + a soft vignette around the desk
    if (!reducedMotion) motes(x, st.time, { x: 20, y: 6, w: 150, h: 70 }, 16, '#fff3c4', 2, -2);
    vignette(x, W, H, 0.3);

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
    const px = Math.round(cx);
    const py = Math.round(cy);
    const ww = Math.round(w);
    const hh = Math.round(h);
    // shadow
    x.fillStyle = 'rgba(10,6,20,0.35)';
    x.fillRect(px + 2, py + 2, ww, hh);
    let paper = '#fbf6e6';
    if (c.state === 'hit') paper = c.t < 0.1 ? '#ffffff' : '#fff36a';
    else if (c.state === 'wrong') paper = '#f2a49a';
    else if (c.state === 'missed') paper = '#f6d2c8';
    else if (reveal) paper = '#c8f2d8';
    rect(x, px, py, ww, hh, paper);
    if (ww > 20) {
      // index card rules
      rect(x, px + 1, py + 4, ww - 2, 1, c.state === 'hit' ? '#e0b030' : '#e0707a');
      for (let ly = py + 9; ly < py + hh - 2; ly += 5) rect(x, px + 1, ly, ww - 2, 1, c.state === 'hit' ? '#f0d850' : '#cfe0f0');
      if (c.state === 'fall' && !reducedMotion) {
        // a glossy highlight sweeps across each card now and then
        const sw = ((g.current.time * 30 + cx * 0.7) % (ww + 60)) - 10;
        for (let j = 0; j < hh; j++) {
          const sx = Math.round(px + sw - j * 0.6);
          if (sx >= px && sx + 2 <= px + ww) rect(x, sx, py + j, 2, 1, 'rgba(255,255,255,0.6)');
        }
      }
      if (c.state === 'hit' && c.t < 0.2) {
        // highlighter swipe across
        const k = clamp01(c.t / 0.12);
        rect(x, px, py + hh / 2 - 4, Math.round(ww * k), 8, '#ffe600');
      }
    }
    // outline
    x.fillStyle = c.state === 'missed' ? '#c0392b' : INK;
    x.fillRect(px - 1, py - 1, ww + 2, 1);
    x.fillRect(px - 1, py + hh, ww + 2, 1);
    x.fillRect(px - 1, py, 1, hh);
    x.fillRect(px + ww, py, 1, hh);
    if (c.state === 'wrong') {
      for (let i = 0; i < 10; i++) {
        rect(x, px + ww / 2 - 5 + i, py + hh / 2 - 5 + i, 2, 1, '#c0392b');
        rect(x, px + ww / 2 + 4 - i, py + hh / 2 - 5 + i, 2, 1, '#c0392b');
      }
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
        <PixelCanvas canvasRef={canvas} width={W} height={H} onPointer={onPointer} />
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

// Late-night study nook: window, shelves, desk lamp. Drawn once.
function background(): HTMLCanvasElement {
  return cached('cards-bg', W, H, (x) => {
    // wall with faint striped wallpaper
    grad(x, 0, 0, W, 100, ['#15102c', '#1c1638', '#251d46']);
    for (let i = 4; i < W; i += 8) stipple(x, i, 0, 2, 100, '#2c2452', 0.35);
    // window: city skyline at night, curtains, rod
    rect(x, 70, 8, 52, 38, '#3a2a22');
    grad(x, 72, 10, 48, 34, ['#0b1028', '#16204a', '#2a2a5e', '#4a3a6a']);
    for (let i = 0; i < 18; i++) dot(x, 73 + ((i * 29) % 46), 11 + ((i * 13) % 18), i % 4 ? '#7f8fc8' : '#f6efdc');
    disc(x, 110, 17, 3, '#f6efdc');
    disc(x, 112, 16, 2, '#16204a');
    const sky = [[72, 30, 7], [79, 26, 6], [85, 33, 8], [93, 24, 5], [98, 29, 9], [107, 27, 6], [113, 32, 7]];
    for (const [bx, by, bw] of sky) {
      rect(x, bx, by, bw, 44 - by, '#0e0b1e');
      for (let wy = by + 2; wy < 42; wy += 3) for (let wx = bx + 1; wx < bx + bw - 1; wx += 2) if (hash(wx * 31 + wy * 7) < 0.35) dot(x, wx, wy, '#f2c84a');
    }
    rect(x, 95, 10, 2, 34, '#3a2a22');
    rect(x, 72, 26, 48, 1, '#3a2a22');
    rect(x, 68, 45, 56, 3, '#5a3e2c');
    rect(x, 68, 45, 56, 1, '#7a563c');
    rect(x, 62, 6, 68, 2, '#8a8a9a');
    for (const [cx0, dir] of [[62, 1], [120, -1]] as const) {
      for (let i = 0; i < 10; i++) {
        const c = i % 3 === 0 ? '#2a5a5e' : i % 3 === 1 ? '#3a7a7a' : '#32686a';
        rect(x, cx0 + i, 8, 1, 46 + (dir > 0 ? i : 9 - i) % 3, c);
      }
    }
    // string lights
    const bulbs = ['#ff8a8a', '#ffd27a', '#8affc8', '#8ac8ff', '#e0a0ff'];
    for (let bx = 22; bx < 172; bx += 2) {
      const seg = (bx - 22) % 50;
      const by = 2 + Math.round(Math.sin((seg / 50) * Math.PI) * 5);
      dot(x, bx, by, '#3a3450');
      if (bx % 10 === 6) {
        const c = bulbs[(bx / 10) % bulbs.length | 0];
        glow(x, bx, by + 2, 4, 3, c, 0.5);
        rect(x, bx, by + 1, 1, 2, c);
      }
    }
    // poster: sunset mountains
    rect(x, 27, 52, 26, 30, '#e8dcc0');
    grad(x, 29, 54, 22, 26, ['#f2b65a', '#e0705a', '#8a4a7a']);
    for (let i = 0; i < 11; i++) rect(x, 29 + i, 80 - i * 2, 1, i * 2, '#3a2a5a'), rect(x, 50 - i, 80 - i, 1, i, '#4a3a6a');
    disc(x, 40, 62, 3, '#fff3a0');
    // corkboard with notes and a photo
    rect(x, 138, 52, 28, 22, '#6a4a30');
    dither(x, 139, 53, 26, 20, '#a8804e', '#98703e');
    for (const [nx, ny, c] of [[141, 55, '#f2e46a'], [151, 54, '#8ad0f0'], [156, 63, '#f2a0c0'], [143, 64, '#a0e8a0']] as const) {
      rect(x, nx, ny, 7, 7, c);
      rect(x, nx + 1, ny + 2, 5, 1, shade(c, 0.7));
      rect(x, nx + 1, ny + 4, 4, 1, shade(c, 0.7));
      dot(x, nx + 3, ny, '#c0392b');
    }
    // bookshelves on both edges
    for (const sx of [0, W - 18]) {
      rect(x, sx, 10, 18, 92, '#3a2820');
      rect(x, sx + (sx ? 0 : 17), 10, 1, 92, '#2a1c16');
      for (let sy = 12; sy < 100; sy += 18) {
        rect(x, sx, sy + 14, 18, 2, '#5a3e2c');
        let bx = sx + 1;
        for (let b = 0; bx < sx + 16; b++) {
          const k = hash(sx * 13 + sy * 7 + b);
          const c = ['#b04a4a', '#4a7ab8', '#4a9a6a', '#d0a84a', '#8a5ab8', '#d8d0c0'][Math.floor(k * 6)];
          const bw = k > 0.7 ? 3 : 2;
          const bh = 8 + Math.floor(k * 5);
          if (bx + bw > sx + 17) break;
          rect(x, bx, sy + 14 - bh, bw, bh, shade(c, 0.72));
          rect(x, bx, sy + 14 - bh, 1, bh, shade(c, 0.85));
          bx += bw + (k < 0.15 ? 1 : 0);
        }
      }
    }
    // plant on the left shelf top
    rect(x, 5, 5, 6, 5, '#b0603a');
    for (const [lx, ly] of [[3, 2], [6, 0], [9, 2], [11, 4], [2, 4]]) rect(x, lx, ly, 2, 4, '#4aa060');
    // baseboard + floor
    rect(x, 0, 100, W, 4, '#3a2c3a');
    rect(x, 0, 100, W, 1, '#4e3e50');
    rect(x, 0, 104, W, 16, '#5a3a28');
    for (let y = 104; y < H; y += 4) {
      rect(x, 0, y, W, 1, '#4a2e20');
      for (let i = 0; i < 5; i++) rect(x, ((y * 13 + i * 47) % W) | 0, y + 1, 1, 3, '#4a2e20');
    }
    stipple(x, 0, 104, W, 3, '#1a1022', 0.5);
    // rug
    dither(x, 52, 109, 88, 9, '#6a3050', '#5e2a48');
    rect(x, 52, 109, 88, 1, '#8a4a68');
    for (let i = 54; i < 140; i += 4) dot(x, i, 113, '#d0a84a');
    // floor clutter: beanbag left, book stack + mug right
    disc(x, 32, 103, 6, '#3a6a9a');
    rect(x, 24, 103, 17, 4, '#3a6a9a');
    rect(x, 27, 98, 4, 2, '#5a8aba');
    for (const [i, c] of [[0, '#b04a4a'], [1, '#4a9a6a'], [2, '#d0a84a']] as const) rect(x, 154 - i, 100 - i * 3, 14, 3, c);
    rect(x, 170, 96, 4, 5, '#e8e0d0');
    rect(x, 174, 97, 1, 2, '#e8e0d0');
  });
}

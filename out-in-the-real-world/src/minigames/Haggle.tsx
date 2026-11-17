// Haggle: a four-round negotiation. Listen to what they say, answer with the right move,
// then land the power meter to deliver it. Used for a used car's price and for asking for a raise.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { castFor, playerPerson } from '../art/people.ts';
import { INK, type Ctx } from '../art/px.ts';
import { sceneDef } from '../art/scenes.ts';
import { hagglePrice, raiseFor } from '../content/minigames/haggle.ts';
import type { ArtId } from '../engine/types.ts';
import { sfx } from '../ui/audio.ts';
import { dollars, Fx, say, wholeDollars } from './groceryHaggleFx.ts';
import {
  CAR,
  meterFor,
  PATIENCE_OUT,
  pickTell,
  RAISE,
  repMult,
  resolve,
  ROUNDS,
  scoreOf,
  startPatience,
  zoneAt,
  type Meter,
  type RoundResult,
  type Side,
  type Tactic,
  type Zone,
} from './haggleData.ts';
import { MiniHud, useInput, useLoop, type MiniProps } from './kit.tsx';
import { ball, bigWord, blit, cyl, ell, glare, haze, Hd2Canvas, hdCtx, lin, pool, rad, rr, sbox, shadow, smoothUp, tint, vfill, vignette2 } from './hd2Kit.tsx';
import { person } from './hd2Person.ts';
import './groceryHaggle.css';

const W = 192;
const H = 108;

type Phase = 'intro' | 'choose' | 'deliver' | 'react' | 'final';
interface G {
  phase: Phase;
  pt: number;
  t: number;
  round: number;
  patience: number;
  patience0: number;
  shownPatience: number;
  gain: number;
  used: Set<string>;
  tell: Tactic | null;
  line: string; // what they're saying now
  you: string; // what you said last
  hi: number; // highlighted tactic
  pick: Tactic | null;
  meter: Meter;
  needle: number;
  dir: 1 | -1;
  last: { zone: Zone; res: RoundResult } | null;
  matches: number;
  perfects: number;
  shown: number; // displayed price / raise, ticking toward the real one
  bar: number; // displayed case strength 0..1
  fx: Fx;
  npcKick: number; // recoil animation
  npcMood: 'ok' | 'happy' | 'mad';
  talkT: number;
  youStep: number;
  walkT: number;
  ended: boolean;
  endWhy: 'rounds' | 'patience';
}

export function Haggle({ s, data, onDone, reducedMotion }: MiniProps) {
  const isRaise = data.item === 'raise';
  const side: Side = isRaise ? RAISE : CAR;
  const price = Number(data.price ?? 2400);
  const wage = s.job?.wage ?? 15;
  const rep = s.stats.rep;
  const mult = repMult(isRaise, rep);
  const art: ArtId = isRaise ? (s.job?.art ?? 'office') : 'carlot';
  const npc = isRaise ? castFor('boss', s.path) : castFor('dealer');
  const me = playerPerson(s.look);

  const canvas = useRef<HTMLCanvasElement>(null);
  const backdrop = useRef<HTMLCanvasElement | null>(null);
  const smoothBack = useRef<HTMLCanvasElement | null>(null);
  const input = useInput();
  const game = useRef<G | null>(null);
  if (!game.current) {
    const p0 = startPatience(isRaise, rep);
    game.current = {
      phase: 'intro',
      pt: 0,
      t: 0,
      round: 0,
      patience: p0,
      patience0: p0,
      shownPatience: p0,
      gain: 0,
      used: new Set(),
      tell: null,
      line: isRaise ? side.opener : side.opener.replace('$2,400', wholeDollars(price)),
      you: '',
      hi: 0,
      pick: null,
      meter: meterFor(0),
      needle: 0,
      dir: 1,
      last: null,
      matches: 0,
      perfects: 0,
      shown: isRaise ? 0 : price,
      bar: 0,
      fx: new Fx(reducedMotion),
      npcKick: 0,
      npcMood: 'ok',
      talkT: 1.2,
      youStep: 0,
      walkT: 0,
      ended: false,
      endWhy: 'rounds',
    };
  }
  const [, setVer] = useState(0);
  const bump = (): void => setVer((v) => v + 1);
  const doneRef = useRef(false);

  const available = (g: G): Tactic[] => side.tactics.filter((t) => t.rapport || !g.used.has(t.id));
  const offerText = (g: G): string => (isRaise ? `+${dollars(raiseFor(scoreOf(g.gain)))}/hr` : wholeDollars(hagglePrice(price, scoreOf(g.gain))));

  const startRound = (g: G): void => {
    g.phase = 'choose';
    g.pt = 0;
    g.pick = null;
    g.tell = pickTell(side, g.used, g.patience);
    g.line = g.tell.tells[Math.floor(Math.random() * g.tell.tells.length)];
    g.talkT = 1.4;
    const av = available(g);
    g.hi = Math.min(g.hi, av.length - 1);
    g.meter = meterFor(g.round);
    bump();
  };

  const choose = (g: G, t: Tactic): void => {
    if (g.phase !== 'choose' || g.pt < 0.3) return;
    g.pick = t;
    g.phase = 'deliver';
    g.pt = 0;
    g.needle = 0;
    g.dir = 1;
    g.you = t.label;
    sfx('select');
    bump();
  };

  const deliver = (g: G): void => {
    if (g.phase !== 'deliver' || g.pt < 0.25 || !g.pick) return;
    const t = g.pick;
    const zone = zoneAt(g.meter, g.needle);
    const matched = g.tell?.id === t.id;
    const before = g.gain;
    const res = resolve(t, matched, zone, g.needle, g.patience, mult);
    g.gain = Math.max(0, Math.min(0.3, g.gain + res.gain));
    g.patience = Math.max(0, Math.min(100, g.patience + res.patience));
    if (!t.rapport) g.used.add(t.id);
    g.last = { zone, res };
    if (matched && (zone === 'sweet' || zone === 'perfect')) g.matches++;
    if (zone === 'perfect') g.perfects++;
    g.phase = 'react';
    g.pt = 0;
    g.talkT = 1.3;
    const fx = g.fx;
    const nx = npcX + 7;
    if (res.outcome === 'pushy') {
      g.line = side.pushy;
      g.npcMood = 'mad';
      fx.float(nx, 38, 'TOO PUSHY!', '#ff8070', 1, 1.4);
      fx.burst(nx, 70, 10, ['#c8c8d4', '#ffffff'], 30, -20, 2);
      fx.shake(2.5);
      fx.flash('#e0503c', 0.1);
      sfx('bad');
    } else if (res.outcome === 'called') {
      g.line = side.bluffCalled;
      g.npcMood = 'mad';
      fx.float(nx, 38, 'BLUFF CALLED', '#ff8070', 1, 1.4);
      g.walkT = 1.2;
      sfx('bad');
    } else {
      g.line = res.outcome === 'soft' ? side.soft : t.rapport || res.outcome === 'win' || g.last.zone !== 'ok' ? t.win : `${t.win.split('.')[0]}… maybe.`;
      g.npcMood = res.outcome === 'soft' ? 'ok' : 'happy';
      const tag = zone === 'perfect' ? 'PERFECT!' : zone === 'sweet' ? 'GOOD!' : zone === 'ok' ? 'OKAY' : 'TOO SOFT';
      fx.float(youX + 7, 40, tag, zone === 'perfect' ? '#f2d048' : zone === 'sweet' ? '#8cf0a0' : '#ffffff', 1, 1.2);
      if (matched && zone !== 'soft') fx.float(W / 2, 30, 'GOOD COMEBACK!', '#8cf0a0', 1, 1.6);
      if (res.outcome !== 'soft') {
        g.npcKick = 1;
        fx.burst(nx + 3, 68, 4, ['#8fd0ff', '#ffffff'], 20, 50);
      }
      if (t.id === 'walk') g.walkT = 1.2;
      sfx(zone === 'soft' ? 'click' : 'coin');
    }
    // Money moving.
    const a = scoreOf(before);
    const b = scoreOf(g.gain);
    if (isRaise) {
      const d = raiseFor(b) - raiseFor(a);
      if (d) fx.float(W / 2, 86, `${d > 0 ? '+' : '-'}${dollars(Math.abs(d))}/HR`, d > 0 ? '#8cf0a0' : '#ff8070', 2, 1.5);
    } else {
      const d = hagglePrice(price, a) - hagglePrice(price, b);
      if (d) fx.float(W / 2, 80, `${d > 0 ? '-' : '+'}${wholeDollars(Math.abs(d))}`, d > 0 ? '#8cf0a0' : '#ff8070', 2, 1.5);
    }
    if (b > a) fx.burst(W / 2, 62, 16, ['#f2d048', '#ffffff', '#8cf0a0'], 55);
    bump();
  };

  const end = (g: G, why: 'rounds' | 'patience'): void => {
    g.phase = 'final';
    g.pt = 0;
    g.endWhy = why;
    if (why === 'patience') g.gain *= PATIENCE_OUT;
    const sc = scoreOf(g.gain);
    if (isRaise) g.line = raiseFor(sc) > 0 ? `Okay. +${dollars(raiseFor(sc))} an hour, starting next paycheck.` : why === 'patience' ? side.done : 'Let’s revisit this in a few months.';
    else g.line = why === 'patience' ? `${side.done} ${wholeDollars(hagglePrice(price, sc))}, take it or leave it.` : `Fine. ${wholeDollars(hagglePrice(price, sc))}. Final offer.`;
    g.talkT = 1.6;
    g.npcMood = why === 'patience' ? 'mad' : 'happy';
    const good = sc >= 0.5;
    if (good) g.fx.burst(W / 2, 40, 30, ['#f2d048', '#e0503c', '#3f7fd8', '#3caa6a', '#ffffff'], 70, 70);
    sfx(good ? 'fanfare' : 'page');
    bump();
  };

  const finish = (g: G): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    const sc = Math.round(scoreOf(g.gain) * 1000) / 1000;
    onDone({ score: sc, stats: { offer: isRaise ? raiseFor(sc) : hagglePrice(price, sc), matches: g.matches, perfects: g.perfects, patience: Math.round(g.patience), rounds: g.round } });
  };

  // Number keys pick a move directly.
  useEffect(() => {
    const kd = (e: KeyboardEvent): void => {
      const g = game.current!;
      const n = Number(e.key);
      if (g.phase !== 'choose' || !(n >= 1 && n <= 9)) return;
      const t = available(g)[n - 1];
      if (t) choose(g, t);
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  });

  const youX = (sceneDef(art, { path: s.path }).player ?? 52) - 7;
  const npcX = (sceneDef(art, { path: s.path }).npc ?? 128) - 7;

  useLoop(
    (dt) => {
      const g = game.current!;
      g.t += dt;
      g.pt += dt;
      g.fx.update(dt);
      g.talkT = Math.max(0, g.talkT - dt);
      g.npcKick = Math.max(0, g.npcKick - dt * 2.5);
      g.walkT = Math.max(0, g.walkT - dt);
      g.shownPatience += (g.patience - g.shownPatience) * Math.min(1, dt * 5);
      const target = isRaise ? raiseFor(scoreOf(g.gain)) : hagglePrice(price, scoreOf(g.gain));
      g.shown += (target - g.shown) * Math.min(1, dt * 5);
      g.bar += (scoreOf(g.gain) - g.bar) * Math.min(1, dt * 4);
      if (Math.abs(target - g.shown) < (isRaise ? 0.005 : 1)) g.shown = target;
      const P = input.pressed;
      switch (g.phase) {
        case 'intro':
          if (g.pt > 2.2 || (g.pt > 0.5 && P.has('action'))) startRound(g);
          break;
        case 'choose': {
          const av = available(g);
          if (P.has('left') || P.has('up')) {
            g.hi = (g.hi + av.length - 1) % av.length;
            sfx('click');
            bump();
          }
          if (P.has('right') || P.has('down')) {
            g.hi = (g.hi + 1) % av.length;
            sfx('click');
            bump();
          }
          if (P.has('action') && av[g.hi]) choose(g, av[g.hi]);
          break;
        }
        case 'deliver': {
          g.youStep = Math.min(1, g.youStep + dt * 4);
          g.needle += g.dir * g.meter.speed * dt;
          if (g.needle >= 1) ((g.needle = 1), (g.dir = -1));
          if (g.needle <= 0) ((g.needle = 0), (g.dir = 1));
          if (P.has('action')) deliver(g);
          break;
        }
        case 'react':
          g.youStep = Math.max(0, g.youStep - dt * 3);
          if (g.pt > 1.9 || (g.pt > 0.7 && P.has('action'))) {
            g.round++;
            if (g.patience <= 0) end(g, 'patience');
            else if (g.round >= ROUNDS) end(g, 'rounds');
            else startRound(g);
          }
          break;
        case 'final':
          if (g.pt > 3.2 || (g.pt > 1.2 && P.has('action'))) finish(g);
          break;
      }
      const x = hdCtx(canvas.current);
      if (x) draw(x, g);
    },
    true,
    input,
  );

  // ---------- drawing ----------
  const draw = (x: Ctx, g: G): void => {
    const def = sceneDef(art, { path: s.path });
    if (!backdrop.current) {
      backdrop.current = document.createElement('canvas');
      backdrop.current.width = W;
      backdrop.current.height = H;
      smoothBack.current = document.createElement('canvas');
    }
    const frame = Math.floor(g.t * 8);
    const bctx = backdrop.current.getContext('2d', { willReadFrequently: true });
    if (bctx && (backdrop.current.dataset.f !== String(frame) || !backdrop.current.dataset.f)) {
      bctx.imageSmoothingEnabled = false;
      bctx.clearRect(0, 0, W, H);
      def.paint(bctx, g.t);
      backdrop.current.dataset.f = String(frame);
      if (smoothBack.current) smoothUp(backdrop.current, smoothBack.current);
    }
    const [ox, oy] = g.fx.offset();
    x.save();
    x.translate(ox, oy);
    // the shared pixel set, smoothed and texture-filtered, then lit like a stage
    blit(x, smoothBack.current ?? backdrop.current, 0, 0, W, H);
    const top = def.floor - 30;
    haze(x, 0, 0, W, def.floor - 6, '#c8d0f0', 0.1, 0.02);
    pool(x, W / 2, def.floor - 14, 90, 40, '#fff0d0', 0.16);
    vfill(x, 0, def.floor - 2, W, H - def.floor + 2, ['rgba(20,10,30,0)', 'rgba(20,10,30,0.22)']);

    // The thing being negotiated, between you.
    if (isRaise) drawWageCard(x, g, wage);
    else drawCar(x, g);

    // You
    const step = g.youStep * 4;
    const walk = g.walkT > 0 ? Math.sin((1 - g.walkT / 1.2) * Math.PI) * -18 : 0;
    person(x, me, youX + step + walk, top, g.phase === 'deliver' || Math.abs(walk) > 0.5 ? Math.floor(g.t * 6) % 2 : Math.floor(g.t * 1.5) % 2, g.phase === 'deliver' && Math.floor(g.t * 6) % 2 === 0, {
      face: walk < -4 ? -1 : 1,
      blink: frame % 41 === 0,
    });
    // Them
    const kick = g.npcKick * 3;
    const talk = g.talkT > 0 && Math.floor(g.t * 7) % 2 === 0;
    person(x, npc.p, npcX + kick, top, Math.floor(g.t * 1.5 + 1) % 2, talk, { face: -1, blink: frame % 37 === 5 });
    if (g.npcMood === 'mad' && (g.phase === 'react' || g.phase === 'final')) {
      // anger mark
      const ax = npcX + kick + 13;
      const ay = top - 2 + (g.fx.reduced ? 0 : Math.sin(g.t * 10));
      pool(x, ax, ay, 6, 6, '#ff4a3a', 0.35);
      x.save();
      x.lineCap = 'round';
      x.lineWidth = 1.1;
      x.strokeStyle = '#e0503c';
      for (const [a, b, c2, d] of [[-2.5, -1, -0.8, -0.6], [-1, -2.5, -0.6, -0.8], [2.5, -1, 0.8, -0.6], [1, -2.5, 0.6, -0.8], [-2.5, 1, -0.8, 0.6], [2.5, 1, 0.8, 0.6]] as const) {
        x.beginPath();
        x.moveTo(ax + a, ay + b);
        x.lineTo(ax + c2, ay + d);
        x.stroke();
      }
      x.restore();
    }
    // reactions you can read at a glance: a sweat drop on you while the meter runs,
    // a happy sparkle over them when a move lands, steam when their patience is nearly gone
    if (g.phase === 'deliver' && !g.fx.reduced) {
      const sy = top + 2 + ((g.t * 1.5) % 1) * 6;
      const dx = youX + 13.5 + step;
      x.beginPath();
      x.moveTo(dx, sy);
      x.quadraticCurveTo(dx + 1.6, sy + 2.6, dx, sy + 3.2);
      x.quadraticCurveTo(dx - 1.6, sy + 2.6, dx, sy);
      x.fillStyle = lin(x, dx - 1, sy, dx + 1, sy + 3, ['#e8f6ff', '#6ab0f0']);
      x.fill();
    }
    if (g.npcMood === 'happy' && g.phase === 'react' && g.pt < 1.2) {
      const k = Math.sin(g.t * 16);
      const sx = npcX + kick + 5;
      for (const [px2, py2, r] of [[sx, top - 6 - k, 2.4], [sx + 8, top - 4 + k, 1.4]] as const) {
        pool(x, px2, py2, r * 2.4, r * 2.4, '#fff36a', 0.5);
        x.fillStyle = '#fffbd0';
        x.beginPath();
        x.moveTo(px2, py2 - r);
        x.quadraticCurveTo(px2, py2, px2 + r, py2);
        x.quadraticCurveTo(px2, py2, px2, py2 + r);
        x.quadraticCurveTo(px2, py2, px2 - r, py2);
        x.quadraticCurveTo(px2, py2, px2, py2 - r);
        x.fill();
      }
    }
    if (g.patience < 30 && !g.fx.reduced && g.phase !== 'final') {
      for (let k = 0; k < 2; k++) {
        const ph = (g.t * 0.9 + k * 0.5) % 1;
        const r = 1.2 + ph * 2.2;
        const px2 = npcX + kick + 2 + k * 8 + Math.sin(g.t * 4 + k);
        const py2 = top - 2 - ph * 9;
        x.fillStyle = rad(x, px2, py2, 0, r, [`rgba(240,236,250,${(0.8 * (1 - ph)).toFixed(3)})`, 'rgba(240,236,250,0)']);
        x.fillRect(px2 - r, py2 - r, r * 2, r * 2);
      }
    }
    def.extras?.(x, g.t);
    g.fx.drawParts(x);
    x.restore();
    vignette2(x, W, H, 0.45);

    // HUD on the canvas: round pips (left), their patience (right).
    sbox(x, 2, 2, 34, 18, '#1c1424', { r: 3, gloss: 0.12, outline: null });
    x.globalAlpha = 1;
    for (let i = 0; i < ROUNDS; i++) {
      const done = i < g.round || (i === g.round && (g.phase === 'react' || g.phase === 'final'));
      const cur = i === g.round && g.phase !== 'final';
      const c = done ? '#f2d048' : cur ? (Math.floor(g.t * 3) % 2 ? '#ffffff' : '#c8c0d8') : '#5a5070';
      if (done) pool(x, 7 + i * 8, 7, 4, 4, '#f2d048', 0.4);
      ball(x, 7 + i * 8, 7, 2.6, c, 2.6, 0.6);
    }
    say(x, `ROUND ${Math.min(ROUNDS, g.round + 1)}`, 4, 12, '#ffffff');
    drawPatience(x, g, side.who.toUpperCase());

    if (g.phase === 'deliver') drawMeter(x, g);
    if (g.phase === 'intro') {
      x.fillStyle = 'rgba(20,12,36,0.4)';
      x.fillRect(0, 0, W, H);
      const k = g.fx.reduced ? 1 : Math.min(1, g.pt / 0.35);
      bigWord(x, isRaise ? 'TIME TO ASK' : "LET'S MAKE A DEAL", W / 2, 40 + (1 - k) * 20, 15, '#fff0a0', '#ffb02a');
      say(x, 'LISTEN. ANSWER. DELIVER.', W / 2, 54, '#ffffff', { outline: INK, align: 'center' });
    }
    if (g.phase === 'final') {
      const sc = scoreOf(g.gain);
      const big = isRaise ? (raiseFor(sc) > 0 ? `+${dollars(raiseFor(sc))}/HR` : 'NOT YET') : sc > 0.02 ? 'DEAL!' : 'NO DEAL';
      const k = g.fx.reduced ? 1 : Math.min(1, g.pt / 0.25);
      x.fillStyle = lin(x, 0, 22, 0, 22 + 17 * k, ['rgba(40,28,60,0.75)', 'rgba(20,12,36,0.75)']);
      x.fillRect(0, 22, W, 17 * k);
      if (k >= 1) bigWord(x, big, W / 2, 30.5, 14, sc >= 0.5 ? '#fff0a0' : '#ffffff', sc >= 0.5 ? '#ffb02a' : '#b8b0c8');
      if (g.pt > 1.2) say(x, 'SPACE / TAP TO FINISH', W / 2, H - 9, '#ffffff', { outline: INK, align: 'center' });
    }
    g.fx.drawFloats(x, W);
    g.fx.drawFlash(x, W, H);
  };

  const drawCar = (x: Ctx, g: G): void => {
    // A tired little hatchback with a price sign on the windshield: rounded, glossy, a bit rusty.
    const px = 62;
    const py = 66;
    const body = '#9a4a3a';
    shadow(x, px + 34, py + 26, 40, 4, 0.5);
    // lower body
    rr(x, px - 0.5, py + 9, 69, 14, 4);
    x.fillStyle = lin(x, 0, py + 9, 0, py + 23, [[0, tint(body, 1.45)], [0.25, tint(body, 1.1)], [0.6, body], [1, tint(body, 0.5)]]);
    x.fill();
    x.lineWidth = 0.6;
    x.strokeStyle = 'rgba(28,20,36,0.85)';
    x.stroke();
    // cabin
    x.beginPath();
    x.moveTo(px + 6, py + 10);
    x.lineTo(px + 11, py + 0.5);
    x.quadraticCurveTo(px + 12, py - 0.8, px + 14, py - 0.8);
    x.lineTo(px + 42, py - 0.8);
    x.quadraticCurveTo(px + 45, py - 0.8, px + 47, py + 2);
    x.lineTo(px + 52, py + 10);
    x.closePath();
    x.fillStyle = lin(x, 0, py - 1, 0, py + 10, [tint(body, 1.3), body]);
    x.fill();
    x.stroke();
    // windows with sky reflection
    for (const [wx0, wx1] of [[px + 12, px + 26.5], [px + 28.5, px + 45]] as const) {
      x.beginPath();
      x.moveTo(wx0 - (wx0 === px + 12 ? 3 : 0), py + 9.5);
      x.lineTo(wx0, py + 1.5);
      x.lineTo(wx1, py + 1.5);
      x.lineTo(wx1 + (wx1 === px + 45 ? 3.5 : 0), py + 9.5);
      x.closePath();
      x.fillStyle = lin(x, 0, py + 1, 0, py + 10, ['#e8f8ff', '#8fcbe8', '#4a7a98']);
      x.fill();
      x.lineWidth = 0.4;
      x.stroke();
    }
    glare(x, px + 8, py + 1, 42, 9, 0.35);
    // body line, door seam, handle, lights
    x.fillStyle = 'rgba(255,220,200,0.35)';
    x.fillRect(px + 2, py + 13.5, 64, 0.5);
    x.fillStyle = 'rgba(40,10,10,0.5)';
    x.fillRect(px + 27, py + 1, 0.6, 21);
    sbox(x, px + 31, py + 12, 3.4, 1.2, '#c8ccd4', { r: 0.5, gloss: 0.6, outline: null });
    ball(x, px + 4, py + 14, 1.8, '#fff27a', 1.3, 0.9);
    pool(x, px + 4, py + 14, 6, 4, '#fff27a', 0.3);
    ball(x, px + 64.5, py + 14, 1.8, '#e0503c', 1.3, 0.8);
    sbox(x, px - 1, py + 19, 70, 3, '#4a4a54', { r: 1.4, gloss: 0.4, outline: null });
    // rust spots + a dent: it's a $2,400 car
    for (const [rx, ry, r] of [[px + 51.5, py + 17, 1.8], [px + 17, py + 18.5, 1.1]] as const) {
      ell(x, rx, ry, r, r * 0.6);
      x.fillStyle = rad(x, rx, ry, 0, r, ['#5a2a14', 'rgba(122,58,32,0.6)', 'rgba(122,58,32,0)']);
      x.fill();
    }
    for (const wx of [px + 8, px + 50]) {
      ell(x, wx + 5, py + 23, 5.4, 5.4);
      x.fillStyle = '#16121e';
      x.fill();
      ell(x, wx + 5, py + 23, 3.3, 3.3);
      x.fillStyle = rad(x, wx + 4, py + 22, 0, 3.6, ['#c8ccd8', '#6a6a78', '#3a3a44']);
      x.fill();
      ball(x, wx + 5, py + 23, 1, '#d8dce4', 1, 0.8);
    }
    // price sign
    const label = wholeDollars(Math.round(g.shown / 5) * 5);
    const pop = g.phase === 'react' && g.pt < 0.3 && !g.fx.reduced ? 1 : 0;
    const sx = px + 34 - 26 - pop;
    const sy = py - 22 - pop;
    cyl(x, px + 33, sy + 17 + pop, 2, 5, '#3a3a44', { spec: 0.4 });
    pool(x, px + 34, sy + 9, 34, 12, '#ffe890', 0.2);
    sbox(x, sx, sy, 52 + pop * 2, 18 + pop * 2, '#f2d048', { r: 2.5, gloss: 0.55, lw: 0.7 });
    say(x, label, px + 34, sy + 4 + pop, INK, { scale: 2, align: 'center' });
    if (g.shown < price - 1) {
      say(x, wholeDollars(price), px + 34, sy - 8, '#ffffff', { outline: INK, align: 'center' });
      x.fillStyle = '#e0503c';
      x.fillRect(px + 34 - 13, sy - 5.6, 26, 1);
    }
  };

  const drawWageCard = (x: Ctx, g: G, base: number): void => {
    const cx = W / 2;
    const y = 40;
    shadow(x, cx + 2, y + 41, 32, 4, 0.45);
    sbox(x, cx - 28, y, 56, 40, '#fbfaf4', { r: 3, gloss: 0.25, lw: 0.7 });
    x.save();
    rr(x, cx - 28, y, 56, 40, 3);
    x.clip();
    vfill(x, cx - 28, y, 56, 8, ['#6a9ff0', '#3f7fd8', '#2a5ab0']);
    x.restore();
    say(x, 'YOUR PAY', cx, y + 2, '#ffffff', { align: 'center' });
    say(x, `${dollars(base)}/HR`, cx, y + 10, '#5a4a6a', { align: 'center' });
    const r = Math.round(g.shown * 4) / 4;
    say(x, r > 0 ? `+${dollars(r)}` : '+$0.00', cx, y + 17, r > 0 ? '#2f8a4a' : '#a8a0b0', { scale: 2, align: 'center' });
    // How strong your case is so far; each tick is the next step up in the raise.
    const bx = cx - 23;
    const bw = 46;
    rr(x, bx - 1, y + 30, bw + 2, 6, 3);
    x.fillStyle = lin(x, 0, y + 30, 0, y + 36, ['#a8a0b0', '#e8e0f0']);
    x.fill();
    const fw = bw * Math.min(1, g.bar);
    if (fw > 1) sbox(x, bx, y + 31, fw, 4, '#3caa6a', { r: 2, gloss: 0.6, outline: null });
    x.fillStyle = 'rgba(28,20,36,0.7)';
    for (const tk of [0.35, 0.417, 0.583, 0.75, 0.917]) x.fillRect(bx + bw * tk, y + 30, 0.6, 6);
  };

  const drawPatience = (x: Ctx, g: G, who: string): void => {
    const v = g.shownPatience / 100;
    const bx = W - 64;
    const by = 4;
    say(x, `${who}'S PATIENCE`, W - 4, by, '#ffffff', { outline: INK, align: 'right' });
    rr(x, bx, by + 8, 50, 7, 3.5);
    x.fillStyle = lin(x, 0, by + 8, 0, by + 15, ['#1c1424', '#3a3048']);
    x.fill();
    const c = v > 0.55 ? '#3caa6a' : v > 0.3 ? '#f2b632' : '#e0503c';
    const flash = v <= 0.3 && Math.floor(g.t * 4) % 2 === 0;
    if (v > 0.02) sbox(x, bx + 1, by + 9, Math.max(3, 48 * v), 5, flash ? '#ff8070' : c, { r: 2.5, gloss: 0.6, outline: null });
    // face
    const fx = W - 11;
    const fy = by + 11;
    ell(x, fx, fy, 4.3, 4.3);
    x.fillStyle = '#1c1424';
    x.fill();
    ball(x, fx, fy, 3.6, c, 3.6, 0.6);
    x.fillStyle = INK;
    x.strokeStyle = INK;
    x.lineWidth = 0.6;
    x.lineCap = 'round';
    for (const ex of [-1.4, 1.4]) {
      ell(x, fx + ex, fy - 0.8, 0.45, 0.65);
      x.fill();
    }
    x.beginPath();
    if (v > 0.55) x.arc(fx, fy + 0.4, 1.5, 0.3, Math.PI - 0.3);
    else if (v > 0.3) {
      x.moveTo(fx - 1.2, fy + 1.6);
      x.lineTo(fx + 1.2, fy + 1.6);
    } else {
      x.arc(fx, fy + 2.8, 1.4, Math.PI + 0.4, -0.4);
      x.moveTo(fx - 2.6, fy - 2.6);
      x.lineTo(fx - 0.8, fy - 2);
      x.moveTo(fx + 2.6, fy - 2.6);
      x.lineTo(fx + 0.8, fy - 2);
    }
    x.stroke();
  };

  const drawMeter = (x: Ctx, g: G): void => {
    const m = g.meter;
    const L = 22;
    const R = 170;
    const span = R - L;
    const y = 30;
    shadow(x, W / 2, y + 19, span * 0.55, 4, 0.5);
    sbox(x, L - 6, y - 12, span + 12, 30, '#2a2240', { r: 3, gloss: 0.18, lw: 0.7 });
    say(x, g.pick ? g.pick.label.toUpperCase() : 'DELIVER IT', W / 2, y - 9, '#f2d048', { align: 'center' });
    const X = (p: number): number => L + p * span;
    const okStart = Math.max(0, m.c - m.w - 0.2);
    x.save();
    rr(x, L, y, span, 8, 3);
    x.clip();
    x.fillStyle = '#6a6a80';
    x.fillRect(L, y, span, 8);
    x.fillStyle = '#d8b030';
    x.fillRect(X(okStart), y, X(m.c - m.w) - X(okStart), 8);
    x.fillStyle = '#3caa6a';
    x.fillRect(X(m.c - m.w), y, X(m.c + m.w) - X(m.c - m.w), 8);
    x.fillStyle = '#7ad89a';
    x.fillRect(X(m.c - m.w * 0.35), y, X(m.c + m.w * 0.35) - X(m.c - m.w * 0.35), 8);
    x.fillStyle = '#e0503c';
    x.fillRect(X(m.c + m.w), y, R - X(m.c + m.w), 8);
    vfill(x, L, y, span, 8, ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.3)']);
    x.restore();
    pool(x, X(m.c), y + 4, 14, 6, '#7ad89a', 0.3);
    say(x, 'SOFT', L + 2, y + 10, '#a8a0c0');
    say(x, 'GOOD', X(m.c), y + 10, '#7ad89a', { align: 'center' });
    say(x, 'PUSHY', R - 1, y + 10, '#ff8070', { align: 'right' });
    const nx = X(g.needle);
    pool(x, nx, y + 4, 4, 8, '#ffffff', 0.5);
    x.beginPath();
    x.moveTo(nx - 2.4, y - 4.5);
    x.lineTo(nx + 2.4, y - 4.5);
    x.lineTo(nx + 0.6, y - 1.5);
    x.lineTo(nx + 0.6, y + 10);
    x.lineTo(nx - 0.6, y + 10);
    x.lineTo(nx - 0.6, y - 1.5);
    x.closePath();
    x.lineWidth = 0.8;
    x.lineJoin = 'round';
    x.strokeStyle = INK;
    x.stroke();
    x.fillStyle = '#ffffff';
    x.fill();
  };

  // ---------- DOM ----------
  const g = game.current;
  const av = available(g);
  const sc = scoreOf(g.gain);
  const speaking = g.phase === 'deliver' && g.pick ? { who: 'You', text: `(${g.pick.label}) Stop the meter in the green!` } : { who: side.who, text: g.line };
  return (
    <div className="mini gh-mini">
      <MiniHud
        items={
          isRaise
            ? [
                { label: 'Your pay', value: `${dollars(wage)}/hr` },
                { label: 'Raise on the table', value: `+${dollars(raiseFor(sc))}` },
                { label: 'Round', value: `${Math.min(ROUNDS, g.round + 1)}/${ROUNDS}` },
              ]
            : [
                { label: 'Sticker', value: wholeDollars(price) },
                { label: 'Their offer', value: offerText(g) },
                { label: 'You save', value: wholeDollars(price - hagglePrice(price, sc)) },
                { label: 'Round', value: `${Math.min(ROUNDS, g.round + 1)}/${ROUNDS}` },
              ]
        }
      />
      <div className="gh-canvas" style={{ '--ar': String(W / H) } as CSSProperties}>
        <Hd2Canvas
          canvasRef={canvas}
          onPointer={(_x, _y, kind) => {
            if (kind !== 'down') return;
            const gg = game.current!;
            if (gg.phase === 'deliver') deliver(gg);
            else if (gg.phase === 'final' && gg.pt > 1.2) finish(gg);
            else if (gg.phase === 'intro' && gg.pt > 0.5) startRound(gg);
          }}
        />
      </div>
      <div className={`gh-say ${speaking.who === 'You' ? 'you' : ''}`} aria-live="polite">
        <b>{speaking.who === 'You' ? 'You' : npc.name}</b>
        <span>“{speaking.text}”</span>
      </div>
      <div className="gh-bottom">
        {g.phase === 'choose' ? (
          <div className="gh-tactics" role="group" aria-label="Your move">
            {side.tactics.map((t) => {
              const idx = av.indexOf(t);
              const off = idx < 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`gh-tac ${idx === g.hi ? 'hi' : ''}`}
                  disabled={off}
                  onClick={() => choose(game.current!, t)}
                  onPointerEnter={() => {
                    if (!off && game.current!.hi !== idx) {
                      game.current!.hi = idx;
                      bump();
                    }
                  }}
                >
                  <span>
                    {!off && <span className="k">{idx + 1} </span>}
                    {t.label}
                  </span>
                  <small>{off ? 'Already used' : t.hint}</small>
                </button>
              );
            })}
          </div>
        ) : g.phase === 'deliver' ? (
          <button
            type="button"
            className="gh-deliver"
            onPointerDown={(e) => {
              e.preventDefault();
              deliver(game.current!);
            }}
          >
            Deliver it! <small>(SPACE)</small>
          </button>
        ) : (
          <div className="gh-wait">{g.phase === 'final' ? 'Tap the picture or press SPACE to finish' : g.phase === 'intro' ? 'Listen… (SPACE or tap to go on)' : '…'}</div>
        )}
      </div>
    </div>
  );
}

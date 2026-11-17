// Phishing Invaders: your phone screen is the battlefield. Texts, emails and DMs drop in as pixel
// cards. Slide your spam shield left and right and blast the scams (weird links, fake domains,
// "urgent" threats, too-good-to-be-true prizes) but let the real messages land in your inbox.
// Waves speed up, scams drop phishing links you have to dodge, and the finale is a giant
// PRIZE NOTIFICATION chain letter that splits into smaller scams when you break it.
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { castFor } from '../art/people.ts';
import { INK, rect, type Ctx } from '../art/px.ts';
import { ctxOf, MiniHud, PixelCanvas, TouchPad, useInput, useLoop, type MiniProps } from './kit.tsx';
import { BOSS_H, BOSS_W, bossSprite, CARD_H, CARD_W, cardSprite, DOCK_Y, drawBolt, drawDock, drawField, drawGlare, drawLink, drawShip, drawStatusBar, MINI_H, MINI_W, miniSprite, PH, PW, SHIP_Y } from './phishArt.ts';
import { BOSS_AT, buildSchedule, GAME_LEN, MINIS, phishScore, type Channel, type Msg, type PhishStats, type Spawn } from './phishData.ts';
import { beep, bigText, centered, clamp, COUNT_TIME, countLabel, cue, drawBanner, drawCount, Fx, note, noise, pick, ptext, ptw, rnd, soundInit } from './thriftPhishFx.ts';
import './phish.css';

const SHIP_SPEED = 150;
const BOLT_SPEED = 270;
const FIRE_GAP = 0.24;
const BOSS_HP = 18;

const sfx = {
  fire: () => beep(note(40), 0.06, 'square', 0.05, note(52)),
  crunch: () => {
    noise(0.12, 0.22, 5200);
    beep(note(30), 0.12, 'square', 0.08, note(16));
  },
  ding: () => {
    beep(note(31), 0.08, 'triangle', 0.12);
    beep(note(38), 0.16, 'triangle', 0.12, note(38), 0.07);
  },
  caught: () => beep(note(43), 0.12, 'triangle', 0.1, note(50), 0.12),
  alarm: () => {
    beep(note(26), 0.12, 'sawtooth', 0.07);
    beep(note(21), 0.18, 'sawtooth', 0.07, note(21), 0.12);
  },
  glitch: () => {
    noise(0.25, 0.2, 1400, 0, 'bandpass');
    for (let i = 0; i < 4; i++) beep(note(20 + ((i * 7) % 12)), 0.04, 'square', 0.05, note(20 + ((i * 7) % 12)), i * 0.04);
  },
  ping: () => beep(note(48), 0.04, 'square', 0.05),
  bossHit: () => noise(0.06, 0.18, 900),
  siren: () => [0, 1, 2, 3].forEach((i) => beep(note(i % 2 ? 26 : 31), 0.14, 'square', 0.06, note(i % 2 ? 26 : 31), i * 0.15)),
};

interface Card {
  msg: Msg | null; // null = a chain-letter mini
  mini: string;
  scam: boolean;
  why: string;
  x: number;
  y: number;
  w: number;
  h: number;
  baseX: number;
  vx: number;
  speed: number;
  zig: boolean;
  rush: boolean;
  age: number;
  hp: number;
  flash: number;
  linkT: number;
  state: 'fall' | 'dying' | 'landing';
  dieT: number;
  tone: 'norm' | 'red' | 'green';
}
interface Boss {
  x: number;
  y: number;
  hp: number;
  state: 'enter' | 'fight' | 'dead';
  t: number;
  spawnT: number;
  linkT: number;
  flash: number;
}
type Phase = 'count' | 'play' | 'end' | 'report';
interface G {
  phase: Phase;
  pt: number;
  t: number;
  playT: number;
  sched: Spawn[];
  si: number;
  lastLane: number;
  cards: Card[];
  bolts: { x: number; y: number }[];
  links: { x: number; y: number; vy: number; ph: number }[];
  boss: Boss | null;
  shipX: number;
  shipV: number;
  target: number | null;
  dragging: boolean;
  lean: number;
  fireCool: number;
  muzzle: number;
  stun: number;
  st: PhishStats;
  streak: number;
  best: number;
  fx: Fx;
  saved: Channel[];
  wave: number;
  banner: { head: string; sub: string; t: number; c: string } | null;
  announce: { s: string; c: string; t: number } | null;
  alarm: number;
  lessons: Map<string, number>;
  unread: number;
  endWhy: 'clear' | 'time' | 'spread' | null;
  sent: boolean;
  lastLabel: string | null;
}

const STREAK: Record<number, string> = { 3: 'NICE!', 5: 'SPAM SLAYER!', 8: 'FIREWALL!', 12: 'UNPHISHABLE!', 16: 'CYBER SAGE!' };
const LANES = [4, 54, 104];

function isCoarse(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function newGame(s: MiniProps['s'], rm: boolean): G {
  const boss = castFor('boss', s.path).name;
  return {
    phase: 'count',
    pt: 0,
    t: 0,
    playT: 0,
    sched: buildSchedule(Math.random, boss),
    si: 0,
    lastLane: -1,
    cards: [],
    bolts: [],
    links: [],
    boss: null,
    shipX: PW / 2,
    shipV: 0,
    target: null,
    dragging: false,
    lean: 0,
    fireCool: 0,
    muzzle: 0,
    stun: 0,
    st: { scamsHit: 0, scamsMissed: 0, realShot: 0, realSaved: 0, linksClicked: 0 },
    streak: 0,
    best: 0,
    fx: new Fx(rm, PW, PH),
    saved: [],
    wave: 0,
    banner: null,
    announce: null,
    alarm: 0,
    lessons: new Map(),
    unread: 214,
    endWhy: null,
    sent: false,
    lastLabel: null,
  };
}

function addCard(g: G, m: Msg, speed: number): void {
  const free = LANES.map((_, i) => i).filter((i) => i !== g.lastLane && !g.cards.some((c) => c.y < 30 && Math.abs(c.x - LANES[i]) < CARD_W - 6));
  const lane = free.length ? pick(free) : (g.lastLane + 1) % LANES.length;
  g.lastLane = lane;
  const x = LANES[lane];
  g.cards.push({ msg: m, mini: '', scam: m.scam, why: m.why, x, y: -CARD_H + 9, w: CARD_W, h: CARD_H, baseX: x, vx: 0, speed, zig: m.move === 'zig', rush: m.move === 'rush', age: 0, hp: m.hp ?? 1, flash: 0, linkT: rnd(2.5, 5), state: 'fall', dieT: 0, tone: 'norm' });
}

function addMini(g: G, x: number, y: number, vx: number, speed: number): void {
  g.cards.push({ msg: null, mini: pick(MINIS), scam: true, why: 'CHAIN LETTER', x, y, w: MINI_W, h: MINI_H, baseX: x, vx, speed, zig: Math.random() < 0.5, rush: false, age: rnd(0, 3), hp: 1, flash: 0, linkT: 99, state: 'fall', dieT: 0, tone: 'norm' });
}

function lesson(g: G, why: string): void {
  g.lessons.set(why, (g.lessons.get(why) ?? 0) + 1);
}

function bumpStreak(g: G): void {
  g.streak++;
  g.best = Math.max(g.best, g.streak);
  const w = STREAK[g.streak];
  if (w) {
    g.announce = { s: w, c: g.streak >= 8 ? '#ff9af0' : '#7cf08a', t: 1.2 };
    cue.combo(Math.min(12, g.streak));
  }
}
function breakStreak(g: G): void {
  if (g.streak >= 5) g.fx.pop(g.shipX, SHIP_Y - 10, `STREAK LOST (${g.streak})`, '#c8c0d8');
  g.streak = 0;
}

function spriteOf(c: Card): HTMLCanvasElement {
  if (!c.msg) return miniSprite(c.mini, c.flash > 0);
  const hl = c.state !== 'fall' && c.scam ? c.msg.flag : -1;
  return cardSprite(c.msg, hl, c.tone);
}

function killCard(g: G, c: Card): void {
  const { fx } = g;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  if (c.scam) {
    g.st.scamsHit++;
    g.unread = Math.max(0, g.unread - 1);
    lesson(g, c.why);
    fx.pop(cx, Math.max(16, c.y - 6), c.why, '#7cf08a');
    fx.burst(cx, cy, ['#ffe27a', '#ff7a5a', '#ffffff'], 12, 60, 40, 0.5);
    fx.ring(cx, cy, '#ffe27a', 18, 0.3);
    fx.kick(1.5);
    fx.stop(0.04);
    sfx.crunch();
    bumpStreak(g);
    c.tone = 'norm';
  } else {
    g.st.realShot++;
    fx.pop(cx, Math.max(14, c.y - 12), 'OOPS! THAT WAS REAL', '#ff7a5a');
    fx.pop(cx, Math.max(22, c.y - 4), c.why, '#ffd0c0');
    fx.blink('#ff3a2a', 0.35);
    fx.kick(3.5);
    cue.wrong();
    breakStreak(g);
    c.tone = 'green';
  }
  c.state = 'dying';
  c.dieT = 0;
}

function landCard(g: G, c: Card): void {
  const { fx } = g;
  const cx = c.x + c.w / 2;
  if (c.scam) {
    g.st.scamsMissed++;
    lesson(g, c.why);
    fx.pop(cx, DOCK_Y - 22, 'SCAM GOT THROUGH!', '#ff7a5a');
    fx.pop(cx, DOCK_Y - 14, c.why, '#ffd0c0');
    fx.blink('#ff2a1a', 0.3);
    fx.kick(3);
    sfx.alarm();
    g.alarm = 0.8;
    breakStreak(g);
    c.tone = 'red';
  } else {
    g.st.realSaved++;
    g.unread = Math.max(0, g.unread - 1);
    if (c.msg) g.saved.push(c.msg.ch);
    const caught = Math.abs(cx - g.shipX) < c.w / 2 + 2;
    fx.pop(cx, DOCK_Y - 16, caught ? 'CAUGHT IT! ' + c.why : '✓ ' + c.why, '#7cf08a');
    fx.burst(cx, DOCK_Y, ['#7cf08a', '#ffffff'], caught ? 14 : 8, 40, 60, 0.5);
    sfx.ding();
    if (caught) {
      sfx.caught();
      bumpStreak(g);
    }
    bumpStreak(g);
    c.tone = 'green';
  }
  c.state = 'landing';
  c.dieT = 0;
}

function fire(g: G): void {
  if (g.phase !== 'play' || g.fireCool > 0 || g.stun > 0 || g.bolts.length >= 3) return;
  g.bolts.push({ x: g.shipX - 1 + Math.round(g.lean), y: SHIP_Y - 9 });
  g.fireCool = FIRE_GAP;
  g.muzzle = 0.06;
  sfx.fire();
}

function endGame(g: G, why: 'clear' | 'time' | 'spread'): void {
  if (g.phase !== 'play') return;
  g.phase = 'end';
  g.pt = 0;
  g.endWhy = why;
  const sc = phishScore(g.st);
  if (sc >= 0.6) cue.fanfare();
  else cue.sad();
}

function step(g: G, dt: number, input: ReturnType<typeof useInput>): void {
  const { fx } = g;
  g.playT += dt;
  g.fireCool = Math.max(0, g.fireCool - dt);
  g.muzzle = Math.max(0, g.muzzle - dt);
  g.stun = Math.max(0, g.stun - dt);
  g.alarm = Math.max(0, g.alarm - dt);
  // ---- ship ----
  let want = (input.down.has('right') ? 1 : 0) - (input.down.has('left') ? 1 : 0);
  if (g.target !== null && want === 0) {
    const d = g.target - g.shipX;
    want = Math.abs(d) < 2 ? 0 : clamp(d / 14, -1, 1);
  }
  if (g.stun > 0) want *= 0.3;
  const tv = want * SHIP_SPEED;
  g.shipV += (tv - g.shipV) * Math.min(1, dt * 18);
  g.shipX = clamp(g.shipX + g.shipV * dt, 9, PW - 9);
  g.lean += (clamp(g.shipV / 60, -1.4, 1.4) - g.lean) * Math.min(1, dt * 12);
  if (input.down.has('action')) fire(g);

  // ---- spawns ----
  while (g.si < g.sched.length && g.sched[g.si].at <= g.playT) {
    const sp = g.sched[g.si++];
    if (sp.wave !== g.wave && sp.wave <= 3) {
      g.wave = sp.wave;
      g.banner = { head: `WAVE ${sp.wave}`, sub: sp.wave === 1 ? 'SHOOT SCAMS. LET REAL ONES LAND.' : sp.wave === 2 ? 'FASTER! WATCH FOR LINKS' : 'URGENT!! (THAT IS A RED FLAG)', t: 1.6, c: '#9ad8ff' };
      if (sp.wave > 1) cue.announce();
    }
    addCard(g, sp.msg, sp.speed);
  }
  if (!g.boss && g.playT >= BOSS_AT) {
    g.boss = { x: PW / 2, y: -BOSS_H, hp: BOSS_HP, state: 'enter', t: 0, spawnT: 1.5, linkT: 2.5, flash: 0 };
    g.banner = { head: 'WARNING!', sub: 'CHAIN LETTER INCOMING', t: 1.8, c: '#ff7a5a' };
    sfx.siren();
  }

  // ---- boss ----
  const b = g.boss;
  if (b && b.state !== 'dead') {
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    if (b.state === 'enter') {
      b.y += 26 * dt;
      if (b.y >= 16) {
        b.y = 16;
        b.state = 'fight';
      }
    } else {
      b.x = PW / 2 + Math.sin(b.t * 0.9) * (PW / 2 - BOSS_W / 2 - 2 + 18);
      b.y = 16 + Math.sin(b.t * 1.7) * 3;
      b.spawnT -= dt;
      if (b.spawnT <= 0) {
        b.spawnT = 1.7;
        addMini(g, clamp(b.x - MINI_W / 2 + rnd(-40, 40), 2, PW - MINI_W - 2), b.y + BOSS_H - 6, 0, 30);
      }
      b.linkT -= dt;
      if (b.linkT <= 0 && g.links.length < 3) {
        b.linkT = 2.8;
        g.links.push({ x: b.x + rnd(-50, 50), y: b.y + BOSS_H, vy: 62, ph: 0 });
      }
    }
  }

  // ---- cards ----
  for (const c of g.cards) {
    c.flash = Math.max(0, c.flash - dt);
    if (c.state === 'dying') {
      c.dieT += dt;
      if (c.dieT >= (fx.rm ? 0.05 : 0.16)) {
        const spr = spriteOf(c);
        fx.shatter(spr, c.w + 2, c.h + 2, c.x, c.y, 5, c.scam ? 70 : 45, 160);
        c.dieT = 99;
      }
      continue;
    }
    if (c.state === 'landing') {
      c.dieT += dt;
      if (c.scam && c.dieT > 0.55 && c.dieT < 50) {
        fx.shatter(spriteOf(c), c.w + 2, c.h + 2, c.x, c.y, 6, 40, 120);
        c.dieT = 99;
      }
      continue;
    }
    c.age += dt;
    let v = c.speed;
    if (c.rush) v *= 1 + 1.7 * Math.pow(Math.max(0, c.y) / DOCK_Y, 2);
    c.y += v * dt;
    if (c.vx) {
      c.baseX += c.vx * dt;
      c.vx *= 1 - Math.min(1, dt * 1.5);
      if (c.baseX < 2 || c.baseX > PW - c.w - 2) c.vx = -c.vx;
    }
    c.x = c.zig ? clamp(c.baseX + Math.sin(c.age * 2.1) * 16, 2, PW - c.w - 2) : clamp(c.baseX, 2, PW - c.w - 2);
    // scams drop phishing links from wave 2 on
    if (c.scam && c.msg && g.wave >= 2) {
      c.linkT -= dt;
      if (c.linkT <= 0 && c.y > 20 && c.y < 130 && g.links.length < 2) {
        c.linkT = rnd(4, 7);
        g.links.push({ x: c.x + c.w / 2, y: c.y + c.h, vy: 48 + g.wave * 5, ph: 0 });
      }
    }
    if (c.y + c.h >= DOCK_Y) landCard(g, c);
  }
  g.cards = g.cards.filter((c) => !(c.dieT >= 99 || (c.state === 'landing' && !c.scam && c.dieT > 0.45)));

  // ---- bolts ----
  for (const bo of g.bolts) {
    bo.y -= BOLT_SPEED * dt;
    if (g.boss && g.boss.state !== 'dead' && bo.y < g.boss.y + BOSS_H && bo.y > g.boss.y && Math.abs(bo.x - g.boss.x) < BOSS_W / 2) {
      bo.y = -99;
      const bs = g.boss;
      if (bs.state === 'enter') continue;
      bs.hp--;
      bs.flash = 0.08;
      fx.burst(bo.x, bs.y + BOSS_H - 2, ['#ffe27a', '#ffffff'], 5, 40, 60, 0.3);
      sfx.bossHit();
      if (bs.hp <= 0) {
        bs.state = 'dead';
        g.st.scamsHit++;
        lesson(g, 'CHAIN LETTER');
        fx.shatter(bossSprite(0, 1), BOSS_W + 2, BOSS_H + 2, bs.x - BOSS_W / 2, bs.y, 7, 90, 110);
        fx.burst(bs.x, bs.y + BOSS_H / 2, ['#f2b632', '#ff7a5a', '#ffffff', '#ffe27a'], 40, 110, 50, 0.9, 2);
        fx.kick(6);
        fx.blink('#ffffff', 0.5);
        fx.stop(0.12);
        cue.crash();
        g.announce = { s: 'CHAIN BROKEN!', c: '#ffe27a', t: 1.6 };
        // it splits into smaller scams
        for (let k = 0; k < 6; k++) addMini(g, clamp(bs.x - MINI_W / 2 + (k - 2.5) * 18, 2, PW - MINI_W - 2), bs.y + 14 + (k % 2) * 8, (k - 2.5) * 22, 26 + (k % 3) * 4);
        bumpStreak(g);
      }
      continue;
    }
    for (const c of g.cards) {
      if (c.state !== 'fall') continue;
      if (bo.x + 2 > c.x && bo.x < c.x + c.w && bo.y < c.y + c.h && bo.y + 6 > c.y) {
        bo.y = -99;
        c.hp--;
        if (c.hp > 0) {
          c.flash = 0.1;
          c.y -= 4;
          fx.burst(bo.x, c.y + c.h, ['#ffffff', '#ffe27a'], 5, 30, 60, 0.3);
          fx.pop(c.x + c.w / 2, Math.max(16, c.y - 4), 'TOUGH ONE!', '#ffe27a');
          sfx.bossHit();
        } else killCard(g, c);
        break;
      }
    }
    for (const l of g.links) {
      if (Math.abs(bo.x - l.x) < 6 && Math.abs(bo.y - l.y) < 5) {
        bo.y = -99;
        l.y = 999;
        fx.burst(l.x, l.y, ['#ff7a5a', '#ffd0c0'], 6, 30, 40, 0.3);
        fx.pop(l.x, SHIP_Y - 50, 'LINK BLOCKED', '#9ad8ff');
        sfx.ping();
      }
    }
  }
  g.bolts = g.bolts.filter((bo) => bo.y > 4);

  // ---- links ----
  for (const l of g.links) {
    l.y += l.vy * dt;
    l.ph += dt;
    l.x += Math.sin(l.ph * 6) * 8 * dt;
    if (g.stun <= 0 && l.y > SHIP_Y - 5 && l.y < SHIP_Y + 10 && Math.abs(l.x - g.shipX) < 9) {
      l.y = 999;
      g.st.linksClicked++;
      g.stun = 0.8;
      fx.pop(g.shipX, SHIP_Y - 24, 'YOU CLICKED A LINK!', '#ff7a5a');
      fx.blink('#9a4ac0', 0.4);
      fx.kick(3);
      sfx.glitch();
      breakStreak(g);
    }
  }
  g.links = g.links.filter((l) => l.y < DOCK_Y + 4);

  // ---- end ----
  const bossDone = g.boss?.state === 'dead';
  if (g.si >= g.sched.length && bossDone && !g.cards.length) endGame(g, 'clear');
  else if (g.playT >= GAME_LEN) {
    if (g.boss && g.boss.state !== 'dead') {
      g.st.scamsMissed += 3;
      lesson(g, 'CHAIN LETTER');
      endGame(g, 'spread');
    } else endGame(g, 'time');
  }
}

// ---------- drawing ----------
function drawCard(x: Ctx, c: Card, t: number, rm: boolean): void {
  const spr = spriteOf(c);
  const px = Math.round(c.x);
  let py = Math.round(c.y);
  if (c.state === 'dying') {
    // glitch: horizontal slices jump around, with a red/cyan ghost
    const slices = 5;
    const sh = Math.ceil((c.h + 2) / slices);
    for (let i = 0; i < slices; i++) {
      const off = rm ? 0 : Math.round(rnd(-4, 4));
      x.globalAlpha = 0.5;
      x.drawImage(spr, 0, i * sh, c.w + 2, sh, px + off - 2, py + i * sh, c.w + 2, sh);
      x.globalAlpha = 1;
      x.drawImage(spr, 0, i * sh, c.w + 2, sh, px + off, py + i * sh, c.w + 2, sh);
    }
    x.globalAlpha = 0.35;
    rect(x, px, py, c.w, c.h, c.scam ? '#ff3a6a' : '#3affd0');
    x.globalAlpha = 1;
    return;
  }
  if (c.state === 'landing') {
    if (!c.scam) {
      // shrink down into the dock
      const k = Math.min(1, c.dieT / 0.45);
      const w = Math.round((c.w + 2) * (1 - k * 0.8));
      const h = Math.round((c.h + 2) * (1 - k * 0.8));
      x.drawImage(spr, Math.round(c.x + c.w / 2 - w / 2), Math.round(DOCK_Y - h + k * 12), w, h);
      return;
    }
    py = DOCK_Y - c.h + (Math.floor(t * 20) % 2);
    x.drawImage(spr, px + (rm ? 0 : Math.round(rnd(-1, 1))), py);
    return;
  }
  if (c.rush && c.y > 40 && !rm) py += Math.floor(t * 30) % 2;
  x.drawImage(spr, px, py);
  if (c.flash > 0) {
    x.globalAlpha = 0.7;
    rect(x, px, py, c.w, c.h, '#ffffff');
    x.globalAlpha = 1;
  }
  if (c.rush && c.y > 30) {
    // urgency lines
    const k = Math.floor(t * 12) % 2;
    rect(x, px - 3, py + 4 + k, 2, 1, '#ff7a5a');
    rect(x, px + c.w + 1, py + 10 - k, 2, 1, '#ff7a5a');
  }
}

function draw(x: Ctx, g: G, touch: boolean): void {
  const { fx } = g;
  const [ox, oy] = fx.offset();
  x.save();
  x.translate(ox, oy);
  drawField(x, g.t, fx.rm, g.lean);
  // boss
  const b = g.boss;
  if (b && b.state !== 'dead') {
    const spr = bossSprite(Math.floor(g.t * 4), 1 - b.hp / BOSS_HP);
    x.drawImage(spr, Math.round(b.x - BOSS_W / 2), Math.round(b.y));
    if (b.flash > 0.04) {
      x.globalAlpha = 0.3;
      rect(x, b.x - BOSS_W / 2 + 3, b.y + 3, BOSS_W - 6, BOSS_H - 6, '#ffffff');
      x.globalAlpha = 1;
    }
    // chains dangling off the corners (it's a chain letter, after all)
    for (const side of [-1, 1]) {
      const ax = b.x + side * (BOSS_W / 2 - 10);
      for (let k = 0; k < 4; k++) {
        const sw = Math.sin(g.t * 3 + k * 0.6 + side) * k * 1.2;
        const lx = Math.round(ax + sw);
        const ly = Math.round(b.y + BOSS_H - 1 + k * 4);
        rect(x, lx - 2, ly - 1, 5, 5, INK);
        rect(x, lx - 1, ly, 3, 3, k % 2 ? '#c8ccd8' : '#f2b632');
        rect(x, lx, ly + 1, 1, 1, INK);
      }
    }
    // HP bar
    const bw = 80;
    const hy = Math.round(b.y) - 4;
    rect(x, b.x - bw / 2 - 1, hy, bw + 2, 4, INK);
    rect(x, b.x - bw / 2, hy + 1, Math.round((bw * b.hp) / BOSS_HP), 2, '#ff5a4a');
    rect(x, b.x - bw / 2, hy + 1, Math.round((bw * b.hp) / BOSS_HP), 1, '#ffb0a0');
  }
  for (const c of g.cards) drawCard(x, c, g.t, fx.rm);
  for (const l of g.links) drawLink(x, l.x, l.y, g.t);
  for (const bo of g.bolts) drawBolt(x, bo.x, bo.y);
  drawDock(x, g.saved, g.alarm, g.t);
  if (g.phase !== 'report') drawShip(x, g.shipX, g.t, g.lean, g.muzzle, g.stun, fx.rm);
  fx.drawWorld(x);
  x.restore();
  drawGlare(x);
  const clock = `12:${String(7 + Math.floor(g.playT / 10)).padStart(2, '0')}`;
  const sc = g.st.scamsHit + g.st.scamsMissed;
  drawStatusBar(x, clock, g.unread, sc ? 1 - g.st.scamsMissed / Math.max(4, sc) : 1);
  if (g.stun > 0 && !fx.rm) {
    // glitchy screen while you're "phished"
    for (let i = 0; i < 4; i++) {
      x.globalAlpha = 0.25;
      rect(x, 0, rnd(10, PH - 20), PW, rnd(1, 4), pick(['#ff3a6a', '#3affd0', '#ffffff']));
    }
    x.globalAlpha = 1;
  }
  fx.drawTop(x);
  // streak meter by the ship
  if (g.streak >= 2 && g.phase === 'play') {
    const s = `x${g.streak}`;
    ptext(x, s, clamp(g.shipX + 12, 2, PW - ptw(s) - 2), SHIP_Y + 2, g.streak >= 5 ? '#ff9af0' : '#7cf08a');
  }
  if (g.announce && g.announce.t > 0) {
    const a = g.announce;
    bigText(x, a.s, PW / 2, 118, ptw(a.s) * 3 > PW - 8 ? 2 : a.t > 1.05 ? 3 : 2, a.c, INK, '#ffffff');
  }
  if (g.banner && g.banner.t > 0 && g.phase === 'play') {
    const bn = g.banner;
    const blink = bn.head === 'WARNING!' && Math.floor(g.t * 6) % 2;
    x.globalAlpha = 0.8;
    rect(x, 0, 88, PW, 30, '#0c0816');
    x.globalAlpha = 1;
    rect(x, 0, 88, PW, 1, bn.c);
    rect(x, 0, 117, PW, 1, bn.c);
    if (!blink) bigText(x, bn.head, PW / 2, 98, 3, bn.c, INK, '#ffffff');
    centered(x, bn.sub, PW / 2, 108, '#f4eedd', null);
  }
  if (g.phase === 'count') drawCount(x, g.pt, PW, PH, touch ? 'DRAG TO MOVE, TAP TO FIRE' : 'ARROWS MOVE, SPACE FIRES');
  if (g.phase === 'count' && g.pt > 0.2) {
    centered(x, 'SHOOT THE SCAMS', PW / 2, 172, '#ff9a7a');
    centered(x, 'LET REAL MESSAGES LAND', PW / 2, 181, '#7cf08a');
  }
  if (g.phase === 'end') {
    const s = phishScore(g.st);
    const head = s >= 0.75 ? 'INBOX CLEAN!' : s >= 0.45 ? 'MOSTLY CLEAN' : 'PHISHED!';
    const scams = g.st.scamsHit + g.st.scamsMissed;
    const reals = g.st.realSaved + g.st.realShot;
    drawBanner(x, head, `${g.st.scamsHit}/${scams} SCAMS · ${g.st.realSaved}/${reals} REAL`, s >= 0.6, g.pt, PW, PH);
  }
  if (g.phase === 'report') drawReport(x, g, touch);
}

const reportReady = (g: G): boolean => g.phase === 'report' && g.pt > 1.4;

function drawReport(x: Ctx, g: G, touch: boolean): void {
  x.globalAlpha = 0.75;
  rect(x, 0, 0, PW, PH, '#0c0816');
  x.globalAlpha = 1;
  const w = 156;
  const h = 124;
  const px = Math.round(PW / 2 - w / 2);
  const k = Math.min(1, g.pt / 0.3);
  const py = Math.round(PH - (PH - 40) * (1 - Math.pow(1 - k, 3)));
  rect(x, px - 1, py - 1, w + 2, h + 2, INK);
  rect(x, px, py, w, h, '#fbf6ea');
  rect(x, px, py, w, 12, '#3f6fd0');
  rect(x, px, py, w, 1, '#8aa8f0');
  centered(x, 'SECURITY REPORT', PW / 2, py + 4, '#ffffff', null);
  const s = g.st;
  const scams = s.scamsHit + s.scamsMissed;
  const reals = s.realSaved + s.realShot;
  const rows: [string, string, string][] = [
    ['SCAMS BLOCKED', `${s.scamsHit}/${scams}`, '#2f9a5a'],
    ['GOT THROUGH', `${s.scamsMissed}`, s.scamsMissed ? '#c0392b' : '#2f9a5a'],
    ['REAL ONES READ', `${s.realSaved}/${reals}`, '#2f9a5a'],
    ['REAL ONES SHOT', `${s.realShot}`, s.realShot ? '#c0392b' : '#2f9a5a'],
    ['LINKS CLICKED', `${s.linksClicked}`, s.linksClicked ? '#c0392b' : '#2f9a5a'],
    ['BEST STREAK', `${g.best}`, '#3a2e4a'],
  ];
  rows.forEach(([l, r, c], i) => {
    if (g.pt < 0.35 + i * 0.1) return;
    const y = py + 17 + i * 9;
    ptext(x, l, px + 7, y, '#3a2e4a');
    ptext(x, r, px + w - 7 - ptw(r), y, c);
  });
  if (g.pt > 1) {
    const y0 = py + 17 + rows.length * 9 + 3;
    for (let i = px + 7; i < px + w - 7; i += 3) rect(x, i, y0, 2, 1, '#9a8aa8');
    ptext(x, 'RED FLAGS TO REMEMBER:', px + 7, y0 + 5, '#7a6f86');
    const top = [...g.lessons.entries()].filter(([w2]) => !w2.startsWith('REAL')).sort((a, b2) => b2[1] - a[1]).slice(0, 3);
    const tips = top.length ? top.map(([w2]) => w2) : ['WEIRD LINKS', 'FAKE DOMAINS', 'URGENCY'];
    tips.forEach((tp, i) => ptext(x, `* ${tp}`, px + 9, y0 + 13 + i * 7, '#c0392b'));
  }
  if (g.pt > 1.2) {
    const sc = phishScore(s);
    const good = sc >= 0.6;
    x.save();
    x.translate(px + w - 30, py + h - 16);
    x.rotate(-0.22);
    rect(x, -24, -7, 48, 14, good ? '#2f9a5a' : '#c0392b');
    rect(x, -22, -5, 44, 10, '#fbf6ea');
    centered(x, sc >= 0.75 ? 'SECURE' : sc >= 0.45 ? 'SO-SO' : 'PHISHED', 0, -2, good ? '#2f9a5a' : '#c0392b', null);
    x.restore();
  }
  if (reportReady(g) && Math.floor(g.t * 2) % 2 === 0) centered(x, touch ? 'TAP TO FINISH' : 'SPACE OR CLICK TO FINISH', PW / 2, py + h + 6, '#ffffff');
}

export function Phishing({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const touch = useMemo(() => isCoarse(), []);
  const game = useRef<G | null>(null);
  if (!game.current) game.current = newGame(s, reducedMotion);
  const [hud, setHud] = useState({ hit: 0, missed: 0, saved: 0, shot: 0 });
  const hudKey = useRef('');

  const finish = (g: G): void => {
    if (g.sent) return;
    g.sent = true;
    const st = g.st;
    onDone({ score: phishScore(st), stats: { scamsHit: st.scamsHit, scamsMissed: st.scamsMissed, realShot: st.realShot, realSaved: st.realSaved, linksClicked: st.linksClicked } });
  };

  useLoop(
    (dt) => {
      const g = game.current!;
      const { fx } = g;
      g.t += dt;
      g.pt += dt;
      fx.update(dt);
      if (g.announce) g.announce.t -= dt;
      if (g.banner) g.banner.t -= dt;
      if (g.phase === 'count') {
        if (g.pt < 0.05) soundInit();
        const lab = countLabel(g.pt);
        if (lab !== g.lastLabel) {
          g.lastLabel = lab;
          if (lab === 'GO!') cue.go();
          else if (lab) cue.tick();
        }
        if (g.pt >= COUNT_TIME) g.phase = 'play';
      } else if (g.phase === 'play') {
        if (fx.hitstop > 0) fx.hitstop -= dt;
        else step(g, dt, input);
      } else if (g.phase === 'end') {
        // let the last bits settle
        for (const c of g.cards) if (c.state !== 'fall') c.dieT += dt;
        if (g.pt > 2.2) {
          g.phase = 'report';
          g.pt = 0;
          beep(note(30), 0.05, 'square', 0.05);
        }
      } else if (g.phase === 'report') {
        if ((reportReady(g) && input.pressed.has('action')) || g.pt > 9) finish(g);
      }
      const st = g.st;
      const key = `${st.scamsHit}|${st.scamsMissed}|${st.realSaved}|${st.realShot}`;
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud({ hit: st.scamsHit, missed: st.scamsMissed, saved: st.realSaved, shot: st.realShot });
      }
      const x = ctxOf(canvas.current);
      if (x) draw(x, g, touch);
    },
    true,
    input,
  );

  return (
    <div className="mini ph-mini">
      <MiniHud
        items={[
          { label: 'Scams blocked', value: hud.hit },
          { label: 'Got through', value: hud.missed, warn: hud.missed > 0 },
          { label: 'Real read', value: hud.saved },
          { label: 'Real shot', value: hud.shot, warn: hud.shot > 0 },
        ]}
      />
      <div className="ph-canvas" style={{ '--ar': String(PW / PH) } as CSSProperties}>
        <PixelCanvas
          canvasRef={canvas}
          width={PW}
          height={PH}
          onPointer={(px, _py, kind) => {
            const g = game.current!;
            if (g.phase === 'report') {
              if (kind === 'down' && reportReady(g)) finish(g);
              return;
            }
            if (kind === 'down') {
              soundInit();
              g.dragging = true;
              g.target = px;
              fire(g);
            } else if (kind === 'move' && g.dragging) g.target = px;
            else if (kind === 'up') {
              g.dragging = false;
              g.target = null;
            }
          }}
        />
      </div>
      <div className="ph-pad">
        <TouchPad
          input={input}
          keys={[
            { key: 'left', label: '◀' },
            { key: 'action', label: 'FIRE', wide: true },
            { key: 'right', label: '▶' },
          ]}
        />
      </div>
      <p className="mini-note ph-keys">← → or A/D to move · SPACE fires (hold for auto) · read the sender and the link before you shoot</p>
    </div>
  );
}

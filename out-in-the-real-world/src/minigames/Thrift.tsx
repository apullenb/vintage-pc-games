// Thrift Hunt: this game's take on the old hunting trip. Roam a thrift store, a flea market or a
// street of garage sales; the good deals have legs (literally) and scurry off to hide behind racks
// while rival bargain hunters chase them. Aim your pricing gun and tag a find to buy it. Every tag
// spends from a fixed budget (your "bullets"), you can only haul so many pounds home, and the junk
// (stains, bedbugs, missing legs) just sits there waiting to waste your money.
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { HAIRS, playerPerson, SKINS, type Person } from '../art/people.ts';
import { INK, rect, type Ctx } from '../art/px.ts';
import { ctxOf, MiniHud, PixelCanvas, useInput, useLoop, type MiniProps } from './kit.tsx';
import { drawForeground, drawGun, drawItem, drawPriceTag, drawProp, drawReticle, drawSky, drawTagShot, drawTooltip, drawWalker, itemBox, itemDim, lightLayer, propBox, propShadow, worldLayer } from './thriftArt.ts';
import { buildGrid, findPath, FLOOR_Y, goalOf, GW, hideSpots, makeMap, priceFor, scoreHunt, WH, WW, type GoalDef, type Haul, type ItemDef, type MapDef, type Need } from './thriftData.ts';
import { beep, bigText, centered, clamp, COUNT_TIME, countLabel, cue, drawBanner, drawCount, Fx, note, noise, outlined, pick, ptext, ptw, rnd, shuffle, soundInit } from './thriftPhishFx.ts';
import { ThriftStick, type StickState } from './thriftStick.tsx';
import './thrift.css';

const TIME = 65;
const SPEED = 74;
const SHOT_SPEED = 290;
const COOLDOWN = 0.3;
const RANGE = 108; // how far the tag gun reaches
const REVEAL = [0, 6, 16]; // seconds after GO when each item on your list first rolls out

const sfx = {
  fire: () => {
    beep(note(38), 0.05, 'square', 0.07, note(30));
    noise(0.04, 0.12, 5000);
  },
  kaching: () => {
    noise(0.06, 0.18, 6000, 0, 'highpass');
    beep(note(40), 0.08, 'triangle', 0.13, note(40), 0.03);
    beep(note(47), 0.22, 'triangle', 0.13, note(47), 0.1);
  },
  thunk: () => noise(0.08, 0.25, 500),
  hey: () => {
    beep(note(18), 0.08, 'sawtooth', 0.06, note(22));
    noise(0.1, 0.25, 350);
  },
  snatched: () => [5, 2, -3].forEach((s, i) => beep(note(16 + s), 0.1, 'square', 0.07, note(16 + s), i * 0.08)),
  bell: () => {
    beep(note(43), 0.18, 'triangle', 0.1);
    beep(note(43), 0.25, 'triangle', 0.1, note(43), 0.2);
  },
  nope: () => beep(110, 0.18, 'square', 0.06, 90),
  chirp: () => beep(note(45), 0.04, 'square', 0.04, note(52)),
  drop: () => beep(note(26), 0.12, 'triangle', 0.1, note(38)),
};

type FindState = 'enter' | 'idle' | 'dart' | 'rest' | 'hide';
interface Find {
  id: number;
  def: ItemDef;
  price: number;
  x: number;
  y: number;
  state: FindState;
  timer: number;
  path: [number, number][];
  phase: number;
  face: -1 | 1;
  alarm: number;
  seed: number;
  pop: number; // spawn pop-in
  gone: boolean;
  hidden: boolean; // fully behind a prop this frame
}
interface Rival {
  p: Person;
  x: number;
  y: number;
  state: 'enter' | 'hunt' | 'leave' | 'gone';
  target: Find | null;
  carrying: Find | null;
  path: [number, number][];
  repath: number;
  phase: number;
  face: -1 | 1;
  stun: number;
  speed: number;
  respawn: number;
  moving: boolean;
  inspect: number; // > 0 while looking a find over before grabbing it
}
interface Shot {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  len: number; // distance to the aim point
  maxD: number; // the tag drops after this far
  want: Find | null; // aimed right at a find: other finds don't catch the tag
  d0: number; // depth (ground y) at the gun
  d1: number; // depth at the aim point
  spin: number;
}
interface Flyer {
  def: ItemDef;
  x: number;
  y: number;
  t: number;
  seed: number;
}

type Phase = 'count' | 'play' | 'end' | 'receipt';
interface G {
  phase: Phase;
  vw: number; // view size in logical pixels
  vh: number;
  me: Person;
  pt: number;
  t: number;
  time: number;
  goal: GoalDef;
  budget: number;
  map: MapDef;
  mapKey: string;
  grid: Uint8Array;
  hides: [number, number][];
  px: number;
  py: number;
  face: -1 | 1;
  walk: number;
  moving: boolean;
  aimX: number; // world coords
  aimY: number;
  aimMode: 'mouse' | 'auto';
  lock: Find | null;
  cool: number;
  kick: number;
  money: number;
  lbs: number;
  haul: Haul[];
  finds: Find[];
  rivals: Rival[];
  shots: Shot[];
  flyers: Flyer[];
  fx: Fx;
  streak: number;
  bestStreak: number;
  snatched: number;
  stockT: number;
  order: Need[]; // the order your list's items roll out
  revealed: number;
  noteCool: number;
  nextId: number;
  camX: number;
  camY: number;
  endReason: 'done' | 'time' | 'broke' | null;
  lastLabel: string | null;
  lastSec: number;
  sent: boolean;
  announce: { s: string; c: string; t: number } | null;
  hint: { s: string; t: number } | null;
  chirpT: number;
}

const RIVAL_LOOK = (): Person => ({
  skin: pick(SKINS),
  hair: pick(HAIRS),
  style: Math.floor(Math.random() * 9),
  shirt: pick(['#c86a3a', '#6a7ab8', '#8a5ab0', '#4a9a7a', '#d8a03a', '#b84a6a']),
  pants: pick(['#3a3a4a', '#4a3a2a', '#2f3a5c', '#5a5a62']),
  glasses: Math.random() < 0.35,
  hat: Math.random() < 0.3 ? 'cap' : undefined,
  hatColor: pick(['#c0392b', '#2e6e4a', '#3f7fd8']),
  scarf: Math.random() < 0.25 ? pick(['#e0503c', '#f2b632']) : undefined,
});

const COMBO = ['', '', 'DOUBLE DEAL!', 'TRIPLE STEAL!', 'BARGAIN BEAST!', 'THRIFT LEGEND!'];
const NEED_WORD: Record<Need, string> = { bed: 'BED', table: 'TABLE', seat: 'SEATING', coat: 'COAT', top: 'WORK TOP', pants: 'WORK PANTS' };

function isCoarse(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function newGame(s: MiniProps['s'], data: MiniProps['data'], rm: boolean): G {
  const goal = goalOf(data);
  const budget = Math.max(20, Math.round(Number(data.budget ?? goal.baseBudget)) || goal.baseBudget);
  // phones get a squarer, closer view (bigger sprites); wide screens see more of the floor
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const vw = narrow ? 184 : 240;
  const vh = narrow ? 176 : 160;
  const theme = data.theme === 'thrift' || data.theme === 'flea' || data.theme === 'yard' ? data.theme : undefined;
  const map = makeMap(Math.random, theme);
  const mapKey = `${map.theme}-${Math.floor(Math.random() * 1e9)}`;
  const grid = buildGrid(map.props);
  const g: G = {
    phase: 'count',
    me: playerPerson(s.look),
    pt: 0,
    t: 0,
    time: TIME,
    goal,
    budget,
    map,
    mapKey,
    grid,
    hides: hideSpots(grid, map.props),
    px: map.start[0],
    py: map.start[1],
    face: 1,
    walk: 0,
    moving: false,
    aimX: map.start[0],
    aimY: map.start[1] - 50,
    aimMode: 'auto', // locks onto the nearest find until the mouse moves (keyboard-only and touch players)
    lock: null,
    cool: 0,
    kick: 0,
    money: budget,
    lbs: 0,
    haul: [],
    finds: [],
    rivals: [],
    shots: [],
    flyers: [],
    fx: new Fx(rm, vw, vh),
    vw,
    vh,
    streak: 0,
    bestStreak: 0,
    snatched: 0,
    stockT: 24,
    order: shuffle(goal.needs.map((n) => n.need)),
    revealed: 1,
    noteCool: 0,
    nextId: 1,
    camX: (WW - vw) / 2,
    camY: WH - vh,
    endReason: null,
    lastLabel: null,
    lastSec: 99,
    sent: false,
    announce: null,
    hint: null,
    chirpT: 0,
  };
  // opening stock: the first thing on your list, a couple of extras, three pieces of junk (the rest rolls out later)
  spawnFind(g, pick(goal.items.filter((i) => i.need === g.order[0])), false);
  const extras = goal.items.filter((i) => i.kind === 'extra');
  spawnFind(g, pick(extras), false);
  if (Math.random() < 0.6) spawnFind(g, pick(extras), false);
  const junk = goal.items.filter((i) => i.kind === 'junk');
  for (const j of junk.sort(() => Math.random() - 0.5).slice(0, 3)) spawnFind(g, j, false);
  return g;
}

function openSpot(g: G, minDistFromPlayer: number): [number, number] {
  for (let k = 0; k < 80; k++) {
    const x = rnd(14, WW - 14);
    const y = rnd(FLOOR_Y + 14, WH - 14);
    const i = Math.floor(x / 8);
    const j = Math.floor(y / 8);
    if (g.grid[j * GW + i]) continue;
    if (Math.hypot(x - g.px, y - g.py) < minDistFromPlayer) continue;
    if (g.finds.some((f) => !f.gone && Math.hypot(f.x - x, f.y - y) < 22)) continue;
    return [x, y];
  }
  return [WW / 2, FLOOR_Y + 30];
}

function spawnFind(g: G, def: ItemDef, fromDoor: boolean): void {
  const [x, y] = fromDoor ? [g.map.door[0] + rnd(-20, 20), g.map.door[1] - 4] : openSpot(g, 46);
  const f: Find = { id: g.nextId++, def, price: priceFor(def, g.goal, g.budget), x, y, state: fromDoor ? 'enter' : 'idle', timer: rnd(0.5, 2), path: [], phase: 0, face: 1, alarm: 0, seed: Math.floor(Math.random() * 100), pop: 0.35, gone: false, hidden: false };
  if (fromDoor) {
    const [tx, ty] = openSpot(g, 30);
    f.path = findPath(g.grid, x, y, tx, ty);
  }
  g.finds.push(f);
}

const live = (g: G): Find[] => g.finds.filter((f) => !f.gone);
const metNeeds = (g: G): Set<Need> => new Set(g.haul.filter((h) => h.def.kind === 'need').map((h) => h.def.need!));

function blocked(g: G, x: number, y: number): boolean {
  if (y < FLOOR_Y + 4 || y > WH - 2 || x < 5 || x > WW - 5) return true;
  for (const p of g.map.props) if (x + 5 > p.x && x - 5 < p.x + p.w && y > p.y - 1 && y - 3 < p.y + p.h) return true;
  return false;
}
// Move with axis-separated sliding against props.
function slide(g: G, o: { x: number; y: number }, dx: number, dy: number): void {
  if (!blocked(g, o.x + dx, o.y)) o.x += dx;
  if (!blocked(g, o.x, o.y + dy)) o.y += dy;
}
// Follow a waypoint path; returns true when it's done.
function follow(o: { x: number; y: number; path: [number, number][]; face: -1 | 1; phase: number }, speed: number, dt: number): boolean {
  if (!o.path.length) return true;
  const [tx, ty] = o.path[0];
  const dx = tx - o.x;
  const dy = ty - o.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (d <= step) {
    o.x = tx;
    o.y = ty;
    o.path.shift();
  } else {
    o.x += (dx / d) * step;
    o.y += (dy / d) * step;
  }
  if (Math.abs(dx) > 0.5) o.face = dx > 0 ? 1 : -1;
  o.phase += dt * speed * 0.16;
  return !o.path.length;
}

// Is a find fully tucked behind a prop (so you can't see it or its tag)?
function occluded(g: G, f: Find): boolean {
  const b = itemBox(f.def, f.x, f.y);
  for (const p of g.map.props) {
    if (p.y + p.h <= f.y) continue;
    const v = propBox(p);
    if (b.x >= v.x - 1 && b.x + b.w <= v.x + v.w + 1 && b.y >= v.y - 2 && b.y + b.h <= v.y + v.h + 4) return true;
  }
  return false;
}

// What's under a world point, front-most first: a find, a rival or a prop.
type Hit = { k: 'find'; f: Find; depth: number } | { k: 'rival'; r: Rival; depth: number } | { k: 'prop'; depth: number };
function pickAt(g: G, x: number, y: number, depth?: number, want: Find | null = null, tol = 14): Hit | null {
  let best: Hit | null = null;
  const consider = (h: Hit): void => {
    if (depth !== undefined && h.k !== 'prop' && Math.abs(h.depth - depth) > tol) return;
    if (!best || h.depth > best.depth) best = h;
  };
  for (const f of g.finds) {
    if (f.gone || (want && f !== want)) continue;
    const b = itemBox(f.def, f.x, f.y);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) consider({ k: 'find', f, depth: f.y });
  }
  for (const r of g.rivals) {
    if (r.state === 'gone') continue;
    if (x >= r.x - 7 && x <= r.x + 7 && y >= r.y - 30 && y <= r.y) consider({ k: 'rival', r, depth: r.y });
  }
  for (const p of g.map.props) {
    const v = propBox(p);
    const foot = p.y + p.h;
    if (x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h) {
      if (depth !== undefined && (depth < p.y - 5 || depth > foot + 6)) continue;
      consider({ k: 'prop', depth: foot });
    }
  }
  return best;
}

function gunPos(g: G): [number, number] {
  return [g.px + g.face * 7, g.py - 13];
}

function fire(g: G, tx: number, ty: number): void {
  if (g.phase !== 'play' || g.cool > 0) return;
  const [ox, oy] = gunPos(g);
  const dx = tx - ox;
  const dy = ty - oy;
  const len = Math.hypot(dx, dy);
  if (len < 3) return;
  const target = pickAt(g, tx, ty);
  const d1 = target ? target.depth : ty + 12;
  g.shots.push({ x: ox, y: oy, ox, oy, vx: (dx / len) * SHOT_SPEED, vy: (dy / len) * SHOT_SPEED, len, maxD: Math.min(len * 1.35, RANGE), want: target && target.k === 'find' ? target.f : null, d0: g.py, d1, spin: 0 });
  g.cool = COOLDOWN;
  g.kick = 2;
  if (Math.abs(dx) > 2) g.face = dx > 0 ? 1 : -1;
  g.fx.spray(ox + (dx / len) * 6, oy + (dy / len) * 6, ['#fff3c4', '#f2b632'], 3, (dx / len) * 40, (dy / len) * 40, 15, 0, 0.15);
  sfx.fire();
}

function tagFind(g: G, f: Find): void {
  const { fx } = g;
  const sx = f.x - g.camX;
  const sy = Math.max(44, f.y - g.camY - 20); // keep pop-ups clear of the top HUD
  if (f.price > g.money) {
    if (g.noteCool <= 0) fx.pop(sx, sy, `CAN'T AFFORD $${f.price}`, '#ff9a7a');
    g.noteCool = 0.7;
    sfx.nope();
    return;
  }
  if (g.lbs + f.def.lbs > g.goal.carry) {
    if (g.noteCool <= 0) fx.pop(sx, sy, `TOO HEAVY! ${f.def.lbs} LBS`, '#ff9a7a');
    g.noteCool = 0.7;
    sfx.nope();
    g.hint = { s: `${g.goal.haul} IS FULL: ${g.goal.carry} LBS MAX`, t: 2.5 };
    return;
  }
  const had = metNeeds(g);
  const sniped = g.rivals.some((r) => r.state === 'hunt' && r.target === f && Math.hypot(r.x - f.x, r.y - f.y) < 30);
  f.gone = true;
  g.money -= f.price;
  g.lbs += f.def.lbs;
  g.haul.push({ def: f.def, price: f.price });
  g.flyers.push({ def: f.def, x: f.x, y: f.y, t: 0, seed: f.seed });
  fx.stop(0.06);
  if (f.def.kind === 'junk') {
    g.streak = 0;
    fx.kick(4);
    fx.blink('#ff3a2a', 0.3);
    fx.burst(f.x, f.y - 6, ['#8a6a2a', '#3a0e0e', '#9ac83a'], 14, 50);
    fx.pop(sx, sy - 8, `JUNK! -$${f.price}`, '#ff7a5a', true);
    fx.pop(sx, sy + 6, f.def.flag ?? 'JUNK', '#ffb0a0');
    cue.wrong();
    return;
  }
  const dup = f.def.kind === 'need' && had.has(f.def.need!);
  g.streak++;
  g.bestStreak = Math.max(g.bestStreak, g.streak);
  fx.kick(2);
  fx.ring(f.x, f.y - 6, '#ffe27a', 16);
  fx.burst(f.x, f.y - 6, ['#ffe27a', '#ffffff', '#7cf08a', '#f2b632'], 18, 60);
  sfx.kaching();
  if (g.streak >= 2) {
    g.announce = { s: COMBO[Math.min(COMBO.length - 1, g.streak)], c: g.streak >= 4 ? '#ff9af0' : '#7cf08a', t: 1.3 };
    cue.combo(g.streak);
  }
  const save = Math.round(f.def.retail * (f.price / Math.max(1, f.def.price)) - f.price);
  if (f.def.kind === 'need' && !dup) {
    fx.pop(sx, sy - 8, `${NEED_WORD[f.def.need!]} ✓`, '#7cf08a', true);
    fx.pop(sx, sy + 6, `SAVED $${save}!`, '#fff3c4');
  } else if (dup) {
    fx.pop(sx, sy, `ALREADY HAVE A ${NEED_WORD[f.def.need!]}`, '#ffd27a');
  } else {
    fx.pop(sx, sy, `NICE FIND! SAVED $${save}`, '#fff3c4');
  }
  if (sniped) fx.pop(sx, sy + 16, 'SNIPED IT!', '#9ad8ff');
}

function hitRival(g: G, r: Rival): void {
  const { fx } = g;
  r.stun = 1.4;
  r.inspect = 0;
  fx.kick(1.5);
  fx.burst(r.x, r.y - 22, ['#ffffff', '#ffe27a'], 8, 40);
  fx.pop(r.x - g.camX, r.y - g.camY - 34, pick(['HEY!', 'RUDE!', 'WATCH IT!', 'OW!']), '#ffd0a0');
  sfx.hey();
  if (r.carrying) {
    // they drop the deal they snatched
    const f = r.carrying;
    r.carrying = null;
    f.gone = false;
    f.x = r.x + 8;
    f.y = Math.min(WH - 6, r.y + 4);
    if (blocked(g, f.x, f.y)) f.x = r.x;
    f.state = 'rest';
    f.timer = 1.2;
    f.alarm = 1;
    f.path = [];
    g.finds.push(f);
    fx.pop(r.x - g.camX, r.y - g.camY - 24, 'DROPPED IT!', '#7cf08a');
    sfx.drop();
    r.state = 'leave';
    r.path = findPath(g.grid, r.x, r.y, g.map.door[0], g.map.door[1]);
  }
}

function startDart(g: G, f: Find): void {
  const threats: [number, number][] = [[g.px, g.py], ...g.rivals.filter((r) => r.state === 'hunt').map((r) => [r.x, r.y] as [number, number])];
  let best: [number, number] | null = null;
  let bestScore = -1e9;
  const cands = [...g.hides, ...Array.from({ length: 5 }, () => [rnd(14, WW - 14), rnd(FLOOR_Y + 12, WH - 12)] as [number, number])];
  for (const c of cands) {
    const d = Math.hypot(c[0] - f.x, c[1] - f.y);
    if (d < 24 || d > 150) continue;
    let s = 0;
    for (const [tx, ty] of threats) s += Math.min(120, Math.hypot(c[0] - tx, c[1] - ty));
    s += rnd(0, 30);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (!best) return;
  const path = findPath(g.grid, f.x, f.y, best[0], best[1]);
  if (!path.length) return;
  f.path = path;
  f.state = 'dart';
  f.timer = rnd(1.0, 1.5);
  f.alarm = 0.7;
  if (g.chirpT <= 0) {
    sfx.chirp();
    g.chirpT = 0.5;
  }
}

function stepFinds(g: G, dt: number): void {
  for (const f of g.finds) {
    if (f.gone) continue;
    f.pop = Math.max(0, f.pop - dt);
    f.alarm = Math.max(0, f.alarm - dt);
    const alive = f.def.kind !== 'junk';
    if (!alive) continue;
    const dp = Math.hypot(f.x - g.px, f.y - g.py);
    let dr = 999;
    for (const r of g.rivals) if (r.state === 'hunt' && r.stun <= 0) dr = Math.min(dr, Math.hypot(f.x - r.x, f.y - r.y));
    const skittish = f.def.kind === 'need' ? 1 : 0.6;
    const spd = (f.def.kind === 'need' ? 86 : 54) * (0.9 + g.t / TIME / 4);
    f.timer -= dt;
    switch (f.state) {
      case 'enter':
        if (follow(f, 40, dt)) {
          f.state = 'idle';
          f.timer = rnd(0.6, 1.5);
        }
        break;
      case 'idle':
        if ((dp < 54 * skittish + 6 || dr < 30) && f.timer < 1) startDart(g, f);
        else if (f.timer <= 0) {
          if (!f.path.length) {
            const tx = clamp(f.x + rnd(-30, 30), 14, WW - 14);
            const ty = clamp(f.y + rnd(-20, 20), FLOOR_Y + 12, WH - 12);
            f.path = findPath(g.grid, f.x, f.y, tx, ty).slice(0, 4);
          }
          f.timer = rnd(1.2, 2.6);
        }
        if (f.path.length) follow(f, 16, dt);
        break;
      case 'dart':
        if (follow(f, spd, dt) || f.timer <= 0) {
          const atHide = g.hides.some(([hx, hy]) => Math.hypot(hx - f.x, hy - f.y) < 6);
          f.state = atHide ? 'hide' : 'rest';
          f.timer = atHide ? rnd(1.6, 2.6) : rnd(0.9, 1.5);
          f.path = [];
        }
        break;
      case 'rest':
      case 'hide':
        if (f.timer <= 0) {
          f.state = 'idle';
          f.timer = 0.8;
        } else if (f.state === 'hide' && f.timer < 1.2 && (dp < 30 || dr < 22)) startDart(g, f);
        break;
    }
  }
}

function stepRivals(g: G, dt: number): void {
  const elapsed = TIME - g.time;
  const want = elapsed < 2.5 ? 0 : elapsed < 14 ? 1 : elapsed < 32 ? 2 : 3;
  const activeCount = g.rivals.filter((r) => r.state !== 'gone' || r.respawn > 0).length;
  if (activeCount < want) {
    g.rivals.push({ p: RIVAL_LOOK(), x: g.map.door[0] + rnd(-30, 30), y: WH - 3, state: 'enter', target: null, carrying: null, path: [], repath: 0, phase: 0, face: 1, stun: 0, speed: 0, respawn: 0, moving: false, inspect: 0 });
  }
  for (const r of g.rivals) {
    if (r.state === 'gone') {
      if (r.respawn > 0) {
        r.respawn -= dt;
        if (r.respawn <= 0) Object.assign(r, { p: RIVAL_LOOK(), x: g.map.door[0] + rnd(-30, 30), y: WH - 3, state: 'enter', target: null, carrying: null, path: [] });
      }
      continue;
    }
    r.moving = false;
    if (r.stun > 0) {
      r.stun -= dt;
      r.phase += dt * 6;
      continue;
    }
    r.speed = 32 + 14 * (elapsed / TIME);
    if (r.state === 'enter') {
      r.moving = true;
      r.y -= 30 * dt;
      r.phase += dt * 5;
      if (r.y < WH - 18) r.state = 'hunt';
      continue;
    }
    if (r.state === 'leave') {
      r.moving = true;
      if (follow(r, r.speed + 6, dt) || Math.hypot(r.x - g.map.door[0], r.y - g.map.door[1]) < 10) {
        r.state = 'gone';
        r.respawn = 4.5;
        r.carrying = null;
      }
      continue;
    }
    // hunt: chase the nearest deal (needs first)
    r.repath -= dt;
    if (r.target && r.target.gone) {
      r.target = null;
      r.inspect = 0;
    }
    if (r.inspect <= 0 && (!r.target || r.repath <= 0)) {
      let best: Find | null = null;
      let bs = 1e9;
      for (const f of g.finds) {
        if (f.gone || f.def.kind === 'junk' || f.state === 'enter') continue;
        if (g.rivals.some((o) => o !== r && o.target === f && o.state === 'hunt')) continue;
        const s = Math.hypot(f.x - r.x, f.y - r.y) - (f.def.kind === 'need' ? 40 : 0);
        if (s < bs) {
          bs = s;
          best = f;
        }
      }
      r.target = best;
      r.repath = 0.45;
      r.path = best ? findPath(g.grid, r.x, r.y, best.x, best.y) : [];
    }
    if (r.target) {
      r.moving = r.path.length > 0;
      follow(r, r.speed, dt);
      const near = Math.hypot(r.target.x - r.x, r.target.y - r.y) < 9 && !r.target.gone;
      if (near && r.inspect <= 0) {
        // they stop to look it over first: your window to snipe it
        r.inspect = 0.9;
        r.target.state = 'rest';
        r.target.timer = 1.4;
        r.target.path = [];
        r.target.alarm = 1;
        if (r.target.def.kind === 'need') g.fx.pop(r.x - g.camX, r.y - g.camY - 36, 'HMM...', '#e8e0f8');
      }
      if (near && r.inspect > 0) {
        r.moving = false;
        r.inspect -= dt;
      }
      if (near && r.inspect <= 0) {
        const f = r.target;
        f.gone = true;
        r.carrying = f;
        r.target = null;
        r.inspect = 0;
        r.state = 'leave';
        r.path = findPath(g.grid, r.x, r.y, g.map.door[0], g.map.door[1]);
        g.snatched++;
        if (f.def.kind === 'need') {
          g.fx.pop(r.x - g.camX, r.y - g.camY - 36, pick(['MINE!', 'SCORE!', 'GOT IT!', 'TOO SLOW!']), '#ffb0a0');
          g.hint = { s: g.vw < 200 ? 'SNATCHED! TAG THEM TO DROP IT' : 'SNATCHED! TAG THE SHOPPER TO MAKE THEM DROP IT', t: 3 };
          sfx.snatched();
        }
      }
    } else {
      // wander a little
      r.phase += dt * 2;
    }
    // don't walk through the player: push apart
    const dx = r.x - g.px;
    const dy = r.y - g.py;
    const d = Math.hypot(dx, dy);
    if (d < 10 && d > 0.01) slide(g, r, (dx / d) * (10 - d), (dy / d) * (10 - d) * 0.5);
  }
}

function restock(g: G): void {
  const met = metNeeds(g);
  const liveFinds = live(g);
  let spawned = 0;
  for (const n of g.goal.needs) {
    if (met.has(n.need) || !g.order.slice(0, g.revealed).includes(n.need)) continue;
    if (liveFinds.some((f) => f.def.need === n.need)) continue;
    spawnFind(g, pick(g.goal.items.filter((i) => i.need === n.need)), true);
    spawned++;
  }
  if (liveFinds.length + spawned < 11) {
    if (Math.random() < 0.6) spawnFind(g, pick(g.goal.items.filter((i) => i.kind === 'junk')), true);
    if (Math.random() < 0.4) spawnFind(g, pick(g.goal.items.filter((i) => i.kind === 'extra')), true);
    if (spawned === 0 && Math.random() < 0.5) {
      const open = g.goal.needs.filter((n) => !met.has(n.need) && g.order.slice(0, g.revealed).includes(n.need));
      if (open.length) spawnFind(g, pick(g.goal.items.filter((i) => i.need === pick(open).need)), true);
    }
  }
  g.fx.pop(g.vw / 2, 24, g.map.theme === 'yard' ? 'NEW STUFF ON THE LAWN!' : 'NEW STOCK!', '#9ad8ff');
  sfx.bell();
}

function cheapestOpen(g: G): number {
  const met = metNeeds(g);
  let m = 1e9;
  for (const i of g.goal.items) if (i.kind === 'need' && !met.has(i.need!)) m = Math.min(m, priceFor(i, g.goal, g.budget));
  return m;
}

function endGame(g: G, why: 'done' | 'time' | 'broke'): void {
  if (g.phase !== 'play') return;
  g.phase = 'end';
  g.pt = 0;
  g.endReason = why;
  g.shots = [];
  const r = scoreHunt(g.haul, g.goal);
  if (why === 'done' || r.score >= 0.6) cue.fanfare();
  else cue.sad();
}

// ---------- drawing ----------
function draw(x: Ctx, g: G, touch: boolean): void {
  const { fx } = g;
  const [sx, sy] = fx.offset();
  const camX = Math.round(g.camX);
  const camY = Math.round(g.camY);
  rect(x, 0, 0, g.vw, g.vh, '#1c1424');
  drawSky(x, g.map, camX, g.t);
  x.save();
  x.translate(-camX + sx, -camY + sy);
  x.drawImage(worldLayer(g.map, g.mapKey), 0, 0);
  const outdoor = g.map.theme !== 'thrift';
  for (const p of g.map.props) propShadow(x, p, outdoor);
  // depth-sorted sprites
  type D = { y: number; f: () => void };
  const list: D[] = [];
  for (const p of g.map.props) list.push({ y: p.y + p.h, f: () => drawProp(x, p, g.t) });
  for (const f of g.finds) {
    if (f.gone) continue;
    list.push({
      y: f.y,
      f: () => {
        if (f.pop > 0) {
          const k = 1 - f.pop / 0.35;
          x.globalAlpha = Math.min(1, k * 1.5);
        }
        drawItem(x, f.def, f.x, f.y, { moving: f.state === 'dart' || f.state === 'enter' || (f.state === 'idle' && f.path.length > 0), phase: f.phase, face: f.face, alarm: f.alarm, t: g.t, alive: f.def.kind !== 'junk', seed: f.seed });
        x.globalAlpha = 1;
      },
    });
  }
  for (const r of g.rivals) {
    if (r.state === 'gone') continue;
    list.push({
      y: r.y,
      f: () => {
        drawWalker(x, r.p, r.x - 7, r.y - 30, r.moving && r.stun <= 0, r.phase, r.face, r.stun > 0);
        // tote bag
        rect(x, r.x - 8 + (r.face > 0 ? 0 : 12), r.y - 15, 5, 6, INK);
        rect(x, r.x - 7 + (r.face > 0 ? 0 : 12), r.y - 14, 3, 4, '#e8d8b0');
        if (r.carrying) drawItem(x, r.carrying.def, r.x, r.y - 30, { moving: false, phase: 0, face: r.face, alarm: 0, t: g.t, alive: false, seed: r.carrying.seed });
        if (r.inspect > 0) {
          // how long until they grab it
          rect(x, r.x - 8, r.y - 38, 16, 4, INK);
          rect(x, r.x - 7, r.y - 37, Math.round(14 * (r.inspect / 0.9)), 2, '#ff7a5a');
        } else if (r.state === 'hunt' && r.target && !r.target.gone && Math.hypot(r.target.x - r.x, r.target.y - r.y) < 50 && r.target.def.kind === 'need') outlined(x, '!', r.x - 1, r.y - 40, '#ff9a7a');
      },
    });
  }
  list.push({
    y: g.py,
    f: () => {
      drawWalker(x, g.me, g.px - 7, g.py - 30, g.moving, g.walk, g.face);
      const [gx, gy] = gunPos(g);
      drawGun(x, gx, gy, g.aimX - gx, g.aimY - gy, g.kick);
    },
  });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.f();
  // the light pass
  x.drawImage(lightLayer(g.map, g.mapKey), 0, 0);
  // price tags on visible finds (after the lighting, so they stay readable)
  for (const f of g.finds) {
    f.hidden = !f.gone && occluded(g, f);
    if (f.gone || f.hidden) continue;
    const [w, h] = itemDim(f.def.shape);
    drawPriceTag(x, `$${f.price}`, f.x + w / 2 - 1, f.y - h - 7, f.def.kind === 'junk');
  }
  for (const s of g.shots) drawTagShot(x, s.x, s.y, s.spin);
  fx.drawWorld(x);
  x.restore();
  // foreground layer, slides faster than the floor (parallax depth)
  drawForeground(x, g.map, camX * 1.35 - sx, g.t, g.vw);

  // tagged things fly to the corner
  for (const fl of g.flyers) {
    const k = Math.min(1, fl.t / 0.55);
    const e = k * k;
    const fxs = (fl.x - camX) * (1 - e) + (g.vw - 14) * e;
    const fys = (fl.y - camY) * (1 - e) + 14 * e - Math.sin(k * Math.PI) * 18;
    if (k < 1) {
      x.save();
      x.translate(fxs, fys);
      const sc = 1 - e * 0.6;
      x.scale(sc, sc);
      drawItem(x, fl.def, 0, 0, { moving: false, phase: 0, face: 1, alarm: 0, t: g.t, alive: false, seed: fl.seed });
      x.restore();
    }
  }

  // reticle + inspect card
  if (g.phase === 'play' || g.phase === 'count') {
    const rx = g.aimX - camX;
    const ry = g.aimY - camY;
    const under = pickAt(g, g.aimX, g.aimY);
    const f = under && under.k === 'find' && !under.f.hidden ? under.f : null;
    if (f) {
      const met = metNeeds(g);
      const junk = f.def.kind === 'junk';
      const retail = Math.round(f.def.retail * (f.price / Math.max(1, f.def.price)));
      const l2 = junk ? f.def.flag ?? 'JUNK' : f.def.kind === 'need' ? (met.has(f.def.need!) ? `NEW $${retail} · HAVE ONE` : `NEW $${retail} · ON YOUR LIST`) : `NEW $${retail} · EXTRA`;
      const b = itemBox(f.def, f.x, f.y);
      drawTooltip(x, f.x - camX, b.y - camY - 6, `${f.def.name} $${f.price} · ${f.def.lbs}LB`, l2, junk ? '#ff8a7a' : f.def.kind === 'need' && !met.has(f.def.need!) ? '#7cf08a' : '#c8c0d8', g.vw);
    }
    if (g.phase === 'play') {
      const [gx, gy] = gunPos(g);
      drawReticle(x, rx, ry, g.t, !!f, g.cool, Math.hypot(g.aimX - gx, g.aimY - gy) > RANGE);
    }
  }

  // top strip: time + budget + haul (canvas copy of the key numbers, for big screens and phones alike)
  hudStrip(x, g);
  fx.drawTop(x);
  if (g.announce && g.announce.t > 0) {
    const a = g.announce;
    const sc = a.t > 1.15 ? 3 : 2;
    bigText(x, a.s, g.vw / 2, g.vh - 34, sc, a.c, INK, '#ffffff');
  }
  if (g.hint && g.hint.t > 0 && g.phase === 'play') {
    const s = g.hint.s;
    const w = Math.min(g.vw - 8, ptw(s) + 8);
    x.globalAlpha = 0.85;
    rect(x, g.vw / 2 - w / 2, g.vh - 14, w, 11, '#140c22');
    x.globalAlpha = 1;
    centered(x, s.length * 4 > g.vw - 12 ? s.slice(0, Math.floor((g.vw - 12) / 4)) : s, g.vw / 2, g.vh - 11, '#fff3c4', null);
  }
  if (g.phase === 'count') drawCount(x, g.pt, g.vw, g.vh, touch ? 'STICK TO MOVE, TAP TO TAG' : 'WASD MOVE, CLICK TO TAG');
  if (g.phase === 'play' && g.pt < COUNT_TIME + 2.4 && g.pt > 0.6) {
    centered(x, `FIND: ${g.goal.needs.map((n) => NEED_WORD[n.need]).join(', ')}`, g.vw / 2, 24, '#fff3c4');
  }
  if (g.phase === 'end') {
    const r = scoreHunt(g.haul, g.goal);
    const head = g.endReason === 'done' ? 'LIST DONE!' : g.endReason === 'broke' ? 'OUT OF CASH!' : "TIME'S UP!";
    drawBanner(x, head, `${r.got}/${r.needed} NEEDS · SPENT $${r.spent} · SAVED $${r.saved}`, r.score >= 0.6, g.pt, g.vw, g.vh);
  }
  if (g.phase === 'receipt') drawReceipt(x, g, touch);
}

function hudStrip(x: Ctx, g: G): void {
  if (g.phase === 'receipt') return;
  // budget chip (left), clock (right)
  const sec = Math.ceil(g.time);
  const money = `$${g.money}`;
  const w1 = ptw(money) + 16;
  rect(x, 2, 2, w1, 11, INK);
  rect(x, 3, 3, w1 - 2, 9, '#2a6a3a');
  rect(x, 3, 3, w1 - 2, 1, '#4a9a5a');
  rect(x, 5, 5, 5, 5, '#f2d27a');
  rect(x, 6, 6, 3, 3, '#c89a3a');
  ptext(x, money, 13, 5, '#e8ffe8');
  const clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const w2 = ptw(clock) + 8;
  const warn = sec <= 10 && g.phase === 'play';
  rect(x, g.vw - w2 - 2, 2, w2, 11, INK);
  rect(x, g.vw - w2 - 1, 3, w2 - 2, 9, warn && Math.floor(g.t * 4) % 2 ? '#a02a1a' : '#3a2e5a');
  ptext(x, clock, g.vw - w2 + 3, 5, '#fff3c4');
  // weight bar under the budget
  const frac = g.lbs / g.goal.carry;
  rect(x, 2, 14, 46, 5, INK);
  rect(x, 3, 15, 44, 3, '#3a2e4a');
  const c = frac > 0.85 ? '#ff7a5a' : frac > 0.6 ? '#f2b632' : '#7cf08a';
  rect(x, 3, 15, Math.round(44 * Math.min(1, frac)), 3, c);
}

function receiptLines(g: G): { l: string; r: string; c: string }[] {
  const r = scoreHunt(g.haul, g.goal);
  const lines: { l: string; r: string; c: string }[] = [];
  const shown = g.haul.slice(0, 5);
  for (const h of shown) lines.push({ l: h.def.kind === 'junk' ? `X ${h.def.name}` : h.def.name, r: `$${h.price}`, c: h.def.kind === 'junk' ? '#c0392b' : '#3a2e4a' });
  if (g.haul.length > shown.length) lines.push({ l: `+${g.haul.length - shown.length} MORE`, r: '', c: '#7a6f86' });
  if (!g.haul.length) lines.push({ l: 'NOTHING. NADA.', r: '$0', c: '#7a6f86' });
  lines.push({ l: '-', r: '', c: '' });
  lines.push({ l: 'YOU PAID', r: `$${r.spent}`, c: '#1c1424' });
  lines.push({ l: 'NEW, IT COSTS', r: `$${r.retail}`, c: '#7a6f86' });
  lines.push({ l: 'YOU SAVED', r: `$${r.saved}`, c: '#2f9a5a' });
  if (r.junk) lines.push({ l: 'WASTED ON JUNK', r: `$${r.junkSpent}`, c: '#c0392b' });
  lines.push({ l: `NEEDS ${r.got}/${r.needed}`, r: r.got === r.needed ? 'ALL SET!' : 'STILL SHORT', c: r.got === r.needed ? '#2f9a5a' : '#c0392b' });
  return lines;
}
const receiptTime = (g: G): number => 0.5 + receiptLines(g).length * 0.11;

function drawReceipt(x: Ctx, g: G, touch: boolean): void {
  x.globalAlpha = 0.7;
  rect(x, 0, 0, g.vw, g.vh, '#0c0816');
  x.globalAlpha = 1;
  const lines = receiptLines(g);
  const w = 150;
  const h = 44 + lines.length * 8;
  const px = Math.round(g.vw / 2 - w / 2);
  const slide = Math.min(1, g.pt / 0.35);
  const py = Math.round(g.vh - (g.vh - Math.max(4, (g.vh - h) / 2 - 4)) * (1 - Math.pow(1 - slide, 3)));
  rect(x, px + 3, py + 3, w, h, 'rgba(0,0,0,0.4)');
  rect(x, px, py, w, h, '#fbf6ea');
  for (let i = 0; i < w; i += 4) rect(x, px + i, py + h, 2, 2, '#fbf6ea');
  rect(x, px, py, w, 1, '#ffffff');
  for (let j = py + 3; j < py + h; j += 2) rect(x, px + w - 1, j, 1, 1, '#e0d8c4');
  centered(x, g.map.name, g.vw / 2, py + 4, '#3a2e4a', null);
  centered(x, 'THANK YOU! COME AGAIN', g.vw / 2, py + 11, '#7a6f86', null);
  let y = py + 20;
  lines.forEach((ln, i) => {
    if (g.pt < 0.4 + i * 0.11) return;
    if (ln.l === '-') {
      for (let k = px + 6; k < px + w - 6; k += 3) rect(x, k, y + 2, 2, 1, '#9a8aa8');
    } else {
      ptext(x, ln.l, px + 6, y, ln.c);
      ptext(x, ln.r, px + w - 6 - ptw(ln.r), y, ln.c);
    }
    y += 8;
  });
  const r = scoreHunt(g.haul, g.goal);
  if (g.pt > receiptTime(g)) {
    // a stamp
    const good = r.score >= 0.6;
    x.save();
    x.translate(g.vw / 2, py + h - 12);
    x.rotate(-0.25);
    rect(x, -24, -8, 48, 15, good ? '#2f9a5a' : '#c0392b');
    rect(x, -22, -6, 44, 11, '#fbf6ea');
    centered(x, good ? 'GREAT HAUL' : r.score >= 0.35 ? 'OKAY HAUL' : 'ROUGH HAUL', 0, -3, good ? '#2f9a5a' : '#c0392b', null);
    x.restore();
  }
  if (g.pt > receiptTime(g) + 0.5 && Math.floor(g.t * 2) % 2 === 0) centered(x, touch ? 'TAP TO FINISH' : 'SPACE OR CLICK TO FINISH', g.vw / 2, g.vh - 8, '#ffffff');
}

export function Thrift({ s, data, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const stick = useRef<StickState>({ x: 0, y: 0, active: false });
  const touch = useMemo(() => isCoarse(), []);
  const game = useRef<G | null>(null);
  if (!game.current) game.current = newGame(s, data, reducedMotion);
  const g0 = game.current;
  const [hud, setHud] = useState({ sec: TIME, money: g0.money, lbs: 0, got: [] as string[], warn: false });
  const hudKey = useRef('');

  const finish = (g: G): void => {
    if (g.sent) return;
    g.sent = true;
    const r = scoreHunt(g.haul, g.goal);
    onDone({ score: r.score, stats: { spent: r.spent, saved: r.saved, got: r.got, needed: r.needed, junk: r.junk, snatched: g.snatched } });
  };

  useLoop(
    (dt) => {
      const g = game.current!;
      const { fx } = g;
      g.t += dt;
      g.pt += dt;
      fx.update(dt);
      if (g.announce) g.announce.t -= dt;
      if (g.hint) g.hint.t -= dt;
      g.chirpT -= dt;
      for (const fl of g.flyers) fl.t += dt;
      g.flyers = g.flyers.filter((fl) => fl.t < 0.6);

      if (g.phase === 'count') {
        if (g.pt < 0.05) soundInit();
        const lab = countLabel(g.pt);
        if (lab !== g.lastLabel) {
          g.lastLabel = lab;
          if (lab === 'GO!') cue.go();
          else if (lab) cue.tick();
        }
        if (g.pt >= COUNT_TIME) {
          g.phase = 'play';
        }
      }
      const sim = g.phase === 'play' && fx.hitstop <= 0;
      if (fx.hitstop > 0) fx.hitstop -= dt;
      if (sim) {
        g.time = Math.max(0, g.time - dt);
        const sec = Math.ceil(g.time);
        if (sec !== g.lastSec) {
          g.lastSec = sec;
          if (sec <= 5 && sec > 0) cue.tick();
        }
        g.cool = Math.max(0, g.cool - dt);
        g.kick = Math.max(0, g.kick - dt * 14);
        // movement
        let mx = (input.down.has('right') ? 1 : 0) - (input.down.has('left') ? 1 : 0);
        let my = (input.down.has('down') ? 1 : 0) - (input.down.has('up') ? 1 : 0);
        if (stick.current.active) {
          mx = stick.current.x;
          my = stick.current.y;
        }
        const m = Math.hypot(mx, my);
        if (m > 1) {
          mx /= m;
          my /= m;
        }
        g.moving = m > 0.05;
        if (g.moving) {
          const o = { x: g.px, y: g.py };
          slide(g, o, mx * SPEED * dt, my * SPEED * dt);
          g.px = o.x;
          g.py = o.y;
          g.walk += dt * 9 * Math.min(1, m);
          if (g.aimMode === 'auto' && Math.abs(mx) > 0.2) g.face = mx > 0 ? 1 : -1;
        }
        // auto aim (keyboard-only and touch): lock the nearest visible thing you're facing
        if (g.aimMode === 'auto') {
          let best: Find | null = null;
          let bs = 1e9;
          for (const f of g.finds) {
            if (f.gone || f.hidden) continue;
            const dx = f.x - g.px;
            const dy = f.y - 6 - (g.py - 13);
            const d = Math.hypot(dx, dy);
            if (d > 130) continue;
            const facing = dx * g.face > -8 ? 0 : 60;
            const sc = d + facing;
            if (sc < bs) {
              bs = sc;
              best = f;
            }
          }
          g.lock = best;
          const tx = best ? best.x : g.px + g.face * 40;
          const ty = best ? best.y - itemDim(best.def.shape)[1] / 2 - 2 : g.py - 14;
          g.aimX += (tx - g.aimX) * Math.min(1, dt * 14);
          g.aimY += (ty - g.aimY) * Math.min(1, dt * 14);
        } else if (Math.abs(g.aimX - g.px) > 3) g.face = g.aimX > g.px ? 1 : -1;
        if (input.pressed.has('action')) fire(g, g.aimX, g.aimY);
        // shots
        for (const sh of g.shots) {
          const steps = Math.ceil((SHOT_SPEED * dt) / 2);
          let done = false;
          for (let k = 0; k < steps && !done; k++) {
            sh.x += (sh.vx * dt) / steps;
            sh.y += (sh.vy * dt) / steps;
            const trav = Math.hypot(sh.x - sh.ox, sh.y - sh.oy);
            const u = trav / Math.max(1, sh.len);
            const depth = sh.d0 + (sh.d1 - sh.d0) * Math.min(1.3, u);
            const h = pickAt(g, sh.x, sh.y, depth, sh.want && !sh.want.gone ? sh.want : null);
            if (h && !(h.k === 'prop' && u < 0.12 && h.depth < g.py)) {
              done = true;
              if (h.k === 'find') tagFind(g, h.f);
              else if (h.k === 'rival') hitRival(g, h.r);
              else {
                fx.burst(sh.x, sh.y, ['#fffaf0', '#c8c0b0'], 5, 30, 120, 0.4);
                sfx.thunk();
              }
            } else if (trav > sh.maxD || sh.x < -4 || sh.x > WW + 4 || sh.y < 0 || sh.y > WH + 4) {
              done = true;
              fx.burst(sh.x, sh.y, ['#fffaf0'], 3, 20, 140, 0.35);
              if (sh.len > RANGE && g.noteCool <= 0) {
                fx.pop(sh.x - g.camX, sh.y - g.camY - 8, 'OUT OF RANGE', '#c8c0d8');
                g.noteCool = 1.2;
              }
            }
          }
          sh.spin += dt * 18;
          if (done) sh.len = -1;
        }
        g.shots = g.shots.filter((sh) => sh.len >= 0);
        stepFinds(g, dt);
        stepRivals(g, dt);
        g.finds = g.finds.filter((f) => !f.gone || g.rivals.some((r) => r.carrying === f));
        g.noteCool -= dt;
        const elapsed = TIME - g.time;
        if (g.revealed < g.order.length && elapsed >= REVEAL[g.revealed]) {
          const need = g.order[g.revealed++];
          if (!metNeeds(g).has(need)) {
            spawnFind(g, pick(g.goal.items.filter((i) => i.need === need)), true);
            g.fx.pop(g.vw / 2, 26, `${NEED_WORD[need]} JUST ROLLED IN!`, '#9ad8ff');
            sfx.bell();
          }
        }
        g.stockT -= dt;
        if (g.stockT <= 0) {
          g.stockT = 8;
          restock(g);
        }
        // endings
        const met = metNeeds(g);
        if (g.goal.needs.every((n) => met.has(n.need))) endGame(g, 'done');
        else if (g.time <= 0) endGame(g, 'time');
        else if (g.money < cheapestOpen(g)) endGame(g, 'broke');
      } else if (g.phase === 'end') {
        if (g.pt > 2.2) {
          g.phase = 'receipt';
          g.pt = 0;
          beep(note(30), 0.05, 'square', 0.05);
        }
      } else if (g.phase === 'receipt') {
        const ready = g.pt > receiptTime(g) + 0.5;
        if ((ready && input.pressed.has('action')) || g.pt > receiptTime(g) + 7) finish(g);
      }
      // camera
      const tcx = clamp(g.px - g.vw / 2, 0, WW - g.vw);
      const tcy = clamp(g.py - g.vh * 0.6, 0, WH - g.vh);
      g.camX += (tcx - g.camX) * Math.min(1, dt * 5);
      g.camY += (tcy - g.camY) * Math.min(1, dt * 5);

      // HUD
      const met = metNeeds(g);
      const got = g.goal.needs.filter((n) => met.has(n.need)).map((n) => n.need);
      const sec = Math.ceil(g.time);
      const key = `${sec}|${g.money}|${g.lbs}|${got.join(',')}`;
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud({ sec, money: g.money, lbs: g.lbs, got, warn: sec <= 10 });
      }
      const x = ctxOf(canvas.current);
      if (x) draw(x, g, touch);
    },
    true,
    input,
  );

  const g = g0;
  const frac = hud.lbs / g.goal.carry;
  return (
    <div className="mini th-mini">
      <MiniHud
        items={[
          { label: 'Time', value: `${Math.floor(hud.sec / 60)}:${String(hud.sec % 60).padStart(2, '0')}`, warn: hud.warn },
          { label: 'Budget', value: `$${hud.money}`, warn: hud.money < g.budget * 0.2 },
        ]}
      >
        <span className={`th-weight ${frac > 0.85 ? 'warn' : ''}`}>
          <small>Haul ({g.goal.haul.toLowerCase()})</small>
          <span className="th-bar" aria-label={`${hud.lbs} of ${g.goal.carry} pounds`}>
            <i style={{ width: `${Math.min(100, frac * 100)}%` } as CSSProperties} />
            <b>
              {hud.lbs}/{g.goal.carry} lb
            </b>
          </span>
        </span>
      </MiniHud>
      <ul className="th-list" aria-label="Shopping list">
        {g.goal.needs.map((n) => {
          const have = hud.got.includes(n.need);
          return (
            <li key={n.need} className={have ? 'got' : ''}>
              <span className="th-check" aria-hidden="true">
                {have ? '✓' : ''}
              </span>
              {n.label}
            </li>
          );
        })}
      </ul>
      <div className="th-canvas" style={{ '--ar': String(g0.vw / g0.vh) } as CSSProperties}>
        <PixelCanvas
          canvasRef={canvas}
          width={g0.vw}
          height={g0.vh}
          onPointer={(px, py, kind) => {
            const gg = game.current!;
            if (gg.phase === 'receipt') {
              if (kind === 'down' && gg.pt > receiptTime(gg) + 0.5) finish(gg);
              return;
            }
            const wx = px + gg.camX;
            const wy = py + gg.camY;
            if (kind === 'move' && !touch) {
              gg.aimMode = 'mouse';
              gg.aimX = wx;
              gg.aimY = wy;
            }
            if (kind === 'down') {
              soundInit();
              if (!touch) gg.aimMode = 'mouse';
              gg.aimX = wx;
              gg.aimY = wy;
              fire(gg, wx, wy);
            }
          }}
        />
      </div>
      <ThriftStick
        stick={stick}
        fireLabel="TAG!"
        onFire={() => {
          const gg = game.current!;
          soundInit();
          if (gg.phase === 'receipt') {
            if (gg.pt > receiptTime(gg) + 0.5) finish(gg);
            return;
          }
          gg.aimMode = 'auto';
          fire(gg, gg.aimX, gg.aimY);
        }}
      />
      <p className="mini-note th-keys">WASD/arrows move · aim with the mouse · click (or SPACE) to tag · check tags for junk</p>
    </div>
  );
}

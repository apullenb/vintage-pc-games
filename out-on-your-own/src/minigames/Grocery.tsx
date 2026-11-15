// Grocery Run: push a cart around a top-down store, grab what's on your list, compare prices,
// dodge the impulse-buy displays and the Sunday crowd, then check out.
import { useRef, useState, type CSSProperties } from 'react';
import { HAIRS, playerPerson, SHIRTS, SKINS, drawPerson, type Person } from '../art/people.ts';
import { dither, disc, INK, mix, rect, shade, stipple, type Ctx } from '../art/px.ts';
import { sfx } from '../ui/audio.ts';
import {
  AISLE_SECTIONS,
  BACK_SECTIONS,
  CHECKOUT_CANDY,
  IMPULSES,
  makeList,
  scoreTrip,
  SECTION_COLOR,
  SECTION_SIGN,
  shuffle,
  tripTotals,
  unitPrice,
  type Impulse,
  type ListItem,
  type SectionId,
  type Shape,
} from './groceryData.ts';
import { dollars, Fx, say } from './groceryHaggleFx.ts';
import { GhPad } from './groceryHagglePad.tsx';
import { ctxOf, MiniHud, PixelCanvas, useInput, useLoop, type Input, type MiniProps } from './kit.tsx';
import './groceryHaggle.css';

const W = 240;
const H = 160;
const TIME = 80;
const SPEED = 62;
const HALF = 10; // half-width of the cart+shopper footprint
const FOOT = 6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const boxAt = (x: number, y: number): Rect => ({ x: x - HALF, y: y - FOOT, w: HALF * 2, h: FOOT });

// ---------- store layout ----------
const WALL: Rect = { x: 0, y: 0, w: W, h: 22 };
const ISLANDS: Rect[] = [
  { x: 26, y: 48, w: 80, h: 20 },
  { x: 134, y: 48, w: 80, h: 20 },
  { x: 26, y: 94, w: 80, h: 20 },
  { x: 134, y: 94, w: 80, h: 20 },
];
const REGISTER: Rect = { x: 84, y: 139, w: 24, h: 21 };
const CANDY: Rect = { x: 134, y: 141, w: 8, h: 14 };
const CLOSED: Rect = { x: 170, y: 139, w: 14, h: 21 };
const STATIC: Rect[] = [WALL, ...ISLANDS, REGISTER, CANDY, CLOSED];
const CHECKOUT = { x0: 116, x1: 126, y: 153 }; // feet zone that ends the trip
const LANE_Y = [40, 84, 128];
const CROSS_X = [13, 120, 227];
const START = { x: 30, y: 155 };
const SPAWN: [number, number] = [13, 157];

type FaceKind = 'back' | 'north' | 'south';
interface Face {
  kind: FaceKind;
  sec: SectionId;
  x0: number;
  y: number; // the edge you stand at
  slots: number; // 24px spots available
  used: boolean[];
}
interface Spot {
  item: ListItem;
  face: Face;
  x: number; // left edge of the 24px spot
}
interface Endcap {
  r: Rect;
  imp: Impulse | null;
  cool: number;
  near: number; // 0..1 how hard it's pulling right now
}
interface Shopper {
  x: number;
  y: number;
  node: [number, number];
  prev: [number, number];
  tx: number;
  ty: number;
  speed: number;
  p: Person;
  face: -1 | 1;
  wait: number;
  pauseAt: number; // distance left at which to stop and browse (-1: no stop)
  walk: number;
  cool: number; // how long you've been blocking their way
}
interface Coupon {
  x: number;
  y: number;
  v: number;
  taken: boolean;
}

type Phase = 'count' | 'play' | 'pick' | 'receipt';
interface G {
  phase: Phase;
  pt: number; // time in phase
  time: number; // store clock remaining
  t: number;
  px: number;
  py: number;
  face: -1 | 1;
  stun: number;
  kx: number;
  ky: number;
  bumpCool: number;
  walk: number;
  moving: boolean;
  list: ListItem[];
  faces: Face[];
  spots: Spot[];
  ends: Endcap[];
  candy: Endcap;
  shoppers: Shopper[];
  coupons: Coupon[];
  impulses: { name: string; price: number }[];
  couponsGot: number[];
  bumps: number;
  pick: Spot | null;
  sel: -1 | 0 | 1;
  near: Spot | null;
  path: [number, number][] | null;
  autoPick: Spot | null;
  stuck: number;
  atCheckout: boolean;
  checkoutWarned: boolean;
  spawnT: number;
  fx: Fx;
  bg: HTMLCanvasElement;
  pass: Uint8Array;
  safe: Uint8Array;
  look: Person;
  score: number;
  stats: Record<string, number>;
  endWhy: string;
  doneSent: boolean;
}

const blocked = (b: Rect): boolean => b.x < 0 || b.x + b.w > W || b.y < 0 || b.y + b.h > H || STATIC.some((r) => overlaps(b, r));

// ---------- setup ----------
function setup(look: Person, reduced: boolean): G {
  const r = Math.random;
  const list = makeList(r);
  const need = new Set(list.map((l) => l.def.sec));
  // Back wall: produce / meat / dairy in a random order. Aisles: everything on the list, then filler.
  const back = shuffle([...BACK_SECTIONS], r);
  const aisleNeed = AISLE_SECTIONS.filter((a) => need.has(a));
  const aisleRest = shuffle(
    AISLE_SECTIONS.filter((a) => !need.has(a)),
    r,
  );
  // One section per aisle island; both of its sides stock that section.
  const aisles = shuffle([...aisleNeed, ...aisleRest].slice(0, 4), r);
  const faces: Face[] = back.map((sec, k) => ({ kind: 'back', sec, x0: k * 80 + 4, y: WALL.h, slots: 3, used: [false, false, false] }));
  ISLANDS.forEach((isl, i) => {
    faces.push({ kind: 'north', sec: aisles[i], x0: isl.x + 8, y: isl.y, slots: 2, used: [false, false] });
    faces.push({ kind: 'south', sec: aisles[i], x0: isl.x + 8, y: isl.y + isl.h, slots: 2, used: [false, false] });
  });
  const spots: Spot[] = [];
  for (const item of list) {
    const open = faces.filter((fc) => fc.sec === item.def.sec && fc.used.some((u) => !u));
    const f = open[Math.floor(r() * open.length)];
    const free = f.used.map((u, i) => (u ? -1 : i)).filter((i) => i >= 0);
    const k = free[Math.floor(r() * free.length)];
    f.used[k] = true;
    spots.push({ item, face: f, x: f.x0 + (f.kind === 'back' ? k * 24 : 2 + k * 36) });
  }
  // Endcaps: four of the eight island ends are impulse displays.
  const endRects: Rect[] = ISLANDS.flatMap((isl) => [
    { x: isl.x, y: isl.y, w: 8, h: isl.h },
    { x: isl.x + isl.w - 8, y: isl.y, w: 8, h: isl.h },
  ]);
  const hot = new Set(shuffle([0, 1, 2, 3, 4, 5, 6, 7], r).slice(0, 4));
  const imps = shuffle([...IMPULSES], r);
  const ends: Endcap[] = endRects.map((er, i) => ({ r: er, imp: hot.has(i) ? imps.pop()! : null, cool: 0, near: 0 }));
  // Coupons: two, out in the aisles.
  const couponSpots = shuffle(
    [
      [60, 34],
      [180, 34],
      [66, 80],
      [176, 80],
      [120, 60],
      [227, 66],
      [13, 104],
      [196, 126],
      [60, 126],
      [120, 108],
    ],
    r,
  );
  const coupons: Coupon[] = couponSpots.slice(0, 2).map(([x, y]) => ({ x, y, v: [1, 1.5, 2][Math.floor(r() * 3)], taken: false }));
  const g: G = {
    phase: 'count',
    pt: 0,
    time: TIME,
    t: 0,
    px: START.x,
    py: START.y,
    face: 1,
    stun: 0,
    kx: 0,
    ky: 0,
    bumpCool: 0,
    walk: 0,
    moving: false,
    list,
    faces,
    spots,
    ends,
    candy: { r: CANDY, imp: CHECKOUT_CANDY, cool: 0, near: 0 },
    shoppers: [],
    coupons,
    impulses: [],
    couponsGot: [],
    bumps: 0,
    pick: null,
    sel: -1,
    near: null,
    path: null,
    autoPick: null,
    stuck: 0,
    atCheckout: false,
    checkoutWarned: false,
    spawnT: 9,
    fx: new Fx(reduced),
    bg: document.createElement('canvas'),
    pass: new Uint8Array(0),
    safe: new Uint8Array(0),
    look,
    score: 0,
    stats: {},
    endWhy: '',
    doneSent: false,
  };
  g.shoppers.push(newShopper([2, 1], r), newShopper([0, 0], r));
  g.bg.width = W;
  g.bg.height = H;
  const bx = g.bg.getContext('2d');
  if (bx) paintStatic(bx, g);
  // Walkable grid (2px cells) for tap-to-go.
  // "safe" also keeps clear of the impulse displays, so tapping around the store doesn't drag you into them.
  g.pass = new Uint8Array(GW * GH);
  g.safe = new Uint8Array(GW * GH);
  const hotRects = [...g.ends.filter((e) => e.imp).map((e) => e.r), CANDY];
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const open = blocked(boxAt(i * 2, j * 2)) ? 0 : 1;
      g.pass[j * GW + i] = open;
      const cx = i * 2;
      const cy = j * 2 - 3;
      const near = hotRects.some((hr) => Math.hypot(Math.max(hr.x - cx, 0, cx - hr.x - hr.w), Math.max(hr.y - cy, 0, cy - hr.y - hr.h)) < 14);
      g.safe[j * GW + i] = open && !near ? 1 : 0;
    }
  return g;
}

const randPerson = (r: () => number): Person => ({
  skin: SKINS[Math.floor(r() * SKINS.length)],
  hair: HAIRS[Math.floor(r() * HAIRS.length)],
  style: Math.floor(r() * 9),
  shirt: SHIRTS[Math.floor(r() * SHIRTS.length)],
  pants: ['#34406a', '#3a3028', '#2a2a33', '#5a4a6a', '#2f4a6a'][Math.floor(r() * 5)],
  glasses: r() < 0.25,
  hat: r() < 0.15 ? 'beanie' : undefined,
  hatColor: SHIRTS[Math.floor(r() * SHIRTS.length)],
});

function newShopper(node: [number, number], r: () => number, at?: [number, number]): Shopper {
  const x = at ? at[0] : CROSS_X[node[0]];
  const y = at ? at[1] : LANE_Y[node[1]];
  const sh: Shopper = { x, y, node, prev: node, tx: x, ty: y, speed: 18 + r() * 9, p: randPerson(r), face: 1, wait: 0.5 + r(), pauseAt: -1, walk: 0, cool: 0 };
  if (at) {
    sh.tx = CROSS_X[node[0]];
    sh.ty = LANE_Y[node[1]];
  }
  return sh;
}

function nextNode(sh: Shopper, r: () => number): void {
  const [i, j] = sh.node;
  const opts: [number, number][] = [];
  if (i > 0) opts.push([i - 1, j]);
  if (i < 2) opts.push([i + 1, j]);
  if (j > 0) opts.push([i, j - 1]);
  if (j < 2) opts.push([i, j + 1]);
  const fwd = opts.filter(([a, b]) => a !== sh.prev[0] || b !== sh.prev[1]);
  const pool = fwd.length ? fwd : opts;
  const n = pool[Math.floor(r() * pool.length)];
  sh.prev = sh.node;
  sh.node = n;
  sh.tx = CROSS_X[n[0]];
  sh.ty = LANE_Y[n[1]];
  const horizontal = n[1] === sh.prev[1];
  sh.pauseAt = horizontal && r() < 0.5 ? 10 + r() * 60 : -1;
}

// ---------- pathfinding for tap-to-go ----------
const GW = W / 2;
const GH = H / 2;
function nearestOpen(grid: Uint8Array, x: number, y: number, maxRad = 14): [number, number] | null {
  const ci = Math.round(x / 2);
  const cj = Math.round(y / 2);
  for (let rad = 0; rad < maxRad; rad++)
    for (let dj = -rad; dj <= rad; dj++)
      for (let di = -rad; di <= rad; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== rad) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < GW && j < GH && grid[j * GW + i]) return [i, j];
      }
  return null;
}
function clearLine(grid: Uint8Array, a: [number, number], b: [number, number]): boolean {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
  for (let k = 0; k <= n; k++) {
    const i = Math.round(a[0] + ((b[0] - a[0]) * k) / Math.max(1, n));
    const j = Math.round(a[1] + ((b[1] - a[1]) * k) / Math.max(1, n));
    if (!grid[j * GW + i]) return false;
  }
  return true;
}
function findPath(g: G, tx: number, ty: number): [number, number][] | null {
  return route(g, g.safe, tx, ty) ?? route(g, g.pass, tx, ty);
}
function route(g: G, grid: Uint8Array, tx: number, ty: number): [number, number][] | null {
  const s = nearestOpen(g.pass, g.px, g.py);
  const e = nearestOpen(grid, tx, ty, grid === g.pass ? 14 : 6);
  if (!s || !e) return null;
  // You may already be standing in a "hot" spot: let the search leave it.
  const ok = (n: number): boolean => !!grid[n] || (!!g.pass[n] && Math.max(Math.abs((n % GW) - s[0]), Math.abs(((n / GW) | 0) - s[1])) <= 5);
  const prev = new Int32Array(GW * GH).fill(-1);
  const start = s[1] * GW + s[0];
  const goal = e[1] * GW + e[0];
  prev[start] = start;
  const q = [start];
  for (let h = 0; h < q.length && prev[goal] < 0; h++) {
    const c = q[h];
    const i = c % GW;
    const j = (c / GW) | 0;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const n = nj * GW + ni;
      if (prev[n] >= 0 || !ok(n)) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[goal] < 0) return null;
  const cells: [number, number][] = [];
  for (let c = goal; ; c = prev[c]) {
    cells.push([c % GW, (c / GW) | 0]);
    if (c === start) break;
  }
  cells.reverse();
  // String-pull: keep only the corners.
  const out: [number, number][] = [];
  let a = 0;
  while (a < cells.length - 1) {
    let b = cells.length - 1;
    while (b > a + 1 && !clearLine(grid, cells[a], cells[b])) b--;
    out.push([cells[b][0] * 2, cells[b][1] * 2]);
    a = b;
  }
  return out;
}

// ---------- movement ----------
function tryMove(g: G, dx: number, dy: number): boolean {
  let moved = false;
  let bx = false;
  let by = false;
  if (dx) {
    if (!blocked(boxAt(g.px + dx, g.py))) {
      g.px += dx;
      moved = true;
    } else bx = true;
  }
  if (dy) {
    if (!blocked(boxAt(g.px, g.py + dy))) {
      g.py += dy;
      moved = true;
    } else by = true;
  }
  // Corner assist: when pushing into a shelf corner, slide toward the nearby opening.
  let slid = false;
  if (by && Math.abs(dy) >= Math.abs(dx)) {
    for (let k = 1; k <= 8 && !slid; k++)
      for (const sgn of [-1, 1]) {
        if (!blocked(boxAt(g.px + sgn * k, g.py + dy)) && !blocked(boxAt(g.px + sgn, g.py))) {
          g.px += sgn * Math.min(1, Math.abs(dy) + 0.2);
          slid = true;
          break;
        }
      }
  }
  if (bx && Math.abs(dx) > Math.abs(dy)) {
    for (let k = 1; k <= 8 && !slid; k++)
      for (const sgn of [-1, 1]) {
        if (!blocked(boxAt(g.px + dx, g.py + sgn * k)) && !blocked(boxAt(g.px, g.py + sgn))) {
          g.py += sgn * Math.min(1, Math.abs(dx) + 0.2);
          slid = true;
          break;
        }
      }
  }
  moved = moved || slid;
  return moved;
}

function reach(g: G, sp: Spot): boolean {
  const cx = sp.x + 12;
  if (Math.abs(cx - g.px) > 13) return false;
  const f = sp.face;
  if (f.kind === 'north') return g.py <= f.y && f.y - g.py <= 8;
  return g.py - FOOT >= f.y - 0.5 && g.py - FOOT - f.y <= 9;
}
function standFor(sp: Spot): [number, number] {
  const f = sp.face;
  return [sp.x + 12, f.kind === 'north' ? f.y - 2 : f.y + FOOT + 3];
}

// ---------- the step ----------
function finish(g: G, why: string): void {
  if (g.phase === 'receipt') return;
  g.phase = 'receipt';
  g.pt = 0;
  g.endWhy = why;
  g.pick = null;
  g.path = null;
  const trip = { list: g.list, impulses: g.impulses, coupons: g.couponsGot, couponsTotal: g.coupons.length, bumps: g.bumps };
  const T = tripTotals(trip);
  g.score = scoreTrip(trip);
  g.stats = {
    total: Math.round(T.total * 100) / 100,
    got: T.got,
    items: T.n,
    missing: T.missing,
    missingCost: Math.round(T.missingCost * 100) / 100,
    impulses: g.impulses.length,
    impulseCost: Math.round(T.impulse * 100) / 100,
    coupons: Math.round(T.coupons * 100) / 100,
    saved: Math.round(T.saved * 100) / 100,
    bumps: g.bumps,
  };
  sfx(T.missing ? 'page' : 'fanfare');
}

function choose(g: G, k: 0 | 1): void {
  const sp = g.pick;
  if (!sp) return;
  const it = sp.item;
  it.got = k;
  g.spots = g.spots.filter((s) => s !== sp);
  g.pick = null;
  g.phase = 'play';
  g.pt = 0;
  const mine = it.opts[k];
  const other = it.opts[1 - k];
  const diff = Math.abs(other.price - mine.price);
  const smart = mine.price <= other.price;
  const [sx, sy] = [g.px, g.py - 34];
  const lesson = it.def.lesson;
  if (smart) {
    sfx('coin');
    const msg = mine.sale
      ? `SALE BEAT STORE BRAND!`
      : lesson === 'brand'
        ? `STORE BRAND SAVES ${dollars(diff)}!`
        : lesson === 'loose'
          ? `BAGGED SAVES ${dollars(diff)}!`
          : lesson === 'precut'
            ? `DIY CHOPPING SAVES ${dollars(diff)}`
            : `BULK SAVES ${dollars(diff)}!`;
    g.fx.float(sx, sy, msg, '#8cf0a0', 1, 1.6);
    g.fx.burst(g.px + g.face * 8, g.py - 10, 14, ['#f2d048', '#ffffff', '#8cf0a0'], 46);
  } else {
    sfx('spend');
    const msg =
      lesson === 'brand'
        ? `+${dollars(diff)} FOR THE LOGO`
        : lesson === 'precut'
          ? `+${dollars(diff)} FOR PRE-CUT`
          : lesson === 'loose'
            ? `+${dollars(diff)} BUYING LOOSE`
            : `+${dollars(diff)} FOR SMALL PACKS`;
    g.fx.float(sx, sy, msg, '#ffb070', 1, 1.6);
    g.fx.burst(g.px + g.face * 8, g.py - 10, 6, ['#f2d048', '#ffffff'], 30);
  }
  if (g.list.every((l) => l.got >= 0)) {
    g.fx.float(W / 2, 60, 'LIST DONE! TO CHECKOUT', '#f2d048', 1, 2.2);
    sfx('star');
  }
}

function openPick(g: G, sp: Spot): void {
  g.pick = sp;
  g.sel = -1;
  g.phase = 'pick';
  g.pt = 0;
  g.path = null;
  g.autoPick = null;
  sfx('click');
}

function impulse(g: G, e: Endcap): void {
  if (!e.imp) return;
  g.impulses.push({ name: e.imp.name, price: e.imp.price });
  e.cool = 5;
  g.fx.float(g.px, g.py - 36, `+${dollars(e.imp.price)} ${e.imp.name}`, '#ff8070', 1, 1.6);
  g.fx.float(g.px, g.py - 28, 'IMPULSE BUY!', '#ffd0d0', 1, 1.3);
  g.fx.burst(e.r.x + e.r.w / 2, e.r.y + 4, 12, [e.imp.color, '#ffffff', '#e0503c'], 50);
  g.fx.shake(2);
  g.fx.flash('#e0503c', 0.1);
  sfx('spend');
  // knock the cart back off the display
  const cx = e.r.x + e.r.w / 2;
  const cy = e.r.y + e.r.h / 2;
  const dx = g.px - cx;
  const dy = g.py - 3 - cy;
  const d = Math.hypot(dx, dy) || 1;
  g.kx = (dx / d) * 70;
  g.ky = (dy / d) * 70;
  g.stun = 0.2;
}

function step(g: G, dt: number, inp: Input): void {
  g.t += dt;
  g.pt += dt;
  g.fx.update(dt);
  if (g.phase === 'count') {
    if (g.pt >= 3.2) {
      g.phase = 'play';
      g.pt = 0;
    } else if (Math.floor(g.pt) !== Math.floor(g.pt - dt)) sfx(g.pt >= 3 ? 'select' : 'type');
    return;
  }
  if (g.phase === 'receipt') return;

  g.time = Math.max(0, g.time - dt);
  if (g.time <= 0) {
    finish(g, "TIME'S UP!");
    return;
  }
  const crowd = 1 - g.time / TIME;

  // Shoppers: more show up as the clock runs down.
  g.spawnT -= dt;
  if (g.spawnT <= 0 && g.shoppers.length < 6) {
    g.spawnT = 11;
    g.shoppers.push(newShopper([0, 2], Math.random, SPAWN));
    g.fx.float(34, 128, 'GETTING BUSY...', '#ffffff', 1, 1.4);
  }
  for (const sh of g.shoppers) {
    if (sh.wait > 0) {
      sh.wait -= dt;
      continue;
    }
    const dx = sh.tx - sh.x;
    const dy = sh.ty - sh.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) {
      sh.x = sh.tx;
      sh.y = sh.ty;
      nextNode(sh, Math.random);
      if (Math.random() < 0.25) sh.wait = 0.4 + Math.random() * 0.8;
      continue;
    }
    if (sh.pauseAt >= 0 && d <= sh.pauseAt) {
      sh.pauseAt = -1;
      sh.wait = 1 + Math.random() * 1.5;
      continue;
    }
    const v = Math.min(d, sh.speed * (1 + crowd * 0.35) * dt);
    const nx = sh.x + (dx / d) * v;
    const ny = sh.y + (dy / d) * v;
    // Shoppers wait for you to get out of the way, then give up and turn around.
    if (overlaps(boxAt(g.px, g.py), { x: nx - HALF + 1, y: ny - FOOT, w: HALF * 2 - 2, h: FOOT })) {
      sh.cool += dt;
      if (sh.cool > 0.9) {
        sh.cool = 0;
        [sh.node, sh.prev] = [sh.prev, sh.node];
        sh.tx = CROSS_X[sh.node[0]];
        sh.ty = LANE_Y[sh.node[1]];
        sh.pauseAt = -1;
      }
      continue;
    }
    sh.cool = 0;
    sh.x = nx;
    sh.y = ny;
    if (Math.abs(dx) > 0.3) sh.face = dx > 0 ? 1 : -1;
    sh.walk += v;
  }

  for (const e of g.ends) e.cool = Math.max(0, e.cool - dt);
  g.candy.cool = Math.max(0, g.candy.cool - dt);
  g.bumpCool = Math.max(0, g.bumpCool - dt);

  if (g.phase === 'pick') {
    if (g.pick && !reach(g, g.pick)) {
      g.pick = null;
      g.phase = 'play';
    } else {
      if (inp.pressed.has('left')) g.sel = 0;
      if (inp.pressed.has('right')) g.sel = 1;
      if (g.sel >= 0 && (inp.pressed.has('left') || inp.pressed.has('right'))) sfx('click');
      if ((inp.pressed.has('up') || inp.pressed.has('down')) && g.pt > 0.15) {
        g.pick = null;
        g.phase = 'play';
      } else if (inp.pressed.has('action') && g.pt > 0.2 && g.sel >= 0) choose(g, g.sel as 0 | 1);
      return;
    }
  }

  // ---- player ----
  let ix = 0;
  let iy = 0;
  if (inp.down.has('left')) ix -= 1;
  if (inp.down.has('right')) ix += 1;
  if (inp.down.has('up')) iy -= 1;
  if (inp.down.has('down')) iy += 1;
  if (ix || iy) {
    g.path = null;
    g.autoPick = null;
  }
  if (!ix && !iy && g.path && g.path.length) {
    const [tx, ty] = g.path[0];
    const dx = tx - g.px;
    const dy = ty - g.py;
    const d = Math.hypot(dx, dy);
    if (d < 1.6) {
      g.path.shift();
      if (!g.path.length) g.path = null;
    } else {
      ix = dx / d;
      iy = dy / d;
    }
  }
  if (!g.path && g.autoPick && g.phase === 'play') {
    if (reach(g, g.autoPick) && g.spots.includes(g.autoPick)) openPick(g, g.autoPick);
    g.autoPick = null;
  }
  const len = Math.hypot(ix, iy);
  if (len > 1) {
    ix /= len;
    iy /= len;
  }
  let mx = 0;
  let my = 0;
  if (g.stun > 0) {
    g.stun -= dt;
  } else {
    mx = ix * SPEED * dt;
    my = iy * SPEED * dt;
  }
  mx += g.kx * dt;
  my += g.ky * dt;
  g.kx *= Math.pow(0.02, dt);
  g.ky *= Math.pow(0.02, dt);
  if (Math.abs(ix) > 0.2) g.face = ix > 0 ? 1 : -1;

  // Impulse displays pull your cart in.
  const pullOf = (e: Endcap, rad: number): void => {
    e.near = 0;
    if (!e.imp || e.cool > 0) return;
    const nx = Math.max(e.r.x, Math.min(e.r.x + e.r.w, g.px));
    const ny = Math.max(e.r.y, Math.min(e.r.y + e.r.h, g.py - 3));
    const dx = nx - g.px;
    const dy = ny - (g.py - 3);
    const d = Math.hypot(dx, dy);
    if (d > rad) return;
    e.near = 1 - d / rad;
    // Gentle at a distance, strong up close. A planned (tapped) route resists it a bit better.
    const pull = 32 * e.near * e.near * (0.85 + crowd * 0.3) * (g.path ? 0.6 : 1) * dt;
    mx += (dx / (d || 1)) * pull;
    my += (dy / (d || 1)) * pull;
    if (overlaps({ x: g.px - HALF - 1, y: g.py - FOOT - 1, w: HALF * 2 + 2, h: FOOT + 2 }, e.r)) impulse(g, e);
  };
  for (const e of g.ends) pullOf(e, 18);
  pullOf(g.candy, 15);

  const before = [g.px, g.py];
  if (mx || my) tryMove(g, mx, my);
  const moved = Math.hypot(g.px - before[0], g.py - before[1]);
  g.moving = moved > 0.05;
  g.walk += moved;
  if (g.path && moved < 0.05 && len > 0) {
    g.stuck += dt;
    if (g.stuck > 0.5) {
      g.path = null;
      g.autoPick = null;
    }
  } else g.stuck = 0;

  // Bump into other shoppers.
  const me = boxAt(g.px, g.py);
  for (const sh of g.shoppers) {
    const them = { x: sh.x - HALF + 2, y: sh.y - FOOT + 1, w: HALF * 2 - 4, h: FOOT - 1 };
    if (!overlaps(me, them)) continue;
    const dx = g.px - sh.x;
    const dy = g.py - sh.y;
    const d = Math.hypot(dx, dy) || 1;
    g.kx = (dx / d) * 90;
    g.ky = (dy / d) * 60;
    if (g.bumpCool <= 0) {
      g.bumps++;
      g.bumpCool = 1.2;
      g.stun = 0.35;
      sh.wait = Math.max(sh.wait, 0.7);
      g.fx.float(sh.x, sh.y - 36, ['HEY!', 'WATCH IT!', 'OOF!', 'EXCUSE ME!'][g.bumps % 4], '#ffffff', 1, 1);
      g.fx.burst((g.px + sh.x) / 2, (g.py + sh.y) / 2 - 6, 8, ['#ffffff', '#f2d048'], 40);
      g.fx.shake(2.5);
      sfx('bad');
    }
  }

  // Coupons.
  for (const c of g.coupons) {
    if (c.taken) continue;
    if (overlaps({ x: me.x, y: me.y - 4, w: me.w, h: me.h + 4 }, { x: c.x - 5, y: c.y - 4, w: 10, h: 7 })) {
      c.taken = true;
      g.couponsGot.push(c.v);
      g.fx.float(c.x, c.y - 30, `COUPON -${dollars(c.v)}!`, '#ffe070', 1, 1.5);
      g.fx.burst(c.x, c.y - 4, 16, ['#ffe070', '#ffffff', '#ef7fae'], 50);
      sfx('star');
    }
  }

  // What can you reach?
  g.near = g.spots.find((sp) => reach(g, sp)) ?? null;
  if (inp.pressed.has('action') && g.near && g.phase === 'play') {
    openPick(g, g.near);
    return;
  }

  // Checkout lane.
  const inLane = g.px >= CHECKOUT.x0 && g.px <= CHECKOUT.x1 && g.py >= CHECKOUT.y;
  if (inLane) {
    const left = g.list.filter((l) => l.got < 0).length;
    if (!left) finish(g, 'ALL DONE!');
    else {
      if (!g.atCheckout && !g.checkoutWarned) {
        g.fx.float(W / 2, 120, `STILL NEED ${left} ITEM${left > 1 ? 'S' : ''}!`, '#ffb070', 1, 1.6);
        g.checkoutWarned = true;
      }
      if (inp.pressed.has('action')) finish(g, 'CHECKED OUT EARLY');
    }
  } else g.checkoutWarned = false;
  g.atCheckout = inLane;
}

// ---------- tap / click ----------
function pickCards(g: G): { panel: Rect; cards: [Rect, Rect] } {
  const py = g.py > 86 ? 6 : 76;
  const panel = { x: 44, y: py, w: 152, h: 68 };
  return {
    panel,
    cards: [
      { x: 48, y: py + 12, w: 70, h: 46 },
      { x: 122, y: py + 12, w: 70, h: 46 },
    ],
  };
}
const inside = (x: number, y: number, r: Rect): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function tap(g: G, x: number, y: number): void {
  if (g.phase === 'pick') {
    const { panel, cards } = pickCards(g);
    if (inside(x, y, cards[0])) choose(g, 0);
    else if (inside(x, y, cards[1])) choose(g, 1);
    else if (!inside(x, y, panel)) {
      g.pick = null;
      g.phase = 'play';
      tap(g, x, y);
    }
    return;
  }
  if (g.phase !== 'play') return;
  // A list item on a shelf: walk over and open it.
  for (const sp of g.spots) {
    const f = sp.face;
    const y0 = f.kind === 'back' ? 4 : f.kind === 'north' ? f.y - 10 : f.y - 10;
    const y1 = f.kind === 'back' ? 28 : f.kind === 'north' ? f.y + 8 : f.y + 8;
    if (inside(x, y, { x: sp.x - 2, y: y0, w: 28, h: y1 - y0 })) {
      if (reach(g, sp)) {
        openPick(g, sp);
        return;
      }
      const [sx, sy] = standFor(sp);
      g.path = findPath(g, sx, sy);
      g.autoPick = g.path ? sp : null;
      if (!g.path && reach(g, sp)) openPick(g, sp);
      return;
    }
  }
  if (inside(x, y, { x: 106, y: 138, w: 30, h: 22 })) {
    g.path = findPath(g, 121, 157);
    g.autoPick = null;
    return;
  }
  g.path = findPath(g, x, y + 3);
  g.autoPick = null;
}

// ---------- drawing ----------
function productIcon(x: Ctx, shape: Shape, c: string, px: number, by: number): void {
  // (px, by) = left, bottom of a ~9px-wide item
  const hi = shade(c, 1.2);
  const lo = shade(c, 0.72);
  switch (shape) {
    case 'box':
      rect(x, px + 1, by - 9, 7, 9, lo);
      rect(x, px + 1, by - 9, 6, 9, c);
      rect(x, px + 1, by - 9, 6, 1, hi);
      rect(x, px + 2, by - 6, 4, 2, '#f8f4ec');
      break;
    case 'jar':
      rect(x, px + 2, by - 9, 5, 2, '#3a3a44');
      rect(x, px + 1, by - 7, 7, 7, c);
      rect(x, px + 1, by - 7, 1, 7, hi);
      rect(x, px + 2, by - 5, 5, 2, '#f8f4ec');
      break;
    case 'bag':
      rect(x, px, by - 8, 9, 8, c);
      rect(x, px + 1, by - 9, 7, 1, shade(c, 0.9));
      rect(x, px, by - 8, 1, 8, hi);
      rect(x, px + 2, by - 5, 5, 2, mix(c, '#ffffff', 0.6));
      rect(x, px + 8, by - 8, 1, 8, lo);
      break;
    case 'can':
      for (let k = 0; k < 2; k++) {
        rect(x, px + k * 4 + 1, by - 6, 3, 6, c);
        rect(x, px + k * 4 + 1, by - 6, 3, 1, '#c8ccd4');
        rect(x, px + k * 4 + 1, by - 4, 3, 2, '#f2efe6');
      }
      break;
    case 'carton':
      rect(x, px, by - 5, 9, 5, '#d8c8a0');
      for (let k = 0; k < 4; k++) rect(x, px + 1 + k * 2, by - 6, 1, 1, c);
      rect(x, px, by - 5, 9, 1, '#efe2c0');
      break;
    case 'tray':
      rect(x, px, by - 4, 10, 4, '#f4f6f8');
      rect(x, px + 1, by - 6, 8, 3, c);
      rect(x, px + 2, by - 6, 3, 1, shade(c, 1.15));
      rect(x, px, by - 1, 10, 1, '#c8ccd4');
      break;
    case 'jug':
      rect(x, px + 1, by - 8, 6, 8, '#f4f6f8');
      rect(x, px + 3, by - 10, 2, 2, '#3f7fd8');
      rect(x, px + 6, by - 7, 2, 3, '#d8dce4');
      rect(x, px + 1, by - 4, 6, 2, '#3f7fd8');
      break;
    case 'loaf':
      rect(x, px, by - 5, 9, 5, c);
      rect(x, px + 1, by - 6, 7, 1, c);
      rect(x, px + 1, by - 6, 6, 1, hi);
      rect(x, px + 2, by - 4, 1, 2, lo);
      rect(x, px + 5, by - 4, 1, 2, lo);
      break;
    case 'fruit':
      disc(x, px + 2, by - 2, 2, c);
      disc(x, px + 6, by - 2, 2, shade(c, 0.9));
      disc(x, px + 4, by - 5, 2, hi);
      break;
  }
}

const FILLER = ['#e0503c', '#f2b632', '#3caa6a', '#3f7fd8', '#ef7fae', '#9a5ad0', '#ff8a1e', '#2fb5b0', '#f2efe6'];

function paintStatic(x: Ctx, g: G): void {
  // floor tiles
  for (let j = 0; j < H; j += 10)
    for (let i = 0; i < W; i += 10) {
      const odd = ((i + j) / 10) & 1;
      rect(x, i, j, 10, 10, odd ? '#e6dfcd' : '#efe9da');
    }
  stipple(x, 0, 0, W, H, '#d8d0bc', 0.08);
  for (let i = 0; i < W; i += 40) stipple(x, i + 8, 0, 20, H, '#fbf8f0', 0.25); // ceiling-light shine
  // entrance mat + doors (bottom left)
  rect(x, 4, 156, 44, 4, '#5a6a7a');
  dither(x, 4, 157, 44, 3, '#4a5868', '#6a7a8a');
  // back wall
  rect(x, 0, 0, W, 22, '#d8d4c8');
  g.faces
    .filter((f) => f.kind === 'back')
    .forEach((f) => {
      const sx = f.x0 - 4;
      const col = SECTION_COLOR[f.sec];
      rect(x, sx, 0, 80, 7, shade(col, 0.85));
      rect(x, sx, 6, 80, 1, shade(col, 0.6));
      say(x, SECTION_SIGN[f.sec], sx + 40, 1, '#ffffff', { align: 'center' });
      if (f.sec === 'produce') {
        // slanted bins
        rect(x, sx + 1, 7, 78, 13, '#7a5232');
        for (let b = 0; b < 6; b++) {
          const bx = sx + 2 + b * 13;
          rect(x, bx, 8, 12, 11, '#5a3a22');
          const pc = ['#3caa6a', '#f2d048', '#e0503c', '#ff8a1e', '#9a5ad0', '#3c8a3a'][(b + f.x0) % 6];
          for (let k = 0; k < 8; k++) disc(x, bx + 2 + (k % 4) * 3, 11 + Math.floor(k / 4) * 4, 1, k % 3 ? pc : shade(pc, 1.2));
        }
      } else {
        // glass-door coolers
        rect(x, sx + 1, 7, 78, 13, '#9fc8e0');
        for (let k = 0; k < 4; k++) {
          const dx = sx + 1 + k * 20;
          rect(x, dx, 7, 1, 13, '#e8ecf0');
          for (let r = 0; r < 2; r++)
            for (let p = 0; p < 4; p++) {
              const c = FILLER[(k * 3 + r * 5 + p + f.x0) % FILLER.length];
              rect(x, dx + 2 + p * 4, 9 + r * 6, 3, 4, f.sec === 'dairy' && p % 2 ? '#f4f6f8' : c);
            }
          rect(x, dx + 1, 13, 19, 1, '#c8d0d8');
        }
        stipple(x, sx + 1, 7, 78, 13, '#e8f6ff', 0.2);
      }
      rect(x, sx, 20, 80, 2, '#8a8a96');
    });
  // islands
  ISLANDS.forEach((isl, i) => {
    const sec = g.faces[3 + i * 2].sec;
    rect(x, isl.x - 1, isl.y - 1, isl.w + 2, isl.h + 2, INK);
    // shelf top, seen from above: a row of product tops along the back edge
    rect(x, isl.x, isl.y, isl.w, 12, '#b8a890');
    rect(x, isl.x, isl.y + 6, isl.w, 1, '#a08e74');
    for (let k = 8; k < isl.w - 8; k += 4) {
      const c = FILLER[(k + i * 7) % FILLER.length];
      rect(x, isl.x + k, isl.y + 1, 3, 4, c);
      rect(x, isl.x + k, isl.y + 1, 3, 1, shade(c, 1.2));
      rect(x, isl.x + k, isl.y + 8, 3, 3, FILLER[(k * 3 + i) % FILLER.length]);
    }
    // front face
    rect(x, isl.x, isl.y + 12, isl.w, 8, '#d8ccb8');
    rect(x, isl.x, isl.y + 12, isl.w, 1, '#efe6d4');
    for (let k = 9; k < isl.w - 9; k += 5) {
      const c = FILLER[(k * 5 + i * 3) % FILLER.length];
      rect(x, isl.x + k, isl.y + 13, 4, 6, c);
      rect(x, isl.x + k, isl.y + 13, 4, 1, shade(c, 1.2));
      rect(x, isl.x + k + 1, isl.y + 15, 2, 2, mix(c, '#ffffff', 0.55));
    }
    rect(x, isl.x, isl.y + 19, isl.w, 1, '#8a7a66');
    for (let k = 10; k < isl.w - 10; k += 8) rect(x, isl.x + k, isl.y + 19, 3, 1, '#f2d048');
    // aisle sign across the middle of the shelf top
    const label = SECTION_SIGN[sec];
    const w = label.length * 4 + 3;
    const cx = isl.x + isl.w / 2;
    rect(x, cx - w / 2 - 1, isl.y + 3, w + 2, 9, INK);
    rect(x, cx - w / 2, isl.y + 4, w, 7, SECTION_COLOR[sec]);
    rect(x, cx - w / 2, isl.y + 4, w, 1, shade(SECTION_COLOR[sec], 1.25));
    say(x, label, cx, isl.y + 5, '#ffffff', { align: 'center' });
  });
  // checkout: register + belt, candy rack, closed lane
  rect(x, REGISTER.x - 1, REGISTER.y - 1, REGISTER.w + 2, REGISTER.h + 1, INK);
  rect(x, REGISTER.x, REGISTER.y, REGISTER.w, REGISTER.h, '#c8ccd4');
  rect(x, REGISTER.x + 14, REGISTER.y, 10, REGISTER.h, '#3a3a44');
  for (let k = REGISTER.y + 1; k < REGISTER.y + REGISTER.h; k += 3) rect(x, REGISTER.x + 15, k, 8, 1, '#4a4a56');
  rect(x, REGISTER.x + 2, REGISTER.y + 2, 9, 6, '#2a2a33');
  rect(x, REGISTER.x + 3, REGISTER.y + 3, 7, 3, '#7ad89a');
  rect(x, CLOSED.x - 1, CLOSED.y - 1, CLOSED.w + 2, CLOSED.h + 1, INK);
  rect(x, CLOSED.x, CLOSED.y, CLOSED.w, CLOSED.h, '#b8bcc4');
  rect(x, CLOSED.x + 2, CLOSED.y + 3, 10, 7, '#c0392b');
  say(x, 'NO', CLOSED.x + 7, CLOSED.y + 4, '#ffffff', { align: 'center' });
  rect(x, CANDY.x - 1, CANDY.y - 1, CANDY.w + 2, CANDY.h + 2, INK);
  rect(x, CANDY.x, CANDY.y, CANDY.w, CANDY.h, '#7a4a8a');
  for (let k = 0; k < 6; k++) rect(x, CANDY.x + 1 + (k % 2) * 3, CANDY.y + 1 + Math.floor(k / 2) * 4, 3, 3, FILLER[k + 1]);
  // floor arrows into the checkout lane
  for (let k = 0; k < 3; k++) rect(x, 120, 140 + k * 6, 2, 3, '#c8c0aa');
}

function drawCart(x: Ctx, cx: number, feet: number, face: -1 | 1, items: string[], t: number, moving: boolean): void {
  const bx = face > 0 ? cx + 1 : cx - 12;
  const by = feet - 11;
  const wob = moving && Math.floor(t * 10) % 2 ? 1 : 0;
  x.fillStyle = 'rgba(16,8,28,0.25)';
  x.fillRect(bx, feet - 1, 12, 2);
  // items poking out of the basket
  items.slice(-6).forEach((c, i) => rect(x, bx + 2 + (i % 3) * 3, by - 1 - Math.floor(i / 3) * 2, 3, 3, c));
  rect(x, bx, by, 12, 7, INK);
  rect(x, bx + 1, by + 1, 10, 5, '#a8b4c0');
  for (let k = 2; k < 11; k += 2) rect(x, bx + k, by + 1, 1, 5, '#d8e0e8');
  rect(x, bx + 1, by + 3, 10, 1, '#d8e0e8');
  // handle toward the shopper
  rect(x, face > 0 ? bx - 2 : bx + 12, by + 1, 2, 1, '#e0503c');
  rect(x, bx + 1, by + 7, 10, 1, '#6a7a88');
  rect(x, bx + 1, by + 8 + wob, 2, 2, INK);
  rect(x, bx + 9, by + 8 + (1 - wob), 2, 2, INK);
}

function drawShopper(x: Ctx, sh: Shopper, t: number): void {
  const moving = sh.wait <= 0;
  drawCart(x, Math.round(sh.x), Math.round(sh.y), sh.face, [], t, moving);
  drawPerson(x, sh.p, Math.round(sh.x) - 7, Math.round(sh.y) - 30, moving ? Math.floor(sh.walk / 5) % 2 : 0, false, { face: sh.face });
}

function bubble(x: Ctx, s: string, cx: number, by: number, bg: string, fg: string): void {
  const w = s.length * 4 + 5;
  const lx = Math.max(1, Math.min(W - w - 1, Math.round(cx - w / 2)));
  rect(x, lx - 1, by - 9, w + 2, 9, INK);
  rect(x, lx, by - 8, w, 7, bg);
  rect(x, Math.round(cx) - 1, by - 1, 3, 1, INK);
  dotTail(x, Math.round(cx), by - 1, bg);
  say(x, s, lx + w / 2, by - 7, fg, { align: 'center' });
}
function dotTail(x: Ctx, cx: number, y: number, c: string): void {
  rect(x, cx, y - 1, 1, 1, c);
  rect(x, cx, y, 1, 1, INK);
}

function draw(x: Ctx, g: G, touch: boolean): void {
  const t = g.t;
  const [ox, oy] = g.fx.offset();
  x.save();
  x.translate(ox, oy);
  x.drawImage(g.bg, 0, 0);

  // Time bar along the top of the back wall.
  const tf = g.time / TIME;
  rect(x, 0, 0, W, 1, '#3a3a44');
  rect(x, 0, 0, Math.round(W * tf), 1, tf > 0.33 ? '#3caa6a' : Math.floor(t * 4) % 2 ? '#e0503c' : '#f2d048');

  // Floor things: coupons.
  for (const c of g.coupons) {
    if (c.taken) continue;
    const bob = g.fx.reduced ? 0 : Math.round(Math.sin(t * 5 + c.x) * 1);
    x.fillStyle = 'rgba(16,8,28,0.2)';
    x.fillRect(c.x - 5, c.y + 1, 10, 1);
    rect(x, c.x - 6, c.y - 6 + bob, 12, 7, INK);
    rect(x, c.x - 5, c.y - 5 + bob, 10, 5, '#fff3c4');
    for (let k = 0; k < 10; k += 2) rect(x, c.x - 5 + k, c.y - 5 + bob, 1, 1, '#e0a030');
    say(x, '$', c.x - 3, c.y - 5 + bob, '#3caa6a');
    rect(x, c.x + 1, c.y - 3 + bob, 3, 1, '#c0392b');
    if (Math.floor(t * 3 + c.x) % 3 === 0) rect(x, c.x + 4, c.y - 8 + bob, 1, 1, '#ffffff');
  }

  // Path preview for tap-to-go.
  if (g.path && g.path.length) {
    const [lx, ly] = g.path[g.path.length - 1];
    const p = Math.floor(t * 6) % 2;
    rect(x, lx - 2 - p, ly - 1, 1, 1, '#3f7fd8');
    rect(x, lx + 2 + p, ly - 1, 1, 1, '#3f7fd8');
    rect(x, lx, ly - 3 - p, 1, 1, '#3f7fd8');
    rect(x, lx, ly + 1 + p, 1, 1, '#3f7fd8');
  }

  // y-sorted: shelf dressing (list items, endcaps) and people.
  type D = { y: number; f: () => void };
  const ds: D[] = [];
  for (const sp of g.spots) {
    const f = sp.face;
    const sortY = f.kind === 'back' ? 22 : f.kind === 'north' ? f.y : f.y - 20;
    ds.push({
      y: sortY,
      f: () => {
        const it = sp.item;
        for (let k = 0; k < 2; k++) {
          const px = sp.x + k * 12 + 1;
          const tagC = it.opts[k].sale ? '#e0503c' : '#f2d048';
          if (f.kind === 'north') {
            rect(x, px, f.y, 10, 6, '#b8a890');
            productIcon(x, it.def.shape, k ? it.def.color : shade(it.def.color, 0.85), px, f.y + 6);
            rect(x, px + 2, f.y + 6, 6, 1, tagC);
          } else if (f.kind === 'south') {
            rect(x, px, f.y - 8, 10, 7, '#d8ccb8');
            productIcon(x, it.def.shape, k ? it.def.color : shade(it.def.color, 0.85), px, f.y - 1);
            rect(x, px + 2, f.y - 1, 6, 1, tagC);
          } else {
            productIcon(x, it.def.shape, k ? it.def.color : shade(it.def.color, 0.85), px, 19);
            rect(x, px + 2, 20, 6, 1, tagC);
          }
        }
      },
    });
  }
  for (const e of [...g.ends, g.candy]) {
    if (e === g.candy) continue;
    ds.push({
      y: e.r.y,
      f: () => {
        const r = e.r;
        if (!e.imp) {
          rect(x, r.x, r.y, r.w, r.h, '#c8ccd4');
          for (let k = 0; k < 4; k++) rect(x, r.x + 1, r.y + 2 + k * 5, 6, 4, '#f4f6f8');
          return;
        }
        const c = e.imp.color;
        rect(x, r.x, r.y, r.w, r.h, '#c0392b');
        rect(x, r.x, r.y + r.h - 3, r.w, 3, '#8a2a20');
        for (let k = 0; k < 5; k++) {
          rect(x, r.x + 1, r.y + 1 + k * 3, 6, 2, k % 2 ? c : shade(c, 1.15));
          rect(x, r.x + 2, r.y + 1 + k * 3, 2, 1, '#ffffff');
        }
      },
    });
  }
  for (const sh of g.shoppers) ds.push({ y: sh.y, f: () => drawShopper(x, sh, t) });
  ds.push({
    y: g.py,
    f: () => {
      const items = g.list.filter((l) => l.got >= 0).map((l) => l.def.color);
      for (const im of g.impulses) items.push(IMPULSES.find((i) => i.name === im.name)?.color ?? CHECKOUT_CANDY.color);
      const blink = g.stun > 0 && !g.fx.reduced && Math.floor(t * 20) % 2 === 0;
      const ring = Math.floor(t * 3) % 2 ? '#f2d048' : '#ffffff';
      rect(x, g.px - 7, g.py + 2, 14, 1, ring);
      rect(x, g.px - 9, g.py, 2, 2, ring);
      rect(x, g.px + 7, g.py, 2, 2, ring);
      rect(x, g.px - 7, g.py - 2, 2, 1, ring);
      rect(x, g.px + 5, g.py - 2, 2, 1, ring);
      if (!blink) {
        drawPerson(x, g.look, Math.round(g.px) - 7, Math.round(g.py) - 30, g.moving ? Math.floor(g.walk / 5) % 2 : 0, false, { face: g.face });
        drawCart(x, Math.round(g.px), Math.round(g.py), g.face, items, t, g.moving);
      }
    },
  });
  // cashier
  ds.push({ y: 150, f: () => drawPerson(x, CASHIER, REGISTER.x + 1, REGISTER.y - 18, Math.floor(t * 1.5) % 2, false, { face: 1, shadow: false }) });
  ds.sort((a, b) => a.y - b.y);
  for (const d of ds) d.f();

  // Impulse signs + temptation bubbles (always on top so you can see them coming).
  for (const e of [...g.ends, g.candy]) {
    if (!e.imp) continue;
    const r = e.r;
    const cx = r.x + r.w / 2;
    const on = Math.floor(t * 4 + r.x) % 2 === 0;
    if (e.cool > 0) {
      say(x, 'SOLD', cx, r.y - 7, '#ffffff', { align: 'center', outline: INK });
      continue;
    }
    const sign = e === g.candy ? 'CANDY' : 'SALE!';
    const sw = sign.length * 4 + 3;
    const shakeX = e.near > 0.2 && !g.fx.reduced ? Math.round(Math.sin(t * 40) * e.near * 1.5) : 0;
    rect(x, cx - sw / 2 - 1 + shakeX, r.y - 9, sw + 2, 9, INK);
    rect(x, cx - sw / 2 + shakeX, r.y - 8, sw, 7, on ? '#f2d048' : '#e0503c');
    say(x, sign, cx + shakeX, r.y - 7, on ? '#c0392b' : '#ffffff', { align: 'center' });
    if (e.near > 0) {
      bubble(x, `${e.imp.name} ${e.imp.pitch}`, cx, r.y - 11, '#ffffff', '#c0392b');
      // pull lines
      if (!g.fx.reduced) {
        const ph = (t * 3) % 1;
        const mx = g.px + (cx - g.px) * ph;
        const my = g.py - 4 + (r.y + r.h / 2 - g.py + 4) * ph;
        rect(x, mx, my, 1, 1, '#e0503c');
      }
    }
  }

  // List markers: bobbing arrows over what you still need.
  for (const sp of g.spots) {
    const f = sp.face;
    const cx = sp.x + 12;
    const bob = g.fx.reduced ? 0 : Math.round(Math.sin(t * 6 + sp.x * 0.3) * 1.5);
    const near = g.near === sp;
    const c = near ? '#ffffff' : '#f2d048';
    if (f.kind === 'south') {
      // up arrow under the shelf
      const ty = f.y + 2 - bob;
      rect(x, cx - 1, ty - 1, 3, 2, INK);
      rect(x, cx - 3, ty + 1, 7, 4, INK);
      rect(x, cx, ty, 1, 1, c);
      rect(x, cx - 1, ty + 1, 3, 1, c);
      rect(x, cx - 2, ty + 2, 5, 2, c);
    } else {
      const ty = (f.kind === 'back' ? 8 : f.y - 9) + bob;
      rect(x, cx - 3, ty - 1, 7, 4, INK);
      rect(x, cx - 2, ty, 5, 2, c);
      rect(x, cx - 1, ty + 2, 3, 2, INK);
      rect(x, cx - 1, ty + 2, 3, 1, c);
      rect(x, cx, ty + 3, 1, 1, c);
    }
    if (near) {
      x.strokeStyle = Math.floor(t * 6) % 2 ? '#ffffff' : '#f2d048';
      x.lineWidth = 1;
      const fy = f.kind === 'north' ? f.y - 4 : f.kind === 'back' ? 8 : f.y - 10;
      x.strokeRect(sp.x - 0.5, fy - 0.5, 26, f.kind === 'back' ? 14 : 11);
    }
  }

  // Prompt over the player.
  if (g.phase === 'play' && g.near) bubble(x, `${g.near.item.def.short}: ${touch ? 'TAP GRAB' : 'SPACE'}`, g.px, g.py - 32, '#f2d048', INK);
  if (g.phase === 'play' && g.atCheckout && g.list.some((l) => l.got < 0)) bubble(x, touch ? 'GRAB = PAY ANYWAY' : 'SPACE = PAY ANYWAY', g.px, g.py - 32, '#ffb070', INK);

  // Checkout beacon once the list is done.
  if (g.phase === 'play' && g.list.every((l) => l.got >= 0)) {
    const b = g.fx.reduced ? 0 : Math.round(Math.sin(t * 8) * 2);
    say(x, 'PAY HERE', 121, 128 + b, '#f2d048', { align: 'center', outline: INK });
    rect(x, 120, 136 + b, 3, 3, '#f2d048');
    rect(x, 119, 138 + b, 5, 1, '#f2d048');
  }

  g.fx.drawParts(x);
  g.fx.drawFloats(x, W);
  x.restore();
  g.fx.drawFlash(x, W, H);

  if (g.phase === 'pick' && g.pick) drawPicker(x, g, touch);
  if (g.phase === 'count') drawCount(x, g);
  if (g.phase === 'receipt') drawReceipt(x, g, touch);
}

const CASHIER: Person = { skin: SKINS[3], hair: HAIRS[1], style: 5, shirt: '#f2efe6', pants: '#3a3a4a', apron: '#3caa6a', badge: true, shortSleeves: true };

function drawPicker(x: Ctx, g: G, touch: boolean): void {
  const it = g.pick!.item;
  const { panel, cards } = pickCards(g);
  rect(x, panel.x - 1, panel.y - 1, panel.w + 2, panel.h + 2, INK);
  rect(x, panel.x, panel.y, panel.w, panel.h, '#fff8e6');
  rect(x, panel.x, panel.y, panel.w, 10, '#3caa6a');
  say(x, it.def.name.toUpperCase(), panel.x + panel.w / 2, panel.y + 2, '#ffffff', { align: 'center' });
  for (let k = 0; k < 2; k++) {
    const o = it.opts[k];
    const c = cards[k];
    const sel = g.sel === k;
    const other = it.opts[1 - k];
    rect(x, c.x - 1, c.y - 1, c.w + 2, c.h + 2, sel ? '#f2b632' : INK);
    if (sel) rect(x, c.x - 2, c.y - 2, c.w + 4, c.h + 4, '#f2b632');
    rect(x, c.x, c.y, c.w, c.h, sel ? '#fff3c4' : '#ffffff');
    // product, big
    x.save();
    x.translate(c.x + 4, c.y + 4);
    x.scale(2, 2);
    productIcon(x, it.def.shape, k === 0 ? shade(it.def.color, 0.9) : it.def.color, 0, 10);
    x.restore();
    say(x, o.tag, c.x + c.w / 2 + 8, c.y + 3, '#5a4a6a', { align: 'center' });
    // price tag
    const tagC = o.sale ? '#e0503c' : '#f2d048';
    rect(x, c.x + 24, c.y + 11, 44, 16, INK);
    rect(x, c.x + 25, c.y + 12, 42, 14, tagC);
    say(x, dollars(o.price), c.x + 46, c.y + 14, o.sale ? '#ffffff' : INK, { align: 'center', scale: 2 });
    say(x, unitPrice(o, it.def), c.x + c.w / 2, c.y + 30, '#5a4a6a', { align: 'center' });
    if (o.sale) {
      rect(x, c.x - 3, c.y - 4, 23, 9, INK);
      rect(x, c.x - 2, c.y - 3, 21, 7, '#e0503c');
      say(x, 'SALE', c.x + 8, c.y - 2, '#ffffff', { align: 'center' });
    }
    if (o.price < other.price) {
      rect(x, c.x + 2, c.y + 37, c.w - 4, 7, '#3caa6a');
      say(x, `SAVE ${dollars(other.price - o.price)}`, c.x + c.w / 2, c.y + 38, '#ffffff', { align: 'center' });
    }
  }
  const hint = touch ? 'TAP ONE   (WALK AWAY TO CANCEL)' : g.sel < 0 ? 'LEFT/RIGHT: PICK   UP/DOWN: CANCEL' : 'SPACE: INTO THE CART';
  say(x, hint, panel.x + panel.w / 2, panel.y + panel.h - 8, '#5a4a6a', { align: 'center' });
}

function drawCount(x: Ctx, g: G): void {
  const n = 3 - Math.floor(g.pt);
  const f = g.pt % 1;
  x.fillStyle = 'rgba(20,12,36,0.45)';
  x.fillRect(0, 0, W, H);
  const s = n > 0 ? String(n) : 'GO!';
  const scale = g.fx.reduced ? 6 : Math.max(5, Math.round(9 - f * 4));
  say(x, s, W / 2, 60 - scale * 2.5, n > 0 ? '#ffffff' : '#7ad89a', { scale, shadow: INK, align: 'center' });
  say(x, 'GET EVERYTHING ON YOUR LIST', W / 2, 92, '#f2d048', { outline: INK, align: 'center' });
  say(x, 'SKIP THE SALE DISPLAYS', W / 2, 101, '#ffffff', { outline: INK, align: 'center' });
  say(x, 'YOU', g.px, g.py - 44 + (g.fx.reduced ? 0 : Math.round(Math.sin(g.t * 8))), '#f2d048', { outline: INK, align: 'center' });
}

const receiptTime = (g: G): number => 0.7 + (g.list.length + g.impulses.length + (g.couponsGot.length ? 1 : 0)) * 0.09 + 0.3;
const receiptReady = (g: G): boolean => g.phase === 'receipt' && g.pt > receiptTime(g) + 0.4;

function drawReceipt(x: Ctx, g: G, touch: boolean): void {
  x.fillStyle = 'rgba(20,12,36,0.55)';
  x.fillRect(0, 0, W, H);
  const T = tripTotals({ list: g.list, impulses: g.impulses, coupons: g.couponsGot, couponsTotal: g.coupons.length, bumps: g.bumps });
  const lines: [string, string, string][] = [];
  for (const l of g.list) {
    if (l.got < 0) lines.push([l.def.short, 'MISSED', '#c0392b']);
    else lines.push([l.def.short, dollars(l.opts[l.got as 0 | 1].price), '#2a2a33']);
  }
  for (const im of g.impulses) lines.push([im.name, dollars(im.price), '#c0392b']);
  if (T.coupons) lines.push(['COUPONS', `-${dollars(T.coupons)}`, '#2f8a4a']);
  const pw = 112;
  const ph = 26 + lines.length * 7 + 22;
  const slide = g.fx.reduced ? 1 : Math.min(1, g.pt / 0.6);
  const top = Math.round((H - ph) / 2 + (1 - slide) * (H - (H - ph) / 2));
  const lx = (W - pw) / 2;
  rect(x, lx - 1, top - 1, pw + 2, ph + 2, INK);
  rect(x, lx, top, pw, ph, '#fbfaf4');
  for (let k = 0; k < pw; k += 4) rect(x, lx + k, top + ph, 2, 1, '#fbfaf4');
  say(x, g.endWhy, lx + pw / 2, top + 3, '#c0392b', { align: 'center' });
  say(x, 'FRESH FIELDS MKT', lx + pw / 2, top + 11, '#5a4a6a', { align: 'center' });
  for (let k = 0; k < pw - 8; k += 2) rect(x, lx + 4 + k, top + 18, 1, 1, '#a8a0b0');
  lines.forEach(([a, b, c], i) => {
    const y = top + 21 + i * 7;
    if (g.pt < 0.6 + i * 0.09) return;
    say(x, a, lx + 5, y, c);
    say(x, b, lx + pw - 5, y, c, { align: 'right' });
  });
  const ty = top + 22 + lines.length * 7;
  for (let k = 0; k < pw - 8; k += 2) rect(x, lx + 4 + k, ty, 1, 1, '#a8a0b0');
  if (g.pt > 0.7 + lines.length * 0.09) {
    say(x, 'TOTAL', lx + 5, ty + 3, INK);
    say(x, dollars(T.total), lx + pw - 5, ty + 3, INK, { align: 'right' });
    const saved = T.brandAll - T.paid;
    say(x, saved > 0.5 ? `SMART PICKS SAVED ${dollars(saved)}` : 'TIP: COMPARE THE TAGS', lx + pw / 2, ty + 11, '#2f8a4a', { align: 'center' });
  }
  if (receiptReady(g)) say(x, touch ? 'TAP TO FINISH' : 'SPACE TO FINISH', W / 2, H - 8, '#ffffff', { align: 'center', outline: INK });
}

// ---------- component ----------
export function Grocery({ s, onDone, reducedMotion }: MiniProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useInput();
  const game = useRef<G | null>(null);
  if (!game.current) game.current = setup(playerPerson(s.look), reducedMotion);
  const touch = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);
  const [hud, setHud] = useState('');
  const doneRef = useRef(false);

  const sendDone = (g: G): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone({ score: g.score, stats: g.stats });
  };

  useLoop(
    (dt) => {
      const g = game.current!;
      step(g, dt, input);
      if (g.phase === 'receipt' && ((receiptReady(g) && input.pressed.has('action')) || g.pt > receiptTime(g) + 4.5)) sendDone(g);
      const x = ctxOf(canvas.current);
      if (x) draw(x, g, touch.current);
      const key = `${Math.ceil(g.time)}|${g.list.map((l) => l.got).join('')}|${g.impulses.length}|${g.couponsGot.length}|${g.phase === 'receipt'}|${!!g.near}`;
      if (key !== hud) setHud(key);
    },
    true,
    input,
  );

  const g = game.current;
  const T = tripTotals({ list: g.list, impulses: g.impulses, coupons: g.couponsGot, couponsTotal: g.coupons.length, bumps: g.bumps });
  const secs = Math.ceil(g.time);
  const allGot = g.list.every((l) => l.got >= 0);
  return (
    <div className="mini gh-mini">
      <MiniHud
        items={[
          { label: 'Time', value: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, warn: secs <= 15 },
          { label: 'Cart total', value: dollars(T.total) },
          { label: 'Impulse buys', value: g.impulses.length, warn: g.impulses.length > 0 },
          { label: 'Coupons', value: `${g.couponsGot.length}/${g.coupons.length}` },
        ]}
      />
      <ul className="gh-list" aria-label="Shopping list">
        {g.list.map((l) => (
          <li key={l.def.id} className={l.got >= 0 ? 'got' : ''}>
            <span className="gh-check" aria-hidden="true">
              {l.got >= 0 ? '✓' : ''}
            </span>
            {l.def.name}
            {l.got >= 0 && <em>{dollars(l.opts[l.got as 0 | 1].price)}</em>}
          </li>
        ))}
        {allGot && g.phase !== 'receipt' && <li className="go">→ Checkout!</li>}
      </ul>
      <div className="gh-canvas" style={{ '--ar': String(W / H) } as CSSProperties}>
        <PixelCanvas
          canvasRef={canvas}
          width={W}
          height={H}
          onPointer={(px, py, kind) => {
            if (kind !== 'down') return;
            const gg = game.current!;
            if (gg.phase === 'receipt') {
              if (receiptReady(gg)) sendDone(gg);
              return;
            }
            tap(gg, px, py);
          }}
        />
      </div>
      <GhPad input={input} action="GRAB" glow={!!g.near && g.phase === 'play'} />
      <p className="mini-note gh-keys">Arrows/WASD push the cart · SPACE grabs · or click where to go</p>
    </div>
  );
}

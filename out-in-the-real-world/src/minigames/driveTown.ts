// Delivery Rush: a little top-down town. Simulation (pure) + renderer. React shell: Delivery.tsx.
import { drawPerson, type Person } from '../art/people.ts';
import { disc, dither, glow, hash, INK, outlineRect, rect, shade, text, type Ctx } from '../art/px.ts';
import { bigText, clamp, drawVehicle, Fx, lerp, outlinedText, type VehicleLook } from './driveKit.tsx';

export const VW = 192;
export const VH = 144;
export const TW = 336; // world size
export const TH = 216;
export const VX = [24, 120, 216, 312]; // vertical road centers
export const HY = [24, 108, 192]; // horizontal road centers
const RH = 9; // half road width
const LANE = 4.5;
export const SHIFT = 60; // seconds

type Dir = 0 | 1 | 2 | 3; // N E S W
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Slot {
  i: number;
  px: number; // pad on the road
  py: number;
  dx: number; // door on the block edge
  dy: number;
  face: -1 | 1; // -1 faces the road above, 1 the road below
  rest: number; // -1 = house
  roof: string;
  doorC: string;
}

export const RESTS = [
  { name: 'PIZZA', label: 'Pizza Pals', icon: '🍕', c: '#e0503c', awn: '#f2efe6' },
  { name: 'TACOS', label: 'Taco Town', icon: '🌮', c: '#f2b632', awn: '#3caa6a' },
  { name: 'SUSHI', label: 'Sushi Spot', icon: '🍣', c: '#2fb5b0', awn: '#e0503c' },
];

const ORDER_COLORS = ['#ff5a4a', '#4a9aff', '#ffd23a', '#c07aff', '#3ae0b0', '#ff8ad0'];
const ROOFS = ['#b0503c', '#5a6a8a', '#7a5a3a', '#3a7a6a', '#8a4a6a', '#a87a3a', '#6a7a3a'];
const DOORS = ['#3f7fd8', '#e0503c', '#3caa6a', '#f2b632', '#9a5ad0', '#ef7fae'];

// Speed trap: bottom road under the middle-bottom block.
export const TRAP = { x: 138, y: HY[2] - RH, w: 60, h: RH * 2 };
const COP = { x: 168, y: HY[2] + 15 };

function blockRect(i: number, j: number): Box {
  return { x: VX[i] + RH, y: HY[j] + RH, w: VX[i + 1] - VX[i] - RH * 2, h: HY[j + 1] - HY[j] - RH * 2 };
}

let SLOTS: Slot[] | null = null;
export function slots(): Slot[] {
  if (SLOTS) return SLOTS;
  const out: Slot[] = [];
  const restAt: Record<string, number> = { '0,0,-1,0': 0, '2,0,1,1': 1, '0,1,1,1': 2 };
  let n = 0;
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 3; i++) {
      if (i === 1 && j === 0) continue; // the park
      const b = blockRect(i, j);
      for (const face of [-1, 1] as const)
        for (let k = 0; k < 2; k++) {
          const x = b.x + (k === 0 ? 20 : 58);
          const rest = restAt[`${i},${j},${face},${k}`] ?? -1;
          out.push({
            i: n,
            px: x,
            py: face < 0 ? HY[j] + LANE : HY[j + 1] - LANE,
            dx: x,
            dy: face < 0 ? b.y : b.y + b.h,
            face,
            rest,
            roof: ROOFS[Math.floor(hash(n * 7 + 3) * ROOFS.length)],
            doorC: DOORS[n % DOORS.length],
          });
          n++;
        }
    }
  SLOTS = out;
  return out;
}

export function restSlot(r: number): Slot {
  return slots().find((s) => s.rest === r)!;
}

function solids(bike: boolean): Box[] {
  const out: Box[] = [
    { x: 0, y: 0, w: TW, h: HY[0] - RH },
    { x: 0, y: HY[2] + RH, w: TW, h: TH - HY[2] - RH },
    { x: 0, y: 0, w: VX[0] - RH, h: TH },
    { x: VX[3] + RH, y: 0, w: TW - VX[3] - RH, h: TH },
  ];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 3; i++) {
      const b = blockRect(i, j);
      if (i === 1 && j === 0 && bike) {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        out.push({ x: b.x, y: b.y, w: cx - 6 - b.x, h: cy - 6 - b.y });
        out.push({ x: cx + 6, y: b.y, w: b.x + b.w - cx - 6, h: cy - 6 - b.y });
        out.push({ x: b.x, y: cy + 6, w: cx - 6 - b.x, h: b.y + b.h - cy - 6 });
        out.push({ x: cx + 6, y: cy + 6, w: b.x + b.w - cx - 6, h: b.y + b.h - cy - 6 });
      } else out.push(b);
    }
  return out;
}

// ---------- state ----------
export interface Order {
  id: number;
  color: string;
  rest: number;
  slot: number;
  state: 'wait' | 'carry' | 'done' | 'fail';
  t: number;
  T: number;
  spill: number;
  pay: number;
}

interface Ai {
  id: number;
  x: number;
  y: number;
  dir: Dir;
  v: number;
  vt: number;
  look: VehicleLook;
  decided: string;
  turn: number;
  honk: number;
}

interface Pothole {
  x: number;
  y: number;
  r: number;
}

export type SayKind = 'info' | 'good' | 'mark' | 'cmd';

export interface TownSim {
  bike: boolean;
  t: number;
  gt: number;
  phase: 'count' | 'play' | 'end';
  endT: number;
  p: { x: number; y: number; vx: number; vy: number; ang: number; stun: number; hitCd: number };
  vmax: number;
  cap: number;
  orders: Order[];
  nextId: number;
  orderT: number;
  colorI: number;
  ai: Ai[];
  holes: Pothole[];
  holeCd: number;
  earned: number;
  delivered: number;
  missed: number;
  crashes: number;
  bumps: number;
  ticket: boolean;
  trapAcc: number;
  sirenT: number;
  say: { text: string; kind: SayKind; t: number };
  events: { e: 'pickup' | 'drop' | 'fail' | 'crash' | 'hole' | 'ticket' | 'go' | 'end' | 'new'; x?: number; y?: number; s?: string; c?: string }[];
  customers: { x: number; y: number; t: number; c: string }[];
  solids: Box[];
  rand: () => number;
  score: number;
}

function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = ['#e0503c', '#3caa6a', '#f2b632', '#9a5ad0', '#eeeae0', '#2fb5b0', '#c87a3a', '#5a6a8a', '#ef7fae'];

// What a near-perfect shift earns; score = earned / REF (calibrated with a bot that plays well).
export const REF = { car: 110, bike: 80 };
export const PAY = { car: { base: 6, tip: 8 }, bike: { base: 5, tip: 6 } };

export function newTown(bike: boolean, seed = Math.floor(Math.random() * 1e9)): TownSim {
  const rnd = mulberry(seed);
  const g: TownSim = {
    bike,
    t: 0,
    gt: 0,
    phase: 'count',
    endT: 0,
    p: { x: VX[1] + LANE, y: HY[1] + 20, vx: 0, vy: 0, ang: 0, stun: 0, hitCd: 0 },
    vmax: bike ? 54 : 66,
    cap: bike ? 2 : 3,
    orders: [],
    nextId: 1,
    orderT: 0,
    colorI: 0,
    ai: [],
    holes: [],
    holeCd: 0,
    earned: 0,
    delivered: 0,
    missed: 0,
    crashes: 0,
    bumps: 0,
    ticket: false,
    trapAcc: 0,
    sirenT: 0,
    say: { text: 'Orders are coming in. Grab the first one!', kind: 'cmd', t: 0 },
    events: [],
    customers: [],
    solids: solids(bike),
    rand: rnd,
    score: 0,
  };
  // potholes on mid-segments
  const cands: Pothole[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) for (const f of [0.3, 0.7]) cands.push({ x: lerp(VX[i] + 14, VX[i + 1] - 14, f), y: HY[j] + (hash(i * 9 + j * 5 + f * 10) < 0.5 ? -LANE : LANE), r: 3 });
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 2; j++) for (const f of [0.5]) cands.push({ x: VX[i] + (hash(i * 3 + j) < 0.5 ? -LANE : LANE), y: lerp(HY[j] + 14, HY[j + 1] - 14, f), r: 3 });
  const pool = cands.filter((c) => !(c.x > TRAP.x - 10 && c.x < TRAP.x + TRAP.w + 10 && Math.abs(c.y - HY[2]) < 10));
  for (let k = 0; k < 7 && pool.length; k++) g.holes.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  for (let k = 0; k < 4; k++) spawnAi(g, true);
  return g;
}

// ---------- orders ----------
function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function newOrder(g: TownSim): void {
  const all = slots();
  const busyRest = new Set(g.orders.filter((o) => o.state === 'wait').map((o) => o.rest));
  const busyDoor = new Set(g.orders.filter((o) => o.state === 'wait' || o.state === 'carry').map((o) => o.slot));
  const rests = [0, 1, 2].filter((r) => !busyRest.has(r) || g.rand() < 0.3);
  const rest = rests[Math.floor(g.rand() * rests.length)] ?? Math.floor(g.rand() * 3);
  const rs = restSlot(rest);
  const doors = all.filter((s) => s.rest < 0 && !busyDoor.has(s.i) && manhattan(s.px, s.py, rs.px, rs.py) > 70);
  const door = doors[Math.floor(g.rand() * doors.length)];
  if (!door) return;
  const dist = manhattan(g.p.x, g.p.y, rs.px, rs.py) * 0.6 + manhattan(rs.px, rs.py, door.px, door.py) + 40;
  const slack = lerp(2.5, 1.75, clamp(g.gt / SHIFT, 0, 1));
  const T = Math.round((dist / (g.vmax * 0.85)) * slack + 6);
  const color = ORDER_COLORS[g.colorI++ % ORDER_COLORS.length];
  g.orders.push({ id: g.nextId++, color, rest, slot: door.i, state: 'wait', t: T, T, spill: 1, pay: 0 });
  g.events.push({ e: 'new' });
  say(g, `New order at ${RESTS[rest].label}!`, 'info');
}

function say(g: TownSim, text: string, kind: SayKind): void {
  g.say = { text, kind, t: g.t };
}

export function activeOrders(g: TownSim): Order[] {
  return g.orders.filter((o) => o.state === 'wait' || o.state === 'carry');
}

// ---------- AI traffic ----------
function laneCoord(dir: Dir, idx: number): number {
  // for N/S: idx is the vertical road; for E/W: the horizontal road
  if (dir === 0) return VX[idx] + LANE;
  if (dir === 2) return VX[idx] - LANE;
  if (dir === 1) return HY[idx] + LANE;
  return HY[idx] - LANE;
}

function spawnAi(g: TownSim, anywhere = false): void {
  for (let tries = 0; tries < 20; tries++) {
    const vert = g.rand() < 0.5;
    const dir = (vert ? (g.rand() < 0.5 ? 0 : 2) : g.rand() < 0.5 ? 1 : 3) as Dir;
    let x: number;
    let y: number;
    if (vert) {
      const i = Math.floor(g.rand() * 4);
      x = laneCoord(dir, i);
      const j = Math.floor(g.rand() * 2);
      y = lerp(HY[j] + 14, HY[j + 1] - 14, g.rand());
    } else {
      const j = Math.floor(g.rand() * 3);
      y = laneCoord(dir, j);
      const i = Math.floor(g.rand() * 3);
      x = lerp(VX[i] + 14, VX[i + 1] - 14, g.rand());
    }
    const far = Math.hypot(x - g.p.x, y - g.p.y) > (anywhere ? 50 : 100);
    const free = g.ai.every((a) => Math.hypot(a.x - x, a.y - y) > 26);
    if (!far || !free) continue;
    const kinds: VehicleLook['kind'][] = ['sedan', 'sedan', 'hatch', 'van', 'taxi'];
    const kind = kinds[Math.floor(g.rand() * kinds.length)];
    g.ai.push({ id: g.nextId++, x, y, dir, v: 30, vt: 32 + g.rand() * 8, look: { kind, body: kind === 'taxi' ? '#f2c84a' : PALETTE[Math.floor(g.rand() * PALETTE.length)], bag: '#e0503c' }, decided: '', turn: -1, honk: 0 });
    return;
  }
}

function aiBox(a: Ai): Box {
  const along = 7.5;
  const across = 5;
  return a.dir % 2 === 0 ? { x: a.x - across, y: a.y - along, w: across * 2, h: along * 2 } : { x: a.x - along, y: a.y - across, w: along * 2, h: across * 2 };
}

function hit(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function stepAi(g: TownSim, dt: number): void {
  const want = Math.min(8, 4 + Math.floor(g.gt / 12));
  if (g.phase === 'play' && g.ai.length < want && g.rand() < dt * 2) spawnAi(g);
  const pb = playerBox(g, 1);
  for (const a of g.ai) {
    a.honk = Math.max(0, a.honk - dt);
    const dx = DX[a.dir];
    const dy = DY[a.dir];
    let blocked = false;
    // other cars ahead in my lane
    for (const o of g.ai) {
      if (o === a) continue;
      const fwd = (o.x - a.x) * dx + (o.y - a.y) * dy;
      const lat = Math.abs((o.x - a.x) * dy - (o.y - a.y) * dx);
      if (fwd > 0 && fwd < 18 && lat < 5) blocked = true;
    }
    // the player ahead
    const pcx = pb.x + pb.w / 2;
    const pcy = pb.y + pb.h / 2;
    const pf = (pcx - a.x) * dx + (pcy - a.y) * dy;
    const pl = Math.abs((pcx - a.x) * dy - (pcy - a.y) * dx);
    if (pf > 0 && pf < 17 && pl < 8) {
      blocked = true;
      if (a.v > 10 && a.honk <= 0) a.honk = 1;
    }
    // intersections: decide a turn, wait if someone is inside
    const ii = nearestIntersection(a);
    if (ii) {
      const [i, j, cx, cy, along] = ii;
      const key = `${i},${j}`;
      if (a.decided !== key && along < 16 && along > 6) {
        a.decided = key;
        const opts: number[] = [];
        const ok = (d: number) => (d === 0 ? j > 0 : d === 2 ? j < 2 : d === 3 ? i > 0 : i < 3);
        if (ok(a.dir)) opts.push(a.dir, a.dir);
        if (ok((a.dir + 1) % 4)) opts.push((a.dir + 1) % 4);
        if (ok((a.dir + 3) % 4)) opts.push((a.dir + 3) % 4);
        a.turn = opts[Math.floor(g.rand() * opts.length)];
        if (a.turn === a.dir) a.turn = -1;
      }
      if (along > RH && along < RH + 4) {
        const occupied = g.ai.some((o) => o !== a && Math.abs(o.x - cx) < RH && Math.abs(o.y - cy) < RH);
        if (occupied) blocked = true;
      }
      if (a.turn >= 0 && a.decided === key) {
        const nd = a.turn as Dir;
        if (nd % 2 === 1) {
          const ty = cy + (nd === 1 ? LANE : -LANE);
          if ((a.dir === 0 && a.y <= ty) || (a.dir === 2 && a.y >= ty)) {
            a.y = ty;
            a.dir = nd;
            a.turn = -1;
          }
        } else {
          const tx = cx + (nd === 0 ? LANE : -LANE);
          if ((a.dir === 1 && a.x >= tx) || (a.dir === 3 && a.x <= tx)) {
            a.x = tx;
            a.dir = nd;
            a.turn = -1;
          }
        }
      }
    }
    if (blocked) a.v = Math.max(0, a.v - 140 * dt);
    else a.v = Math.min(a.vt, a.v + 40 * dt);
    a.x += DX[a.dir] * a.v * dt;
    a.y += DY[a.dir] * a.v * dt;
    // safety: never leave the road grid
    a.x = clamp(a.x, VX[0] - RH, VX[3] + RH);
    a.y = clamp(a.y, HY[0] - RH, HY[2] + RH);
  }
}

// The intersection ahead of (or under) a car: [i, j, cx, cy, distance-to-center along travel]
function nearestIntersection(a: Ai): [number, number, number, number, number] | null {
  let best: [number, number, number, number, number] | null = null;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const cx = VX[i];
      const cy = HY[j];
      const along = (cx - a.x) * DX[a.dir] + (cy - a.y) * DY[a.dir];
      const lat = Math.abs((cx - a.x) * DY[a.dir] - (cy - a.y) * DX[a.dir]);
      if (lat > RH || along < -RH) continue;
      if (!best || along < best[4]) best = [i, j, cx, cy, along];
    }
  return best;
}

// ---------- player ----------
export function playerBox(g: TownSim, grow = 0): Box {
  const h = (g.bike ? 3 : 4.5) + grow;
  return { x: g.p.x - h, y: g.p.y - h, w: h * 2, h: h * 2 };
}

export function blockedAt(g: TownSim, x: number, y: number): boolean {
  const h = g.bike ? 3 : 4.5;
  const b = { x: x - h, y: y - h, w: h * 2, h: h * 2 };
  return g.solids.some((s) => hit(b, s));
}

export interface TownControls {
  ix: number; // desired direction (-1..1)
  iy: number;
  throttle: number; // 0..1
  slow: boolean;
}

export function stepTown(g: TownSim, c: TownControls, dt: number): void {
  g.t += dt;
  if (g.phase === 'count') {
    if (g.t >= 3.6) {
      g.phase = 'play';
      g.events.push({ e: 'go' });
      newOrder(g);
      newOrder(g);
      g.orderT = 3;
    }
    return;
  }
  const p = g.p;
  if (g.phase === 'play') {
    g.gt += dt;
    if (g.gt >= SHIFT) {
      g.phase = 'end';
      g.endT = 0;
      g.score = clamp(g.earned / (g.bike ? REF.bike : REF.car), 0, 1);
      g.events.push({ e: 'end' });
      say(g, `Shift over! ${g.delivered} deliveries.`, g.delivered >= 4 ? 'good' : 'info');
    }
  } else g.endT += dt;

  // ---- movement ----
  const live = g.phase === 'play' && p.stun <= 0;
  p.stun = Math.max(0, p.stun - dt);
  p.hitCd = Math.max(0, p.hitCd - dt);
  let tx = 0;
  let ty = 0;
  const mag = Math.hypot(c.ix, c.iy);
  if (live && mag > 0.01) {
    const top = g.vmax * clamp(c.throttle, 0, 1) * (c.slow ? 0.42 : 1);
    tx = (c.ix / mag) * top;
    ty = (c.iy / mag) * top;
  }
  const rate = mag > 0.01 && live ? (g.bike ? 5 : 3.6) : c.slow ? 7 : 2.6;
  p.vx += (tx - p.vx) * Math.min(1, rate * dt);
  p.vy += (ty - p.vy) * Math.min(1, rate * dt);
  // move with collision + corner assist
  const nx = p.x + p.vx * dt;
  if (!blockedAt(g, nx, p.y)) p.x = nx;
  else {
    const nudge = cornerNudge(g, nx, p.y, 'y');
    if (nudge !== 0 && Math.abs(c.ix) > 0.3) p.y += Math.sign(nudge) * Math.min(Math.abs(nudge), 50 * dt);
    p.vx *= -0.15;
  }
  const ny = p.y + p.vy * dt;
  if (!blockedAt(g, p.x, ny)) p.y = ny;
  else {
    const nudge = cornerNudge(g, p.x, ny, 'x');
    if (nudge !== 0 && Math.abs(c.iy) > 0.3) p.x += Math.sign(nudge) * Math.min(Math.abs(nudge), 50 * dt);
    p.vy *= -0.15;
  }
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 4) {
    const want = Math.atan2(p.vx, -p.vy);
    let d = want - p.ang;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.ang += d * Math.min(1, dt * 12);
  }

  stepAi(g, dt);
  if (g.phase !== 'play') return;

  // ---- traffic collisions ----
  const pb = playerBox(g);
  for (const a of g.ai) {
    if (p.hitCd > 0) break;
    const ab = aiBox(a);
    if (!hit(pb, ab)) continue;
    p.hitCd = 1;
    p.stun = 0.45;
    const ax = p.x - a.x;
    const ay = p.y - a.y;
    const l = Math.hypot(ax, ay) || 1;
    p.vx = (ax / l) * 50;
    p.vy = (ay / l) * 50;
    a.v = 0;
    a.honk = 1.4;
    g.crashes++;
    spill(g, 0.25);
    g.events.push({ e: 'crash', x: p.x, y: p.y });
    say(g, 'BONK! Watch the traffic. Spilled some food…', 'mark');
  }
  // ---- potholes ----
  g.holeCd = Math.max(0, g.holeCd - dt);
  for (const h of g.holes) {
    if (g.holeCd > 0) break;
    if (Math.hypot(p.x - h.x, p.y - h.y) < h.r + 2 && sp > g.vmax * 0.35) {
      g.holeCd = 0.8;
      p.vx *= 0.35;
      p.vy *= 0.35;
      p.stun = 0.2;
      g.bumps++;
      spill(g, 0.15);
      g.events.push({ e: 'hole', x: h.x, y: h.y });
      say(g, 'Pothole! The drinks sloshed.', 'mark');
    }
  }
  // ---- speed trap ----
  const inTrap = p.x > TRAP.x && p.x < TRAP.x + TRAP.w && p.y > TRAP.y && p.y < TRAP.y + TRAP.h;
  if (inTrap && sp > g.vmax * 0.7 && !g.ticket) {
    g.trapAcc += dt;
    if (g.trapAcc > 0.25) {
      g.ticket = true;
      g.sirenT = 3;
      g.events.push({ e: 'ticket', x: p.x, y: p.y });
      say(g, `Busted! Speeding ticket in the SLOW zone.`, 'mark');
    }
  } else g.trapAcc = Math.max(0, g.trapAcc - dt);
  g.sirenT = Math.max(0, g.sirenT - dt);

  // ---- orders ----
  for (const o of g.orders) {
    if (o.state !== 'wait' && o.state !== 'carry') continue;
    o.t -= dt;
    if (o.t <= 0) {
      o.state = 'fail';
      g.missed++;
      g.events.push({ e: 'fail', x: p.x, y: p.y });
      say(g, `${RESTS[o.rest].label} order cancelled. Too slow!`, 'mark');
    }
  }
  const carrying = g.orders.filter((o) => o.state === 'carry').length;
  let room = g.cap - carrying;
  for (const o of g.orders) {
    if (o.state !== 'wait' || room <= 0) continue;
    const rs = restSlot(o.rest);
    if (Math.hypot(p.x - rs.px, p.y - rs.py) < 11) {
      o.state = 'carry';
      room--;
      g.events.push({ e: 'pickup', x: rs.px, y: rs.py, c: o.color });
      say(g, `Picked up from ${RESTS[o.rest].label}. Take it to the ${colorName(o.color)} house!`, 'good');
    }
  }
  if (room <= 0 && g.orders.some((o) => o.state === 'wait' && Math.hypot(p.x - restSlot(o.rest).px, p.y - restSlot(o.rest).py) < 11)) {
    if (g.t - g.say.t > 2) say(g, 'Your bag is full! Deliver first.', 'info');
  }
  for (const o of g.orders) {
    if (o.state !== 'carry') continue;
    const s = slots()[o.slot];
    if (Math.hypot(p.x - s.px, p.y - s.py) < 11) {
      o.state = 'done';
      const pay = g.bike ? PAY.bike : PAY.car;
      o.pay = pay.base + pay.tip * clamp(o.t / o.T, 0, 1) * 1.25 * o.spill;
      o.pay = Math.round(Math.min(o.pay, pay.base + pay.tip) * 100) / 100;
      g.earned += o.pay;
      g.delivered++;
      g.customers.push({ x: s.dx, y: s.dy + (s.face < 0 ? 3 : -3), t: 1.6, c: o.color });
      g.events.push({ e: 'drop', x: s.px, y: s.py, s: `+$${Math.round(o.pay)}`, c: o.color });
      say(g, o.t / o.T > 0.5 ? 'Hot and fast! Big tip.' : o.t / o.T > 0.2 ? 'Delivered. Decent tip.' : 'Delivered… barely. Small tip.', 'good');
    }
  }
  for (const cu of g.customers) cu.t -= dt;
  g.customers = g.customers.filter((cu) => cu.t > 0);

  // new orders as old ones clear; it gets busier as the shift goes on
  const cap = g.gt < 12 ? 2 : 3;
  g.orderT -= dt;
  if (activeOrders(g).length < cap && g.orderT <= 0 && g.gt < SHIFT - 6) {
    newOrder(g);
    g.orderT = 1 + g.rand() * 1.5;
  }
}

function cornerNudge(g: TownSim, x: number, y: number, axis: 'x' | 'y'): number {
  for (let k = 1; k <= 7; k++)
    for (const s of [1, -1]) {
      const ok = axis === 'y' ? !blockedAt(g, x, y + s * k) : !blockedAt(g, x + s * k, y);
      if (ok) return s * k;
    }
  return 0;
}

function spill(g: TownSim, f: number): void {
  for (const o of g.orders) if (o.state === 'carry') o.spill = Math.max(0.3, o.spill - f);
}

export function colorName(c: string): string {
  return { '#ff5a4a': 'red', '#4a9aff': 'blue', '#ffd23a': 'yellow', '#c07aff': 'purple', '#3ae0b0': 'green', '#ff8ad0': 'pink' }[c] ?? 'glowing';
}

// ======================= RENDERING =======================
let MAP: Record<string, HTMLCanvasElement> = {};

function mapCanvas(bike: boolean): HTMLCanvasElement {
  const key = bike ? 'bike' : 'car';
  if (MAP[key]) return MAP[key];
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  paintMap(x);
  MAP = { ...MAP, [key]: c };
  return c;
}

function tree(x: Ctx, cx: number, cy: number, r = 6): void {
  disc(x, cx + 2, cy + 2, r, 'rgba(10,30,10,0.35)');
  disc(x, cx, cy, r, '#2f6a32');
  disc(x, cx - 1, cy - 1, r - 2, '#3f8a3e');
  disc(x, cx - 2, cy - 3, Math.max(1, r - 4), '#5aa852');
}

function paintMap(x: Ctx): void {
  // grass
  rect(x, 0, 0, TW, TH, '#5f9a4a');
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) if (hash(i * 31 + j * 17) > 0.93) rect(x, i, j, 1, 1, hash(i + j * 3) > 0.5 ? '#6aa852' : '#4f8a3e');
  // roads
  for (const y of HY) rect(x, VX[0] - RH, y - RH, VX[3] - VX[0] + RH * 2, RH * 2, '#4a4a56');
  for (const vx of VX) rect(x, vx - RH, HY[0] - RH, RH * 2, HY[2] - HY[0] + RH * 2, '#4a4a56');
  for (let j = HY[0] - RH; j < HY[2] + RH; j++)
    for (let i = VX[0] - RH; i < VX[3] + RH; i++) {
      const n = hash(i * 13 + j * 7);
      if (n > 0.96) rect(x, i, j, 1, 1, '#55556a');
      else if (n < 0.03) rect(x, i, j, 1, 1, '#3e3e4a');
    }
  const inInter = (px: number, py: number): boolean => VX.some((vx) => Math.abs(px - vx) < RH + 1) && HY.some((hy) => Math.abs(py - hy) < RH + 1);
  // dashed center lines
  for (const y of HY) for (let i = VX[0]; i < VX[3]; i++) if (i % 8 < 4 && !inInter(i, y)) rect(x, i, y, 1, 1, '#e8c84a');
  for (const vx of VX) for (let j = HY[0]; j < HY[2]; j++) if (j % 8 < 4 && !inInter(vx, j)) rect(x, vx, j, 1, 1, '#e8c84a');
  // crosswalk stripes on the intersection approaches
  for (const vx of VX)
    for (const hy of HY) {
      for (let k = -RH + 1; k < RH; k += 3) {
        if (hy > HY[0]) rect(x, vx + k, hy - RH - 4, 2, 3, '#d8d4c8');
        if (hy < HY[2]) rect(x, vx + k, hy + RH + 1, 2, 3, '#d8d4c8');
        if (vx > VX[0]) rect(x, vx - RH - 4, hy + k, 3, 2, '#d8d4c8');
        if (vx < VX[3]) rect(x, vx + RH + 1, hy + k, 3, 2, '#d8d4c8');
      }
    }
  // border trees
  for (let i = 4; i < TW; i += 13) {
    tree(x, i + hash(i) * 4, 5, 5);
    tree(x, i + hash(i + 9) * 4, TH - 4, 5);
  }
  for (let j = 18; j < TH - 10; j += 14) {
    tree(x, 6, j + hash(j) * 4, 5);
    tree(x, TW - 6, j + hash(j + 4) * 4, 5);
  }
  // blocks: curb + sidewalk
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 3; i++) {
      const b = blockRect(i, j);
      rect(x, b.x, b.y, b.w, b.h, '#e8e0d0');
      rect(x, b.x + 1, b.y + 1, b.w - 2, b.h - 2, '#c8c0b0');
      for (let k = b.x + 6; k < b.x + b.w; k += 8) {
        rect(x, k, b.y + 1, 1, 4, '#b0a898');
        rect(x, k, b.y + b.h - 5, 1, 4, '#b0a898');
      }
      if (i === 1 && j === 0) paintPark(x, b);
      else rect(x, b.x + 5, b.y + 5, b.w - 10, b.h - 10, '#67a352');
    }
  // buildings
  for (const s of slots()) paintBuilding(x, s);
  // speed trap: SLOW paint + signs
  text(x, 'SLOW', TRAP.x + 6, HY[2] + 1, '#e8e4d8');
  text(x, 'SLOW', TRAP.x + TRAP.w - 22, HY[2] - 7, '#e8e4d8');
  for (const sx of [TRAP.x - 4, TRAP.x + TRAP.w + 1]) {
    rect(x, sx, HY[2] - RH - 13, 9, 11, '#f2f0ea');
    text(x, '15', sx + 1, HY[2] - RH - 10, INK);
    outlineRect(x, sx - 1, HY[2] - RH - 14, 11, 13, INK);
  }
  // cop's pull-out on the grass below
  rect(x, COP.x - 12, HY[2] + RH, 24, 7, '#7a7a86');
  // potholes are drawn live (positions vary per shift)
}

function paintPark(x: Ctx, b: Box): void {
  rect(x, b.x + 3, b.y + 3, b.w - 6, b.h - 6, '#6aaa56');
  dither(x, b.x + 3, b.y + 3, b.w - 6, b.h - 6, '#6aaa56', '#72b25c');
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // + shaped bike path
  rect(x, cx - 6, b.y, 12, b.h, '#d8c8a0');
  rect(x, b.x, cy - 6, b.w, 12, '#d8c8a0');
  for (let k = b.y; k < b.y + b.h; k += 6) rect(x, cx, k, 1, 3, '#f2efe6');
  for (let k = b.x; k < b.x + b.w; k += 6) rect(x, k, cy, 3, 1, '#f2efe6');
  // bollards at the path entrances (cars can't fit)
  for (const [px, py] of [
    [cx - 1, b.y + 1],
    [cx - 1, b.y + b.h - 3],
    [b.x + 1, cy - 1],
    [b.x + b.w - 3, cy - 1],
  ])
    rect(x, px, py, 2, 2, '#f2b632');
  // pond + trees
  disc(x, b.x + 16, b.y + 14, 7, '#3f7fd8');
  disc(x, b.x + 15, b.y + 13, 5, '#5a9ae8');
  rect(x, b.x + 13, b.y + 11, 2, 1, '#bfe0ff');
  tree(x, b.x + 62, b.y + 12);
  tree(x, b.x + 14, b.y + 50);
  tree(x, b.x + 60, b.y + 52, 5);
  tree(x, b.x + 70, b.y + 40, 4);
  // bench + bike icon
  rect(x, b.x + 48, b.y + 24, 8, 2, '#8a5a3a');
  text(x, 'BIKES', cx - 9, cy + 8, '#3a5a2a');
}

function paintBuilding(x: Ctx, s: Slot): void {
  const up = s.face < 0; // door on the top edge
  if (s.rest >= 0) {
    const R = RESTS[s.rest];
    const w = 34;
    const h = 24;
    const bx = s.dx - w / 2;
    const by = up ? s.dy + 5 : s.dy - 5 - h;
    rect(x, bx + 2, by + 2, w, h, 'rgba(10,20,10,0.3)');
    rect(x, bx, by, w, h, '#a8a0b0');
    dither(x, bx + 2, by + 2, w - 4, h - 4, '#a8a0b0', '#9890a0');
    rect(x, bx + 4, by + 6, 6, 4, '#7a7486');
    // big roof sign
    rect(x, bx + 3, by + (up ? 11 : 6), w - 6, 9, R.c);
    rect(x, bx + 3, by + (up ? 11 : 6), w - 6, 1, shade(R.c, 1.25));
    text(x, R.name, s.dx - (R.name.length * 4 - 1) / 2, by + (up ? 13 : 8), '#ffffff');
    outlineRect(x, bx - 1, by - 1, w + 2, h + 2, INK);
    // striped awning toward the street
    const ay = up ? by - 3 : by + h;
    for (let i = 0; i < w; i += 2) rect(x, bx + i, ay, 1, 3, i % 4 ? R.awn : '#f2efe6');
    // door
    rect(x, s.dx - 2, up ? s.dy + 1 : s.dy - 4, 5, 3, '#5a3a2a');
    return;
  }
  const w = 24;
  const h = 20;
  const bx = s.dx - w / 2;
  const by = up ? s.dy + 6 : s.dy - 6 - h;
  rect(x, bx + 2, by + 2, w, h, 'rgba(10,20,10,0.3)');
  const half = Math.floor(h / 2);
  // gabled roof, ridge running across
  rect(x, bx, by, w, half, s.roof);
  rect(x, bx, by + half, w, h - half, shade(s.roof, 0.78));
  for (let i = 1; i < w; i += 3) {
    rect(x, bx + i, by, 1, half, shade(s.roof, 0.9));
    rect(x, bx + i, by + half, 1, h - half, shade(s.roof, 0.7));
  }
  rect(x, bx, by + half - 1, w, 2, shade(s.roof, 1.2));
  rect(x, bx + w - 7, by + 2, 3, 4, '#5a4a4a');
  outlineRect(x, bx - 1, by - 1, w + 2, h + 2, INK);
  // walkway + door
  const wy0 = up ? s.dy + 1 : by + h + 1;
  const wy1 = up ? by - 1 : s.dy - 1;
  rect(x, s.dx - 2, wy0, 4, Math.max(0, wy1 - wy0), '#d8cfb8');
  rect(x, s.dx - 2, up ? by + h - 3 : by, 4, 3, s.doorC);
}

export interface TownDrawOpts {
  reduced: boolean;
  look: VehicleLook;
  fx: Fx;
}

export function camOf(g: TownSim): [number, number] {
  return [Math.round(clamp(g.p.x - VW / 2, 0, TW - VW)), Math.round(clamp(g.p.y - VH / 2, 0, TH - VH))];
}

export function drawTown(x: Ctx, g: TownSim, o: TownDrawOpts): void {
  const [cx, cy] = camOf(g);
  x.drawImage(mapCanvas(g.bike), cx, cy, VW, VH, 0, 0, VW, VH);
  const S = (wx: number, wy: number): [number, number] => [Math.round(wx - cx), Math.round(wy - cy)];
  const pulse = o.reduced ? 0.5 : (Math.sin(g.t * 6) + 1) / 2;

  // potholes
  for (const h of g.holes) {
    const [sx, sy] = S(h.x, h.y);
    disc(x, sx, sy, h.r, '#2a2a34');
    disc(x, sx - 1, sy - 1, h.r - 1, '#1c1c24');
    rect(x, sx + 1, sy + h.r - 1, 2, 1, '#6a6a7a');
  }
  // speed trap cop + radar zone
  {
    const [sx, sy] = S(COP.x, COP.y);
    drawVehicle(x, { kind: 'police', body: '#1c1c2a' }, sx, sy, Math.PI / 2, { siren: g.sirenT > 0, t: g.t });
    if (g.phase === 'play' && !o.reduced && Math.floor(g.t * 2) % 2 === 0) {
      const [zx, zy] = S(TRAP.x, TRAP.y);
      x.globalAlpha = 0.18;
      rect(x, zx, zy, TRAP.w, 1, '#ff4040');
      rect(x, zx, zy + TRAP.h - 1, TRAP.w, 1, '#ff4040');
      x.globalAlpha = 1;
    }
    if (g.sirenT > 0) glow(x, sx, sy, 20, 12, Math.floor(g.t * 8) % 2 ? '#ff4040' : '#4060ff', 0.5);
  }

  // targets: restaurant pads (waiting orders), doors (carried orders)
  const act = activeOrders(g);
  for (const od of act) {
    const s = od.state === 'wait' ? restSlot(od.rest) : slots()[od.slot];
    const [sx, sy] = S(s.px, s.py);
    const hurry = od.t < 6;
    glow(x, sx, sy, 12 + pulse * 3, 8 + pulse * 2, od.color, 0.55);
    // ring marker
    const r = 6 + Math.round(pulse * 2);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) rect(x, sx + Math.cos(a + g.t) * r, sy + Math.sin(a + g.t) * r * 0.6, 1, 1, od.color);
    // icon above: bag (pickup) or house (drop)
    const bob = Math.round(Math.sin(g.t * 5 + od.id) * 1.5);
    const iy = sy - 13 + bob;
    if (od.state === 'wait') {
      rect(x, sx - 3, iy, 7, 6, od.color);
      rect(x, sx - 1, iy - 2, 3, 2, INK);
      outlineRect(x, sx - 4, iy - 1, 9, 8, INK);
    } else {
      rect(x, sx - 3, iy + 2, 7, 5, od.color);
      rect(x, sx - 2, iy, 5, 2, od.color);
      rect(x, sx - 1, iy - 1, 3, 1, od.color);
      rect(x, sx, iy + 4, 1, 3, INK);
      outlineRect(x, sx - 4, iy - 2, 9, 10, INK);
    }
    if (hurry && Math.floor(g.t * 4) % 2 === 0) outlinedText(x, '!', sx + 6, iy, '#ff5a4a');
    // light up the customer's front door and walkway
    if (od.state === 'carry') {
      const up = s.face < 0;
      const [dx, dy] = S(s.dx, s.dy);
      const on = o.reduced || Math.floor(g.t * 4) % 2 === 0;
      rect(x, dx - 2, up ? dy + 1 : dy - 5, 4, 5, on ? od.color : shade(od.color, 0.7));
      rect(x, dx - 2, up ? dy + 23 : dy - 26, 4, 3, on ? od.color : '#ffffff');
    }
  }

  // customers waving at their doors
  for (const cu of g.customers) {
    const [sx, sy] = S(cu.x, cu.y);
    const wave = Math.floor(cu.t * 8) % 2;
    rect(x, sx - 2, sy - 2, 5, 4, cu.c);
    rect(x, sx - 1, sy - 3, 3, 3, '#5b3a22');
    rect(x, sx + (wave ? 3 : -4), sy - 4, 1, 3, '#eab38c');
    if (cu.t > 0.8) outlinedText(x, '<3', sx - 3, sy - 12 - Math.round((1.6 - cu.t) * 6), '#ff8ad0');
  }

  // traffic
  for (const a of g.ai) {
    const [sx, sy] = S(a.x, a.y);
    if (sx < -20 || sy < -20 || sx > VW + 20 || sy > VH + 20) continue;
    drawVehicle(x, a.look, sx, sy, (a.dir * Math.PI) / 2, { brake: a.v < a.vt - 6 });
    if (a.honk > 0.5) outlinedText(x, 'HONK', sx - 7, sy - 14, '#ffe070');
  }
  // player
  {
    const [sx, sy] = S(g.p.x, g.p.y);
    const blinkHit = g.p.stun > 0 && Math.floor(g.t * 20) % 2 === 0;
    glow(x, sx, sy, 10, 10, '#fff6c0', 0.35);
    if (g.phase === 'play' && g.gt < 3) outlinedText(x, 'YOU', sx - 5, sy + 10, '#fff3c4');
    if (!blinkHit) drawVehicle(x, o.look, sx, sy, g.p.ang, { brake: Math.hypot(g.p.vx, g.p.vy) < 6 });
    // carried bags stacked as little color pips
    const carried = g.orders.filter((od) => od.state === 'carry');
    carried.forEach((od, k) => {
      rect(x, sx - 5 + k * 4, sy - 13, 3, 3, od.color);
      outlineRect(x, sx - 6 + k * 4, sy - 14, 5, 5, INK);
    });
  }

  o.fx.draw(x, (wx, wy) => S(wx, wy));

  // off-screen arrows for each target
  for (const od of act) {
    const s = od.state === 'wait' ? restSlot(od.rest) : slots()[od.slot];
    const [sx, sy] = S(s.px, s.py);
    if (sx > 4 && sx < VW - 4 && sy > 4 && sy < VH - 4) continue;
    const mx = VW / 2;
    const my = VH / 2;
    const dx = sx - mx;
    const dy = sy - my;
    const k = Math.min((VW / 2 - 8) / Math.abs(dx || 1e-6), (VH / 2 - 8) / Math.abs(dy || 1e-6));
    const ax = mx + dx * k;
    const ay = my + dy * k;
    const ang = Math.atan2(dy, dx);
    arrow(x, ax, ay, ang, od.color, od.state === 'wait');
  }
}

function arrow(x: Ctx, ax: number, ay: number, ang: number, c: string, pickup: boolean): void {
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  // triangle pointing along ang, filled by scanning
  const pts: [number, number][] = [
    [6, 0],
    [-4, -5],
    [-4, 5],
  ].map(([u, v]) => [ax + u * cs - v * sn, ay + u * sn + v * cs]);
  const minY = Math.floor(Math.min(...pts.map((p) => p[1])));
  const maxY = Math.ceil(Math.max(...pts.map((p) => p[1])));
  for (let yy = minY - 1; yy <= maxY + 1; yy++) {
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % 3];
      if ((yy >= y0 && yy < y1) || (yy >= y1 && yy < y0)) xs.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
    }
    if (xs.length < 2) continue;
    const a = Math.min(...xs);
    const b = Math.max(...xs);
    rect(x, a - 1, yy, b - a + 2, 1, INK);
    rect(x, a, yy, Math.max(1, b - a), 1, c);
  }
  if (pickup) rect(x, ax - 1, ay - 1, 2, 2, '#ffffff');
}

export function drawTownEnd(x: Ctx, g: TownSim, me: Person): void {
  if (g.phase === 'count') return;
  if (g.phase === 'play' && SHIFT - g.gt < 5 && SHIFT - g.gt > 0) {
    bigText(x, String(Math.ceil(SHIFT - g.gt)), VW / 2, 18, 3, '#fff3c4');
  }
  if (g.phase !== 'end') return;
  const a = Math.min(1, g.endT * 3);
  x.globalAlpha = a * 0.65;
  rect(x, 0, 30, VW, 74, INK);
  x.globalAlpha = a;
  bigText(x, 'SHIFT OVER', VW / 2, 44, 3, '#fff3c4');
  drawPerson(x, { ...me, holds: 'phone' }, 30, 64, Math.floor(g.endT * 3), g.earned > 0, { face: 1 });
  outlinedText(x, `${g.delivered} DELIVERED`, 64, 62, '#ffffff');
  outlinedText(x, `TIPS + PAY: $${Math.round(g.earned)}`, 64, 72, '#7ee08a');
  if (g.ticket) outlinedText(x, 'SPEEDING TICKET!', 64, 82, '#ff7a6a');
  else if (g.missed) outlinedText(x, `${g.missed} CANCELLED`, 64, 82, '#ffb070');
  x.globalAlpha = 1;
}

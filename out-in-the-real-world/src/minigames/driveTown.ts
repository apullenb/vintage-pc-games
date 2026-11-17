// Delivery Rush: a top-down town that is laid out differently every shift. Simulation (pure,
// testable without a DOM) + renderer. React shell: Delivery.tsx.
//
// The town: a 5x4 road grid (4x3 blocks). Every shift picks a downtown (2x2 blocks around a
// one-way street), a park (bikes cut through it), apartment blocks with buzzer doors, a hill
// (slow uphill on a bike, fast downhill) and a speed trap. A GPS route (BFS over a road grid
// that respects the one-way) leads to the current target. Each drop is rated 1-5 stars from
// speed, food heat and care (bumps spill drinks); streaks of 4+ star drops add bonus tips.
// Mid-shift there is either a rain shower (slick roads, bigger tips) or a dinner rush (more
// orders and traffic), and the light fades from afternoon to dusk with headlights.
import { drawPerson, type Person } from '../art/people.ts';
import { disc, dither, glow, hash, INK, mix, outlineRect, rect, shade, text, type Ctx } from '../art/px.ts';
import { bigText, clamp, drawVehicle, Fx, lerp, outlinedText, smooth, type VehicleLook } from './driveKit.tsx';

export const VW = 192;
export const VH = 144;
export const VX = [24, 120, 216, 312, 408]; // vertical road centers
export const HY = [24, 104, 184, 264]; // horizontal road centers
export const TW = 432; // world size
export const TH = 288;
const RH = 9; // half road width
const LANE = 4.5;
export const SHIFT = 60; // seconds
const NI = VX.length - 1; // blocks across
const NJ = HY.length - 1; // blocks down

type Dir = 0 | 1 | 2 | 3; // N E S W
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SlotKind = 'house' | 'apt' | 'shop' | 'rest';
export interface Slot {
  i: number;
  px: number; // pad on the road
  py: number;
  dx: number; // door on the block edge
  dy: number;
  face: -1 | 1; // -1 faces the road above, 1 the road below
  kind: SlotKind;
  rest: number; // restaurant index, -1 otherwise
  roof: string;
  doorC: string;
  bi: number; // block
  bj: number;
  k: number; // 0 = left, 1 = right
}

export const RESTS = [
  { name: 'PIZZA', label: 'Pizza Pals', icon: '🍕', c: '#e0503c', awn: '#f2efe6', food: 'pizza' },
  { name: 'TACOS', label: 'Taco Town', icon: '🌮', c: '#f2b632', awn: '#3caa6a', food: 'tacos' },
  { name: 'SUSHI', label: 'Sushi Spot', icon: '🍣', c: '#2fb5b0', awn: '#e0503c', food: 'sushi' },
  { name: 'BURGER', label: 'Burger Barn', icon: '🍔', c: '#c8642a', awn: '#f2d048', food: 'burgers' },
];

const ORDER_COLORS = ['#ff5a4a', '#4a9aff', '#ffd23a', '#c07aff', '#3ae0b0', '#ff8ad0'];
const ROOFS = ['#b0503c', '#5a6a8a', '#7a5a3a', '#3a7a6a', '#8a4a6a', '#a87a3a', '#6a7a3a', '#4a5a7a'];
const DOORS = ['#3f7fd8', '#e0503c', '#3caa6a', '#f2b632', '#9a5ad0', '#ef7fae'];
const WALLS = ['#e8dcc0', '#d8e0e8', '#f0d8c8', '#dce8d0', '#ecdcec'];

export function blockRect(i: number, j: number): Box {
  return { x: VX[i] + RH, y: HY[j] + RH, w: VX[i + 1] - VX[i] - RH * 2, h: HY[j + 1] - HY[j] - RH * 2 };
}

// ---------- the town layout (varies per shift) ----------
export type District = 'house' | 'apt' | 'down' | 'park';
export interface Town {
  district: District[][]; // [i][j]
  oneway: { r: number; dir: 1 | 3 }; // horizontal road index, travel direction (E or W)
  hill: { i: number; j: number; up: 0 | 2 }; // vertical road VX[i] between HY[j] and HY[j+1]; up = uphill travel direction
  trap: Box & { copX: number; copY: number };
  slots: Slot[];
  rests: number[]; // slot index for each restaurant
  holes: { x: number; y: number; r: number }[];
  lamps: { x: number; y: number }[];
  windows: { x: number; y: number }[];
}

function pick<T>(r: () => number, xs: T[]): T {
  return xs[Math.floor(r() * xs.length)];
}

function makeTown(r: () => number): Town {
  // one-way street through downtown: an inner horizontal road
  const ow = 1 + Math.floor(r() * (NJ - 1)); // 1..NJ-1
  const dir: 1 | 3 = r() < 0.5 ? 1 : 3;
  const i0 = Math.floor(r() * (NI - 1));
  const district: District[][] = Array.from({ length: NI }, () => Array.from({ length: NJ }, () => 'house' as District));
  for (const di of [0, 1]) for (const dj of [-1, 0]) district[i0 + di][ow + dj] = 'down';
  const free = (): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) if (district[i][j] === 'house') out.push([i, j]);
    return out;
  };
  const [pi, pj] = pick(r, free());
  district[pi][pj] = 'park';
  for (let k = 0; k < 2; k++) {
    const f = free();
    if (f.length > 3) {
      const [ai, aj] = pick(r, f);
      district[ai][aj] = 'apt';
    }
  }
  // hill: a vertical segment away from downtown
  const hills: { i: number; j: number }[] = [];
  for (let i = 0; i <= NI; i++)
    for (let j = 0; j < NJ; j++) {
      const touchesDown = [i - 1, i].some((bi) => bi >= 0 && bi < NI && district[bi][j] === 'down');
      if (!touchesDown) hills.push({ i, j });
    }
  const h = pick(r, hills.length ? hills : [{ i: 0, j: 0 }]);
  const hill = { i: h.i, j: h.j, up: (r() < 0.5 ? 0 : 2) as 0 | 2 };
  // speed trap: a horizontal segment that is not the one-way and not downtown
  const traps: { i: number; j: number }[] = [];
  for (let j = 0; j <= NJ; j++)
    for (let i = 0; i < NI; i++) {
      if (j === ow) continue;
      const below = j < NJ ? district[i][j] : district[i][j - 1];
      if (below === 'down') continue;
      traps.push({ i, j });
    }
  const t = pick(r, traps);
  const tcx = (VX[t.i] + VX[t.i + 1]) / 2;
  const copBelow = t.j < NJ;
  const trap = { x: tcx - 30, y: HY[t.j] - RH, w: 60, h: RH * 2, copX: tcx, copY: copBelow ? HY[t.j] + RH + 9 : HY[t.j] - RH - 9 };

  // slots: 2 per block face
  const slots: Slot[] = [];
  let n = 0;
  for (let j = 0; j < NJ; j++)
    for (let i = 0; i < NI; i++) {
      const d = district[i][j];
      if (d === 'park') continue;
      const b = blockRect(i, j);
      for (const face of [-1, 1] as const)
        for (let k = 0; k < 2; k++) {
          const x = b.x + (k === 0 ? 20 : b.w - 20);
          slots.push({
            i: n,
            px: x,
            py: face < 0 ? HY[j] + LANE : HY[j + 1] - LANE,
            dx: x,
            dy: face < 0 ? b.y : b.y + b.h,
            face,
            kind: d === 'down' ? 'shop' : d === 'apt' ? 'apt' : 'house',
            rest: -1,
            roof: ROOFS[Math.floor(r() * ROOFS.length)],
            doorC: DOORS[n % DOORS.length],
            bi: i,
            bj: j,
            k,
          });
          n++;
        }
    }
  // restaurants: two downtown, two out in the neighborhoods (not next to each other)
  const rests: number[] = [];
  const downSlots = slots.filter((s) => s.kind === 'shop');
  const hoodSlots = slots.filter((s) => s.kind === 'house');
  const used = new Set<string>();
  for (let k = 0; k < RESTS.length; k++) {
    const pool = (k < 2 ? downSlots : hoodSlots).filter((s) => s.rest < 0 && !used.has(`${s.bi},${s.bj}`));
    const s = pick(r, pool.length ? pool : slots.filter((q) => q.rest < 0));
    s.rest = k;
    s.kind = 'rest';
    used.add(`${s.bi},${s.bj}`);
    rests.push(s.i);
  }
  // potholes on mid-segments (not in the trap, not on the hill)
  const cands: { x: number; y: number; r: number }[] = [];
  for (let j = 0; j <= NJ; j++)
    for (let i = 0; i < NI; i++) for (const f of [0.3, 0.7]) cands.push({ x: lerp(VX[i] + 16, VX[i + 1] - 16, f), y: HY[j] + (r() < 0.5 ? -LANE : LANE), r: 3 });
  for (let i = 0; i <= NI; i++)
    for (let j = 0; j < NJ; j++) {
      if (i === hill.i && j === hill.j) continue;
      cands.push({ x: VX[i] + (r() < 0.5 ? -LANE : LANE), y: lerp(HY[j] + 16, HY[j + 1] - 16, 0.5), r: 3 });
    }
  const pool = cands.filter((c) => !(c.x > trap.x - 10 && c.x < trap.x + trap.w + 10 && Math.abs(c.y - HY[t.j]) < 10));
  const holes: Town['holes'] = [];
  for (let k = 0; k < 9 && pool.length; k++) holes.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  // street lamps on intersection corners
  const lamps: Town['lamps'] = [];
  for (let i = 0; i <= NI; i++) for (let j = 0; j <= NJ; j++) lamps.push({ x: VX[i] + RH + 2, y: HY[j] + RH + 2 });
  return { district, oneway: { r: ow, dir }, hill, trap, slots, rests, holes, lamps, windows: [] };
}

function solids(town: Town, bike: boolean): Box[] {
  const out: Box[] = [
    { x: 0, y: 0, w: TW, h: HY[0] - RH },
    { x: 0, y: HY[NJ] + RH, w: TW, h: TH - HY[NJ] - RH },
    { x: 0, y: 0, w: VX[0] - RH, h: TH },
    { x: VX[NI] + RH, y: 0, w: TW - VX[NI] - RH, h: TH },
  ];
  for (let j = 0; j < NJ; j++)
    for (let i = 0; i < NI; i++) {
      const b = blockRect(i, j);
      if (town.district[i][j] === 'park' && bike) {
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
export type Req = 'door' | 'hand';
export interface Order {
  id: number;
  color: string;
  rest: number;
  slot: number;
  state: 'wait' | 'carry' | 'done' | 'fail';
  t: number; // seconds left (goes negative = late)
  T: number;
  heat: number; // 1 = piping hot
  care: number; // 1 = nothing spilled
  req: Req;
  hold: number; // seconds stopped at a hand-it-to-me door
  pay: number;
  stars: number;
}

export interface Drop {
  rest: number;
  color: string;
  stars: number;
  pay: number;
  kind: SlotKind;
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

export type SayKind = 'info' | 'good' | 'mark' | 'cmd';
export type EventKind = 'rain' | 'rush';
export type TownEvent = 'pickup' | 'drop' | 'fail' | 'crash' | 'hole' | 'ticket' | 'go' | 'end' | 'new' | 'late' | 'boost' | 'skid' | 'streak' | 'wrong' | 'weather' | 'hold' | 'tired' | 'refund';

export interface TownSim {
  bike: boolean;
  seed: number;
  town: Town;
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
  holeCd: number;
  earned: number;
  delivered: number;
  missed: number;
  crashes: number;
  bumps: number;
  ticket: boolean;
  trapAcc: number;
  sirenT: number;
  // boost (car: a few nitro charges) / sprint (bike: a stamina bar)
  boosts: number;
  boostT: number;
  stamina: number;
  sprinting: boolean;
  // the mid-shift twist
  ev: { kind: EventKind; t0: number; t1: number; on: boolean; told: boolean };
  streak: number;
  bestStreak: number;
  drops: Drop[];
  wrongT: number;
  wrongCd: number;
  skidT: number;
  marks: { x: number; y: number; l: number }[];
  say: { text: string; kind: SayKind; t: number };
  events: { e: TownEvent; x?: number; y?: number; s?: string; c?: string; n?: number }[];
  customers: { x: number; y: number; t: number; c: string; stars: number; line: string }[];
  solids: Box[];
  grid: Grid;
  dist: Map<number, Int16Array>;
  focus: number; // order id the GPS points at (0 = auto)
  route: number[]; // flat [x0,y0,x1,y1,...] world points from the player to the GPS target
  routeT: number;
  routeLen: number;
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

// What a near-perfect shift earns; score = earned / REF (calibrated with the bot in delivery.test.ts).
export const REF = { car: 95, bike: 80 };
export const PAY = { car: { base: 6, tip: 8 }, bike: { base: 5, tip: 6 } };
export const MAX_EARN = { car: 125, bike: 95 }; // keeps the money modest however wild the shift
export const BOOSTS = 3;
const BOOST_TIME = 1.3;
const HOLD_TIME = 0.6;
const LATE_GRACE = 10; // seconds a carried order can run late before the customer cancels

export function newTown(bike: boolean, seed = Math.floor(Math.random() * 1e9)): TownSim {
  const rnd = mulberry(seed);
  const town = makeTown(rnd);
  const so = solids(town, bike);
  // start beside the first restaurant's block, on the road
  const start = town.slots[town.rests[0]];
  const g: TownSim = {
    bike,
    seed,
    town,
    t: 0,
    gt: 0,
    phase: 'count',
    endT: 0,
    p: { x: start.px + (start.k === 0 ? 30 : -30), y: start.py, vx: 0, vy: 0, ang: start.k === 0 ? Math.PI / 2 : -Math.PI / 2, stun: 0, hitCd: 0 },
    vmax: bike ? 56 : 68,
    cap: bike ? 2 : 3,
    orders: [],
    nextId: 1,
    orderT: 0,
    colorI: 0,
    ai: [],
    holeCd: 0,
    earned: 0,
    delivered: 0,
    missed: 0,
    crashes: 0,
    bumps: 0,
    ticket: false,
    trapAcc: 0,
    sirenT: 0,
    boosts: BOOSTS,
    boostT: 0,
    stamina: 1,
    sprinting: false,
    ev: { kind: rnd() < 0.5 ? 'rain' : 'rush', t0: 22 + Math.floor(rnd() * 5), t1: 0, on: false, told: false },
    streak: 0,
    bestStreak: 0,
    drops: [],
    wrongT: 0,
    wrongCd: 0,
    skidT: 0,
    marks: [],
    say: { text: 'Orders are coming in. Follow the GPS line!', kind: 'cmd', t: 0 },
    events: [],
    customers: [],
    solids: so,
    grid: buildGrid(town, so, bike),
    dist: new Map(),
    focus: 0,
    route: [],
    routeT: 0,
    routeLen: 0,
    rand: rnd,
    score: 0,
  };
  g.ev.t1 = g.ev.t0 + 18;
  if (blockedAt(g, g.p.x, g.p.y)) g.p.x = start.px;
  for (let k = 0; k < 5; k++) spawnAi(g, true);
  return g;
}

// ---------- GPS: a coarse road grid + BFS distance fields ----------
export const C = 4; // grid cell size (px)
const GW = TW / C;
const GH = TH / C;
interface Grid {
  pass: Uint8Array;
  one: Int8Array; // +1 = eastbound only, -1 = westbound only, 0 = two-way
}

function buildGrid(town: Town, so: Box[], bike: boolean): Grid {
  const pass = new Uint8Array(GW * GH);
  const one = new Int8Array(GW * GH);
  const h = bike ? 3 : 4.5;
  const r = town.oneway.r;
  for (let cy = 0; cy < GH; cy++)
    for (let cx = 0; cx < GW; cx++) {
      const x = cx * C + C / 2;
      const y = cy * C + C / 2;
      const b = { x: x - h, y: y - h, w: h * 2, h: h * 2 };
      if (so.some((s) => hit(b, s))) continue;
      const k = cy * GW + cx;
      pass[k] = 1;
      const onRoad = Math.abs(y - HY[r]) < RH;
      const inInter = VX.some((vx) => Math.abs(x - vx) < RH);
      if (onRoad && !inInter) one[k] = town.oneway.dir === 1 ? 1 : -1;
    }
  return { pass, one };
}

function cellOf(x: number, y: number): number {
  const cx = clamp(Math.floor(x / C), 0, GW - 1);
  const cy = clamp(Math.floor(y / C), 0, GH - 1);
  return cy * GW + cx;
}

function nearestPass(grid: Grid, k: number): number {
  if (grid.pass[k]) return k;
  const cx = k % GW;
  const cy = Math.floor(k / GW);
  for (let rad = 1; rad < 5; rad++)
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        const q = y * GW + x;
        if (grid.pass[q]) return q;
      }
  return k;
}

// May you drive from cell a to its neighbor b (one-way rules)?
function canMove(grid: Grid, a: number, b: number): boolean {
  const step = b - a;
  if (step === 1 || step === -1) {
    const s = step;
    if (grid.one[a] && grid.one[a] !== s) return false;
    if (grid.one[b] && grid.one[b] !== s) return false;
  }
  return true;
}

// Driving on the right: moving from cell a to b in the wrong lane costs extra, so the GPS keeps right.
function stepCost(a: number, b: number): number {
  const step = b - a;
  const x = (a % GW) * C + C / 2;
  const y = Math.floor(a / GW) * C + C / 2;
  const nearH = HY.reduce((m, h) => (Math.abs(y - h) < Math.abs(y - m) ? h : m), HY[0]);
  const nearV = VX.reduce((m, v) => (Math.abs(x - v) < Math.abs(x - m) ? v : m), VX[0]);
  const inInter = Math.abs(y - nearH) < RH && Math.abs(x - nearV) < RH;
  if (inInter) return 2;
  if (step === 1) return y > nearH ? 2 : 5; // eastbound keeps south
  if (step === -1) return y < nearH ? 2 : 5;
  if (step === -GW) return x > nearV ? 2 : 5; // northbound keeps east
  return x < nearV ? 2 : 5;
}

// Cost (about 2 per cell) from every cell to the target pad, following the one-way and keeping right.
function distField(g: TownSim, slot: number): Int16Array {
  const hitF = g.dist.get(slot);
  if (hitF) return hitF;
  const s = g.town.slots[slot];
  const grid = g.grid;
  const d = new Int16Array(GW * GH).fill(-1);
  const t0 = nearestPass(grid, cellOf(s.px, s.py));
  // bucket queue Dijkstra (small integer costs)
  const buckets: number[][] = [[t0]];
  d[t0] = 0;
  for (let cost = 0; cost < buckets.length; cost++) {
    const b = buckets[cost];
    if (!b) continue;
    for (const u of b) {
      if (d[u] !== cost) continue;
      const ux = u % GW;
      for (const [n, ok] of [
        [u - 1, ux > 0],
        [u + 1, ux < GW - 1],
        [u - GW, u >= GW],
        [u + GW, u < GW * (GH - 1)],
      ] as [number, boolean][]) {
        if (!ok || !grid.pass[n]) continue;
        if (!canMove(grid, n, u)) continue; // travel is n -> u
        const nc = cost + stepCost(n, u);
        if (d[n] >= 0 && d[n] <= nc) continue;
        d[n] = nc;
        (buckets[nc] ??= []).push(n);
      }
    }
  }
  g.dist.set(slot, d);
  return d;
}

// Route length (px) from a world point to a slot's pad.
export function routeDist(g: TownSim, x: number, y: number, slot: number): number {
  const d = distField(g, slot);
  const k = nearestPass(g.grid, cellOf(x, y));
  const v = d[k];
  return v < 0 ? Math.abs(x - g.town.slots[slot].px) + Math.abs(y - g.town.slots[slot].py) : (v * C) / 2;
}

// Where the GPS is pointing: the chosen order, else the most urgent carried one, else the most urgent pickup.
export function focusOrder(g: TownSim): Order | null {
  const act = activeOrders(g);
  if (!act.length) return null;
  const chosen = act.find((o) => o.id === g.focus);
  if (chosen) return chosen;
  const room = g.cap - act.filter((o) => o.state === 'carry').length;
  const carry = act.filter((o) => o.state === 'carry').sort((a, b) => a.t - b.t);
  const wait = act.filter((o) => o.state === 'wait').sort((a, b) => a.t - b.t);
  if (carry.length && (room <= 0 || !wait.length)) return carry[0];
  if (carry.length && wait.length) {
    // grab a pickup on the way only if it's closer than the drop
    const dc = routeDist(g, g.p.x, g.p.y, carry[0].slot);
    const dw = routeDist(g, g.p.x, g.p.y, g.town.rests[wait[0].rest]);
    return dw < dc * 0.6 ? wait[0] : carry[0];
  }
  return wait[0] ?? null;
}

export function targetSlot(g: TownSim, o: Order): Slot {
  return o.state === 'wait' ? g.town.slots[g.town.rests[o.rest]] : g.town.slots[o.slot];
}

function updateRoute(g: TownSim): void {
  const o = focusOrder(g);
  g.route.length = 0;
  g.routeLen = 0;
  if (!o) return;
  const slot = o.state === 'wait' ? g.town.rests[o.rest] : o.slot;
  const d = distField(g, slot);
  const grid = g.grid;
  let k = nearestPass(grid, cellOf(g.p.x, g.p.y));
  if (d[k] < 0) return;
  g.routeLen = (d[k] * C) / 2;
  let last = 0;
  for (let n = 0; n < 220 && d[k] > 0; n++) {
    g.route.push(...laneSnap((k % GW) * C + C / 2, Math.floor(k / GW) * C + C / 2));
    const kx = k % GW;
    let best = -1;
    let bestV = Infinity;
    const opts: [number, number, boolean][] = [
      [k - 1, -1, kx > 0],
      [k + 1, 1, kx < GW - 1],
      [k - GW, -GW, k >= GW],
      [k + GW, GW, k < GW * (GH - 1)],
    ];
    for (const [nk, step, ok] of opts) {
      if (!ok || d[nk] < 0 || !canMove(grid, k, nk)) continue;
      const v = d[nk] + stepCost(k, nk) - (step === last ? 0.5 : 0);
      if (v < bestV && d[nk] < d[k]) {
        bestV = v;
        best = nk;
      }
    }
    if (best < 0) break;
    last = best - k;
    k = best;
  }
  const s = g.town.slots[slot];
  g.route.push(s.px, s.py);
}

// Pull a route point onto the middle of its lane (the grid is coarser than the lanes).
function laneSnap(x: number, y: number): [number, number] {
  const nearH = HY.reduce((m, h) => (Math.abs(y - h) < Math.abs(y - m) ? h : m), HY[0]);
  const nearV = VX.reduce((m, v) => (Math.abs(x - v) < Math.abs(x - m) ? v : m), VX[0]);
  const onH = Math.abs(y - nearH) < RH;
  const onV = Math.abs(x - nearV) < RH;
  if (onH && !onV) return [x, nearH + (y >= nearH ? LANE : -LANE)];
  if (onV && !onH) return [nearV + (x >= nearV ? LANE : -LANE), y];
  return [x, y];
}

// ---------- orders ----------
function newOrder(g: TownSim): void {
  const all = g.town.slots;
  const busyRest = new Set(g.orders.filter((o) => o.state === 'wait').map((o) => o.rest));
  const busyDoor = new Set(g.orders.filter((o) => o.state === 'wait' || o.state === 'carry').map((o) => o.slot));
  const rests = RESTS.map((_, k) => k).filter((r) => !busyRest.has(r));
  const rest = rests.length ? rests[Math.floor(g.rand() * rests.length)] : Math.floor(g.rand() * RESTS.length);
  const rSlot = g.town.rests[rest];
  const rs = all[rSlot];
  const doors = all.filter((s) => s.kind !== 'rest' && !busyDoor.has(s.i)).map((s) => ({ s, d: routeDist(g, rs.px, rs.py, s.i) }));
  // early orders stay close; later ones can go across town
  const far = lerp(150, 300, clamp(g.gt / SHIFT, 0, 1));
  const ok = doors.filter((x) => x.d > 70 && x.d < far);
  const door = (ok.length ? ok : doors)[Math.floor(g.rand() * (ok.length || doors.length))];
  if (!door) return;
  const d1 = routeDist(g, g.p.x, g.p.y, rSlot);
  const dist = d1 * 0.6 + door.d + 30;
  const slack = lerp(2.7, 2.0, clamp(g.gt / SHIFT, 0, 1));
  const T = Math.round((dist / (g.vmax * 0.8)) * slack + 6);
  const color = ORDER_COLORS[g.colorI++ % ORDER_COLORS.length];
  const req: Req = door.s.kind === 'apt' ? 'hand' : g.rand() < (door.s.kind === 'shop' ? 0.5 : 0.35) ? 'hand' : 'door';
  g.orders.push({ id: g.nextId++, color, rest, slot: door.s.i, state: 'wait', t: T, T, heat: 1, care: 1, req, hold: 0, pay: 0, stars: 0 });
  g.events.push({ e: 'new' });
  say(g, `New order: ${RESTS[rest].label}${req === 'hand' ? ' (hand it to them)' : ''}.`, 'info');
}

function say(g: TownSim, text: string, kind: SayKind): void {
  g.say = { text, kind, t: g.t };
}

export function activeOrders(g: TownSim): Order[] {
  return g.orders.filter((o) => o.state === 'wait' || o.state === 'carry');
}

// Stars for a drop: half on speed, the rest on heat and care. Late food tops out at 2.
export function starsFor(o: Pick<Order, 't' | 'T' | 'heat' | 'care'>): number {
  const speed = o.t <= 0 ? 0 : clamp((o.t / o.T) * 2.2, 0, 1);
  const q = 0.45 * speed + 0.3 * clamp(o.heat, 0, 1) + 0.25 * clamp(o.care, 0, 1);
  const s = clamp(Math.round(1 + 4 * q + 0.15), 1, 5);
  return o.t <= 0 ? Math.min(2, s) : s;
}

export function tipMult(g: TownSim): number {
  return g.ev.on ? (g.ev.kind === 'rain' ? 1.35 : 1.2) : 1;
}

const LINES: Record<number, string[]> = {
  5: ['YUM!', 'LEGEND!', 'SO HOT!', 'WOW!'],
  4: ['THANKS!', 'NICE!', 'SWEET!'],
  3: ['OK.', 'COOL.', 'HM.'],
  2: ['COLD...', 'MEH.', 'FINALLY.'],
  1: ['UGH.', 'SOGGY!', 'REALLY?'],
};

// ---------- AI traffic ----------
function laneCoord(dir: Dir, idx: number, alt: boolean): number {
  if (dir === 0) return VX[idx] + LANE;
  if (dir === 2) return VX[idx] - LANE;
  if (dir === 1) return HY[idx] + (alt ? -LANE : LANE);
  return HY[idx] - (alt ? -LANE : LANE);
}

function maxAi(g: TownSim): number {
  const base = Math.min(9, 5 + Math.floor(g.gt / 12));
  return g.ev.on && g.ev.kind === 'rush' ? base + 4 : base;
}

function spawnAi(g: TownSim, anywhere = false): void {
  for (let tries = 0; tries < 24; tries++) {
    const vert = g.rand() < 0.5;
    let dir = (vert ? (g.rand() < 0.5 ? 0 : 2) : g.rand() < 0.5 ? 1 : 3) as Dir;
    let x: number;
    let y: number;
    if (vert) {
      const i = Math.floor(g.rand() * VX.length);
      x = laneCoord(dir, i, false);
      const j = Math.floor(g.rand() * NJ);
      y = lerp(HY[j] + 14, HY[j + 1] - 14, g.rand());
    } else {
      const j = Math.floor(g.rand() * HY.length);
      const one = j === g.town.oneway.r;
      if (one) dir = g.town.oneway.dir;
      y = laneCoord(dir, j, one && g.rand() < 0.5);
      const i = Math.floor(g.rand() * NI);
      x = lerp(VX[i] + 14, VX[i + 1] - 14, g.rand());
    }
    const far = Math.hypot(x - g.p.x, y - g.p.y) > (anywhere ? 60 : 110);
    const free = g.ai.every((a) => Math.hypot(a.x - x, a.y - y) > 26);
    if (!far || !free) continue;
    const kinds: VehicleLook['kind'][] = ['sedan', 'sedan', 'hatch', 'van', 'taxi'];
    const kind = kinds[Math.floor(g.rand() * kinds.length)];
    g.ai.push({ id: g.nextId++, x, y, dir, v: 30, vt: 30 + g.rand() * 9, look: { kind, body: kind === 'taxi' ? '#f2c84a' : PALETTE[Math.floor(g.rand() * PALETTE.length)], bag: '#e0503c' }, decided: '', turn: -1, honk: 0 });
    return;
  }
}

function aiBox(a: Ai): Box {
  // a forgiving hitbox: two cars in neighboring lanes never touch
  const along = 6.5;
  const across = 3.5;
  return a.dir % 2 === 0 ? { x: a.x - across, y: a.y - along, w: across * 2, h: along * 2 } : { x: a.x - along, y: a.y - across, w: along * 2, h: across * 2 };
}

function hit(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function stepAi(g: TownSim, dt: number): void {
  if (g.phase === 'play' && g.ai.length < maxAi(g) && g.rand() < dt * 2) spawnAi(g);
  const pb = playerBox(g, 1);
  const ow = g.town.oneway;
  for (const a of g.ai) {
    a.honk = Math.max(0, a.honk - dt);
    const dx = DX[a.dir];
    const dy = DY[a.dir];
    let blocked = false;
    for (const o of g.ai) {
      if (o === a) continue;
      const fwd = (o.x - a.x) * dx + (o.y - a.y) * dy;
      const lat = Math.abs((o.x - a.x) * dy - (o.y - a.y) * dx);
      if (fwd > 0 && fwd < 18 && lat < 5) blocked = true;
    }
    const pcx = pb.x + pb.w / 2;
    const pcy = pb.y + pb.h / 2;
    const pf = (pcx - a.x) * dx + (pcy - a.y) * dy;
    const pl = Math.abs((pcx - a.x) * dy - (pcy - a.y) * dx);
    if (pf > 0 && pf < 19 && pl < 9) {
      blocked = true;
      if (a.v > 10 && a.honk <= 0) a.honk = 1;
    }
    const ii = nearestIntersection(a);
    if (ii) {
      const [i, j, cx, cy, along] = ii;
      const key = `${i},${j}`;
      if (a.decided !== key && along < 16 && along > 6) {
        a.decided = key;
        const opts: number[] = [];
        const ok = (d: number): boolean => {
          if (d === 0 ? j <= 0 : d === 2 ? j >= NJ : d === 3 ? i <= 0 : i >= NI) return false;
          if ((d === 1 || d === 3) && j === ow.r && d !== ow.dir) return false; // no wrong-way turns
          return true;
        };
        if (ok(a.dir)) opts.push(a.dir, a.dir);
        if (ok((a.dir + 1) % 4)) opts.push((a.dir + 1) % 4);
        if (ok((a.dir + 3) % 4)) opts.push((a.dir + 3) % 4);
        a.turn = opts.length ? opts[Math.floor(g.rand() * opts.length)] : (a.dir + 2) % 4;
        if (a.turn === a.dir) a.turn = -1;
      }
      if (along > RH && along < RH + 6) {
        const occupied = g.ai.some((o) => o !== a && Math.abs(o.x - cx) < RH && Math.abs(o.y - cy) < RH) || (Math.abs(pcx - cx) < RH + 4 && Math.abs(pcy - cy) < RH + 4);
        if (occupied) blocked = true;
      }
      if (a.turn >= 0 && a.decided === key) {
        const nd = a.turn as Dir;
        if (nd % 2 === 1) {
          const ty = cy + (nd === 1 ? LANE : -LANE);
          if ((a.dir === 0 && a.y <= ty) || (a.dir === 2 && a.y >= ty) || a.dir % 2 === 1) {
            a.y = ty;
            a.x = a.dir % 2 === 1 ? cx : a.x;
            a.dir = nd;
            a.turn = -1;
          }
        } else {
          const tx = cx + (nd === 0 ? LANE : -LANE);
          if ((a.dir === 1 && a.x >= tx) || (a.dir === 3 && a.x <= tx) || a.dir % 2 === 0) {
            a.x = tx;
            a.dir = nd;
            a.turn = -1;
          }
        }
      }
    }
    if (blocked) a.v = Math.max(0, a.v - 140 * dt);
    else a.v = Math.min(a.vt * (g.ev.on && g.ev.kind === 'rain' ? 0.85 : 1), a.v + 40 * dt);
    a.x += DX[a.dir] * a.v * dt;
    a.y += DY[a.dir] * a.v * dt;
    a.x = clamp(a.x, VX[0] - RH, VX[NI] + RH);
    a.y = clamp(a.y, HY[0] - RH, HY[NJ] + RH);
  }
}

function nearestIntersection(a: Ai): [number, number, number, number, number] | null {
  let best: [number, number, number, number, number] | null = null;
  for (let i = 0; i < VX.length; i++)
    for (let j = 0; j < HY.length; j++) {
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
  const h = (g.bike ? 2.5 : 3.5) + grow;
  return { x: g.p.x - h, y: g.p.y - h, w: h * 2, h: h * 2 };
}

export function blockedAt(g: TownSim, x: number, y: number): boolean {
  const h = g.bike ? 3 : 4.5;
  const b = { x: x - h, y: y - h, w: h * 2, h: h * 2 };
  return g.solids.some((s) => hit(b, s));
}

// -1 = going uphill, +1 = downhill, 0 = flat
export function slopeAt(g: TownSim, x: number, y: number, vy: number): number {
  const h = g.town.hill;
  if (Math.abs(x - VX[h.i]) > RH || y < HY[h.j] + RH || y > HY[h.j + 1] - RH || Math.abs(vy) < 2) return 0;
  const goingUp = (h.up === 0 && vy < 0) || (h.up === 2 && vy > 0);
  return goingUp ? -1 : 1;
}

export function onOneWay(g: TownSim, x: number, y: number): boolean {
  return Math.abs(y - HY[g.town.oneway.r]) < RH && !VX.some((vx) => Math.abs(x - vx) < RH);
}

export interface TownControls {
  ix: number; // desired direction (-1..1)
  iy: number;
  throttle: number; // 0..1
  slow: boolean;
  boost: boolean; // car: fire a boost (edge); bike: sprint while held
}

function spill(g: TownSim, f: number): void {
  for (const o of g.orders) if (o.state === 'carry') o.care = Math.max(0, o.care - f);
}

export function stepTown(g: TownSim, c: TownControls, dt: number): void {
  g.t += dt;
  if (g.phase === 'count') {
    if (g.t >= 3.6) {
      g.phase = 'play';
      g.events.push({ e: 'go' });
      newOrder(g);
      newOrder(g);
      g.orderT = 4;
      updateRoute(g);
    }
    return;
  }
  const p = g.p;
  if (g.phase === 'play') {
    g.gt += dt;
    if (g.gt >= SHIFT) {
      g.phase = 'end';
      g.endT = 0;
      g.earned = Math.min(g.earned, g.bike ? MAX_EARN.bike : MAX_EARN.car);
      g.score = clamp(g.earned / (g.bike ? REF.bike : REF.car), 0, 1);
      g.events.push({ e: 'end' });
      say(g, `Shift over! ${g.delivered} deliveries.`, g.delivered >= 4 ? 'good' : 'info');
    }
  } else g.endT += dt;

  // ---- the mid-shift twist ----
  const ev = g.ev;
  const wasOn = ev.on;
  ev.on = g.gt >= ev.t0 && g.gt < ev.t1;
  if (ev.on && !wasOn) {
    g.events.push({ e: 'weather', s: ev.kind });
    say(g, ev.kind === 'rain' ? 'Rain! Roads are slick, but tips are 35% bigger.' : 'Dinner rush! More orders, more traffic, +20% tips.', 'cmd');
  } else if (!ev.on && wasOn && g.phase === 'play') say(g, ev.kind === 'rain' ? 'The rain stopped. Roads are drying.' : 'The rush is calming down.', 'info');
  const rain = ev.on && ev.kind === 'rain';

  // ---- movement ----
  const live = g.phase === 'play' && p.stun <= 0;
  p.stun = Math.max(0, p.stun - dt);
  p.hitCd = Math.max(0, p.hitCd - dt);
  // boost / sprint
  if (g.bike) {
    g.sprinting = live && c.boost && g.stamina > 0.02 && !c.slow;
    if (g.sprinting) g.stamina = Math.max(0, g.stamina - dt * 0.42);
    else g.stamina = Math.min(1, g.stamina + dt * (c.boost ? 0.08 : 0.2));
    if (c.boost && g.stamina <= 0.02 && live && g.t - g.say.t > 3) {
      say(g, 'Out of breath! Coast a sec to get your legs back.', 'info');
      g.events.push({ e: 'tired' });
    }
  } else {
    if (live && c.boost && g.boostT <= 0 && g.boosts > 0) {
      g.boosts--;
      g.boostT = BOOST_TIME;
      g.events.push({ e: 'boost', x: p.x, y: p.y });
    }
    g.boostT = Math.max(0, g.boostT - dt);
  }
  let tx = 0;
  let ty = 0;
  const mag = Math.hypot(c.ix, c.iy);
  if (live && mag > 0.01) {
    const slope = slopeAt(g, p.x, p.y, c.iy * 10);
    const hillK = g.bike ? (slope < 0 ? 0.55 : slope > 0 ? 1.3 : 1) : slope < 0 ? 0.92 : slope > 0 ? 1.08 : 1;
    const boostK = g.bike ? (g.sprinting ? 1.4 : 1) : g.boostT > 0 ? 1.55 : 1;
    const top = g.vmax * clamp(c.throttle, 0, 1) * (c.slow ? 0.42 : 1) * hillK * boostK;
    tx = (c.ix / mag) * top;
    ty = (c.iy / mag) * top;
  }
  const grip = (mag > 0.01 && live ? (g.bike ? 5 : 3.6) : c.slow ? 7 : 2.6) * (rain ? 0.45 : 1) * (g.boostT > 0 ? 1.4 : 1);
  // skids: asking to go a very different way than you're moving, at speed
  const sp0 = Math.hypot(p.vx, p.vy);
  if (mag > 0.01 && live && sp0 > g.vmax * 0.55) {
    const dot = (p.vx * tx + p.vy * ty) / (sp0 * (Math.hypot(tx, ty) || 1));
    if (dot < 0.5) {
      g.skidT += dt;
      if (!g.bike || rain) {
        const sn = Math.sin(p.ang);
        const cs = Math.cos(p.ang);
        for (const side of [-3, 3]) g.marks.push({ x: p.x - sn * -5 + cs * side, y: p.y + cs * 5 + sn * side, l: 6 });
        if (g.marks.length > 500) g.marks.splice(0, g.marks.length - 500);
      }
      if (g.skidT > 0.12 && g.skidT - dt <= 0.12) g.events.push({ e: 'skid', x: p.x, y: p.y });
    } else g.skidT = 0;
  } else g.skidT = 0;
  for (const m of g.marks) m.l -= dt;
  if (g.marks.length && g.marks[0].l <= 0) g.marks = g.marks.filter((m) => m.l > 0);

  p.vx += (tx - p.vx) * Math.min(1, grip * dt);
  p.vy += (ty - p.vy) * Math.min(1, grip * dt);
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
    // the body lags the velocity a little (more in the rain): reads as a drift
    p.ang += d * Math.min(1, dt * (rain ? 6 : 11));
  }

  stepAi(g, dt);
  g.routeT -= dt;
  if (g.routeT <= 0 && g.phase === 'play') {
    g.routeT = 0.12;
    updateRoute(g);
  }
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
    g.boostT = 0;
    const full = g.orders.some((o) => o.state === 'carry');
    spill(g, 0.35);
    g.events.push({ e: 'crash', x: p.x, y: p.y, s: full ? 'SPILL!' : 'BONK!' });
    say(g, full ? 'BONK! The drinks spilled. Customers notice.' : 'BONK! Watch the traffic.', 'mark');
  }
  // ---- potholes ----
  g.holeCd = Math.max(0, g.holeCd - dt);
  for (const h of g.town.holes) {
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
  // ---- wrong way on the one-way ----
  g.wrongCd = Math.max(0, g.wrongCd - dt);
  const ow = g.town.oneway;
  const against = ow.dir === 1 ? p.vx < -14 : p.vx > 14;
  if (onOneWay(g, p.x, p.y) && against) {
    g.wrongT += dt;
    if (g.wrongT > 0.5 && g.wrongCd <= 0) {
      g.wrongCd = 2.5;
      spill(g, 0.1);
      g.events.push({ e: 'wrong', x: p.x, y: p.y });
      say(g, 'WRONG WAY! That street is one-way. Follow the arrows.', 'mark');
    }
  } else g.wrongT = 0;
  // ---- speed trap ----
  const tr = g.town.trap;
  const inTrap = p.x > tr.x && p.x < tr.x + tr.w && p.y > tr.y && p.y < tr.y + tr.h;
  if (inTrap && sp > g.vmax * 0.7 && !g.ticket) {
    g.trapAcc += dt;
    if (g.trapAcc > 0.25) {
      g.ticket = true;
      g.sirenT = 3;
      g.events.push({ e: 'ticket', x: p.x, y: p.y });
      say(g, 'Busted! Speeding ticket in the 15 zone.', 'mark');
    }
  } else g.trapAcc = Math.max(0, g.trapAcc - dt);
  g.sirenT = Math.max(0, g.sirenT - dt);

  // ---- orders ----
  for (const o of g.orders) {
    if (o.state !== 'wait' && o.state !== 'carry') continue;
    const before = o.t;
    o.t -= dt;
    if (o.state === 'carry') o.heat = Math.max(0, o.heat - dt / (rain ? 34 : 42));
    if (o.state === 'wait' && o.t <= 0) {
      o.state = 'fail';
      g.missed++;
      g.streak = 0;
      g.events.push({ e: 'fail', x: p.x, y: p.y });
      say(g, `${RESTS[o.rest].label} gave that order to another driver.`, 'mark');
    } else if (o.state === 'carry' && before > 0 && o.t <= 0) {
      g.events.push({ e: 'late' });
      say(g, `You're LATE to the ${colorName(o.color)} house! Hurry, it still counts.`, 'mark');
    } else if (o.state === 'carry' && o.t <= -LATE_GRACE) {
      o.state = 'fail';
      g.missed++;
      g.streak = 0;
      g.events.push({ e: 'refund', x: p.x, y: p.y });
      say(g, 'The customer cancelled and got a refund. Ouch.', 'mark');
    }
  }
  if (g.focus && !activeOrders(g).some((o) => o.id === g.focus)) g.focus = 0;
  const carrying = g.orders.filter((o) => o.state === 'carry').length;
  let room = g.cap - carrying;
  for (const o of g.orders) {
    if (o.state !== 'wait' || room <= 0) continue;
    const rs = g.town.slots[g.town.rests[o.rest]];
    if (Math.hypot(p.x - rs.px, p.y - rs.py) < 12) {
      o.state = 'carry';
      o.heat = 1;
      room--;
      if (g.focus === o.id) g.focus = 0;
      g.events.push({ e: 'pickup', x: rs.px, y: rs.py, c: o.color });
      say(g, `Got the ${RESTS[o.rest].food}! ${o.req === 'hand' ? 'STOP at' : 'Drive by'} the ${colorName(o.color)} door.`, 'good');
      g.routeT = 0;
    }
  }
  if (room <= 0 && g.orders.some((o) => o.state === 'wait' && Math.hypot(p.x - g.town.slots[g.town.rests[o.rest]].px, p.y - g.town.slots[g.town.rests[o.rest]].py) < 12)) {
    if (g.t - g.say.t > 2) say(g, 'Your bag is full! Deliver first.', 'info');
  }
  for (const o of g.orders) {
    if (o.state !== 'carry') continue;
    const s = g.town.slots[o.slot];
    const near = Math.hypot(p.x - s.px, p.y - s.py) < (o.req === 'hand' ? 13 : 12);
    if (!near) {
      o.hold = Math.max(0, o.hold - dt * 2);
      continue;
    }
    if (o.req === 'hand') {
      if (sp < 10) {
        if (o.hold === 0) g.events.push({ e: 'hold', x: s.dx, y: s.dy });
        o.hold += dt;
      } else {
        o.hold = Math.max(0, o.hold - dt);
        if (g.t - g.say.t > 1.5) say(g, `Hand it over: STOP at the ${colorName(o.color)} door!`, 'cmd');
      }
      if (o.hold < HOLD_TIME) continue;
    }
    deliver(g, o, s);
  }
  for (const cu of g.customers) cu.t -= dt;
  g.customers = g.customers.filter((cu) => cu.t > 0);

  // new orders as old ones clear; it gets busier as the shift goes on
  const cap = g.gt < 10 ? 2 : ev.on && ev.kind === 'rush' ? 4 : 3;
  g.orderT -= dt;
  if (activeOrders(g).length < cap && g.orderT <= 0 && g.gt < SHIFT - 6) {
    newOrder(g);
    g.orderT = (ev.on && ev.kind === 'rush' ? 0.6 : 1.2) + g.rand() * 1.5;
  }
}

function deliver(g: TownSim, o: Order, s: Slot): void {
  o.state = 'done';
  const stars = starsFor(o);
  o.stars = stars;
  const pay = g.bike ? PAY.bike : PAY.car;
  let tip = pay.tip * ((stars - 1) / 4) * tipMult(g);
  if (stars >= 4) g.streak++;
  else g.streak = 0;
  g.bestStreak = Math.max(g.bestStreak, g.streak);
  const bonus = g.streak >= 2 ? Math.min(4, g.streak - 1) : 0;
  tip += bonus;
  o.pay = Math.round((pay.base + tip) * 100) / 100;
  g.earned += o.pay;
  g.delivered++;
  g.drops.push({ rest: o.rest, color: o.color, stars, pay: o.pay, kind: s.kind });
  if (g.focus === o.id) g.focus = 0;
  const lines = LINES[stars];
  g.customers.push({ x: s.dx, y: s.dy + (s.face < 0 ? 4 : -4), t: 2.2, c: o.color, stars, line: lines[Math.floor(g.rand() * lines.length)] });
  g.events.push({ e: 'drop', x: s.px, y: s.py, s: `+$${Math.round(o.pay)}`, c: o.color, n: stars });
  if (bonus) g.events.push({ e: 'streak', x: s.px, y: s.py - 10, n: g.streak, s: `+$${bonus}` });
  say(g, stars >= 5 ? 'Five stars! Hot, fast and spotless.' : stars === 4 ? 'Four stars. Nice drop!' : stars === 3 ? 'Three stars. The food was a bit sad.' : o.t <= 0 ? 'Late. They tipped almost nothing.' : 'Cold and spilled. Ouch, low rating.', stars >= 4 ? 'good' : 'info');
  g.routeT = 0;
}

function cornerNudge(g: TownSim, x: number, y: number, axis: 'x' | 'y'): number {
  for (let k = 1; k <= 7; k++)
    for (const s of [1, -1]) {
      const ok = axis === 'y' ? !blockedAt(g, x, y + s * k) : !blockedAt(g, x + s * k, y);
      if (ok) return s * k;
    }
  return 0;
}

export function colorName(c: string): string {
  return { '#ff5a4a': 'red', '#4a9aff': 'blue', '#ffd23a': 'yellow', '#c07aff': 'purple', '#3ae0b0': 'green', '#ff8ad0': 'pink' }[c] ?? 'glowing';
}

export function avgStars(g: TownSim): number {
  if (!g.drops.length) return 0;
  return g.drops.reduce((a, d) => a + d.stars, 0) / g.drops.length;
}

export function bestDrop(g: TownSim): Drop | null {
  return g.drops.reduce<Drop | null>((b, d) => (!b || d.pay > b.pay ? d : b), null);
}

const REVIEWS: Record<number, string[]> = {
  5: ['“Food arrived so hot it time-traveled. Ten stars if I could.”', '“My driver moved like a movie getaway. Respectfully.”', '“I tipped extra and I’d do it again.”'],
  4: ['“Fast, friendly, only slightly sweaty.”', '“Fries still crispy. That never happens.”', '“Solid. Would order from this human again.”'],
  3: ['“The food was… present.”', '“Arrived. Was food. Three stars.”', '“Fine. My cat was more excited than me.”'],
  2: ['“My milkshake became soup in transit.”', '“Watched the little car drive in circles for a while.”', '“Lukewarm tacos are a cry for help.”'],
  1: ['“Did you take my pizza on a road trip?”', '“The sushi came back from the dead to complain.”', '“I could hear the drinks spill from inside.”'],
};

export function reviewFor(g: TownSim): string {
  const a = Math.round(avgStars(g)) || 1;
  const xs = REVIEWS[clamp(a, 1, 5)];
  return xs[g.seed % xs.length];
}

// ======================= RENDERING =======================
const MAPS = new WeakMap<TownSim, HTMLCanvasElement>();

function mapCanvas(g: TownSim): HTMLCanvasElement {
  const hitC = MAPS.get(g);
  if (hitC) return hitC;
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  paintMap(x, g);
  MAPS.set(g, c);
  return c;
}

function tree(x: Ctx, cx: number, cy: number, r = 6, tint = 0): void {
  const base = ['#2f6a32', '#3a6a2a', '#2a5e44'][tint % 3];
  disc(x, cx + 2, cy + 3, r, 'rgba(10,30,10,0.35)');
  disc(x, cx, cy, r, shade(base, 0.8));
  disc(x, cx, cy, r - 1, base);
  disc(x, cx - 1, cy - 1, r - 2, shade(base, 1.3));
  disc(x, cx - 2, cy - 3, Math.max(1, r - 4), shade(base, 1.7));
  rect(x, cx - 3, cy - 4, 1, 1, shade(base, 2));
}

function bush(x: Ctx, cx: number, cy: number, c = '#3f8a3e'): void {
  disc(x, cx + 1, cy + 1, 2, 'rgba(10,30,10,0.3)');
  disc(x, cx, cy, 2, c);
  rect(x, cx - 1, cy - 1, 1, 1, shade(c, 1.5));
}

function paintMap(x: Ctx, g: TownSim): void {
  const T = g.town;
  const windows: Town['windows'] = [];
  // grass
  rect(x, 0, 0, TW, TH, '#5f9a4a');
  for (let j = 0; j < TH; j++)
    for (let i = 0; i < TW; i++) {
      const n = hash(i * 31 + j * 17);
      if (n > 0.92) rect(x, i, j, 1, 1, hash(i + j * 3) > 0.5 ? '#6eae56' : '#4f8a3e');
    }
  // sidewalks around every block + roads
  const asphalt = '#4a4a56';
  for (const y of HY) rect(x, VX[0] - RH, y - RH, VX[NI] - VX[0] + RH * 2, RH * 2, asphalt);
  for (const vx of VX) rect(x, vx - RH, HY[0] - RH, RH * 2, HY[NJ] - HY[0] + RH * 2, asphalt);
  // the hill: darker/lighter bands, chevrons pointing uphill
  {
    const h = T.hill;
    const y0 = HY[h.j] + RH;
    const y1 = HY[h.j + 1] - RH;
    for (let y = y0; y < y1; y++) {
      const f = (y - y0) / (y1 - y0);
      const up = h.up === 0 ? 1 - f : f; // 1 = top of the hill
      rect(x, VX[h.i] - RH, y, RH * 2, 1, mix('#3e3e4a', '#5a5a68', up));
    }
    rect(x, VX[h.i] - RH - 1, y0, 1, y1 - y0, '#8a7a5a');
    rect(x, VX[h.i] + RH, y0, 1, y1 - y0, '#8a7a5a');
  }
  for (let j = HY[0] - RH; j < HY[NJ] + RH; j++)
    for (let i = VX[0] - RH; i < VX[NI] + RH; i++) {
      const n = hash(i * 13 + j * 7);
      if (n > 0.965) rect(x, i, j, 1, 1, '#58586c');
      else if (n < 0.025) rect(x, i, j, 1, 1, '#3c3c48');
    }
  const inInter = (px: number, py: number): boolean => VX.some((vx) => Math.abs(px - vx) < RH + 1) && HY.some((hy) => Math.abs(py - hy) < RH + 1);
  // lane edges (faint) + dashed center lines (none on the one-way: it gets arrows instead)
  for (const y of HY) {
    for (let i = VX[0]; i < VX[NI]; i++) {
      if (inInter(i, y)) continue;
      if (y === HY[T.oneway.r]) {
        if (i % 12 < 6) {
          rect(x, i, y - 1, 1, 1, '#b8b4a8');
          rect(x, i, y + 1, 1, 1, '#b8b4a8');
        }
      } else if (i % 8 < 4) rect(x, i, y, 1, 1, '#e8c84a');
    }
  }
  for (const vx of VX) for (let j = HY[0]; j < HY[NJ]; j++) if (j % 8 < 4 && !inInter(vx, j)) rect(x, vx, j, 1, 1, '#e8c84a');
  // one-way arrows
  {
    const y = HY[T.oneway.r];
    const d = T.oneway.dir === 1 ? 1 : -1;
    for (let i = 0; i < NI; i++)
      for (const f of [0.3, 0.7])
        for (const ly of [y - LANE, y + LANE]) {
          const ax = Math.round(lerp(VX[i], VX[i + 1], f));
          rect(x, ax - 4, ly, 7, 1, '#f2efe6');
          for (let k = 0; k < 3; k++) rect(x, ax + d * (3 - k), ly - k, 1, k * 2 + 1, '#f2efe6');
        }
  }
  // crosswalks
  for (const vx of VX)
    for (const hy of HY)
      for (let k = -RH + 1; k < RH; k += 3) {
        if (hy > HY[0]) rect(x, vx + k, hy - RH - 4, 2, 3, '#d8d4c8');
        if (hy < HY[NJ]) rect(x, vx + k, hy + RH + 1, 2, 3, '#d8d4c8');
        if (vx > VX[0]) rect(x, vx - RH - 4, hy + k, 3, 2, '#d8d4c8');
        if (vx < VX[NI]) rect(x, vx + RH + 1, hy + k, 3, 2, '#d8d4c8');
      }
  // manholes
  for (let k = 0; k < 8; k++) {
    const i = Math.floor(hash(k * 7 + g.seed) * NI);
    const j = Math.floor(hash(k * 11 + g.seed) * HY.length);
    const mx = Math.round(lerp(VX[i] + 20, VX[i + 1] - 20, hash(k * 5)));
    disc(x, mx, HY[j] + (k % 2 ? 2 : -2), 2, '#3a3a44');
    rect(x, mx - 1, HY[j] + (k % 2 ? 2 : -2), 3, 1, '#5a5a66');
  }
  // border trees
  for (let i = 4; i < TW; i += 13) {
    tree(x, i + hash(i) * 4, 6, 5, i % 3);
    tree(x, i + hash(i + 9) * 4, TH - 5, 5, (i + 1) % 3);
  }
  for (let j = 18; j < TH - 10; j += 14) {
    tree(x, 6, j + hash(j) * 4, 5, j % 3);
    tree(x, TW - 6, j + hash(j + 4) * 4, 5, (j + 2) % 3);
  }
  // blocks
  for (let j = 0; j < NJ; j++)
    for (let i = 0; i < NI; i++) {
      const b = blockRect(i, j);
      const d = T.district[i][j];
      // curb (light top edge) + sidewalk
      rect(x, b.x, b.y, b.w, b.h, '#ece4d4');
      rect(x, b.x + 1, b.y + 1, b.w - 2, b.h - 2, d === 'down' ? '#bcb4a8' : '#c8c0b0');
      rect(x, b.x, b.y + b.h - 1, b.w, 1, '#8a8478');
      rect(x, b.x + b.w - 1, b.y, 1, b.h, '#9a9488');
      for (let k = b.x + 6; k < b.x + b.w; k += 8) {
        rect(x, k, b.y + 1, 1, 4, '#b0a898');
        rect(x, k, b.y + b.h - 5, 1, 4, '#b0a898');
      }
      if (d === 'park') paintPark(x, b);
      else if (d === 'down') {
        rect(x, b.x + 5, b.y + 5, b.w - 10, b.h - 10, '#a8a094');
        dither(x, b.x + 5, b.y + 5, b.w - 10, b.h - 10, '#a8a094', '#b0a89c');
      } else if (d === 'apt') {
        rect(x, b.x + 5, b.y + 5, b.w - 10, b.h - 10, '#67a352');
        // parking lot in the middle
        rect(x, b.x + 8, b.y + b.h / 2 - 5, b.w - 16, 10, '#5a5a64');
        for (let k = b.x + 10; k < b.x + b.w - 8; k += 6) rect(x, k, b.y + b.h / 2 - 5, 1, 4, '#d8d4c8');
      } else {
        rect(x, b.x + 5, b.y + 5, b.w - 10, b.h - 10, '#67a352');
        // back fences between yards
        rect(x, b.x + 6, b.y + b.h / 2, b.w - 12, 1, '#9a7a52');
        rect(x, b.x + b.w / 2, b.y + 6, 1, b.h - 12, '#9a7a52');
        for (let k = 0; k < 4; k++) bush(x, b.x + 10 + hash(i * 9 + j * 3 + k) * (b.w - 20), b.y + b.h / 2 + (k % 2 ? 3 : -3), k % 2 ? '#3f8a3e' : '#4a9a46');
      }
      // street trees on the sidewalk corners
      if (d !== 'down') {
        tree(x, b.x + 4, b.y + b.h / 2, 3, i + j);
        tree(x, b.x + b.w - 4, b.y + b.h / 2, 3, i + j + 1);
      }
    }
  // apartment and downtown buildings span both slots on a face
  for (let j = 0; j < NJ; j++)
    for (let i = 0; i < NI; i++) {
      const d = T.district[i][j];
      if (d !== 'apt' && d !== 'down') continue;
      const b = blockRect(i, j);
      for (const face of [-1, 1] as const) {
        const ss = T.slots.filter((s) => s.bi === i && s.bj === j && s.face === face);
        if (d === 'apt') paintApartment(x, b, face, ss, windows);
        else paintTowers(x, b, face, ss, windows, i * 7 + j * 3 + (face > 0 ? 1 : 0));
      }
    }
  for (const s of T.slots) if (s.kind === 'house') paintHouse(x, s, windows);
  for (const s of T.slots) if (s.kind === 'rest') paintRestaurant(x, s);
  // hill sign + chevrons
  {
    const h = T.hill;
    const y0 = HY[h.j] + RH;
    const y1 = HY[h.j + 1] - RH;
    const dir = h.up === 0 ? -1 : 1; // uphill direction in y
    for (let k = 0; k < 3; k++) {
      const cy = Math.round(lerp(y0 + 8, y1 - 8, (k + 0.5) / 3));
      for (let q = 0; q < 4; q++) {
        rect(x, VX[h.i] - 4 + q, cy + dir * -q, 1, 1, '#d8c870');
        rect(x, VX[h.i] + 3 - q, cy + dir * -q, 1, 1, '#d8c870');
      }
    }
    const sy = h.up === 0 ? y1 - 12 : y0 + 2;
    const sx = h.i === NI ? VX[h.i] - RH - 16 : VX[h.i] + RH + 1;
    rect(x, sx, sy, 13, 10, '#f2b632');
    outlineRect(x, sx - 1, sy - 1, 15, 12, INK);
    for (let q = 0; q < 9; q++) rect(x, sx + 2 + q, sy + 7 - Math.floor(q * 0.6), 1, 1 + Math.floor(q * 0.6), INK);
  }
  // speed trap: 15 paint + signs
  {
    const tr = T.trap;
    const cy = tr.y + RH;
    text(x, '15', tr.x + 8, cy + 1, '#e8e4d8');
    text(x, '15', tr.x + tr.w - 14, cy - 6, '#e8e4d8');
    for (const sx of [tr.x - 4, tr.x + tr.w + 1]) {
      const sy = tr.copY > cy ? cy + RH + 1 : cy - RH - 12;
      rect(x, sx, sy, 9, 11, '#f2f0ea');
      text(x, '15', sx + 1, sy + 3, INK);
      rect(x, sx + 1, sy + 1, 7, 1, '#e0503c');
      outlineRect(x, sx - 1, sy - 1, 11, 13, INK);
    }
    rect(x, tr.copX - 7, tr.copY - 9, 14, 18, '#7a7a86');
    rect(x, tr.copX - 7, tr.copY - 9, 14, 1, '#9a9aa6');
  }
  // one-way signs at the ends of the one-way street
  {
    const y = HY[T.oneway.r];
    for (const vx of VX) {
      const sx = vx + RH + 2;
      const sy = y - RH - 8;
      if (sx + 13 > TW - 4) continue;
      const d = T.oneway.dir === 1 ? 1 : -1;
      rect(x, sx, sy, 13, 7, INK);
      rect(x, sx + 1, sy + 1, 11, 5, '#f2f0ea');
      rect(x, sx + 2, sy + 3, 7, 1, INK);
      const hx = d > 0 ? sx + 9 : sx + 3;
      rect(x, hx, sy + 2, 1, 3, INK);
      rect(x, hx + d, sy + 3, 1, 1, INK);
      rect(x, d > 0 ? sx + 2 : sx + 3, sy + 3, 7, 1, INK);
    }
  }
  // potholes
  for (const h of T.holes) {
    disc(x, h.x, h.y, h.r, '#2a2a34');
    disc(x, h.x - 1, h.y - 1, h.r - 1, '#1c1c24');
    rect(x, h.x - h.r, h.y + h.r - 1, 2, 1, '#6a6a7a');
    rect(x, h.x + 1, h.y + h.r, 2, 1, '#6a6a7a');
  }
  // lamp posts (heads are drawn live so they can glow at dusk)
  for (const l of T.lamps) {
    rect(x, l.x, l.y, 2, 2, '#3a3a44');
    rect(x, l.x + 2, l.y + 2, 1, 1, 'rgba(0,0,0,0.3)');
  }
  T.windows = windows;
}

function paintPark(x: Ctx, b: Box): void {
  rect(x, b.x + 3, b.y + 3, b.w - 6, b.h - 6, '#6aaa56');
  dither(x, b.x + 3, b.y + 3, b.w - 6, b.h - 6, '#6aaa56', '#72b25c');
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  rect(x, cx - 6, b.y, 12, b.h, '#d8c8a0');
  rect(x, b.x, cy - 6, b.w, 12, '#d8c8a0');
  rect(x, cx - 6, b.y, 1, b.h, '#b8a880');
  rect(x, b.x, cy - 6, b.w, 1, '#b8a880');
  for (let k = b.y; k < b.y + b.h; k += 6) rect(x, cx, k, 1, 3, '#f2efe6');
  for (let k = b.x; k < b.x + b.w; k += 6) rect(x, k, cy, 3, 1, '#f2efe6');
  for (const [px, py] of [
    [cx - 1, b.y + 1],
    [cx - 1, b.y + b.h - 3],
    [b.x + 1, cy - 1],
    [b.x + b.w - 3, cy - 1],
  ]) {
    rect(x, px - 4, py, 2, 2, '#f2b632');
    rect(x, px + 4, py, 2, 2, '#f2b632');
  }
  // pond
  disc(x, b.x + 16, b.y + 14, 8, '#2f6aa8');
  disc(x, b.x + 16, b.y + 14, 7, '#3f7fd8');
  disc(x, b.x + 15, b.y + 13, 5, '#5a9ae8');
  rect(x, b.x + 12, b.y + 11, 3, 1, '#bfe0ff');
  rect(x, b.x + 18, b.y + 17, 2, 1, '#bfe0ff');
  // ducks
  rect(x, b.x + 18, b.y + 12, 2, 1, '#f2efe6');
  rect(x, b.x + 20, b.y + 11, 1, 1, '#2a6a2a');
  // playground
  const px0 = b.x + b.w - 26;
  const py0 = b.y + b.h - 22;
  rect(x, px0, py0, 18, 14, '#d8b878');
  dither(x, px0, py0, 18, 14, '#d8b878', '#c8a868');
  rect(x, px0 + 3, py0 + 3, 6, 2, '#e0503c');
  rect(x, px0 + 3, py0 + 5, 1, 6, '#5a5a66');
  rect(x, px0 + 8, py0 + 5, 1, 6, '#5a5a66');
  rect(x, px0 + 11, py0 + 4, 2, 8, '#3f7fd8');
  rect(x, px0 + 13, py0 + 10, 3, 2, '#3f7fd8');
  // flower beds + trees
  for (let k = 0; k < 6; k++) rect(x, b.x + 8 + k * 3, b.y + b.h - 10, 1, 1, ['#ff6a8a', '#ffd23a', '#ffffff'][k % 3]);
  tree(x, b.x + b.w - 14, b.y + 12, 6, 0);
  tree(x, b.x + 14, b.y + b.h - 18, 6, 2);
  tree(x, b.x + b.w - 8, b.y + 26, 4, 1);
  rect(x, b.x + b.w - 30, b.y + 10, 8, 2, '#8a5a3a');
  rect(x, b.x + b.w - 30, b.y + 12, 1, 2, '#5a3a2a');
  rect(x, b.x + b.w - 23, b.y + 12, 1, 2, '#5a3a2a');
  text(x, 'BIKES', cx + 8, cy + 8, '#3a5a2a');
}

function paintHouse(x: Ctx, s: Slot, windows: Town['windows']): void {
  const up = s.face < 0;
  const w = 26;
  const h = 20;
  const bx = s.dx - w / 2;
  const by = up ? s.dy + 7 : s.dy - 7 - h;
  // yard: lawn stripes, fence, garden bed, mailbox
  const yy = up ? s.dy + 1 : by + h + 3;
  for (let k = 0; k < w + 6; k += 4) rect(x, bx - 3 + k, yy, 2, 3, '#72b25c');
  rect(x, bx - 4, up ? by + h + 1 : by - 3, w + 8, 1, '#c8b890');
  for (let k = bx - 4; k < bx + w + 4; k += 3) rect(x, k, up ? by + h : by - 4, 1, 2, '#e8dcc0');
  rect(x, s.dx + 6, up ? s.dy + 2 : s.dy - 5, 2, 3, '#5a5a66');
  rect(x, s.dx + 5, up ? s.dy + 1 : s.dy - 6, 4, 2, '#3f6ad8');
  for (let k = 0; k < 4; k++) rect(x, bx + 1 + k * 2, up ? s.dy + 3 : s.dy - 4, 1, 1, ['#ff6a8a', '#ffd23a', '#c07aff', '#ffffff'][(s.i + k) % 4]);
  // shadow + hip roof with light from the top-left
  rect(x, bx + 3, by + 3, w, h, 'rgba(10,20,10,0.35)');
  const half = Math.floor(h / 2);
  const R = s.roof;
  rect(x, bx, by, w, h, shade(R, 0.85));
  rect(x, bx, by, w, half, shade(R, 1.08)); // north slope (lit)
  for (let k = 0; k < half; k++) {
    rect(x, bx + k, by + k, 1, h - k * 2, shade(R, 0.95)); // west slope
    rect(x, bx + w - 1 - k, by + k, 1, h - k * 2, shade(R, 0.68)); // east slope (shade)
  }
  rect(x, bx + half, by + half - 1, w - half * 2, 2, shade(R, 1.3)); // ridge
  for (let k = 2; k < h; k += 3) rect(x, bx + 2, by + k, w - 4, 1, 'rgba(0,0,0,0.08)');
  // chimney
  const chx = bx + (s.i % 2 ? 5 : w - 9);
  rect(x, chx, by + 2, 4, 5, '#8a5a4a');
  rect(x, chx, by + 2, 4, 1, '#a87a6a');
  rect(x, chx + 1, by + 3, 2, 1, '#2a1a1a');
  outlineRect(x, bx - 1, by - 1, w + 2, h + 2, INK);
  // front wall strip with door + windows (the side facing the street)
  const fy = up ? by - 3 : by + h;
  const wall = WALLS[s.i % WALLS.length];
  rect(x, bx, fy, w, 3, wall);
  rect(x, bx, up ? fy : fy + 2, w, 1, shade(wall, 0.8));
  rect(x, s.dx - 2, fy, 4, 3, s.doorC);
  rect(x, s.dx + 1, fy + 1, 1, 1, '#f2d048');
  for (const wx of [bx + 3, bx + w - 7]) {
    rect(x, wx, fy, 4, 2, '#7d9cc8');
    windows.push({ x: wx, y: fy });
  }
  // walkway
  const wy0 = up ? s.dy + 1 : fy + 3;
  const wy1 = up ? fy : s.dy - 1;
  rect(x, s.dx - 1, wy0, 3, Math.max(0, wy1 - wy0), '#d8cfb8');
}

function paintApartment(x: Ctx, b: Box, face: -1 | 1, ss: Slot[], windows: Town['windows']): void {
  const up = face < 0;
  const w = b.w - 10;
  const h = 18;
  const bx = b.x + 5;
  const by = up ? b.y + 7 : b.y + b.h - 7 - h;
  rect(x, bx + 4, by + 4, w, h, 'rgba(10,20,10,0.4)');
  // flat roof: gravel, parapet, AC units, roof door
  rect(x, bx, by, w, h, '#8a8694');
  dither(x, bx + 2, by + 2, w - 4, h - 4, '#8a8694', '#7e7a88');
  rect(x, bx, by, w, 2, '#a8a4b2');
  rect(x, bx, by + h - 2, w, 2, '#6a6674');
  rect(x, bx, by, 2, h, '#a09cab');
  rect(x, bx + w - 2, by, 2, h, '#64606e');
  for (let k = 0; k < 3; k++) {
    const ax = bx + 8 + k * 18;
    rect(x, ax, by + 5, 6, 5, '#c8c8d0');
    rect(x, ax, by + 5, 6, 1, '#e8e8f0');
    disc(x, ax + 3, by + 7, 1, '#5a5a66');
  }
  rect(x, bx + w - 12, by + 6, 7, 7, '#a87a5a');
  rect(x, bx + w - 12, by + 6, 7, 1, '#c89a7a');
  outlineRect(x, bx - 1, by - 1, w + 2, h + 2, INK);
  // street-facing wall: balconies + windows + buzzer doors
  const fy = up ? by - 4 : by + h;
  rect(x, bx, fy, w, 4, '#d8a878');
  rect(x, bx, up ? fy : fy + 3, w, 1, '#a87a58');
  for (let k = bx + 3; k < bx + w - 3; k += 7) {
    rect(x, k, fy + 1, 4, 2, '#7d9cc8');
    windows.push({ x: k, y: fy + 1 });
  }
  for (const s of ss) {
    rect(x, s.dx - 3, fy, 6, 4, s.doorC);
    rect(x, s.dx - 3, fy, 6, 1, shade(s.doorC, 1.3));
    rect(x, s.dx + 4, fy + 1, 2, 2, '#f2d048'); // buzzer panel
    const wy0 = up ? s.dy + 1 : fy + 4;
    const wy1 = up ? fy : s.dy - 1;
    rect(x, s.dx - 2, wy0, 4, Math.max(0, wy1 - wy0), '#d8cfb8');
  }
}

const TOWER_C = ['#6a7a9a', '#8a6a5a', '#5a7a7a', '#7a6a8a', '#9a8a6a'];
const AWN = ['#e0503c', '#3caa6a', '#3f7fd8', '#f2b632', '#9a5ad0'];

function paintTowers(x: Ctx, b: Box, face: -1 | 1, ss: Slot[], windows: Town['windows'], seed: number): void {
  const up = face < 0;
  const h = 22;
  const by = up ? b.y + 7 : b.y + b.h - 7 - h;
  const halves = [
    { bx: b.x + 4, w: b.w / 2 - 6 },
    { bx: b.x + b.w / 2 + 2, w: b.w / 2 - 6 },
  ];
  halves.forEach((hv, k) => {
    const s = ss[k];
    if (s && s.kind === 'rest') return; // the restaurant paints itself
    const c = TOWER_C[(seed + k) % TOWER_C.length];
    // long shadow: towers are tall
    rect(x, hv.bx + 6, by + 6, hv.w, h, 'rgba(10,10,20,0.4)');
    rect(x, hv.bx, by, hv.w, h, c);
    rect(x, hv.bx, by, hv.w, 2, shade(c, 1.3));
    rect(x, hv.bx, by, 2, h, shade(c, 1.15));
    rect(x, hv.bx + hv.w - 2, by, 2, h, shade(c, 0.7));
    rect(x, hv.bx, by + h - 2, hv.w, 2, shade(c, 0.65));
    // rooftop grid of skylights / a water tower on some
    for (let j = by + 4; j < by + h - 4; j += 5) for (let i = hv.bx + 4; i < hv.bx + hv.w - 4; i += 6) rect(x, i, j, 3, 2, shade(c, 0.82));
    if ((seed + k) % 3 === 0) {
      disc(x, hv.bx + hv.w / 2, by + h / 2, 4, '#8a5a3a');
      disc(x, hv.bx + hv.w / 2 - 1, by + h / 2 - 1, 2, '#a87a5a');
    }
    outlineRect(x, hv.bx - 1, by - 1, hv.w + 2, h + 2, INK);
    // storefront with awning facing the street
    const fy = up ? by - 4 : by + h;
    rect(x, hv.bx, fy, hv.w, 4, '#3a3a4a');
    for (let i = hv.bx + 2; i < hv.bx + hv.w - 2; i += 5) {
      rect(x, i, fy + 1, 3, 2, '#9ac0e0');
      windows.push({ x: i, y: fy + 1 });
    }
    const awn = AWN[(seed + k * 2) % AWN.length];
    for (let i = 0; i < hv.w; i += 2) rect(x, hv.bx + i, up ? fy - 1 : fy + 4, 1, 1, i % 4 ? awn : '#f2efe6');
    if (s) {
      rect(x, s.dx - 2, fy, 4, 4, s.doorC);
      rect(x, s.dx - 2, fy, 4, 1, shade(s.doorC, 1.3));
    }
  });
}

function paintRestaurant(x: Ctx, s: Slot): void {
  const R = RESTS[s.rest];
  const up = s.face < 0;
  const w = 34;
  const h = 22;
  const bx = Math.round(s.dx - w / 2);
  const by = up ? s.dy + 7 : s.dy - 7 - h;
  // clear the spot (it may sit on a lawn or a downtown lot)
  const ly0 = up ? s.dy + 1 : by - 2;
  const ly1 = up ? by + h + 2 : s.dy - 1;
  rect(x, bx - 2, ly0, w + 4, ly1 - ly0, '#bcb4a8');
  rect(x, bx + 3, by + 3, w, h, 'rgba(10,20,10,0.4)');
  rect(x, bx, by, w, h, '#b8b0c0');
  dither(x, bx + 2, by + 2, w - 4, h - 4, '#b8b0c0', '#a8a0b0');
  rect(x, bx, by, w, 1, '#d8d0e0');
  rect(x, bx + w - 1, by, 1, h, '#8a8294');
  // vent + roof sign
  rect(x, bx + 3, by + (up ? 3 : h - 7), 5, 4, '#7a7486');
  rect(x, bx + 4, by + (up ? 3 : h - 7), 3, 1, '#9a94a6');
  const sy = by + (up ? 10 : 4);
  rect(x, bx + 2, sy, w - 4, 9, shade(R.c, 0.7));
  rect(x, bx + 2, sy - 1, w - 4, 9, R.c);
  rect(x, bx + 2, sy - 1, w - 4, 1, shade(R.c, 1.35));
  text(x, R.name, s.dx - (R.name.length * 4 - 1) / 2, sy + 1, '#ffffff');
  outlineRect(x, bx - 1, by - 1, w + 2, h + 2, INK);
  // striped awning + patio tables toward the street
  const ay = up ? by - 3 : by + h;
  for (let i = 0; i < w; i += 2) rect(x, bx + i, ay, 2, 3, i % 4 ? R.awn : '#f2efe6');
  rect(x, bx, up ? ay + 2 : ay, w, 1, 'rgba(0,0,0,0.2)');
  for (const tx of [bx + 3, bx + w - 7]) {
    const ty = up ? s.dy + 2 : s.dy - 5;
    disc(x, tx + 1, ty + 1, 1, '#f2efe6');
    rect(x, tx - 1, ty + 1, 1, 1, R.c);
    rect(x, tx + 3, ty + 1, 1, 1, R.c);
  }
  rect(x, s.dx - 2, up ? s.dy + 1 : s.dy - 4, 5, 3, '#5a3a2a');
}

export interface TownDrawOpts {
  reduced: boolean;
  look: VehicleLook;
  fx: Fx;
}

export function camOf(g: TownSim): [number, number] {
  // look a little ahead of where you're going
  const lx = clamp(g.p.vx * 0.35, -24, 24);
  const ly = clamp(g.p.vy * 0.3, -18, 18);
  return [Math.round(clamp(g.p.x + lx - VW / 2, 0, TW - VW)), Math.round(clamp(g.p.y + ly - VH / 2, 0, TH - VH))];
}

// 0 = sunny afternoon, 1 = full dusk
export function duskOf(g: TownSim): number {
  return smooth((g.gt / SHIFT - 0.35) / 0.65);
}

let DARK: HTMLCanvasElement | null = null;
function darkCanvas(): CanvasRenderingContext2D | null {
  if (!DARK) {
    DARK = document.createElement('canvas');
    DARK.width = VW;
    DARK.height = VH;
  }
  return DARK.getContext('2d');
}

// A soft pool of light punched out of the darkness layer (three stepped rings).
function hole(d: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a: number): void {
  for (let k = 0; k < 3; k++) {
    d.globalAlpha = a * 0.4;
    d.beginPath();
    d.ellipse(cx, cy, rx * (1 - k * 0.28), ry * (1 - k * 0.28), 0, 0, Math.PI * 2);
    d.fill();
  }
  d.globalAlpha = 1;
}

function beam(d: CanvasRenderingContext2D, cx: number, cy: number, ang: number, len: number, spread: number, a: number): void {
  const sn = Math.sin(ang);
  const cs = Math.cos(ang);
  for (let k = 0; k < 2; k++) {
    const L = len * (1 - k * 0.35);
    const S = spread * (1 - k * 0.35);
    d.globalAlpha = a * 0.5;
    d.beginPath();
    d.moveTo(cx + sn * 4, cy - cs * 4);
    d.lineTo(cx + sn * L - cs * S, cy - cs * L - sn * S);
    d.lineTo(cx + sn * L + cs * S, cy - cs * L + sn * S);
    d.closePath();
    d.fill();
  }
  d.globalAlpha = 1;
}

export function drawTown(x: Ctx, g: TownSim, o: TownDrawOpts): void {
  const [cx, cy] = camOf(g);
  const T = g.town;
  x.drawImage(mapCanvas(g), cx, cy, VW, VH, 0, 0, VW, VH);
  const S = (wx: number, wy: number): [number, number] => [Math.round(wx - cx), Math.round(wy - cy)];
  const vis = (sx: number, sy: number, m = 20): boolean => sx > -m && sy > -m && sx < VW + m && sy < VH + m;
  const pulse = o.reduced ? 0.5 : (Math.sin(g.t * 6) + 1) / 2;
  const rain = g.ev.on && g.ev.kind === 'rain';
  const dusk = duskOf(g);

  // golden-hour warmth, then wet sheen in the rain
  if (dusk > 0.05 && dusk < 0.9) {
    x.globalAlpha = Math.sin(dusk * Math.PI) * 0.12;
    rect(x, 0, 0, VW, VH, '#ff9a40');
    x.globalAlpha = 1;
  }
  if (rain) {
    x.globalAlpha = 0.18;
    rect(x, 0, 0, VW, VH, '#3a5a8a');
    x.globalAlpha = 1;
  }

  // tire marks
  for (const m of g.marks) {
    const [sx, sy] = S(m.x, m.y);
    if (!vis(sx, sy, 2)) continue;
    x.globalAlpha = Math.min(0.55, m.l / 6);
    rect(x, sx, sy, 1, 1, '#16121c');
  }
  x.globalAlpha = 1;

  // pond shimmer, restaurant neon flicker
  if (!o.reduced) {
    for (let i = 0; i < NI; i++)
      for (let j = 0; j < NJ; j++) {
        if (T.district[i][j] !== 'park') continue;
        const b = blockRect(i, j);
        const [sx, sy] = S(b.x + 16, b.y + 14);
        const k = Math.floor(g.t * 3) % 4;
        rect(x, sx - 4 + k * 2, sy + (k % 2 ? 2 : -2), 2, 1, '#d8f0ff');
      }
  }

  // speed trap cop + radar
  {
    const tr = T.trap;
    const [sx, sy] = S(tr.copX, tr.copY);
    if (vis(sx, sy)) {
      drawVehicle(x, { kind: 'police', body: '#1c1c2a' }, sx, sy, 0, { siren: g.sirenT > 0, t: g.t });
      if (g.phase === 'play' && !o.reduced && Math.floor(g.t * 2) % 2 === 0) {
        const [zx, zy] = S(tr.x, tr.y);
        x.globalAlpha = 0.22;
        rect(x, zx, zy, tr.w, 1, '#ff4040');
        rect(x, zx, zy + tr.h - 1, tr.w, 1, '#ff4040');
        x.globalAlpha = 1;
      }
      if (g.sirenT > 0) glow(x, sx, sy, 20, 12, Math.floor(g.t * 8) % 2 ? '#ff4040' : '#4060ff', 0.5);
    }
  }

  // GPS route: marching dots in the focus order's color
  const fo = focusOrder(g);
  if (fo && g.phase === 'play' && g.route.length > 4) {
    const c = fo.color;
    const off = o.reduced ? 0 : Math.floor(g.t * 10) % 3;
    for (let k = 2 + off; k < g.route.length / 2 - 1; k += 3) {
      const [sx, sy] = S(g.route[k * 2], g.route[k * 2 + 1]);
      if (!vis(sx, sy, 2)) continue;
      rect(x, sx - 2, sy - 2, 4, 4, INK);
      rect(x, sx - 1, sy - 1, 2, 2, c);
      rect(x, sx - 1, sy - 1, 1, 1, '#ffffff');
    }
  }

  // targets: restaurant pads (waiting orders), doors (carried orders)
  const act = activeOrders(g);
  for (const od of act) {
    const s = targetSlot(g, od);
    const [sx, sy] = S(s.px, s.py);
    if (!vis(sx, sy, 30)) continue;
    const focus = fo === od;
    const hurry = od.t < 6;
    glow(x, sx, sy, 12 + pulse * 3, 8 + pulse * 2, od.color, focus ? 0.7 : 0.4);
    const r = 6 + Math.round(pulse * 2);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) rect(x, sx + Math.cos(a + g.t) * r, sy + Math.sin(a + g.t) * r * 0.6, 1, 1, od.color);
    const bob = o.reduced ? 0 : Math.round(Math.sin(g.t * 5 + od.id) * 1.5);
    const iy = sy - 14 + bob;
    if (od.state === 'wait') {
      // takeout bag
      rect(x, sx - 3, iy, 7, 6, od.color);
      rect(x, sx - 3, iy, 7, 1, shade(od.color, 1.3));
      rect(x, sx - 1, iy - 2, 3, 2, INK);
      outlineRect(x, sx - 4, iy - 1, 9, 8, INK);
    } else {
      // little house (door) or a hand (hand it to me)
      rect(x, sx - 3, iy + 2, 7, 5, od.color);
      rect(x, sx - 2, iy, 5, 2, od.color);
      rect(x, sx - 1, iy - 1, 3, 1, od.color);
      rect(x, sx, iy + 4, 1, 3, INK);
      outlineRect(x, sx - 4, iy - 2, 9, 10, INK);
      if (od.req === 'hand') {
        // "stop here" ring that fills while you wait
        const f = clamp(od.hold / HOLD_TIME, 0, 1);
        const n = 16;
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
          rect(x, sx + Math.cos(a) * 10, sy + Math.sin(a) * 7, 2, 2, k / n < f ? '#7ee08a' : INK);
        }
        if (od.hold <= 0) outlinedText(x, 'STOP', sx - 7, iy - 9, '#fff3c4');
      }
    }
    if (hurry && Math.floor(g.t * 4) % 2 === 0) outlinedText(x, '!', sx + 7, iy, '#ff5a4a');
    if (od.state === 'carry') {
      const up = s.face < 0;
      const [dx, dy] = S(s.dx, s.dy);
      const on = o.reduced || Math.floor(g.t * 4) % 2 === 0;
      rect(x, dx - 2, up ? dy + 1 : dy - 5, 4, 5, on ? od.color : shade(od.color, 0.7));
    }
  }

  // customers at their doors with a star rating
  for (const cu of g.customers) {
    const [sx, sy] = S(cu.x, cu.y);
    if (!vis(sx, sy)) continue;
    const wave = Math.floor(cu.t * 8) % 2;
    rect(x, sx - 2, sy - 2, 5, 5, cu.c);
    rect(x, sx - 2, sy - 2, 5, 1, shade(cu.c, 1.3));
    rect(x, sx - 1, sy - 5, 3, 3, '#eab38c');
    rect(x, sx - 1, sy - 6, 3, 1, '#5b3a22');
    if (cu.stars >= 4) rect(x, sx + (wave ? 3 : -4), sy - 5, 1, 3, '#eab38c');
    const rise = Math.round((2.2 - cu.t) * 4);
    const by = sy - 16 - rise;
    drawStars(x, sx - 12, by, cu.stars);
    outlinedText(x, cu.line, sx - (cu.line.length * 4 - 1) / 2, by - 7, cu.stars >= 4 ? '#7ee08a' : cu.stars === 3 ? '#fff3c4' : '#ff9a8a');
  }

  // traffic
  for (const a of g.ai) {
    const [sx, sy] = S(a.x, a.y);
    if (!vis(sx, sy)) continue;
    drawVehicle(x, a.look, sx, sy, (a.dir * Math.PI) / 2, { brake: a.v < a.vt - 6 });
    if (a.honk > 0.5) outlinedText(x, 'HONK', sx - 7, sy - 14, '#ffe070');
  }

  // player
  {
    const [sx, sy] = S(g.p.x, g.p.y);
    const blinkHit = g.p.stun > 0 && Math.floor(g.t * 20) % 2 === 0;
    glow(x, sx, sy, 10, 10, '#fff6c0', 0.3);
    if (g.phase === 'play' && (g.gt < 6 || Math.hypot(g.p.vx, g.p.vy) < 3) && !o.reduced) {
      const r = 9 + Math.round(((g.t * 2) % 1) * 4);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) rect(x, sx + Math.cos(a) * r, sy + Math.sin(a) * r, 1, 1, '#fff3c4');
    }
    if (g.boostT > 0 || g.sprinting) {
      const sn = Math.sin(g.p.ang);
      const cs = Math.cos(g.p.ang);
      const fl = g.bike ? '#9ae0ff' : Math.floor(g.t * 20) % 2 ? '#ffb020' : '#ff5030';
      for (let k = 0; k < 3; k++) rect(x, sx - sn * (8 + k * 2) + (Math.random() - 0.5) * 2, sy + cs * (8 + k * 2), 2, 2, k ? '#fff3c4' : fl);
    }
    if (g.phase === 'play' && g.gt < 3) outlinedText(x, 'YOU', sx - 5, sy + 10, '#fff3c4');
    if (!blinkHit) drawVehicle(x, o.look, sx, sy, g.p.ang, { brake: Math.hypot(g.p.vx, g.p.vy) < 6 });
    const carried = g.orders.filter((od) => od.state === 'carry');
    carried.forEach((od, k) => {
      rect(x, sx - 5 + k * 4, sy - 13, 3, 3, od.color);
      outlineRect(x, sx - 6 + k * 4, sy - 14, 5, 5, INK);
    });
    // steam from hot food
    const hot = carried.reduce((m, od) => Math.max(m, od.heat), 0);
    if (hot > 0.5 && !o.reduced) {
      for (let k = 0; k < 3; k++) {
        const ph = (g.t * 1.2 + k / 3) % 1;
        x.globalAlpha = (1 - ph) * 0.8 * hot;
        rect(x, sx - 3 + k * 3 + Math.round(Math.sin((g.t + k) * 6)), sy - 16 - Math.round(ph * 8), 1, 2, '#ffffff');
      }
      x.globalAlpha = 1;
    }
  }

  o.fx.draw(x, (wx, wy) => S(wx, wy));

  // rain streaks
  if (rain && !o.reduced) {
    x.fillStyle = 'rgba(200,220,255,0.55)';
    for (let k = 0; k < 70; k++) {
      const rx = (hash(k * 3.1) * VW + g.t * 40 + k * 7) % (VW + 20) - 10;
      const ry = (hash(k * 7.7) * VH + g.t * 160) % VH;
      x.fillRect(Math.round(rx), Math.round(ry), 1, 3);
      x.fillRect(Math.round(rx) - 1, Math.round(ry) + 3, 1, 1);
    }
  }

  // dusk: a darkness layer with headlight beams, lamp pools and lit windows punched out
  if (dusk > 0.02) {
    const d = darkCanvas();
    if (d && DARK) {
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, VW, VH);
      d.fillStyle = `rgba(20,14,48,${(0.62 * dusk).toFixed(3)})`;
      d.fillRect(0, 0, VW, VH);
      d.globalCompositeOperation = 'destination-out';
      d.fillStyle = '#000';
      for (const l of T.lamps) {
        const [sx, sy] = S(l.x, l.y);
        if (vis(sx, sy, 24)) hole(d, sx, sy, 16, 12, 0.9);
      }
      for (const w of T.windows) {
        const [sx, sy] = S(w.x, w.y);
        if (vis(sx, sy, 6)) hole(d, sx + 2, sy + 1, 5, 4, 0.6);
      }
      for (const od of act) {
        const [sx, sy] = S(targetSlot(g, od).px, targetSlot(g, od).py);
        if (vis(sx, sy, 20)) hole(d, sx, sy, 14, 10, 0.9);
      }
      const [px, py] = S(g.p.x, g.p.y);
      beam(d, px, py, g.p.ang, g.bike ? 30 : 42, g.bike ? 9 : 14, 1);
      hole(d, px, py, 10, 10, 0.8);
      for (const a of g.ai) {
        const [sx, sy] = S(a.x, a.y);
        if (vis(sx, sy, 40)) beam(d, sx, sy, (a.dir * Math.PI) / 2, 32, 11, 0.8);
      }
      x.drawImage(DARK, 0, 0);
      // light colors on top
      x.globalAlpha = dusk;
      for (const w of T.windows) {
        const [sx, sy] = S(w.x, w.y);
        if (vis(sx, sy, 4) && hash(w.x * 3 + w.y) > 0.25) rect(x, sx, sy, w.x % 2 ? 4 : 3, 2, '#ffd870');
      }
      for (const l of T.lamps) {
        const [sx, sy] = S(l.x, l.y);
        if (vis(sx, sy, 4)) rect(x, sx, sy, 2, 2, '#fff3a0');
      }
      x.globalAlpha = dusk * 0.18;
      x.fillStyle = '#fff0a0';
      beam(x, px, py, g.p.ang, g.bike ? 30 : 42, g.bike ? 9 : 14, 1);
      x.globalAlpha = 1;
    }
  }

  // off-screen arrows for each target
  for (const od of act) {
    const s = targetSlot(g, od);
    const [sx, sy] = S(s.px, s.py);
    if (sx > 4 && sx < VW - 4 && sy > 4 && sy < VH - 4) continue;
    const mx = VW / 2;
    const my = VH / 2;
    const dx = sx - mx;
    const dy = sy - my;
    const k = Math.min((VW / 2 - 8) / Math.abs(dx || 1e-6), (VH / 2 - 8) / Math.abs(dy || 1e-6));
    arrow(x, mx + dx * k, my + dy * k, Math.atan2(dy, dx), od.color, od.state === 'wait', fo === od);
  }
}

export function drawStars(x: Ctx, px: number, py: number, n: number): void {
  for (let k = 0; k < 5; k++) {
    const sx = px + k * 5;
    const c = k < n ? '#ffd23a' : '#5a5068';
    rect(x, sx - 1, py - 1, 5, 5, INK);
    rect(x, sx + 1, py - 1, 1, 1, INK);
    rect(x, sx, py, 3, 3, c);
    rect(x, sx + 1, py - 1, 1, 1, c);
    rect(x, sx - 1, py + 1, 1, 1, c);
    rect(x, sx + 3, py + 1, 1, 1, c);
    if (k < n) rect(x, sx, py, 1, 1, '#fff3c4');
  }
}

function arrow(x: Ctx, ax: number, ay: number, ang: number, c: string, pickup: boolean, focus: boolean): void {
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const sc = focus ? 1.3 : 1;
  const pts: [number, number][] = [
    [6, 0],
    [-4, -5],
    [-4, 5],
  ].map(([u, v]) => [ax + u * sc * cs - v * sc * sn, ay + u * sc * sn + v * sc * cs]);
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

// Countdown in the last seconds, the weather banner, and the end card.
export function drawTownEnd(x: Ctx, g: TownSim, me: Person): void {
  if (g.phase === 'count') return;
  if (g.phase === 'play' && g.ev.on && g.gt - g.ev.t0 < 2.2) {
    const a = Math.min(1, (2.2 - (g.gt - g.ev.t0)) * 2);
    x.globalAlpha = a;
    bigText(x, g.ev.kind === 'rain' ? 'RAIN! TIPS +35%' : 'DINNER RUSH!', VW / 2, 30, 2, g.ev.kind === 'rain' ? '#9ad0ff' : '#ffb070');
    x.globalAlpha = 1;
  }
  // badges: tip multiplier and streak
  if (g.phase === 'play') {
    let by = 3;
    if (g.ev.on) {
      const s = g.ev.kind === 'rain' ? `RAIN TIPS X${tipMult(g)}` : `RUSH TIPS X${tipMult(g)}`;
      outlinedText(x, s, VW - textW(s) - 3, by, g.ev.kind === 'rain' ? '#9ad0ff' : '#ffb070');
      by += 8;
    }
    if (g.streak >= 2) {
      const s = `STREAK X${g.streak}`;
      outlinedText(x, s, VW - textW(s) - 3, by, '#ffd23a');
    }
  }
  if (g.phase === 'play' && SHIFT - g.gt < 5 && SHIFT - g.gt > 0) bigText(x, String(Math.ceil(SHIFT - g.gt)), VW / 2, 18, 3, '#fff3c4');
  if (g.phase !== 'end') return;
  const a = Math.min(1, g.endT * 3);
  x.globalAlpha = a * 0.55;
  rect(x, 0, 0, VW, VH, INK);
  x.globalAlpha = a;
  bigText(x, 'SHIFT OVER', VW / 2, 24, 3, '#fff3c4');
  drawPerson(x, { ...me, holds: 'phone' }, VW / 2 - 6, 54, Math.floor(g.endT * 3), g.earned > 0, { face: 1 });
  x.globalAlpha = 1;
}

const textW = (s: string): number => s.length * 4 - 1;

export function rainOn(g: TownSim): boolean {
  return g.ev.on && g.ev.kind === 'rain';
}

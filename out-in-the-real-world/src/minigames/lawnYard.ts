// Lawn Gig simulation: three yards of growing size (a front yard, a corner lot, a big backyard),
// each laid out fresh every gig. A push mower with momentum and a tight turning circle cuts 2x2 px
// grass cells into stripes (by the direction you mowed them); the bag fills and must be dumped at
// the yard-waste bin; flower beds, gnomes, a kiddie pool, pop-up sprinklers and a nervous dog cost
// pay if you hit them. Pure: no DOM, so the tests can mow with a bot.

export const LW = 216;
export const LH = 180;
export const CELL = 2;
export const GW = LW / CELL;
export const GH = LH / CELL;
export const MOWER_R = 5; // collision radius of the deck
export const CUT_R = 7.5; // blades reach a little past the deck edge
export const BAG_CAP = 1700; // cells
export const MAX_SPEED = 62;
export const COUNT = 1.65;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type SolidKind = 'bed' | 'pool' | 'tree' | 'gnome' | 'bin' | 'porch' | 'bath';
export interface Solid {
  kind: SolidKind;
  x: number; // circle center, or rect x
  y: number;
  r: number; // circle radius (0 for rects)
  w: number;
  h: number;
  hitCD: number;
  hits: number;
  knocked?: boolean; // gnome on its face
  seed: number;
  flowers?: string; // bed flower color
  crushed?: { x: number; y: number }[];
}
export interface Sprinkler {
  x: number;
  y: number;
  period: number;
  phase: number;
  state: 'down' | 'warn' | 'up';
  broken: boolean;
  spray: number; // current spray angle
}
export interface Dog {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  state: 'wander' | 'flee' | 'zoom' | 'hide' | 'sit';
  t: number; // time left in state
  tx: number;
  ty: number;
  coat: string;
  spot: string;
  hitCD: number;
  barkCD: number;
  run: number; // anim phase
  zoomA: number;
  zoomC: [number, number];
}
export interface Neighbor {
  name: string;
  dog: string;
  lines: { start: string; bed: string; gnome: string };
}
export interface Yard {
  tier: number;
  name: string;
  houseH: number; // facade bottom
  houseColor: string;
  trim: string;
  roof: string;
  door: number; // door x
  porch: Rect;
  lawn: Rect[];
  holes: Rect[]; // paths/patios/driveways inside the lawn area (no grass)
  path: Rect[]; // the same, for drawing
  drive?: Rect;
  solids: Solid[];
  sprinklers: Sprinkler[];
  bin: Solid;
  dog: Dog | null;
  limit: number;
  fence: boolean; // backyard: fenced bottom instead of a sidewalk
  seed: number;
  neighbor: Neighbor;
}

const NEIGHBORS: Neighbor[] = [
  { name: 'Mrs. Okafor', dog: 'Biscuit', lines: { start: 'Mind my petunias, dear!', bed: 'MY PETUNIAS!', gnome: 'NOT GERALD!' } },
  { name: 'Mr. Delgado', dog: 'Pepper', lines: { start: 'Stripes, kid. I want stripes.', bed: 'THE TULIPS!', gnome: "HEY! THAT'S FRANK!" } },
  { name: 'Ms. Petrov', dog: 'Noodle', lines: { start: 'Noodle is a little nervous.', bed: 'MY ROSES!!', gnome: 'POOR LITTLE GUY!' } },
  { name: 'Grandpa Joe', dog: 'Scout', lines: { start: 'Back in my day we used scissors.', bed: 'MY BEGONIAS!', gnome: 'GNOME DOWN!' } },
];
const COATS: [string, string][] = [
  ['#d8a050', '#f4e0b0'],
  ['#3a3038', '#f0ece4'],
  ['#f0ece4', '#5a4030'],
  ['#9a5a30', '#e8c090'],
  ['#8a8a96', '#d8d8e0'],
];
const FLOWERS = ['#f04a6a', '#f2c230', '#b06ae0', '#ff8a3a', '#ff9ad0', '#f4f4f4'];
const HOUSES: [string, string, string][] = [
  ['#e8d8b0', '#f8f4e8', '#8a4a3a'],
  ['#a8c8e0', '#f4f4f0', '#4a4a5a'],
  ['#e0a090', '#fff4e8', '#5a3a3a'],
  ['#b8d0a0', '#f4f0e0', '#6a4a3a'],
  ['#f0e0a0', '#ffffff', '#5a5a6a'],
  ['#c8b0d8', '#f8f4f8', '#4a3a5a'],
];

function circleHitsRect(cx: number, cy: number, r: number, R: Rect): boolean {
  const nx = clamp(cx, R.x, R.x + R.w);
  const ny = clamp(cy, R.y, R.y + R.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
const inRect = (x: number, y: number, R: Rect): boolean => x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h;
export const solidRect = (s: Solid): Rect => ({ x: s.x, y: s.y, w: s.w, h: s.h });
const isRect = (s: Solid): boolean => s.r === 0;

// ---------- yard layouts ----------
export function buildYard(tier: number, seed: number, gig = seed): Yard {
  const r = mulberry(seed);
  const rr = (a: number, b: number): number => a + r() * (b - a);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  // each yard in a gig gets its own house and its own neighbor
  const base = Math.abs(gig) % 24;
  const [houseColor, trim, roof] = HOUSES[(base + tier * 2 + (r() < 0.5 ? 1 : 0)) % HOUSES.length];
  const flip = r() < 0.5;
  const fx = (x: number, w = 0): number => (flip ? LW - x - w : x);
  const neighbor = NEIGHBORS[(base + tier) % NEIGHBORS.length];
  const houseH = 40;
  const yard: Yard = {
    tier,
    name: ['FRONT YARD', 'CORNER LOT', 'BIG BACKYARD'][tier],
    houseH,
    houseColor,
    trim,
    roof,
    door: 0,
    porch: { x: 0, y: 0, w: 0, h: 0 },
    lawn: [],
    holes: [],
    path: [],
    solids: [],
    sprinklers: [],
    bin: null as unknown as Solid,
    dog: null,
    limit: 30,
    fence: tier === 2,
    seed,
    neighbor,
  };
  const solid = (kind: SolidKind, x: number, y: number, rad: number, w = 0, h = 0): Solid => {
    const s: Solid = { kind, x, y, r: rad, w, h, hitCD: 0, hits: 0, seed: Math.floor(r() * 1e6) };
    if (kind === 'bed') s.flowers = pick(FLOWERS);
    yard.solids.push(s);
    return s;
  };
  const free = (x: number, y: number, rad: number, pad = 8): boolean => {
    if (!yard.lawn.some((L) => x - rad > L.x + 2 && x + rad < L.x + L.w - 2 && y - rad > L.y + 2 && y + rad < L.y + L.h - 2)) return false;
    if (yard.holes.some((H) => circleHitsRect(x, y, rad + pad, H))) return false;
    for (const s of yard.solids) {
      if (isRect(s) ? circleHitsRect(x, y, rad + pad, solidRect(s)) : Math.hypot(x - s.x, y - s.y) < rad + s.r + pad) return false;
    }
    if (yard.sprinklers.some((sp) => Math.hypot(sp.x - x, sp.y - y) < rad + 14)) return false;
    return true;
  };
  const place = (rad: number, pad: number, fn: (x: number, y: number) => void): void => {
    for (let k = 0; k < 80; k++) {
      const L = pick(yard.lawn);
      const x = rr(L.x + rad + 4, L.x + L.w - rad - 4);
      const y = rr(L.y + rad + 4, L.y + L.h - rad - 4);
      if (free(x, y, rad, pad)) {
        fn(x, y);
        return;
      }
    }
  };
  const sprinkler = (): void =>
    place(2, 10, (x, y) => yard.sprinklers.push({ x, y, period: rr(6.5, 9), phase: rr(0, 9), state: 'down', broken: false, spray: rr(0, 6.28) }));

  if (tier === 0) {
    // Front yard: house, porch, a front walk splitting the lawn, the driveway on one side.
    const door = fx(70);
    yard.door = door;
    yard.porch = { x: door - 16, y: houseH, w: 32, h: 9 };
    const lx = fx(22, 128);
    yard.lawn.push({ x: lx, y: 58, w: 128, h: 102 });
    const walk = { x: door - 5, y: 49, w: 10, h: 120 };
    yard.holes.push(walk);
    yard.path.push(walk);
    yard.drive = { x: fx(160, 46), y: 44, w: 46, h: 126 };
    yard.bin = solid('bin', fx(176), 66, 6);
    yard.solids.push({ kind: 'porch', x: yard.porch.x, y: yard.porch.y, r: 0, w: yard.porch.w, h: yard.porch.h, hitCD: 0, hits: 0, seed: 0 });
    solid('bed', fx(26, 30), 60, 0, 30, 12);
    if (r() < 0.5) solid('bed', fx(118, 28), 140, 0, 28, 14);
    place(4, 14, (x, y) => solid('tree', x, y, 4));
    place(3, 10, (x, y) => solid('gnome', x, y, 3));
    if (r() < 0.6) place(3, 10, (x, y) => solid('gnome', x, y, 3));
    sprinkler();
  } else if (tier === 1) {
    // Corner lot: a wide lawn with a patio notch, a kiddie pool, two beds, the dog.
    const door = fx(150);
    yard.door = door;
    yard.porch = { x: door - 18, y: houseH, w: 36, h: 9 };
    yard.lawn.push({ x: 18, y: 56, w: 180, h: 104 });
    const patio = { x: fx(18, 44), y: 56, w: 44, h: 32 };
    yard.holes.push(patio);
    yard.path.push(patio);
    const walk = { x: door - 5, y: 49, w: 10, h: 18 };
    yard.holes.push(walk);
    yard.path.push(walk);
    yard.bin = solid('bin', fx(34), 72, 6);
    yard.solids.push({ kind: 'porch', x: yard.porch.x, y: yard.porch.y, r: 0, w: yard.porch.w, h: yard.porch.h, hitCD: 0, hits: 0, seed: 0 });
    solid('bed', fx(70, 40), 56, 0, 40, 11);
    place(14, 12, (x, y) => solid('pool', x, y, 13));

    solid('bed', r() < 0.5 ? rr(20, 60) : rr(130, 160), 140, 0, 34, 14);
    place(4, 14, (x, y) => solid('tree', x, y, 4));
    for (let k = 0; k < 2; k++) place(3, 10, (x, y) => solid('gnome', x, y, 3));
    sprinkler();
    sprinkler();
  } else {
    // Big backyard: deck, a curving stepping-stone path, an island bed, pool, trees, three sprinklers.
    const door = fx(108);
    yard.door = door;
    yard.porch = { x: door - 26, y: houseH, w: 52, h: 12 };
    yard.lawn.push({ x: 12, y: 54, w: 192, h: 114 });
    const stones: Rect[] = [];
    let sx = door;
    for (let y = 58; y < 170; y += 9) {
      sx += Math.sin(y * 0.05 + seed) * 6;
      stones.push({ x: sx - 4, y, w: 8, h: 6 });
    }
    yard.holes.push(...stones);
    yard.path.push(...stones);
    yard.bin = solid('bin', fx(16), 62, 6);
    yard.solids.push({ kind: 'porch', x: yard.porch.x, y: yard.porch.y, r: 0, w: yard.porch.w, h: yard.porch.h, hitCD: 0, hits: 0, seed: 0 });
    solid('bed', fx(150, 44), 54, 0, 44, 11);
    place(18, 12, (x, y) => solid('bed', x - 18, y - 9, 0, 36, 18));
    place(14, 12, (x, y) => solid('pool', x, y, 13));
    place(4, 16, (x, y) => solid('tree', x, y, 4));
    place(4, 16, (x, y) => solid('tree', x, y, 4));
    if (r() < 0.5) place(4, 10, (x, y) => solid('bath', x, y, 4));
    for (let k = 0; k < 3; k++) place(3, 10, (x, y) => solid('gnome', x, y, 3));
    for (let k = 0; k < 3; k++) sprinkler();
  }
  if (tier >= 1) {
    const [coat, spot] = pick(COATS);
    const L = yard.lawn[0];
    yard.dog = { x: L.x + L.w * 0.7, y: L.y + L.h * 0.6, vx: 0, vy: 0, ang: 0, state: 'wander', t: 1, tx: L.x + L.w / 2, ty: L.y + L.h / 2, coat, spot, hitCD: 0, barkCD: 0, run: 0, zoomA: 0, zoomC: [0, 0] };
  }
  return yard;
}

// ---------- grass grid ----------
export const NONE = 0;
export const TALL = 1;
export const CUT = 2;
export const TRIM = 3; // grass the deck can't reach (edges): drawn tall, not counted

export function solidHit(y: Yard, x: number, yy: number, rad: number): Solid | null {
  for (const s of y.solids) {
    if (s.kind === 'gnome' && s.knocked) continue;
    if (isRect(s) ? circleHitsRect(x, yy, rad, solidRect(s)) : Math.hypot(x - s.x, yy - s.y) < rad + s.r) return s;
  }
  return null;
}
// where the deck may roam: the yard between the hedges/fence, down to the sidewalk
export const bounds = (y: Yard): Rect => ({ x: MOWER_R + 6, y: y.houseH + MOWER_R + 1, w: LW - 2 * (MOWER_R + 6), h: LH - y.houseH - 2 * (MOWER_R + 1) - (y.fence ? 7 : 3) });

export function buildGrid(y: Yard): { grid: Uint8Array; mowable: number } {
  const grid = new Uint8Array(GW * GH);
  const B = bounds(y);
  // where the deck's center may go
  const ok = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const cx = i * CELL + 1;
      const cy = j * CELL + 1;
      ok[j * GW + i] = inRect(cx, cy, B) && !solidHit(y, cx, cy, MOWER_R) ? 1 : 0;
    }
  const reach = Math.floor(CUT_R / CELL);
  let mowable = 0;
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const cx = i * CELL + 1;
      const cy = j * CELL + 1;
      if (!y.lawn.some((L) => inRect(cx, cy, L))) continue;
      if (y.holes.some((H) => inRect(cx, cy, H))) continue;
      if (solidHit(y, cx, cy, 0.5)) continue;
      let can = false;
      for (let dj = -reach; dj <= reach && !can; dj++)
        for (let di = -reach; di <= reach && !can; di++) {
          if (di * di + dj * dj > reach * reach) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < GW && jj < GH && ok[jj * GW + ii]) can = true;
        }
      grid[j * GW + i] = can ? TALL : TRIM;
      if (can) mowable++;
    }
  return { grid, mowable };
}

// ---------- the sim ----------
export interface Mower {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  speed: number;
  step: number;
  bag: number;
  load: number; // 0..1 how much grass the blades chewed this frame
  bump: number;
}
export type LawnEvKind = 'go' | 'cut' | 'bump' | 'bed' | 'gnome' | 'pool' | 'sprinklerBreak' | 'sprinklerUp' | 'sprinklerWarn' | 'dogHit' | 'bark' | 'bagFull' | 'empty' | 'emptied' | 'milestone' | 'yardDone' | 'say' | 'tick' | 'gigDone' | 'soaked';
export interface LawnEv {
  e: LawnEvKind;
  x: number;
  y: number;
  s?: string;
  n?: number;
}
export interface YardResult {
  cut: number; // fraction
  done: boolean; // finished the whole lawn
  oops: number;
  time: number;
}
export interface LawnSim {
  seed: number;
  ix: number; // yard index 0..2
  y: Yard;
  grid: Uint8Array;
  dir: Uint8Array; // stripe direction 0..3 for cut cells
  mowable: number;
  cut: number;
  m: Mower;
  t: number; // since this yard began (including count-in)
  gt: number; // play clock for this yard
  phase: 'count' | 'play' | 'yardEnd' | 'done';
  endT: number;
  events: LawnEv[];
  dirty: number[]; // cells changed since the renderer last looked
  results: YardResult[];
  oops: number; // penalty points this yard
  totalOops: number;
  say: { text: string; t: number; pri: number; mood: 'happy' | 'mad' | 'calm' };
  milestone: number;
  emptying: boolean;
  bagWarned: boolean;
  lastTick: number;
  wet: number; // player is soaked (cosmetic)
  score: number;
}

export function newMower(y: Yard): Mower {
  // start at the bottom edge of the lawn, on a clear spot near the middle
  const sx0 = y.tier === 0 ? y.door + (y.door < LW / 2 ? 18 : -18) : LW / 2;
  const B = bounds(y);
  let sx = sx0;
  const lawnBottom = Math.max(...y.lawn.map((L) => L.y + L.h)) - 6;
  let sy = Math.min(B.y + B.h - 2, lawnBottom);
  search: for (let dy = 0; dy < 60; dy += 4)
    for (let k = 0; k < 40; k++) {
      const x = sx0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 4;
      const yy = Math.min(B.y + B.h - 2, lawnBottom) - dy;
      if (x < B.x || x > B.x + B.w) continue;
      if (!solidHit(y, x, yy, MOWER_R + 3)) {
        sx = x;
        sy = yy;
        break search;
      }
    }
  return { x: sx, y: sy, vx: 0, vy: 0, ang: -Math.PI / 2, speed: 0, step: 0, bag: 0, load: 0, bump: 0 };
}

function startYard(g: LawnSim, ix: number): void {
  const y = buildYard(ix, g.seed * 7 + ix * 101, g.seed);
  const { grid, mowable } = buildGrid(y);
  y.limit = Math.round(((mowable * CELL * CELL) / (CUT_R * 2 * MAX_SPEED)) * 2.3 + 6);
  g.ix = ix;
  g.y = y;
  g.grid = grid;
  g.dir = new Uint8Array(GW * GH);
  g.mowable = mowable;
  g.cut = 0;
  g.m = newMower(y);
  g.t = 0;
  g.gt = 0;
  g.phase = 'count';
  g.endT = 0;
  g.oops = 0;
  g.milestone = 0;
  g.emptying = false;
  g.bagWarned = false;
  g.lastTick = 99;
  g.dirty = [];
  g.say = { text: y.neighbor.lines.start, t: 2.8, pri: 1, mood: 'calm' };
}

export function newLawn(seed: number): LawnSim {
  const g = { seed, results: [], totalOops: 0, events: [], wet: 0, score: 0 } as unknown as LawnSim;
  startYard(g, 0);
  return g;
}

function say(g: LawnSim, text: string, mood: 'happy' | 'mad' | 'calm', pri = 1, dur = 1.8): void {
  if (g.say.t > 0 && g.say.pri > pri) return;
  g.say = { text, t: dur, pri, mood };
  g.events.push({ e: 'say', x: g.y.door, y: g.y.houseH, s: text });
}

export const cutFrac = (g: LawnSim): number => (g.mowable ? g.cut / g.mowable : 1);

function oops(g: LawnSim, w: number): void {
  g.oops += w;
  g.totalOops += w;
}

// Cut every cell under the blades. Returns how many tall cells were cut.
function mowAt(g: LawnSim, x: number, y: number, dir: number): number {
  const m = g.m;
  if (m.bag >= BAG_CAP) return 0;
  const r = CUT_R;
  let n = 0;
  const i0 = Math.max(0, Math.floor((x - r) / CELL));
  const i1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
  const j0 = Math.max(0, Math.floor((y - r) / CELL));
  const j1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const dx = i * CELL + 1 - x;
      const dy = j * CELL + 1 - y;
      if (dx * dx + dy * dy > r * r) continue;
      const k = j * GW + i;
      const c = g.grid[k];
      if (c === TALL) {
        if (m.bag >= BAG_CAP) continue;
        g.grid[k] = CUT;
        g.dir[k] = dir;
        g.cut++;
        m.bag++;
        n++;
        g.dirty.push(k);
      } else if (c === CUT && g.dir[k] !== dir) {
        // re-mowing in another direction re-lays the stripe
        g.dir[k] = dir;
        g.dirty.push(k);
      }
    }
  return n;
}

export interface LawnInput {
  ix: number; // desired direction (screen space), magnitude 0..1
  iy: number;
}

function stepMower(g: LawnSim, inp: LawnInput, dt: number): void {
  const m = g.m;
  const y = g.y;
  let ix = inp.ix;
  let iy = inp.iy;
  const mag = Math.min(1, Math.hypot(ix, iy));
  let want = 0;
  if (mag > 0.15) {
    const ta = Math.atan2(iy, ix);
    let da = ta - m.ang;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const turn = 7.5 * dt;
    m.ang += clamp(da, -turn, turn);
    want = MAX_SPEED * mag * clamp((Math.cos(da) + 0.25) / 1.25, 0, 1);
    if (m.bag >= BAG_CAP) want *= 0.92;
  }
  want *= 1 - 0.18 * m.load;
  const acc = want > m.speed ? 160 : 230;
  m.speed += clamp(want - m.speed, -acc * dt, acc * dt);
  const hx = Math.cos(m.ang);
  const hy = Math.sin(m.ang);
  const k = Math.min(1, 11 * dt);
  m.vx += (hx * m.speed - m.vx) * k;
  m.vy += (hy * m.speed - m.vy) * k;
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  m.step += Math.hypot(m.vx, m.vy) * dt * 0.22;
  m.bump = Math.max(0, m.bump - dt);
  // stay in the yard
  const B = bounds(y);
  if (m.x < B.x || m.x > B.x + B.w) {
    m.x = clamp(m.x, B.x, B.x + B.w);
    m.vx *= -0.3;
    m.speed *= 0.5;
  }
  if (m.y < B.y || m.y > B.y + B.h) {
    m.y = clamp(m.y, B.y, B.y + B.h);
    m.vy *= -0.3;
    m.speed *= 0.5;
  }
  // obstacles
  for (const s of y.solids) {
    if (s.kind === 'gnome' && s.knocked) continue;
    let nx = 0;
    let ny = 0;
    let pen = 0;
    if (isRect(s)) {
      const px = clamp(m.x, s.x, s.x + s.w);
      const py = clamp(m.y, s.y, s.y + s.h);
      const dx = m.x - px;
      const dy = m.y - py;
      const d = Math.hypot(dx, dy);
      if (d >= MOWER_R) continue;
      if (d < 0.01) {
        nx = 0;
        ny = 1;
      } else {
        nx = dx / d;
        ny = dy / d;
      }
      pen = MOWER_R - d;
    } else {
      const dx = m.x - s.x;
      const dy = m.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d >= MOWER_R + s.r) continue;
      nx = d < 0.01 ? 1 : dx / d;
      ny = d < 0.01 ? 0 : dy / d;
      pen = MOWER_R + s.r - d;
    }
    m.x += nx * pen;
    m.y += ny * pen;
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= 1.5 * vn * nx;
      m.vy -= 1.5 * vn * ny;
      m.speed *= 0.45;
      // a real drive-in costs you; brushing an edge while trimming close is free
      if (-vn > 24 || (s.kind === 'gnome' && -vn > 12)) collide(g, s, m.x - nx * MOWER_R, m.y - ny * MOWER_R, -vn);
      else if (-vn > 8 && s.hitCD <= 0) {
        s.hitCD = 0.35;
        g.events.push({ e: 'bump', x: m.x - nx * MOWER_R, y: m.y - ny * MOWER_R, s: 'scrape' });
      }
    }
  }
}

function collide(g: LawnSim, s: Solid, x: number, y: number, _impact: number): void {
  const m = g.m;
  if (s.hitCD > 0) return;
  s.hitCD = 1.1;
  m.bump = 0.3;
  const nb = g.y.neighbor;
  switch (s.kind) {
    case 'bed':
      s.hits++;
      (s.crushed ??= []).push({ x: clamp(x, s.x + 2, s.x + s.w - 2), y: clamp(y, s.y + 2, s.y + s.h - 2) });
      oops(g, 1);
      g.events.push({ e: 'bed', x, y, s: s.flowers });
      say(g, s.hits > 1 ? 'AGAIN?!' : nb.lines.bed, 'mad', 3);
      break;
    case 'gnome':
      s.knocked = true;
      s.hits++;
      oops(g, 1);
      g.events.push({ e: 'gnome', x: s.x, y: s.y, n: Math.atan2(s.y - m.y, s.x - m.x) });
      say(g, nb.lines.gnome, 'mad', 3);
      break;
    case 'pool':
      s.hits++;
      oops(g, 0.5);
      g.events.push({ e: 'pool', x, y });
      say(g, 'NOT THE POOL!', 'mad', 2);
      break;
    default:
      g.events.push({ e: 'bump', x, y, s: s.kind });
      s.hitCD = 0.4;
      break;
  }
}

function stepSprinklers(g: LawnSim, dt: number): void {
  const m = g.m;
  for (const sp of g.y.sprinklers) {
    sp.spray += dt * 2.6;
    if (sp.broken) {
      if (Math.hypot(m.x - sp.x, m.y - sp.y) < 16) g.wet = 1;
      continue;
    }
    const ph = (g.gt + sp.phase) % sp.period;
    const up = sp.period - 3.2;
    const st: Sprinkler['state'] = ph > up ? 'up' : ph > up - 1 ? 'warn' : 'down';
    if (st !== sp.state) {
      // popping up right under the deck: it can't, so it sputters and soaks you instead
      if (st === 'up' && Math.hypot(m.x - sp.x, m.y - sp.y) < MOWER_R + 4) {
        if (sp.state !== 'down') g.events.push({ e: 'soaked', x: sp.x, y: sp.y });
        sp.state = 'down';
        g.wet = 1;
        continue;
      }
      if (st === 'up') g.events.push({ e: 'sprinklerUp', x: sp.x, y: sp.y });
      if (st === 'warn') g.events.push({ e: 'sprinklerWarn', x: sp.x, y: sp.y });
      sp.state = st;
    }
    if (sp.state === 'up') {
      const d = Math.hypot(m.x - sp.x, m.y - sp.y);
      if (d < 22) g.wet = Math.min(1, g.wet + dt * 3);
      if (d < MOWER_R + 2.5) {
        sp.broken = true;
        oops(g, 1);
        m.speed *= 0.3;
        g.events.push({ e: 'sprinklerBreak', x: sp.x, y: sp.y });
        say(g, 'MY SPRINKLER!!', 'mad', 3);
      }
    }
  }
  g.wet = Math.max(0, g.wet - dt * 0.25);
}

function lawnHas(g: LawnSim, x: number, y: number): boolean {
  const i = Math.floor(x / CELL);
  const j = Math.floor(y / CELL);
  if (i < 0 || j < 0 || i >= GW || j >= GH) return false;
  return g.grid[j * GW + i] !== NONE;
}

function stepDog(g: LawnSim, dt: number, rnd: () => number): void {
  const d = g.y.dog;
  if (!d) return;
  const m = g.m;
  d.hitCD = Math.max(0, d.hitCD - dt);
  d.barkCD = Math.max(0, d.barkCD - dt);
  d.t -= dt;
  const toM = Math.hypot(m.x - d.x, m.y - d.y);
  const L = g.y.lawn[0];
  let sp = 0;
  if (d.state !== 'hide' && d.state !== 'zoom' && toM < 34 && Math.hypot(m.vx, m.vy) > 8) {
    if (d.state !== 'flee') {
      d.state = 'flee';
      if (d.barkCD <= 0) {
        d.barkCD = 2.5;
        g.events.push({ e: 'bark', x: d.x, y: d.y });
      }
    }
    d.t = 0.9;
  }
  switch (d.state) {
    case 'wander':
    case 'sit':
      if (d.t <= 0) {
        if (rnd() < 0.18) {
          d.state = 'zoom';
          d.t = 2.6;
          d.zoomC = [clamp(d.x, L.x + 30, L.x + L.w - 30), clamp(d.y, L.y + 26, L.y + L.h - 26)];
          d.zoomA = Math.atan2(d.y - d.zoomC[1], d.x - d.zoomC[0]);
          if (d.barkCD <= 0) {
            d.barkCD = 2;
            g.events.push({ e: 'bark', x: d.x, y: d.y, s: 'zoom' });
          }
        } else if (d.state === 'wander' && rnd() < 0.35) {
          d.state = 'sit';
          d.t = 1 + rnd() * 2;
        } else {
          d.state = 'wander';
          d.t = 2 + rnd() * 2;
          d.tx = L.x + 10 + rnd() * (L.w - 20);
          d.ty = L.y + 10 + rnd() * (L.h - 20);
        }
      }
      if (d.state === 'wander') {
        sp = Math.hypot(d.tx - d.x, d.ty - d.y) > 4 ? 22 : 0;
        d.ang = Math.atan2(d.ty - d.y, d.tx - d.x);
      }
      break;
    case 'flee': {
      // run away from the mower, veering toward open lawn
      const a = Math.atan2(d.y - m.y, d.x - m.x);
      const cx = L.x + L.w / 2;
      const cy = L.y + L.h / 2;
      const toC = Math.atan2(cy - d.y, cx - d.x);
      const nearEdge = d.x < L.x + 14 || d.x > L.x + L.w - 14 || d.y < L.y + 12 || d.y > L.y + L.h - 12;
      d.ang = nearEdge ? toC + 0.6 : a + Math.sin(g.gt * 3) * 0.4;
      sp = 72;
      if (d.t <= 0) {
        d.state = 'wander';
        d.t = 1.5;
      }
      break;
    }
    case 'zoom': {
      // nervous zoomies: a big loop across the yard (right through your stripes)
      d.zoomA += dt * 2.6;
      const tx = d.zoomC[0] + Math.cos(d.zoomA) * 30;
      const ty = d.zoomC[1] + Math.sin(d.zoomA) * 22;
      d.ang = Math.atan2(ty - d.y, tx - d.x);
      sp = 84;
      if (d.t <= 0) {
        d.state = 'sit';
        d.t = 1.5;
      }
      break;
    }
    case 'hide': {
      // hide by the porch steps, trembling
      const tx = g.y.porch.x + g.y.porch.w + 8;
      const ty = g.y.houseH + 16;
      sp = Math.hypot(tx - d.x, ty - d.y) > 3 ? 70 : 0;
      d.ang = Math.atan2(ty - d.y, tx - d.x);
      if (d.t <= 0) {
        d.state = 'wander';
        d.t = 1;
      }
      break;
    }
  }
  d.vx += (Math.cos(d.ang) * sp - d.vx) * Math.min(1, dt * 8);
  d.vy += (Math.sin(d.ang) * sp - d.vy) * Math.min(1, dt * 8);
  const nx = d.x + d.vx * dt;
  const ny = d.y + d.vy * dt;
  // dogs go around the beds and the pool (mostly)
  if (!solidHit(g.y, nx, ny, 3) && nx > 6 && nx < LW - 6 && ny > g.y.houseH + 8 && ny < LH - 6) {
    d.x = nx;
    d.y = ny;
  } else {
    d.ang += 1.6;
    d.vx *= -0.4;
    d.vy *= -0.4;
    if (d.state === 'wander') d.t = 0;
  }
  d.run += Math.hypot(d.vx, d.vy) * dt * 0.35;
  if (toM < MOWER_R + 5 && d.hitCD <= 0 && d.state !== 'flee') {
    d.state = 'flee';
    d.t = 0.8;
  }
  // bumped by the mower
  // (only your fault if you drive into the dog, not when it zooms into you)
  const into = ((d.x - m.x) * m.vx + (d.y - m.y) * m.vy) / (toM || 1);
  if (toM < MOWER_R + 4 && d.hitCD <= 0 && into > 12) {
    d.hitCD = 3;
    d.state = 'hide';
    d.t = 5;
    oops(g, 1);
    m.speed *= 0.2;
    g.events.push({ e: 'dogHit', x: d.x, y: d.y });
    say(g, `${g.y.neighbor.dog.toUpperCase()}!! COME HERE, BABY!`, 'mad', 3, 2.2);
  }
  void lawnHas;
}

const DIRS = (ang: number): number => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  if (Math.abs(s) >= Math.abs(c)) return s < 0 ? 0 : 1; // up, down
  return c < 0 ? 2 : 3; // left, right
};

export function stepLawn(g: LawnSim, inp: LawnInput, dt: number, rnd: () => number = Math.random): void {
  g.events.length = 0;
  g.t += dt;
  g.say.t = Math.max(0, g.say.t - dt);
  for (const s of g.y.solids) s.hitCD = Math.max(0, s.hitCD - dt);
  const m = g.m;
  if (g.phase === 'count') {
    if (g.t >= COUNT) {
      g.phase = 'play';
      g.events.push({ e: 'go', x: m.x, y: m.y });
    }
    g.score = lawnScore(g);
    return;
  }
  if (g.phase === 'yardEnd') {
    g.endT += dt;
    m.speed *= Math.max(0, 1 - dt * 5);
    m.vx *= Math.max(0, 1 - dt * 5);
    m.vy *= Math.max(0, 1 - dt * 5);
    stepDog(g, dt, rnd);
    if (g.endT > 2.6) {
      if (g.ix < 2) startYard(g, g.ix + 1);
      else {
        g.phase = 'done';
        g.endT = 0;
        g.events.push({ e: 'gigDone', x: m.x, y: m.y });
      }
    }
    g.score = lawnScore(g);
    return;
  }
  if (g.phase === 'done') {
    g.endT += dt;
    return;
  }
  g.gt += dt;
  stepMower(g, inp, dt);
  // the blades sit at the front half of the deck
  const bx = m.x + Math.cos(m.ang) * 1.5;
  const by = m.y + Math.sin(m.ang) * 1.5;
  const before = m.bag;
  const n = Math.hypot(m.vx, m.vy) > 2 || m.load > 0 ? mowAt(g, bx, by, DIRS(m.ang)) : 0;
  m.load += (Math.min(1, n / 6) - m.load) * Math.min(1, dt * 10);
  if (n > 0) g.events.push({ e: 'cut', x: bx, y: by, n });
  if (before < BAG_CAP && m.bag >= BAG_CAP) {
    g.events.push({ e: 'bagFull', x: m.x, y: m.y });
    say(g, "YOUR BAG'S FULL, HON!", 'calm', 2);
  }
  // dump the bag at the bin
  const bin = g.y.bin;
  const nearBin = Math.hypot(m.x - bin.x, m.y - bin.y) < MOWER_R + bin.r + 9;
  if (nearBin && m.bag > 0) {
    if (!g.emptying) g.events.push({ e: 'empty', x: bin.x, y: bin.y });
    g.emptying = true;
    m.bag = Math.max(0, m.bag - BAG_CAP * 1.4 * dt);
    if (m.bag === 0) g.events.push({ e: 'emptied', x: bin.x, y: bin.y });
  } else g.emptying = false;
  stepSprinklers(g, dt);
  stepDog(g, dt, rnd);
  // milestones and the clock
  const f = cutFrac(g);
  const ms = [0.25, 0.5, 0.75, 0.9];
  if (g.milestone < ms.length && f >= ms[g.milestone]) {
    const lines = ['OOH, NICE LINES!', 'LOOKING SHARP!', "NOW THAT'S A LAWN!", 'ALMOST THERE!'];
    g.events.push({ e: 'milestone', x: m.x, y: m.y, n: ms[g.milestone] });
    say(g, lines[g.milestone], 'happy', 1);
    g.milestone++;
  }
  const left = g.y.limit - g.gt;
  const sec = Math.ceil(left);
  if (sec !== g.lastTick) {
    g.lastTick = sec;
    if (sec <= 5 && sec > 0) g.events.push({ e: 'tick', x: 0, y: 0, n: sec });
    if (sec === 8) say(g, 'ALMOST DONE, KIDDO?', 'calm', 1);
  }
  const done = f >= 0.985;
  if (done || left <= 0) {
    g.results.push({ cut: done ? 1 : f, done, oops: g.oops, time: g.gt });
    g.phase = 'yardEnd';
    g.endT = 0;
    g.events.push({ e: 'yardDone', x: m.x, y: m.y, n: done ? 1 : 0 });
    say(g, done ? (g.oops === 0 ? 'PERFECT! JUST PERFECT!' : 'BEAUTIFUL WORK!') : f > 0.8 ? 'GOOD ENOUGH FOR ME!' : "WELL... IT'S SHORTER.", done ? 'happy' : f > 0.8 ? 'calm' : 'mad', 4, 2.6);
  }
  g.score = lawnScore(g);
}

export const yardScore = (r: YardResult): number => clamp((r.cut - 0.3) / 0.65, 0, 1) * 0.86 + (r.done ? 0.14 : 0);

// 0..1: the mean yard (how much you cut, whether you finished) minus damage. Yards not reached
// count as zero, so the score is final once the gig is over.
export function lawnScore(g: LawnSim): number {
  const rs = [...g.results];
  if (g.phase === 'play' || g.phase === 'count') rs.push({ cut: cutFrac(g), done: false, oops: g.oops, time: g.gt });
  const sum = rs.reduce((s, r) => s + yardScore(r), 0);
  return clamp(sum / 3 - 0.03 * Math.min(8, g.totalOops), 0, 1);
}

export const payFor = (score: number): number => Math.round(25 + score * 55);

// ---------- a test bot: walks the shortest path to the nearest tall grass (or the bin) ----------
interface BotMemo {
  y: Yard;
  ok: Uint8Array;
  path: number[];
  at: number;
  lane: number;
}
const BOT = new WeakMap<LawnSim, BotMemo>();
function okGrid(y: Yard): Uint8Array {
  const B = bounds(y);
  const ok = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const cx = i * CELL + 1;
      const cy = j * CELL + 1;
      ok[j * GW + i] = inRect(cx, cy, B) && !solidHit(y, cx, cy, MOWER_R + 1.5) ? 1 : 0;
    }
  return ok;
}
function bfs(g: LawnSim, ok: Uint8Array, goal: (k: number) => boolean): number[] {
  const m = g.m;
  const start = clamp(Math.floor(m.y / CELL), 0, GH - 1) * GW + clamp(Math.floor(m.x / CELL), 0, GW - 1);
  const prev = new Int32Array(GW * GH).fill(-1);
  const q = new Int32Array(GW * GH);
  let h = 0;
  let tl = 0;
  q[tl++] = start;
  prev[start] = start;
  // prefer continuing in the current heading: expand that neighbor first
  const hx = Math.round(Math.cos(m.ang));
  const hy = Math.round(Math.sin(m.ang));
  const nb: [number, number][] = [[hx, hy], [1, 0], [-1, 0], [0, 1], [0, -1]];
  while (h < tl) {
    const k = q[h++];
    if (k !== start && goal(k)) {
      const path: number[] = [];
      for (let c = k; c !== start; c = prev[c]) path.push(c);
      return path.reverse();
    }
    const i = k % GW;
    const j = (k - i) / GW;
    for (const [di, dj] of nb) {
      if (di === 0 && dj === 0) continue;
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
      const n = jj * GW + ii;
      if (prev[n] !== -1 || !ok[n]) continue;
      prev[n] = k;
      q[tl++] = n;
    }
  }
  return [];
}
export function botInput(g: LawnSim, skill: number): LawnInput {
  const m = g.m;
  if (skill <= 0) return { ix: Math.cos(g.t * 0.9) + Math.sin(g.t * 0.37), iy: Math.sin(g.t * 1.3) };
  let memo = BOT.get(g);
  if (!memo || memo.y !== g.y) {
    memo = { y: g.y, ok: okGrid(g.y), path: [], at: -9, lane: 0 };
    BOT.set(g, memo);
  }
  const replan = (1 - skill) * 0.8 + 0.15;
  if (g.t - memo.at > replan || memo.path.length < 2) {
    memo.at = g.t;
    const bin = g.y.bin;
    const full = m.bag >= BAG_CAP * 0.98;
    // mow in horizontal lanes, top to bottom (a skilled mower keeps lanes; a sloppy one chases patches)
    const B = bounds(g.y);
    const lanes = Math.ceil(B.h / 12) + 1;
    const goalFor = (lane: number | null) => (k: number): boolean => {
      const i = k % GW;
      const j = (k - i) / GW;
      if (full) return Math.hypot(i * CELL + 1 - bin.x, j * CELL + 1 - bin.y) < MOWER_R + bin.r + 6;
      if (g.grid[k] !== TALL) return false;
      if (Math.hypot(i * CELL + 1 - m.x, j * CELL + 1 - m.y) < 5) return false;
      if (lane !== null && Math.abs(j * CELL + 1 - (B.y + 2 + lane * 12)) > 6) return false;
      if (skill > 0.5) for (const sp of g.y.sprinklers) if (!sp.broken && sp.state !== 'down' && Math.hypot(sp.x - i * CELL, sp.y - j * CELL) < 10) return false;
      return true;
    };
    memo.path = [];
    if (skill > 0.5 && !full)
      while (memo.lane < lanes && !memo.path.length) {
        memo.path = bfs(g, memo.ok, goalFor(memo.lane));
        if (!memo.path.length) memo.lane++;
      }
    if (!memo.path.length) memo.path = bfs(g, memo.ok, goalFor(null));
  }
  // drop waypoints we've reached, aim a few cells down the path
  while (memo.path.length) {
    const k = memo.path[0];
    const i = k % GW;
    const j = (k - i) / GW;
    if (Math.hypot(i * CELL + 1 - m.x, j * CELL + 1 - m.y) < 3) memo.path.shift();
    else break;
  }
  const look = memo.path[Math.min(memo.path.length - 1, 2)];
  if (look === undefined) {
    // boxed in: back away from whatever is closest
    const s = solidHit(g.y, m.x, m.y, MOWER_R + 4);
    if (!s) return { ix: 0, iy: 0 };
    const cx = s.r ? s.x : s.x + s.w / 2;
    const cy = s.r ? s.y : s.y + s.h / 2;
    return { ix: clamp((m.x - cx) / 10, -1, 1), iy: clamp((m.y - cy) / 10, -1, 1) };
  }
  const i = look % GW;
  const j = (look - i) / GW;
  let ix = i * CELL + 1 - m.x;
  let iy = j * CELL + 1 - m.y;
  const d = Math.hypot(ix, iy) || 1;
  ix /= d;
  iy /= d;
  const dog = g.y.dog;
  if (dog && skill > 0.5) {
    const dx = dog.x - m.x;
    const dy = dog.y - m.y;
    const dd = Math.hypot(dx, dy);
    if (dd < 16 && dx * ix + dy * iy > 0) {
      // swing around the dog instead of plowing into it
      const sgn = dx * iy - dy * ix > 0 ? 1 : -1;
      const ox = ix;
      ix = ix * 0.3 + sgn * iy;
      iy = iy * 0.3 - sgn * ox;
    }
  }
  for (const sp of g.y.sprinklers)
    if (skill > 0.5 && !sp.broken && sp.state !== 'down' && Math.hypot(sp.x - m.x, sp.y - m.y) < 12) {
      ix -= (sp.x - m.x) * 0.2;
      iy -= (sp.y - m.y) * 0.2;
    }
  return { ix: clamp(ix, -1, 1), iy: clamp(iy, -1, 1) };
}

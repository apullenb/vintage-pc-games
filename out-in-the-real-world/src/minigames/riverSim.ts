// River Run simulation: the river's shape and current, the course (rocks, logs, branches, the rope
// swing, a whirlpool, a waterfall, rapids, snacks), tube physics, Rae, and the score. Pure: no DOM,
// so the tests can float a bot down it.

export const RW = 200; // logical canvas
export const RH = 240;
export const PY = 178; // the player's screen y (the river flows up the screen)
export const LEN = 3300; // course length in px of river
export const TUBE_R = 6.5;
export const MAX_WIPES = 3;

export type Zone = 'forest' | 'canyon' | 'rapids' | 'meadow' | 'sunset';
export const ZONE_SPANS: { z: Zone; d0: number; d1: number; speed: number; hw: number }[] = [
  { z: 'forest', d0: -400, d1: 900, speed: 52, hw: 68 },
  { z: 'canyon', d0: 900, d1: 1210, speed: 58, hw: 56 },
  { z: 'rapids', d0: 1210, d1: 1660, speed: 80, hw: 52 },
  { z: 'canyon', d0: 1660, d1: 1880, speed: 56, hw: 62 },
  { z: 'meadow', d0: 1880, d1: 2600, speed: 50, hw: 70 },
  { z: 'sunset', d0: 2600, d1: LEN + 900, speed: 45, hw: 76 },
];
const BLEND = 70; // px of river over which one zone fades into the next

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const smooth = (t: number): number => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

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

// Zone at d with a 0..1 blend toward the next zone near the boundary.
export function zoneAt(d: number): { a: Zone; b: Zone; w: number; i: number } {
  let i = ZONE_SPANS.findIndex((z) => d < z.d1);
  if (i < 0) i = ZONE_SPANS.length - 1;
  const z = ZONE_SPANS[i];
  const nx = ZONE_SPANS[Math.min(ZONE_SPANS.length - 1, i + 1)];
  const w = i === ZONE_SPANS.length - 1 ? 0 : smooth((d - (z.d1 - BLEND)) / BLEND);
  return { a: z.z, b: nx.z, w, i };
}
function zoneNum(d: number, k: 'speed' | 'hw'): number {
  const { w, i } = zoneAt(d);
  const a = ZONE_SPANS[i][k];
  const b = ZONE_SPANS[Math.min(ZONE_SPANS.length - 1, i + 1)][k];
  return a + (b - a) * w;
}
// Weight 0..1 of a zone at d (for blending visuals and rapids chop).
export function zoneWeight(d: number, z: Zone): number {
  const q = zoneAt(d);
  return (q.a === z ? 1 - q.w : 0) + (q.b === z ? q.w : 0);
}

// ---------- the course ----------
export type ItemKind = 'chips' | 'soda' | 'melon' | 'sandal' | 'cooler';
export const ITEM_VALUE: Record<ItemKind, number> = { chips: 1, soda: 1, melon: 2, sandal: 3, cooler: 4 };

export interface Rock {
  x: number;
  d: number;
  r: number;
  seed: number;
}
export interface Log {
  x: number;
  d: number;
  len: number; // half length
  ang: number; // 0 = across the river
  vx: number;
  vd: number; // drift (floating logs)
  spin: number;
  fixed: boolean; // a strainer jammed into the bank
  hit: number; // cooldown
}
export interface Branch {
  side: -1 | 1;
  d: number;
  reach: number; // x where the leaves end (over the water)
  hit: boolean;
}
export interface Rope {
  x: number;
  d: number;
  used: boolean;
}
export interface Whirl {
  x: number;
  d: number;
  r: number;
}
export interface Fall {
  d: number;
  tx: number; // the smooth tongue
  tw: number;
}
export interface Eddy {
  side: -1 | 1;
  d: number;
  len: number;
}
export interface Wave {
  x: number;
  d: number;
  w: number;
  hopped: boolean;
}
export interface Pickup {
  kind: ItemKind;
  x: number;
  d: number;
  got: boolean;
  bob: number;
  drift: number; // share of the current it floats with
  lost?: boolean; // knocked out of your hands: floating away
}
export interface Course {
  seed: number;
  trip: boolean;
  ph: [number, number];
  rocks: Rock[];
  logs: Log[];
  branches: Branch[];
  ropes: Rope[];
  whirls: Whirl[];
  falls: Fall[];
  eddies: Eddy[];
  waves: Wave[];
  items: Pickup[];
  totalValue: number;
}

export function halfWidth(c: Pick<Course, 'trip'>, d: number): number {
  let hw = zoneNum(d, 'hw');
  if (c.trip && d > LEN - 330) hw += Math.pow((d - (LEN - 330)) / 100, 2.1) * 9; // the river mouth opens to the sea
  return hw;
}
export function center(c: Pick<Course, 'trip' | 'ph'>, d: number): number {
  const hw = halfWidth(c, d);
  const amp = clamp(94 - hw, 0, 24) * (1 - 0.4 * zoneWeight(d, 'rapids'));
  return RW / 2 + amp * (0.65 * Math.sin(d / 210 + c.ph[0]) + 0.35 * Math.sin(d / 77 + c.ph[1]));
}
export function banks(c: Pick<Course, 'trip' | 'ph'>, d: number): [number, number] {
  const m = center(c, d);
  const hw = halfWidth(c, d);
  return [m - hw, m + hw];
}
export const baseSpeed = (d: number): number => zoneNum(d, 'speed');

export function buildCourse(seed: number, trip: boolean): Course {
  const r = mulberry(seed);
  const rr = (a: number, b: number): number => a + r() * (b - a);
  const c: Course = { seed, trip, ph: [rr(0, 6.28), rr(0, 6.28)], rocks: [], logs: [], branches: [], ropes: [], whirls: [], falls: [], eddies: [], waves: [], items: [], totalValue: 0 };
  const inRiver = (d: number, u: number): number => {
    const [L, R] = banks(c, d);
    return L + (R - L) * u;
  };
  const clear = (x: number, d: number, rad: number): boolean =>
    !c.rocks.some((k) => Math.hypot(k.x - x, k.d - d) < k.r + rad) &&
    !c.whirls.some((w) => Math.hypot(w.x - x, w.d - d) < w.r + rad) &&
    !c.falls.some((f) => Math.abs(f.d - d) < 50 + rad) &&
    !c.logs.some((l) => Math.abs(l.d - d) < 24 + rad) &&
    !c.items.some((i) => Math.hypot(i.x - x, i.d - d) < 14 + rad);
  const item = (kind: ItemKind, d: number, u?: number, drift = 0.3): void => {
    for (let k = 0; k < 12; k++) {
      const x = inRiver(d, u ?? rr(0.2, 0.8));
      if (clear(x, d, 8)) {
        c.items.push({ kind, x, d, got: false, bob: rr(0, 6.28), drift });
        return;
      }
      d += 9;
    }
  };
  // A row of rocks across the river with at least one comfortable gap.
  const rockRow = (d: number, n: number, gap: number): void => {
    const [L, R] = banks(c, d);
    const g0 = rr(L + 14, R - 14 - gap);
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 8; tries++) {
        const rad = rr(5, 9);
        let x = rr(L + rad - 1, R - rad + 1);
        // never leave a tube-width slot against the bank: hug it or leave room
        if (x - rad - L < 18) x = L + rad - 1;
        if (R - x - rad < 18) x = R - rad + 1;
        const dd = d + rr(-14, 14);
        if (x + rad > g0 - 4 && x - rad < g0 + gap + 4) continue;
        if (!clear(x, dd, rad + 10)) continue;
        c.rocks.push({ x, d: dd, r: rad, seed: Math.floor(r() * 1e6) });
        break;
      }
    }
  };

  // Fixed set pieces first, so the random stuff steers around them.
  // Forest: Rae's sandal, a strainer, a floating log, an eddy.
  const fallD = 2470;
  const fallTx = inRiver(fallD, rr(0.25, 0.75));
  c.falls.push({ d: fallD, tx: fallTx, tw: 28 });
  c.whirls.push({ x: inRiver(1770, rr(0.3, 0.7)), d: 1770, r: 24 });
  if (r() < 0.6) c.whirls.push({ x: inRiver(2860, rr(0.3, 0.7)), d: 2860, r: 20 });
  const ropeSide = r() < 0.5 ? -1 : 1;
  c.ropes.push({ x: inRiver(2160, ropeSide < 0 ? 0.24 : 0.76), d: 2160, used: false });
  for (const [d, side] of [
    [2010, r() < 0.5 ? -1 : 1],
    [2320, r() < 0.5 ? -1 : 1],
    [1040, r() < 0.5 ? -1 : 1],
  ] as [number, -1 | 1][]) {
    const [L, R] = banks(c, d);
    c.branches.push({ side, d, reach: side < 0 ? L + (R - L) * rr(0.36, 0.46) : R - (R - L) * rr(0.36, 0.46), hit: false });
  }
  for (const [d, fixed] of [
    [560, true],
    [760, false],
    [2230, false],
    [2700, true],
  ] as [number, boolean][]) {
    const side = r() < 0.5 ? -1 : 1;
    const [L, R] = banks(c, d);
    if (fixed) {
      const len = (R - L) * 0.24;
      c.logs.push({ x: side < 0 ? L + len - 2 : R - len + 2, d, len, ang: side * rr(0.15, 0.35), vx: 0, vd: 0, spin: 0, fixed: true, hit: 0 });
    } else c.logs.push({ x: inRiver(d, rr(0.3, 0.7)), d, len: 13, ang: rr(-0.5, 0.5), vx: rr(-6, 6), vd: 18, spin: rr(-0.25, 0.25), fixed: false, hit: 0 });
  }
  for (const [d, len] of [
    [420, 70],
    [1330, 60],
    [2780, 80],
    [3050, 70],
  ] as [number, number][])
    c.eddies.push({ side: r() < 0.5 ? -1 : 1, d, len });

  // Standing waves through the rapids.
  for (let d = 1250; d < 1640; d += rr(30, 44)) {
    const [L, R] = banks(c, d);
    c.waves.push({ x: (L + R) / 2 + rr(-10, 10), d, w: (R - L) * rr(0.45, 0.7), hopped: false });
  }

  // Rocks: sparse in the forest, dense in the canyon and rapids, a few in the evening.
  let d = 260;
  while (d < LEN - 180) {
    const z = zoneAt(d).a;
    if (Math.abs(d - fallD) < 90) {
      d += 30;
      continue;
    }
    const early = d < 430; // ease in
    if (z === 'forest') rockRow(d, early ? 1 : r() < 0.5 ? 3 : 2, 40), (d += rr(85, 115));
    else if (z === 'canyon') rockRow(d, r() < 0.5 ? 3 : 2, 36), (d += rr(75, 100));
    else if (z === 'rapids') rockRow(d, r() < 0.6 ? 3 : 2, 30), (d += rr(60, 76));
    else if (z === 'meadow') rockRow(d, r() < 0.5 ? 2 : 1, 42), (d += rr(100, 135));
    else rockRow(d, r() < 0.4 ? 2 : 1, 46), (d += rr(120, 170));
  }

  // Snacks along the way, a cooler to tow, and Rae's lost sandal (lands in an eddy or behind a rock).
  item('sandal', 840, undefined, 0.15);
  item('cooler', 1960, undefined, 0.2);
  const snacks: ItemKind[] = ['chips', 'soda', 'melon'];
  for (let sd = 190; sd < LEN - 120; sd += rr(140, 200)) {
    if (Math.abs(sd - fallD) < 70 || Math.abs(sd - 840) < 40 || Math.abs(sd - 1960) < 40) continue;
    item(snacks[Math.floor(r() * 3)], sd);
  }
  // The evening stretch is lazy: a little bonus flotilla.
  for (let sd = 2640; sd < LEN - 140; sd += rr(110, 150)) item(snacks[Math.floor(r() * 3)], sd);
  c.totalValue = c.items.reduce((s, i) => s + ITEM_VALUE[i.kind], 0);
  return c;
}

// ---------- the current ----------
// Water velocity at a point: faster mid-river, slow along the banks, eddies behind rocks and in bank
// pockets, a whirlpool's spin, rapids chop and the pull of the waterfall's lip.
export function flowAt(c: Course, x: number, d: number, t: number): { vx: number; vd: number; spin: number } {
  const [L, R] = banks(c, d);
  const hw = Math.max(10, (R - L) / 2);
  const u = clamp((x - (L + R) / 2) / hw, -1, 1);
  let vd = baseSpeed(d) * (0.5 + 0.5 * (1 - u * u));
  let vx = 0;
  let spin = 0;
  const wr = zoneWeight(d, 'rapids');
  if (wr > 0) vx += 16 * wr * Math.sin(d * 0.09 + t * 2.1 + x * 0.05);
  // the river bends: the current follows the channel
  vx += (center(c, d + 20) - center(c, d)) * vd * 0.05;
  for (const k of c.rocks) {
    const dd = d - k.d;
    if (dd < 0 || dd > k.r * 3.2) continue;
    const dx = x - k.x;
    if (Math.abs(dx) > k.r * 1.3) continue;
    const f = (1 - dd / (k.r * 3.2)) * (1 - Math.abs(dx) / (k.r * 1.3));
    vd *= 1 - 0.85 * f;
    vx -= Math.sign(dx) * 14 * f;
  }
  for (const e of c.eddies) {
    const dd = d - e.d;
    if (dd < 0 || dd > e.len) continue;
    const edge = e.side < 0 ? x - L : R - x;
    if (edge > 26) continue;
    const f = Math.sin((dd / e.len) * Math.PI) * (1 - edge / 26);
    vd -= baseSpeed(d) * 1.15 * f;
    vx += -e.side * 10 * f * Math.cos((dd / e.len) * Math.PI);
    spin += e.side * 1.4 * f;
  }
  for (const w of c.whirls) {
    const dx = x - w.x;
    const dy = d - w.d;
    const dist = Math.hypot(dx, dy);
    if (dist > w.r * 1.6) continue;
    const f = clamp(1 - dist / (w.r * 1.6), 0, 1);
    const nx = dx / (dist || 1);
    const ny = dy / (dist || 1);
    // swirl (counter-clockwise on screen) + a pull toward the eye
    vx += (-ny * 70 - nx * 26) * f;
    vd += (nx * 70 - ny * 26) * f - baseSpeed(d) * 0.5 * f;
    spin += 6 * f;
  }
  for (const fl of c.falls) {
    const dd = fl.d - d;
    if (dd > 0 && dd < 80) vd *= 1 + 0.6 * (1 - dd / 80);
  }
  return { vx, vd, spin };
}

// ---------- tubes ----------
export interface Tube {
  x: number;
  d: number;
  vx: number;
  vd: number;
  ang: number; // visual heading (radians, 0 = facing downstream)
  spinV: number;
  paddleCD: number;
  stroke: number; // paddle animation 0..1
  strokeSide: number;
  flip: number; // wipeout timer (seconds left)
  inv: number;
  air: number; // airtime left
  airMax: number;
  airPeak: number;
  brake: boolean;
  lean: number;
  whirlT: number;
  stuck: number;
}
const tube = (x: number, d: number): Tube => ({ x, d, vx: 0, vd: 0, ang: 0, spinV: 0, paddleCD: 0, stroke: 0, strokeSide: 1, flip: 0, inv: 0, air: 0, airMax: 1, airPeak: 0, brake: false, lean: 0, whirlT: 0, stuck: 0 });
export const airHeight = (p: Tube): number => (p.air > 0 ? Math.sin(Math.PI * (1 - p.air / p.airMax)) * p.airPeak : 0);

export type EvKind = 'go' | 'stroke' | 'bonk' | 'bank' | 'wipe' | 'pick' | 'lose' | 'grab' | 'cannon' | 'drop' | 'wave' | 'snag' | 'say' | 'sandal' | 'out' | 'finish' | 'rapids' | 'whirl';
export interface Ev {
  e: EvKind;
  x: number;
  d: number;
  s?: string;
  k?: ItemKind;
}
export interface RiverInput {
  steer: number; // -1..1
  paddle: boolean; // held
  brake: boolean;
}
export interface RiverSim {
  c: Course;
  p: Tube;
  rae: Tube;
  t: number; // since mount
  gt: number; // play time
  phase: 'count' | 'play' | 'end';
  endT: number;
  camD: number;
  wipes: number;
  bonks: number;
  held: ItemKind[];
  towing: boolean;
  sandal: boolean;
  rope: boolean;
  fallClean: boolean;
  fallDone: boolean;
  nearT: number;
  out: boolean;
  say: { text: string; t: number; pri: number };
  sayCD: number;
  saidRapids: boolean;
  lastFar: number;
  events: Ev[];
  score: number;
  lead: number;
}
export const COUNT = 1.65;

export function newRiver(seed: number, trip: boolean): RiverSim {
  const c = buildCourse(seed, trip);
  const m = center(c, 0);
  return {
    c,
    p: tube(m - 14, 0),
    rae: tube(m + 16, 34),
    t: 0,
    gt: 0,
    phase: 'count',
    endT: 0,
    camD: 0,
    wipes: 0,
    bonks: 0,
    held: [],
    towing: false,
    sandal: false,
    rope: false,
    fallClean: false,
    fallDone: false,
    nearT: 0,
    out: false,
    say: { text: trip ? 'LAST FLOAT OF THE YEAR!' : 'READY?! WOOO!', t: 2.6, pri: 1 },
    sayCD: 0,
    saidRapids: false,
    lastFar: 0,
    events: [],
    score: 0,
    lead: 40,
  };
}

function say(g: RiverSim, text: string, pri = 1, dur = 1.6): void {
  if (g.say.t > 0 && g.say.pri > pri) return;
  if (g.say.text === text && g.say.t > 0) return;
  g.say = { text, t: dur, pri };
  g.events.push({ e: 'say', x: g.rae.x, d: g.rae.d, s: text });
}

// Where a careful floater would steer at depth d0 (used by Rae, the tests' bot and hazard callouts).
export function planX(g: RiverSim, x0: number, d0: number, look = 130, greedy = false): number {
  const c = g.c;
  const [L, R] = banks(c, d0 + 50);
  let best = x0;
  let bestCost = Infinity;
  for (let x = L + 10; x <= R - 10; x += 3) {
    let cost = Math.abs(x - x0) * 0.004 + Math.abs(x - (L + R) / 2) * 0.002;
    for (const k of c.rocks) {
      const dd = k.d - d0;
      if (dd < -6 || dd > look) continue;
      const w = 1.4 - dd / look;
      cost += w * 3 * Math.exp(-(((x - k.x) / (k.r + 9)) ** 2));
    }
    for (const l of c.logs) {
      const dd = l.d - d0;
      if (dd < -10 || dd > look) continue;
      const ext = Math.abs(Math.cos(l.ang)) * l.len + 9;
      if (Math.abs(x - l.x) < ext) cost += 2.5 * (1.4 - dd / look);
    }
    for (const w of c.whirls) {
      const dd = w.d - d0;
      if (dd < -w.r || dd > look + w.r) continue;
      if (Math.abs(x - w.x) < w.r * 1.5) cost += 3 * (1 - Math.abs(x - w.x) / (w.r * 1.5));
    }
    for (const b of c.branches) {
      const dd = b.d - d0;
      if (dd < -6 || dd > look) continue;
      if ((b.side < 0 && x < b.reach + 9) || (b.side > 0 && x > b.reach - 9)) cost += 2;
    }
    for (const f of c.falls) {
      const dd = f.d - d0;
      if (dd < -4 || dd > look + 40) continue;
      if (Math.abs(x - f.tx) > f.tw / 2 - 6) cost += 4 + Math.abs(x - f.tx) * 0.02;
    }
    for (const e of c.eddies) {
      const dd = e.d - d0;
      if (dd < -e.len || dd > look) continue;
      const edge = e.side < 0 ? x - L : R - x;
      if (edge < 26) cost += 0.6 * (1 - edge / 26);
    }
    if (greedy)
      for (const i of c.items) {
        if (i.got) continue;
        const dd = i.d - d0;
        if (dd < 0 || dd > look * 0.8) continue;
        cost -= 0.9 * Math.exp(-(((x - i.x) / 10) ** 2)) * (1.2 - dd / look);
      }
    if (greedy)
      for (const rp of c.ropes) {
        const dd = rp.d - d0;
        if (rp.used || dd < 0 || dd > look) continue;
        cost -= 1.5 * Math.exp(-(((x - rp.x) / 6) ** 2));
      }
    if (cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  return best;
}

function hazardName(g: RiverSim, x: number, d0: number): { name: string; hx: number } | null {
  const c = g.c;
  let best: { name: string; hx: number; dd: number } | null = null;
  const consider = (name: string, hx: number, hd: number, rad: number): void => {
    const dd = hd - d0;
    if (dd < 50 || dd > 150) return;
    if (Math.abs(hx - x) > rad + TUBE_R + 4) return;
    if (!best || dd < best.dd) best = { name, hx, dd };
  };
  for (const k of c.rocks) consider('ROCK!', k.x, k.d, k.r);
  for (const l of c.logs) consider('LOG!', l.x, l.d, Math.abs(Math.cos(l.ang)) * l.len + 2);
  for (const b of c.branches) consider('LOW BRANCH!', b.reach + b.side * 12, b.d, 14);
  return best;
}

function pop(g: RiverSim, kind: ItemKind, x: number, d: number): void {
  g.c.items.push({ kind, x, d: d + 14, got: false, bob: 0, drift: 0.75, lost: true });
  g.events.push({ e: 'lose', x, d, k: kind });
}

function wipeout(g: RiverSim, why: string): void {
  const p = g.p;
  if (p.flip > 0 || p.inv > 0 || p.air > 0 || g.phase !== 'play') return;
  g.wipes++;
  p.flip = 1.3;
  p.spinV += 9;
  p.vd *= 0.3;
  g.events.push({ e: 'wipe', x: p.x, d: p.d, s: why });
  if (g.towing) {
    g.towing = false;
    pop(g, 'cooler', p.x - 6, p.d);
  }
  const lost = g.held.pop();
  if (lost) pop(g, lost, p.x + 6, p.d);
  if (g.wipes >= MAX_WIPES) {
    g.out = true;
    g.phase = 'end';
    g.endT = 0;
    g.events.push({ e: 'out', x: p.x, d: p.d });
    say(g, "GRAB MY TUBE! WE'RE DONE!", 5, 3);
  } else say(g, ['YOU OK?!', 'BRO. HAHA.', 'GOT YOU! GET BACK ON!'][g.wipes - 1] ?? 'YOU OK?!', 3);
}

function stepTube(g: RiverSim, p: Tube, inp: RiverInput, dt: number, isPlayer: boolean): void {
  const c = g.c;
  const f = flowAt(c, p.x, p.d, g.t);
  const control = p.flip <= 0 && p.air <= 0 && g.phase === 'play';
  // lateral: paddle-steer against water drag
  const steer = control ? clamp(inp.steer, -1, 1) : 0;
  p.vx += (steer * 210 - (p.vx - f.vx) * 3) * dt;
  p.lean += (steer - p.lean) * Math.min(1, dt * 8);
  // downstream: the current carries you; strokes push, dragging your feet brakes
  p.brake = control && inp.brake;
  const k = p.brake ? 3 : p.flip > 0 ? 2.5 : 1.2;
  const want = p.brake ? f.vd * 0.35 : f.vd;
  p.vd += (want - p.vd) * Math.min(1, k * dt);
  p.paddleCD -= dt;
  if (control && inp.paddle && p.paddleCD <= 0) {
    const excess = Math.max(0, p.vd - f.vd);
    p.vd += 30 * Math.max(0, 1 - excess / 48);
    p.paddleCD = 0.36;
    p.stroke = 1;
    p.strokeSide = -p.strokeSide;
    if (isPlayer) g.events.push({ e: 'stroke', x: p.x + p.strokeSide * 8, d: p.d });
  }
  p.stroke = Math.max(0, p.stroke - dt * 3.2);
  if (p.air > 0 && p.airPeak > 10) p.vd = Math.max(p.vd, f.vd * 0.6);
  p.x += p.vx * dt;
  p.d += p.vd * dt;
  // spin: eddies and whirls turn you, then you straighten out
  p.spinV += (f.spin * 2.2 - p.ang * 1.6 - p.spinV * 1.1 + (p.vx - f.vx) * 0.004) * dt;
  p.ang += p.spinV * dt;
  if (Math.abs(p.ang) > Math.PI) p.ang -= Math.sign(p.ang) * Math.PI * 2;
  // banks
  const [L, R] = banks(c, p.d);
  if (p.x < L + TUBE_R + 1 || p.x > R - TUBE_R - 1) {
    const s = p.x < L + TUBE_R + 1 ? 1 : -1;
    p.x = s > 0 ? L + TUBE_R + 1 : R - TUBE_R - 1;
    if (p.vx * s < -20 && isPlayer) g.events.push({ e: 'bank', x: p.x, d: p.d });
    p.vx = Math.abs(p.vx) * 0.45 * s;
    p.spinV += s * 1.5;
  }
  // never get pinned for long: the river always finds a way to shove you along
  if (isPlayer && p.vd < 10 && f.vd > 20) {
    p.stuck += dt;
    if (p.stuck > 1.6) {
      p.stuck = 0;
      p.vx += (p.x < (L + R) / 2 ? 1 : -1) * 45;
      p.vd += 25;
    }
  } else p.stuck = Math.max(0, p.stuck - dt);
  const wasFlipped = p.flip > 0;
  p.flip = Math.max(0, p.flip - dt);
  if (isPlayer && wasFlipped && p.flip <= 0) p.inv = 1.6;
  p.inv = Math.max(0, p.inv - dt);
  p.air = Math.max(0, p.air - dt);
}

function collide(g: RiverSim, dt: number, prevD: number): void {
  const p = g.p;
  const c = g.c;
  if (p.air > 0) return;
  const solid = (nx: number, nd: number, pen: number, name: string, hx: number, hd: number): void => {
    // push out, bounce, and decide: a hard head-on hit flips you, a glancing one is just a BONK
    p.x += nx * pen;
    p.d += nd * pen;
    const vn = p.vx * nx + p.vd * nd;
    if (vn >= 0) return;
    const impact = -vn;
    p.vx -= 1.6 * vn * nx;
    p.vd -= 1.6 * vn * nd;
    // slide off instead of pinning against the upstream face
    p.vx += (nx >= 0 ? 1 : -1) * 12;
    p.spinV += (nx >= 0 ? 1 : -1) * (2 + impact * 0.06);
    if (p.flip > 0) return;
    if (impact > 34 && p.inv <= 0) wipeout(g, name);
    else if (impact > 8) {
      g.bonks += p.inv > 0 ? 0 : 1;
      g.events.push({ e: 'bonk', x: hx, d: hd });
    }
  };
  for (const k of c.rocks) {
    const dx = p.x - k.x;
    const dd = p.d - k.d;
    if (Math.abs(dd) > 20) continue;
    const dist = Math.hypot(dx, dd);
    const min = k.r + TUBE_R;
    if (dist < min && dist > 0.01) solid(dx / dist, dd / dist, min - dist, 'ROCK', p.x - (dx / dist) * TUBE_R, p.d - (dd / dist) * TUBE_R);
  }
  for (const l of c.logs) {
    if (Math.abs(p.d - l.d) > l.len + 12) continue;
    const ax = Math.cos(l.ang);
    const ay = Math.sin(l.ang);
    const rx = p.x - l.x;
    const ry = p.d - l.d;
    const s = clamp(rx * ax + ry * ay, -l.len, l.len);
    const cx = l.x + ax * s;
    const cy = l.d + ay * s;
    const dx = p.x - cx;
    const dd = p.d - cy;
    const dist = Math.hypot(dx, dd);
    const min = 3.5 + TUBE_R;
    if (dist < min && dist > 0.01 && l.hit <= 0) {
      solid(dx / dist, dd / dist, min - dist, 'LOG', cx, cy);
      l.hit = 0.25;
    }
  }
  for (const b of c.branches) {
    if (b.hit || Math.abs(p.d - b.d) > 5) continue;
    const under = b.side < 0 ? p.x - TUBE_R < b.reach : p.x + TUBE_R > b.reach;
    if (!under || p.flip > 0) continue;
    b.hit = true;
    p.vd *= 0.3;
    p.spinV += b.side * 3;
    g.bonks++;
    g.events.push({ e: 'snag', x: p.x, d: p.d });
    const lost = g.held.pop();
    if (lost) pop(g, lost, p.x, p.d);
    say(g, lost ? 'IT TOOK YOUR SNACK!' : 'THWAP! HAHA', 2);
  }
  for (const rp of c.ropes) {
    if (rp.used || p.flip > 0) continue;
    if (Math.abs(p.d - rp.d) < 7 && Math.abs(p.x - rp.x) < 8) {
      rp.used = true;
      g.rope = true;
      p.air = 1.25;
      p.airMax = 1.25;
      p.airPeak = 26;
      p.inv = Math.max(p.inv, 1.6);
      g.events.push({ e: 'grab', x: rp.x, d: rp.d });
      say(g, 'CANNONBALL!!!', 3);
    }
  }
  for (const w of c.waves) {
    if (w.hopped || p.flip > 0) continue;
    if (p.d >= w.d && prevD < w.d && Math.abs(p.x - w.x) < w.w / 2) {
      w.hopped = true;
      p.air = 0.28;
      p.airMax = 0.28;
      p.airPeak = 3.5;
      g.events.push({ e: 'wave', x: p.x, d: p.d });
    }
  }
  for (const wh of c.whirls) {
    const dist = Math.hypot(p.x - wh.x, p.d - wh.d);
    if (dist < wh.r * 0.45 && p.flip <= 0) {
      if (p.whirlT === 0) g.events.push({ e: 'whirl', x: wh.x, d: wh.d });
      p.whirlT += dt;
      if (p.whirlT > 1.5) {
        p.whirlT = 0;
        p.x = wh.x + (p.x - wh.x) * 2.2;
        wipeout(g, 'SPUN OUT');
      }
    } else if (dist > wh.r * 0.6) p.whirlT = Math.max(0, p.whirlT - dt * 2);
  }
  for (const f of c.falls) {
    if (g.fallDone || p.d < f.d) continue;
    g.fallDone = true;
    if (Math.abs(p.x - f.tx) <= f.tw / 2 && p.flip <= 0) {
      g.fallClean = true;
      p.air = 0.7;
      p.airMax = 0.7;
      p.airPeak = 9;
      g.events.push({ e: 'drop', x: p.x, d: p.d, s: 'clean' });
      say(g, 'WHEEEEE!', 3);
    } else {
      g.events.push({ e: 'drop', x: p.x, d: p.d, s: 'rocks' });
      p.inv = 0;
      wipeout(g, 'OVER THE FALLS');
    }
  }
  // snacks
  for (const i of c.items) {
    if (i.got || p.flip > 0) continue;
    if (Math.abs(p.d - i.d) < 10 && Math.abs(p.x - i.x) < 10) {
      i.got = true;
      if (i.kind === 'cooler') g.towing = true;
      else if (i.kind === 'sandal') {
        g.sandal = true;
        g.events.push({ e: 'sandal', x: i.x, d: i.d });
        say(g, "MY SANDAL!! YOU'RE A HERO!", 4, 2.2);
        continue;
      } else g.held.push(i.kind);
      g.events.push({ e: 'pick', x: i.x, d: i.d, k: i.kind });
      if (i.kind === 'cooler') say(g, "YOU GOT THE COOLER! DON'T FLIP!", 3, 2);
    }
  }
}

function stepRae(g: RiverSim, dt: number): void {
  const r = g.rae;
  const p = g.p;
  // She drifts a little ahead (sometimes way ahead), waits up when you wipe out.
  g.lead = 42 + 30 * Math.sin(g.gt * 0.21) + (p.flip > 0 ? -30 : 0);
  const want = p.d + g.lead;
  const f = flowAt(g.c, r.x, r.d, g.t);
  const dv = clamp((want - r.d) * 1.1, -f.vd * 0.65, 34);
  r.vd += (f.vd + dv - r.vd) * Math.min(1, dt * 2);
  const tx = planX(g, r.x, r.d, 120);
  const ax = clamp((tx - r.x) * 4 - r.vx * 2.2, -120, 120);
  r.vx += ax * dt;
  r.x += r.vx * dt;
  r.d += r.vd * dt;
  const [L, R] = banks(g.c, r.d);
  r.x = clamp(r.x, L + TUBE_R + 1, R - TUBE_R - 1);
  r.spinV += (f.spin * 1.2 - r.ang * 1.8 - r.spinV * 1.4) * dt;
  r.ang += r.spinV * dt;
  r.stroke = Math.max(0, r.stroke - dt * 3);
  r.paddleCD -= dt;
  if (dv > 12 && r.paddleCD <= 0) {
    r.paddleCD = 0.42;
    r.stroke = 1;
    r.strokeSide = -r.strokeSide;
  }
  // over the falls Rae takes the tongue like a pro
  for (const fl of g.c.falls) if (r.d - r.vd * dt < fl.d && r.d >= fl.d) (r.air = 0.7), (r.airMax = 0.7), (r.airPeak = 9);
  r.air = Math.max(0, r.air - dt);
}

function callouts(g: RiverSim): void {
  const p = g.p;
  if (g.sayCD > 0 || p.flip > 0) return;
  const c = g.c;
  const near = (list: { d: number }[], lo: number, hi: number): boolean => list.some((o) => o.d - p.d > lo && o.d - p.d < hi);
  if (!g.saidRapids && zoneWeight(p.d + 150, 'rapids') > 0.5) {
    g.saidRapids = true;
    g.events.push({ e: 'rapids', x: p.x, d: p.d });
    say(g, 'RAPIDS!! HOLD ON!', 3, 1.8);
  } else if (near(c.falls, 90, 200)) say(g, 'WATERFALL! HIT THE SMOOTH V!', 3, 2.2);
  else if (near(c.ropes.filter((r) => !r.used), 80, 170)) say(g, 'ROPE SWING!! STEER INTO IT!', 2, 2);
  else if (near(c.whirls, 70, 160)) say(g, 'WHIRLPOOL! GO AROUND!', 2, 1.8);
  else {
    const h = hazardName(g, p.x, p.d);
    if (h) {
      const tx = planX(g, p.x, p.d, 140);
      say(g, `${h.name} GO ${tx < p.x ? 'LEFT' : 'RIGHT'}!`, 2, 1.3);
    } else if (!g.towing && c.items.some((i) => i.kind === 'cooler' && !i.got && i.d - p.d > 40 && i.d - p.d < 140)) say(g, 'A COOLER!! GRAB IT!', 1, 1.6);
    else if (Math.abs(g.rae.d - p.d) > 120 && g.gt - g.lastFar > 6) {
      g.lastFar = g.gt;
      say(g, g.rae.d > p.d ? 'CATCH UP! PADDLE!' : 'HEY! WAIT FOR ME!', 1, 1.6);
    } else return;
  }
  g.sayCD = 2.4;
}

export function finishLine(c: Course): number {
  return c.trip ? LEN + 60 : LEN;
}

export function stepRiver(g: RiverSim, inp: RiverInput, dt: number): void {
  g.t += dt;
  g.events.length = 0;
  g.say.t = Math.max(0, g.say.t - dt);
  g.sayCD = Math.max(0, g.sayCD - dt);
  if (g.phase === 'count') {
    if (g.t >= COUNT) {
      g.phase = 'play';
      g.events.push({ e: 'go', x: g.p.x, d: g.p.d });
    }
  } else if (g.phase === 'play') g.gt += dt;
  else g.endT += dt;
  const idle: RiverInput = { steer: 0, paddle: false, brake: false };
  const prevD = g.p.d;
  if (g.phase !== 'count') {
    stepTube(g, g.p, g.phase === 'play' ? inp : idle, dt, true);
    stepRae(g, dt);
  }
  // logs drift and turn; lost items float off
  for (const l of g.c.logs) {
    l.hit = Math.max(0, l.hit - dt);
    if (l.fixed) continue;
    l.x += l.vx * dt;
    l.d += l.vd * dt;
    l.ang += l.spin * dt;
    const [L, R] = banks(g.c, l.d);
    if (l.x < L + 12 || l.x > R - 12) l.vx = -l.vx;
  }
  for (const i of g.c.items) {
    if (i.got) continue;
    const f = flowAt(g.c, i.x, i.d, g.t);
    i.d += f.vd * i.drift * dt;
    i.x += f.vx * i.drift * dt;
    const [L, R] = banks(g.c, i.d);
    i.x = clamp(i.x, L + 6, R - 6);
  }
  if (g.phase === 'play') {
    collide(g, dt, prevD);
    callouts(g);
    if (Math.hypot(g.p.x - g.rae.x, g.p.d - g.rae.d) < 72) g.nearT = Math.min(g.gt, g.nearT + dt);
    if (g.p.d >= finishLine(g.c)) {
      g.phase = 'end';
      g.endT = 0;
      g.events.push({ e: 'finish', x: g.p.x, d: g.p.d });
      say(g, g.c.trip ? 'THE OCEAN!!! WE MADE IT!' : g.wipes === 0 ? 'RIVER LEGEND!!' : 'SAME TIME NEXT WEEK?', 5, 4);
    }
  }
  g.camD += (g.p.d - g.camD) * Math.min(1, dt * 7);
  g.score = riverScore(g);
}

export function heldValue(g: RiverSim): number {
  return g.held.reduce((s, k) => s + ITEM_VALUE[k], 0) + (g.towing ? ITEM_VALUE.cooler : 0) + (g.sandal ? ITEM_VALUE.sandal : 0);
}

// 0..1. A clean float with Rae, most of the snacks and the stunts is a 1; a wipeout costs ~0.12,
// drifting away from Rae and leaving snacks behind cost the rest. Washing out (3 wipeouts) caps it low.
export function riverScore(g: RiverSim): number {
  const prog = clamp(g.p.d / finishLine(g.c), 0, 1);
  const pick = clamp(heldValue(g) / (g.c.totalValue * 0.55), 0, 1);
  const near = g.gt > 1 ? clamp(g.nearT / g.gt / 0.8, 0, 1) : 1;
  const stunts = (g.rope ? 0.5 : 0) + (g.fallClean ? 0.5 : 0);
  if (g.out) return clamp(0.08 + 0.3 * prog + 0.1 * pick, 0, 0.42);
  const safety = clamp(1 - 0.22 * g.wipes - 0.05 * g.bonks, 0, 1);
  return clamp(0.5 * safety + 0.25 * pick + 0.13 * near + 0.12 * stunts, 0, 1);
}

const BOT = new WeakMap<RiverSim, { t: number; x: number }>();
// A simple automatic floater for tests: skill 0 = drifts and paddles blindly, 1 = reads the river.
export function botInput(g: RiverSim, skill: number): RiverInput {
  const p = g.p;
  if (skill <= 0) return { steer: Math.sin(g.t * 0.7) * 0.5, paddle: Math.sin(g.t * 0.3) > 0.6, brake: false };
  // slower readers re-plan less often and look less far ahead
  const memo = BOT.get(g);
  let tx: number;
  if (memo && g.t - memo.t < (1 - skill) * 0.7) tx = memo.x;
  else {
    tx = planX(g, p.x, p.d, 40 + 100 * skill, skill > 0.8);
    BOT.set(g, { t: g.t, x: tx });
  }
  const steer = clamp((tx - p.x) / 10 - p.vx / 50, -1, 1);
  const behind = g.rae.d - p.d > 50;
  return { steer, paddle: behind, brake: g.rae.d - p.d < -30 };
}

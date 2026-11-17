// Roach Patrol rules (pure logic, no drawing): the midnight kitchen's layout, roach behaviour
// (scurry, pause, scatter from the spray, hide under the fridge/counter/table, climb to the food,
// multiply when left alone), cracks that spawn them in waves and can be sealed, the spray tank,
// and the 0..1 score.
import { angDiff, clamp, clamp01, dist, inBox, pushOut, type Box, type Rng } from './tagMath.ts';

// ---------- the kitchen ----------
export const ROOM = { x0: 10, y0: 52, x1: 246, y1: 136 }; // where your feet can go
export const BUG = { x0: 7, y0: 44, x1: 249, y1: 140 }; // where roaches run on the floor
export const COUNTER_Y = 26; // food sits on the counter top at this y
export const FLOOR_EDGE = 46; // bottom of the counter: roaches climb from here
export const TABLE: Box = { x: 36, y: 92, w: 46, h: 16 };
export const TRASH: Box = { x: 220, y: 112, w: 14, h: 11 };
export const OBSTACLES: Box[] = [TABLE, TRASH];

export type ZoneId = 'fridge' | 'counter' | 'table' | 'stove';
export interface Zone extends Box {
  id: ZoneId;
}
export const ZONES: Zone[] = [
  { id: 'fridge', x: 204, y: 43, w: 40, h: 6 },
  { id: 'counter', x: 8, y: 42, w: 112, h: 5 },
  { id: 'stove', x: 150, y: 42, w: 48, h: 5 },
  { id: 'table', x: 38, y: 93, w: 42, h: 14 },
];

export interface Crack {
  x: number;
  y: number;
  side: 'top' | 'left' | 'right' | 'bottom';
  sealed: boolean;
  wave: number; // first wave it becomes active
  spawnT: number;
  peek: number; // a roach is about to come out (for the art)
}
export const CRACKS: Omit<Crack, 'sealed' | 'spawnT' | 'peek'>[] = [
  { x: 96, y: 45, side: 'top', wave: 2 },
  { x: 7, y: 72, side: 'left', wave: 1 },
  { x: 7, y: 124, side: 'left', wave: 3 },
  { x: 140, y: 140, side: 'bottom', wave: 1 },
  { x: 249, y: 92, side: 'right', wave: 2 },
];
export const SEAL_REACH = 15;
export const SEAL_TIME = 0.7;

export type FoodKind = 'bread' | 'fruit' | 'pie';
export interface Food {
  kind: FoodKind;
  x: number;
  hp: number; // 0..100
}

// ---------- tuning ----------
export const TIME = 60;
export const PLAYER_SPEED = 70;
export const SPRAY_LEN = 42;
export const SPRAY_HALF = 0.4; // radians
export const KILL_DOSE = 0.14; // seconds in the mist
export const DRAIN = 0.42; // tank per second of spraying
export const REFILL = 0.2; // tank per second when not spraying
export const BREED_TIME = 10.5;
export const CAP = 36;
export const EAT_RATE = 5.5; // food hp per second per roach

export type RoachState = 'run' | 'pause' | 'flee' | 'hide' | 'climb' | 'eat' | 'down';
export interface Roach {
  id: number;
  x: number;
  y: number;
  ang: number;
  spd: number;
  st: RoachState;
  t: number;
  dose: number;
  size: number; // 0.55 (baby) .. 1
  breed: number;
  goal: 'wander' | 'food' | 'hide';
  gx: number;
  gy: number;
  zone: number;
  food: number;
  legPh: number;
  scared: number; // seconds since last scare
}

export type REv =
  | { k: 'splat'; x: number; y: number; counter: boolean; combo: number }
  | { k: 'scatter'; x: number; y: number }
  | { k: 'baby'; x: number; y: number }
  | { k: 'spawn'; c: number }
  | { k: 'sealStart'; c: number }
  | { k: 'sealed'; c: number }
  | { k: 'eat'; f: number }
  | { k: 'foodGone'; f: number }
  | { k: 'wave'; n: number }
  | { k: 'crackOpen'; c: number }
  | { k: 'empty' }
  | { k: 'flush'; z: number }
  | { k: 'noCrack' }
  | { k: 'clear' };

export interface Kitchen {
  roaches: Roach[];
  cracks: Crack[];
  foods: Food[];
  px: number;
  py: number;
  vx: number;
  vy: number;
  aim: number;
  runPh: number;
  tank: number;
  idle: number; // time since the last spray (for refill)
  dry: boolean; // ran dry: wait for a bit of tank before spraying again
  spraying: boolean;
  seal: { c: number; t: number } | null;
  time: number;
  left: number;
  wave: number;
  killed: number;
  born: number;
  combo: number;
  comboT: number;
  bestCombo: number;
  over: boolean;
  won: boolean;
  ev: REv[];
  rng: Rng;
  nextId: number;
}

export interface KInput {
  mx: number;
  my: number;
  aim: number;
  spray: boolean;
  seal: boolean; // edge: pressed this frame
}

// ---------- setup ----------
function newRoach(k: Kitchen, x: number, y: number, size = 1): Roach {
  return {
    id: k.nextId++,
    x,
    y,
    ang: k.rng() * Math.PI * 2,
    spd: 0,
    st: 'pause',
    t: k.rng() * 0.6,
    dose: 0,
    size,
    breed: k.rng() * 3,
    goal: 'wander',
    gx: x,
    gy: y,
    zone: -1,
    food: -1,
    legPh: k.rng() * 4,
    scared: 5,
  };
}

export function newKitchen(rng: Rng): Kitchen {
  const k: Kitchen = {
    roaches: [],
    cracks: CRACKS.map((c, i) => ({ ...c, sealed: false, spawnT: 1.5 + i * 0.7, peek: 0 })),
    foods: [
      { kind: 'bread', x: 30, hp: 100 },
      { kind: 'fruit', x: 106, hp: 100 },
      { kind: 'pie', x: 176, hp: 100 },
    ],
    px: 128,
    py: 118,
    vx: 0,
    vy: 0,
    aim: -Math.PI / 2,
    runPh: 0,
    tank: 1,
    idle: 1,
    dry: false,
    spraying: false,
    seal: null,
    time: 0,
    left: TIME,
    wave: 1,
    killed: 0,
    born: 0,
    combo: 0,
    comboT: 0,
    bestCombo: 0,
    over: false,
    won: false,
    ev: [],
    rng,
    nextId: 1,
  };
  // a few already out, and a couple hiding under the fridge
  const spots: [number, number][] = [
    [60, 70],
    [190, 80],
    [150, 124],
    [100, 60],
    [215, 64],
    [30, 128],
    [120, 92],
    [236, 128],
  ];
  for (const [x, y] of spots) k.roaches.push(newRoach(k, x, y));
  for (let i = 0; i < 2; i++) {
    const r = newRoach(k, 210 + i * 14, 46);
    r.st = 'hide';
    r.zone = 0;
    r.t = 6 + i * 3;
    k.roaches.push(r);
  }
  return k;
}

// ---------- helpers ----------
export const foodLeft = (k: Kitchen): number => k.foods.reduce((a, f) => a + f.hp, 0) / (k.foods.length * 100);
export const alive = (k: Kitchen): number => k.roaches.filter((r) => r.st !== 'down').length;
export const sealedCount = (k: Kitchen): number => k.cracks.filter((c) => c.sealed).length;

export function nearestCrack(k: Kitchen, x: number, y: number): number {
  let best = -1;
  let bd = SEAL_REACH;
  k.cracks.forEach((c, i) => {
    if (c.sealed || c.wave > k.wave) return;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// The nozzle sits at chest height, a little in front of you.
export function nozzle(k: Kitchen): [number, number] {
  return [k.px + Math.cos(k.aim) * 9, k.py - 9 + Math.sin(k.aim) * 7];
}

export function inMist(k: Kitchen, x: number, y: number, extraLen = 0, extraAng = 0): boolean {
  const [nx, ny] = nozzle(k);
  const d = dist(nx, ny, x, y);
  if (d > SPRAY_LEN + extraLen) return false;
  if (d < 4) return true;
  return Math.abs(angDiff(k.aim, Math.atan2(y - ny, x - nx))) < SPRAY_HALF + extraAng;
}

export const waveOf = (t: number): number => (t < 15 ? 1 : t < 32 ? 2 : 3);
const spawnEvery = (w: number): number => (w === 1 ? 4.4 : w === 2 ? 3.2 : 2.3);
const foodBias = (w: number): number => (w === 1 ? 0.2 : w === 2 ? 0.32 : 0.4);

function pickGoal(k: Kitchen, r: Roach): void {
  const u = k.rng();
  const foods = k.foods.map((f, i) => ({ f, i })).filter((o) => o.f.hp > 0);
  if (u < foodBias(k.wave) && foods.length) {
    const o = foods[Math.floor(k.rng() * foods.length)];
    r.goal = 'food';
    r.food = o.i;
    r.gx = o.f.x + (k.rng() * 6 - 3);
    r.gy = FLOOR_EDGE;
  } else if (u < foodBias(k.wave) + 0.15) {
    r.goal = 'hide';
    const z = Math.floor(k.rng() * ZONES.length);
    r.zone = z;
    r.gx = ZONES[z].x + 4 + k.rng() * (ZONES[z].w - 8);
    r.gy = ZONES[z].y + ZONES[z].h / 2;
  } else {
    r.goal = 'wander';
    r.gx = BUG.x0 + 8 + k.rng() * (BUG.x1 - BUG.x0 - 16);
    r.gy = BUG.y0 + 6 + k.rng() * (BUG.y1 - BUG.y0 - 10);
  }
}

function nearestZone(r: Roach): number {
  let best = 0;
  let bd = 1e9;
  ZONES.forEach((z, i) => {
    const d = dist(r.x, r.y, z.x + z.w / 2, z.y + z.h / 2);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function scare(k: Kitchen, r: Roach, fromX: number, fromY: number): void {
  if (r.st === 'down') return;
  const away = Math.atan2(r.y - fromY, r.x - fromX);
  const wasCalm = r.scared > 1;
  r.scared = 0;
  r.breed = Math.max(0, r.breed - 2);
  if (r.st === 'hide') r.zone = -1;
  if (r.st === 'climb' || r.st === 'eat') {
    // drop back down to the floor and run
    r.y = FLOOR_EDGE + 1;
  }
  r.st = 'flee';
  r.ang = away + (k.rng() - 0.5) * 1.2;
  r.spd = 115 + k.rng() * 30;
  r.t = 0.45 + k.rng() * 0.3;
  if (wasCalm) k.ev.push({ k: 'scatter', x: r.x, y: r.y });
}

// ---------- the step ----------
export function stepKitchen(k: Kitchen, dt: number, inp: KInput | null): void {
  if (k.over) return;
  k.time += dt;
  k.left = Math.max(0, k.left - dt);
  const w = waveOf(k.time);
  if (w !== k.wave) {
    k.wave = w;
    k.ev.push({ k: 'wave', n: w });
    k.cracks.forEach((c, i) => {
      if (c.wave === w) {
        c.spawnT = 0.8 + k.rng();
        k.ev.push({ k: 'crackOpen', c: i });
      }
    });
    if (w === 3) {
      // the fridge stirs: a bunch rush out from underneath
      for (let i = 0; i < 4 && k.roaches.length < CAP; i++) {
        const r = newRoach(k, 208 + i * 9, 46);
        r.st = 'flee';
        r.ang = Math.PI / 2 + (k.rng() - 0.5);
        r.spd = 100;
        r.t = 0.5;
        k.roaches.push(r);
        k.born++;
      }
    }
  }
  k.comboT -= dt;
  if (k.comboT <= 0) k.combo = 0;

  // ----- you -----
  if (inp) stepYou(k, dt, inp);

  // ----- cracks -----
  k.cracks.forEach((c, i) => {
    if (c.sealed || c.wave > k.wave) return;
    c.spawnT -= dt;
    c.peek = c.spawnT < 0.8 ? 1 : 0;
    if (c.spawnT <= 0) {
      c.spawnT = spawnEvery(k.wave) * (0.8 + k.rng() * 0.4);
      if (k.roaches.length >= CAP) return;
      const r = newRoach(k, c.x, c.y);
      r.st = 'run';
      r.ang = c.side === 'left' ? 0 : c.side === 'right' ? Math.PI : c.side === 'top' ? Math.PI / 2 : -Math.PI / 2;
      r.ang += (k.rng() - 0.5) * 0.8;
      r.spd = 80;
      r.t = 0.5;
      pickGoal(k, r);
      k.roaches.push(r);
      k.born++;
      k.ev.push({ k: 'spawn', c: i });
    }
  });

  // ----- roaches -----
  const babies: Roach[] = [];
  for (const r of k.roaches) {
    r.t -= dt;
    r.scared += dt;
    if (r.size < 1) r.size = Math.min(1, r.size + dt / 14);
    if (r.st === 'down') continue;
    // the mist
    if (k.spraying && inMist(k, r.x, r.y)) {
      r.dose += dt;
      if (r.dose >= KILL_DOSE) {
        r.st = 'down';
        r.t = 0.42;
        k.killed++;
        k.combo = k.comboT > 0 ? k.combo + 1 : 1;
        k.comboT = 0.9;
        k.bestCombo = Math.max(k.bestCombo, k.combo);
        k.ev.push({ k: 'splat', x: r.x, y: r.y, counter: r.y < FLOOR_EDGE - 2, combo: k.combo });
        continue;
      }
    } else r.dose = Math.max(0, r.dose - dt * 0.5);
    // threats: the spray's edge, and your feet
    if (r.st !== 'hide' && r.scared > 0.3) {
      const near = dist(r.x, r.y, k.px, k.py) < 20;
      const edge = k.spraying && inMist(k, r.x, r.y, 18, 0.45);
      if (near || edge) {
        const [nx, ny] = nozzle(k);
        scare(k, r, near ? k.px : nx, near ? k.py : ny);
      }
    }
    // multiply when left alone
    if (r.size >= 1 && r.st !== 'flee') {
      r.breed += r.st === 'hide' ? dt * 0.5 : dt;
      const bt = BREED_TIME * (k.wave === 3 ? 0.8 : 1);
      if (r.breed >= bt && k.roaches.length + babies.length < CAP) {
        r.breed = 0;
        const b = newRoach(k, r.x + (k.rng() - 0.5) * 6, r.y + (k.rng() - 0.5) * 4, 0.55);
        if (r.st === 'hide') {
          b.st = 'hide';
          b.zone = r.zone;
          b.t = 2 + k.rng() * 3;
        } else if (r.st === 'climb' || r.st === 'eat') b.y = FLOOR_EDGE + 1;
        babies.push(b);
        k.born++;
        k.ev.push({ k: 'baby', x: r.x, y: r.y });
      }
    }
    stepRoach(k, r, dt);
  }
  k.roaches.push(...babies);
  k.roaches = k.roaches.filter((r) => !(r.st === 'down' && r.t <= 0));

  // ----- the end -----
  if (alive(k) === 0 && sealedCount(k) === k.cracks.length) {
    k.won = true;
    k.over = true;
    k.ev.push({ k: 'clear' });
  }
  if (k.left <= 0) k.over = true;
}

function stepYou(k: Kitchen, dt: number, inp: KInput): void {
  // sealing a crack roots you for a moment
  if (k.seal) {
    k.seal.t -= dt;
    k.vx *= 0.7;
    k.vy *= 0.7;
    k.spraying = false;
    if (k.seal.t <= 0) {
      k.cracks[k.seal.c].sealed = true;
      k.cracks[k.seal.c].peek = 0;
      k.ev.push({ k: 'sealed', c: k.seal.c });
      k.seal = null;
    }
    return;
  }
  if (inp.seal) {
    const c = nearestCrack(k, k.px, k.py);
    if (c >= 0) {
      k.seal = { c, t: SEAL_TIME };
      k.spraying = false;
      k.ev.push({ k: 'sealStart', c });
      return;
    }
  }
  let mx = inp.mx;
  let my = inp.my;
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  const kk = Math.min(1, dt * (l > 0.05 ? 15 : 12));
  const top = PLAYER_SPEED * (k.spraying ? 0.8 : 1);
  k.vx += (mx * top - k.vx) * kk;
  k.vy += (my * top - k.vy) * kk;
  k.px += k.vx * dt;
  k.py += k.vy * dt;
  for (const o of OBSTACLES) [k.px, k.py] = pushOut(k.px, k.py, 4, o);
  k.px = clamp(k.px, ROOM.x0, ROOM.x1);
  k.py = clamp(k.py, ROOM.y0, ROOM.y1);
  k.runPh += Math.hypot(k.vx, k.vy) * dt * 0.16;
  k.aim = inp.aim;
  // the tank
  const want = inp.spray && !k.dry;
  if (want && k.tank > 0) {
    k.spraying = true;
    k.tank = Math.max(0, k.tank - DRAIN * dt);
    k.idle = 0;
    if (k.tank <= 0) {
      k.dry = true;
      k.spraying = false;
      k.ev.push({ k: 'empty' });
    }
  } else {
    k.spraying = false;
    k.idle += dt;
    if (k.idle > 0.35) k.tank = Math.min(1, k.tank + REFILL * dt);
    if (k.dry && k.tank >= 0.3) k.dry = false;
  }
  // spraying into a hiding spot flushes them out
  if (k.spraying) {
    ZONES.forEach((z, zi) => {
      const [nx, ny] = nozzle(k);
      let hit = false;
      for (let d = 8; d <= SPRAY_LEN + 6 && !hit; d += 6) if (inBox(z, nx + Math.cos(k.aim) * d, ny + Math.sin(k.aim) * d + 4, 3)) hit = true;
      if (!hit) return;
      let n = 0;
      for (const r of k.roaches)
        if (r.st === 'hide' && r.zone === zi) {
          r.st = 'flee';
          r.zone = -1;
          r.ang = Math.atan2(r.y - k.py, r.x - k.px) + (k.rng() - 0.5) * 1.4;
          if (zi !== 3) r.ang = Math.PI / 2 + (k.rng() - 0.5) * 1.6;
          r.y = Math.max(r.y, z.y + z.h + 1);
          r.spd = 110;
          r.t = 0.5;
          r.scared = 0;
          n++;
        }
      if (n) k.ev.push({ k: 'flush', z: zi });
    });
  }
}

function stepRoach(k: Kitchen, r: Roach, dt: number): void {
  const moveFwd = (sp: number): void => {
    r.x += Math.cos(r.ang) * sp * dt;
    r.y += Math.sin(r.ang) * sp * dt;
    r.legPh += sp * dt * 0.6;
    let bounced = false;
    if (r.x < BUG.x0) {
      r.x = BUG.x0;
      bounced = true;
    }
    if (r.x > BUG.x1) {
      r.x = BUG.x1;
      bounced = true;
    }
    if (r.y < BUG.y0) {
      r.y = BUG.y0;
      bounced = true;
    }
    if (r.y > BUG.y1) {
      r.y = BUG.y1;
      bounced = true;
    }
    if (inBox(TRASH, r.x, r.y)) {
      [r.x, r.y] = pushOut(r.x, r.y, 1, TRASH);
      bounced = true;
    }
    if (bounced) r.ang += Math.PI * (0.6 + k.rng() * 0.8);
  };
  switch (r.st) {
    case 'pause':
      r.legPh += dt * 2;
      if (r.t <= 0) {
        if (r.goal === 'wander' || k.rng() < 0.3) pickGoal(k, r);
        r.st = 'run';
        r.t = 0.3 + k.rng() * 0.7;
        r.spd = (62 + k.rng() * 36) * (0.75 + r.size * 0.25);
      }
      break;
    case 'run': {
      const want = Math.atan2(r.gy - r.y, r.gx - r.x);
      r.ang += clamp(angDiff(r.ang, want), -dt * 7, dt * 7) + (k.rng() - 0.5) * dt * 10;
      moveFwd(r.spd);
      const d = dist(r.x, r.y, r.gx, r.gy);
      if (d < 4) {
        if (r.goal === 'food' && k.foods[r.food]?.hp > 0) {
          r.st = 'climb';
          r.x = k.foods[r.food].x + (k.rng() * 6 - 3);
          r.y = FLOOR_EDGE;
          r.ang = -Math.PI / 2;
        } else if (r.goal === 'hide') {
          r.st = 'hide';
          r.t = 2 + k.rng() * 2.5;
        } else {
          r.goal = 'wander';
          pickGoal(k, r);
          r.st = 'pause';
          r.t = 0.15 + k.rng() * 0.4;
        }
      } else if (r.t <= 0) {
        r.st = 'pause';
        r.t = 0.12 + k.rng() * 0.45;
      }
      break;
    }
    case 'flee':
      r.ang += (k.rng() - 0.5) * dt * 6;
      moveFwd(r.spd);
      if (r.t <= 0) {
        if (k.rng() < 0.55) {
          r.goal = 'hide';
          r.zone = nearestZone(r);
          const z = ZONES[r.zone];
          r.gx = clamp(r.x, z.x + 3, z.x + z.w - 3);
          r.gy = z.y + z.h / 2;
        } else pickGoal(k, r);
        r.st = 'run';
        r.spd = 90 + k.rng() * 20;
        r.t = 1.2;
      }
      break;
    case 'hide': {
      // out of sight; peek back out after a while
      if (r.zone >= 0) {
        const z = ZONES[r.zone];
        r.x = clamp(r.x, z.x + 1, z.x + z.w - 1);
        r.y = clamp(r.y, z.y, z.y + z.h);
      }
      if (r.t <= 0) {
        const z = r.zone >= 0 ? ZONES[r.zone] : null;
        if (z && z.id !== 'table') r.y = z.y + z.h + 1;
        r.zone = -1;
        r.st = 'run';
        r.ang = Math.PI / 2 + (k.rng() - 0.5) * 2;
        r.spd = 70;
        r.t = 0.6;
        pickGoal(k, r);
      }
      break;
    }
    case 'climb': {
      const f = k.foods[r.food];
      r.legPh += dt * 30;
      r.y -= 32 * dt;
      r.ang = -Math.PI / 2;
      if (!f || f.hp <= 0) {
        r.y = FLOOR_EDGE + 1;
        r.st = 'run';
        r.ang = Math.PI / 2;
        pickGoal(k, r);
      } else if (r.y <= COUNTER_Y + 2) {
        r.y = COUNTER_Y + 2 - k.rng() * 4;
        r.st = 'eat';
        r.t = 0;
      }
      break;
    }
    case 'eat': {
      const f = k.foods[r.food];
      r.legPh += dt * 6;
      r.ang = -Math.PI / 2 + Math.sin(k.time * 8 + r.id) * 0.4;
      if (!f || f.hp <= 0) {
        r.y = FLOOR_EDGE + 1;
        r.st = 'run';
        r.ang = Math.PI / 2;
        pickGoal(k, r);
        break;
      }
      const before = f.hp;
      f.hp = Math.max(0, f.hp - EAT_RATE * dt);
      if (Math.floor(before / 10) !== Math.floor(f.hp / 10)) k.ev.push({ k: 'eat', f: r.food });
      if (f.hp <= 0) k.ev.push({ k: 'foodGone', f: r.food });
      break;
    }
  }
}

// ---------- results ----------
// Cracks sealed, roaches left, food saved, plus a bonus for a clean sweep. Sealing everything,
// clearing the room and keeping the food is a 1.0; a decent first try lands around 0.6-0.75;
// letting them run wild is ~0.15-0.35.
export function roachScore(sealed: number, cracks: number, remaining: number, food: number, won: boolean): number {
  const sealS = cracks > 0 ? sealed / cracks : 1;
  const clearS = clamp01(1 - remaining / 20);
  return clamp01(0.15 + 0.25 * sealS + 0.25 * clearS + 0.25 * clamp01(food) + (won ? 0.1 : 0));
}

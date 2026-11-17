// Driving Test course: simulation (pure, testable) + renderer. The React shell lives in RoadTest.tsx.
// World units are pixels: x is lateral, d is distance along the road (up the screen).
import { drawPerson, type Person } from '../art/people.ts';
import { hash, INK, outlineRect, rect, shade, text, dither, type Ctx } from '../art/px.ts';
import { bigText, clamp, drawVehicle, Fx, outlinedText, smooth, vehicleSize, type VehicleLook } from './driveKit.tsx';
import { glow as hglow, grain, softBlit, softShadow, sphere, tone } from './hdFx.ts';

export const VW = 192;
export const VH = 144;
export const MPH = 2; // px/s per mph

// ---- course layout (d) ----
export const SS = 240; // stop-sign stop line
export const TL = 1240; // traffic-light stop line
export const SZ0 = 1420; // school zone
export const SZ1 = 1760;
export const XW = 1610; // school crosswalk
export const PK = 1830; // "pull over and park"
export const BLUE_D = 1980; // blue car (front of the space)
export const REAR_D = 1930; // car behind the space
const INTERSECTIONS = [SS, TL];

// ---- lateral layout (offset from the road's yellow line) ----
export const OFF = { onc: -13.5, left: 13, right: 36, park: 55.5 };
const DASH = 24.5;
const EDGE = 47.5;
const CURB = 63;
const LCURB = -35;

const W_CAR = 9; // body width
const L_CAR = 16; // body length

export function roadX(d: number): number {
  let e = smooth((d - 40) / 120);
  for (const k of [SS + 24, TL + 24, XW + 4]) e *= smooth((Math.abs(d - k) - 60) / 90);
  e *= smooth((PK - 90 - d) / 90);
  return 76 + Math.sin(d / 150) * 7 * e + Math.sin(d / 61) * 1.5 * e;
}

export function limitAt(d: number): number {
  if (d < SS + 60) return 25;
  if (d < TL + 60) return 35;
  if (d >= SZ0 && d < SZ1) return 20;
  if (d >= PK - 40) return 15;
  return 30;
}

export const W = (k: string): number => WEIGHTS[k] ?? 0.05;
export const WEIGHTS: Record<string, number> = {
  crash: 0.3,
  ped: 0.3,
  ranStop: 0.3,
  rolling: 0.15,
  pastLine: 0.06,
  ranRed: 0.35,
  yellow: 0.08,
  speed: 0.08,
  school: 0.2,
  cutoff: 0.15,
  unsafe: 0.1,
  signal: 0.05,
  weave: 0.05,
  center: 0.12,
  shoulder: 0.05,
  follow: 0.06,
  noChange: 0.08,
  stayLeft: 0.04,
  slow: 0.05,
  curb: 0.03,
  tap: 0.08,
  parkFar: 0.05,
  parkCrooked: 0.05,
  noPark: 0.15,
  time: 0.15,
};
export const CRASH_CAP = 0.45;

export interface Mark {
  k: string;
  label: string;
  pts: number;
  t: number;
}

interface AiCar {
  id: number;
  d: number;
  off: number;
  lane: -1 | 0 | 1 | 2;
  v: number;
  vt: number;
  look: VehicleLook;
  h: number;
  w: number;
  brake: boolean;
  honk: number;
  hazard: boolean;
  parked: boolean;
  truck?: boolean;
  pullOver?: boolean;
  hitCd: number;
}

interface CrossCar {
  id: number;
  x: number;
  d: number;
  dir: 1 | -1;
  v: number;
  look: VehicleLook;
  hitCd: number;
}

export type Phase = 'count' | 'drive' | 'park' | 'end';
export type SayKind = 'cmd' | 'mark' | 'good' | 'info';

export interface RoadSim {
  t: number; // since start (incl. countdown)
  gt: number; // since GO
  phase: Phase;
  endT: number;
  p: { x: number; d: number; th: number; v: number; delta: number; revHold: number; hitCd: number };
  cars: AiCar[];
  cross: CrossCar[];
  nextId: number;
  spawnT: number;
  oncT: number;
  camD: number;
  anchor: number;
  stop: { st: 'pending' | 'stopped' | 'done'; minV: number; crossSpawned: boolean; waitPraised: boolean };
  light: { s: 'green' | 'yellow' | 'red'; t: number; triggered: boolean; couldStop: boolean; crossSpawned: boolean; judged: boolean; stopT: number };
  ped: { x: number; walking: boolean; done: boolean; judged: boolean; bounce: number };
  lc: number; // 0 none, 1 asked left, 2 asked back right, 3 done
  lcDoneT: number;
  marks: Mark[];
  cd: Record<string, number>;
  acc: Record<string, number>;
  laneNow: number;
  blink: { dir: -1 | 0 | 1; t: number; straightT: number };
  say: { text: string; kind: SayKind; t: number };
  cmd: string;
  hint: string;
  crashed: boolean;
  park: { t: number; still: number; done: boolean; result: string };
  schoolMarked: boolean;
  slowCount: number;
  passed: boolean;
  score: number;
  rand: () => number;
  events: RoadEvent[];
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

const PALETTE = ['#e0503c', '#3caa6a', '#f2b632', '#9a5ad0', '#eeeae0', '#2fb5b0', '#c87a3a', '#5a6a8a', '#ef7fae', '#7a8a3a'];

export function newRoad(seed = Math.floor(Math.random() * 1e9)): RoadSim {
  const rnd = mulberry(seed);
  const g: RoadSim = {
    t: 0,
    gt: 0,
    phase: 'count',
    endT: 0,
    p: { x: roadX(40) + OFF.right, d: 40, th: 0, v: 0, delta: 0, revHold: 0, hitCd: 0 },
    cars: [],
    cross: [],
    nextId: 1,
    spawnT: 0.5,
    oncT: 1,
    camD: 40,
    anchor: 100,
    stop: { st: 'pending', minV: 999, crossSpawned: false, waitPraised: false },
    light: { s: 'green', t: 0, triggered: false, couldStop: true, crossSpawned: false, judged: false, stopT: 0 },
    ped: { x: 0, walking: false, done: false, judged: false, bounce: 0 },
    lc: 0,
    lcDoneT: 0,
    marks: [],
    cd: {},
    acc: {},
    laneNow: 1,
    blink: { dir: 0, t: 0, straightT: 0 },
    say: { text: '', kind: 'info', t: -9 },
    cmd: 'Pull out when you’re ready. Full stop at the stop sign ahead.',
    hint: 'Hold ↑ for gas, ↓ to brake.',
    crashed: false,
    park: { t: 0, still: 0, done: false, result: '' },
    schoolMarked: false,
    slowCount: 0,
    passed: false,
    score: 1,
    rand: rnd,
    events: [],
  };
  g.ped.x = roadX(XW) + 74;
  // parked cars at the end: the space is between REAR_D and BLUE_D
  const parked: [number, string, VehicleLook['kind']][] = [
    [REAR_D - 52, '#3caa6a', 'hatch'],
    [REAR_D, '#a8a8b4', 'sedan'],
    [BLUE_D, '#3f7fd8', 'sedan'],
    [BLUE_D + 50, '#f2b632', 'van'],
  ];
  for (const [d, c, k] of parked) addCar(g, d, 2, 0, { kind: k, body: c }, true);
  return g;
}

function addCar(g: RoadSim, d: number, lane: -1 | 0 | 1 | 2, v: number, look: VehicleLook, parked = false): AiCar {
  const sz = vehicleSize(look.kind);
  const off = lane === -1 ? OFF.onc : lane === 0 ? OFF.left : lane === 1 ? OFF.right : OFF.park;
  const c: AiCar = { id: g.nextId++, d, off, lane, v, vt: v, look, h: sz.h, w: sz.w, brake: false, honk: 0, hazard: false, parked, hitCd: 0 };
  g.cars.push(c);
  return c;
}

// ---------- messages & marks ----------
function say(g: RoadSim, text: string, kind: SayKind): void {
  g.say = { text, kind, t: g.t };
}

export function totalPts(g: RoadSim): number {
  return g.marks.reduce((a, m) => a + m.pts, 0);
}

export function scoreOf(g: RoadSim): number {
  let s = clamp(1 - totalPts(g), 0, 1);
  if (g.crashed) s = Math.min(s, CRASH_CAP);
  return s;
}

const QUOTES: Record<string, string> = {
  crash: 'WHOA! That’s a collision. That’s an automatic fail… let’s finish the route.',
  ped: 'You have to stop for people in the crosswalk!',
  ranStop: 'You blew right through that stop sign!',
  rolling: 'That was a rolling stop. Wheels have to stop completely.',
  pastLine: 'You stopped past the line. Stop behind it.',
  ranRed: 'That light was RED!',
  yellow: 'Yellow means stop if you safely can. You could have.',
  speed: 'Watch your speed.',
  school: 'That’s a school zone! 20 when the lights flash.',
  cutoff: 'You cut that driver off. Leave a bigger gap.',
  unsafe: 'Too close! Make sure there’s room ahead of you, too.',
  signal: 'Signal before you change lanes.',
  weave: 'Pick a lane and stay in it.',
  center: 'You crossed the center line!',
  shoulder: 'You drifted onto the shoulder.',
  follow: 'You’re following too closely. Back off.',
  noChange: 'I asked you to change lanes.',
  stayLeft: 'I asked you to move back to the right.',
  slow: 'You can go a little faster. You’re holding up traffic.',
  curb: 'Ouch, the curb.',
  tap: 'You tapped that parked car!',
  parkFar: 'A bit far from the curb.',
  parkCrooked: 'You’re parked crooked.',
  noPark: 'Okay… we’ll call that one. You didn’t get it in.',
  time: 'We’re out of time.',
};

function mark(g: RoadSim, k: string, label: string, cooldown = 0): boolean {
  if (cooldown && (g.cd[k] ?? -99) > g.t - cooldown) return false;
  g.cd[k] = g.t;
  g.marks.push({ k, label, pts: W(k), t: g.t });
  say(g, QUOTES[k] ?? label, 'mark');
  g.events.push({ e: 'mark', k });
  return true;
}

// events for the renderer / sound (consumed by the shell each frame)
export interface RoadEvent {
  e: 'mark' | 'good' | 'crash' | 'curb' | 'honk' | 'blink' | 'park' | 'end' | 'go';
  k?: string;
}

// ---------- geometry ----------
interface Box {
  x: number;
  d: number;
  hw: number;
  hl: number;
  a: number; // heading, 0 = up (+d), + = clockwise
}

function corners(b: Box): [number, number][] {
  const fx = Math.sin(b.a);
  const fd = Math.cos(b.a);
  const rx = Math.cos(b.a);
  const rd = -Math.sin(b.a);
  const out: [number, number][] = [];
  for (const sf of [1, -1])
    for (const sr of [1, -1]) out.push([b.x + fx * b.hl * sf + rx * b.hw * sr, b.d + fd * b.hl * sf + rd * b.hw * sr]);
  return out;
}

function overlap(a: Box, b: Box): boolean {
  const ca = corners(a);
  const cb = corners(b);
  const axes: [number, number][] = [
    [Math.sin(a.a), Math.cos(a.a)],
    [Math.cos(a.a), -Math.sin(a.a)],
    [Math.sin(b.a), Math.cos(b.a)],
    [Math.cos(b.a), -Math.sin(b.a)],
  ];
  for (const [ax, ad] of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const [x, d] of ca) {
      const p = x * ax + d * ad;
      minA = Math.min(minA, p);
      maxA = Math.max(maxA, p);
    }
    for (const [x, d] of cb) {
      const p = x * ax + d * ad;
      minB = Math.min(minB, p);
      maxB = Math.max(maxB, p);
    }
    if (maxA < minB || maxB < minA) return false;
  }
  return true;
}

export function playerBox(g: RoadSim, grow = 0): Box {
  return { x: g.p.x, d: g.p.d, hw: W_CAR / 2 + grow, hl: L_CAR / 2 + grow, a: g.p.th };
}

function carBox(c: AiCar): Box {
  return { x: roadX(c.d) + c.off, d: c.d, hw: c.w / 2 - 0.5, hl: c.h / 2 - 0.5, a: c.lane === -1 ? Math.PI : 0 };
}

function crossBox(c: CrossCar): Box {
  return { x: c.x, d: c.d, hw: 4, hl: 7.5, a: c.dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
}

// player's lateral extents relative to the yellow line
export function extents(g: RoadSim): { L: number; R: number; off: number; front: number; rear: number } {
  const rx = roadX(g.p.d);
  const cs = corners(playerBox(g));
  let L = Infinity;
  let R = -Infinity;
  let front = -Infinity;
  let rear = Infinity;
  for (const [x, d] of cs) {
    L = Math.min(L, x - rx);
    R = Math.max(R, x - rx);
    front = Math.max(front, d);
    rear = Math.min(rear, d);
  }
  return { L, R, off: g.p.x - rx, front, rear };
}

function laneOf(off: number): number {
  return off < -1 ? -1 : off < DASH ? 0 : off < EDGE ? 1 : 2;
}

function laneSpan(lane: number): [number, number] {
  return lane === -1 ? [-26, -1] : lane === 0 ? [1, DASH] : lane === 1 ? [DASH, EDGE] : [EDGE, CURB];
}

function inIntersection(d: number): boolean {
  return INTERSECTIONS.some((L) => d > L - 2 && d < L + 52);
}

// ---------- step ----------
export interface Controls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  signal: boolean; // just pressed
}

const ACC = 34;
const BRAKE = 90;
const VMAX = 100;
const REV_MAX = 22;
const WHEELBASE = 13;

export function stepRoad(g: RoadSim, c: Controls, dt: number): void {
  g.t += dt;
  if (g.phase === 'count') {
    if (g.t >= 3.6) {
      g.phase = 'drive';
      g.events.push({ e: 'go' });
      say(g, g.cmd, 'cmd');
    }
    stepAi(g, dt);
    camera(g, dt);
    return;
  }
  if (g.phase !== 'end') g.gt += dt;
  const p = g.p;
  const live = g.phase === 'drive' || g.phase === 'park';

  // ---- pedals ----
  if (!live) {
    p.v = Math.abs(p.v) < 2 ? 0 : p.v - Math.sign(p.v) * BRAKE * dt;
  } else if (c.up && !c.down) {
    if (p.v < -0.5) p.v = Math.min(0, p.v + BRAKE * dt);
    else p.v += ACC * (1 - p.v / VMAX) * dt;
    p.revHold = 0;
  } else if (c.down && !c.up) {
    if (p.v > 0.5) {
      p.v = Math.max(0, p.v - BRAKE * dt);
      p.revHold = 0;
    } else if (g.phase === 'park') {
      p.revHold += dt;
      if (p.revHold > 0.2) p.v = Math.max(-REV_MAX, p.v - 26 * dt);
    } else p.v = 0;
  } else {
    const drag = (4 + Math.abs(p.v) * 0.03) * dt;
    p.v = Math.abs(p.v) <= drag ? 0 : p.v - Math.sign(p.v) * drag;
    p.revHold = 0;
  }

  // ---- steering (bicycle model with a gentle self-centering assist) ----
  const s = live ? (c.right ? 1 : 0) - (c.left ? 1 : 0) : 0;
  const av = Math.abs(p.v);
  const dmax = 0.68 * clamp(26 / Math.max(av, 1), 0.4, 1);
  const target = s * dmax;
  p.delta += clamp(target - p.delta, -5 * dt, 5 * dt);
  p.th += ((p.v * Math.tan(p.delta)) / WHEELBASE) * dt;
  if (s === 0) p.th *= Math.exp(-(g.phase === 'park' ? 1.1 : 1.9) * dt * Math.min(1, av / 18));
  p.th = clamp(p.th, -0.85, 0.85);
  p.x += p.v * Math.sin(p.th) * dt;
  p.d += p.v * Math.cos(p.th) * dt;
  p.hitCd = Math.max(0, p.hitCd - dt);

  // ---- turn signal ----
  if (c.signal && live) {
    if (g.blink.dir) g.blink.dir = 0;
    else {
      const want = g.lc === 1 ? -1 : g.lc === 2 || g.phase === 'park' ? 1 : g.laneNow <= 0 ? 1 : -1;
      g.blink.dir = want as -1 | 1;
      g.blink.t = 0;
    }
    g.events.push({ e: 'blink' });
  }
  if (g.blink.dir) {
    g.blink.t += dt;
    g.blink.straightT = Math.abs(p.th) < 0.06 ? g.blink.straightT + dt : 0;
  }

  stepAi(g, dt);
  if (live) rules(g, dt);
  camera(g, dt);

  if (g.phase === 'end') {
    g.endT += dt;
  } else if (g.gt > 120) {
    mark(g, 'time', 'Ran out of time');
    finish(g);
  }
}

function camera(g: RoadSim, dt: number): void {
  const target = g.phase === 'park' || g.phase === 'end' ? 84 : 100;
  g.anchor += (target - g.anchor) * Math.min(1, dt * 2);
  const want = g.p.d;
  g.camD += (want - g.camD) * Math.min(1, dt * 10);
}

function finish(g: RoadSim): void {
  if (g.phase === 'end') return;
  g.phase = 'end';
  g.endT = 0;
  g.blink.dir = 0;
  g.score = scoreOf(g);
  g.passed = g.score >= 0.6;
  g.events.push({ e: 'end' });
  say(
    g,
    g.passed
      ? g.marks.length === 0
        ? 'Perfect. I don’t say that often. You pass!'
        : 'Okay, that’s the test. Congratulations: you passed!'
      : 'That’s the end of the test. I’m sorry, that’s not a pass today.',
    g.passed ? 'good' : 'mark',
  );
}

// ---------- the rules of the road ----------
function rules(g: RoadSim, dt: number): void {
  const p = g.p;
  const ex = extents(g);
  const rx = roadX(p.d);
  const lane = laneOf(ex.off);
  const av = Math.abs(p.v);
  const stopped = av < 2.5;

  // --- lanes ---
  const prevLane = g.laneNow;
  if (lane !== prevLane) {
    g.laneNow = lane;
    onLaneChange(g, prevLane, lane);
  }
  // auto-cancel blinker after the move is done
  if (g.blink.dir && g.blink.t > 1.2 && g.blink.straightT > 0.8 && lane !== -1 && !straddling(ex) && g.phase !== 'park') {
    const goal = g.lc === 1 ? 0 : g.lc === 2 ? 1 : -9;
    if (goal === -9 || lane === goal) g.blink.dir = 0;
  }
  if (g.blink.dir && g.blink.t > 12) g.blink.dir = 0;

  // center line
  if (ex.L < -1.5) acc(g, 'center', dt, 0.3) && mark(g, 'center', 'Crossed the center line', 5);
  else g.acc.center = 0;
  // shoulder
  if (g.phase === 'drive' && ex.R > EDGE + 1.5) acc(g, 'shoulder', dt, 1.0) && mark(g, 'shoulder', 'Drove on the shoulder', 5);
  else g.acc.shoulder = 0;
  // weaving across the dashed line
  if (straddling(ex) && !inIntersection(p.d) && g.phase === 'drive') {
    const allow = g.lc === 1 || g.lc === 2 ? 2.4 : 1.5;
    if (acc(g, 'weave', dt, allow)) {
      mark(g, 'weave', 'Weaving between lanes', 5);
      g.acc.weave = -3;
    }
  } else g.acc.weave = 0;
  // curbs
  if (ex.R > CURB || ex.L < LCURB) {
    const push = ex.R > CURB ? -(ex.R - CURB) - 0.3 : LCURB - ex.L + 0.3;
    p.x += push;
    if (av > 1) {
      p.v *= 0.35;
      if (g.marks.filter((m) => m.k === 'curb').length < 3) mark(g, 'curb', 'Hit the curb', 2);
      g.events.push({ e: 'curb' });
    }
  }

  // --- speed ---
  const lim = limitAt(p.d) * MPH;
  const school = p.d >= SZ0 && p.d < SZ1;
  if (school && !g.schoolMarked && p.v > lim + 7) {
    if (acc(g, 'school', dt, 0.5)) {
      g.schoolMarked = true;
      mark(g, 'school', 'Speeding in a school zone');
    }
  } else if (!school && p.v > lim + 12) {
    if (acc(g, 'speed', dt, 1.3)) {
      // the first time is just a warning
      if (!g.cd.speedWarn) {
        g.cd.speedWarn = g.t;
        g.cd.speed = g.t;
        say(g, `Easy! The limit here is ${limitAt(p.d)}. Ease off the gas.`, 'info');
      } else mark(g, 'speed', 'Speeding', 6);
      g.acc.speed = 0;
    }
  } else {
    g.acc.speed = 0;
    g.acc.school = 0;
  }

  // --- stop sign ---
  const st = g.stop;
  if (st.st === 'pending') {
    if (ex.front > SS - 70 && !st.crossSpawned) {
      st.crossSpawned = true;
      spawnCross(g, SS, 1, -24);
      g.cmd = 'Stop sign. Come to a FULL stop behind the white line.';
      say(g, g.cmd, 'cmd');
    }
    if (ex.front > SS - 50) st.minV = Math.min(st.minV, p.v);
    else if (stopped && ex.front > SS - 130 && g.say.text !== 'Pull up closer to the white line, then stop.') say(g, 'Pull up closer to the white line, then stop.', 'info');
    if (stopped && ex.front > SS - 50 && ex.front <= SS + 12) {
      st.st = 'stopped';
      if (ex.front > SS + 3) mark(g, 'pastLine', 'Stopped past the line');
      else {
        say(g, 'Good, full stop. Now wait for that car.', 'good');
        g.events.push({ e: 'good' });
      }
    } else if (ex.front > SS + 12) {
      st.st = 'done';
      if (st.minV < 16) mark(g, 'rolling', 'Rolling stop');
      else mark(g, 'ranStop', 'Ran the stop sign');
    }
  }
  if (st.st === 'stopped' && ex.rear > SS + 52) {
    st.st = 'done';
    if (g.lc === 0) askLeft(g);
  }
  if (st.st === 'done' && g.lc === 0 && ex.rear > SS + 60) askLeft(g);

  // --- lane change section ---
  const truck = g.cars.find((k) => k.truck);
  if (g.lc === 1) {
    if (truck && !truck.pullOver && truck.d > TL - 330) {
      truck.pullOver = true;
      truck.hazard = true;
      mark(g, 'noChange', 'Didn’t change lanes when asked');
      g.lc = 3;
      setCmdLight(g);
    } else if (lane === 0 && !straddling(ex) && truck && ex.rear > truck.d + truck.h / 2 + 22) {
      g.lc = 2;
      g.lcDoneT = g.t;
      g.cmd = 'Nice pass. Now signal and move back into the RIGHT lane.';
      say(g, g.cmd, 'cmd');
    }
  } else if (g.lc === 2) {
    if (lane === 1 && !straddling(ex)) {
      g.lc = 3;
      say(g, 'Good lane change.', 'good');
      g.events.push({ e: 'good' });
      setCmdLight(g);
    } else if (ex.front > TL - 50) {
      mark(g, 'stayLeft', 'Stayed in the passing lane');
      g.lc = 3;
      setCmdLight(g);
    }
  }
  // following too closely (any lead car in the same lane)
  if (lane === 0 || lane === 1) {
    const lead = leaderOf(g, p.d, lane, 1, -1);
    if (lead && p.v > 20) {
      const gap = lead.d - lead.h / 2 - ex.front;
      if (gap < p.v * 0.32 && gap < 22) {
        if (acc(g, 'follow', dt, 1.0)) mark(g, 'follow', 'Following too closely', 6);
      } else g.acc.follow = 0;
    } else g.acc.follow = 0;
  }

  // --- traffic light ---
  const L = g.light;
  L.t += dt;
  const toLine = TL - ex.front;
  if (!L.triggered && L.s === 'green' && toLine > 0 && toLine < Math.max(60, p.v * 2.2 + 16)) {
    L.triggered = true;
    L.s = 'yellow';
    L.t = 0;
    L.couldStop = toLine - 4 > (p.v * p.v) / (2 * BRAKE) + p.v * 0.25;
  }
  if (L.s === 'yellow' && L.t > 1.7) {
    L.s = 'red';
    L.t = 0;
    L.stopT = 0;
  }
  if (L.s === 'red') {
    if (stopped && toLine >= -6) L.stopT += dt;
    if (L.t > 0.4 && !L.crossSpawned) {
      L.crossSpawned = true;
      spawnCross(g, TL, 1, -30);
      spawnCross(g, TL, -1, VW + 40);
    }
    if ((L.stopT > 1.6 && L.t > 3.2) || L.t > 6) {
      L.s = 'green';
      L.t = 0;
      say(g, 'Green. Go ahead.', 'info');
    }
  }
  if (!L.judged && ex.front > TL + 3) {
    L.judged = true;
    if (L.s === 'red') mark(g, 'ranRed', 'Ran a red light');
    else if (L.s === 'yellow' && L.couldStop) mark(g, 'yellow', 'Rushed a yellow light');
  }
  if (L.judged && ex.rear > TL + 60 && g.cmd.startsWith('Traffic')) {
    g.cmd = 'School zone ahead. 20 mph when the lights flash. Watch for kids.';
    say(g, g.cmd, 'cmd');
  }

  // --- pedestrian ---
  const ped = g.ped;
  const prx = roadX(XW);
  if (!ped.walking && !ped.done && ex.front > XW - 112) {
    ped.walking = true;
    g.cmd = 'Pedestrian! Stop and let them cross.';
    say(g, g.cmd, 'cmd');
  }
  if (ped.walking) {
    ped.x -= 21 * dt;
    ped.bounce += dt;
    if (ped.x < prx - 48) {
      ped.walking = false;
      ped.done = true;
      if (!ped.judged && ex.front < XW + 2) {
        say(g, 'Good. Thank you for waiting.', 'good');
        g.events.push({ e: 'good' });
      }
      g.cmd = 'Keep going. Watch your speed in the school zone.';
    }
  }
  const pedBlocks = pedInRoad(g);
  if (!ped.judged && pedBlocks && ex.front > XW + 2 && ex.rear < XW + 8) {
    ped.judged = true;
    mark(g, 'ped', 'Didn’t yield to a pedestrian');
  }

  // --- too slow (held up traffic) ---
  const waiting =
    g.phase === 'park' ||
    (st.st !== 'done' && ex.front > SS - 80) ||
    (L.s !== 'green' && toLine > -10 && toLine < 140) ||
    pedBlocks ||
    (ped.walking && ex.front < XW + 4) ||
    !!leaderWithin(g, ex.front, lane, 46);
  if (!waiting && av < 22 && g.slowCount < 2) {
    if (acc(g, 'slow', dt, 7)) {
      g.slowCount++;
      mark(g, 'slow', 'Driving too slowly');
      g.acc.slow = 0;
    }
  } else g.acc.slow = 0;

  // --- collisions ---
  collide(g, dt);

  // --- parking ---
  if (g.phase === 'drive' && p.d > PK) {
    g.phase = 'park';
    g.park.t = 0;
    g.cmd = 'Pull over and parallel park behind the blue car.';
    say(g, g.cmd, 'cmd');
  }
  if (g.phase === 'park') parking(g, dt, ex, rx);
}

function setCmdLight(g: RoadSim): void {
  g.cmd = 'Traffic light ahead. Stay alert.';
}

function askLeft(g: RoadSim): void {
  g.lc = 1;
  g.cmd = 'Slow truck ahead. Signal, check your mirror, and change into the LEFT lane when it’s safe.';
  say(g, g.cmd, 'cmd');
  const t = addCar(g, g.p.d + 175, 1, 30, { kind: 'truck', body: '#d8d0c0' });
  t.truck = true;
  t.vt = 30;
}

function straddling(ex: { L: number; R: number }): boolean {
  return ex.L < DASH - 0.5 && ex.R > DASH + 0.5;
}

function acc(g: RoadSim, k: string, dt: number, limit: number): boolean {
  g.acc[k] = (g.acc[k] ?? 0) + dt;
  return g.acc[k] >= limit;
}

function onLaneChange(g: RoadSim, from: number, to: number): void {
  if (inIntersection(g.p.d)) return;
  const dir = Math.sign(to - from);
  const sameDir = (to === 0 || to === 1) && (from === 0 || from === 1);
  const intoPark = g.phase === 'park' && to === 2;
  if (!sameDir && !intoPark) return;
  if (g.blink.dir !== dir) mark(g, 'signal', 'No turn signal', 3);
  if (!sameDir) return;
  const ex = extents(g);
  // the car behind in the new lane
  let behind: AiCar | null = null;
  let ahead: AiCar | null = null;
  for (const k of g.cars) {
    if (k.lane !== to || k.parked) continue;
    if (k.d < g.p.d && (!behind || k.d > behind.d)) behind = k;
    if (k.d >= g.p.d && (!ahead || k.d < ahead.d)) ahead = k;
  }
  if (behind) {
    const gap = ex.rear - (behind.d + behind.h / 2);
    if (gap > -2 && (gap < 12 || (gap < 34 && behind.v - g.p.v > 16))) {
      mark(g, 'cutoff', 'Cut off another driver');
      behind.honk = 1.4;
      behind.v = Math.max(0, behind.v - 20);
      g.events.push({ e: 'honk' });
    }
  }
  if (ahead) {
    const gap = ahead.d - ahead.h / 2 - ex.front;
    if (gap > -2 && gap < 6) mark(g, 'unsafe', 'Unsafe lane change');
  }
}

function pedInRoad(g: RoadSim): boolean {
  const prx = roadX(XW);
  return g.ped.walking && g.ped.x < prx + CURB + 2 && g.ped.x > prx - 6;
}

function leaderOf(g: RoadSim, d: number, lane: number, dir: 1 | -1, skipId: number): AiCar | null {
  let best: AiCar | null = null;
  for (const k of g.cars) {
    if (k.id === skipId || k.lane !== lane || k.parked) continue;
    if (dir > 0 ? k.d > d : k.d < d) if (!best || (dir > 0 ? k.d < best.d : k.d > best.d)) best = k;
  }
  return best;
}

function leaderWithin(g: RoadSim, front: number, lane: number, dist: number): AiCar | null {
  const l = leaderOf(g, g.p.d, lane, 1, -1);
  return l && l.d - l.h / 2 - front < dist ? l : null;
}

function collide(g: RoadSim, dt: number): void {
  const pb = playerBox(g);
  const p = g.p;
  for (const k of g.cars) {
    k.hitCd = Math.max(0, k.hitCd - dt);
    if (k.hitCd > 0) continue;
    const kb = carBox(k);
    if (Math.abs(kb.d - pb.d) > 30) continue;
    if (!overlap(pb, kb)) continue;
    k.hitCd = 1.2;
    const soft = k.parked && Math.abs(p.v) < 26;
    if (soft) {
      if (g.marks.filter((m) => m.k === 'tap').length < 2) mark(g, 'tap', 'Tapped a parked car', 2);
      else say(g, QUOTES.tap, 'mark');
    }
    else crash(g);
    // separate: push the player back the way it came
    const back = Math.sign(p.v) || (pb.d < kb.d ? 1 : -1);
    for (let i = 0; i < 12 && overlap(playerBox(g), kb); i++) {
      p.d -= back * Math.cos(p.th);
      p.x -= back * Math.sin(p.th) * 0.6 + (pb.x < kb.x ? 0.4 : -0.4);
    }
    p.v = 0;
    if (!k.parked) {
      k.v = 0;
      k.hazard = true;
    }
    g.events.push({ e: k.parked && soft ? 'curb' : 'crash' });
  }
  for (const k of g.cross) {
    k.hitCd = Math.max(0, k.hitCd - dt);
    if (k.hitCd > 0 || !overlap(pb, crossBox(k))) continue;
    k.hitCd = 2;
    k.v = 0;
    crash(g);
    p.v = 0;
    for (let i = 0; i < 12 && overlap(playerBox(g), crossBox(k)); i++) p.d -= 1;
    g.events.push({ e: 'crash' });
  }
  if (g.ped.walking) {
    const pb2 = { x: g.ped.x, d: XW + 4, hw: 2.5, hl: 2.5, a: 0 };
    if (overlap(pb, pb2)) {
      g.ped.judged = true;
      crash(g);
      g.ped.x = roadX(XW) - 48; // the kid leaps clear
      g.ped.walking = false;
      g.ped.done = true;
      p.v = 0;
      g.events.push({ e: 'crash' });
    }
  }
}

function crash(g: RoadSim): void {
  g.crashed = true;
  mark(g, 'crash', 'COLLISION (automatic fail)');
}

function parking(g: RoadSim, dt: number, ex: ReturnType<typeof extents>, _rx: number): void {
  const p = g.p;
  const pk = g.park;
  pk.t += dt;
  const blueRear = BLUE_D - 8;
  const rearFront = REAR_D + 8;
  const inSpace = ex.off > 50 && ex.front <= blueRear + 1.5 && ex.rear >= rearFront - 1.5;
  // hints
  if (inSpace) g.hint = Math.abs(p.th) > 0.14 ? 'Straighten out: tap ↑ or ↓ with steering.' : 'Stop and hold still to finish.';
  else if (ex.off > 47) g.hint = 'Get the whole car between the two cars.';
  else if (p.d > BLUE_D + 46) g.hint = 'You went past it. Back up (hold ↓).';
  else if (p.th < -0.22 && p.v < 0) g.hint = 'Now steer LEFT (←) to straighten as you back in.';
  else if (Math.abs(p.d - BLUE_D) < 14 && Math.abs(p.v) < 3) g.hint = 'Back up slowly (hold ↓) and steer RIGHT (→).';
  else if (p.d < BLUE_D - 6 && p.v >= 0) g.hint = 'Signal right. Pull up next to the blue car and stop.';
  else g.hint = 'Back up (↓) and steer into the space.';

  if (inSpace && Math.abs(p.v) < 1.5) pk.still += dt;
  else pk.still = 0;
  if (pk.still > 1.1) {
    const gap = CURB - ex.R;
    if (gap > 5.5 && mark(g, 'parkFar', 'Parked far from the curb') && gap > 9) g.marks[g.marks.length - 1].pts = 0.08;
    if (Math.abs(p.th) > 0.14) mark(g, 'parkCrooked', 'Parked crooked');
    pk.done = true;
    pk.result = gap <= 5.5 && Math.abs(p.th) <= 0.14 ? 'Textbook parallel park!' : 'Parked.';
    g.events.push({ e: 'park' });
    finish(g);
    return;
  }
  if (p.d > BLUE_D + 170) {
    mark(g, 'noPark', 'Drove past the parking spot');
    finish(g);
    return;
  }
  if (pk.t > 32) {
    mark(g, 'noPark', 'Couldn’t finish parking');
    finish(g);
  }
}

// ---------- AI traffic ----------
function spawnCross(g: RoadSim, line: number, dir: 1 | -1, x: number): void {
  const look: VehicleLook = { kind: g.rand() < 0.3 ? 'van' : 'sedan', body: PALETTE[Math.floor(g.rand() * PALETTE.length)] };
  g.cross.push({ id: g.nextId++, x, d: dir > 0 ? line + 17 : line + 35, dir, v: 58, look, hitCd: 0 });
}

function stepAi(g: RoadSim, dt: number): void {
  const p = g.p;
  const live = g.phase === 'drive' || g.phase === 'park';
  // spawn same-direction traffic in the left lane during the lane-change section
  if (live && g.lc >= 1 && g.lc <= 2 && p.d < TL - 260) {
    g.spawnT -= dt;
    if (g.spawnT <= 0) {
      const sd = p.d - 100;
      const clear = !g.cars.some((k) => k.lane === 0 && Math.abs(k.d - sd) < 40);
      if (clear) {
        const v = 66 + g.rand() * 12;
        addCar(g, sd, 0, v, { kind: g.rand() < 0.25 ? 'van' : g.rand() < 0.4 ? 'hatch' : 'sedan', body: PALETTE[Math.floor(g.rand() * PALETTE.length)] });
        g.spawnT = 1.0 + g.rand() * 1.7;
      } else g.spawnT = 0.3;
    }
  }
  // oncoming traffic, only where it can't meet an intersection or the crosswalk
  if (live) {
    g.oncT -= dt;
    if (g.oncT <= 0) {
      const sd = p.d + 180;
      const lo = p.d - 70;
      const blocked = [SS, TL, XW].some((L) => L + 60 > lo && L - 10 < sd) || p.d > PK - 150;
      if (!blocked) addCar(g, sd, -1, 52 + g.rand() * 14, { kind: g.rand() < 0.3 ? 'van' : 'sedan', body: PALETTE[Math.floor(g.rand() * PALETTE.length)] });
      g.oncT = 1.6 + g.rand() * 2.4;
    }
  }

  const pex = extents(g);
  const pLaneLo = pex.L;
  const pLaneHi = pex.R;
  for (const k of g.cars) {
    k.honk = Math.max(0, k.honk - dt);
    if (k.parked) continue;
    const dir = k.lane === -1 ? -1 : 1;
    const front = k.d + (dir * k.h) / 2;
    let stopAt = Infinity; // distance available ahead before the car must stop
    const lead = leaderOf(g, k.d, k.lane, dir as 1 | -1, k.id);
    if (lead) stopAt = Math.min(stopAt, Math.abs(lead.d - k.d) - (lead.h + k.h) / 2 - 7);
    // the player as a leader, if in this lane
    const [lo, hi] = laneSpan(k.lane);
    const pInLane = pLaneHi > lo + 1 && pLaneLo < hi - 1;
    if (pInLane) {
      const ahead = dir > 0 ? pex.rear - front : front - pex.front;
      if (ahead > -4) stopAt = Math.min(stopAt, ahead - 6);
    }
    if (k.pullOver) {
      // drift onto the shoulder and stop
      k.off = Math.min(OFF.park, k.off + 10 * dt);
      if (k.off >= OFF.park - 0.5) k.lane = 2;
      stopAt = Math.min(stopAt, Math.max(0, (k.vt * k.vt) / 120 - 1));
      k.vt = Math.max(0, k.vt - 12 * dt);
    }
    if (dir > 0) {
      // traffic light & crosswalk
      const L = g.light;
      if (L.s === 'red' || (L.s === 'yellow' && TL - front > (k.v * k.v) / 140 + 2)) if (front <= TL + 1) stopAt = Math.min(stopAt, TL - 1 - front);
      if (pedInRoad(g) && front <= XW + 1) stopAt = Math.min(stopAt, XW - 2 - front);
    } else {
      if (g.light.s !== 'green' && front >= TL + 50) stopAt = Math.min(stopAt, front - (TL + 54));
      if (g.ped.walking && front >= XW + 8) stopAt = Math.min(stopAt, front - (XW + 11));
    }
    const vDes = Math.min(k.vt, Math.sqrt(Math.max(0, 2 * 60 * Math.max(0, stopAt))));
    k.brake = vDes < k.v - 2 || k.hazard;
    if (vDes < k.v) k.v = Math.max(vDes, k.v - 160 * dt);
    else k.v = Math.min(vDes, k.v + 36 * dt);
    if (k.hazard && !k.truck && g.t - (g.cd.crash ?? -99) > 2.5) k.hazard = false;
    const prevFront = front;
    k.d += dir * k.v * dt;
    // never rear-end the player
    if (pInLane && dir > 0) {
      const nf = k.d + k.h / 2;
      if (prevFront <= pex.rear && nf > pex.rear - 1) {
        k.d = pex.rear - 1 - k.h / 2;
        k.v = Math.min(k.v, Math.max(0, p.v));
      }
    }
  }
  // despawn
  g.cars = g.cars.filter((k) => k.parked || (k.d < p.d + 300 && k.d > p.d - 170));

  for (const k of g.cross) {
    // brake if the player is in the path
    const pb = playerBox(g);
    const inBand = Math.abs(pb.d - k.d) < 16;
    const ahead = (pb.x - k.x) * k.dir;
    const want = inBand && ahead > -4 && ahead < 50 ? 0 : 58;
    k.v += clamp(want - k.v, -150 * dt, 50 * dt);
    k.x += k.dir * k.v * dt;
  }
  g.cross = g.cross.filter((k) => k.x > -60 && k.x < VW + 60);
}

// ======================= RENDERING =======================
const C = {
  asphalt: '#4a4a56',
  asphalt2: '#55556a',
  asphalt3: '#3e3e4a',
  line: '#e8e4d8',
  yellow: '#f2c84a',
  walk: '#c8c0b0',
  walk2: '#b0a898',
  curb: '#e8e0d0',
  grassA: '#5f9a4a',
  grassB: '#67a352',
};

interface Prop {
  d: number;
  side: -1 | 1;
  kind: 'house' | 'tree' | 'school' | 'dmv' | 'shop' | 'lamp' | 'bush';
  seed: number;
}

let PROPS: Prop[] | null = null;
function props(): Prop[] {
  if (PROPS) return PROPS;
  const out: Prop[] = [];
  out.push({ d: 10, side: 1, kind: 'dmv', seed: 1 });
  out.push({ d: SZ0 + 50, side: -1, kind: 'school', seed: 2 });
  const blocked = (d: number, side: number): boolean =>
    INTERSECTIONS.some((L) => d > L - 30 && d < L + 80) ||
    (side === 1 && d < 120) ||
    (side === -1 && d > SZ0 + 10 && d < SZ0 + 230) ||
    (side === 1 && Math.abs(d - XW) < 24);
  for (const side of [-1, 1] as const) {
    let d = -120;
    let i = 0;
    while (d < BLUE_D + 260) {
      i++;
      const h = hash(i * 31 + (side > 0 ? 7 : 0));
      const kind: Prop['kind'] = h < 0.55 ? 'house' : h < 0.68 ? 'shop' : 'tree';
      const span = kind === 'tree' ? 18 : 40;
      if (!blocked(d, side) && !blocked(d + span, side)) out.push({ d: d + span / 2, side, kind, seed: i * 13 + side });
      if (kind !== 'tree' && hash(i * 5 + 3) < 0.6 && !blocked(d + span + 6, side)) out.push({ d: d + span + 4, side, kind: 'bush', seed: i });
      d += span + 10;
    }
  }
  PROPS = out;
  return out;
}

const ROOFS = ['#b0503c', '#5a6a8a', '#7a5a3a', '#3a7a6a', '#8a4a6a', '#a87a3a'];

function drawProp(x: Ctx, pr: Prop, sy: number, rx: number): void {
  const rnd = (k: number) => hash(pr.seed * 17 + k);
  if (pr.kind === 'tree') {
    const cx = pr.side > 0 ? rx + 88 + rnd(1) * 16 : rx - 60 - rnd(1) * 14;
    // a round, lit canopy of three overlapping clumps, with a soft shadow cast down-right
    softShadow(x, cx + 3, sy + 3.5, 9, 7.5, 0.42, '10,30,12');
    const v = rnd(4);
    sphere(x, cx + 2.5, sy + 1.5, 4.6, '#2f6a32', -0.5, -0.6, 0);
    sphere(x, cx - 2.6, sy + 1, 4.4, v > 0.5 ? '#357a36' : '#2f6e30', -0.5, -0.6, 0);
    sphere(x, cx - 0.3, sy - 1.6, 5.2, v > 0.5 ? '#43913f' : '#3b8a3a', -0.5, -0.6, 0.12);
    return;
  }
  if (pr.kind === 'bush') {
    const cx = pr.side > 0 ? rx + 84 : rx - 56;
    softShadow(x, cx + 1.2, sy + 1.5, 4, 3, 0.4, '10,30,12');
    sphere(x, cx, sy, 3, '#3a7a3a', -0.5, -0.6, 0.1);
    sphere(x, cx - 1, sy - 1, 0.7, '#e05a7a', -0.5, -0.6, 0);
    sphere(x, cx + 1.2, sy + 0.8, 0.7, '#e05a7a', -0.5, -0.6, 0);
    return;
  }
  if (pr.kind === 'lamp') return;
  if (pr.kind === 'dmv') {
    const x0 = rx + 84;
    rect(x, x0, sy - 40, 60, 74, '#a8a8b0');
    rect(x, x0, sy - 40, 60, 2, '#c8c8d0');
    outlineRect(x, x0 - 1, sy - 41, 62, 76, INK);
    for (let i = 0; i < 4; i++) rect(x, x0 + 6 + i * 12, sy - 30, 6, 3, '#6a7a8a');
    rect(x, x0 + 4, sy - 2, 24, 9, '#2a4a8a');
    text(x, 'DMV', x0 + 6, sy, '#ffffff');
    // flag pole
    rect(x, x0 - 4, sy + 10, 1, 1, INK);
    return;
  }
  if (pr.kind === 'school') {
    const x1 = rx - 52;
    const x0 = 0;
    const w = x1 - x0;
    rect(x, x0, sy - 60, w, 150, '#c87a5a');
    rect(x, x0, sy - 60, w, 3, '#e09a7a');
    for (let j = 0; j < 140; j += 10) rect(x, x0, sy - 52 + j, w, 1, '#a85a40');
    outlineRect(x, x0 - 1, sy - 61, w + 2, 152, INK);
    rect(x, x1 - 18, sy - 6, 14, 10, '#e8e0d0');
    text(x, 'SCHOOL', x1 - 25, sy + 30, '#fff3c4');
    // flag
    rect(x, x1 - 6, sy + 50, 1, 12, '#8a8a9a');
    rect(x, x1 - 5, sy + 50, 5, 3, '#e0503c');
    return;
  }
  // house / shop
  const shop = pr.kind === 'shop';
  const w = pr.side > 0 ? 30 : 22;
  const h = shop ? 32 : 26;
  const x0 = pr.side > 0 ? rx + 84 + Math.floor(rnd(2) * 4) : rx - 54 - w - Math.floor(rnd(2) * 3);
  const y0 = sy - h / 2;
  const roof = shop ? '#8a8a96' : ROOFS[Math.floor(rnd(3) * ROOFS.length)];
  // soft drop shadow: a few stacked translucent rects read as a blurred edge
  for (let k = 0; k < 3; k++) rect(x, x0 + 1.5 + k * 0.6, y0 + 2 + k * 0.6, w + 1 - k * 0.6, h + 1 - k * 0.6, 'rgba(10,20,10,0.14)');
  if (shop) {
    rect(x, x0, y0, w, h, roof);
    dither(x, x0 + 2, y0 + 2, w - 4, h - 4, roof, shade(roof, 0.9));
    rect(x, x0 + 3, y0 + 4, 5, 4, '#6a6a76');
    rect(x, x0 + w - 9, y0 + h - 9, 6, 5, '#6a6a76');
    // awning toward the street
    const ax = pr.side > 0 ? x0 - 3 : x0 + w;
    for (let j = 0; j < h; j += 2) rect(x, ax, y0 + j, 3, 1, j % 4 ? '#f2efe6' : '#e0503c');
  } else {
    // gabled roof: ridge runs along d
    const half = Math.floor(w / 2);
    rect(x, x0, y0, half, h, roof);
    rect(x, x0 + half, y0, w - half, h, shade(roof, 0.78));
    for (let j = 1; j < h; j += 3) {
      rect(x, x0, y0 + j, half, 1, shade(roof, 0.9));
      rect(x, x0 + half, y0 + j, w - half, 1, shade(roof, 0.7));
    }
    rect(x, x0 + half - 1, y0, 2, h, shade(roof, 1.2));
    rect(x, x0 + 4, y0 + 4, 3, 4, '#5a4a4a');
  }
  // light across the roof: sun from the top-left, a sheen on the near slope
  const lg = x.createLinearGradient(x0, y0, x0 + w, y0 + h);
  lg.addColorStop(0, 'rgba(255,246,220,0.3)');
  lg.addColorStop(0.5, 'rgba(255,246,220,0)');
  lg.addColorStop(1, 'rgba(20,10,30,0.28)');
  x.fillStyle = lg;
  x.fillRect(x0, y0, w, h);
  if (!shop) {
    const half = Math.floor(w / 2);
    const rg = x.createLinearGradient(x0 + half - 3, 0, x0 + half + 1, 0);
    rg.addColorStop(0, tone(roof, 0.1, 0));
    rg.addColorStop(1, tone(roof, 0.45, 0.7));
    x.fillStyle = rg;
    x.fillRect(x0 + half - 3, y0, 4, h);
  }
  outlineRect(x, x0 - 1, y0 - 1, w + 2, h + 2, INK);
  // walkway to the sidewalk
  const wx0 = pr.side > 0 ? rx + 79 : x0 + w + 1;
  const wx1 = pr.side > 0 ? x0 - 1 : rx - 50;
  if (wx1 > wx0) rect(x, wx0, sy - 2, wx1 - wx0, 4, '#d8cfb8');
}

function zebra(x: Ctx, sy: number, x0: number, x1: number): void {
  for (let i = x0; i < x1; i += 5) rect(x, i, sy, 3, 1, C.line);
}

// ---------- HD ground: a logical-res texture, bilinear-filtered, then lit ----------
let GROUND: HTMLCanvasElement | null = null;
function groundCtx(): Ctx {
  if (!GROUND) {
    GROUND = document.createElement('canvas');
    GROUND.width = VW;
    GROUND.height = VH;
  }
  return GROUND.getContext('2d')!;
}
// Asphalt crown (lighter mid-road, darker gutters), soft curb shadows and a little distance haze.
function shadeRoad(x: Ctx, dOf: (sy: number) => number): void {
  const step = 6;
  for (let sy = -step; sy < VH + step; sy += step) {
    const rx = roadX(dOf(sy + step / 2));
    const g = x.createLinearGradient(rx - 34, 0, rx + 63, 0);
    g.addColorStop(0, 'rgba(10,8,20,0.32)');
    g.addColorStop(0.08, 'rgba(10,8,20,0.08)');
    g.addColorStop(0.45, 'rgba(255,250,240,0.07)');
    g.addColorStop(0.92, 'rgba(10,8,20,0.08)');
    g.addColorStop(1, 'rgba(10,8,20,0.32)');
    x.fillStyle = g;
    x.fillRect(rx - 34, sy, 97, step + 0.5);
    // grass darkens into the shade of the sidewalk edge
    const l = x.createLinearGradient(rx - 56, 0, rx - 50, 0);
    l.addColorStop(0, 'rgba(10,30,10,0)');
    l.addColorStop(1, 'rgba(10,30,10,0.25)');
    x.fillStyle = l;
    x.fillRect(rx - 56, sy, 6, step + 0.5);
    const r = x.createLinearGradient(rx + 79, 0, rx + 85, 0);
    r.addColorStop(0, 'rgba(10,30,10,0.25)');
    r.addColorStop(1, 'rgba(10,30,10,0)');
    x.fillStyle = r;
    x.fillRect(rx + 79, sy, 6, step + 0.5);
  }
  // haze ahead (top of the screen), warm low sun from the top-left
  const hz = x.createLinearGradient(0, 0, 0, VH * 0.35);
  hz.addColorStop(0, 'rgba(214,226,255,0.28)');
  hz.addColorStop(1, 'rgba(214,226,255,0)');
  x.fillStyle = hz;
  x.fillRect(0, 0, VW, VH * 0.35);
  hglow(x, -10, -20, 110, '#fff0c8', 0.18, 0.8);
  grain(x, 0, 0, VW, VH, 0.45, 'fine', 0, dOf(0), 36);
}

export interface DrawOpts {
  reduced: boolean;
  look: VehicleLook;
  braking: boolean;
  fx: Fx;
}

export function drawRoad(x: Ctx, g: RoadSim, o: DrawOpts): void {
  const reduced = o.reduced;
  const camD = g.camD;
  const A = g.anchor;
  const toS = (d: number): number => Math.round(A - (d - camD));
  const dOf = (sy: number): number => camD + A - sy;

  // ---- ground rows ----
  const main = x;
  {
  const x = groundCtx();
  for (let sy = 0; sy < VH; sy++) {
    const d = dOf(sy);
    const di = Math.floor(d);
    const rx = Math.round(roadX(d));
    const inter = INTERSECTIONS.find((L) => d >= L && d < L + 52);
    const relI = inter !== undefined ? d - inter : -1;
    if (inter !== undefined && relI >= 8 && relI < 44) {
      // cross street
      rect(x, 0, sy, VW, 1, C.asphalt);
      if ((relI | 0) === 25 || (relI | 0) === 27) {
        for (let i = 0; i < VW; i++) if ((i < rx - 34 || i > rx + 63) && i % 2 === 0) rect(x, i, sy, 1, 1, C.yellow);
      }
      if ((relI | 0) === 8 || (relI | 0) === 43) {
        rect(x, 0, sy, rx - 34, 1, C.curb);
        rect(x, rx + 63, sy, VW - rx - 63, 1, C.curb);
      }
      const n = hash(di * 7);
      rect(x, Math.floor(n * VW), sy, 1, 1, C.asphalt2);
      rect(x, Math.floor(hash(di * 11) * VW), sy, 1, 1, C.asphalt3);
      continue;
    }
    // lawn (mowed stripes)
    rect(x, 0, sy, VW, 1, Math.floor(d / 7) % 2 ? C.grassA : C.grassB);
    if (hash(di * 3) > 0.7) rect(x, Math.floor(hash(di * 5) * VW), sy, 1, 1, '#4a8a3c');
    // sidewalks + curbs
    const seam = di % 12 === 0;
    rect(x, rx - 50, sy, 14, 1, seam ? C.walk2 : C.walk);
    rect(x, rx + 65, sy, 14, 1, seam ? C.walk2 : C.walk);
    rect(x, rx - 36, sy, 2, 1, C.curb);
    rect(x, rx + 63, sy, 2, 1, C.curb);
    // asphalt
    rect(x, rx - 34, sy, 97, 1, C.asphalt);
    if (hash(di * 13) > 0.4) rect(x, rx - 34 + Math.floor(hash(di * 17) * 97), sy, 1, 1, C.asphalt2);
    if (hash(di * 19) > 0.5) rect(x, rx - 34 + Math.floor(hash(di * 23) * 97), sy, 1, 1, C.asphalt3);
    if (inter !== undefined) {
      // crosswalks on either side of the intersection
      zebra(x, sy, rx - 33, rx + 62);
      rect(x, 0, sy, rx - 50, 1, C.walk);
      rect(x, rx + 79, sy, VW - rx - 79, 1, C.walk);
      continue;
    }
    if (d >= XW && d < XW + 8) {
      zebra(x, sy, rx - 33, rx + 62);
      continue;
    }
    // markings
    rect(x, rx - 26, sy, 1, 1, C.line);
    rect(x, rx - 2, sy, 1, 1, C.yellow);
    rect(x, rx + 1, sy, 1, 1, C.yellow);
    if (((di % 18) + 18) % 18 < 9) rect(x, rx + 24, sy, 1, 1, C.line);
    rect(x, rx + 47, sy, 1, 1, C.line);
    // stop lines
    for (const L of INTERSECTIONS) {
      if (d >= L - 3 && d < L) rect(x, rx + 2, sy, 45, 1, C.line);
      if (d >= L + 52 && d < L + 55) rect(x, rx - 25, sy, 23, 1, C.line);
    }
    if (d >= XW - 3 && d < XW) rect(x, rx + 2, sy, 45, 1, C.line);
    // school zone tint on the shoulder
    if (d >= SZ0 && d < SZ1 && di % 40 < 2) rect(x, rx + 48, sy, 15, 1, '#d8b84a');
  }
  }
  // the ground is a low-res texture: filter it up smoothly, then light it
  softBlit(main, GROUND!, 0, 0, VW, VH);
  shadeRoad(main, dOf);

  // ---- painted words ----
  const paint = (s: string, d: number, off: number): void => {
    const sy = toS(d);
    if (sy < -8 || sy > VH + 8) return;
    const rx = Math.round(roadX(d));
    x.globalAlpha = 0.85;
    text(x, s, rx + off - (s.length * 4 - 1) / 2, sy - 2, C.line);
    x.globalAlpha = 1;
  };
  paint('STOP', SS - 14, OFF.right);
  paint('STOP', SS - 14, OFF.left);
  paint('SLOW', SZ0 + 20, OFF.right);
  paint('SLOW', SZ0 + 20, OFF.left);
  paint('20', SZ0 + 30, OFF.right);
  paint('20', SZ0 + 30, OFF.left);

  // ---- props ----
  for (const pr of props()) {
    const sy = toS(pr.d);
    if (sy < -90 || sy > VH + 90) continue;
    drawProp(x, pr, sy, Math.round(roadX(pr.d)));
  }

  // ---- parking target ----
  if (g.phase === 'park' || g.phase === 'end') {
    const d0 = REAR_D + 9;
    const d1 = BLUE_D - 9;
    const rx = Math.round(roadX((d0 + d1) / 2));
    const y0 = toS(d1);
    const y1 = toS(d0);
    const on = Math.floor(g.t * 3) % 2 === 0 || reduced;
    const col = g.park.done ? '#7ee08a' : on ? '#fff3c4' : '#f2b632';
    for (let yy = y0; yy <= y1; yy += 3) {
      rect(x, rx + 49, yy, 1, 2, col);
      rect(x, rx + 61, yy, 1, 2, col);
    }
    for (let xx = rx + 49; xx <= rx + 61; xx += 3) {
      rect(x, xx, y0, 2, 1, col);
      rect(x, xx, y1, 2, 1, col);
    }
    if (!g.park.done) hglow(x, rx + 55, (y0 + y1) / 2, 14, '#fff3a0', 0.3, 1.4);
  }

  // ---- signs ----
  drawSigns(x, g, toS, reduced);

  // ---- pedestrian & crossing guard ----
  drawPed(x, g, toS);

  // ---- cars ----
  const blinkOn = Math.floor(g.t * 3) % 2 === 0;
  for (const k of g.cars) {
    const sy = toS(k.d);
    if (sy < -30 || sy > VH + 30) continue;
    const kx = roadX(k.d) + k.off;
    drawVehicle(x, k.look, kx, sy, k.lane === -1 ? Math.PI : 0, { brake: k.brake, hazard: k.hazard, blinkOn, blink: k.pullOver ? 1 : 0, hd: true });
    if (k.honk > 0 && blinkOn) outlinedText(x, 'HONK!', kx - 9, sy + 10, '#ffe070');
  }
  for (const k of g.cross) {
    const sy = toS(k.d);
    if (sy < -20 || sy > VH + 20) continue;
    drawVehicle(x, k.look, k.x, sy, k.dir > 0 ? Math.PI / 2 : -Math.PI / 2, { brake: k.v < 50, hd: true });
  }
  // player
  const p = g.p;
  const psy = A - (p.d - camD);
  drawVehicle(x, o.look, p.x, psy, p.th, {
    brake: (p.v > 0.5 && o.braking) || p.v === 0,
    reverse: p.v < -0.5,
    blink: g.blink.dir,
    blinkOn: blinkOn && g.blink.dir !== 0,
    hd: true,
  });
  // blind-spot warnings next to the player's car
  const bs = blindSpots(g);
  if (g.phase === 'drive' || g.phase === 'park') {
    for (const sd of [-1, 1] as const) {
      if (!bs[sd < 0 ? 0 : 1]) continue;
      const bx = p.x + sd * 9;
      const on2 = reduced || blinkOn;
      rect(x, bx - 1, psy - 4, 3, 3, on2 ? '#ff8a1e' : '#a85010');
      outlineRect(x, bx - 2, psy - 5, 5, 5, INK);
    }
  }

  // ---- overhead traffic signals (drawn above cars) ----
  drawLight(x, g, toS, reduced);

  // ---- fx ----
  o.fx.draw(x, (wx, wd) => [wx, toS(wd)]);

  // ---- mirror ----
  if (g.phase !== 'end') drawMirror(x, g, bs);
}

export function blindSpots(g: RoadSim): [boolean, boolean] {
  const lane = g.laneNow;
  const out: [boolean, boolean] = [false, false];
  for (const k of g.cars) {
    if (k.parked || k.lane === -1) continue;
    const rel = k.d - g.p.d;
    if (rel < -46 || rel > 10) continue;
    if (k.lane === lane - 1) out[0] = true;
    if (k.lane === lane + 1) out[1] = true;
  }
  return out;
}

function drawMirror(x: Ctx, g: RoadSim, bs: [boolean, boolean]): void {
  const mx = 12;
  const my = 3;
  const mw = 44;
  const mh = 16;
  rect(x, mx - 2, my - 1, mw + 4, mh + 2, '#2a2430');
  rect(x, mx - 1, my, mw + 2, mh, '#5a5464');
  rect(x, mx, my, mw, mh, '#8aa0b8');
  // lanes behind: map lateral offsets -26..63 into the mirror, distance 0..150 behind -> bottom..top
  const lx = (off: number): number => mx + ((off + 26) / 89) * mw;
  rect(x, lx(-26), my, lx(63) - lx(-26), mh, '#5a5a6a');
  rect(x, lx(0) - 1, my, 1, mh, C.yellow);
  rect(x, lx(DASH), my, 1, mh, '#c8c4b8');
  rect(x, lx(EDGE), my, 1, mh, '#c8c4b8');
  for (const k of g.cars) {
    if (k.parked && g.phase !== 'park') continue;
    const back = g.p.d - k.d;
    if (back < 0 || back > 150) continue;
    const yy = my + mh - 3 - (back / 150) * (mh - 4);
    const near = back < 50;
    rect(x, lx(k.off) - (near ? 2 : 1), yy - (near ? 1 : 0), near ? 4 : 3, near ? 3 : 2, k.look.body);
    rect(x, lx(k.off) - 1, yy - (near ? 1 : 0), 2, 1, '#fff6c0');
  }
  // player marker at the bottom
  rect(x, lx(g.p.x - roadX(g.p.d)) - 2, my + mh - 2, 4, 2, '#ffffff');
  // gloss + frame
  rect(x, mx + 2, my + 1, 10, 1, 'rgba(255,255,255,0.5)');
  outlineRect(x, mx - 3, my - 2, mw + 6, mh + 4, INK);
  // blind-spot lamps on the corners
  const lamp = (lxp: number, on: boolean): void => {
    rect(x, lxp, my + 4, 5, 7, on ? '#ff8a1e' : '#3a3440');
    outlineRect(x, lxp - 1, my + 3, 7, 9, INK);
    if (on) {
      rect(x, lxp + 2, my + 5, 1, 3, INK);
      rect(x, lxp + 2, my + 9, 1, 1, INK);
    }
  };
  lamp(mx - 11, bs[0]);
  lamp(mx + mw + 6, bs[1]);
  outlinedText(x, 'MIRROR', mx + 10, my + mh + 4, '#fff3c4');
}

function signPost(x: Ctx, sx: number, sy: number): void {
  rect(x, sx, sy, 1, 6, '#5a5a66');
  rect(x, sx + 1, sy + 4, 2, 2, 'rgba(0,0,0,0.25)');
}

function drawSigns(x: Ctx, g: RoadSim, toS: (d: number) => number, reduced: boolean): void {
  const at = (d: number, side: 1 | -1): [number, number] => {
    const rx = Math.round(roadX(d));
    return [side > 0 ? rx + 70 : rx - 44, toS(d)];
  };
  // stop sign (octagon)
  {
    const [sx, sy] = at(SS - 6, 1);
    if (sy > -20 && sy < VH + 20) {
      // red octagon with STOP lettering
      const ox = sx - 4;
      const oy = sy - 12;
      signPost(x, sx + 4, sy);
      rect(x, ox + 2, oy - 1, 15, 13, INK);
      rect(x, ox, oy + 1, 19, 9, INK);
      rect(x, ox + 1, oy, 17, 11, INK);
      rect(x, ox + 3, oy, 13, 11, '#e8e4d8');
      rect(x, ox + 1, oy + 2, 17, 7, '#e8e4d8');
      rect(x, ox + 2, oy + 1, 15, 9, '#e8e4d8');
      rect(x, ox + 3, oy + 1, 13, 9, '#c8302a');
      rect(x, ox + 2, oy + 2, 15, 7, '#c8302a');
      text(x, 'STOP', ox + 2, oy + 3, '#ffffff');
    }
  }
  // speed limits
  const limits: [number, string][] = [
    [80, '25'],
    [SS + 70, '35'],
    [TL + 70, '30'],
    [SZ1 + 10, '30'],
    [PK - 30, '15'],
  ];
  for (const [d, n] of limits) {
    const [sx, sy] = at(d, 1);
    if (sy < -20 || sy > VH + 20) continue;
    signPost(x, sx + 4, sy);
    rect(x, sx, sy - 13, 10, 13, '#f2f0ea');
    rect(x, sx + 1, sy - 12, 8, 1, '#8a8a96');
    text(x, n, sx + 2, sy - 7, INK);
    outlineRect(x, sx - 1, sy - 14, 12, 15, INK);
  }
  // school zone sign with flashing beacons
  {
    const [sx, sy] = at(SZ0 - 4, 1);
    if (sy > -30 && sy < VH + 30) {
      signPost(x, sx + 5, sy);
      const on = reduced ? true : Math.floor(g.t * 2.5) % 2 === 0;
      rect(x, sx, sy - 22, 4, 3, on ? '#ffe040' : '#7a6a20');
      rect(x, sx + 7, sy - 22, 4, 3, on ? '#7a6a20' : '#ffe040');
      if (!reduced) hglow(x, on ? sx + 2 : sx + 9, sy - 20.5, 7, '#ffe060', 0.7);
      rect(x, sx, sy - 18, 11, 9, '#e8e040');
      rect(x, sx + 4, sy - 17, 3, 3, INK);
      rect(x, sx + 3, sy - 14, 5, 3, INK);
      rect(x, sx + 1, sy - 9, 9, 7, '#f2f0ea');
      text(x, '20', sx + 2, sy - 8, INK);
      outlineRect(x, sx - 1, sy - 23, 13, 22, INK);
    }
    const [ex, ey] = at(SZ1, 1);
    if (ey > -20 && ey < VH + 20) {
      signPost(x, ex + 4, ey);
      rect(x, ex, ey - 9, 10, 9, '#e8e040');
      text(x, 'END', ex - 1 + 1, ey - 7, INK);
      outlineRect(x, ex - 1, ey - 10, 12, 11, INK);
    }
  }
  // "parking" sign at the end
  {
    const [sx, sy] = at(REAR_D - 30, 1);
    if (sy > -20 && sy < VH + 20) {
      signPost(x, sx + 4, sy);
      rect(x, sx, sy - 11, 10, 11, '#2a5aa8');
      text(x, 'P', sx + 4, sy - 8, '#ffffff');
      outlineRect(x, sx - 1, sy - 12, 12, 13, INK);
    }
  }
}

function drawLight(x: Ctx, g: RoadSim, toS: (d: number) => number, reduced: boolean): void {
  const sy = toS(TL + 6);
  if (sy < -20 || sy > VH + 20) return;
  const rx = Math.round(roadX(TL));
  // mast arm from the right corner
  rect(x, rx + 8, sy - 1, rx + 70 - (rx + 8), 2, '#5a5a66');
  rect(x, rx + 68, sy - 3, 4, 5, '#3a3a44');
  const s = g.light.s;
  for (const lx of [rx + 10, rx + 33]) {
    rect(x, lx, sy - 6, 7, 14, '#1c1c24');
    outlineRect(x, lx - 1, sy - 7, 9, 16, INK);
    const lamps: [string, string, boolean][] = [
      ['#ff4030', '#4a1a18', s === 'red'],
      ['#ffc020', '#4a3a10', s === 'yellow'],
      ['#40e070', '#123a20', s === 'green'],
    ];
    lamps.forEach(([on, off, lit], i) => {
      rect(x, lx + 2, sy - 5 + i * 4, 3, 3, lit ? on : off);
      if (lit) hglow(x, lx + 3.5, sy - 3.5 + i * 4, reduced ? 6 : 9, on, 0.7);
    });
  }
}

function drawPed(x: Ctx, g: RoadSim, toS: (d: number) => number): void {
  const sy = toS(XW + 4);
  if (sy < -20 || sy > VH + 20) return;
  const rx = Math.round(roadX(XW));
  // crossing guard on the right corner
  const gx = rx + 70;
  const gy = sy - 8;
  rect(x, gx - 2, gy - 2, 5, 5, '#ff8a1e');
  rect(x, gx - 1, gy - 1, 3, 3, '#2a1b12');
  if (g.ped.walking) {
    rect(x, gx - 6, gy - 5, 4, 4, '#c8302a');
    rect(x, gx - 4, gy - 1, 1, 3, '#5a5a66');
  }
  // the kid
  const px = Math.round(g.ped.x);
  const bob = g.ped.walking ? Math.floor(g.ped.bounce * 8) % 2 : 0;
  rect(x, px - 2, sy - 2 + bob, 5, 4, '#3f7fd8'); // backpack/shoulders
  rect(x, px - 1, sy - 3 + bob, 3, 3, '#5b3a22'); // hair
  rect(x, px + 2, sy - 1 + bob, 1, 2, '#f2b632');
  outlineRect(x, px - 3, sy - 4 + bob, 7, 7, 'rgba(28,20,36,0.6)');
  if (g.ped.walking) outlinedText(x, '!', px, sy - 12, '#ffe070');
}

export function drawEnd(x: Ctx, g: RoadSim, me: Person, instructor: Person): void {
  if (g.phase !== 'end' || g.endT < 0.6) return;
  const a = Math.min(1, (g.endT - 0.6) * 3);
  x.globalAlpha = a * 0.6;
  rect(x, 0, 40, VW, 58, INK);
  x.globalAlpha = a;
  const hop = g.passed ? Math.abs(Math.sin(g.endT * 6)) * 3 : 0;
  drawPerson(x, me, 14, 56 - hop, Math.floor(g.endT * 4), g.passed, { face: 1 });
  drawPerson(x, instructor, 164, 56, 0, false, { face: -1 });
  if (g.passed) bigText(x, 'PASS!', VW / 2, 60, 4, '#7ee08a');
  else bigText(x, 'FAIL', VW / 2, 60, 4, '#ff7a6a');
  const pts = Math.round(g.score * 100);
  outlinedText(x, `SCORE ${pts}/100`, VW / 2 - 26, 80, '#fff3c4');
  if (g.passed) outlinedText(x, 'LICENSE EARNED', VW / 2 - 28, 89, '#7ee08a');
  x.globalAlpha = 1;
}

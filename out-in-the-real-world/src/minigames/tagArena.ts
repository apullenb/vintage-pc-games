// Laser Tag rules and AI (pure logic, no drawing): arenas, movement, bolts, tags, power-ups, the
// glowing flag, last-one-standing lives, friend AI (seek, strafe, take cover, rush, dodge), standings
// and the 0..1 score.
import type { Person } from '../art/people.ts';
import { angDiff, clamp, clamp01, dist, inBox, pushOut, segHitsBox, type Box, type Rng } from './tagMath.ts';

// ---------- arenas ----------
export const FIELD = { x0: 8, y0: 24, x1: 248, y1: 138 };
export type ObKind = 'wall' | 'pillar' | 'crate';
export interface Ob extends Box {
  kind: ObKind;
  hgt: number; // drawn height (3/4 view)
  c: string; // neon trim colour
}
export interface Arena {
  name: string;
  obs: Ob[];
  spawns: [number, number][]; // spawns[0] is the player's
  flagSpots: [number, number][];
  lamps: { x: number; y: number; c: string }[]; // ceiling spots (drawn + baked into the light map)
  floor: [string, string]; // floor base + grid tint
}

const W = (x: number, y: number, w: number, h: number, c = '#4fd8ff'): Ob => ({ x, y, w, h, kind: 'wall', hgt: 8, c });
const P = (cx: number, cy: number, c = '#ff4fd8'): Ob => ({ x: cx - 5, y: cy - 4, w: 10, h: 8, kind: 'pillar', hgt: 18, c });
const C = (x: number, y: number, w = 13, h = 10, c = '#ffd84f'): Ob => ({ x, y, w, h, kind: 'crate', hgt: 10, c });
const SP: [number, number][] = [
  [128, 132],
  [20, 34],
  [236, 34],
  [20, 130],
  [236, 130],
  [128, 32],
];

export const ARENAS: Arena[] = [
  {
    name: 'NEON GRID',
    obs: [P(60, 52), P(196, 52, '#4fd8ff'), P(60, 110, '#4fd8ff'), P(196, 110), W(108, 78, 40, 7, '#7cf08a'), W(36, 72, 7, 20), W(213, 72, 7, 20), C(96, 42), C(147, 42), C(96, 108), C(147, 108)],
    spawns: SP,
    flagSpots: [
      [128, 60],
      [128, 102],
      [26, 82],
      [230, 82],
      [80, 82],
      [176, 82],
    ],
    lamps: [
      { x: 64, y: 70, c: '#ff4fd8' },
      { x: 192, y: 70, c: '#4fd8ff' },
      { x: 128, y: 112, c: '#7cf08a' },
    ],
    floor: ['#463a78', '#56489a'],
  },
  {
    name: 'ARCADE MAZE',
    obs: [
      W(38, 44, 32, 6, '#ff4fd8'),
      W(38, 44, 6, 26, '#ff4fd8'),
      W(186, 44, 32, 6, '#4fd8ff'),
      W(212, 44, 6, 26, '#4fd8ff'),
      W(38, 112, 32, 6, '#4fd8ff'),
      W(38, 92, 6, 26, '#4fd8ff'),
      W(186, 112, 32, 6, '#ff4fd8'),
      W(212, 92, 6, 26, '#ff4fd8'),
      P(128, 80, '#ffd84f'),
      C(98, 58, 12, 10, '#7cf08a'),
      C(146, 92, 12, 10, '#7cf08a'),
    ],
    spawns: SP,
    flagSpots: [
      [56, 62],
      [200, 100],
      [200, 62],
      [56, 100],
      [128, 56],
      [128, 106],
    ],
    lamps: [
      { x: 56, y: 80, c: '#ff4fd8' },
      { x: 200, y: 80, c: '#4fd8ff' },
      { x: 128, y: 60, c: '#ffd84f' },
    ],
    floor: ['#363e72', '#44508e'],
  },
  {
    name: 'PILLAR GARDEN',
    obs: [P(52, 54), P(100, 54, '#4fd8ff'), P(156, 54), P(204, 54, '#4fd8ff'), P(76, 84, '#ffd84f'), P(128, 84, '#7cf08a'), P(180, 84, '#ffd84f'), P(52, 112, '#4fd8ff'), P(100, 112), P(156, 112, '#4fd8ff'), P(204, 112)],
    spawns: SP,
    flagSpots: [
      [128, 66],
      [128, 104],
      [28, 84],
      [228, 84],
      [76, 66],
      [180, 102],
    ],
    lamps: [
      { x: 76, y: 70, c: '#7cf08a' },
      { x: 180, y: 70, c: '#ff4fd8' },
      { x: 128, y: 120, c: '#4fd8ff' },
    ],
    floor: ['#4a3468', '#5c4282'],
  },
  {
    name: 'CROSSFIRE',
    obs: [W(56, 56, 52, 6, '#ff4fd8'), W(148, 102, 52, 6, '#4fd8ff'), W(150, 32, 6, 28, '#4fd8ff'), W(100, 106, 6, 28, '#ff4fd8'), P(38, 108, '#ffd84f'), P(218, 54, '#ffd84f'), C(121, 76, 14, 10, '#7cf08a')],
    spawns: SP,
    flagSpots: [
      [128, 66],
      [128, 96],
      [80, 86],
      [178, 76],
      [40, 40],
      [216, 122],
    ],
    lamps: [
      { x: 82, y: 76, c: '#ff4fd8' },
      { x: 174, y: 88, c: '#4fd8ff' },
      { x: 128, y: 40, c: '#ffd84f' },
    ],
    floor: ['#343a62', '#44497c'],
  },
];

// ---------- types ----------
export type Mode = 'ffa' | 'flag' | 'lms';
export const MODE_INFO: Record<Mode, { name: string; short: string; time: number; goal: string }> = {
  ffa: { name: 'FREE-FOR-ALL', short: 'Free-for-all', time: 70, goal: 'MOST TAGS WINS' },
  flag: { name: 'GLOW FLAG', short: 'Glow flag', time: 75, goal: 'CARRY THE FLAG TO THE PAD' },
  lms: { name: 'LAST ONE STANDING', short: 'Last one standing', time: 75, goal: '5 HITS AND YOU ARE OUT' },
};
export type PowerKind = 'rapid' | 'shield' | 'speed';
export const POWER_INFO: Record<PowerKind, { label: string; c: string; time: number }> = {
  rapid: { label: 'RAPID FIRE', c: '#ff8a3c', time: 7 },
  shield: { label: 'SHIELD', c: '#4fd8ff', time: 12 },
  speed: { label: 'SPEED', c: '#7cf08a', time: 7 },
};

export interface Crew {
  name: string;
  p: Person;
  color: string;
  skill: number; // 0..1: aim, reactions, dodging
  bold: number; // 0..1: how often they rush
  rival?: number; // extra interest in the player
}

export const DIM_TIME = 2.3;
export const HEAT_SHOT = 0.2; // blaster heat per shot (player)
export const HEAT_COOL = 0.45; // per second
export const HEAT_LOCK = 1.2; // seconds locked out after overheating
export const LIVES = 5;
export const PLAYER_SPEED = 68;
export const AI_SPEED = 52;
export const PLAYER_BOLT = 260;
export const AI_BOLT = 138;
export const RADIUS = 4;

export interface Agent {
  id: number;
  name: string;
  p: Person;
  color: string;
  me: boolean;
  skill: number;
  bold: number;
  rival: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aim: number;
  runPh: number;
  cd: number;
  dim: number;
  prot: number; // spawn protection after the vest comes back
  shield: number;
  rapid: number;
  speed: number;
  tags: number;
  tagged: number;
  caps: number;
  lives: number;
  out: boolean;
  outAt: number;
  streak: number;
  heat: number;
  hot: number; // overheated lockout
  muzzle: number;
  recoil: number;
  flash: number;
  // AI
  tgt: number;
  tgtT: number;
  mode: 'seek' | 'strafe' | 'cover' | 'rush' | 'hold' | 'grab' | 'flee';
  goalK: 'tgt' | 'flag' | 'pad' | 'pt';
  modeT: number;
  gx: number;
  gy: number;
  navT: number;
  wx: number;
  wy: number;
  side: number;
  seen: number;
  dodgeT: number;
  dodgeX: number;
  dodgeY: number;
  stuckT: number;
  lx: number;
  ly: number;
}
export interface Bolt {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  life: number;
  c: string;
  dodged: number[];
}
export interface Power {
  kind: PowerKind;
  x: number;
  y: number;
  t: number;
}
export type Ev =
  | { k: 'fire'; a: number; x: number; y: number; ang: number }
  | { k: 'tag'; by: number; on: number; x: number; y: number }
  | { k: 'block'; by: number; on: number; x: number; y: number }
  | { k: 'spark'; x: number; y: number; c: string; ang: number }
  | { k: 'power'; a: number; kind: PowerKind; x: number; y: number }
  | { k: 'powerSpawn'; x: number; y: number }
  | { k: 'grab'; a: number }
  | { k: 'drop'; a: number }
  | { k: 'capture'; a: number; x: number; y: number }
  | { k: 'out'; a: number }
  | { k: 'back'; a: number }
  | { k: 'overheat'; a: number };

export interface Match {
  arena: Arena;
  mode: Mode;
  agents: Agent[];
  bolts: Bolt[];
  powers: Power[];
  flag: { x: number; y: number; carrier: number; cool: number; hidden: number; spot: number };
  pad: { x: number; y: number; spot: number };
  nav: [number, number][];
  time: number;
  left: number;
  powT: number;
  over: boolean;
  ev: Ev[];
  rng: Rng;
  nextId: number;
}

export interface PlayerInput {
  mx: number; // movement, -1..1
  my: number;
  aim: number; // radians
  fire: boolean;
}

// ---------- setup ----------
function navPoints(obs: Ob[]): [number, number][] {
  const pts: [number, number][] = [];
  const free = (x: number, y: number): boolean => x > FIELD.x0 + 5 && x < FIELD.x1 - 5 && y > FIELD.y0 + 5 && y < FIELD.y1 - 5 && !obs.some((o) => inBox(o, x, y, RADIUS + 2));
  for (const o of obs) {
    const m = 8;
    for (const [x, y] of [
      [o.x - m, o.y - m],
      [o.x + o.w + m, o.y - m],
      [o.x - m, o.y + o.h + m],
      [o.x + o.w + m, o.y + o.h + m],
    ] as [number, number][])
      if (free(x, y)) pts.push([x, y]);
  }
  for (let y = FIELD.y0 + 14; y < FIELD.y1 - 6; y += 28) for (let x = FIELD.x0 + 16; x < FIELD.x1 - 6; x += 32) if (free(x, y)) pts.push([x, y]);
  return pts;
}

export function freeSpot(arena: Arena, x: number, y: number, pad = RADIUS + 1): boolean {
  return x >= FIELD.x0 + pad && x <= FIELD.x1 - pad && y >= FIELD.y0 + pad && y <= FIELD.y1 - pad && !arena.obs.some((o) => inBox(o, x, y, pad));
}

export function newMatch(arena: Arena, mode: Mode, me: { name: string; p: Person; color: string }, crew: Crew[], rng: Rng): Match {
  const mk = (i: number, c: { name: string; p: Person; color: string }, ai?: Crew): Agent => {
    const [x, y] = arena.spawns[i % arena.spawns.length];
    return {
      id: i,
      name: c.name,
      p: c.p,
      color: c.color,
      me: !ai,
      skill: ai?.skill ?? 1,
      bold: ai?.bold ?? 0.5,
      rival: ai?.rival ?? 0,
      x,
      y,
      vx: 0,
      vy: 0,
      aim: y > 80 ? -Math.PI / 2 : Math.PI / 2,
      runPh: rng() * 4,
      cd: ai ? 1 + rng() : 0,
      dim: 0,
      prot: 0,
      shield: 0,
      rapid: 0,
      speed: 0,
      tags: 0,
      tagged: 0,
      caps: 0,
      lives: LIVES,
      out: false,
      outAt: 0,
      streak: 0,
      heat: 0,
      hot: 0,
      muzzle: 0,
      recoil: 0,
      flash: 0,
      tgt: -1,
      tgtT: 0,
      mode: 'seek',
      goalK: 'tgt',
      modeT: 0,
      gx: x,
      gy: y,
      navT: 0,
      wx: x,
      wy: y,
      side: rng() < 0.5 ? -1 : 1,
      seen: 0,
      dodgeT: 0,
      dodgeX: 0,
      dodgeY: 0,
      stuckT: 0,
      lx: x,
      ly: y,
    };
  };
  const agents = [mk(0, me), ...crew.map((c, i) => mk(i + 1, c, c))];
  const fs = Math.floor(rng() * arena.flagSpots.length);
  const ps = (fs + 1 + Math.floor(rng() * (arena.flagSpots.length - 1))) % arena.flagSpots.length;
  return {
    arena,
    mode,
    agents,
    bolts: [],
    powers: [],
    flag: { x: arena.flagSpots[fs][0], y: arena.flagSpots[fs][1], carrier: -1, cool: 0, hidden: 0, spot: fs },
    pad: { x: arena.flagSpots[ps][0], y: arena.flagSpots[ps][1], spot: ps },
    nav: navPoints(arena.obs),
    time: 0,
    left: MODE_INFO[mode].time,
    powT: 5,
    over: false,
    ev: [],
    rng,
    nextId: 1,
  };
}

// ---------- geometry ----------
export function los(m: Match, ax: number, ay: number, bx: number, by: number, pad = 1): boolean {
  for (const o of m.arena.obs) if (segHitsBox(ax, ay, bx, by, o, pad)) return false;
  return true;
}
// A path wide enough for a body.
function clearPath(m: Match, ax: number, ay: number, bx: number, by: number): boolean {
  return los(m, ax, ay, bx, by, RADIUS + 1);
}

function moveBody(m: Match, a: Agent, dt: number): void {
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  for (const o of m.arena.obs) [a.x, a.y] = pushOut(a.x, a.y, RADIUS, o);
  a.x = clamp(a.x, FIELD.x0 + RADIUS, FIELD.x1 - RADIUS);
  a.y = clamp(a.y, FIELD.y0 + RADIUS, FIELD.y1 - RADIUS);
}

const live = (a: Agent): boolean => !a.out;
const taggable = (a: Agent): boolean => !a.out && a.dim <= 0 && a.prot <= 0;

export function fire(m: Match, a: Agent, ang: number): void {
  const sp = a.me ? PLAYER_BOLT : AI_BOLT * (a.rapid > 0 ? 1.15 : 1);
  const x = a.x + Math.cos(ang) * 7;
  const y = a.y - 1 + Math.sin(ang) * 5;
  m.bolts.push({ id: m.nextId++, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, owner: a.id, life: 1.6, c: a.color, dodged: [] });
  a.muzzle = 0.07;
  a.recoil = 1;
  a.aim = ang;
  m.ev.push({ k: 'fire', a: a.id, x, y, ang });
}

function tag(m: Match, by: Agent, on: Agent, x: number, y: number): void {
  if (on.shield > 0) {
    on.shield = 0;
    on.prot = 0.5;
    m.ev.push({ k: 'block', by: by.id, on: on.id, x, y });
    return;
  }
  by.tags++;
  by.streak++;
  on.tagged++;
  on.streak = 0;
  on.dim = DIM_TIME;
  on.flash = 0.14;
  on.rapid = 0;
  on.speed = 0;
  m.ev.push({ k: 'tag', by: by.id, on: on.id, x, y });
  if (m.flag.carrier === on.id) {
    m.flag.carrier = -1;
    m.flag.x = clamp(on.x, FIELD.x0 + 6, FIELD.x1 - 6);
    m.flag.y = clamp(on.y, FIELD.y0 + 6, FIELD.y1 - 6);
    m.flag.cool = 0.8;
    m.ev.push({ k: 'drop', a: on.id });
  }
  if (m.mode === 'lms') {
    on.lives--;
    if (on.lives <= 0) {
      on.out = true;
      on.outAt = m.time;
      on.dim = 0;
      m.ev.push({ k: 'out', a: on.id });
    }
  }
}

function randomFree(m: Match, away: Agent[], tries = 30): [number, number] {
  let best: [number, number] = [128, 80];
  let bestD = -1;
  for (let i = 0; i < tries; i++) {
    const x = FIELD.x0 + 14 + m.rng() * (FIELD.x1 - FIELD.x0 - 28);
    const y = FIELD.y0 + 12 + m.rng() * (FIELD.y1 - FIELD.y0 - 24);
    if (!freeSpot(m.arena, x, y, 8)) continue;
    const d = Math.min(999, ...away.map((a) => dist(a.x, a.y, x, y)));
    if (d > bestD) {
      bestD = d;
      best = [x, y];
    }
    if (d > 60) break;
  }
  return best;
}

// ---------- the step ----------
export function stepMatch(m: Match, dt: number, inp: PlayerInput | null): void {
  if (m.over) return;
  m.time += dt;
  m.left = Math.max(0, m.left - dt);
  for (const a of m.agents) {
    if (a.out) continue;
    a.cd -= dt;
    a.muzzle = Math.max(0, a.muzzle - dt);
    a.recoil = Math.max(0, a.recoil - dt * 8);
    a.flash = Math.max(0, a.flash - dt);
    a.prot = Math.max(0, a.prot - dt);
    a.shield = Math.max(0, a.shield - dt);
    a.rapid = Math.max(0, a.rapid - dt);
    a.speed = Math.max(0, a.speed - dt);
    a.heat = Math.max(0, a.heat - HEAT_COOL * dt);
    a.hot = Math.max(0, a.hot - dt);
    if (a.dim > 0) {
      a.dim -= dt;
      if (a.dim <= 0) {
        a.dim = 0;
        a.prot = 0.6;
        m.ev.push({ k: 'back', a: a.id });
      }
    }
  }
  const me = m.agents[0];
  if (inp && !me.out) stepPlayer(m, me, dt, inp);
  for (const a of m.agents) if (!a.me && !a.out) stepAI(m, a, dt);
  // soft separation between bodies
  for (let i = 0; i < m.agents.length; i++)
    for (let j = i + 1; j < m.agents.length; j++) {
      const a = m.agents[i];
      const b = m.agents[j];
      if (a.out || b.out) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d > 0.01 && d < RADIUS * 2) {
        const push = (RADIUS * 2 - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  stepBolts(m, dt);
  stepPowers(m, dt);
  if (m.mode === 'flag') stepFlag(m, dt);
  // end conditions
  if (m.left <= 0) m.over = true;
  if (m.mode === 'lms') {
    const alive = m.agents.filter(live).length;
    if (alive <= 1 || me.out) m.over = true;
  }
}

function stepPlayer(m: Match, a: Agent, dt: number, inp: PlayerInput): void {
  let mx = inp.mx;
  let my = inp.my;
  const l = Math.hypot(mx, my);
  if (l > 1) {
    mx /= l;
    my /= l;
  }
  const top = PLAYER_SPEED * (a.speed > 0 ? 1.45 : 1) * (a.dim > 0 ? 0.8 : 1) * (m.flag.carrier === a.id ? 0.9 : 1);
  const k = Math.min(1, dt * (l > 0.05 ? 16 : 12)); // slight acceleration, quick stop
  a.vx += (mx * top - a.vx) * k;
  a.vy += (my * top - a.vy) * k;
  moveBody(m, a, dt);
  a.runPh += Math.hypot(a.vx, a.vy) * dt * 0.16;
  a.aim = inp.aim;
  if (inp.fire && a.dim <= 0 && a.cd <= 0 && a.hot <= 0) {
    fire(m, a, inp.aim);
    a.cd = a.rapid > 0 ? 0.1 : 0.22;
    if (a.rapid <= 0) {
      a.heat += HEAT_SHOT;
      if (a.heat >= 1) {
        a.heat = 1;
        a.hot = HEAT_LOCK;
        m.ev.push({ k: 'overheat', a: a.id });
      }
    }
  }
}

function retarget(m: Match, a: Agent): void {
  let best = -1;
  let bestS = 1e9;
  for (const o of m.agents) {
    if (o === a || o.out) continue;
    let s = dist(a.x, a.y, o.x, o.y);
    if (!los(m, a.x, a.y - 1, o.x, o.y - 1)) s += 60;
    if (o.dim > 0) s += 220;
    if (o.me) s -= (45 + 40 * a.rival) * (m.mode === 'lms' ? 0.7 : 1);
    if (m.mode === 'flag' && m.flag.carrier === o.id) s -= 120;
    s += m.rng() * 40;
    if (s < bestS) {
      bestS = s;
      best = o.id;
    }
  }
  if (best !== a.tgt) a.seen = 0;
  a.tgt = best;
  a.tgtT = 1.2 + m.rng() * 1.2;
}

function coverPoint(m: Match, a: Agent, t: Agent): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = 1e9;
  for (const [x, y] of m.nav) {
    const d = dist(a.x, a.y, x, y);
    if (d > 70 || d < 6) continue;
    if (los(m, t.x, t.y - 1, x, y - 1)) continue;
    if (d < bestD) {
      bestD = d;
      best = [x, y];
    }
  }
  return best;
}

function route(m: Match, a: Agent, gx: number, gy: number): [number, number] {
  if (clearPath(m, a.x, a.y, gx, gy)) return [gx, gy];
  let best: [number, number] | null = null;
  let bestC = 1e9;
  for (const [x, y] of m.nav) {
    if (dist(a.x, a.y, x, y) < 4) continue;
    if (!clearPath(m, a.x, a.y, x, y)) continue;
    const c = dist(a.x, a.y, x, y) + dist(x, y, gx, gy) + (clearPath(m, x, y, gx, gy) ? 0 : 70);
    if (c < bestC) {
      bestC = c;
      best = [x, y];
    }
  }
  return best ?? [gx, gy];
}

function stepAI(m: Match, a: Agent, dt: number): void {
  a.tgtT -= dt;
  a.modeT -= dt;
  a.navT -= dt;
  a.dodgeT -= dt;
  if (a.tgt < 0 || a.tgtT <= 0 || m.agents[a.tgt]?.out || (m.agents[a.tgt]?.dim ?? 0) > 0) retarget(m, a);
  const t = a.tgt >= 0 ? m.agents[a.tgt] : null;
  const f = m.flag;
  const carrying = f.carrier === a.id;
  const see = !!t && los(m, a.x, a.y - 1, t.x, t.y - 1);

  // pick a plan
  if (a.dim > 0) {
    if (a.mode !== 'flee') {
      a.mode = 'flee';
      const [x, y] = randomFree(m, m.agents.filter((o) => o !== a && !o.out), 8);
      a.gx = x;
      a.gy = y;
      a.navT = 0;
    }
  } else if (a.modeT <= 0 || a.mode === 'flee') {
    a.modeT = 0.7 + m.rng() * 1.3;
    const r = m.rng();
    const near = m.powers.find((p) => dist(a.x, a.y, p.x, p.y) < 70 && los(m, a.x, a.y, p.x, p.y));
    if (m.mode === 'flag' && carrying) {
      a.mode = 'seek';
      a.goalK = 'pad';
      a.gx = m.pad.x;
      a.gy = m.pad.y;
    } else if (m.mode === 'flag' && f.carrier < 0 && f.hidden <= 0 && closestToFlag(m, a) < 2 && r < 0.75) {
      a.mode = 'seek';
      a.goalK = 'flag';
      a.gx = f.x;
      a.gy = f.y;
    } else if (near && r < 0.6) {
      a.mode = 'grab';
      a.gx = near.x;
      a.gy = near.y;
    } else if (!t) {
      a.mode = 'hold';
    } else if (!see) {
      a.mode = 'seek';
      a.goalK = 'tgt';
      a.gx = t.x;
      a.gy = t.y;
    } else if (r < 0.06 + a.bold * 0.18) {
      a.mode = 'rush';
      a.modeT = 0.9 + m.rng() * 0.8;
    } else if (r < 0.42 && a.bold < 0.7) {
      const cp = coverPoint(m, a, t);
      if (cp) {
        a.mode = 'cover';
        a.gx = cp[0];
        a.gy = cp[1];
        a.modeT = 1.4 + m.rng();
      } else a.mode = 'strafe';
    } else if (r < 0.88) {
      a.mode = 'strafe';
      if (m.rng() < 0.4) a.side = -a.side;
    } else a.mode = 'hold';
    a.navT = 0;
  }
  // keep chasing moving goals
  if (a.mode === 'seek') {
    if (a.goalK === 'pad') [a.gx, a.gy] = [m.pad.x, m.pad.y];
    else if (a.goalK === 'flag') {
      if (f.carrier >= 0 || f.hidden > 0) a.modeT = 0;
      else [a.gx, a.gy] = [f.x, f.y];
    } else if (a.goalK === 'tgt' && t) [a.gx, a.gy] = [t.x, t.y];
  }

  // desired direction
  let dx = 0;
  let dy = 0;
  const toGoal = (): void => {
    if (a.navT <= 0) {
      [a.wx, a.wy] = route(m, a, a.gx, a.gy);
      a.navT = 0.3;
    }
    const d = dist(a.x, a.y, a.wx, a.wy);
    if (d > 2) {
      dx = (a.wx - a.x) / d;
      dy = (a.wy - a.y) / d;
    }
  };
  if (a.mode === 'flee' || a.mode === 'seek' || a.mode === 'grab' || a.mode === 'cover') {
    toGoal();
    if (a.mode === 'cover' && dist(a.x, a.y, a.gx, a.gy) < 4) {
      dx = 0;
      dy = 0;
    }
  } else if (t && (a.mode === 'strafe' || a.mode === 'rush')) {
    const d = Math.max(1, dist(a.x, a.y, t.x, t.y));
    const ux = (t.x - a.x) / d;
    const uy = (t.y - a.y) / d;
    if (a.mode === 'rush') {
      dx = ux;
      dy = uy;
      if (d < 26) {
        dx = -uy * a.side;
        dy = ux * a.side;
      }
    } else {
      const radial = clamp((d - 72) / 40, -1, 1);
      dx = -uy * a.side + ux * radial;
      dy = ux * a.side + uy * radial;
    }
  }
  // dodge incoming bolts
  if (a.dodgeT <= 0) {
    for (const b of m.bolts) {
      if (b.owner === a.id || b.dodged.includes(a.id)) continue;
      const rx = a.x - b.x;
      const ry = a.y - 1 - b.y;
      const v2 = b.vx * b.vx + b.vy * b.vy;
      const tca = (rx * b.vx + ry * b.vy) / v2;
      if (tca < 0 || tca > 0.5) continue;
      const missX = rx - b.vx * tca;
      const missY = ry - b.vy * tca;
      if (Math.hypot(missX, missY) > 8) continue;
      b.dodged.push(a.id);
      if (m.rng() > 0.15 + a.skill * 0.4) continue;
      const v = Math.sqrt(v2);
      let px = -b.vy / v;
      let py = b.vx / v;
      if (px * missX + py * missY < 0) {
        px = -px;
        py = -py;
      }
      a.dodgeX = px;
      a.dodgeY = py;
      a.dodgeT = 0.28;
      break;
    }
  }
  if (a.dodgeT > 0) {
    dx = a.dodgeX;
    dy = a.dodgeY;
  }
  // separation
  for (const o of m.agents) {
    if (o === a || o.out) continue;
    const d = dist(a.x, a.y, o.x, o.y);
    if (d < 16 && d > 0.01) {
      dx += ((a.x - o.x) / d) * 0.6;
      dy += ((a.y - o.y) / d) * 0.6;
    }
  }
  const l = Math.hypot(dx, dy);
  if (l > 1) {
    dx /= l;
    dy /= l;
  }
  const top = AI_SPEED * (a.speed > 0 ? 1.4 : 1) * (a.dim > 0 ? 0.8 : 1) * (carrying ? 0.88 : 1) * (a.mode === 'rush' ? 1.15 : 1) * (a.dodgeT > 0 ? 1.25 : 1);
  const k = Math.min(1, dt * 9);
  a.vx += (dx * top - a.vx) * k;
  a.vy += (dy * top - a.vy) * k;
  moveBody(m, a, dt);
  a.runPh += Math.hypot(a.vx, a.vy) * dt * 0.16;
  // stuck? take a different route
  a.stuckT += dt;
  if (a.stuckT > 0.7) {
    if (l > 0.3 && dist(a.x, a.y, a.lx, a.ly) < 3) {
      a.side = -a.side;
      const [x, y] = randomFree(m, [a], 6);
      a.mode = 'seek';
      a.goalK = 'pt';
      a.gx = x;
      a.gy = y;
      a.modeT = 1;
      a.navT = 0;
    }
    a.stuckT = 0;
    a.lx = a.x;
    a.ly = a.y;
  }

  // aim and shoot
  if (t && a.dim <= 0) {
    if (see) a.seen += dt;
    else a.seen = 0;
    const d = dist(a.x, a.y, t.x, t.y);
    const lead = (d / AI_BOLT) * (0.7 + a.skill * 0.3);
    const px = t.x + t.vx * lead;
    const py = t.y + t.vy * lead;
    const want = Math.atan2(py - a.y, px - a.x);
    if (see) a.aim += clamp(angDiff(a.aim, want), -dt * 9, dt * 9);
    else if (Math.hypot(a.vx, a.vy) > 10) a.aim += clamp(angDiff(a.aim, Math.atan2(a.vy, a.vx)), -dt * 6, dt * 6);
    const react = 0.6 - a.skill * 0.3;
    if (see && a.seen > react && a.cd <= 0 && taggable(t) && d < 170) {
      const err = (0.17 - a.skill * 0.12) * (m.rng() * 2 - 1);
      fire(m, a, want + err);
      const base = (0.6 + m.rng() * 0.4) / (0.7 + a.skill * 0.5);
      a.cd = base * (a.rapid > 0 ? 0.4 : 1) * (a.mode === 'rush' ? 0.7 : 1);
    }
  } else if (Math.hypot(a.vx, a.vy) > 10) a.aim += clamp(angDiff(a.aim, Math.atan2(a.vy, a.vx)), -dt * 6, dt * 6);
}

function closestToFlag(m: Match, a: Agent): number {
  const d = dist(a.x, a.y, m.flag.x, m.flag.y);
  return m.agents.filter((o) => o !== a && !o.out && !o.me && dist(o.x, o.y, m.flag.x, m.flag.y) < d).length;
}

function stepBolts(m: Match, dt: number): void {
  const keep: Bolt[] = [];
  for (const b of m.bolts) {
    b.life -= dt;
    const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 3));
    let dead = b.life <= 0;
    for (let s = 0; s < steps && !dead; s++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      const ang = Math.atan2(b.vy, b.vx);
      if (b.x < FIELD.x0 || b.x > FIELD.x1 || b.y < FIELD.y0 - 4 || b.y > FIELD.y1) {
        m.ev.push({ k: 'spark', x: clamp(b.x, FIELD.x0, FIELD.x1), y: clamp(b.y, FIELD.y0 - 4, FIELD.y1), c: b.c, ang: ang + Math.PI });
        dead = true;
        break;
      }
      for (const o of m.arena.obs)
        if (inBox(o, b.x, b.y)) {
          m.ev.push({ k: 'spark', x: b.x, y: b.y, c: b.c, ang: ang + Math.PI });
          dead = true;
          break;
        }
      if (dead) break;
      for (const a of m.agents) {
        if (a.id === b.owner || !taggable(a)) continue;
        if (dist(a.x, a.y - 1, b.x, b.y) < 5.5) {
          tag(m, m.agents[b.owner], a, b.x, b.y);
          dead = true;
          break;
        }
      }
    }
    if (!dead) keep.push(b);
  }
  m.bolts = keep;
}

function stepPowers(m: Match, dt: number): void {
  m.powT -= dt;
  if (m.powT <= 0) {
    m.powT = 8 + m.rng() * 4;
    if (m.powers.length < 2) {
      const kinds: PowerKind[] = ['rapid', 'shield', 'speed'];
      const kind = kinds[Math.floor(m.rng() * 3)];
      const [x, y] = randomFree(m, m.agents.filter(live));
      m.powers.push({ kind, x, y, t: 0 });
      m.ev.push({ k: 'powerSpawn', x, y });
    }
  }
  for (const p of m.powers) p.t += dt;
  m.powers = m.powers.filter((p) => {
    for (const a of m.agents) {
      if (a.out || a.dim > 0 || dist(a.x, a.y, p.x, p.y) > 9) continue;
      if (p.kind === 'shield') a.shield = POWER_INFO.shield.time;
      else if (p.kind === 'rapid') a.rapid = POWER_INFO.rapid.time;
      else a.speed = POWER_INFO.speed.time;
      m.ev.push({ k: 'power', a: a.id, kind: p.kind, x: p.x, y: p.y });
      return false;
    }
    return p.t < 16;
  });
}

function stepFlag(m: Match, dt: number): void {
  const f = m.flag;
  f.cool = Math.max(0, f.cool - dt);
  if (f.hidden > 0) {
    f.hidden -= dt;
    if (f.hidden <= 0) {
      // new flag and pad spots
      const n = m.arena.flagSpots.length;
      f.spot = (f.spot + 1 + Math.floor(m.rng() * (n - 1))) % n;
      [f.x, f.y] = m.arena.flagSpots[f.spot];
      let ps = Math.floor(m.rng() * n);
      if (ps === f.spot) ps = (ps + 1) % n;
      m.pad.spot = ps;
      [m.pad.x, m.pad.y] = m.arena.flagSpots[ps];
    }
    return;
  }
  if (f.carrier >= 0) {
    const c = m.agents[f.carrier];
    f.x = c.x;
    f.y = c.y;
    if (dist(c.x, c.y, m.pad.x, m.pad.y) < 10) {
      c.caps++;
      f.carrier = -1;
      f.hidden = 1.6;
      m.ev.push({ k: 'capture', a: c.id, x: m.pad.x, y: m.pad.y });
    }
    return;
  }
  if (f.cool > 0) return;
  for (const a of m.agents) {
    if (a.out || a.dim > 0 || dist(a.x, a.y, f.x, f.y) > 8) continue;
    f.carrier = a.id;
    m.ev.push({ k: 'grab', a: a.id });
    break;
  }
}

// ---------- results ----------
export const points = (m: Match, a: Agent): number => a.tags + (m.mode === 'flag' ? a.caps * 3 : 0);

export function standings(m: Match): Agent[] {
  const arr = [...m.agents];
  if (m.mode === 'lms') {
    return arr.sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1;
      if (a.out && b.out) return b.outAt - a.outAt;
      return b.lives - a.lives || b.tags - a.tags || (a.me ? -1 : b.me ? 1 : 0);
    });
  }
  return arr.sort((a, b) => points(m, b) - points(m, a) || a.tagged - b.tagged || (a.me ? -1 : b.me ? 1 : 0));
}

// Rank (1 = best of n) and tag ratio -> 0..1. Winning with a strong ratio is a 1.0; middle of the
// pack trading tags evenly is ~0.6; last place with few tags lands around 0.2-0.3.
export function tagScore(rank: number, n: number, tags: number, tagged: number): number {
  const rankS = n > 1 ? (n - rank) / (n - 1) : 1;
  const ratio = tags / Math.max(1, tags + tagged);
  const ratioS = clamp01((ratio - 0.2) / 0.6);
  return clamp01(0.2 + 0.45 * rankS + 0.35 * ratioS);
}

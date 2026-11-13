import {
  TICK_RATE, EMPTY, ROCK, PLANK, SKILLS, GH_HEIGHT, GH_HALF_W, MAX_STEP_UP, MAX_STEP_DOWN, FALL_SPEED, SAFE_FALL,
  GLIDE_OPEN_AFTER, GLIDE_SPEED, PLANK_COUNT, PLANK_W, PLANK_ADVANCE, PLANK_RISE, PLANK_TICKS,
  TUNNEL_HEIGHT, BURROW_WIDTH, SCRAPE_RADIUS, SENTRY_REACH, POP_RADIUS, MOUND,
  PLANT_TICKS, PAD_REACH, BOUNCE_VX, BOUNCE_VY, GRAVITY, NAP_TICKS, NAP_RX, NAP_RY,
} from './types.ts';
import type { BouncePad, GameAPI, GameEvent, Groundhog, GHState, LevelDef, SkillId } from './types.ts';
import { Terrain, isDiggable } from './terrain.ts';

// Timing (ticks)
export const HATCH_DELAY = 24;
export const HATCH_OPEN_TICKS = 24;
export const FIRST_SPAWN_DELAY = 8;
export const SPLAT_TICKS = 16;
export const DROWN_TICKS = 24;
export const EXIT_TICKS = 14;
export const POOF_TICKS = 16;
export const HOIST_TICKS = 8;
export const SHRUG_TICKS = 12;
export const TUNNEL_STROKE = 4;
export const TUNNEL_REACH = 6; // px carved ahead per stroke
export const TUNNEL_LOOKAHEAD = 14; // also how early a tunneler may be assigned before a wall
export const BURROW_STROKE = 2;
export const SCRAPE_STROKE = 6;
export const ALARM_TICKS = 3 * TICK_RATE;
export const PAD_SPACING = 8; // no new pad within this many px of another

/** Ticks between spawns: rate 1 => 60 (2.5s), rate 99 => 4. */
export function spawnInterval(rate: number): number {
  return Math.round(60 - ((rate - 1) * 56) / 98);
}

const GONE: readonly GHState[] = ['saved', 'dead'];
const DYING: readonly GHState[] = ['splatting', 'drowning', 'poofing', 'exiting'];
const EXIT_STATES: readonly GHState[] = ['walking', 'shrugging', 'planking', 'tunneling', 'burrowing', 'scraping'];

export class Game implements GameAPI {
  readonly level: LevelDef;
  readonly terrain: Terrain;
  readonly groundhogs: Groundhog[] = [];
  readonly pads: BouncePad[] = [];
  readonly skillsLeft: Record<SkillId, number>;
  releaseRate: number;
  ticks = 0;
  hatchOpen = 0;
  spawned = 0;
  saved = 0;
  dead = 0;
  timeLeft: number;
  status: 'playing' | 'won' | 'lost' = 'playing';
  alarmed = false;

  private events: GameEvent[] = [];
  private spawnCountdown = -1; // -1 until hatch fully open
  private entranceIdx = 0;
  private nextId = 1;
  private nextPadId = 1;
  private readonly apex = new Map<number, number>(); // launched: highest (min) y so far
  private readonly ownPad = new Map<number, number>(); // planter id -> pad it must walk off first

  constructor(level: LevelDef) {
    this.level = level;
    this.terrain = new Terrain(level);
    const sl = {} as Record<SkillId, number>;
    for (const s of SKILLS) sl[s] = level.skills[s] ?? 0;
    this.skillsLeft = sl;
    this.releaseRate = clamp(Math.round(level.releaseRate), 1, 99);
    this.timeLeft = level.timeLimit;
  }

  get alive(): number {
    return this.spawned - this.saved - this.dead;
  }

  setReleaseRate(rate: number): void {
    this.releaseRate = clamp(Math.round(rate), clamp(this.level.releaseRate, 1, 99), 99);
    if (this.spawnCountdown > 0) this.spawnCountdown = Math.min(this.spawnCountdown, spawnInterval(this.releaseRate));
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Adds a groundhog directly (tests / scripted levels); counts as spawned. */
  addGroundhog(x: number, y: number, dir: 1 | -1 = 1, state: GHState = 'falling'): Groundhog {
    const g: Groundhog = {
      id: this.nextId++, x: Math.round(x), y: Math.round(y), dir, state, stateTicks: 0,
      isClimber: false, isGlider: false, fallDist: 0, work: 0, alarmTicks: -1, vx: 0, vy: 0,
    };
    this.groundhogs.push(g);
    this.spawned++;
    return g;
  }

  tick(): void {
    if (this.status !== 'playing') return;
    this.ticks++;
    this.updateSpawner();
    for (const g of this.groundhogs) this.update(g);
    this.updatePads();
    this.timeLeft = Math.max(0, this.timeLeft - 1 / TICK_RATE);
    this.checkEnd();
  }

  alarm(): void {
    if (this.alarmed || this.status !== 'playing') return;
    this.alarmed = true;
    for (const g of this.groundhogs) {
      if (!GONE.includes(g.state) && !DYING.includes(g.state) && g.alarmTicks < 0) g.alarmTicks = ALARM_TICKS;
    }
  }

  // ---------- skills ----------

  canApply(g: Groundhog, skill: SkillId): boolean {
    if (GONE.includes(g.state) || DYING.includes(g.state)) return false;
    const s = g.state;
    const idle = s === 'walking' || s === 'shrugging';
    switch (skill) {
      case 'climber': return !g.isClimber;
      case 'glider': return !g.isGlider;
      case 'sentry': return idle;
      case 'planker': return idle || s === 'planking';
      case 'tunneler': return idle || s === 'planking' || s === 'burrowing' || s === 'scraping';
      case 'burrower': return idle || s === 'planking' || s === 'tunneling' || s === 'scraping';
      case 'scraper': return idle || s === 'planking' || s === 'tunneling' || s === 'burrowing';
      case 'popper': return g.alarmTicks < 0;
      case 'bouncer':
      case 'napper': return idle;
    }
  }

  assignSkill(g: Groundhog, skill: SkillId): boolean {
    if (this.status !== 'playing' || this.skillsLeft[skill] <= 0 || !this.canApply(g, skill)) {
      this.events.push({ type: 'assign-fail' });
      return false;
    }
    this.skillsLeft[skill]--;
    switch (skill) {
      case 'climber': g.isClimber = true; break;
      case 'glider': g.isGlider = true; break;
      case 'sentry': this.setState(g, 'sentry'); break;
      case 'planker':
        g.work = PLANK_COUNT;
        if (g.state !== 'planking') this.setState(g, 'planking');
        break;
      case 'tunneler': this.setState(g, 'tunneling'); break;
      case 'burrower': this.setState(g, 'burrowing'); break;
      case 'scraper': this.setState(g, 'scraping'); break;
      case 'popper': g.alarmTicks = ALARM_TICKS; break; // keeps doing its job until it pops
      case 'bouncer': this.setState(g, 'planting'); break;
      case 'napper': this.setState(g, 'napping'); break;
    }
    this.events.push({ type: 'assign', id: g.id, skill });
    return true;
  }

  pickAt(wx: number, wy: number, skill: SkillId | null): Groundhog | null {
    let best: Groundhog | null = null;
    let bestScore = Infinity;
    for (const g of this.groundhogs) {
      if (GONE.includes(g.state)) continue;
      if (Math.abs(wx - g.x) > GH_HALF_W + 1 || wy < g.y - 11 || wy > g.y + 1) continue;
      const dx = wx - g.x, dy = wy - (g.y - 5);
      let score = dx * dx + dy * dy;
      if (skill && !this.canApply(g, skill)) score += 10000;
      if (score < bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return best;
  }

  // ---------- internals ----------

  private setState(g: Groundhog, s: GHState): void {
    g.state = s;
    g.stateTicks = 0;
  }

  private solid(x: number, y: number): boolean {
    return this.terrain.isSolid(x, y);
  }

  private standing(g: Groundhog): boolean {
    return this.solid(g.x, g.y + 1);
  }

  private inWorldX(x: number): boolean {
    return x >= GH_HALF_W && x <= this.terrain.width - 1 - GH_HALF_W;
  }

  private turn(g: Groundhog): void {
    g.dir = g.dir === 1 ? -1 : 1;
  }

  private startFall(g: Groundhog): void {
    g.fallDist = 0;
    this.setState(g, 'falling');
  }

  private updatePads(): void {
    for (let i = this.pads.length - 1; i >= 0; i--) {
      const p = this.pads[i];
      if (!this.solid(p.x, p.y + 1)) this.pads.splice(i, 1);
    }
  }

  private updateSpawner(): void {
    const lv = this.level;
    if (lv.entrances.length === 0) return;
    if (this.ticks === HATCH_DELAY) this.events.push({ type: 'hatch-open' });
    if (this.ticks >= HATCH_DELAY && this.hatchOpen < 1) {
      this.hatchOpen = Math.min(1, this.hatchOpen + 1 / HATCH_OPEN_TICKS);
      if (this.hatchOpen >= 1) this.spawnCountdown = FIRST_SPAWN_DELAY;
      return;
    }
    if (this.spawnCountdown < 0 || this.alarmed || this.spawned >= lv.count) return;
    if (--this.spawnCountdown > 0) return;
    const e = lv.entrances[this.entranceIdx++ % lv.entrances.length];
    const g = this.addGroundhog(e.x, e.y, 1, 'falling');
    this.events.push({ type: 'spawn', id: g.id });
    this.spawnCountdown = spawnInterval(this.releaseRate);
  }

  private checkEnd(): void {
    const done = (this.spawned >= this.level.count || this.alarmed) && this.alive === 0;
    if (!done && this.timeLeft > 0) return;
    const won = this.saved >= this.level.required;
    this.status = won ? 'won' : 'lost';
    this.events.push({ type: 'end', won });
  }

  private kill(g: Groundhog): void {
    this.setState(g, 'dead');
    g.alarmTicks = -1;
    this.dead++;
  }

  private update(g: Groundhog): void {
    if (GONE.includes(g.state)) return;
    g.stateTicks++;

    if (g.alarmTicks > 0 && --g.alarmTicks === 0) {
      g.alarmTicks = -1;
      if (!DYING.includes(g.state)) {
        g.x = Math.round(g.x);
        g.y = Math.round(g.y);
        this.setState(g, 'poofing');
        this.terrain.eraseCircle(g.x, g.y, POP_RADIUS);
        return;
      }
    }

    switch (g.state) {
      case 'walking': this.walk(g); break;
      case 'falling':
      case 'gliding': this.fall(g); break;
      case 'climbing': this.climb(g); break;
      case 'hoisting': // already on the ledge top
        if (!this.standing(g)) this.startFall(g);
        else if (g.stateTicks >= HOIST_TICKS) this.setState(g, 'walking');
        break;
      case 'sentry':
        if (!this.standing(g)) this.startFall(g);
        break;
      case 'planking': this.plank(g); break;
      case 'shrugging':
        if (!this.standing(g)) this.startFall(g);
        else if (g.stateTicks >= SHRUG_TICKS) this.setState(g, 'walking');
        break;
      case 'tunneling': this.tunnel(g); break;
      case 'burrowing': this.burrow(g); break;
      case 'scraping': this.scrape(g); break;
      case 'planting':
        if (!this.standing(g)) this.startFall(g);
        else if (g.stateTicks >= PLANT_TICKS) this.plantPad(g);
        break;
      case 'launched': this.fly(g); break;
      case 'napping':
        if (!this.standing(g)) this.startFall(g);
        else if (g.stateTicks >= NAP_TICKS) this.nap(g);
        break;
      case 'splatting':
        if (g.stateTicks >= SPLAT_TICKS) this.kill(g);
        return;
      case 'drowning':
        if (g.stateTicks >= DROWN_TICKS) this.kill(g);
        return;
      case 'poofing':
        if (g.stateTicks >= POOF_TICKS) this.kill(g);
        return;
      case 'exiting':
        if (g.stateTicks >= EXIT_TICKS) {
          this.setState(g, 'saved');
          g.alarmTicks = -1;
          this.saved++;
          this.events.push({ type: 'saved', id: g.id });
        }
        return;
      default:
        return;
    }

    if (GONE.includes(g.state) || DYING.includes(g.state)) return;
    if (g.y >= this.terrain.height) {
      this.kill(g);
      return;
    }
    for (const h of this.level.hazards) {
      if (g.x >= h.x && g.x < h.x + h.w && g.y >= h.y && g.y < h.y + h.h) {
        this.setState(g, 'drowning');
        this.events.push({ type: 'drown', id: g.id });
        return;
      }
    }
    if (EXIT_STATES.includes(g.state)) {
      for (const e of this.level.exits) {
        if (Math.abs(g.x - e.x) <= 4 && Math.abs(g.y - e.y) <= 6) {
          g.x = e.x;
          g.y = e.y;
          this.setState(g, 'exiting');
          return;
        }
      }
    }
  }

  // Snap down onto ground within MAX_STEP_DOWN, else start falling. Returns false if falling.
  private settle(g: Groundhog): boolean {
    let down = 0;
    while (down <= MAX_STEP_DOWN && !this.solid(g.x, g.y + 1 + down)) down++;
    if (down > MAX_STEP_DOWN) {
      this.startFall(g);
      return false;
    }
    g.y += down;
    return true;
  }

  private sentryAhead(g: Groundhog): boolean {
    for (const s of this.groundhogs) {
      if (s === g || s.state !== 'sentry') continue;
      const dx = s.x - g.x;
      if (dx * g.dir > 0 && Math.abs(dx) <= SENTRY_REACH && Math.abs(s.y - g.y) <= 6) return true;
    }
    return false;
  }

  // Planks are one-way platforms: any other terrain blocks the body.
  private headroom(x: number, y: number): boolean {
    for (let yy = y - GH_HEIGHT + 1; yy < y; yy++) {
      const m = this.terrain.get(x, yy);
      if (m !== EMPTY && m !== PLANK) return false;
    }
    return y - GH_HEIGHT + 1 >= 0;
  }

  private walk(g: Groundhog): void {
    this.step(g);
    if (g.state === 'walking') this.checkPads(g);
  }

  // A wall ahead: turn, or (popper counting down) wait pressed against it.
  private bump(g: Groundhog): void {
    if (g.alarmTicks < 0) this.turn(g);
  }

  private step(g: Groundhog): void {
    // lifted out of a plank laid across the feet
    if (this.solid(g.x, g.y) && !this.solid(g.x, g.y - 1) && this.headroom(g.x, g.y - 1)) g.y--;
    if (!this.standing(g)) {
      this.settle(g); // ground went away: spend this tick dropping
      return;
    }
    const nx = g.x + g.dir;
    if (!this.inWorldX(nx) || this.sentryAhead(g)) {
      this.turn(g);
      return;
    }
    // y-1 counts as a step too, so 1px planks rising 2px form a walkable stair
    const lowHit = this.solid(nx, g.y);
    if (lowHit || this.solid(nx, g.y - 1)) {
      let h = lowHit ? 1 : 2;
      while (h <= MAX_STEP_UP && this.solid(nx, g.y - h)) h++;
      if (h > MAX_STEP_UP) {
        if (g.isClimber) this.setState(g, 'climbing');
        else this.bump(g);
        return;
      }
      if (this.headroom(nx, g.y - h)) {
        g.x = nx;
        g.y -= h;
        return;
      }
      // no room to climb onto it: planks are passed through, anything else is a wall
      const lowMat = this.terrain.get(nx, g.y), kneeMat = this.terrain.get(nx, g.y - 1);
      if ((lowMat !== EMPTY && lowMat !== PLANK) || (kneeMat !== EMPTY && kneeMat !== PLANK)) {
        this.bump(g);
        return;
      }
    }
    let down = 0;
    while (down <= MAX_STEP_DOWN && !this.solid(nx, g.y + 1 + down)) down++;
    if (!this.headroom(nx, down > MAX_STEP_DOWN ? g.y : g.y + down)) {
      this.bump(g);
      return;
    }
    g.x = nx;
    this.settle(g);
  }

  // ---------- bouncer ----------

  private plantPad(g: Groundhog): void {
    const near = this.pads.some((p) => Math.abs(p.x - g.x) <= PAD_SPACING && Math.abs(p.y - g.y) <= PAD_SPACING);
    if (!near) {
      const pad: BouncePad = { id: this.nextPadId++, x: g.x, y: g.y, lastBounce: -1 };
      this.pads.push(pad);
      this.ownPad.set(g.id, pad.id);
    }
    this.setState(g, 'walking');
  }

  private checkPads(g: Groundhog): void {
    const own = this.ownPad.get(g.id);
    for (const p of this.pads) {
      if (Math.abs(p.x - g.x) > PAD_REACH || Math.abs(p.y - g.y) > 2) {
        if (p.id === own) this.ownPad.delete(g.id); // walked off its own pad
        continue;
      }
      if (p.id === own) continue;
      p.lastBounce = this.ticks;
      this.setState(g, 'launched');
      g.vx = g.dir * BOUNCE_VX;
      g.vy = BOUNCE_VY;
      this.apex.set(g.id, g.y);
      this.events.push({ type: 'bounce', id: g.id });
      return;
    }
    if (own !== undefined && !this.pads.some((p) => p.id === own)) this.ownPad.delete(g.id);
  }

  // Body column (planks excluded) at integer feet point is clear and inside the world.
  private bodyClear(x: number, y: number): boolean {
    if (!this.inWorldX(x)) return false;
    const m = this.terrain.get(x, y);
    return m !== ROCK && (m === EMPTY || m === PLANK) && this.headroom(x, y);
  }

  // Ballistic flight in sub-steps of <=1px; x/y are fractional until landing.
  private fly(g: Groundhog): void {
    g.vy += GRAVITY;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(g.vx), Math.abs(g.vy))));
    let sx = g.vx / steps;
    let sy = g.vy / steps;
    for (let i = 0; i < steps; i++) {
      const rx = Math.round(g.x), ry = Math.round(g.y);
      if (sx !== 0) {
        const nrx = Math.round(g.x + sx);
        if (nrx === rx || this.bodyClear(nrx, ry)) {
          g.x += sx;
        } else {
          sx = 0;
          g.vx = 0; // hit a wall: slide down it
          if (g.isClimber && this.solid(rx + g.dir, ry) && this.bodyClear(rx, ry)) {
            g.x = rx;
            g.y = ry;
            this.apex.delete(g.id);
            this.setState(g, 'climbing');
            return;
          }
        }
      }
      const cx = Math.round(g.x);
      if (sy > 0 && this.solid(cx, Math.round(g.y) + 1)) return this.land(g);
      const nry = Math.round(g.y + sy);
      if (sy < 0 && nry < Math.round(g.y) && !this.headroom(cx, nry)) {
        sy = 0;
        g.vy = Math.max(g.vy, 0); // bonk
        continue;
      }
      g.y += sy;
      if (g.y >= this.terrain.height) return;
      const top = Math.min(this.apex.get(g.id) ?? g.y, g.y);
      this.apex.set(g.id, top);
      g.fallDist = Math.max(0, g.y - top);
    }
    if (g.vy >= 0 && this.solid(Math.round(g.x), Math.round(g.y) + 1)) return this.land(g);
    if (g.isGlider && g.fallDist > GLIDE_OPEN_AFTER) {
      g.x = Math.round(g.x);
      g.y = Math.round(g.y);
      g.vx = g.vy = 0;
      this.apex.delete(g.id);
      this.setState(g, 'gliding');
    }
  }

  private land(g: Groundhog): void {
    g.x = Math.round(g.x);
    g.y = Math.round(g.y);
    const drop = g.y - (this.apex.get(g.id) ?? g.y);
    this.apex.delete(g.id);
    g.vx = g.vy = 0;
    g.fallDist = 0;
    if (drop > SAFE_FALL && !g.isGlider) {
      this.setState(g, 'splatting');
      this.events.push({ type: 'splat', id: g.id });
    } else {
      this.setState(g, 'walking');
    }
  }

  // ---------- napper ----------

  // Mound cap NAP_RY tall above the feet row, plus EMPTY gaps below filled NAP_RY deep.
  private nap(g: Groundhog): void {
    const t = this.terrain;
    for (let dx = -NAP_RX; dx <= NAP_RX; dx++) {
      const h = Math.round(NAP_RY * Math.sqrt(1 - (dx / (NAP_RX + 1)) ** 2));
      for (let y = g.y - h + 1; y <= g.y + NAP_RY; y++) {
        if (t.get(g.x + dx, y) === EMPTY) t.set(g.x + dx, y, MOUND);
      }
    }
    t.markDirty(g.x - NAP_RX, g.y - NAP_RY + 1, NAP_RX * 2 + 1, NAP_RY * 2);
    this.kill(g);
    this.events.push({ type: 'nap', id: g.id });
    // nobody may end up inside the new mound: heave them on top, or bury them if there is no room
    for (const o of this.groundhogs) {
      if (o === g || GONE.includes(o.state) || DYING.includes(o.state) || Math.abs(Math.round(o.x) - g.x) > NAP_RX) continue;
      const ox = Math.round(o.x), oy0 = Math.round(o.y);
      let top = Infinity; // highest mound pixel inside its body
      for (let y = oy0; y > oy0 - GH_HEIGHT; y--) if (t.get(ox, y) === MOUND) top = y;
      if (top === Infinity) continue;
      let oy = top - 1;
      while (oy > top - 2 * NAP_RY && this.solid(ox, oy)) oy--;
      if (!this.solid(ox, oy) && this.headroom(ox, oy)) {
        o.x = ox;
        o.y = oy;
      } else {
        this.setState(o, 'poofing');
      }
    }
  }

  private fall(g: Groundhog): void {
    const gliding = g.state === 'gliding';
    const speed = gliding ? GLIDE_SPEED : FALL_SPEED;
    for (let i = 0; i < speed; i++) {
      if (this.standing(g)) {
        if (!gliding && g.fallDist > SAFE_FALL) {
          this.setState(g, 'splatting');
          this.events.push({ type: 'splat', id: g.id });
        } else {
          this.setState(g, 'walking');
        }
        g.fallDist = 0;
        return;
      }
      g.y++;
      g.fallDist++;
      if (g.y >= this.terrain.height) return;
    }
    if (!gliding && g.isGlider && g.fallDist > GLIDE_OPEN_AFTER) this.setState(g, 'gliding');
  }

  private climb(g: Groundhog): void {
    const fallBack = () => {
      this.turn(g);
      this.startFall(g);
    };
    if (!this.solid(g.x + g.dir, g.y)) return fallBack(); // wall dug away
    if (g.y - GH_HEIGHT < 0 || this.solid(g.x, g.y - GH_HEIGHT)) return fallBack();
    g.y--;
    if (this.solid(g.x + g.dir, g.y)) return;
    // over the top: hoist onto the ledge if there is room
    if (!this.headroom(g.x + g.dir, g.y)) return fallBack();
    g.x += g.dir;
    this.setState(g, 'hoisting');
  }

  private plank(g: Groundhog): void {
    if (!this.standing(g)) {
      this.startFall(g);
      return;
    }
    if (g.stateTicks % PLANK_TICKS !== 0) return;
    // laid so that after rising PLANK_RISE the planker stands on it (no hover)
    const x0 = g.dir === 1 ? g.x : g.x - PLANK_W + 1;
    this.terrain.fillPlank(x0, g.y - PLANK_RISE + 1, PLANK_W);
    g.work--;
    if (g.work === 3) this.events.push({ type: 'plank-low', id: g.id });
    const nx = g.x + g.dir * PLANK_ADVANCE;
    const ny = g.y - PLANK_RISE;
    if (this.plankBlocked(g, ny)) {
      this.turn(g);
      this.setState(g, 'walking');
      return;
    }
    g.x = nx;
    g.y = ny;
    if (g.work <= 0) this.setState(g, 'shrugging');
  }

  private plankBlocked(g: Groundhog, ny: number): boolean {
    if (ny - GH_HEIGHT + 1 < 0) return true;
    for (let i = 1; i <= PLANK_ADVANCE; i++) {
      const cx = g.x + g.dir * i;
      if (!this.inWorldX(cx)) return true;
      for (let y = ny - GH_HEIGHT + 1; y <= ny; y++) if (this.solid(cx, y)) return true;
    }
    return false;
  }

  private tunnel(g: Groundhog): void {
    if (!this.standing(g)) {
      this.startFall(g);
      return;
    }
    const top = g.y - TUNNEL_HEIGHT + 1;
    if (g.stateTicks % TUNNEL_STROKE === 1) {
      const lx = g.dir === 1 ? g.x + 1 : g.x - TUNNEL_LOOKAHEAD;
      if (!this.terrain.anyIn(lx, top, TUNNEL_LOOKAHEAD, TUNNEL_HEIGHT, isDiggable)) {
        this.setState(g, 'walking');
        return;
      }
      const cx = g.dir === 1 ? g.x + 1 : g.x - TUNNEL_REACH;
      if (this.terrain.eraseRect(cx, top, TUNNEL_REACH, TUNNEL_HEIGHT).hitRock) {
        this.turn(g);
        this.setState(g, 'walking');
        return;
      }
    }
    const nx = g.x + g.dir;
    if (!this.inWorldX(nx)) {
      this.turn(g);
      this.setState(g, 'walking');
      return;
    }
    if (!this.solid(nx, g.y)) g.x = nx;
    if (!this.standing(g)) this.settle(g);
  }

  private burrow(g: Groundhog): void {
    if (!this.terrain.anyIn(g.x - 1, g.y + 1, 3, 1, (m) => m !== EMPTY)) {
      this.startFall(g);
      return;
    }
    if (g.stateTicks % BURROW_STROKE !== 1) return;
    const half = (BURROW_WIDTH - 1) >> 1;
    if (this.terrain.get(g.x, g.y + 1) === ROCK) {
      this.setState(g, 'walking');
      return;
    }
    if (!this.terrain.anyIn(g.x - 1, g.y + 1, 3, 1, isDiggable)) {
      this.startFall(g);
      return;
    }
    this.terrain.eraseRect(g.x - half, g.y + 1, BURROW_WIDTH, 1);
    g.y++;
    if (!this.terrain.anyIn(g.x - 1, g.y + 1, 3, 1, (m) => m !== EMPTY)) this.startFall(g);
  }

  // Circle centred ahead-up so new feet are cleared but the ground beneath stays.
  private scrape(g: Groundhog): void {
    const phase = g.stateTicks % SCRAPE_STROKE;
    if (phase === 1) {
      if (!this.standing(g)) {
        this.startFall(g);
        return;
      }
      // circle carves the floor; the rect clears headroom for the next two steps
      const bx = g.dir === 1 ? g.x + 1 : g.x - 2;
      const body = this.terrain.eraseRect(bx, g.y - GH_HEIGHT + 1, 2, GH_HEIGHT - 3).hitRock;
      if (this.terrain.eraseCircle(g.x + g.dir * 5, g.y - 3, SCRAPE_RADIUS).hitRock || body) {
        this.setState(g, 'walking');
        return;
      }
    } else if (phase === 3 || phase === 5) {
      const nx = g.x + g.dir;
      if (!this.inWorldX(nx)) {
        this.turn(g);
        this.setState(g, 'walking');
        return;
      }
      g.x = nx;
      if (phase === 5) g.y++;
    }
    if (!this.standing(g)) this.startFall(g);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

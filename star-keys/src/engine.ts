// Typing run simulation: prompts, hero movement along the path, chasing threat, scoring.
import {
  CONTACT_DAMAGE,
  CONTACT_GAP,
  CONTACT_INTERVAL,
  HURT_TIME,
  MOVE_SPEED,
  NEAR_GAP,
  TICK_RATE,
  TYPO_DAMAGE,
  CLEAN_HEAL,
  type HeroPose,
  type LevelDef,
  type RunAPI,
  type RunEvent,
  type RunStats,
  type RunStatus,
} from './types.ts';
import { lerpWaypoints, measurePath, moveArc, pointAt, type PathMetrics } from './path.ts';

export const WIN_CHEER_TIME = 0.8; // 'cheer' on arrival, then 'board' (UI may launch after)
const EPS = 1e-9;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle-bag deal: no repeats until the pool is exhausted, never the same prompt twice in a row. */
export function pickPrompts(words: readonly string[], count: number, seed: number): string[] {
  const pool = [...new Set(words)].filter((w) => w.length > 0);
  const out: string[] = [];
  if (pool.length === 0) return out;
  const rnd = mulberry32(seed);
  let bag: string[] = [];
  while (out.length < count) {
    if (bag.length === 0) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // dealt from the end; avoid repeating the previous bag's last word
      if (bag.length > 1 && bag[bag.length - 1] === out[out.length - 1]) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    out.push(bag.pop()!);
  }
  return out;
}

export class Run implements RunAPI {
  readonly level: LevelDef;
  readonly prompts: readonly string[];
  status: RunStatus = 'ready';
  index = 0;
  typed = 0;
  hp: number;
  heroX: number;
  heroY: number;
  heroPose: HeroPose = 'idle';
  heroPoseTime = 0;
  heroDir: 1 | -1 = 1;
  heroAt = 0;
  heroS = 0;
  threatS: number;
  threatX = 0;
  threatY = 0;
  danger = false;
  /** true while the hero travels heroAt -> heroAt + 1 */
  moving = false;

  private readonly steps: number;
  private readonly m: PathMetrics;
  private events: RunEvent[] = [];
  private nCorrect = 0;
  private nWrong = 0;
  private elapsed = 0;
  private typingEnd = -1; // elapsed at the final keystroke; wpm excludes the last walk
  private promptClean = true;
  private missed: Record<string, number> = {};
  private hurtTimer = 0;
  private contactCooldown = 0;
  private wonTime = 0;

  constructor(level: LevelDef, seed: number) {
    if (level.path.length !== level.steps + 1) {
      throw new Error(`level ${level.id}: path.length ${level.path.length} != steps + 1 (${level.steps + 1})`);
    }
    this.level = level;
    this.steps = level.steps;
    this.prompts = pickPrompts(level.words, level.steps, seed);
    this.hp = level.hp;
    this.m = measurePath(level.path);
    this.heroX = level.path[0].x;
    this.heroY = level.path[0].y;
    this.threatS = -level.threatStart;
    this.placeThreat();
  }

  get stats(): RunStats {
    const total = this.nCorrect + this.nWrong;
    return {
      correct: this.nCorrect,
      wrong: this.nWrong,
      elapsed: this.elapsed,
      wpm: this.nCorrect === 0 ? 0 : this.nCorrect / 5 / (Math.max(1, this.wpmTime()) / 60), // 1s floor avoids early spikes
      accuracy: total === 0 ? 1 : this.nCorrect / total,
      missed: { ...this.missed },
    };
  }

  private wpmTime(): number {
    return this.typingEnd >= 0 ? this.typingEnd : this.elapsed;
  }

  /** Path length in px (for HUD progress bars). */
  get pathLength(): number {
    return this.m.total;
  }

  nextChar(): string | null {
    if (this.status === 'won' || this.status === 'lost' || this.index >= this.steps) return null;
    return this.prompts[this.index][this.typed] ?? null;
  }

  input(char: string): void {
    if (this.status === 'won' || this.status === 'lost') return;
    if (this.index >= this.steps || char.length !== 1) return;
    if (this.status === 'ready') {
      this.status = 'playing';
      this.emit({ type: 'start' });
    }
    const word = this.prompts[this.index];
    const expected = word[this.typed];
    if (char === expected) {
      this.nCorrect++;
      this.typed++;
      this.emit({ type: 'correct', char });
      if (this.typed >= word.length) {
        this.emit({ type: 'word', word, index: this.index });
        if (this.promptClean && this.hp < this.level.hp) {
          this.hp = Math.min(this.level.hp, this.hp + CLEAN_HEAL);
          this.emit({ type: 'heal' });
        }
        this.promptClean = true;
        this.index++;
        this.typed = 0;
        if (this.index >= this.steps) this.typingEnd = this.elapsed;
      }
    } else {
      this.nWrong++;
      this.promptClean = false;
      this.missed[expected] = (this.missed[expected] ?? 0) + 1;
      this.emit({ type: 'wrong', expected, got: char });
      this.hp -= TYPO_DAMAGE;
      this.hurt('typo');
      if (this.hp <= 0) this.lose();
    }
    this.updatePose();
  }

  tick(dt: number): void {
    if (!(dt > 0)) return;
    this.heroPoseTime += dt;
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (this.status === 'won') this.wonTime += dt;
    if (this.status === 'playing') {
      const t0 = this.elapsed;
      this.elapsed += dt;
      this.contactCooldown = Math.max(0, this.contactCooldown - dt);
      this.advanceHero(dt);
      if (this.status === 'playing') this.advanceThreat(t0, this.elapsed);
    }
    this.updatePose();
  }

  drainEvents(): RunEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  stars(): 0 | 1 | 2 | 3 {
    if (this.status !== 'won') return 0;
    const s = this.stats;
    if (s.accuracy < 0.9) return 1;
    return s.wpm >= this.level.targetWpm ? 3 : 2;
  }

  private emit(e: RunEvent): void {
    this.events.push(e);
  }

  private advanceHero(dt: number): void {
    let budget = MOVE_SPEED * dt;
    for (;;) {
      if (!this.moving) {
        if (this.heroAt >= this.index || this.heroAt >= this.steps) break;
        this.startSegment();
      }
      const remain = this.m.cum[this.heroAt + 1] - this.heroS;
      if (remain <= budget + EPS) {
        budget -= Math.max(0, remain);
        this.arrive();
        if (this.status !== 'playing') break;
      } else {
        this.heroS += budget;
        break;
      }
    }
    this.placeHero();
  }

  private startSegment(): void {
    const from = this.heroAt;
    const to = from + 1;
    const dx = this.level.path[to].x - this.level.path[from].x;
    if (dx !== 0) this.heroDir = dx > 0 ? 1 : -1;
    this.moving = true;
    this.emit({ type: 'move', from, to, move: this.level.path[to].move });
  }

  private arrive(): void {
    this.moving = false;
    this.heroAt++;
    this.heroS = this.m.cum[this.heroAt];
    this.emit({ type: 'arrive', index: this.heroAt });
    if (this.heroAt >= this.steps) this.win();
  }

  private placeHero(): void {
    const path = this.level.path;
    if (!this.moving) {
      this.heroX = path[this.heroAt].x;
      this.heroY = path[this.heroAt].y;
      return;
    }
    const i = this.heroAt;
    const len = this.m.seg[i];
    const t = len > 0 ? Math.min(1, Math.max(0, (this.heroS - this.m.cum[i]) / len)) : 1;
    const p = lerpWaypoints(path[i], path[i + 1], t);
    this.heroX = p.x;
    this.heroY = p.y - moveArc(path[i + 1].move, len, t);
  }

  private advanceThreat(t0: number, t1: number): void {
    const g = this.level.graceSeconds;
    const a = Math.max(0, t0 - g);
    const b = t1 - g;
    if (b > a) {
      const d = this.level.threatSpeed * (b - a) + 0.5 * this.level.threatAccel * (b * b - a * a);
      this.threatS += Math.max(0, d);
    }
    if (this.threatS > this.heroS) this.threatS = this.heroS;
    this.placeThreat();

    const gap = this.heroS - this.threatS;
    if (gap <= CONTACT_GAP && this.contactCooldown <= EPS && this.hurtTimer <= 0) {
      this.contactCooldown = CONTACT_INTERVAL;
      this.hp -= CONTACT_DAMAGE;
      this.hurt('threat');
      if (this.hp <= 0) {
        this.lose();
        return;
      }
    }
    this.setDanger(gap <= NEAR_GAP);
  }

  private placeThreat(): void {
    const p = pointAt(this.level.path, this.m, this.threatS);
    this.threatX = p.x;
    this.threatY = p.y;
  }

  private setDanger(on: boolean): void {
    if (on === this.danger) return;
    this.danger = on;
    this.emit({ type: 'danger', on });
  }

  private hurt(cause: 'typo' | 'threat'): void {
    this.hurtTimer = HURT_TIME;
    this.emit({ type: 'hurt', cause });
  }

  private win(): void {
    this.status = 'won';
    this.wonTime = 0;
    this.setDanger(false);
    this.emit({ type: 'won' });
  }

  private lose(): void {
    this.hp = Math.max(0, this.hp);
    this.status = 'lost';
    this.emit({ type: 'lost' });
  }

  private updatePose(): void {
    let p: HeroPose;
    if (this.status === 'lost') p = 'faint';
    else if (this.status === 'won') p = this.wonTime < WIN_CHEER_TIME ? 'cheer' : 'board';
    else if (this.hurtTimer > 0) p = 'hurt';
    else if (this.moving) p = this.level.path[this.heroAt + 1].move;
    else if (this.danger) p = 'scared';
    else p = 'idle';
    if (p !== this.heroPose) {
      this.heroPose = p;
      this.heroPoseTime = 0;
    }
  }
}

export interface TypistResult {
  status: RunStatus;
  stars: number;
  hpLeft: number;
  time: number;
}

/**
 * Virtual typist: first key at t=0, then one keystroke every 60/(wpm*5) s.
 * accuracy = chance each char is right first try; a miss is a wrong key from level.keys, then the right one.
 */
export function simulateTypist(level: LevelDef, seed: number, wpm: number, accuracy: number, rngSeed: number): TypistResult {
  const run = new Run(level, seed);
  const rnd = mulberry32(rngSeed);
  const dt = 1 / TICK_RATE;
  const interval = wpm > 0 ? 60 / (wpm * 5) : Infinity;
  const errRate = Math.min(1, Math.max(0, 1 - accuracy));
  const maxTicks = 600 * TICK_RATE;
  let nextKey = 0;
  let erred = false;
  for (let n = 0; n < maxTicks; n++) {
    if (run.status === 'won' || run.status === 'lost') break;
    const t = n * dt;
    while (t >= nextKey) {
      const exp = run.nextChar();
      if (exp === null) break;
      if (!erred && rnd() < errRate) {
        run.input(wrongKey(level.keys, exp, rnd));
        erred = true;
      } else {
        run.input(exp);
        erred = false;
      }
      nextKey += interval;
    }
    run.tick(dt);
  }
  return { status: run.status, stars: run.stars(), hpLeft: run.hp, time: run.stats.elapsed };
}

function wrongKey(keys: string, expected: string, rnd: () => number): string {
  const opts = [...new Set(keys)].filter((c) => c !== expected);
  if (opts.length === 0) return expected === '#' ? '@' : '#';
  return opts[Math.floor(rnd() * opts.length)];
}

/** Lowest integer wpm (1..maxWpm) that wins with the given accuracy; null if none does. */
export function minWinningWpm(level: LevelDef, seed: number, accuracy = 1, rngSeed = 1, maxWpm = 200): number | null {
  const wins = (w: number) => simulateTypist(level, seed, w, accuracy, rngSeed).status === 'won';
  if (!wins(maxWpm)) return null;
  let lo = 1;
  let hi = maxWpm;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (wins(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

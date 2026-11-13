import { describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { InvariantChecker } from './invariants.ts';
import { LEVELS } from './levels.ts';
import { TICK_RATE } from './types.ts';
import type { Groundhog, GHState, SkillId } from './types.ts';

// Plays each level headlessly the way a player would: only pickAt/assignSkill on live groundhogs,
// choosing when to act by watching positions. Offsets shift every positional trigger to prove slack.

const OUT: ReadonlySet<GHState> = new Set(['saved', 'dead', 'splatting', 'drowning', 'poofing', 'exiting']);
type Pred = (g: Groundhog) => boolean;

class Director {
  readonly game: Game;
  private readonly checker: InvariantChecker;
  constructor(id: string) {
    const lv = LEVELS.find((l) => l.id === id);
    if (!lv) throw new Error(`no level ${id}`);
    this.game = new Game(lv);
    this.checker = new InvariantChecker(this.game);
  }

  step(): void {
    this.game.tick();
    this.game.drainEvents();
    this.checker.check();
  }

  get live(): Groundhog[] {
    return this.game.groundhogs.filter((g) => !OUT.has(g.state));
  }

  /** Ticks until cond holds; fails if the level ends or time runs out first. */
  until(cond: () => boolean, what: string, maxTicks = 120 * TICK_RATE): void {
    for (let i = 0; !cond(); i++) {
      if (this.game.status !== 'playing') throw new Error(`level ${this.game.status} while waiting for ${what}`);
      if (i >= maxTicks) throw new Error(`timed out waiting for ${what}`);
      this.step();
    }
  }

  wait(ticks: number): void {
    const end = this.game.ticks + ticks;
    this.until(() => this.game.ticks >= end, `${ticks} ticks`);
  }

  /** Waits for a groundhog matching pred, clicks on it with skill; the clicked one must match too. */
  when(pred: Pred, skill: SkillId, what: string = skill): Groundhog {
    let picked: Groundhog | null = null;
    this.until(() => {
      for (const g of this.live) {
        if (!pred(g)) continue;
        const p = this.game.pickAt(g.x, g.y - 5, skill);
        if (p && pred(p) && this.game.canApply(p, skill)) {
          picked = p;
          return true;
        }
      }
      return false;
    }, what);
    expect(this.game.assignSkill(picked!, skill), what).toBe(true);
    return picked!;
  }

  /** Follows one specific groundhog: waits for cond, then clicks it. */
  on(g: Groundhog, cond: Pred, skill: SkillId, what: string = skill): void {
    this.until(() => OUT.has(g.state) || cond(g), what);
    expect(OUT.has(g.state), `${what}: groundhog #${g.id} is ${g.state}`).toBe(false);
    expect(this.game.pickAt(g.x, g.y - 5, skill), `${what}: click picks #${g.id}`).toBe(g);
    expect(this.game.assignSkill(g, skill), what).toBe(true);
  }

  /** First groundhog out of the hatch (watched, not clicked). */
  first(): Groundhog {
    this.until(() => this.game.groundhogs.length > 0, 'first one');
    return this.game.groundhogs[0];
  }

  /** Plays out the level; sounds the alarm once only sentries are left standing. */
  finish(): void {
    const lv = this.game.level;
    while (this.game.status === 'playing') {
      const live = this.live;
      if (this.game.spawned >= lv.count && live.length > 0 && live.every((g) => g.state === 'sentry')) this.game.alarm();
      this.step();
    }
  }

  report(): string {
    const g = this.game;
    return `${g.level.id}: ${g.status} saved ${g.saved}/${g.level.count} (need ${g.level.required}) dead ${g.dead} t=${g.ticks}`;
  }
}

/** Walking groundhog heading dir that is exactly at x (optionally on feet row y). */
const at = (dir: 1 | -1, x: number, y?: number): Pred => (g) =>
  g.state === 'walking' && g.dir === dir && g.x === x && (y === undefined || g.y === y);
const shrugging: Pred = (g) => g.state === 'shrugging';

type Play = (d: Director, off: number) => void;
interface Solution {
  offsets: number[]; // every positional trigger is shifted by each of these; they span the slack a player has
  margin: number; // intended run must beat `required` by at least this (room for a mistake)
  play: Play;
  naive?: (d: Director) => void; // the obvious-but-wrong approach; must not win
}

const SOLUTIONS: Record<string, Solution> = {
  // burrow anywhere on the shelf ahead of the crowd
  'first-thaw': {
    offsets: [-40, 0, 40],
    margin: 5,
    play(d, off) {
      d.when(at(1, 280 + off, 139), 'burrower');
    },
  },
  'six-more-weeks': {
    offsets: [0],
    margin: 3,
    play(d) {
      for (let i = 0; i < d.game.level.count; i++) d.when((g) => !g.isGlider, 'glider', `glider #${i + 1}`);
    },
  },
  'root-cellar': {
    offsets: [-8, 0, 4],
    margin: 3,
    play(d, off) {
      d.when(at(1, 275 + off, 199), 'tunneler', 'wall 1');
      d.when(at(1, 515 + off, 199), 'tunneler', 'wall 2');
    },
  },
  // ramp out of the ditch, then bridge the stream (windows ~17px and ~22px)
  'clover-bridge': {
    offsets: [-6, 0, 8],
    margin: 3,
    play(d, off) {
      d.when(at(1, 152 + off, 199), 'planker', 'ditch ramp');
      d.when(at(1, 390 + off, 179), 'planker', 'stream bridge');
    },
  },
  // climbers for everyone, any time
  'shadow-check': {
    offsets: [0],
    margin: 2,
    play(d) {
      for (let i = 0; i < d.game.level.count; i++) d.when((g) => !g.isClimber, 'climber', `climber #${i + 1}`);
    },
  },
  // sentry on the rock (window ~20px), pop it, scrape in the dirt patch (window ~17px)
  'hold-the-line': {
    offsets: [-8, 0, 6],
    margin: 3,
    play(d, off) {
      const sentry = d.when(at(1, 358 + off, 119), 'sentry', 'hold the line');
      d.wait(20 * TICK_RATE); // let the crowd gather
      d.on(sentry, () => true, 'popper', 'release');
      d.when(at(1, 378 + off, 119), 'scraper', 'cut down');
    },
  },
  // pop anyone pacing in the pit, any time
  'pop-the-cork': {
    offsets: [0],
    margin: 3,
    play(d) {
      d.until(() => d.live.filter((g) => g.y === 113).length >= 3, 'a few in the pit');
      d.when((g) => g.state === 'walking' && g.y === 113, 'popper', 'pop the cork');
    },
  },
  // switch the burrower to tunneler at feet y 119-138
  'burrow-down': {
    offsets: [-8, 0, 8],
    margin: 3,
    play(d, off) {
      const b = d.when(at(1, 300 + off, 89), 'burrower', 'soft spot');
      d.on(b, (g) => g.state === 'burrowing' && g.y === 128 + off, 'tunneler', 'turn the shaft');
    },
    naive(d) {
      d.when(at(1, 300, 89), 'burrower', 'soft spot');
    },
  },
  // tunnel window: within 14px of the mesa face; ramp window x ~128-155
  'twin-hollows': {
    offsets: [-8, 0, 8],
    margin: 3,
    play(d, off) {
      d.when(at(-1, 297 + Math.sign(off) * 6, 199), 'tunneler', 'join the hollows');
      const p = d.when(at(1, 142 + off, 199), 'planker', 'ramp');
      d.on(p, shrugging, 'planker', 'ramp, part 2');
    },
    naive(d) {
      d.when(at(1, 150, 199), 'planker', 'left ramp');
      d.when(at(-1, 340, 199), 'planker', 'right ramp');
    },
  },
  'spring-loaded': {
    offsets: [-8, 0, 8],
    margin: 3,
    play(d, off) {
      d.when(at(1, 232 + off, 189), 'bouncer', 'pad');
    },
  },
  // plank the stream, bounce the rock step
  'long-winter': {
    offsets: [-6, 0, 6],
    margin: 2,
    play(d, off) {
      d.when(at(1, 203 + off, 179), 'tunneler', 'snow mound');
      d.when(at(1, 410 + off, 179), 'planker', 'stream');
      d.when(at(1, 570 + off * 2, 179), 'bouncer', 'rock step');
      d.when(at(1, 993 + off), 'tunneler', 'snowbank');
    },
    naive(d) {
      d.when(at(1, 203, 179), 'tunneler', 'snow mound');
      d.when(at(1, 410, 179), 'planker', 'stream');
      d.when(at(1, 993), 'tunneler', 'snowbank');
    },
  },
  // window x 242-249 approaching the ledge, and again walking away
  'forty-winks': {
    offsets: [-4, 0, 3],
    margin: 3,
    play(d, off) {
      d.when(at(1, 246 + off, 189), 'napper', 'step');
    },
  },
  // the lead must be out before the pit; bridge window x ~309-320
  'cold-feet': {
    offsets: [-8, 0, 8],
    margin: 2,
    play(d, off) {
      const lead = d.first();
      d.when((g) => g !== lead && at(1, 120 + off, 99)(g), 'burrower', 'holding pit');
      d.on(lead, at(1, 314 + Math.sign(off) * 5), 'planker', 'bridge');
      d.on(lead, shrugging, 'planker', 'bridge, part 2');
      d.until(() => lead.x > 420 || lead.state === 'saved', 'lead across');
      d.when((g) => g.state === 'walking' && g.dir === 1 && g.y === 119 && g.x > 100 + off, 'tunneler', 'release');
    },
    naive(d) {
      const lead = d.first();
      d.on(lead, at(1, 314), 'planker', 'bridge');
      d.on(lead, shrugging, 'planker', 'bridge, part 2');
    },
  },
  // two chained plankers from x 285-297
  'groundhog-day': {
    offsets: [-6, 0, 6],
    margin: 2,
    play(d, off) {
      d.when(at(-1, 185 + off, 199), 'sentry', 'hold the left edge');
      const p = d.when(at(1, 291 + off), 'planker', 'ramp');
      d.on(p, shrugging, 'planker', 'ramp, part 2');
    },
    naive(d) {
      const p = d.when(at(1, 291), 'planker', 'ramp');
      d.on(p, shrugging, 'planker', 'ramp, part 2');
    },
  },
  // left pad window x ~256-280; step window x ~364-377; shelf pad window x ~350-370
  'crossing-paths': {
    offsets: [-6, 0, 6],
    margin: 2,
    play(d, off) {
      d.when(at(1, 268 + off, 189), 'bouncer', 'left pad');
      d.when(at(-1, 374 + Math.sign(off) * 2, 198), 'napper', 'step');
      d.when(at(-1, 360 + off, 189), 'bouncer', 'right pad');
    },
    naive(d) {
      d.when(at(1, 268, 189), 'bouncer', 'left pad');
      d.when(at(-1, 400, 198), 'bouncer', 'right pad');
    },
  },
  // pop anyone in the left pen; pad window x ~431-439 (lands on the exit rock); step window x ~333-339
  'equinox': {
    offsets: [-4, 0, 4],
    margin: 2,
    play(d, off) {
      d.until(() => d.live.filter((g) => g.y === 109).length >= 3, 'a few in the pen');
      d.when((g) => g.state === 'walking' && g.y === 109, 'popper', 'pop the floor');
      d.when(at(-1, 435 + off, 169), 'bouncer', 'aimed pad');
      d.when(at(1, 336 + Math.sign(off) * 3, 169), 'napper', 'step');
    },
    naive(d) {
      d.until(() => d.live.filter((g) => g.y === 109).length >= 3, 'a few in the pen');
      d.when((g) => g.state === 'walking' && g.y === 109, 'popper', 'pop the floor');
      d.when(at(-1, 455, 169), 'bouncer', 'pad');
      d.when(at(1, 336, 169), 'napper', 'step');
    },
  },
  // windows: bridge x 380-399, hedge tunnel x 546-559 (else it climbs into thorns), pen wall x 186-199
  'thornbrake': {
    offsets: [-6, 0, 6],
    margin: 2,
    play(d, off) {
      const scout = d.when(at(1, 120 + off), 'climber', 'scout');
      d.on(scout, (g) => g.state === 'walking' && g.dir === 1 && g.x === 390 + off && g.y === 159, 'planker', 'bridge');
      d.on(scout, shrugging, 'planker', 'bridge, part 2');
      d.on(scout, (g) => g.state === 'walking' && g.dir === 1 && g.x === 552 + off, 'tunneler', 'hedge');
      d.until(() => scout.state !== 'tunneling' && scout.x > 600, 'hedge tunnel');
      d.when(at(1, 192 + off, 159), 'tunneler', 'pen wall');
    },
    naive(d) {
      d.when(at(1, 192, 159), 'tunneler', 'pen wall');
      const p = d.when(at(1, 390, 159), 'planker', 'bridge');
      d.on(p, shrugging, 'planker', 'bridge, part 2');
      d.when(at(1, 552), 'tunneler', 'hedge');
    },
  },
  // ramp window x ~225-241 (needs 18+ planks at the cliff)
  'candlemas-leap': {
    offsets: [-8, 0, 8],
    margin: 2,
    play(d, off) {
      const scout = d.when((g) => g.state === 'walking', 'glider', 'scout');
      d.when((g) => g !== scout && at(-1, 360 + off * 3, 79)(g), 'sentry', 'hold');
      d.on(scout, at(-1, 130 + off * 3), 'planker', 'bump-turn');
      d.on(scout, at(1, 233 + off), 'planker', 'ramp');
      d.on(scout, shrugging, 'planker', 'ramp, part 2');
      d.until(() => scout.state === 'walking' && scout.dir === -1, 'ramp done');
      d.when((g) => g.state === 'sentry', 'popper', 'release');
    },
    naive(d) {
      d.when((g) => g.state === 'walking', 'glider', 'scout');
    },
  },
  // pop window: clicked x ~86-152 (pops ~72px later on the lid); gap burrow x 500-515; release x 216-229
  'burrow-relay': {
    offsets: [-8, 0, 8],
    margin: 2,
    play(d, off) {
      const lead = d.first();
      d.when((g) => g !== lead && at(1, 110 + off * 3, 99)(g), 'popper', 'blast the waiting room');
      d.on(lead, at(1, 331 + off), 'planker', 'bridge');
      d.on(lead, shrugging, 'planker', 'bridge, part 2');
      d.on(lead, at(1, 508 + Math.sign(off) * 3, 129), 'burrower', 'down the gap');
      d.until(() => lead.state === 'saved', 'lead home');
      d.when(at(1, 222 + Math.sign(off) * 4, 129), 'tunneler', 'release');
    },
    naive(d) {
      const lead = d.first();
      d.on(lead, at(1, 331), 'planker', 'bridge');
      d.on(lead, shrugging, 'planker', 'bridge, part 2');
      d.on(lead, at(1, 508, 129), 'burrower', 'down the gap');
    },
  },
  // windows: burrow x 236-318, gap 1 x 677-699, gap 2 x 734-755, scrape x 895-949, crack x 506-519
  'early-spring': {
    offsets: [-6, 0, 6],
    margin: 2,
    play(d, off) {
      d.when(at(1, 280 + off, 111), 'burrower', 'soft end');
      const scout = d.when((g) => g.state === 'walking' && g.dir === 1 && g.y === 171 && g.x < 400, 'climber', 'scout');
      d.on(scout, () => true, 'glider', 'scout leaf');
      d.on(scout, at(1, 691 + off), 'planker', 'gap 1');
      d.on(scout, at(1, 748 + off), 'planker', 'gap 2');
      d.on(scout, at(1, 925 + off), 'scraper', 'under the wall');
      d.until(() => scout.state === 'walking' && scout.y === 223, 'scout in the den');
      d.when(at(1, 512 + off, 171), 'tunneler', 'ice crack');
    },
  },
  // pad window x ~173-185; nap the first lander at x 275-279 either way; ramp out x ~384-396
  'spring-fever': {
    offsets: [-2, 0, 2],
    margin: 2,
    play(d, off) {
      d.when(at(1, 179 + off * 3, 189), 'bouncer', 'pad');
      d.until(() => d.game.groundhogs.some((g) => g.state === 'launched' && g.dir === 1), 'first over');
      const first = d.game.groundhogs.find((g) => g.state === 'launched' && g.dir === 1)!;
      if (off > 0) d.on(first, at(-1, 277), 'napper', 'plug (walking back)');
      else d.on(first, at(1, 277 + off), 'napper', 'plug');
      d.when(at(1, 390 + off * 3, 199), 'planker', 'ramp out');
    },
    naive(d) {
      d.when(at(1, 179, 189), 'bouncer', 'pad');
      d.when(at(1, 390, 199), 'planker', 'ramp out');
    },
  },
};

/** Runs one level with no clicks at all. */
function handsOff(id: string): Game {
  const lv = LEVELS.find((l) => l.id === id)!;
  const g = new Game(lv);
  for (let n = 0; g.status === 'playing' && n < (lv.timeLimit + 5) * TICK_RATE; n++) {
    g.tick();
    g.drainEvents();
  }
  return g;
}

describe('every level is winnable with room to spare', () => {
  for (const lv of LEVELS) {
    const sol = SOLUTIONS[lv.id];
    it(lv.id, () => {
      expect(sol, `no solution for ${lv.id}`).toBeDefined();
      for (const off of sol.offsets) {
        const d = new Director(lv.id);
        sol.play(d, off);
        d.finish();
        expect(d.game.status, `${d.report()} (offset ${off})`).toBe('won');
        expect(d.game.saved - lv.required, `${d.report()} margin (offset ${off})`).toBeGreaterThanOrEqual(sol.margin);
      }
    });
  }
});

describe('nobody gets home on their own', () => {
  for (const lv of LEVELS) {
    it(lv.id, () => {
      const g = handsOff(lv.id);
      expect(g.status).toBe('lost');
      expect(g.saved).toBe(0);
    });
  }
});

describe('the obvious approach is not enough', () => {
  for (const lv of LEVELS) {
    const naive = SOLUTIONS[lv.id]?.naive;
    if (!naive) continue;
    it(lv.id, () => {
      const d = new Director(lv.id);
      try {
        naive(d);
      } catch {
        // the naive plan may stall (nobody reaches the next spot); play out whatever happened
      }
      d.finish();
      expect(d.game.status, d.report()).toBe('lost');
    });
  }
});

describe('the curve', () => {
  it('every level from 7 on has a naive-approach check, except skill intros', () => {
    const exempt = new Set(['pop-the-cork', 'spring-loaded', 'forty-winks', 'early-spring']);
    for (const lv of LEVELS.slice(6)) if (!exempt.has(lv.id)) expect(SOLUTIONS[lv.id]?.naive, lv.id).toBeDefined();
  });

  it('introduces popper, bouncer and napper before using them in puzzles', () => {
    const firstUse = (s: SkillId) => LEVELS.findIndex((l) => (l.skills[s] ?? 0) > 0);
    for (const [skill, intro] of [['popper', 'hold-the-line'], ['bouncer', 'spring-loaded'], ['napper', 'forty-winks']] as const) {
      expect(LEVELS[firstUse(skill)].id, skill).toBe(intro);
      expect(LEVELS.filter((l) => (l.skills[skill] ?? 0) > 0).length, skill).toBeGreaterThanOrEqual(3);
    }
  });
});

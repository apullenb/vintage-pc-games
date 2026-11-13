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

  private step(): void {
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

type Solution = (d: Director, off: number) => void;

// offsets: every positional trigger is shifted by each of these; they span the slack a player has.
const SOLUTIONS: Record<string, { offsets: number[]; play: Solution }> = {
  // burrow anywhere on the shelf ahead of the crowd
  'first-thaw': {
    offsets: [-40, 0, 40],
    play(d, off) {
      d.when(at(1, 280 + off, 139), 'burrower');
    },
  },
  'six-more-weeks': {
    offsets: [0],
    play(d) {
      for (let i = 0; i < d.game.level.count; i++) d.when((g) => !g.isGlider, 'glider', `glider #${i + 1}`);
    },
  },
  'root-cellar': {
    offsets: [-8, 0, 4],
    play(d, off) {
      d.when(at(1, 275 + off, 199), 'tunneler', 'wall 1');
      d.when(at(1, 515 + off, 199), 'tunneler', 'wall 2');
    },
  },
  // ramp out of the ditch, then bridge the stream (windows ~17px and ~22px)
  'clover-bridge': {
    offsets: [-6, 0, 8],
    play(d, off) {
      d.when(at(1, 152 + off, 199), 'planker', 'ditch ramp');
      d.when(at(1, 390 + off, 179), 'planker', 'stream bridge');
    },
  },
  // climbers for everyone, any time
  'shadow-check': {
    offsets: [0],
    play(d) {
      for (let i = 0; i < d.game.level.count; i++) d.when((g) => !g.isClimber, 'climber', `climber #${i + 1}`);
    },
  },
  // sentry on the rock (window ~20px), pop it, scrape in the dirt patch (window ~17px)
  'hold-the-line': {
    offsets: [-8, 0, 6],
    play(d, off) {
      const sentry = d.when(at(1, 358 + off, 119), 'sentry', 'hold the line');
      d.wait(20 * TICK_RATE); // let the crowd gather
      d.on(sentry, () => true, 'popper', 'release');
      d.when(at(1, 378 + off, 119), 'scraper', 'cut down');
    },
  },
  'burrow-down': {
    offsets: [-6, 0, 6],
    play(d, off) {
      d.when(at(1, 300 + off, 89), 'burrower', 'soft spot');
      d.when(at(1, 512 + off, 149), 'tunneler', 'wall');
    },
  },
  // scraper window x 672-700
  'twin-hollows': {
    offsets: [-8, 0, 8],
    play(d, off) {
      d.when(at(1, 200 + off, 139), 'burrower', 'left plateau');
      d.when(at(-1, 688 + off, 109), 'scraper', 'right buttress');
    },
  },
  // two chained plankers from x 285-297 (three from x 250-288 also work)
  'groundhog-day': {
    offsets: [-6, 0, 6],
    play(d, off) {
      d.when(at(-1, 185 + off, 199), 'sentry', 'hold the left edge');
      const p = d.when(at(1, 291 + off), 'planker', 'ramp');
      d.on(p, (g) => g.state === 'shrugging', 'planker', 'ramp, part 2');
    },
  },
  // windows: bridge x 380-399, hedge tunnel x 546-559 (else it climbs into thorns), pen wall x 186-199
  'thornbrake': {
    offsets: [-6, 0, 6],
    play(d, off) {
      const scout = d.when(at(1, 120 + off), 'climber', 'scout');
      d.on(scout, (g) => g.state === 'walking' && g.dir === 1 && g.x === 390 + off && g.y === 159, 'planker', 'bridge');
      d.on(scout, (g) => g.state === 'shrugging', 'planker', 'bridge, part 2');
      d.on(scout, (g) => g.state === 'walking' && g.dir === 1 && g.x === 552 + off, 'tunneler', 'hedge');
      d.until(() => scout.state !== 'tunneling' && scout.x > 600, 'hedge tunnel');
      d.when(at(1, 192 + off, 159), 'tunneler', 'pen wall');
    },
  },
  // windows: burrow x 236-318, gap 1 x 677-699, gap 2 x 734-755, scrape x 895-949, crack x 506-519
  'early-spring': {
    offsets: [-6, 0, 6],
    play(d, off) {
      d.when(at(1, 280 + off, 111), 'burrower', 'soft end');
      const scout = d.when((g) => g.state === 'walking' && g.dir === 1 && g.y === 171 && g.x < 400, 'climber', 'scout');
      d.on(scout, () => true, 'glider', 'scout leaf');
      const walkingAt = (x: number) => (g: Groundhog) => g.state === 'walking' && g.dir === 1 && g.x === x;
      d.on(scout, walkingAt(691 + off), 'planker', 'gap 1');
      d.on(scout, walkingAt(748 + off), 'planker', 'gap 2');
      d.on(scout, walkingAt(925 + off), 'scraper', 'under the wall');
      d.until(() => scout.state === 'walking' && scout.y === 223, 'scout in the den');
      d.when(at(1, 512 + off, 171), 'tunneler', 'ice crack');
    },
  },
  // plank windows: stream x 402-418, rock step x 564-580
  'long-winter': {
    offsets: [-6, 0, 6],
    play(d, off) {
      d.when(at(1, 203 + off, 179), 'tunneler', 'snow mound');
      d.when(at(1, 410 + off, 179), 'planker', 'stream');
      d.when(at(1, 572 + off, 179), 'planker', 'rock step');
      d.when(at(1, 993 + off), 'tunneler', 'snowbank');
    },
  },
};

describe('every level is winnable', () => {
  for (const lv of LEVELS) {
    const sol = SOLUTIONS[lv.id];
    it.skipIf(!sol)(lv.id, () => {
      for (const off of sol!.offsets) {
        const d = new Director(lv.id);
        sol!.play(d, off);
        d.finish();
        expect(d.game.status, `${d.report()} (offset ${off})`).toBe('won');
      }
    });
  }
});

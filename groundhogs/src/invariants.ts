// Test-only physics invariants, checked after every tick (see invariants.test.ts, solutions.test.ts).
import type { Game } from './game.ts';
import { EMPTY, MOUND, GH_HEIGHT, MAX_STEP_DOWN, MAX_STEP_UP, PLANK, PLANK_W, ROCK, SENTRY_REACH, TICK_RATE } from './types.ts';
import type { GHState, Groundhog } from './types.ts';

/** Per-state rules; extend this table when adding states. */
export interface StateRule {
  /** 'clear': no terrain but planks in the feet/body column; 'noRock': only rock forbidden; 'skip': unchecked. */
  body: 'clear' | 'noRock' | 'skip';
  /** 'ground': solid within y+1..y+2 under x-1..x+1; 'wall': a wall at x+dir. */
  support: 'ground' | 'wall' | 'none';
  /** May stay put past the stuck window (sentries, animations). */
  mayIdle: boolean;
  /** Max |dx| per tick. */
  maxDx: number;
}

const rule = (body: StateRule['body'], support: StateRule['support'], mayIdle = false, maxDx = 1): StateRule =>
  ({ body, support, mayIdle, maxDx });

export const STATE_RULES: Record<GHState, StateRule> = {
  walking: rule('clear', 'ground'),
  falling: rule('clear', 'none'),
  gliding: rule('clear', 'none'),
  climbing: rule('clear', 'wall'),
  hoisting: rule('clear', 'ground'),
  sentry: rule('clear', 'ground', true),
  planking: rule('clear', 'ground', false, 3), // PLANK_ADVANCE per plank
  shrugging: rule('clear', 'ground'),
  tunneling: rule('noRock', 'ground'),
  burrowing: rule('noRock', 'ground'),
  scraping: rule('noRock', 'ground'),
  exiting: rule('noRock', 'none', true, 7), // last step (<=3) plus a door snap (<=4); a mound may cover the door
  planting: rule('clear', 'ground'),
  napping: rule('clear', 'ground'),
  launched: rule('clear', 'none', false, 3), // BOUNCE_VX plus rounding
  // death/removal animations
  splatting: rule('skip', 'none', true, 0),
  drowning: rule('skip', 'none', true, 0),
  poofing: rule('skip', 'none', true, 0),
  saved: rule('skip', 'none', true, 0),
  dead: rule('skip', 'none', true, 0),
};

const GONE: ReadonlySet<GHState> = new Set(['saved', 'dead']);
const STUCK_TICKS = 2 * TICK_RATE;

interface Track {
  x: number;
  y: number;
  dir: number;
  state: GHState;
  stillSince: number; // tick when (x,y,state) last changed
  unsupported: number; // consecutive checks without support
  inPlank: number; // consecutive checks with a plank across a walker's feet
  walkXs: number[]; // x history while continuously walking
}

export class InvariantChecker {
  private readonly game: Game;
  private readonly tracks = new Map<number, Track>();

  constructor(game: Game) {
    this.game = game;
  }

  /** Call after every tick; throws on the first violation. */
  check(): void {
    const { game } = this;
    const t = game.terrain;
    const fail = (g: Groundhog, msg: string): never => {
      throw new Error(`${game.level.id} tick ${game.ticks}: #${g.id} ${g.state} @${g.x},${g.y} dir ${g.dir}: ${msg}`);
    };
    // planks are one-way platforms; everything else blocks a body
    const blocks = (x: number, y: number) => {
      const m = t.get(x, y);
      return m !== EMPTY && m !== PLANK;
    };
    const live = game.groundhogs.filter((g) => !GONE.has(g.state));
    if (game.spawned !== game.saved + game.dead + live.length) {
      throw new Error(`${game.level.id} tick ${game.ticks}: counts out of sync`);
    }
    const sentries = live.filter((g) => g.state === 'sentry');

    for (const g of live) {
      const r = STATE_RULES[g.state];
      const gx = Math.round(g.x), gy = Math.round(g.y); // launched groundhogs fly at fractional x/y
      if (gx < 0 || gx >= t.width || gy < 0 || gy >= t.height) fail(g, 'out of bounds');
      const prev = this.tracks.get(g.id);
      if (r.body === 'skip') {
        this.tracks.delete(g.id);
        continue;
      }

      // no clipping
      for (let yy = gy - GH_HEIGHT + 1; yy <= gy; yy++) {
        if (t.get(gx, yy) === ROCK) fail(g, `rock in body at y=${yy}`);
        if (r.body === 'clear' && blocks(gx, yy)) fail(g, `terrain in body at y=${yy}`);
      }
      // a plank may be laid across a walker's feet; it must get out within about a plank's length
      const inPlank = g.state === 'walking' && t.get(gx, gy) === PLANK ? (prev?.inPlank ?? 0) + 1 : 0;
      if (inPlank > 2 * PLANK_W) fail(g, 'feet stuck inside a plank');

      // no floating (terrain may vanish after this groundhog's update: it must react next tick)
      let supported = true;
      if (r.support === 'ground') {
        supported = false;
        for (let dx = -1; dx <= 1 && !supported; dx++) {
          if (t.isSolid(gx + dx, gy + 1) || t.isSolid(gx + dx, gy + 2)) supported = true;
        }
      } else if (r.support === 'wall') {
        supported = t.isSolid(gx + g.dir, gy) || t.isSolid(gx + g.dir, gy + 1);
      }
      const dropped = prev !== undefined && gy > prev.y; // dropping toward new ground counts as reacting
      const unsupported = supported ? 0 : dropped ? 1 : (prev?.unsupported ?? 0) + 1;
      if (unsupported > 1) fail(g, r.support === 'wall' ? 'climbing without a wall' : 'floating');

      // motion
      if (prev) {
        const dx = gx - prev.x;
        const maxDx = Math.max(r.maxDx, STATE_RULES[prev.state].maxDx);
        if (Math.abs(dx) > maxDx) fail(g, `jumped ${dx}px from ${prev.state}`);
        if (Math.abs(dx) > 1 && g.state !== 'exiting') {
          // mounds can appear later in the same tick, so they don't count against the path
          const bodyBlocked = (c: number, y: number) => {
            for (let yy = y - GH_HEIGHT + 1; yy <= y; yy++) if (blocks(c, yy) && t.get(c, yy) !== MOUND) return true;
            return false;
          };
          const flying = g.state === 'launched' || prev.state === 'launched';
          for (let c = prev.x + Math.sign(dx); c !== gx; c += Math.sign(dx)) {
            // a diagonal flight passes intermediate columns somewhere between the two heights
            const mid = Math.round(prev.y + ((gy - prev.y) * (c - prev.x)) / dx);
            const clear = !bodyBlocked(c, gy) || (flying && (!bodyBlocked(c, prev.y) || !bodyBlocked(c, mid)));
            if (!clear) fail(g, `swept through x=${c}`);
          }
        }
        if (prev.state === 'walking' && g.state === 'walking' && g.stateTicks > 0) {
          // a counting-down popper waits pressed against a wall
          if (dx === 0 && g.dir === prev.dir && gy === prev.y && g.alarmTicks < 0) fail(g, 'walker neither moved nor turned');
          // a fresh napper mound may heave walkers up onto itself
          const heaved = [...Array(Math.max(0, prev.y - gy + 1)).keys()].some(
            (k) => t.get(gx, gy + k) === MOUND || t.get(prev.x, gy + k) === MOUND,
          );
          if (prev.y - gy > MAX_STEP_UP && !heaved) fail(g, `stepped up ${prev.y - gy}px`);
          if (gy - prev.y > MAX_STEP_DOWN) fail(g, `stepped down ${gy - prev.y}px`);
        }
      }

      // stuck / jitter (pacing between real walls is fine; a 1-2px shuffle is not)
      const moved = !prev || prev.x !== gx || prev.y !== gy || prev.state !== g.state;
      const stillSince = moved ? game.ticks : prev.stillSince;
      const nearSentry = sentries.some((s) => s !== g && Math.abs(s.x - gx) <= SENTRY_REACH + 2 && Math.abs(s.y - gy) <= 6);
      // pacing in a pocket with real walls on both sides is legitimate
      const wall = (c: number) => c < 3 || c > t.width - 4 || [...Array(GH_HEIGHT).keys()].some((k) => blocks(c, gy - k));
      const waiting = nearSentry || g.alarmTicks > 0 || (g.state === 'walking' && wall(gx - 1) && wall(gx + 1));
      if (!r.mayIdle && !waiting && game.ticks - stillSince >= STUCK_TICKS) fail(g, 'stuck');
      let walkXs: number[] = [];
      if (g.state === 'walking') {
        // history restarts whenever it changes height (e.g. sinking along with a burrower)
        walkXs = prev && prev.state === 'walking' && prev.y === gy ? prev.walkXs : [];
        walkXs.push(gx);
        if (walkXs.length > STUCK_TICKS) walkXs.shift();
        const lo = Math.min(...walkXs), hi = Math.max(...walkXs);
        if (walkXs.length === STUCK_TICKS && !waiting && hi - lo <= 1 && !(wall(lo - 1) && wall(hi + 1))) {
          fail(g, 'jittering in place');
        }
      }
      this.tracks.set(g.id, { x: gx, y: gy, dir: g.dir, state: g.state, stillSince, unsupported, inPlank, walkXs });
    }
  }
}

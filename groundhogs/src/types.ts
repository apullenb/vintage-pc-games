// Shared contract between modules. Change only with care: every module depends on it.
// Note: tsconfig has erasableSyntaxOnly — no enums, no namespaces, no constructor parameter properties.

// ---------- timing / view ----------
export const TICK_RATE = 24; // logic ticks per second
export const VIEW_W = 480; // logical px of the play viewport
export const VIEW_H = 240; // logical px; every level is exactly this tall

// ---------- terrain materials (Terrain.mask values) ----------
export const EMPTY = 0;
export const DIRT = 1; // diggable
export const ROCK = 2; // indestructible
export const PLANK = 3; // diggable, laid by planker
export const MOUND = 4; // diggable, left by a napper (hibernation mound)
export type Material = typeof EMPTY | typeof DIRT | typeof ROCK | typeof PLANK | typeof MOUND;

// ---------- physics constants (levels must be designed around these) ----------
export const GH_HEIGHT = 10; // body spans y-9..y (y = feet row)
export const GH_HALF_W = 3; // body spans x-3..x+3
export const WALK_SPEED = 1; // px per tick
export const MAX_STEP_UP = 6; // taller wall => turn around (or climb)
export const MAX_STEP_DOWN = 3; // deeper drop => start falling
export const FALL_SPEED = 3; // px per tick
export const SAFE_FALL = 64; // fall distance (px) above this kills unless glider
export const GLIDE_OPEN_AFTER = 16; // glider opens leaf after falling this far
export const GLIDE_SPEED = 1; // px per tick while gliding
export const PLANK_COUNT = 12; // planks per planker job
export const PLANK_W = 6; // plank length px (1px thick)
export const PLANK_ADVANCE = 3; // planker moves forward this much per plank
export const PLANK_RISE = 2; // and up this much per plank  => 12 planks = 24px up, 36px across
export const PLANK_TICKS = 8; // ticks to lay one plank
export const TUNNEL_HEIGHT = 10; // tunneler carves a horizontal tunnel this tall
export const BURROW_WIDTH = 9; // burrower digs a shaft this wide, 1px deeper every 2 ticks
export const SCRAPE_RADIUS = 5; // scraper carves diagonal down-forward with this radius
export const POP_RADIUS = 8; // popper crater: circle centred on the feet (x, y), so it blasts ~8px down/forward/back and ~8px up; never removes ROCK
// bouncer: plants a springy mushroom pad; walkers stepping on it are launched in an arc
export const PLANT_TICKS = 12; // ticks to plant a pad
export const PAD_REACH = 3; // walker feet within this x of pad (and |dy| <= 2) => launched
export const BOUNCE_VX = 2; // px per tick, in walker's dir
export const BOUNCE_VY = -6; // initial vertical speed (up)
export const GRAVITY = 0.35; // px per tick^2 while launched => apex ~51px up, ~68px across on flat ground
// napper: curls up and hardens into a MOUND of earth (groundhog is lost, counts as dead)
export const NAP_TICKS = 20; // curl-up anim before hardening
export const NAP_RX = 7; // mound half-width
export const NAP_RY = 6; // mound height above feet row; fills EMPTY pixels only (also fills down into gaps/water below feet to NAP_RY)
export const SENTRY_REACH = 5; // walkers turn when within this many px of a sentry's x (moving toward it)

// ---------- skills ----------
export type SkillId = 'climber' | 'glider' | 'sentry' | 'planker' | 'tunneler' | 'burrower' | 'scraper' | 'popper' | 'bouncer' | 'napper';
export const SKILLS: readonly SkillId[] = ['climber', 'glider', 'sentry', 'planker', 'tunneler', 'burrower', 'scraper', 'popper', 'bouncer', 'napper'];
export const SKILL_LABELS: Record<SkillId, string> = {
  climber: 'Climber', // permanent: scales vertical walls
  glider: 'Glider', // permanent: leaf parachute, survives any fall
  sentry: 'Sentry', // stands up on hind legs, turns others around
  planker: 'Planker', // lays a rising ramp of planks
  tunneler: 'Tunneler', // digs horizontally
  burrower: 'Burrower', // digs straight down
  scraper: 'Scraper', // digs diagonally down
  popper: 'Popper', // 3s countdown then pops in a dust puff (dies), leaving a small crater; works on sentries
  bouncer: 'Bouncer', // plants a springy mushroom pad that launches walkers up and over
  napper: 'Napper', // curls up to hibernate and hardens into a walkable mound (sacrifice)
};

// ---------- levels ----------
export type ShapeMat = 'dirt' | 'rock';
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; mat?: ShapeMat; erase?: boolean }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; mat?: ShapeMat; erase?: boolean }
  | { kind: 'poly'; points: [number, number][]; mat?: ShapeMat; erase?: boolean };
// Shapes paint in order; mat defaults to 'dirt'; erase:true clears to EMPTY instead.

export type Theme = 'meadow' | 'burrow' | 'dusk' | 'winter';

export interface Hazard {
  kind: 'water' | 'thorns'; // both kill on contact (feet inside rect)
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LevelDef {
  id: string;
  name: string;
  hint?: string; // one-line briefing shown before the level
  width: number; // world width px, 480..1600
  theme: Theme;
  shapes: Shape[];
  entrances: { x: number; y: number }[]; // drop point: groundhogs appear with feet at (x,y) and fall
  exits: { x: number; y: number }[]; // feet position at the exit door; feet within 4px x / 6px y => saved
  hazards: Hazard[];
  count: number; // groundhogs released
  required: number; // must save at least this many
  releaseRate: number; // 1..99, also the minimum the player may set
  timeLimit: number; // seconds
  skills: Partial<Record<SkillId, number>>; // missing => 0
  startX?: number; // initial camera x (left edge)
}

// ---------- groundhogs ----------
export type GHState =
  | 'falling'
  | 'walking'
  | 'climbing'
  | 'hoisting' // pulling itself over the top of a climbed wall
  | 'gliding'
  | 'sentry'
  | 'planking'
  | 'shrugging' // out of planks
  | 'tunneling'
  | 'burrowing'
  | 'scraping'
  | 'splatting' // death anim after long fall
  | 'drowning' // death anim in hazard
  | 'exiting' // entering the exit door anim
  | 'poofing' // alarm/popper death anim (puff of dust)
  | 'planting' // bouncer planting a pad (PLANT_TICKS), then walks on
  | 'launched' // flying in an arc off a pad (x/y may be fractional; uses vx/vy)
  | 'napping' // curling up (NAP_TICKS), then becomes MOUND terrain and is removed as dead
  | 'saved' // removed, counted saved
  | 'dead'; // removed, counted dead

export interface Groundhog {
  id: number;
  x: number; // feet center
  y: number; // feet row (ground is at y+1)
  dir: 1 | -1;
  state: GHState;
  stateTicks: number; // ticks spent in current state (drives animation)
  isClimber: boolean;
  isGlider: boolean;
  fallDist: number;
  work: number; // planks left etc.
  vx: number; // launched only
  vy: number; // launched only
  alarmTicks: number; // -1 = no alarm; else ticks until poof (show countdown 3,2,1 above head)
}

// ---------- terrain (implemented in terrain.ts; pure data, no DOM) ----------
export interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BouncePad {
  id: number;
  x: number; // ground contact point (feet row of the planter)
  y: number;
  lastBounce: number; // game tick of last launch, -1 if never (art squashes the cap briefly)
}

export interface TerrainAPI {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array; // index = y * width + x, values are Material
  get(x: number, y: number): Material; // out of bounds => EMPTY
  isSolid(x: number, y: number): boolean;
  // Dirty regions since last takeDirty(); renderer repaints those pixels.
  takeDirty(): DirtyRect[];
}

// ---------- game (implemented in game.ts as `export class Game implements GameAPI`, constructor(level: LevelDef)) ----------
export type GameEvent =
  | { type: 'spawn'; id: number }
  | { type: 'assign'; id: number; skill: SkillId }
  | { type: 'assign-fail' }
  | { type: 'splat'; id: number }
  | { type: 'drown'; id: number }
  | { type: 'saved'; id: number }
  | { type: 'plank-low'; id: number } // 3 planks left
  | { type: 'hatch-open' }
  | { type: 'bounce'; id: number }
  | { type: 'nap'; id: number }
  | { type: 'end'; won: boolean };

export interface GameAPI {
  readonly level: LevelDef;
  readonly terrain: TerrainAPI;
  readonly groundhogs: readonly Groundhog[];
  readonly pads: readonly BouncePad[]; // removed when the ground under them is dug away // includes saved/dead ones; skip those when drawing
  readonly skillsLeft: Record<SkillId, number>;
  readonly releaseRate: number;
  readonly ticks: number;
  readonly hatchOpen: number; // 0..1 entrance open animation progress
  readonly spawned: number;
  readonly saved: number;
  readonly dead: number;
  readonly alive: number; // spawned - saved - dead
  readonly timeLeft: number; // seconds remaining (float)
  readonly status: 'playing' | 'won' | 'lost';
  tick(): void; // one logic step; no-op once status != 'playing'
  setReleaseRate(rate: number): void; // clamped to [level.releaseRate, 99]
  // Best groundhog under world point for this skill (prefers ones the skill can apply to), radius ~6px.
  pickAt(wx: number, wy: number, skill: SkillId | null): Groundhog | null;
  assignSkill(g: Groundhog, skill: SkillId): boolean; // consumes a skill charge on success
  alarm(): void; // "wake-up alarm": stops release; every live groundhog dies in a puff after a 3s countdown (panic button)
  drainEvents(): GameEvent[];
}

// ---------- art (implemented in art.ts) ----------
// All drawing is in logical pixels onto a ctx with imageSmoothingEnabled = false.
// sx/sy are SCREEN coords (world - camera). Groundhog sprites are anchored at feet center.
export interface ArtAPI {
  drawGroundhog(ctx: CanvasRenderingContext2D, g: Groundhog, sx: number, sy: number, highlighted: boolean): void;
  renderBackground(theme: Theme, width: number, height: number): HTMLCanvasElement; // full world-size backdrop
  drawEntrance(ctx: CanvasRenderingContext2D, sx: number, sy: number, open: number, tick: number, anchorY?: number): void; // sx,sy = drop point; anchorY = screen y of ceiling the log hangs from (default 0)
  drawExit(ctx: CanvasRenderingContext2D, sx: number, sy: number, tick: number): void; // sx,sy = exit feet point
  drawHazard(ctx: CanvasRenderingContext2D, h: Hazard, camX: number, tick: number): void;
  drawBouncePad(ctx: CanvasRenderingContext2D, sx: number, sy: number, tick: number, ticksSinceBounce: number): void; // sx,sy = pad ground point
  skillIcon(skill: SkillId): HTMLCanvasElement; // 16x16 logical icon for the toolbar
  // Paints terrain pixels for the given region from terrain.mask into a world-size canvas (transparent where EMPTY).
  createTerrainView(terrain: TerrainAPI, theme: Theme): { canvas: HTMLCanvasElement; update(rects: DirtyRect[]): void };
}

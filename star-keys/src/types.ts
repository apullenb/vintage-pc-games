// Shared contract between modules. Change only with care: every module depends on it.
// tsconfig has erasableSyntaxOnly — no enums, no namespaces, no constructor parameter properties.

// ---------- view / timing ----------
export const VIEW_W = 480; // logical px of the play viewport
export const VIEW_H = 270; // logical px; every world is exactly this tall
export const TICK_RATE = 60; // fixed logic steps per second (engine tick(dt) uses dt = 1 / TICK_RATE)

// ---------- hero ----------
export const HERO_W = 16; // sprite box, feet-centre anchored
export const HERO_H = 24;
export type HeroPose =
  | 'idle' // waiting for input (breathing, looking back at the danger now and then)
  | 'run'
  | 'jump' // arcing hop between platforms
  | 'jet' // jetpack burst (long or upward gaps)
  | 'climb' // ladder / rope
  | 'float' // zero-g drift
  | 'hurt' // typo or threat contact flinch (short)
  | 'scared' // threat very close, idle variant
  | 'cheer' // reached escape
  | 'board' // climbing into escape craft
  | 'faint'; // lost (hp 0)
export type MoveKind = 'run' | 'jump' | 'jet' | 'climb' | 'float';

// ---------- worlds ----------
export type Theme =
  | 'launchpad'
  | 'moon'
  | 'asteroids'
  | 'mars'
  | 'icemoon'
  | 'jungle'
  | 'station'
  | 'gasgiant'
  | 'factory'
  | 'comet'
  | 'blackhole'
  | 'nova';
export type ThreatKind =
  | 'fuel-fire' // spreading fire on the launch pad
  | 'moonquake' // ground crumbling away behind
  | 'meteors' // meteor shower rolling in
  | 'dust-storm'
  | 'ice-crack' // ice shattering into the dark sea below
  | 'slug' // giant space slug chasing
  | 'oxygen' // airlock venting: vacuum wave pulling debris
  | 'lightning' // gas giant storm wall
  | 'crusher' // factory crusher line
  | 'comet-tail' // comet breaking apart
  | 'black-hole' // event horizon creeping
  | 'supernova'; // expanding shockwave
export type PlatformKind = 'rock' | 'metal' | 'ice' | 'crystal' | 'moss' | 'none';
export type EscapeKind = 'rocket' | 'shuttle' | 'portal';

export interface Waypoint {
  x: number; // feet position in world px
  y: number;
  move: MoveKind; // how the hero gets HERE from the previous waypoint (ignored for the first)
  platform: PlatformKind; // what he stands on here ('none' = floating / ladder top)
  platformW?: number; // platform width px (default 24)
}

export interface Lesson {
  newKeys: string; // keys introduced this world, e.g. "fj" (shown with finger guide)
  tip: string; // one-line coaching tip ("Rest your index fingers on the bumps of F and J")
}

export interface LevelDef {
  id: string;
  name: string; // world name, e.g. "Launch Pad"
  theme: Theme;
  threat: ThreatKind;
  story: string; // 1-2 lines: what the danger is and why Comet must run
  lesson: Lesson;
  keys: string; // every character a prompt may contain (case-sensitive; ' ' allowed in phrases)
  words: string[]; // prompt pool; each prompt uses only `keys`
  steps: number; // prompts to complete = path.length - 1
  path: Waypoint[]; // path[0] = start; path[steps] = escape craft position
  width: number; // world width px (>= VIEW_W)
  escape: EscapeKind;
  hp: number; // starting hearts
  threatSpeed: number; // px/s along the path (arc length)
  threatAccel: number; // px/s^2 (0 = constant)
  threatStart: number; // px of path distance the threat starts BEHIND the hero (>0)
  graceSeconds: number; // threat waits this long after the first keypress (right or wrong)
  targetWpm: number; // 3-star speed
}

// ---------- typing run (engine.ts: `export class Run implements RunAPI`, constructor(level, seed)) ----------
export const MOVE_SPEED = 140; // hero px/s along path while moving (jet/jump may use their own arcs, same duration budget)
export const TYPO_DAMAGE = 1; // hp per wrong key
export const CLEAN_HEAL = 1; // hp regained (up to level.hp) per prompt typed with no wrong keys
export const CONTACT_DAMAGE = 1; // hp per CONTACT_INTERVAL while threat touches hero
export const CONTACT_INTERVAL = 0.8; // seconds
export const CONTACT_GAP = 6; // px: threat front within this of hero = contact
export const NEAR_GAP = 60; // px: threat within this = 'danger' (scared pose, warning UI)
export const HURT_TIME = 0.35; // seconds of hurt pose / invulnerability to repeated contact

export type RunStatus = 'ready' | 'playing' | 'won' | 'lost';

export interface RunStats {
  correct: number; // correct keystrokes
  wrong: number; // wrong keystrokes
  elapsed: number; // seconds of play (from first key)
  wpm: number; // (correct / 5) / minutes typing (first key to final keystroke), live
  accuracy: number; // 0..1
  missed: Record<string, number>; // expected char -> times a wrong key was pressed instead
}

export type RunEvent =
  | { type: 'start' }
  | { type: 'correct'; char: string }
  | { type: 'wrong'; expected: string; got: string }
  | { type: 'word'; word: string; index: number } // prompt completed
  | { type: 'move'; from: number; to: number; move: MoveKind }
  | { type: 'arrive'; index: number }
  | { type: 'hurt'; cause: 'typo' | 'threat' }
  | { type: 'heal' } // clean prompt restored a heart
  | { type: 'danger'; on: boolean } // threat entered/left NEAR_GAP
  | { type: 'won' }
  | { type: 'lost' };

export interface RunAPI {
  readonly level: LevelDef;
  readonly status: RunStatus;
  readonly prompts: readonly string[]; // the run's chosen prompts (length = steps), seeded from level.words
  readonly index: number; // current prompt index (== steps when all typed)
  readonly typed: number; // correct chars typed in current prompt
  readonly hp: number;
  readonly heroX: number; // world px (feet)
  readonly heroY: number;
  readonly heroPose: HeroPose;
  readonly heroPoseTime: number; // seconds in current pose (animation)
  readonly heroDir: 1 | -1;
  readonly heroAt: number; // waypoint index the hero last reached
  readonly threatS: number; // threat front, path distance (can be negative = behind start)
  readonly threatX: number; // threat front in world px (projected on the path)
  readonly threatY: number;
  readonly heroS: number; // hero path distance
  readonly danger: boolean;
  readonly stats: RunStats;
  nextChar(): string | null; // expected next character (for keyboard highlight), null when done
  input(char: string): void; // one typed character (already resolved for shift); ignored unless ready/playing
  tick(dt: number): void; // advance animation/threat; threat only moves once status === 'playing'
  drainEvents(): RunEvent[];
  stars(): 0 | 1 | 2 | 3; // after won: 1 = escaped, 2 = accuracy >= 0.9, 3 = also wpm >= targetWpm
}

// ---------- art (art.ts named exports) ----------
// Logical-pixel drawing onto a ctx with imageSmoothingEnabled = false. sx/sy are SCREEN coords.
export interface ParallaxLayer {
  canvas: HTMLCanvasElement;
  factor: number; // scroll factor (0 = fixed sky, 1 = moves with world)
}
export interface ArtAPI {
  renderBackground(theme: Theme, worldWidth: number): ParallaxLayer[]; // back to front, all VIEW_H tall
  drawHero(ctx: CanvasRenderingContext2D, pose: HeroPose, t: number, sx: number, sy: number, dir: 1 | -1, flash: boolean): void;
  drawPlatform(ctx: CanvasRenderingContext2D, kind: PlatformKind, theme: Theme, sx: number, sy: number, w: number): void; // sx = platform CENTRE, sy = walking surface
  // Threat body occupying everything BEHIND frontSx (frontSx = screen x of the threat front; it chases rightward).
  drawThreat(ctx: CanvasRenderingContext2D, kind: ThreatKind, frontSx: number, frontSy: number, t: number, closeness: number): void; // closeness 0..1 (1 = touching)
  drawEscape(ctx: CanvasRenderingContext2D, kind: EscapeKind, sx: number, sy: number, t: number, phase: 'idle' | 'boarding' | 'launch'): void; // 'launch': t = seconds since launch began
  drawConnector(ctx: CanvasRenderingContext2D, move: MoveKind, theme: Theme, ax: number, ay: number, bx: number, by: number): void; // ladder/rope/dotted jet guide between waypoints
  heart(full: boolean): HTMLCanvasElement; // 9x8 HUD icon
  worldIcon(theme: Theme): HTMLCanvasElement; // 32x32 planet badge for the star map
}

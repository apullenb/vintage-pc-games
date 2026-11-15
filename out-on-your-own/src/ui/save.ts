// Saved game + lifetime progress in localStorage. Every access is guarded.
import type { GameState, PathId } from '../engine/types.ts';

const GAME = 'out-on-your-own.game.v1';
const META = 'out-on-your-own.meta.v1';

export interface Meta {
  best: Partial<Record<PathId, { score: number; grade: string }>>;
  achievements: string[];
  handbook: string[];
  muted: boolean;
  fast: boolean; // skip typewriter
  runs: number;
  tutorialDone: boolean; // first-week coach marks seen (or skipped)
  bigText: boolean; // larger reading text
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage unavailable: progress lasts this session only
  }
}

export function loadGame(): GameState | null {
  const g = read<GameState>(GAME);
  if (!g || g.v !== 1 || !g.stats || !Array.isArray(g.queue)) return null;
  return g;
}
export function saveGame(g: GameState | null): void {
  write(GAME, g);
}

export function loadMeta(): Meta {
  const m = read<Partial<Meta>>(META) ?? {};
  return {
    best: m.best && typeof m.best === 'object' ? m.best : {},
    achievements: Array.isArray(m.achievements) ? m.achievements.filter((x) => typeof x === 'string') : [],
    handbook: Array.isArray(m.handbook) ? m.handbook.filter((x) => typeof x === 'string') : [],
    muted: m.muted === true,
    fast: m.fast === true,
    runs: typeof m.runs === 'number' ? m.runs : 0,
    tutorialDone: m.tutorialDone === true,
    bigText: m.bigText === true,
  };
}
export function saveMeta(m: Meta): void {
  write(META, m);
}

// Merge a game's unlocks into lifetime progress.
export function mergeMeta(m: Meta, g: GameState): Meta {
  const ach = new Set([...m.achievements, ...g.achievements]);
  const hb = new Set([...m.handbook, ...g.handbook]);
  if (ach.size === m.achievements.length && hb.size === m.handbook.length) return m;
  return { ...m, achievements: [...ach], handbook: [...hb] };
}

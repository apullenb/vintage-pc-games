// Single seam to the engine / art / levels modules.
import { art as artImpl, ESCAPE_DOOR as doorImpl } from '../art';
import { Run } from '../engine';
import { FINGERS as fingersImpl, fingerFor as fingerForImpl, LEVELS as levelsImpl } from '../levels';
import type { ArtAPI, EscapeKind, LevelDef, RunAPI } from '../types';

export const art: ArtAPI = artImpl;
// hero walks here (offset from the craft's ground point) before launch
export const ESCAPE_DOOR: Readonly<Record<EscapeKind, { dx: number; dy: number }>> = doorImpl;
export const LEVELS: readonly LevelDef[] = levelsImpl;
export const FINGERS: Readonly<Record<string, string>> = fingersImpl;
export const fingerFor: (ch: string) => string | undefined = fingerForImpl;

export function createRun(level: LevelDef): RunAPI & { readonly pathLength?: number } {
  return new Run(level, (Math.random() * 0x7fffffff) | 0);
}

// data: URL of an art canvas, cached (HUD hearts as <img>).
const urlCache = new Map<string, string>();
export function artUrl(key: string, make: () => HTMLCanvasElement): string {
  let u = urlCache.get(key);
  if (!u) {
    u = make().toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

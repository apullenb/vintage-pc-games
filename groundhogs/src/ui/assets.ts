// Single seam to the other modules, typed against the shared contract.
import type { ArtAPI, GameAPI, LevelDef, SkillId, TerrainAPI } from '../types';
import * as artModule from '../art';
import { Game } from '../game';
import { LEVELS as levelList } from '../levels';

export const art: ArtAPI = artModule;
export const LEVELS: readonly LevelDef[] = levelList;

export function createGame(level: LevelDef): GameAPI {
  return new Game(level);
}

// Fresh copy so the same icon can appear in several places at once.
export function skillIconCanvas(skill: SkillId, cls = 'icon'): HTMLCanvasElement {
  let src: HTMLCanvasElement | null = null;
  try {
    src = art.skillIcon(skill);
  } catch {
    // skill added before its icon: fall back to a placeholder
  }
  const c = document.createElement('canvas');
  c.width = src?.width || 16;
  c.height = src?.height || 16;
  c.className = cls;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (src) ctx.drawImage(src, 0, 0);
  else drawPlaceholderIcon(ctx);
  return c;
}

const QMARK = ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'];

function drawPlaceholderIcon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#3a2212';
  ctx.fillRect(2, 2, 12, 12);
  ctx.fillStyle = '#f6e7c8';
  QMARK.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(5 + x, 4 + y, 1, 1);
  });
}

// Lowest solid row above (x, y) across the vine columns; 0 if open sky.
export function ceilingAbove(t: TerrainAPI, x: number, y: number): number {
  let top = 0;
  for (const cx of [x - 6, x + 6]) {
    for (let yy = y; yy >= 0; yy--) if (t.isSolid(cx, yy)) { top = Math.max(top, yy + 1); break; }
  }
  return top;
}

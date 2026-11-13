// Whole-level overview: terrain silhouette, hazards, doors, groundhog dots, viewport box.
import type { GameAPI, TerrainAPI } from '../types';
import { DIRT, EMPTY, PLANK, ROCK, VIEW_H, VIEW_W } from '../types';

const BOX_W = 104; // max logical px (fits beside 10 skills)
const BOX_H = 32;
const RES = 2; // canvas px per logical px
const REBUILD_EVERY = 6; // ticks between terrain resamples

const MAT_RGB: Record<number, [number, number, number]> = {
  [DIRT]: [168, 112, 62],
  [ROCK]: [128, 130, 140],
  [PLANK]: [232, 196, 120],
};

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private k: number; // canvas px per world px
  private worldW: number;
  private stale = true;
  private builtAt = -Infinity;

  constructor(worldW: number) {
    this.worldW = worldW;
    this.k = Math.min(BOX_H / VIEW_H, BOX_W / worldW) * RES;
    const w = Math.max(1, Math.round(worldW * this.k));
    const h = Math.max(1, Math.round(VIEW_H * this.k));
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `calc(var(--px) * ${w / RES})`;
    this.canvas.style.height = `calc(var(--px) * ${h / RES})`;
    this.ctx = this.canvas.getContext('2d')!;
    this.layer = document.createElement('canvas');
    this.layer.width = w;
    this.layer.height = h;
    this.lctx = this.layer.getContext('2d')!;
  }

  markStale(): void {
    this.stale = true;
  }

  // World x under a client x (for click/drag navigation).
  worldX(clientX: number): number {
    const r = this.canvas.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * this.worldW;
  }

  private rebuild(t: TerrainAPI): void {
    const { width: w, height: h } = this.layer;
    const img = this.lctx.createImageData(w, h);
    const d = img.data;
    const k = this.k;
    for (let my = 0; my < h; my++) {
      const y0 = Math.floor(my / k);
      const ys = Math.max(1, Math.floor((my + 1) / k) - y0);
      for (let mx = 0; mx < w; mx++) {
        const x0 = Math.floor(mx / k);
        const xs = Math.max(1, Math.floor((mx + 1) / k) - x0);
        let m = EMPTY as number;
        // 3x3 samples per cell; first solid wins
        for (let sy = 0; sy < 3 && m === EMPTY; sy++) {
          const y = y0 + Math.floor((ys * (sy + 0.5)) / 3);
          if (y >= t.height) break;
          for (let sx = 0; sx < 3; sx++) {
            const x = x0 + Math.floor((xs * (sx + 0.5)) / 3);
            if (x >= t.width) break;
            const v = t.mask[y * t.width + x];
            if (v !== EMPTY) {
              m = v;
              break;
            }
          }
        }
        const rgb = MAT_RGB[m];
        if (rgb) {
          const i = (my * w + mx) * 4;
          d[i] = rgb[0];
          d[i + 1] = rgb[1];
          d[i + 2] = rgb[2];
          d[i + 3] = 255;
        }
      }
    }
    this.lctx.putImageData(img, 0, 0);
  }

  draw(game: GameAPI, camX: number): void {
    if (this.stale && game.ticks - this.builtAt >= REBUILD_EVERY) {
      this.rebuild(game.terrain);
      this.stale = false;
      this.builtAt = game.ticks;
    } else if (game.ticks < this.builtAt) {
      this.builtAt = game.ticks;
    }
    const { ctx, k } = this;
    const { width: w, height: h } = this.canvas;
    ctx.fillStyle = '#1c120c';
    ctx.fillRect(0, 0, w, h);
    for (const hz of game.level.hazards) {
      ctx.fillStyle = hz.kind === 'water' ? '#2f6fb0' : '#7a3d5c';
      ctx.fillRect(Math.floor(hz.x * k), Math.floor(hz.y * k), Math.max(1, Math.ceil(hz.w * k)), Math.max(1, Math.ceil(hz.h * k)));
    }
    ctx.drawImage(this.layer, 0, 0);
    ctx.fillStyle = '#ffd34a';
    for (const e of game.level.entrances) ctx.fillRect(Math.round(e.x * k) - 1, Math.round(e.y * k) - 1, 3, 2);
    ctx.fillStyle = '#8fe05a';
    for (const e of game.level.exits) ctx.fillRect(Math.round(e.x * k) - 1, Math.round(e.y * k) - 3, 3, 3);
    ctx.fillStyle = '#fff6dc';
    for (const g of game.groundhogs) {
      if (g.state === 'saved' || g.state === 'dead') continue;
      ctx.fillRect(Math.round(g.x * k), Math.round((g.y - 3) * k) - 1, 1, 2);
    }
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(camX * k) + 0.5, 0.5, Math.round(VIEW_W * k) - 1, h - 1);
  }
}

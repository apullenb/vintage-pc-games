import { EMPTY, DIRT, ROCK, PLANK, MOUND, VIEW_H } from './types.ts';
import type { DirtyRect, LevelDef, Material, Shape, TerrainAPI } from './types.ts';

export function isDiggable(m: Material): boolean {
  return m === DIRT || m === PLANK || m === MOUND;
}

export class Terrain implements TerrainAPI {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
  private dirty: DirtyRect[] = [];

  constructor(level: LevelDef) {
    this.width = Math.max(1, Math.floor(level.width));
    this.height = VIEW_H;
    this.mask = new Uint8Array(this.width * this.height);
    for (const s of level.shapes) this.paintShape(s);
    this.dirty = [];
  }

  get(x: number, y: number): Material {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return EMPTY;
    return this.mask[y * this.width + x] as Material;
  }

  isSolid(x: number, y: number): boolean {
    return this.get(x, y) !== EMPTY;
  }

  set(x: number, y: number, m: Material): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.mask[y * this.width + x] = m;
  }

  takeDirty(): DirtyRect[] {
    const d = this.dirty;
    this.dirty = [];
    return d;
  }

  markDirty(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    if (x1 > x0 && y1 > y0) this.dirty.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }

  /** True if any pixel in the rect satisfies test. */
  anyIn(x: number, y: number, w: number, h: number, test: (m: Material) => boolean): boolean {
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) {
        if (test(this.get(xx, yy))) return true;
      }
    }
    return false;
  }

  /** Clears non-rock pixels within radius (inclusive). */
  eraseCircle(cx: number, cy: number, r: number): { hitRock: boolean } {
    let hitRock = false;
    const r2 = r * r;
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const m = this.get(x, y);
        if (m === ROCK) hitRock = true;
        else if (m !== EMPTY) this.set(x, y, EMPTY);
      }
    }
    this.markDirty(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    return { hitRock };
  }

  /** Clears non-rock pixels in rect. */
  eraseRect(x: number, y: number, w: number, h: number): { hitRock: boolean } {
    let hitRock = false;
    x = Math.floor(x);
    y = Math.floor(y);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const m = this.get(xx, yy);
        if (m === ROCK) hitRock = true;
        else if (m !== EMPTY) this.set(xx, yy, EMPTY);
      }
    }
    this.markDirty(x, y, w, h);
    return { hitRock };
  }

  /** 1px plank row from x..x+w-1; only fills EMPTY pixels. */
  fillPlank(x: number, y: number, w: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    for (let xx = x; xx < x + w; xx++) {
      if (this.get(xx, y) === EMPTY) this.set(xx, y, PLANK);
    }
    this.markDirty(x, y, w, 1);
  }

  private paintShape(s: Shape): void {
    const val: Material = s.erase ? EMPTY : s.mat === 'rock' ? ROCK : DIRT;
    if (s.kind === 'rect') {
      const x0 = Math.floor(s.x), y0 = Math.floor(s.y);
      for (let y = y0; y < y0 + s.h; y++) for (let x = x0; x < x0 + s.w; x++) this.set(x, y, val);
    } else if (s.kind === 'ellipse') {
      const rx = Math.max(0.5, s.rx), ry = Math.max(0.5, s.ry);
      for (let y = Math.floor(s.cy - ry); y <= Math.ceil(s.cy + ry); y++) {
        for (let x = Math.floor(s.cx - rx); x <= Math.ceil(s.cx + rx); x++) {
          const dx = (x - s.cx) / rx, dy = (y - s.cy) / ry;
          if (dx * dx + dy * dy <= 1) this.set(x, y, val);
        }
      }
    } else {
      this.paintPoly(s.points, val);
    }
  }

  // Scanline even-odd fill at integer rows, plus edge rasterization for inclusive borders.
  private paintPoly(pts: [number, number][], val: Material): void {
    const n = pts.length;
    if (n === 0) return;
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const ys0 = Math.max(0, Math.ceil(minY)), ys1 = Math.min(this.height - 1, Math.floor(maxY));
    const xs: number[] = [];
    for (let y = ys0; y <= ys1; y++) {
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % n];
        if (ay === by) continue;
        const lo = Math.min(ay, by), hi = Math.max(ay, by);
        if (y < lo || y >= hi) continue;
        xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(this.width - 1, Math.floor(xs[k + 1]));
        for (let x = xa; x <= xb; x++) this.set(x, y, val);
      }
    }
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % n];
      this.line(Math.round(ax), Math.round(ay), Math.round(bx), Math.round(by), val);
    }
  }

  private line(x0: number, y0: number, x1: number, y1: number, val: Material): void {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, val);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}

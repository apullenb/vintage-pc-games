// Arc-length helpers for a waypoint path (straight segments).
import type { MoveKind, Waypoint } from './types.ts';

export interface PathMetrics {
  seg: number[]; // seg[i] = length of path[i] -> path[i+1]
  cum: number[]; // cum[i] = path distance of waypoint i (cum[0] = 0)
  total: number;
}

export interface Point {
  x: number;
  y: number;
}

export function measurePath(path: readonly Waypoint[]): PathMetrics {
  const seg: number[] = [];
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    seg.push(d);
    cum.push(cum[i - 1] + d);
  }
  return { seg, cum, total: cum[cum.length - 1] };
}

/** Segment index i with cum[i] <= s < cum[i+1], clamped to valid segments. */
export function segmentAt(m: PathMetrics, s: number): number {
  const n = m.seg.length;
  if (n === 0 || s <= 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (m.cum[mid] <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Point at path distance s; s < 0 extends left of path[0] at its height, s > total clamps. */
export function pointAt(path: readonly Waypoint[], m: PathMetrics, s: number): Point {
  if (path.length === 0) return { x: 0, y: 0 };
  if (s <= 0) return { x: path[0].x + s, y: path[0].y };
  if (s >= m.total) {
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }
  const i = segmentAt(m, s);
  const len = m.seg[i];
  const t = len > 0 ? (s - m.cum[i]) / len : 0;
  return lerpWaypoints(path[i], path[i + 1], t);
}

export function lerpWaypoints(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Upward lift (px, >= 0) above the straight segment at fraction t; subtract from y. */
export function moveArc(move: MoveKind, segLen: number, t: number): number {
  const bump = 4 * t * (1 - t);
  if (move === 'jump') return clamp(segLen * 0.35, 10, 40) * bump;
  if (move === 'jet') return clamp(segLen * 0.2, 6, 28) * bump;
  return 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

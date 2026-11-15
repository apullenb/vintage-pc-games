// Moving Day rules, kept free of drawing so they can be tested: a truck cargo grid with gravity,
// "heavy on the bottom, fragile on top", and what a bumpy drive does to a badly packed load.
import { shuffle } from './cardsFx.ts';

export type Weight = 'heavy' | 'medium' | 'light' | 'fragile';
export interface ItemDef {
  id: string;
  name: string;
  w: number; // natural width in cells
  h: number; // natural height in cells
  weight: Weight;
  cost: number; // replacement or repair cost if it breaks
}

export const COLS = 8;
export const ROWS = 6;

export const CATALOG: Record<string, ItemDef> = {
  dresser: { id: 'dresser', name: 'Dresser', w: 3, h: 2, weight: 'heavy', cost: 45 },
  fridge: { id: 'fridge', name: 'Mini fridge', w: 2, h: 2, weight: 'heavy', cost: 60 },
  books: { id: 'books', name: 'Box of books', w: 2, h: 1, weight: 'heavy', cost: 10 },
  books2: { id: 'books2', name: 'More books', w: 2, h: 1, weight: 'heavy', cost: 10 },
  mattress: { id: 'mattress', name: 'Mattress', w: 4, h: 1, weight: 'medium', cost: 0 },
  chair: { id: 'chair', name: 'Desk chair', w: 2, h: 2, weight: 'medium', cost: 0 },
  nightstand: { id: 'nightstand', name: 'Nightstand', w: 1, h: 2, weight: 'medium', cost: 0 },
  pans: { id: 'pans', name: 'Pots & pans', w: 2, h: 1, weight: 'medium', cost: 0 },
  clothes: { id: 'clothes', name: 'Clothes bag', w: 2, h: 1, weight: 'light', cost: 0 },
  pillows: { id: 'pillows', name: 'Pillows', w: 1, h: 1, weight: 'light', cost: 0 },
  beanbag: { id: 'beanbag', name: 'Beanbag', w: 2, h: 2, weight: 'light', cost: 0 },
  tv: { id: 'tv', name: 'TV', w: 2, h: 2, weight: 'fragile', cost: 120 },
  lamp: { id: 'lamp', name: 'Lamp', w: 1, h: 2, weight: 'fragile', cost: 25 },
  dishes: { id: 'dishes', name: 'Dishes', w: 2, h: 1, weight: 'fragile', cost: 30 },
  mirror: { id: 'mirror', name: 'Mirror', w: 3, h: 1, weight: 'fragile', cost: 35 },
  guitar: { id: 'guitar', name: 'Guitar', w: 3, h: 1, weight: 'fragile', cost: 60 },
  plant: { id: 'plant', name: 'Plant', w: 1, h: 1, weight: 'fragile', cost: 15 },
};

// 13 items: the core set plus a couple of random swaps so it isn't the same truck every time.
export function pickItems(r: () => number): ItemDef[] {
  const ids = ['dresser', 'fridge', 'books', 'mattress', 'pans', 'clothes', 'pillows', 'tv', 'lamp', 'dishes', 'plant'];
  ids.push(r() < 0.5 ? 'chair' : 'nightstand');
  ids.push(r() < 0.5 ? 'mirror' : 'guitar');
  if (r() < 0.4) ids.push(r() < 0.5 ? 'books2' : 'beanbag');
  return shuffle(ids.map((id) => CATALOG[id]), r);
}

export interface Placed {
  def: ItemDef;
  col: number;
  row: number; // 0 = truck floor
  w: number;
  h: number;
  broken?: boolean;
  stress?: number;
}

export const dims = (d: ItemDef, rot: boolean): [number, number] => (rot ? [d.h, d.w] : [d.w, d.h]);

export function heights(placed: Placed[]): number[] {
  const hs = new Array<number>(COLS).fill(0);
  for (const p of placed) for (let c = p.col; c < p.col + p.w; c++) hs[c] = Math.max(hs[c], p.row + p.h);
  return hs;
}

// Gravity: an item dropped over columns [col, col+w) comes to rest on the tallest stack under it.
export function landRow(placed: Placed[], col: number, w: number): number {
  const hs = heights(placed);
  let r = 0;
  for (let c = Math.max(0, col); c < Math.min(COLS, col + w); c++) r = Math.max(r, hs[c]);
  return r;
}

export function fits(placed: Placed[], col: number, w: number, h: number): boolean {
  return col >= 0 && col + w <= COLS && landRow(placed, col, w) + h <= ROWS;
}

export function anyFit(placed: Placed[], d: ItemDef): boolean {
  for (const rot of [false, true]) {
    const [w, h] = dims(d, rot);
    for (let c = 0; c + w <= COLS; c++) if (fits(placed, c, w, h)) return true;
  }
  return false;
}

const overlaps = (a: Placed, b: Placed): boolean => a.col < b.col + b.w && b.col < a.col + a.w;
export const restsOn = (top: Placed, under: Placed): boolean => top.row === under.row + under.h && overlaps(top, under);

const RANK: Record<Weight, number> = { light: 0, fragile: 1, medium: 2, heavy: 3 };

// Heaviest thing stacked on top of p, directly or through other items (-1 = nothing).
export function loadOn(placed: Placed[], p: Placed, seen = new Set<Placed>()): number {
  let m = -1;
  for (const q of placed) {
    if (q === p || seen.has(q) || !restsOn(q, p)) continue;
    seen.add(q);
    m = Math.max(m, RANK[q.def.weight], loadOn(placed, q, seen));
  }
  return m;
}

export interface Risk {
  crushed: Placed[]; // fragile with something medium/heavy on top of it
  wobbly: Placed[]; // heavy item resting on anything that isn't the floor or another heavy item
}

export function assess(placed: Placed[]): Risk {
  const crushed: Placed[] = [];
  const wobbly: Placed[] = [];
  for (const p of placed) {
    if (p.def.weight === 'fragile' && loadOn(placed, p) >= RANK.medium) crushed.push(p);
    if (p.def.weight === 'heavy' && p.row > 0) {
      const under = placed.filter((q) => restsOn(p, q));
      if (under.some((q) => q.def.weight !== 'heavy')) wobbly.push(p);
    }
  }
  return { crushed, wobbly };
}

// What a placement would do, for the live warning on the ghost.
export function preview(placed: Placed[], d: ItemDef, col: number, w: number, h: number): { ok: boolean; crush: Placed[]; wobbly: boolean } {
  if (!fits(placed, col, w, h)) return { ok: false, crush: [], wobbly: false };
  const p: Placed = { def: d, col, row: landRow(placed, col, w), w, h };
  const before = new Set(assess(placed).crushed);
  const after = assess([...placed, p]);
  return { ok: true, crush: after.crushed.filter((q) => !before.has(q) && q !== p), wobbly: after.wobbly.includes(p) };
}

// One bump in the road. Stress builds on at-risk items; past 1 they break (fragile) or topple (heavy).
// A hard jolt (taking the bump too fast) is far worse than a slow roll over it.
export function jolt(placed: Placed[], hard: boolean): Placed[] {
  const { crushed, wobbly } = assess(placed.filter((p) => !p.broken));
  const out: Placed[] = [];
  for (const p of crushed) {
    const heavyOnTop = loadOn(placed, p) >= RANK.heavy;
    p.stress = (p.stress ?? 0) + (hard ? 1 : heavyOnTop ? 0.3 : 0.15);
    if (p.stress >= 1 && !p.broken) (p.broken = true), out.push(p);
  }
  for (const p of wobbly) {
    p.stress = (p.stress ?? 0) + (hard ? 1 : 0.15);
    if (p.stress >= 1 && !p.broken) (p.broken = true), out.push(p);
  }
  return out;
}

export interface MoveTally {
  fit: number; // 0..1 share of the load (by size) that made it into the truck
  broken: number;
  hardJolts: number;
  timeLeft: number; // 0..1 of the rental clock left when packing finished
}

// Attentive first try ≈ 0.7–0.8 (all in, maybe one casualty), perfect = 1, careless ≈ 0.2–0.4.
export function movingScore(t: MoveTally): number {
  const pack = Math.max(0, Math.min(1, (t.fit - 0.5) / 0.5));
  const care = Math.max(0, 1 - 0.28 * t.broken - 0.06 * t.hardJolts);
  const time = Math.min(1, t.timeLeft * 2.5);
  return Math.max(0, Math.min(1, 0.25 * pack + 0.7 * care + 0.05 * time));
}

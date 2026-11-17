// Thrift Hunt: the catalog of finds, the shopping goals, map generation, grid pathfinding and
// scoring. Pure data and functions (no canvas, no React) so it can be unit tested.

export type Goal = 'furniture' | 'clothes';
export type Theme = 'thrift' | 'flea' | 'yard';
export type Need = 'bed' | 'table' | 'seat' | 'coat' | 'top' | 'pants';
export type Kind = 'need' | 'extra' | 'junk';

// Sprite shapes the art module knows how to draw (with optional defects for junk).
export type Shape =
  | 'futon'
  | 'bed'
  | 'mattress'
  | 'table'
  | 'smalltable'
  | 'couch'
  | 'armchair'
  | 'chairs'
  | 'chair'
  | 'lamp'
  | 'bookcase'
  | 'rug'
  | 'mirror'
  | 'coat'
  | 'puffer'
  | 'blazer'
  | 'shirt'
  | 'pants'
  | 'boots'
  | 'scarf'
  | 'sweater';
export type Defect = 'stains' | 'bugs' | 'crack' | 'mold' | 'holes' | 'stink' | 'leg';

export interface ItemDef {
  id: string;
  name: string; // receipt / tooltip name (short, upper-case friendly)
  kind: Kind;
  need?: Need;
  price: number; // at the base budget
  retail: number; // what it costs new
  lbs: number;
  shape: Shape;
  color: string;
  trim?: string;
  defects?: Defect[];
  flag?: string; // the red flag shown when you inspect junk
}

export interface GoalDef {
  goal: Goal;
  baseBudget: number;
  carry: number; // lbs you can haul home
  haul: string; // what you're hauling it in
  needs: { need: Need; label: string }[];
  items: ItemDef[];
}

const FURNITURE: ItemDef[] = [
  // the bed
  { id: 'bedset', name: 'BED + MATTRESS', kind: 'need', need: 'bed', price: 60, retail: 380, lbs: 55, shape: 'bed', color: '#5a8ad8', trim: '#8a5a32' },
  { id: 'futon', name: 'FUTON', kind: 'need', need: 'bed', price: 40, retail: 260, lbs: 40, shape: 'futon', color: '#3a4a7a', trim: '#b88a52' },
  // the table
  { id: 'oak', name: 'SOLID OAK TABLE', kind: 'need', need: 'table', price: 35, retail: 280, lbs: 35, shape: 'table', color: '#b0703a' },
  { id: 'kitchen', name: 'KITCHEN TABLE', kind: 'need', need: 'table', price: 18, retail: 120, lbs: 22, shape: 'smalltable', color: '#e8e4d8', trim: '#9aa0b0' },
  // somewhere to sit
  { id: 'couch', name: 'LIKE-NEW COUCH', kind: 'need', need: 'seat', price: 50, retail: 600, lbs: 55, shape: 'couch', color: '#2fa59a' },
  { id: 'armchair', name: 'COMFY ARMCHAIR', kind: 'need', need: 'seat', price: 22, retail: 210, lbs: 25, shape: 'armchair', color: '#e0a83a' },
  { id: 'chairs', name: 'PAIR OF CHAIRS', kind: 'need', need: 'seat', price: 14, retail: 100, lbs: 16, shape: 'chairs', color: '#9a6a3c' },
  // nice, not needed
  { id: 'lamp', name: 'FLOOR LAMP', kind: 'extra', price: 6, retail: 45, lbs: 6, shape: 'lamp', color: '#f2d27a', trim: '#5a5a6a' },
  { id: 'bookcase', name: 'BOOKCASE', kind: 'extra', price: 12, retail: 90, lbs: 22, shape: 'bookcase', color: '#a87444' },
  { id: 'rug', name: 'WOOL RUG', kind: 'extra', price: 9, retail: 80, lbs: 8, shape: 'rug', color: '#c8503c', trim: '#f2c26a' },
  { id: 'mirror', name: 'TALL MIRROR', kind: 'extra', price: 7, retail: 50, lbs: 7, shape: 'mirror', color: '#d8a64a' },
  // junk: tagging these wastes money
  { id: 'jmattress', name: 'STAINED MATTRESS', kind: 'junk', price: 25, retail: 0, lbs: 30, shape: 'mattress', color: '#d8d0c0', defects: ['stains', 'bugs'], flag: 'STAINS + BEDBUGS!' },
  { id: 'jlamp', name: 'BROKEN LAMP', kind: 'junk', price: 6, retail: 0, lbs: 6, shape: 'lamp', color: '#b8a87a', trim: '#5a5a6a', defects: ['crack'], flag: 'CRACKED, NO PLUG' },
  { id: 'jchair', name: 'WOBBLY CHAIR', kind: 'junk', price: 10, retail: 0, lbs: 8, shape: 'chair', color: '#8a6a4c', defects: ['leg', 'crack'], flag: 'MISSING A LEG' },
  { id: 'jcouch', name: 'MYSTERY COUCH', kind: 'junk', price: 30, retail: 0, lbs: 50, shape: 'couch', color: '#8a7a4a', defects: ['bugs', 'stains'], flag: 'BEDBUG WARNING!' },
  { id: 'jtable', name: 'WARPED TABLE', kind: 'junk', price: 15, retail: 0, lbs: 25, shape: 'smalltable', color: '#9a8a6a', trim: '#6a6a6a', defects: ['mold', 'leg'], flag: 'MOLD + WARPED' },
];

const CLOTHES: ItemDef[] = [
  { id: 'wool', name: 'WOOL WINTER COAT', kind: 'need', need: 'coat', price: 30, retail: 200, lbs: 7, shape: 'coat', color: '#b88a52', trim: '#5a3a22' },
  { id: 'puffer', name: 'PUFFER JACKET', kind: 'need', need: 'coat', price: 22, retail: 150, lbs: 5, shape: 'puffer', color: '#3a6ad0' },
  { id: 'blazer', name: 'NAVY BLAZER', kind: 'need', need: 'top', price: 15, retail: 120, lbs: 3, shape: 'blazer', color: '#2e3f6e', trim: '#e8e8f0' },
  { id: 'buttonup', name: 'BUTTON-UP SHIRT', kind: 'need', need: 'top', price: 8, retail: 45, lbs: 1, shape: 'shirt', color: '#a8c8f0' },
  { id: 'slacks', name: 'WORK SLACKS', kind: 'need', need: 'pants', price: 10, retail: 60, lbs: 2, shape: 'pants', color: '#4a4a5a' },
  { id: 'khakis', name: 'KHAKIS', kind: 'need', need: 'pants', price: 8, retail: 50, lbs: 2, shape: 'pants', color: '#c8b088' },
  { id: 'boots', name: 'WORK BOOTS', kind: 'extra', price: 12, retail: 90, lbs: 5, shape: 'boots', color: '#7a5232' },
  { id: 'scarf', name: 'KNIT SCARF', kind: 'extra', price: 3, retail: 25, lbs: 1, shape: 'scarf', color: '#c83a3a', trim: '#f2e8d8' },
  { id: 'sweater', name: 'CABLE SWEATER', kind: 'extra', price: 6, retail: 55, lbs: 3, shape: 'sweater', color: '#3caa6a' },
  { id: 'jcoat', name: 'MOTHY COAT', kind: 'junk', price: 18, retail: 0, lbs: 7, shape: 'coat', color: '#8a7a6a', trim: '#4a3a2a', defects: ['holes'], flag: 'MOTH HOLES!' },
  { id: 'jshirt', name: 'STAINED SHIRT', kind: 'junk', price: 5, retail: 0, lbs: 1, shape: 'shirt', color: '#e8e0c0', defects: ['stains'], flag: 'PIT STAINS' },
  { id: 'jpants', name: 'RIPPED SLACKS', kind: 'junk', price: 6, retail: 0, lbs: 2, shape: 'pants', color: '#5a5a62', defects: ['holes'], flag: 'RIPPED SEAT' },
  { id: 'jjacket', name: 'MUSTY JACKET', kind: 'junk', price: 12, retail: 0, lbs: 5, shape: 'puffer', color: '#6a7a4a', defects: ['stink', 'mold'], flag: 'SMELLS LIKE A BASEMENT' },
  { id: 'jsweater', name: 'SHRUNK SWEATER', kind: 'junk', price: 4, retail: 0, lbs: 2, shape: 'sweater', color: '#c8a0c8', defects: ['holes', 'stains'], flag: 'KID SIZE NOW' },
];

export const GOALS: Record<Goal, GoalDef> = {
  furniture: {
    goal: 'furniture',
    baseBudget: 150,
    carry: 130,
    haul: "RAE'S TRUCK",
    needs: [
      { need: 'bed', label: 'Bed' },
      { need: 'table', label: 'Table' },
      { need: 'seat', label: 'Seating' },
    ],
    items: FURNITURE,
  },
  clothes: {
    goal: 'clothes',
    baseBudget: 80,
    carry: 16,
    haul: 'YOUR ARMS',
    needs: [
      { need: 'coat', label: 'Winter coat' },
      { need: 'top', label: 'Work top' },
      { need: 'pants', label: 'Work pants' },
    ],
    items: CLOTHES,
  },
};

export function goalOf(d: Record<string, number | string>): GoalDef {
  return d.goal === 'clothes' ? GOALS.clothes : GOALS.furniture;
}
// Prices scale with the budget you were given, so a bigger budget means a pricier market.
export function priceFor(def: ItemDef, g: GoalDef, budget: number): number {
  return Math.max(1, Math.round((def.price * budget) / g.baseBudget));
}

// ---------- scoring ----------
export interface Haul {
  def: ItemDef;
  price: number;
}
export interface HuntResult {
  score: number;
  spent: number;
  retail: number; // retail value of the useful things you got
  saved: number; // retail value minus what you paid (junk counts as money wasted)
  got: number; // needs met
  needed: number;
  junk: number;
  junkSpent: number;
}

export function scoreHunt(haul: Haul[], g: GoalDef): HuntResult {
  const needed = g.needs.length;
  const met = new Set(haul.filter((h) => h.def.kind === 'need').map((h) => h.def.need));
  const got = g.needs.filter((n) => met.has(n.need)).length;
  const spent = haul.reduce((s, h) => s + h.price, 0);
  const junkItems = haul.filter((h) => h.def.kind === 'junk');
  const junk = junkItems.length;
  const junkSpent = junkItems.reduce((s, h) => s + h.price, 0);
  const retail = haul.reduce((s, h) => s + h.def.retail * (h.price / Math.max(1, h.def.price)), 0);
  const saved = Math.max(0, Math.round(retail - spent));
  if (!haul.length) return { score: 0, spent: 0, retail: 0, saved: 0, got: 0, needed, junk: 0, junkSpent: 0 };
  const needs = got / needed;
  const vpd = retail / Math.max(1, spent); // good finds are worth 6-10x their price
  const value = Math.max(0, Math.min(1, (vpd - 2) / 4.5));
  const clean = junk === 0 ? 1 : junk === 1 ? 0.4 : 0;
  const score = Math.max(0, Math.min(1, needs * (0.62 + 0.2 * value) + 0.18 * clean * Math.sqrt(needs) - 0.05 * junk));
  return { score: Math.round(score * 1000) / 1000, spent, retail: Math.round(retail), saved, got, needed, junk, junkSpent };
}

// ---------- map ----------
export const WW = 272; // world size (the view is 240x160 and pans a little)
export const WH = 176;
export const FLOOR_Y = 34; // walkable floor starts here (above is the back wall / houses)

export type PropKind = 'rack' | 'roundrack' | 'shelf' | 'bin' | 'mannequins' | 'counter' | 'tent' | 'crates' | 'stall' | 'umbrella' | 'ftable' | 'boxes' | 'tree' | 'car' | 'sign';
export interface Prop {
  kind: PropKind;
  x: number; // footprint (the part you bump into), world coords
  y: number;
  w: number;
  h: number;
  tall: number; // drawn height above the footprint's bottom edge (for occlusion and shots)
  hue: number; // 0..1 variety seed
}

const SIZE: Record<PropKind, [number, number, number]> = {
  rack: [50, 6, 24],
  roundrack: [26, 10, 22],
  shelf: [38, 8, 30],
  bin: [26, 12, 13],
  mannequins: [18, 5, 28],
  counter: [40, 12, 16],
  tent: [50, 10, 34],
  crates: [20, 10, 14],
  stall: [40, 9, 12],
  umbrella: [10, 6, 30],
  ftable: [40, 8, 11],
  boxes: [20, 10, 13],
  tree: [10, 6, 46],
  car: [58, 18, 20],
  sign: [8, 4, 18],
};
const PALETTE: Record<Theme, PropKind[]> = {
  thrift: ['rack', 'rack', 'roundrack', 'shelf', 'bin', 'mannequins'],
  flea: ['tent', 'tent', 'stall', 'crates', 'umbrella', 'stall'],
  yard: ['ftable', 'ftable', 'boxes', 'tree', 'ftable', 'sign'],
};

export function makeProp(kind: PropKind, cx: number, footY: number, hue: number): Prop {
  const [w, h, tall] = SIZE[kind];
  return { kind, x: Math.round(cx - w / 2), y: Math.round(footY - h), w, h, tall, hue };
}

export interface MapDef {
  theme: Theme;
  name: string;
  props: Prop[];
  start: [number, number];
  door: [number, number]; // where new stock and rival shoppers come in
}

const NAMES: Record<Theme, string[]> = {
  thrift: ['SECOND CHANCE THRIFT', 'GOODWILL HUNTING', 'THE THRIFTY OWL'],
  flea: ['SUNDAY FLEA MARKET', 'SWAP MEET', 'RIVERSIDE FLEA'],
  yard: ['ELM ST YARD SALES', 'BLOCK-WIDE GARAGE SALE', 'MAPLE CT YARD SALE'],
};

// A 3x3 grid of slots with lanes between them, jittered, a couple left empty, plus theme set-pieces.
export function makeMap(r: () => number, theme?: Theme): MapDef {
  const th: Theme = theme ?? (['thrift', 'flea', 'yard'] as Theme[])[Math.floor(r() * 3)];
  const props: Prop[] = [];
  const cols = [56, 136, 216];
  const rows = [70, 112, 152];
  const empty = new Set<number>([7]); // bottom middle: where you start
  while (empty.size < 3) empty.add(Math.floor(r() * 9));
  const pal = PALETTE[th];
  for (let i = 0; i < 9; i++) {
    if (empty.has(i)) continue;
    const c = i % 3;
    const row = Math.floor(i / 3);
    let kind = pal[Math.floor(r() * pal.length)];
    // set-pieces
    if (th === 'thrift' && i === 8) kind = 'counter';
    if (th === 'yard' && row === 2 && c !== 1 && r() < 0.5) kind = 'car';
    const jx = (r() - 0.5) * 12;
    const jy = (r() - 0.5) * 6;
    props.push(makeProp(kind, cols[c] + jx, rows[row] + jy, r()));
  }
  // a few small scatter props in the lanes' edges keep it from looking like a grid
  const extra: PropKind = th === 'thrift' ? 'bin' : th === 'flea' ? 'crates' : 'boxes';
  if (r() < 0.7) props.push(makeProp(extra, 14 + r() * 6, 104 + r() * 30, r()));
  if (r() < 0.7) props.push(makeProp(extra, WW - 16 - r() * 6, 92 + r() * 30, r()));
  const names = NAMES[th];
  return { theme: th, name: names[Math.floor(r() * names.length)], props, start: [136, 166], door: [136, WH - 2] };
}

// ---------- nav grid ----------
export const CELL = 8;
export const GW = Math.ceil(WW / CELL);
export const GH = Math.ceil(WH / CELL);

export function buildGrid(props: Prop[], pad = 4): Uint8Array {
  const g = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const cx = i * CELL + CELL / 2;
      const cy = j * CELL + CELL / 2;
      let blocked = cy < FLOOR_Y + 2 || cx < 6 || cx > WW - 6 || cy > WH - 3;
      for (const p of props) if (cx > p.x - pad && cx < p.x + p.w + pad && cy > p.y - pad && cy < p.y + p.h + pad) blocked = true;
      g[j * GW + i] = blocked ? 1 : 0;
    }
  return g;
}

export const cellOf = (x: number, y: number): [number, number] => [Math.max(0, Math.min(GW - 1, Math.floor(x / CELL))), Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)))];

// Nearest open cell to (i, j) (spiral search).
export function openNear(g: Uint8Array, i: number, j: number): [number, number] {
  if (!g[j * GW + i]) return [i, j];
  for (let r = 1; r < 12; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di;
        const b = j + dj;
        if (a >= 0 && b >= 0 && a < GW && b < GH && !g[b * GW + a]) return [a, b];
      }
  return [i, j];
}

// Breadth-first path from world point a to world point b; returns waypoints (cell centers), or [] if unreachable.
export function findPath(g: Uint8Array, ax: number, ay: number, bx: number, by: number): [number, number][] {
  const [si, sj] = openNear(g, ...cellOf(ax, ay));
  const [ti, tj] = openNear(g, ...cellOf(bx, by));
  const start = sj * GW + si;
  const goal = tj * GW + ti;
  const prev = new Int32Array(GW * GH).fill(-1);
  prev[start] = start;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === goal) break;
    const ci = c % GW;
    const cj = (c - ci) / GW;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = ci + di;
      const b = cj + dj;
      if (a < 0 || b < 0 || a >= GW || b >= GH) continue;
      const n = b * GW + a;
      if (g[n] || prev[n] !== -1) continue;
      if (di && dj && (g[cj * GW + a] || g[b * GW + ci])) continue; // no corner cutting
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[goal] === -1) return [];
  const out: [number, number][] = [];
  for (let c = goal; c !== start; c = prev[c]) out.push([(c % GW) * CELL + CELL / 2, Math.floor(c / GW) * CELL + CELL / 2]);
  out.reverse();
  return out;
}

// Spots tucked just behind tall props, where a skittish deal can hide.
export function hideSpots(g: Uint8Array, props: Prop[]): [number, number][] {
  const out: [number, number][] = [];
  for (const p of props) {
    if (p.tall < 10) continue;
    for (const fx of [0.25, 0.75]) {
      const x = p.x + p.w * fx;
      const [a, b] = openNear(g, ...cellOf(x, p.y - 6));
      const wx = a * CELL + CELL / 2;
      const wy = b * CELL + CELL / 2;
      if (wy < p.y && wy > FLOOR_Y && Math.abs(wx - x) < 14) out.push([wx, wy]);
    }
  }
  return out;
}

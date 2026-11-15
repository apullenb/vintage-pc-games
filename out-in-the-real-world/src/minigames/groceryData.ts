// Grocery Run: what's on the shelves, how a trip's list is drawn up, and how a trip is scored.
// Prices are a week of meal-prep quantities at 2020s US grocery prices.

export type SectionId = 'produce' | 'meat' | 'dairy' | 'grains' | 'canned' | 'breakfast' | 'frozen' | 'bakery' | 'snacks' | 'drinks' | 'baking' | 'spices';
export const BACK_SECTIONS: SectionId[] = ['produce', 'meat', 'dairy'];
export const AISLE_SECTIONS: SectionId[] = ['grains', 'canned', 'breakfast', 'frozen', 'bakery', 'snacks', 'drinks', 'baking', 'spices'];
export const SECTION_SIGN: Record<SectionId, string> = {
  produce: 'PRODUCE',
  meat: 'MEAT',
  dairy: 'DAIRY',
  grains: 'PASTA RICE',
  canned: 'CANNED',
  breakfast: 'BREAKFAST',
  frozen: 'FROZEN',
  bakery: 'BAKERY',
  snacks: 'SNACKS',
  drinks: 'DRINKS',
  baking: 'BAKING',
  spices: 'SPICES',
};
export const SECTION_COLOR: Record<SectionId, string> = {
  produce: '#3caa6a',
  meat: '#c0392b',
  dairy: '#3f7fd8',
  grains: '#e0a030',
  canned: '#b0503c',
  breakfast: '#d07a2c',
  frozen: '#4ab0d8',
  bakery: '#a8743c',
  snacks: '#e0503c',
  drinks: '#2fb5b0',
  baking: '#9a5ad0',
  spices: '#7a8a3c',
};

export type Shape = 'box' | 'jar' | 'bag' | 'can' | 'carton' | 'tray' | 'jug' | 'loaf' | 'fruit';

export interface Opt {
  tag: string; // shown on the price card: NAME BRAND, STORE BRAND, LOOSE, 5LB BAG...
  price: number;
  sale?: boolean;
}
export interface ItemDef {
  id: string;
  name: string; // shopping list
  short: string; // receipt / canvas (<= 10 chars)
  sec: SectionId;
  qty: number;
  unit: string; // per-unit price label: LB, EGG, GAL, OZ, CAN...
  shape: Shape;
  color: string;
  // [pricier, cheaper] in the usual case
  opts: [Opt, Opt];
  // lesson shown when you pick the cheaper option
  lesson: 'brand' | 'bulk' | 'loose' | 'precut';
}

const B = (price: number): Opt => ({ tag: 'NAME BRAND', price });
const S = (price: number): Opt => ({ tag: 'STORE BRAND', price });

export const CATALOG: ItemDef[] = [
  {
    id: 'apples',
    name: 'Apples (5 lb)',
    short: 'APPLES',
    sec: 'produce',
    qty: 5,
    unit: 'LB',
    shape: 'fruit',
    color: '#e0503c',
    opts: [
      { tag: 'LOOSE', price: 9.95 },
      { tag: '5 LB BAG', price: 5.99 },
    ],
    lesson: 'loose',
  },
  {
    id: 'potatoes',
    name: 'Potatoes (10 lb)',
    short: 'POTATOES',
    sec: 'produce',
    qty: 10,
    unit: 'LB',
    shape: 'bag',
    color: '#b8905a',
    opts: [
      { tag: 'LOOSE', price: 12.9 },
      { tag: '10 LB BAG', price: 6.49 },
    ],
    lesson: 'loose',
  },
  {
    id: 'carrots',
    name: 'Carrots (5 lb)',
    short: 'CARROTS',
    sec: 'produce',
    qty: 5,
    unit: 'LB',
    shape: 'bag',
    color: '#ff8a1e',
    opts: [
      { tag: 'BABY CUT', price: 9.95 },
      { tag: 'WHOLE BAG', price: 4.49 },
    ],
    lesson: 'precut',
  },
  {
    id: 'spinach',
    name: 'Spinach (1 lb)',
    short: 'SPINACH',
    sec: 'produce',
    qty: 16,
    unit: 'OZ',
    shape: 'bag',
    color: '#3c8a3a',
    opts: [
      { tag: '4 SMALL BAGS', price: 9.96 },
      { tag: 'BIG TUB', price: 4.99 },
    ],
    lesson: 'bulk',
  },
  {
    id: 'chicken',
    name: 'Chicken (5 lb)',
    short: 'CHICKEN',
    sec: 'meat',
    qty: 5,
    unit: 'LB',
    shape: 'tray',
    color: '#f0b8a0',
    opts: [
      { tag: '5 SMALL PACKS', price: 22.45 },
      { tag: 'FAMILY PACK', price: 14.95 },
    ],
    lesson: 'bulk',
  },
  { id: 'turkey', name: 'Ground turkey (3 lb)', short: 'TURKEY', sec: 'meat', qty: 3, unit: 'LB', shape: 'tray', color: '#d8786a', opts: [B(17.97), S(12.87)], lesson: 'brand' },
  { id: 'pork', name: 'Pork chops (3 lb)', short: 'PORK', sec: 'meat', qty: 3, unit: 'LB', shape: 'tray', color: '#e89a8a', opts: [B(14.97), S(10.47)], lesson: 'brand' },
  { id: 'eggs', name: 'Eggs (3 dozen)', short: 'EGGS', sec: 'dairy', qty: 36, unit: 'EGG', shape: 'carton', color: '#f2e8c8', opts: [B(13.47), S(9.87)], lesson: 'brand' },
  { id: 'milk', name: 'Milk (2 gal)', short: 'MILK', sec: 'dairy', qty: 2, unit: 'GAL', shape: 'jug', color: '#f4f6f8', opts: [B(9.38), S(6.98)], lesson: 'brand' },
  {
    id: 'yogurt',
    name: 'Yogurt (64 oz)',
    short: 'YOGURT',
    sec: 'dairy',
    qty: 64,
    unit: 'OZ',
    shape: 'jar',
    color: '#ef7fae',
    opts: [
      { tag: '16 CUPS', price: 15.84 },
      { tag: '2 BIG TUBS', price: 8.98 },
    ],
    lesson: 'bulk',
  },
  { id: 'cheese', name: 'Cheese (2 lb)', short: 'CHEESE', sec: 'dairy', qty: 2, unit: 'LB', shape: 'box', color: '#f2c230', opts: [B(11.98), S(7.98)], lesson: 'brand' },
  { id: 'rice', name: 'Rice (10 lb)', short: 'RICE', sec: 'grains', qty: 10, unit: 'LB', shape: 'bag', color: '#f2efe6', opts: [B(13.99), S(8.49)], lesson: 'brand' },
  { id: 'pasta', name: 'Pasta (5 boxes)', short: 'PASTA', sec: 'grains', qty: 5, unit: 'BOX', shape: 'box', color: '#3f7fd8', opts: [B(9.95), S(5.45)], lesson: 'brand' },
  { id: 'beans', name: 'Black beans (8 cans)', short: 'BEANS', sec: 'canned', qty: 8, unit: 'CAN', shape: 'can', color: '#2a2a33', opts: [B(10.32), S(6.32)], lesson: 'brand' },
  { id: 'sauce', name: 'Pasta sauce (3 jars)', short: 'SAUCE', sec: 'canned', qty: 3, unit: 'JAR', shape: 'jar', color: '#c0392b', opts: [B(10.47), S(6.27)], lesson: 'brand' },
  { id: 'tuna', name: 'Tuna (6 cans)', short: 'TUNA', sec: 'canned', qty: 6, unit: 'CAN', shape: 'can', color: '#3f7fd8', opts: [B(11.94), S(6.54)], lesson: 'brand' },
  { id: 'oats', name: 'Oatmeal (2 tubs)', short: 'OATS', sec: 'breakfast', qty: 2, unit: 'TUB', shape: 'jar', color: '#d8b070', opts: [B(12.98), S(8.38)], lesson: 'brand' },
  { id: 'pb', name: 'Peanut butter (2 jars)', short: 'PNUT BTR', sec: 'breakfast', qty: 2, unit: 'JAR', shape: 'jar', color: '#a8743c', opts: [B(11.98), S(7.98)], lesson: 'brand' },
  { id: 'cereal', name: 'Cereal (2 boxes)', short: 'CEREAL', sec: 'breakfast', qty: 2, unit: 'BOX', shape: 'box', color: '#f2b632', opts: [B(11.98), S(6.98)], lesson: 'brand' },
  { id: 'veg', name: 'Frozen veggies (6 bags)', short: 'FRZ VEG', sec: 'frozen', qty: 6, unit: 'BAG', shape: 'bag', color: '#3caa6a', opts: [B(14.94), S(8.94)], lesson: 'brand' },
  { id: 'berries', name: 'Frozen fruit (3 lb)', short: 'FRZ FRUIT', sec: 'frozen', qty: 3, unit: 'LB', shape: 'bag', color: '#9a5ad0', opts: [B(12.99), S(8.49)], lesson: 'brand' },
  { id: 'bread', name: 'Bread (3 loaves)', short: 'BREAD', sec: 'bakery', qty: 3, unit: 'LOAF', shape: 'loaf', color: '#c8904a', opts: [B(11.97), S(6.87)], lesson: 'brand' },
  { id: 'tortillas', name: 'Tortillas (3 packs)', short: 'TORTILLAS', sec: 'bakery', qty: 3, unit: 'PACK', shape: 'bag', color: '#f2dca0', opts: [B(10.47), S(6.57)], lesson: 'brand' },
];

export interface Impulse {
  name: string;
  price: number;
  pitch: string; // flashing sign
  color: string;
}
export const IMPULSES: Impulse[] = [
  { name: 'CHIPS', price: 4.79, pitch: '2 FOR $8!', color: '#f2b632' },
  { name: 'COOKIES', price: 4.99, pitch: 'SALE!', color: '#a8743c' },
  { name: 'SODA 12PK', price: 7.99, pitch: 'HOT DEAL!', color: '#e0503c' },
  { name: 'ENERGY 4PK', price: 9.99, pitch: 'NEW!', color: '#2fb5b0' },
  { name: 'ICE CREAM', price: 5.99, pitch: 'SALE!', color: '#ef7fae' },
  { name: 'DONUTS', price: 6.49, pitch: 'FRESH!', color: '#f2a0c0' },
  { name: 'CANDY', price: 3.49, pitch: '3 FOR $9!', color: '#9a5ad0' },
];
export const CHECKOUT_CANDY: Impulse = { name: 'CANDY BAR', price: 2.29, pitch: 'TREAT YO SELF', color: '#c0392b' };

// ---------- a trip ----------
export interface ListItem {
  def: ItemDef;
  opts: [Opt, Opt]; // this trip's prices (one item may have the name brand on sale)
  got: -1 | 0 | 1; // which option went in the cart
}

const shuffle = <T>(a: T[], r: () => number): T[] => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export { shuffle };

const cheapest = (o: [Opt, Opt]): number => Math.min(o[0].price, o[1].price);
const priciest = (o: [Opt, Opt]): number => Math.max(o[0].price, o[1].price);

// 5-7 items from different parts of the store, about $50-62 if you buy smart.
export function makeList(r: () => number = Math.random): ListItem[] {
  for (let tries = 0; tries < 400; tries++) {
    const n = 5 + Math.floor(r() * 3);
    const pool = shuffle([...CATALOG], r);
    const per = new Map<SectionId, number>();
    const pickd: ItemDef[] = [];
    for (const d of pool) {
      if (pickd.length >= n) break;
      if ((per.get(d.sec) ?? 0) >= 2) continue;
      per.set(d.sec, (per.get(d.sec) ?? 0) + 1);
      pickd.push(d);
    }
    const low = pickd.reduce((t, d) => t + d.opts[1].price, 0);
    if (low < 50 || low > 62) continue;
    // The store has four aisles (plus the back wall), one section each.
    if (new Set(pickd.filter((d) => !BACK_SECTIONS.includes(d.sec)).map((d) => d.sec)).size > 4) continue;
    const list: ListItem[] = pickd.map((def) => ({ def, opts: [{ ...def.opts[0] }, { ...def.opts[1] }], got: -1 }));
    // Sometimes the name brand is on sale and beats the store brand: read the tags, don't assume.
    const brandy = list.filter((l) => l.def.lesson === 'brand');
    if (brandy.length && r() < 0.65) {
      const l = brandy[Math.floor(r() * brandy.length)];
      l.opts[0] = { tag: 'NAME BRAND', price: Math.floor(l.opts[1].price) - (r() < 0.5 ? 0.01 : 0.51), sale: true };
    }
    // Which side of the shelf each option sits on is random.
    for (const l of list) if (r() < 0.5) l.opts = [l.opts[1], l.opts[0]];
    return list;
  }
  return makeList(Math.random);
}

export function unitPrice(o: Opt, d: ItemDef): string {
  return `$${(o.price / d.qty).toFixed(2)}/${d.unit}`;
}

// ---------- scoring ----------
export interface TripResult {
  list: ListItem[];
  impulses: { name: string; price: number }[];
  coupons: number[]; // values collected
  couponsTotal: number; // how many were in the store
  bumps: number;
}

export function tripTotals(t: TripResult) {
  const got = t.list.filter((l) => l.got >= 0);
  const paid = got.reduce((s, l) => s + l.opts[l.got as 0 | 1].price, 0);
  const smart = got.reduce((s, l) => s + cheapest(l.opts), 0);
  const brandAll = got.reduce((s, l) => s + priciest(l.opts), 0);
  const impulse = t.impulses.reduce((s, i) => s + i.price, 0);
  const coupons = t.coupons.reduce((s, c) => s + c, 0);
  const missing = t.list.filter((l) => l.got < 0);
  const missingCost = missing.reduce((s, l) => s + cheapest(l.opts) * 1.5, 0);
  const total = Math.max(0, paid + impulse - coupons);
  return { got: got.length, n: t.list.length, paid, smart, brandAll, impulse, coupons, total, missing: missing.length, missingCost, saved: brandAll - paid };
}

export function scoreTrip(t: TripResult): number {
  const T = tripTotals(t);
  const listFrac = T.n ? T.got / T.n : 0;
  const thriftItems = T.brandAll - T.smart > 0.01 ? Math.max(0, Math.min(1, (T.brandAll - T.paid) / (T.brandAll - T.smart))) : 1;
  const couponFrac = t.couponsTotal ? t.coupons.length / t.couponsTotal : 1;
  // Squared, so grabbing whatever's closest (about half right) doesn't earn half credit.
  const thrift = 0.8 * thriftItems * thriftItems + 0.2 * couponFrac;
  const impulseScore = Math.max(0, 1 - 0.34 * t.impulses.length);
  const bumpPen = Math.min(0.1, 0.02 * t.bumps);
  const s = listFrac ** 1.5 * 0.35 + listFrac * (0.4 * thrift + 0.25 * impulseScore) - bumpPen;
  return Math.max(0, Math.min(1, Math.round(s * 1000) / 1000));
}

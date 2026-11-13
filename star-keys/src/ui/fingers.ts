// QWERTY layout, finger lookup and the finger colour palette.
import { fingerFor, FINGERS } from './assets';

export type Finger = 'L5' | 'L4' | 'L3' | 'L2' | 'R2' | 'R3' | 'R4' | 'R5' | 'thumb';

export const FINGER_ORDER: readonly Finger[] = ['L5', 'L4', 'L3', 'L2', 'thumb', 'R2', 'R3', 'R4', 'R5'];

export const FINGER_NAME: Record<Finger, string> = {
  L5: 'left pinky',
  L4: 'left ring',
  L3: 'left middle',
  L2: 'left index',
  R2: 'right index',
  R3: 'right middle',
  R4: 'right ring',
  R5: 'right pinky',
  thumb: 'thumb',
};

export const FINGER_SHORT: Record<Finger, string> = {
  L5: 'pinky',
  L4: 'ring',
  L3: 'middle',
  L2: 'index',
  R2: 'index',
  R3: 'middle',
  R4: 'ring',
  R5: 'pinky',
  thumb: 'thumbs',
};

// Mirrored hands share a hue family per finger so pinky/ring/etc read the same on both sides.
export const FINGER_COLOR: Record<Finger, string> = {
  L5: '#ff6fa8',
  L4: '#ffa24a',
  L3: '#ffe156',
  L2: '#7ef070',
  R2: '#45e6d8',
  R3: '#5aa9ff',
  R4: '#a78bff',
  R5: '#f27cff',
  thumb: '#b9c3e6',
};

export interface KeyDef {
  id: string; // base char, or a name for non-typing keys
  base: string; // '' for non-typing keys
  shift: string;
  span: number; // quarter-key columns (60 per row)
  label?: string;
  kind?: 'shiftL' | 'shiftR' | 'mod' | 'space' | 'gap';
}

const k = (base: string, shift: string): KeyDef => ({ id: base, base, shift, span: 4 });
const mod = (id: string, label: string, span: number): KeyDef => ({ id, base: '', shift: '', span, label, kind: 'mod' });
const letters = (s: string): KeyDef[] => [...s].map((c) => k(c, c.toUpperCase()));

export const ROWS: readonly (readonly KeyDef[])[] = [
  [
    k('`', '~'),
    k('1', '!'),
    k('2', '@'),
    k('3', '#'),
    k('4', '$'),
    k('5', '%'),
    k('6', '^'),
    k('7', '&'),
    k('8', '*'),
    k('9', '('),
    k('0', ')'),
    k('-', '_'),
    k('=', '+'),
    mod('bksp', 'del', 8),
  ],
  [mod('tab', 'tab', 6), ...letters('qwertyuiop'), k('[', '{'), k(']', '}'), { ...k('\\', '|'), span: 6 }],
  [mod('caps', 'caps', 7), ...letters('asdfghjkl'), k(';', ':'), k("'", '"'), mod('enter', 'enter', 9)],
  [
    { id: 'shiftL', base: '', shift: '', span: 9, label: 'shift', kind: 'shiftL' },
    ...letters('zxcvbnm'),
    k(',', '<'),
    k('.', '>'),
    k('/', '?'),
    { id: 'shiftR', base: '', shift: '', span: 11, label: 'shift', kind: 'shiftR' },
  ],
  [
    { id: 'gapL', base: '', shift: '', span: 16, kind: 'gap' },
    { id: ' ', base: ' ', shift: ' ', span: 25, label: 'space', kind: 'space' },
    { id: 'gapR', base: '', shift: '', span: 19, kind: 'gap' },
  ],
];

// Standard touch-typing assignment; used where levels.FINGERS has no entry.
const DEFAULT_FINGER: Record<string, Finger> = {};
const assign = (f: Finger, keys: string): void => {
  for (const c of keys) DEFAULT_FINGER[c] = f;
};
assign('L5', '`1qaz');
assign('L4', '2wsx');
assign('L3', '3edc');
assign('L2', '45rtfgvb');
assign('R2', '67yuhjnm');
assign('R3', '8ik,');
assign('R4', '9ol.');
assign('R5', "0-=p[]\\;'/");
assign('thumb', ' ');
Object.assign(DEFAULT_FINGER, { tab: 'L5', caps: 'L5', shiftL: 'L5', shiftR: 'R5', enter: 'R5', bksp: 'R5' });

const BY_CHAR = new Map<string, { key: KeyDef; shift: boolean }>();
for (const row of ROWS) {
  for (const key of row) {
    if (!key.base) continue;
    BY_CHAR.set(key.base, { key, shift: false });
    if (key.shift !== key.base && !BY_CHAR.has(key.shift)) BY_CHAR.set(key.shift, { key, shift: true });
  }
}

// Physical key for a typed char (null for chars not on the board).
export function locate(ch: string): { key: KeyDef; shift: boolean } | null {
  return BY_CHAR.get(ch) ?? null;
}

const isFinger = (v: unknown): v is Finger => typeof v === 'string' && v in FINGER_COLOR;

export function fingerOfKey(id: string): Finger {
  const f = FINGERS[id];
  if (isFinger(f)) return f;
  return DEFAULT_FINGER[id] ?? 'thumb';
}

export function fingerOf(ch: string): Finger {
  const direct = fingerFor(ch);
  if (isFinger(direct)) return direct;
  const loc = locate(ch);
  return loc ? fingerOfKey(loc.key.id) : 'thumb';
}

// Shift key for a capital/symbol: the hand opposite the typing finger.
export function shiftFor(ch: string): 'shiftL' | 'shiftR' | null {
  const loc = locate(ch);
  if (!loc || !loc.shift) return null;
  return fingerOf(ch).startsWith('L') ? 'shiftR' : 'shiftL';
}

// Display name of a char ("space" for ' ').
export function keyName(ch: string): string {
  return ch === ' ' ? 'space' : ch;
}

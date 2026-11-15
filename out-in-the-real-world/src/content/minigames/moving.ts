// Moving Day: pack the truck so nothing breaks, then drive it over.
import { charge, energy, money } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

// Names for the b_<id> flags the game reports for each broken item.
const BROKE: Record<string, string> = {
  tv: 'the TV',
  lamp: 'the lamp',
  dishes: 'a box of dishes',
  mirror: 'the mirror',
  guitar: 'the guitar',
  plant: 'the plant',
  dresser: 'a dresser drawer',
  fridge: 'the mini fridge door',
  books: 'a box of books',
  books2: 'a box of books',
};

const list = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export const moving: MiniGameDef = {
  id: 'moving',
  title: 'Moving Day',
  how: 'Pick an item on the curb, line it up over the truck, and drop it (or drag it in on touch) before the rental is due. Heavy stuff on the bottom, fragile stuff on top. ◀ ▶ move, ↑ rotate, SPACE drop, Q/E pick. Then drive over and hold BRAKE for every bump.',
  stakes: 'Pack well and drive gently and everything arrives in one piece. Fragile things under heavy ones, or bumps taken too fast, mean broken stuff you pay to replace.',
  art: 'apartment',
  apply: (s, r) => {
    const st = r.played ? r.stats : undefined;
    let cost: number;
    let text: string;
    if (st) {
      const names = [...new Set(Object.keys(st).filter((k) => k.startsWith('b_') && st[k]).map((k) => BROKE[k.slice(2)] ?? 'something'))];
      const left = st.left ?? 0;
      cost = Math.max(0, Math.min(220, Math.round(st.cost ?? 0)));
      const parts: string[] = [];
      if (names.length) parts.push(`Casualties: ${list(names)}.`);
      if (left > 0) parts.push(`${left} thing${left === 1 ? '' : 's'} didn’t fit, so you paid for an extra truck hour to make a second trip.`);
      text = parts.length ? `You made it! ${parts.join(' ')} Fixing and replacing costs ${money(cost)}.` : 'Everything made it in one piece, and the truck went back on time. Professional-level packing.';
    } else {
      cost = Math.round(((1 - r.score) * 150) / 10) * 10;
      text = cost > 0 ? `You made it! Casualties: ${cost >= 80 ? 'a lamp, two plates, and your dignity' : 'one mug'}. Replacing things costs ${money(cost)}.` : 'Everything made it in one piece. Professional-level packing.';
    }
    energy(s, -Math.round(6 + (1 - r.score) * 10));
    if (cost > 0) charge(s, cost, 'Broken stuff from the move');
    return {
      text,
      tip: 'Rent the truck for longer than you think you need, put heavy furniture on the floor, wrap fragile things in towels and clothes, and recruit friends (pizza is the standard payment).',
    };
  },
};

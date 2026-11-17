// Lawn Gig: mow three neighbors' yards for cash without wrecking the flower beds.
import { earn, energy, inc, money } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const lawn: MiniGameDef = {
  id: 'lawn',
  title: 'Lawn Gig',
  how: 'Push the mower with the arrow keys or WASD (on a phone, the thumbstick or drag on the yard). Mow every patch of tall grass before the clock runs out on each of three yards. Steer around flower beds, gnomes, the kiddie pool, pop-up sprinklers and the very nervous dog. When the bag fills up, dump it at the green bin.',
  stakes: 'Three yards, three neighbors watching from their porches. Clean stripes and no damage mean full pay. Mow the roses and they dock it.',
  art: 'campus',
  apply: (s, r) => {
    const pay = Math.round(25 + r.score * 55);
    earn(s, pay);
    inc(s, 'gigTax', pay);
    inc(s, 'gigs');
    energy(s, -12);
    const st = r.stats ?? {};
    const yards = st.yards ?? 0;
    const oops = st.oops ?? 0;
    const line =
      r.score >= 0.75
        ? `Perfect stripes${yards === 3 ? ' on all three yards' : ''}. One neighbor takes a photo of their lawn.`
        : r.score >= 0.4
          ? `A few missed patches${oops ? ` and ${oops === 1 ? 'one little accident' : `${oops} little accidents`}` : ''}, but they paid.`
          : `${oops >= 3 ? 'Flattened flowers, a gnome down, a soggy dog.' : 'Half-mowed lawns.'} They paid, grudgingly.`;
    return {
      text: `${line} You earned ${money(pay)} cash.`,
      tip: 'Cash gigs still count as income. Keep a simple log of what you earn for tax time.',
    };
  },
};

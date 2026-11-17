// Lawn Gig: mow neighbors' lawns without wrecking the flower beds.
import { earn, energy, inc, money } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const lawn: MiniGameDef = {
  id: 'lawn',
  title: 'Lawn Gig',
  how: 'Drive the mower with the arrow keys or WASD (or the stick). Cut all the tall grass, steer around flower beds, sprinkler heads, garden gnomes, and the very nervous dog. Beat the clock to fit in another yard.',
  stakes: 'Clean cuts mean more yards and better tips. Mow the roses and the neighbor docks your pay.',
  art: 'campus',
  apply: (s, r) => {
    const pay = Math.round(25 + r.score * 55);
    earn(s, pay);
    inc(s, 'gigTax', pay);
    inc(s, 'gigs');
    energy(s, -12);
    return {
      text: `${r.score >= 0.75 ? 'Perfect stripes. The neighbor takes a photo of their lawn.' : r.score >= 0.4 ? 'A few missed patches, but they paid.' : 'You mowed a petunia. They paid, grudgingly.'} You earned ${money(pay)} cash.`,
      tip: 'Cash gigs still count as income. Keep a simple log of what you earn for tax time.',
    };
  },
};

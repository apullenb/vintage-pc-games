// River Run: steer a tube down the river, dodge rocks and logs, ride the rapids.
import { charge, energy } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const river: MiniGameDef = {
  id: 'river',
  title: 'River Run',
  how: 'Steer left and right with the arrow keys or A/D (or tilt with the on-screen buttons). Paddle faster with ↑. Dodge rocks, logs, and low branches, grab floating snacks, and stay out of the whirlpools.',
  stakes: 'A smooth ride is the best day of the summer. Wipe out and you might lose something to the river.',
  art: 'beach',
  apply: (s, r) => {
    energy(s, Math.round(6 + r.score * 10));
    if (r.score < 0.35) {
      charge(s, 40, 'Lost sunglasses and flip-flops');
      return { text: 'You flipped twice. The river now owns your sunglasses and one flip-flop. Still a great day. (−$40 to replace them)' };
    }
    return { text: r.score >= 0.75 ? 'Perfect float. Sun, snacks, zero wipeouts. Rae calls you “River Legend” now.' : 'One wipeout, a lot of laughing, and a mild sunburn. Classic.' };
  },
};

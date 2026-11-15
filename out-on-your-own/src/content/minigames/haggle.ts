// Haggle: a timing/negotiation meter for car prices and asking for a raise.
import { achieve, money, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const haggle: MiniGameDef = {
  id: 'haggle',
  title: (_s, d) => (d.item === 'raise' ? 'Ask for the Raise' : 'Haggle'),
  how: 'Each round, stop the moving needle in the green zone (SPACE, click, or tap). Push too hard and they walk; too soft and you leave money on the table.',
  stakes: (_s, d) => (d.item === 'raise' ? 'A good pitch can get you a raise. A bad one, a polite “not right now.”' : 'Every good round knocks money off the price.'),
  art: 'carlot',
  apply: (s, r, d) => {
    if (d.item === 'raise') {
      unlock(s, 'raise');
      const raise = s.stats.rep >= 55 && r.score >= 0.5 ? (r.score >= 0.85 ? 1.5 : 1) : 0;
      if (raise && s.job) {
        s.job.wage = Math.round((s.job.wage + raise) * 100) / 100;
        achieve(s, 'raise');
        return { text: `“You make a good case.” +${money(raise, true)}/hour, starting next paycheck!`, tip: 'Come with specifics: what you’ve done, how reliable you’ve been, and what the job pays elsewhere.' };
      }
      return {
        text: s.stats.rep < 55 ? '“Let’s revisit after a few more months of solid work.” (Your boss rating needs to be higher.)' : '“I hear you, but not right now.” You fumbled the pitch.',
        tip: 'If you don’t ask, the answer is always no. Practice your pitch out loud first.',
      };
    }
    // Car price: return to the car lot scene with a negotiated price.
    const price = Number(d.price ?? 2400);
    const off = Math.round((r.score * 0.25 * price) / 50) * 50;
    const final = price - off;
    s.queue.unshift({ t: 'scene', id: 'task-transport', step: 'haggled', data: { price: final } });
    return {
      text: off > 0 ? `You talked them down ${money(off)}. Final offer: ${money(final)}.` : `The seller won’t budge. Still ${money(price)}.`,
      tip: 'Sellers expect you to negotiate. Know the car’s value before you go, and be willing to walk away.',
    };
  },
};

// Haggle: a back-and-forth negotiation for a used car's price, or for a raise.
import { achieve, money, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';
import { negotiated } from '../scenes/jobs.ts';

// What the negotiation is worth. The mini-game shows these live, so they must match what apply does.
export function hagglePrice(price: number, score: number): number {
  return price - Math.round((score * 0.25 * price) / 50) * 50;
}
export function raiseFor(score: number): number {
  if (score < 0.35) return 0;
  return Math.min(1.5, Math.round(score * 6) / 4);
}

export const haggle: MiniGameDef = {
  id: 'haggle',
  title: (_s, d) => (d.offer ? 'Negotiate the Offer' : d.item === 'raise' ? 'Ask for the Raise' : 'Haggle'),
  how: (_s, d) =>
    `Four rounds. Listen to what the ${d.item === 'raise' ? 'boss' : 'seller'} says, pick the move that answers it (click or tap a card, or use the arrow keys and SPACE), then stop the power meter in the green to deliver it well. Too soft and it falls flat; into the red and you sound pushy. Watch their patience: if it runs out, the talk is over.`,
  stakes: (_s, d) =>
    d.item === 'raise'
      ? 'A strong case can get you up to $1.50 more per hour. A weak one gets a polite “not right now.” Your boss rating makes them more patient.'
      : `Every move that lands knocks money off the ${money(Number(d.price ?? 2400))} sticker, up to 25% off.`,
  art: 'carlot',
  apply: (s, r, d) => {
    if (d.offer) {
      // Negotiating a job offer: the extra goes into the offer, then back to deciding.
      unlock(s, 'raise');
      return {
        text: negotiated(s, r.played ? raiseFor(r.score) : 0),
        tip: 'Most employers expect a counter. Ask once, politely, with a reason (your skills, the going rate). Then stop talking.',
      };
    }
    if (d.item === 'raise') {
      unlock(s, 'raise');
      const raise = r.played ? raiseFor(r.score) : s.stats.rep >= 60 ? 0.5 : 0;
      if (raise && s.job) {
        s.job.wage = Math.round((s.job.wage + raise) * 100) / 100;
        achieve(s, 'raise');
        return {
          text: `“You make a good case.” +${money(raise, true)}/hour, starting next paycheck!`,
          tip: 'Come with specifics: what you’ve done, how reliable you’ve been, and what the job pays elsewhere. Listen first, then answer the boss’s actual worry.',
        };
      }
      return {
        text:
          s.stats.rep < 50 ? '“Let’s revisit after a few more months of solid work.” (A higher boss rating makes them more open to it.)' : '“I hear you, but not right now.” The pitch didn’t land.',
        tip: 'If you don’t ask, the answer is always no. Practice your pitch out loud first, and stay calm and specific.',
      };
    }
    // Car price: return to the car lot scene with a negotiated price.
    const price = Number(d.price ?? 2400);
    const final = hagglePrice(price, r.score);
    const off = price - final;
    s.queue.unshift({ t: 'scene', id: 'task-transport', step: 'haggled', data: { price: final } });
    return {
      text: off > 0 ? `You talked them down ${money(off)}. Final offer: ${money(final)}.` : `The seller won’t budge. Still ${money(price)}.`,
      tip: 'Sellers expect you to negotiate. Know the car’s value before you go, bring the mechanic’s report, and be willing to walk away.',
    };
  },
};

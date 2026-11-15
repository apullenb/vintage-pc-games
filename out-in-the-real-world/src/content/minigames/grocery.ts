// Grocery Run: push a cart through the store, grab everything on your list, skip the impulse buys.
import { energy, money, setFlag } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const BASE_GROCERIES = 85;

// This week's grocery bill. When the trip was played, it is what rang up at the register plus a
// corner-store markup on anything you forgot, kept within a realistic range for one person.
export function groceryBill(score: number, stats?: Record<string, number>): number {
  if (stats && typeof stats.total === 'number') {
    const raw = stats.total + (stats.missingCost ?? 0);
    return Math.round(Math.max(50, Math.min(120, raw)));
  }
  return Math.round(BASE_GROCERIES * (1.3 - 0.5 * score));
}

export const grocery: MiniGameDef = {
  id: 'grocery',
  title: 'Grocery Run',
  how: 'Push your cart with the arrow keys or WASD (or the on-screen pad, or tap where to go). Walk up to anything marked on your list and grab it, then pick between the two price tags. Dodge the flashing SALE displays, grab coupons, steer around other shoppers, and get to the register before the store gets packed.',
  stakes: 'What rings up at the register is your grocery bill this week. Smart picks and a focused trip keep it low. Forget something and you’ll pay corner-store prices for it later.',
  art: 'grocery',
  apply: (s, r) => {
    const st = r.stats;
    const bill = groceryBill(r.score, st);
    setFlag(s, 'groceryBill', bill);
    if (r.score >= 0.7) energy(s, 3);
    const parts: string[] = [`Your grocery bill this week: ${money(bill)} (a typical trip is about ${money(BASE_GROCERIES)}).`];
    if (st && typeof st.total === 'number') {
      if (st.saved >= 1) parts.push(`Comparing price tags saved you ${money(st.saved, true)} over the pricier picks.`);
      if (st.impulses > 0) parts.push(`${st.impulses} impulse buy${st.impulses > 1 ? 's' : ''} added ${money(st.impulseCost, true)}.`);
      if (st.coupons > 0) parts.push(`Coupons took off ${money(st.coupons, true)}.`);
      if (st.missing > 0) parts.push(`You forgot ${st.missing} thing${st.missing > 1 ? 's' : ''}, so that’s another ${money(st.missingCost, true)} at the corner store.`);
    }
    parts.push(r.score >= 0.7 ? 'Smart list, smart choices.' : r.score >= 0.4 ? 'A couple of things snuck into the cart.' : 'Somehow you came home with three kinds of cookies and no vegetables.');
    return {
      text: parts.join(' '),
      tip: 'Shop with a list, compare unit prices (the small print on the tag), and try the store brand: it’s often made in the same factory. Stores put tempting stuff on the end caps and by the register on purpose.',
    };
  },
};

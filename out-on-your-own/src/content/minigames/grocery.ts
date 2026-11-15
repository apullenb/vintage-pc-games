// Grocery Run: push a cart through the store, grab everything on your list, skip the impulse buys.
import { energy, money, setFlag } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const BASE_GROCERIES = 85;

export const grocery: MiniGameDef = {
  id: 'grocery',
  title: 'Grocery Run',
  how: 'Move with the arrow keys or WASD (or the on-screen pad). Grab everything on your list. Store brands are cheaper. Avoid the impulse-buy displays: candy, chips, the shiny end caps.',
  stakes: 'A focused trip means a cheaper grocery bill and better meals. Wander and the bill climbs.',
  art: 'grocery',
  apply: (s, r) => {
    const bill = Math.round(BASE_GROCERIES * (1.3 - 0.5 * r.score));
    setFlag(s, 'groceryBill', bill);
    if (r.score >= 0.7) energy(s, 3);
    return {
      text: `Your grocery bill this week: ${money(bill)} (a typical trip is about ${money(BASE_GROCERIES)}). ${r.score >= 0.7 ? 'Smart list, smart choices.' : r.score >= 0.4 ? 'A couple of things snuck into the cart.' : 'Somehow you came home with three kinds of cookies and no vegetables.'}`,
      tip: 'Shop with a list, compare unit prices, and don’t shop hungry. Stores put tempting stuff at eye level and the end of aisles on purpose.',
    };
  },
};

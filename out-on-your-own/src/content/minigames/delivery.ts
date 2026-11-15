// Food delivery gig: drive (or bike) around town dropping off orders before they go cold.
import { charge, earn, energy, inc, money } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const delivery: MiniGameDef = {
  id: 'delivery',
  title: (_s, d) => (d.vehicle === 'bike' ? 'Bike Delivery Rush' : 'Delivery Rush'),
  how: 'Drive with the arrow keys or WASD (or the on-screen pad). Pick up orders at restaurants and drop them at the glowing doors before the timer runs out. Watch for speed traps and potholes.',
  stakes: 'Faster deliveries mean bigger tips. Speeding risks a ticket. Every trip costs gas and wear.',
  art: 'street',
  apply: (s, r, d) => {
    const bike = d.vehicle === 'bike';
    const tips = Math.round((bike ? 20 : 35) + r.score * (bike ? 55 : 85));
    earn(s, tips);
    inc(s, 'gigTax', tips);
    inc(s, 'gigs');
    energy(s, bike ? -14 : -12);
    if (!bike) {
      charge(s, 12, 'Delivery gas');
      if (s.car) s.car.condition = Math.max(0, s.car.condition - 1.5);
    }
    return {
      text: `${r.score >= 0.7 ? 'Hot food, happy customers.' : r.score >= 0.4 ? 'A few cold fries, but not bad.' : 'Rough shift. Lots of “where is my order??” texts.'} You made ${money(tips)} in tips${bike ? '' : ', minus $12 for gas'}.`,
      tip: 'Gig money is self-employment income. No taxes are taken out, so set aside about 25% for tax time.',
    };
  },
};

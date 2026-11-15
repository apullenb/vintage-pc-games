// Food delivery gig: drive (or bike) around town dropping off orders before they go cold.
import { charge, earn, energy, inc, money } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

// What a speed-trap ticket costs (a real one is often $100–$250; a bike citation is smaller).
export const TICKET = { car: 105, bike: 45 };

export const delivery: MiniGameDef = {
  id: 'delivery',
  title: (_s, d) => (d.vehicle === 'bike' ? 'Bike Delivery Rush' : 'Delivery Rush'),
  how: (_s, d) =>
    `${d.vehicle === 'bike' ? 'Ride' : 'Drive'} with the arrow keys or WASD (or the on-screen pad, or hold your finger on the map). Pick up orders at the glowing restaurant and drop them at the matching door before the timer runs out. Hold SPACE / SLOW through the cop’s 15 mph zone. Watch out for traffic and potholes.${d.vehicle === 'bike' ? ' Bikes can cut through the park.' : ''}`,
  stakes: 'You get paid per delivery, and faster deliveries mean bigger tips. Speeding risks a ticket. Every trip costs gas and wear.',
  art: 'street',
  apply: (s, r, d) => {
    const bike = d.vehicle === 'bike';
    // Played: you earn exactly what the shift showed. Skipped: an average-ish shift.
    const earned = r.played && r.stats?.earned !== undefined ? r.stats.earned : (bike ? 20 : 35) + r.score * (bike ? 55 : 85);
    const tips = Math.max(0, Math.round(earned));
    if (tips > 0) earn(s, tips);
    inc(s, 'gigTax', tips);
    inc(s, 'gigs');
    energy(s, bike ? -14 : -12);
    if (!bike) {
      charge(s, 12, 'Delivery gas');
      if (s.car) s.car.condition = Math.max(0, s.car.condition - 1.5);
    }
    const ticket = r.played && !!r.stats?.ticket;
    const fine = bike ? TICKET.bike : TICKET.car;
    if (ticket) charge(s, fine, 'Speeding ticket');
    const delivered = r.stats?.delivered;
    const mood = r.score >= 0.7 ? 'Hot food, happy customers.' : r.score >= 0.4 ? 'A few cold fries, but not bad.' : 'Rough shift. Lots of “where is my order??” texts.';
    const count = r.played && delivered !== undefined ? ` ${delivered} deliver${delivered === 1 ? 'y' : 'ies'}.` : '';
    const ticketText = ticket
      ? `\n\nAnd the flashing lights in your mirror: a ${money(fine)} ticket for speeding through the slow zone${bike ? ' (yes, bikes get tickets too)' : ''}. That ate ${fine >= tips ? 'the whole shift' : 'a big chunk of the shift'}.`
      : '';
    return {
      text: `${mood}${count} You made ${money(tips)} in pay and tips${bike ? '' : ', minus $12 for gas'}.${ticketText}`,
      tip: ticket
        ? 'A ticket can also raise your car insurance for years. Rushing a $5 tip is never worth a $100+ fine.'
        : 'Gig money is self-employment income. No taxes are taken out, so set aside about 25% for tax time.',
    };
  },
};

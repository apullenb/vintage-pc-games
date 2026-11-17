// Thrift Hunt: roam the thrift store and garage sales and "tag" deals before someone else grabs them.
import { charge, energy, money, setFlag } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const thrift: MiniGameDef = {
  id: 'thrift',
  title: 'Thrift Hunt',
  how: 'Move with WASD or the arrow keys (or the stick) and tag deals with your price gun (aim with the mouse or tap). The good finds scurry away and other shoppers chase them. Every tag spends from your budget, and you can only carry so much home, so pick carefully.',
  stakes: (_s, d) => `You have about ${money(Number(d.budget ?? 150))} to spend on ${d.goal === 'clothes' ? 'a winter coat and work clothes' : 'furniture for your empty place'}. Smart finds stretch it. Junk wastes it.`,
  art: 'street',
  apply: (s, r, d) => {
    const budget = Number(d.budget ?? 150);
    const spent = Math.round(r.stats?.spent ?? budget * (0.85 - 0.25 * r.score));
    if (spent > 0) charge(s, spent, 'Thrift finds');
    if (d.goal !== 'clothes') {
      setFlag(s, 'needFurniture', false);
      if (r.score < 0.35) setFlag(s, 'airMattress');
    }
    energy(s, r.score >= 0.6 ? 6 : -2);
    const retail = d.goal === 'clothes' ? 220 : 900;
    return {
      text:
        r.score >= 0.6
          ? `Score! You spent ${money(spent)} on stuff that would cost about ${money(retail)} new.`
          : r.score >= 0.35
            ? `You spent ${money(spent)}. Some good finds, some… questionable ones.`
            : `You spent ${money(spent)} and came home with a lamp shaped like a duck. You still need ${d.goal === 'clothes' ? 'a coat' : 'a bed'}.`,
      tip: 'Thrift stores, garage sales, and free listings can furnish a whole place for a fraction of the price. Check for bedbugs on anything soft!',
    };
  },
};

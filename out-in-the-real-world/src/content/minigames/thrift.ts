// Thrift Hunt: roam the thrift store, flea market or garage-sale street and "tag" deals before someone else grabs them.
import { charge, energy, money, setFlag } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const thrift: MiniGameDef = {
  id: 'thrift',
  title: 'Thrift Hunt',
  how: 'Move with WASD or the arrow keys (or the thumbstick on a phone). Aim your price-tag gun with the mouse and click (or tap the screen) to tag a find and buy it. The good deals have legs: they scurry off and hide behind racks, and other shoppers chase them too. Tag a shopper to make them drop what they grabbed. Junk (stains, bugs, missing legs) just sits there with flies around it. Every tag spends from your budget, and you can only haul so many pounds home.',
  stakes: (_s, d) => `You have about ${money(Number(d.budget ?? 150))} to spend on ${d.goal === 'clothes' ? 'a winter coat and work clothes' : 'a bed, a table and somewhere to sit'}. Smart finds stretch it. Junk wastes it.`,
  art: 'street',
  apply: (s, r, d) => {
    const budget = Number(d.budget ?? 150);
    const st = r.stats;
    const spent = Math.round(st?.spent ?? budget * (0.85 - 0.25 * r.score));
    if (spent > 0) charge(s, spent, 'Thrift finds');
    const clothes = d.goal === 'clothes';
    const short = st ? st.got < st.needed : r.score < 0.35;
    if (!clothes) {
      setFlag(s, 'needFurniture', false);
      if (short && r.score < 0.35) setFlag(s, 'airMattress');
    }
    energy(s, r.score >= 0.6 ? 6 : -2);
    const worth = st ? spent + Math.round(st.saved) : clothes ? 220 : 900;
    const parts: string[] = [];
    if (r.score >= 0.6) parts.push(`Score! You spent ${money(spent)} on stuff that would cost about ${money(worth)} new.`);
    else if (r.score >= 0.35) parts.push(`You spent ${money(spent)}. Some good finds, some… questionable ones.`);
    else parts.push(`You spent ${money(spent)} and came home with a lamp shaped like a duck.`);
    if (st && st.junk > 0) parts.push(`${st.junk === 1 ? 'One thing' : `${st.junk} things`} you tagged went straight to the curb.`);
    if (short) parts.push(clothes ? 'You still need some of your winter and work clothes.' : 'Your place is still missing something. The air mattress it is, for now.');
    return {
      text: parts.join(' '),
      tip: 'Thrift stores, garage sales, and free listings can furnish a whole place for a fraction of the price. Check for stains, wobbles and bedbugs (look in the seams) on anything soft before you pay!',
    };
  },
};

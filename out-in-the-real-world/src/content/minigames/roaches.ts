// Roach Patrol: your kitchen at midnight. Spray the roaches before they multiply, seal the cracks
// they come from, and keep them off the food.
import { energy, setFlag, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const roaches: MiniGameDef = {
  id: 'roaches',
  title: 'Roach Patrol',
  how: 'Move with WASD or the arrow keys and spray toward the mouse (click or hold; the can runs dry and refills slowly). On a phone, the left stick moves and the right stick aims and sprays, or tap where you want to spray. New cracks open in waves: stand on one and press SPACE (or SEAL) to caulk it shut. Roaches scatter, hide under the fridge and the table, multiply if left alone, and go for the food on the counter.',
  stakes: 'Seal every crack and clear the kitchen and the problem’s solved. Miss too many and they come back worse.',
  art: 'apartment',
  apply: (s, r) => {
    unlock(s, 'pests');
    energy(s, -6);
    const st = r.played ? r.stats : undefined;
    const tally = st ? ` (${st.splatted} splatted, ${st.sealed}/${st.cracks} cracks sealed.)` : '';
    if (r.score >= 0.6) {
      setFlag(s, 'roaches', 0);
      if (st && !st.cleared) return { text: `Close enough. The cracks are mostly caulked and the stragglers are on borrowed time.${tally}` };
      return { text: `Clean sweep. Cracks sealed, kitchen spotless. The roaches have moved to a different apartment (probably Theo’s).${tally}` };
    }
    setFlag(s, 'roaches', s.week);
    return {
      text: `You got a lot of them… but not all. You hear a skittering at 2 AM. They’ll be back.${tally}`,
      tip: 'In most states, landlords must keep rentals free of pests. Report it in writing and keep a copy.',
    };
  },
};

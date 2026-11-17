// River Run: steer a tube down the river with Rae: rocks, logs, rapids, a waterfall, a rope swing.
import { charge, energy } from '../../engine/core.ts';
import type { GameState } from '../../engine/types.ts';
import type { MiniGameDef } from './types.ts';

const onTrip = (s: GameState): boolean => !!s.flags.roadTrip || (!!s.flags.roadTripBooked && s.week >= 34);

export const river: MiniGameDef = {
  id: 'river',
  title: (s) => (onTrip(s) ? 'River Run to the Sea' : 'River Run'),
  how: 'Steer with ←/→ or A/D (on a phone, hold ◀ ▶ or drag on the river). Tap ↑/W to paddle for a burst; hold ↓/S to drag your feet and slow down. Glance off rocks but never hit them head-on, take the smooth V over the waterfall, and steer into the rope swing. Grab snacks, Rae’s lost sandal and the cooler. A wipeout makes you drop what you’re holding, and three wipeouts and you’re out.',
  stakes: (s) =>
    onTrip(s)
      ? 'One last float with Rae, all the way down to the ocean at sunset. Stay together, stay upright, and bring the snacks.'
      : 'A smooth ride with Rae is the best day of the summer. Wipe out and the river keeps your stuff.',
  art: 'beach',
  apply: (s, r) => {
    energy(s, Math.round(6 + r.score * 10));
    const st = r.stats ?? {};
    const trip = onTrip(s);
    const extras = [st.ropeSwing ? 'nailed the rope swing' : '', st.sandal ? 'rescued Rae’s sandal' : '', st.cooler ? 'brought the cooler home' : ''].filter(Boolean);
    const brag = extras.length ? ` You ${extras.join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : '';
    if (r.score < 0.35) {
      charge(s, 40, 'Lost sunglasses and flip-flops');
      return {
        text: `${st.out ? 'Three wipeouts. Rae towed you the rest of the way.' : 'You flipped more than you floated.'} The river now owns your sunglasses and one flip-flop.${trip ? ' The sunset at the ocean was still unreal.' : ' Still a great day.'} (−$40 to replace them)`,
      };
    }
    if (trip)
      return {
        text: r.score >= 0.75 ? `You floated all the way to the ocean as the sun went down. Rae cried a little. So did you.${brag}` : `A couple of spills, a lot of laughing, then the ocean at sunset. What a year.${brag}`,
      };
    return { text: r.score >= 0.75 ? `Perfect float. Sun, snacks, zero drama. Rae calls you “River Legend” now.${brag}` : `A wipeout or two, a lot of laughing, and a mild sunburn. Classic.${brag}` };
  },
};

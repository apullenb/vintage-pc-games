// Roach Patrol: move around the apartment and spray roaches before they multiply.
import { energy, setFlag, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const roaches: MiniGameDef = {
  id: 'roaches',
  title: 'Roach Patrol',
  how: 'Move with WASD or the arrow keys and spray toward the mouse (click), or on a phone use the stick to move and tap to spray. Roaches scatter and multiply, so seal the cracks they come from (stand on a crack and press SPACE) and don’t let them reach the food.',
  stakes: 'Wipe them out and the problem’s solved. Miss too many and they come back worse.',
  art: 'apartment',
  apply: (s, r) => {
    unlock(s, 'pests');
    energy(s, -6);
    if (r.score >= 0.6) {
      setFlag(s, 'roaches', 0);
      return { text: 'Clean sweep. Cracks sealed, kitchen spotless. The roaches have moved to a different apartment (probably Theo’s).' };
    }
    setFlag(s, 'roaches', s.week);
    return {
      text: 'You got a lot of them… but not all. You hear a skittering at 2 AM. They’ll be back.',
      tip: 'In most states, landlords must keep rentals free of pests. Report it in writing and keep a copy.',
    };
  },
};

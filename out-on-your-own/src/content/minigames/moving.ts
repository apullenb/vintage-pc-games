// Moving Day: pack the truck so nothing breaks.
import { charge, energy, money } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const moving: MiniGameDef = {
  id: 'moving',
  title: 'Moving Day',
  how: 'Drag boxes and furniture into the truck (or use the arrow keys and SPACE to rotate and drop). Heavy stuff on the bottom, fragile stuff on top. Fit everything before the rental truck is due back.',
  stakes: 'Pack well and everything arrives in one piece. Pack badly and stuff breaks, which costs money to replace.',
  art: 'apartment',
  apply: (s, r) => {
    const broken = Math.round(((1 - r.score) * 220) / 10) * 10;
    energy(s, -Math.round(6 + (1 - r.score) * 10));
    if (broken > 0) charge(s, broken, 'Broken stuff from the move');
    return {
      text: broken > 0 ? `You made it! Casualties: ${broken >= 120 ? 'a lamp, two plates, and your dignity' : 'one mug'}. Replacing things costs ${money(broken)}.` : 'Everything made it in one piece. Professional-level packing.',
      tip: 'Rent the truck for longer than you think you need, wrap fragile things in towels and clothes, and recruit friends (pizza is the standard payment).',
    };
  },
};

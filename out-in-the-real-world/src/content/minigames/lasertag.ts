// Laser Tag with Rae and friends: top-down arena, move and shoot.
import { energy } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const lasertag: MiniGameDef = {
  id: 'lasertag',
  title: 'Laser Tag',
  how: 'Move with WASD or the arrow keys and aim with the mouse (click to fire), or on a phone use the left stick to move and tap where you want to shoot. Tag your friends, dodge their shots, and grab power-ups. Get tagged and you’re out for a few seconds.',
  stakes: 'Pure fun. A great game with friends recharges you more (bonus energy).',
  art: 'party',
  apply: (s, r) => {
    const bonus = Math.round(r.score * 10);
    energy(s, bonus);
    return {
      text:
        r.score >= 0.8
          ? `You top the scoreboard. Rae demands a rematch. +${bonus} bonus energy.`
          : r.score >= 0.5
            ? `Middle of the pack, maximum fun. +${bonus} bonus energy.`
            : `Rae tagged you eleven times and will never let you forget it. Still fun. +${bonus} bonus energy.`,
      tip: 'Cheap fun counts. Hanging out doesn’t have to be expensive to recharge you.',
    };
  },
};

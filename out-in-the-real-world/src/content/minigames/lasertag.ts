// Laser Tag with Rae and friends: top-down blacklight arena, move and shoot. Arenas and modes
// (free-for-all, glow flag, last one standing) rotate every laser-tag night.
import { energy } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

const ORD = ['1st', '2nd', '3rd', '4th', '5th'];

export const lasertag: MiniGameDef = {
  id: 'lasertag',
  title: 'Laser Tag',
  how: 'Move with WASD or the arrow keys, aim with the mouse and click to fire (holding the trigger overheats your blaster). On a phone, the left stick moves and the right stick aims and fires, or tap the arena to shoot there. Tag your friends, dodge their slow glowing bolts, duck behind cover, and grab power-ups: rapid fire, shield and speed. Get tagged and your vest goes dark for a couple of seconds.',
  stakes: 'Pure fun. A great game with friends recharges you more (bonus energy).',
  art: 'party',
  apply: (s, r) => {
    const bonus = Math.round(r.score * 10);
    energy(s, bonus);
    const rank = r.stats?.rank;
    const tags = r.stats?.tags;
    const placed = r.played && rank ? ` You placed ${ORD[rank - 1] ?? `${rank}th`}${tags !== undefined ? ` with ${tags} tag${tags === 1 ? '' : 's'}` : ''}.` : '';
    return {
      text:
        (r.score >= 0.8
          ? `You top the scoreboard. Rae demands a rematch.`
          : r.score >= 0.5
            ? `Middle of the pack, maximum fun.`
            : `Rae tagged you eleven times and will never let you forget it. Still fun.`) +
        placed +
        ` +${bonus} bonus energy.`,
      tip: 'Cheap fun counts. Hanging out doesn’t have to be expensive to recharge you.',
    };
  },
};

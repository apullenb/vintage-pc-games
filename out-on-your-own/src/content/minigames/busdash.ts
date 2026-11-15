// Bus Dash: you're late. Run, jump, and weave through the sidewalk to catch the bus.
import { energy, rep } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const busdash: MiniGameDef = {
  id: 'busdash',
  title: 'Bus Dash',
  how: 'You run on your own. Jump with ↑ or SPACE (hold for a higher jump) over dogs, strollers, puddles and signs. Duck with ↓ under ladders, sprinklers and low branches. On a phone: tap the screen to jump, hold DUCK to duck. Grab coffee for a burst of speed. Every bump costs you time.',
  stakes: 'Make it and you’re on time. Miss it and you show up late, and your boss notices.',
  art: 'street',
  apply: (s, r) => {
    energy(s, -4);
    const left = r.stats?.secondsLeft;
    if (r.score >= 0.5) {
      rep(s, 1);
      const close = r.played && left !== undefined && left < 2;
      return {
        text: close
          ? 'You slap the side of the bus just as the doors close. The driver sighs and lets you on. On time!'
          : r.played && (r.stats?.bumps ?? 1) === 0
            ? 'You weave through the morning like a movie stunt double and hop on with time to spare. On time!'
            : 'You hop on, out of breath, as the driver pulls the lever. On time!',
      };
    }
    rep(s, -3);
    return {
      text: 'The bus pulls away without you. The next one is 20 minutes later. You’re late, and your boss definitely noticed.',
      tip: 'Leave 10 minutes earlier than you think you need. Being on time is half of being reliable.',
    };
  },
};

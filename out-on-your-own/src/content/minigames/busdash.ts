// Bus Dash: you're late. Run, jump, and weave through the sidewalk to catch the bus.
import { energy, rep } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const busdash: MiniGameDef = {
  id: 'busdash',
  title: 'Bus Dash',
  how: 'Jump with ↑, SPACE, or tap. Duck with ↓. Dodge dogs, strollers, and puddles, and reach the bus stop before the bus pulls away.',
  stakes: 'Make it and you’re on time. Miss it and you show up late, and your boss notices.',
  art: 'street',
  apply: (s, r) => {
    energy(s, -4);
    if (r.score >= 0.5) {
      rep(s, 1);
      return { text: 'You slap the side of the bus just as the doors close. The driver sighs and lets you on. On time!' };
    }
    rep(s, -3);
    return {
      text: 'The bus pulls away without you. The next one is 20 minutes later. You’re late, and your boss definitely noticed.',
      tip: 'Leave 10 minutes earlier than you think you need. Being on time is half of being reliable.',
    };
  },
};

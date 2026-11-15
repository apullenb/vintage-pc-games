// Flashcard Cram: memory-match money and career terms against the clock.
import { energy, inc, rep, xp } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const flashcards: MiniGameDef = {
  id: 'flashcards',
  title: 'Flashcard Cram',
  how: 'Flip two cards at a time (click or tap). Match each term with its meaning before time runs out.',
  stakes: 'Better studying means more career progress toward your big milestone.',
  art: 'library',
  apply: (s, r) => {
    const base = s.path === 'home' && !s.flags.certEnrolled ? 3 : 4;
    const gain = Math.round(base + r.score * 5);
    xp(s, gain);
    energy(s, -8);
    if (s.path === 'work') rep(s, 1);
    inc(s, 'studySessions');
    return { text: `Career progress +${gain}. ${r.score >= 0.75 ? 'It actually stuck this time!' : r.score >= 0.4 ? 'Some of it stuck.' : 'You mostly stared at the page.'}` };
  },
};

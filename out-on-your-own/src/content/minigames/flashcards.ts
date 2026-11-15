// Flashcard Cram: zap the term that matches each meaning before it falls past the deadline.
import { energy, inc, rep, xp } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const flashcards: MiniGameDef = {
  id: 'flashcards',
  title: 'Flashcard Cram',
  how: 'A meaning appears at the top and three term cards fall toward the DEADLINE. Move under the matching term and zap it with your highlighter before it lands: ◀ ▶ (or A/D) to move and SPACE to zap, or just tap the card. First-try hits build a combo. Cards fall faster and shuffle as you go.',
  stakes: 'Better studying means more career progress toward your big milestone. Terms from your Adulting Handbook show up, plus a few new ones.',
  art: 'library',
  apply: (s, r) => {
    const base = s.path === 'home' && !s.flags.certEnrolled ? 3 : 4;
    const gain = Math.round(base + r.score * 5);
    xp(s, gain);
    energy(s, -8);
    if (s.path === 'work') rep(s, 1);
    inc(s, 'studySessions');
    const st = r.played ? r.stats : undefined;
    const tally = st && st.total ? ` You got ${st.correct} of ${st.total} on the first try${(st.bestStreak ?? 0) >= 5 ? `, with a ${st.bestStreak}-card streak` : ''}.` : '';
    return { text: `Career progress +${gain}.${tally} ${r.score >= 0.75 ? 'It actually stuck this time!' : r.score >= 0.4 ? 'Some of it stuck.' : 'You mostly stared at the page.'}` };
  },
};

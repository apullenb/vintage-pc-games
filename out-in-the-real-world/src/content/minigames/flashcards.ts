// Flashcard Cram: zap the term that matches each meaning before it falls past the deadline.
import { energy, inc, rep, xp } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';
import { gradeExam } from '../college.ts';

export const flashcards: MiniGameDef = {
  id: 'flashcards',
  title: (_s, d) => (d.exam === 'final' ? 'Final Exams' : d.exam === 'midterm' ? 'Midterm Exams' : 'Flashcard Cram'),
  how: 'A meaning appears at the top and three term cards fall toward the DEADLINE. Move under the matching term and zap it with your highlighter before it lands: ◀ ▶ (or A/D) to move and SPACE to zap, or just tap the card. First-try hits build a combo. Cards fall faster and shuffle as you go.',
  stakes: (_s, d) =>
    d.exam
      ? 'This sets your exam grade in every class, along with how much you studied, how many classes you skipped, and how rested you are. Terms from your major’s classes show up.'
      : 'Better studying means more career progress toward your big milestone. Terms from your Adulting Handbook show up, plus a few new ones.',
  art: (s) => (s.path === 'college' ? 'library' : s.housing.art),
  apply: (s, r, d) => {
    if (d.exam === 'midterm' || d.exam === 'final') return { text: gradeExam(s, r.score, d.exam), tip: d.exam === 'midterm' ? 'Midterms show you where you stand. Office hours before the final are the cheapest grade boost there is.' : undefined };
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

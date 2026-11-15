// Extra shift: a fast sorting/catching game skinned for each job (cashier, library, job site, warehouse).
import { earn, rep } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

const TITLE: Record<string, string> = { home: 'Checkout Rush', college: 'Book Return Rush', trade: 'Wire It Up', work: 'Package Sort' };

export const shift: MiniGameDef = {
  id: 'shift',
  title: (s) => TITLE[s.path] ?? 'Shift Rush',
  how: 'Move with ← → (or drag/tap). Catch the right items and sort them into the matching bin. Mistakes and drops cost points.',
  stakes: 'A great shift impresses your boss (and sometimes earns a bonus). A sloppy one gets noticed too.',
  art: 'warehouse',
  apply: (s, r) => {
    const delta = r.score >= 0.85 ? 4 : r.score >= 0.6 ? 2 : r.score >= 0.35 ? 0 : -3;
    rep(s, delta);
    let bonus = 0;
    if (r.score >= 0.9 && s.path === 'work') {
      bonus = 25;
      earn(s, bonus);
    }
    return {
      text:
        r.score >= 0.85
          ? `Best shift anyone’s seen in a while.${bonus ? ' Your supervisor slips you a $25 productivity bonus.' : ' Your boss noticed.'}`
          : r.score >= 0.6
            ? 'Solid shift. You kept up.'
            : r.score >= 0.35
              ? 'You survived. Barely.'
              : 'That was chaos. Your boss is not impressed.',
    };
  },
};

// Extra shift: a fast sorting game skinned for each job (cashier, library, job site, warehouse).
import { earn, rep } from '../../engine/core.ts';
import type { GameState } from '../../engine/types.ts';
import type { MiniGameDef } from './types.ts';

export type ShiftKind = 'home' | 'college' | 'trade' | 'work';

// Which version of Shift Rush to play: follows the job you actually have, not the path you started on.
export function shiftKind(s: GameState): ShiftKind {
  switch (s.job?.art) {
    case 'grocery':
    case 'clinic': // pharmacy and front-desk counters ring people up too
    case 'bank':
      return 'home';
    case 'library':
    case 'office': // filing and sorting
      return 'college';
    case 'jobsite':
      return 'trade';
    case 'warehouse':
    case 'road': // delivery: it's all parcels
      return 'work';
    default:
      return s.path;
  }
}

const TITLE: Record<string, string> = { home: 'Checkout Rush', college: 'Book Return Rush', trade: 'Wire It Up', work: 'Package Sort' };

const HOW: Record<string, string> = {
  home: 'Groceries ride the belt. Press SPACE (or tap the belt) as each one crosses the red laser to scan it. Then bag it: ↓ puts heavy things (cans, milk, melons) at the BOTTOM, ↑ puts squishables (eggs, bread, chips) on TOP. Scan coupons too. If a SALE item rings up at full price, press ← (or tap the register) to fix it before you bag it.',
  college: 'Returned books drop down the chute. Steer each one with ← → into the cart whose call-number range matches its first letter, and press ↓ or SPACE to drop it fast. On a phone, just tap the cart. Books with a yellow HOLD slip go on the holds shelf. Heads up: the color hints stop, and someone moves the carts mid-shift.',
  trade: 'Wire seven devices before each timer runs out. Black, red and blue wires are HOT (brass screw), white is NEUTRAL (silver), green or bare copper is GROUND (green screw). Drag a wire onto its screw, or pick with ← → and SPACE. If the wires are sparking, that circuit is live: flip the BREAKER (↑ or tap it) before you touch anything.',
  work: 'Parcels ride the overhead belt and tip off at the arrow. Walk under them with ← → (or drag) to catch them, up to three at a time, then stop at the chute with the matching zone letter and they slide in. Fragile boxes break if they hit the floor; other dropped boxes can be grabbed again for a few seconds.',
};

const DID: Record<string, string> = { home: 'items bagged', college: 'books shelved', trade: 'connections made', work: 'parcels sorted' };

const TIP: Record<string, string> = {
  home: 'Bagging rule of thumb: heavy, hard things go in first; eggs, bread and chips go on top (or in their own bag).',
  college: 'Library of Congress call numbers sort by the letters first, then the numbers.',
  trade: 'Turn off the breaker and test before you touch a wire. Black or red is hot, white is neutral, green or bare is ground.',
  work: 'In a warehouse, damaged freight costs more than slow freight. Fragile means hand-carry.',
};

export const shift: MiniGameDef = {
  id: 'shift',
  title: (s) => TITLE[shiftKind(s)] ?? 'Shift Rush',
  how: (s) => HOW[shiftKind(s)] ?? HOW.work,
  stakes: 'A great shift impresses your boss (and sometimes earns a bonus). A sloppy one gets noticed too.',
  art: (s) => ({ home: 'grocery', college: 'library', trade: 'jobsite', work: 'warehouse' } as const)[shiftKind(s)],
  apply: (s, r) => {
    const delta = r.score >= 0.85 ? 4 : r.score >= 0.6 ? 2 : r.score >= 0.35 ? 0 : -3;
    rep(s, delta);
    let bonus = 0;
    if (r.score >= 0.9 && shiftKind(s) === 'work') {
      bonus = 25;
      earn(s, bonus);
    }
    const n = r.played ? r.stats?.sorted : undefined;
    const tally = n !== undefined ? ` (${n} ${DID[shiftKind(s)] ?? 'done'}.)` : '';
    const zapped = r.played && (r.stats?.zaps ?? 0) > 0;
    return {
      text:
        (r.score >= 0.85
          ? `Best shift anyone’s seen in a while.${bonus ? ' Your supervisor slips you a $25 productivity bonus.' : ' Your boss noticed.'}`
          : r.score >= 0.6
            ? 'Solid shift. You kept up.'
            : r.score >= 0.35
              ? 'You survived. Barely.'
              : 'That was chaos. Your boss is not impressed.') + tally,
      tip: zapped ? TIP.trade : r.played && r.score < 0.6 ? TIP[shiftKind(s)] : undefined,
    };
  },
};

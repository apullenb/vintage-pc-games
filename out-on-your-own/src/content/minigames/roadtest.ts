// Driving test at the DMV: drive the course with an instructor riding along, then parallel park.
import { achieve, setFlag, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const PASS = 0.6;

export const roadtest: MiniGameDef = {
  id: 'roadtest',
  title: 'Driving Test',
  how: 'Gas with ↑, brake with ↓, steer with ← →, and signal with SPACE (or the on-screen pedals). Follow the instructor: stop at the stop sign, change lanes only when your mirror is clear, obey the light and the school zone, then parallel park behind the blue car (hold ↓ to back up).',
  stakes: 'Pass and you get your license. Fail and you have to come back another day and pay again. A crash is an automatic fail.',
  art: 'road',
  apply: (s, r) => {
    const marks = r.stats?.infractions;
    if (r.score >= PASS) {
      setFlag(s, 'license');
      unlock(s, 'license');
      achieve(s, 'licensed');
      return {
        text: `“${marks === 0 ? 'Flawless. I almost never say that.' : 'Nice driving.'}” The instructor actually smiles.\n\nYOU PASSED! Your license photo looks like a hostage photo. It’s valid for 8 years.`,
      };
    }
    return {
      text: `The instructor writes for a long time.${marks ? ` ${marks} marks on the clipboard.` : ''} “That’s not a pass today. You can retest next week.”`,
      tip: 'Most road-test fails come from rolling stops, unsafe lane changes (check your mirror AND blind spot), and going too fast in school zones.',
    };
  },
};

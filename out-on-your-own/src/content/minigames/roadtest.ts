// Road test at the DMV: drive the course, obey signs and lights.
import { achieve, setFlag, unlock } from '../../engine/core.ts';
import type { MiniGameDef } from './types.ts';

export const PASS = 0.6;

export const roadtest: MiniGameDef = {
  id: 'roadtest',
  title: 'Road Test',
  how: 'Steer with ← → (or the on-screen buttons). Brake with ↓ or SPACE. Stop at stop signs, stop for red lights, stay in your lane, and don’t speed.',
  stakes: 'Pass and you get your license. Fail and you have to come back another day and pay again.',
  art: 'road',
  apply: (s, r) => {
    if (r.score >= PASS) {
      setFlag(s, 'license');
      unlock(s, 'license');
      achieve(s, 'licensed');
      return {
        text: `“Nice driving.” The examiner actually smiles.\n\nYOU PASSED! Your license photo looks like a hostage photo. It’s valid for 8 years.`,
      };
    }
    return {
      text: 'The examiner writes for a long time. “That’s a fail. You can retest next week.”',
      tip: 'Most road-test fails come from rolling stops, not checking mirrors, and going too fast in school zones.',
    };
  },
};

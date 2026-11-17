import { describe, expect, it } from 'vitest';
import { newState } from '../content/paths.ts';
import { monthlyGross } from '../content/scenes/tasks.ts';
import { activityFor } from '../content/activities.ts';
import { AUTOPLAY_FEE, begin, chapterReport, finishMinigame, makeStub, taskStatus } from './engine.ts';
import type { GameState } from './types.ts';

const look = { skin: 0, hair: 0, hairStyle: 0, shirt: 0 };
const fresh = (path: GameState['path'] = 'work'): GameState => begin(newState('T', look, path, 7));

describe('missed goals carry over', () => {
  it('a missed license shows up as overdue next chapter, then counts when you finish it', () => {
    const s = fresh();
    s.chapter = 0;
    chapterReport(s, true); // license not done
    expect(s.tasksFailed['t-license']).toBe(true);
    s.chapter = 1;
    const st = taskStatus(s);
    const late = st.find((t) => t.id === 't-license');
    expect(late?.overdue).toBe(true);
    expect(late?.title).toMatch(/^Overdue/);
    s.flags.license = true;
    const r = chapterReport(s, true);
    expect(r.caughtUp.length).toBe(1);
    expect(taskStatus(s).some((t) => t.id === 't-license' && t.overdue)).toBe(false);
  });
  it('time-bound goals do not follow you', () => {
    const s = fresh();
    s.chapter = 2;
    chapterReport(s, true);
    s.chapter = 3;
    expect(taskStatus(s).some((t) => t.id === 't-housing')).toBe(false);
  });
});

describe('auto-play costs money', () => {
  it('skipping a mini-game charges the fee', () => {
    const s = fresh();
    s.queue = [{ t: 'minigame', id: 'shift' }];
    const cash = s.stats.cash;
    const skipped = finishMinigame(s, { score: 0.4, played: false });
    const played = finishMinigame(s, { score: 0.4, played: true });
    expect(played.stats.cash - skipped.stats.cash).toBe(AUTOPLAY_FEE);
    expect(cash - skipped.stats.cash).toBeGreaterThanOrEqual(AUTOPLAY_FEE);
  });
});

describe('extra shifts pay off', () => {
  it('extra shifts show up on pay stubs and raise what landlords see', () => {
    const s = fresh('home');
    s.hoursThisPeriod = s.job!.hours * 2;
    const base = makeStub(s).gross;
    s.flags.avgPaycheck = base;
    const before = monthlyGross(s);
    s.flags.avgPaycheck = base + 6 * 4 * s.job!.wage; // four extra shifts in a pay period
    expect(monthlyGross(s)).toBeGreaterThan(before);
  });
  it('each extra shift builds boss trust', () => {
    const s = fresh();
    const r0 = s.stats.rep;
    activityFor('shift').run(s, 'saturday');
    expect(s.stats.rep).toBe(r0 + 1);
    expect(s.flags.extraShifts).toBe(1);
  });
});

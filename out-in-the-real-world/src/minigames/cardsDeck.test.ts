import { describe, expect, it } from 'vitest';
import { newState } from '../content/paths.ts';
import { HANDBOOK } from '../content/handbook.ts';
import type { PathId } from '../engine/types.ts';
import { rng } from './cardsFx.ts';
import { buildRounds, HANDBOOK_CARDS, PATH_CARDS, ROUNDS } from './cardsDeck.ts';

describe('Flashcard Cram deck', () => {
  it('has a short card for every Adulting Handbook entry', () => {
    for (const e of HANDBOOK) expect(HANDBOOK_CARDS[e.id], e.id).toBeTruthy();
  });

  it('keeps labels and clues short and never gives the answer away', () => {
    const all = [...Object.values(HANDBOOK_CARDS).map(([label, clue]) => ({ label, clue })), ...Object.values(PATH_CARDS).flat()];
    expect(Object.values(PATH_CARDS).flat().length).toBeGreaterThanOrEqual(15);
    expect(Object.values(PATH_CARDS).flat().length).toBeLessThanOrEqual(25);
    for (const c of all) {
      expect(c.label.length, c.label).toBeLessThanOrEqual(20);
      expect(c.clue.length, c.clue).toBeLessThanOrEqual(85);
      expect(c.clue.toLowerCase(), c.label).not.toContain(c.label.toLowerCase());
    }
  });

  it('builds rounds with three distinct options, favoring unlocked terms', () => {
    for (const path of ['home', 'college', 'trade', 'work'] as PathId[]) {
      for (const n of [0, 3, 20, HANDBOOK.length]) {
        const s = newState('T', { skin: 0, hair: 0, hairStyle: 0, shirt: 0 }, path, 7);
        s.handbook = HANDBOOK.slice(0, n).map((e) => e.id);
        const rounds = buildRounds(s, rng(n + 1));
        expect(rounds.length).toBe(ROUNDS);
        expect(new Set(rounds.map((r) => r.answer.id)).size).toBe(ROUNDS);
        for (const r of rounds) {
          expect(new Set(r.options.map((o) => o.label)).size).toBe(3);
          expect(r.options).toContain(r.answer);
        }
        expect(rounds.filter((r) => r.answer.kind === 'path').length).toBe(4);
        if (n >= 20 && n < HANDBOOK.length) expect(rounds.filter((r) => r.answer.fresh).length).toBe(3);
      }
    }
  });
});

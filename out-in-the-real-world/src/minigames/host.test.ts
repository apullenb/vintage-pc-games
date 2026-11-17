import { describe, expect, it } from 'vitest';
import { MINIGAMES } from '../content/minigames/index.ts';
import { gradeOf } from '../ui/MiniGame.tsx';
import { MINIGAME_UI } from './index.ts';

describe('mini-game host', () => {
  it('grades a run with a letter and 0-3 stars that line up with the pass marks', () => {
    expect(gradeOf(1).letter).toBe('S');
    expect(gradeOf(0.85)).toMatchObject({ letter: 'A', stars: 3 });
    expect(gradeOf(0.6)).toMatchObject({ letter: 'B', stars: 2 }); // the road test pass mark is a B
    expect(gradeOf(0.45)).toMatchObject({ letter: 'C', stars: 1 });
    expect(gradeOf(0.1)).toMatchObject({ letter: 'D', stars: 0 });
  });

  it('lazy-loads a component for every defined mini-game', () => {
    expect(Object.keys(MINIGAME_UI).sort()).toEqual(Object.keys(MINIGAMES).sort());
    for (const C of Object.values(MINIGAME_UI)) expect((C as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.lazy'));
  });
});

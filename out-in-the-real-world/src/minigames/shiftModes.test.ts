// Shift Rush modes run headless (no canvas needed for play logic): random players must never crash,
// every shift must end, and scores must stay in 0..1.
import { describe, expect, it } from 'vitest';
import type { Input, Key } from './kit.tsx';
import { checkoutMode } from './shiftCheckout.ts';
import { COUNT_TIME, Fx, shiftScore, type ModeEnv, type ShiftMode } from './shiftKit.ts';
import { libraryMode } from './shiftLibrary.ts';
import { warehouseMode } from './shiftWarehouse.ts';
import { wiresMode } from './shiftWires.ts';

const MODES: Record<string, (e: ModeEnv) => ShiftMode> = { checkout: checkoutMode, library: libraryMode, warehouse: warehouseMode, wires: wiresMode };
const KEYS: Key[] = ['left', 'right', 'up', 'down', 'action'];

function fakeInput(): Input {
  const down = new Set<Key>();
  const pressed = new Set<Key>();
  return {
    down,
    pressed,
    press: (k) => {
      if (!down.has(k)) pressed.add(k);
      down.add(k);
    },
    release: (k) => {
      down.delete(k);
    },
  };
}

function playRandom(mode: ShiftMode, seedish: number): ReturnType<ShiftMode['result']> {
  const inp = fakeInput();
  const dt = 1 / 30;
  let t = 0;
  let left = mode.duration;
  let k = seedish;
  while (left > 0 && !mode.finished?.()) {
    const live = t >= COUNT_TIME;
    if (live) {
      left -= dt;
      k = (k * 1103515245 + 12345) & 0x7fffffff;
      const r = k % 100;
      if (r < 12) inp.press(KEYS[r % 5]);
      else if (r < 24) inp.release(KEYS[r % 5]);
      else if (r < 30) mode.pointer((k >> 8) % 192, (k >> 4) % 108, r < 27 ? 'down' : 'up');
    }
    mode.step(dt, t, inp, live);
    inp.pressed.clear();
    t += dt;
    expect(t).toBeLessThan(200);
  }
  return mode.result();
}

describe('Shift Rush modes', () => {
  for (const [name, make] of Object.entries(MODES))
    it(`${name}: random play finishes with a sane score at every level`, () => {
      for (let level = 0; level <= 4; level++) {
        const mode = make({ fx: new Fx(level % 2 === 1), level, look: { skin: 1, hair: 2, hairStyle: level, shirt: 3 }, rm: level % 2 === 1 });
        expect(mode.keys.length).toBeGreaterThan(0);
        expect(mode.hud().length).toBeGreaterThan(0);
        const res = playRandom(mode, 7 + level * 31);
        expect(Number.isFinite(res.score)).toBe(true);
        expect(res.score).toBeGreaterThanOrEqual(0);
        expect(res.score).toBeLessThanOrEqual(1);
        expect(typeof res.stats.sorted).toBe('number');
        expect(res.line.length).toBeGreaterThan(0);
      }
    });

  it('scores: perfect ~1, attentive in the middle, careless low', () => {
    expect(shiftScore(1, 1)).toBe(1);
    const attentive = shiftScore(0.85, 0.8);
    expect(attentive).toBeGreaterThan(0.6);
    expect(attentive).toBeLessThan(0.85);
    expect(shiftScore(0.6, 0.5)).toBeLessThan(0.4);
    expect(shiftScore(0, 0)).toBe(0);
  });
});

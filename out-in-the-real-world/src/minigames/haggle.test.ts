import { describe, expect, it } from 'vitest';
import { hagglePrice, raiseFor } from '../content/minigames/haggle.ts';
import { CAR, meterFor, PATIENCE_OUT, pickTell, RAISE, repMult, resolve, ROUNDS, scoreOf, startPatience, zoneAt, type Side, type Tactic } from './haggleData.ts';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Player = (tell: Tactic, open: Tactic[], r: () => number) => { t: Tactic; aim: (c: number, w: number, r: () => number) => number };

// Mirrors the component's round loop.
function play(side: Side, player: Player, seed: number, raise = false, rep = 60): number {
  const r = rng(seed);
  let patience = startPatience(raise, rep);
  let gain = 0;
  const used = new Set<string>();
  for (let round = 0; round < ROUNDS; round++) {
    const tell = pickTell(side, used, patience, r);
    const open = side.tactics.filter((t) => t.rapport || !used.has(t.id));
    const { t, aim } = player(tell, open, r);
    const m = meterFor(round, r);
    const p = Math.max(0, Math.min(1, aim(m.c, m.w, r)));
    const res = resolve(t, tell.id === t.id, zoneAt(m, p), p, patience, repMult(raise, rep));
    gain = Math.max(0, Math.min(0.3, gain + res.gain));
    patience = Math.max(0, Math.min(100, patience + res.patience));
    if (!t.rapport) used.add(t.id);
    if (patience <= 0) return scoreOf(gain * PATIENCE_OUT);
  }
  return scoreOf(gain);
}

const avg = (f: (seed: number) => number): number => {
  let s = 0;
  for (let i = 1; i <= 300; i++) s += f(i);
  return s / 300;
};

// Always answers what they said, lands dead center.
const expert: Player = (tell) => ({ t: tell, aim: (c) => c });
// Reads most of the time, usually lands in the green, sometimes a bit early or late.
const attentive: Player = (tell, open, r) => ({
  t: r() < 0.65 ? tell : open[Math.floor(r() * open.length)],
  aim: (c, w, rr) => (rr() < 0.7 ? c + (rr() * 2 - 1) * w * 0.9 : c + (rr() < 0.6 ? -w - 0.1 : w + 0.05)),
});
// Picks anything, mashes the button early (or overshoots now and then).
const careless: Player = (_tell, open, r) => ({ t: open[Math.floor(r() * open.length)], aim: (_c, _w, rr) => (rr() < 0.75 ? rr() * 0.45 : 0.9 + rr() * 0.1) });

describe('haggle calibration', () => {
  for (const [name, side, raise] of [
    ['car', CAR, false],
    ['raise', RAISE, true],
  ] as const) {
    it(`${name}: expert ~1, attentive ~0.6-0.8, careless ~0.2-0.4`, () => {
      const e = avg((sd) => play(side, expert, sd, raise));
      const a = avg((sd) => play(side, attentive, sd, raise));
      const c = avg((sd) => play(side, careless, sd, raise));
      expect(e).toBeGreaterThan(0.9);
      expect(a).toBeGreaterThan(0.55);
      expect(a).toBeLessThan(0.82);
      expect(c).toBeGreaterThan(0.15);
      expect(c).toBeLessThan(0.42);
    });
  }
  it('price and raise follow the score', () => {
    expect(hagglePrice(2400, 0)).toBe(2400);
    expect(hagglePrice(2400, 1)).toBe(1800);
    expect(hagglePrice(2400, 0.5) % 50).toBe(0);
    expect(raiseFor(0.2)).toBe(0);
    expect(raiseFor(0.65)).toBe(1);
    expect(raiseFor(1)).toBe(1.5);
  });
});

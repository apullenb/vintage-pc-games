import { describe, expect, it } from 'vitest';
import { FINGERS, LEVELS, fingerFor } from './levels.ts';
import { Run, simulateTypist } from './engine.ts';
import { moveArc } from './path.ts';
import { HERO_H, VIEW_H, VIEW_W } from './types.ts';

const FINGER_NAMES = new Set(['L5', 'L4', 'L3', 'L2', 'R2', 'R3', 'R4', 'R5', 'thumb']);
const LABEL_H = 16;
const PROMPT_SEEDS = [1, 2, 3, 4, 5];
const RNG_SEEDS = [1, 2, 3];

describe('curriculum', () => {
  it('has 12 worlds with unique ids and a rising 3-star wpm', () => {
    expect(LEVELS).toHaveLength(12);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(12);
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].targetWpm).toBeGreaterThan(LEVELS[i - 1].targetWpm);
    }
  });

  it('keys are cumulative and lesson.newKeys are new', () => {
    let prev = '';
    for (const l of LEVELS) {
      for (const c of prev) expect(l.keys, `${l.id} keeps '${c}'`).toContain(c);
      for (const c of l.lesson.newKeys) {
        expect(l.keys, `${l.id} has new '${c}'`).toContain(c);
        expect(prev.includes(c), `${l.id} '${c}' already learned`).toBe(false);
      }
      expect(l.lesson.tip.length).toBeGreaterThan(10);
      expect(l.story.length).toBeGreaterThan(10);
      prev = l.keys;
    }
  });

  it('prompts use only level.keys, are unique and the pool is >= 3x steps', () => {
    for (const l of LEVELS) {
      expect(new Set(l.words).size, `${l.id} duplicates`).toBe(l.words.length);
      expect(l.words.length, `${l.id} pool`).toBeGreaterThanOrEqual(3 * l.steps);
      for (const w of l.words) {
        expect(w.length).toBeGreaterThan(0);
        expect(w, 'no edge/double spaces').toBe(w.trim());
        expect(w.includes('  ')).toBe(false);
        for (const c of w) expect(l.keys.includes(c), `${l.id} "${w}" uses '${c}'`).toBe(true);
      }
    }
  });

  it('prompt lengths grow gently', () => {
    const avg = LEVELS.map((l) => l.words.reduce((a, w) => a + w.length, 0) / l.words.length);
    expect(Math.max(...LEVELS[0].words.map((w) => w.length))).toBeLessThanOrEqual(4);
    for (const l of LEVELS) expect(Math.max(...l.words.map((w) => w.length)), l.id).toBeLessThanOrEqual(20);
    for (let i = 1; i < avg.length; i++) expect(avg[i], LEVELS[i].id).toBeGreaterThan(avg[i - 1] - 1);
    expect(avg[11]).toBeGreaterThan(avg[0] * 3);
  });

  it('prompts are kid-friendly', () => {
    const banned = ['kill', 'die', 'dead', 'stupid', 'hate', 'idiot', 'ass', 'damn', 'hell', 'sex', 'fight'];
    for (const l of LEVELS) {
      for (const w of l.words) {
        const tokens = w.toLowerCase().split(/[^a-z]+/);
        for (const b of banned) expect(tokens.includes(b), `${l.id} "${w}"`).toBe(false);
      }
    }
  });

  it('FINGERS covers every key (capitals via lowercase)', () => {
    for (const f of Object.values(FINGERS)) expect(FINGER_NAMES.has(f)).toBe(true);
    for (const c of 'abcdefghijklmnopqrstuvwxyz1234567890;,./\'-') expect(FINGERS[c], c).toBeDefined();
    expect(FINGERS[' ']).toBe('thumb');
    expect(FINGERS.f).toBe('L2');
    expect(FINGERS.j).toBe('R2');
    expect(FINGERS.a).toBe('L5');
    expect(FINGERS[';']).toBe('R5');
    for (const l of LEVELS) for (const c of l.keys) expect(fingerFor(c), `${l.id} '${c}'`).toBeDefined();
  });
});

describe('world layout', () => {
  it('path length matches steps and the engine accepts it', () => {
    for (const l of LEVELS) {
      expect(l.path.length).toBe(l.steps + 1);
      expect(() => new Run(l, 1)).not.toThrow();
    }
  });

  it('steps grow and hp stays sane', () => {
    for (const l of LEVELS) {
      expect(l.steps).toBeGreaterThanOrEqual(10);
      expect(l.steps).toBeLessThanOrEqual(22);
      expect(l.hp).toBeGreaterThanOrEqual(5);
      expect(l.threatStart).toBeGreaterThan(0);
      expect(l.graceSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it('waypoints stay in bounds with headroom for hero, arc and label', () => {
    for (const l of LEVELS) {
      expect(l.width).toBeGreaterThanOrEqual(VIEW_W);
      for (let i = 0; i < l.path.length; i++) {
        const p = l.path[i];
        expect(p.x, `${l.id}#${i}`).toBeGreaterThanOrEqual(24);
        expect(p.x, `${l.id}#${i}`).toBeLessThanOrEqual(l.width - 40);
        expect(p.y, `${l.id}#${i}`).toBeGreaterThanOrEqual(30 + HERO_H + LABEL_H);
        expect(p.y, `${l.id}#${i}`).toBeLessThanOrEqual(240);
        expect(p.y).toBeLessThan(VIEW_H);
        if (i > 0) {
          const a = l.path[i - 1];
          const len = Math.hypot(p.x - a.x, p.y - a.y);
          const peak = Math.min(a.y, p.y) - moveArc(p.move, len, 0.5);
          expect(peak - HERO_H, `${l.id}#${i} arc headroom`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('consecutive waypoints are 30-90px apart and never step backwards', () => {
    for (const l of LEVELS) {
      for (let i = 1; i < l.path.length; i++) {
        const a = l.path[i - 1];
        const b = l.path[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        expect(d, `${l.id}#${i}`).toBeGreaterThanOrEqual(30);
        expect(d, `${l.id}#${i}`).toBeLessThanOrEqual(90);
        expect(b.x).toBeGreaterThanOrEqual(a.x);
        if (b.move === 'climb') expect(b.x).toBe(a.x);
      }
    }
  });

  it('escape craft sits on solid ground', () => {
    for (const l of LEVELS) expect(l.path[l.steps].platform).not.toBe('none');
  });
});

describe('winnability', () => {
  const each = (fn: (seed: number, rng: number) => void) => {
    for (const s of PROMPT_SEEDS) for (const r of RNG_SEEDS) fn(s, r);
  };

  for (const [i, l] of LEVELS.entries()) {
    describe(l.name, () => {
      it('forgiving: 60% of target at 95% accuracy wins', () => {
        each((s, r) => expect(simulateTypist(l, s, l.targetWpm * 0.6, 0.95, r).status, `seed ${s}/${r}`).toBe('won'));
      });

      // Misses cost extra keystrokes, so net wpm sits a few % under the keystroke rate; 1.1x covers unlucky seeds.
      it('target speed at 98% accuracy earns 3 stars', () => {
        each((s, r) => expect(simulateTypist(l, s, l.targetWpm * 1.1, 0.98, r).stars, `seed ${s}/${r}`).toBe(3));
      });

      it('the threat matters: 25% of target loses', () => {
        each((s, r) => {
          expect(simulateTypist(l, s, l.targetWpm * 0.25, 1, r).status, `seed ${s}/${r}`).toBe('lost');
          expect(simulateTypist(l, s, l.targetWpm * 0.25, 0.95, r).status, `seed ${s}/${r}`).toBe('lost');
        });
      });

      if (i >= 3) {
        it('hearts matter: 70% accuracy at target speed loses', () => {
          each((s, r) => expect(simulateTypist(l, s, l.targetWpm, 0.7, r).status, `seed ${s}/${r}`).toBe('lost'));
        });
      }
    });
  }
});

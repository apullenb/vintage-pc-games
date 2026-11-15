import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from './achievements.ts';
import { ACTIVITIES } from './activities.ts';
import { TASKS } from './chapters.ts';
import { EVENTS, OFFERS } from './events.ts';
import { HANDBOOK_BY_ID } from './handbook.ts';
import { ALL_SCENES, SCENES } from './scenes.ts';

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../_scratch/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const all = Object.values(sources).join('\n');

describe('content wiring', () => {
  it('every scene starts somewhere and every static "next" exists', () => {
    for (const sc of ALL_SCENES) {
      expect(sc.steps.start, `${sc.id} has a start step`).toBeTruthy();
      for (const [stepId, step] of Object.entries(sc.steps)) {
        expect(step.choices.length, `${sc.id}:${stepId} has choices`).toBeGreaterThan(0);
        for (const c of step.choices) {
          if (typeof c.next === 'string') expect(sc.steps[c.next], `${sc.id}:${stepId} -> ${c.next}`).toBeTruthy();
        }
      }
    }
  });

  it('every event, offer and queued scene exists', () => {
    for (const e of [...EVENTS, ...OFFERS]) expect(SCENES[e.id], e.id).toBeTruthy();
    for (const m of all.matchAll(/scene(?:Later)?\(s, '([\w-]+)'/g)) expect(SCENES[m[1]], m[1]).toBeTruthy();
    for (const m of all.matchAll(/id: '([\w-]+)', step: '([\w-]+)'/g)) {
      expect(SCENES[m[1]], m[1]).toBeTruthy();
      expect(SCENES[m[1]].steps[m[2]], `${m[1]}:${m[2]}`).toBeTruthy();
    }
    for (const id of ['intro-home', 'intro-college', 'intro-trade', 'intro-work', 'firstday', 'chapter-intro', 'ev-sick', 'ev-burnout', 'ev-fired', 'ev-rentlate', 'ev-repo']) {
      expect(SCENES[id], id).toBeTruthy();
    }
  });

  it('every appointment kind has a scene', () => {
    const kinds = [...all.matchAll(/kind: '(\w+)', label:/g)].map((m) => m[1]);
    expect(kinds.length).toBeGreaterThan(5);
    for (const k of kinds) expect(SCENES[`appt-${k}`], `appt-${k}`).toBeTruthy();
  });

  it('activities point at real missions', () => {
    const ids = new Set(TASKS.map((t) => t.id));
    for (const a of Object.values(ACTIVITIES)) if (a.task) expect(ids.has(a.task), `${a.id} -> ${a.task}`).toBe(true);
  });

  it('handbook and achievement ids used in code exist', () => {
    for (const m of all.matchAll(/unlock\(s, '([\w-]+)'\)/g)) expect(HANDBOOK_BY_ID[m[1]], `handbook ${m[1]}`).toBeTruthy();
    const ach = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const m of all.matchAll(/achieve\(s, '([\w-]+)'\)/g)) expect(ach.has(m[1]), `achievement ${m[1]}`).toBe(true);
  });
});

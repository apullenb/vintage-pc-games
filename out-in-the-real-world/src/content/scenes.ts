// Every scene, by id.
import { COLLEGE_SCENES } from './scenes/college.ts';
import { EVENT_SCENES } from './scenes/events.ts';
import { OFFER_SCENES } from './scenes/offers.ts';
import { PHASE2_SCENES } from './scenes/phase2.ts';
import { STORY } from './scenes/story.ts';
import { TASK_SCENES } from './scenes/tasks.ts';
import type { Scene } from './types.ts';

export const ALL_SCENES: Scene[] = [...STORY, ...TASK_SCENES, ...EVENT_SCENES, ...OFFER_SCENES, ...COLLEGE_SCENES, ...PHASE2_SCENES];

export const SCENES: Record<string, Scene> = {};
for (const sc of ALL_SCENES) {
  if (SCENES[sc.id]) throw new Error(`duplicate scene ${sc.id}`);
  SCENES[sc.id] = sc;
}

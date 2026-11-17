// Registry of HD scene paintings. Scenes not listed here are rendered from their
// pixel painting, upscaled with smoothing, by the HD stage.
import type { SceneArt } from '../../../content/types.ts';
import { CARE_SCENES } from './care.ts';
import { CIVIC_SCENES } from './civic.ts';
import { EVENING_SCENES } from './evening.ts';
import { HOME_SCENES } from './homes.ts';
import { PLACE_SCENES } from './places.ts';
import { TOWN_SCENES } from './town.ts';
import type { HDFactory } from './types.ts';
import { WORK_SCENES } from './work.ts';

export const HD_SCENES: Partial<Record<SceneArt, HDFactory>> = {
  ...HOME_SCENES,
  ...CIVIC_SCENES,
  ...WORK_SCENES,
  ...TOWN_SCENES,
  ...CARE_SCENES,
  ...EVENING_SCENES,
  ...PLACE_SCENES,
};

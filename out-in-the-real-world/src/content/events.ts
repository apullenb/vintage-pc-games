// Event and payday-offer pools, plus scheduled story beats.
import type { GameState } from '../engine/types.ts';
import { EVENTS as EVENT_LIST } from './scenes/events.ts';
import { OFFER_LIST, beatsFor } from './scenes/offers.ts';
import { JOB_EVENTS } from './scenes/jobs.ts';
import type { GameEvent } from './types.ts';

export const EVENTS: GameEvent[] = [...EVENT_LIST, ...JOB_EVENTS];
export const OFFERS: GameEvent[] = OFFER_LIST;

export function storyBeats(s: GameState): string[] {
  return beatsFor(s);
}

// Registry: mini-game id -> playable React component. Definitions (stakes, outcomes) live in src/content/minigames/.
import type { ComponentType } from 'react';
import { BusDash } from './BusDash.tsx';
import { Delivery } from './Delivery.tsx';
import { Flashcards } from './Flashcards.tsx';
import { Grocery } from './Grocery.tsx';
import { Haggle } from './Haggle.tsx';
import type { MiniProps } from './kit.tsx';
import { Moving } from './Moving.tsx';
import { RoadTest } from './RoadTest.tsx';
import { Shift } from './Shift.tsx';

export const MINIGAME_UI: Record<string, ComponentType<MiniProps>> = {
  roadtest: RoadTest,
  delivery: Delivery,
  shift: Shift,
  busdash: BusDash,
  grocery: Grocery,
  haggle: Haggle,
  flashcards: Flashcards,
  moving: Moving,
};
export type { MiniProps };

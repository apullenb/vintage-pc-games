// Registry: mini-game id -> playable React component. Definitions (stakes, outcomes) live in src/content/minigames/.
// Every game is lazy-loaded (its own chunk), so the main bundle stays small; the host shows a tiny
// pixel loading state inside <Suspense> and calls preloadMinigame() on the title card.
import { lazy, type ComponentType } from 'react';
import type { MiniProps } from './kit.tsx';

type Loader = () => Promise<ComponentType<MiniProps>>;

const LOADERS: Record<string, Loader> = {
  roadtest: () => import('./RoadTest.tsx').then((m) => m.RoadTest),
  delivery: () => import('./Delivery.tsx').then((m) => m.Delivery),
  shift: () => import('./Shift.tsx').then((m) => m.Shift),
  busdash: () => import('./BusDash.tsx').then((m) => m.BusDash),
  grocery: () => import('./Grocery.tsx').then((m) => m.Grocery),
  haggle: () => import('./Haggle.tsx').then((m) => m.Haggle),
  flashcards: () => import('./Flashcards.tsx').then((m) => m.Flashcards),
  moving: () => import('./Moving.tsx').then((m) => m.Moving),
  lasertag: () => import('./LaserTag.tsx').then((m) => m.LaserTag),
  roaches: () => import('./Roaches.tsx').then((m) => m.Roaches),
  phishing: () => import('./Phishing.tsx').then((m) => m.Phishing),
  thrift: () => import('./Thrift.tsx').then((m) => m.Thrift),
  river: () => import('./River.tsx').then((m) => m.River),
  lawn: () => import('./Lawn.tsx').then((m) => m.Lawn),
};

export const MINIGAME_UI: Record<string, ComponentType<MiniProps>> = Object.fromEntries(
  Object.entries(LOADERS).map(([id, load]) => [id, lazy(() => load().then((C) => ({ default: C })))]),
);

// Start fetching a game's chunk early (e.g. while the title card is up). Safe to call repeatedly.
export function preloadMinigame(id: string): void {
  LOADERS[id]?.().catch(() => {});
}

export type { MiniProps };

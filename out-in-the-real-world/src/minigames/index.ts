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

// After a new version is deployed, a page that was already open asks for old chunk names that no longer
// exist. The game is saved after every step, so reload once to pick up the new version.
const RELOAD_KEY = 'out-in-the-real-world.chunk-reload';
// Tells the app to go straight back into the game after that reload.
export const RESUME_KEY = 'out-in-the-real-world.resume';
function withReload<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().then(
      (v) => {
        try {
          sessionStorage.removeItem(RELOAD_KEY);
        } catch {
          // storage unavailable
        }
        return v;
      },
      (err: unknown) => {
        let reloaded = true;
        try {
          reloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
          if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1');
        } catch {
          // storage unavailable: don't risk a reload loop
        }
        if (!reloaded && typeof location !== 'undefined') {
          try {
            sessionStorage.setItem(RESUME_KEY, '1');
          } catch {
            // ignore
          }
          location.reload();
          return new Promise<T>(() => {}); // the page is reloading
        }
        throw err;
      },
    );
}

export const MINIGAME_UI: Record<string, ComponentType<MiniProps>> = Object.fromEntries(
  Object.entries(LOADERS).map(([id, load]) => [id, lazy(() => withReload(load)().then((C) => ({ default: C })))]),
);

// Start fetching a game's chunk early (e.g. while the title card is up). Safe to call repeatedly.
export function preloadMinigame(id: string): void {
  LOADERS[id]?.().catch(() => {});
}

export type { MiniProps };

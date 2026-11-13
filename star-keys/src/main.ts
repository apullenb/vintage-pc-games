import './style.css';
import { unlockAudio } from './ui/audio';
import type { Nav } from './ui/nav';
import { startPlay } from './ui/play';
import { initScale } from './ui/scale';
import { showBriefing, showMap, showResults, showTitle } from './ui/screens';
import { Starfield } from './ui/starfield';

const root = document.querySelector<HTMLDivElement>('#app')!;
let cleanup: (() => void) | null = null;

initScale();
const sky = new Starfield();
document.body.prepend(sky.canvas);

// Swap screens: tear down the old one fully before building the next.
function go(build: () => () => void, menu = true): void {
  cleanup?.();
  cleanup = null;
  root.replaceChildren();
  sky.setRunning(menu);
  cleanup = build();
}

const nav: Nav = {
  title: () => go(() => showTitle(root, nav)),
  map: (focus) => go(() => showMap(root, nav, focus)),
  brief: (i) => go(() => showBriefing(root, i, nav)),
  play: (i) => go(() => startPlay(root, i, nav), false),
  results: (r) => go(() => showResults(root, r, nav)),
};

// Audio may only start after a user gesture (iOS wants touchend).
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('touchend', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

nav.title();

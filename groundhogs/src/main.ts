import './style.css';
import { toggleMute, unlockAudio } from './ui/audio';
import type { Nav } from './ui/nav';
import { startPlay } from './ui/play';
import { initScale } from './ui/scale';
import { showBriefing, showLevelSelect, showResults, showTitle } from './ui/screens';

const root = document.querySelector<HTMLDivElement>('#app')!;
let cleanup: (() => void) | null = null;

// Swap screens: tear down the old one fully before building the next.
function go(build: () => () => void): void {
  cleanup?.();
  cleanup = null;
  root.replaceChildren();
  cleanup = build();
}

const nav: Nav = {
  title: () => go(() => showTitle(root, nav)),
  select: () => go(() => showLevelSelect(root, nav)),
  brief: (i) => go(() => showBriefing(root, i, nav)),
  play: (i) => go(() => startPlay(root, i, nav)),
  results: (r) => go(() => showResults(root, r, nav)),
};

initScale();

// Audio may only start after a user gesture (iOS wants touchend).
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('touchend', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

// Shown by CSS only on touch devices held upright.
const rotate = document.createElement('div');
rotate.className = 'rotate-overlay';
rotate.innerHTML = `
  <div class="rotate-phone"><img src="favicon.svg" alt="" width="16" height="16" /></div>
  <p class="rotate-title">TURN YOUR BURROW SIDEWAYS</p>
  <p class="rotate-sub">Groundhogs only dig in landscape. Rotate your phone to play.</p>`;
document.body.append(rotate);
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) toggleMute();
});

nav.title();

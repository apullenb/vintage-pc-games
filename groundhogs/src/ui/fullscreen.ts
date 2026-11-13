// Fullscreen API wrapper (standard + webkit-prefixed); iPhone Safari has neither.
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const doc = document as FsDoc;

export function fullscreenSupported(): boolean {
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

// Launched from a home-screen icon (already chrome-less).
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}

// Show the button where fullscreen works, or on touch devices where Add to Home Screen is the way.
export function fullscreenButtonWanted(): boolean {
  if (fullscreenSupported()) return true;
  return !isStandalone() && matchMedia('(pointer: coarse)').matches;
}

export function isFullscreen(): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function toggleFullscreen(): void {
  if (!fullscreenSupported()) {
    showHomeScreenTip();
    return;
  }
  if (isFullscreen()) {
    if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
    return;
  }
  const el = document.documentElement as FsEl;
  const done = (): void => {
    // best effort; only allowed in fullscreen on some browsers
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    o?.lock?.('landscape').catch(() => {});
  };
  if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(done, () => {});
  else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen();
    done();
  }
}

export const FS_ICONS = {
  enter: ['##...##', '#.....#', '.......', '.......', '.......', '#.....#', '##...##'],
  exit: ['.#...#.', '##...##', '.......', '.......', '.......', '##...##', '.#...#.'],
};

export function onFullscreenChange(fn: () => void): () => void {
  document.addEventListener('fullscreenchange', fn);
  document.addEventListener('webkitfullscreenchange', fn);
  return () => {
    document.removeEventListener('fullscreenchange', fn);
    document.removeEventListener('webkitfullscreenchange', fn);
  };
}

// iPhone Safari can't fullscreen a page; explain Add to Home Screen instead.
function showHomeScreenTip(): void {
  if (document.querySelector('.home-tip')) return;
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const tip = document.createElement('div');
  tip.className = 'home-tip';
  const card = document.createElement('div');
  card.className = 'home-tip-card';
  const title = document.createElement('h2');
  title.textContent = 'Play fullscreen';
  const body = document.createElement('p');
  body.textContent = ios
    ? 'Your browser keeps its bars on screen. Tap the Share button, choose "Add to Home Screen", then open Groundhogs from your home screen for true fullscreen.'
    : 'Open your browser menu and choose "Add to Home screen" or "Install app", then launch Groundhogs from your home screen for true fullscreen.';
  const close = document.createElement('p');
  close.className = 'home-tip-close';
  close.textContent = 'Tap anywhere to close';
  card.append(title, body, close);
  tip.append(card);
  const dismiss = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    tip.remove();
  };
  tip.addEventListener('pointerdown', dismiss);
  document.body.append(tip);
}

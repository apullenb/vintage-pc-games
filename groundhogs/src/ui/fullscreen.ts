// Fullscreen API wrapper (standard + webkit-prefixed); iPhone Safari has neither.
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const doc = document as FsDoc;

export function fullscreenSupported(): boolean {
  return !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function toggleFullscreen(): void {
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
